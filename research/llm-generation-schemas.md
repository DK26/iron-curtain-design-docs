# LLM Generation Schemas — Output Formats, Prompt Templates & Validation

> **Purpose:** Concrete output schemas, prompt templates, validation passes, and prompt strategy integration for all IC LLM features.

**Date:** 2026-02-26
**Referenced by:** D016, D044, D047

---

## Table of Contents

1. [Mission Map YAML Schema](#1-mission-map-yaml-schema)
2. [Actor Placement Schema](#2-actor-placement-schema)
3. [Objective Schema](#3-objective-schema)
4. [Named Outcomes Schema](#4-named-outcomes-schema)
5. [LLM-Generated Lua Triggers](#5-llm-generated-lua-triggers)
6. [Validation Pass Specification](#6-validation-pass-specification)
7. [Mission Generation Prompt Template](#7-mission-generation-prompt-template)
8. [Campaign Skeleton Generation Prompt](#8-campaign-skeleton-generation-prompt)
9. [D044 Orchestrator: Game State to Prompt Serialization](#9-d044-orchestrator-game-state-to-prompt-serialization)
10. [Coaching Prompt Template (D042)](#10-coaching-prompt-template-d042)
11. [Prompt Strategy Profile Integration (D047)](#11-prompt-strategy-profile-integration-d047)
12. [Error Recovery Prompts](#12-error-recovery-prompts)
13. [Intent Interpretation Prompt Template](#13-intent-interpretation-prompt-template)
14. [Narrative Seed Schema](#14-narrative-seed-schema)

---

## 1. Mission Map YAML Schema

The LLM generates terrain **features** (rivers, bridges, forests, cliffs, roads), not individual tiles. IC's map generator interprets features into tiles using the game module's terrain system. This keeps LLM output high-level and game-module-agnostic — the same feature list produces correct RA1 tiles or TD tiles depending on the active module.

**Zones** define logical areas used for actor placement, trigger regions, and objective targets. The LLM names zones; the map generator resolves them to world coordinates.

### Feature Types

| Feature Type | Fields | Description |
|---|---|---|
| `river` | `from_zone`, `to_zone`, `width` (narrow/medium/wide), `crossable` (bool) | Water feature flowing between zones. Width affects tile count. Non-crossable rivers require bridges or naval transport. |
| `bridge` | `zone`, `orientation` (north_south/east_west), `destructible` (bool) | Crossing point over a river or chasm. Destructible bridges can be targeted by demolition objectives. |
| `forest` | `zone`, `density` (sparse/medium/dense), `radius` | Tree cover providing concealment. Dense forests block vehicles. Radius is in zone-relative units (small/medium/large). |
| `cliff` | `from_zone`, `to_zone`, `height` (low/medium/high), `passable` (bool) | Elevation change. High cliffs block all ground movement. Low cliffs slow infantry only. |
| `road` | `from_zone`, `to_zone`, `type` (dirt/paved/highway) | Movement speed bonus path. Paved roads give highest bonus. Connects zones for pathfinding. |
| `hill` | `zone`, `elevation` (low/medium/high), `radius` | Elevated terrain providing sight range bonus. High hills affect projectile trajectories. |
| `water_body` | `zone`, `type` (lake/ocean/swamp), `radius` | Open water area. Lakes block ground units. Swamps slow all ground movement. Ocean enables naval units. |
| `structure_ruin` | `zone`, `density` (light/heavy), `radius` | Destroyed urban terrain. Provides partial cover. Heavy ruins block vehicles. |
| `minefield` | `zone`, `density` (light/heavy), `radius`, `faction` (player/enemy/neutral) | Pre-placed mines. Visible to owning faction only. Density affects damage frequency. |
| `ore_field` | `zone`, `richness` (poor/standard/rich), `radius` | Resource deposit. Richness determines total harvestable value. |

### Full Annotated YAML Example

```yaml
# ============================================================
# Mission Map Definition — LLM-Generated
# ============================================================
# This file defines a mission map at the feature level.
# The map generator converts features into tiles using the
# active game module's terrain system.
# ============================================================

mission_map:
  # --- Metadata ---
  id: gen_mission_008_bridge_assault
  title: "The Bridge at Danzig"
  description: >
    Soviet forces must cross the Vistula River and secure the
    bridge at Danzig before Allied demolition teams destroy it.
  author: llm_generated
  generation_timestamp: "2026-02-14T14:30:00Z"

  # --- Map Configuration ---
  map_size: 128x128                # tile dimensions (64x64, 128x128, 256x256)
  theater: temperate               # temperate, snow, desert, interior, urban
  terrain_seed: 48291              # deterministic PRNG seed for tile variation
  lighting: overcast               # clear, overcast, dawn, dusk, night
  weather_initial: light_rain      # D022 weather state at mission start

  # --- Features ---
  # Each feature is interpreted by the map generator into tiles.
  # Zone references must match entries in the zones list below.
  features:
    - type: river
      id: vistula_river
      from_zone: south_bank
      to_zone: north_bank
      width: wide                  # ~8-12 tiles across
      crossable: false             # requires bridge or naval transport
      flow_direction: west_to_east

    - type: bridge
      id: danzig_bridge
      zone: bridge_crossing
      orientation: north_south
      destructible: true           # can be destroyed — affects objectives
      width: 2                     # 2-lane bridge (allows vehicle traffic)

    - type: forest
      id: southern_woods
      zone: staging_area
      density: dense
      radius: large                # covers most of the staging_area zone

    - type: cliff
      id: river_bluffs
      from_zone: north_bank
      to_zone: enemy_heights
      height: medium
      passable: false              # infantry cannot climb; must go around

    - type: road
      id: highway_south
      from_zone: player_start
      to_zone: bridge_crossing
      type: paved

    - type: road
      id: highway_north
      from_zone: bridge_crossing
      to_zone: enemy_base
      type: paved

    - type: hill
      id: observation_hill
      zone: south_overlook
      elevation: high
      radius: small

    - type: ore_field
      id: southern_ore
      zone: staging_area
      richness: standard
      radius: medium

    - type: ore_field
      id: northern_ore
      zone: enemy_expansion
      richness: rich
      radius: medium

    - type: structure_ruin
      id: danzig_outskirts
      zone: town_ruins
      density: heavy
      radius: large

    - type: minefield
      id: bridge_approach_mines
      zone: bridge_approach
      density: heavy
      radius: small
      faction: enemy

    - type: water_body
      id: coastal_inlet
      zone: naval_approach
      type: ocean
      radius: large

  # --- Zones ---
  # Logical areas used for actor placement, triggers, and objectives.
  # The map generator assigns world-coordinate bounds to each zone
  # based on its position hint and the feature layout.
  zones:
    - id: player_start
      position_hint: south_center  # compass-relative hint for the generator
      size_hint: medium            # small, medium, large
      description: "Player deployment zone — southern map edge"

    - id: staging_area
      position_hint: south_west
      size_hint: large
      description: "Forested staging area with ore field"

    - id: south_overlook
      position_hint: south_east
      size_hint: small
      description: "High ground overlooking the river"

    - id: south_bank
      position_hint: center_south
      size_hint: medium
      description: "Southern river bank — approach to bridge"

    - id: bridge_approach
      position_hint: center_south
      size_hint: small
      description: "Mined approach to the bridge"

    - id: bridge_crossing
      position_hint: center
      size_hint: small
      description: "The bridge itself — key objective location"

    - id: north_bank
      position_hint: center_north
      size_hint: medium
      description: "Northern river bank — enemy side"

    - id: town_ruins
      position_hint: north_center
      size_hint: large
      description: "Ruined outskirts of Danzig"

    - id: enemy_heights
      position_hint: north_east
      size_hint: medium
      description: "Elevated enemy defensive position"

    - id: enemy_base
      position_hint: north_west
      size_hint: large
      description: "Main Allied base — mission target"

    - id: enemy_expansion
      position_hint: north_east
      size_hint: medium
      description: "Allied secondary base with rich ore"

    - id: naval_approach
      position_hint: east
      size_hint: large
      description: "Coastal waters — alternative naval approach"

    - id: demolition_camp
      position_hint: center_east
      size_hint: small
      description: "Allied demolition team staging area near bridge"
```

---

## 2. Actor Placement Schema

Actors are organized by allegiance: `player_forces`, `enemy_forces`, and `neutral`. Each actor entry specifies **what** to place, **where**, and **how** — giving the map generator enough information to produce a valid, playable scenario without the LLM needing to know exact tile coordinates.

### Placement Modes

| Mode | Behavior |
|---|---|
| `spread` | Units distributed evenly across the zone. Good for patrols and garrisons. |
| `clustered` | Units grouped tightly at the zone center. Good for strike forces and convoys. |
| `formation` | Units arranged in a military formation (line, wedge, column). Formation type inferred from unit types. |
| `perimeter` | Units placed along the zone boundary. Good for defensive positions. |
| `random` | Units placed at random positions within the zone. Good for scattered resistance. |

### AI Behavior Types

| Behavior | Description |
|---|---|
| `guard` | Hold position, engage enemies within range. |
| `patrol` | Move along patrol_route, engage enemies encountered. |
| `hunt` | Actively seek and destroy player units. |
| `retreat_when_damaged` | Engage but retreat to a fallback zone when health drops below 50%. |
| `demolition` | Move to target and destroy it (used for demo teams). |
| `scripted` | Behavior controlled entirely by Lua triggers. |
| `passive` | Do not engage unless attacked. |

### Full Annotated YAML Example

```yaml
# ============================================================
# Actor Placement — LLM-Generated
# ============================================================

actors:
  # --- Player Forces ---
  # Units the player starts with. Placed in player-controlled zones.
  player_forces:
    - type: medium_tank
      count: 6
      zone: player_start
      placement: formation          # arranged in a column facing north
      veterancy: veteran            # none, rookie, veteran, elite
      group_id: 1                   # ctrl-group assignment for player convenience

    - type: heavy_tank
      count: 2
      zone: player_start
      placement: formation
      veterancy: elite
      group_id: 1

    - type: rifle_infantry
      count: 12
      zone: player_start
      placement: clustered
      veterancy: none
      group_id: 2

    - type: engineer
      count: 3
      zone: player_start
      placement: clustered
      veterancy: none
      group_id: 3

    - type: mcv
      count: 1
      zone: staging_area
      placement: clustered
      veterancy: none
      note: "Mobile Construction Vehicle — player can establish a base"

    - type: spy
      count: 1
      zone: player_start
      placement: clustered
      veterancy: veteran
      note: "For infiltrating the demolition camp"

    # Named character — carries over from previous missions (D021 roster)
    - type: commando
      count: 1
      zone: player_start
      placement: clustered
      veterancy: elite
      named_character: "Sergeant Volkov"
      ai_behavior: null             # player-controlled; no AI behavior
      invulnerable: false           # can die — permanent campaign consequence

  # --- Enemy Forces ---
  # Allied forces defending the bridge and northern territory.
  enemy_forces:
    # Bridge defense garrison
    - type: pillbox
      count: 4
      zone: bridge_crossing
      placement: perimeter
      ai_behavior: guard

    - type: rifle_infantry
      count: 8
      zone: bridge_crossing
      placement: spread
      ai_behavior: guard

    - type: light_tank
      count: 3
      zone: north_bank
      placement: spread
      ai_behavior: patrol
      patrol_route:
        - north_bank
        - bridge_crossing
        - north_bank

    # Demolition team — key threat to the bridge objective
    - type: engineer
      count: 3
      zone: demolition_camp
      placement: clustered
      ai_behavior: demolition
      demolition_target: danzig_bridge
      activation_trigger: demo_timer # activated by Lua trigger after 8 minutes

    # Heights defense — overlooks the river
    - type: artillery
      count: 2
      zone: enemy_heights
      placement: spread
      ai_behavior: guard

    - type: anti_air
      count: 2
      zone: enemy_heights
      placement: spread
      ai_behavior: guard

    - type: rifle_infantry
      count: 6
      zone: enemy_heights
      placement: perimeter
      ai_behavior: guard

    # Main base garrison
    - type: medium_tank
      count: 4
      zone: enemy_base
      placement: spread
      ai_behavior: hunt             # actively seeks player when alerted
      activation_trigger: base_alert

    - type: heavy_tank
      count: 2
      zone: enemy_base
      placement: clustered
      ai_behavior: hunt
      activation_trigger: base_alert

    - type: construction_yard
      count: 1
      zone: enemy_base
      placement: clustered
      ai_behavior: null             # building — no behavior

    - type: war_factory
      count: 1
      zone: enemy_base
      placement: clustered
      ai_behavior: null

    - type: barracks
      count: 1
      zone: enemy_base
      placement: clustered
      ai_behavior: null

    - type: power_plant
      count: 2
      zone: enemy_base
      placement: spread
      ai_behavior: null

    - type: ore_refinery
      count: 1
      zone: enemy_expansion
      placement: clustered
      ai_behavior: null

    - type: ore_truck
      count: 2
      zone: enemy_expansion
      placement: spread
      ai_behavior: null             # automated harvesting behavior is engine default

    # Patrol forces — mobile defense between base and bridge
    - type: apc
      count: 2
      zone: town_ruins
      placement: spread
      ai_behavior: patrol
      patrol_route:
        - town_ruins
        - north_bank
        - enemy_base
        - town_ruins

    - type: attack_dog
      count: 4
      zone: town_ruins
      placement: random
      ai_behavior: hunt             # dogs actively hunt infiltrators

  # --- Neutral Forces ---
  # Non-combatant actors and scenario props.
  neutral:
    - type: civilian
      count: 8
      zone: town_ruins
      placement: random
      ai_behavior: passive
      note: "Civilians flee when combat occurs nearby"

    - type: church
      count: 1
      zone: town_ruins
      placement: clustered
      capturable: false
      note: "Landmark — cannot be captured or destroyed for narrative reasons"

    - type: tech_center
      count: 1
      zone: enemy_expansion
      placement: clustered
      capturable: true
      note: "Capturing grants GPS satellite reveal"
```

---

## 3. Objective Schema

Objectives are divided into **primary** (must complete for victory), **secondary** (optional, affect battle report and narrative), and **hidden** (unknown to the player until revealed by triggers).

### Objective Types

| Type | Fields | Description |
|---|---|---|
| `capture_structure` | `target` (structure id or type + zone) | Player must capture the specified structure. |
| `destroy_all` | `target_faction` or `target_zone` | Destroy all enemy units/structures in a faction or zone. |
| `protect` | `target` (unit/structure/zone), `duration` (optional) | Keep the target alive for the mission or a duration. |
| `enter_region` | `unit_filter` (type or named), `zone` | Move specified units into the target zone. |
| `survive_time` | `duration_seconds` | Survive for a specified real-time duration. |
| `escort` | `unit_filter`, `from_zone`, `to_zone` | Move specified units safely from one zone to another. |
| `build` | `structure_type`, `count`, `zone` (optional) | Construct the specified structures. |
| `reach_tech_level` | `tech_level` or `research_id` | Research a specific technology or reach a tech tier. |
| `eliminate_unit` | `target` (named character or unit type + count) | Kill a specific named unit or a count of a unit type. |
| `prevent_destruction` | `target`, `threat_timer` (optional) | Stop the enemy from destroying a target before a deadline. |

### Full Annotated YAML Example

```yaml
# ============================================================
# Objectives — LLM-Generated
# ============================================================

objectives:
  # --- Primary Objectives ---
  # All primary objectives must be completed for mission victory.
  primary:
    - id: secure_bridge
      type: prevent_destruction
      target: danzig_bridge         # references feature id from mission_map
      text: "Prevent the Allied demolition team from destroying the Danzig bridge."
      hint: "The demolition team is staging east of the bridge. Eliminate them before they reach it."
      threat_timer: 480             # 8 minutes until demo team activates
      on_fail: bridge_destroyed     # triggers named outcome if bridge is destroyed

    - id: capture_enemy_base
      type: capture_structure
      target:
        type: construction_yard
        zone: enemy_base
      text: "Capture the Allied Command Center in the northern sector."
      hint: "Neutralize base defenses before sending engineers."

    - id: cross_river
      type: enter_region
      unit_filter:
        type: any_ground
        min_count: 10
      zone: north_bank
      text: "Establish a bridgehead — move at least 10 ground units across the river."
      hint: "The bridge is the fastest route, but consider the naval approach if the bridge is contested."

  # --- Secondary Objectives ---
  # Optional objectives that affect battle report, narrative, and rewards.
  secondary:
    - id: destroy_artillery
      type: destroy_all
      target_zone: enemy_heights
      target_filter:
        type: artillery
      text: "Destroy the enemy artillery on the heights."
      hint: "The artillery shells the bridge approach. Taking it out makes crossing safer."
      reward:
        narrative: "Your troops crossed the river without artillery harassment — fewer casualties."

    - id: capture_tech
      type: capture_structure
      target:
        type: tech_center
        zone: enemy_expansion
      text: "Capture the Allied Tech Center to gain satellite intelligence."
      hint: "The Tech Center is lightly defended at the enemy expansion."
      reward:
        effect: reveal_shroud_all   # reveals entire map
        narrative: "Satellite uplink established — full battlefield visibility."

    - id: save_civilians
      type: protect
      target:
        type: civilian
        zone: town_ruins
      duration: null                # protect for entire mission
      text: "Protect the civilians in the town ruins."
      hint: "Avoid using area-of-effect weapons near the town center."
      reward:
        narrative: "The civilian population is grateful — local partisans may assist in future operations."
        set_flag: civilians_saved_danzig

    - id: volkov_survives
      type: protect
      target:
        named_character: "Sergeant Volkov"
      text: "Keep Sergeant Volkov alive."
      hint: "Volkov is valuable but reckless. Keep him away from heavy armor."
      reward:
        narrative: "Volkov's combat record grows. He is becoming a legend among the troops."

  # --- Hidden Objectives ---
  # Not shown to the player until a trigger reveals them.
  # Completing hidden objectives grants special narrative effects.
  hidden:
    - id: find_intelligence
      type: enter_region
      unit_filter:
        type: spy
      zone: demolition_camp
      reveal_trigger: spy_enters_camp  # Lua trigger that reveals this objective
      reveal_text: "INTEL DISCOVERED: Documents found in the demolition camp reveal the location of a secret Allied weapons lab."
      text: "Retrieve the intelligence documents from the demolition camp."
      effect:
        set_flag: weapons_lab_intel
        narrative: "The captured documents reveal a weapons program — this will matter in a future operation."

    - id: spare_enemy_commander
      type: enter_region
      unit_filter:
        type: any_infantry
      zone: enemy_base
      condition: enemy_commander_surrenders  # flag set by trigger when CY health < 25%
      reveal_text: "The enemy commander offers to surrender. Accept the surrender to gain valuable intelligence."
      text: "Accept the enemy commander's surrender."
      effect:
        set_flag: commander_captured_danzig
        adjust_character:
          name: "General Morrison"
          relationship_to_player: -10  # Morrison resents losing a subordinate
        narrative: "The captured commander provides intel on Morrison's defensive strategy."
```

---

## 4. Named Outcomes Schema

Each mission has **multiple named outcomes** representing different ways the mission can end. Outcomes determine narrative consequences, campaign state changes, and which mission comes next in the campaign graph. The LLM generates 2-4 outcomes per mission, covering victory variants and at least one defeat variant.

### State Effect Types

| Effect Type | Fields | Description |
|---|---|---|
| `set_flag` | `flag`, `value` | Set a campaign story flag (D021 persistent state). |
| `adjust_character` | `name`, field changes | Modify a named character's state (loyalty, relationship, status). |
| `roster_changes` | `add`, `remove`, `promote` | Modify the player's persistent unit roster for carryover. |
| `unlock_tech` | `tech_id` | Permanently unlock a technology for future missions. |
| `modify_arc` | `thread`, `adjustment` | Nudge a narrative thread forward or back in the campaign arc. |

### Full Annotated YAML Example

```yaml
# ============================================================
# Named Outcomes — LLM-Generated
# ============================================================
# Each outcome defines:
#   - id: unique identifier referenced by triggers
#   - conditions: what must be true for this outcome to activate
#   - debrief: text shown to the player after the mission
#   - state_effects: changes to campaign state
#   - next_mission: which mission comes next in the campaign graph
# ============================================================

outcomes:
  # --- Victory: Bridge Intact ---
  # The best possible outcome. Bridge secured, base captured, demolition prevented.
  - id: victory_bridge_intact
    priority: 1                     # checked first; highest-priority matching outcome wins
    conditions:
      - objective_complete: secure_bridge
      - objective_complete: capture_enemy_base
      - objective_complete: cross_river
    debrief:
      speaker: "Colonel Petrov"
      portrait: petrov_satisfied
      text: >
        The bridge at Danzig stands. Our armor is rolling north unimpeded.
        Morrison will feel this — his central supply line is severed.
        Well done, Commander. This changes the shape of the war.
      mood: triumphant
    state_effects:
      - type: set_flag
        flag: danzig_bridge_intact
        value: true

      - type: set_flag
        flag: danzig_captured
        value: true

      - type: adjust_character
        name: "Colonel Petrov"
        loyalty: +5
        relationship_to_player: +10

      - type: adjust_character
        name: "General Morrison"
        relationship_to_player: -15
        notable_event: "Lost Danzig and the bridge — a strategic humiliation"

      - type: roster_changes
        add:
          - type: medium_tank
            count: 4
            veterancy: veteran
            note: "Reinforcements arriving via the intact bridge"
        promote:
          - named_character: "Sergeant Volkov"
            to_veterancy: elite
            condition: volkov_survives  # only if secondary objective completed

      - type: modify_arc
        thread: "western_advance"
        adjustment: "accelerate"   # the campaign advances faster due to intact bridge

    next_mission: gen_mission_009_push_north
    next_mission_context: >
      The intact bridge enables rapid armor deployment northward.
      Next mission should feature a fast-paced armored advance with
      strong starting forces. Morrison is retreating but regrouping.

  # --- Victory: Bridge Destroyed ---
  # Player captured the base but the demolition team destroyed the bridge.
  # Still a victory, but with strategic consequences.
  - id: victory_bridge_destroyed
    priority: 2
    conditions:
      - objective_complete: capture_enemy_base
      - objective_complete: cross_river
      - objective_failed: secure_bridge
    debrief:
      speaker: "Colonel Petrov"
      portrait: petrov_grim
      text: >
        We hold the northern bank, but the bridge is gone.
        Our engineers can build a pontoon crossing, but it will take time —
        and Morrison's armor won't wait. We need to dig in and hold
        what we've taken until the crossing is rebuilt.
      mood: bittersweet
    state_effects:
      - type: set_flag
        flag: danzig_bridge_intact
        value: false

      - type: set_flag
        flag: danzig_captured
        value: true

      - type: adjust_character
        name: "Colonel Petrov"
        loyalty: +2                 # less enthusiastic than bridge-intact outcome
        relationship_to_player: +3

      - type: adjust_character
        name: "Lieutenant Sonya"
        notable_event: "Questioned the commander's priorities after bridge loss"
        loyalty: -3                 # seeds doubt for her betrayal arc

      - type: roster_changes
        add:
          - type: engineer
            count: 2
            note: "Bridge reconstruction specialists"
        # No tank reinforcements — can't get armor across without the bridge

      - type: modify_arc
        thread: "western_advance"
        adjustment: "delay"         # campaign slows — must rebuild crossing first

    next_mission: gen_mission_009_hold_the_line
    next_mission_context: >
      Without the bridge, reinforcements are delayed. Next mission is
      defensive — hold the captured territory against an Allied
      counterattack while engineers build a pontoon crossing.
      Morrison seizes the opportunity to strike.

  # --- Victory: Minimal (Pyrrhic) ---
  # Crossed the river and stopped the demo team, but failed to capture the base.
  - id: victory_pyrrhic
    priority: 3
    conditions:
      - objective_complete: cross_river
      - objective_complete: secure_bridge
      - objective_failed: capture_enemy_base
    debrief:
      speaker: "Colonel Petrov"
      portrait: petrov_tired
      text: >
        We have the bridge and a foothold on the north bank.
        But the Allied base is still operational — they will reinforce
        and counterattack. We bought ourselves a crossing point.
        Whether that is enough remains to be seen.
      mood: uncertain
    state_effects:
      - type: set_flag
        flag: danzig_bridge_intact
        value: true

      - type: set_flag
        flag: danzig_captured
        value: false               # base not captured

      - type: adjust_character
        name: "Sergeant Volkov"
        notable_event: "Held the bridge under heavy fire — troops respect him more"
        condition: volkov_survives

      - type: roster_changes
        # No additions — stretched thin
        remove:
          - type: medium_tank
            count: 2
            note: "Losses from prolonged fighting without base capture"

    next_mission: gen_mission_009_second_assault
    next_mission_context: >
      The bridge is intact but the enemy base remains. Next mission is a
      renewed assault on the base with limited reinforcements. The player
      must finish what they started with depleted forces.

  # --- Defeat: Routed ---
  # Player failed to cross the river or lost too many forces.
  - id: defeat_routed
    priority: 10                    # lowest priority — fallback outcome
    conditions:
      - objective_failed: cross_river
    debrief:
      speaker: "Colonel Petrov"
      portrait: petrov_defeated
      text: >
        We could not force the crossing. The Vistula holds us back.
        Morrison's defenses were stronger than intelligence suggested —
        or perhaps our approach was wrong. We pull back to regroup.
        Sonya, I want new intelligence. This cannot happen again.
      mood: defeat
    state_effects:
      - type: set_flag
        flag: danzig_captured
        value: false

      - type: set_flag
        flag: danzig_bridge_intact
        value: false               # unknown state — enemy controls the area

      - type: adjust_character
        name: "Colonel Petrov"
        loyalty: -5
        relationship_to_player: -8

      - type: adjust_character
        name: "Lieutenant Sonya"
        notable_event: "Blamed intelligence failures for the defeat — deflecting from her own agenda"
        loyalty: -5                 # accelerates her betrayal timeline

      - type: adjust_character
        name: "General Morrison"
        notable_event: "Taunted the player in an intercepted broadcast after the failed crossing"
        relationship_to_player: -5

      - type: roster_changes
        remove:
          - type: medium_tank
            count: 4
            note: "Heavy armor losses at the river"
          - type: rifle_infantry
            count: 8
            note: "Infantry casualties during failed crossing attempts"

      - type: modify_arc
        thread: "western_advance"
        adjustment: "setback"       # campaign narrative shifts to recovery

    next_mission: gen_mission_009_regroup
    next_mission_context: >
      After the failed crossing, the campaign shifts to recovery mode.
      Next mission should be smaller scale — intelligence gathering,
      supply raid, or defense against an emboldened enemy. The player's
      roster is depleted. Introduce a recovery opportunity.
```

---

## 5. LLM-Generated Lua Triggers

The LLM generates Lua trigger scripts using IC's sandboxed Lua API (04-MODDING.md). The LLM has access to a defined API surface — it must not use functions outside this set.

### Trigger API Surface Available to LLM

```
-- Timer and scheduling
Trigger.AfterDelay(ticks, callback)         -- fire callback after N ticks
Trigger.OnTimerExpired(timer_id, callback)  -- fire when a named timer reaches zero
Trigger.GetTick()                           -- current simulation tick

-- Unit and structure events
Trigger.OnKilled(actor_id, callback)               -- fire when actor is destroyed
Trigger.OnCaptured(actor_id, callback)             -- fire when structure is captured
Trigger.OnDamaged(actor_id, threshold, callback)   -- fire when health drops below %
Trigger.OnAllUnitsDestroyed(faction, callback)     -- fire when faction has no units

-- Region events
Trigger.OnUnitEntersRegion(zone_id, filter, callback)  -- fire when matching unit enters zone
Trigger.OnEnteredProximity(actor_id, radius, callback) -- fire when any unit enters radius

-- Objective management
Objective.Add(objective_def)        -- add a new objective mid-mission
Objective.Complete(objective_id)    -- mark objective as completed
Objective.Fail(objective_id)        -- mark objective as failed
Objective.Reveal(objective_id)      -- reveal a hidden objective

-- Map and zone queries
Map.GetZone(zone_id)                -- get zone bounds
Map.RevealShroud(zone_id, faction)  -- reveal fog in a zone for a faction
Map.GetActorsInZone(zone_id, filter) -- query actors in a zone

-- Reinforcement spawning
Reinforcements.Spawn(faction, unit_list, zone_id, facing)
Reinforcements.SpawnWithTransport(faction, transport_type, unit_list, entry_zone, dest_zone)

-- RadarComm — in-mission character dialogue
RadarComm.Show(speaker, portrait, text, duration, options)

-- Campaign state
Campaign.get_flag(flag_name)        -- read a campaign story flag
Campaign.set_flag(flag_name, value) -- set a campaign story flag

-- Cinematic
Camera.PanTo(zone_id, duration, easing)
Letterbox.Enable(transition_time)
Letterbox.Disable(transition_time)

-- Music
Music.Play(track_name, fade_in)
Music.SetMood(mood)                 -- ambient, combat, tension, victory

-- Utility
DateTime.GameTime                   -- current game time in seconds
Utils.RandomInteger(min, max)       -- deterministic PRNG
```

### Example 1: Timer-Based Reinforcements with Character Dialogue

```lua
-- ============================================================
-- Trigger: Allied reinforcements arrive after 5 minutes
-- The player is warned via radar comm, then enemy units spawn.
-- ============================================================

local reinforcement_tick = DateTime.GameTime + 300  -- 5 minutes

-- Warning at 4 minutes
Trigger.AfterDelay(240 * 30, function()  -- 240 seconds * 30 ticks/sec
    RadarComm.Show(
        "Lieutenant Sonya",
        "sonya_urgent",
        "Commander, satellite shows enemy transports approaching from the north. " ..
        "Reinforcements will arrive in approximately one minute. Prepare your defenses.",
        5.0,
        { display_mode = "radar_comm" }
    )
    Music.SetMood("tension")
end)

-- Reinforcements arrive at 5 minutes
Trigger.AfterDelay(300 * 30, function()
    -- Spawn enemy reinforcements via transport
    Reinforcements.SpawnWithTransport(
        "enemy",
        "landing_craft",
        { "medium_tank", "medium_tank", "medium_tank", "apc", "apc" },
        "naval_approach",       -- entry zone
        "north_bank"            -- destination zone
    )

    RadarComm.Show(
        "Sergeant Volkov",
        "volkov_combat",
        "Enemy armor coming ashore! They brought friends, Commander.",
        4.0,
        { display_mode = "radar_comm" }
    )
    Music.SetMood("combat")
end)
```

### Example 2: Structure Capture with Objective Completion and Conditional Branch

```lua
-- ============================================================
-- Trigger: Capturing the enemy Construction Yard
-- Completes the capture objective and triggers base alert.
-- If the enemy commander's health is low, offer surrender.
-- ============================================================

Trigger.OnCaptured("enemy_construction_yard", function()
    Objective.Complete("capture_enemy_base")

    RadarComm.Show(
        "Colonel Petrov",
        "petrov_satisfied",
        "Their command center is ours. Secure the perimeter — " ..
        "there may be stragglers.",
        5.0,
        { display_mode = "radar_comm", cinematic = true }
    )

    -- Check if we should trigger the hidden surrender objective
    local commander_health = Map.GetActorsInZone("enemy_base", { type = "officer" })
    if #commander_health > 0 then
        Campaign.set_flag("enemy_commander_surrenders", true)
        Objective.Reveal("spare_enemy_commander")

        Trigger.AfterDelay(90, function()  -- 3 seconds later
            RadarComm.Show(
                "Enemy Commander",
                "enemy_officer_white_flag",
                "Enough! I yield. My men are dead, my base is taken. " ..
                "I have information Morrison would rather I didn't share. " ..
                "Spare me, and it's yours.",
                6.0,
                { display_mode = "radar_comm", cinematic = true }
            )
        end)
    end
end)
```

### Example 3: Demolition Team Timer with Campaign Flag Checks

```lua
-- ============================================================
-- Trigger: Demolition team attempts to destroy the bridge
-- Timer-based with campaign flag awareness.
-- If the player gathered intelligence in a previous mission,
-- the timer is extended (they knew about the demo team).
-- ============================================================

local demo_delay_ticks

-- Check campaign flag from previous mission
if Campaign.get_flag("advance_intel_danzig") then
    -- Player had advance warning — demo team delayed (they changed plans)
    demo_delay_ticks = 600 * 30   -- 10 minutes
    RadarComm.Show(
        "Lieutenant Sonya",
        "sonya_briefing",
        "Good news, Commander — the intelligence we captured last mission " ..
        "reveals the demolition timeline. We have more time than expected. " ..
        "Their team doesn't activate for another ten minutes.",
        6.0,
        { display_mode = "radar_comm" }
    )
else
    -- No advance intel — standard 8-minute timer
    demo_delay_ticks = 480 * 30   -- 8 minutes
end

-- Activate the demolition team after the delay
Trigger.AfterDelay(demo_delay_ticks, function()
    -- Alert the player
    RadarComm.Show(
        "Lieutenant Sonya",
        "sonya_alert",
        "Commander! The demolition team is moving toward the bridge! " ..
        "Stop them before they plant the charges!",
        5.0,
        { display_mode = "radar_comm" }
    )

    Music.SetMood("tension")

    -- The demo engineers are already placed with ai_behavior: demolition
    -- and activation_trigger: demo_timer — this trigger activates them.
    -- If the player eliminates them before they reach the bridge, the
    -- bridge survives. If they reach it, bridge_destroyed fires.
end)

-- Monitor bridge health — if demolished, fail the objective
Trigger.OnKilled("danzig_bridge", function()
    Objective.Fail("secure_bridge")

    Letterbox.Enable(0.5)
    Camera.PanTo("bridge_crossing", 3.0, "ease_in_out")

    Trigger.AfterDelay(30, function()
        RadarComm.Show(
            "Colonel Petrov",
            "petrov_grim",
            "The bridge... they've destroyed it. We'll have to find " ..
            "another way across, Commander. This is a setback.",
            6.0,
            { display_mode = "radar_comm" }
        )
    end)

    Trigger.AfterDelay(150, function()
        Letterbox.Disable(0.5)
        Camera.PanTo("player_start", 2.0, "ease_in_out")
    end)
end)
```

### Example 4: Region Entry with Cinematic Sequence and Hidden Objective Reveal

```lua
-- ============================================================
-- Trigger: Spy enters demolition camp — reveals hidden objective
-- and triggers a cinematic intelligence discovery sequence.
-- ============================================================

Trigger.OnUnitEntersRegion("demolition_camp", { type = "spy" }, function(unit)
    -- Reveal the hidden intelligence objective
    Objective.Reveal("find_intelligence")

    -- Cinematic sequence
    Letterbox.Enable(0.5)
    Camera.PanTo("demolition_camp", 2.0, "ease_in_out")
    Music.Play("radio_2", 1.0)

    Trigger.AfterDelay(60, function()  -- 2 seconds
        RadarComm.Show(
            "Spy",
            "spy_report",
            "Commander, I've found documents here — Allied weapons " ..
            "research. Coordinates for a facility they don't want us to know about.",
            5.0,
            { display_mode = "radar_comm" }
        )
    end)

    Trigger.AfterDelay(210, function()  -- 7 seconds
        RadarComm.Show(
            "Lieutenant Sonya",
            "sonya_intrigued",
            "A weapons lab? Interesting. Secure those documents — " ..
            "this could change our strategic calculus significantly.",
            5.0,
            { display_mode = "radar_comm" }
        )
    end)

    Trigger.AfterDelay(360, function()  -- 12 seconds
        Letterbox.Disable(0.5)
        Camera.PanTo("player_start", 2.0, "ease_in_out")
        Music.SetMood("ambient")

        -- Complete the hidden objective
        Objective.Complete("find_intelligence")
        Campaign.set_flag("weapons_lab_intel", true)
    end)
end)
```

---

## 6. Validation Pass Specification

All LLM-generated content passes through a multi-stage validation pipeline before becoming a playable mission. The pipeline catches structural errors, game-module incompatibilities, unreachable objectives, Lua safety violations, and incomplete outcome coverage.

### Rust Types

```rust
/// Result of validating a complete LLM-generated mission.
pub struct ValidationResult {
    /// True if the mission is playable as-is.
    pub is_valid: bool,
    /// Blocking errors — mission cannot be played until these are fixed.
    pub errors: Vec<ValidationError>,
    /// Non-blocking warnings — mission is playable but may have quality issues.
    pub warnings: Vec<ValidationWarning>,
    /// Per-section validity for targeted regeneration.
    pub section_validity: SectionValidity,
}

/// Blocking validation errors. Each variant carries context for the
/// error recovery prompt (Section 12) so the LLM can fix the issue.
#[derive(Debug, Clone)]
pub enum ValidationError {
    /// A unit type referenced in actor placement does not exist in the game module.
    UnknownUnitType {
        unit_type: String,
        section: String,       // "player_forces", "enemy_forces", etc.
        suggestion: Option<String>,  // closest matching valid type
    },

    /// A structure type referenced does not exist in the game module.
    UnknownStructureType {
        structure_type: String,
        section: String,
        suggestion: Option<String>,
    },

    /// A zone referenced in actor placement or triggers is not defined in the map.
    UndefinedZone {
        zone_id: String,
        referenced_in: String, // section or trigger name
    },

    /// An objective references a target that does not exist in the mission.
    ObjectiveTargetMissing {
        objective_id: String,
        target: String,
        target_type: String,   // "structure", "unit", "zone", "character"
    },

    /// Pathfinding analysis shows an objective is unreachable from player start.
    ObjectiveUnreachable {
        objective_id: String,
        reason: String,        // "blocked by impassable terrain", "no path from player_start to zone X"
    },

    /// Lua script failed to parse.
    LuaParseError {
        script_name: String,
        line: u32,
        column: u32,
        message: String,
    },

    /// Lua script uses a function not in the allowed API surface.
    LuaSandboxViolation {
        script_name: String,
        line: u32,
        function_name: String,
        reason: String,        // "not in allowed API", "os module not available", etc.
    },

    /// No outcome covers the case where all primary objectives are completed.
    MissingVictoryOutcome,

    /// No outcome covers the case where a primary objective fails.
    MissingDefeatOutcome {
        uncovered_failure: String,  // which objective failure has no outcome
    },

    /// An outcome references a next_mission that does not match the campaign graph.
    InvalidNextMission {
        outcome_id: String,
        next_mission: String,
    },

    /// Map features create an impossible layout (e.g., bridge with no river).
    InvalidFeatureLayout {
        feature_id: String,
        reason: String,
    },
}

/// Non-blocking warnings. Mission is playable but these suggest quality issues.
#[derive(Debug, Clone)]
pub enum ValidationWarning {
    /// Player starting forces seem too weak or too strong for the objectives.
    ForceBalanceSkewed {
        direction: String,    // "too_weak" or "too_strong"
        ratio: f32,           // estimated player/enemy force ratio
        recommendation: String,
    },

    /// No ore field accessible to the player — economy-dependent mission may stall.
    NoPlayerResources {
        recommendation: String,
    },

    /// A secondary objective has no reward or narrative effect.
    ObjectiveNoReward {
        objective_id: String,
    },

    /// A named character appears in actors but is not referenced in any trigger or dialogue.
    UnusedNamedCharacter {
        character_name: String,
    },

    /// The Lua trigger count is unusually high — may affect performance.
    ExcessiveTriggerCount {
        count: u32,
        threshold: u32,
    },

    /// An outcome's next_mission_context is empty — LLM will have less guidance for the next mission.
    EmptyNextMissionContext {
        outcome_id: String,
    },
}

/// Per-section validity — enables targeted regeneration of only the broken section.
pub struct SectionValidity {
    pub mission_map: bool,
    pub player_forces: bool,
    pub enemy_forces: bool,
    pub neutral_forces: bool,
    pub objectives: bool,
    pub outcomes: bool,
    pub lua_triggers: bool,
}
```

### Validation Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                  Validation Pipeline                         │
│                                                              │
│  Stage 1: YAML Parse                                         │
│  ├── Parse mission_map, actors, objectives, outcomes YAML    │
│  ├── Check required fields present                           │
│  └── On fail: LuaParseError / structural parse failure       │
│                                                              │
│  Stage 2: Game Module Compatibility                          │
│  ├── Check every unit_type against GameModule::unit_registry │
│  ├── Check every structure_type against GameModule::buildings │
│  ├── Check theater is valid for the game module              │
│  ├── Suggest closest valid type for unknowns (Levenshtein)   │
│  └── On fail: UnknownUnitType / UnknownStructureType         │
│                                                              │
│  Stage 3: Zone and Reference Integrity                       │
│  ├── All zone_ids in actors resolve to zones in mission_map  │
│  ├── All feature references (bridge id, etc.) resolve        │
│  ├── All objective targets resolve to actors or features     │
│  ├── All outcome conditions reference valid objective ids    │
│  └── On fail: UndefinedZone / ObjectiveTargetMissing         │
│                                                              │
│  Stage 4: Objective Reachability                             │
│  ├── Build simplified pathfinding graph from features/zones  │
│  ├── Check player_start can reach every primary objective    │
│  ├── Check zone adjacency makes geographic sense             │
│  ├── Impassable features (rivers, cliffs) block unless       │
│  │   bridge/road connects                                    │
│  └── On fail: ObjectiveUnreachable / InvalidFeatureLayout    │
│                                                              │
│  Stage 5: Lua Script Validation                              │
│  ├── Parse all Lua scripts (syntax check)                    │
│  ├── AST scan for disallowed function calls                  │
│  ├── Check all referenced actor_ids exist                    │
│  ├── Check all referenced zone_ids exist                     │
│  ├── Check Campaign.set_flag calls use valid flag names      │
│  └── On fail: LuaParseError / LuaSandboxViolation            │
│                                                              │
│  Stage 6: Outcome Coverage                                   │
│  ├── At least one outcome covers all-primary-complete        │
│  ├── Every primary objective failure has a covering outcome  │
│  ├── All outcomes have valid next_mission references         │
│  ├── No unreachable outcome (conditions always false)        │
│  └── On fail: MissingVictoryOutcome / MissingDefeatOutcome   │
│                                                              │
│  Stage 7: Quality Warnings (non-blocking)                    │
│  ├── Force balance estimation (player vs enemy unit value)   │
│  ├── Resource availability check                             │
│  ├── Named character usage check                             │
│  ├── Trigger count check                                     │
│  └── Generates: ValidationWarning entries                    │
│                                                              │
│  Output: ValidationResult                                    │
│  ├── is_valid = (errors.len() == 0)                          │
│  ├── errors: Vec<ValidationError>                            │
│  ├── warnings: Vec<ValidationWarning>                        │
│  └── section_validity: which sections need regeneration      │
└─────────────────────────────────────────────────────────────┘
```

### Regeneration Policy

When validation fails, the system does **not** regenerate the entire mission. It uses `SectionValidity` to identify which sections are broken and regenerates only those sections, passing the error context to the LLM (see [Section 12: Error Recovery Prompts](#12-error-recovery-prompts)).

- **Max regeneration attempts:** 3 per section.
- **Escalation:** If a section fails validation 3 times, the entire mission is regenerated from scratch (1 attempt).
- **Final fallback:** If full regeneration also fails, the system logs the failure and presents the player with: "This mission could not be generated to a playable standard. [Try Again] [Skip to Next Mission] [Edit Manually]".
- **Warnings are never regenerated.** Warnings are logged and shown to the player in the mission preview but do not trigger regeneration.

---

## 7. Mission Generation Prompt Template

The mission generation prompt uses a Jinja2-style template system. Templates are stored as mod data (`llm/prompts/mission_generation.yaml`) and are fully moddable.

### System Prompt

```
{# ============================================================ #}
{# SYSTEM PROMPT — Mission Generation                            #}
{# Stored in: llm/prompts/mission_generation.yaml                #}
{# ============================================================ #}

You are a mission designer for Iron Curtain, a Command & Conquer Red Alert strategy game engine. Your task is to generate a complete, playable mission definition in YAML and Lua.

## Your Role
You generate missions that are:
- Mechanically sound (valid unit types, reachable objectives, balanced forces)
- Narratively compelling (story continuity, character voice, dramatic pacing)
- Varied (different objective types, terrain features, tactical challenges)

## Game Module: {{ game_module }}

### Available Unit Types ({{ faction_player }})
{% for unit in player_unit_types %}
- {{ unit.name }}: {{ unit.description }} (cost: {{ unit.cost }}, category: {{ unit.category }})
{% endfor %}

### Available Unit Types ({{ faction_enemy }})
{% for unit in enemy_unit_types %}
- {{ unit.name }}: {{ unit.description }} (cost: {{ unit.cost }}, category: {{ unit.category }})
{% endfor %}

### Available Structure Types
{% for struct in structure_types %}
- {{ struct.name }}: {{ struct.description }} (buildable: {{ struct.buildable }})
{% endfor %}

### Map Theaters
{% for theater in theaters %}
- {{ theater.name }}: {{ theater.description }}
{% endfor %}

### Terrain Feature Types
- river: Water feature. Fields: from_zone, to_zone, width (narrow/medium/wide), crossable (bool)
- bridge: Crossing point. Fields: zone, orientation, destructible (bool)
- forest: Tree cover. Fields: zone, density (sparse/medium/dense), radius
- cliff: Elevation change. Fields: from_zone, to_zone, height (low/medium/high), passable (bool)
- road: Movement bonus path. Fields: from_zone, to_zone, type (dirt/paved/highway)
- hill: Elevated terrain. Fields: zone, elevation (low/medium/high), radius
- water_body: Open water. Fields: zone, type (lake/ocean/swamp), radius
- structure_ruin: Destroyed urban terrain. Fields: zone, density (light/heavy), radius
- minefield: Pre-placed mines. Fields: zone, density (light/heavy), radius, faction
- ore_field: Resource deposit. Fields: zone, richness (poor/standard/rich), radius

### Lua Trigger API
You may use ONLY these functions in generated Lua scripts:
- Trigger.AfterDelay(ticks, callback)
- Trigger.OnTimerExpired(timer_id, callback)
- Trigger.GetTick()
- Trigger.OnKilled(actor_id, callback)
- Trigger.OnCaptured(actor_id, callback)
- Trigger.OnDamaged(actor_id, threshold, callback)
- Trigger.OnAllUnitsDestroyed(faction, callback)
- Trigger.OnUnitEntersRegion(zone_id, filter, callback)
- Trigger.OnEnteredProximity(actor_id, radius, callback)
- Objective.Add(objective_def)
- Objective.Complete(objective_id)
- Objective.Fail(objective_id)
- Objective.Reveal(objective_id)
- Map.GetZone(zone_id)
- Map.RevealShroud(zone_id, faction)
- Map.GetActorsInZone(zone_id, filter)
- Reinforcements.Spawn(faction, unit_list, zone_id, facing)
- Reinforcements.SpawnWithTransport(faction, transport_type, unit_list, entry_zone, dest_zone)
- RadarComm.Show(speaker, portrait, text, duration, options)
- Campaign.get_flag(flag_name)
- Campaign.set_flag(flag_name, value)
- Camera.PanTo(zone_id, duration, easing)
- Letterbox.Enable(transition_time)
- Letterbox.Disable(transition_time)
- Music.Play(track_name, fade_in)
- Music.SetMood(mood)
- DateTime.GameTime
- Utils.RandomInteger(min, max)

Do NOT use any other Lua functions. Do NOT use io, os, require, dofile, loadfile, load, or math.random.

## Story Style Rules ({{ story_style }})
{% if story_style == "cc_classic" %}
TONE RULES:
1. Play everything straight. Never acknowledge absurdity.
2. Escalate constantly. Every act raises the stakes.
3. Make it quotable. Every briefing line should be memorable.

CHARACTER RULES:
4. First line establishes personality. No generic introductions.
5. Villains believe they are right. Give them genuine convictions.
6. Heroes have attitude, not perfection. Specific quirks make them fun.
7. Betrayal is always personal. Invest in making the character likeable first.

WORLD-BUILDING RULES:
8. Cold War as mythology, not history.
9. Technology is dramatic, not realistic.
10. Factions are worldviews — different vocabulary, sentence structure, emotional register.

STRUCTURAL RULES:
11. Every mission has a "moment" — a scripted event creating an emotional peak.
12. Briefings sell the mission — end with a question the mission answers.
13. Debriefs acknowledge what happened — reference specific battle outcomes.
{% elif story_style == "realistic_military" %}
Write in understated professional military language. Emotions are implied, not stated. The horror of war comes from what is not said. Missions are operations, not adventures.
{% elif story_style == "political_thriller" %}
Everyone has an agenda. Dialogue is subtext-heavy. Trust is currency. Slow-burn intrigue with sudden violence. The real enemy is often on your own side.
{% elif story_style == "pulp_scifi" %}
Characters are archetypes turned to 11. Scientists are mad. Soldiers are grizzled. Villains are theatrical. Embrace camp. Experimental tech, dimension portals, time travel.
{% elif story_style == "character_drama" %}
Deeply human characters with complex motivations. Relationships shift over the campaign. The war is the backdrop; the story is about the people. Victory feels bittersweet.
{% endif %}

## Output Format
You MUST produce a single YAML document containing ALL of the following top-level keys:
1. `mission_map` — terrain features and zones
2. `actors` — player_forces, enemy_forces, neutral
3. `objectives` — primary, secondary, hidden
4. `outcomes` — named outcomes with conditions, debrief, state_effects, next_mission
5. `briefing` — mission briefing text with character dialogue
6. `lua_triggers` — complete Lua script as a string value

Every zone referenced in actors, objectives, or triggers MUST be defined in mission_map.zones.
Every unit_type MUST be from the available unit types listed above.
Every objective_id referenced in outcomes MUST be defined in objectives.
Every actor_id referenced in triggers MUST match an actor placement entry.
Outcomes MUST cover: all-primary-complete (victory) AND at least one primary-fail (defeat).
Generate at least 3 outcomes (2+ victory variants, 1+ defeat).
```

### User Prompt

```
{# ============================================================ #}
{# USER PROMPT — Mission Generation                              #}
{# Injected per-mission with campaign context                    #}
{# ============================================================ #}

## Campaign Context

**Campaign:** {{ campaign.title }}
**Faction:** {{ campaign.faction }} vs. {{ campaign.enemy_faction }}
**Theater:** {{ campaign.theater }}
**Mission:** {{ mission_number }} of {{ total_missions }}
**Arc Position:** {{ arc_position }}
**Difficulty:** {{ difficulty_level }}

### Backstory
{{ campaign.backstory }}

### Previous Mission Summary
{% if previous_mission %}
**Mission {{ previous_mission.number }}: "{{ previous_mission.title }}"**
Outcome: {{ previous_mission.outcome }}
Summary: {{ previous_mission.narrative_summary }}
Key events:
{% for event in previous_mission.key_events %}
- {{ event }}
{% endfor %}

Battle Report:
- Units lost: {% for type, count in battle_report.units_lost %}{{ type }}: {{ count }}{% if not loop.last %}, {% endif %}{% endfor %}
- Units surviving: {% for type, count in battle_report.units_surviving %}{{ type }}: {{ count }}{% if not loop.last %}, {% endif %}{% endfor %}
- Enemy state: {{ battle_report.enemy_forces_remaining }}
- Duration: {{ battle_report.mission_duration_seconds }}s
- Territory control: {{ battle_report.territory_control_permille / 10 }}%
{% else %}
This is the first mission of the campaign.
{% endif %}

### Character States
{% for char in character_states %}
**{{ char.name }}** ({{ char.current_narrative_role }})
- Status: {{ char.status }}
- Allegiance: {{ char.allegiance }}
- Loyalty: {{ char.loyalty }}/100
- Relationship to player: {{ char.relationship_to_player }}
- Personality: {{ char.personality_type }} — {{ char.speech_style }}
- Flaw: {{ char.flaw }}
- Desire: {{ char.desire }}
- Fear: {{ char.fear }}
{% if char.hidden_agenda %}- [HIDDEN AGENDA — do not reveal to player yet]: {{ char.hidden_agenda }}{% endif %}
{% if char.notable_events %}- Notable: {% for evt in char.notable_events %}{{ evt }}{% if not loop.last %}; {% endif %}{% endfor %}{% endif %}
{% endfor %}

### Current Roster
{% for type, count in roster_summary.units %}
- {{ type }}: {{ count }}{% if roster_summary.veterancy[type] %} ({{ roster_summary.veterancy[type] }}){% endif %}
{% endfor %}
Named units: {% for name in roster_summary.named_units %}{{ name }}{% if not loop.last %}, {% endif %}{% endfor %}

### Active Story Threads
{% for thread in active_threads %}
- {{ thread.name }}: {{ thread.status }} — {{ thread.description }}
{% endfor %}

### Campaign Flags
{% for flag, value in flags %}
- {{ flag }}: {{ value }}
{% endfor %}

### Player Tendencies
{% for tendency in player_tendencies %}
- {{ tendency }}
{% endfor %}

### Narrative Moment Requirement
{{ moment_requirement }}

## Generation Requirements

- **Theater:** {{ required_theater }}
- **Difficulty budget:** {{ difficulty_budget }} (1-10 scale; {{ difficulty_description }})
- **Mission type preference:** {{ mission_type_hint }}
- **Moment requirement:** {{ moment_requirement }}
- **Map size:** {{ map_size }}
{% if custom_instructions %}
- **Custom instructions from player:** {{ custom_instructions }}
{% endif %}

## Output

Generate the complete mission definition as a single YAML document with top-level keys: mission_map, actors, objectives, outcomes, briefing, lua_triggers.

Remember:
- Reference only valid unit types from the system prompt
- All zones must be defined before referenced
- Outcomes must cover victory and defeat paths
- Lua triggers must use only the allowed API functions
- Characters must speak in their established voice (see character states above)
- The briefing should end with a hook that makes the player want to deploy
- Include at least one "moment" — a scripted event creating an emotional peak
```

---

## 8. Campaign Skeleton Generation Prompt

A separate prompt generates the overall campaign arc before individual missions are created. This prompt runs once at campaign creation time and produces the `CampaignSkeleton` that guides all subsequent mission generation.

### System Prompt

```
{# ============================================================ #}
{# SYSTEM PROMPT — Campaign Skeleton Generation                  #}
{# ============================================================ #}

You are a campaign designer for Iron Curtain, a Command & Conquer Red Alert strategy game. Your task is to create a complete campaign skeleton — the narrative arc, characters, branch points, and mission summaries that will guide per-mission generation.

Your campaigns must feel like real C&C campaigns: memorable characters, escalating stakes, dramatic betrayals, quotable dialogue. Every element you create will be used to generate 8-32 individual missions, so invest in characters, relationships, and story threads that sustain over the full campaign length.

## Character Construction Rules

Every named character MUST have:
- MBTI personality type (consistency framework for 24+ missions of dialogue)
- Core traits (3-5 adjectives defining public personality)
- Flaw (specific weakness creating dramatic tension)
- Desire (what drives their actions)
- Fear (what drives their mistakes)
- Speech style (concrete voice direction — sentence structure, vocabulary, verbal tics)

Rules:
- No duplicate MBTI types in the core cast (3-5 characters)
- Build complementary and opposing pairs for natural tension
- Deliberate role alignment or misalignment for each character
- Villains must believe they are right — give them philosophy, not just malice
- Every character should be recognizable from their first line of dialogue

## Campaign Arc Rules

- Three-act structure: establish, complicate, resolve
- At least one major betrayal or twist per act
- Branch points every 4-6 missions
- Difficulty escalation follows the requested curve
- Named characters can die, defect, return, or transform
- Story flags track player choices across missions
- The arc is a plan, not a commitment — individual missions will adapt based on battle results

## Output Format

Produce a YAML document with these top-level keys:
- generative_campaign (id, title, faction, enemy_faction, theater, length)
- arc (act_1, act_2, act_3 descriptions)
- characters (full character definitions with personality models)
- backstory (narrative foundation text)
- branch_points (mission number + theme for each planned branch)
- mission_summaries (brief 1-2 sentence plan for each mission)
- narrative_threads (named story threads tracked across the campaign)
- tone_guide (specific guidance for the story style)
```

### User Prompt

```
{# ============================================================ #}
{# USER PROMPT — Campaign Skeleton Generation                    #}
{# ============================================================ #}

## Campaign Parameters

- **Player faction:** {{ faction }}
- **Enemy faction:** {{ enemy_faction }}
- **Theme:** {{ theme }}
- **Tone:** {{ tone }}
- **Story style:** {{ story_style }}
- **Campaign length:** {{ length }} missions
- **Branching density:** {{ branching_density }}
- **Difficulty curve:** {{ difficulty_curve }}
- **Named characters:** {{ character_count }} ({{ character_count_description }})
- **Roster persistence:** {{ roster_persistence }}
- **Theater:** {{ theater }}
- **Mission variety targets:** {{ mission_variety }}
- **Faction purity:** {{ faction_purity }}%
- **Weather variation:** {{ weather_variation }}
- **Moral complexity:** {{ moral_complexity }}

{% if custom_instructions %}
**Player's custom instructions:** {{ custom_instructions }}
{% endif %}

{% if player_profile %}
## Player Profile (from D042 behavioral data)
- Preferred factions: {{ player_profile.preferred_factions }}
- Aggression index: {{ player_profile.aggression_index }}
- Tech priority: {{ player_profile.tech_priority }}
- Preferred unit types: {{ player_profile.preferred_units }}
- Weak matchups: {{ player_profile.weak_matchups }}
- Play sessions: {{ player_profile.games_analyzed }} games analyzed
{% endif %}

## Output

Generate the complete campaign skeleton as a YAML document.

Requirements:
- Title should be evocative and campaign-worthy (e.g., "Operation Iron Tide")
- {{ character_count }} named characters with full personality models
- At least one character with a hidden agenda
- Backstory: 150-300 words establishing the world state
- Mission summaries: 1-2 sentences each for all {{ length }} missions
- Branch points at approximately missions {% for bp in branch_point_targets %}{{ bp }}{% if not loop.last %}, {% endif %}{% endfor %}
- Narrative threads: at least 3 (e.g., "main conflict", "character betrayal", "secret weapon")
- The final 2-3 missions should feel climactic regardless of which branch the player takes
```

### Output Schema

```yaml
# ============================================================
# Campaign Skeleton Output Schema
# ============================================================

generative_campaign:
  id: "gen_{{ faction }}_{{ timestamp }}"
  title: string                     # LLM-generated evocative title
  faction: string                   # player faction id
  enemy_faction: string             # primary enemy faction id
  theater: string                   # primary theater
  length: integer                   # total mission count

arc:
  act_1: string                     # act 1 description (missions 1 to ~length/3)
  act_2: string                     # act 2 description (complication, rising action)
  act_3: string                     # act 3 description (climax, resolution)

characters:
  - name: string
    role: string                    # player_commander, intelligence_officer, field_hero, antagonist, etc.
    allegiance: string              # starting faction
    loyalty: integer                # 0-100
    unit_type: string | null        # if the character is a field unit
    personality:
      mbti: string                  # four-letter MBTI code
      core_traits: list[string]     # 3-5 adjectives
      flaw: string                  # specific dramatic weakness
      desire: string                # what drives them
      fear: string                  # what drives their mistakes
      speech_style: string          # concrete voice direction
    arc: string                     # planned character arc across the campaign
    hidden_agenda: string | null    # secret motivation (null if none)

backstory: string                   # 150-300 word narrative foundation

branch_points:
  - mission: integer
    theme: string                   # what choice the player faces

mission_summaries:
  - mission: integer
    title: string                   # working title for the mission
    summary: string                 # 1-2 sentence plan
    type: string                    # assault, defense, stealth, escort, naval, combined_arms
    difficulty: integer             # 1-10
    theater: string                 # theater for this specific mission
    key_characters: list[string]    # which named characters appear

narrative_threads:
  - name: string                    # thread identifier
    description: string             # what this thread tracks
    start_mission: integer          # when the thread begins
    resolution_range: string        # "missions 18-22" — approximate resolution window
    status: string                  # "setup", "developing", "climax", "resolved"

tone_guide: string                  # specific guidance for maintaining consistent tone
```

---

## 9. D044 Orchestrator: Game State to Prompt Serialization

The `LlmOrchestratorAi` (D044) periodically serializes the visible game state into a compact YAML-like format for LLM consumption. The serialization uses `FogFilteredView` — the LLM only sees what the AI player sees.

### Serialization Format

```yaml
# ============================================================
# Serialized Game State for LLM Orchestrator
# ============================================================
# This format is generated by the game state serializer in ic-ai.
# It is sent to the LLM every consultation_interval ticks.
# All data is fog-filtered — only visible/known information.
# ============================================================

game_state:
  tick: 9000                        # current simulation tick
  game_time_seconds: 300            # 9000 ticks / 30 tps = 300 seconds
  resources:
    credits: 4200
    ore_income_rate: 85             # credits per collection cycle
    power_balance: +50              # surplus (positive) or deficit (negative)

  # --- Own Forces (exact counts — we know our own army) ---
  own_units:
    rifle_infantry: 24
    rocket_infantry: 8
    engineer: 2
    medium_tank: 6
    heavy_tank: 3
    v2_launcher: 2
    ore_truck: 3
    apc: 2
    mig: 4

  own_structures:
    construction_yard: 1
    power_plant: 4
    ore_refinery: 2
    barracks: 1
    war_factory: 1
    radar_dome: 1
    airfield: 1
    tesla_coil: 3
    wall_segments: 28

  base_status:
    expansion_count: 1              # number of secondary bases
    tech_level: 7                   # current technology tier
    production_queues:
      infantry: "rocket_infantry (12s remaining)"
      vehicle: "heavy_tank (45s remaining)"
      aircraft: "idle"
      structure: "tesla_coil (30s remaining)"

  # --- Visible Enemies (only what fog of war reveals) ---
  visible_enemies:
    units:
      - type: medium_tank
        count: 4
        location: "north_east quadrant, near ore field"
      - type: rifle_infantry
        count: 12
        location: "central choke point, dug in"
      - type: artillery
        count: 2
        location: "behind central ridge, firing on our eastern expansion"
    total_visible_unit_value: 8400  # estimated credits worth of visible enemies

  enemy_structures_known:
    - type: construction_yard
      location: "north_west corner"
      first_seen_tick: 3000
    - type: war_factory
      location: "north_west corner"
      first_seen_tick: 3000
    - type: barracks
      location: "north, near center"
      first_seen_tick: 4500
    - type: ore_refinery
      location: "north_east, near ore field"
      first_seen_tick: 6000

  # --- Recent Events (from AiEventLog.to_narrative) ---
  recent_events: |
    Tick 7200: Enemy tank column spotted moving south through the central passage.
    Tick 7500: Our eastern tesla coil engaged 3 enemy tanks — destroyed 1, damaged 2.
    Tick 7800: Enemy artillery began shelling our eastern ore refinery.
    Tick 8100: Our MiG squadron destroyed the enemy ore truck near their expansion.
    Tick 8400: Enemy infantry spotted infiltrating through the western forest.
    Tick 8700: Our engineer was killed by enemy attack dogs near the central bridge.
    Tick 8900: Enemy appears to be massing units north of the central choke point.

  # --- Current Plan (from last LLM consultation, if any) ---
  current_plan:
    priority_targets:
      - "Destroy the enemy artillery shelling our eastern expansion"
      - "Eliminate the enemy ore refinery to cripple their economy"
    build_focus: "Anti-armor — heavy tanks and V2 launchers"
    economic_guidance: "Protect the eastern ore refinery at all costs"
    risk_assessment: "Enemy is likely preparing a major push through the central choke"
    plan_age_ticks: 300             # how old this plan is
```

### Orchestrator Response Schema

```rust
/// The LLM's strategic response — parsed from structured output.
/// Translates into set_parameter() calls on the inner AI.
#[derive(Deserialize, Debug, Clone)]
pub struct StrategicPlan {
    /// High-priority targets the AI should focus on.
    /// Ordered by priority (first = most important).
    pub priority_targets: Vec<StrategicTarget>,

    /// What the AI should be building.
    pub build_focus: BuildFocus,

    /// Economic guidance — resource allocation priorities.
    pub economic_guidance: EconomicGuidance,

    /// Threat assessment and defensive posture.
    pub risk_assessment: RiskAssessment,

    /// Optional: specific tactical suggestions.
    pub tactical_notes: Option<String>,

    /// The LLM's reasoning (displayed in debug overlay).
    pub reasoning: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct StrategicTarget {
    pub description: String,
    pub target_type: String,        // "unit_group", "structure", "zone"
    pub location_hint: String,      // "north_east", "central choke", etc.
    pub urgency: String,            // "immediate", "soon", "when_ready"
}

#[derive(Deserialize, Debug, Clone)]
pub struct BuildFocus {
    pub unit_priority: String,      // "anti_armor", "anti_air", "infantry_mass", "balanced", "naval"
    pub structure_priority: String, // "defense", "economy", "tech_up", "production"
    pub specific_units: Vec<String>, // specific unit types to prioritize
}

#[derive(Deserialize, Debug, Clone)]
pub struct EconomicGuidance {
    pub expand: bool,               // should the AI build a new expansion?
    pub protect_harvesters: bool,   // prioritize harvester defense?
    pub target_income: String,      // "maximize", "sufficient", "minimal" (going all-in)
}

#[derive(Deserialize, Debug, Clone)]
pub struct RiskAssessment {
    pub threat_level: String,       // "low", "medium", "high", "critical"
    pub expected_attack_direction: Option<String>,
    pub defensive_posture: String,  // "aggressive", "balanced", "defensive", "turtle"
    pub time_pressure: String,      // "none", "moderate", "urgent"
}
```

### StrategicPlan YAML Output (what the LLM returns)

```yaml
# ============================================================
# StrategicPlan — LLM Orchestrator Response
# ============================================================

strategic_plan:
  priority_targets:
    - description: "Destroy the enemy artillery shelling our eastern expansion"
      target_type: unit_group
      location_hint: "behind central ridge"
      urgency: immediate

    - description: "Raid the enemy ore refinery to damage their economy"
      target_type: structure
      location_hint: "north_east, near ore field"
      urgency: soon

    - description: "Clear the western forest of infiltrating infantry"
      target_type: unit_group
      location_hint: "western forest"
      urgency: soon

  build_focus:
    unit_priority: anti_armor
    structure_priority: defense
    specific_units:
      - heavy_tank
      - v2_launcher
      - attack_dog              # to counter the infantry infiltration

  economic_guidance:
    expand: false                # not safe to expand right now
    protect_harvesters: true
    target_income: sufficient

  risk_assessment:
    threat_level: high
    expected_attack_direction: "central choke point — enemy massing units there"
    defensive_posture: balanced
    time_pressure: moderate     # artillery is ongoing damage; needs resolution

  tactical_notes: >
    Consider using MiGs to strike the artillery before committing ground forces
    through the choke point. The western infiltration is likely a diversion —
    do not over-commit to it. Maintain tesla coil coverage on the eastern flank.

  reasoning: >
    The enemy is pressuring two axes: artillery from the ridge against our economy,
    and infantry probing through the western forest. The massing at the central choke
    suggests a main push is imminent. Priority is eliminating the artillery to stabilize
    our economy, then reinforcing the choke point. The western infiltration is secondary
    but should be addressed with dogs, not tanks. Our air superiority (4 MiGs vs no
    visible AA) is our best asymmetric advantage — use it against high-value targets.
```

### Parameter Mapping

The orchestrator translates `StrategicPlan` fields to `set_parameter()` calls on the inner AI:

```rust
impl LlmOrchestratorAi {
    fn apply_strategic_plan(&mut self, plan: &StrategicPlan) {
        // Build focus → production parameters
        match plan.build_focus.unit_priority.as_str() {
            "anti_armor" => {
                self.inner.set_parameter("tech_priority_armor", 80);
                self.inner.set_parameter("tech_priority_aa", 20);
            }
            "anti_air" => {
                self.inner.set_parameter("tech_priority_aa", 80);
                self.inner.set_parameter("tech_priority_armor", 30);
            }
            "infantry_mass" => {
                self.inner.set_parameter("infantry_ratio", 70);
                self.inner.set_parameter("vehicle_ratio", 30);
            }
            "balanced" => {
                self.inner.set_parameter("tech_priority_armor", 50);
                self.inner.set_parameter("tech_priority_aa", 50);
            }
            _ => {}
        }

        // Risk assessment → aggression and defensive posture
        match plan.risk_assessment.defensive_posture.as_str() {
            "aggressive" => self.inner.set_parameter("aggression", 80),
            "balanced" => self.inner.set_parameter("aggression", 50),
            "defensive" => self.inner.set_parameter("aggression", 25),
            "turtle" => self.inner.set_parameter("aggression", 10),
            _ => {}
        }

        // Economic guidance → expansion behavior
        if plan.economic_guidance.expand {
            self.inner.set_parameter("expansion_priority", 90);
        } else {
            self.inner.set_parameter("expansion_priority", 20);
        }

        // Threat level → defensive allocation
        match plan.risk_assessment.threat_level.as_str() {
            "low" => self.inner.set_parameter("defense_allocation", 20),
            "medium" => self.inner.set_parameter("defense_allocation", 40),
            "high" => self.inner.set_parameter("defense_allocation", 60),
            "critical" => self.inner.set_parameter("defense_allocation", 80),
            _ => {}
        }

        // Record the plan change in the event log
        self.event_log.push(AiEventEntry {
            tick: self.current_tick,
            event_type: AiEventType::StrategicUpdate,
            description: format!("Strategic plan updated: {}", plan.reasoning),
            entity: None,
            related_entity: None,
        });
    }
}
```

---

## 10. Coaching Prompt Template (D042)

The coaching system generates post-match analysis and improvement advice. The LLM reads a structured battle report and player profile, then produces actionable coaching output.

### System Prompt

```
{# ============================================================ #}
{# SYSTEM PROMPT — Post-Match Coaching                           #}
{# ============================================================ #}

You are a Red Alert strategy coach. Your job is to analyze a completed match and provide actionable advice to help the player improve. You are encouraging but honest — praise what went well, identify specific mistakes, and give concrete suggestions.

## Coaching Personality
- **Tone:** Supportive but direct. Like a good sports coach — you celebrate wins and diagnose losses without sugarcoating.
- **Specificity:** Never say "build more units." Say "You had 3 tanks at the 5-minute mark when you could have had 6 — your War Factory was idle for 45 seconds between builds."
- **Actionable:** Every suggestion must be something the player can practice. "Improve your micro" is useless. "When your tanks engage, pull damaged ones to the back of the formation" is actionable.
- **Priority:** Focus on the 1-3 biggest impact improvements, not every small mistake.
- **Context-aware:** Consider the player's skill level. A new player needs fundamentals (build order, resource management). An experienced player needs refinement (engagement timing, tech switches, map control).

## Match Data Format
You will receive:
1. Match result and basic statistics
2. Player behavior snapshot (from D042 event classification)
3. Key moments — timestamped events that significantly affected the outcome
4. Player's historical profile — what they are good at and what they struggle with

## Output Format
Produce a YAML document with these keys:
- coaching_summary: 2-3 sentence overview
- key_moments: analysis of the 3-5 most important moments
- improvement_suggestions: 2-3 specific, actionable suggestions
- encouragement: 1-2 sentences of genuine encouragement
```

### User Prompt

```
{# ============================================================ #}
{# USER PROMPT — Post-Match Coaching                             #}
{# ============================================================ #}

## Match Result
- **Map:** {{ match.map_name }}
- **Mode:** {{ match.mode }} ({{ match.player_count }} players)
- **Result:** {{ match.result }}
- **Duration:** {{ match.duration_seconds }}s ({{ match.duration_formatted }})
- **Faction:** {{ match.player_faction }} vs. {{ match.opponent_faction }}

## Match Statistics
- **APM (average):** {{ stats.apm }}
- **Resources gathered:** {{ stats.resources_gathered }}
- **Resources spent:** {{ stats.resources_spent }}
- **Resource efficiency:** {{ stats.resource_efficiency }}%
- **Units produced:** {{ stats.units_produced }}
- **Units lost:** {{ stats.units_lost }}
- **Units destroyed:** {{ stats.units_destroyed }}
- **Structures built:** {{ stats.structures_built }}
- **Structures lost:** {{ stats.structures_lost }}
- **Structures destroyed:** {{ stats.structures_destroyed }}
- **Tech level reached:** {{ stats.max_tech_level }}
- **First attack timing:** {{ stats.first_attack_seconds }}s
- **Expansion count:** {{ stats.expansions }}

## Player Behavior Snapshot
- **Aggression index:** {{ behavior.aggression_index }} (0=turtle, 1=all-in rusher)
- **Tech priority:** {{ behavior.tech_priority }}
- **Build order:** {{ behavior.opening_build_order }}
- **Unit composition:** {% for unit, pct in behavior.unit_composition %}{{ unit }}: {{ pct }}%{% if not loop.last %}, {% endif %}{% endfor %}
- **Engagement style:** {{ behavior.engagement_style }}
- **Micro intensity:** {{ behavior.micro_intensity }} orders/unit/minute
- **Idle production time:** {{ behavior.idle_production_seconds }}s total

## Key Moments
{% for moment in key_moments %}
### {{ moment.timestamp_formatted }} — {{ moment.title }}
{{ moment.description }}
Impact: {{ moment.impact }}
{% endfor %}

## Player Historical Profile
- **Games analyzed:** {{ profile.games_analyzed }}
- **Win rate:** {{ profile.win_rate }}%
- **Preferred factions:** {{ profile.preferred_factions }}
- **Known weaknesses:**
{% for weakness in profile.loss_patterns %}
  - {{ weakness }}
{% endfor %}
- **Underused counters:** {{ profile.underused_counters }}
- **Historical improvement trend:** {{ profile.improvement_trend }}

## Generate coaching analysis.
```

### Response Schema

```yaml
# ============================================================
# Coaching Response Schema
# ============================================================

coaching_summary: >
  string — 2-3 sentence match overview with a clear takeaway.
  Example: "You opened strong with a fast tank push that caught your
  opponent off-guard, but lost momentum mid-game when your economy
  stalled. The key issue was idle production — your War Factory sat
  empty for nearly 90 seconds total while you had the credits to keep building."

key_moments:
  - timestamp: string             # "3:20" formatted
    title: string                 # short title: "Tank push lands"
    what_happened: string         # factual description
    what_went_well: string | null # positive aspect (null if purely negative)
    what_went_wrong: string | null # mistake or missed opportunity
    lesson: string                # what to take away from this moment

  - timestamp: string
    title: string
    what_happened: string
    what_went_well: string | null
    what_went_wrong: string | null
    lesson: string

  # ... 3-5 moments total

improvement_suggestions:
  - priority: integer             # 1 = most impactful
    area: string                  # "economy", "production", "combat", "scouting", "tech", "timing"
    suggestion: string            # specific, actionable advice
    practice: string              # how to practice this specifically
    expected_impact: string       # "This alone could improve your win rate by ~10%"

  - priority: integer
    area: string
    suggestion: string
    practice: string
    expected_impact: string

  # ... 2-3 suggestions

encouragement: >
  string — 1-2 sentences of genuine, specific encouragement.
  Reference something the player actually did well.
  Example: "Your opening build order was crisp and your initial attack
  was well-timed — that's a real skill. Keep that aggression, just
  make sure your economy can sustain it."
```

---

## 11. Prompt Strategy Profile Integration (D047)

Prompt templates adapt their content, complexity, and structure based on the active `PromptStrategyProfile` (D047). The same logical prompt produces different outputs for `CloudRich` vs. `LocalCompact` profiles.

### Profile Differences

| Aspect | CloudRich | LocalCompact |
|---|---|---|
| System prompt length | Full (2000-4000 tokens) | Condensed (500-1000 tokens) |
| Few-shot examples | 2-3 complete examples | 0-1 abbreviated examples |
| Schema complexity | Full YAML with all optional fields | Minimal YAML — required fields only |
| Output format | Strict structured YAML | Simplified YAML with relaxed parsing |
| Story style rules | All 13 rules listed | 3-4 most important rules |
| Unit type listing | Full descriptions with cost/category | Names only (no descriptions) |
| Retry passes | 2 (parse + validate + repair) | 1 (parse + best-effort repair) |
| Max output tokens | 4000-8000 | 1500-3000 |

### CloudRich System Prompt (Orchestrator Example)

```
You are a strategic advisor for a Red Alert AI player. You receive the current game state and recent events, and provide high-level strategic guidance.

## Rules
- Focus on WHAT to build, WHERE to expand, WHEN to attack, and WHAT threats to prepare for.
- Do NOT issue specific unit orders — your AI subordinate handles tactical execution.
- Consider the fog of war — you can only see what is visible.
- Weigh risk vs. reward. An aggressive plan that fails is worse than a safe plan that succeeds.
- Your reasoning will be shown in a debug overlay — explain your thinking clearly.

## Response Format
Respond with a YAML document matching this exact schema:

```yaml
strategic_plan:
  priority_targets:
    - description: string           # what to target and why
      target_type: string           # "unit_group", "structure", "zone"
      location_hint: string         # approximate location
      urgency: string               # "immediate", "soon", "when_ready"
  build_focus:
    unit_priority: string           # "anti_armor", "anti_air", "infantry_mass", "balanced", "naval"
    structure_priority: string      # "defense", "economy", "tech_up", "production"
    specific_units: [string]        # specific unit type names to prioritize
  economic_guidance:
    expand: boolean
    protect_harvesters: boolean
    target_income: string           # "maximize", "sufficient", "minimal"
  risk_assessment:
    threat_level: string            # "low", "medium", "high", "critical"
    expected_attack_direction: string | null
    defensive_posture: string       # "aggressive", "balanced", "defensive", "turtle"
    time_pressure: string           # "none", "moderate", "urgent"
  tactical_notes: string            # optional specific suggestions
  reasoning: string                 # explain your strategic thinking
```

## Example Response

```yaml
strategic_plan:
  priority_targets:
    - description: "Destroy the enemy ore refinery to cripple their economy"
      target_type: structure
      location_hint: "north_east corner"
      urgency: immediate
    - description: "Harass enemy expansion with fast units"
      target_type: zone
      location_hint: "eastern ore field"
      urgency: soon
  build_focus:
    unit_priority: balanced
    structure_priority: economy
    specific_units: [medium_tank, ore_truck]
  economic_guidance:
    expand: true
    protect_harvesters: true
    target_income: maximize
  risk_assessment:
    threat_level: medium
    expected_attack_direction: "south through the mountain pass"
    defensive_posture: balanced
    time_pressure: none
  tactical_notes: "Our economy is stronger — use this advantage to outproduce the enemy."
  reasoning: "The enemy's economy is their weakness. One refinery vs our two means we outproduce them 2:1. Destroying their refinery forces them to rebuild or starve. Meanwhile we expand and tech up."
```
```

### LocalCompact System Prompt (Same Orchestrator Task)

```
You are an AI strategy advisor for a Red Alert RTS game. Analyze the game state and give strategic guidance in YAML.

Respond with ONLY this YAML structure — no other text:

strategic_plan:
  priority_targets:
    - description: string
      urgency: immediate | soon | when_ready
  build_focus:
    unit_priority: anti_armor | anti_air | infantry_mass | balanced | naval
    structure_priority: defense | economy | tech_up | production
  economic_guidance:
    expand: true | false
    protect_harvesters: true | false
  risk_assessment:
    threat_level: low | medium | high | critical
    defensive_posture: aggressive | balanced | defensive | turtle
  reasoning: string
```

Note the differences:
- No few-shot example (saves ~300 tokens)
- No optional fields (`tactical_notes`, `specific_units`, `expected_attack_direction`, `time_pressure`, `location_hint`, `target_type`, `target_income`)
- Enum values listed inline (helps local models with constrained generation)
- No rules section (saves ~200 tokens)
- No narrative preamble

### Profile Selection Logic

```rust
impl PromptAssembler {
    fn select_profile(
        &self,
        task: &LlmTask,
        provider: &LlmProvider,
        probe_results: Option<&ModelCapabilityProbe>,
    ) -> PromptStrategyProfile {
        // User explicit override takes priority
        if let Some(explicit) = self.get_explicit_profile(task, provider) {
            return explicit;
        }

        // Auto selection
        match provider.provider_type() {
            ProviderType::Ollama | ProviderType::LlamaCpp => {
                // Local model — check probe results
                if let Some(probe) = probe_results {
                    if probe.json_reliability_score.unwrap_or(0.0) > 0.8
                        && probe.tool_call_support == Some(true)
                    {
                        // Local model with good structured output
                        PromptStrategyProfile::local_structured()
                    } else if probe.effective_context_estimate.unwrap_or(0) < 4096 {
                        // Very limited context — use stepwise decomposition
                        PromptStrategyProfile::local_stepwise()
                    } else {
                        // Standard local model
                        PromptStrategyProfile::local_compact()
                    }
                } else {
                    // No probe results — conservative default
                    PromptStrategyProfile::local_compact()
                }
            }
            ProviderType::OpenAI | ProviderType::Anthropic | ProviderType::Custom => {
                // Cloud provider — assume capable
                match task {
                    LlmTask::Orchestrator => {
                        // Orchestrator needs fast responses — compact even for cloud
                        PromptStrategyProfile::cloud_rich_with_reduced_tokens()
                    }
                    _ => PromptStrategyProfile::cloud_rich(),
                }
            }
        }
    }
}
```

### Few-Shot Example Scaling

| Profile | Mission Generation | Orchestrator | Coaching |
|---|---|---|---|
| CloudRich | 2 full mission examples | 1 full example | 1 full example |
| CloudStructuredJson | 1 full example + JSON schema | 1 JSON schema | 1 JSON schema |
| LocalCompact | 0 examples (schema only) | 0 examples (schema only) | 0 examples (schema only) |
| LocalStructured | 1 abbreviated example | 0 examples (inline enums) | 1 abbreviated example |
| LocalStepwise | N/A (decomposed into sub-prompts) | N/A (simplified to key-value) | N/A (decomposed) |

### LocalStepwise Decomposition

For models with very limited context or poor structured output, `LocalStepwise` breaks a single mission generation into multiple smaller LLM calls:

```
Step 1: Generate map features and zones (YAML, ~500 token output)
Step 2: Given map, generate player forces (YAML, ~300 token output)
Step 3: Given map, generate enemy forces (YAML, ~400 token output)
Step 4: Given map + forces, generate objectives (YAML, ~300 token output)
Step 5: Given objectives, generate outcomes (YAML, ~400 token output)
Step 6: Given all above, generate Lua triggers (code, ~600 token output)
Step 7: Given objectives + outcomes, generate briefing (text, ~300 token output)
```

Each step receives only the output of previous steps as context, keeping individual prompts small. Validation runs after all steps complete. If a step fails, only that step is retried.

---

## 12. Error Recovery Prompts

When validation (Section 6) fails on LLM output, the system sends a targeted error recovery prompt requesting regeneration of only the broken section.

### Error Recovery System Prompt

```
{# ============================================================ #}
{# SYSTEM PROMPT — Error Recovery                                #}
{# Appended to the original system prompt when retrying          #}
{# ============================================================ #}

## IMPORTANT: Error Recovery Mode

Your previous output contained validation errors. You must regenerate ONLY the specified section, fixing the listed errors. The rest of the mission is valid and should NOT be changed.

Rules for error recovery:
1. Fix ONLY the listed errors — do not change anything else.
2. Maintain consistency with the unchanged sections.
3. Use only valid unit types, zone IDs, and objective IDs from the original output.
4. If a zone was undefined, either define it in the regenerated section or reference an existing zone.
5. If a unit type was invalid, replace it with the closest valid type.
```

### Error Recovery User Prompt Template

```
{# ============================================================ #}
{# USER PROMPT — Targeted Section Regeneration                   #}
{# ============================================================ #}

## Validation Errors in Your Previous Output

Your previous mission generation for "{{ mission_title }}" had the following errors in the **{{ failed_section }}** section:

{% for error in errors %}
### Error {{ loop.index }}: {{ error.type }}
{% if error.type == "UnknownUnitType" %}
- **Invalid unit type:** `{{ error.unit_type }}`
- **Used in:** {{ error.section }}
{% if error.suggestion %}- **Did you mean:** `{{ error.suggestion }}`{% endif %}
- **Valid unit types for this faction:** {{ valid_unit_types | join(", ") }}
{% elif error.type == "UndefinedZone" %}
- **Undefined zone:** `{{ error.zone_id }}`
- **Referenced in:** {{ error.referenced_in }}
- **Defined zones:** {{ defined_zones | join(", ") }}
{% elif error.type == "ObjectiveTargetMissing" %}
- **Objective:** `{{ error.objective_id }}`
- **Missing target:** `{{ error.target }}` (expected {{ error.target_type }})
- **Available targets:** {{ available_targets | join(", ") }}
{% elif error.type == "ObjectiveUnreachable" %}
- **Objective:** `{{ error.objective_id }}`
- **Reason:** {{ error.reason }}
- Ensure there is a traversable path from the player start zone to the objective target.
{% elif error.type == "LuaParseError" %}
- **Script:** `{{ error.script_name }}`
- **Line {{ error.line }}, Column {{ error.column }}:** {{ error.message }}
- Fix the Lua syntax error at the indicated location.
{% elif error.type == "LuaSandboxViolation" %}
- **Script:** `{{ error.script_name }}`
- **Line {{ error.line }}:** Used `{{ error.function_name }}` — {{ error.reason }}
- Replace with an allowed API function. Allowed functions: Trigger.AfterDelay, Trigger.OnKilled, Trigger.OnCaptured, Trigger.OnDamaged, Trigger.OnAllUnitsDestroyed, Trigger.OnUnitEntersRegion, Trigger.OnEnteredProximity, Objective.Add, Objective.Complete, Objective.Fail, Objective.Reveal, Map.GetZone, Map.RevealShroud, Map.GetActorsInZone, Reinforcements.Spawn, Reinforcements.SpawnWithTransport, RadarComm.Show, Campaign.get_flag, Campaign.set_flag, Camera.PanTo, Letterbox.Enable, Letterbox.Disable, Music.Play, Music.SetMood, DateTime.GameTime, Utils.RandomInteger
{% elif error.type == "MissingVictoryOutcome" %}
- No outcome covers the case where all primary objectives are completed.
- Add an outcome with conditions that match all primary objectives being complete.
{% elif error.type == "MissingDefeatOutcome" %}
- **Uncovered failure:** Objective `{{ error.uncovered_failure }}` can fail but no outcome handles it.
- Add an outcome with a condition matching this objective's failure.
{% elif error.type == "InvalidFeatureLayout" %}
- **Feature:** `{{ error.feature_id }}`
- **Problem:** {{ error.reason }}
- Ensure the feature layout is physically coherent (bridges need rivers, roads connect zones, etc.)
{% endif %}
{% endfor %}

## Valid Sections (DO NOT CHANGE)

{% if section_validity.mission_map %}
### Map (VALID — do not regenerate)
```yaml
{{ original_output.mission_map | yaml }}
```
{% endif %}

{% if section_validity.player_forces %}
### Player Forces (VALID — do not regenerate)
```yaml
{{ original_output.actors.player_forces | yaml }}
```
{% endif %}

{% if section_validity.enemy_forces %}
### Enemy Forces (VALID — do not regenerate)
```yaml
{{ original_output.actors.enemy_forces | yaml }}
```
{% endif %}

{% if section_validity.objectives %}
### Objectives (VALID — do not regenerate)
```yaml
{{ original_output.objectives | yaml }}
```
{% endif %}

{% if section_validity.outcomes %}
### Outcomes (VALID — do not regenerate)
```yaml
{{ original_output.outcomes | yaml }}
```
{% endif %}

## Regenerate the Following Section

Please regenerate ONLY the **{{ failed_section }}** section, fixing all listed errors.
Maintain consistency with the valid sections shown above.
Output only the regenerated section as YAML — do not repeat the valid sections.
```

### Regeneration Attempt Tracking

```rust
/// Tracks regeneration attempts per section.
pub struct RegenerationState {
    /// Attempts per section (max 3 per section).
    pub section_attempts: HashMap<String, u8>,
    /// Full-mission regeneration attempts (max 1).
    pub full_regen_attempts: u8,
    /// Accumulated errors across attempts (for debugging/logging).
    pub error_history: Vec<(String, Vec<ValidationError>)>,
}

impl RegenerationState {
    pub fn should_retry_section(&self, section: &str) -> bool {
        self.section_attempts.get(section).copied().unwrap_or(0) < 3
    }

    pub fn should_retry_full(&self) -> bool {
        self.full_regen_attempts < 1
    }

    pub fn record_section_attempt(&mut self, section: &str, errors: Vec<ValidationError>) {
        *self.section_attempts.entry(section.to_string()).or_insert(0) += 1;
        self.error_history.push((section.to_string(), errors));
    }

    pub fn record_full_attempt(&mut self) {
        self.full_regen_attempts += 1;
    }
}
```

---

## 13. Intent Interpretation Prompt Template

The Intent Interpreter is a lightweight, fast LLM call that converts a natural language campaign (or mission) description into structured `CampaignParameters` + narrative seeds. It runs *before* skeleton generation — its output pre-fills the configuration screen (see D016 § Step 1b).

**Design goals:**
- Fast: ~2–5 seconds, not 30. Uses the shortest viable prompt.
- Grounded: the heuristic table below is included in the prompt so the LLM doesn't hallucinate parameter names or values.
- Transparent: every inferred value includes a human-readable `explanation` so the UI can show *why* each field was set.

### Intent Interpreter System Prompt

```yaml
system: |
  You are a campaign parameter interpreter for Iron Curtain, a C&C Red Alert RTS.
  The user will describe a campaign or mission idea in natural language.
  Your job is to extract structured parameters and narrative seeds.

  ## Available Parameters (output ONLY these keys)

  faction: soviet | allied | <modded faction name>
  campaign_length: 8 | 16 | 24 | 32 | 0 (open-ended)
  branching_density: low | medium | high
  tone: military_thriller | pulp_action | dark_gritty | campy | espionage | <freeform>
  story_style: cnc_classic | realistic_military | political_thriller | pulp_sci_fi | character_drama | <freeform>
  difficulty_curve: flat | escalating | adaptive | brutal
  roster_persistence: true | false
  named_character_count: 3-8 (integer)
  theater: european | arctic | desert | pacific | global | random | <specific>
  mission_variety: balanced | assault_heavy | defense_heavy | stealth_heavy | naval_heavy | mixed
  faction_purity_permille: 0-1000 (default 900)
  resource_level: scarce | standard | abundant
  weather_variation: true | false
  moral_complexity: low | medium | high

  ## Inference Heuristic Grounding Table

  Use this table to guide your parameter choices. These are patterns, not rigid rules —
  use judgment when the user's description implies something not listed here.

  | Signal | → Parameters | Confidence | Why |
  |--------|-------------|-----------|-----|
  | "redemption" / "disgraced" / "fallen" / "second chance" | difficulty: escalating, resource_level: scarce, moral_complexity: medium | 0.8 | Redemption arcs start from weakness |
  | "Eastern Front" / "Stalingrad" / "Moscow" / "Berlin" | theater: arctic or european, faction: soviet (if not stated) | 0.7 | Historical theater mapping |
  | "Pacific" / "island hopping" / "naval" / "fleet" | theater: pacific, mission_variety: naval_heavy | 0.9 | Naval domain signal |
  | "espionage" / "spy" / "infiltration" / "undercover" | tone: espionage, story_style: political_thriller, mission_variety: stealth_heavy | 0.8 | Genre signal |
  | "brutal" / "hard" / "punishing" / "dark souls" | difficulty_curve: brutal, resource_level: scarce | 0.9 | Direct difficulty signal |
  | "fun" / "crazy" / "over the top" / "wacky" | story_style: pulp_sci_fi, moral_complexity: low | 0.7 | Tone signal |
  | "like Red Alert" / "classic C&C" / "feels like RA" | story_style: cnc_classic, tone: military_thriller | 0.9 | Direct style reference |
  | "short" / "quick" / "one evening" | campaign_length: 8 | 0.8 | Length signal |
  | "epic" / "long" / "saga" / "massive" | campaign_length: 32 | 0.8 | Length signal |
  | "betrayal" / "traitor" / "double agent" | moral_complexity: high, branching_density: high | 0.7 | Narrative complexity signal |
  | "survival" / "desperate" / "last stand" / "holdout" | mission_variety: defense_heavy, resource_level: scarce, difficulty_curve: escalating | 0.8 | Mission type signal |
  | "conquest" / "domination" / "world war" | campaign_length: 0 (open-ended), theater: global | 0.7 | Scale signal |
  | "stealth" / "covert" / "behind enemy lines" | mission_variety: stealth_heavy, tone: espionage | 0.8 | Gameplay style signal |
  | "horror" / "alien" / "supernatural" / "Yuri" | story_style: pulp_sci_fi, moral_complexity: medium | 0.6 | Thematic signal |
  | Named character described in detail | named_character_count: +1, character → narrative_seed | 0.9 | Explicit character signal |
  | "no base building" / "commando" / "special forces" | mission_variety: stealth_heavy, resource_level: scarce | 0.7 | Gameplay constraint signal |
  | "build up" / "turtle" / "economy" / "tech rush" | resource_level: abundant, mission_variety: assault_heavy | 0.6 | Playstyle preference signal |

  ## Output Format

  Respond with a single JSON object. For every CampaignParameters field, include:
  - value: the inferred value (use defaults if no signal)
  - confidence: 0.0-1.0 (how sure you are)
  - source: "explicit" (user said it directly), "inferred" (derived from context), or "default" (no signal)
  - explanation: one sentence — what in the user's description led to this inference

  Also include a `narrative_seeds` array for creative guidance that doesn't map to parameters.

  ## Rules
  1. NEVER invent parameter names not listed above.
  2. If the user's description doesn't imply a parameter, use the default and set source: "default".
  3. If the user explicitly states something ("Soviet campaign"), set source: "explicit" and confidence: 1.0.
  4. Explicit statements ALWAYS override inferences. If the user says "naval" and "Eastern Front" —
     naval is explicit intent, Eastern Front is geographic context. Set mission_variety: naval_heavy.
  5. Extract narrative seeds generously — character ideas, plot hooks, thematic tensions, geographic
     details, historical inspirations. These are creative DNA for the skeleton generator.
  6. Keep explanations conversational and specific: "Inferred from 'disgraced colonel' — redemption
     arcs start from a position of weakness" (good). "Based on user input" (bad — too vague).

user: |
  Describe your campaign or mission idea:

  {{ user_description }}
```

### Intent Interpreter Output Schema

```json
{
  "inferred_parameters": {
    "faction": { "value": "soviet", "confidence": 1.0, "source": "explicit", "explanation": "User explicitly said 'Soviet campaign'." },
    "tone": { "value": "realistic_military", "confidence": 0.8, "source": "inferred", "explanation": "Inferred from 'disgraced colonel' and 'redeem' — serious military drama, not campy." },
    "story_style": { "value": "character_drama", "confidence": 0.7, "source": "inferred", "explanation": "Redemption arc is character-driven — the story is about the colonel, not just the war." },
    "difficulty_curve": { "value": "escalating", "confidence": 0.8, "source": "inferred", "explanation": "Redemption = start weak, earn power back. Difficulty should mirror the arc." },
    "theater": { "value": "snow", "confidence": 0.7, "source": "inferred", "explanation": "Inferred from 'Eastern Front' — snow/temperate Eastern European theater." },
    "campaign_length": { "value": 24, "confidence": 0.5, "source": "default", "explanation": "No length signal in the description. Using standard 24-mission default." },
    "branching_density": { "value": "medium", "confidence": 0.5, "source": "default", "explanation": "No branching signal. Default medium branching." },
    "moral_complexity": { "value": "medium", "confidence": 0.7, "source": "inferred", "explanation": "Redemption arcs imply moral stakes — the colonel's choices should matter." },
    "roster_persistence": { "value": true, "confidence": 0.8, "source": "inferred", "explanation": "Character drama benefits from unit attachment. Persistent roster builds investment." },
    "named_character_count": { "value": 4, "confidence": 0.6, "source": "inferred", "explanation": "Character drama needs a cast. Nudged from default 3-5 to 4." },
    "mission_variety": { "value": "defense_heavy", "confidence": 0.7, "source": "inferred", "explanation": "Disgraced colonel starts desperate — early missions should be defensive/survival." },
    "faction_purity_permille": { "value": 900, "confidence": 0.5, "source": "default", "explanation": "No signal about internal conflict. Default 90% faction purity." },
    "resource_level": { "value": "scarce", "confidence": 0.7, "source": "inferred", "explanation": "Disgraced = under-resourced. The colonel must prove worth with less." },
    "weather_variation": { "value": true, "confidence": 0.5, "source": "default", "explanation": "No signal. Default enabled for Eastern Front variety." }
  },
  "narrative_seeds": [
    {
      "seed_type": "protagonist_archetype",
      "content": "Disgraced colonel seeking redemption through action — once respected, now given a suicide mission nobody expects to succeed.",
      "related_characters": []
    },
    {
      "seed_type": "starting_situation",
      "content": "Stripped of command, reassigned to a penal division or skeleton unit. First mission is a throwaway operation the brass doesn't care about.",
      "related_characters": []
    },
    {
      "seed_type": "arc_shape",
      "content": "Fall → proving ground → earning trust → vindication OR tragic failure. The arc should feel earned — not handed to the player.",
      "related_characters": []
    },
    {
      "seed_type": "character_suggestion",
      "content": "Skeptical superior who assigned the suicide mission. Doubts the protagonist but watches their progress with growing unease — are they actually good?",
      "related_characters": ["superior_officer"]
    },
    {
      "seed_type": "character_suggestion",
      "content": "Loyal NCO who followed the colonel into disgrace. Believes in them when nobody else does. The colonel's conscience.",
      "related_characters": ["loyal_nco"]
    },
    {
      "seed_type": "character_suggestion",
      "content": "Enemy commander who remembers the protagonist's former reputation. Respects them, which makes the conflict personal.",
      "related_characters": ["enemy_commander"]
    },
    {
      "seed_type": "thematic_tension",
      "content": "Redemption vs. revenge — does the colonel fight to be restored to honor, or to prove everyone wrong?",
      "related_characters": []
    },
    {
      "seed_type": "thematic_tension",
      "content": "Obedience vs. initiative — following the chain of command disgraced the colonel last time. Do they follow orders again, or act independently?",
      "related_characters": []
    },
    {
      "seed_type": "geographic_context",
      "content": "Eastern Front, likely 1943-1945. Harsh winter conditions, vast terrain, long supply lines. Matches the desperation of the protagonist's situation.",
      "related_characters": []
    }
  ],
  "raw_description": "Soviet campaign where you're a disgraced colonel trying to redeem yourself on the Eastern Front"
}
```

### Prompt Strategy Integration

The Intent Interpreter uses D047's prompt strategy profiles like any other LLM call:

| Profile | Adaptation |
|---|---|
| `CloudRich` | Full heuristic table in system prompt, detailed JSON output, multi-paragraph explanations |
| `LocalCompact` | Shortened heuristic table (top 10 most common signals), simplified JSON (no explanations), lower token budget |
| `LocalStructured` | JSON-mode only output, no narrative seeds (those are generated in a separate follow-up call if the model is too small for combined output) |
| `LocalStepwise` | Step 1: extract explicit facts. Step 2: infer parameters from context. Step 3: generate narrative seeds. Three small calls instead of one large one. |

### Fallback: No LLM Available for Interpretation

If the user's configured LLM provider is unavailable or too slow for the interpretation step, the system falls back to **keyword matching** against the heuristic table above. This produces lower-quality inferences (no narrative seeds, no confidence-weighted reasoning), but still pre-fills parameters better than raw defaults. The raw description is preserved as `custom_instructions` for the skeleton generation prompt.

---

## 14. Narrative Seed Schema

Narrative seeds are creative guidance extracted from the user's natural language description. They don't map to `CampaignParameters` fields — they flow directly into the skeleton generation prompt (§ 8) as additional context alongside structured parameters.

### Seed Types

| Type | Purpose | Example |
|---|---|---|
| `protagonist_archetype` | Who the player character is — personality, history, motivation | "Disgraced colonel seeking redemption" |
| `starting_situation` | Where the story begins — context, constraints, stakes | "Given a suicide mission nobody expects to succeed" |
| `arc_shape` | The overall narrative trajectory | "Fall → proving ground → vindication" |
| `character_suggestion` | A named or unnamed character the user wants in the story | "Loyal sergeant who followed the colonel into disgrace" |
| `thematic_tension` | A dramatic question the campaign should explore | "Redemption vs. revenge" |
| `narrative_thread` | A specific plot thread to weave through the campaign | "A mole inside the protagonist's unit" |
| `geographic_context` | Setting details beyond the `theater` parameter | "Eastern Front, harsh winter, long supply lines" |
| `historical_inspiration` | Real history or fiction the user wants the campaign to evoke | "Based on Operation Barbarossa" or "Like Band of Brothers" |
| `tone_modifier` | Adjustments to the story style preset | "But with dark humor" or "More personal, less political" |
| `gameplay_constraint` | Gameplay rules the user wants enforced | "No base building for the first 5 missions" or "Always outnumbered" |
| `custom_constraint` | Anything else that doesn't fit the above types | Catch-all for unique user requests |

### YAML Format

```yaml
# Narrative seeds are passed to the skeleton generation prompt
# alongside CampaignParameters. They appear in the prompt under
# a "Creative Direction" section.

narrative_seeds:
  - seed_type: protagonist_archetype
    content: "Disgraced colonel seeking redemption through action"
    related_characters: []

  - seed_type: character_suggestion
    content: "Loyal NCO who followed the colonel into disgrace"
    related_characters: ["loyal_nco"]
    personality_hint: "Believes in the colonel when no one else does"
    suggested_mbti: ISFJ  # optional — the skeleton generator can override

  - seed_type: thematic_tension
    content: "Obedience vs. initiative"
    related_characters: []
    mission_range: [1, 16]  # optional — when this tension is most relevant

  - seed_type: gameplay_constraint
    content: "Always outnumbered — never give the player force superiority"
    enforcement: soft  # soft = LLM should aim for this; hard = validation enforces it
```

### How Seeds Flow Into Skeleton Generation

The skeleton generation prompt (§ 8) already accepts `campaign_parameters` and `custom_instructions`. Narrative seeds are injected as a structured `creative_direction` block between them:

```yaml
# Existing skeleton prompt inputs (unchanged):
#   campaign_parameters: { faction, tone, difficulty_curve, ... }
#   custom_instructions: "freeform text from Advanced parameters"

# New: structured creative direction from Intent Interpreter
creative_direction:
  protagonist: "{{ narrative_seeds | selectattr('seed_type', 'protagonist_archetype') | first }}"
  starting_situation: "{{ narrative_seeds | selectattr('seed_type', 'starting_situation') | first }}"
  arc_shape: "{{ narrative_seeds | selectattr('seed_type', 'arc_shape') | first }}"

  suggested_characters:
    {% for seed in narrative_seeds | selectattr('seed_type', 'character_suggestion') %}
    - description: "{{ seed.content }}"
      personality_hint: "{{ seed.personality_hint | default('') }}"
      suggested_mbti: "{{ seed.suggested_mbti | default('') }}"
    {% endfor %}

  thematic_tensions:
    {% for seed in narrative_seeds | selectattr('seed_type', 'thematic_tension') %}
    - "{{ seed.content }}"
    {% endfor %}

  constraints:
    {% for seed in narrative_seeds | selectattr('seed_type', 'gameplay_constraint') %}
    - content: "{{ seed.content }}"
      enforcement: "{{ seed.enforcement | default('soft') }}"
    {% endfor %}

  context:
    {% for seed in narrative_seeds | selectattr('seed_type', 'in', ['geographic_context', 'historical_inspiration', 'tone_modifier']) %}
    - "{{ seed.content }}"
    {% endfor %}
```

The skeleton generator treats narrative seeds as **strong suggestions, not constraints** (unless `enforcement: hard`). The LLM can adapt, expand, or creatively interpret them. A seed saying "loyal NCO" might become a grizzled Master Sergeant with a name, MBTI type, and full backstory — the seed is the spark, not the specification.

### Narrative Seeds vs. Custom Instructions

| | Narrative Seeds | Custom Instructions |
|---|---|---|
| **Source** | Extracted by Intent Interpreter from natural language | Typed directly in Advanced parameters text field |
| **Structure** | Typed (seed_type, content, related_characters) | Freeform string |
| **Prompt placement** | `creative_direction` block (structured) | `custom_instructions` field (appended raw) |
| **Override behavior** | Seeds are suggestions the LLM can adapt | Custom instructions are directives the LLM should follow |
| **Coexistence** | Both can be present simultaneously | Both can be present simultaneously |

When both exist, custom instructions take priority over conflicting narrative seeds (following the override priority in D016 § Step 1b).

---

## Cross-References

| Decision / Doc | Relationship |
|---|---|
| **D016** (LLM-Generated Missions) | Primary design source. Schemas in this document implement D016's generation pipeline, campaign skeleton, battle report, validation pass, and Intent Interpreter (§§ 13–14). |
| **D021** (Branching Campaigns) | Output format. All generated content is standard D021 — YAML campaign graph, mission nodes, named outcomes, story flags, roster carryover. |
| **D042** (Behavioral Profiles) | Coaching prompt template (Section 10) consumes `PlayerStyleProfile` data. Player tendencies feed into mission generation prompts. |
| **D044** (LLM-Enhanced AI) | Orchestrator serialization (Section 9) implements D044's `StrategicPlan` response schema and game state serialization for `LlmOrchestratorAi`. |
| **D047** (LLM Configuration) | Prompt Strategy Profile integration (Section 11) implements D047's `PromptStrategyProfile` system — CloudRich vs. LocalCompact template adaptation. |
| **04-MODDING.md** (Lua API) | Trigger API surface (Section 5) is a subset of the Lua API defined in 04-MODDING.md. LLM-generated Lua uses only sandboxed functions. |
