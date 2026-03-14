## D065: Tutorial & New Player Experience — Five-Layer Onboarding System

|                |                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                  |
| **Phase**      | Phase 3 (contextual hints, new player pipeline, progressive discovery), Phase 4 (Commander School campaign, skill assessment, post-game learning, tutorial achievements)                                                                                                                  |
| **Depends on** | D004 (Lua Scripting), D021 (Branching Campaigns), D033 (QoL Toggles — experience profiles), D034 (SQLite — hint history, skill estimate), D036 (Achievements), D038 (Scenario Editor — tutorial modules), D043 (AI Behavior Presets — tutorial AI tier)                                   |
| **Driver**     | OpenRA's new player experience is a wiki link to a YouTube video. The Remastered Collection added basic tooltips. No open-source RTS has a structured onboarding system. The genre's complexity is the #1 barrier to new players — players who bounce from one failed match never return. |

**Revision note (2026-02-22):** Revised D065 to support a single cross-device tutorial curriculum with semantic prompt rendering (`InputCapabilities`/`ScreenClass` aware), a skippable first-run controls walkthrough, camera bookmark instruction, and a touch-focused Tempo Advisor (advisory only). This revision incorporates confirmatory prior-art research on mobile strategy UX, platform adaptation, and community distribution friction (`research/mobile-rts-ux-onboarding-community-platform-analysis.md`).

**Revision note (2026-02-27):** Extended Layer 2 contextual hints with UI-context trigger types (`ui_screen_enter`, `ui_element_focus`, `ui_action_attempt`, `ui_screen_idle`, `ui_feature_unused`) for non-gameplay feature screens. Added `feature_discovery` hint category and Feature Smart Tips catalog (`hints/feature-tips.yaml`) covering Workshop, Settings, Player Profile, and Main Menu. Progressive Feature Discovery milestones are now expressed as `feature_discovery` YAML hints using the standard Layer 2 pipeline rather than hardcoded milestone logic.

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-27)
- **Phase:** Phase 3 (pipeline, hints, progressive discovery, feature smart tips), Phase 4 (Commander School, assessment, post-game learning)
- **Canonical for:** Tutorial/new-player onboarding architecture, cross-device tutorial prompt model, controls walkthrough, onboarding-related adaptive pacing, and Feature Smart Tips for non-gameplay screens
- **Scope:** `ic-ui` onboarding systems, tutorial Lua APIs, hint history + skill estimate persistence (SQLite/D034), cross-device prompt rendering, player-facing tutorial UX
- **Decision:** IC uses a **five-layer onboarding system** (campaign tutorial + contextual hints + first-run pipeline + skill assessment + adaptive pacing) integrated across the product rather than a single tutorial screen/mode.
- **Why:** RTS newcomers, veterans, and experienced OpenRA/Remastered players have different onboarding needs; one fixed tutorial path either overwhelms or bores large groups.
- **Non-goals:** Separate desktop and mobile tutorial campaigns; forced full tutorial completion before normal play; mouse-only prompt wording in shared tutorial content.
- **Invariants preserved:** Input remains abstracted (`InputCapabilities`/`ScreenClass` and core `InputSource` design); tutorial pacing/advisory systems are UI/client-level and do not alter simulation determinism.
- **Defaults / UX behavior:** Commander School is a first-class campaign; controls walkthrough is short and skippable; tutorial prompts are semantic and rendered per device/input mode.
- **Mobile / accessibility impact:** Touch platforms use the same curriculum with device-specific prompt text/UI anchors; Tempo Advisor is advisory-only and warns without blocking player choice (except existing ranked authority rules elsewhere).
- **Public interfaces / types / commands:** `InputPromptAction`, `TutorialPromptContext`, `ResolvedInputPrompt`, `UiAnchorAlias`, `LayoutAnchorResolver`, `TempoAdvisorContext`
- **Affected docs:** `src/17-PLAYER-FLOW.md`, `src/02-ARCHITECTURE.md`, `src/decisions/09b-networking.md`, `src/decisions/09d-gameplay.md`
- **Revision note summary:** (2026-02-22) Added cross-device semantic prompts, skippable controls walkthrough, camera bookmark teaching, and touch tempo advisory hooks. (2026-02-27) Extended Layer 2 with UI-context triggers and Feature Smart Tips for non-gameplay screens (Workshop, Settings, Profile, Main Menu); Progressive Feature Discovery now uses standard Layer 2 YAML hints.
- **Keywords:** tutorial, commander school, onboarding, cross-device prompts, controls walkthrough, tempo advisor, mobile tutorial, semantic action prompts, IC-specific features, veteran onboarding, attack-move, rally points, weather, veterancy, unit stances, feature smart tips, ui context hints, feature discovery, workshop tips, settings tips

### Problem

Classic RTS games are notoriously hostile to new players. The original Red Alert's "tutorial" was Mission 1 of the Allied campaign, which assumed the player already understood control groups, attack-move, and ore harvesting. OpenRA offers no in-game tutorial at all. The Remastered Collection added tooltips and a training mode but no structured curriculum.

IC targets three distinct player populations and must serve all of them:

1. **Complete RTS newcomers** — never played any RTS. Need camera, selection, movement, and minimap/radar concepts before anything else.
2. **Lapsed RA veterans** — played in the 90s, remember concepts vaguely, need a refresher on specific mechanics and new IC features.
3. **OpenRA / Remastered players** — know RA well but may not know IC-specific features (weather, experience profiles, campaign persistence, console commands).

A single-sized tutorial serves none of them well. Veterans resent being forced through basics. Newcomers drown in information presented too fast. The system must adapt.

### Decision

A five-layer tutorial system that integrates throughout the player experience rather than existing as a single screen or mode. Each layer operates independently — players benefit from whichever layers they encounter, in any order.

**Cross-device curriculum rule:** IC ships one tutorial curriculum (Commander School + hints + skill assessment), not separate desktop and mobile tutorial campaigns. Tutorial content defines **semantic actions** ("move command", "assign control group", "save camera bookmark") and the UI layer renders device-specific instructions and highlights using `InputCapabilities` and `ScreenClass`.

**Controls walkthrough addition (Layer 3):** A short, skippable controls walkthrough (60-120s) is offered during first-run onboarding. It teaches camera pan/zoom, selection, context commands, minimap/radar, control groups, build UI basics, and camera bookmarks for the active platform before the player enters Commander School or regular play.

#### Dopamine-First Design Philosophy

The Commander School is structured around a core principle: **achievement first, theory second**. The player should feel powerful and successful before they understand why. Boring fundamentals (economy, defense, hotkeys) are taught *between* moments of excitement, not as a prerequisite for them.

**The anti-pattern:** Most RTS tutorials teach bottom-up — camera, then selection, then movement, then combat, then building, then economy. By the time the player reaches anything exciting, they've spent 20 minutes on fundamentals and may have already quit. This mirrors classroom instruction, not game design.

**The IC pattern:** The first mission gives the player a pre-built squad and an objective to destroy something. They learn camera and selection *by doing something fun* — blowing things up. Building and economy are introduced after the player already wants to build more units because they enjoyed using the ones they had. Controls and hotkeys are taught after the player has felt the friction of *not* having them.

**Pacing rules:**

1. **Every mission must have a dopamine moment in the first 60 seconds.** An explosion, a victory, a unit responding to a command. The player must feel they *did something* before they're taught *how to do it better*.
2. **Alternate exciting and foundational missions.** Never put two "boring" missions back-to-back. Combat → Construction → Economy → Shortcuts → Capstone keeps energy high. Camera → Selection → Movement → Building kills it.
3. **Teach controls through friction, not instruction.** Don't frontload hotkey lessons. Let the player struggle with mouse-only control in Mission 02-03, then introduce control groups in Mission 04 as a relief ("here's how to make that easier"). The friction creates desire for the solution.
4. **Achievements unlock after every mission.** Even small ones. "First Blood," "Base Builder," "Commander." The D036 achievement popup is the reward loop. The player should feel like they're collecting milestones, not completing homework.
5. **The tutorial teaches game mechanics, gameplay, options, buttons, and shortcuts.** Everything else — advanced strategy, optimal build orders, meta knowledge — is for the player to discover through play. The tutorial makes them competent and confident, not expert.

### Layer 1 — Commander School (Tutorial Campaign)

A dedicated 6-mission tutorial campaign using the D021 branching graph system, accessible from `Main Menu → Campaign → Commander School`. This is a first-class campaign, not a popup sequence — it has briefings, EVA voice lines, map variety, and a branching graph with remedial branches for players who struggle. It is shared across desktop and touch platforms; only prompt wording and UI highlight anchors differ by platform.

The tutorial teaches only the basics: navigation, core features, buttons, and shortcuts. Unit counters, defense strategy, tech tree exploration, superweapons, and advanced tactics are deliberately left for the player to discover through skirmish and multiplayer — that discovery *is* the game.

The mission order follows the dopamine-first philosophy: excitement first, fundamentals woven in between.

#### Mission Structure (Dopamine-First Order)

The missions alternate between exciting moments (combat, new toys) and foundational skills (economy, controls). The player is never more than one mission away from something thrilling.

```
    ┌─────────────────────┐
    │  01: First Blood     │  Pre-built squad. Blow things up.
    │  (Combat First!)     │  Camera + selection taught DURING action.
    └────────┬────────────┘
             │
     ┌───────┼───────────┐
     │ pass  │ struggle  │
     ▼       ▼           │
    ┌────┐ ┌───────────┐ │
    │ 02 │ │ 01r: Boot │ │  Remedial: guided camera + selection
    │    │ │ Camp      │─┘  in a low-pressure sandbox
    └──┬─┘ └───────────┘
       │
       ▼
    ┌─────────────────────┐
    │  02: Build Your Army │  "You want more soldiers? Build them."
    │  (Construction)      │  Power plant + barracks. Economy
    └────────┬────────────┘  motivation: desire, not instruction.
             │
             ▼
    ┌─────────────────────┐
    │  03: Supply Line     │  "You ran out of money. Here's how
    │  (Economy)           │  money works." Refinery + harvesters.
    └────────┬────────────┘  Taught as solution to felt problem.
             │
             ▼
    ┌─────────────────────┐
    │  04: Command &       │  Control groups, hotkeys, camera
    │  Control (Shortcuts) │  bookmarks, queue commands. Taught
    └────────┬────────────┘  as RELIEF from mouse-only friction
             │                the player felt in missions 01-03.
             ▼
    ┌─────────────────────┐
    │  05: Iron Curtain     │  Full skirmish vs tutorial AI.
    │  Rising (Capstone)   │  Apply everything. The graduation
    └────────┬────────────┘  match. Player discovers defense,
             │                counters, and tech tree organically.
       ┌─────┴─────┐
       │ victory    │ defeat
       ▼            ▼
    ┌────────┐  ┌──────────────┐
    │  06:   │  │  05r: Second │  Retry with bonus units,
    │  Multi │  │  Chance      │──► hints forced on.
    │  player│  └──────────────┘    Loops back to 06.
    │  Intro │
    └────────┘
```

**What the tutorial deliberately does NOT teach:**

| Topic | Why It's Left for Play |
| --- | --- |
| Defense (walls, turrets) | Discovered organically in the capstone skirmish and first real games. Contextual hints (Layer 2) cover the basics at point of need. |
| Unit counters / composition | The rock-paper-scissors system is a core discovery loop. Teaching it in a scripted mission removes the "aha" moment. |
| Tech tree / superweapons | Aspirational discovery — the first time a player sees an enemy superweapon in a real game is a memorable moment. |
| Naval, weather, advanced micro | Advanced mechanics best learned through experimentation in skirmish or campaign missions that introduce them naturally. |

#### IC-Specific Feature Integration

IC introduces features that have no equivalent in classic Red Alert or OpenRA. These will confuse veterans and bewilder newcomers if not surfaced. Rather than adding dedicated missions, IC-specific features are **woven into the missions that teach related concepts**, so the player encounters them naturally alongside fundamentals.

**Design rule:** Every IC-specific feature that changes moment-to-moment gameplay is either (a) taught in a Commander School mission alongside a related fundamental, or (b) surfaced by a Layer 2 contextual hint at point of need. No IC feature should surprise a player with zero prior explanation.

**Per-mission IC feature integration:**

| Mission | IC Feature Introduced | How It's Woven In |
| --- | --- | --- |
| 01: First Blood | **Attack-move** (IC default, absent in vanilla RA) | After the player's first kill, a hint introduces attack-move as a better way to advance: "Hold A and click ahead — your troops will fight anything in their path." Veterans learn IC has it by default; newcomers learn it as a natural combat tool. |
| 02: Build Your Army | **Rally points**, **parallel factories** | After the player builds a barracks, a hint teaches rally points: "Right-click the ground while your barracks is selected to set a rally point." If the mission provides a second factory, parallel production is highlighted: "Both factories are producing simultaneously." |
| 03: Supply Line | **Smart box-select** (harvesters deprioritized) | When the player box-selects a group that includes harvesters, a hint explains: "Harvesters aren't selected when you drag-select combat units. Click a harvester directly to select it." This prevents the #1 veteran confusion with IC's smart selection. |
| 04: Command & Control | **Unit stances**, **camera bookmarks**, **render mode toggle (F1)** | Stances are taught through friction: enemy scouts harass the player's base, and aggressive-stance units chase them out of position. The hint offers defensive stance as relief. Camera bookmarks are already taught here. A brief F1 hint introduces the render mode toggle. |
| 05: Iron Curtain Rising | **Weather effects**, **veterancy** | The capstone skirmish map includes a weather cycle (e.g., light snow in the second half). A contextual hint fires on the first weather change: "Weather has changed — snow slows ground units." Veterancy is earned naturally during the match; a hint fires on first promotion: "Your tank earned a promotion — veteran units deal more damage." |
| 06: Multiplayer Intro | **Balance presets**, **experience profiles**, **request pause** | The multiplayer onboarding screen explains that lobbies show the active balance preset ("Classic RA" / "OpenRA" / "IC Default"). A hint notes that experience profiles bundle rules + QoL settings. Pause request mechanics are mentioned in the etiquette section. |

**Audience-aware hint wording:**

The same IC feature is explained differently depending on the player's experience profile:

| IC Feature | Newcomer hint | Veteran hint |
| --- | --- | --- |
| Attack-move | "Hold A and click the ground — your troops will attack anything they encounter on the way." | "Attack-move is enabled by default in IC. Hold A and click to advance while engaging." |
| Rally points | "Right-click the ground while a factory is selected to set a rally point for new units." | "IC adds rally points — right-click ground with a factory selected. New units auto-walk there." |
| Smart select | "Drag-selecting groups skips harvesters automatically. Click a harvester directly to select it." | "IC's smart select deprioritizes harvesters in box selections. Click directly to grab one." |
| Unit stances | "Units have behavior stances. Press the stance button to switch between Aggressive and Defensive." | "IC adds unit stances (Aggressive / Defensive / Hold / Return Fire). Your units default to Aggressive — they'll chase enemies if you don't set Defensive." |
| Weather | "Weather is changing! Snow and ice slow ground units and can open new paths over frozen water." | "IC's weather system affects gameplay — snow slows units, ice makes water crossable. Plan routes accordingly." |
| Parallel factories | "Each factory produces independently. Build two barracks to train infantry twice as fast!" | "IC parallel factories produce simultaneously — doubling up War Factories doubles throughput (unlike classic RA)." |

**Why this order works:**

| Mission | Dopamine Moment | Fundamental Taught | IC Feature Woven In |
| --- | --- | --- | --- |
| 01: First Blood | Explosions in first 30 seconds | Camera, selection, attack command | Attack-move |
| 02: Build Your Army | Deploying units you built yourself | Construction, power, production queue | Rally points, parallel factories |
| 03: Supply Line | Ore truck delivers first load | Economy, harvesting, resource management | Smart box-select |
| 04: Command & Control | Multi-group attack feels effortless | Control groups, hotkeys, bookmarks, queuing | Unit stances, render mode toggle (F1) |
| 05: Iron Curtain Rising | Winning a real skirmish | Everything integrated | Weather effects, veterancy |
| 06: Multiplayer Intro | First online interaction | Lobbies, chat, etiquette | Balance presets, experience profiles, request pause |

Every mission is **skippable**. Players can jump to any unlocked mission from the Commander School menu. Completing mission N unlocks mission N+1 (and its remedial branch, if any). Veterans can skip directly to Mission 05 (Capstone Skirmish) after a brief skill check.

#### Tutorial AI Difficulty Tier

Commander School uses a dedicated tutorial AI difficulty tier below D043's Easy:

| AI Tier           | Behavior                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Tutorial**      | Scripted responses only. Attacks on cue. Does not exploit weaknesses. Builds at fixed timing. |
| **Easy** (D043)   | Priority-based; slow reactions; limited tech tree; no harassment                              |
| **Normal** (D043) | Full priority-based; moderate aggression; uses counters                                       |
| **Hard+** (D043)  | Full AI with aggression/strategy axes                                                         |

The Tutorial tier is **Lua-scripted per mission**, not a general-purpose AI. Mission 01's AI sends a patrol to meet the player's squad. Mission 05's AI builds a base and attacks after 5 minutes. The behavior is pedagogically tuned — the AI exists to teach, not to win.

#### Experience-Profile Awareness

Commander School adapts to the player's experience profile (D033):

- **New to RTS:** Full hints, slower pacing, EVA narration on every new concept
- **RA veteran / OpenRA player:** Skip basic missions, jump straight to the capstone skirmish (mission 05) or multiplayer intro (mission 06)
- **Custom:** Player chose which missions to unlock via the skill assessment (Layer 3)

The experience profile is read from the first-launch self-identification (see `17-PLAYER-FLOW.md`). It is not a difficulty setting — it controls *what is taught*, not *how hard the AI fights*. On touch devices, "slower pacing" also informs the default tutorial tempo recommendation (`slower` on phone/tablet, advisory only and overridable by the player).

#### Campaign YAML Definition

```yaml
# campaigns/tutorial/campaign.yaml
campaign:
  id: commander_school
  title: "Commander School"
  description: "Learn to command — from basic movement to full-scale warfare"
  start_mission: tutorial_01
  category: tutorial  # displayed under Campaign → Tutorial, not Campaign → Allied/Soviet
  icon: tutorial_icon
  badge: commander_school  # shown on campaign menu for players who haven't started

  persistent_state:
    unit_roster: false        # tutorial missions don't carry units forward
    veterancy: false
    resources: false
    equipment: false
    custom_flags:
      skills_demonstrated: []  # tracks which skills the player has shown

  missions:
    tutorial_01:
      map: missions/tutorial/01-first-blood
      briefing: briefings/tutorial/01.yaml
      skip_allowed: true
      experience_profiles: [new_to_rts, all]
      # Dopamine-first: player starts with a squad, blows things up.
      # Camera + selection taught DURING combat, not before.
      outcomes:
        pass:
          description: "First enemies destroyed"
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection, movement, attack] }
        struggle:
          description: "Player struggled with camera/selection"
          next: tutorial_01r
        skip:
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection, movement, attack] }

    tutorial_01r:
      map: missions/tutorial/01r-boot-camp
      briefing: briefings/tutorial/01r.yaml
      remedial: true  # UI shows this as "Practice", not a setback
      # Low-pressure sandbox: guided camera + selection without combat time pressure
      outcomes:
        pass:
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection, movement] }

    tutorial_02:
      map: missions/tutorial/02-build-your-army
      briefing: briefings/tutorial/02.yaml
      skip_allowed: true
      # Player wants MORE units after 01. Desire-driven: construction as answer.
      outcomes:
        pass:
          next: tutorial_03
          state_effects:
            append_flag: { skills_demonstrated: [construction, power, production] }
        skip:
          next: tutorial_03

    tutorial_03:
      map: missions/tutorial/03-supply-line
      briefing: briefings/tutorial/03.yaml
      skip_allowed: true
      # Player ran out of money in 02. Friction → relief: economy as solution.
      outcomes:
        pass:
          next: tutorial_04
          state_effects:
            append_flag: { skills_demonstrated: [economy, harvesting, refinery] }
        skip:
          next: tutorial_04

    tutorial_04:
      map: missions/tutorial/04-command-and-control
      briefing: briefings/tutorial/04.yaml
      skip_allowed: true
      # Player felt mouse-only friction in 01-03. Control groups as relief.
      outcomes:
        pass:
          next: tutorial_05
          state_effects:
            append_flag: { skills_demonstrated: [control_groups, hotkeys, camera_bookmarks, queuing] }
        skip:
          next: tutorial_05

    tutorial_05:
      map: missions/tutorial/05-iron-curtain-rising
      briefing: briefings/tutorial/05.yaml
      skip_allowed: false  # capstone — encourage completion
      # Full skirmish. Apply everything. The graduation match.
      # Player discovers defense, counters, tech tree organically here.
      outcomes:
        victory:
          next: tutorial_06
          state_effects:
            append_flag: { skills_demonstrated: [full_skirmish] }
        defeat:
          next: tutorial_05r
          debrief: briefings/tutorial/05-debrief-defeat.yaml

    tutorial_05r:
      map: missions/tutorial/05-iron-curtain-rising
      briefing: briefings/tutorial/05r.yaml
      remedial: true
      adaptive:
        on_previous_defeat:
          bonus_resources: 3000
          bonus_units: [medium_tank, medium_tank]
          enable_tutorial_hints: true  # force hints on for retry
      outcomes:
        victory:
          next: tutorial_06
        defeat:
          next: tutorial_05r  # can retry indefinitely

    tutorial_06:
      map: missions/tutorial/06-multiplayer-intro
      briefing: briefings/tutorial/06.yaml
      skip_allowed: true
      outcomes:
        pass:
          description: "Commander School complete"
```

#### Tutorial Mission Lua Script Pattern

Each tutorial mission uses the `Tutorial` Lua global to manage the teaching flow:

```lua
-- missions/tutorial/01-first-blood.lua
-- Mission 01: First Blood — dopamine first, fundamentals embedded
-- Player starts with a pre-built squad. Explosions in 30 seconds.
-- Camera and selection are taught DURING the action, not before.

function OnMissionStart()
    -- Disable sidebar building (not taught yet)
    Tutorial.RestrictSidebar(true)

    -- Spawn player units — a satisfying squad from the start
    local player = Player.GetPlayer("GoodGuy")
    local rifles = Actor.Create("e1", player, entry_south, { count = 5 })
    local tank = Actor.Create("2tnk", player, entry_south, { count = 1 })

    -- Spawn enemy base and patrol (tutorial AI — scripted, not general AI)
    local enemy = Player.GetPlayer("BadGuy")
    local patrol = Actor.Create("e1", enemy, patrol_start, { count = 3 })
    local bunker = Actor.Create("pbox", enemy, enemy_base, {})

    -- Step 1: "Look over there" — camera pan teaches camera exists
    Tutorial.SetStep("spot_enemy", {
        title = "Enemy Spotted",
        hint = "Enemy forces ahead! Select your soldiers (click and drag) and right-click an enemy to attack.",
        focus_area = patrol_start,       -- camera pans to the action
        highlight_ui = nil,
        eva_line = "enemy_units_detected",
        completion = { type = "kill", count = 1 }  -- first kill = first dopamine hit
    })
end

function OnStepComplete(step_id)
    if step_id == "spot_enemy" then
        -- Step 2: Player just got a kill. Reward, then teach more.
        Tutorial.ShowHint("Nice! You can also hold Ctrl and right-click to attack-move.")
        Tutorial.SetStep("destroy_bunker", {
            title = "Destroy the Outpost",
            hint = "That bunker is a threat. Select your tank and right-click the bunker to attack it.",
            focus_area = enemy_base,
            eva_line = "commander_tip_attack_structure",
            completion = { type = "kill_actor", actor_type = "pbox" }
        })

    elseif step_id == "destroy_bunker" then
        -- Step 3: Bunker explodes — big dopamine moment. Now teach force-fire.
        Tutorial.SetStep("clear_area", {
            title = "Clear the Area",
            hint = "Destroy all remaining enemies to complete the mission.",
            completion = { type = "kill_all", faction = "BadGuy" }
        })

    elseif step_id == "clear_area" then
        -- Mission complete — achievement unlocked: "First Blood"
        Campaign.complete("pass")
    end
end

-- Detect struggle: if player hasn't killed anyone after 2 minutes
Trigger.AfterDelay(DateTime.Minutes(2), function()
    if Tutorial.GetCurrentStep() == "spot_enemy" then
        Tutorial.ShowHint("Try selecting your units (click + drag) then right-clicking on an enemy.")
    end
end)

-- Detect struggle: player lost most units without killing enemies
Trigger.OnAllKilledOrCaptured(Player.GetPlayer("GoodGuy"):GetActors(), function()
    Campaign.complete("struggle")
end)
```

