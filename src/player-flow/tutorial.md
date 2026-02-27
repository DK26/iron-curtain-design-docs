## Tutorial & New Player Experience

The tutorial system (D065) has five layers that integrate throughout the flow rather than existing as a single screen:

### Layer 1 — Commander School

```
Main Menu → Campaign → Commander School
```

A focused 6-mission tutorial campaign using the D021 branching graph system, structured around **dopamine-first design**: achievement first, theory second. The player blows things up in mission 01 (learning camera and selection *during* combat), then builds because they want more units, then learns economy because they ran out of money. Boring fundamentals are taught *between* exciting moments, never as prerequisites.

The tutorial covers only the basics — navigation, core features, buttons, and shortcuts. Unit counters, defense strategy, tech tree exploration, superweapons, and advanced tactics are deliberately left for the player to discover through skirmish and multiplayer.

Each mission also weaves in **IC-specific features** that have no equivalent in classic Red Alert — attack-move, rally points, parallel factories, unit stances, weather effects, veterancy, smart box-select, and render mode toggle. Hint wording adapts by experience profile: veterans see "IC adds rally points" while newcomers see "Right-click to set a rally point." This ensures returning RA players understand what's *different* while newcomers learn everything fresh.

**Mission flow (dopamine-first order):**

| # | Mission | Dopamine Moment | Fundamental Taught | IC Feature Woven In |
|---|---------|----------------|-------------------|---------------------|
| 01 | First Blood | Explosions in 30 seconds | Camera, selection, attack | Attack-move |
| 02 | Build Your Army | Deploying units you built | Construction, power, production | Rally points, parallel factories |
| 03 | Supply Line | First ore delivery | Economy, harvesting | Smart box-select |
| 04 | Command & Control | Multi-group attack feels effortless | Control groups, hotkeys, bookmarks | Unit stances, render toggle (F1) |
| 05 | Iron Curtain Rising | Winning a real skirmish | Everything integrated (capstone) | Weather effects, veterancy |
| 06 | Multiplayer Intro | First online interaction | Lobbies, chat, etiquette | Balance presets, experience profiles |

Every mission awards an achievement on completion (D036). Branching allows skipping known topics. Tutorial AI opponents are below Easy difficulty. The campaign content is shared across desktop and touch platforms; prompt wording and UI highlights adapt to `InputCapabilities`/`ScreenClass`. The tutorial teaches game mechanics, gameplay, options, buttons, and shortcuts — everything else is for the player to discover through play.

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

YAML-driven triggers, adaptive suppression (hints shown less frequently as the player demonstrates mastery), experience-profile-aware (different hints for vanilla vs. OpenRA vs. Remastered veterans). A dedicated **IC new features** hint category surfaces IC-specific mechanics (rally points, attack-move, unit stances, weather, veterancy, parallel factories, smart selection, render toggle) at point of need — enabled by default for all profiles including veterans. Hint text is rendered from semantic action prompts, so desktop can say "Right-click to move" while touch devices render "Tap ground to move" for the same hint definition.

**Feature Smart Tips:** The same Layer 2 hint pipeline extends to non-gameplay screens — Workshop, Settings, Player Profile, and Main Menu — using UI-context triggers (`ui_screen_enter`, `ui_element_focus`, `ui_screen_idle`, `ui_feature_unused`). These tips explain features in plain language for users encountering them for the first time: what Workshop categories mean, how mod profiles work, what experience profiles do, etc. A dedicated `feature_discovery` hint category (default On for all profiles) replaces the old milestone-based Progressive Feature Discovery system. See D065 § Feature Smart Tips for the full YAML catalog.

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

**Controls Quick Reference (always available):** A compact, searchable controls reference is accessible during gameplay, from Pause/Escape, and from `Settings → Controls`. It uses the same semantic action catalog as D065 prompts, so desktop, controller/Deck, and touch players see the correct input wording/icons for the active profile without separate documentation trees.

**Controls-Changed Walkthrough (one-time after updates):** If a patch changes control defaults, official input profile mappings, or touch HUD/gesture behavior, the next launch can show a short "What's Changed in Controls" walkthrough before the main menu (skippable, replayable from `Settings → Controls`). It highlights only changed actions and links to the Controls Quick Reference / Commander School refresher.

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
