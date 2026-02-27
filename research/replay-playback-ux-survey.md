# Replay & Playback UX Survey — Cross-Game Analysis for Iron Curtain

> **Purpose:** Catalog replay viewer GUI elements, transport controls, observer overlays, camera modes, and player pain points across competitive and RTS games. Inform the design of IC's replay/playback system.
>
> **Date:** 2026-02
>
> **Scope:** In-client replay viewers and spectator UIs. Not server-side replay storage architecture (see D-series networking docs), not streaming/broadcast production tools, not third-party VOD platforms.

---

## 1. StarCraft II

StarCraft II's replay system is widely considered the gold standard for RTS replay viewers. It ships as part of the base client and doubles as the observer UI for live spectating.

### 1.1 Transport Controls

| Control | Binding | Notes |
|---------|---------|-------|
| Play / Pause | `P` or Spacebar | Toggles playback |
| Increase Speed | `+` / Numpad `+` | Steps through speed tiers |
| Decrease Speed | `-` / Numpad `-` | Steps through speed tiers |
| Fast Forward (max) | Up to 8x speed | Labeled "Faster x8" in UI |
| Rewind 15 seconds | `B` | Instant jump-back; most-used control |
| Restart Replay | `Ctrl+E` | Returns to tick 0 |
| Seek via Timeline | Click on progress bar | Can jump to any *already-viewed* point |

**Key limitation:** You cannot seek forward to an un-viewed point — you must fast-forward through it first. The engine re-simulates from the last checkpoint, so forward-seeking requires playing through the simulation. Backward seeking works because the client stores periodic snapshots of already-viewed state.

### 1.2 Timeline / Scrub Bar

The timeline sits at the bottom of the screen. It is a horizontal progress bar showing elapsed time vs. total replay duration. Notable features:

- **Automatic bookmarks:** The system auto-generates bookmarks for significant events (engagements, expansions, tech transitions). These appear as small vertical ticks on the timeline.
- **Combat shading:** Since Patch 2.0.8, the Army graph includes colored shading during combat moments, showing resource losses. This is mirrored on the timeline as intensity markers.
- **Spoiler concern:** The progress bar is always visible, revealing how much time remains in the game. Players watching for entertainment complained this spoils the outcome (a bar near the end means the game is about to end). There is no way to hide the progress bar.

### 1.3 Observer / Statistics Overlays

The top-left corner contains a drop-down menu to select from multiple statistics panels, each toggled by hotkey:

| Panel | Hotkey | Content |
|-------|--------|---------|
| Resources | `R` | Minerals, Gas, Supply for each player |
| Income | `I` | Per-minute harvesting rates |
| Spending | `S` | Resource allocation: Economy / Technology / Army |
| Units | `U` | Battlefield unit composition and counts |
| Units Lost | `L` | Casualty tracking by unit type |
| Production | `D` | Active research, construction, building queues |
| Active Forces / Army | `A` | Total army resource cost, army supply |
| APM | `M` | Average and current Actions Per Minute per player |
| Upgrades | `G` | Completed and in-progress upgrades |
| Structures | `T` | Building counts and status |

**Larger 1v1 panels** (Patch 2.0+) are available via `Ctrl+` shortcuts for broadcast-friendly displays:

- `Ctrl+N` — Player Name Panel (name, team color, race, supply)
- `Ctrl+I` — Current Income panel
- `Ctrl+A` — Army and Worker supply
- `Ctrl+R` — Units and Workers killed

The APM display shows both average-over-game and current-window APM, though players have noted inaccuracy at non-real-time game speeds.

### 1.4 Camera Modes

- **Free camera:** Default mode; pan, zoom, rotate freely.
- **Player camera:** Shows exactly what the player saw during the game, including their screen position, scrolling, and selection. Toggled on a per-player basis.
- **Unit follow:** `Ctrl+F` locks camera onto a selected unit.
- **Player vision toggle:** Hold `V` to temporarily view a specific player's fog-of-war perspective. Releasing returns to full-vision mode.

Visual indicators: Selected units of the viewed player are shown with **dashed circles** in the player's color, so the observer can see what the player had selected and which commands they issued.

### 1.5 Game Summary Screen

After a replay ends (or accessible from match history), the Game Summary provides:

- **Timeline graphs:** Army value, income, spending, workers over time.
- **Combat shading:** Colored bands on the army graph indicate when engagements occurred and how many resources were lost.
- **Economy graph:** Shows unspent resources over time (improved in 2.0.8 to mark exactly when resources went unspent).
- **Build order comparison:** Side-by-side production timelines.
- **Per-unit statistics:** Kills, deaths, efficiency for each unit type.

### 1.6 Unique / Innovative Features

- **Custom Observer UI mods:** SC2 supports full replacement of the observer interface via the mod system. The community-created WCS Observer UI and AhliObs are widely used in esports broadcasts, adding custom layouts, worker/army supply bars, and production trackers. This is built on the Galaxy Editor's UI framework.
- **Replay file contains full deterministic command log:** The `.SC2Replay` file stores all player inputs. Any client with the matching game version can replay it identically.
- **Sc2gears / sc2reader:** Community parsing tools extract structured data (build orders, APM curves, engagement timing) from replay files without running the game client.

### 1.7 Common Player Complaints

1. **No forward seeking:** Cannot jump ahead to an un-viewed timestamp; must fast-forward at 8x.
2. **Progress bar spoils outcome:** Visible timeline length reveals when the game ends.
3. **Replay version compatibility:** Patch 3.0 broke backward compatibility with all pre-3.0 replays. Pro-match replay archives became useless overnight.
4. **APM inaccuracy:** APM display does not correctly account for game-speed multiplier.
5. **No collaborative replay viewing:** Cannot watch a replay simultaneously with friends online.
6. **No first-person view beyond camera following:** You see the player's camera position but not their mouse cursor or precise click targets.

### 1.8 Sharing / Export

- Replay files (`.SC2Replay`) are small self-contained files (~100-300KB) shareable via any file transfer.
- Community sites (sc2replaystats.com, spawningtool.com) host replay databases with parsed metadata.
- No built-in video export. Players use external capture (OBS, ShadowPlay).

---

## 2. Age of Empires II: Definitive Edition

AoE2:DE has a notably limited built-in replay viewer, but the community-developed CaptureAge tool (officially endorsed by Microsoft/World's Edge) fills the gap and is the de facto standard for tournament broadcasts.

### 2.1 Built-in Replay Viewer

#### Transport Controls

| Control | Notes |
|---------|-------|
| Play / Pause | Basic toggle |
| Speed up | Arrow buttons near minimap; 2x and 4x options |
| Slow down | Reduces to 0.5x |
| Rewind | **Not available.** Must restart replay from the beginning. |
| Seek / Timeline scrub | **Not available.** No clickable timeline. |
| Chapter system | Manual chapter creation; no auto-chapters. Can jump between manually saved bookmarks. |

**This is the primary pain point.** To re-watch something that happened at minute 30, players must restart the replay and fast-forward at 4x for ~7.5 minutes. There is no timeline bar to click on, no skip-forward, and no rewind.

#### Observer Panels

The built-in viewer shows:
- Player names, civilizations, and scores
- Basic resource counts
- Post-game statistics screen with score breakdown, military, economy, technology, and society tabs
- Timeline graph (post-game only) showing score progression

**Technical constraint:** Like most RTS games using command-log replay, the engine records player actions (not game state). Reaching any point requires re-simulating from the start, which makes arbitrary seeking expensive without periodic state snapshots.

### 2.2 CaptureAge (CA:DE)

CaptureAge is a separate application that connects to the AoE2:DE client and provides a full observer overlay. It has free and paid (Pro) tiers.

#### Transport Controls (Pro feature)

| Control | Notes |
|---------|-------|
| Play / Pause | Standard toggle |
| Speed up | Arrow buttons; multiple speed tiers |
| Rewind | **Pro only.** Reverse arrow buttons rewind time. |
| Timeline scrub | **Pro only.** Clickable playback bar jumps to any point. |
| Bookmarks | User-placed markers on the timeline for key events. |

#### Statistics Overlays

The top-center player panels display per-player:

| Column | Content |
|--------|---------|
| Left | Current population / supported population |
| Center | Military Value (total resource cost of alive units), Idle Villager count |
| Right | Total military units, total economic units |

Additional overlays:

- **Economy tab:** Resources collected over time (each resource individually or stacked), villager count timeline, market buy/sell tracking, gold gained/spent.
- **Military tab:** Army composition, unit counts (absolute numbers or percentage of global), damage dealt/taken aggregates.
- **Technology tab:** Research completion markers on the timeline, age progression indicators.
- **APM display:** "geAPM" (game-effective Actions Per Minute), split into economy and military categories.
- **Worker efficiency:** Breakdown of villager time: idle, moving, building, gathering, working. "WE LM" metric (Worker Efficiency in Last Minute).

#### Camera Controls

- Free camera with adjustable zoom (more zoom range than the base game)
- Camera follow on selected units (hotkey-based)
- Zoom presets: Keys `1`, `2`, `3` for different zoom levels
- Perspective switching: `Ctrl+Space`
- Fog-of-war toggle: View from any player's perspective

#### Minimap Enhancements

- Partially constructed buildings shown on minimap with progress indicators
- Town Center / Castle icons with custom team colors
- Elevation rendering
- Economy / Military mode toggle (shows resource vs. army distribution)
- Clickable navigation (click minimap to jump camera)

### 2.3 Common Player Complaints

1. **Built-in viewer is crippled:** No rewind, no timeline, no seeking. Universally considered the worst part of the otherwise excellent DE edition.
2. **CaptureAge required for basic features:** Features like rewind and timeline scrub are locked behind a paid subscription in the third-party tool.
3. **Replay version incompatibility:** Game patches break old replays because the engine replays commands against current unit stats. A balance patch changes unit behavior, causing replays to desync.
4. **No built-in spectator dashboard:** Tournament organizers rely entirely on CaptureAge for broadcast overlays.
5. **Speed cap feels slow:** Players frequently request 8x speed (only 4x is available natively).

### 2.4 Sharing / Export

- Replay files (`.aoe2record`) shareable via file transfer.
- Recent patches added a web-based replay download feature via the Age of Empires stats page.
- DE Replays Manager (community tool) helps manage replay files and downgrade them for compatibility.
- No built-in video export. CaptureAge Pro enables better camera work but still requires external capture software.

---

## 3. Dota 2

Dota 2's replay system is tightly integrated with its match infrastructure. Every public match is automatically recorded and available for download by any player via the match ID.

### 3.1 Transport Controls

| Control | Binding | Notes |
|---------|---------|-------|
| Play / Pause | Spacebar | Standard toggle |
| Increase Speed | `=` / `+` | Multiple speed tiers; press repeatedly to step up |
| Decrease Speed | `-` | Multiple tiers including slow-motion |
| Speed selector | Drop-down menu | Replaced the old always-visible speed bar in a UI update; controversial change |

The speed controls were redesigned at some point to use a drop-down menu rather than an always-visible row of speed buttons. Content creators complained this added unnecessary clicks for a frequently-used control.

### 3.2 Timeline / Scrub Bar

The timeline is a horizontal bar at the bottom of the screen with:

- **Kill markers:** Small icons/ticks marking when kills occurred. These are color-coded or shaped to indicate which team scored the kill.
- **Objective markers:** Roshan kills, tower destructions, barracks falls.
- **Team fight indicators:** Highlighted zones on the timeline marking intense multi-hero engagements.
- **Clickable seeking:** Click anywhere on the timeline to jump to that moment.

**Controversial change:** Valve removed timestamps from the mouse cursor when hovering over the timeline. Previously, hovering showed the exact game time at that position. After removal, players must guess where to click, making precise seeking significantly harder. Content creators were vocal about this regression.

### 3.3 Camera Modes

- **Free camera:** Full manual control; pan, zoom, rotate.
- **Player perspective:** Shows exactly what a specific player saw, including their camera position, fog of war, and UI state.
- **Directed camera:** AI-controlled camera that automatically follows the action, jumping between lanes and team fights. This is also used for passive viewing and tournament broadcasts.
- **Hero chase:** Locks camera onto a specific hero.

### 3.4 Observer / Data Overlays

Dota 2 provides extensive data overlays during replays:

- **Scoreboard:** Full item builds, gold, XP, last hits, denies, GPM, XPM for all 10 players.
- **Gold/XP graphs:** Team advantage over time, with markers for key events.
- **Net worth comparison:** Side-by-side team net worth.
- **Damage dealt/taken breakdowns.**
- **Ward placement visualization.**
- **Draft timeline:** Hero picks and bans in chronological order.

Replays can also include:

- **Caster audio streams:** If the match was cast, commentary audio is embedded in the replay.
- **Caster camera perspective:** Watch the game as the caster directed their camera.
- **Multiple audio/camera tracks:** Tournament matches often have multiple caster tracks in different languages.

### 3.5 Unique / Innovative Features

- **Match ID sharing:** Every match has a unique numeric ID. Any player can enter this ID in the client to download and watch the replay. This is the simplest sharing model of any game surveyed.
- **In-client download:** Replays are downloaded directly from Valve's servers within the Dota 2 client. No file management required.
- **Coaching integration:** The replay viewer's perspective tools are the same ones used in the live coaching system, where a coach spectates a student's game.
- **Takeover mode (removed):** Previously allowed 10 players to take over a replay at any point and continue playing from that state as a new match. Removed in 2014 but conceptually interesting for training scenarios.

### 3.6 Common Player Complaints

1. **Replay unavailability:** Replays frequently show "Replay Pending" or "Replay Unavailable," particularly on SEA/OCE servers and for pro matches. Replays are stored server-side and sometimes fail to process.
2. **Replay expiry:** Replays are available for a limited time (reported as ~2 weeks) before being deleted from Valve's servers. No permanent archive.
3. **Speed control regression:** The move from an always-visible speed bar to a drop-down menu frustrated content creators who rapidly switch speeds during editing.
4. **Timestamp removal from cursor:** Hovering over the timeline no longer shows the exact game time, making precision seeking guesswork.
5. **Regional download restrictions:** Some regions report inability to download replays.
6. **Community workarounds broken:** UI updates undermined community-discovered console commands and tricks for manipulating the replay viewer, frustrating power users.

### 3.7 Sharing / Export

- Match IDs shareable as plain numbers (e.g., "Match 7654321098"). Anyone with Dota 2 installed can watch.
- Replay files downloadable to local storage for offline viewing.
- Third-party sites (OpenDota, DOTABUFF) provide parsed match data, statistics, and heatmaps without requiring the game client.
- No built-in video export. External capture required.

---

## 4. Counter-Strike 2 / CS:GO

CS2's demo viewer is the most command-line-oriented of the systems surveyed. It is powerful but relies heavily on console commands and has a steep learning curve for casual users.

### 4.1 Transport Controls

| Control | Binding | Notes |
|---------|---------|-------|
| Play / Pause | Spacebar | Standard toggle |
| Open Demo UI | `Shift+F2` | Opens the visual control panel (demoui) |
| Open Demo UI (console) | `demoui` or `demoui2` | `demoui2` has enhanced timeline and round navigator |
| Pause (console) | `demo_pause` | |
| Resume (console) | `demo_resume` | |
| Set speed | `demo_timescale X` | X = multiplier (0.25, 0.5, 1, 2, 4, etc.) |
| Jump to tick | `demo_gototick X` | Jump to exact engine tick |
| Jump to time | `demo_goto time X` | Jump to time in seconds |
| Speed (numpad) | Numpad `1` = 1x, Numpad `2` = 2x | Quick speed presets |

The `demoui` / `demoui2` panel appears at the bottom of the screen and provides:

- Play/Pause button
- Speed slider or buttons
- Timeline scrub bar
- **Round navigation:** Forward/backward round buttons to jump to the start of any round
- Tick counter display

### 4.2 Timeline / Scrub Bar

The demoui2 timeline is a horizontal bar showing the full match duration. Features:

- **Round demarcations:** Vertical lines or markers separating rounds.
- **Scrub bar:** Click and drag to jump to any point.
- **Tick-level precision:** The `demo_gototick` command allows frame-exact navigation for analysis.

The timeline is purely positional — it does not annotate kills, bomb plants, or other events. Event navigation is done via round-start jumping rather than event markers.

### 4.3 Camera Modes and Spectator Features

- **First-person (player view):** Watch from any player's perspective, seeing their crosshair, movement, and aim.
- **Free camera:** `Q` key enters free-fly mode; WASD movement, mouse for look.
- **Third-person chase:** Follow a player from behind.
- **X-Ray:** `spec_show_xray 1` — Shows all player positions through walls. Standard for competitive analysis and tournament broadcasts.
- **Grenade trajectory visualization:** Console command enables visible flight paths for thrown grenades (smokes, flashes, molotovs, HE). Essential for studying utility usage and lineups.

Additional console commands for demo viewing:

| Command | Function |
|---------|----------|
| `spec_show_xray 1` | Toggle X-ray (wallhack view) |
| `sv_grenade_trajectory_dash 1` | Show grenade flight paths |
| `cl_draw_only_deathnotices 1` | Hide HUD, show only kill feed |
| `record <filename>` | Record current session |
| `demo_info` | Display demo metadata |

### 4.4 GOTV (Game Observer TV)

GOTV is the server-side spectating/broadcast system:

- Supports thousands of simultaneous viewers on a single match.
- Configurable delay (default 90 seconds for competitive) to prevent ghosting.
- Tournament organizers use GOTV for broadcast feeds, applying X-ray and observer cameras.
- GOTV demos are the standard format for professional match replays.

### 4.5 Unique / Innovative Features

- **Tick-level precision:** CS2 operates on a tick-based system (64 or 128 tick). Demo navigation allows jumping to exact ticks, enabling frame-by-frame analysis of flick shots, spray patterns, and timing.
- **Console-driven power:** While the GUI is basic, the console command system allows scripting of complex replay workflows (automated screenshot capture, batch processing, custom camera paths).
- **Custom keybinds:** Players can bind any demo command to any key via config files (e.g., `bind "I" "demo_togglepause"`, `bind "P" "demoui"`).
- **X-ray as a broadcast standard:** The X-ray overlay (showing player silhouettes through walls) has become the universal standard for FPS esports broadcasting. Other games have copied this feature.

### 4.6 Common Player Complaints

1. **Archaic UI:** The demoui is a bare-bones floating window that looks like a debug tool, not a polished player feature. It blocks interaction with other UI elements while open — you must close it to switch players or open the scoreboard, then reopen it.
2. **Shift+F2 conflicts:** On laptops, `Shift+F2` may require `Fn+Shift+F2`. Many players do not know the shortcut exists.
3. **No event markers on timeline:** Unlike Dota 2 or LoL, the timeline does not show kills, bomb plants, or round-win events. Players must remember or guess round timings.
4. **Freezing bugs:** On some platforms, opening and closing the demoui causes the game to freeze.
5. **Console dependency:** Most useful features require typing console commands. The GUI exposes only basic play/pause/speed controls. Casual players never discover X-ray, grenade trajectories, or tick-jumping.
6. **No built-in round summary:** Unlike a match summary screen, there is no post-demo statistics view. Players rely on third-party tools (SCOPE.GG, Leetify) for analysis.

### 4.7 Sharing / Export

- Demo files (`.dem`) downloadable from match history or GOTV.
- Third-party sites (HLTV.org, SCOPE.GG) host pro match demos.
- SCOPE.GG offers a browser-based demo viewer with full replay controls, eliminating the need to open CS2.
- No built-in video export. External capture required.

---

## 5. Company of Heroes 2 / 3

Company of Heroes 3 introduced a proper replay system in the Steel Shepherd (1.4.0) update. CoH2 had a more basic system. Both share the command-log architecture common to RTS games.

### 5.1 Transport Controls (CoH3)

| Control | Notes |
|---------|-------|
| Play / Pause | Standard toggle; tactical pause also available |
| Speed up | Console: `setsimrate(16)` for 2x, `setsimrate(24)` for 3x (normal = 8) |
| Speed down | Console: `setsimrate(4)` for 0.5x |
| Rewind | **Not available.** Engine limitation — command-log replay without state snapshots. |
| Seek / Timeline | **Not available natively.** Must fast-forward from start. |

A community mod (coh3-replay-enhancements on GitHub) adds an in-game menu for speed switching, player switching, and fog-of-war toggling without console commands.

### 5.2 HUD and Observer Interface (CoH3)

The Playback Panel has three display modes:

1. **Expanded Playback (Caster HUD off):** Full player information visible, designed for learning and analysis. Shows all production, resources, and army data.
2. **Collapsed Playback (Caster HUD off):** Condensed view for experienced players wanting more screen real estate.
3. **Hidden Player Elements (Caster HUD on):** Designed for casting; hides per-player details and shows aggregate comparison data.

The Caster HUD displays dual-team comparison:

| Element | Details |
|---------|---------|
| Resource bars | Manpower, Munitions, Fuel, Population per player |
| Battlegroup info | Command Points earned, unlocked abilities |
| Army composition | Global Unit Controls showing what each player has built |
| Production queues | Buildings and upgrades in progress |
| Kill counts | Infantry and vehicle kills per player |

Player perspective switching: A dropdown per team lets observers quickly switch between players in 1v1, 2v2, 3v3, and 4v4 matches.

### 5.3 Camera Controls

- **Free camera:** Edge-pan with smoothing option.
- **Control groups:** Observers can create control groups on units from any player and use them to quickly jump the camera to specific parts of the battlefield.
- **Cinematic mode:** Removes all HUD elements while preserving in-game UI (health bars, unit icons).
- **Fog of War:** Two removal options — remove for selected player only, or remove entirely.

### 5.4 Live Match Statistics

A dedicated button opens a semi-transparent overlay showing the same layout as post-match statistics. This allows real-time analysis without leaving the replay view.

### 5.5 Common Player Complaints

1. **Late delivery:** The replay feature shipped months after launch. Players were vocal about its absence at release.
2. **No rewind:** Like most RTS replays, rewinding is architecturally impossible without state snapshots. This is the most common complaint.
3. **Console-dependent speed control:** Changing speed requires opening the console and typing `setsimrate(X)`. No GUI buttons for speed by default.
4. **Patch incompatibility:** Replays break after every game update, as the replay re-simulates with current unit stats.
5. **No campaign replays:** Single-player campaign missions, skirmishes, and the Italian Dynamic Campaign cannot be saved as replays.

### 5.6 Sharing / Export

- Replay files shareable via file transfer.
- cohdb.com hosts community replay uploads with parsed metadata.
- A Rust-based replay parser (vault) exists for programmatic analysis.
- No built-in video export.

---

## 6. Warcraft III: Reforged

Warcraft III's replay system has been largely unchanged since the original 2002 release. Reforged did not meaningfully improve the replay viewer, and in some ways regressed from the original.

### 6.1 Transport Controls

| Control | Notes |
|---------|-------|
| Play / Pause | Standard toggle |
| Speed options | Range from 1/32x (extreme slow-mo) to 31x, plus "as fast as possible" mode |
| Fast forward presets | 4 fast-forward speed tiers |
| Slow-motion presets | 2 slow-motion tiers |
| Rewind | **Not available natively.** Community tool "Replay Seeker" achieves rewind by restarting the replay and fast-forwarding to the desired point. |
| Seek to position | **Not available.** Replay Seeker provides this via automated fast-forward. |

The speed range (1/32x to 31x) is the widest of any game surveyed, giving precise control over playback speed. However, there is no timeline or scrub bar.

### 6.2 Observer / Statistics

The built-in replay viewer provides:

- Player names, races, and team assignments (visible from file metadata before watching)
- Basic resource display during playback
- Fog-of-war toggle (view all or view from one player's perspective)

**Missing features (requested by community):**

- No APM display in the viewer (available only via third-party parsers)
- No tooltips for spells, items, or buffs in the Reforged UI — "almost every icon lacks tooltips"
- No resource comparison panel for all players simultaneously
- No hero level / K-D tracking overlay
- No event markers on any timeline (because there is no timeline)
- No production tab or build order display

### 6.3 Camera Controls

- Free camera with pan and zoom
- No unit-follow camera
- No auto-camera that tracks action
- No player-perspective camera (cannot see where the player was looking)

### 6.4 Unique / Innovative Features

- **Wide speed range:** 1/32x to 31x is useful for precise analysis of micro battles.
- **Replay file format well-documented:** The `.w3g` format has been reverse-engineered and documented extensively, enabling community parsers in multiple languages (Rust, PHP, JavaScript).
- **In-browser replay viewer:** Community project wc3v provides a web-based 2D map viewer that visualizes unit movements from replay files without the game client.

### 6.5 Common Player Complaints

1. **No seeking or timeline:** The single most requested feature. Players must watch replays linearly or use Replay Seeker (which restarts and fast-forwards, taking real time).
2. **Missing tooltips in Reforged:** The upgraded UI removed functional tooltips from spell and item icons, making the viewer less useful than the original WC3.
3. **No social replay viewing:** Cannot watch replays together with other players in a lobby.
4. **Replay version incompatibility:** Reforged changed replay storage and compatibility.
5. **Destroyed buildings shown incorrectly on minimap.**
6. **No auto-camera or directed camera** for passive viewing.
7. **No replay editor or cinematic tools.**

### 6.6 Sharing / Export

- Replay files (`.w3g` / `.nwg`) shareable via file transfer.
- Community sites (warcraft3.info, w3replayers.com) host replay archives.
- WC3 Replay Tool (community) provides local analysis including APM, action breakdowns.
- No built-in video export.

---

## 7. League of Legends

League of Legends' replay system was notoriously absent for years (2009-2016). When it finally shipped in the 2017 preseason update, it reused the spectator mode infrastructure with added playback controls.

### 7.1 Transport Controls

| Control | Binding | Notes |
|---------|---------|-------|
| Play / Pause | Spacebar | Standard toggle |
| Speed options | 0.25x, 0.5x, 1x, 2x, 4x, 8x | Selected via UI buttons or hotkeys |
| Jump back 15 seconds | Dedicated button | Single fixed increment; no configurable jump distance |
| Time jumping | Click on timeline bar | Can jump to any point in the replay |

The bottom toolbar provides buttons for all transport controls. Speed options are displayed as discrete buttons (0.25x through 8x), making speed changes single-click operations — a UX advantage over Dota 2's drop-down.

### 7.2 Timeline / Scrub Bar

The timeline is the standout UX feature of LoL's replay system:

- **Annotated event markers:** Kill icons, dragon kills, Baron kills, tower destructions, and inhibitor falls are all marked as small icons on the timeline.
- **Player-contextual highlighting:** When you lock the camera onto a specific champion, that champion's kill markers brighten on the timeline while all other landmarks fade. This makes it easy to find "my kills" or "my deaths" without scrubbing.
- **Clickable seeking:** Click anywhere on the timeline to jump to that moment.
- **Overview tab:** Shows a gold advantage graph over time, with death locations marked on a minimap heat view.

### 7.3 Camera Modes

- **Manual camera:** Free pan; edge-of-screen scrolling unlocks the camera.
- **Directed camera:** AI-controlled; automatically follows the action and switches between players based on activity level.
- **Player-locked camera:** Double-click a champion, select it and press `Y`, or use the bottom-left menu to lock onto and follow one player.
- **FPS camera:** Select from Camera Modes dropdown; uses numpad keys (4, 5, 6, 8) and mouse for free-form first-person movement through the map. Unusual feature for a MOBA.
- **Extended zoom:** `Ctrl+Shift+Z` unlocks the zoom constraint (requires config file edit to enable the keybind).

### 7.4 Observer / Statistics Overlays

- **Scoreboard (Tab / O):** Kills, deaths, assists, minion kills, items, personal score, current gold, total gold per player.
- **Team stats (always visible):** Total team gold, kills, and tower kills displayed at the top of the screen.
- **Team Fight UI (A key):** Minimalist mode that strips the UI to focus on team fight action.
- **Gold advantage graph:** Available in the overview tab.
- **Crowd control indicators:** Visual representation of CC ability effects.
- **Multikill counter:** Tracks double kills through pentakills.

**Limitation:** You cannot view shop item purchases during spectating/replay — the spectator sees the player standing in place at the shop.

### 7.5 Recording / Export

This is where LoL differentiates itself from most competitors:

- **Built-in recording:** The replay toolbar includes a **Record** button that captures a portion of the replay to a `.webm` video file.
- **Highlight system:** Players can clip specific moments directly from the replay viewer.
- **Webm export:** Clips are saved locally and can be uploaded to any platform.
- **Download from match history:** Replays can be downloaded from the post-game screen or match history within the client.

### 7.6 Riot League Director

Riot Games maintains an open-source tool ([League Director on GitHub](https://github.com/RiotGames/leaguedirector)) specifically for staging and recording cinematic videos from replays. Features include:

- Custom camera paths (keyframed)
- Depth-of-field controls
- Post-processing effects
- Free camera with full 3D movement
- Designed for content creators and esports broadcast packages

### 7.7 Common Player Complaints

1. **Replay expiry every patch:** Replays are valid only for the current patch cycle (~2 weeks). After a patch, all old replays become unplayable. This is the most common complaint.
2. **Encrypted ROFL format:** Replay files (`.rofl`) can only be opened in the LoL client. They cannot be converted, shared to non-LoL-players, or archived for later patches.
3. **No collaborative viewing:** Cannot watch replays with friends.
4. **Limited replay features vs. spectator mode:** The replay viewer does not have all spectator mode features.
5. **No rewind beyond 15-second jump:** The 15-second jump-back button is the only backward navigation. There is no true rewind or reverse playback.
6. **Shop viewing disabled:** Cannot see what items players are considering or purchasing.

### 7.8 Sharing

- `.rofl` files shareable but only openable in the LoL client on the same patch.
- Match history in client shows recent games; replays downloadable from there.
- Third-party sites (ReplayBook by Fraxiinus) provide replay file management.
- `.webm` highlight clips are standard video files shareable anywhere.

---

## 8. Fortnite

Fortnite's replay system is the most cinematically-oriented of the games surveyed. It prioritizes content creation (screenshots, cinematic clips, montages) over analytical review.

### 8.1 Transport Controls

| Control | Binding | Notes |
|---------|---------|-------|
| Play / Pause | Standard button | Toggle in the replay HUD |
| Speed control | Displayed as a number (default 1.00) | Adjustable from slow-motion to fast-forward; exact range varies |
| Timeline scrub | Horizontal bar | Click to jump; shows match progression |

The bottom HUD contains a timeline bar with player elimination markers and storm circle progression indicators.

### 8.2 Camera Modes

Fortnite offers five camera modes, cycled with the `C` key or selected via number keys `1`-`5`:

| Mode | Key | Description |
|------|-----|-------------|
| **Gameplay** | 1 | Shows exactly what the selected player saw during the match |
| **Drone Follow** | 2 | Drone-style camera that keeps the selected player in frame; operator controls position |
| **Drone Attach** | 3 | Loosely attached drone; follows player but with inertia and lag for cinematic feel |
| **Drone Free** | 4 | Fully free-flying drone camera; fly anywhere on the island |
| **Orbit** | — | Orbits around the selected player at a fixed distance |

**Drone controls:**
- `WASD` — Horizontal movement
- `Q` / `E` — Height adjustment (up/down)
- Mouse — Pan / look direction
- `+` / `-` — Drone movement speed
- `R` — Reset camera behind subject

### 8.3 Cinematic / Lens Controls

The camera icon in the HUD opens lens settings:

- **Auto Exposure:** Toggle automatic brightness adjustment
- **Aperture:** Depth-of-field control; lower values create more background blur (bokeh)
- **Auto Focus:** Toggle automatic focus on the subject
- **Focal Length:** Adjustable for wide-angle to telephoto effects

A secondary settings menu (right bumper on controller) provides toggles for:

- Player nameplates on/off
- Player outlines on/off
- Damage numbers on/off
- Storm display on/off

These toggles enable clean cinematic shots without gameplay UI clutter.

### 8.4 Player Selection

- Cycle through players using the player list
- In Battle Royale, the POV of enemy players is available **only if they are within a 250m radius** of the local player during the original match. Beyond that radius, enemy positions are not recorded.
- Inventory, materials, and build counts are **not displayed** for enemy players.
- Health/shield values for enemies are shown as bars only, not numerical values.

### 8.5 Unique / Innovative Features

- **Drone camera system:** The multi-tier drone system (Follow, Attach, Free) is unique among the games surveyed. The "Attach" mode with inertia creates a documentary-style camera feel that no other game offers.
- **Lens simulation:** Aperture, focal length, and depth-of-field controls are borrowed from real cinematography. This makes Fortnite replays the best tool for creating cinematic content without external software.
- **Content creator focus:** The entire replay system is designed around screenshot and video capture, not analytical review. This is reflected in the lack of statistics overlays.

### 8.6 Common Player Complaints

1. **No video export:** Despite the cinematic tools, there is no built-in render-to-video feature. Players must use external screen capture (OBS, ShadowPlay, console capture).
2. **Replay expiry after updates:** Replays from previous game versions become invalid after patches.
3. **250m recording radius:** Enemy player data is only captured within 250m of the local player. This severely limits free-camera exploration away from the player's position.
4. **Platform limitations:** Replay mode is unavailable on Nintendo Switch and mobile.
5. **Console storage cap:** Console players can save only 10 replays; PC has unlimited storage.
6. **No statistics or analysis tools:** No damage breakdown, no material tracking, no build analysis. The system is purely visual.
7. **No sharing mechanism:** Replays cannot be sent to other players. Each player has only their own match replays.

### 8.7 Sharing / Export

- Replays are local-only. No replay files can be shared between players.
- No match ID system (unlike Dota 2).
- No built-in video export. Postparty (Epic-recommended third-party app) provides clipping.
- Screenshots can be taken in-game using the cinematic camera tools.

---

## 9. Cross-Game Comparison Matrix

### 9.1 Transport Controls

| Feature | SC2 | AoE2:DE | AoE2 CA | Dota 2 | CS2 | CoH3 | WC3:R | LoL | Fortnite |
|---------|-----|---------|---------|--------|-----|------|-------|-----|----------|
| Play/Pause | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Variable Speed | 8x max | 4x max | Multi | Multi | Unlimited | Console | 31x max | 8x max | Multi |
| Slow Motion | Yes | 0.5x | Yes | Yes | Any via timescale | Console | 1/32x | 0.25x | Yes |
| Rewind | 15s jump | No | Pro only | No | Via tick jump | No | No (restart) | 15s jump | No |
| Timeline Scrub | Viewed only | No | Pro only | Yes | Yes | No | No | Yes | Yes |
| Event Markers | Auto bookmarks | No | Bookmarks | Kills/objectives | Round markers | No | No | Kills/objectives/towers | Eliminations |
| Forward Seek | FF only | FF only | Click bar | Click bar | Tick/round jump | FF only | FF only | Click bar | Click bar |

### 9.2 Observer / Statistics Overlays

| Feature | SC2 | AoE2:DE | AoE2 CA | Dota 2 | CS2 | CoH3 | WC3:R | LoL | Fortnite |
|---------|-----|---------|---------|--------|-----|------|-------|-----|----------|
| Resource tracking | Full | Basic | Full | Full | N/A | Full | Basic | Gold only | None |
| APM display | Yes | No | geAPM | No | No | No | No (3rd party) | No | No |
| Production tab | Yes | No | No | N/A | N/A | Yes | No | N/A | N/A |
| Army composition | Yes | No | Yes | Yes | N/A | Yes | No | No | No |
| Income/Economy | Yes | Post-game | Full timeline | Yes | N/A | Yes | No | Gold graph | No |
| Kill tracking | Yes | Post-game | Yes | Yes | Kill feed | Yes | No | Yes | Eliminations |
| Unit lost tracking | Yes | Post-game | Yes | Yes | N/A | No | No | No | No |
| Post-game summary | Full | Score screen | Enhanced | Via 3rd party | None | Yes | None | Basic | None |

### 9.3 Camera Modes

| Feature | SC2 | AoE2:DE | AoE2 CA | Dota 2 | CS2 | CoH3 | WC3:R | LoL | Fortnite |
|---------|-----|---------|---------|--------|-----|------|-------|-----|----------|
| Free camera | Yes | Yes | Enhanced zoom | Yes | Yes (fly) | Yes | Yes | Yes | Drone Free |
| Player perspective | Yes | No | Yes | Yes | First-person | No | No | Yes | Gameplay mode |
| Unit/hero follow | Ctrl+F | No | Hotkey | Yes | Chase cam | Control groups | No | Double-click | Drone Follow/Attach |
| Directed/auto camera | No | No | No | Yes | No | No | No | Yes | No |
| FPS/cinematic camera | No | No | No | No | Free fly | No | No | FPS mode | Drone + lens controls |
| Fog of war toggle | Hold V | No | Yes | Yes | N/A (all visible) | 2 modes | Toggle | N/A | N/A |

### 9.4 Sharing & Export

| Feature | SC2 | AoE2:DE | Dota 2 | CS2 | CoH3 | WC3:R | LoL | Fortnite |
|---------|-----|---------|--------|-----|------|-------|-----|----------|
| File-based sharing | .SC2Replay | .aoe2record | Download via ID | .dem (GOTV) | File transfer | .w3g | .rofl (same patch) | None |
| Match ID sharing | No | No | Yes | No | No | No | No | No |
| Built-in video export | No | No | No | No | No | No | .webm clips | No |
| Cinematic tools | No | No (CA: limited) | No | No | No | No | League Director | Drone + lens |
| 3rd party ecosystem | sc2replaystats | CaptureAge | OpenDota, DOTABUFF | HLTV, SCOPE.GG | cohdb | warcraft3.info | ReplayBook | None |
| Cross-patch compat | Broken at 3.0 | Breaks each patch | N/A (server) | Generally stable | Breaks each patch | Changed at Reforged | Breaks each patch | Breaks each patch |

---

## 10. Key UX Patterns and Takeaways

### 10.1 What Players Love

1. **SC2's observer overlay system** is the most praised RTS replay feature. The hotkey-toggled panels (Production, Income, Army, APM, Units Lost) give viewers immediate access to deep analytical data without cluttering the screen.

2. **Dota 2's match ID sharing** is the simplest and most effective replay distribution system. One number, typed into the client, and you are watching the game. No file management, no downloads from external sites.

3. **LoL's annotated timeline** with contextual highlighting (brightening a champion's markers when you follow them) is an elegant interaction design that helps players find relevant moments without memorizing timestamps.

4. **CS2's tick-level precision** enables the most granular analysis of any game. Professional players and analysts rely on frame-exact reviewing for studying aim mechanics.

5. **Fortnite's drone camera system** with cinematic lens controls (aperture, focal length, depth of field) produces the best-looking replay footage of any game without requiring external tools.

6. **CaptureAge's worker efficiency metrics** (idle time breakdown, efficiency-per-minute) show that RTS replay tools can go far beyond basic resource graphs when designed for coaching and improvement.

7. **SC2's custom observer UI mod support** means the community can iterate on the observer experience independently of the game developer. This produced WCS Observer and AhliObs, which became esports broadcast standards.

### 10.2 What Players Hate

1. **Replay version incompatibility** is the single most universal complaint, affecting SC2, AoE2:DE, CoH3, WC3, LoL, and Fortnite. Command-log replay systems break when game balance changes alter simulation outcomes. Only Dota 2 (server-side, limited lifetime) and CS2 (generally stable) partially avoid this.

2. **No rewind in command-log systems.** AoE2:DE, CoH3, and WC3 have no rewind at all. SC2 and LoL offer only a 15-second jump-back. The fundamental issue is that command-log replays require re-simulation from a checkpoint to reach any earlier point.

3. **Progress bar spoiling outcomes** (SC2) and **timeline length revealing game duration** is an unsolved UX problem. No game offers a "spoiler-free" mode that hides the remaining time.

4. **Console-dependent features** (CS2, CoH3) hide powerful functionality behind a text interface that most players never discover.

5. **Replay expiry** (LoL every 2 weeks, Dota 2 limited server retention, Fortnite after updates) frustrates players who want to build permanent libraries of memorable games.

6. **No built-in video export** in any game except LoL's basic `.webm` clips. Every other game requires external screen capture software.

### 10.3 Architectural Implications for Iron Curtain

Based on this survey, a modern RTS replay system should consider:

1. **Periodic state snapshots during replay recording** to enable arbitrary seeking and true rewind without re-simulation from tick 0. This is the key technical enabler that separates good replay UX (SC2, Dota 2) from bad (AoE2:DE, WC3).

2. **Versioned replay format** with the simulation version embedded in the replay file. If the engine can load old simulation logic (or the simulation is deterministic and version-pinned), old replays remain playable.

3. **Event-annotated timeline** with kill markers, base destruction, tech transitions, and engagement intensity. LoL and Dota 2 prove this is essential for non-linear replay navigation.

4. **Hotkey-toggled overlay panels** following SC2's model: Production, Income, Army, APM, Units Lost. Each panel should be independently toggleable and positionable.

5. **Match ID or hash-based sharing** following Dota 2's model, integrated with the engine's networking layer.

6. **Built-in video/clip export** — even basic `.webm` export (like LoL) would put IC ahead of every other RTS.

7. **Spoiler-free mode** that hides the progress bar length, addresses an unmet need across all games surveyed.

8. **Moddable observer UI** following SC2's example, allowing community-created broadcast overlays.

---

## Sources

- [Liquipedia — StarCraft II Replay Features](https://liquipedia.net/starcraft2/Replay_Features)
- [GameReplays.org — StarCraft 2 Replay System Review](https://www.gamereplays.org/starcraft2/portals.php?show=page&name=starcraft2-replay-system-review)
- [Esportsvikings — StarCraft 2 Viewer Guide](https://www.esportsvikings.com/starcraft2/guides/sc2-viewer-guide)
- [Kotaku — StarCraft II's New Patch Won't Support Old Replays](https://kotaku.com/starcraft-iis-new-patch-wont-support-old-replays-1734891305)
- [AoE2 DE Forum — Replay Controls Discussion](https://forums.ageofempires.com/t/age-2-de-replay-controls/51749)
- [CaptureAge Wiki](https://ageofempires.fandom.com/wiki/CaptureAge_(tool))
- [CaptureAge Update Notes](https://captureage.com/cade/updates)
- [Age of Empires — CaptureAge Official Page](https://www.ageofempires.com/games/aoeiide/capture-age/)
- [Dota 2 Wiki — Replay](https://dota2.fandom.com/wiki/Replay)
- [Eloking — Dota 2 Replay Feature Explained](https://eloking.com/blog/dota-2-replay-feature-explained)
- [esports.gg — Dota 2 Replay System Gets a Buff](https://esports.gg/news/dota-2/replay-revulsion-editor-unhappy-with-changes-to-dota-2-replay-system/)
- [SCOPE.GG — How to Watch Demos in CS2](https://scope.gg/guides/cs2-demo-guide-en/)
- [tradeit.gg — CS2 Replay Controls Guide](https://tradeit.gg/blog/cs2-replay-controls/)
- [CSDB — Complete Guide to CS2 Demo Controls](https://csdb.gg/a-complete-guide-to-cs2-demo-controls/)
- [Company of Heroes — Introducing Replays](https://www.companyofheroes.com/en/post/introducing-replays)
- [GitHub — coh3-replay-enhancements](https://github.com/Janne252/coh3-replay-enhancements)
- [Blizzard Forums — WC3 Replay Viewer Needs Improvements](https://us.forums.blizzard.com/en/warcraft3/t/replay-viewer-needs-improvements/237)
- [Blizzard Forums — Improvements for Reforged Replay UI](https://us.forums.blizzard.com/en/warcraft3/t/improvements-for-reforged-replay-ui/33870)
- [classic.battle.net — Warcraft III Replays FAQ](http://classic.battle.net/war3/faq/replays.shtml)
- [League of Legends Wiki — Spectator Mode](https://leagueoflegends.fandom.com/wiki/Spectator_Mode)
- [League of Legends Wiki — Replay](https://leagueoflegends.fandom.com/wiki/Replay)
- [Riot Games — League Director (GitHub)](https://github.com/RiotGames/leaguedirector)
- [LoL 2017 Preseason — Replays and Practice](https://na.leagueoflegends.com/en/featured/preseason-2017/replays-and-practice)
- [Epic Games — Fortnite Battle Royale Replay System](https://www.fortnite.com/news/fortnite-battle-royale-replay-system)
- [Fortnite Wiki — Replay Client](https://fortnite.fandom.com/wiki/Replay_Client)
- [Hawk Live — Dota 2 Replay Guide](https://hawk.live/posts/dota-2-replay-guide)
- [GitHub — vault (CoH replay parser in Rust)](https://github.com/ryantaylor/vault)
