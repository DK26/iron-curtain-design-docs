## Replay Analysis, Sharing & Tools

> **Parent page:** [Replays](replays.md)

### Post-Game Summary Screen

Accessible from:
- Post-Game → [Summary] (after a live match)
- Replay Viewer → [Summary] button (during or after replay playback)
- Replay Browser → right-click → [View Summary]

The summary screen does **not** require replaying the match — it reads from the analysis event stream embedded in the `.icrep` file.

```
┌──────────────────────────────────────────────────────────────────┐
│  MATCH SUMMARY — Coastal Fortress                     [← Back]   │
│                                                                  │
│  P1: You (Allied) — VICTORY     P2: PlayerX (Soviet) — DEFEAT   │
│  Duration: 12:34   Balance: IC Default   Speed: Normal           │
│                                                                  │
│  [Overview] [Economy] [Military] [Build Order] [Heatmaps]        │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  OVERVIEW                                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Army Value Graph (over time)                              │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │     ╱\   P1                    ╱\                   │  │ │
│  │  │    ╱  \  ──── P2          ╱\  ╱  \                  │  │ │
│  │  │   ╱    ╲╱   ╲           ╱  ╲╱    ╲                 │  │ │
│  │  │  ╱           ╲     ╱───╱         ╲                 │  │ │
│  │  │ ╱             ╲───╱               ╲___             │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │  (click graph to jump to that moment in replay)           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  SCORE SUMMARY                                                   │
│  ┌──────────────┬──────────┬──────────┐                         │
│  │              │ You      │ PlayerX  │                         │
│  ├──────────────┼──────────┼──────────┤                         │
│  │ Units Killed │ 47       │ 23       │                         │
│  │ Units Lost   │ 31       │ 52       │                         │
│  │ Structures   │ 3 / 1    │ 1 / 5    │  (destroyed / lost)    │
│  │ Income Total │ $14,200  │ $11,800  │                         │
│  │ APM (avg)    │ 86       │ 62       │                         │
│  └──────────────┴──────────┴──────────┘                         │
│                                                                  │
│  [Watch Replay]  [Share]  [Export Summary]                        │
└──────────────────────────────────────────────────────────────────┘
```

**Tabs:**
- **Overview:** Army value graph, score summary, key moments timeline
- **Economy:** Income graph, unspent resources graph, harvester count graph, total earned/spent
- **Military:** Per-unit-type kill/death/efficiency table, army composition pie charts at key moments
- **Build Order:** Side-by-side production timelines per player (adapted from SC2 Game Summary)
- **Heatmaps:** Unit death, combat, camera attention, economy heatmaps on minimap view

All graphs are clickable — click a point to open the Replay Viewer at that timestamp.

---

### Replay Sharing

#### Match ID System (Dota 2 Pattern)

Relay-hosted matches generate a unique **Match ID** (short alphanumeric hash, e.g., `IC-7K3M9X`). Any player can enter this ID in the replay browser to download the replay.

- **Copy Match ID:** Available in post-game screen, replay browser detail panel, and profile match history
- **[Enter Match ID...]** in replay browser: text field → download from relay → add to local library
- **URL format:** `ic://replay/IC-7K3M9X` — opens IC directly to the replay (OS URL scheme handler)
- **Availability:** Relay-hosted replays persist for a configurable period (default: 90 days, server-operator configurable via D072). After expiry, only locally-saved copies remain.
- **Privacy:** Match IDs for ranked games are public by default. Custom/private games generate IDs only if the host enables sharing.

#### File-Based Sharing

- `.icrep` files are portable and self-describing
- **Embedded resources mode** (see `formats/save-replay-formats.md` § "Embedded Resources"): Self-contained replays that include the map and rule snapshots, so the recipient does not need matching content installed
- **File association:** `.icrep` registered with the OS; double-click opens IC's replay viewer
- **Drag-and-drop:** Drop an `.icrep` file onto the IC window to open it

#### Workshop Integration

- Community replays can be published to the Workshop as curated collections (e.g., "Best Games of Season 3", "Teaching Replays: Soviet Openings")
- Workshop replay packs include metadata for browsing without downloading every replay file
- Creators can attach commentary notes to published replays

#### P2P Distribution

For popular replays (tournament finals, community highlights), `p2p-distribute` forms a swarm — the relay seeds initially, and subsequent downloaders become peers. This scales replay distribution without relay storage costs growing linearly with demand.

- **Match ID replays:** Relay is the initial seed; swarm forms on demand at `user-requested` priority
- **Workshop replay packs:** Standard Workshop P2P distribution (D049) at `user-requested` priority; dependency resolution ensures the viewer has matching mods/maps
- **Piece alignment:** `.icrep` per-256-tick LZ4 chunks align with P2P piece boundaries where practical, enabling streaming playback (start watching before full download)

See [D049 § Replay Sharing](../decisions/09e/D049/D049-replay-sharing.md) for the full P2P distribution design.

---

### Video / Clip Export

**IC ships with built-in `.webm` video export** — ahead of every RTS surveyed except LoL's basic clip system.

#### Quick Clip

During replay playback:

1. Press `Ctrl+Shift+R` or click [Clip] to start recording
2. The transport bar shows a red recording indicator and elapsed clip time
3. Press `Ctrl+Shift+R` again to stop
4. Clip saved to `Replays/Clips/` as `.webm` (VP9 video + Opus audio)
5. Toast notification: `Clip saved (12s) — [Open Folder] [Copy to Clipboard]`

#### Full Replay Export

From replay browser or viewer menu: [Export Video...]

```
┌─────────────────────────────────────────────────────────────────┐
│  EXPORT REPLAY VIDEO                                             │
│                                                                 │
│  Range: [Full Replay ▾]  or  Start: [00:00] End: [12:34]        │
│                                                                 │
│  Resolution: [1920×1080 ▾]   Framerate: [60 fps ▾]              │
│  Quality:    [High ▾]        Format: [.webm (VP9) ▾]            │
│                                                                 │
│  Camera:  [Current camera settings ▾]                            │
│           (Free Camera / Player 1 / Player 2 / Directed)         │
│                                                                 │
│  Include:  ☑ Observer overlays   ☑ Transport bar (off for clean) │
│            ☑ Voice audio         ☑ Game audio                    │
│                                                                 │
│  Estimated size: ~180 MB   Estimated time: ~3 min                │
│                                                                 │
│  [Export]  [Cancel]                                               │
└─────────────────────────────────────────────────────────────────┘
```

**Render pipeline:** The export runs the replay at accelerated speed off-screen, capturing frames to the encoder. This allows higher-quality output than screen capture and works headless.

---

### Cinematic Camera Tools

For content creators and community filmmakers. Accessible via replay viewer menu → [Cinematic Mode] or `Ctrl+Shift+C`.

#### Camera Path Editor

Define a camera path with keyframes:

- Place keyframes at positions along the timeline (`Ctrl+K` to add keyframe at current camera position and tick)
- Each keyframe stores: camera position, zoom, rotation (for 3D render mode), playback speed at that point
- Camera interpolates smoothly between keyframes (Catmull-Rom spline)
- Preview the path before recording
- Export the camera path as a reusable `.iccam` file

#### Lens Controls (3D Render Mode, D048)

When using 3D render mode:

| Control          | Effect                                          |
| ---------------- | ----------------------------------------------- |
| **Focal Length** | Wide-angle to telephoto (adjustable slider)     |
| **Aperture**     | Depth-of-field blur amount (lower = more bokeh) |
| **Auto Focus**   | Toggle; when off, manual focus distance slider  |

#### Cinematic Toggles

| Toggle                | Key            | Effect                                                                |
| --------------------- | -------------- | --------------------------------------------------------------------- |
| **Hide all UI**       | `Ctrl+Shift+H` | Remove all overlays, transport bar, panels — clean game viewport only |
| **Hide player names** |                | Remove floating player/unit names                                     |
| **Hide health bars**  |                | Remove health/selection indicators                                    |
| **Letterbox**         |                | Add cinematic black bars (21:9 crop on 16:9 display)                  |

---

### Moddable Observer UI

The observer overlay system is **data-driven and moddable** (SC2 custom observer UI pattern). Community creators can publish custom observer layouts via the Workshop.

- Observer panel layouts are defined in YAML (position, size, data bindings, conditional visibility)
- The game provides a standardized data API that observer panels read from (player stats, army composition, economy, production, APM)
- Built-in layouts: `Default`, `Compact`, `Caster Broadcast`
- Workshop layouts installable and selectable from replay viewer settings
- Layout switching is instant (no reload required)

This enables community-created broadcast overlays (equivalent to SC2's WCS Observer and AhliObs) without engine modifications.

---

### Live Spectator Mode

Live spectating shares the same viewer infrastructure as replay playback, with these differences:

| Feature            | Replay Viewer                 | Live Spectator                                                                |
| ------------------ | ----------------------------- | ----------------------------------------------------------------------------- |
| Transport controls | Full (seek, rewind, speed)    | Play only; no rewind/seek (live stream)                                       |
| Speed              | 0.25x–8x + Max                | Real-time only                                                                |
| Broadcast delay    | N/A                           | Configurable (default 120s for ranked/tournament)                             |
| Observer panels    | All available                 | All available                                                                 |
| Camera modes       | All six                       | All six                                                                       |
| Voice              | Recorded tracks               | Live voice (if spectator permitted)                                           |
| Join timing        | Any time (file is complete)   | Must join before match or during (mid-game join supported via relay snapshot) |
| Chat               | N/A (replay has no live chat) | Observer chat channel (separate from player chat — anti-coaching per D059)    |

#### Mid-Game Spectator Join

Unlike OpenRA (which cannot do this), IC's relay architecture supports spectators joining a match in progress:

1. Spectator requests join via relay
2. Relay sends current state snapshot + recent order backlog
3. Client re-simulates from snapshot to catch up
4. Spectator enters live stream with <5 second catch-up delay

#### Spectator Slots

- Visible in lobby with spectator count / max slots
- Separate from player slots
- Lobby host configures: max spectators, fog-of-war policy, broadcast delay
- Tournament mode: spectator slots may require organizer approval

---

### Foreign Replay Playback (D056)

Imported replays (OpenRA `.orarep`, Remastered Collection) play through the same viewer with additional UX:

#### Divergence Confidence Indicator

A small badge in the transport bar shows the current divergence confidence level:

| Level           | Badge    | Meaning                                                                         |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| **Plausible**   | Green ✓  | Replay is tracking well; no detectable divergence                               |
| **Minor Drift** | Yellow ⚠ | Small state differences detected; visuals may differ slightly from the original |
| **Diverged**    | Red ✗    | Significant divergence; replay may not accurately represent the original match  |

The badge is clickable to show a detail panel with divergence metrics and explanation.

#### Limitations Banner

Foreign replays show a subtle top banner on first load:

```
This replay was imported from {OpenRA / Remastered}. Playback uses translated
orders and may differ from the original. [Learn More] [Dismiss]
```

---

### Replay Anonymization

`ic replay anonymize <file>` (CLI) or Replay Browser → right-click → [Anonymize...]:

- Replace player names with generic labels (`Player 1`, `Player 2`, etc.)
- Strip voice tracks
- Strip chat messages
- Preserve all gameplay data (orders, events, state hashes)
- Useful for educational content sharing, tournament review, and privacy

---

### Replay Settings

Accessible via [Settings] gear icon in the transport bar:

| Setting                    | Options                             | Default          |
| -------------------------- | ----------------------------------- | ---------------- |
| **Spoiler-free mode**      | On / Off                            | Off              |
| **Rewind jump duration**   | 5s / 10s / 15s / 30s                | 15s              |
| **Auto-record all games**  | On / Off                            | On               |
| **Default camera mode**    | Free / Directed / Player 1          | Free             |
| **Default observer panel** | None / Army / Economy / Score       | None             |
| **Panel display density**  | Expanded / Compact / Caster         | Expanded         |
| **Event marker density**   | All / Significant Only / Off        | Significant Only |
| **Voice playback default** | All On / All Off / Per-Player       | All On           |
| **Observer UI layout**     | Default / Compact / Caster / Custom | Default          |

---

### Platform Adaptations

| Platform                 | Adaptation                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Desktop (KBM)**        | Full hotkey set; all features accessible                                                                                    |
| **Gamepad / Steam Deck** | Transport controls on D-pad; camera on sticks; panels on shoulder buttons; radial menu for camera modes                     |
| **Touch (Tablet)**       | Swipe timeline to scrub; pinch to zoom; tap event markers to jump; floating transport buttons; panels in collapsible drawer |
| **Phone**                | Simplified overlay with one panel at a time; timeline at bottom with large touch targets; speed control via tap zones       |

---

### Cross-References

| Topic                              | Document                                                          |
| ---------------------------------- | ----------------------------------------------------------------- |
| Replay file format (`.icrep`)      | `formats/save-replay-formats.md` § Replay File Format             |
| State recording and keyframes      | `architecture/state-recording.md`                                 |
| Analysis event stream              | `formats/save-replay-formats.md` § Analysis Event Stream          |
| Foreign replay import (D056)       | `decisions/09f/D056-replay-import.md`                             |
| Voice recording consent (D059)     | `decisions/09g/D059-communication.md`                             |
| Replay signatures and trust (D052) | `decisions/09b/D052-community-servers.md`                         |
| Observer/spectator mode (live)     | `player-flow/in-game.md` § Observer Overlays                      |
| Post-game flow                     | `player-flow/post-game.md`                                        |
| Netcode and replay architecture    | `03-NETCODE.md`                                                   |
| Cross-game replay UX survey        | `research/replay-playback-ux-survey.md`                           |
| LLM replay overlays (D073)         | `decisions/09d/D073-llm-exhibition-modes.md` § Spectator Overlays |
| Moddable UI system                 | `02-ARCHITECTURE.md` § UI Theme System                            |
