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

### Configurable Workshop Server

The Workshop is the single place players go to **browse, install, and share** game content — mods, maps, music, sprites, voice packs, everything. Behind the scenes it's a federated resource registry (D030) that merges multiple repository sources into one seamless view. Players never need to know where content is hosted — they just see "Workshop" and hit install.

> **Workshop Ubiquitous Language (DDD)**
>
> The Workshop bounded context uses the following vocabulary consistently across design docs, Rust structs, YAML keys, CLI commands, and player-facing UI. These are the domain terms — implementation pattern origins (Artifactory, npm, crates.io) are referenced for context but are not the vocabulary.
>
> | Domain Term | Rust Type (planned) | Definition |
> |---|---|---|
> | **Resource** | `ResourcePackage` | Any publishable unit: mod, map, music track, sprite pack, voice pack, template, balance preset. The atomic unit of the Workshop. |
> | **Publisher** | `Publisher` | The identity (person or organization) that publishes resources. The `alice/` prefix in `alice/soviet-march-music@1.2.0`. Owns the name, controls releases. |
> | **Repository** | `Repository` | A storage location for resources. Types: Local, Remote, Git Index. |
> | **Workshop** | `Workshop` (aggregate root) | The virtual merged view across all repositories. What players browse. What the `ic` CLI queries. The bounded context itself. |
> | **Manifest** | `ResourceManifest` | The metadata file (`manifest.yaml`) describing a resource: name, version, dependencies, checksums, license. |
> | **Package** | `.icpkg` | The distributable archive (ZIP with manifest). The physical artifact. |
> | **Collection** | `Collection` | A curated set of resources (modpack, map pool, theme bundle). |
> | **Dependency** | `Dependency` | A declared requirement on another resource, with semver range. |
> | **Channel** | `Channel` | Maturity stage: `dev`, `beta`, `release`. Controls visibility. |
>
> *Player-facing UI may use friendlier synonyms ("content", "creator", "install") but the code, config files, and design docs use the terms above.*

The technical architecture is inspired by JFrog Artifactory's federated repository model — multiple sources aggregated into a single view with priority-based deduplication. This gives us the power of npm/crates.io-style package management with a UX that feels like Steam Workshop to players.

#### Repository Types

The Workshop aggregates resources from multiple repository types (architecture inspired by Artifactory's local/remote/virtual model). Configure sources in `settings.toml` — or just use the default (which works out of the box):

| Source Type   | Description                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local**     | A directory on disk following Workshop structure. Stores resources you create. Used for development, LAN parties, offline play, pre-publish testing.                                                                            |
| **Git Index** | A git-hosted package index (Phase 0–3 default). Contains YAML manifests describing resources and download URLs — no asset files. Engine fetches `index.yaml` via HTTP or clones the repo. See D049 for full specification.      |
| **Remote**    | A Workshop server (official or community-hosted). Resources are downloaded and cached locally on first access. Cache is used for subsequent requests — works offline after first pull.                                          |
| **Virtual**   | The merged view across all configured sources — this is what players see as "the Workshop". Merges all local + remote + git-index sources, deduplicates by resource ID, and resolves version conflicts using priority ordering. |

```toml
# settings.toml — Phase 0-3 (before Workshop server exists)
[[workshop.sources]]
url = "https://github.com/iron-curtain/workshop-index"  # git-index: GitHub-hosted package registry
type = "git-index"
priority = 1                                  # highest priority in virtual view

[[workshop.sources]]
path = "C:/my-local-workshop"                 # local: directory on disk
type = "local"
priority = 2

[workshop]
deduplicate = true                # same resource ID from multiple sources → highest priority wins
cache_dir = "~/.ic/cache"         # local cache for downloaded content
```

```toml
# settings.toml — Phase 5+ (full Workshop server + git-index fallback)
[[workshop.sources]]
url = "https://workshop.ironcurtain.gg"       # remote: official Workshop server
type = "remote"
priority = 1

[[workshop.sources]]
url = "https://github.com/iron-curtain/workshop-index"  # git-index: still available as fallback
type = "git-index"
priority = 2

[[workshop.sources]]
url = "https://mods.myclan.com/workshop"      # remote: community-hosted
type = "remote"
priority = 3

[[workshop.sources]]
path = "C:/my-local-workshop"                 # local: directory on disk
type = "local"
priority = 4

[workshop]
deduplicate = true
cache_dir = "~/.ic/cache"
```

**Git-hosted index (git-index) — Phase 0–3 default:** A public GitHub repo (`iron-curtain/workshop-index`) containing YAML manifests per package — names, versions, SHA-256, download URLs (GitHub Releases), BitTorrent info hashes, dependencies. The engine fetches the consolidated `index.yaml` via a single HTTP GET to `raw.githubusercontent.com` (CDN-backed globally). Power users and the SDK can `git clone` the repo for offline browsing or scripting. Community contributes packages via PR. Proven pattern: Homebrew, crates.io-index, Winget, Nixpkgs. See D049 for full repo structure and manifest format.

**Official server (remote) — Phase 5+:** We host one. Default for all players. Curated categories, search, ratings, download counts. The git-index remains available as a fallback source.

**Community servers (remote):** Anyone can host their own (open-source server binary, same Rust stack as relay/tracking servers). Clans, modding communities, tournament organizers. Useful for private resources, regional servers, or alternative curation policies.

**Local directory (local):** A folder on disk that follows the Workshop directory structure. Works fully offline. Ideal for mod developers testing before publishing, or LAN-party content distribution.

**How the Workshop looks to players:** The in-game Workshop browser, the `ic` CLI, and the SDK all query the same merged view. They never interact with individual sources directly — the engine handles source selection, caching, and fallback transparently. A player browsing the Workshop in Phase 0–3 (backed by a git index) sees the same UI as a player in Phase 5+ (backed by a full Workshop server). The only difference is backend plumbing that's invisible to the user.

#### Phase 0–3: What Players Actually Experience

With only the git-hosted index and GitHub Releases as the backend, all core Workshop workflows work:

| Workflow           | What the player does                                               | What happens under the hood                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browse**         | Opens Workshop in-game or runs `ic mod search`                     | Engine fetches `index.yaml` from GitHub (cached locally). Displays content list with names, descriptions, ratings, tags.                                                                                                   |
| **Install**        | Clicks "Install" or runs `ic mod install alice/soviet-march-music` | Resolves dependencies from index. Downloads `.icpkg` from GitHub Releases (HTTP). Verifies SHA-256. Extracts to local cache.                                                                                               |
| **Play with mods** | Joins a multiplayer lobby                                          | Auto-download checks `required_mods` against local cache. Missing content fetched from GitHub Releases (P2P when tracker is live in Phase 3-4).                                                                            |
| **Publish**        | Runs `ic mod publish`                                              | Packages content into `.icpkg`, computes SHA-256, uploads to GitHub Releases, generates index manifest, opens PR to `workshop-index` repo. *(Phase 0–3 publishes via PR; Phase 5+ publishes directly to Workshop server.)* |
| **Update**         | Runs `ic mod update`                                               | Fetches latest `index.yaml`, shows available updates, downloads new versions.                                                                                                                                              |

The in-game browser works with the git index from day one — it reads the same manifest format that the full Workshop server will use. Search is local (filter/sort on cached index data). Ratings and download counts are deferred to Phase 4-5 (when the Workshop server can track them), but all other features work.

#### Package Integrity

Every published resource includes cryptographic checksums for integrity verification:

- **SHA-256 checksum** stored in the package manifest and on the Workshop server
- `ic mod install` verifies checksums after download — mismatch → abort + warning
- `ic.lock` records both version AND SHA-256 checksum for each dependency — guarantees byte-identical installs across machines
- Protects against: corrupted downloads, CDN tampering, mirror drift
- Workshop server computes checksums on upload; clients verify on download

#### Promotion & Maturity Channels

Resources can be published to maturity channels, allowing staged releases:

| Channel   | Purpose                         | Visibility                      |
| --------- | ------------------------------- | ------------------------------- |
| `dev`     | Work-in-progress, local testing | Author only (local repos only)  |
| `beta`    | Pre-release, community testing  | Opt-in (users enable beta flag) |
| `release` | Stable, production-ready        | Default (everyone sees these)   |

```
ic mod publish --channel beta     # visible only to users who opt in to beta
ic mod publish                    # release channel (default)
ic mod promote 1.3.0-beta.1 release  # promote without re-upload
ic mod install --include-beta     # pull beta resources
```

#### Replication & Mirroring

Community Workshop servers can replicate from the official server (pull replication, Artifactory-style):

- **Pull replication:** Community server periodically syncs popular resources from official. Reduces latency for regional players, provides redundancy.
- **Selective sync:** Community servers choose which categories/publishers to replicate (e.g., replicate all Maps but not Mods)
- **Offline bundles:** `ic workshop export-bundle` creates a portable archive of selected resources for LAN parties or airgapped environments. `ic workshop import-bundle` loads them into a local repository.

#### P2P Distribution (BitTorrent/WebTorrent) — D049

Workshop delivery uses **peer-to-peer distribution** for large packages, with HTTP direct download as fallback. The Workshop server acts as both metadata registry (SQLite, lightweight) and BitTorrent tracker (peer coordination, lightweight). Actual content transfer happens peer-to-peer between players.

**Transport strategy by package size:**

| Package Size | Strategy                     | Rationale                                                                 |
| ------------ | ---------------------------- | ------------------------------------------------------------------------- |
| < 5MB        | HTTP direct only             | P2P overhead exceeds benefit. Maps, balance presets, palettes.            |
| 5–50MB       | P2P preferred, HTTP fallback | Sprite packs, sound packs, script libraries.                              |
| > 50MB       | P2P strongly preferred       | HD resource packs, cutscene packs, full mods. Cost advantage is decisive. |

**How it works:**

1. `ic mod publish` packages `.icpkg` and publishes it. Phase 0–3: uploads to GitHub Releases + opens PR to `workshop-index`. Phase 3+: Workshop server computes BitTorrent info hash and starts seeding.
2. `ic mod install` fetches manifest (from git index or Workshop server), downloads content via HTTP or BitTorrent from other players who have it. Falls back to HTTP if no peers available.
3. Players who download automatically seed to others (opt-out in settings). Popular resources get faster — the opposite of CDN economics.
4. SHA-256 verification on complete package, same as D030's existing integrity design.
5. **WebTorrent** extends this to browser builds (WASM) — P2P over WebRTC. Desktop and browser clients interoperate.

**Seeding infrastructure:** A dedicated seed box (~$20-50/month VPS) permanently seeds all content, ensuring new/unpopular packages are always downloadable. Community seed volunteers and federated Workshop servers also seed. Lobby-optimized seeding prioritizes peers in the same lobby.

**P2P client configuration:** Players control P2P behavior in `settings.toml`. Bandwidth limiting is critical — residential users cannot have their connection saturated by mod seeding (a lesson from Uber Kraken's production deployment, where even datacenter agents need bandwidth caps):

```toml
# settings.toml — P2P distribution settings
[workshop.p2p]
max_upload_speed = "1 MB/s"          # Default seeding speed cap (0 = unlimited)
max_download_speed = "unlimited"      # Most users won't limit
seed_after_download = true            # Keep seeding while game is running
seed_duration_after_exit = "30m"      # Background seeding after game closes
cache_size_limit = "2 GB"             # LRU eviction when exceeded
prefer_p2p = true                     # false = always use HTTP direct
```

The P2P engine uses **rarest-first** piece selection, an **endgame mode** that sends duplicate requests for the last few pieces to prevent stalls, a **connection state machine** (pending → active → blacklisted) that avoids wasting time on dead or throttled peers, **statistical bad-peer detection** (demotes peers whose transfer times deviate beyond 3σ — adapted from Dragonfly's evaluator), and **3-tier download priority** (lobby-urgent / user-requested / background) for QoS differentiation. Full protocol design details — peer selection policy, weighted multi-dimensional scoring, piece request strategy, announce cycle, size-based piece lengths, health checks, preheat/prefetch, persistent replica count — are in `../decisions/09e-community.md` § D049 "P2P protocol design details."

**Cost:** A BitTorrent tracker costs $5-20/month. Centralized CDN for a popular 500MB mod downloaded 10K times = 5TB = $50-450/month. P2P reduces marginal distribution cost to near-zero.

See `../decisions/09e-community.md` § D049 for full design including security analysis, Rust implementation options, gaming industry precedent, and phased bootstrap strategy.

### Workshop Resource Registry & Dependency System (D030)

The Workshop operates as a **universal resource repository for game assets**. Any game asset — music, sprites, textures, cutscenes, maps, sound effects, voice lines, templates, balance presets — is individually publishable as a versioned, integrity-verified, licensed resource. Others (including LLM agents) can discover, depend on, and download resources automatically.

> **Standalone platform potential:** The Workshop's federated registry + P2P distribution architecture is game-agnostic by design. It could serve other games, creative tools, AI model distribution, and more. See `research/p2p-federated-registry-analysis.md` for analysis of this as a standalone platform, competitive landscape survey across 13+ platforms (Nexus Mods, mod.io, Steam Workshop, Modrinth, CurseForge, Thunderstore, ModDB, GameBanana, Uber Kraken, Dragonfly, Artifactory, IPFS, Homebrew), and actionable design lessons applied to IC.

#### Resource Identity & Versioning

Every Workshop resource gets a globally unique identifier:

```
Format:  publisher/name@version
Example: alice/soviet-march-music@1.2.0
         community-hd-project/allied-infantry-sprites@2.1.0
         bob/desert-tileset@1.0.3
```

- **Publisher** = author username or organization (the publishing identity)
- **Name** = resource name, lowercase with hyphens
- **Version** = semantic versioning (semver)

#### Dependency Declaration in `mod.yaml`

Mods and resources declare dependencies on other Workshop resources:

```yaml
# mod.yaml
dependencies:
  - id: "community-project/hd-infantry-sprites"
    version: "^2.0"                    # semver range (cargo-style)
    source: workshop                   # workshop | local | url
  - id: "alice/soviet-march-music"
    version: ">=1.0, <3.0"
    source: workshop
    optional: true                     # soft dependency — mod works without it
  - id: "bob/desert-terrain-textures"
    version: "~1.4"                    # compatible with 1.4.x
    source: workshop
```

Dependencies are **transitive** — if resource A depends on B, and B depends on C, installing A pulls all three.

#### Dependency Resolution

Cargo-inspired version solving with lockfile:

| Concept               | Behavior                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| Semver ranges         | `^1.2` (>=1.2.0, <2.0.0), `~1.2` (>=1.2.0, <1.3.0), `>=1.0, <3.0`, exact `=1.2.3` |
| Lockfile (`ic.lock`)  | Records exact resolved versions + SHA-256 checksums for reproducible installs     |
| Transitive resolution | Pulled automatically; diamond dependencies resolved to compatible version         |
| Conflict detection    | Two deps require incompatible versions → error with suggestions                   |
| Deduplication         | Same resource from multiple dependents stored once in local cache                 |
| Optional dependencies | `optional: true` — mod works without it; UI offers to install if available        |
| Offline resolution    | Once cached, all dependencies resolve from local cache — no network required      |

#### CLI Commands for Dependency Management

These extend the `ic` CLI (D020):

```
ic mod resolve         # compute dependency graph, report conflicts
ic mod install         # download all dependencies to local cache (verifies SHA-256)
ic mod update          # update deps to latest compatible versions (respects semver)
ic mod tree            # display dependency tree (like `cargo tree`)
ic mod lock            # regenerate ic.lock from current mod.yaml
ic mod audit           # check dependency licenses for compatibility
ic mod promote         # promote resource to a higher channel (beta → release)
ic workshop export-bundle  # export selected resources as portable offline archive
ic workshop import-bundle  # import offline archive into local repository
```

Example workflow:
```
$ ic mod install
  Resolving dependencies...
  Downloading community-project/hd-infantry-sprites@2.1.0 (12.4 MB)
  Downloading alice/soviet-march-music@1.2.0 (4.8 MB)
  Downloading bob/desert-terrain-textures@1.4.1 (8.2 MB)
  3 resources installed, 25.4 MB total
  Lock file written: ic.lock

$ ic mod tree
  my-total-conversion@1.0.0
  ├── community-project/hd-infantry-sprites@2.1.0
  │   └── community-project/base-palettes@1.0.0
  ├── alice/soviet-march-music@1.2.0
  └── bob/desert-terrain-textures@1.4.1

$ ic mod audit
  ✓ All 4 dependencies have compatible licenses
  ✓ Your mod (CC-BY-SA-4.0) is compatible with:
    - hd-infantry-sprites (CC-BY-4.0) ✓
    - soviet-march-music (CC0-1.0) ✓
    - desert-terrain-textures (CC-BY-SA-4.0) ✓
    - base-palettes (CC0-1.0) ✓
```

#### License System

**Every published Workshop resource MUST have a `license` field.** Publishing without one is rejected by the Workshop server and by `ic mod publish`.

```yaml
# In mod.yaml
mod:
  license: "CC-BY-SA-4.0"             # SPDX identifier (required for publishing)
```

- Uses [SPDX identifiers](https://spdx.org/licenses/) for machine-readable classification
- Workshop UI displays license prominently on every resource listing
- `ic mod audit` checks the full dependency tree for license compatibility
- Common licenses for game assets:

| License             | Allows commercial use | Requires attribution | Share-alike | Notes                       |
| ------------------- | --------------------- | -------------------- | ----------- | --------------------------- |
| `CC0-1.0`           | ✅                     | ❌                    | ❌           | Public domain equivalent    |
| `CC-BY-4.0`         | ✅                     | ✅                    | ❌           | Most permissive with credit |
| `CC-BY-SA-4.0`      | ✅                     | ✅                    | ✅           | Copyleft for creative works |
| `CC-BY-NC-4.0`      | ❌                     | ✅                    | ❌           | Non-commercial only         |
| `MIT`               | ✅                     | ✅                    | ❌           | For code assets             |
| `GPL-3.0-only`      | ✅                     | ✅                    | ✅           | For code (EA source compat) |
| `LicenseRef-Custom` | varies                | varies               | varies      | Link to full text required  |

#### Optional EULA

Authors who need terms beyond what SPDX licenses cover can attach an End User License Agreement:

```yaml
mod:
  license: "CC-BY-4.0"                # SPDX license (always required)
  eula:
    url: "https://example.com/my-eula.txt"   # link to full EULA text
    summary: "No use in commercial products without written permission"
```

- **EULA is always optional.** The SPDX license alone is sufficient for most resources.
- **EULA cannot contradict the SPDX license.** `ic mod check` warns if the EULA appears to restrict rights the license explicitly grants. Example: `license: CC0-1.0` with an EULA restricting commercial use is flagged as contradictory.
- **EULA acceptance in UI:** When a user installs a resource with an EULA, the Workshop browser displays the EULA and requires explicit acceptance before download. Accepted EULAs are recorded in local SQLite (D034) so the prompt is shown only once per resource per user.
- **EULA is NOT a substitute for a license.** Even with an EULA, the `license` field is still required. The EULA adds terms; it doesn't replace the baseline.
- **Dependency EULAs surface during `ic mod install`:** If a dependency has an EULA the user hasn't accepted, the install pauses to show it. No silent EULA acceptance through transitive dependencies.

#### Workshop Terms of Service (Platform License)

**The GitHub model:** Just as GitHub's Terms of Service grant GitHub (and other users) certain rights to hosted content regardless of the repository's license, the IC Workshop requires acceptance of platform Terms of Service before any publishing. This ensures the platform can operate legally even when individual resources use restrictive licenses.

**What the Workshop ToS grants (minimum platform rights):**

By publishing a resource to the IC Workshop, the author grants IC (the platform) and its users the following irrevocable, non-exclusive rights:

1. **Hosting & distribution:** The platform may store, cache, replicate (D030 federation), and distribute the resource to users who request it. This includes P2P distribution (D049) where other users' clients temporarily cache and re-serve the resource.
2. **Indexing & search:** The platform may index resource metadata (title, description, tags, `llm_meta`) for search functionality, including full-text search (FTS5).
3. **Thumbnails & previews:** The platform may generate and display thumbnails, screenshots, previews, and excerpts of the resource for browsing purposes.
4. **Dependency resolution:** The platform may serve this resource as a transitive dependency when other resources declare a dependency on it.
5. **Auto-download in multiplayer:** The platform may automatically distribute this resource to players joining a multiplayer lobby that requires it (CS:GO-style auto-download, D030).
6. **Forking & derivation:** Other users may create derivative works of the resource **to the extent permitted by the resource's declared SPDX license**. The ToS does not expand license rights — it ensures the platform can mechanically serve the resource; what recipients may *do* with it is governed by the license.
7. **Metadata for AI agents:** The platform may expose resource metadata to LLM/AI agents **to the extent permitted by the resource's `ai_usage` field** (see `AiUsagePermission`). The ToS does not override `ai_usage: deny`.

**What the Workshop ToS does NOT grant:**
- No transfer of copyright. Authors retain full ownership.
- No right for the platform to modify the resource content (only metadata indexing and preview generation).
- No right to use the resource for advertising or promotional purposes beyond Workshop listings.
- No right for the platform to sub-license the resource beyond what the declared SPDX license permits.

**ToS acceptance flow:**
- First-time publishers see the ToS and must accept before their first `ic mod publish` succeeds.
- ToS acceptance is recorded server-side and in local SQLite. The ToS is not re-shown unless the version changes.
- `ic mod publish --accept-tos` allows headless acceptance in CI/CD pipelines.
- The ToS is versioned. When updated, publishers are prompted to re-accept on their next publish. Existing published resources remain distributed under the ToS version they were published under.

**Why this matters:**

Without platform ToS, an author could publish a resource with `All Rights Reserved` and then demand the Workshop stop distributing it — legally, the platform would have no right to host, cache, or serve the file. The ToS establishes the minimum rights the platform needs to function. This is standard for any content hosting platform (GitHub, npm, Steam Workshop, mod.io, Nexus Mods all have equivalent clauses).

**Community-hosted Workshop servers** define their own ToS. The official IC Workshop's ToS is the reference template. `ic mod publish` to a community server shows that server's ToS, not IC's. The engine provides the ToS acceptance infrastructure; the policy is per-deployment.

#### Minimum Age Requirement (COPPA)

**Workshop accounts require users to be 13 years or older.** Account creation presents an age gate; users who do not meet the minimum age cannot create a publishing account.

- Compliance with COPPA (US Children's Online Privacy Protection Act) and the UK Age Appropriate Design Code
- Users under 13 cannot create Workshop accounts, publish resources, or post reviews
- Users under 13 **can** play the game, browse the Workshop, and install resources — these actions don't require an account and collect no personal data
- In-game multiplayer lobbies with text chat follow the same age boundary for account-linked features
- This applies to the official IC Workshop. Community-hosted servers define their own age policies

#### Third-Party Content Disclaimer

Iron Curtain provides Workshop hosting infrastructure — not editorial approval. Resources published to the Workshop are provided by their respective authors under their declared SPDX licenses.

- **The platform is not liable** for the content, accuracy, legality, or quality of user-submitted Workshop resources
- **No warranty** is provided for Workshop resources — they are offered "as is" by their respective authors
- **DMCA safe harbor** applies — the Workshop follows the notice-and-takedown process documented in `../decisions/09e-community.md` § D030
- **The Workshop does not review or approve resources before listing.** Anomaly detection (supply chain security) and community moderation provide the safety layer, not pre-publication editorial review

This disclaimer appears in the Workshop ToS that authors accept before publishing, and is visible to users in the Workshop browser footer.

#### Privacy Policy Requirements

The Workshop collects and processes data necessary for operation. Before any Workshop server deployment, a Privacy Policy must be published covering:

- **What data is collected:** Account identity, published resource metadata, download counts, review text, ratings, IP addresses (for abuse prevention)
- **Lawful basis:** Consent (account creation) and legitimate interest (platform security)
- **Retention:** Connection logs purged after configured retention window (default: 30 days). Account data retained while account is active. Deleted on account deletion request.
- **User rights (GDPR):** Right to access, right to rectification, right to erasure (account deletion deletes profile and reviews; published resources optionally transferable or removable), right to data portability (export in standard format)
- **Third parties:** Federated Workshop servers may replicate metadata. P2P distribution exposes IP addresses to other peers (same as multiplayer — see `../decisions/09e-community.md` § D049 privacy notes)

The Privacy Policy template ships with the Workshop server deployment. Community servers customize and publish their own.

**Phase:** ToS text drafted during Phase 3 (manifest format finalized). Requires legal review before official Workshop launch in Phase 4–5. CI/CD headless acceptance in Phase 5+.

#### Publishing Workflow

Publishing uses the existing `ic mod init` + `ic mod publish` flow — resources are packages with the appropriate `ResourceCategory`. The `ic mod publish` command detects the configured Workshop backend automatically:

- **Phase 0–3 (git-index):** `ic mod publish` packages the `.icpkg`, uploads it to GitHub Releases, generates a manifest YAML, and opens a PR to the `workshop-index` repo. The modder reviews and submits the PR. GitHub Actions validates the manifest.
- **Phase 5+ (Workshop server):** `ic mod publish` uploads directly to the Workshop server. No PR needed — the server validates and indexes immediately.

The command is the same in both phases — the backend is transparent to the modder.

```
# Publish a single music track
ic mod init asset-pack
# Edit mod.yaml: set category to "Music", add license, add llm_meta
# Add audio files
ic mod check                   # validates license present, llm_meta recommended
ic mod publish                 # Phase 0-3: uploads to GitHub Releases + opens PR to index
                               # Phase 5+:  uploads directly to Workshop server
```

```yaml
# Example: publishing a music pack
mod:
  id: alice/soviet-march-music
  title: "Soviet March — Original Composition"
  version: "1.2.0"
  authors: ["alice"]
  description: "An original military march composition for Soviet faction missions"
  license: "CC-BY-4.0"
  category: Music

assets:
  media: ["audio/soviet-march.ogg"]

llm:
  summary: "Military march music, Soviet theme, 2:30 duration, orchestral"
  purpose: "Background music for Soviet mission briefings or victory screens"
  gameplay_tags: [soviet, military, march, orchestral, briefing]
  composition_hints: "Pairs well with Soviet faction voice lines for immersive briefings"
```

#### Moderation & Publisher Trust (D030)

Workshop moderation is **tooling-enabled, policy-configurable**. The engine provides moderation infrastructure; each deployment (official IC server, community servers) defines its own policies.

**Publisher trust tiers:**

| Tier           | Requirements                                                                                  | Privileges                                                                 |
| -------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Unverified** | Account created                                                                               | Can publish to `dev` channel only (local testing)                          |
| **Verified**   | Email confirmed                                                                               | Can publish to `beta` and `release` channels. Subject to moderation queue. |
| **Trusted**    | N successful publishes (configurable, default 5), no policy violations, account age > 30 days | Updates auto-approved. New resources still moderation-queued.              |
| **Featured**   | Editor's pick / staff selection                                                               | Highlighted in browse UI, eligible for "Mod of the Week"                   |

Trust tiers are tracked per-server. A publisher who is Trusted on the official server starts as Verified on a community server — trust doesn't federate automatically (a community decision, not an engine constraint).

**Moderation rules engine (Phase 5+):**

The Workshop server supports configurable moderation rules — YAML-defined automation that runs on every publish event. Inspired by mod.io's rules engine but exposed as user-configurable server policy, not proprietary SaaS logic.

```yaml
# workshop-server.yaml — moderation rules
moderation:
  rules:
    - name: "hold-new-publishers"
      condition: "publisher.trust_tier == 'verified' AND resource.is_new"
      action: queue_for_review
    - name: "auto-approve-trusted-updates"
      condition: "publisher.trust_tier == 'trusted' AND resource.is_update"
      action: auto_approve
    - name: "flag-large-packages"
      condition: "resource.size > 500_000_000"  # > 500MB
      action: queue_for_review
      reason: "Package exceeds 500MB — manual review required"
    - name: "reject-missing-license"
      condition: "resource.license == null"
      action: reject
      reason: "License field is required"
```

Community server operators define their own rules. The official IC server ships with sensible defaults. Rules are structural (file format, size, metadata completeness) — not content-based creative judgment.

**Community reporting:** Report button on every resource in the Workshop browser. Report categories: license violation, malware, DMCA, policy violation. Reports go to a moderator queue. DMCA with due process per D030. Publisher notified and can appeal.

#### CI/CD Publishing Integration

`ic mod publish` is designed to work in CI/CD pipelines — not just interactive terminals. Inspired by Artifactory's CI integration and npm's automation tokens.

```yaml
# GitHub Actions example
- name: Publish to Workshop
  env:
    IC_AUTH_TOKEN: ${{ secrets.IC_WORKSHOP_TOKEN }}
  run: |
    ic mod check --strict
    ic mod publish --non-interactive --json
```

- **Scoped API tokens:** `ic auth create-token --scope publish` generates a token limited to publish operations. Separate scopes: `publish`, `admin`, `readonly`. Tokens stored in `~/.ic/credentials.yaml` locally, or `IC_AUTH_TOKEN` env var in CI.
- **Non-interactive mode:** `--non-interactive` flag skips all prompts (required for CI). `--json` flag returns structured output for pipeline parsing.
- **Lockfile verification in CI:** `ic mod install --locked` fails if `ic.lock` doesn't match `mod.yaml` — ensures reproducible builds.
- **Pre-publish validation:** `ic mod check --strict` validates manifest, license, dependencies, SHA-256 integrity, and file format compliance before upload. Catch errors before hitting the server.

#### Platform-Targeted Releases

Resources can declare platform compatibility in `manifest.yaml`, enabling per-platform release control. Inspired by mod.io's per-platform targeting (console+PC+mobile) — adapted for IC's target platforms:

```yaml
# manifest.yaml
package:
  name: "hd-terrain-textures"
  platforms: [windows, linux, macos]     # KTX2 textures not supported on WASM
  # Omitting platforms field = available on all platforms (default)
```

The Workshop browser filters resources by the player's current platform. Platform-incompatible resources are hidden by default (shown grayed-out with an "Other platforms" toggle). Phase 0–3: no platform filtering (all resources visible). Phase 5+: server-side filtering.

### LLM-Driven Resource Discovery (D030)

The `ic-llm` crate can search the Workshop programmatically and incorporate discovered resources into generated content:

**Discovery pipeline:**

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ LLM generates mission concept                                  │
  │ ("Soviet ambush in snowy forest with dramatic briefing")        │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Identify needed assets                                          │
  │ → winter terrain textures                                       │
  │ → Soviet voice lines                                            │
  │ → ambush/tension music                                          │
  │ → briefing video (optional)                                     │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Search Workshop via WorkshopClient                              │
  │ → query="winter terrain", tags=["snow", "forest"]              │
  │ → query="Soviet voice lines", tags=["soviet", "military"]     │
  │ → query="tension music", tags=["ambush", "suspense"]          │
  │ → Filter: ai_usage != Deny (exclude resources authors          │
  │   have marked as off-limits to LLM agents)                     │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Evaluate candidates via llm_meta                                │
  │ → Read summary, purpose, composition_hints,                     │
  │   content_description, related_resources                        │
  │ → Filter by license compatibility                               │
  │ → Rank by gameplay_tags match score                             │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Partition by ai_usage permission                                │
  │ → ai_usage: Allow  → auto-add as dependency (no human needed)  │
  │ → ai_usage: MetadataOnly → recommend to human for confirmation │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Add discovered resources as dependencies in generated mod.yaml │
  │ → Allow resources added directly                                │
  │ → MetadataOnly resources shown as suggestions in editor UI     │
  │ → Dependencies resolved at install time via `ic mod install`   │
  └─────────────────────────────────────────────────────────────────┘
```

The LLM sees workshop resources through their `llm_meta` fields. A music track tagged `summary: "Military march, Soviet theme, orchestral, 2:30"` and `composition_hints: "Pairs well with Soviet faction voice lines"` lets the LLM intelligently select and compose assets for a coherent mission experience.

**Author consent (ai_usage):** Every Workshop resource carries an `ai_usage` permission that is SEPARATE from the SPDX license. A CC-BY music track can be ai_usage: Deny (author is fine with human redistribution but doesn't want LLMs auto-incorporating it). Conversely, an all-rights-reserved cutscene could be ai_usage: Allow (author wants the resource to be discoverable and composable by LLM agents even though the license is restrictive). The license governs human legal rights; `ai_usage` governs automated agent behavior. See the `AiUsagePermission` enum above for the three tiers.

**Default: `MetadataOnly`.** When an author publishes without explicitly setting `ai_usage`, the default is `MetadataOnly` — LLMs can find and recommend the resource, but a human must confirm adding it. This respects authors who haven't thought about AI usage while still making their content discoverable. Authors who want full LLM integration set `ai_usage: allow` explicitly. `ic mod publish` prompts for this choice on first publish and remembers it as a user-level default.

**License-aware generation:** The LLM also filters by license compatibility — if generating content for a CC-BY mod, it only pulls CC-BY-compatible resources (`CC0-1.0`, `CC-BY-4.0`), excluding `CC-BY-NC-4.0` or `CC-BY-SA-4.0` unless the mod's own license is compatible. Both ai_usage AND license must pass for a resource to be auto-added.

### Steam Workshop Integration (D030)

Steam Workshop is an **optional distribution source**, not a replacement for the IC Workshop. Resources published to Steam Workshop appear in the virtual repository alongside IC Workshop and local resources. Priority ordering determines which source wins when the same resource exists in multiple places.

```toml
# settings.toml — Steam Workshop as an additional source
[[workshop.sources]]
url = "https://workshop.ironcurtain.gg"      # official IC Workshop
priority = 1

[[workshop.sources]]
type = "steam_workshop"                      # Steam Workshop source
app_id = 0000000                             # IC's Steam app ID
priority = 2

[[workshop.sources]]
path = "C:/my-local-workshop"
priority = 3
```

**Key design constraints:**
- IC Workshop is always the primary source — Steam is additive, never required
- Resources can be published to both IC Workshop and Steam Workshop simultaneously via `ic mod publish --also-steam`
- Steam Workshop subscriptions sync to local cache automatically
- No Steam lock-in — the game is fully functional without Steam

### In-Game Workshop Browser (D030)

The in-game browser is how most players interact with the Workshop. It queries the merged view of all configured repository sources — whether that's a git-hosted index (Phase 0–3), a full Workshop server (Phase 5+), or both. UX inspired by CS:GO/Steam Workshop browser:

- **Search:** Full-text search across names, descriptions, tags, and `llm_meta` fields. Phase 0–3: local search over cached `index.yaml`. Phase 5+: FTS5-powered server-side search.
- **Filter:** By category (map, mod, music, sprites, etc.), game module (RA1, TD, RA2), author, license. Rating and download count filters available when Workshop server is live (Phase 5+).
- **Sort:** By newest, alphabetical, author. Phase 5+ adds: popularity, highest rated, most downloaded, trending.
- **Preview:** Screenshot, description, dependency list, license info, author name.
- **One-click install:** Downloads to local cache, resolves dependencies automatically. Works identically regardless of backend.
- **Collections:** Curated bundles ("Best Soviet mods", "Tournament map pool Season 5"). Phase 5+ feature.
- **Creator profiles:** Author page showing all published content, reputation score, tip links (D035). Phase 5+ feature.

### Modpacks as First-Class Workshop Resources (D030)

A **modpack** is a Workshop resource that bundles a curated set of mods with pinned versions, load order, and configuration — published as a single installable resource. This is the lesson from Minecraft's CurseForge and Modrinth: modpacks solve the three hardest problems in modding ecosystems — discovery ("what mods should I use?"), compatibility ("do these mods work together?"), and onboarding ("how do I install all of this?").

**Modpacks are published snapshots of mod profiles (D062).** Curators build and test mod profiles locally (`ic profile save`, `ic profile inspect`, `ic profile diff`), then publish the working result via `ic mod publish-profile`. Workshop modpacks import as local profiles via `ic profile import`. This makes the curator workflow reproducible — no manual reconstruction of the mod configuration each session.

```yaml
# mod.yaml for a modpack
mod:
  id: alice/red-apocalypse-pack
  title: "Red Apocalypse Complete Experience"
  version: "2.1.0"
  authors: ["alice"]
  description: "A curated collection of 12 mods for an enhanced RA1 experience"
  license: "CC0-1.0"
  category: Modpack                    # distinct category from Mod

engine:
  version: "^0.5.0"
  game_module: "ra1"

# Modpack-specific: list of mods with pinned versions and load order
modpack:
  mods:
    - id: "bob/hd-sprites"
      version: "=2.1.0"               # exact pin — tested with this version
    - id: "carol/economy-overhaul"
      version: "=1.4.2"
    - id: "dave/ai-improvements"
      version: "=3.0.1"
    - id: "alice/tank-rebalance"
      version: "=1.1.0"
  
  # Explicit conflict resolutions (if any)
  conflicts:
    - unit: heavy_tank
      field: health.max
      use_mod: "alice/tank-rebalance"
  
  # Configuration overrides applied after all mods load
  config:
    balance_preset: classic
    qol_preset: iron_curtain
```

**Why modpacks matter:**
- **For players:** One-click install of a tested, working mod combination. No manual dependency chasing, no version mismatch debugging.
- **For modpack curators:** A creative role that doesn't require writing any mod code. Curators test combinations, resolve conflicts, and publish a known-good experience.
- **For mod authors:** Inclusion in popular modpacks drives discovery and downloads. Modpacks reference mods by Workshop ID — the original mod author keeps full credit and control.

**Modpack lifecycle:**
- `ic mod init modpack` — scaffolds a modpack manifest
- `ic mod check` — validates all mods in the pack are compatible (version resolution, conflict detection)
- `ic mod test --headless` — loads all mods in sequence, runs smoke tests
- `ic mod publish` — publishes the modpack to Workshop. Installing the modpack auto-installs all referenced mods.

**Phase:** Modpack support in Phase 6a (alongside full Workshop registry).

### Auto-Download on Lobby Join (D030)

When a player joins a multiplayer lobby, the client checks `GameListing.required_mods` (see `03-NETCODE.md` § `GameListing`) against the local cache. Missing resources trigger automatic download:

1. **Diff:** Compare `required_mods` against local cache
2. **Prompt:** Show missing resources with total download size and estimated time
3. **Download:** Fetch via P2P (BitTorrent/WebTorrent — D049) from lobby peers and the wider swarm, with HTTP fallback from Workshop server. Lobby peers are prioritized as download sources since they already have the required content.
4. **Verify:** SHA-256 checksum validation for every downloaded resource
5. **Install:** Place in local cache, update dependency graph
6. **Ready:** Player joins game with all required content

Players can cancel at any time. Auto-download respects bandwidth limits configured in settings. Resources downloaded this way are tagged as **transient** — they remain in the local cache and are fully functional, but are subject to auto-cleanup after a configurable period of non-use (default: 30 days). After the session, a non-intrusive toast offers the player the choice to pin (keep forever), let auto-clean run its course, or remove immediately. Frequently-used transient resources (3+ sessions) are automatically promoted to pinned. See `../decisions/09e-community.md` § D030 "Local Resource Management" for the full lifecycle, storage budget, and cleanup UX.

### Creator Reputation System (D030)

Creators earn reputation through community signals:

| Signal              | Weight   | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| Total downloads     | Medium   | Cumulative downloads across all published resources                         |
| Average rating      | High     | Mean star rating across published resources (minimum 10 ratings to display) |
| Dependency count    | High     | How many other resources/mods depend on this creator's work                 |
| Publish consistency | Low      | Regular updates and new content over time                                   |
| Community reports   | Negative | DMCA strikes, policy violations reduce reputation                           |

**Badges:**
- **Verified** — identity confirmed (e.g., linked GitHub account)
- **Prolific** — 10+ published resources with ≥4.0 average rating
- **Foundation** — resources depended on by 50+ other resources
- **Curator** — maintains high-quality curated collections

Reputation is displayed but not gatekeeping — any registered user can publish. Badges appear on resource listings, in-game browser, and author profiles. See `../decisions/09e-community.md` § D030 for full design.

### Content Moderation & DMCA/Takedown Policy (D030)

The Workshop must be a safe, legal distribution platform. Content moderation is a combination of automated scanning, community reporting, and moderator review.

**Prohibited content:** Malware, hate speech, illegal content, impersonation of other creators.

**DMCA/IP takedown process (due process, not shoot-first):**

1. **Reporter files takedown request** via Workshop UI or email, specifying the resource and the claim (DMCA, license violation, policy violation)
2. **Resource is flagged** — not immediately removed — and the author is notified with a 72-hour response window
3. **Author can counter-claim** (e.g., they hold the rights, the reporter is mistaken)
4. **Workshop moderators review** — if the claim is valid, the resource is delisted (not deleted — remains in local caches of existing users)
5. **Repeat offenders** accumulate strikes. Three strikes → account publishing privileges suspended. Appeals process available.
6. **DMCA safe harbor:** The Workshop server operator (official or community-hosted) follows standard DMCA safe harbor procedures

**Lessons applied:** ArmA's heavy-handed approach (IP bans for mod redistribution) chilled creativity. Skyrim's paid mods debacle showed mandatory paywalls destroy goodwill. Our policy: due process, transparency, no mandatory monetization.

### Creator Recognition — Voluntary Tipping (D035)

Creators can optionally include tip/sponsorship links in their resource metadata. Iron Curtain **never processes payments** — we simply display links.

```yaml
# In resource manifest
creator:
  name: "alice"
  tip_links:
    - platform: ko-fi
      url: "https://ko-fi.com/alice"
    - platform: github-sponsors
      url: "https://github.com/sponsors/alice"
```

Tip links appear on resource pages, author profiles, and in the in-game browser. No mandatory paywalls — all Workshop content is free to download. This is a deliberate design choice informed by the Skyrim paid mods controversy and ArmA's gray-zone monetization issues.

### Achievement System Integration (D036)

Mod-defined achievements are publishable as Workshop resources. A mod can ship an achievement pack that defines achievements triggered by Lua scripts:

```yaml
# achievements/my-mod-achievements.yaml
achievements:
  - id: "my_mod.nuclear_winter"
    title: "Nuclear Winter"
    description: "Win a match using only nuclear weapons"
    icon: "icons/nuclear_winter.png"
    game_module: ra1
    category: competitive
    trigger: lua
    script: "triggers/nuclear_winter.lua"
```

Achievement packs are versioned, dependency-tracked, and license-required like all Workshop resources. Engine-defined achievements (campaign completion, competitive milestones) ship with the game and cannot be overridden by mods.

See `../decisions/09e-community.md` § D036 for the full achievement system design including SQL schema and category taxonomy.

### Workshop API

The Workshop server stores all resource metadata, versions, dependencies, ratings, and search indices in an embedded SQLite database (D034). No external database required — the server is a single Rust binary that creates its `.db` file on first run. FTS5 provides full-text search over resource names, descriptions, and `llm_meta` tags. WAL mode handles concurrent reads from browse/search endpoints.

```rust
pub trait WorkshopClient: Send + Sync {
    fn browse(&self, filter: &ResourceFilter) -> Result<Vec<ResourceListing>>;
    fn download(&self, id: &ResourceId, version: &VersionReq) -> Result<ResourcePackage>;
    fn publish(&self, package: &ResourcePackage) -> Result<ResourceId>;
    fn rate(&self, id: &ResourceId, rating: Rating) -> Result<()>;
    fn search(&self, query: &str, category: ResourceCategory) -> Result<Vec<ResourceListing>>;
    fn resolve(&self, deps: &[Dependency]) -> Result<DependencyGraph>;   // D030: dep resolution
    fn audit_licenses(&self, graph: &DependencyGraph) -> Result<LicenseReport>; // D030: license check
    fn promote(&self, id: &ResourceId, to_channel: Channel) -> Result<()>; // D030: channel promotion
    fn replicate(&self, filter: &ResourceFilter, target: &str) -> Result<ReplicationReport>; // D030: pull replication
    fn create_token(&self, name: &str, scopes: &[TokenScope], expires: Duration) -> Result<ApiToken>; // CI/CD auth
    fn revoke_token(&self, token_id: &str) -> Result<()>; // CI/CD: revoke compromised tokens
    fn report_content(&self, id: &ResourceId, reason: ContentReport) -> Result<()>; // D030: content moderation
    fn get_creator_profile(&self, publisher: &str) -> Result<CreatorProfile>; // D030: creator reputation
}

/// Globally unique resource identifier: "publisher/name@version"
pub struct ResourceId {
    pub publisher: String,
    pub name: String,
    pub version: Version,             // semver
}

pub struct Dependency {
    pub id: String,                   // "publisher/name"
    pub version: VersionReq,          // semver range
    pub source: DependencySource,     // Workshop, Local, Url
    pub optional: bool,
}

pub struct ResourcePackage {
    pub id: ResourceId,               // globally unique identifier
    pub meta: ResourceMeta,           // title, author, description, tags
    pub license: String,              // SPDX identifier (REQUIRED)
    pub eula: Option<Eula>,           // optional additional terms (URL + summary)
    pub ai_usage: AiUsagePermission,  // author's consent for LLM/AI access (REQUIRED)
    pub llm_meta: Option<LlmResourceMeta>, // LLM-readable description
    pub category: ResourceCategory,   // Music, Sprites, Map, Mod, etc.
    pub files: Vec<PackageFile>,      // the actual content
    pub checksum: Sha256Hash,         // package integrity (computed on publish)
    pub channel: Channel,             // dev | beta | release
    pub dependencies: Vec<Dependency>,// other workshop items this requires
    pub compatibility: VersionInfo,   // engine version + game module this targets
}

/// Optional End User License Agreement for additional terms beyond the SPDX license.
pub struct Eula {
    pub url: String,                  // link to full EULA text (REQUIRED if eula present)
    pub summary: Option<String>,      // one-line human-readable summary
}

/// Author's explicit consent for how LLM/AI agents may interact with this resource.
/// This is SEPARATE from the SPDX license — a resource can be CC-BY (humans may
/// redistribute) but ai_usage: Deny (author doesn't want automated AI incorporation).
/// The license governs human use; ai_usage governs automated agent use.
pub enum AiUsagePermission {
    /// LLMs can discover, evaluate, pull, and incorporate this resource into
    /// generated content (missions, mods, campaigns) without per-use approval.
    /// The resource appears in LLM search results and can be auto-added as a
    /// dependency by ic-llm's discovery pipeline (D030).
    Allow,

    /// LLMs can read this resource's metadata (llm_meta, tags, description) for
    /// discovery and recommendation, but cannot auto-pull it as a dependency.
    /// A human must explicitly confirm adding this resource. This is the DEFAULT —
    /// it lets LLMs recommend the resource to modders while keeping the author's
    /// content behind a human decision gate.
    MetadataOnly,

    /// Resource is excluded from LLM agent queries entirely. Human users can still
    /// browse, search, and install it normally. The resource is invisible to ic-llm's
    /// automated discovery pipeline. Use this for resources where the author does not
    /// want any AI-mediated discovery or incorporation.
    Deny,
}

/// LLM-readable metadata for workshop resources.
/// Enables intelligent browsing, selection, and composition by ic-llm.
pub struct LlmResourceMeta {
    pub summary: String,              // one-line: "A 4-player desert skirmish map with limited ore"
    pub purpose: String,              // when/why to use this: "Best for competitive 2v2 with scarce resources"
    pub gameplay_tags: Vec<String>,   // semantic: ["desert", "2v2", "competitive", "scarce_resources"]
    pub difficulty: Option<String>,   // for missions/campaigns: "hard", "beginner-friendly"
    pub composition_hints: Option<String>, // how this combines with other resources
    pub content_description: Option<ContentDescription>, // rich structured description for complex resources
    pub related_resources: Vec<String>, // resource IDs that compose well with this one
}

/// Rich structured description for complex multi-file resources (cutscene packs,
/// campaign bundles, sound libraries). Gives LLMs enough context to evaluate
/// relevance without downloading and parsing the full resource.
pub struct ContentDescription {
    pub contents: Vec<String>,        // what's inside: ["5 briefing videos", "3 radar comm clips"]
    pub themes: Vec<String>,          // mood/tone: ["military", "suspense", "soviet_propaganda"]
    pub style: Option<String>,        // visual/audio style: "Retro FMV with live actors"
    pub duration: Option<String>,     // for temporal media: "12 minutes total"
    pub resolution: Option<String>,   // for visual media: "320x200 palette-indexed"
    pub technical_notes: Option<String>, // format-specific info an LLM needs to know
}

pub struct DependencyGraph {
    pub resolved: Vec<ResolvedDependency>, // all deps with exact versions
    pub conflicts: Vec<DependencyConflict>, // incompatible version requirements
}

pub struct LicenseReport {
    pub compatible: bool,
    pub issues: Vec<LicenseIssue>,    // e.g., "CC-BY-NC dep in CC-BY mod"
}
```

