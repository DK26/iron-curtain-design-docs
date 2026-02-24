## D065: Tutorial & New Player Experience — Five-Layer Onboarding System

|                |                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                  |
| **Phase**      | Phase 3 (contextual hints, new player pipeline, progressive discovery), Phase 4 (Commander School campaign, skill assessment, post-game learning, tutorial achievements)                                                                                                                  |
| **Depends on** | D004 (Lua Scripting), D021 (Branching Campaigns), D033 (QoL Toggles — experience profiles), D034 (SQLite — hint history, skill estimate), D036 (Achievements), D038 (Scenario Editor — tutorial modules), D043 (AI Behavior Presets — tutorial AI tier)                                   |
| **Driver**     | OpenRA's new player experience is a wiki link to a YouTube video. The Remastered Collection added basic tooltips. No open-source RTS has a structured onboarding system. The genre's complexity is the #1 barrier to new players — players who bounce from one failed match never return. |

**Revision note (2026-02-22):** Revised D065 to support a single cross-device tutorial curriculum with semantic prompt rendering (`InputCapabilities`/`ScreenClass` aware), a skippable first-run controls walkthrough, camera bookmark instruction, and a touch-focused Tempo Advisor (advisory only). This revision incorporates confirmatory prior-art research on mobile strategy UX, platform adaptation, and community distribution friction (`research/mobile-rts-ux-onboarding-community-platform-analysis.md`).

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-22)
- **Phase:** Phase 3 (pipeline, hints, progressive discovery), Phase 4 (Commander School, assessment, post-game learning)
- **Canonical for:** Tutorial/new-player onboarding architecture, cross-device tutorial prompt model, controls walkthrough, and onboarding-related adaptive pacing
- **Scope:** `ic-ui` onboarding systems, tutorial Lua APIs, hint history + skill estimate persistence (SQLite/D034), cross-device prompt rendering, player-facing tutorial UX
- **Decision:** IC uses a **five-layer onboarding system** (campaign tutorial + contextual hints + first-run pipeline + skill assessment + adaptive pacing) integrated across the product rather than a single tutorial screen/mode.
- **Why:** RTS newcomers, veterans, and experienced OpenRA/Remastered players have different onboarding needs; one fixed tutorial path either overwhelms or bores large groups.
- **Non-goals:** Separate desktop and mobile tutorial campaigns; forced full tutorial completion before normal play; mouse-only prompt wording in shared tutorial content.
- **Invariants preserved:** Input remains abstracted (`InputCapabilities`/`ScreenClass` and core `InputSource` design); tutorial pacing/advisory systems are UI/client-level and do not alter simulation determinism.
- **Defaults / UX behavior:** Commander School is a first-class campaign; controls walkthrough is short and skippable; tutorial prompts are semantic and rendered per device/input mode.
- **Mobile / accessibility impact:** Touch platforms use the same curriculum with device-specific prompt text/UI anchors; Tempo Advisor is advisory-only and warns without blocking player choice (except existing ranked authority rules elsewhere).
- **Public interfaces / types / commands:** `InputPromptAction`, `TutorialPromptContext`, `ResolvedInputPrompt`, `UiAnchorAlias`, `LayoutAnchorResolver`, `TempoAdvisorContext`
- **Affected docs:** `src/17-PLAYER-FLOW.md`, `src/02-ARCHITECTURE.md`, `src/decisions/09b-networking.md`, `src/decisions/09d-gameplay.md`
- **Revision note summary:** Added cross-device semantic prompts, skippable controls walkthrough, camera bookmark teaching, and touch tempo advisory hooks based on researched mobile UX constraints.
- **Keywords:** tutorial, commander school, onboarding, cross-device prompts, controls walkthrough, tempo advisor, mobile tutorial, semantic action prompts

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

### Layer 1 — Commander School (Tutorial Campaign)

A dedicated 10-mission tutorial campaign using the D021 branching graph system, accessible from `Main Menu → Campaign → Commander School`. This is a first-class campaign, not a popup sequence — it has briefings, EVA voice lines, map variety, and a branching graph with remedial branches for players who struggle. It is shared across desktop and touch platforms; only prompt wording and UI highlight anchors differ by platform.

#### Mission Structure

```
                    ┌─────────────────┐
                    │  01: First Steps │  Camera, selection, movement
                    │  (Movement Only) │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ pass         │ struggle     │
              ▼              ▼              │
    ┌─────────────────┐  ┌──────────────┐  │
    │  02: First Blood │  │  01r: Camera  │  │  Remedial: just camera + selection
    │  (Basic Combat)  │  │  Basics      │──┘
    └────────┬────────┘  └──────────────┘
             │
             ▼
    ┌─────────────────┐
    │  03: Base Camp   │  Build a power plant + barracks
    │  (Construction)  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  04: Supply Line │  Build a refinery, protect harvesters
    │  (Economy)       │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  05: Hold the    │  Walls, turrets, repair
    │  Line (Defense)  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  06: Command     │  Control groups, hotkeys, camera bookmarks,
    │  Basics          │  queue commands
    │  (Controls)      │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  07: Combined    │  Rock-paper-scissors: infantry vs vehicles
    │  Arms            │  vs air; counter units
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  08: Iron        │  Full skirmish vs tutorial AI; apply
    │  Curtain Rising  │  everything learned
    │  (First Skirmish)│
    └────────┬────────┘
             │
       ┌─────┴─────┐
       │ victory    │ defeat
       ▼            ▼
    ┌────────┐  ┌──────────────┐
    │  09:   │  │  08r: Second │  Retry with hints enabled
    │  Multi │  │  Chance      │──► loops back to 09
    │  player│  └──────────────┘
    │  Intro │
    └───┬────┘
        │
        ▼
    ┌─────────────────┐
    │  10: Advanced    │  Tech tree, superweapons, naval,
    │  Tactics         │  weather effects (optional)
    └─────────────────┘
```

Every mission is **skippable**. Players can jump to any unlocked mission from the Commander School menu. Completing mission N unlocks mission N+1 (and its remedial branch, if any). Veterans can skip directly to Mission 08 (First Skirmish) or 10 (Advanced Tactics) after a brief skill check.

#### Tutorial AI Difficulty Tier

Commander School uses a dedicated tutorial AI difficulty tier below D043's Easy:

| AI Tier           | Behavior                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Tutorial**      | Scripted responses only. Attacks on cue. Does not exploit weaknesses. Builds at fixed timing. |
| **Easy** (D043)   | Priority-based; slow reactions; limited tech tree; no harassment                              |
| **Normal** (D043) | Full priority-based; moderate aggression; uses counters                                       |
| **Hard+** (D043)  | Full AI with aggression/strategy axes                                                         |

The Tutorial tier is **Lua-scripted per mission**, not a general-purpose AI. Mission 02's AI sends two rifle squads after 3 minutes. Mission 08's AI builds a base and attacks after 5 minutes. The behavior is pedagogically tuned — the AI exists to teach, not to win.

#### Experience-Profile Awareness

Commander School adapts to the player's experience profile (D033):

- **New to RTS:** Full hints, slower pacing, EVA narration on every new concept
- **RA veteran / OpenRA player:** Skip basic missions, focus on IC-specific features (weather, console, experience profiles)
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
      map: missions/tutorial/01-first-steps
      briefing: briefings/tutorial/01.yaml
      skip_allowed: true
      experience_profiles: [new_to_rts, all]  # shown to these profiles
      outcomes:
        pass:
          description: "Mission complete"
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection, movement] }
        struggle:
          description: "Player struggled with camera/selection"
          next: tutorial_01r
        skip:
          description: "Player skipped"
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection, movement] }

    tutorial_01r:
      map: missions/tutorial/01r-camera-basics
      briefing: briefings/tutorial/01r.yaml
      remedial: true  # UI shows this as a "practice" mission, not a setback
      outcomes:
        pass:
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection] }

    tutorial_02:
      map: missions/tutorial/02-first-blood
      briefing: briefings/tutorial/02.yaml
      skip_allowed: true
      outcomes:
        pass:
          next: tutorial_03
          state_effects:
            append_flag: { skills_demonstrated: [attack, force_fire] }
        skip:
          next: tutorial_03

    # ... missions 03–10 follow the same pattern ...

    tutorial_08:
      map: missions/tutorial/08-first-skirmish
      briefing: briefings/tutorial/08.yaml
      skip_allowed: false  # this one is the capstone — encourage completion
      outcomes:
        victory:
          next: tutorial_09
          state_effects:
            append_flag: { skills_demonstrated: [full_skirmish] }
        defeat:
          next: tutorial_08r
          debrief: briefings/tutorial/08-debrief-defeat.yaml

    tutorial_08r:
      map: missions/tutorial/08-first-skirmish
      briefing: briefings/tutorial/08r.yaml
      remedial: true
      adaptive:
        on_previous_defeat:
          bonus_resources: 3000
          bonus_units: [medium_tank, medium_tank]
          enable_tutorial_hints: true  # force hints on for retry
      outcomes:
        victory:
          next: tutorial_09
        defeat:
          next: tutorial_08r  # can retry indefinitely

    tutorial_09:
      map: missions/tutorial/09-multiplayer-intro
      briefing: briefings/tutorial/09.yaml
      skip_allowed: true
      outcomes:
        pass:
          next: tutorial_10
        skip:
          next: tutorial_10

    tutorial_10:
      map: missions/tutorial/10-advanced-tactics
      briefing: briefings/tutorial/10.yaml
      optional: true  # not required for "Graduate" achievement
      experience_profiles: [all]
      outcomes:
        pass:
          description: "Commander School complete"
```

#### Tutorial Mission Lua Script Pattern

Each tutorial mission uses the `Tutorial` Lua global to manage the teaching flow:

```lua
-- missions/tutorial/02-first-blood.lua
-- Mission 02: First Blood — introduces basic combat

-- Mission setup
function OnMissionStart()
    -- Disable sidebar building (not taught yet)
    Tutorial.RestrictSidebar(true)

    -- Spawn player units
    local player = Player.GetPlayer("GoodGuy")
    local rifles = Actor.Create("e1", player, entry_south, { count = 5 })

    -- Spawn enemy patrol (tutorial AI — scripted, not general AI)
    local enemy = Player.GetPlayer("BadGuy")
    local patrol = Actor.Create("e1", enemy, patrol_start, { count = 3 })

    -- Step 1: Introduce the enemy
    Tutorial.SetStep("spot_enemy", {
        title = "Enemy Contact",
        hint = "Red units are hostile. Select your soldiers and right-click an enemy to attack.",
        focus_area = patrol_start,       -- camera pans here
        highlight_ui = nil,              -- no UI highlight needed
        eva_line = "enemy_units_detected",
        completion = { type = "kill", count = 1 }  -- complete when player kills any enemy
    })
end

-- Step progression
function OnStepComplete(step_id)
    if step_id == "spot_enemy" then
        Tutorial.SetStep("attack_move", {
            title = "Attack-Move",
            hint = "Hold Ctrl and right-click to attack-move. Your units will engage enemies along the way.",
            highlight_ui = "attack_move_button",  -- highlights the A-move button on the command bar
            eva_line = "commander_tip_attack_move",
            completion = { type = "action", action = "attack_move" }
        })

    elseif step_id == "attack_move" then
        Tutorial.SetStep("clear_area", {
            title = "Clear the Area",
            hint = "Destroy all remaining enemies to complete the mission.",
            completion = { type = "kill_all", faction = "BadGuy" }
        })

    elseif step_id == "clear_area" then
        -- Mission complete
        Campaign.complete("pass")
    end
end

-- Detect struggle: if player hasn't killed anyone after 2 minutes
Trigger.AfterDelay(DateTime.Minutes(2), function()
    if Tutorial.GetCurrentStep() == "spot_enemy" then
        Tutorial.ShowHint("Try selecting your units (click + drag) then right-clicking on an enemy.")
        -- If still stuck after 4 minutes total, the campaign graph routes to a remedial mission
    end
end)

-- Detect struggle: player lost most units without killing enemies
Trigger.OnAllKilledOrCaptured(Player.GetPlayer("GoodGuy"):GetActors(), function()
    Campaign.complete("struggle")
end)
```

### Layer 2 — Contextual Hints (YAML-Driven, Always-On)

Contextual hints appear as translucent overlay callouts during gameplay, triggered by game state. They are NOT part of Commander School — they work in any game mode (skirmish, multiplayer, custom campaigns). Modders can author custom hints for their mods.

#### Hint Pipeline

```
  HintTrigger          HintFilter           HintRenderer
  (game state     →    (suppression,    →   (overlay, fade,
   evaluation)          cooldowns,           positioning,
                        experience           dismiss)
                        profile)
```

1. **HintTrigger** evaluates conditions against the current game state every N ticks (configurable, default: every 150 ticks / 5 seconds). Triggers are YAML-defined — no Lua required for standard hints.
2. **HintFilter** suppresses hints the player doesn't need: already dismissed, demonstrated mastery (performed the action N times), cooldown not expired, experience profile excludes this hint.
3. **HintRenderer** displays the hint as a UI overlay — positioned near the relevant screen element, with fade-in/fade-out, dismiss button, and "don't show again" toggle.

#### Hint Definition Schema (`hints.yaml`)

```yaml
# hints/base-game.yaml — ships with the game
# Modders create their own hints.yaml in their mod directory

hints:
  - id: idle_harvester
    title: "Idle Harvester"
    text: "Your harvester is sitting idle. Click it and right-click an ore field to start collecting."
    category: economy
    icon: hint_harvester
    trigger:
      type: unit_idle
      unit_type: "harvester"
      idle_duration_seconds: 15    # only triggers after 15s of idling
    suppression:
      mastery_action: harvest_command      # stop showing after player has issued 5 harvest commands
      mastery_threshold: 5
      cooldown_seconds: 120               # don't repeat more than once every 2 minutes
      max_shows: 10                       # never show more than 10 times total
    experience_profiles: [new_to_rts, ra_veteran]  # show to these profiles, not openra_player
    priority: high     # high priority hints interrupt low priority ones
    position: near_unit  # position hint near the idle harvester
    eva_line: null       # no EVA voice for this hint (too frequent)
    dismiss_action: got_it  # "Got it" button only — no "don't show again" on high-priority hints

  - id: negative_power
    title: "Low Power"
    text: "Your base is low on power. Build more Power Plants to restore production speed."
    category: economy
    icon: hint_power
    trigger:
      type: resource_threshold
      resource: power
      condition: negative        # power demand > power supply
      sustained_seconds: 10      # must be negative for 10s (not transient during building)
    suppression:
      mastery_action: build_power_plant
      mastery_threshold: 3
      cooldown_seconds: 180
      max_shows: 8
    experience_profiles: [new_to_rts]
    priority: high
    position: near_sidebar       # position near the build queue
    eva_line: low_power           # EVA says "Low power"

  - id: control_groups
    title: "Control Groups"
    text: "Select units and press Ctrl+1 to assign them to group 1. Press 1 to reselect them instantly."
    category: controls
    icon: hint_hotkey
    trigger:
      type: unit_count
      condition: ">= 8"         # suggest control groups when player has 8+ units
      without_action: assign_control_group  # only if they haven't used groups yet
      sustained_seconds: 60      # must have 8+ units for 60s without grouping
    suppression:
      mastery_action: assign_control_group
      mastery_threshold: 1       # one use = mastery for this hint
      cooldown_seconds: 300
      max_shows: 3
    experience_profiles: [new_to_rts]
    priority: medium
    position: screen_top         # general hint, not tied to a unit
    eva_line: commander_tip_control_groups

  - id: tech_tree_reminder
    title: "Tech Up"
    text: "New units become available as you build advanced structures. Check the sidebar for greyed-out options."
    category: strategy
    icon: hint_tech
    trigger:
      type: time_without_action
      action: build_tech_structure
      time_minutes: 5            # 5 minutes into a game with no tech building
      min_game_time_minutes: 3   # don't trigger in the first 3 minutes
    suppression:
      mastery_action: build_tech_structure
      mastery_threshold: 1
      cooldown_seconds: 600
      max_shows: 3
    experience_profiles: [new_to_rts]
    priority: low
    position: near_sidebar

  # Modder-authored hint example (from a hypothetical "Chrono Warfare" mod):
  - id: chrono_shift_intro
    title: "Chrono Shift Ready"
    text: "Your Chronosphere is charged! Select units, then click the Chronosphere and pick a destination."
    category: mod_specific
    icon: hint_chrono
    trigger:
      type: building_ready
      building_type: "chronosphere"
      ability: "chrono_shift"
      first_time: true           # only on the first Chronosphere completion per game
    suppression:
      mastery_action: use_chrono_shift
      mastery_threshold: 1
      cooldown_seconds: 0        # first_time already limits it
      max_shows: 1
    experience_profiles: [all]
    priority: high
    position: near_building
    eva_line: chronosphere_ready
```

#### Trigger Types (Extensible)

| Trigger Type          | Parameters                                         | Fires When                                                     |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `unit_idle`           | `unit_type`, `idle_duration_seconds`               | A unit of that type has been idle for N seconds                |
| `resource_threshold`  | `resource`, `condition`, `sustained_seconds`       | A resource exceeds/falls below a threshold for N seconds       |
| `unit_count`          | `condition`, `without_action`, `sustained_seconds` | Player has N units and hasn't performed the suggested action   |
| `time_without_action` | `action`, `time_minutes`, `min_game_time_minutes`  | N minutes pass without the player performing a specific action |
| `building_ready`      | `building_type`, `ability`, `first_time`           | A building completes construction (or its ability charges)     |
| `first_encounter`     | `entity_type`                                      | Player sees an enemy unit/building type for the first time     |
| `damage_taken`        | `damage_source_type`, `threshold_percent`          | Player units take significant damage from a specific type      |
| `area_enter`          | `area`, `unit_types`                               | Player units enter a named map region                          |
| `custom`              | `lua_condition`                                    | Lua expression evaluates to true (Tier 2 mods only)            |

Modders define new triggers via Lua (Tier 2) or WASM (Tier 3). The `custom` trigger type is a Lua escape hatch for conditions that don't fit the built-in types.

#### Hint History (SQLite)

```sql
-- In player.db (D034)
CREATE TABLE hint_history (
    hint_id       TEXT NOT NULL,
    show_count    INTEGER NOT NULL DEFAULT 0,
    last_shown    INTEGER,          -- Unix timestamp
    dismissed     BOOLEAN NOT NULL DEFAULT FALSE,  -- "Don't show again"
    mastery_count INTEGER NOT NULL DEFAULT 0,      -- times the mastery_action was performed
    PRIMARY KEY (hint_id)
);
```

The hint system queries this table before showing each hint. `mastery_count >= mastery_threshold` suppresses the hint permanently. `dismissed = TRUE` suppresses it permanently. `last_shown + cooldown_seconds > now` suppresses it temporarily.

#### QoL Integration (D033)

Hints are individually toggleable per category in `Settings → QoL → Hints`:

| Setting            | Default (New to RTS) | Default (RA Vet) | Default (OpenRA) |
| ------------------ | -------------------- | ---------------- | ---------------- |
| Economy hints      | On                   | On               | Off              |
| Combat hints       | On                   | Off              | Off              |
| Controls hints     | On                   | On               | Off              |
| Strategy hints     | On                   | Off              | Off              |
| Mod-specific hints | On                   | On               | On               |
| Hint frequency     | Normal               | Reduced          | Minimal          |
| EVA voice on hints | On                   | Off              | Off              |

`/hints` console commands (D058): `/hints list`, `/hints enable <category>`, `/hints disable <category>`, `/hints reset`, `/hints suppress <id>`.

### Layer 3 — New Player Pipeline

The first-launch flow (see `17-PLAYER-FLOW.md`) includes a self-identification step:

```
Theme Selection (D032) → Self-Identification → Controls Walkthrough (optional) → Tutorial Offer → Main Menu
```

#### Self-Identification Gate

```
┌──────────────────────────────────────────────────┐
│  WELCOME, COMMANDER                              │
│                                                  │
│  How familiar are you with real-time strategy?   │
│                                                  │
│  ► New to RTS games                              │
│  ► Played some RTS games before                  │
│  ► Red Alert veteran                             │
│  ► OpenRA / Remastered player                    │
│  ► Skip — just let me play                       │
│                                                  │
└──────────────────────────────────────────────────┘
```

This sets the `experience_profile` used by all five layers. The profile is stored in `player.db` (D034) and changeable in `Settings → QoL → Experience Profile`.

| Selection           | Experience Profile | Default Hints      | Tutorial Offer                                   |
| ------------------- | ------------------ | ------------------ | ------------------------------------------------ |
| New to RTS          | `new_to_rts`       | All on             | "Would you like to start with Commander School?" |
| Played some RTS     | `rts_player`       | Economy + Controls | "Commander School available in Campaigns"        |
| Red Alert veteran   | `ra_veteran`       | Economy only       | Badge on campaign menu                           |
| OpenRA / Remastered | `openra_player`    | Mod-specific only  | Badge on campaign menu                           |
| Skip                | `skip`             | All off            | No offer                                         |

#### Controls Walkthrough (Phase 3, Skippable)

A short controls walkthrough is offered immediately after self-identification. It is **platform-specific in presentation** and **shared in intent**:

- **Desktop:** mouse/keyboard prompts ("Right-click to move", `Ctrl+F5` to save camera bookmark)
- **Tablet:** touch prompts with sidebar + on-screen hotbar highlights
- **Phone:** touch prompts with build drawer, command rail, minimap cluster, and bookmark dock highlights

The walkthrough teaches only control fundamentals (camera pan/zoom, selection, context commands, control groups, minimap/radar, camera bookmarks, and build UI basics) and ends with three options:
- `Start Commander School`
- `Practice Sandbox`
- `Skip to Game`

This keeps D065's early experience friendly on touch devices without duplicating Commander School missions.

#### Canonical Input Action Model and Official Binding Profiles

To keep desktop, touch, Steam Deck, TV/gamepad, tutorials, and accessibility remaps aligned, D065 defines a **single semantic input action catalog**. The game binds physical inputs to semantic actions; tutorial prompts, the Controls Quick Reference, and the Controls-Changed Walkthrough all render from the same catalog.

**Design rule:** IC does not define "the keyboard layout" as raw keys first. It defines **actions** first, then ships official binding profiles per device/input class.

**Semantic action categories (canonical):**
- **Camera** — pan, zoom, center-on-selection, cycle alerts, save/jump camera bookmark, minimap jump/scrub
- **Selection & Orders** — select, add/remove selection, box select, deselect, context command, attack-move, guard, stop, force action, deploy, stance/ability shortcuts
- **Production & Build** — open/close build UI, category navigation, queue/cancel, structure placement confirm/cancel/rotate (module-specific), repair/sell/context build actions
- **Control Groups** — select group, assign group, add-to-group, center group
- **Communication & Coordination** — open chat, channel shortcuts, whisper, push-to-talk, ping wheel, chat wheel, minimap draw, tactical markers, callvote, and role-aware support request/response actions for asymmetric modes (D070)
- **UI / System** — pause/menu, scoreboard, controls quick reference, console (where supported), screenshot, replay controls, observer panels

**Official profile families (shipped defaults):**
- `Classic RA (KBM)` — preserves classic RTS muscle memory where practical
- `OpenRA (KBM)` — optimized for OpenRA veterans (matching common command expectations)
- `Modern RTS (KBM)` — IC default desktop profile tuned for discoverability and D065 onboarding
- `Gamepad Default` — cursor/radial hybrid for TV/console-style play
- `Steam Deck Default` — Deck-specific variant (touchpads/optional gyro/OSK-aware), not just generic gamepad
- `Touch Phone` and `Touch Tablet` — gesture + HUD layout profiles (defined by D059/D065 mobile control rules; not "key" maps, but still part of the same action catalog)

**D070 role actions:** Asymmetric mode actions (e.g., `support_request_cas`, `support_request_recon`, `support_response_approve`, `support_response_eta`) are additional semantic actions layered onto the same catalog and surfaced only when the active scenario/mode assigns a role that uses them.

**Binding profile behavior:**
- Profiles are versioned. A local profile stores either a stock profile ID or a **diff** from a stock profile (`Custom`).
- Rebinding UI edits semantic actions, never hardcodes UI-widget-local shortcuts.
- A single action may have multiple bindings (e.g., keyboard key + mouse button chord, or gamepad button + radial fallback).
- Platform-incompatible actions are hidden or remapped with a visible alternative (no dead-end actions on controller/touch).
- Tutorial prompts and quick reference entries resolve against the **active profile + current `InputCapabilities` + `ScreenClass`**.

**Official baseline defaults (high-level, normative examples):**

| Action | Desktop KBM default (Modern RTS) | Steam Deck / Gamepad default | Touch default |
| ------ | -------------------------------- | ---------------------------- | ------------- |
| Select / context command | Left-click / Right-click | Cursor confirm button (`A`/`Cross`) | Tap |
| Box select | Left-drag | Hold modifier + cursor drag / touchpad drag | Hold + drag |
| Attack-Move | `A` then target | Command radial → Attack-Move | Command rail `Attack-Move` (optional) |
| Guard | `Q` then target/self | Command radial → Guard | Command rail `Guard` (optional) |
| Stop | `S` | Face button / radial shortcut | Visible button in command rail/overflow |
| Deploy | `D` | Context action / radial | Context tap or rail button |
| Control groups | `1–0`, `Ctrl+1–0` | D-pad pages / radial groups (profile-defined) | Bottom control-group bar chips |
| Camera bookmarks | `F5–F8`, `Ctrl+F5–F8` | D-pad/overlay quick slots (profile-defined) | Bookmark dock near minimap (tap/long-press) |
| Open chat | `Enter` | Menu shortcut + OSK | Chat button + OS keyboard |
| Controls Quick Reference | `F1` | Pause → Controls (optionally bound) | Pause → Controls |

**Controller / Deck interaction model requirements (official profiles):**
- Controller profiles must provide a visible, discoverable path to all high-frequency orders (context command + command radial + pause/quick reference fallback)
- Steam Deck profile may use touchpad cursor and optional gyro precision, but every action must remain usable with gamepad-only input
- Text-heavy actions (chat, console where allowed) may invoke OSK; gameplay-critical actions may not depend on text entry
- Communication actions (PTT, ping wheel, chat wheel) must remain reachable without leaving combat camera control for more than one gesture/button chord

**Accessibility requirements for all profiles:**
- Full rebinding across keyboard, mouse, gamepad, and Deck controls
- Hold/toggle alternatives (e.g., PTT, radial hold vs tap-toggle, sticky modifiers)
- Adjustable repeat rates, deadzones, stick curves, cursor acceleration, and gyro sensitivity (where supported)
- One-handed / reduced-dexterity viable alternatives for high-frequency commands (via remaps, radials, or quick bars)
- Controls Quick Reference always reflects the player's current bindings and accessibility overrides, not only stock defaults

**Competitive integrity note:** Binding/remap freedom is supported, but multi-action automation/macros remain governed by D033 competitive equalization policy. Official profiles define discoverable defaults, not privileged input capabilities.

#### Official Default Binding Matrix (v1, Normative Baseline)

The tables below define the **normative baseline defaults** for:
- `Modern RTS (KBM)`
- `Gamepad Default`
- `Steam Deck Default` (Deck-specific overrides and additions)

`Classic RA (KBM)` and `OpenRA (KBM)` are compatibility-oriented profiles layered on the same semantic action catalog. They may differ in key placement, but must expose the same actions and remain fully documented in the Controls Quick Reference.

**Controller naming convention (generic):**
- `Confirm` = primary face button (`A` / `Cross`)
- `Cancel` = secondary face button (`B` / `Circle`)
- `Cmd Radial` = default **hold** command radial button (profile-defined; `Y` / `Triangle` by default)
- `Menu` / `View` = start/select-equivalent buttons

**Steam Deck defaults:** Deck inherits `Gamepad Default` semantics but prefers **right trackpad cursor** and optional **gyro precision** for fine targeting. All actions remain usable without gyro.

##### Camera & Navigation

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Camera pan | Mouse to screen edge / Middle-mouse drag | Left stick | Left stick | Edge-scroll can be disabled; drag-pan remains |
| Camera zoom in | Mouse wheel up | `RB` (tap) or zoom radial | `RB` (tap) / two-finger trackpad pinch emulation optional | Profile may swap with category cycling if player prefers |
| Camera zoom out | Mouse wheel down | `LB` (tap) or zoom radial | `LB` (tap) / two-finger trackpad pinch emulation optional | Same binding family as zoom in |
| Center on selection | `C` | `R3` click | `R3` click / `L4` (alt binding) | Mode-safe in gameplay and observer views |
| Cycle recent alert | `Space` | `D-pad Down` | `D-pad Down` | In replay mode, `Space` is reserved for replay pause/play |
| Jump bookmark slot 1–4 | `F5–F8` | `D-pad Left/Right` page + quick slot overlay confirm | Bookmark dock overlay via `R5`, then face/d-pad select | Quick slots map to D065 bookmark system |
| Save bookmark slot 1–4 | `Ctrl+F5–F8` | Hold bookmark overlay + `Confirm` on slot | Hold bookmark overlay (`R5`) + slot click/confirm | Matches desktop/touch semantics |
| Open minimap focus / camera jump mode | Mouse click minimap | `View` + left stick (minimap focus mode) | Left trackpad minimap focus (default) / `View`+stick fallback | No hidden-only path; visible in quick reference |

##### Selection & Orders

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Select / Context command | Left-click select / Right-click context | Cursor + `Confirm` | Trackpad cursor + `R2` (`Confirm`) | Same semantic action, resolved by context |
| Add/remove selection modifier | `Shift` + click/drag | `LT` modifier while selecting | `L2` modifier while selecting | Also used for queue modifier in production UI |
| Box select | Left-drag | Hold selection modifier + cursor drag | Hold `L2` + trackpad drag (or stick drag) | Touch remains hold+drag (D059/D065 mobile) |
| Deselect | `Esc` / click empty UI space | `Cancel` | `B` / `Cancel` | `Cancel` also exits modal targeting |
| Attack-Move | `A`, then target | `Cmd Radial` → Attack-Move | `R1` radial → Attack-Move | High-frequency, surfaced in radial + quick ref |
| Guard | `Q`, then target/self | `Cmd Radial` → Guard | `R1` radial → Guard | `Q` avoids conflict with `Hold G` ping wheel |
| Stop | `S` | `X` (tap) | `X` (tap) / `R4` (alt) | Immediate command, no target required |
| Force Action / Force Fire | `F`, then target | `Cmd Radial` → Force Action | `R1` radial → Force Action | Name varies by module; semantic action remains |
| Deploy / Toggle deploy state | `D` | `Y` (tap, context-sensitive) or radial | `Y` / radial | Falls back to context action if deployable selected |
| Scatter / emergency disperse | `X` | `Cmd Radial` → Scatter | `R1` radial → Scatter | Optional per module/profile; present if module supports |
| Cycle selected-unit subtype | `Ctrl+Tab` | `D-pad Right` (selection mode) | `D-pad Right` (selection mode) | If selection contains mixed types |

##### Production, Build, and Control Groups

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Open/close production panel focus | `B` (focus build UI) / click sidebar | `D-pad Left` (tap) | `D-pad Left` (tap) | Does not pause; focus shifts to production UI |
| Cycle production categories | `Q/E` (while build UI focused) | `LB/RB` | `LB/RB` | Contextual to production focus mode |
| Queue selected item | `Enter` / left-click on item | `Confirm` | `R2` / trackpad click | Works in production focus mode |
| Queue 5 / repeat modifier | `Shift` + queue | `LT` + queue | `L2` + queue | Uses same modifier family as selection add |
| Cancel queue item | Right-click queue slot | `Cancel` on queue slot | `B` on queue slot | Contextual in queue UI |
| Set rally point / waypoint | `R`, then target | `Cmd Radial` → Rally/Waypoint | `R1` radial → Rally/Waypoint | Module-specific labeling |
| Building placement confirm | Left-click | `Confirm` | `R2` / trackpad click | Ghost preview remains visible |
| Building placement cancel | `Esc` / Right-click | `Cancel` | `B` | Consistent across modes |
| Building placement rotate (if supported) | `R` | `Y` (placement mode) | `Y` (placement mode) | Context-sensitive; only shown if module supports rotation |
| Select control group 1–0 | `1–0` | Control-group overlay + slot select (`D-pad Up` opens) | Bottom/back-button overlay (`L4`) + slot select | Touch uses bottom control-group bar chips |
| Assign control group 1–0 | `Ctrl+1–0` | Overlay + hold slot | Overlay + hold slot | Assignment is explicit to avoid accidental overwrite |
| Center camera on control group | Double-tap `1–0` | Overlay + reselect active slot | Overlay + reselect active slot | Mirrors desktop double-tap behavior |

##### Communication & Coordination (D059)

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Open chat input | `Enter` | `View` (hold) → chat input / OSK | `View` (hold) or keyboard shortcut + OSK | D058/D059 command browser remains available where supported |
| Team chat shortcut | `/team` prefix or channel toggle in chat UI | Chat panel channel tab | Chat panel channel tab | Semantic action resolves to channel switch |
| All-chat shortcut | `/all` prefix or channel toggle in chat UI | Chat panel channel tab | Chat panel channel tab | D058 `/s` remains one-shot send |
| Whisper | `/w <player>` or player context menu | Player card → Whisper | Player card → Whisper | Visible UI path required |
| Push-to-talk (PTT) | `CapsLock` (default, rebindable) | `LB` (hold) | `L1` (hold) | VAD optional, PTT default per D059 |
| Ping wheel | `Hold G` + mouse direction | `R3` (hold) + right stick | `R3` hold + stick or right trackpad radial | Matches D059 controller guidance |
| Quick ping | `G` tap | `D-pad Up` tap | `D-pad Up` tap | Tap vs hold disambiguation for ping wheel |
| Chat wheel | `Hold V` + mouse direction | `D-pad Right` hold | `D-pad Right` hold | Quick-reference shows phrase preview by profile |
| Minimap draw | `Alt` + minimap drag | Minimap focus mode + `RT` draw | Touch minimap draw or minimap focus mode + `R2` | Deck prefers touch minimap when available |
| Callvote menu / command | `/callvote` or Pause → Vote | Pause → Vote | Pause → Vote | Console command remains equivalent where exposed |
| Mute/unmute player | Scoreboard/context menu (`Tab`) | Scoreboard/context menu | Scoreboard/context menu | No hidden shortcut required |

##### UI / System / Replay / Spectator

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Pause / Escape menu | `Esc` | `Menu` | `Menu` | In multiplayer opens escape menu, not sim pause |
| Scoreboard / player list | `Tab` | `View` (tap) | `View` (tap) | Supports mute/report/context actions |
| Controls Quick Reference | `F1` | Pause → Controls (bindable shortcut optional) | `L5` (hold) optional + Pause → Controls | Always reachable from pause/settings |
| Developer console (where supported) | `~` | Pause → Command Browser (GUI) | Pause → Command Browser (GUI) | No tilde requirement on non-keyboard platforms |
| Screenshot | `F12` | Pause → Photo/Share submenu (platform API) | `Steam`+`R1` (OS default) / in-game photo action | Platform-specific capture APIs may override |
| Replay pause/play (replay mode) | `Space` | `Confirm` | `R2` / `Confirm` | Mode-specific; does not conflict with live match `Space` alert cycle |
| Replay seek step ± | `,` / `.` | `LB/RB` (replay mode) | `LB/RB` (replay mode) | Profile may remap to triggers |
| Observer panel toggle | `O` | `Y` (observer mode) | `Y` (observer mode) | Only visible in spectator/caster contexts |

#### Workshop-Shareable Configuration Profiles (Optional)

Players can share **configuration profiles** via the Workshop as an optional, non-gameplay resource type. This includes:
- control bindings / input profiles (KBM, gamepad, Deck, touch layout preferences)
- accessibility presets (target size, hold/toggle behavior, deadzones, high-contrast HUD toggles)
- HUD/layout preference bundles (where layout profiles permit customization)
- camera/QoL preference bundles (non-authoritative client settings)

**Hard boundaries (safety / trust):**
- No secrets or credentials (API keys, tokens, account auth data) — those remain D047-only local secrets
- No absolute file paths, device serials, hardware IDs, or OS-specific personal data
- No executable scripts/macros bundled in config profiles
- No automatic application on install; imports always show a **scope + diff preview** before apply

**Compatibility metadata (required for controls-focused profiles):**
- semantic action catalog version
- target input class (`desktop_kbm`, `gamepad`, `deck`, `touch_phone`, `touch_tablet`)
- optional `ScreenClass` / layout profile compatibility hints
- notes for features required by the profile (e.g., gyro, rear buttons, command rail enabled)

**UX behavior:**
- Controls screen supports `Import`, `Export`, and `Share on Workshop`
- Workshop pages show the target device/profile class and a human-readable action summary (e.g., "Deck profile: right-trackpad cursor + gyro precision + PTT on L1")
- Applying a profile can be partial (controls-only, touch-only, accessibility-only) to avoid clobbering unrelated preferences

This follows the same philosophy as the Controls Quick Reference and D065 prompt system: shared semantics, device-specific presentation, and no hidden behavior.

#### Controls Quick Reference (Always Available, Non-Blocking)

D065 also provides a persistent **Controls Quick Reference** overlay/menu entry so advanced actions are never hidden behind memory or community lore.

**Rules:**
- Always available from gameplay (desktop, controller/Deck, and touch), pause menu, and settings
- Device-specific presentation, shared semantic content (same action catalog, different prompts/icons)
- Includes core actions + advanced/high-friction actions (camera bookmarks, command rail overrides, build drawer/sidebar interactions, chat/ping wheels)
- Dismissable, searchable, and safe to open/close without disrupting the current mode
- Can be pinned in reduced form during early sessions (optional setting), then auto-unpins as the player demonstrates mastery

This is a **reference aid**, not a tutorial gate. It never blocks gameplay and does not require completion.

#### Asymmetric Co-op Role Onboarding (D070 Extension)

When a player enters a D070 `Commander & Field Ops` scenario for the first time, D065 can offer a short, skippable **role onboarding** overlay before match start (or as a replayable help entry from pause/settings).

**What it teaches (v1):**
- the assigned role (`Commander` vs `Field Ops`)
- role-specific HUD regions and priorities
- request/response coordination loop (request support ↔ approve/deny/ETA)
- objective channel semantics (`Strategic`, `Field`, `Joint`)
- where to find the role-specific Controls Quick Reference page

**Rules:**
- skippable and replayable
- concept-first, not mission-specific scripting
- uses the same D065 semantic action prompt model (no separate input prompt system)
- profile/device aware (`KBM`, controller/Deck, touch) where the scenario/platform supports the role

#### Controls-Changed Walkthrough (One-Time After Input UX Changes)

When a game update changes control defaults, official input profile mappings, touch gesture behavior, command-rail mappings, or HUD placements in a way that affects muscle memory, D065 can show a short **What's Changed in Controls** walkthrough on next launch.

**Behavior:**
- Triggered by a local controls-layout/version mismatch (e.g., input profile schema version or layout profile revision)
- One-time prompt per affected profile/device; skippable and replayable later from Settings
- Focuses only on changed interactions (not a full tutorial replay)
- Prioritizes touch-platform changes (where discoverability regressions are most likely), but desktop can use it too
- Links to the Controls Quick Reference and Commander School for deeper refreshers

**Philosophy fit:** This preserves discoverability and reduces frustration without forcing players through onboarding again. It is a reversible UI aid, not a simulation change.

#### Skill Assessment (Phase 4)

After Commander School Mission 01 (or as a standalone 2-minute exercise accessible from `Settings → QoL → Recalibrate`), the engine estimates the player's baseline skill:

```
┌──────────────────────────────────────────────────┐
│  SKILL CALIBRATION (2 minutes)                   │
│                                                  │
│  Complete these exercises:                       │
│  ✓  Select and move units to waypoints           │
│  ✓  Select specific units from a mixed group     │
│  ►  Camera: pan to each flashing area            │
│  ►  Optional: save/jump a camera bookmark        │
│     Timed combat: destroy targets in order       │
│                                                  │
│  [Skip Assessment]                               │
└──────────────────────────────────────────────────┘
```

Measures:
- **Selection speed** — time to select correct units from a mixed group
- **Camera fluency** — time to pan to each target area
- **Camera bookmark fluency (optional)** — time to save and jump to a bookmarked location (measured only on platforms where bookmarks are surfaced in the exercise)
- **Combat efficiency** — accuracy of focused fire on marked targets
- **APM estimate** — actions per minute during the exercises

Results stored in SQLite:

```sql
-- In player.db
CREATE TABLE player_skill_estimate (
    player_id        TEXT PRIMARY KEY,
    selection_speed  INTEGER,    -- percentile (0–100)
    camera_fluency   INTEGER,
    bookmark_fluency INTEGER,    -- nullable/0 if exercise omitted
    combat_efficiency INTEGER,
    apm_estimate     INTEGER,    -- raw APM
    input_class      TEXT,       -- 'desktop', 'touch_phone', 'touch_tablet', 'deck'
    screen_class     TEXT,       -- 'Phone', 'Tablet', 'Desktop', 'TV'
    assessed_at      INTEGER,    -- Unix timestamp
    assessment_type  TEXT        -- 'tutorial_01' or 'standalone'
);
```

Percentiles are normalized **within input class** (desktop vs touch phone vs touch tablet vs deck) so touch players are not under-rated against mouse/keyboard baselines.

The skill estimate feeds Layers 2 and 4: hint frequency scales with skill (fewer hints for skilled players), the first skirmish AI difficulty recommendation uses the estimate, and touch tempo guidance can widen/narrow its recommended speed band based on demonstrated comfort.

### Layer 4 — Adaptive Pacing Engine

A background system (no direct UI — it shapes the other layers) that continuously estimates player mastery and adjusts the learning experience.

#### Inputs

- `hint_history` — which hints have been shown, dismissed, or mastered
- `player_skill_estimate` — from the skill assessment
- `gameplay_events` (D031) — actual in-game actions (build orders, APM, unit losses, idle time)
- `experience_profile` — self-identified experience level
- `input_capabilities` / `screen_class` — touch vs mouse/keyboard and phone/tablet layout context
- optional touch friction signals — misclick proxies, selection retries, camera thrash, pause frequency (single-player)

#### Outputs

- **Hint frequency multiplier** — scales the cooldown on all hints. A player demonstrating mastery gets longer cooldowns (fewer hints). A struggling player gets shorter cooldowns (more hints).
- **Difficulty recommendation** — suggested AI difficulty for the next skirmish. Displayed as a tooltip in the lobby AI picker: "Based on your recent games, Normal difficulty is recommended."
- **Feature discovery pacing** — controls how quickly progressive discovery notifications appear (Layer 5 below).
- **Touch tutorial prompt density** — controls how much on-screen guidance is shown for touch platforms (e.g., keep command-rail hints visible slightly longer for new phone players).
- **Recommended tempo band (advisory)** — preferred speed range for the current device/input/skill context. Used by UI warnings only; never changes sim state on its own.
- **Camera bookmark suggestion eligibility** — enables/disables "save camera location" hints based on camera fluency and map scale.
- **Tutorial EVA activation** — in the Allied/Soviet campaigns (not Commander School), first encounters with new unit types or buildings trigger a brief EVA line if the player hasn't completed the relevant Commander School mission. "Construction complete. This is a Radar Dome — it reveals the minimap." Only triggers once per entity type per campaign playthrough.

#### Pacing Algorithm

```
skill_estimate = weighted_average(
    0.3 × selection_speed_percentile,
    0.2 × camera_fluency_percentile,
    0.2 × combat_efficiency_percentile,
    0.15 × recent_apm_trend,           -- from gameplay_events
    0.15 × hint_mastery_rate            -- % of hints mastered vs shown
)

hint_frequency_multiplier = clamp(
    2.0 - (skill_estimate / 50.0),      -- range: 0.0 (no hints) to 2.0 (double frequency)
    min = 0.2,
    max = 2.0
)

recommended_difficulty = match skill_estimate {
    0..25   => "Easy",
    25..50  => "Normal",
    50..75  => "Hard",
    75..100 => "Brutal",
}
```

#### Mobile Tempo Advisor (Client-Only, Advisory)

The adaptive pacing engine also powers a **Tempo Advisor** for touch-first play. This system is intentionally non-invasive:

- **Single-player:** any speed allowed; warnings shown outside the recommended band; one-tap "Return to Recommended"
- **Casual multiplayer (host-controlled):** lobby shows a warning if the selected speed is outside the recommended band for participating touch players
- **Ranked multiplayer:** informational only; speed remains server/queue enforced (D055/D064, see `09b-networking.md`)

Initial default bands (experimental; tune from playtests):

| Context | Recommended Band | Default |
| ------- | ---------------- | ------- |
| Phone (new/average touch) | `slowest`-`normal` | `slower` |
| Phone (high skill estimate + tutorial complete) | `slower`-`faster` | `normal` |
| Tablet | `slower`-`faster` | `normal` |
| Desktop / Deck | unchanged | `normal` |

Commander School on phone/tablet starts at `slower` by default, but players may override it.

The advisor emits local-only analytics events (D031-compatible) such as `mobile_tempo.warning_shown` and `mobile_tempo.warning_dismissed` to validate whether recommendations reduce overload without reducing agency.

This is deterministic and entirely local — no LLM, no network, no privacy concerns. The pacing engine exists in `ic-ui` (not `ic-sim`) because it affects presentation, not simulation.

#### Implementation-Facing Interfaces (Client/UI Layer, No Sim Impact)

These types live in `ic-ui` / `ic-game` client codepaths (not `ic-sim`) and formalize camera bookmarks, semantic prompt resolution, and tempo advice:

```rust
pub struct CameraBookmarkSlot {
    pub slot: u8,                    // 1..=9
    pub label: Option<String>,       // local-only label
    pub world_pos: WorldPos,
    pub zoom_level: Option<FixedPoint>, // optional client camera zoom
}

pub struct CameraBookmarkState {
    pub slots: [Option<CameraBookmarkSlot>; 9],
    pub quick_slots: [u8; 4],        // defaults: [1, 2, 3, 4]
}

pub enum CameraBookmarkIntent {
    Save { slot: u8 },
    Jump { slot: u8 },
    Clear { slot: u8 },
    Rename { slot: u8, label: String },
}

pub enum InputPromptAction {
    Select,
    BoxSelect,
    MoveCommand,
    AttackCommand,
    AttackMoveCommand,
    OpenBuildUi,
    QueueProduction,
    UseMinimap,
    SaveCameraBookmark,
    JumpCameraBookmark,
}

pub struct TutorialPromptContext {
    pub input_capabilities: InputCapabilities,
    pub screen_class: ScreenClass,
    pub advanced_mode: bool,
}

pub struct ResolvedInputPrompt {
    pub text: String,             // localized, device-specific wording
    pub icon_tokens: Vec<String>, // e.g. "tap", "f5", "ctrl+f5"
}

pub struct UiAnchorAlias(pub String); // e.g. "primary_build_ui", "minimap_cluster"

pub enum TempoSpeedLevel {
    Slowest,
    Slower,
    Normal,
    Faster,
    Fastest,
}

pub struct TempoComfortBand {
    pub recommended_min: TempoSpeedLevel,
    pub recommended_max: TempoSpeedLevel,
    pub default_speed: TempoSpeedLevel,
    pub warn_above: Option<TempoSpeedLevel>,
    pub warn_below: Option<TempoSpeedLevel>,
}

pub enum InputSourceKind {
    MouseKeyboard,
    TouchPhone,
    TouchTablet,
    Controller,
}

pub struct TempoAdvisorContext {
    pub screen_class: ScreenClass,
    pub has_touch: bool,
    pub primary_input: InputSourceKind, // advisory classification only
    pub skill_estimate: Option<PlayerSkillEstimate>,
    pub mode: MatchMode,            // SP / casual MP / ranked
}

pub enum TempoWarning {
    AboveRecommendedBand,
    BelowRecommendedBand,
    TouchOverloadRisk,
}

pub struct TempoRecommendation {
    pub band: TempoComfortBand,
    pub warnings: Vec<TempoWarning>,
    pub rationale: Vec<String>,     // short UI strings
}
```

The touch/mobile control layer maps these UI intents to normal `PlayerOrder`s through the existing `InputSource` pipeline. Bookmarks and tempo advice remain local UI state; they never enter the deterministic simulation.

### Layer 5 — Post-Game Learning

After every match, the post-game stats screen (D034) includes a learning section:

#### Rule-Based Tips

YAML-driven pattern matching on `gameplay_events`:

```yaml
# tips/base-game-tips.yaml
tips:
  - id: idle_harvesters
    title: "Keep Your Economy Running"
    positive: false
    condition:
      type: stat_threshold
      stat: idle_harvester_seconds
      threshold: 30
    text: "Your harvesters sat idle for {idle_harvester_seconds} seconds. Idle harvesters mean lost income."
    learn_more: tutorial_04  # links to Commander School Mission 04 (Economy)

  - id: good_micro
    title: "Sharp Micro"
    positive: true
    condition:
      type: stat_threshold
      stat: average_unit_efficiency  # damage dealt / damage taken per unit
      threshold: 1.5
      direction: above
    text: "Your units dealt {ratio}× more damage than they took — strong micro."

  - id: no_tech
    title: "Explore the Tech Tree"
    positive: false
    condition:
      type: never_built
      building_types: [radar_dome, tech_center, battle_lab]
      min_game_length_minutes: 8
    text: "You didn't build any advanced structures. Higher-tech units can turn the tide."
    learn_more: tutorial_07  # links to Commander School Mission 07 (Combined Arms)
```

**Tip selection:** 1–3 tips per game. At least one positive ("you did this well") and at most one improvement ("you could try this"). Tips rotate — the engine avoids repeating the same tip in consecutive games.

#### Annotated Replay Mode

"Watch the moment" links in post-game tips jump to an annotated replay — the replay plays with an overlay highlighting the relevant moment:

```
┌────────────────────────────────────────────────────────────┐
│  REPLAY — ANNOTATED                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │   [Game replay playing at 0.5x speed]               │  │
│  │                                                      │  │
│  │   ┌─────────────────────────────────┐               │  │
│  │   │ 💡 Your harvester sat idle here │               │  │
│  │   │    for 23 seconds while ore was │               │  │
│  │   │    available 3 cells away.      │               │  │
│  │   │    [Return to Stats]            │               │  │
│  │   └─────────────────────────────────┘               │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ◄◄  ►  ►►  │ 4:23 / 12:01 │ 0.5x │                       │
└────────────────────────────────────────────────────────────┘
```

The annotation data is generated at match end (not during gameplay — no sim overhead). It's a list of `(tick, position, text)` tuples stored alongside the replay file.

#### Progressive Feature Discovery

Milestone-based main menu notifications that surface features over the player's first weeks:

| Milestone              | Feature Suggested   | Notification                                                               |
| ---------------------- | ------------------- | -------------------------------------------------------------------------- |
| First game completed   | Replays             | "Your game was saved as a replay. Watch it from the Replays menu."         |
| 3 games completed      | Experience profiles | "Did you know? You can switch gameplay presets in Settings → QoL."         |
| First multiplayer game | Ranked play         | "Ready for a challenge? Ranked matches calibrate your skill rating."       |
| 5 games completed      | Workshop            | "The Workshop has community maps, mods, and campaigns. Browse it anytime." |
| Commander School done  | Training mode       | "Try training mode to practice against AI with custom settings."           |
| 10 games completed     | Console             | "Press Enter and type / to access console commands."                       |
| First mod installed    | Mod profiles        | "Create mod profiles to switch between different mod setups quickly."      |

Maximum one notification per session. Three dismissals of the same category = never again. Discovery state stored in `hint_history` SQLite table (reuses the same suppression infrastructure as Layer 2).

`/discovery` console commands (D058): `/discovery list`, `/discovery reset`, `/discovery trigger <milestone>`.

### Tutorial Lua Global API

The `Tutorial` global is an IC-exclusive Lua extension available in all game modes (not just Commander School). Modders use it to build tutorial sequences in their own campaigns and scenarios.

```lua
-- === Step Management ===

-- Define and activate a tutorial step. The step is displayed as a hint overlay
-- and tracked for completion. Only one step can be active at a time.
-- Calling SetStep while a step is active replaces it.
Tutorial.SetStep(step_id, {
    title = "Step Title",                    -- displayed in the hint overlay header
    hint = "Instructional text for the player", -- main body text
    hint_action = "move_command",            -- optional semantic prompt token; renderer
                                             -- resolves to device-specific wording/icons
    focus_area = position_or_region,         -- optional: camera pans to this location
    highlight_ui = "ui_element_id",          -- optional: logical UI target or semantic alias
    eva_line = "eva_sound_id",               -- optional: play an EVA voice line
    completion = {                           -- when is this step "done"?
        type = "action",                     -- "action", "kill", "kill_all", "build",
                                             -- "select", "move_to", "research", "custom"
        action = "attack_move",              -- specific action to detect
        -- OR:
        count = 3,                           -- for "kill": kill N enemies
        -- OR:
        unit_type = "power_plant",           -- for "build": build this structure
        -- OR:
        lua_condition = "CheckCustomGoal()", -- for "custom": Lua expression
    },
})

-- Query the currently active step ID (nil if no step active)
local current = Tutorial.GetCurrentStep()

-- Manually complete the current step (triggers OnStepComplete)
Tutorial.CompleteStep()

-- Skip the current step without triggering completion
Tutorial.SkipStep()

-- === Hint Display ===

-- Show a one-shot hint (not tied to a step). Useful for contextual tips
-- within a mission script without the full step tracking machinery.
Tutorial.ShowHint(text, {
    title = "Optional Title",        -- nil = no title bar
    duration = 8,                    -- seconds before auto-dismiss (0 = manual dismiss only)
    position = "near_unit",          -- "near_unit", "near_building", "screen_top",
                                     -- "screen_center", "near_sidebar", position_table
    icon = "hint_icon_id",           -- optional icon
    eva_line = "eva_sound_id",       -- optional EVA line
    dismissable = true,              -- show dismiss button (default: true)
})

-- Show a hint anchored to a specific actor (follows the actor on screen)
Tutorial.ShowActorHint(actor, text, options)

-- Show a one-shot hint using a semantic action token. The renderer chooses
-- desktop/touch wording (e.g., "Right-click" vs "Tap") and icon glyphs.
Tutorial.ShowActionHint(action_name, {
    title = "Optional Title",
    highlight_ui = "ui_element_id",   -- logical UI target or semantic alias
    duration = 8,
})

-- Dismiss all currently visible hints
Tutorial.DismissAllHints()

-- === Camera & Focus ===

-- Smoothly pan the camera to a position or region
Tutorial.FocusArea(position_or_region, {
    duration = 1.5,                  -- pan duration in seconds
    zoom = 1.0,                      -- optional zoom level (1.0 = default)
    lock = false,                    -- if true, player can't move camera until unlock
})

-- Release a camera lock set by FocusArea
Tutorial.UnlockCamera()

-- === UI Highlighting ===

-- Highlight a UI element with a pulsing glow effect
Tutorial.HighlightUI(element_id, {
    style = "pulse",                 -- "pulse", "arrow", "outline", "dim_others"
    duration = 0,                    -- seconds (0 = until manually cleared)
    text = "Click here",             -- optional tooltip on the highlight
})

-- Clear a specific highlight
Tutorial.ClearHighlight(element_id)

-- Clear all highlights
Tutorial.ClearAllHighlights()

-- === Restrictions (for teaching pacing) ===

-- Disable sidebar/building (player can't construct until enabled)
Tutorial.RestrictSidebar(enabled)

-- Restrict which unit types the player can build
Tutorial.RestrictBuildOptions(allowed_types)  -- e.g., {"power_plant", "barracks"}

-- Restrict which orders the player can issue
Tutorial.RestrictOrders(allowed_orders)  -- e.g., {"move", "stop", "attack"}

-- Clear all restrictions
Tutorial.ClearRestrictions()

-- === Progress Tracking ===

-- Check if the player has demonstrated a skill (from campaign state flags)
local knows_groups = Tutorial.HasSkill("assign_control_group")

-- Get the number of times a specific hint has been shown (from hint_history)
local shown = Tutorial.GetHintShowCount("idle_harvester")

-- Check if a specific Commander School mission has been completed
local passed = Tutorial.IsMissionComplete("tutorial_04")

-- === Callbacks ===

-- Register a callback for when a step completes
-- (also available as the global OnStepComplete function)
Tutorial.OnStepComplete(function(step_id)
    -- step_id is the string passed to SetStep
end)

-- Register a callback for when the player performs a specific action
Tutorial.OnAction(action_name, function(context)
    -- context contains details: { actor = ..., target = ..., position = ... }
end)
```

#### UI Element IDs and Semantic Aliases for HighlightUI

The `element_id` parameter refers to logical UI element names (not internal Bevy entity IDs). These IDs may be:

1. **Concrete logical element IDs** (stable names for a specific surface, e.g. `attack_move_button`)
2. **Semantic UI aliases** resolved by the active layout profile (desktop sidebar vs phone build drawer)

This allows a single tutorial step to say "highlight the primary build UI" while the renderer picks the correct widget for `ScreenClass::Desktop`, `ScreenClass::Tablet`, or `ScreenClass::Phone`.

| Element ID            | What It Highlights                                           |
| --------------------- | ------------------------------------------------------------ |
| `sidebar`             | The entire build sidebar                                     |
| `sidebar_building`    | The building tab of the sidebar                              |
| `sidebar_unit`        | The unit tab of the sidebar                                  |
| `sidebar_item:<type>` | A specific buildable item (e.g., `sidebar_item:power_plant`) |
| `build_drawer`        | Phone build drawer (collapsed/expanded production UI)        |
| `minimap`             | The minimap                                                  |
| `minimap_cluster`     | Touch minimap cluster (minimap + alerts + bookmark dock)     |
| `command_bar`         | The unit command bar (move, stop, attack, etc.)              |
| `control_group_bar`   | Bottom control-group strip (desktop or touch)                |
| `command_rail`        | Touch command rail (attack-move/guard/force-fire, etc.)      |
| `command_rail_slot:<action>` | Specific touch command-rail slot (e.g., `command_rail_slot:attack_move`) |
| `attack_move_button`  | The attack-move button specifically                          |
| `deploy_button`       | The deploy button                                            |
| `guard_button`        | The guard button                                             |
| `money_display`       | The credits/resource counter                                 |
| `power_bar`           | The power supply/demand indicator                            |
| `radar_toggle`        | The radar on/off button                                      |
| `sell_button`         | The sell (wrench/dollar) button                              |
| `repair_button`       | The repair button                                            |
| `camera_bookmark_dock` | Touch bookmark quick dock (phone/tablet minimap cluster)    |
| `camera_bookmark_slot:<n>` | A specific bookmark slot (e.g., `camera_bookmark_slot:1`) |

Modders can register custom UI element IDs for custom UI panels via `Tutorial.RegisterUIElement(id, description)`.

**Semantic UI alias examples (built-in):**

| Alias | Desktop | Tablet | Phone |
| ----- | ------- | ------ | ----- |
| `primary_build_ui` | `sidebar` | `sidebar` | `build_drawer` |
| `minimap_cluster` | `minimap` | `minimap` | `minimap` (plus bookmark dock/alerts cluster) |
| `bottom_control_groups` | `command_bar` / HUD bar region | touch group bar | touch group bar |
| `command_rail_attack_move` | `attack_move_button` | command rail A-move slot | command rail A-move slot |
| `tempo_speed_picker` | lobby speed dropdown | same | mobile speed picker + advisory chip |

The alias-to-element mapping is provided by the active UI layout profile (`ic-ui`) and keyed by `ScreenClass` + `InputCapabilities`.

### Tutorial Achievements (D036)

| Achievement         | Condition                                           | Icon |
| ------------------- | --------------------------------------------------- | ---- |
| **Graduate**        | Complete Commander School (missions 01–09)          | 🎓    |
| **Honors Graduate** | Complete Commander School with zero retries         | 🏅    |
| **Quick Study**     | Complete Commander School in under 45 minutes total | ⚡    |
| **Helping Hand**    | Complete a community-made tutorial campaign         | 🤝    |

These are engine-defined achievements (not mod-defined). They use the D036 achievement system and sync with Steam achievements for Steam builds.

### Multiplayer Onboarding

First time clicking **Multiplayer** from the main menu, a welcome overlay appears (see `17-PLAYER-FLOW.md` for the full layout):

- Explains relay server model (no host advantage)
- Suggests: casual game first → ranked → spectate
- "Got it, let me play" dismisses permanently
- Stored in `hint_history` as `mp_welcome_dismissed`

After the player's first multiplayer game, a brief overlay explains the post-game stats and rating system if ranked.

### Modder Tutorial API — Custom Tutorial Campaigns

The entire tutorial infrastructure is available to modders. A modder creating a total conversion or a complex mod with novel mechanics can build their own Commander School equivalent:

1. **Campaign YAML:** Use `category: tutorial` in the campaign definition. The campaign appears under `Campaign → Tutorial` in the main menu.
2. **Tutorial Lua API:** All `Tutorial.*` functions work in any campaign or scenario, not just the built-in Commander School. Call `Tutorial.SetStep()`, `Tutorial.ShowHint()`, `Tutorial.HighlightUI()`, etc.
3. **Custom hints:** Add a `hints.yaml` to the mod directory. Hints are merged with the base game hints at load time. Mod hints can reference mod-specific unit types, building types, and actions.
4. **Custom trigger types:** Define custom triggers via Lua using the `custom` trigger type in `hints.yaml`, or register a full trigger type via WASM (Tier 3).
5. **Scenario editor modules:** Use the Tutorial Step and Tutorial Hint modules (D038) to build tutorial sequences visually without writing Lua.

#### End-to-End Example: Modder Tutorial Campaign

A modder creating a "Chrono Warfare" mod with a time-manipulation mechanic wants a 3-mission tutorial introducing the new features:

```yaml
# mods/chrono-warfare/campaigns/tutorial/campaign.yaml
campaign:
  id: chrono_tutorial
  title: "Chrono Warfare — Basic Training"
  description: "Learn the new time-manipulation abilities"
  start_mission: chrono_01
  category: tutorial
  requires_mod: chrono-warfare

  missions:
    chrono_01:
      map: missions/chrono-tutorial/01-temporal-basics
      briefing: briefings/chrono-01.yaml
      outcomes:
        pass: { next: chrono_02 }
        skip: { next: chrono_02 }

    chrono_02:
      map: missions/chrono-tutorial/02-chrono-shift
      briefing: briefings/chrono-02.yaml
      outcomes:
        pass: { next: chrono_03 }
        skip: { next: chrono_03 }

    chrono_03:
      map: missions/chrono-tutorial/03-time-bomb
      briefing: briefings/chrono-03.yaml
      outcomes:
        pass: { description: "Training complete" }
```

```lua
-- mods/chrono-warfare/missions/chrono-tutorial/01-temporal-basics.lua

function OnMissionStart()
    -- Restrict everything except the new mechanic
    Tutorial.RestrictSidebar(true)
    Tutorial.RestrictOrders({"move", "stop", "chrono_freeze"})

    -- Step 1: Introduce the Chrono Freeze ability
    Tutorial.SetStep("learn_freeze", {
        title = "Temporal Freeze",
        hint = "Your Chrono Trooper can freeze enemies in time. " ..
               "Select the trooper and use the Chrono Freeze ability on the enemy tank.",
        focus_area = enemy_tank_position,
        highlight_ui = "sidebar_item:chrono_freeze",
        eva_line = "chrono_tech_available",
        completion = { type = "action", action = "chrono_freeze" }
    })
end

function OnStepComplete(step_id)
    if step_id == "learn_freeze" then
        Tutorial.ShowHint("The enemy tank is frozen in time for 10 seconds. " ..
                          "Frozen units can't move, shoot, or be damaged.", {
            duration = 6,
            position = "near_unit",
        })

        Trigger.AfterDelay(DateTime.Seconds(8), function()
            Tutorial.SetStep("destroy_frozen", {
                title = "Shatter the Frozen",
                hint = "When the freeze ends, the target takes bonus damage for 3 seconds. " ..
                       "Attack the tank right as the freeze expires!",
                completion = { type = "kill", count = 1 }
            })
        end)

    elseif step_id == "destroy_frozen" then
        Campaign.complete("pass")
    end
end
```

```yaml
# mods/chrono-warfare/hints/chrono-hints.yaml
hints:
  - id: chrono_freeze_ready
    title: "Chrono Freeze Available"
    text: "Your Chrono Trooper's freeze ability is ready. Use it on high-value targets."
    category: mod_specific
    trigger:
      type: building_ready
      building_type: "chrono_trooper"
      ability: "chrono_freeze"
      first_time: true
    suppression:
      mastery_action: use_chrono_freeze
      mastery_threshold: 3
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: high
    position: near_unit
```

### Campaign Pedagogical Pacing Guidelines

For the built-in Allied and Soviet campaigns (not Commander School), IC follows these pacing guidelines to ensure the official campaigns serve as gentle second-layer tutorials:

1. **One new mechanic per mission maximum.** Mission 1 introduces movement. Mission 2 adds combat. Mission 3 adds base building. Never two new systems in the same mission.
2. **Tutorial EVA lines for first encounters.** The first time the player builds a new structure type or encounters a new enemy unit type, EVA provides a brief explanation — but only if the player hasn't completed the relevant Commander School lesson. This is context-sensitive, not a lecture.
3. **Safe-to-fail early missions.** The first 3 missions of each campaign have generous time limits, weak enemies, and no base-building pressure. The player can explore at their own pace.
4. **No mechanic is required without introduction.** If Mission 7 requires naval combat, Mission 6 introduces shipyards in a low-pressure scenario.
5. **Difficulty progression: linear, not spiked.** No "brick wall" missions. If a mission has a significant difficulty increase, it offers a remedial branch (D021 campaign graph).

These guidelines apply to modders creating campaigns intended for the `category: campaign` (not `category: tutorial`). They're documented here rather than enforced by the engine — modders can choose to follow or ignore them.

### Cross-References

- **D004 (Lua Scripting):** `Tutorial` is a Lua global, part of the IC-exclusive API extension set (see `04-MODDING.md` § IC-exclusive extensions).
- **D021 (Branching Campaigns):** Commander School's branching graph (with remedial branches) uses the standard D021 campaign system. Tutorial campaigns are campaigns — they use the same YAML format, Lua API, and campaign graph engine.
- **D033 (QoL Toggles):** Experience profiles control hint defaults. Individual hint categories are toggleable. The D033 QoL panel exposes hint frequency settings.
- **D034 (SQLite):** `hint_history`, `player_skill_estimate`, and discovery state in `player.db`. Tip display history also in SQLite.
- **D036 (Achievements):** Graduate, Honors Graduate, Quick Study, Helping Hand. Engine-defined, Steam-synced.
- **D038 (Scenario Editor):** Tutorial Step and Tutorial Hint modules enable visual tutorial creation without Lua. See D038's module library.
- **D043 (AI Behavior Presets):** Tutorial AI tier sits below Easy difficulty. It's Lua-scripted per mission, not a general-purpose AI.
- **D058 (Command Console):** `/hints` and `/discovery` console commands for hint management and discovery milestone control.
- **D070 (Asymmetric Commander & Field Ops Co-op):** D065 provides role onboarding overlays and role-aware Quick Reference surfaces using the same semantic input action catalog and prompt renderer.
- **D069 (Installation & First-Run Setup Wizard):** D069 hands off to D065 after content is playable (experience profile gate + controls walkthrough offer) and reuses D065 prompt/Quick Reference systems during setup and post-update control changes.
- **D031 (Telemetry):** New player pipeline emits `onboarding.step` telemetry events. Hint shows/dismissals are tracked in `gameplay_events` for UX analysis.
- **`17-PLAYER-FLOW.md`:** Full player flow mockups for all five tutorial layers, including the self-identification screen, Commander School entry, multiplayer onboarding, and post-game tips.
- **`08-ROADMAP.md`:** Phase 3 deliverables (hint system, new player pipeline, progressive discovery), Phase 4 deliverables (Commander School, skill assessment, post-game learning, tutorial achievements).

---

---
