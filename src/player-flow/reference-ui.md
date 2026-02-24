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

