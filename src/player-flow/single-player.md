## Single Player

### Campaign Selection

```
Main Menu â†’ Campaign
```

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  CAMPAIGNS                                    [â† Back]   â”‚
â”‚                                                          â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”‚
â”‚  â”‚  [Allied    â”‚  â”‚  [Soviet    â”‚  â”‚ [Community  â”‚     â”‚
â”‚  â”‚   Flag]     â”‚  â”‚   Flag]     â”‚  â”‚  Campaigns] â”‚     â”‚
â”‚  â”‚             â”‚  â”‚             â”‚  â”‚             â”‚     â”‚
â”‚  â”‚  ALLIED     â”‚  â”‚  SOVIET     â”‚  â”‚  WORKSHOP   â”‚     â”‚
â”‚  â”‚  CAMPAIGN   â”‚  â”‚  CAMPAIGN   â”‚  â”‚  CAMPAIGNS  â”‚     â”‚
â”‚  â”‚             â”‚  â”‚             â”‚  â”‚             â”‚     â”‚
â”‚  â”‚ Missions:14 â”‚  â”‚ Missions:14 â”‚  â”‚ Browse â†’    â”‚     â”‚
â”‚  â”‚ 5/14 (36%)  â”‚  â”‚ 2/14 (14%)  â”‚  â”‚             â”‚     â”‚
â”‚  â”‚ Best: 9/14  â”‚  â”‚ Best: 3/14  â”‚  â”‚             â”‚     â”‚
â”‚  â”‚ [New Game]  â”‚  â”‚ [New Game]  â”‚  â”‚             â”‚     â”‚
â”‚  â”‚ [Continue]  â”‚  â”‚ [Continue]  â”‚  â”‚             â”‚     â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â”‚
â”‚                                                          â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                       â”‚
â”‚  â”‚ [Commander  â”‚  â”‚ [Generative â”‚                       â”‚
â”‚  â”‚  School]    â”‚  â”‚  Campaign]  â”‚                       â”‚
â”‚  â”‚             â”‚  â”‚             â”‚                       â”‚
â”‚  â”‚  TUTORIAL   â”‚  â”‚  AI-CREATED â”‚                       â”‚
â”‚  â”‚  10 lessons â”‚  â”‚  (BYOLLM)   â”‚                       â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                       â”‚
â”‚                                                          â”‚
â”‚  Difficulty: [Cadet â–¾]  Experience: [IC Default â–¾]       â”‚
â”‚                         [Review Settings âš™]              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Campaign default settings (D021):** Campaigns ship a `default_settings` block in their YAML definition â€” the author's baked-in configuration for difficulty, experience axes (D019/D032/D033/D043/D045/D048), and individual toggle overrides. When the player selects a campaign:

- **Difficulty** and **Experience** dropdowns are pre-populated from the campaign's `default_settings`. If the campaign defines no defaults, the player's global preferences apply.
- **[Review Settings]** opens a panel showing every active toggle (grouped by category: production, commands, UI, gameplay). Each switch shows the campaign's default value; the player can flip individual toggles before starting. Changes are per-playthrough â€” they don't alter the player's global preferences.
- The first-party Allied/Soviet campaigns use `vanilla` + `classic` defaults (authentic 1996 feel). Community campaigns set whatever their author intends.
- If a player changes settings from the campaign's defaults, the post-game comparison (D052/D053) groups their run separately from players who kept the defaults â€” ensuring fair benchmarks.

**Navigation paths from this screen:**

| Action                                                    | Destination                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| New Game (Allied/Soviet)                                  | Campaign Graph â†’ first mission briefing                                   |
| Continue (Allied/Soviet)                                  | Campaign Graph â†’ next available mission                                   |
| Workshop Campaigns                                        | Workshop Browser (filtered to campaigns)                                    |
| Commander School                                          | Tutorial campaign (D065, 6 branching missions)                              |
| Ops Prologue *(optional / D070 validation mini-campaign)* | Campaign Browser / Featured (when enabled)                                  |
| Generative Campaign                                       | Generative Campaign Setup (D016) â€” or guidance panel if no LLM configured |
| â† Back                                                  | Main Menu                                                                   |

### Campaign Graph

```
Campaign Selection â†’ [New Game] or [Continue]
```

The campaign graph is a visual world map (or node-and-edge graph for community campaigns) showing mission progression. Completed missions are solid, available missions pulse, locked missions are dimmed.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ALLIED CAMPAIGN                             [â† Back]    â”‚
â”‚  Operation: Allies Reunited                              â”‚
â”‚                                                          â”‚
â”‚          â”Œâ”€â”€â”€â”                                           â”‚
â”‚          â”‚ 1 â”‚ â† Completed (solid)                       â”‚
â”‚          â””â”€â”¬â”€â”˜                                           â”‚
â”‚        â”Œâ”€â”€â”€â”´â”€â”€â”€â”                                         â”‚
â”‚     â”Œâ”€â”€â”´â”€â”€â” â”Œâ”€â”€â”´â”€â”€â”                                     â”‚
â”‚     â”‚ 2a  â”‚ â”‚ 2b  â”‚ â† Branching (based on mission 1     â”‚
â”‚     â””â”€â”€â”¬â”€â”€â”˜ â””â”€â”€â”¬â”€â”€â”˜    outcome)                          â”‚
â”‚        â””â”€â”€â”€â”¬â”€â”€â”€â”˜                                         â”‚
â”‚         â”Œâ”€â”€â”´â”€â”€â”                                          â”‚
â”‚         â”‚  3  â”‚ â† Next available (pulsing)               â”‚
â”‚         â””â”€â”€â”¬â”€â”€â”˜                                          â”‚
â”‚            Â·                                             â”‚
â”‚            Â· (locked missions dimmed below)              â”‚
â”‚                                                          â”‚
â”‚  Unit Roster: 12 units carried over                      â”‚
â”‚  [View Roster]  [View Heroes]  [Mission Briefing â†’]      â”‚
â”‚                                                          â”‚
â”‚  Campaign Stats: 3/14 complete (21%)  Time: 2h 15m       â”‚
â”‚  Current Path: 4   Best Path: 6   Endings: 0/2           â”‚
â”‚  [Details â–¾] [Community Benchmarks â–¾]                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Flow:** Select a node â†’ Mission Briefing screen â†’ click "Begin Mission" â†’ Loading â†’ InGame. After mission: Debrief â†’ next node unlocks on graph.

**Branching-safe progress display (D021):**
- `Progress` defaults to **unique missions completed / total missions in graph**.
- `Current Path` and `Best Path` are shown separately because "farthest mission reached" is ambiguous in branching campaigns.
- For linear campaigns, the UI may simplify this to a single `Missions: X / Y` line.

**Optional community benchmarks (D052/D053, opt-in):**
- Hidden unless the player enables campaign comparison sharing in profile/privacy settings.
- Normalized by **campaign version + difficulty + balance preset**.
- Spoiler-safe by default (no locked mission names/hidden ending names before discovery).
- Example summary: `Ahead of 62% (Normal, IC Default)` and `Average completion: 41%`.
- Benchmark cards show a trust/source badge (for example `Local Aggregate`, `Community Aggregate`, `Community Aggregate âœ“ Verified`).

**Campaign transitions** (D021): Briefing â†’ mission â†’ debrief â†’ next mission. No exit-to-menu between levels unless the player explicitly presses Escape. The debrief screen loads instantly (no black screen), and the next mission's briefing runs concurrently with background asset loading.

Cutscene intros/outros may be authored as either:
- **Video cutscenes** (classic FMV path: `Video Playback`)
- **Rendered cutscenes** (real-time in-engine path: `Cinematic Sequence`)

If a **video cutscene** exists and the player's preferred cutscene variant (Original / Clean Remaster / AI Enhanced) is installed, that version can play while assets load â€” by the time the cutscene ends, the mission is typically ready. If the preferred variant is missing, IC falls back to another installed cutscene variant (preferably Original) before falling back to the mission's briefing/intermission presentation.

If the selected cutscene/dub package does not support the player's preferred spoken or subtitle language, IC must offer a clear fallback choice (for example: `Use Original Audio + Preferred Subtitles`, `Use Secondary Subtitle Language`, or `Use Briefing Fallback`). Any machine-translated subtitle/CC fallback, if enabled in later phases, must be clearly labeled and remain opt-in.

If a **rendered cutscene** is used between missions, it runs once the required scene assets are available (and may itself be the authored transition presentation). Campaign authors must provide a fallback-safe briefing/intermission presentation path so missing optional media/visual dependencies never hard-fail progression.

The only loading bar appears on cold start or unusually large asset loads, and even then it's campaign-themed.

**Cutscene modes (D038/D048, explicit distinction):**
- **Video cutscenes (FMV)** and **rendered cutscenes (real-time in-engine)** are different authoring paths and can both be used between missions or during missions.
- `M6` baseline supports FMV plus rendered cutscenes in `world` and `fullscreen` presentation.
- Rendered cutscenes can be authored as **trigger-driven camera scenes** (OFP-style property-driven trigger conditions + camera shot presets over `Cinematic Sequence` data), so common mission reveals and dialogue pans do not require Lua.
- Rendered `radar_comm` / `picture_in_picture` cutscene presentation targets are part of the phased D038 advanced authoring path (`M10`), with render-mode preference/policy polish tied to D048 visual infrastructure (`M11`).

**Hero campaigns (optional D021 hero toolkit):** A campaign node may chain `Debrief â†’ Hero Sheet / Skill Choice â†’ Armory/Roster â†’ Briefing â†’ Begin Mission` without leaving the campaign flow. These screens appear only when the campaign enables hero progression; classic campaigns keep the simpler debrief/briefing path.

**Commander rescue bootstrap (optional D021 + D070 pattern, planned for `M10`):** A campaign/mini-campaign may begin with a **SpecOps rescue mission** where command/building systems are intentionally restricted because the commander is captured or missing. On success, the campaign sets a flag (for example `commander_recovered = true`) and subsequent missions unlock commander-avatar presence, broader unit coordination, base construction/production, and commander support powers. The UI should state both the restriction and the unlock explicitly so this reads as narrative progression, not a missing feature.

**D070 proving mini-campaign ("Ops Prologue", optional, planned for `M10`):** A short mini-campaign may double as both a player-facing experience and a mode-validation vertical slice for `Commander & SpecOps`: Mission 1 teaches SpecOps rescue/infiltration, Mission 2 unlocks limited commander support/building, and Mission 3+ runs the full Commander + SpecOps loop. If exposed to players, the UI should label it clearly as a mini-campaign / prologue (not the only way to play D070 modes).

### Skirmish Setup

```
Main Menu â†’ Skirmish
```

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  SKIRMISH                                       [â† Back]     â”‚
â”‚                                                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ MAP                     â”‚  â”‚ PLAYERS                    â”‚ â”‚
â”‚  â”‚ [map preview image]     â”‚  â”‚                            â”‚ â”‚
â”‚  â”‚                         â”‚  â”‚ 1. You (Allied) [color â–¾]  â”‚ â”‚
â”‚  â”‚ Coastal Fortress        â”‚  â”‚ 2. AI Easy (Soviet) [â–¾]    â”‚ â”‚
â”‚  â”‚ 2-4 players, 128Ã—128   â”‚  â”‚ 3. [Add AI...]             â”‚ â”‚
â”‚  â”‚                         â”‚  â”‚ 4. [Add AI...]             â”‚ â”‚
â”‚  â”‚ [Change Map]            â”‚  â”‚                            â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ GAME SETTINGS                                        â”‚   â”‚
â”‚  â”‚                                                      â”‚   â”‚
â”‚  â”‚ Balance:     [IC Default â–¾]   Game Speed: [Normal â–¾] â”‚   â”‚
â”‚  â”‚ Pathfinding: [IC Default â–¾]   Starting $:  [10000 â–¾] â”‚   â”‚
â”‚  â”‚ Fog of War:  [Shroud â–¾]       Tech Level: [Full â–¾]   â”‚   â”‚
â”‚  â”‚ Crates:      [On â–¾]           Short Game: [Off â–¾]    â”‚   â”‚
â”‚  â”‚                                                      â”‚   â”‚
â”‚  â”‚ AI Preset:   [IC Default â–¾]   AI Difficulty: [â–¾]     â”‚   â”‚
â”‚  â”‚ [More options...]                                     â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                                              â”‚
â”‚  Experience Profile: [IC Default â–¾]                          â”‚
â”‚                                                              â”‚
â”‚                        [Start Game]                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Key interactions:**

- **Change Map** â†’ opens map browser (thumbnails, filters by size/players/theater, search)
- **Add AI** â†’ dropdown: difficulty (Easy/Medium/Hard/Brutal) Ã— AI preset (Classic/OpenRA/IC Default) Ã— faction
- **More options** â†’ expands full D033 toggle panel (sim-affecting toggles for this match)
- **Experience Profile** dropdown â†’ one-click preset that sets balance + AI + pathfinding + theme
- **Start Game** â†’ Loading â†’ InGame

Settings persist between sessions. "Start Game" with last-used settings is a two-click path from the main menu.

### Generative Campaign Setup

```
Main Menu â†’ Campaign â†’ Generative Campaign
```

If no LLM provider is configured, this screen shows the No Dead-End Button guidance (D033/D016):

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  GENERATIVE CAMPAIGNS                        [â† Back]    â”‚
â”‚                                                          â”‚
â”‚  Generative campaigns use an LLM to create unique        â”‚
â”‚  missions tailored to your play style.                   â”‚
â”‚                                                          â”‚
â”‚  [Configure LLM Provider â†’]                              â”‚
â”‚  [Browse Pre-Generated Campaigns on Workshop â†’]          â”‚
â”‚  [Use Built-in Mission Templates (no LLM needed) â†’]     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

If an LLM is configured, the setup screen (D016 Â§ "Step 1 â€” Campaign Setup"):

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  NEW GENERATIVE CAMPAIGN                     [â† Back]    â”‚
â”‚                                                          â”‚
â”‚  Story style:        [C&C Classic â–¾]                     â”‚
â”‚  Faction:            [Soviet â–¾]                          â”‚
â”‚  Campaign length:    [Medium (8-12 missions) â–¾]          â”‚
â”‚  Difficulty curve:   [Steady Climb â–¾]                    â”‚
â”‚  Theater:            [European â–¾]                        â”‚
â”‚                                                          â”‚
â”‚  [â–¸ Advanced...]                                         â”‚
â”‚    Mission variety targets, era constraints, roster       â”‚
â”‚    persistence rules, narrative tone, etc.               â”‚
â”‚                                                          â”‚
â”‚                    [Generate Campaign]                    â”‚
â”‚                                                          â”‚
â”‚  Using: GPT-4o via OpenAI   Estimated time: ~45s         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

"Generate Campaign" â†’ generation progress â†’ Campaign Graph (same graph UI as hand-crafted campaigns).
