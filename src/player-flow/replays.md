## Replays

> **Cross-game analysis:** See `research/replay-playback-ux-survey.md` for the detailed source study covering SC2, AoE2:DE/CaptureAge, Dota 2, CS2, CoH3, WC3:Reforged, LoL, and Fortnite that informed this spec.

---

### Replay Browser

```
Main Menu → Replays
```

```
┌──────────────────────────────────────────────────────────────────┐
│  REPLAYS                                             [← Back]    │
│                                                                  │
│  Search... [⌕]  [My Games ▾] [Sort: Date ▾] [Filters ▾]        │
│                                                                  │
│  ┌─ LIST ──────────────────────────┬─ DETAIL ─────────────────┐ │
│  │                                 │                           │ │
│  │ ■ Coastal Fortress              │  MAP PREVIEW              │ │
│  │   You vs PlayerX · Victory      │  ┌─────────────┐         │ │
│  │   12:34 · IC Default · Ranked   │  │             │         │ │
│  │   +32 Elo · Jan 15              │  │  (minimap)  │         │ │
│  │                                 │  │             │         │ │
│  │ ■ Desert Arena FFA              │  └─────────────┘         │ │
│  │   4 players · 2nd place         │                           │ │
│  │   24:01 · Vanilla RA            │  PLAYERS                  │ │
│  │   Jan 14                        │  P1: You (Allied) — Win   │ │
│  │                                 │  P2: PlayerX (Soviet) — L │ │
│  │ ■ Imported: match.orarep        │                           │ │
│  │   OpenRA · Converted            │  Duration: 12:34          │ │
│  │                                 │  Balance: IC Default      │ │
│  │                                 │  Speed: Normal            │ │
│  │                                 │  Signed: Relay-certified  │ │
│  │                                 │  Mod: (none)              │ │
│  │                                 │                           │ │
│  │                                 │  [Watch]  [Share]         │ │
│  │                                 │  [Rename] [Delete]        │ │
│  └─────────────────────────────────┴───────────────────────────┘ │
│                                                                  │
│  [Import Replay...]  [Enter Match ID...]  [Reset Filters]        │
└──────────────────────────────────────────────────────────────────┘
```

#### Filter System

Seven filter dimensions (adapted from OpenRA's proven model, extended with IC-specific fields):

| Filter         | Options                                                                        | Notes                                  |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------- |
| **Scope**      | My Games / Bookmarked / All Local / Imported                                   | Default: My Games                      |
| **Game Type**  | Any / Ranked / Custom / Campaign / Skirmish vs AI                              |                                        |
| **Date Range** | Today / This Week / This Month / This Year / All Time                          |                                        |
| **Duration**   | Any / Short (<10 min) / Medium (10–30 min) / Long (30–60 min) / Epic (60+ min) |                                        |
| **Map**        | Dropdown populated from local replay metadata                                  | Searchable                             |
| **Player**     | Text field with autocomplete from local replay metadata                        |                                        |
| **Outcome**    | Any / Victory / Defeat / Draw                                                  | Relative to the selected player filter |

- Sort by: Date (default), Duration, Map Name, Player Count, Rating Change
- Filters are additive (AND logic); [Reset Filters] clears all
- Replay list loads asynchronously — no UI freeze on large collections

#### Replay Detail Panel (Right Side)

- **Map preview:** Minimap render with spawn point markers per player (colored dots)
- **Player list:** Name, faction, team, outcome (Win/Loss/Draw), APM average
- **Metadata:** Duration, balance preset, game speed, mod fingerprint, signed/unsigned status, engine version
- **Missing map handling:** If the replay's map is not installed, show [Install Map →] inline (downloads from Workshop if available) — adapted from OpenRA's auto-install pattern
- **Foreign replay badge:** Imported replays show source format badge (OpenRA / Remastered) and divergence confidence level (D056)

#### Actions

| Button                  | Action                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| **[Watch]**             | Launch Replay Viewer                                                   |
| **[Share]**             | Copy Match ID to clipboard, or export `.icrep` file                    |
| **[Rename]**            | Rename the replay file                                                 |
| **[Delete]**            | Delete with confirmation                                               |
| **[Import Replay...]**  | File browser for `.icrep`, `.orarep`, Remastered replays (D056)        |
| **[Enter Match ID...]** | Download a relay-hosted replay by match ID (see Sharing section below) |

---

### Replay Viewer

```
Replay Browser → [Watch]
  — or —
Post-Game → [Watch Replay]
  — or —
Match History → [Watch]
  — or —
Double-click .icrep file (OS file association)
```

The Replay Viewer reuses the full game viewport with an observer transport bar replacing the player HUD. The right sidebar shows the minimap and observer panels.

#### Layout

```
┌────────────────────────────────────────────────┬──────────────────┐
│                                                │    MINIMAP        │
│                                                │   (clickable)     │
│              GAME VIEWPORT                     │                  │
│           (replay playback)                    ├──────────────────┤
│                                                │  OBSERVER PANEL   │
│                                                │  (toggleable,     │
│                                                │   see § Overlays) │
│                                                │                  │
│                                                │                  │
│                                                │                  │
├────────────────────────────────────────────────┴──────────────────┤
│  TRANSPORT BAR                                                    │
│                                                                   │
│  ⏮ ◄◄ ◄ ▶/⏸ ► ►► ⏭    0.5x [1x] 2x 4x 8x    12:34 / --:--    │
│                                                                   │
│  ├─△──●──△────△─────△──────────────────────────────────────┤     │
│    ⚔     ⚔🏠  ⚔⚔   🏠                                           │
│                                                                   │
│  CAMERA: [P1 ▾] [P2] [Free] [Follow Unit] [Directed]  [Fog ▾]   │
│  PANELS: [A]rmy [P]rod [E]con [Po]wers [S]core [AP]M  [Voice ▾] │
│                                                                   │
│  [Bookmark] [Clip] [Summary]                          [Settings]  │
└───────────────────────────────────────────────────────────────────┘
```

---

### Transport Controls

#### Button Bar

| Button               | Icon | Action                                                  |
| -------------------- | ---- | ------------------------------------------------------- |
| **Jump to Start**    | ⏮    | Jump to tick 0                                          |
| **Rewind 15s**       | ◄◄   | Jump back 15 seconds (configurable: 5s/10s/15s/30s)     |
| **Step Back**        | ◄    | Step back one game tick (hold for slow reverse scan)    |
| **Play / Pause**     | ▶/⏸  | Toggle playback                                         |
| **Step Forward**     | ►    | Step forward one game tick (hold for slow forward scan) |
| **Fast Forward 15s** | ►►   | Jump forward 15 seconds                                 |
| **Jump to End**      | ⏭    | Jump to final tick                                      |

#### Speed Controls

Speed buttons are displayed as discrete clickable labels (not a dropdown — LoL's single-click model, avoiding Dota 2's dropdown regression):

```
0.25x  0.5x  [1x]  2x  4x  8x  Max
```

The active speed is highlighted. Click to switch instantly.

#### Keyboard Shortcuts

| Key                 | Action                                           |
| ------------------- | ------------------------------------------------ |
| `Space`             | Play / Pause                                     |
| `B`                 | Rewind 15 seconds (SC2 convention)               |
| `N`                 | Fast forward 15 seconds                          |
| `,` (comma)         | Step back one tick                               |
| `.` (period)        | Step forward one tick                            |
| `[`                 | Decrease speed one tier                          |
| `]`                 | Increase speed one tier                          |
| `Home`              | Jump to start                                    |
| `End`               | Jump to end                                      |
| `Ctrl+B`            | Add bookmark at current tick                     |
| `←` / `→`           | Jump to previous / next bookmark or event marker |
| `Ctrl+←` / `Ctrl+→` | Jump to previous / next engagement               |
| `Escape`            | Open replay menu (exit / settings / summary)     |

#### Seeking

IC's 300-tick (~10 second) keyframe snapshots enable **true arbitrary seeking** — the key architectural advantage over OpenRA, AoE2, CoH3, and WC3 (all forward-only).

- **Click anywhere on the timeline** to jump to that moment
- **Drag the playhead** to scrub through the replay
- Re-simulation from nearest keyframe takes <100ms for typical games
- Both forward and backward seeking are supported
- Seeking works at any point — no "already viewed" restriction (unlike SC2)

---

### Timeline / Scrub Bar

The timeline is the most important UX element in the replay viewer. IC's design draws from LoL's annotated timeline (the strongest surveyed) while adding spoiler-free mode (an unmet need across all games).

#### Layout

```
├─△──●──△────△─────△──────────────────────────────────────┤
  ⚔     ⚔🏠  ⚔⚔   🏠
```

- **Horizontal progress bar** spanning the full width of the transport area
- **Playhead** (●) shows current position; draggable
- **Event markers** (△) appear as small icons above the bar at their timestamp
- **Engagement zones** shown as colored intensity bands behind the bar (SC2 combat shading pattern)
- **Time display:** `elapsed / total` in `mm:ss` format (or `--:--` in spoiler-free mode)

#### Event Markers

Auto-generated from the analysis event stream (see `formats/save-replay-formats.md` § "Analysis Event Stream"):

| Marker                           | Icon         | Source Event                                                                        |
| -------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| **Unit destroyed (significant)** | ⚔            | `UnitDestroyed` (filtered to non-trivial: hero units, expensive units, first blood) |
| **Base structure destroyed**     | 🏠            | `ConstructionDestroyed` for production/defense buildings                            |
| **Tech transition**              | ▲            | `UpgradeCompleted` for tier-changing upgrades                                       |
| **Expansion established**        | ◆            | `ConstructionCompleted` for resource structures at new locations                    |
| **Engagement zone**              | Colored band | Clusters of `UnitDestroyed` events within a time window                             |
| **Player eliminated**            | ☓            | `PlayerEliminated` / `MatchEnded` for that player                                   |
| **Bookmark (user)**              | 🔖            | User-placed via `Ctrl+B`                                                            |

#### Contextual Highlighting (LoL Pattern)

When the viewer locks camera to a specific player:

- That player's event markers **brighten** on the timeline
- Other players' markers **fade** (not hidden — just reduced opacity)
- This makes "find my kills" or "find my losses" effortless without separate filtering UI

#### Spoiler-Free Mode

**No game surveyed offers this.** IC can be first.

When enabled (toggle in replay menu or Settings → Gameplay):

- Total duration display shows `--:--` instead of the actual end time
- Timeline bar renders as an **expanding bar** that only shows the elapsed portion (the unplayed portion is hidden, not greyed out)
- Event markers only appear for already-viewed portions
- The progress bar does not reveal how much game remains

```
Spoiler-Free ON:
├─△──●──△────△─                                           │
  ⚔     ⚔🏠  ⚔⚔   ← bar ends at playhead; future is hidden
                    12:34 / --:--

Spoiler-Free OFF (default):
├─△──●──△────△─────△──────────────────────────────────────┤
  ⚔     ⚔🏠  ⚔⚔   🏠                    12:34 / 38:21
```

**Default:** Spoiler-free is **off** by default (most users want the full timeline). The setting persists across sessions.

---

### Camera Modes

Six camera modes, selectable via the camera bar or hotkeys:

| Mode                   | Key                       | Description                                                                                                                                                                                                                     |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free Camera**        | `F`                       | Default. Pan (edge scroll / middle-click drag / WASD), zoom (scroll wheel), minimap click to jump. Standard RTS observer camera.                                                                                                |
| **Player Perspective** | `1`–`8`                   | Lock to a specific player's recorded camera position, scroll, and zoom. Shows what the player actually saw during the game. Selected units shown with dashed circles in player color (SC2 pattern).                             |
| **Follow Unit**        | `Ctrl+F` on selected unit | Camera tracks a selected unit, keeping it centered. Useful for following hero units, harvesters, scouts. Click elsewhere or press `F` to exit.                                                                                  |
| **Directed Camera**    | `D`                       | AI-controlled camera that automatically follows the action. Jumps between engagements, expansions, and production events. Useful for passive viewing and casting. Configurable aggression (how quickly it cuts between events). |
| **Drone Follow**       | `Ctrl+D`                  | Loosely attached camera that follows the action with inertia and smooth movement. Cinematic feel without sharp cuts. (Fortnite drone-attach pattern adapted for isometric RTS.)                                                 |
| **All Vision**         | `0`                       | Free camera with fog/shroud disabled for all players. Shows the full map state.                                                                                                                                                 |

#### Vision / Fog-of-War Controls

Dropdown in the camera bar:

| Option                     | Key       | Effect                                            |
| -------------------------- | --------- | ------------------------------------------------- |
| **All Players (Combined)** | `-`       | See the union of all players' vision              |
| **Disable Shroud**         | `=`       | Full map revealed, including cloaked/hidden units |
| **Player 1 Vision**        | `Shift+1` | See only what Player 1 can see                    |
| **Player 2 Vision**        | `Shift+2` | See only what Player 2 can see                    |
| ...                        | `Shift+N` | Per-player fog-of-war                             |

**Ghost View (analysis mode):** `Ctrl+=` — Full map revealed, but units outside the selected player's vision are shown as translucent ghosts. Useful for studying opponent movements you couldn't see during the game. (Adapted from CS2 X-ray concept for RTS.)

---

### Observer Overlay Panels

Hotkey-toggled panels in the right sidebar. Each panel is independently toggleable and shows real-time data for all players. Design follows SC2's proven model — the most praised RTS observer system across all games surveyed.

| Panel          | Key | Content                                                                                                                                        |
| -------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Army**       | `A` | Per-player army composition: unit type icons with counts and total army value (resource cost of living military units). Color-coded by player. |
| **Production** | `P` | Per-player active build queues: what each player is currently building (units, structures, upgrades) with progress bars.                       |
| **Economy**    | `E` | Per-player resource counts: credits on hand, income rate ($/min), harvester count, refinery count.                                             |
| **Powers**     | `W` | Per-player support power status: available/recharging/locked. Timer bars for recharging powers.                                                |
| **Score**      | `S` | Per-player score breakdown: Units Destroyed value, Units Lost value, Structures Destroyed, Structures Lost.                                    |
| **APM**        | `M` | Per-player Actions Per Minute: current window APM and game-average APM. Bar graph or sparkline.                                                |

#### Panel Display Modes

Three display density options (CoH3 pattern):

| Mode         | Description                                         | Use Case                                   |
| ------------ | --------------------------------------------------- | ------------------------------------------ |
| **Expanded** | Full panel detail with all data visible             | Learning, analysis                         |
| **Compact**  | Condensed single-line-per-player summary            | Experienced viewers wanting viewport space |
| **Caster**   | Side-by-side team comparison layout, minimal chrome | Broadcast / streaming                      |

Toggle with `Tab` to cycle modes, or select from replay settings.

#### Larger Broadcast Panels (SC2 `Ctrl+` Pattern)

For tournament broadcasts and streaming, larger center-screen panels:

| Key      | Panel                                           |
| -------- | ----------------------------------------------- |
| `Ctrl+A` | Large Army + Worker supply comparison           |
| `Ctrl+E` | Large Income comparison                         |
| `Ctrl+S` | Large Score comparison                          |
| `Ctrl+N` | Player Name banners (name, faction, team color) |

These overlay the center-top of the viewport and auto-hide after 5 seconds (or on any key press). Designed for broadcast transitions.

---

### Graphs and Analysis Overlays

Available via the [Summary] button or during playback as overlay panels:

#### Timeline Graphs (SC2 Game Summary Pattern)

| Graph                 | Content                                           | Notes                                                                  |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| **Army Value**        | Total military resource cost per player over time | Engagement zones shown as colored bands where army value drops sharply |
| **Income**            | Per-minute harvesting rate per player over time   | Shows economic advantage shifts                                        |
| **Unspent Resources** | Credits on hand per player over time              | High unspent = floating resources (coaching signal)                    |
| **Workers**           | Harvester count per player over time              | Economic investment tracking                                           |
| **APM**               | Actions Per Minute per player over time           | Activity patterns and fatigue                                          |

Graphs are clickable — click a point on any graph to jump the replay to that timestamp.

#### Build Order Timeline

Side-by-side per-player build order timeline showing:

- Unit and structure production events as icons on a horizontal time axis
- Upgrade completions marked with arrows
- Gap periods visible (idle production = coaching signal)

#### Heatmaps (Analysis Mode)

Accessible via [Summary] → Heatmaps tab:

| Heatmap              | Content                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| **Unit Death**       | Where units died on the map (red = high density)                                  |
| **Combat**           | Where engagements occurred (intensity = resource cost traded)                     |
| **Camera Attention** | Where the player's camera spent time (from `CameraPositionSample` events at 2 Hz) |
| **Economy**          | Where harvesters operated (resource field usage patterns)                         |

Heatmaps render as semi-transparent overlays on the minimap or full viewport.

---

### Replay Bookmarks

Users can mark moments for later reference:

- **Add bookmark:** `Ctrl+B` at current playhead position
- **Name bookmark:** Optional text label (default: `Bookmark at mm:ss`)
- **Navigate:** `←` / `→` to jump between bookmarks and event markers
- **Bookmark list:** Accessible via the replay menu; shows timestamp + label for each
- **Persistent:** Bookmarks are saved alongside the replay file (in a sidecar `.icrep.bookmarks` JSON file, not modifying the replay itself)

---

### Voice Playback

If voice was recorded during the match (opt-in per D059 consent model):

- **Per-player voice tracks** toggle in the transport bar: `[Voice ▾]` dropdown lists each player's name with a checkbox
- Voice tracks are Opus-encoded, aligned to game ticks
- **Mute/unmute** individual players without affecting others
- **Volume slider** per track (accessible from dropdown)
- Voice playback automatically syncs with replay speed (pitch-corrected at 2x; muted above 4x)

---

### Post-Game Summary, Sharing & Creator Tools

> **Full section:** [Replay Analysis, Sharing & Tools](replays-analysis-sharing.md)

Post-game summary screen (tabbed: overview/economy/military/build order/heatmaps), replay sharing (Match ID system, file-based, Workshop collections, P2P distribution via `p2p-distribute`), video/clip export (`.webm` VP9+Opus), cinematic camera tools (keyframe paths, lens controls, letterbox), moddable observer UI (YAML layouts, Workshop-distributable), live spectator mode (mid-game join, broadcast delay), foreign replay playback (D056 divergence indicator), replay anonymization, replay settings, platform adaptations, and cross-references.
