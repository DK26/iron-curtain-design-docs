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

  # --- IC-specific hints for returning veterans ---
  # These fire for ra_veteran and openra_player profiles to surface
  # IC features that break classic RA muscle memory.

  - id: ic_rally_points
    title: "Rally Points"
    text: "IC adds rally points — right-click the ground with a factory selected to send new units there automatically."
    category: ic_new_feature
    icon: hint_rally
    trigger:
      type: building_ready
      building_type: "barracks"   # also war_factory, naval_yard, etc.
      first_time: true
    suppression:
      mastery_action: set_rally_point
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [ra_veteran, rts_player]
    priority: high
    position: near_building

  - id: ic_attack_move
    title: "Attack-Move Available"
    text: "IC enables attack-move by default. Press A then click the ground — your units will engage anything along the way."
    category: ic_new_feature
    icon: hint_hotkey
    trigger:
      type: unit_count
      condition: ">= 3"
      without_action: attack_move
      sustained_seconds: 120
    suppression:
      mastery_action: attack_move
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [ra_veteran]
    priority: medium
    position: screen_top

  - id: ic_unit_stances
    title: "Unit Stances"
    text: "IC units have stances (Aggressive / Defensive / Hold / Return Fire). Aggressive units chase enemies — set Defensive to keep units in position."
    category: ic_new_feature
    icon: hint_stance
    trigger:
      type: damage_taken
      damage_source_type: any
      threshold_percent: 20     # player loses 20% of a unit's health
    suppression:
      mastery_action: change_unit_stance
      mastery_threshold: 1
      cooldown_seconds: 600
      max_shows: 2
    experience_profiles: [ra_veteran, openra_player]
    priority: medium
    position: near_unit

  - id: ic_weather_change
    title: "Weather Effects"
    text: "Weather changes affect gameplay — snow slows ground units, ice makes water crossable. Plan routes accordingly."
    category: ic_new_feature
    icon: hint_weather
    trigger:
      type: custom
      lua_condition: "Weather.HasChangedThisMatch()"
    suppression:
      mastery_action: null      # no mastery action — show once per profile
      mastery_threshold: 0
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: high
    position: screen_top
    eva_line: weather_advisory

  - id: ic_parallel_factories
    title: "Parallel Production"
    text: "Each factory produces independently in IC. Build two War Factories to double your vehicle output."
    category: ic_new_feature
    icon: hint_production
    trigger:
      type: building_ready
      building_type: "war_factory"
      first_time: false          # fires on second factory completion
    suppression:
      mastery_action: null
      mastery_threshold: 0
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [ra_veteran]
    priority: medium
    position: near_building

  - id: ic_veterancy_promotion
    title: "Unit Promoted"
    text: "Your unit earned a promotion! Veteran units deal more damage and take less. Keep experienced units alive."
    category: ic_new_feature
    icon: hint_veterancy
    trigger:
      type: custom
      lua_condition: "Player.HasUnitWithCondition('GoodGuy', 'veteran')"
    suppression:
      mastery_action: null
      mastery_threshold: 0
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: medium
    position: near_unit
    eva_line: unit_promoted

  - id: ic_smart_select
    title: "Smart Selection"
    text: "Drag-selecting groups skips harvesters automatically. Click a harvester directly to select it."
    category: ic_new_feature
    icon: hint_selection
    trigger:
      type: custom
      lua_condition: "Player.BoxSelectedWithHarvestersExcluded()"
    suppression:
      mastery_action: select_harvester_direct
      mastery_threshold: 1
      cooldown_seconds: 300
      max_shows: 2
    experience_profiles: [ra_veteran, openra_player]
    priority: low
    position: screen_top

  - id: ic_render_toggle
    title: "Render Mode"
    text: "Press F1 to cycle between Classic, HD, and 3D render modes — try it anytime during gameplay."
    category: ic_new_feature
    icon: hint_display
    trigger:
      type: time_without_action
      action: toggle_render_mode
      time_minutes: 10
      min_game_time_minutes: 2
    suppression:
      mastery_action: toggle_render_mode
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [ra_veteran, new_to_rts, rts_player]
    priority: low
    position: screen_top

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

