## In-Game

### HUD Layout

The in-game HUD follows the classic Red Alert right-sidebar layout by default (theme-switchable, D032):

```
┌──────────────────────────────────┬────────────────────┐
│                                  │ ┌────────────────┐ │
│                                  │ │    MINIMAP      │ │
│                                  │ │   (click to     │ │
│                                  │ │    move camera) │ │
│                                  │ └────────────────┘ │
│         GAME VIEWPORT            │ ┌────────────────┐ │
│      (isometric map view)        │ │ $ 5,000   ⚡ 80%│ │
│                                  │ └────────────────┘ │
│                                  │ ┌────────────────┐ │
│                                  │ │  POWER BAR     │ │
│                                  │ │  ████████░░░   │ │
│                                  │ └────────────────┘ │
│                                  │ ┌────────────────┐ │
│                                  │ │  BUILD QUEUE   │ │
│                                  │ │  [Infantry ▾]  │ │
│                                  │ │  🔫 🔫 🔫 🔫    │ │
│                                  │ │  🚗 🚗 🚗 🚗    │ │
│                                  │ │  🏗 🏗 🏗 🏗    │ │
│                                  │ └────────────────┘ │
├──────────────────────────────────┴────────────────────┤
│ STATUS: 5 Rifle Infantry selected  HP: ████████░ 80%  │
│ [chatbox area]                              [clock]   │
└───────────────────────────────────────────────────────┘
```

### HUD Elements

| Element               | Location               | Function                                                                                                                                     |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Minimap / Radar**   | Top-right sidebar (desktop); top-corner minimap cluster on touch | Overview map. Click/tap to move camera. Team drawings, pings/beacons, and tactical markers appear here (with icon/shape + color cues; optional labels where enabled). Shroud shown. On touch, the minimap cluster also hosts alerts and the camera bookmark quick dock. |
| **Camera bookmarks**  | Keyboard (desktop) / minimap-adjacent dock (touch) | Fast camera jump/save locations. Desktop: F5-F8 jump, Ctrl+F5-F8 save quick slots. Touch: tap bookmark chip to jump, long-press to save. |
| **Credits**           | Below minimap          | Current funds with ticking animation. Flashes when low.                                                                                      |
| **Power bar**         | Below credits          | Production vs consumption ratio. Yellow = low power. Red = deficit.                                                                          |
| **Build queue**       | Main sidebar area      | Tabbed by category (Infantry/Vehicle/Aircraft/Naval/Structure/Defense). Click to queue. Right-click to cancel. Prerequisites shown on hover. |
| **Status bar**        | Bottom                 | Selected unit info: type, HP, veterancy, commands. Multi-select shows count and composition.                                                 |
| **Chat area**         | Bottom-left            | Recent chat messages. Fades out. Press Enter to type.                                                                                        |
| **Game clock**        | Bottom-right           | Match timer.                                                                                                                                 |
| **Notification area** | Top-center (transient) | EVA voice line text: "Base under attack," "Building complete," etc.                                                                          |

#### Asymmetric Co-op HUD Variants (D070 Commander & Field Ops)

D070 scenarios use the same core HUD language but apply **role-specific layouts/panels**.

**Commander HUD (macro + support queue):**
- standard economy/production/base control surfaces
- **Support Request Queue** panel (pending/approved/queued/inbound/cooldown)
- strategic + joint objective tracker
- optional **Operational Agenda / War-Effort Board** (D070 pacing layer) with a small foreground milestone set and "next payoff" emphasis
- typed support marker tools (LZ, CAS target, recon sector)

**Field Ops / SpecOps HUD (squad + requests):**
- squad composition/status strip (selected squad, health, key abilities)
- **Request Panel / Request Wheel** shortcuts (`Need CAS`, `Need Recon`, `Need Reinforcements`, `Need Extraction`, etc.)
- field + joint objective tracker
- optional **Ops Momentum** chip/board showing the next relevant field or joint milestone reward (if D070 Operational Momentum is enabled)
- request status feedback chip/timeline (pending/ETA/inbound/failed)
- optional **Extract vs Stay** prompt card when the scenario presents a risk/reward extraction decision

**Shared D070 HUD rules:**
- both roles always see teammate state and shared mission status
- request statuses are visible and not color-only
- role-critical actions have both shortcut and visible UI path (D059/D065)
- if Operational Momentum is enabled, only the most relevant next milestones/timers are foregrounded (no timer wall)

#### Optional D070 Pacing Layer: Operational Momentum / "One More Phase"

Some D070 scenarios can enable an optional pacing layer that creates a Civilization-like **"one more turn" pull** using RTS-compatible **"one more phase"** milestones.

**Player-facing presentation goals:**
- show one near-term actionable milestone and one meaningful next payoff (not a full spreadsheet of timers)
- make war-effort rewards legible (`economy`, `power`, `intel`, `command network`, `superweapon delay`, etc.)
- support both roles in co-op (`Commander`, `SpecOps`) with role-appropriate visibility
- preserve clear stopping points even while tempting "one more objective" decisions

**UX rules (when enabled):**
- Operational Agenda / War-Effort Board is optional and scenario-authored (not universal HUD chrome)
- milestone rewards and risks are explicit (especially extraction-vs-stay prompts)
- hidden mandatory chains are not presented as optional opportunities
- milestone/timer foregrounding remains bounded to preserve combat readability
- campaign wrappers (`Ops Campaign`) summarize progress in spoiler-safe, branching-safe terms
#### Experimental Survival HUD Variant (D070-adjacent `Last Commando Standing` / `SpecOps Survival`) — Proposal-Only

This D070-adjacent survival variant (proposal-only, `M10+`, `P-Optional`) keeps the IC HUD language but replaces commander/request emphasis with **survival pressure**, **objective contesting**, and **elimination-state clarity**.

**Core HUD additions (survival prototype):**
- **Hazard phase timer + warning banner** (e.g., `Chrono Distortion closes Sector C in 00:42`)
- **Contested Objective feed** (cache captured, relay hacked, uplink online, bridge destroyed)
- **Field requisition / upgrade points** with quick spend panel or hotkeys
- **Squad state strip** (commando + support team status, downed/revive state if the scenario supports it)
- **Threat pressure cues** (incoming hazard edge marker, high-danger sector outlines)

**Elimination / redeploy / spectate state (scenario-controlled):**
- if eliminated, the player sees an explicit state panel (not a silent dead camera):
  - `Spectating Teammate`
  - `Redeploy Available` (if token/rule exists)
  - `Redeploy Locked` with reason (`no token`, `phase lock`, `team wiped`)
  - `Return to Post-Game` (custom/casual host policy permitting)
- if team-based and one operative survives, the HUD shows the surviving squadmate and redeploy conditions clearly
- if solo FFA, elimination transitions directly to spectator/post-game flow per scenario policy

**Survival-specific HUD rule:** hazard pressure and contested-objective information must be visible without obscuring squad control and combat readability.

#### Commander Avatar / Assassination HUD Variant (D070-adjacent, TA-style) — Proposal-Only

Commander-avatar scenarios (proposal-only, `M10+`, `P-Optional`) keep the IC HUD language but add **commander survival/presence state** as a first-class UI concern.

**Core HUD additions (Commander Avatar / Presence):**
- **Commander Avatar status panel** (health, protection state, key abilities)
- **Defeat policy indicator** (`Commander Death = Defeat` or `Downed Rescue Timer`) with visible countdown when triggered
- **Presence / command influence panel** showing active local command bonuses and blocked effects (if command network is disrupted)
- **Command Network status strip** (relay/uplink control, jammed/offline nodes, support impact)
- **Threat alerts** for commander-targeted attacks/markers (D059 pings + EVA/notification text)

**Design rules (HUD):**
- commander survival state must be visible without replacing economy/production readability
- defeat policy messaging must be explicit (no hidden "why did we lose?" edge cases)
- presence effects should be surfaced as bonuses/availability changes, not invisible hidden math
- if a mode uses a downed timer, rescue path markers/objectives should appear immediately

#### Optional Portal Micro-Op Transition (D070 + D038 `Sub-Scenario Portal`)

When a D070 mission uses an authored portal micro-op (e.g., infiltration interior):
- the Field Ops player transitions into the authored sub-scenario
- the Commander remains in a support-focused state (support console panel if authored, otherwise spectator + macro queue awareness)
- the transition UI clearly states expected outcomes and timeout/failure consequences

Portal micro-ops in D070 v1 use D038's existing portal pattern; they do not require true concurrent nested runtime instances.

### In-Game Interactions

All gameplay input flows through the `InputSource` trait → `PlayerOrder` pipeline. The sim is never aware of UI — it receives orders, produces state.

**Mouse:**
- Left-click: select unit/building
- Left-drag: box select (isometric diamond or rectangular, per D033 toggle)
- Right-click: context-sensitive command (move/attack/harvest/enter/deploy)
- Ctrl+right-click: force attack (attack ground)
- Alt+right-click: force move (ignore enemies)
- Scroll wheel: zoom in/out (toward cursor)
- Edge scroll: pan camera (10px edge zone)

**Keyboard:**
- Arrow keys: pan camera
- 0-9: select control group (Ctrl+# to assign, double-# to center)
- Tab: cycle unit types in selection
- H: select all of same type
- S: stop
- G: guard
- D: deploy (if applicable)
- F: force-fire mode
- Enter: open chat input (no prefix = team, `/s` = all, `/w name` = whisper)
- Tilde (~): developer console (if enabled)
- Escape: game menu (pause in SP, overlay in MP)
- F1: cycle render mode (Classic/HD/3D)
- F5-F8: jump to camera bookmarks (slots 1-4); Ctrl+F5-F8 saves current camera to those slots

**Touch (Phone/Tablet):**
- Tap unit/building: select
- Tap ground/enemy/valid target: context command (move/attack/harvest/enter/deploy)
- One-finger drag: pan camera
- Hold + drag: box select
- Pinch: zoom in/out
- Command rail (optional): explicit overrides (attack-move, guard, force-fire, etc.)
- Control groups: bottom-center bar (tap = select, hold = assign, double-tap = center)
- Camera bookmarks: minimap-adjacent quick dock (tap = jump, long-press = save)

### In-Game Overlays

These appear as overlays on top of the game viewport, triggered by specific actions:

#### Chat & Command Input

```
[Enter] → Chat input bar appears at bottom
```

- No prefix: team chat
- `/s` message: all chat
- `/w playername` message: whisper
- `/` command: console command (tab-completable)
- Escape or Enter (empty): close input

#### Ping Wheel

```
[Hold G] → Radial wheel appears at cursor
```

8 segments: Attack Here / Defend Here / Danger / Retreat / Help / Rally Here / On My Way / Generic Ping. Release on a segment to place the ping at the cursor's world position. Rate-limited (3 per 5 seconds).

- Quick pings default to canonical type color + no text label.
- Optional short labels/preset color accents are available via marker/beacon placement UI/commands (D059), but core ping semantics remain icon/shape/audio-driven.

#### Chat Wheel

```
[Hold V] → Radial wheel appears
```

32 pre-defined phrases with auto-translation (Dota 2 pattern). Categories: tactical, social, strategic. Phrases like "Attack now," "Defend base," "Good game," "Need help." Mod-extensible via YAML.

#### Tactical Beacons / Markers

```
[Marker submenu or /marker] → Place labeled tactical marker / beacon
```

- Persistent (until cleared) markers for waypoints/objectives/hazard zones
- Optional short text label (bounded by display-width, not byte/char count — accounts for CJK double-width and combining marks; see D059 sanitization rules) and optional preset color accent
- Type/icon remains the primary meaning (color is supplemental, not color-only)
- Team/allied/observer visibility scope depends on mode/server policy
- Appears on world view + minimap and is preserved in replay coordination events

#### Pause Overlay (Single Player / Custom Games)

```
[Escape] → Pause menu
```

```
┌──────────────────────────────────┐
│           GAME PAUSED            │
│                                  │
│         ► Resume                 │
│         ► Settings               │
│         ► Save Game              │
│         ► Load Game              │
│         ► Restart Mission        │
│         ► Quit to Menu           │
│         ► Quit to Desktop        │
└──────────────────────────────────┘
```

In **multiplayer**, Escape opens a non-pausing overlay with: Settings, Surrender, Leave Game.

#### Multiplayer Escape Menu

```
[Escape] → Overlay (game continues)
```

```
┌──────────────────────────────────┐
│         ► Resume                 │
│         ► Settings               │
│         ► Surrender              │
│         ► Leave Game             │
│                                  │
│  [Request Pause] (limited uses)  │
└──────────────────────────────────┘
```

- **Request Pause** — `PauseOrder` sent to all clients. 2 pauses × 120s max per player in ranked. 30s grace before opponent can unpause. Minimum 30s game time before first pause.
- **Surrender** — 1v1: immediate and irreversible. Team games: opens a vote popup for teammates (2v2 = unanimous, 3v3 = ⅔, 4v4 = ¾ majority). 30-second vote window.
- **Leave Game** — Warning: "Leaving a ranked match will count as a loss and apply a cooldown penalty."

#### Callvote Overlay

```
Teammate or opponent initiates a vote → center-screen overlay
```

```
┌──────────────────────────────────────────────┐
│  VOTE: Remake game? (connection issues)       │
│                                              │
│  Called by: PlayerX                           │
│  Time remaining: 24s                         │
│                                              │
│          [Yes (F1)]    [No (F2)]             │
│                                              │
│  Current: 1 Yes / 0 No / 2 Pending          │
└──────────────────────────────────────────────┘
```

Vote types: Surrender, Kick, Remake, Draw, Custom (mod-defined). Non-voters default to "No." 30-second timer. CS2-style presentation.

#### Observer/Spectator Overlays

When spectating (observer mode), additional toggleable overlays appear:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ARMY         │  │ PRODUCTION   │  │ ECONOMY      │
│              │  │              │  │              │
│ P1: 45 units │  │ P1: Tank 67% │  │ P1: $324/min │
│ P2: 38 units │  │ P2: MCV  23% │  │ P2: $256/min │
└──────────────┘  └──────────────┘  └──────────────┘
```

Toggle keys: Army (A), Production (P), Economy (E), Powers (W), Score (S). Follow player camera: F + player number. Observer chat: separate channel from player chat (anti-coaching in ranked team games).

#### Developer Console

```
[Tilde ~] → Half-screen overlay (dev mode only)
```

```
┌──────────────────────────────────────────────────────────┐
│ > /spawn rifleman at 1024,2048 player:2                  │
│ Spawned: Rifleman at (1024, 2048) owned by Player 2     │
│ > /set_cash 50000                                        │
│ Player 1 cash set to 50000                               │
│ > /net_diag 1                                            │
│ Network diagnostics: enabled                             │
│ > _                                                      │
│                                                          │
│ 🔎 Filter: [all ▾]   [cvar browser]   [clear]   [close] │
└──────────────────────────────────────────────────────────┘
```

Multi-line Lua syntax highlighting, scrollable filtered output, cvar browser, command history (SQLite-persisted). Brigadier-style tab completion.

### Smart Danger Alerts

Client-side auto-generated alerts (D059), toggled via D033:

- **Incoming Attack** — Hostile units detected near your base
- **Ally Under Attack** — Teammate's structures under fire
- **Undefended Resource** — Ore field with no harvester or guard
- **Superweapon Warning** — Enemy superweapon nearing completion

These appear as brief pings on the minimap with EVA voice cues. Fog-of-war filtered (no intel the player shouldn't have).
