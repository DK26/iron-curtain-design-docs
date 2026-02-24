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
