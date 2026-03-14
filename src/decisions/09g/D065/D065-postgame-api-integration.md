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
    learn_more: null  # no dedicated tutorial mission — player discovers tech tree through play
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

Feature discovery notifications surface game features over the player's first weeks. Rather than hardcoded milestone logic, these are expressed as `feature_discovery` hints in `hints/feature-tips.yaml` using UI-context triggers (`ui_feature_unused`, `ui_screen_enter`). This unifies all hint delivery through the Layer 2 pipeline.

The following milestones map to `feature_discovery` YAML hints:

| Milestone              | Feature Suggested   | Hint ID                    | Trigger Mapping                                                   |
| ---------------------- | ------------------- | -------------------------- | ----------------------------------------------------------------- |
| First game completed   | Replays             | `menu_replays_discovery`   | `ui_feature_unused: replays, sessions_without_use: 3`             |
| 3 games completed      | Experience profiles | `settings_experience_profile` | `ui_element_focus: experience_profile_selector, dwell_seconds: 5` |
| First multiplayer game | Ranked play         | `profile_rating`           | `ui_element_focus: rating_display, dwell_seconds: 5`              |
| 5 games completed      | Workshop            | `menu_workshop_discovery`  | `ui_feature_unused: workshop, sessions_without_use: 5`            |
| Commander School done  | Training mode       | (Layer 5 post-game tip)    | Post-game learning link to AI customization                       |
| 10 games completed     | Console             | `menu_console_discovery`   | `ui_feature_unused: console, sessions_without_use: 10`            |
| First mod installed    | Mod profiles        | `workshop_mod_profiles`    | `ui_screen_enter: mod_profile_manager, first_time: true`          |

Maximum one `feature_discovery` notification per session. Three dismissals of hints in the `feature_discovery` category = disable the category (equivalent to the old "never again" rule). Discovery state is stored in the standard `hint_history` SQLite table.

`/discovery` console commands (D058): `/discovery list`, `/discovery reset`, `/discovery trigger <hint_id>`.

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

**Per-mission achievements (dopamine-first pacing):** Every Commander School mission awards an achievement on completion. This is the reward loop — the player feels they're collecting milestones, not completing homework.

| Achievement              | Condition                                           | Icon |
| ------------------------ | --------------------------------------------------- | ---- |
| **First Blood**          | Complete mission 01 (first combat)                 | 🩸    |
| **Base Builder**         | Complete mission 02 (first base construction)      | 🏗️    |
| **Supply Officer**       | Complete mission 03 (economy)                      | 💰    |
| **Commanding Officer**   | Complete mission 04 (control groups/shortcuts)     | ⌨️    |
| **Iron Curtain**         | Complete mission 05 (capstone skirmish)            | 🎖️    |
| **Graduate**             | Complete Commander School (missions 01–06)         | 🎓    |
| **Honors Graduate**      | Complete Commander School with zero retries        | 🏅    |
| **Quick Study**          | Complete Commander School in under 30 minutes      | ⚡    |
| **Helping Hand**         | Complete a community-made tutorial campaign        | 🤝    |

These are engine-defined achievements (not mod-defined). They use the D036 achievement system and sync with Steam achievements for Steam builds. The per-mission achievements are deliberately generous — every player who finishes a mission gets one. The meta-achievements (Graduate, Honors, Quick Study) reward completion and mastery.

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
