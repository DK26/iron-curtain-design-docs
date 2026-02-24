## D043: AI Behavior Presets — Classic, OpenRA, and IC Default

**Status:** Accepted
**Scope:** `ic-ai`, `ic-sim` (read-only), game module configuration
**Phase:** Phase 4 (ships with AI & Single Player)

### The Problem

D019 gives players switchable *balance* presets (Classic RA vs. OpenRA vs. Remastered values). D041 provides the `AiStrategy` trait for pluggable AI algorithms. But neither addresses a parallel concern: AI *behavioral* style. Original Red Alert AI, OpenRA AI, and a research-informed IC AI all make fundamentally different decisions given the same balance values. A player who selects "Classic RA" balance expects an AI that *plays like Classic RA* — predictable build orders, minimal micro, base-walk expansion, no focus-fire — not an advanced AI that happens to use 1996 damage tables.

### Decision

Ship **AI behavior presets** as first-class configurations alongside balance presets (D019). Each preset defines how the AI plays — its decision-making style, micro level, strategic patterns, and quirks — independent of which balance values or pathfinding behavior are active.

### Built-In Presets

| Preset         | Behavior Description                                                                                                                                                   | Source                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Classic RA** | Mimics original RA AI quirks: predictable build queues, base-walk expansion, minimal unit micro, no focus-fire, doesn't scout, doesn't adapt to player strategy        | EA Red Alert source code analysis       |
| **OpenRA**     | Matches OpenRA skirmish AI: better micro, uses attack-move, scouts, adapts build to counter player's army composition, respects fog of war properly                    | OpenRA AI implementation analysis       |
| **IC Default** | Research-informed enhanced AI: flowfield-aware group tactics, proper formation movement, multi-prong attacks, economic harassment, tech-switching, adaptive aggression | Open-source RTS AI research (see below) |

### IC Default AI — Research Foundation

The IC Default preset draws from published research and open-source implementations across the RTS genre:

- **0 A.D.** — economic AI with resource balancing heuristics, expansion timing models
- **Spring Engine (BAR/Zero-K)** — group micro, terrain-aware positioning, retreat mechanics, formation movement
- **Wargus (Stratagus)** — Warcraft II AI with build-order scripting and adaptive counter-play
- **OpenRA** — the strongest open-source C&C AI; baseline for improvement
- **MicroRTS / AIIDE competitions** — academic RTS AI research: MCTS-based planning, influence maps, potential fields for tactical positioning
- **StarCraft: Brood War AI competitions (SSCAIT, AIIDE)** — decades of research on build-order optimization, scouting, harassment timing

The IC Default AI is not a simple difficulty bump — it's a qualitatively different decision process. Where Classic RA groups all units and attack-moves to the enemy base, IC Default maintains map control, denies expansions, and probes for weaknesses before committing.

### IC Default AI — Implementation Architecture

Based on cross-project analysis of EA Red Alert, EA Generals/Zero Hour, OpenRA, 0 A.D. Petra, Spring Engine, MicroRTS, and Stratagus (see `research/rts-ai-implementation-survey.md` and `research/stratagus-stargus-opencraft-analysis.md`), `PersonalityDrivenAi` uses a **priority-based manager hierarchy** — the dominant pattern across all surveyed RTS AI implementations (independently confirmed in 7 codebases):

```
PersonalityDrivenAi → AiStrategy trait impl
├── EconomyManager
│   ├── HarvesterController     (nearest-resource assignment, danger avoidance)
│   ├── PowerMonitor            (urgency-based power plant construction)
│   └── ExpansionPlanner        (economic triggers for new base timing)
├── ProductionManager
│   ├── UnitCompositionTarget   (share-based, self-correcting — from OpenRA)
│   ├── BuildOrderEvaluator     (priority queue with urgency — from Petra)
│   └── StructurePlanner        (influence-map placement — from 0 A.D.)
├── MilitaryManager
│   ├── AttackPlanner           (composition thresholds + timing — from Petra)
│   ├── DefenseResponder        (event-driven reactive defense — from OpenRA)
│   └── SquadManager            (unit grouping, assignment, retreat)
└── AiState (shared)
    ├── ThreatMap               (influence map: enemy unit positions + DPS)
    ├── ResourceMap             (known resource node locations and status)
    ├── ScoutingMemory          (last-seen timestamps for enemy buildings)
    └── StrategyClassification  (Phase 5+: opponent archetype tracking)
```

Each manager runs on its own tick-gated schedule (see Performance Budget below). Managers communicate through shared `AiState`, not direct calls — the same pattern used by 0 A.D. Petra and OpenRA's modular bot architecture.

#### Key Techniques (Phase 4)

These six techniques form the Phase 4 implementation. Each is proven across multiple surveyed projects:

1. **Priority-based resource allocation** (from Petra's `QueueManager`) — single most impactful pattern. Build requests go into a priority queue ordered by urgency. Power plant at 90% capacity is urgent; third barracks is not. Prevents the "AI has 50k credits and no power" failure mode seen in EA Red Alert.

2. **Share-based unit composition** (from OpenRA's `UnitBuilderBotModule`) — production targets expressed as ratios (e.g., infantry 40%, vehicles 50%, air 10%). Each production cycle builds whatever unit type is furthest below its target share. Self-correcting: losing tanks naturally shifts production toward tanks. Personality parameters (D043 YAML config) tune the ratios per preset.

3. **Influence map for building placement** (from 0 A.D. Petra) — a grid overlay scoring each cell by proximity to resources, distance from known threats, and connectivity to existing base. Dramatically better base layouts than EA RA's random placement. The influence map is a fixed-size array in `AiScratch`, cleared and rebuilt on the building-placement schedule.

4. **Tick-gated evaluation** (from Generals/Petra/MicroRTS) — expensive decisions run infrequently, cheap ones run often. Defense response is near-instant (every tick, event-driven). Strategic reassessment is every 60 ticks (~2 seconds). This pattern appears in *every* surveyed project that handles 200+ units. See Performance Budget table below.

5. **Fuzzy engagement logic** (from OpenRA's `AttackOrFleeFuzzy`) — combat decisions use fuzzy membership functions over health ratio, relative DPS, and nearby ally strength, producing a continuous attack↔retreat score rather than a binary threshold. This avoids the "oscillating dance" where units alternate between attacking and fleeing at a hard HP boundary.

6. **Computation budget cap** (from MicroRTS) — `AiStrategy::tick_budget_hint()` (D041) returns a microsecond budget. The AI *must* return within this budget, even if evaluation is incomplete — partial results are better than frame stalls. The manager hierarchy makes this natural: if the budget is exhausted after `EconomyManager` and `ProductionManager`, `MilitaryManager` runs its cached plan from last evaluation.

#### Evaluation and Threat Assessment

The evaluation function is the foundation of all AI decision-making. A bad evaluation function makes every other component worse (MicroRTS research). Iron Curtain uses **Lanchester-inspired threat scoring**:

```
threat(army) = Σ(unit_dps × unit_hp) × count^0.7
```

This captures Lanchester's Square Law — military power scales superlinearly with unit count. Two tanks aren't twice as effective as one; they're ~1.6× as effective (at exponent 0.7, conservative vs. full Lanchester exponent of 2.0). The exponent is a YAML-tunable personality parameter, allowing presets to value army mass differently.

For evaluating damage taken against our own units:

```
value(unit) = unit_cost × sqrt(hp / max_hp) × 40
```

The `sqrt(hp/maxHP)` gives diminishing returns for overkill — killing a 10% HP unit is worth less than the same cost in fresh units. This is the MicroRTS `SimpleSqrtEvaluationFunction` pattern, validated across years of AI competition.

Both formulas use fixed-point arithmetic (integer math only, consistent with sim determinism).

#### Phase 5+ Enhancements

These techniques are explicitly deferred — the Phase 4 AI ships without them:

- **Strategy classification and adaptation:** Track opponent behavior patterns (build timing, unit composition, attack frequency). Classify into archetypes: "rush", "turtle", "boom", "all-in". Select counter-strategy from personality parameters. This is the MicroRTS Stratified Strategy Selection (SCV) pattern applied at RTS scale.
- **Active scouting system:** No surveyed project scouts well — opportunity to lead. Periodically send cheap units to explore unknown areas. Maintain "last seen" timestamps for enemy building locations in `AiState::ScoutingMemory`. Higher urgency when opponent is quiet (they're probably teching up).
- **Multi-pronged attacks:** Graduate from Petra/OpenRA's single-army-blob pattern. Split forces based on attack plan (main force + flanking/harassment force). Coordinate timing via shared countdown in `AiState`. The `AiEventLog` (D041) enables coordination visibility between sub-plans.
- **Advanced micro:** Kiting, focus-fire priority targeting, ability usage. Kept out of Phase 4 to avoid the "chasing optimal AI" anti-pattern.

#### What to Explicitly Not Do

Five anti-patterns identified from surveyed implementations (full analysis in `research/rts-ai-implementation-survey.md` §9):

1. **Don't implement MCTS/minimax for strategic decisions.** The search space is too large for 500+ unit games. MicroRTS research confirms: portfolio/script search beats raw MCTS at RTS scale. Reserve tree search for micro-scale decisions only (if at all).
2. **Don't use behavior trees for the strategic AI.** Every surveyed RTS uses priority cascades or manager hierarchies, not BTs. BTs add complexity without proven benefit at RTS strategic scale.
3. **Don't chase "optimal" AI at launch.** RA shipped with terrible AI and sold 10 million copies. The Remastered Collection shipped with the same terrible AI. Get a good-enough AI working, then iterate. Phase 4 target: "better than EA RA, comparable to OpenRA."
4. **Don't hardcode strategies.** Use YAML configuration (the personality model above) so modders and the difficulty system can tune behavior without code changes.
5. **Don't skip evaluation function design.** A bad evaluation function makes every other AI component worse. Invest time in getting threat assessment right (Lanchester scoring above) — it's the foundation everything else builds on.

#### AI Performance Budget

Based on the efficiency pyramid (D015) and surveyed projects' performance characteristics (see also `10-PERFORMANCE.md`):

| AI Component                   | Frequency             | Target Time | Approach                   |
| ------------------------------ | --------------------- | ----------- | -------------------------- |
| Harvester assignment           | Every 4 ticks         | < 0.1ms     | Nearest-resource lookup    |
| Defense response               | Every tick (reactive) | < 0.1ms     | Event-driven, not polling  |
| Unit production                | Every 8 ticks         | < 0.2ms     | Priority queue evaluation  |
| Building placement             | On demand             | < 1.0ms     | Influence map lookup       |
| Attack planning                | Every 30 ticks        | < 2.0ms     | Composition check + timing |
| Strategic reassessment         | Every 60 ticks        | < 5.0ms     | Full state evaluation      |
| **Total per tick (amortized)** |                       | **< 0.5ms** | **Budget for 500 units**   |

All AI working memory (influence maps, squad rosters, composition tallies, priority queues) is pre-allocated in `AiScratch` — analogous to `TickScratch` (Layer 5 of the efficiency pyramid). Zero per-tick heap allocation. Influence maps are fixed-size arrays, cleared and rebuilt on their evaluation schedule.

### Configuration Model

AI presets are YAML-driven, paralleling balance presets:

```yaml
# ai/presets/classic-ra.yaml
ai_preset:
  name: "Classic Red Alert"
  description: "Faithful recreation of original RA AI behavior"
  strategy: personality-driven     # AiStrategy implementation to use
  personality:
    aggression: 0.6
    tech_priority: rush
    micro_level: none              # no individual unit control
    scout_frequency: never
    build_order: scripted          # fixed build queues per faction
    expansion_style: base_walk     # builds structures adjacent to existing base
    focus_fire: false
    retreat_behavior: never        # units fight to the death
    adaptation: none               # doesn't change strategy based on opponent
    group_tactics: blob            # all units in one control group

# ai/presets/ic-default.yaml
ai_preset:
  name: "IC Default"
  description: "Research-informed AI with modern RTS intelligence"
  strategy: personality-driven
  personality:
    aggression: 0.5
    tech_priority: balanced
    micro_level: moderate          # focus-fire, kiting ranged units, retreat wounded
    scout_frequency: periodic      # sends scouts every 60-90 seconds
    build_order: adaptive          # adjusts build based on scouting information
    expansion_style: strategic     # expands to control resource nodes
    focus_fire: true
    retreat_behavior: wounded      # retreats units below 30% HP
    adaptation: reactive           # counters observed army composition
    group_tactics: multi_prong     # splits forces for flanking/harassment
    influence_maps: true           # uses influence maps for threat assessment
    harassment: true               # sends small squads to attack economy
```

### Relationship to Existing Decisions

- **D019 (balance presets):** Orthogonal. Balance defines *what units can do*; AI presets define *how the AI uses them*. A player can combine any balance preset with any AI preset. "Classic RA balance + IC Default AI" is valid and interesting.
- **D041 (`AiStrategy` trait):** AI presets are configurations for the default `PersonalityDrivenAi` strategy. The trait allows entirely different AI algorithms (neural net, GOAP planner); presets are parameter sets within one algorithm. Both coexist — presets for built-in AI, traits for custom AI.
- **D042 (`StyleDrivenAi`):** Player behavioral profiles are a fourth source of AI behavior (alongside Classic/OpenRA/IC Default presets). No conflict — `StyleDrivenAi` implements `AiStrategy` independently of presets.
- **D033 (QoL toggles / experience profiles):** AI preset selection integrates naturally into experience profiles. The "Classic Red Alert" experience profile bundles classic balance + classic AI + classic theme.

### Experience Profile Integration

```yaml
profiles:
  classic-ra:
    balance: classic
    ai_preset: classic-ra          # D043 — original RA AI behavior
    pathfinding: classic-ra        # D045 — original RA movement feel
    render_mode: classic           # D048 — original sprite rendering
    theme: classic
    qol: vanilla

  openra-ra:
    balance: openra
    ai_preset: openra
    pathfinding: openra            # D045 — OpenRA movement feel
    render_mode: classic           # D048
    theme: modern
    qol: openra

  iron-curtain-ra:
    balance: classic
    ai_preset: ic-default          # D043 — enhanced AI
    pathfinding: ic-default        # D045 — modern flowfield movement
    render_mode: hd                # D048 — high-definition sprites
    theme: modern
    qol: iron_curtain
```

### Lobby Integration

AI preset is selectable per AI player slot in the lobby, independent of game-wide balance preset:

```
Player 1: [Human]           Faction: Soviet
Player 2: [AI] IC Default (Hard)    Faction: Allied
Player 3: [AI] Classic RA (Normal)  Faction: Allied
Player 4: [AI] OpenRA (Brutal)      Faction: Soviet

Balance Preset: Classic RA
```

This allows mixed AI playstyles in the same game – useful for testing, fun for variety, and educational for understanding how different AI approaches handle the same scenario.

### Community AI Presets

Modders can create custom AI presets as Workshop resources (D030):

- YAML preset files defining `personality` parameters for `PersonalityDrivenAi`
- Full `AiStrategy` implementations via WASM Tier 3 mods (D041)
- AI tournament brackets: community members compete by submitting AI presets, tournament server runs automated matches

### Engine-Level Difficulty System

Inspired by 0 A.D.'s two-axis difficulty (engine cheats + behavioral parameters) and AoE2's strategic number scaling with opt-out (see `research/rts-ai-extensibility-survey.md`), Iron Curtain separates difficulty into two independent layers:

**Layer 1 — Engine scaling (applies to ALL AI players by default):**

The engine provides resource, build-time, and reaction-time multipliers that scale an AI's raw capability independent of how smart its decisions are. This ensures that even a simple YAML-configured AI can be made harder or easier without touching its behavioral parameters.

```yaml
# difficulties/built-in.yaml
difficulties:
  sandbox:
    name: "Sandbox"
    description: "AI barely acts — for learning the interface"
    engine_scaling:
      resource_gather_rate: 0.5     # AI gathers half speed (fixed-point: 512/1024)
      build_time_multiplier: 1.5    # AI builds 50% slower
      reaction_delay_ticks: 30      # AI waits 30 ticks (~1s) before acting on events
      vision_range_multiplier: 0.8  # AI sees 20% less
    personality_overrides:
      aggression: 0.1
      adaptation: none

  easy:
    name: "Easy"
    engine_scaling:
      resource_gather_rate: 0.8
      build_time_multiplier: 1.2
      reaction_delay_ticks: 8
      vision_range_multiplier: 1.0

  normal:
    name: "Normal"
    engine_scaling:
      resource_gather_rate: 1.0     # No modification
      build_time_multiplier: 1.0
      reaction_delay_ticks: 0
      vision_range_multiplier: 1.0

  hard:
    name: "Hard"
    engine_scaling:
      resource_gather_rate: 1.0     # No economic bonus
      build_time_multiplier: 1.0
      reaction_delay_ticks: 0
      vision_range_multiplier: 1.0
    # Hard is purely behavioral — the AI makes smarter decisions, not cheaper ones
    personality_overrides:
      micro_level: moderate
      adaptation: reactive

  brutal:
    name: "Brutal"
    engine_scaling:
      resource_gather_rate: 1.3     # AI gets 30% bonus
      build_time_multiplier: 0.8    # AI builds 20% faster
      reaction_delay_ticks: 0
      vision_range_multiplier: 1.2  # AI sees 20% further
    personality_overrides:
      aggression: 0.8
      micro_level: extreme
      adaptation: full
```

**Layer 2 — Implementation-level difficulty (per-`AiStrategy` impl):**

Each `AiStrategy` implementation interprets difficulty through its own behavioral parameters. `PersonalityDrivenAi` uses the `personality:` YAML config (aggression, micro level, adaptation). A neural-net AI might have a "skill cap" parameter. A GOAP planner might limit search depth. The `get_parameters()` method (from MicroRTS research) exposes these as introspectable knobs.

**Engine scaling opt-out** (from AoE2's `sn-do-not-scale-for-difficulty-level`): Sophisticated AI implementations that model difficulty internally can opt out of engine scaling by returning `false` from `uses_engine_difficulty_scaling()`. This prevents double-scaling — an advanced AI that already weakens its play at Easy difficulty shouldn't also get the engine's gather-rate penalty on top.

**Modder-addable difficulty levels:** Difficulty levels are YAML files, not hardcoded enums. Community modders can define new difficulties via Workshop (D030) — no code required (Tier 1):

```yaml
# workshop: community/nightmare-difficulty/difficulty.yaml
difficulty:
  name: "Nightmare"
  description: "Economy bonuses + perfect micro — for masochists"
  engine_scaling:
    resource_gather_rate: 2.0
    build_time_multiplier: 0.5
    reaction_delay_ticks: 0
    vision_range_multiplier: 1.5
  personality_overrides:
    aggression: 0.95
    micro_level: extreme
    adaptation: full
    harassment: true
    group_tactics: multi_prong
```

Once installed, "Nightmare" appears alongside built-in difficulties in the lobby dropdown. Any `AiStrategy` implementation (first-party or community) can be paired with any difficulty level — they compose independently.

### Mod-Selectable and Mod-Provided AI

The three built-in behavior presets (Classic RA, OpenRA, IC Default) are configurations for `PersonalityDrivenAi`. They are not the only `AiStrategy` implementations. The trait (D041) is explicitly open to community implementations — following the same pattern as `Pathfinder` (D013/D045) and render modes (D048).

**Two-axis lobby selection:**

In the lobby, each AI player slot has two independent selections:

1. **AI implementation** — which `AiStrategy` algorithm
2. **Difficulty level** — which engine scaling + personality config

```
Player 2: [AI] IC Default / Hard        Faction: Allied
Player 3: [AI] Classic RA / Normal      Faction: Allied
Player 4: [AI] Workshop: GOAP Planner / Brutal   Faction: Soviet
Player 5: [AI] Workshop: Neural Net v2 / Nightmare   Faction: Soviet

Balance Preset: Classic RA
```

This is different from pathfinders (one axis: which algorithm). AI has two orthogonal axes because *how smart the AI plays* and *what advantages it gets* are independent concerns. A "Brutal Classic RA" AI should play with original 1996 patterns but get economic bonuses and instant reactions; an "Easy IC Default" AI should use modern tactics but gather slowly and react late.

**Modder as consumer — selecting an AI:**

A mod's YAML manifest can declare which `AiStrategy` implementations it ships with or requires:

```yaml
# mod.yaml — total conversion with custom AI
mod:
  name: "Zero Hour Remake"
  ai_strategies:
    - goap-planner              # Requires this community AI
    - personality-driven        # Also supports the built-in default
  default_ai: goap-planner
  depends:
    - community/goap-planner-ai@^2.0
```

If the mod doesn't specify `ai_strategies`, all registered AI implementations are available.

**Modder as author — providing an AI:**

A Tier 3 WASM mod can implement the `AiStrategy` trait and register it:

```rust
// WASM mod: GOAP (Goal-Oriented Action Planning) AI
impl AiStrategy for GoapPlannerAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // 1. Update world model from FogFilteredView
        // 2. Evaluate goal priorities (expand? attack? defend? tech?)
        // 3. GOAP search: find action sequence to achieve highest-priority goal
        // 4. Emit orders for first action in plan
        // ...
    }

    fn name(&self) -> &str { "GOAP Planner" }
    fn difficulty(&self) -> AiDifficulty { AiDifficulty::Custom("adaptive".into()) }

    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        // Re-prioritize goals: if enemy spotted near base, defend goal priority increases
        self.goal_priorities.defend += self.threat_weight(unit_type);
    }

    fn on_under_attack(&mut self, _unit: EntityId, _attacker: EntityId) {
        // Emergency re-plan: abort current plan, switch to defense
        self.force_replan = true;
    }

    fn get_parameters(&self) -> Vec<ParameterSpec> {
        vec![
            ParameterSpec { name: "plan_depth".into(), min_value: 1, max_value: 10, default_value: 5, .. },
            ParameterSpec { name: "replan_interval".into(), min_value: 10, max_value: 120, default_value: 30, .. },
            ParameterSpec { name: "aggression_weight".into(), min_value: 0, max_value: 100, default_value: 50, .. },
        ]
    }

    fn uses_engine_difficulty_scaling(&self) -> bool { false } // handles difficulty internally
}
```

The mod registers its AI in its manifest:

```yaml
# goap_planner/mod.yaml
mod:
  name: "GOAP Planner AI"
  type: ai_strategy
  ai_strategy_id: goap-planner
  display_name: "GOAP Planner"
  description: "Goal-oriented action planning AI — plans multi-step strategies"
  wasm_module: goap_planner.wasm
  capabilities:
    read_visible_state: true
    issue_orders: true
  config:
    plan_depth: 5
    replan_interval_ticks: 30
```

**Workshop distribution:** Community AI implementations are Workshop resources (D030). They can be rated, reviewed, and depended upon — same as pathfinder mods. The Workshop can host AI tournament leaderboards: automated matches between community AI submissions, ranked by Elo/TrueSkill (inspired by BWAPI's SSCAIT and AoE2's AI ladder communities, see `research/rts-ai-extensibility-survey.md`).

**Multiplayer implications:** AI selection is NOT sim-affecting in the same way pathfinding is. In a human-vs-AI game, each AI player can run a different `AiStrategy` — they're independent agents. In AI-vs-AI tournaments, all AI players can be different. The engine doesn't need to validate that all clients have the same AI WASM module (unlike pathfinding). However, for determinism, the AI's `decide()` output must be identical on all clients — so the WASM binary hash IS validated per AI player slot.

### Relationship to Existing Decisions

- **D019 (balance presets):** Orthogonal. Balance defines *what units can do*; AI presets define *how the AI uses them*. A player can combine any balance preset with any AI preset. "Classic RA balance + IC Default AI" is valid and interesting.
- **D041 (`AiStrategy` trait):** AI behavior presets are configurations for the default `PersonalityDrivenAi` strategy. The trait allows entirely different AI algorithms (neural net, GOAP planner); presets are parameter sets within one algorithm. Both coexist — presets for built-in AI, traits for custom AI. The trait now includes event callbacks, parameter introspection, and engine scaling opt-out based on cross-project research.
- **D042 (`StyleDrivenAi`):** Player behavioral profiles are a fourth source of AI behavior (alongside Classic/OpenRA/IC Default presets). No conflict — `StyleDrivenAi` implements `AiStrategy` independently of presets.
- **D033 (QoL toggles / experience profiles):** AI preset selection integrates naturally into experience profiles. The "Classic Red Alert" experience profile bundles classic balance + classic AI + classic theme.
- **D045 (pathfinding presets):** Same modder-selectable pattern. Mods select or provide pathfinders; mods select or provide AI implementations. Both distribute via Workshop; both compose with experience profiles. Key difference: pathfinding is one axis (algorithm), AI is two axes (algorithm + difficulty).
- **D048 (render modes):** Same modder-selectable pattern. The trait-per-subsystem architecture means every pluggable system follows the same model: engine ships built-in implementations, mods can add more, players/modders pick what they want.

### Alternatives Considered

- AI difficulty only, no style presets (rejected — difficulty is orthogonal to style; a "Hard Classic RA" AI should be hard but still play like original RA, not like a modern AI turned up)
- One "best" AI only (rejected — the community is split like they are on balance; offer choice)
- Lua-only AI scripting (rejected — too slow for tick-level decisions; Lua is for mission triggers, WASM for full AI replacement)
- Difficulty as a fixed enum only (rejected — modders should be able to define new difficulty levels via YAML without code changes; AoE2's 20+ years of community AI prove that a large parameter space outlasts a restrictive one)
- No engine-level difficulty scaling (rejected — delegating difficulty entirely to AI implementations produces inconsistent experiences across different AIs; 0 A.D. and AoE2 both provide engine scaling with opt-out, proving this is the right separation of concerns)
- No event callbacks on `AiStrategy` (rejected — polling-only AI misses reactive opportunities; Spring Engine and BWAPI both use event + tick hybrid, which is the proven model)

---

---

