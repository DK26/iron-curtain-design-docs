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
- **MVP Awards** — Stat-based recognition cards highlighting top performers (see MVP Awards section below).
- **Rating update** — Tier badge animation if promoted/demoted. Delta shown.
- **Chat** — 30-second active period, auto-closes after 5 minutes.
- **Post-game learning** (D065) — Rule-based tip analyzing the match (e.g., idle harvesters, low APM, no control groups used). Links to tutorial or replay annotation.
- **Watch Replay** → Replay Viewer (immediate, file already recorded)
- **Save Replay** → Save `.icrep` file with metadata
- **Re-Queue** → Back to matchmaking queue (ranked)
- **Main Menu** → Return to main menu
- **Report Player** → Report dialog (reason dropdown, optional text)
- **Post-play feedback pulse** (optional, sampled) — quick "how was this?" prompt for mode/mod/campaign with skip/snooze controls

#### MVP Awards (Post-Game Recognition)

After every multiplayer match (skirmish, ranked, co-op, team), the post-game screen will display stat-based MVP award cards recognizing standout performance. These are auto-calculated from match data — no player voting required.

```
┌──────────────────────────────────────────────────────────────┐
│  MVP AWARDS                                                  │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 🏆 MVP      │  │ ⚔ Warlord   │  │ 💰 Tycoon   │         │
│  │ CommanderX  │  │ TankRush99  │  │ You         │         │
│  │ Score: 4820 │  │ 142 kills   │  │ $68,200     │         │
│  │             │  │ 23 K/D      │  │ harvested   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  Personal: 🛡 Iron Wall — lost only 12 units                │
└──────────────────────────────────────────────────────────────┘
```

**Award categories** — the engine selects 2–4 awards per match from the following categories, based on which stats are most exceptional relative to the match context. Not all awards appear every game — only standout performances are highlighted.

| Category | Award Name | Criteria |
|----------|-----------|----------|
| **Overall** | MVP | Highest composite score (weighted: economy + combat + production + map control) |
| **Economy** | Tycoon | Highest total resources harvested |
| | Efficient Commander | Best resource-to-army conversion ratio (least waste) |
| | Expansion Master | Fastest or most ore/refinery expansions |
| **Combat** | Warlord | Most enemy units destroyed |
| | Iron Wall | Best unit preservation (lowest units lost relative to army size) |
| | Tank Buster | Most enemy vehicles/armor destroyed |
| | Air Superiority | Most enemy aircraft destroyed or air-to-ground kills |
| | First Strike | First player to destroy an enemy unit |
| | Decimator | Largest single engagement (most units destroyed in one battle) |
| **Production** | War Machine | Most units produced |
| | Tech Rush | Fastest time to highest tech tier |
| | Builder | Most structures built |
| **Strategic** | Blitzkrieg | Fastest victory (shortest match duration, only in decisive wins) |
| | Map Control | Highest average map vision / territory control |
| | Spy Master | Most intelligence gathered (scout actions, radar coverage) |
| | Saboteur | Most enemy structures destroyed |
| **Team** (team games) | Best Wingman | Most assist actions (shared vision, resource transfers, combined attacks) |
| | Team Backbone | Highest resource sharing / support to allies |
| | Last Stand | Survived longest after allies were eliminated |
| **Co-op** (D070) | Mission Critical | Highest objective completion contribution |
| | Guardian Angel | Most successful support/extraction actions (Commander role) |
| | Shadow Operative | Most field objectives completed (SpecOps role) |
| **Fun / Flavor** | Overkill | Used superweapon when conventional forces would have sufficed |
| | Comeback King | Won after being behind by >50% army value |
| | Untouchable | Won without losing a single structure |
| | Turtle | Longest time before first attack |

**Award selection algorithm:**

1. After match ends, compute all stat categories for all players
2. For each category, check if any player's stat is significantly above the match average (threshold: top percentile relative to match context, not absolute values)
3. Select the top 2–4 most exceptional awards — prefer variety across categories (don't show 3 combat awards)
4. In 1v1: show 1–2 awards per player. In team games: show 3–4 total across all players. Overall MVP always shown if the match has 3+ players
5. Each player also sees a **personal award** (their single best stat) even if they didn't earn a match-wide award

**Design rules:**

- **No effect on ranked rating.** Awards are cosmetic recognition only — Glicko-2 rating changes are computed purely from win/loss (D055).
- **Profile-visible.** Award counts are tracked in the player profile (D053) — e.g., "MVP ×47, Tycoon ×23, Iron Wall ×15." Displayed as a stat line, not badges.
- **Moddable.** Award definitions are YAML-driven (`awards.yaml`): name, icon, stat formula, threshold, flavor text. Modders can add game-module-specific awards (e.g., Tiberian Dawn: "Nod Commander" for most stealth unit kills). Workshop-publishable.
- **Anti-farming.** Awards are only granted in matches that meet minimum thresholds: minimum match duration (>3 minutes), minimum opponent count/difficulty, and no early surrenders. AI-only matches grant awards but they are tagged as `vs-AI` in the profile and tracked separately.
- **Replay-linked.** Each award links to the replay moment that earned it (e.g., "Decimator" links to the tick of the largest battle). Clicking the award in the post-game screen jumps to that moment in the replay viewer.

#### Post-Play Feedback Prompt (Modes / Mods / Campaigns; Optional D049 + D053)

The post-game screen may show a **sampled, skippable** feedback prompt. It is designed to help mode/mod/campaign authors improve content without blocking normal post-game actions.

```
┌──────────────────────────────────────────────────────────────┐
│  HOW WAS THIS MATCH / MODE?                                 │
│                                                              │
│  Target: Commander & SpecOps (IC-native mode)               │
│  Optional mod in use: "Combined Arms v2.1"                  │
│                                                              │
│  Fun / Experience:  [★] [★] [★] [★] [★]                    │
│  Quick tags: [Fun] [Confusing] [Too fast] [Great co-op]     │
│                                                              │
│  Feedback (optional): [__________________________________]  │
│                                                              │
│  If sent to the author/community, constructive feedback may │
│  earn profile-only recognition if marked helpful.           │
│  (No gameplay or ranked bonuses.)                           │
│                                                              │
│  [Send Feedback] [Skip] [Snooze] [Don't Ask for This Mode]  │
└──────────────────────────────────────────────────────────────┘
```

**UX rules:**
- sampled/cooldown-based, not every match/session
- non-blocking: replay/save/requeue/main-menu actions remain available
- clearly labeled target (`mode`, `campaign`, `Workshop resource`)
- spoiler-safe defaults for campaign feedback prompts
- "helpful review" recognition wording is explicit about **profile-only** rewards

#### Report / Block / Avoid Player Dialog (D059 + D052 + D055)

The `Report Player` action (also available from lobby/player-list context menus) opens a compact moderation dialog with local safety controls and queue preferences in the same place, but with clear scope labels.

```
┌──────────────────────────────────────────────────────────────┐
│  REPORT PLAYER: Opponent                                    │
│                                                              │
│  Category: [Cheating ▾]                                      │
│  Note (optional): [Suspicious impossible scout timing...]    │
│                                                              │
│  Evidence to attach (auto):                                  │
│   ✓ Signed replay / match ID                                 │
│   ✓ Relay telemetry summary                                  │
│   ✓ Timestamps / event markers                               │
│                                                              │
│  Quick actions                                               │
│   [Mute Player]  (Local comms)                               │
│   [Block Player] (Local social)                              │
│   [Avoid Player] (Queue preference, best-effort)             │
│                                                              │
│  Reports are reviewed by the community server. Submission    │
│  does not guarantee punishment. False reports may be penalized│
│                                                              │
│  [Submit Report]  [Cancel]                                   │
└──────────────────────────────────────────────────────────────┘
```

**UX rules:**
- `Avoid Player` is labeled **best-effort** and links to ranked queue constraints (D055)
- `Mute`/`Block` remain usable without submitting a report
- Evidence is attached by reference/ID when possible (no unnecessary duplicate upload). The reporter does **not** see raw relay telemetry — only the moderation backend and reviewers with appropriate privileges access telemetry summaries.
- The dialog is available post-game, from scoreboard/player list, and from lobby profile/context menus

#### Community Review Queue (Optional D052 "Overwatch"-Style, Reviewer/Moderator Surface)

Eligible community reviewers (or moderators) may access an optional review queue if the community server enables D052's review capability. This is a **separate role surface** from normal player matchmaking UX.

```
┌──────────────────────────────────────────────────────────────┐
│  COMMUNITY REVIEW QUEUE (Official IC Community)             │
│  Reviewer: calibrated ✓   Weight: 0.84                      │
│                                                              │
│  Case: #2026-02-000123        Category: Suspected Cheating   │
│  State: In Review             Evidence: Replay + Telemetry   │
│  Anonymized Subject: Player-7F3A                             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Replay timeline (flagged markers)                     │  │
│  │ 12:14  suspicious scout timing                        │  │
│  │ 15:33  repeated impossible reaction window            │  │
│  │ 18:07  order-rate spike                               │  │
│  │ [Watch Clip] [Full Replay] [Telemetry Summary]        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Vote                                                        │
│  [Likely Clean] [Suspected Griefing] [Suspected Cheating]    │
│  [Insufficient Evidence] [Escalate]                          │
│  Confidence: [70 ▮▮▮▮▮▮▮□□□]                                 │
│  Notes (optional): [____________________________________]    │
│                                                              │
│  [Submit Vote]   [Skip Case]   [Reviewer Guide]             │
└──────────────────────────────────────────────────────────────┘
```

**Reviewer UI rules (D052/D037/`06-SECURITY`):**
- anonymized subject identity by default; identity resolution requires moderator privileges
- no direct "ban player" buttons in reviewer UI
- case verdicts feed consensus/moderator workflows; they do not apply irreversible sanctions directly
- calibration and reviewer-weight details are visible to the reviewer for transparency, but not editable
- audit logging records case assignment, replay access, and vote submission events

#### Moderator Case Resolution (Optional D052)

Moderator tools extend the reviewer surface with:
- identity resolution (subject + reporters) when needed
- consensus summary + reviewer agreement breakdown
- prior sanctions / community standing context
- action panel (warn, comms restriction, queue cooldown, low-priority queue, ranked suspension)
- appeal state management and case notes

This keeps the "Overwatch"-style layer useful for scaling review while preserving D037 moderator accountability for final enforcement.

#### Asymmetric Co-op Post-Game Breakdown (D070)

D070 matches add a role-aware breakdown tab/card to the post-game screen:

- **Commander support efficiency**
  - requests answered / denied / timed out
  - average request response time
  - support impact events (e.g., CAS confirmed kills, successful extraction)
- **SpecOps objective execution**
  - field objectives completed
  - infiltration/sabotage/rescue success rate
  - squad survival / losses / requisition spend
- **War-effort impact categories**
  - economy gains/denials
  - power/tech disruptions
  - route/bridge/expansion unlock events
  - superweapon delay / denial events
- **Joint coordination highlights** (optional)
  - moments where Field Ops objective completion unlocked a commander push (segment unlock, AA disable, radar outage)

This reinforces the mode's cooperative identity and provides actionable learning without forcing competitive scoring semantics onto a PvE-first mode.

#### Experimental Survival Post-Game Breakdown (D070-adjacent `Last Commando Standing` / `SpecOps Survival`) — Proposal-Only

D070-adjacent survival matches (proposal-only, `M10+`, `P-Optional`) add a placement- and objective-focused breakdown so players understand **why** they survived (or were eliminated), not just who got the last hit.

```
┌──────────────────────────────────────────────────────────────┐
│  LAST COMMANDO STANDING — 2nd PLACE / 8 Teams               │
│  Iron Wastes — 18:42                                        │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ SURVIVAL SUMMARY                                      │  │
│  │ Team Eliminations: 3      Squad Losses: 7            │  │
│  │ Hazard Escapes: 5         Final Hazard Phase: 6      │  │
│  │ Objective Captures: 4     Redeploy Tokens Used: 1    │  │
│  │ Requisition Spent: 1,240  Unspent: 180              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  KEY OBJECTIVE IMPACTS                                        │
│  • Captured Tech Uplink → Recon Sweep unlocked (Phase 3)     │
│  • Destroyed Bridge → Forced Team Delta into hazard lane     │
│  • Failed Power Relay Hold → Lost safe corridor window       │
│                                                              │
│  ELIMINATION CONTEXT                                           │
│  Phase 6 chrono contraction + enemy ambush near Depot C      │
│  [Watch Replay] [View Timeline] [Save Replay] [Main Menu]     │
└──────────────────────────────────────────────────────────────┘
```

**Survival breakdown focus (prototype-first):**
- **Placement + elimination context** (where/how the run ended)
- **Objective contesting and reward impact** (what captures actually changed)
- **Hazard pressure stats** (escapes, hazard-phase survival, hazard-caused vs combat-caused losses)
- **Squad/redeploy usage** (downs, revives/redeploys, token efficiency)
- **Field progression spend** (what upgrades/support buys were used)

This keeps the D070-adjacent survival mode readable and learnable without forcing a generic battle-royale scoreboard style onto an RTS-flavored commando mode.
