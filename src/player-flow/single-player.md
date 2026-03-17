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
│  │ 5/14 (36%)  │  │ 2/14 (14%)  │  │             │     │
│  │ Best: 9/14  │  │ Best: 3/14  │  │             │     │
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
│                         [Review Settings ⚙]              │
└──────────────────────────────────────────────────────────┘
```

**Campaign default settings (D021):** Campaigns ship a `default_settings` block in their YAML definition — the author's baked-in configuration for difficulty, experience axes (D019/D032/D033/D043/D045/D048), and individual toggle overrides. When the player selects a campaign:

- **Difficulty** and **Experience** dropdowns are pre-populated from the campaign's `default_settings`. If the campaign defines no defaults, the player's global preferences apply.
- **[Review Settings]** opens a panel showing every active toggle (grouped by category: production, commands, UI, gameplay). Each switch shows the campaign's default value; the player can flip individual toggles before starting. Changes are per-playthrough — they don't alter the player's global preferences.
- The first-party Allied/Soviet campaigns use `vanilla` + `classic` defaults (authentic 1996 feel). Community campaigns set whatever their author intends.
- If a player changes settings from the campaign's defaults, the post-game comparison (D052/D053) groups their run separately from players who kept the defaults — ensuring fair benchmarks.

**Navigation paths from this screen:**

| Action                                                    | Destination                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| New Game (Allied/Soviet)                                  | Campaign Graph → first mission briefing                                   |
| Continue (Allied/Soviet)                                  | Campaign Graph → next available mission                                   |
| Workshop Campaigns                                        | Workshop Browser (filtered to campaigns)                                    |
| Commander School                                          | Tutorial campaign (D065, 6 branching missions)                              |
| Ops Prologue *(optional / D070 validation mini-campaign)* | Campaign Browser / Featured (when enabled)                                  |
| Generative Campaign                                       | Generative Campaign Setup (D016) — or guidance panel if no LLM configured |
| ← Back                                                  | Main Menu                                                                   |

### Campaign Graph

```
Campaign Selection → [New Game] or [Continue]
```

The campaign graph is a visual world map (or node-and-edge graph for community campaigns) showing mission progression. Completed missions are solid, available missions pulse, locked missions are dimmed. If multiple branches are currently available, or an urgent pending mission such as a rescue remains open for a bounded window, the map/intermission view shows all available nodes and highlights the urgent one rather than auto-selecting for the player.

For first-party campaigns, this screen is also the **strategic layer** of the campaign, not just a mission picker. It should tell the player:

- which fronts are active
- which operations are available now
- which ones are urgent or expiring
- which ones are recoverable versus truly critical
- what concrete assets have already been earned
- what happens if the player ignores an available operation

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
│  Campaign Stats: 3/14 complete (21%)  Time: 2h 15m       │
│  Current Path: 4   Best Path: 6   Endings: 0/2           │
│  [Details ▾] [Community Benchmarks ▾]                    │
└──────────────────────────────────────────────────────────┘
```

**Flow:** Select a node → Mission Briefing screen → click "Begin Mission" → Loading → InGame. After mission: Debrief → next node unlocks on graph.

**Strategic-layer surfaces for authored campaigns:**

- **Role tags** on mission nodes or operation cards: `MAIN`, `SPECOPS`, `THEATER`
- **Criticality tags**: `RECOVERABLE`, `CRITICAL`, `RESCUE`, `TIMED`
- **Source tag**: `AUTHORED` or `GENERATED` for campaigns that mix handcrafted set pieces with generated SpecOps
- **Reward preview**: concrete outputs such as `2 Super Tanks added in M14`, `No Sarin shelling in M8`, `M6 east service entrance unlocked`
- **Reveal / unlock preview**: concrete follow-up cards such as `Reveals Spy Network`, `Unlocks Chrono Convoy Intercept`, `Opens Poland follow-up chain`
- **Fail preview**: concrete attempt-failure results such as `Tanya captured`, `M6 infiltration runs blind`, `Campaign ends if Moscow holds`
- **Ignore preview**: concrete non-selection losses such as `Siberian window closes`, `M5 rescue branch does not open in time`, `Enemy air-fuel bombs remain active in M14`
- **Front status panel**: Greece, Siberia, Poland, Italy, England, or other authored theaters
- **Asset ledger**: prototypes, resistance favor, rescued heroes, denied enemy tech, air/naval packages
- **Urgency markers**: rescue pending, enemy project nearing completion, expiring operation windows

**Failure-forward expectation:**

- Most campaign missions are **recoverable**. Defeat branches to a fallback state or harder continuation instead of hard-failing the run.
- Missions that can truly end the campaign must be explicitly marked **CRITICAL** on both the graph and the briefing screen.
- Optional SpecOps should show whether failure is recoverable, whether the mission can be postponed, and what is lost by skipping it.

### Mission Briefing

```
Campaign Graph → select mission → Mission Briefing
```

The mission briefing is where the player commits. It should not just restate story context; it should answer whether the mission is critical, what success gives, and what failure costs.

```
┌──────────────────────────────────────────────────────────┐
│  BEHIND ENEMY LINES                        [← Back]      │
│  Tags: [SPECOPS] [TIMED] [RECOVERABLE] [GENERATED]      │
│                                                          │
│  Objective Summary                                       │
│  Tanya infiltrates a Soviet research site and steals     │
│  Iron Curtain access codes before the evacuation window  │
│  closes.                                                 │
│                                                          │
│  On Success                                              │
│  • M6 east service entrance unlocked                     │
│  • First alarm delayed by 90 seconds                     │
│  • Spy Network operation revealed on the world screen    │
│                                                          │
│  On Failure                                              │
│  • Tanya may be captured                                 │
│  • M6 loses the service-entrance route                   │
│                                                          │
│  If Skipped                                              │
│  • Soviet site hardens and the raid window closes        │
│  • M6 loses the service-entrance route                   │
│                                                          │
│  Time Window                                             │
│  • Must be chosen during the current Act 1 decision      │
│    window                                                │
│                                                          │
│                 [Begin Mission] [Compare Other Ops]      │
└──────────────────────────────────────────────────────────┘
```

**Briefing disclosure rules:**

- **Critical missions** must show a prominent `CRITICAL` badge plus a plain-language failure line such as `Campaign ends on defeat`.
- **Recoverable missions** should show the fallback expectation explicitly: `Defeat branches to a harder continuation` or `Rescue branch opens`.
- **Expiring-opportunity save policy** should be explicit. First-party campaigns allow normal saving/reloading by default; `Ironman` or other commit modes autosave immediately after the choice and warn that the branch is now locked.
- **SpecOps missions** should show `On Success`, `On Failure`, `If Skipped`, and `Time Window` sections whenever those states differ.
- **SpecOps intel missions** should also show if success reveals or unlocks a new commander-facing operation on the strategic map.
- **Generated SpecOps missions** should also show their theater / site context (`Generated from: Polish rail yard`, `Generated from: Soviet prison compound`) so the operation reads as a deliberate war target, not a random skirmish.
- If multiple operations are available, the player should be able to back out and compare them without losing context or triggering the timer simply by opening a briefing.

**Branching-safe progress display (D021):**
- `Progress` defaults to **unique missions completed / total missions in graph**.
- `Current Path` and `Best Path` are shown separately because "farthest mission reached" is ambiguous in branching campaigns.
- For linear campaigns, the UI may simplify this to a single `Missions: X / Y` line.

**Optional community benchmarks (D052/D053, opt-in):**
- Hidden unless the player enables campaign comparison sharing in profile/privacy settings.
- Normalized by **campaign version + difficulty + balance preset**.
- Spoiler-safe by default (no locked mission names/hidden ending names before discovery).
- Example summary: `Ahead of 62% (Normal, IC Default)` and `Average completion: 41%`.
- Benchmark cards show a trust/source badge (for example `Local Aggregate`, `Community Aggregate`, `Community Aggregate ✓ Verified`).

**Campaign transitions** (D021): Briefing → mission → debrief → next mission. No exit-to-menu between levels unless the player explicitly presses Escape. The debrief screen loads instantly (no black screen), and the next mission's briefing runs concurrently with background asset loading.

Cutscene intros/outros may be authored as either:
- **Video cutscenes** (classic FMV path: `Video Playback`)
- **Rendered cutscenes** (real-time in-engine path: `Cinematic Sequence`)

If a **video cutscene** exists and the player's preferred cutscene variant (Original / Clean Remaster / AI Enhanced) is installed, that version can play while assets load — by the time the cutscene ends, the mission is typically ready. If the preferred variant is missing, IC falls back to another installed cutscene variant (preferably Original) before falling back to the mission's briefing/intermission presentation.

If the selected cutscene/dub package does not support the player's preferred spoken or subtitle language, IC must offer a clear fallback choice (for example: `Use Original Audio + Preferred Subtitles`, `Use Secondary Subtitle Language`, or `Use Briefing Fallback`). Any machine-translated subtitle/CC fallback, if enabled in later phases, must be clearly labeled and remain opt-in.

If a **rendered cutscene** is used between missions, it runs once the required scene assets are available (and may itself be the authored transition presentation). Campaign authors must provide a fallback-safe briefing/intermission presentation path so missing optional media/visual dependencies never hard-fail progression.

The only loading bar appears on cold start or unusually large asset loads, and even then it's campaign-themed.

**Cutscene modes (D038/D048, explicit distinction):**
- **Video cutscenes (FMV)** and **rendered cutscenes (real-time in-engine)** are different authoring paths and can both be used between missions or during missions.
- `M6` baseline supports FMV plus rendered cutscenes in `world` and `fullscreen` presentation.
- Rendered cutscenes can be authored as **trigger-driven camera scenes** (OFP-style property-driven trigger conditions + camera shot presets over `Cinematic Sequence` data), so common mission reveals and dialogue pans do not require Lua.
- Rendered `radar_comm` / `picture_in_picture` cutscene presentation targets are part of the phased D038 advanced authoring path (`M10`), with render-mode preference/policy polish tied to D048 visual infrastructure (`M11`).

**Hero campaigns (optional D021 hero toolkit):** A campaign node may chain `Debrief → Hero Sheet / Skill Choice → Armory/Roster → Briefing → Begin Mission` without leaving the campaign flow. These screens appear only when the campaign enables hero progression; classic campaigns keep the simpler debrief/briefing path.

**Commander rescue bootstrap (optional D021 + D070 pattern, planned for `M10`):** A campaign/mini-campaign may begin with a **SpecOps rescue mission** where command/building systems are intentionally restricted because the commander is captured or missing. On success, the campaign sets a flag (for example `commander_recovered = true`) and subsequent missions unlock commander-avatar presence, broader unit coordination, base construction/production, and commander support powers. The UI should state both the restriction and the unlock explicitly so this reads as narrative progression, not a missing feature.

**D070 proving mini-campaign ("Ops Prologue", optional, planned for `M10`):** A short mini-campaign may double as both a player-facing experience and a mode-validation vertical slice for `Commander & SpecOps`: Mission 1 teaches SpecOps rescue/infiltration, Mission 2 unlocks limited commander support/building, and Mission 3+ runs the full Commander + SpecOps loop. If exposed to players, the UI should label it clearly as a mini-campaign / prologue (not the only way to play D070 modes).

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
│  │ Coastal Fortress        │  │ 2. Col. Volkov (Hard)  [▾]    │ │
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
- **Add AI** → commander picker (named persona with portrait + specialization, or unnamed preset) → difficulty (Easy/Medium/Hard/Brutal) → faction
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
