# Modding System  Campaign System (Branching, Persistent, Continuous)

*Inspired by Operation Flashpoint: Cold War Crisis / Resistance. See D021.*

OpenRA's campaigns are disconnected: each mission is standalone, you exit to menu between them, there's no flow. Our campaigns are **continuous, branching, and stateful** — a directed graph of missions with persistent state, multiple outcomes per mission, and no mandatory game-over screen.

That mission graph is the canonical D021 backbone. Some campaigns stop there. Others, especially first-party Enhanced Edition campaigns, organize that same graph into a **phase-based strategic layer** (`War Table`) with operations, enemy initiatives, Requisition, Command Authority, and an arms race / tech ledger between milestone missions.

### Core Principles

1. **Campaign is a graph, not a list.** Missions connect via named outcomes, forming branches, convergence points, and optional paths — not a linear sequence.
2. **Missions have multiple outcomes, not just win/lose.** "Won with bridge intact" and "Won but bridge destroyed" are different outcomes that lead to different next missions.
3. **Failure doesn't end the campaign by default.** A "defeat" outcome is just another edge in the graph. The designer chooses: branch to a fallback mission, retry with fewer resources, or skip ahead with consequences. Truly campaign-failing missions are allowed only as explicit authored exceptions and must be labeled as **critical missions** before mission launch.
4. **State persists across missions.** Surviving units, veterancy, captured equipment, story flags, resources — all carry forward based on designer-configured carryover rules.
5. **Continuous flow.** Briefing → mission → debrief → next mission. No exit to menu between levels (unless the player explicitly quits).

### Graph Backbone and Strategic-Layer Extension

D021 has two valid presentation tiers:

1. **Graph-only campaigns** — the player moves directly from mission to mission through a branching outcome graph
2. **Phase-based strategic campaigns** — the same graph is wrapped in a War Table that exposes optional operations, enemy initiatives, Command Authority, and Requisition between milestone missions

The key rule is that the **graph remains authoritative** in both cases. Strategic-layer campaigns do not replace the graph with an unrelated meta-system. They:

- group missions into authored **phases**
- expose some graph nodes as optional **operations**
- advance authored **enemy initiatives** between operations
- track a first-class **tech / arms-race ledger** that later missions consume

Classic campaigns can stay graph-only. Enhanced Edition campaigns can use the strategic layer. Both use the same `CampaignState`, mission outcomes, save/load model, and Lua `Campaign` API.

```yaml
campaign:
  id: allied_campaign_enhanced
  start_mission: allied_01

  campaign_phases:
    phase_3:
      main_mission: allied_06
      granted_requisition: 2000
      granted_intel: 50
      operations:
        authored:
          - ic_behind_enemy_lines
          - cs_crackdown
        generated_profiles:
          - allied_intel_raid_t1
      enemy_initiatives:
        - radar_network_expansion
        - chemical_weapons_deployment
      asset_ledger: allied_arms_race
```

### Campaign Definition (YAML)

```yaml
# campaigns/allied/campaign.yaml
campaign:
  id: allied_campaign
  title: "Allied Campaign"
  description: "Drive back the Soviet invasion across Europe"
  start_mission: allied_01

  # Campaign-authored default settings (D033/D019/D032/D043/D045/D048)
  # These are the campaign's baked-in configuration — what the author
  # intends the campaign to play like. Applied as defaults when the
  # player starts a new playthrough; player can review and tweak
  # individual switches before launching.
  default_settings:
    difficulty: normal           # campaign's intended starting difficulty
    balance: classic             # D019 balance preset
    theme: classic               # D032 UI theme
    behavior: vanilla            # D033 QoL behavior preset
    ai_behavior: classic_ra      # D043 AI preset
    pathfinding: classic_ra      # D045 pathfinding feel
    render_mode: classic         # D048 render mode
    # Individual toggle overrides — fine-grained switches on top of
    # the behavior preset above (same keys as D033 YAML structure)
    toggle_overrides:
      fog_of_war: on             # campaign requires fog
      shroud_regrow: false       # but no shroud regrowth
      health_bars: on_selection  # author preference for this campaign

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
      critical_failure: false     # default: defeat branches, does not end the campaign
      carryover:
        from_previous: none    # first mission — nothing carries
      outcomes:
        victory_bridge_intact:
          description: "Bridge secured intact"
          next: allied_02a
          debrief: briefings/allied-01-debrief-bridge.yaml
          state_effects:
            set_flag:
              bridge_status: intact
        victory_bridge_destroyed:
          description: "Won but bridge was destroyed"
          next: allied_02b
          state_effects:
            set_flag:
              bridge_status: destroyed
        defeat:
          description: "Base overrun"
          next: allied_01_fallback
          state_effects:
            set_flag:
              retreat_count: +1

    allied_02a:
      map: missions/allied-02a    # different map — bridge crossing
      briefing: briefings/allied-02a.yaml
      carryover:
        units: surviving          # units from mission 01 appear
        veterancy: keep           # their experience carries
        equipment: keep           # captured Soviet tanks too
      conditions:                 # optional entry conditions
        require_flag:
          bridge_status: intact
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
            set_flag:
              morale: low

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

### Mission Criticality and Failure Disclosure

The canonical expectation for IC campaigns is:

- **Main missions usually fail forward.** Defeat branches to a fallback node, harder variant, or reduced-state continuation.
- **SpecOps usually fail with consequences.** You may lose intel, lose a hero, open a rescue branch, or strengthen the enemy — but the campaign should usually continue.
- **Critical missions are rare exceptions.** These are the missions where defeat truly ends the campaign, a theater, or a mini-campaign run.

If a mission is critical, that must be authored and surfaced explicitly:

```yaml
missions:
  allied_14_final_assault:
    critical_failure: true
    critical_failure_text: "If Moscow holds, the Allied campaign ends in defeat."
    revealed_operations:
      - allied_cleanup_01
    unlocked_operations:
      - allied_epilogue_aftermath
    briefing_risk:
      success_reward: "Campaign victory"
      failure_consequence: "Campaign ends"
```

**UI rule:** A critical mission must show a visible `CRITICAL` badge on the campaign map and in the mission briefing. "Lose and retry" or "campaign ends on failure" must never be ambiguous.

**Default rule:** If `critical_failure` is absent, it is treated as `false`. Campaign authors must opt in to hard failure.

### Save/Load and Choice Commitment

By default, D021 campaign choices are normal save/load state. IC does **not** try to prevent reload-based reconsideration in standard campaign play.

Recommended first-party policy:

- **Normal mode:** free saving/reloading before or after decisions
- **Ironman / commit modes:** autosave immediately after a tactical dilemma selection or other branch-committing decision, and treat that branch as locked

The "world moves without you" rule is about authored consequences and opportunity cost, not an anti-save-scum guarantee by itself.

### Campaign Validation and Coverage

Branching campaigns create a large state space. D021 content therefore needs more than a graph-shape check.

`ic campaign validate` should cover three layers:

1. **Graph validation** — no orphan nodes, no missing outcome targets, no impossible joins
2. **State-coverage validation** — traverse authored outcomes, expiring opportunity branches, pending-rescue states, and fallback edges to confirm every consumer mission still has a legal playable state
3. **Presentation validation** — snapshot world-screen cards and briefings so `On Success`, `On Failure`, `If Skipped`, `Time Window`, and `CRITICAL` text do not silently disappear under specific flag combinations

Large campaigns should validate endgame consumers by **asset bundle** rather than brute-forcing every raw flag permutation. For example:

- air-support bundle
- partisan / theater bundle
- prototype-tech bundle
- unrest / sabotage bundle
- rescue / compromise bundle

The goal is to prove that every legal combination reaching a mission like `M14` still:

- spawns correctly
- exposes a coherent briefing
- preserves the authored reward / penalty promises

Generated SpecOps add one more layer:

- sample every legal generated profile and run the same route / objective / duration validation used at runtime

This is design-level policy, not a hard requirement on one exact CLI shape, but first-party campaigns should not ship without automated traversal and snapshot coverage.

### Campaign Graph Extensions (Optional Operations)

Campaign graphs are extensible — external mods can inject new mission nodes into an existing campaign's graph without modifying the original campaign files. This enables:

1. **First-party expansion content** — IC ships optional "Enhanced Campaign" operations that branch off the original RA1/TD campaign graph, using IC's new mechanics (hero progression, branching, dynamic weather, asymmetric co-op) while the classic missions remain untouched
2. **Community optional operations** — Workshop authors publish SpecOps packs or theater-branch packs that attach to specific points in official or community campaigns
3. **Campaign DLC pattern** — new story arcs that branch off after specific missions and rejoin (or don't) later in the original graph

**How it works:** Campaign extensions use the same YAML graph format as primary campaigns but declare an `extends` field pointing to the parent campaign. The engine merges the extension graph into the parent at load time.

```yaml
# Extension campaign — adds optional operations to the Allied campaign
campaign:
  id: allied_campaign_enhanced
  extends: allied_campaign               # parent campaign this extends

  # Extension metadata
  title: "Allied Campaign — Enhanced Edition"
  description: "Optional missions exploring new IC mechanics alongside the classic Allied campaign"
  optional: true                         # player can enable/disable in campaign settings
  badge: "IC Enhanced"                   # shown in mission select to distinguish extended content

  # New missions that attach to the parent graph
  missions:
    # Optional SpecOps branch: branches off after allied_03
    allied_03_tanya_ops:
      extends_from:
        parent_mission: allied_03        # attach point in the parent campaign
        parent_outcome: victory          # which outcome edge to branch from
        insertion: optional_branch       # 'optional_branch' = new choice, not replacement
      map: missions/enhanced/tanya_ops_01
      briefing: briefings/enhanced/tanya_ops_01.yaml
      badge: "IC Enhanced"               # UI badge distinguishing this from original missions
      type: embedded_task_force          # uses new IC mission archetype
      hero: tanya
      outcomes:
        victory:
          next: allied_04                # rejoin the original campaign graph
          state_effects:
            set_flag:
              tanya_ops_complete: true
              tanya_reputation: hero
        defeat:
          next: allied_04                # still continues — optional operation failure isn't campaign-ending
          state_effects:
            set_flag:
              tanya_ops_failed: true

    # Optional SpecOps follow-up: available only if the player chose a specific path
    allied_06_spy_network:
      extends_from:
        parent_mission: allied_06
        parent_outcome: victory
        insertion: optional_branch
        condition:                       # only available if a specific flag is set
          require_flag:
            tanya_ops_complete: true
      map: missions/enhanced/spy_network
      type: spy_infiltration
      outcomes:
        victory:
          next: allied_07
          state_effects:
            set_flag:
              spy_network_active: true

    # Replacement mission: same graph position but uses new IC mechanics
    allied_05_remastered:
      extends_from:
        parent_mission: allied_05
        insertion: alternative            # 'alternative' = offered alongside the original
        label: "Enhanced Version"         # shown in mission select
      map: missions/enhanced/allied_05_remastered
      type: embedded_task_force           # new IC archetype instead of classic scripting
      outcomes:
        victory:
          next: allied_06                 # same destination as original
        defeat:
          next: allied_05_fallback        # same fallback as original
```

**Insertion modes:**

| Mode | Behavior | UX |
|------|----------|-----|
| `optional_branch` | Adds a new choice alongside existing outcome edges. Player can take the optional operation or continue the original path. If the branch is skipped, the original graph is unchanged unless authored flags say otherwise | Mission select shows: "Continue to Mission 4" / "SpecOps: Tanya Ops (IC Enhanced)" |
| `alternative` | Offers an alternative version of an existing mission. Player chooses between original and enhanced. Both lead to the same next-mission targets | Mission select shows: "Mission 5 (Classic)" / "Mission 5 (Enhanced Version)" |
| `insert_before` | Adds a new mission that must be completed before the original mission. The extension mission's victory outcome leads to the original mission | The new mission appears in the graph between the parent and its original next mission |
| `post_campaign` | Attaches after the campaign's ending node(s). Extends the story beyond the original ending | Available after campaign completion. Shows as "Epilogue: ..." |

Some first-party plans may intentionally keep a branch pending across a bounded future window, such as a rescue mission that remains available for the next one or two nodes while penalties escalate. That is an explicit campaign-layer extension, not implicit behavior of every `optional_branch`.
When this happens, the campaign map/intermission UI may show multiple available missions at once. `Continue Campaign` should reopen that campaign map/intermission state rather than auto-launching an arbitrary node.

**Graph merge at load time:**

1. Engine loads the parent campaign graph (e.g., `allied_campaign`)
2. Engine scans for installed campaign extensions that declare `extends: allied_campaign`
3. For each enabled extension, the engine validates:
   - `parent_mission` exists in the parent graph
   - `parent_outcome` is a valid outcome for that mission
   - No conflicting insertions (two extensions trying to `insert_before` the same mission)
   - Extension missions don't create graph cycles
4. Extension missions are merged into the combined graph with their `badge` metadata
5. The combined graph is what the player sees in mission select

**Player control:**

- Extensions are **opt-in**. The campaign settings screen shows installed extensions with toggle switches:
  ```
  Allied Campaign
    ✅ Classic missions (always on)
    🔲 IC Enhanced Edition — optional operations using new mechanics
    🔲 Community: "Tanya Chronicles" by MapMaster — 5 additional commando operations
  ```
- Disabling an extension removes its missions from the graph. The original campaign is always playable without any extensions
- Campaign progress (D021 `CampaignState`) tracks which extension missions were completed, so enabling/disabling extensions mid-campaign is safe — completed extension missions remain in history, and the player continues from wherever they are in the original graph

**Workshop support:** Campaign extensions are Workshop packages (D030/D049) with `type = "campaign_extension"` in their `mod.toml`. The Workshop listing shows which parent campaign they extend. Installing an extension automatically associates it with the parent campaign in the mission select UI.

```toml
# mod.toml for a campaign extension
[mod]
id = "allied-enhanced"
title = "Allied Campaign — Enhanced Edition"
type = "campaign_extension"
extends_campaign = "allied_campaign"    # which campaign this extends

[dependencies]
"official/ra1" = "^1.0"               # requires the base RA1 module
```

### First-Party Enhanced Campaigns (IC Enhanced Edition)

IC ships the classic RA1 Allied and Soviet campaigns faithfully reproduced (Phase 4). Alongside them, IC offers an **optional "Enhanced Edition"** — a campaign extension that weaves Counterstrike/Aftermath expansion missions into the main campaign graph, adds IC-original missions showcasing new mechanics, and introduces branching decisions. Like XCOM: Enemy Within to Enemy Unknown, or Baldur's Gate Enhanced Edition — the same campaign, but richer.

**Guiding principle:** The classic campaign is always available untouched. Enhanced Edition is opt-in. A player who wants the 1996 experience gets it. A player who wants to see what a modern engine adds enables the extension. Both are first-class.

#### What the Enhanced Edition Adds

**1. Counterstrike & Aftermath missions integrated into the campaign graph**

The original expansion packs (Counterstrike: 16 missions, Aftermath: 18 missions) shipped as standalone, play-in-any-order mission sets with no campaign integration. The Enhanced Edition places them into the main campaign graph at chronologically appropriate points, as optional operations:

```
Classic Allied Campaign (linear):
  A01 → A02 → A03 → A04 → ... → A14

Enhanced Edition (branching, with expansion missions woven in):
  A01 → A02 → A03 ─┬─ A04 → A05 ─┬─ A06 → ...
                    │              │
                    └─ CS-A03      └─ AM-A02
                    (Counterstrike  (Aftermath
                     optional op,    optional op,
                     optional)       optional)
```

Some expansion missions become alternative versions of main missions (offering the enhanced IC version alongside the classic). Some become SpecOps branches or Theater Branches that the player can take or skip. A few become mandatory in the Enhanced Edition flow where they fill narrative gaps.

**Enhanced Edition optional-content taxonomy:**

- **Main Operation** — the campaign backbone. Full base building, full economy, full faction expression, decisive war outcomes.
- **SpecOps / Commando Operation** — hero-led precision mission. Used for intel theft, sabotage, tech gain or denial, faction favor, rescue, and other high-stakes interventions. Failure or skipping can worsen the campaign state.
- **Commander-Supported SpecOps** — still a SpecOps mission, but the commander can field a **limited** support footprint: a small forward base, restricted tech, support powers, artillery, or extraction cover. It is not a full macro mission.
- **Theater Branch** — optional secondary-front chain such as Siberia, Poland, Italy, Spain, or France. These justify themselves by opening a whole regional front, allied faction, or tech package. They should grant concrete assets; skipping them usually means no extra advantage, not baseline punishment.

Generic "side mission" is not a sufficient authored category by itself. Every optional node should be written either as a SpecOps / Commando operation or as a Theater Branch with a named downstream asset.

**First-party policy for SpecOps content:** Hand-authored official missions should be used once, where they fit the story best. After that, additional SpecOps content should default to **generated unique operations** rather than reusing the same authored map as a second or third branch. The authored mission is the showcase beat; the follow-up operations are generated from campaign-aware templates.

#### Generated SpecOps Missions (XCOM 2-style, Deterministic)

Campaigns should support **generated SpecOps missions** built from authored map kits, objective modules, and deterministic seeds. This is the preferred way to supply optional commando content beyond the one best-fit use of an official handcrafted mission.

For prior-art analysis and an end-to-end proof-of-concept schema, see:

- `research/generated-specops-missions-study.md`
- [Generated SpecOps Prototype](generated-specops-prototype.md)

**Design intent:**

- **Hand-authored missions** are for landmark story beats, famous set pieces, final assaults, and one-time narrative reveals
- **Generated SpecOps missions** are for repeatable or branch-variable operations: prison breaks, tech theft, radar sabotage, scientist extraction, convoy ambush, safe-house defense, counter-intelligence sweep
- The player should feel that each available SpecOps opportunity is a fresh operation in the same war theater, not the exact same map being recycled

**Authoring model:**

1. **Site kits** — authored parcel libraries for mission locations such as prison compounds, radar stations, ports, rail yards, research labs, villas, command bunkers, village safe houses
2. **Objective modules** — rescue cell block, comms terminal, reactor room, prototype crate vault, scientist office, AA control room, extraction helipad
3. **Ingress / egress modules** — sewer entry, cliff rope point, truck gate, beach landing, rooftop insertion, tunnel exit
4. **Security modules** — patrol graphs, alarm towers, dog pens, spotlight yards, reserve barracks, timed QRF spawn rooms
5. **Complication modules** — power outage, wounded VIP, weather front, ticking data purge, prisoner transfer countdown, fuel fire, moving convoy

The generator assembles a map from these authored pieces under strict validation rather than freeform noise-based terrain synthesis.

**Modder authoring contract:** Generated SpecOps is a normal modding surface, not a first-party-only feature. Modders register authored building blocks through merged YAML registries:

```yaml
generated_site_kits:
  soviet_coastal_radar_compound:
    theater: greece
    legal_families:
      - intel_raid
      - tech_denial

generated_objective_modules:
  steal_radar_codes:
    family: intel_raid
    required_sockets:
      - command_bunker

generated_complication_modules:
  data_purge_timer:
    families:
      - intel_raid
      - counter_intel
```

The builtin generator owns the base assembly pipeline. Mods extend it in three layers:

- **YAML** — register site kits, objectives, ingress/egress modules, security profiles, and complication modules
- **Lua** — filter or reweight candidate pools from campaign flags and run deterministic post-generation acceptance hooks
- **WASM (optional, Tier 3)** — replace candidate scoring or validation for total conversions through a pure deterministic generation interface; no network/filesystem capabilities and no sim-tick coupling

First-party content should be achievable with YAML + Lua. WASM is the escape hatch, not the default path.

Example hook surface:

```yaml
generated_specops_profiles:
  allied_intel_raid_t1:
    family: intel_raid
    lua_hooks:
      candidate_filter: "SpecOpsGen.filter_candidates"
      post_validate: "SpecOpsGen.post_validate"
```

```lua
function SpecOpsGen.filter_candidates(ctx, pools)
  if Campaign.get_flag("siberian_window_closed") then
    pools.site_kits["snow_signal_outpost"] = nil
  end
  return pools
end

function SpecOpsGen.post_validate(ctx, instance)
  return instance.validation_report.estimated_duration_minutes <= 15
end
```

The editor / CLI validator should execute the same hooks used by runtime generation so mod authors can test the exact authored pools they ship.

**Concrete generation pipeline:**

```yaml
generated_specops:
  operation_id: allied_specops_07
  mission_family: tech_theft
  theater: greece
  tileset: mediterranean_industrial
  site_kit: soviet_research_compound
  objective_module: prototype_vault
  ingress_module: sewer_entry
  egress_module: cliff_exfil
  complication_module: data_purge_timer
  security_tier: 3
  seed: 1844674407370955161
```

Generation order:

1. Pick **mission family** from campaign state (`intel_raid`, `tech_theft`, `tech_denial`, `rescue`, `faction_favor`, `counter_intel`)
2. Pick a **site kit** that matches the theater and story state
3. Place required **objective modules**
4. Place at least two valid **ingress paths** and one valid **exfil path**
5. Lay down **security modules** and patrol graphs
6. Add one authored **complication module**
7. Run validation:
   - hero can physically reach the main objective
   - stealth route exists if the mission advertises stealth
   - loud route exists if the mission advertises a commander-supported assault
   - evac path remains reachable after alarms trigger
   - objective spacing and detection coverage meet authored bounds
8. Persist the resulting seed + chosen modules into `CampaignState` so save/load, replay, and takeover all refer to the same generated mission

**Runtime generation failure policy:** Generated missions must never dead-end the campaign. If the candidate pool is exhausted:

- **Development / editor validation:** hard error, because the authored pool is insufficient
- **Runtime for shipped content:** use the authored fallback policy attached to the operation

Recommended fallback modes:

- `authored_backup` — switch to a known handcrafted backup mission
- `resolve_as_skipped` — consume the operation as missed and apply its skip effects

Low-stakes optional missions may use `resolve_as_skipped`. High-stakes spotlight ops should prefer `authored_backup`.

**Determinism rule:** The generated mission must be reproducible from campaign state. Same campaign seed + same operation state = same generated map. The chosen generation seed and module picks are persisted when the operation appears, not rerolled every time the player opens the briefing.

**Recommended mission grammar for generated SpecOps:**

| Mission Family | Primary Objective | Optional Objective | Common Failure State |
|---|---|---|---|
| `intel_raid` | photograph / hack / steal plans | stay undetected | enemy gains alertness, later mission loses intel route |
| `tech_theft` | recover prototype / scientist / crate | extract secondary cache | prototype destroyed or incomplete on failure |
| `tech_denial` | sabotage reactor / radar / lab / ammo dump | plant false intel | enemy asset survives if ignored or failed |
| `rescue` | free hero / VIP / prisoners | recover records / gear | captive transferred, interrogation escalates |
| `faction_favor` | save allied contact / resistance cell | secure local cache | no faction support package gained |
| `counter_intel` | find mole / seize documents / silence informants | identify second network node | enemy keeps scouting advantage |

**Map-design rules for generated SpecOps:**

1. **Readable objective triangle.** The player should be able to understand ingress → target → exfil at a glance once scouting begins.
2. **Two playstyles minimum.** Every generated SpecOps map should support a stealth-first route and a loud contingency route, even if one is clearly riskier.
3. **One dominant complication, not five.** A timer, storm, prisoner transfer, or fuel fire is enough. Generated missions should not become procedural soup.
4. **Short and sharp.** Generated SpecOps should usually land in a **10-15 minute target band**. `20 minutes` is the hard cap, not the default expectation.
5. **Theater-consistent visuals.** Greece does not generate the same compounds as Poland; Spain does not look like Siberia. Site kits are theater-bound.
6. **Rewards must stay campaign-specific.** The map is generated, but the reward and downstream consumer come from the campaign node that spawned it.

**Commander-supported generated SpecOps:** When the operation advertises commander support, generation must reserve a bounded support zone with:

- one limited landing zone or forward camp
- an explicit **support-only package**, not an open-ended build tree
- no full economy escalation
- clear relationship to the commando route (artillery cover, extraction, diversion, repair)

That keeps the generated SpecOps mission from collapsing into a normal main-operation base map.

**Canonical support-only package:** Unless a profile overrides it more tightly, commander-supported SpecOps should be bounded to:

- **Structures:** field HQ, power node, repair bay, medic tent, sensor post, artillery uplink, helipad / extraction pad
- **Support powers:** recon sweep, smoke, off-map artillery, extraction beacon, emergency repair
- **Units:** engineers, medics, transports, light APCs, and at most a few light escort vehicles
- **Explicitly disallowed:** refinery / ore economy, heavy factory, tech center, superweapons, unlimited turret creep, heavy armor production

The commander is providing support, not playing a second full macro match.

**First-party Enhanced Edition usage rule:** Use the classic official mission once where it is the strongest narrative fit. If the campaign later needs "another prison break", "another spy raid", or "another sabotage op", it should spawn a generated SpecOps node in the same mission family rather than reusing the same canonical mission again.

**2. IC-original missions showcasing platform capabilities**

New missions designed specifically to demonstrate what IC's engine can do that the original couldn't:

| IC Feature | Enhanced Edition Mission | What It Demonstrates |
|-----------|------------------------|---------------------|
| **Hero progression (D021)** | "Tanya: First Blood" — a prologue mission before A01 where Tanya earns her first skill points | Hero XP, skill tree, persistent progression across the entire campaign |
| **Embedded task force (§ Special Ops Archetypes)** | "Evidence: Enhanced" — Tanya + squad operate inside a live battle around the facility approach | Hero-in-battle gameplay: live AI-vs-AI combat around the player's special ops objectives |
| **Branching decisions** | After M10A, choose: classic interior raid, embedded task-force variant, or commander-led siege | Multiple paths with different rewards and persistent consequences |
| **Air campaign** | "Operation Skyfall" — coordinate air strikes and recon flights supporting a ground resistance attack | Air commander gameplay: sortie management, target designation, no base building |
| **Spy infiltration** | "Behind Enemy Lines" — Tanya infiltrates a Soviet facility for Iron Curtain intel | Detection/alert system, sabotage effects weakening later Soviet operations |
| **Dynamic weather (D022)** | "Protect the Chronosphere" — a storm rolls in during the defense, reducing visibility and slowing vehicles | Weather as gameplay: the battlefield changes mid-mission, not just visually |
| **Asymmetric co-op (D070, Phase 6b add-on)** | "Joint Operations" — optional co-op variant where Player 1 is Commander (base) and Player 2 is SpecOps (Tanya's squad) | The full Commander & SpecOps experience within the campaign once D070 ships |
| **Campaign menu scenes** | Each act changes the main menu background — Act 1: naval convoy, Act 2: night air patrol, Act 3: ground assault, Victory: sunrise over liberated city | Evolving title screen tied to campaign progress |
| **Unit roster carryover (D021)** | Surviving units from "Tanya: First Blood" appear in A01 as veteran reinforcements | Persistent roster: lose a unit and they're gone for the rest of the campaign |
| **Failure as branching** | If "Behind Enemy Lines" fails, Tanya is captured and the rescue branch can stay pending for a bounded window while penalties escalate; ignoring it leaves permanent consequences | No game-over screen: failure changes the next branch and mission conditions instead of forcing a reload |

**3. Decision points that create campaign variety**

At key moments, the Enhanced Edition offers the player a choice:

```yaml
# Example: after completing mission A05, the player chooses
missions:
  allied_05:
    outcomes:
      victory:
        # Enhanced Edition adds a decision point here
        decision:
          prompt: "Command has two plans for the next phase."
          choices:
            - label: "Frontal Assault (Classic)"
              description: "Attack the Soviet base directly with full armor support."
              next: allied_06                    # original mission
              badge: "Classic"
            - label: "Sewer Infiltration (Enhanced)"
              description: "Send Tanya through the sewers to sabotage the base from within before the assault."
              next: allied_05b_infiltration      # new IC mission
              badge: "IC Enhanced"
              requires_hero: tanya               # only available if Tanya is alive
            - label: "Air Strike First (Counterstrike)"
              description: "Soften the target with a bombing campaign before committing ground forces."
              next: cs_allied_04                 # Counterstrike expansion mission
              badge: "Counterstrike"
              unchosen_effects:
                set_flag:
                  air_strike_window_missed: true
```

Choices may optionally define `unchosen_effects` on individual entries. When the player picks one branch, the engine applies the `unchosen_effects` from every branch not taken. This lets authors build mutually-exclusive decision points using the same D021 `decision` primitive without inventing a new node type (though expiring open-world opportunities prefer the `mission` node's `expires_in_phases` timer).

**4. Expansion mission enhancements**

When Counterstrike/Aftermath missions are played within the Enhanced Edition, they gain IC features they didn't originally have:

- **Briefing/debrief flow** — continuous narrative instead of standalone mission select
- **Roster carryover** — units from the previous mission carry over (the originals had no persistence)
- **Weather effects** — maps gain dynamic weather appropriate to their setting (Italian missions get Mediterranean sun; Polish missions get winter conditions)
- **Veterancy** — units earn experience and carry it forward
- **Multiple outcomes** — original missions had win/lose; Enhanced Edition adds alternative victory conditions ("won with low casualties" → bonus reinforcements next mission)

**5. Ideas drawn from other successful enhanced editions**

| Source | What They Did | IC Application |
|--------|-------------|----------------|
| **XCOM: Enemy Within** | Added new resources (Meld), new soldier class (MEC), new mission types woven into the same campaign timeline. Toggleable mission chains (Operation Progeny) | IC adds new resource mechanics (hero XP), new mission types (task force, air campaign, spy infiltration) woven into RA1 timeline. Each chain is toggleable |
| **Baldur's Gate Enhanced Edition** | Added 3 new companion characters with unique quest lines that interleave with the main story. New arena mode. QoL improvements | IC adds Tanya hero progression as a "companion" quest line threading through the campaign. Highlight reel POTG after each mission |
| **StarCraft: Brood War** | "Final Fantasy type events" during missions — scripted narrative beats within gameplay. Tactical decisions over which objectives to pursue | IC's embedded task force missions do exactly this — live battle with narrative events and objective choices |
| **Warcraft III: Frozen Throne** | Each campaign had a distinct tone/gameplay style (RPG-heavy Rexxar campaign vs. base-building Scourge campaign) | Enhanced Edition missions vary: some are base-building (classic), some are hero-focused (task force), some are air-only (air campaign) |
| **C&C Remastered Collection** | Bonus gallery content — behind-the-scenes art, remastered music, developer commentary | IC Enhanced Edition could include mission designer commentary (text/audio notes the player can toggle during briefings) |
| **Halo: Reach** | Menu background and music change per campaign chapter | Campaign menu scenes: each act of the Enhanced Edition changes the main menu |
| **Fire Emblem** | Permadeath creates emotional investment in individual units; branching paths based on who survives | IC's roster carryover does this — lose Tanya early and the entire campaign arc changes. Some missions only exist if specific heroes survived |

#### Campaign Structure Overview

```
                        ┌──────────────────────────────────────────────┐
                        │  ALLIED ENHANCED EDITION CAMPAIGN GRAPH       │
                        │                                              │
  Prologue (IC)         │  [Tanya: First Blood]                       │
                        │        │                                    │
  Act 1: Coastal War    │  A01 ──┤── CS-A01 (optional Counterstrike)  │
  (Classic + Expansion) │  A02 ──┤── CS-A02 (optional)                │
                        │  A03 ──┼── IC: Dead End / SpecOps branch     │
                        │        │                                    │
  Decision Point ───────│────────┼── Choose: A04 (classic) OR         │
                        │        │   IC: Behind Enemy Lines (SpecOps)  │
                        │        │                                    │
  Act 2: Interior Push  │  A05 ──┤── AM-A01 (optional Aftermath)      │
  (Classic + Enhanced)  │  A06 ──┤── IC: Protect the Chronosphere (weather) │
                        │  A07 ──┤── IC: Operation Skyfall (theater air) │
                        │        │── CS-A03 (optional)                │
                        │        │                                    │
  Decision Point ───────│────────┼── Choose: A08 (classic) OR         │
                        │        │   IC: Evidence hybrid / siege       │
                        │        │                                    │
  Act 3: Final Push     │  A09 ──┤── AM-A02 (optional)                │
  (Classic + Add-ons)   │  A10 ──┤── IC: Joint Ops (co-op, D070, Phase 6b add-on) │
                        │  ...   │                                    │
                        │  A14 ──┤── IC: Epilogue (post-campaign)     │
                        │        │                                    │
                        └──────────────────────────────────────────────┘
```

#### Player Settings

```
Campaign Settings — Allied Campaign
  ✅ Classic Missions (14 missions — always available)
  🔲 IC Enhanced Edition
      ✅ Counterstrike Missions (woven into campaign timeline)
      ✅ Aftermath Missions (woven into campaign timeline)
      ✅ IC Original Missions (task force, air campaign, spy ops)
      ✅ Hero Progression (Tanya XP/skills across all missions)
      ✅ Decision Points (choose your path at key moments)
      ✅ Dynamic Weather
      ✅ Campaign Menu Scenes
      🔲 Co-op Missions (requires second player)
```

Each sub-feature is independently toggleable. A player can enable Counterstrike integration but disable IC original missions. The campaign graph adjusts — disabled branches are hidden, and the graph reconnects through the classic path.

#### Campaign World Screen as Strategic Layer

For first-party narrative campaigns, the campaign map / intermission screen should do more than list the next mission. It should act as the **strategic layer** of the campaign: the place where the player understands what fronts are active, what operations are available, what is urgent, and what assets the war has already produced.

This is a first-class D021 mode, not just UI dressing. The mission graph still owns legal progression, but the War Table owns the campaign-facing presentation of:

- current phase
- requisition and intel
- command authority
- active operations
- enemy initiatives
- tech / arms-race ledger

The model is closer to the **XCOM globe** than to a flat mission picker:

- **Main operations** anchor the campaign backbone
- **SpecOps operations** appear as urgent, high-leverage interventions
- **Theater branches** appear as secondary fronts with long-arc value
- **Enemy projects** and **captured-hero crises** remain visible between missions until resolved or expired
- **Campaign assets** (intel, prototypes, resistance favor, air packages, denied enemy tech) remain visible so the player can reason about future choices

This strategic layer can be presented in multiple authoring styles:

1. **Node-and-edge graph** — the default for community campaigns and compact narrative campaigns
2. **Authored world screen / front map** — the preferred presentation for first-party Enhanced Edition campaigns, where fronts such as Greece, Siberia, Poland, Italy, Spain, or England are shown as active theaters
3. **Full territory simulation** — D016-style world-domination campaigns that persist explicit region ownership and garrisons

Regardless of presentation style, an available operation should surface the same information:

- **Role tag**: `MAIN`, `SPECOPS`, `THEATER`, or another authored role
- **Criticality**: recoverable, critical, rescue, or timed
- **Urgency**: normal, expiring, critical, rescue, enemy project nearing completion
- **Reward preview**: the concrete asset gained on success
- **Operation reveal / unlock preview**: any mission cards that appear or become selectable because of this operation
- **If ignored / if failed**: the concrete state change if the player does not act
- **Downstream consumer**: which next mission, act, or final assault will use that asset

**Example operation cards:**

```yaml
campaign_world_screen:
  fronts:
    - id: greece
      status: "Sarin sites active"
      urgency: critical
    - id: siberia
      status: "Window open for second front"
      urgency: expiring

  operations:
    - mission: ic_behind_enemy_lines
      role: specops
      criticality: recoverable
      reward_preview: "M6 access codes; better Iron Curtain intel"
      reveal_preview: "Reveals Spy Network if the raid succeeds cleanly"
      effect_detail: "Reveal the east service entrance in M6 and delay the first alarm by 90 seconds"
      failure_consequence: "Tanya captured or M6 infiltration runs blind"
      if_ignored: "M6 runs blind; the spy-network follow-up closes"
      if_ignored_detail: "Tanya stays safe, but the Soviet site hardens before Act 2"
      time_window: "Expires in 2 operation phases"
      reveals_operations:
        - ic_spy_network
      consumed_by:
        - allied_06
        - ic_spy_network
    - mission: cs_sarin_gas_1
      role: specops
      criticality: timed
      reward_preview: "Chemical attacks denied in M8"
      effect_detail: "No gas shelling or chemical infantry waves during the Chronosphere defense"
      failure_consequence: "Facility not neutralized in time; M8 uses chemical attacks"
      if_ignored: "Sarin active in Chronosphere defense"
      if_ignored_detail: "M8 gains two gas-shell barrages and one contaminated approach lane"
      time_window: "Expires in 2 operation phases"
      consumed_by:
        - allied_08
    - mission: am_poland_1
      role: theater
      criticality: recoverable
      reward_preview: "Super Tanks + partisan chain"
      reveal_preview: "Reveals Poland follow-up operations if the first liberation succeeds"
      effect_detail: "Unlock 2 Super Tanks for Act 3 and the Poland resistance follow-up chain"
      failure_consequence: "No Poland chain rewards, but campaign continues normally"
      if_ignored: "Poland branch closes"
      if_ignored_detail: "No Super Tanks, no partisan reinforcements, no Poland follow-up nodes"
      reveals_operations:
        - am_poland_2
        - am_poland_3
      consumed_by:
        - allied_12
        - allied_14
```

The player should be able to answer, from the world screen alone: **What is happening? What can I do? What do I gain? What do I lose by waiting?**

`reward_preview` and `if_ignored` are the short card headlines. First-party authored campaigns should also provide an exact-effect sentence (`effect_detail` / `if_ignored_detail`) so the player sees the real mechanical consequence, not just a slogan.

For **SpecOps**, the operation card / mission briefing should show four fields together whenever possible:

1. **Success reward** — what concrete asset you gain
2. **Failure consequence** — what happens if you attempt it and fail
3. **Skip / ignore consequence** — what happens if you do not take it at all
4. **Time window / urgency** — whether it must be taken now, can be delayed, or can remain open indefinitely
5. **Operation reveal / unlock** — whether success exposes a new SpecOps card, Theater Branch, or commander operation on the strategic map

#### Optional Operations — Concrete Assets, Not Abstract Bonuses

Optional content must feed back into the main campaign in tangible, visible ways. If an optional operation does not produce a concrete downstream asset, denial, or rescue state, it feels disconnected and should be cut.

In practice, first-party Enhanced Edition content should default to:

- **SpecOps / Commando Operations** for intel, tech capture, tech denial, faction favor, rescue, counter-intelligence, and commander-supported infiltration
- **Theater Branches** only when the branch represents a whole secondary front or campaign-scale support package

Every optional operation should answer five concrete questions:

1. **What class is it?** `specops`, `commander_supported_specops`, or `theater_branch`
2. **What asset or state does it produce?** Intel, tech unlock, enemy tech denial, faction favor, route access, roster unit, support package, rescue state
3. **What exact effect does that asset have?** Not "better position" but "reveal 25% of map", "unlock 2 Super Tanks", "delay reinforcements by 180s", "open Poland chain"
4. **Which later missions consume that asset?** Name the next mission(s), act, or branch
5. **What happens if skipped or failed?** SpecOps can create negative state; Theater Branches normally only withhold upside
6. **Is it time-critical or critical to campaign survival?** The player must know whether they can postpone it safely, and whether failure is recoverable
7. **Does it reveal or unlock a follow-up operation?** If yes, the world screen should tell the player what new commander or SpecOps card appears

**Concrete operation-output categories:**

- **Intel Ops** — reveal routes, access codes, shroud, patrol schedules, composition, branch availability
- **Operation-Reveal Ops** — expose hidden sites, convoys, labs, safe houses, assault windows, or regional follow-up branches that become new selectable mission cards
- **Tech Ops** — unlock prototypes, support powers, expansion-pack units, or equipment pools
- **Denial Ops** — prevent enemy deployment, delay superweapons, disable defenses, close enemy branches
- **Faction Favor Ops** — gain resistance cells, defectors, scientists, naval contacts, partisans, or local guides
- **Rescue / Recovery Ops** — retrieve captured heroes, reduce compromise level, recover stolen prototypes, save wounded rosters

**Reward design principles:**

1. **Specific, not generic.** "Enemy has no air support next mission" is meaningful. "Better position" is too vague.
2. **Visible consequence.** The next main mission briefing should reference the operation: *"Thanks to your sabotage, Soviet air defenses are offline."*
3. **SpecOps can create negative state; Theater Branches usually should not.** A failed rescue or sabotage can hurt. Skipping Poland or Italy should usually just deny the extra asset.
4. **Cumulative assets.** Spy network + radar sabotage = full battlefield intel. Resistance favor + harbor secured = naval insertion route plus reinforcements.
5. **Exclusive content.** Some branches, units, and final approaches should exist only if specific operations were completed.
6. **Quantify anything that changes difficulty.** Prefer "first reinforcement wave delayed 180 seconds," "2 Super Tanks added to M14," or "40% of the map revealed at mission start" over "better intel" or "harder defense."
7. **Differentiate attempt-failure from expiration.** A failed SpecOps raid and an ignored operation that expired are not always the same state; the authored card and briefing should say which consequence belongs to which.
8. **Let SpecOps reveal commander work.** An intel raid, sabotage, or defector extraction can reveal a new commander operation card such as an interception, assault window, convoy ambush, or theater branch.

#### Commander Alternatives Must Quantify Their Trade-Offs

When a commando-heavy mission offers a commander-compatible path, the choice must describe the **exact downstream difference** between the precise approach and the loud one. "Less intel" or "cruder result" is not enough.

```yaml
mission_variants:
  allied_06_iron_curtain:
    operative:
      reward_preview: "Steal access codes and shipping manifests"
      effect_detail: "M7 reveals 25% of the harbor and delays the first submarine wave by 120 seconds"
    commander:
      reward_preview: "Destroy the Tech Center by assault"
      effect_detail: "M7 loses the harbor reveal and delayed sub wave, but one shore battery starts already destroyed"
```

Good commander-alternative descriptions answer four things:

1. **What story result is preserved?** Rescue, assassination, capture, sabotage, or destruction still happens.
2. **What exact asset is weaker or missing?** Fewer access codes, no safe tunnel, one missed scientist, no patrol route, shorter setup time.
3. **What exact military upside does the commander path get instead, if any?** A destroyed battery, rescued hero, intact bridgehead, or pre-cleared escort lane.
4. **Which later mission consumes that trade-off?** Name the consumer mission and the exact effect there.

**Reward categories:**

```yaml
# Optional operation outcome → main campaign effect
# All implemented via existing D021 state_effects + flags + Lua

# ── SpecOps / direct tactical advantage ────────────────────────────
optional_operation_rewards:
  destroy_radar_station:
    flags:
      soviet_radar_destroyed: true
    main_mission_effect: "Next mission: no enemy air strikes (MiGs grounded)"
    briefing_line: "Thanks to your raid on the radar station, Soviet air command is blind."

  sabotage_ammo_dump:
    flags:
      ammo_supply_disrupted: true
    main_mission_effect: "Next mission: enemy units start at Rookie veterancy (supplies lost)"
    briefing_line: "Without ammunition reserves, their veterans are fighting with scraps."

  destroy_power_grid:
    flags:
      power_grid_down: true
    main_mission_effect: "Next mission: enemy Tesla Coils and SAM sites are offline for 3 minutes"
    briefing_line: "The power grid is still down. Their base defenses are dark — move fast."

# ── Theater branch / roster additions ──────────────────────────────
  rescue_engineer:
    roster_add:
      - engineer
    main_mission_effect: "Engineer joins your roster permanently — can repair and capture"
    briefing_line: "The engineer you rescued has volunteered to join your task force."

  capture_prototype_tank:
    roster_add:
      - mammoth_tank_prototype
      - mammoth_tank_prototype
    main_mission_effect: "2 prototype Mammoth Tanks available for the final assault"
    briefing_line: "Soviet R&D won't be needing these anymore."

  liberate_resistance_fighters:
    roster_add:
      - resistance_squad
      - resistance_squad
      - resistance_squad
    main_mission_effect: "3 Resistance squads join as reinforcements in Act 3"

# ── Intel, favor, and denial assets ────────────────────────────────
  establish_spy_network:
    flags:
      spy_network_active: true
    main_mission_effect: "Future missions: start with partial shroud revealed (intel from spy network)"
    briefing_line: "Our agents have mapped their positions. You'll know where they are."

  intercept_communications:
    flags:
      comms_intercepted: true
    main_mission_effect: "Enemy AI coordination disrupted — units respond slower to threats"

  gain_partisan_favor:
    flags:
      polish_resistance_favor: true
    main_mission_effect: "Polish partisans sabotage one reinforcement rail line and send 3 infantry squads in M14"
    briefing_line: "The resistance has committed to the final push. Their rail sabotage buys us time."

  deny_super_tank_program:
    flags:
      soviet_super_tank_denied: true
    main_mission_effect: "Enemy cannot field Super Tanks in the final act"
    briefing_line: "The prototype line is in ruins. Moscow will not be deploying Super Tanks."

  unlock_aftermath_prototype:
    flags:
      chrono_tank_salvaged: true
    main_mission_effect: "Chrono Tank prototype added to equipment pool for Act 3"
    briefing_line: "Our engineers restored one functional Chrono Tank from the Italian salvage yard."

# ── Compound bonuses (multiple successful operations stack) ────────
  # If both spy network AND radar destroyed:
  compound_full_intel:
    requires:
      spy_network_active: true
      soviet_radar_destroyed: true
    main_mission_effect: "Full battlefield intel — all enemy units visible at mission start"
    briefing_line: "Between our spies and the radar blackout, we see everything. They see nothing."

# ── Exclusive content unlocks ──────────────────────────────────────
  all_act1_specops_complete:
    requires:
      act1_specops_complete: 3  # completed 3+ SpecOps operations in Act 1
    unlocks_mission: allied_06b_secret_path       # a mission that only exists for thorough players
    briefing_line: "Command is impressed. They're authorizing a classified operation."

  tanya_max_level:
    requires_hero:
      tanya:
        level_gte: 4
    unlocks_mission: tanya_solo_finale            # Tanya-only final mission variant
    briefing_line: "Tanya, you've proven you can handle this alone."
```

**Lua implementation (reads flags set by optional operations):**

```lua
-- Main mission setup: check what optional operations the player completed
Events.on("mission_start", function()
  -- Direct tactical advantage
  if Campaign.get_flag("soviet_radar_destroyed") then
    Ai.modify("soviet_ai", { disable_ability = "air_strike" })
  end

  if Campaign.get_flag("ammo_supply_disrupted") then
    Ai.modify("soviet_ai", { max_veterancy = "rookie" })
  end

  if Campaign.get_flag("power_grid_down") then
    Trigger.schedule(0, function()
      Trigger.disable_structures_by_type("tesla_coil", { duration_ticks = 3600 })
      Trigger.disable_structures_by_type("sam_site", { duration_ticks = 3600 })
    end)
  end

  -- Intelligence advantage
  if Campaign.get_flag("spy_network_active") then
    Player.reveal_shroud_percentage(0.4)  -- reveal 40% of the map
  end

  -- Compound bonus: full intel
  if Campaign.get_flag("spy_network_active") and Campaign.get_flag("soviet_radar_destroyed") then
    Player.reveal_all_enemies()  -- show all enemy units at mission start
    UI.show_notification("Full battlefield intel active. All enemy positions known.")
  end

  -- Roster additions from optional operations appear as reinforcements
  local rescued = Campaign.get_roster_by_flag("rescued_in_optional_operation")
  if #rescued > 0 then
    Trigger.spawn_reinforcements_from_roster(rescued, "allied_reinforcement_zone")
    UI.show_notification(#rescued .. " units from your previous operations have joined the fight.")
  end
end)
```

**How the briefing acknowledges optional operation results:**

```yaml
# Main mission briefing with conditional lines
mission:
  id: allied_06
  briefing:
    base_text: "Commander, the assault on the Soviet forward base begins at dawn."
    conditional_lines:
      - flag: soviet_radar_destroyed
        text: "Good news — the radar station you destroyed last week has left their air command blind. No MiG support expected."
      - flag: ammo_supply_disrupted
        text: "Intelligence reports the ammo dump sabotage has taken effect. Enemy units are under-supplied."
      - flag: spy_network_active
        text: "Our spy network has provided detailed positions of their defenses. You'll have partial intel."
      - flag_absent: soviet_radar_destroyed
        text: "Be warned — Soviet air support is fully operational. Expect MiG patrols."
      - compound:
          spy_network_active: true
          soviet_radar_destroyed: true
        text: "Between our spies and the radar blackout, we have full battlefield awareness. Press the advantage."
```

The briefing dynamically assembles based on which optional operations the player completed. A player who did everything hears good news. A player who skipped everything hears warnings. The same mission, different context — the world reacts to what you did (or didn't do).

#### Failure as Consequence, Not Game Over (Spectrum Outcomes)

Classic C&C missions have two outcomes: win or lose. Lose means retry. The Enhanced Edition uses **spectrum outcomes** — the same mission can have 3-4 named results, each leading to a different next mission with different consequences. Failure doesn't end the campaign; it makes the campaign harder and different.

**Planned example — "Destroy the Bridges" (Tanya mission):**

This is the **simple direct-branch pattern**: capture routes immediately into a rescue mission or harder follow-up. Campaigns that want "rescue now, later, or never" escalation across later nodes should use the bounded pending-branch extension described above, not overload this simpler pattern.

```yaml
mission:
  id: enhanced_bridge_assault
  type: embedded_task_force
  hero: tanya
  description: "Tanya must destroy three bridges to cut off Soviet reinforcements before the main assault."

  outcomes:
    # Best case: all bridges destroyed
    total_success:
      condition: "bridges_destroyed == 3"
      next: allied_08a_easy
      state_effects:
        set_flag:
          bridges_destroyed: 3
          reinforcement_route: severed
      briefing_next: "All three bridges are down. The Soviets are completely cut off. This will be a clean sweep."

    # Partial success: some bridges destroyed
    partial_success:
      condition: "bridges_destroyed >= 1 AND bridges_destroyed < 3"
      next: allied_08a_medium
      state_effects:
        set_flag:
          bridges_destroyed: $bridges_destroyed
          reinforcement_route: reduced
      briefing_next: "We got some of the bridges, but enemy reinforcements are still trickling through. Expect heavier resistance."

    # Failed but Tanya escaped
    failed_escaped:
      condition: "bridges_destroyed == 0 AND hero_alive(tanya)"
      next: allied_08b_hard
      state_effects:
        set_flag:
          bridges_intact: true
          reinforcement_route: full
          tanya_reputation: setback
      briefing_next: "The bridges are intact. The full Soviet armored division is rolling across. Commander, prepare for a hard fight."

    # Failed and Tanya captured
    tanya_captured:
      condition: "bridges_destroyed == 0 AND NOT hero_alive(tanya)"
      next: allied_08c_rescue
      state_effects:
        set_flag:
          bridges_intact: true
          tanya_captured: true
        hero_status:
          tanya: captured
      briefing_next: "We've lost contact with Tanya. Intel suggests she's been taken to the Soviet detention facility. New priority: rescue operation."

    # Failed but Tanya killed (hero death_policy: wounded)
    tanya_wounded:
      condition: "hero_wounded(tanya)"
      next: allied_08b_hard
      state_effects:
        set_flag:
          bridges_intact: true
          tanya_wounded: true
        hero_status:
          tanya: wounded   # Tanya unavailable for 2 missions (recovery)
      briefing_next: "Tanya is wounded and being evacuated. She'll be out of action for a while. We proceed without her."
```

**How the next main mission reacts (Lua):**

```lua
-- allied_08 setup: adapts based on bridge mission outcome
Events.on("mission_start", function()
  local bridges = Campaign.get_flag("bridges_destroyed") or 0

  if bridges == 3 then
    -- Easy variant: enemy has no reinforcements
    Ai.modify("soviet_ai", { disable_reinforcements = true })
    Ai.modify("soviet_ai", { starting_units_multiplier = 0.5 })
  elseif bridges >= 1 then
    -- Medium: reduced reinforcements
    Ai.modify("soviet_ai", { reinforcement_delay_ticks = 3600 })  -- delayed by 3 min
    Ai.modify("soviet_ai", { starting_units_multiplier = 0.75 })
  else
    -- Hard: full enemy force, bridges intact
    Ai.modify("soviet_ai", { reinforcement_interval_ticks = 1200 })  -- every 60 seconds
    Ai.modify("soviet_ai", { starting_units_multiplier = 1.0 })
  end

  -- Tanya unavailable if captured or wounded
  if Campaign.get_flag("tanya_captured") then
    -- This mission becomes harder without Tanya
    UI.show_notification("Tanya is being held at the detention facility. You're on your own.")
  elseif Campaign.get_flag("tanya_wounded") then
    UI.show_notification("Tanya is recovering from her injuries. She'll rejoin in two missions.")
  end
end)
```

**The spectrum:** The player never sees a "Mission Failed" screen. Every outcome — total success, partial success, failure with escape, capture, wounding — leads to a *different* next mission or a *different version* of the same mission. The campaign continues, but the player's performance shapes what comes next. A player who destroyed all three bridges gets a victory lap. A player who got Tanya captured gets a rescue mission they wouldn't have otherwise seen. Both paths are content. Both are valid. Neither is "wrong." In more advanced campaign designs, that capture branch can instead become a bounded pending rescue opportunity with escalating penalties.

This pattern applies to any Enhanced Edition mission — not just the bridge example. Every mission should have at least 2-3 meaningfully different outcomes that branch the campaign or modify the next mission's conditions.

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
| `none`      | Clean slate — the next mission provides its own units                                 |
| `surviving` | All player units alive at mission end join the roster                                   |
| `extracted` | Only units inside a designated extraction zone carry over (OFP-style "get to the evac") |
| `selected`  | Lua script explicitly picks which units carry over                                      |
| `custom`    | Full Lua control — script reads unit list, decides what persists                      |

**Veterancy across missions:**
- Units gain experience from kills and surviving missions
- A veteran tank from mission 1 is still veteran in mission 5
- Losing a veteran unit hurts — they're irreplaceable until you earn new ones
- **Veterancy Dilution:** If a campaign allows *replenishing* depleted veteran vehicle squads or infantry platoons between missions using Requisition, the influx of green recruits proportionally dilutes the unit's overall veterancy level. Pure preservation is rewarded; brute-force replacement degrades elite status.
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
    pub active_mission: Option<MissionId>, // mission currently being briefed / played / debriefed; None while resting on the War Table
    pub current_focus: CampaignFocusState,
    pub completed_missions: Vec<CompletedMission>,
    pub unit_roster: Vec<RosterUnit>,
    pub equipment_pool: Vec<EquipmentId>,
    pub hero_profiles: HashMap<String, HeroProfileState>, // optional built-in hero progression state (keyed by character_id)
    pub resources: i64,               // persistent credits (if enabled)
    pub flags: HashMap<String, Value>, // story flags set by Lua
    pub stats: CampaignStats,         // cumulative performance
    pub path_taken: Vec<MissionId>,   // breadcrumb trail for replay/debrief
    pub strategic_layer: Option<StrategicLayerState>, // first-class War Table state for campaigns that use phases / operations / initiatives
    pub world_map: Option<WorldMapState>, // explicit strategic front / territory presentation state when a campaign persists one
}

#[derive(Serialize, Deserialize, Clone)]
pub enum CampaignFocusState {
    StrategicLayer,
    Intermission,
    Briefing,
    Mission,
    Debrief,
}

/// Accepted D021 extension for phase-based campaigns.
/// Graph-only campaigns leave this `None`.
#[derive(Serialize, Deserialize, Clone)]
pub struct StrategicLayerState {
    pub current_phase: Option<CampaignPhaseState>,
    pub completed_phases: Vec<String>,
    pub war_momentum: i32,                    // signed campaign pressure / advantage meter
    pub doomsday_clock: Option<u16>,          // minutes to midnight (optional urgency mechanic)
    pub command_authority: u8,                // 0-100 gauge gating operation slots
    pub requisition: u32,                     // War funds for operations/base upgrades
    pub intel: u32,                           // Information currency for reveals/bonuses
    pub operations: Vec<CampaignOperationState>,
    pub active_enemy_initiatives: Vec<EnemyInitiativeState>,
    pub asset_ledger: CampaignAssetLedgerState,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignPhaseState {
    pub phase_id: String,
    pub main_mission_urgent: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignOperationState {
    pub mission_id: MissionId,
    pub source: OperationSource,
    pub status: OperationStatus,
    pub expires_after_phase: Option<String>,
    pub generated_instance: Option<GeneratedOperationState>,
    pub generation_fallback: Option<GenerationFallbackMode>,
}

pub enum OperationSource { Authored, Generated }

pub enum OperationStatus {
    Revealed,
    Available,
    Completed,
    Failed,
    Skipped,
    Expired,
}

/// Persisted payload for generated operations so save/load, replay, and
/// takeover all point at the exact same authored assembly result.
#[derive(Serialize, Deserialize, Clone)]
pub struct GeneratedOperationState {
    pub profile_id: String,
    pub seed: u64,
    pub site_kit: String,
    pub security_tier: u8,
    pub resolved_modules: Vec<ResolvedModulePick>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ResolvedModulePick {
    pub slot: String,      // objective / ingress / egress / complication / extra authored socket
    pub module_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum GenerationFallbackMode {
    AuthoredBackup { mission_id: MissionId },
    ResolveAsSkipped,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EnemyInitiativeState {
    pub initiative_id: String,
    pub status: EnemyInitiativeStatus,
    pub ticks_remaining: u32,
    pub counter_operation: Option<MissionId>,
}

pub enum EnemyInitiativeStatus {
    Revealed,
    Countered,
    Activated,
    Expired,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct CampaignAssetLedgerState {
    pub entries: Vec<CampaignAssetLedgerEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CampaignAssetLedgerEntry {
    pub asset_id: String,
    pub owner: AssetOwner,
    pub state: AssetState,
    pub quantity: u32,
    pub quality: Option<String>,      // e.g. full / damaged / unstable / reduced_range
    pub unlocked_in_phase: Option<String>,
    pub consumed_by: Vec<MissionId>,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum AssetOwner {
    Player,
    Enemy,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum AssetState {
    Acquired,
    Partial,
    Denied,
}

/// Explicit strategic front / territory state for campaigns that persist one.
/// This is presentation / territory state, not a replacement for
/// `StrategicLayerState`.
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
    pub used_campaign_defaults: bool,     // true if player kept the campaign's default_settings
    pub settings_fingerprint: [u8; 32],  // SHA-256 of resolved settings (for exact comparison grouping)
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

`CampaignState.flags` remains the general authoring escape hatch for narrative and mission-specific state. Campaigns that adopt the War Table should not hide canonical focus, phase, generated-operation, initiative, or asset-ledger data inside arbitrary flag keys. Those live in structured campaign state so save/load, UI, validation, and replay metadata can reason about them directly.

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
        - level: 1
          total_xp: 0
          skill_points: 0
        - level: 2
          total_xp: 120
          skill_points: 1
        - level: 3
          total_xp: 300
          skill_points: 1
        - level: 4
          total_xp: 600
          skill_points: 1
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
            requires:
              - dual_pistols_drill
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
            requires:
              - silent_step
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
            requires:
              - satchel_charge_mk2
              - raid_momentum
            display_name: "Chain Detonation"
            description: "Destroyed explosive objectives can trigger nearby explosives"
            unlock_effects:
              grants_ability: chain_detonation

    heroes:
      - character_id: tanya
        skill_tree: tanya_commando
        start_level: 1
        start_skills:
          - dual_pistols_drill
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
              grant_skill_choice_from:
                - silent_step
                - satchel_charge_mk2
            - id: requisition_cache
              label: "Requisition Cache"
              grant_items:
                - id: remote_detonator_pack
                  qty: 1
                - id: intel_keycard
                  qty: 1
```

**Why this fits the design:** The engine core stays game-agnostic (hero progression is campaign/game-module content, not an engine-core assumption), and the feature composes cleanly with D021 branches, D038 intermissions, and D065 tutorial/onboarding flows.

### Special Operations Mission Archetypes (Hero-in-Battle)

The hero toolkit above handles hero progression (XP, skills, loadouts). This section defines **mission design patterns** where the hero operates inside a live, dynamic battle — not on a separate scripted commando map.

The key difference from classic C&C commando missions: in traditional commando missions, Tanya infiltrates a static, scripted map alone. In these archetypes, the player controls a hero + squad **embedded inside an ongoing AI-vs-AI battle**. The larger battle is dynamic, affects the player, and the player affects it. Think Dota's hero-in-a-war model applied to RTS campaigns.

#### Archetype: Embedded Task Force

The player controls a hero (Tanya) + a small squad (5-15 units) inside a **live battle between AI factions**. Tanks, aircraft, and infantry fight around the player. The player's objectives are special-ops tasks (sabotage, rescue, assassination) that take place within and alongside the larger engagement.

```yaml
mission:
  id: allied_07_bridge_assault
  type: embedded_task_force

  # The live battle — two AI factions fight each other on the same map
  battle_context:
    allied_ai:
      faction: allies
      preset: aggressive          # AI preset (D043)
      relationship_to_player: allied   # same team as player's squad
      base: true                  # has a base, produces units
      objective: "Push across the river and establish a beachhead"
    soviet_ai:
      faction: soviet
      preset: defensive
      relationship_to_player: enemy
      base: true
      objective: "Hold the river crossing at all costs"

  # The player's task force — hero + squad, embedded in the battle
  player:
    hero: tanya                   # hero character (D021 hero toolkit)
    squad_roster: extracted       # squad comes from campaign roster (D021 carryover)
    max_squad_size: 12
    starting_position: behind_allied_lines
    can_build: false              # player has no base — task force only
    can_call_reinforcements: true # request reinforcements from allied AI (see below)

  # Special-ops objectives — the player's job within the battle
  objectives:
    primary:
      - id: destroy_bridge_charges
        description: "Reach the bridge and disarm Soviet demolition charges before they detonate"
        location: river_bridge
        time_limit_ticks: 6000    # 5 minutes — the Soviets will blow the bridge
    secondary:
      - id: rescue_engineer
        description: "Free the captured Allied engineer from the Soviet camp"
        location: soviet_prison_camp
        reward:
          roster_add: engineer     # engineer joins your squad for future missions
      - id: destroy_radar
        description: "Take out the Soviet radar to blind their air defenses"
        reward:
          battle_effect: allied_air_support_unlocked   # changes the live battle

  # How the player interacts with the larger battle
  reinforcement_system:
    enabled: true
    request_cooldown_ticks: 1200  # can request every 60 seconds
    options:
      - type: infantry_squad
        description: "Request a rifle squad from the Allied front line"
        cost: none                # free but cooldown-limited
      - type: apc_extraction
        description: "Call an APC to extract wounded squad members"
        cost: none
      - type: artillery_strike
        description: "Request a 10-second artillery barrage on a target area"
        cost: secondary_objective  # unlocked by completing 'destroy_radar'
        requires_flag: allied_air_support_unlocked

  # How the player's actions affect the larger battle
  battle_effects:
    - trigger: objective_complete("destroy_bridge_charges")
      effect: "Allied AI gains a crossing point — sends armor across the bridge"
    - trigger: objective_complete("destroy_radar")
      effect: "Soviet AI loses radar — no longer calls in air strikes"
    - trigger: hero_dies("tanya")
      effect: "Allied AI morale drops — retreats to defensive positions"
    - trigger: squad_losses_exceed(75%)
      effect: "Allied AI sends reinforcements to player's position"

  outcomes:
    victory_bridge_saved:
      condition: "bridge_charges_disarmed AND bridge_intact"
      next: allied_08a
      state_effects:
        set_flag:
          bridge_status: intact
          tanya_reputation: hero
    victory_bridge_lost:
      condition: "bridge_charges_not_disarmed OR bridge_destroyed"
      next: allied_08b
      state_effects:
        set_flag:
          bridge_status: destroyed
          tanya_reputation: survivor
    defeat:
      condition: "hero_dead AND no_reinforcements"
      next: allied_07_fallback
```

**Lua mission script for the live battle interaction:**

```lua
-- allied_07_bridge_assault.lua

Events.on("mission_start", function()
  -- Start the AI battle — both sides begin fighting immediately
  Ai.activate("allied_ai")
  Ai.activate("soviet_ai")

  -- Player's squad spawns behind allied lines
  local squad = Campaign.get_roster()
  local tanya = Campaign.hero_get("tanya")
  Trigger.spawn_roster_at("player_spawn_zone", squad)

  -- The bridge has a 5-minute timer
  Trigger.start_timer("bridge_demolition", 6000, function()
    if not Var.get("bridge_charges_disarmed") then
      Trigger.destroy_bridge("river_bridge")
      UI.show_notification("The Soviets have destroyed the bridge!")
    end
  end)
end)

-- Player completes a secondary objective → changes the live battle
Events.on("objective_complete", function(ctx)
  if ctx.id == "destroy_radar" then
    -- Soviet AI loses air support capability
    Ai.modify("soviet_ai", { disable_ability = "air_strike" })
    -- Allied AI gains air support
    Ai.modify("allied_ai", { enable_ability = "air_support" })
    Campaign.set_flag("allied_air_support_unlocked", true)
    UI.show_timeline_effect("Soviet radar destroyed. Allied air support now available!")
  end
end)

-- Player is in trouble → allied AI reacts
Events.on("squad_losses", function(ctx)
  if ctx.losses_percent > 50 then
    -- Allied AI sends a relief force to the player's position
    Ai.send_reinforcements("allied_ai", {
      to = Player.get_hero_position(),
      units = { "rifle_squad", "medic" },
      priority = "urgent"
    })
    UI.show_notification("Command: 'Hold tight, reinforcements inbound!'")
  end
end)

-- Player calls for reinforcements manually (via request wheel / D059 beacons)
Events.on("reinforcement_request", function(ctx)
  if ctx.type == "artillery_strike" then
    if Campaign.get_flag("allied_air_support_unlocked") then
      Trigger.artillery_barrage(ctx.target_position, {
        duration_ticks = 200,
        radius = 5,
        damage = 500
      })
    else
      UI.show_notification("Command: 'Negative — enemy radar still active. Take it out first.'")
    end
  end
end)

-- Hero death affects the larger battle
Events.on("hero_killed", function(ctx)
  if ctx.character_id == "tanya" then
    Ai.modify("allied_ai", { morale = "low", posture = "defensive" })
    UI.show_notification("Allied forces fall back after losing their commando.")
  end
end)
```

#### Archetype: Air Campaign (Ground Support)

The player commands air assets and coordinates with ground forces (AI-controlled allied army + local resistance). The player doesn't build — they manage sortie assignments, target designation, and extraction timing.

```yaml
mission:
  id: allied_12_air_superiority
  type: air_campaign

  player:
    role: air_commander
    assets:
      - type: attack_helicopter
        count: 4
      - type: spy_plane
        count: 1
      - type: transport_chinook
        count: 2
    can_build: false
    resupply_point: allied_airfield    # units return here to rearm/repair

  # Ground forces the player coordinates with but doesn't directly control
  ground_allies:
    - id: resistance_cells
      faction: allies
      ai_preset: guerrilla            # hit-and-run, avoids direct engagement
      controllable: false             # player can't give them direct orders
      requestable: true               # player can designate targets for them
    - id: allied_armor
      faction: allies
      ai_preset: cautious
      controllable: false
      requestable: true               # player can call in armor support to a location

  # Spy mechanics — player uses spy plane for recon
  recon:
    spy_plane_reveals: 30             # cells revealed per flyover
    intel_persists: true              # revealed areas stay revealed (shroud removal)
    mark_targets: true                # player can mark spotted targets for ground forces

  objectives:
    primary:
      - id: destroy_sam_sites
        description: "Neutralize all 4 SAM sites to secure air corridors"
      - id: extract_spy
        description: "Land transport at extraction point, load the spy, return to airfield"
    secondary:
      - id: support_resistance_raid
        description: "Provide air cover for the resistance attack on the supply depot"
```

```lua
-- Air campaign Lua — player designates targets for AI ground forces

-- Player marks a target with spy plane recon
Events.on("target_designated", function(ctx)
  -- Resistance cells receive the target and plan an attack
  Ai.assign_target("resistance_cells", ctx.target_position, {
    attack_type = "raid",
    wait_for_air_cover = true  -- they won't attack until player provides air support
  })
  UI.show_notification("Resistance: 'Target received. Awaiting your air cover.'")
end)

-- Player provides air cover → resistance attacks
Events.on("air_units_in_area", function(ctx)
  if ctx.area == Ai.get_pending_target("resistance_cells") then
    Ai.execute_attack("resistance_cells")
    UI.show_notification("Resistance: 'Air cover confirmed. Moving in!'")
  end
end)
```

#### Archetype: Spy Infiltration (Behind Enemy Lines)

The player controls a spy + small cell operating behind enemy lines. The larger battle happens on the "front" — the player operates in the enemy rear. The player's sabotage actions weaken the enemy's front-line forces.

```yaml
mission:
  id: soviet_05_behind_the_lines
  type: spy_infiltration

  player:
    hero: spy
    squad:
      - spy
      - saboteur
      - sniper
    can_build: false
    detection_system:
      enabled: true
      alert_levels:
        - undetected
        - suspicious
        - alerted
        - hunted
      # Player actions affect alert level:
      # - killing guards quietly: no change
      # - explosions: +1 level
      # - spotted by patrol: +1 level
      # - destroying radar: resets to 'undetected'

  # The front-line battle (player can see its effects but operates separately)
  front_line:
    soviet_ai:
      faction: soviet
      objective: "Hold the front line against Allied assault"
    allied_ai:
      faction: allies
      objective: "Break through Soviet defenses"
    # Player's sabotage actions weaken the Soviet front:
    sabotage_effects:
      - action: "destroy_ammo_dump"
        front_effect: "Soviet AI loses artillery support for 3 minutes"
      - action: "cut_supply_line"
        front_effect: "Soviet AI unit production slowed by 50% for 2 minutes"
      - action: "hack_comms"
        front_effect: "Soviet AI coordination disrupted — units fight independently"

  outcomes:
    victory_front_collapses:
      condition: "3+ sabotage_effects_active AND allied_ai_breaks_through"
      description: "Your sabotage broke the Soviet lines. The Allies pour through."
    victory_extraction:
      condition: "all_primary_objectives_complete AND squad_extracted"
      description: "Mission complete. The intel will change the course of the war."
```

#### How These Archetypes Use Existing Systems

| System | Role in Hero-in-Battle Missions |
|--------|---------------------------------|
| **D021 Campaign Graph** | Missions are nodes in the branching graph. Outcomes (bridge saved/lost, hero alive/dead) create branches |
| **D021 Hero Toolkit** | Tanya gains XP from mission objectives. Skills unlock across the campaign arc |
| **D021 Roster Carryover** | Squad members survive between missions. Lost units stay lost |
| **D043 AI Presets** | Allied and enemy AI factions use preset behaviors (aggressive, defensive, guerrilla) |
| **D070 Commander & SpecOps** | In co-op, one player can be the Commander (controlling the allied AI's base/production) while another is the SpecOps player (controlling Tanya's squad). The request economy (reinforcements, air support) maps directly to D070's coordination surfaces |
| **D059 Beacons & Coordination** | The reinforcement request wheel uses D059's beacon/ping system. "Need CAS", "Need Extraction" are D059 request types |
| **Lua Scripting (Tier 2)** | All battle interactions (AI modification, reinforcement triggers, objective effects) are Lua scripts. No WASM needed |
| **D022 Dynamic Weather** | Weather affects the battle (fog reduces air effectiveness, rain slows armor) |

**No new engine systems required.** These mission archetypes compose existing systems: AI presets run the battle, Lua scripts connect player actions to battle effects, the hero toolkit handles progression, and the campaign graph handles branching. The only new content is the mission YAML and Lua scripts — all authored by campaign designers, not engine developers.

### Campaign Menu Scenes (Evolving Main Menu Background)

Campaign authors can define **menu scenes** that change the main menu background to reflect the player's current campaign progress. When the player returns to the main menu during a campaign playthrough, the background shows a scene tied to where they are in the story — an evolving title screen pattern used by Half-Life 2, Halo: Reach, Warcraft III, and others (see `player-flow/main-menu.md` § Campaign-Progress Menu Background for prior art).

This is an authoring feature, not an engine system. The engine reads the `menu_scenes` table from the campaign YAML and matches the player's `CampaignState` to select the active scene. No new engine code — just YAML configuration + scene assets.

```yaml
# Campaign YAML — menu scene definitions
campaign:
  id: allied_campaign
  title: "Allied Campaign"

  # Menu scenes — matched in order, first match wins
  menu_scenes:
    # Act 1: Early war — daylight naval scene
    - match:
        missions_completed_lt: 3       # before mission 3
      scene:
        type: video_loop               # pre-rendered video
        video: "media/menu/act1_naval_fleet.webm"
        audio: "media/menu/act1_radio_chatter.opus"  # ambient radio, plays under menu music
        audio_volume: 0.3

    # Act 2: Night operations — air campaign
    - match:
        missions_completed_gte: 3
        missions_completed_lt: 7
        flag:
          current_theater: "air_campaign"  # optional flag condition
      scene:
        type: video_loop
        video: "media/menu/act2_night_flight.webm"   # cockpit view, aircraft in formation
        audio: "media/menu/act2_pilot_radio.opus"     # radio chatter + engine hum

    # Act 3: Ground assault — live shellmap scenario
    - match:
        missions_completed_gte: 7
        missions_completed_lt: 11
      scene:
        type: shellmap                  # live in-game scene
        map: "maps/menu_scenes/act3_beachhead.yaml"
        script: "scripts/menu_scenes/act3_battle.lua"  # lightweight AI battle script
        duration_ticks: 6000            # loops after 5 minutes

    # Act 3 variant: if the bridge was destroyed
    - match:
        missions_completed_gte: 7
        flag:
          bridge_status: destroyed
      scene:
        type: shellmap
        map: "maps/menu_scenes/act3_ruins.yaml"       # different scene — bombed-out bridge
        script: "scripts/menu_scenes/act3_ruins_battle.lua"

    # Final act: victory aftermath
    - match:
        flag:
          campaign_complete: true
      scene:
        type: static_image
        image: "media/menu/victory_sunrise.png"
        audio: "media/menu/victory_theme.opus"
        audio_volume: 0.5

    # Default fallback (no match — e.g., campaign just started)
    - match: {}                         # matches everything
      scene:
        type: shellmap
        map: "maps/menu_scenes/default_skirmish.yaml"
```

**Scene types:**

| Type | What It Is | Best For |
|------|-----------|----------|
| `shellmap` | Live in-game scene — a small map with a Lua script running AI units. Uses the existing shellmap infrastructure. Renders behind the menu at reduced priority | Dynamic scenes: a base under siege, a patrol formation, a naval convoy. The player sees a living piece of the campaign world |
| `video_loop` | A `.webm` video playing in a seamless loop. Optional ambient audio track (radio chatter, engine noise, wind) plays behind menu music at configurable volume | Cinematic scenes: cockpit view of night flight, war room briefing, satellite surveillance footage. Pre-rendered = consistent quality, no sim overhead |
| `static_image` | A single image (artwork, screenshot, concept art) | Simple scenes: victory aftermath, chapter title cards, faction banners |

**Match rules:**

| Condition | Type | Description |
|-----------|------|-------------|
| `campaign_focus` | string | `CampaignState.current_focus` matches `strategic_layer`, `intermission`, `briefing`, `mission`, or `debrief` |
| `missions_completed_lt` | integer | Current `CampaignState.completed_missions.len()` < value |
| `missions_completed_gte` | integer | Current `CampaignState.completed_missions.len()` >= value |
| `active_mission` | string | `CampaignState.active_mission` matches this mission ID |
| `current_phase` | string | `CampaignState.strategic_layer.current_phase.phase_id` matches this phase ID |
| `operation_status` | map | A named operation matches a status such as `available`, `completed`, `failed`, `skipped`, or `expired` |
| `initiative_status` | map | A named enemy initiative matches `revealed`, `countered`, `activated`, or `expired` |
| `asset_state` | map | Asset-ledger entry matches a requested state / quality / quantity tuple (for example `chrono_tank: { state: partial, quality: damaged, quantity_gte: 1 }`) |
| `flag` | map | All specified flags match their values in `CampaignState.flags` |
| `hero_level_gte` | map | Hero character's level >= value (e.g., `{ tanya: 3 }`) |
| `{}` (empty) | — | Matches everything — use as fallback |

Conditions are evaluated **in order**; the first matching entry wins. This allows both classic flag-based branching and structured strategic-layer branching: a bridge-destroyed variant can still key off `flag: { bridge_status: destroyed }`, while a late-war scene can key off `current_phase`, `initiative_status`, or a specific `asset_state`.

**Workshop support:** Community campaigns published via Workshop include their `menu_scenes` table and all referenced assets (videos, images, shellmap maps/scripts). The Workshop packaging system (D049) bundles scene assets as part of the campaign package. The SDK Campaign Editor (D038) provides a "Menu Scenes" panel for authoring and previewing scenes per campaign stage.

**Player override:** The player can always override the campaign scene by selecting a different background style in Settings → Video (static image, shellmap AI, personal highlights, community highlights). Campaign scenes are the default *when authored by the campaign* and *when the player hasn't chosen something else*.

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

-- Read structured strategic-layer state
local phase = Campaign.get_phase()
local spy_network = Campaign.get_operation_state("ic_spy_network")
local lazarus = Campaign.get_initiative_state("project_lazarus")
local chrono_tank = Campaign.get_asset_state("chrono_tank")

if phase and phase.phase_id == "phase_6" then
    UI.show_notification("Final-act operations are now live.")
end

if spy_network and spy_network.status == "available" then
    UI.show_notification("Spy Network has been revealed on the War Table.")
end

if lazarus and lazarus.status == "revealed" then
    UI.show_notification("Project Lazarus is advancing. Counter it soon.")
end

if chrono_tank and chrono_tank.state == "partial" then
    UI.show_notification("Chrono Tank restored in damaged condition. Temporal shift unavailable.")
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

-- Reveal or unlock follow-up operations on the War Table
Campaign.reveal_operation("ic_spy_network")
Campaign.unlock_operation("chrono_convoy_intercept")

-- Update structured strategic-layer state without burying it in generic flags
Campaign.mark_initiative_countered("chemical_weapons_deployment")
Campaign.set_operation_status("ic_behind_enemy_lines", "completed")
Campaign.set_asset_state("chrono_tank", {
    owner = "player",
    state = "partial",
    quantity = 1,
    quality = "damaged",
    consumed_by = { "allied_12", "allied_14" },
})
Campaign.set_asset_state("super_tanks", {
    owner = "enemy",
    state = "denied",
    quantity = 0,
    consumed_by = { "allied_14" },
})

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

**Structured-state rule:** `Campaign.set_flag()` remains correct for bespoke narrative markers (`bridge_status`, `commander_recovered`, `scientist_betrayed`). Use the strategic helpers for canonical War Table state (`phase`, `operation status`, `initiative status`, `asset ledger`) so authors do not have to reverse-engineer first-party systems from arbitrary flag names.

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
    bonus_units:
      - medium_tank
      - medium_tank
      - rifle_infantry
      - rifle_infantry
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
      mechanics_learned: []      # explicit empty list is intentional here

  missions:
    se_01:
      map: missions/scorched-tutorial/01-meet-the-pyro
      briefing: briefings/scorched/01.yaml
      outcomes:
        pass:
          next: se_02
          state_effects:
            append_flag:
              mechanics_learned:
                - flamethrower
                - fire_spread
        skip:
          next: se_02
          state_effects:
            append_flag:
              mechanics_learned:
                - flamethrower
                - fire_spread

    se_02:
      map: missions/scorched-tutorial/02-controlled-burn
      briefing: briefings/scorched/02.yaml
      outcomes:
        pass:
          next: se_03
          state_effects:
            append_flag:
              mechanics_learned:
                - firebreak
                - extinguish
        struggle:
          next: se_02  # retry the same mission with more resources
          adaptive:
            on_previous_defeat:
              bonus_units:
                - fire_truck
                - fire_truck
        skip:
          next: se_03

    se_03:
      map: missions/scorched-tutorial/03-call-the-airstrike
      briefing: briefings/scorched/03.yaml
      outcomes:
        pass:
          next: se_04
          state_effects:
            append_flag:
              mechanics_learned:
                - incendiary_airstrike
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
    experience_profiles:
      - all
    priority: high
    position: near_building
    eva_line = se_fire_warning
```

This pattern scales to any complexity — the modder uses the same YAML campaign format for a 3-mission mod tutorial that the engine uses for its 6-mission Commander School. The `Tutorial` Lua API, `hints.yaml` schema, and scenario editor Tutorial modules (D038) all work identically for first-party and third-party content.

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
