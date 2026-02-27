# Player Flow & UI Navigation

> How players reach every screen and feature in Iron Curtain, from first launch to deep competitive play.

This document is the canonical reference for the player's navigation journey through every screen, menu, panel, and overlay in the game and SDK. It consolidates UI/UX information scattered across the design docs into a single walkable map. Every feature described elsewhere in the documentation must be reachable from this flow — if a feature exists but has no navigation path here, that's a bug in this document.

**Design goal:** A returning Red Alert veteran should be playing a skirmish within 60 seconds of first launch. A competitive player should reach ranked matchmaking in two clicks from the main menu. A modder should find the Workshop in one click. No screen should be a dead end. No feature should require a manual to discover.

**Keywords:** player flow, UI navigation, menus, main menu, campaign flow, skirmish setup, multiplayer lobby, settings screens, SDK screens, no dead-end buttons, mobile layout, publish readiness

---

## UX Principles

These principles govern every navigation decision. They are drawn from what worked in Red Alert (1996), what the Remastered Collection (2020) refined, what OpenRA's community expects, and what modern competitive games (SC2, AoE2:DE, CS2) have proven.

### 1. Shellmap First, Menu Second

The original Red Alert put a live battle behind the main menu — it set the tone before the player clicked anything. The Remastered Collection preserved this. Iron Curtain continues the tradition: the first thing the player sees is toy soldiers fighting. The menu appears over the action, not instead of it. This is not decoration — it's a promise: "this is what you're about to do."

- Classic theme: static title screen (faithful to 1996)
- Remastered / Modern themes: live shellmap (scripted AI battle on a random eligible map)
- Shellmaps are per-game-module — mods automatically get their own
- Performance budget: ~5% CPU, auto-disabled on low-end hardware

### 2. Three Clicks to Anything

No feature should be more than three clicks from the main menu. The most common actions — start a skirmish, find a multiplayer game, continue a campaign — should be one or two clicks. This is a hard constraint on menu depth.

| Action                                | Clicks from Main Menu        |
| ------------------------------------- | ---------------------------- |
| Start a skirmish (with last settings) | 2 (Skirmish → Start)         |
| Continue last campaign                | 1 (Continue Campaign)        |
| Find a ranked match                   | 2 (Multiplayer → Find Match) |
| Join via room code                    | 2 (Multiplayer → Join Code)  |
| Open Workshop                         | 1 (Workshop)                 |
| Open Settings                         | 1 (Settings)                 |
| View Profile                          | 1 (Profile)                  |
| Watch a replay                        | 2 (Replays → select file)    |
| Open SDK                              | Separate application         |

### 3. No Dead-End Buttons

Every button is always clickable (D033). If a feature requires a download, configuration, or prerequisite, the button opens a guidance panel explaining what's needed and offering a direct path to resolve it — never a greyed-out icon with no explanation. Examples:

- "New Generative Campaign" without an LLM configured → guidance panel with [Configure LLM Provider →] and [Browse Workshop →] links
- "Campaign" without campaign content installed → guidance panel with [Install Campaign Core (Recommended) →] and [Install Full Campaign (Music + Cutscenes) →] and [Manage Content →]
- "AI Enhanced Cutscenes" selected but pack not installed → guidance panel with [Install AI Enhanced Cutscene Pack →] and [Use Original Cutscenes →] and [Use Briefing Fallback →]
- "Ranked Match" without placement matches → explanation of placement system with [Play Placement Match →]
- Build queue item without prerequisites → tooltip showing "Requires: Radar Dome" with the Radar Dome icon highlighted in the build panel

### 4. Muscle Memory Preservation

Returning players should find things where they expect them. The main menu structure mirrors what C&C players know:

- **Left column or center:** Game modes (Campaign, Skirmish, Multiplayer)
- **Right or bottom:** Meta features (Settings, Profile, Workshop, Replays)
- **In-game sidebar:** Right side (RA tradition), with bottom-bar as a theme option
- **Hotkeys:** Default profile matches original RA1 bindings; OpenRA and Modern profiles available

### 5. Progressive Disclosure

New players see a clean, unintimidating interface. Advanced features reveal themselves as the player progresses:

- First launch highlights Campaign and Skirmish; Multiplayer and Workshop are visible but not emphasized
- Tutorial hints appear contextually, not as a mandatory gate
- Developer console requires a deliberate action (tilde key) — it never appears uninvited
- Simple/Advanced toggle in the SDK hides ~15 features without data loss
- Experience profiles bundle 6 complexity axes into one-click presets
- BYOLLM feature discovery prompt appears once at a natural moment (first LLM settings visit, first LLM-gated feature encounter, or after early gameplay engagement), listing all optional AI-extended features with setup links — see [Settings § BYOLLM Feature Discovery Prompt](player-flow/settings.md#byollm-feature-discovery-prompt-settings--llm-and-contextual)

### 6. The One-Second Rule

Borrowed from Westwood's design philosophy (see `13-PHILOSOPHY.md` § Principle 12): the player should understand any screen's purpose within one second of seeing it. If a screen needs explanation, it needs redesign. Labels are verbs ("Play," "Watch," "Browse," "Create"), not nouns ("Module," "Instance," "Configuration").

### 7. Context-Sensitive Everything

Westwood's greatest UI contribution was the context-sensitive cursor — move on ground, attack on enemies, harvest on resources. Iron Curtain extends this principle to every interaction:

- Cursor changes based on hovered target and selected units
- Right-click always does "the most useful thing" for the current context
- Tooltips appear on hover with relevant information, never requiring a click to learn
- Keyboard shortcuts are contextual — same key does different things in menu vs. gameplay vs. editor

### 8. Platform-Responsive Layout

The UI adapts to the device, not the other way around. `ScreenClass` (Phone / Tablet / Desktop / TV) drives layout decisions. `InputCapabilities` (touch, mouse+keyboard, gamepad) drives interaction patterns. The flow chart in this document describes the Desktop experience; platform adaptations are noted where they diverge.

---

## Application State Machine

The game transitions through a fixed set of states (see `02-ARCHITECTURE.md` § "Game Lifecycle State Machine"):

```
┌──────────┐     ┌───────────┐     ┌─────────┐     ┌───────────┐
│ Launched │────▸│ InMenus   │────▸│ Loading │────▸│ InGame    │
└──────────┘     └───────────┘     └─────────┘     └───────────┘
                   ▲     │                            │       │
                   │     │                            │       │
                   │     ▼                            ▼       │
                   │   ┌───────────┐          ┌───────────┐   │
                   │   │ InReplay  │◂─────────│ GameEnded │   │
                   │   └───────────┘          └───────────┘   │
                   │         │                    │           │
                   └─────────┴────────────────────┘           │
                                                              ▼
                                                        ┌──────────┐
                                                        │ Shutdown │
                                                        └──────────┘
```

Every screen in this document exists within one of these states. The sim ECS world exists only during `InGame` and `InReplay`; all other states are menu/UI-only.

---


---

## Screen & Flow Sub-Pages

| Screen / Flow | File |
|---------------|------|
| First Launch Flow | [first-launch.md](player-flow/first-launch.md) |
| Main Menu | [main-menu.md](player-flow/main-menu.md) |
| Single Player | [single-player.md](player-flow/single-player.md) |
| Multiplayer | [multiplayer.md](player-flow/multiplayer.md) |
| Network Experience Guide | [network-experience.md](player-flow/network-experience.md) |
| In-Game | [in-game.md](player-flow/in-game.md) |
| Post-Game | [post-game.md](player-flow/post-game.md) |
| Replays | [replays.md](player-flow/replays.md) |
| Workshop | [workshop.md](player-flow/workshop.md) |
| Settings | [settings.md](player-flow/settings.md) |
| LLM Provider Setup Guide | [llm-setup-guide.md](player-flow/llm-setup-guide.md) |
| Player Profile | [player-profile.md](player-flow/player-profile.md) |
| Encyclopedia | [encyclopedia.md](player-flow/encyclopedia.md) |
| Tutorial & New Player Experience | [tutorial.md](player-flow/tutorial.md) |
| IC SDK (Separate Application) | [sdk.md](player-flow/sdk.md) |
| Reference Game UI Analysis | [reference-ui.md](player-flow/reference-ui.md) |
| Flow Comparison: Classic RA vs. Iron Curtain | [flow-comparison.md](player-flow/flow-comparison.md) |
| Platform Adaptations | [platform-adaptations.md](player-flow/platform-adaptations.md) |

## Complete Navigation Map

Every screen and how to reach it from the main menu. Maximum depth from main menu = 3.

```
MAIN MENU
├── Continue Campaign ─────────────────── → Campaign Graph → Briefing → InGame
├── Campaign
│   ├── Allied Campaign ───────────────── → Campaign Graph → Briefing → InGame
│   ├── Soviet Campaign ───────────────── → Campaign Graph → Briefing → InGame
│   ├── Workshop Campaigns ────────────── → Workshop (filtered)
│   ├── Commander School ──────────────── → Tutorial Campaign
│   └── Generative Campaign
│       ├── (LLM configured) ──────────── → Setup → Generation → Campaign Graph
│       └── (no LLM) ─────────────────── → Guidance Panel → [Configure] / [Workshop]
├── Skirmish ──────────────────────────── → Skirmish Setup → Loading → InGame
├── Multiplayer
│   ├── Find Match ────────────────────── → Queue → Ready Check → Map Veto → Loading → InGame
│   ├── Game Browser ──────────────────── → Game List → Join Lobby → Loading → InGame
│   ├── Join Code ─────────────────────── → Enter Code → Join Lobby → Loading → InGame
│   ├── Create Game ───────────────────── → Lobby (as host) → Loading → InGame
│   └── Direct Connect ────────────────── → Enter IP → Join Lobby → Loading → InGame
├── Replays ───────────────────────────── → Replay Browser → Replay Viewer
├── Workshop ──────────────────────────── → Workshop Browser → Resource Detail / My Content
├── Settings
│   ├── Video ─────────────────────────── Theme, Resolution, Render Mode, UI Scale
│   ├── Audio ─────────────────────────── Volumes, Music Mode, Spatial Audio
│   ├── Controls ──────────────────────── Hotkey Profile, Rebinding, Mouse
│   ├── Gameplay ──────────────────────── Experience Profile, QoL Toggles, Balance
│   ├── Social ────────────────────────── Voice, Chat, Privacy
│   ├── LLM ───────────────────────────── Provider Cards, Task Routing
│   └── Data ──────────────────────────── Content Sources, Backup, Recovery Phrase
├── Profile
│   ├── Stats ─────────────────────────── Ratings, Graphs → Rating Details Panel
│   ├── Achievements ──────────────────── Per-module, Pinnable
│   ├── Match History ─────────────────── List → Replay links
│   ├── Friends ───────────────────────── List, Presence, Join/Spectate/Invite
│   └── Social ────────────────────────── Communities, Creator Profile
├── Encyclopedia ──────────────────────── Category → Unit/Building Detail
├── Credits
└── Quit

IN-GAME OVERLAYS (accessible during gameplay)
├── Chat Input ────────────────────────── [Enter]
├── Ping Wheel ────────────────────────── [Hold G]
├── Chat Wheel ────────────────────────── [Hold V]
├── Pause Menu (SP) / Escape Menu (MP) ── [Escape]
├── Callvote ──────────────────────────── (triggered by vote)
├── Observer Panels ───────────────────── (spectator mode toggles)
├── Controls Quick Reference ──────────── [F1] / Pause → Controls (profile-aware: KBM / Gamepad / Deck / Touch)
├── Developer Console ─────────────────── [Tilde ~]
└── Debug Overlays ────────────────────── (dev mode only)

POST-GAME → [Watch Replay] / [Re-Queue] / [Main Menu]

IC SDK (separate application)
├── Start Screen ──────────────────────── New/Open, Validate Project, Upgrade Project, Git status
├── Scenario Editor ───────────────────── 8 editing modes, Simple/Advanced, Preview/Test/Validate/Publish, UI Preview Harness (Advanced)
├── Asset Studio ──────────────────────── Archive browser, sprite/palette editor, provenance metadata (Advanced)
└── Campaign Editor ───────────────────── Node graph + validation/localization/RTL preview + optional hero progression tools (Advanced)
```

---

## Reference Game UI Analysis

Every screen and interaction in this document was informed by studying the actual UIs of Red Alert (1996), the Remastered Collection (2020), OpenRA, and modern competitive games. This section documents what each game actually does and what IC takes from it. For full source analysis, see `research/westwood-ea-development-philosophy.md`, `11-OPENRA-FEATURES.md`, `research/ranked-matchmaking-analysis.md`, and `research/blizzard-github-analysis.md`.

### Red Alert (1996) — The Foundation

**Actual main menu structure:** Static title screen (no shellmap) → Main Menu with buttons: New Game, Load Game, Multiplayer Game, Intro & Sneak Peek, Options, Exit Game. "New Game" immediately forks: Allied or Soviet. No campaign map — missions are sequential. Options screen covers Video, Sound, Controls only. Multiplayer options: Modem, Serial, IPX Network (later Westwood Online/CnCNet). There is no replay system, no server browser, no profile, no ranked play, no encyclopedia — just the game.

**Actual in-game sidebar:** Right side, always visible. Top: radar minimap (requires Radar Dome). Below: credit counter with ticking animation. Below: power bar (green = surplus, yellow = low, red = deficit). Below: build queue icons organized by category tabs (with icons, not text). Production icons show build progress as a clock-wipe animation. Right-click cancels. No queue depth indicator (single-item production only). Bottom: selected unit info (name, health bar — internal only, not on-screen over units).

**What IC takes from RA1:**
- Right-sidebar as default layout (IC's `SidebarPosition::Right`)
- Credit counter with ticking animation → IC preserves this in all themes
- Power bar with color-coded surplus/deficit → IC preserves this
- Context-sensitive cursor (move on ground, attack on enemy, harvest on ore) → IC's 14-state `CursorState` enum
- Tab-organized build categories → IC's Infantry/Vehicle/Aircraft/Naval/Structure/Defense tabs
- "The cursor *is* the verb" principle (see `research/westwood-ea-development-philosophy.md` § Context-Sensitive Cursor)
- Core flow: Menu → Pick mode → Configure → Play → Results → Menu
- Default hotkey profile matches RA1 bindings (e.g., S for stop, G for guard)
- Classic theme (D032) reproduces the 1996 aesthetic: static title, military minimalism, no shellmap

**What IC improves from RA1 (documented limitations):**
- No health bars displayed over units → IC defaults to `on_selection` (D033)
- No attack-move, guard, scatter, waypoint queue, rally points, force-fire ground → IC enables all via D033
- Single-item build queue → IC supports multi-queue with parallel factories
- No control group limit → IC allows unlimited control groups
- Exit-to-menu between campaign missions → IC provides continuous mission flow (D021)
- No replays, no observer mode, no ranked play → IC adds all three

### C&C Remastered Collection (2020) — The Gold Standard

**Actual main menu structure:** Live shellmap (scripted AI battle) behind a semi-transparent menu panel. Game selection screen: pick Tiberian Dawn or Red Alert (two separate games in one launcher). Per-game menu: Campaign, Skirmish, Multiplayer, Bonus Gallery, Options. Campaign screen shows the faction selection (Allied/Soviet) with difficulty options. Multiplayer: Quick Match (Elo-based 1v1 matchmaking), Custom Game (lobby-based), Leaderboard. Options: Video, Audio, Controls, Gameplay. The Bonus Gallery (concept art, behind-the-scenes, FMV jukebox, music jukebox) is a genuine UX innovation — it turns the game into a museum of its own history.

**Actual in-game sidebar:** Preserves the right-sidebar layout from RA1 but with HD sprites and modern polish. Key additions: rally points on production structures, attack-move command, queued production (build multiple of the same unit), cleaner icon layout that scales to 4K. The **F1 toggle** switches the entire game (sprites, terrain, sidebar, UI) between original 320×200 SD and new HD art instantly, with zero loading — the most celebrated UX feature of the remaster.

**Actual in-game QoL vs. original** (from D033 comparison tables):
- Multi-queue: ✅ (original: ❌)
- Parallel factories: ✅ (original: ❌)
- Attack-move: ✅ (original: ❌)
- Waypoint queue: ✅ (original: ❌)
- Rally points: ✅ (original: ❌)
- Health bars: on selection (original: never)
- Guard command: ❌, Scatter: ❌, Stance system: Basic only

**What IC takes from Remastered:**
- Shellmap behind main menu → IC's default for Remastered and Modern themes
- "Clean, uncluttered UI that scales well to modern resolutions" (quoted from `01-VISION.md`)
- Information density balance — "where OpenRA sometimes overwhelms with GUI elements, Remastered gets the density right"
- F1 render mode toggle → IC generalizes to Classic↔HD↔3D cycling (D048)
- QoL additions (rally points, attack-move, queue) as the baseline, not optional extras
- Bonus Gallery concept → IC's Encyclopedia (auto-generated from YAML rules)
- One-click matchmaking reducing friction vs. manual lobby creation
- "Remastered" theme in D032: "clean modern military — HD polish, sleek panels, reverent to the original but refined"

**What IC improves from Remastered:**
- No range circles or build radius display → IC defaults to showing both
- No guard command or scatter command → IC enables both
- No target lines showing order destinations → IC enables by default
- Proprietary networking → IC uses open relay architecture
- No mod/Workshop support → IC provides full Workshop integration

### OpenRA — The Community Standard

**Actual main menu structure:** Shellmap (live AI battle) behind main menu. Buttons: Singleplayer (Missions, Skirmish), Multiplayer (Join Server, Create Server, Server Browser), Map Editor, Asset Browser, Settings, Extras (Credits, System Info). Server browser shows game name, host, map, players, status (waiting/playing), mod and version, ping. Lobby shows player list, map preview, game settings, chat, ready toggle. Settings cover: Input (hotkeys, classic vs modern mouse), Display, Audio, Advanced. No ranked matchmaking — entirely community-organized tournaments.

**Actual in-game sidebar:** The RA mod uses a tabbed production sidebar inspired by Red Alert 3 (not the original RA1 single-tab sidebar). Categories shown as clickable tabs at the top (Infantry, Vehicles, Aircraft, Structures, etc.). This is a significant departure from the original RA1 layout. Full modern RTS QoL: attack-move, force-fire, waypoint queue, guard, scatter, stances (aggressive/defensive/hold fire/return fire), rally points, unlimited control groups, tab-cycle through types in multi-selection, health bars always visible, range circles on hover, build radius display, target lines, rally point display.

**Actual widget system** (from `11-OPENRA-FEATURES.md`): 60+ widget types in the UI layer. Key logic classes: `MainMenuLogic` (menu flow), `ServerListLogic` (server browser), `LobbyLogic` (game lobby), `MapChooserLogic` (20KB — map selection is complex), `MissionBrowserLogic` (19KB), `ReplayBrowserLogic` (26KB), `SettingsLogic`, `AssetBrowserLogic` (23KB — the asset browser alone is a substantial application). Profile system with anonymous and registered identity tiers.

**What IC takes from OpenRA:**
- Command interface excellence — "17 years of UI iteration; adopt their UX patterns for player interaction" (quoted from `01-VISION.md`)
- Full QoL feature set as the standard (attack-move, stances, rally points, etc.)
- Server browser with filtering and multi-source tracking
- Observer/spectator overlays (army, production, economy panels)
- In-game map editor accessible from menu
- Asset browser concept → IC's Asset Studio in the SDK
- Profile system with identity tiers
- Community-driven balance and UX iteration process

**What IC improves from OpenRA:**
- "Functional, data-driven, but with a generic feel that doesn't evoke the same nostalgia" → IC's D032 switchable themes restore the aesthetic
- "Sometimes overwhelms with GUI elements" → IC follows Remastered's information density model
- Hardcoded QoL (no way to get the vanilla experience) → IC's D033 makes every QoL individually toggleable
- Campaign neglect (exit-to-menu between missions, incomplete campaigns) → IC's D021 continuous campaign flow
- Terrain-only scenario editor → IC's full scenario editor with trigger/script/module editing (D038)
- C# recompilation required for deep mods → IC's YAML→Lua→WASM tiered modding (no recompilation)

### StarCraft II — Competitive UX Reference

**What IC takes from SC2:**
- Three-interface model for AI/replay analysis (raw, feature layer, rendered) → informs IC's sim/render split
- Observer overlay design (army composition, production tracking, economy graphs) → IC mirrors exactly
- Dual display ranked system (visible tier + hidden MMR) → IC's Captain II (1623) format (D055)
- Action Result taxonomy (214 error codes for rejected orders) → informs IC's order validation UX
- APM vs EPM distinction ("EPM is a better measure of meaningful player activity") → IC's `GameScore` tracks both

### Age of Empires II: DE — RTS UX Benchmark

**What IC takes from AoE2:DE:**
- Technology tree / encyclopedia as an in-game reference → IC's Encyclopedia (auto-generated from YAML)
- Simple ranked queue appropriate for RTS community size
- Zoom-toward-cursor camera behavior (shared with SC2, OpenRA)
- Bottom-bar as a viable alternative to sidebar → IC's D032 supports both layouts

### Counter-Strike 2 — Modern Competitive UX

**What IC takes from CS2:**
- Sub-tick order timestamps for fairness (D008)
- Vote system visual presentation → IC's Callvote overlay
- Auto-download mods on lobby join → IC's Workshop auto-download
- Premier mode ranked structure (named tiers, Glicko-2, placement matches) → IC's D055

### Dota 2 — Communication UX

**What IC takes from Dota 2:**
- Chat wheel with auto-translated phrases → IC's 32-phrase chat wheel (D059)
- Ping wheel for tactical communication → IC's 8-segment ping wheel
- Contextual ping system (Apex Legends also influenced this)

### Factorio — Settings & Modding UX

**What IC takes from Factorio:**
- "Game is a mod" architecture → IC's `GameModule` trait (D018)
- Three-phase data loading for deterministic mod compatibility
- Settings that persist between sessions and respect the player's choices
- Mod portal as a first-class feature, not an afterthought → IC's Workshop

---

## Flow Comparison: Classic RA vs. Iron Curtain

For returning players, here's how IC's flow maps to what they remember:

| Classic RA (1996)                    | Iron Curtain                                   | Notes                                                         |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------- |
| Title screen → Main Menu             | Shellmap → Main Menu                           | IC adds live battle behind menu (Remastered style)            |
| New Game → Allied/Soviet             | Campaign → Allied/Soviet                       | Same fork. IC adds branching graph, roster persistence.       |
| Mission Briefing → Loading → Mission | Briefing → (seamless load) → Mission           | IC eliminates loading screen between missions where possible. |
| Exit to menu between missions        | Continuous flow                                | Debrief → briefing → next mission, no menu exit.              |
| Skirmish → Map select → Play         | Skirmish → Map/Players/Settings → Play         | Same structure, more options.                                 |
| Modem/Serial/IPX → Lobby             | Multiplayer Hub → 5 connection methods → Lobby | Far more connectivity options. Same lobby concept.            |
| Options → Video/Sound/Controls       | Settings → 7 tabs                              | Same categories, much deeper customization.                   |
| —                                    | Workshop                                       | New: browse and install community content.                    |
| —                                    | Player Profile & Ranked                        | New: competitive identity and matchmaking.                    |
| —                                    | Replays                                        | New: watch saved games.                                       |
| —                                    | Encyclopedia                                   | New: in-game unit reference.                                  |
| —                                    | SDK (separate app)                             | New: visual scenario and asset editing.                       |

The core flow is preserved: **Menu → Pick mode → Configure → Play → Results → Menu.** IC adds depth at every step without changing the fundamental rhythm.

---

## Platform Adaptations

The flow described above is the Desktop experience. Other platforms adapt the same flow to their input model:

| Platform              | Layout Adaptation                     | Input Adaptation                                              |
| --------------------- | ------------------------------------- | ------------------------------------------------------------- |
| **Desktop** (default) | Full sidebar, mouse precision UI      | Mouse + keyboard, edge scroll, hotkeys                        |
| **Steam Deck**        | Same as Desktop, larger touch targets | Gamepad + touchpad, PTT mapped to shoulder button             |
| **Tablet**            | Sidebar OK, touch-sized targets       | Touch: context tap + optional command rail, one-finger pan + hold-drag box select, pinch-zoom, minimap-adjacent camera bookmark dock |
| **Phone**             | Bottom-bar layout, build drawer, compact minimap cluster | Touch (landscape): context tap + optional command rail, one-finger pan + hold-drag box select, pinch-zoom, bottom control-group bar, minimap-adjacent camera bookmark dock, mobile tempo advisory |
| **TV**                | Large text, gamepad radial menus      | Gamepad: D-pad navigation, radial command wheel               |
| **Browser (WASM)**    | Same as Desktop                       | Mouse + keyboard, WebRTC VoIP                                 |

`ScreenClass` (Phone/Tablet/Desktop/TV) is detected automatically. `InputCapabilities` (touch, mouse, gamepad) drives interaction mode. The player flow stays identical — only the visual layout and input bindings change.

For touch platforms, the HUD is arranged into mirrored thumb-zone clusters (left/right-handed toggle): command rail on the dominant thumb side, minimap/radar in the opposite top corner, and a camera bookmark quick dock attached to the minimap cluster. Mobile tempo guidance appears as a small advisory chip near speed controls in single-player and casual-hosted contexts, but never blocks the player from choosing a faster speed.

---

## Cross-References

This document consolidates UI/UX information from across the design docs. The canonical source for each system remains its original location:

| System                                    | Canonical Source                                                 |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Game lifecycle state machine              | `02-ARCHITECTURE.md` § Game Lifecycle State Machine              |
| Shellmap & themes                         | `02-ARCHITECTURE.md` § UI Theme System, `decisions/09c-modding.md` § D032 |
| QoL toggles & experience profiles         | `decisions/09d/D033-qol-presets.md`                                         |
| Lobby protocol & ready check              | `03-NETCODE.md` § Match Lifecycle                                |
| Post-game flow & re-queue                 | `03-NETCODE.md` § Post-Game Flow                                 |
| Ranked tiers & matchmaking                | `decisions/09b/D055-ranked-matchmaking.md`                                         |
| Player profile                            | `decisions/09e/D053-player-profile.md`                                         |
| In-game communication (chat, VoIP, pings) | `decisions/09g/D059-communication.md`                                         |
| Command console                           | `decisions/09g/D058-command-console.md`                                         |
| Tutorial & new player experience          | `decisions/09g/D065-tutorial.md`                                         |
| Asymmetric commander/field co-op mode     | `decisions/09d/D070-asymmetric-coop.md`, `decisions/09g/D059-communication.md`     |
| Workshop browser & mod management         | `decisions/09e/D030-workshop-registry.md`                                         |
| Mod profiles                              | `decisions/09c-modding.md` § D062                                         |
| LLM configuration                         | `decisions/09f/D047-llm-config.md`                                         |
| Data backup & portability                 | `decisions/09e/D061-data-backup.md`                                         |
| Branching campaigns                       | `decisions/09c-modding.md` § D021                                         |
| Generative campaigns                      | `decisions/09f/D016-llm-missions.md`                                         |
| Observer/spectator UI                     | `02-ARCHITECTURE.md` § Observer / Spectator UI                   |
| SDK & scenario editor                     | `02-ARCHITECTURE.md` § IC SDK & Editor Architecture              |
| Cursor system                             | `02-ARCHITECTURE.md` § Cursor System                             |
| Hotkey system                             | `02-ARCHITECTURE.md` § Hotkey System                             |
| Camera system                             | `02-ARCHITECTURE.md` § Camera System                             |
| C&C UX philosophy                         | `13-PHILOSOPHY.md` § Principles 12-13                            |
| Balance presets                           | `decisions/09d/D019-balance-presets.md`                                         |
| Render modes                              | `decisions/09d/D048-render-modes.md`                                         |
| Foreign replay import                     | `decisions/09f/D056-replay-import.md`                                         |
| Cross-engine export                       | `decisions/09c-modding.md` § D066                                         |
| Server configuration                      | `15-SERVER-GUIDE.md`                                             |
