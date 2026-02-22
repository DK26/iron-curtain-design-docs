# Modding System  Campaign System (Branching, Persistent, Continuous)

*Inspired by Operation Flashpoint: Cold War Crisis / Resistance. See D021.*

OpenRA's campaigns are disconnected: each mission is standalone, you exit to menu between them, there's no flow. Our campaigns are **continuous, branching, and stateful** — a directed graph of missions with persistent state, multiple outcomes per mission, and no mandatory game-over screen.

### Core Principles

1. **Campaign is a graph, not a list.** Missions connect via named outcomes, forming branches, convergence points, and optional paths — not a linear sequence.
2. **Missions have multiple outcomes, not just win/lose.** "Won with bridge intact" and "Won but bridge destroyed" are different outcomes that lead to different next missions.
3. **Failure doesn't end the campaign.** A "defeat" outcome is just another edge in the graph. The designer chooses: branch to a fallback mission, retry with fewer resources, or skip ahead with consequences. "No game over" campaigns are possible.
4. **State persists across missions.** Surviving units, veterancy, captured equipment, story flags, resources — all carry forward based on designer-configured carryover rules.
5. **Continuous flow.** Briefing → mission → debrief → next mission. No exit to menu between levels (unless the player explicitly quits).

### Campaign Definition (YAML)

```yaml
# campaigns/allied/campaign.yaml
campaign:
  id: allied_campaign
  title: "Allied Campaign"
  description: "Drive back the Soviet invasion across Europe"
  start_mission: allied_01

  # What persists between missions (campaign-wide defaults)
  persistent_state:
    unit_roster: true          # surviving units carry forward
    veterancy: true            # unit experience persists
    resources: false           # credits reset per mission
    equipment: true            # captured vehicles/crates persist
    custom_flags: {}           # arbitrary Lua-writable key-value state

  missions:
    allied_01:
      map: missions/allied-01
      briefing: briefings/allied-01.yaml
      video: videos/allied-01-briefing.vqa
      carryover:
        from_previous: none    # first mission — nothing carries
      outcomes:
        victory_bridge_intact:
          description: "Bridge secured intact"
          next: allied_02a
          debrief: briefings/allied-01-debrief-bridge.yaml
          state_effects:
            set_flag: { bridge_status: intact }
        victory_bridge_destroyed:
          description: "Won but bridge was destroyed"
          next: allied_02b
          state_effects:
            set_flag: { bridge_status: destroyed }
        defeat:
          description: "Base overrun"
          next: allied_01_fallback
          state_effects:
            set_flag: { retreat_count: +1 }

    allied_02a:
      map: missions/allied-02a    # different map — bridge crossing
      briefing: briefings/allied-02a.yaml
      carryover:
        units: surviving          # units from mission 01 appear
        veterancy: keep           # their experience carries
        equipment: keep           # captured Soviet tanks too
      conditions:                 # optional entry conditions
        require_flag: { bridge_status: intact }
      outcomes:
        victory:
          next: allied_03
        defeat:
          next: allied_02_fallback

    allied_02b:
      map: missions/allied-02b    # different map — river crossing without bridge
      briefing: briefings/allied-02b.yaml
      carryover:
        units: surviving
        veterancy: keep
      outcomes:
        victory:
          next: allied_03         # branches converge at mission 03
        defeat:
          next: allied_02_fallback

    allied_01_fallback:
      map: missions/allied-01-retreat
      briefing: briefings/allied-01-retreat.yaml
      carryover:
        units: surviving          # fewer units since you lost
        veterancy: keep
      outcomes:
        victory:
          next: allied_02b        # after retreating, you take the harder path
          state_effects:
            set_flag: { morale: low }

    allied_03:
      map: missions/allied-03
      # ...branches converge here regardless of path taken
```

### Campaign Graph Visualization

```
                    ┌─────────────┐
                    │  allied_01  │
                    └──┬───┬───┬──┘
          bridge ok ╱   │       ╲ defeat
                  ╱     │         ╲
    ┌────────────┐  bridge   ┌─────────────────┐
    │ allied_02a │  destroyed│ allied_01_       │
    └─────┬──────┘      │   │ fallback         │
          │       ┌─────┴───┐└────────┬────────┘
          │       │allied_02b│        │
          │       └────┬─────┘        │
          │            │         joins 02b
          └─────┬──────┘
                │ converge
          ┌─────┴──────┐
          │  allied_03  │
          └─────────────┘
```

This is a **directed acyclic graph** (with optional cycles for retry loops). The engine validates campaign graphs at load time: no orphan nodes, all outcome targets exist, start mission is defined.

### Unit Roster & Persistence

Inspired by Operation Flashpoint: Resistance — surviving units are precious resources that carry forward, creating emotional investment and strategic consequences.

**Unit Roster:**
```rust
/// Persistent unit state that carries between campaign missions.
#[derive(Serialize, Deserialize, Clone)]
pub struct RosterUnit {
    pub unit_type: UnitTypeId,        // e.g., "medium_tank", "tanya"
    pub name: Option<String>,         // optional custom name
    pub veterancy: VeterancyLevel,    // rookie → veteran → elite → heroic
    pub kills: u32,                   // lifetime kill count
    pub missions_survived: u32,       // how many missions this unit has lived through
    pub equipment: Vec<EquipmentId>,  // OFP:R-style captured/found equipment
    pub custom_state: HashMap<String, Value>, // mod-extensible per-unit state
}
```

**Carryover modes** (per campaign transition):

| Mode        | Behavior                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| `none`      | Clean slate — the next mission provides its own units                                   |
| `surviving` | All player units alive at mission end join the roster                                   |
| `extracted` | Only units inside a designated extraction zone carry over (OFP-style "get to the evac") |
| `selected`  | Lua script explicitly picks which units carry over                                      |
| `custom`    | Full Lua control — script reads unit list, decides what persists                        |

**Veterancy across missions:**
- Units gain experience from kills and surviving missions
- A veteran tank from mission 1 is still veteran in mission 5
- Losing a veteran unit hurts — they're irreplaceable until you earn new ones
- Veterancy grants stat bonuses (configurable in YAML rules, per balance preset)

**Equipment persistence (OFP: Resistance model):**
- Captured enemy vehicles at mission end go into the equipment pool
- Found supply crates add to available equipment
- Next mission's starting loadout can draw from the equipment pool
- Modders can define custom persistent items

### Campaign State

```rust
/// Full campaign progress — serializable for save games.
#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignState {
    pub campaign_id: CampaignId,
    pub current_mission: MissionId,
    pub completed_missions: Vec<CompletedMission>,
    pub unit_roster: Vec<RosterUnit>,
    pub equipment_pool: Vec<EquipmentId>,
    pub resources: i64,               // persistent credits (if enabled)
    pub flags: HashMap<String, Value>, // story flags set by Lua
    pub stats: CampaignStats,         // cumulative performance
    pub path_taken: Vec<MissionId>,   // breadcrumb trail for replay/debrief
    pub world_map: Option<WorldMapState>, // territory state for World Domination campaigns (D016)
}

/// Territory control state for World Domination campaigns.
/// None for narrative campaigns; populated for strategic map campaigns.
#[derive(Serialize, Deserialize, Clone)]
pub struct WorldMapState {
    pub map_id: String,               // which world map asset is active
    pub mission_count: u32,           // how many missions played so far
    pub regions: HashMap<String, RegionState>,
    pub narrative_state: HashMap<String, Value>, // LLM narrative flags (alliances, story arcs, etc.)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RegionState {
    pub controlling_faction: String,  // faction id or "contested"/"neutral"
    pub stability: i32,               // 0-100; low = vulnerable to revolt/counter-attack
    pub garrison_strength: i32,       // abstract force level
    pub garrison_units: Vec<RosterUnit>, // actual units garrisoned (for force persistence)
    pub named_characters: Vec<String>,// character IDs assigned to this region
    pub recently_captured: bool,      // true if changed hands last mission
    pub war_damage: i32,              // 0-100; accumulated destruction from repeated battles
    pub battles_fought: u32,          // how many missions have been fought over this region
    pub fortification_remaining: i32, // current fortification (degrades with battles, rebuilds)
}

pub struct CompletedMission {
    pub mission_id: MissionId,
    pub outcome: String,              // the named outcome key
    pub time_taken: Duration,
    pub units_lost: u32,
    pub units_gained: u32,
    pub score: i64,
}
```

Campaign state is fully serializable (D010 — snapshottable sim state). Save games capture the entire campaign progress. Replays can replay an entire campaign run, not just individual missions.

### Lua Campaign API

Mission scripts interact with campaign state through a sandboxed API:

```lua
-- === Reading campaign state ===

-- Get the unit roster (surviving units from previous missions)
local roster = Campaign.get_roster()
for _, unit in ipairs(roster) do
    -- Spawn each surviving unit at a designated entry point
    local spawned = SpawnUnit(unit.type, entry_point)
    spawned:set_veterancy(unit.veterancy)
    spawned:set_name(unit.name)
end

-- Read story flags set by previous missions
if Campaign.get_flag("bridge_status") == "intact" then
    -- Bridge exists on this map — open the crossing
    bridge_actor:set_state("intact")
else
    -- Bridge was destroyed — it's rubble
    bridge_actor:set_state("destroyed")
end

-- Check cumulative stats
if Campaign.get_stat("total_units_lost") > 50 then
    -- Player has been losing lots of units — offer reinforcements
    trigger_reinforcements()
end

-- === Writing campaign state ===

-- Signal mission completion with a named outcome
function OnObjectiveComplete()
    if bridge:is_alive() then
        Campaign.complete("victory_bridge_intact")
    else
        Campaign.complete("victory_bridge_destroyed")
    end
end

-- Set custom flags for future missions to read
Campaign.set_flag("captured_radar", true)
Campaign.set_flag("enemy_morale", "broken")

-- Update roster: mark which units survived
-- (automatic if carryover mode is "surviving" — manual if "selected")
function OnMissionEnd()
    local survivors = GetPlayerUnits():alive()
    for _, unit in ipairs(survivors) do
        Campaign.roster_add(unit)
    end
end

-- Add captured equipment to persistent pool
function OnEnemyVehicleCaptured(vehicle)
    Campaign.equipment_add(vehicle.type)
end

-- Failure doesn't mean game over — it's just another outcome
function OnPlayerBaseDestroyed()
    Campaign.complete("defeat")  -- campaign graph decides what happens next
end
```

### Adaptive Difficulty via Campaign State

Campaign state enables dynamic difficulty without an explicit slider:

```yaml
# In a mission's carryover config:
adaptive:
  # If player lost the previous mission, give them extra resources
  on_previous_defeat:
    bonus_resources: 2000
    bonus_units: [medium_tank, medium_tank, rifle_infantry, rifle_infantry]
  # If player blitzed the previous mission, make this one harder
  on_previous_fast_victory:    # completed in < 50% of par time
    extra_enemy_waves: 1
    enemy_veterancy_boost: 1
  # Scale to cumulative performance
  scaling:
    low_roster:                # < 5 surviving units
      reinforcement_schedule: accelerated
    high_roster:               # > 20 surviving units
      enemy_count_multiplier: 1.3
```

This is not AI-adaptive difficulty (that's D016/`ic-llm`). This is **designer-authored conditional logic** expressed in YAML — the campaign reacts to the player's cumulative performance without any LLM involvement.

### Tutorial Campaigns — Progressive Element Introduction (D065)

The campaign system supports **tutorial campaigns** — campaigns designed to teach game mechanics (or mod mechanics) one at a time. Tutorial campaigns use everything above (branching graphs, state persistence, adaptive difficulty) plus the `Tutorial` Lua global (D065) to restrict and reveal gameplay elements progressively.

This pattern works for the built-in Commander School and for modder-created tutorial campaigns. A modder introducing custom units, buildings, or mechanics in a total conversion can use the same infrastructure.

#### End-to-End Example: "Scorched Earth" Mod Tutorial

A modder has created a "Scorched Earth" mod that adds a flamethrower infantry unit, an incendiary airstrike superweapon, and a fire-spreading terrain mechanic. They want a 4-mission tutorial that introduces each new element before the player encounters it in the main campaign.

**Campaign definition:**

```yaml
# mods/scorched-earth/campaigns/tutorial/campaign.yaml
campaign:
  id: scorched_tutorial
  title: "Scorched Earth — Field Training"
  description: "Learn the fire mechanics before you burn everything down"
  start_mission: se_01
  category: tutorial           # appears under Campaign → Tutorial
  requires_mod: scorched-earth
  icon: scorched_tutorial_icon

  persistent_state:
    unit_roster: false           # no carryover for tutorial missions
    custom_flags:
      mechanics_learned: []      # tracks which mod mechanics the player has used

  missions:
    se_01:
      map: missions/scorched-tutorial/01-meet-the-pyro
      briefing: briefings/scorched/01.yaml
      outcomes:
        pass:
          next: se_02
          state_effects:
            append_flag: { mechanics_learned: [flamethrower, fire_spread] }
        skip:
          next: se_02
          state_effects:
            append_flag: { mechanics_learned: [flamethrower, fire_spread] }

    se_02:
      map: missions/scorched-tutorial/02-controlled-burn
      briefing: briefings/scorched/02.yaml
      outcomes:
        pass:
          next: se_03
          state_effects:
            append_flag: { mechanics_learned: [firebreak, extinguish] }
        struggle:
          next: se_02  # retry the same mission with more resources
          adaptive:
            on_previous_defeat:
              bonus_units: [fire_truck, fire_truck]
        skip:
          next: se_03

    se_03:
      map: missions/scorched-tutorial/03-call-the-airstrike
      briefing: briefings/scorched/03.yaml
      outcomes:
        pass:
          next: se_04
          state_effects:
            append_flag: { mechanics_learned: [incendiary_airstrike] }
        skip:
          next: se_04

    se_04:
      map: missions/scorched-tutorial/04-trial-by-fire
      briefing: briefings/scorched/04.yaml
      outcomes:
        pass:
          description: "Training complete — you're ready for the Scorched Earth campaign"
```

**Mission 01 Lua script — introducing the flamethrower and fire spread:**

```lua
-- mods/scorched-earth/missions/scorched-tutorial/01-meet-the-pyro.lua

function OnMissionStart()
    local player = Player.GetPlayer("GoodGuy")
    local enemy = Player.GetPlayer("BadGuy")

    -- Restrict everything except the new flame units
    Tutorial.RestrictSidebar(true)
    Tutorial.RestrictOrders({"move", "stop", "attack"})

    -- Spawn player's flame squad
    local pyros = Actor.Create("flame_trooper", player, spawn_south, { count = 3 })

    -- Spawn enemy bunker (wood — flammable)
    local bunker = Actor.Create("wood_bunker", enemy, bunker_pos)

    -- Step 1: Move to position
    Tutorial.SetStep("approach", {
        title = "Deploy the Pyros",
        hint = "Select your Flame Troopers and move them toward the enemy bunker.",
        focus_area = bunker_pos,
        eva_line = "new_unit_flame_trooper",
        completion = { type = "move_to", area = approach_zone }
    })
end

function OnStepComplete(step_id)
    if step_id == "approach" then
        -- Step 2: Attack the bunker
        Tutorial.SetStep("ignite", {
            title = "Set It Ablaze",
            hint = "Right-click the wooden bunker to attack it. " ..
                   "Flame Troopers set structures on fire — watch it spread.",
            highlight_ui = "command_bar",
            completion = { type = "action", action = "attack", target_type = "wood_bunker" }
        })

    elseif step_id == "ignite" then
        -- Step 3: Observe fire spread (no player action needed — just watch)
        Tutorial.ShowHint(
            "Fire spreads to adjacent flammable tiles. " ..
            "Trees, wooden structures, and dry grass will catch fire. " ..
            "Stone and water are fireproof.", {
            title = "Fire Spread",
            duration = 10,
            position = "near_building",
            icon = "hint_fire",
        })

        -- Wait for the fire to spread to at least 3 tiles
        Tutorial.SetStep("watch_spread", {
            title = "Watch It Burn",
            hint = "Observe the fire spreading to nearby trees.",
            completion = { type = "custom", lua_condition = "GetFireTileCount() >= 3" }
        })

    elseif step_id == "watch_spread" then
        Tutorial.ShowHint("Fire is a powerful tool — but it burns friend and foe alike. " ..
                          "Be careful where you aim.", {
            title = "A Word of Caution",
            duration = 8,
            position = "screen_center",
        })
        Trigger.AfterDelay(DateTime.Seconds(10), function()
            Campaign.complete("pass")
        end)
    end
end
```

**Mod-specific hints for in-game discovery:**

```yaml
# mods/scorched-earth/hints/fire-hints.yaml
hints:
  - id: se_fire_near_friendly
    title: "Watch Your Flames"
    text: "Fire is spreading toward your own buildings! Move units away or build a firebreak."
    category: mod_specific
    trigger:
      type: custom
      lua_condition: "IsFireNearFriendlyBuilding(5)"  # within 5 cells
    suppression:
      mastery_action: build_firebreak
      mastery_threshold: 2
      cooldown_seconds: 120
      max_shows: 5
    experience_profiles: [all]
    priority: high
    position: near_building
    eva_line = se_fire_warning
```

This pattern scales to any complexity — the modder uses the same YAML campaign format for a 3-mission mod tutorial that the engine uses for its 10-mission Commander School. The `Tutorial` Lua API, `hints.yaml` schema, and scenario editor Tutorial modules (D038) all work identically for first-party and third-party content.

### LLM Campaign Generation

The LLM (`ic-llm`) can generate entire campaign graphs, not just individual missions:

```
User: "Create a 5-mission Soviet campaign where you invade Alaska.
       The player should be able to lose a mission and keep going
       with consequences. Units should carry over between missions."

LLM generates:
  → campaign.yaml (graph with 5+ nodes, branching on outcomes)
  → 5-7 mission files (main path + fallback branches)
  → Lua scripts with Campaign API calls
  → briefing text for each mission
  → carryover rules per transition
```

The template/scene system makes this tractable — the LLM composes from known building blocks rather than generating raw code. Campaign graphs are validated at load time (no orphan nodes, all outcomes have targets).

> **Security (V40):** LLM-generated content (YAML rules, Lua scripts, briefing text) must pass through the `ic mod check` validation pipeline before execution — same as Workshop submissions. Additional defenses: cumulative mission-lifetime resource limits, content filter for generated text, sandboxed preview mode. LLM output is treated as untrusted Tier 2 mod content, never trusted first-party. See `06-SECURITY.md` § Vulnerability 40.
