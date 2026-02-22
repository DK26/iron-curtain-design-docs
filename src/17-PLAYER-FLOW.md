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

## First Launch Flow

The first time a player launches Iron Curtain, the game must accomplish three things: establish identity, locate game assets, and get them playing — in that order, as fast as possible.

### Identity Setup

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
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
- If nothing found: "Iron Curtain needs Red Alert game files to play. [How to get them →]" with links to purchase options (Steam Remastered Collection, etc.) and a manual folder browser
- If multiple sources found: player picks preferred source (or uses all — assets merge)
- Detection results are saved; re-scan available from Settings

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

After identity + content + profile gate (or "Just let me play"), the player lands on the main menu with the shellmap running behind it. Total time: under 30 seconds for a "Just let me play" player with auto-detected assets.

---

## Main Menu

The main menu is the hub. Everything is reachable from here. The shellmap plays behind a semi-transparent overlay panel.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    [ IRON CURTAIN ]                               │
│                    Red Alert                                     │
│                                                                  │
│              ┌─────────────────────────┐                         │
│              │  ► Continue Campaign     │ (if save exists)       │
│              │  ► Campaign              │                         │
│              │  ► Skirmish              │                         │
│              │  ► Multiplayer           │                         │
│              │                          │                         │
│              │  ► Replays               │                         │
│              │  ► Workshop              │                         │
│              │  ► Settings              │                         │
│              │                          │                         │
│              │  ► Profile               │ (bottom group)         │
│              │  ► Encyclopedia          │                         │
│              │  ► Credits               │                         │
│              │  ► Quit                  │                         │
│              └─────────────────────────┘                         │
│                                                                  │
│  [shellmap: live AI battle playing in background]                │
│                                                                  │
│  Iron Curtain v0.1.0        community.ironcurtain.dev    RA 1.0 │
└──────────────────────────────────────────────────────────────────┘
```

### Button Descriptions

| Button                | Action                                                            | Notes                                                                                                       |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Continue Campaign** | Resumes last campaign from the last completed mission's next node | Only visible if an in-progress campaign save exists. One click to resume.                                   |
| **Campaign**          | Opens Campaign Selection screen                                   | Choose faction (Allied/Soviet), start new campaign, or select saved campaign slot.                          |
| **Skirmish**          | Opens Skirmish Setup screen                                       | Configure a local game vs AI: map, players, settings.                                                       |
| **Multiplayer**       | Opens Multiplayer Hub                                             | Five ways to find a game: Browser, Join Code, Ranked, Direct IP, QR Code.                                   |
| **Replays**           | Opens Replay Browser                                              | Browse saved replays, import foreign replays (.orarep, Remastered).                                         |
| **Workshop**          | Opens Workshop Browser                                            | Browse, install, manage mods/maps/resources from Workshop sources.                                          |
| **Settings**          | Opens Settings screen                                             | All configuration: video, audio, controls, experience profile, data, LLM.                                   |
| **Profile**           | Opens Player Profile                                              | View/edit identity, achievements, stats, friends, community memberships.                                    |
| **Encyclopedia**      | Opens in-game Encyclopedia                                        | Auto-generated unit/building reference from YAML rules.                                                     |
| **Credits**           | Shows credits sequence                                            | Scrolling credits, skippable.                                                                               |
| **Quit**              | Exits to desktop                                                  | Immediate — no "are you sure?" dialog (following the principle that the game respects the player's intent). |

### Contextual Elements

- **Version info** — Bottom-left: engine version, game module version
- **Community link** — Bottom-center: link to community site/Discord
- **Mod indicator** — If a non-default mod profile is active, a small indicator badge shows which profile (e.g., "Combined Arms v2.1")
- **News ticker** (optional, Modern theme) — Community announcements from the configured tracking server(s)
- **Tutorial hint** — For new players: a non-intrusive callout near Campaign or Skirmish saying "New? Try the tutorial → Commander School" (D065, dismissible, appears once)

---

## Single Player

### Campaign Selection

```
Main Menu → Campaign
```

```
┌──────────────────────────────────────────────────────────┐
│  CAMPAIGNS                                    [← Back]   │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  [Allied    │  │  [Soviet    │  │ [Community  │     │
│  │   Flag]     │  │   Flag]     │  │  Campaigns] │     │
│  │             │  │             │  │             │     │
│  │  ALLIED     │  │  SOVIET     │  │  WORKSHOP   │     │
│  │  CAMPAIGN   │  │  CAMPAIGN   │  │  CAMPAIGNS  │     │
│  │             │  │             │  │             │     │
│  │ Missions:14 │  │ Missions:14 │  │ Browse →    │     │
│  │ [New Game]  │  │ [New Game]  │  │             │     │
│  │ [Continue]  │  │ [Continue]  │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐                       │
│  │ [Commander  │  │ [Generative │                       │
│  │  School]    │  │  Campaign]  │                       │
│  │             │  │             │                       │
│  │  TUTORIAL   │  │  AI-CREATED │                       │
│  │  10 lessons │  │  (BYOLLM)   │                       │
│  └─────────────┘  └─────────────┘                       │
│                                                          │
│  Difficulty: [Cadet ▾]  Experience: [IC Default ▾]       │
└──────────────────────────────────────────────────────────┘
```

**Navigation paths from this screen:**

| Action                   | Destination                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| New Game (Allied/Soviet) | Campaign Graph → first mission briefing                                   |
| Continue (Allied/Soviet) | Campaign Graph → next available mission                                   |
| Workshop Campaigns       | Workshop Browser (filtered to campaigns)                                  |
| Commander School         | Tutorial campaign (D065, 10 branching missions)                           |
| Generative Campaign      | Generative Campaign Setup (D016) — or guidance panel if no LLM configured |
| ← Back                   | Main Menu                                                                 |

### Campaign Graph

```
Campaign Selection → [New Game] or [Continue]
```

The campaign graph is a visual world map (or node-and-edge graph for community campaigns) showing mission progression. Completed missions are solid, available missions pulse, locked missions are dimmed.

```
┌──────────────────────────────────────────────────────────┐
│  ALLIED CAMPAIGN                             [← Back]    │
│  Operation: Allies Reunited                              │
│                                                          │
│          ┌───┐                                           │
│          │ 1 │ ← Completed (solid)                       │
│          └─┬─┘                                           │
│        ┌───┴───┐                                         │
│     ┌──┴──┐ ┌──┴──┐                                     │
│     │ 2a  │ │ 2b  │ ← Branching (based on mission 1     │
│     └──┬──┘ └──┬──┘    outcome)                          │
│        └───┬───┘                                         │
│         ┌──┴──┐                                          │
│         │  3  │ ← Next available (pulsing)               │
│         └──┬──┘                                          │
│            ·                                             │
│            · (locked missions dimmed below)              │
│                                                          │
│  Unit Roster: 12 units carried over                      │
│  [View Roster]  [View Heroes]  [Mission Briefing →]      │
│                                                          │
│  Campaign Stats: 3/14 complete  Time: 2h 15m             │
└──────────────────────────────────────────────────────────┘
```

**Flow:** Select a node → Mission Briefing screen → click "Begin Mission" → Loading → InGame. After mission: Debrief → next node unlocks on graph.

**Campaign transitions** (D021): Briefing → mission → debrief → next mission. No exit-to-menu between levels unless the player explicitly presses Escape. The debrief screen loads instantly (no black screen), and the next mission's briefing runs concurrently with background asset loading. If a cutscene exists and the player's **preferred cutscene variant** (Original / Clean Remaster / AI Enhanced) is installed, that version plays while assets load — by the time the cutscene ends, the mission is ready. If the preferred variant is missing, IC falls back to another installed cutscene variant (preferably Original) before falling back to the mission's briefing/intermission presentation. If no cutscene pack is installed, the campaign uses the mission's fallback briefing/intermission presentation and continues without interruption (with an optional "Download cutscene pack" prompt). The only loading bar appears on cold start or unusually large asset loads, and even then it's campaign-themed.

**Hero campaigns (optional D021 hero toolkit):** A campaign node may chain `Debrief → Hero Sheet / Skill Choice → Armory/Roster → Briefing → Begin Mission` without leaving the campaign flow. These screens appear only when the campaign enables hero progression; classic campaigns keep the simpler debrief/briefing path.

### Skirmish Setup

```
Main Menu → Skirmish
```

```
┌──────────────────────────────────────────────────────────────┐
│  SKIRMISH                                       [← Back]     │
│                                                              │
│  ┌─────────────────────────┐  ┌───────────────────────────┐ │
│  │ MAP                     │  │ PLAYERS                    │ │
│  │ [map preview image]     │  │                            │ │
│  │                         │  │ 1. You (Allied) [color ▾]  │ │
│  │ Coastal Fortress        │  │ 2. AI Easy (Soviet) [▾]    │ │
│  │ 2-4 players, 128×128   │  │ 3. [Add AI...]             │ │
│  │                         │  │ 4. [Add AI...]             │ │
│  │ [Change Map]            │  │                            │ │
│  └─────────────────────────┘  └───────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ GAME SETTINGS                                        │   │
│  │                                                      │   │
│  │ Balance:     [IC Default ▾]   Game Speed: [Normal ▾] │   │
│  │ Pathfinding: [IC Default ▾]   Starting $:  [10000 ▾] │   │
│  │ Fog of War:  [Shroud ▾]       Tech Level: [Full ▾]   │   │
│  │ Crates:      [On ▾]           Short Game: [Off ▾]    │   │
│  │                                                      │   │
│  │ AI Preset:   [IC Default ▾]   AI Difficulty: [▾]     │   │
│  │ [More options...]                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Experience Profile: [IC Default ▾]                          │
│                                                              │
│                        [Start Game]                          │
└──────────────────────────────────────────────────────────────┘
```

**Key interactions:**

- **Change Map** → opens map browser (thumbnails, filters by size/players/theater, search)
- **Add AI** → dropdown: difficulty (Easy/Medium/Hard/Brutal) × AI preset (Classic/OpenRA/IC Default) × faction
- **More options** → expands full D033 toggle panel (sim-affecting toggles for this match)
- **Experience Profile** dropdown → one-click preset that sets balance + AI + pathfinding + theme
- **Start Game** → Loading → InGame

Settings persist between sessions. "Start Game" with last-used settings is a two-click path from the main menu.

### Generative Campaign Setup

```
Main Menu → Campaign → Generative Campaign
```

If no LLM provider is configured, this screen shows the No Dead-End Button guidance (D033/D016):

```
┌──────────────────────────────────────────────────────────┐
│  GENERATIVE CAMPAIGNS                        [← Back]    │
│                                                          │
│  Generative campaigns use an LLM to create unique        │
│  missions tailored to your play style.                   │
│                                                          │
│  [Configure LLM Provider →]                              │
│  [Browse Pre-Generated Campaigns on Workshop →]          │
│  [Use Built-in Mission Templates (no LLM needed) →]     │
└──────────────────────────────────────────────────────────┘
```

If an LLM is configured, the setup screen (D016 § "Step 1 — Campaign Setup"):

```
┌──────────────────────────────────────────────────────────┐
│  NEW GENERATIVE CAMPAIGN                     [← Back]    │
│                                                          │
│  Story style:        [C&C Classic ▾]                     │
│  Faction:            [Soviet ▾]                          │
│  Campaign length:    [Medium (8-12 missions) ▾]          │
│  Difficulty curve:   [Steady Climb ▾]                    │
│  Theater:            [European ▾]                        │
│                                                          │
│  [▸ Advanced...]                                         │
│    Mission variety targets, era constraints, roster       │
│    persistence rules, narrative tone, etc.               │
│                                                          │
│                    [Generate Campaign]                    │
│                                                          │
│  Using: GPT-4o via OpenAI   Estimated time: ~45s         │
└──────────────────────────────────────────────────────────┘
```

"Generate Campaign" → generation progress → Campaign Graph (same graph UI as hand-crafted campaigns).

---

## Multiplayer

### Multiplayer Hub

```
Main Menu → Multiplayer
```

```
┌──────────────────────────────────────────────────────────┐
│  MULTIPLAYER                                 [← Back]    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ► Find Match          Ranked 1v1 / Team queue   │   │
│  │  ► Game Browser        Browse open games          │   │
│  │  ► Join Code           Enter IRON-XXXX code       │   │
│  │  ► Create Game         Host a lobby               │   │
│  │  ► Direct Connect      IP address (LAN/advanced)  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  QUICK INFO                                       │   │
│  │  Players online: 847                              │   │
│  │  Games in progress: 132                           │   │
│  │  Your rank: Captain II (1623)                     │   │
│  │  Season 3: 42 days remaining                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Recent matches: [view all →]                            │
│  ┌────────────────────────────────────────────┐         │
│  │ vs. PlayerX (Win +24)  5 min ago  [Replay] │         │
│  │ vs. PlayerY (Loss -18) 1 hr ago   [Replay] │         │
│  └────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

### Five Ways to Connect

| Method             | Flow                                                     | Best For                       |
| ------------------ | -------------------------------------------------------- | ------------------------------ |
| **Find Match**     | Queue → Ready Check → Map Veto (ranked) → Loading → Game | Competitive/ranked play        |
| **Game Browser**   | Browse list → Click game → Join Lobby → Loading → Game   | Finding community games        |
| **Join Code**      | Enter `IRON-XXXX` → Join Lobby → Loading → Game          | Friends, Among Us-style casual |
| **Create Game**    | Configure Lobby → Share code/wait for joins → Start      | Hosting custom games           |
| **Direct Connect** | Enter IP:port → Join Lobby → Loading → Game              | LAN parties, power users       |

Additionally: **QR Code** scanning (mobile/tablet) and **Deep Links** (Discord/Steam invites) resolve to the Join Code path.

### Game Browser

```
Multiplayer Hub → Game Browser
```

```
┌──────────────────────────────────────────────────────────────┐
│  GAME BROWSER                                    [← Back]    │
│                                                              │
│  🔎 Search...   Filters: [Map ▾] [Mod ▾] [Status ▾] [▾]    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ▸ Coastal Fortress 2v2        2/4 players   Waiting   │ │
│  │   Host: CommanderX ★★★        Vanilla RA    ping: 45  │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ ▸ Desert Arena FFA            3/6 players   Waiting   │ │
│  │   Host: TankRush99            IC Default    ping: 78  │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ ▸ Combined Arms 3v3           5/6 players   Waiting   │ │
│  │   Host: ModMaster ✓           CA v2.1       ping: 112 │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │   (greyed) Tournament Match   2/2 players   Playing   │ │
│  │   Host: ProPlayer             IC Default    [Spec →]  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Sources: ✓ Official  ✓ CnCNet  ✓ Community  [Manage →]     │
│                                                              │
│  Showing 47 games from 3 tracking servers                    │
└──────────────────────────────────────────────────────────────┘
```

- Click a game → Join Lobby (mod auto-download if needed, D030)
- In-progress games show [Spectate →] if spectating is enabled
- Trust indicators: ✓ Verified (bundled sources) vs. "Community" (user-added tracking servers)
- Filters: map name, mod, game status (waiting/in-progress), player count, ping range
- Sources configurable in Settings — merge view across official + community + OpenRA + CnCNet tracking servers

### Ranked Matchmaking Flow

```
Multiplayer Hub → Find Match
```

```
┌──────────────────────────────────────────────────────────┐
│  FIND MATCH                                  [← Back]    │
│                                                          │
│  Queue: [Ranked 1v1 ▾]                                   │
│                                                          │
│  Your Rating: Captain II (1623 ± 48)                     │
│  Season 3: 42 days remaining                             │
│                                                          │
│  Map Pool:                                               │
│  ☑ Coastal Fortress  ☑ Glacier Bay  ☑ Desert Arena       │
│  ☑ Ore Fields        ☐ Tundra Pass  ☑ River War          │
│  (Veto up to 2 maps)                                     │
│                                                          │
│  Balance: IC Default (locked for ranked)                 │
│  Pathfinding: IC Default (locked for ranked)             │
│                                                          │
│                    [Find Match]                           │
│                                                          │
│  Estimated wait: ~30 seconds                             │
└──────────────────────────────────────────────────────────┘
```

**Ranked flow:**

```
Find Match → Searching... → Match Found → Ready Check (30s)
  ├─ Accept → Map Veto (ranked) → Loading → InGame
  └─ Decline → Back to queue (with escalating cooldown penalty)
```

**Ready Check** — Center-screen overlay. Accept/Decline. 30-second timer. Both players must accept. Decline or timeout = back to queue with cooldown.

**Map Veto** (ranked only) — Anonymous opponent (no names shown until game starts). Each player vetoes from the map pool. Remaining maps are randomly selected. 30-second timer.

### Lobby

```
Game Browser → Join Game
  — or —
Multiplayer Hub → Create Game
  — or —
Join Code → Enter code
  — or —
Direct Connect → Enter IP
```

```
┌──────────────────────────────────────────────────────────────┐
│  GAME LOBBY                           Code: IRON-7K3M       │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ MAP              │  │ PLAYERS                           │ │
│  │ [preview]        │  │                                   │ │
│  │                  │  │ 1. HostPlayer (Allied) [Ready ✓]  │ │
│  │ Coastal Fortress │  │ 2. You (Soviet) [Not Ready]       │ │
│  │ 2-4 players      │  │ 3. [Open Slot]                    │ │
│  │ [Change Map]     │  │ 4. [Add AI / Close]               │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ GAME SETTINGS (host controls)                         │   │
│  │ Balance: [IC Default ▾]  Speed: [Normal ▾]            │   │
│  │ Fog: [Shroud ▾]  Crates: [On ▾]  Starting $: [10k ▾] │   │
│  │ Mods: vanilla (fingerprint: a3f2...)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ CHAT                                                  │   │
│  │ HostPlayer: gl hf                                     │   │
│  │ > _                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Ready]  [Leave]      Share: [Copy Code] [Copy Link]        │
│                                                              │
│  ⚠ Downloading: combined-arms-v2.1 (2.3 MB)... 67%         │
└──────────────────────────────────────────────────────────────┘
```

**Key interactions:**

- **Player slots** — Click to change faction, color, team. Host can rearrange/kick.
- **Ready toggle** — All players must be Ready before the host can start. Host clicks "Start Game" when all ready.
- **Mod fingerprint** — If mismatched, a diff panel shows: "You're missing mod X" / "Update mod Y" with [Auto-Download] buttons (D030/D062). Download progress bar in lobby.
- **Chat** — Text chat within the lobby. Voice indicators if VoIP is active (D059).
- **Share** — Copy join code (`IRON-7K3M`) or deep link for Discord/Steam.
- **Spectator slots** — Visible if enabled. Join as spectator option.

**Lobby → Game transition:** Host clicks "Start Game" → all clients enter Loading state → per-player progress bars → 3-second countdown → InGame.

### Loading Screen

```
Lobby → [All Ready] → Start Game → Loading
```

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                    COASTAL FORTRESS                       │
│                                                          │
│               [campaign-themed artwork]                   │
│                                                          │
│  Loading map...                                          │
│  ████████████████░░░░░░░░░░  67%                        │
│                                                          │
│  Player 1: ████████████████████████ Ready                │
│  Player 2: ████████████████░░░░░░░░ 72%                 │
│                                                          │
│  TIP: Hold Ctrl and click to force-fire on the ground.   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Per-player progress bars (multiplayer)
- 120-second timeout — player kicked if not loaded
- Loading tips (from `loading_tips.yaml`, moddable)
- Campaign-themed background for campaign missions
- All players loaded → 3-second countdown → game starts

---

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
| **Minimap / Radar**   | Top-right sidebar (desktop); top-corner minimap cluster on touch | Overview map. Click/tap to move camera. Team drawings appear here. Shroud shown. On touch, the minimap cluster also hosts alerts and the camera bookmark quick dock. |
| **Camera bookmarks**  | Keyboard (desktop) / minimap-adjacent dock (touch) | Fast camera jump/save locations. Desktop: F5-F8 jump, Ctrl+F5-F8 save quick slots. Touch: tap bookmark chip to jump, long-press to save. |
| **Credits**           | Below minimap          | Current funds with ticking animation. Flashes when low.                                                                                      |
| **Power bar**         | Below credits          | Production vs consumption ratio. Yellow = low power. Red = deficit.                                                                          |
| **Build queue**       | Main sidebar area      | Tabbed by category (Infantry/Vehicle/Aircraft/Naval/Structure/Defense). Click to queue. Right-click to cancel. Prerequisites shown on hover. |
| **Status bar**        | Bottom                 | Selected unit info: type, HP, veterancy, commands. Multi-select shows count and composition.                                                 |
| **Chat area**         | Bottom-left            | Recent chat messages. Fades out. Press Enter to type.                                                                                        |
| **Game clock**        | Bottom-right           | Match timer.                                                                                                                                 |
| **Notification area** | Top-center (transient) | EVA voice line text: "Base under attack," "Building complete," etc.                                                                          |

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

#### Chat Wheel

```
[Hold V] → Radial wheel appears
```

32 pre-defined phrases with auto-translation (Dota 2 pattern). Categories: tactical, social, strategic. Phrases like "Attack now," "Defend base," "Good game," "Need help." Mod-extensible via YAML.

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

---

## Post-Game

### Post-Game Screen

```
InGame → Victory/Defeat → Post-Game
```

```
┌──────────────────────────────────────────────────────────────┐
│  VICTORY                                                     │
│  Coastal Fortress — 12:34                                    │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ STATS           You              Opponent             │  │
│  │ Units Built:    87               63                   │  │
│  │ Units Lost:     34               63 (all)             │  │
│  │ Structures:     12               8                    │  │
│  │ Economy:        $45,200          $31,800              │  │
│  │ APM:            142              98                   │  │
│  │ Peak Army:      52               41                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Rating: Captain II → Captain I (+32)  🎖                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ CHAT (30-second post-game lobby, still active)       │   │
│  │ Opponent: gg wp                                      │   │
│  │ You: gg                                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Watch Replay]  [Save Replay]  [Re-Queue]  [Main Menu]     │
│                                                              │
│  [Report Player]                          Closes in: 4:32    │
│                                                              │
│  💡 TIP: You had 15 idle harvester seconds — try keeping     │
│     all harvesters active for higher income. [Learn more →]  │
└──────────────────────────────────────────────────────────────┘
```

**Post-game elements:**

- **Stats comparison** — Economy, production, combat, activity (APM/EPM). Graphs available on hover/click.
- **Rating update** — Tier badge animation if promoted/demoted. Delta shown.
- **Chat** — 30-second active period, auto-closes after 5 minutes.
- **Post-game learning** (D065) — Rule-based tip analyzing the match (e.g., idle harvesters, low APM, no control groups used). Links to tutorial or replay annotation.
- **Watch Replay** → Replay Viewer (immediate, file already recorded)
- **Save Replay** → Save `.icrep` file with metadata
- **Re-Queue** → Back to matchmaking queue (ranked)
- **Main Menu** → Return to main menu
- **Report Player** → Report dialog (reason dropdown, optional text)

---

## Replays

### Replay Browser

```
Main Menu → Replays
```

```
┌──────────────────────────────────────────────────────────────┐
│  REPLAYS                                         [← Back]    │
│                                                              │
│  🔎 Search...  [My Games ▾] [All ▾] [Sort: Date ▾]          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 📹 Coastal Fortress — You vs PlayerX                   │ │
│  │    Victory, 12:34, IC Default, 2025-01-15              │ │
│  │    Rating: +32                                  [Play] │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 📹 Desert Arena FFA — 4 players                        │ │
│  │    2nd place, 24:01, Vanilla RA, 2025-01-14            │ │
│  │                                                 [Play] │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 📥 Imported: match-2024-12-01.orarep (OpenRA)          │ │
│  │    Converted to .icrep                          [Play] │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Import Replay...]  (supports .icrep, .orarep, Remastered) │
└──────────────────────────────────────────────────────────────┘
```

- Filter by: date, map, players, win/loss, format
- Click [Play] → Replay Viewer
- [Import Replay...] → file browser for foreign replays (D056)
- Replay metadata shown: players, map, duration, balance preset, mod fingerprint, signed/unsigned

### Replay Viewer

```
Replay Browser → [Play]
  — or —
Post-Game → [Watch Replay]
```

Full game playback with observer controls:

```
┌──────────────────────────────────┬────────────────────┐
│                                  │   MINIMAP           │
│         GAME VIEWPORT            │                    │
│      (replay playback)           │   OBSERVER PANELS  │
│                                  │   Army / Prod /    │
│                                  │   Economy / Score  │
├──────────────────────────────────┴────────────────────┤
│ ◄◄  ◄  ▶  ►  ►►   Speed: [2x ▾]   Tick: 4521/8940   │
│ ├──────────────●──────────────────────────────────┤   │
│                                                       │
│ [Player 1 View]  [Player 2 View]  [Free Camera]      │
│ [Toggle: Army] [Prod] [Econ] [Powers] [Score]        │
└───────────────────────────────────────────────────────┘
```

- Transport controls: play/pause, speed (0.5x–8x), frame step, scrub bar
- Player perspective: lock to a player's camera view
- Free camera: independent observer movement
- Observer overlays: same as live spectating (Army, Production, Economy, Powers, Score)
- Voice playback: if voice was recorded (opt-in), toggle per-player voice tracks
- Analysis event stream: available for detail drilldown

---

## Workshop

### Workshop Browser

```
Main Menu → Workshop
```

```
┌──────────────────────────────────────────────────────────────┐
│  WORKSHOP                                        [← Back]    │
│                                                              │
│  🔎 Search...  [All ▾] [Category ▾] [Sort: Popular ▾]       │
│                                                              │
│  Categories: Maps | Mods | Campaigns | Themes | AI Presets   │
│  | Music | Sprites | Voice Packs | Scripts | Tutorials       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🗺 Desert Showdown Map Pack           ★★★★½  12.4k ↓   │ │
│  │    by MapMaster ✓  |  3 maps, 4.2 MB  |  [Install]    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 🎮 Combined Arms v2.1                 ★★★★★  8.7k ↓   │ │
│  │    by CombinedArmsTeam ✓  |  Total conversion  |      │ │
│  │    [Installed ✓] [Update Available]                    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 🎵 Synthwave Music Pack               ★★★★   3.1k ↓   │ │
│  │    by AudioCreator  |  12 tracks  |  [Install]         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [My Content →]  [Installed →]  [Publishing →]               │
└──────────────────────────────────────────────────────────────┘
```

**Resource detail page** (click any item):

- Description, screenshots/preview, license (SPDX), author profile link
- Download count, rating, reviews
- Dependency tree (visual), changelog
- [Install] / [Update] / [Uninstall]
- [Report] for DMCA/policy violations
- [Tip Creator →] if creator has a tip link (D035)

**My Content** (Workshop → My Content):

- Disk management dashboard (D030): pinned/transient/expiring resources with sizes, TTL, and source
- Bulk actions: pin, unpin, delete, redownload
- Storage used / cleanup recommendations

### Mod Profile Manager

```
Workshop → Mod Profiles
  — or —
Settings → Mod Profiles
```

```
┌──────────────────────────────────────────────────────────┐
│  MOD PROFILES                                [← Back]    │
│                                                          │
│  Active: IC Default (vanilla)                            │
│  Fingerprint: a3f2c7...                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ► IC Default (vanilla)              [Active ✓]    │ │
│  │  ► Combined Arms v2.1 + HD Sprites   [Activate]    │ │
│  │  ► Tournament Standard               [Activate]    │ │
│  │  ► My Custom Mix                     [Activate]    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [New Profile]  [Import from Workshop]  [Diff Profiles]  │
└──────────────────────────────────────────────────────────┘
```

One-click profile switching reconfigures mods AND experience settings (D062).

---

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
| **Video**    | Resolution, fullscreen/windowed/borderless, render mode (Classic/HD/3D), zoom limits, UI scale, shroud style (hard/smooth edges), FPS limit, VSync. Theme selection (Classic/Remastered/Modern/community). Cutscene playback preference (`Auto` / `Original` / `Clean Remaster` / `AI Enhanced` / `Briefing Fallback`).                                                          |
| **Audio**    | Master / Music / SFX / Voice / Ambient volume sliders. Music mode (Jukebox/Dynamic/Off). EVA voice. Spatial audio toggle.                                                                                                                                           |
| **Controls** | Hotkey profile (Classic/OpenRA/Modern/Custom). Full rebinding UI with category filters (Unit Commands, Production, Control Groups, Camera, Chat, Debug). Mouse settings: edge scroll speed, scroll inversion, drag selection shape. Touch settings: handedness (mirror layout), touch target size, hold/drag thresholds, command rail behavior, camera bookmark dock preferences. |
| **Gameplay** | Experience profile (one-click preset). Balance preset. Pathfinding preset. AI behavior preset. Full D033 QoL toggle list organized by category: Production, Commands, UI Feedback, Selection, Gameplay. Tutorial hint frequency, Controls Walkthrough prompts, and mobile Tempo Advisor warnings (client-only) also live here. |
| **Social**   | Voice settings: PTT key, input/output device, voice effect preset, mic test. Chat settings: profanity filter, emojis, auto-translated phrases. Privacy: who can spectate, who can friend-request, online status visibility.                                         |
| **LLM**      | Provider cards (add/edit/remove LLM providers). Task routing table (which provider handles which task). Connection test. Community config import/export (D047).                                                                                                     |
| **Data**     | Content sources (detected game installations, manual paths, re-scan). **Installed Content Manager** (install profiles like `Minimal Multiplayer` / `Campaign Core` / `Full`, optional media packs, media variant groups such as cutscenes `Original` / `Clean Remaster` / `AI Enhanced`, size estimates, reclaimable space). Data health summary. Backup/Restore buttons. Cloud sync toggle. Mod profile manager link. Storage usage. Export profile data (GDPR, D061). Recovery phrase viewer ("Show my 24-word phrase"). |

---

## Player Profile

```
Main Menu → Profile
  — or —
Lobby → click player name → Full Profile
  — or —
Post-Game → click player → Full Profile
```

```
┌──────────────────────────────────────────────────────────────┐
│  PLAYER PROFILE                                  [← Back]    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  [Avatar]  CommanderDK                                 │ │
│  │            Captain II (1623)  🎖🎖🎖                    │ │
│  │            "Fear the Tesla."                           │ │
│  │  [Edit Profile]                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Stats] [Achievements] [Match History] [Friends] [Social]   │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  (active tab content)                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Pinned Achievements: [🏆 First Blood] [🏆 500 Wins]        │
│  Communities: [IC Official ✓] [CnCNet ✓]                     │
└──────────────────────────────────────────────────────────────┘
```

### Profile Tabs

| Tab               | Contents                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stats**         | Per-game-module Glicko-2 ratings, rank tier badge, rating graph (last 50 matches), faction distribution pie chart, win streak, career totals. Click rating → Rating Details Panel (D055). |
| **Achievements**  | All achievements by category (Campaign/Skirmish/Multiplayer/Community). Pin up to 6 to profile. Rarity percentages. Per-game-module.                                                      |
| **Match History** | Scrollable list: date, map, players, result, rating delta, [Replay] button. Filter by mode/date/result.                                                                                   |
| **Friends**       | Platform friends (Steam/GOG) + IC community friends. Presence states (Online/InGame/InLobby/Away/Invisible/Offline). [Join]/[Spectate]/[Invite] buttons. Block list. Private notes.       |
| **Social**        | Community memberships with verified/unverified badges. Workshop creator profile (published count, downloads). Country flag. Social links.                                                 |

### Rating Details Panel

```
Profile → Stats → click rating value
```

Deep-dive into Glicko-2 competitive data (D055):

- Current rating box: μ (mean), RD (rating deviation), σ (volatility), confidence interval, trend arrow
- Plain-language explainer: "Your rating is 1623, meaning you're roughly better than 72% of ranked players in this queue."
- Rating history graph: Bevy 2D line chart, confidence band shading, per-faction color overlay
- Recent matches: rating impact bars (+/- per match)
- Faction breakdown: win rate per faction with separate faction ratings
- Rating distribution histogram: "You are here" marker
- [Export CSV] button, [Leaderboard →] link

---

## Encyclopedia

```
Main Menu → Encyclopedia
  — or —
In-Game → sidebar → right-click unit/building → "View in Encyclopedia"
```

```
┌──────────────────────────────────────────────────────────────┐
│  ENCYCLOPEDIA                                    [← Back]    │
│                                                              │
│  🔎 Search...                                                │
│                                                              │
│  Categories: [Infantry] [Vehicles] [Aircraft] [Naval]        │
│              [Structures] [Defenses] [Support]               │
│                                                              │
│  ┌──────────────┐  ┌─────────────────────────────────────┐  │
│  │ UNIT LIST    │  │   TESLA COIL                         │  │
│  │              │  │                                      │  │
│  │ ▸ Rifle Inf. │  │   [animated sprite preview]          │  │
│  │ ▸ Rocket Inf │  │                                      │  │
│  │ ▸ Engineer   │  │   Cost: $1500   Power: -150          │  │
│  │ ▸ Tanya      │  │   Range: 6   Damage: 200 (elec.)    │  │
│  │   ...        │  │   HP: 400   Armor: Concrete          │  │
│  │              │  │                                      │  │
│  │ STRUCTURES   │  │   "The Tesla Coil is the Soviet's    │  │
│  │ ▸ Const Yard │  │    primary base defense..."          │  │
│  │ ▸ Power Plant│  │                                      │  │
│  │ ▸ Tesla Coil │  │   Strong vs: Vehicles, Infantry      │  │
│  │ ▸ War Fact.  │  │   Weak vs: Aircraft, Artillery       │  │
│  │   ...        │  │   Requires: Radar Dome               │  │
│  └──────────────┘  └─────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Auto-generated from YAML rules. Optional `encyclopedia:` block per unit/building adds flavor text and counter-play information. Stats reflect the active balance preset.

---

## Tutorial & New Player Experience

The tutorial system (D065) has five layers that integrate throughout the flow rather than existing as a single screen:

### Layer 1 — Commander School

```
Main Menu → Campaign → Commander School
```

A dedicated 10-mission tutorial campaign using the D021 branching graph system. Teaches: camera, selection, movement, combat, building, harvesting, tech tree, control groups, multiplayer basics, advanced tactics, and camera bookmarks. Branching allows skipping known topics. Tutorial AI opponents are below Easy difficulty. The campaign content is shared across desktop and touch platforms; prompt wording and UI highlights adapt to `InputCapabilities`/`ScreenClass`.

### Layer 2 — Contextual Hints

Appear throughout the game as translucent overlay callouts at the point of need:

```
┌──────────────────────────────────────────┐
│ 💡 TIP: Right-click to move units.       │
│    Hold Shift to queue waypoints.        │
│                        [Got it] [Don't   │
│                                  show    │
│                                  again]  │
└──────────────────────────────────────────┘
```

YAML-driven triggers, adaptive suppression (hints shown less frequently as the player demonstrates mastery), experience-profile-aware (different hints for vanilla vs. OpenRA vs. Remastered veterans). Hint text is rendered from semantic action prompts, so desktop can say "Right-click to move" while touch devices render "Tap ground to move" for the same hint definition.

### Layer 3 — New Player Pipeline

The first-launch self-identification screen (shown earlier) feeds into:
- A short controls walkthrough (desktop/touch-specific, skippable)
- Skill assessment from early gameplay
- Difficulty recommendation for first campaign/skirmish
- Tutorial invitation (non-mandatory)

### First-Run Controls Walkthrough (Cross-Device, Skippable)

A 60-120 second controls walkthrough is offered after self-identification and before (or alongside) the Commander School invitation. It teaches only the input basics for the current platform: camera pan/zoom, selection, context commands, minimap/radar use, control groups, camera bookmarks, and build UI basics (sidebar on desktop/tablet, build drawer on phone).

The walkthrough is device-specific in presentation but concept-identical in content:
- Desktop: mouse/keyboard prompts and desktop UI highlights
- Tablet: touch prompts with sidebar highlights and on-screen hotbar references
- Phone: touch prompts with bottom build drawer, command rail, and minimap-cluster/bookmark dock highlights

Completion unlocks three actions: `Start Commander School`, `Practice Sandbox`, or `Skip to Game`.

### Layer 4 — Adaptive Pacing

Behind the scenes: the engine estimates player skill from gameplay metrics and adjusts hint frequency, tutorial prompt density, mobile tempo recommendations (advisory only), and difficulty recommendations. Not visible as a screen — it's a system that shapes the other layers.

### Layer 5 — Post-Game Learning

The post-game screen (see Post-Game section above) includes rule-based tips analyzing the match. "You had 15 idle harvester seconds" with a link to the relevant Commander School lesson or an annotated replay mode highlighting the moment.

### Multiplayer Onboarding

First time clicking **Multiplayer**:

```
┌──────────────────────────────────────────────────────────┐
│  WELCOME TO MULTIPLAYER                                  │
│                                                          │
│  Iron Curtain multiplayer uses relay servers for fair     │
│  matches — no lag switching, no host advantage.          │
│                                                          │
│  ► Try a casual game first (Game Browser)                │
│  ► Jump into ranked (10 placement matches to calibrate)  │
│  ► Watch a game first (Spectate)                         │
│                                                          │
│  [Got it, let me play]                [Don't show again] │
└──────────────────────────────────────────────────────────┘
```

---

## IC SDK (Separate Application)

The SDK is a separate Bevy application from the game (`ic-editor` crate). It shares library crates but has its own binary and launch point.

### SDK Start Screen

```
┌──────────────────────────────────────────────────────────┐
│  IRON CURTAIN SDK                                        │
│                                                          │
│  ► New Scenario                                          │
│  ► New Campaign                                          │
│  ► Open File...                                          │
│  ► Asset Studio                                          │
│  ► Validate Project...                                   │
│  ► Upgrade Project...                                    │
│                                                          │
│  Recent:                                                 │
│  · coastal-fortress.icscn  (yesterday)                   │
│  · allied-campaign.iccampaign  (3 days ago)              │
│  · my-mod/rules.yaml  (1 week ago)                       │
│                                                          │
│  Git: main • clean                                        │
│                                                          │
│  ► Preferences                                           │
│  ► Documentation                                         │
└──────────────────────────────────────────────────────────┘
```

### Scenario Editor

```
SDK → New Scenario / Open File
```

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Scenario Editor] [Asset Studio] [Campaign Editor]                      │
│ [Preview] [Test ▼] [Validate] [Publish]   Git: main • 4 changed           │
│                               validation: Stale • Simple Mode             │
├──────────┬───────────────────────────────┬───────────────────────────────┤
│ MODE     │   ISOMETRIC VIEWPORT          │  PROPERTIES                   │
│ PANEL    │   (ic-render, same as         │  PANEL                        │
│          │    game rendering)            │  (egui)                       │
│ Terrain  │                               │                               │
│ Entities │                               │  • Selected entity            │
│ Triggers │                               │  • Properties list            │
│ Waypoints│                               │  • Transform                  │
│ Modules  ├───────────────────────────────┤  • Components                 │
│ Regions  │  BOTTOM PANEL                 │                               │
│ Scripts  │  (triggers/scripts/vars/      │                               │
│ Layers   │   validation results)         │                               │
│          ├───────────────────────────────┴───────────────────────────────┤
│          │ STATUS: cursor (1024, 2048) | Cell (4, 8) | 127 entities      │
└──────────┴───────────────────────────────────────────────────────────────┘
```

**Key features:**
- 8 editing modes: Terrain, Entities, Triggers, Waypoints, Modules, Regions, Scripts, Layers
- Simple/Advanced toggle (hides ~15 features without data loss)
- Entity palette: search-as-you-type, 48×48 thumbnails, favorites, recently placed
- Trigger editor: visual condition/action builder with countdown timers
- Module system: 30+ drag-and-drop modules (Wave Spawner, Patrol Route, Reinforcements, etc.)
- Toolbar flow: `Preview` / `Test` / `Validate` / `Publish` (Validate is optional before preview/test)
- `Test` dropdown: `Profile Playtest` (Advanced mode only)
- `Validate`: Quick Validate preset (async, cancelable, no full auto-validate on save)
- Publish Readiness screen: aggregated validation/export/license/metadata warnings before Workshop upload
- Git-aware project chrome (read-only): branch, dirty/clean, changed file count, conflict badge
- Undo/Redo: command pattern, autosave
- Export-safe authoring mode (D066): live fidelity indicators, feature gating for cross-engine compatibility
- Migration Workbench entry point: "Upgrade Project" (preview in 6a, apply+rollback in 6b)

**Example: Publish Readiness (AI Cutscene Variant Pack)**

When a creator publishes a campaign or media pack that includes AI-assisted cutscene remasters, Publish Readiness surfaces provenance/labeling checks alongside normal validation results:

```
┌──────────────────────────────────────────────────────────┐
│  PUBLISH READINESS — official/ra1-cutscenes-ai-enhanced │
│  Channel: Release                                       │
├──────────────────────────────────────────────────────────┤
│ Errors (2)                                              │
│  • Missing provenance metadata for 3 video assets       │
│    (source media reference + rights declaration).       │
│    [Open Assets] [Apply Batch Metadata]                 │
│  • Variant labeling missing: pack not marked            │
│    "AI Enhanced" / "Experimental" in manifest metadata. │
│    [Open Manifest]                                      │
├──────────────────────────────────────────────────────────┤
│ Warnings (1)                                            │
│  • Subtitle timing drift > 120 ms in A01_BRIEFING_02.   │
│    [Open Video Preview] [Auto-Align Subtitles]          │
├──────────────────────────────────────────────────────────┤
│ Advice (1)                                              │
│  • Preview radar_comm mode before publish; face crop may│
│    clip at 4:3-safe area. [Preview Radar Comm]          │
├──────────────────────────────────────────────────────────┤
│ [Run Validate Again]                      [Publish Disabled] │
└──────────────────────────────────────────────────────────┘
```

**Channel-sensitive behavior (aligned with D040/D068):**
- `beta/private` Workshop channels may allow publish with warnings and explicit confirmation
- `release` channel can block publish on missing AI media provenance/rights metadata or required variant labeling
- Campaign packages referencing missing optional AI remaster packs still publish if fallback briefing/intermission presentation is valid

### Asset Studio

```
SDK → Asset Studio
```

```
┌──────────────────┬─────────────────────┬───────────────────┐
│ ASSET BROWSER    │  PREVIEW VIEWPORT   │ PROPERTIES        │
│ (tree: .mix      │  (sprite viewer,    │ (frames, size,    │
│  archives +      │   animation scrub,  │  draw mode,       │
│  local files)    │   zoom, palette)    │  palette, player  │
│                  │                     │  color remap)     │
│ 🔎 Search...     │  ◄ ▶ ⏸ ⏮ ⏭ Frame  │                   │
│                  │  3/24               │                   │
├──────────────────┴─────────────────────┼───────────────────┤
│ [Import] [Export] [Batch] [Compare]    │ [Preview as       │
│                                        │  unit on map]     │
└────────────────────────────────────────┴───────────────────┘
```

XCC Mixer replacement with visual editing. Supports SHP, PAL, AUD, VQA, MIX, TMP. Bidirectional conversion (SHP↔PNG, AUD↔WAV). Chrome/theme designer with 9-slice editor and live menu preview. Advanced mode includes asset provenance/rights metadata panels surfaced primarily through Publish Readiness.

### Campaign Editor

```
SDK → New Campaign / Open Campaign
```

Node-and-edge graph editor in a 2D Bevy viewport (separate from isometric). Pan/zoom like a mind map. Nodes = missions (link to scenario files). Edges = outcomes (labeled with named outcome conditions). Weighted random paths configurable. Advanced mode adds validation presets, localization/subtitle workbench, optional hero progression/skill-tree authoring (D021 hero toolkit campaigns), and migration/export readiness checks.

**Advanced panel example: Hero Sheet / Skill Choice authoring (optional D021 hero toolkit)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CAMPAIGN EDITOR — HERO PROGRESSION (Advanced)                 [Validate]   │
├───────────────────────┬───────────────────────────────────────┬─────────────┤
│ HERO ROSTER           │ SKILL TREE: Tanya - Black Ops         │ PROPERTIES  │
│                       │                                       │             │
│ > Tanya      Lv 3     │     [Commando]   [Stealth] [Demo]     │ Skill:      │
│   Volkov     Lv 1     │                                       │ Chain        │
│   Stavros    Lv 2     │   o Dual Pistols Drill (owned)        │ Detonation   │
│                       │    \\                                 │             │
│ Hero state preset:    │     o Raid Momentum (owned)           │ Cost: 2 pts  │
│ [Mission 5 Start ▾]   │      \\                               │ Requires:    │
│ [Simulate...]         │       o Chain Detonation (locked)     │ - Satchel Mk2│
│                       │                                       │ - Raid Mom.  │
│ Unspent points: 1     │   o Silent Step (owned)               │             │
│ Injury state: None    │    \\                                 │ Effects:     │
│                       │     o Infiltrator Clearance (locked)  │ + chain exp. │
├───────────────────────┼───────────────────────────────────────┼─────────────┤
│ INTERMISSION PREVIEW  │ REWARD / CHOICE AUTHORING                           │
│ [Hero Sheet] [Skill Choice] [Armory]                                        │
│ Tanya portrait · Level 3 · XP 420/600 · Skills: 3 owned                     │
│ Choice Set "Field Upgrade": [Silent Step] [Satchel Charge Mk II]            │
│ [Preview as Player] [Set branch conditions...] [Export fidelity hints]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Authoring interactions (hero toolkit campaigns):**
- Select a hero to edit level/xp defaults, death/injury policy, and loadout slots
- Build skill trees (requirements, costs, effects) and bind them to named characters
- Configure debrief/intermission reward choices that grant XP, items, or skill unlocks
- Preview Hero Sheet / Skill Choice intermission panels without launching a mission
- Simulate hero state for branch validation and scenario test starts ("Tanya Lv3 + Silent Step")

---

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
├── Developer Console ─────────────────── [Tilde ~]
└── Debug Overlays ────────────────────── (dev mode only)

POST-GAME → [Watch Replay] / [Re-Queue] / [Main Menu]

IC SDK (separate application)
├── Start Screen ──────────────────────── New/Open, Validate Project, Upgrade Project, Git status
├── Scenario Editor ───────────────────── 8 editing modes, Simple/Advanced, Preview/Test/Validate/Publish
├── Asset Studio ──────────────────────── Archive browser, sprite/palette editor, provenance metadata (Advanced)
└── Campaign Editor ───────────────────── Node graph + validation/localization + optional hero progression tools (Advanced)
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
| QoL toggles & experience profiles         | `decisions/09d-gameplay.md` § D033                                         |
| Lobby protocol & ready check              | `03-NETCODE.md` § Match Lifecycle                                |
| Post-game flow & re-queue                 | `03-NETCODE.md` § Post-Game Flow                                 |
| Ranked tiers & matchmaking                | `decisions/09b-networking.md` § D055                                         |
| Player profile                            | `decisions/09e-community.md` § D053                                         |
| In-game communication (chat, VoIP, pings) | `decisions/09g-interaction.md` § D059                                         |
| Command console                           | `decisions/09g-interaction.md` § D058                                         |
| Tutorial & new player experience          | `decisions/09g-interaction.md` § D065                                         |
| Workshop browser & mod management         | `decisions/09e-community.md` § D030                                         |
| Mod profiles                              | `decisions/09c-modding.md` § D062                                         |
| LLM configuration                         | `decisions/09f-tools.md` § D047                                         |
| Data backup & portability                 | `decisions/09e-community.md` § D061                                         |
| Branching campaigns                       | `decisions/09c-modding.md` § D021                                         |
| Generative campaigns                      | `decisions/09f-tools.md` § D016                                         |
| Observer/spectator UI                     | `02-ARCHITECTURE.md` § Observer / Spectator UI                   |
| SDK & scenario editor                     | `02-ARCHITECTURE.md` § IC SDK & Editor Architecture              |
| Cursor system                             | `02-ARCHITECTURE.md` § Cursor System                             |
| Hotkey system                             | `02-ARCHITECTURE.md` § Hotkey System                             |
| Camera system                             | `02-ARCHITECTURE.md` § Camera System                             |
| C&C UX philosophy                         | `13-PHILOSOPHY.md` § Principles 12-13                            |
| Balance presets                           | `decisions/09d-gameplay.md` § D019                                         |
| Render modes                              | `decisions/09d-gameplay.md` § D048                                         |
| Foreign replay import                     | `decisions/09f-tools.md` § D056                                         |
| Cross-engine export                       | `decisions/09c-modding.md` § D066                                         |
| Server configuration                      | `15-SERVER-GUIDE.md`                                             |
