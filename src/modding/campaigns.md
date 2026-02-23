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
    hero_progression: false    # optional built-in hero toolkit (XP/levels/skills)
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
    pub hero_profiles: HashMap<String, HeroProfileState>, // optional built-in hero progression state (keyed by character_id)
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

/// Cumulative campaign performance counters (local, save-authoritative).
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct CampaignStats {
    pub missions_started: u32,
    pub missions_completed: u32,
    pub mission_retries: u32,
    pub mission_failures: u32,
    pub total_time_s: u64,
    pub units_lost_total: u32,
    pub units_gained_total: u32,
    pub credits_earned_total: i64,   // optional; 0 when module/campaign does not track this
    pub credits_spent_total: i64,    // optional; 0 when module/campaign does not track this
}

/// Derived UI-facing progress summary for branching campaigns.
/// This is computed from the campaign graph + save state, not authored directly.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct CampaignProgressSummary {
    pub total_missions_in_graph: u32,
    pub unique_missions_completed: u32,
    pub discovered_missions: u32,        // nodes revealed/encountered by this player/run history
    pub current_path_depth: u32,         // current run breadcrumb depth
    pub best_path_depth: u32,            // farthest mission depth reached across local history
    pub endings_unlocked: u32,
    pub total_endings_in_graph: Option<u32>, // None if author marks hidden/unknown
    pub completion_pct_unique: f32,      // unique_missions_completed / total_missions_in_graph
    pub completion_pct_best_depth: f32,  // best_path_depth / max_graph_depth
    pub last_played_at_unix: Option<i64>,
}

/// Scope key for community comparisons (optional, opt-in, D052/D053).
/// Campaign progress comparisons must normalize on these fields.
#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignComparisonScope {
    pub campaign_id: CampaignId,
    pub campaign_content_version: String, // manifest/version/hash-derived label
    pub game_module: String,
    pub difficulty: String,
    pub balance_preset: String,
}

/// Persistent progression state for a named hero character (optional toolkit).
#[derive(Serialize, Deserialize, Clone)]
pub struct HeroProfileState {
    pub character_id: String,         // links to D038 Named Character id
    pub level: u16,
    pub xp: u32,
    pub unspent_skill_points: u16,
    pub unlocked_skills: Vec<String>, // skill ids from the campaign's hero toolkit config
    pub stats: HashMap<String, i32>,  // module/campaign-defined hero stats (e.g., stealth, leadership)
    pub flags: HashMap<String, Value>,// per-hero story/progression flags
    pub injury_state: Option<String>, // optional campaign-defined injury/debuff tag
}
```

### Campaign Progress Metadata & GUI Semantics (Branching-Safe, Spoiler-Safe)

The campaign UI should display **progress metadata** (mission counts, completion %, farthest progress, time played), but D021 campaigns are branching graphs — not a simple linear list. To avoid confusing or misleading numbers, D021 defines these metrics explicitly:

- **`unique_missions_completed`**: count of distinct mission nodes completed across local history (best "completion %" metric for branching campaigns)
- **`current_path_depth`**: depth of the active run's current path (useful for "where am I now?")
- **`best_path_depth`**: farthest path depth the player has reached in local history (all-time "farthest reached" metric)
- **`endings_unlocked`**: ending/outcome coverage for replayability (optional if the author marks endings hidden)

**UI guidance (campaign browser / graph / profile):**
- Show **raw counts + percentage** together (example: `5 / 14 missions`, `36%`) — percentages alone hide too much.
- Label branching-aware metrics explicitly (`Best Path Depth`, not just `Farthest Mission`) to avoid ambiguity.
- For classic linear campaigns, `best_path_depth` and `unique completion` are numerically similar; UI may simplify wording.

**Spoiler safety (default):**
- Campaign browser cards should avoid revealing locked mission names.
- Community branch statistics should not reveal branch names or outcome labels until the player reaches that branch point.
- Use generic labels for locked content in comparisons (e.g., `Alternate Branch`, `Hidden Ending`) unless the campaign author opts into full reveal.

**Community comparisons (optional, D052/D053):**
- Local campaign progress is always available offline from `CampaignState` and local SQLite history.
- Community comparisons (percentiles, average completion, popular branch rates) are **opt-in** and must be scoped by `CampaignComparisonScope` (campaign version, module, difficulty, balance preset).
- Community comparison data is informational and social-facing, not competitive/ranked authority.

Campaign state is fully serializable (D010 — snapshottable sim state). Save games capture the entire campaign progress. Replays can replay an entire campaign run, not just individual missions.

### Named Character Presentation Overrides (Optional Convenience Layer)

To make a unit clearly read as a **unique character** (hero/operative/VIP) without forcing a full gameplay-unit fork for every case, D021 supports an optional **presentation override layer** for named characters. This is a **creator convenience** that composes with D038 Named Characters + the Hero Toolkit.

**Intended use cases:**
- unique voice set for a named commando while keeping the same base infantry gameplay role
- alternate portrait/icon/marker for a story-critical engineer/spy
- mission-scoped disguise/winter-gear variants for the same `character_id`
- subtle palette/tint/selection badge differences so a unique actor is readable in battle

**Scope boundary (important):**
- **Presentation overrides are not gameplay rules.** Weapons, armor, speed, abilities, and other gameplay-changing differences still belong in the unit definition and/or hero toolkit progression.
- If the campaign intentionally changes the character's gameplay profile, it should do so explicitly via the unit type binding / hero loadout, not by hiding it inside presentation metadata.
- Presentation overrides are local/content metadata and should not be treated as multiplayer/ranked compatibility changes by themselves (asset pack requirements still apply through normal package/resource dependency rules).

**Canonical schema (shared by D021 runtime data and D038 authoring UI):**

```rust
/// Optional presentation-only overrides for a named character.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct CharacterPresentationOverrides {
    pub portrait_override: Option<String>,       // dialogue / hero sheet portrait asset id
    pub unit_icon_override: Option<String>,      // roster/sidebar/build icon when shown
    pub voice_set_override: Option<String>,      // select/move/attack/deny voice set id
    pub sprite_variant: Option<String>,          // alternate sprite/sequences mapping id
    pub sprite_sequence_override: Option<String>,// sequence remap/alias (module-defined)
    pub palette_variant: Option<String>,         // palette/tint preset id
    pub selection_badge: Option<String>,         // world-space selection marker/badge id
    pub minimap_marker_variant: Option<String>,  // minimap glyph/marker variant id
}

/// Campaign-authored defaults + named variants for one character.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct NamedCharacterPresentationConfig {
    pub default_overrides: CharacterPresentationOverrides,
    pub variants: HashMap<String, CharacterPresentationOverrides>, // e.g. disguise, winter_ops
}
```

**YAML shape (conceptual, exact field names may mirror D038 UI labels):**

```yaml
named_characters:
  - id: tanya
    name: "Tanya"
    unit_type: tanya_commando
    portrait: portraits/tanya_default

    presentation:
      default:
        voice_set: voices/tanya_black_ops
        unit_icon: icons/tanya_black_ops
        palette_variant: hero_red_trim
        selection_badge: hero_star
        minimap_marker_variant: specops_hero
      variants:
        disguise:
          sprite_variant: tanya_officer_disguise
          unit_icon: icons/tanya_officer_disguise
          voice_set: voices/tanya_whisper
          selection_badge: covert_marker
        winter_ops:
          sprite_variant: tanya_winter_gear
          palette_variant: winter_white_trim
```

**Layering model:**
- campaign-level named character definition may provide `presentation.default` and `presentation.variants`
- scenario bindings choose which variant to apply when spawning that character (for example `default`, `disguise`, `winter_ops`)
- D038 exposes this as a previewable authoring panel and a mission-level `Apply Character Presentation Variant` convenience action

### Hero Campaign Toolkit (Optional, Built-In)

Warcraft III-style hero campaigns (for example, Tanya gaining XP, levels, unlockable abilities, and persistent equipment) **fit D021 directly** and should be possible **without engine modding** (no WASM module required). This is an **optional campaign authoring layer** on top of the existing D021 persistent state model and D038's Named Characters / Inventory / Intermission tooling.

**Design intent:**
- **No engine modding for common hero campaigns.** Designers should build hero campaigns through YAML + the SDK Campaign Editor.
- **Optional, not global.** Classic RA-style campaigns remain simple; hero progression is enabled per campaign.
- **Lua is the escape hatch.** Use Lua for bespoke talent effects, unusual status systems, or custom UI logic beyond the built-in toolkit.

**Built-in hero toolkit capabilities (recommended baseline):**
- Persistent hero XP, level, and skill points across missions
- Skill unlocks and mission rewards via debrief/intermission flow
- Hero death/injury policies per character (`must survive`, `wounded`, `campaign_continue`)
- Hero-specific flags/stats for branching dialogue and mission conditions
- Hero loadout/equipment assignment using the standard campaign inventory system

**Example YAML (campaign-level hero progression config):**

```yaml
campaign:
  id: tanya_black_ops
  title: "Tanya: Black Ops"

  persistent_state:
    unit_roster: true
    equipment: true
    hero_progression: true

  hero_toolkit:
    enabled: true
    xp_curve:
      levels:
        - { level: 1, total_xp: 0,    skill_points: 0 }
        - { level: 2, total_xp: 120,  skill_points: 1 }
        - { level: 3, total_xp: 300,  skill_points: 1 }
        - { level: 4, total_xp: 600,  skill_points: 1 }
    heroes:
      - character_id: tanya
        start_level: 1
        skill_tree: tanya_commando
        death_policy: wounded          # must_survive | wounded | campaign_continue
        stat_defaults:
          agility: 3
          stealth: 2
          demolitions: 4
    mission_rewards:
      default_objective_xp: 50
      bonus_objective_xp: 100
```

**Concrete example: Tanya commando skill tree (campaign-authored, no engine modding):**

```yaml
campaign:
  id: tanya_black_ops

  hero_toolkit:
    enabled: true

    skill_trees:
      tanya_commando:
        display_name: "Tanya - Black Ops Progression"
        branches:
          - id: commando
            display_name: "Commando"
            color: "#C84A3A"
          - id: stealth
            display_name: "Stealth"
            color: "#3E7C6D"
          - id: demolitions
            display_name: "Demolitions"
            color: "#B88A2E"

        skills:
          - id: dual_pistols_drill
            branch: commando
            tier: 1
            cost: 1
            display_name: "Dual Pistols Drill"
            description: "+10% infantry damage; faster target reacquire"
            unlock_effects:
              stat_modifiers:
                infantry_damage_pct: 10
                target_reacquire_ticks: -4

          - id: raid_momentum
            branch: commando
            tier: 2
            cost: 1
            requires: [dual_pistols_drill]
            display_name: "Raid Momentum"
            description: "Gain temporary move speed after destroying a structure"
            unlock_effects:
              grants_ability: raid_momentum_buff

          - id: silent_step
            branch: stealth
            tier: 1
            cost: 1
            display_name: "Silent Step"
            description: "Reduced enemy detection radius while not firing"
            unlock_effects:
              stat_modifiers:
                enemy_detection_radius_pct: -20

          - id: infiltrator_clearance
            branch: stealth
            tier: 2
            cost: 1
            requires: [silent_step]
            display_name: "Infiltrator Clearance"
            description: "Unlocks additional infiltration dialogue/mission branches"
            unlock_effects:
              set_hero_flag:
                key: tanya_infiltration_clearance
                value: true

          - id: satchel_charge_mk2
            branch: demolitions
            tier: 1
            cost: 1
            display_name: "Satchel Charge Mk II"
            description: "Stronger satchel charge with larger structure damage radius"
            unlock_effects:
              upgrades_ability:
                ability_id: satchel_charge
                variant: mk2

          - id: chain_detonation
            branch: demolitions
            tier: 3
            cost: 2
            requires: [satchel_charge_mk2, raid_momentum]
            display_name: "Chain Detonation"
            description: "Destroyed explosive objectives can trigger nearby explosives"
            unlock_effects:
              grants_ability: chain_detonation

    heroes:
      - character_id: tanya
        skill_tree: tanya_commando
        start_level: 1
        start_skills: [dual_pistols_drill]
        death_policy: wounded
        loadout_slots:
          ability: 3
          gear: 2

    mission_rewards:
      by_mission:
        black_ops_03_aa_sabotage:
          objective_xp:
            destroy_aa_sites: 150
            rescue_spy: 100
          completion_choices:
            - id: field_upgrade
              label: "Field Upgrade"
              grant_skill_choice_from: [silent_step, satchel_charge_mk2]
            - id: requisition_cache
              label: "Requisition Cache"
              grant_items:
                - { id: remote_detonator_pack, qty: 1 }
                - { id: intel_keycard, qty: 1 }
```

**Why this fits the design:** The engine core stays game-agnostic (hero progression is campaign/game-module content, not an engine-core assumption), and the feature composes cleanly with D021 branches, D038 intermissions, and D065 tutorial/onboarding flows.

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

#### Hero progression helpers (optional built-in toolkit)

When `hero_toolkit.enabled` is true, the campaign API exposes built-in helpers for common hero-campaign flows. These are convenience functions over D021 campaign state; they do not require WASM or custom engine code.

```lua
-- Award XP to Tanya after destroying anti-air positions
Campaign.hero_add_xp("tanya", 150, { reason = "aa_sabotage" })

-- Check level gate before enabling a side objective/dialogue option
if Campaign.hero_get_level("tanya") >= 3 then
    Campaign.set_flag("tanya_can_infiltrate_lab", true)
end

-- Grant a skill as a mission reward or intermission choice outcome
Campaign.hero_unlock_skill("tanya", "satchel_charge_mk2")

-- Modify hero-specific stats/flags for branching missions/dialogue
Campaign.hero_set_stat("tanya", "stealth", 4)
Campaign.hero_set_flag("tanya", "injured_last_mission", false)

-- Query persistent hero state (for UI or mission logic)
local tanya = Campaign.hero_get("tanya")
print(tanya.level, tanya.xp, tanya.unspent_skill_points)
```

**Scope boundary:** These helpers cover common hero-RPG campaign patterns (XP, levels, skills, hero flags, progression rewards). Bespoke systems (random loot affixes, complex proc trees, fully custom hero UIs) remain the domain of Lua (and optionally WASM for extreme cases).

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

> **Dynamic Mission Flow:** Individual missions within a campaign can use **map layers** (dynamic expansion), **sub-map transitions** (building interiors), and **phase briefings** (mid-mission cutscenes) to create multi-phase missions with progressive reveals and infiltration sequences. Flags set during sub-map transitions (e.g., `radar_destroyed`, `radar_captured`) are written to `Campaign.set_flag()` and persist across missions — a spy's infiltration outcome in mission 3 can affect the enemy's capabilities in mission 5. See `04-MODDING.md` § Dynamic Mission Flow for the full system design, Lua API, and worked examples.

> **D070 extension path (future "Ops Campaigns"):** D070's `Commander & Field Ops` asymmetric co-op mode is **v1 match-based** by default (session-local field progression), but it composes with D021 later. A campaign can wrap D070-style missions and persist squad/hero state, requisition unlocks, and role-specific flags across missions using the same `CampaignState` and `Campaign.set_flag()` model defined here. This includes optional **hero-style SpecOps leaders** (e.g., Tanya-like or custom commandos) using the built-in hero toolkit for XP/skills/loadouts between matches/missions. This is an optional campaign layer, not a requirement for the base D070 mode.

> **Commander rescue bootstrap pattern (D021 + D070-adjacent Commander Avatar modes):** A mini-campaign can intentionally start with command/building systems disabled because the commander is captured/missing. Mission 1 is a SpecOps rescue/infiltration scenario; on success, Lua sets a campaign flag such as `commander_recovered = true`. Subsequent missions check this flag to enable commander-avatar presence mechanics, base construction/production menus, support powers, or broader unit command surfaces. This is a recommended way to teach layered mechanics while making the commander narratively and mechanically important.

> **D070 proving mini-campaign pattern ("Ops Prologue"):** A short 3-4 mission mini-campaign is the preferred vertical slice for validating `Commander & SpecOps` (D070) before promoting it as a polished built-in mode/template. Recommended structure:
> 1. **Rescue the Commander** (SpecOps-only, infiltration/extraction, command/building restricted)
> 2. **Establish Forward Command** (commander recovered, limited support/building unlocked)
> 3. **Joint Operation** (full Commander + SpecOps strategic/field/joint objectives)
> 4. *(Optional)* **Counterstrike / Defense** (enemy counter-ops pressure, commander-avatar survivability/readability test)
>
> This pattern is valuable both as a player-facing mini-campaign and as an internal implementation/playtest harness because it validates D021 flags, D070 role flow, D059 request UX, and D065 onboarding in one narrative arc.

> **D070 pacing extension pattern ("Operational Momentum" / "one more phase"):** An `Ops Campaign` can preserve D070's optional Operational Momentum pacing across missions by storing lane progress and war-effort outcomes as campaign state/flags (for example `intel_chain_progress`, `command_network_tier`, `superweapon_delays_applied`, `forward_lz_unlocked`). The next mission can then react with support availability changes, route options, enemy readiness, or objective variants. UI should present these as **branching-safe, spoiler-safe progress summaries** (current gains + next likely payoff), not as a giant opaque meta-score.

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
