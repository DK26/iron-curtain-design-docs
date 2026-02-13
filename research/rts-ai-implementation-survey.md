# RTS AI Implementation Survey

> **Purpose:** How do real RTS projects actually implement AI decision-making, and what can Iron Curtain learn from them?  
> **Scope:** Strategic-level AI (build orders, attack timing, economy management, threat response), unit-level AI (engagement, micro, formations), evaluation/scoring, difficulty systems, and performance.  
> **Companion doc:** `research/rts-ai-extensibility-survey.md` covers the *API/plugin architecture* side. This document covers the *intelligence* side — how these AIs actually make decisions.

---

## Table of Contents

1. [EA Red Alert (1996)](#1-ea-red-alert-1996)
2. [EA Generals / Zero Hour (2003)](#2-ea-generals--zero-hour-2003)
3. [EA Remastered Collection (2020)](#3-ea-remastered-collection-2020)
4. [OpenRA](#4-openra)
5. [0 A.D. (Petra AI)](#5-0-ad-petra-ai)
6. [Spring Engine](#6-spring-engine)
7. [MicroRTS (Academic)](#7-microrts-academic)
8. [Cross-Project Pattern Analysis](#8-cross-project-pattern-analysis)
9. [Recommendations for Iron Curtain](#9-recommendations-for-iron-curtain)

---

## 1. EA Red Alert (1996)

**Source:** [`electronicarts/CnC_Red_Alert`](https://github.com/electronicarts/CnC_Red_Alert) (GPL v3)  
**Language:** C++  
**Architecture:** Monolithic — all AI lives in `HOUSE.CPP` (~6000 lines)

### Strategic Decision-Making: Urgency-Based State Machine

The AI's strategic brain is `HouseClass::Expert_AI()`, called every game tick. It evaluates 10 strategic "urgency" categories from CRITICAL to LOW priority:

```
Priority order (highest to lowest):
1. FIRE_SALE       — Sell everything, last resort
2. RAISE_MONEY     — Need resources urgently
3. RAISE_POWER     — Power deficit
4. BUILD_POWER     — Proactive power building
5. MONEY           — Refinery/harvester shortage
6. COMBAT_POWER    — Military weakness
7. BUILD_STRUCTURE — General infrastructure
8. BUILD_DEFENSE   — Defensive structures
9. BUILD_INCOME    — Economic expansion
10. FIRE_SALE      — (re-evaluated at bottom)
```

Each urgency produces a numeric urgency value. The AI picks the highest urgency and acts on it. This is not a behavior tree, not GOAP, not utility AI — it's a hand-coded priority cascade with numeric weighting.

### Key Decision Patterns

**Ratio-based building:** The AI maintains target ratios between military and economy. `AI_Building()` checks: "Do I have enough harvesters relative to my refineries? Enough power relative to my buildings? Enough barracks relative to my army size?" Each check produces an urgency score. The highest urgency drives the next build action.

**Team-fill production:** `AI_Unit()` evaluates what unit types the current attack "team" needs. The AI organizes units into teams with target compositions. If the team needs more tanks, it builds tanks. If it needs more infantry, it builds infantry. The specific composition depends on which team type is being assembled.

**All-or-nothing attacks:** When the AI's attack team is filled, `AI_Attack()` triggers `MISSION_HUNT` — all designated attack units rush toward the enemy base at once. There is no flanking, no multi-pronged assault, no retreat logic. Units attack-move toward the target and fight whatever they encounter.

**IQ-gated capabilities:** `Expert_AI()` has an internal difficulty parameter that gates certain behaviors. Lower IQ values disable attack planning, complex building logic, and some defensive responses. Higher IQ enables all strategic options. This is a simple if-else gate, not a gradient.

### Economy Management

**Harvester logic:** Simple nearest-resource gathering. When a harvester is full, return to nearest refinery. When empty, go to nearest ore. No strategic resource field selection, no multi-base harvesting optimization.

**Selling under pressure:** When urgency reaches FIRE_SALE, the AI sells buildings to raise money for emergency military production. This was considered AI stupidity by many players but is actually a coherent desperation mechanic.

### What Makes It Work (or Not)

**Strengths:**
- Simple priority system is transparent and predictable
- Team-fill production creates reasonable army compositions
- Integer math throughout — perfectly deterministic
- Very cheap computationally — runs every tick without concern

**Weaknesses:**
- No spatial reasoning at all — doesn't consider map layout
- No scouting behavior — doesn't actively seek information
- No adaptation — same strategy regardless of opponent behavior
- Attack timing is pure heuristic — "team is full enough, go"
- No retreat or regrouping — units fight to the death
- Base building placement has no strategic consideration

### Performance Characteristics

Zero additional memory allocation. Simple integer comparisons per tick. No pathfinding in the strategic layer — that's handled elsewhere. The entire AI decision loop executes in microseconds on period hardware.

---

## 2. EA Generals / Zero Hour (2003)

**Source:** [`electronicarts/CnC_Generals_Zero_Hour`](https://github.com/electronicarts/CnC_Generals_Zero_Hour) (GPL v3)  
**Language:** C++  
**Architecture:** Class hierarchy — `AIPlayer` → `AISkirmishPlayer` (separate from campaign scripted AI)

### Two AI Modes

**Campaign AI:** Fully scripted via external script files. Triggers fire based on conditions (player reaches location, timer expires, structure built). No autonomous decision-making — a mission designer hand-placed every event. This is the approach OpenRA's Lua system follows.

**Skirmish AI:** Autonomous decision-making via `AISkirmishPlayer`. This is the interesting one for our purposes.

### Strategic Architecture

The Generals skirmish AI introduces several patterns not present in RA:

**Timer-based update loop:** Unlike RA's per-tick evaluation, Generals' AI uses multiple timers with different intervals:
- Frequent: harvester management, unit micro
- Medium: build order evaluation, team assembly
- Infrequent: strategic reassessment, base expansion

This is an early form of computational budget management — the AI explicitly amortizes expensive decisions over time rather than evaluating everything every tick.

**Wealth-aware build pacing:** `TAiData` structures configure build timing relative to current resources. The AI doesn't just check "can I afford this?" — it evaluates "given my income rate and current savings, when should I start this build?" This produces more natural-looking economic behavior than RA's binary "can afford / can't afford" checks.

**Priority-based team selection:** Teams have named compositions with priority weights:
```
TeamTemplate:
  name: "MainAssault"
  units:
    - type: AmericaTank, count: 4, priority: HIGH
    - type: AmericaInfantry, count: 6, priority: MEDIUM
    - type: AmericaHumvee, count: 2, priority: LOW
```
The AI fills high-priority slots first, creating a natural army composition curve where core units appear first and support units fill in later.

### Data-Driven Configuration

All AI behavior parameters live in INI files (`TAiData`), not code:

```ini
[AIData]
StructureSeconds = 12.0          ; time between structure builds
TeamBuildSeconds = 8.0           ; time between team fill checks
ResourcesWorthAttacking = 500   ; min value to trigger attack
WealthMultiplier = 1.5          ; income-to-spending ratio
MaxTeams = 6                    ; concurrent teams allowed
```

The INI-driven approach means modders could tune AI behavior without recompilation — a significant improvement over RA's hardcoded values.

### Difficulty Implementation

`AISideInfo` per-faction configuration:
- **ResourceMultiplier:** AI gets bonus resources per harvest
- **BuildSpeed:** Multiplier on construction time
- **BaseDefenseStructureCount:** How many defensive buildings to maintain
- **SkillMultiplier:** Affects reaction times and tactical decisions

The difficulty system is purely economic/temporal — harder AI gets more resources and builds faster, not fundamentally different strategies. This is the "engine scaling" approach we adopted in D043's two-axis system.

### Unit-Level AI (Micro)

Generals introduced more sophisticated unit micro than RA:
- **Garrison seeking:** Infantry automatically enter nearby buildings under fire
- **Vehicle crush avoidance:** Infantry dodge approaching vehicles
- **Ability usage:** Units use special abilities (e.g., flashbang, EMP) based on simple condition checks (enemy count nearby, health threshold)
- **Formation movement:** Groups maintain formation during movement, with formation breaking on engagement

### What It Teaches Us

The Generals AI represents the apex of C&C AI sophistication:
1. **Timer-based amortization** is the key performance insight — don't evaluate everything every tick
2. **Data-driven configuration** enables tuning without code changes
3. **Wealth-aware pacing** produces more natural economic behavior
4. **Team templates** create better army compositions than ad-hoc unit selection
5. **Difficulty as economic advantage** is simpler to implement and tune than behavioral changes

---

## 3. EA Remastered Collection (2020)

**Source:** [`electronicarts/CnC_Remastered_Collection`](https://github.com/electronicarts/CnC_Remastered_Collection) (GPL v3 — engine DLLs only)  
**Language:** C++ (engine) + C# (client)

### The Non-News: No AI Changes

The Remastered Collection includes **zero AI improvements** over the 1996 original. The same `HouseClass::Expert_AI()` code from `HOUSE.CPP` runs unchanged. The GlyphX wrapper (`DLLInterface.cpp`) calls the original AI through `Glyphx_Queue_AI()`, which bypasses all networking and feeds directly into the original game loop.

This is the most important lesson: **a $15M remaster shipped with 1996 AI.** The team prioritized visual fidelity, QoL, and multiplayer infrastructure over AI. This tells us:

1. Players tolerate mediocre AI much longer than mediocre rendering or controls
2. AI improvements have lower ROI than most other engine investments
3. BUT — mediocre AI is a recurring complaint in post-release feedback

### Implication for Iron Curtain

We don't need cutting-edge AI at launch. A solid priority-based system (better than RA's but not revolutionary) is perfectly acceptable for Phase 4. Reserve sophisticated AI for post-launch iteration. But design the `AiStrategy` trait (D041) to allow easy replacement — which we've already done.

---

## 4. OpenRA

**Source:** [`OpenRA/OpenRA`](https://github.com/OpenRA/OpenRA) (GPL v3)  
**Language:** C#  
**Architecture:** Modular bot modules via `ConditionalTrait<>` ECS-like composition

### Modular Bot Architecture

OpenRA's AI is the most architecturally mature in the C&C lineage. Instead of a monolithic AI class, it uses independent "bot modules" that each handle one aspect of AI behavior:

| Module                  | Responsibility                      |
| ----------------------- | ----------------------------------- |
| `SquadManagerBotModule` | Military force management           |
| `BaseBuilderBotModule`  | Structure placement and build order |
| `UnitBuilderBotModule`  | Unit production composition         |
| `HarvesterBotModule`    | Harvester task management           |
| `McvManagerBotModule`   | MCV deployment and base expansion   |
| `SupportPowerBotModule` | Superweapon targeting               |
| `ResourceMapBotModule`  | Resource influence map              |

Each module implements `IBotModule` and is ticked independently. Modules communicate via interfaces:
- `IBotRequestUnitProduction` — module requests specific unit types
- `IBotBaseExpansion` — module requests new base locations
- `IBotRespondToAttack` — module responds to being attacked
- `IBotPositionsUpdated` — broadcast when important positions change

### Fuzzy Logic for Engagement Decisions

`AttackOrFleeFuzzy` uses a Mamdani fuzzy inference engine with 4 inputs:
- OwnHealth (0.0–1.0)
- EnemyHealth (0.0–1.0)
- RelativeAttackPower (ratio of own DPS to enemy DPS)
- RelativeSpeed (can we outrun them?)

These inputs feed through membership functions ("low", "medium", "high") and fuzzy rules produce an output between "flee" and "attack". This is the most sophisticated engagement decision logic in any open-source RTS we surveyed.

Example rules:
```
IF OwnHealth IS low AND EnemyHealth IS high THEN flee
IF RelativeAttackPower IS high AND OwnHealth IS high THEN attack
IF RelativeSpeed IS high AND OwnHealth IS low THEN flee
IF RelativeAttackPower IS medium AND OwnHealth IS medium THEN attack
```

### Share-Based Unit Composition

`UnitBuilderBotModule` uses a share system rather than hard ratios:
```yaml
UnitsToBuild:
  - UnitType: e1              # Infantry
    SharePercentage: 40
  - UnitType: 1tnk            # Light Tank
    SharePercentage: 35
  - UnitType: 2tnk            # Medium Tank
    SharePercentage: 25
```

The module tracks current composition and builds whichever unit type is most below its target share. This elegantly handles unit attrition — if all tanks die, production shifts to replace them.

### Resource Influence Map

`ResourceMapBotModule` maintains a grid-based resource map:
- Divides the playable area into cells
- Tracks resource density per cell
- Updates periodically (not every tick)
- `ClosestHarvestablePosition()` returns the nearest resource-rich cell

This is a lightweight influence map — simpler than 0 A.D.'s but effective for directing harvester behavior.

### Support Power Targeting (Two-Phase)

`SupportPowerBotModule` implements a surprisingly sophisticated targeting algorithm:

**Phase 1 — Value Mapping:** Build a grid of the map. For each cell, sum the "value" of all enemy units within the support power's blast radius. Value = unit cost + special bonuses for high-value targets (MCVs, refineries).

**Phase 2 — Scoring with Penalty:** From the value map, select the highest-value cell. Apply penalties for:
- Proximity to own units (avoid self-damage)
- Low enemy unit density (prefer clustered targets)
- Previously targeted areas (avoid repetition)

The second phase prevents obviously stupid superweapon uses (nuking a single infantry soldier) while encouraging tactically meaningful placements.

### Harvester Management

`HarvesterBotModule` handles:
- Assigning harvesters to refineries (nearest available)
- Redirecting idle harvesters
- Replacing destroyed harvesters (triggers production request via `IBotRequestUnitProduction`)
- Avoiding dangerous areas (if harvester was recently destroyed at a location, avoid it temporarily)

### What Makes OpenRA's AI Good

1. **Modularity:** Each module is independently testable and replaceable
2. **Fuzzy engagement:** More nuanced than binary attack/retreat
3. **Share-based production:** Self-correcting army composition
4. **Inter-module communication:** Modules coordinate but aren't tightly coupled
5. **Data-driven:** Share percentages, fuzzy rules, and priorities are configurable per mod

### What's Still Missing

1. **No adaptive strategy:** Doesn't change approach based on opponent behavior
2. **No scouting system:** Uses knowledge of discovered areas only, doesn't actively scout
3. **No multi-base coordination:** Each base largely operates independently
4. **Limited spatial reasoning:** Resource map is simple grid, not a full influence map
5. **No retreat micro:** Units don't pull damaged units back or kite

---

## 5. 0 A.D. (Petra AI)

**Source:** [`0ad/0ad`](https://github.com/0ad/0ad) (GPL v2)  
**Language:** JavaScript  
**Architecture:** Hierarchical manager system with influence maps

### Manager Hierarchy

Petra AI organizes decision-making into a hierarchy of managers, all coordinated by the HQ (headquarters) module:

```
PetraBot (top-level)
├── HQ (headquarters — strategic brain)
│   ├── BasesManager (base-level economy)
│   │   └── BaseManager[] (per-base workers, drops, farms)
│   ├── AttackManager (military campaigns)
│   │   └── AttackPlan[] (individual attack forces)
│   ├── DefenseManager (threat response)
│   │   └── DefenseArmy[] (reactive defense forces)
│   ├── TradeManager (trade route optimization)
│   ├── NavalManager (naval operations)
│   ├── DiplomacyManager (alliance decisions)
│   ├── VictoryManager (victory condition pursuit)
│   ├── ResearchManager (technology decisions)
│   └── GarrisonManager (building garrisons)
└── QueueManager (resource allocation across all managers)
```

### Influence Map-Based Building Placement

This is Petra's most distinctive feature. Building placement uses actual influence maps (via `API3.Map`):

```javascript
// Houses attract other houses
if (template.hasClass("House")) {
    addInfluence(x, z, radius: 60/cellSize, value: +40);
    // But repel non-houses
}

// Food dropsites attract fields
if (template.hasClass("Farmstead")) {
    addInfluence(x, z, radius: 80/cellSize, value: +50);
}

// Markets favor border positions (maximize trade distance)
if (template.hasClass("Market")) {
    // Score inversely proportional to distance from border
}
```

Each candidate building position is scored by combining:
- Territory ownership (must be in own territory)
- Influence map value (cluster similar buildings)
- Resource proximity (`getResourcesAround()`)  
- Border proximity (varies by building type)
- Water access (for docks)
- Obstruction map (avoid blocking paths)

This produces organic-looking base layouts that cluster residential areas, keep military near frontlines, and optimize economic buildings near resources.

### Priority-Based Resource Allocation

The `QueueManager` is where Petra's intelligence really shines. Every production need — units, buildings, research — goes through named queues with configurable priorities:

```javascript
priorities: {
    villager: 150,
    citizenSoldier: 120,
    field: 130,
    civilCentre: 100,
    house: 90,
    militaryBuilding: 80,
    defenseBuilding: 70,
    economicBuilding: 50,
    minorTech: 30,
    majorTech: 60,
    wonder: 10
}
```

Resources are distributed proportionally to queue priority. When a queue can afford its next item, it starts. This means military production doesn't starve economy or vice versa — both progress at rates proportional to their priority.

**Dynamic priority adjustment:** Queues can temporarily elevate their priority. Emergency situations (e.g., no barracks, population cap imminent) double or triple the relevant queue's priority:

```javascript
if (freeSlots < 5) {
    priority = 2 * this.Config.priorities.house;
}
```

### Attack Planning with Unit Composition Targets

Each `AttackPlan` defines unit composition requirements:

```javascript
// Rush attack
unitStat.Infantry = { 
    priority: 1, minSize: 10, targetSize: 20, 
    batchSize: 2, classes: ["Infantry"],
    interests: [["strength", 1], ["costsResource", 0.5, "stone"]]
};
unitStat.FastMoving = { 
    priority: 1, minSize: 2, targetSize: 4, 
    batchSize: 2, classes: ["FastMoving+CitizenSoldier"]
};

// Huge attack
// Adds siege, champion units with separate queues
```

Units are sorted for production priority: units below their target size get a +1000 bonus; otherwise sorted by `(currentSize/targetSize) - priority`. This ensures understrength categories are filled first.

Attack types scale with game phase:
- **Rush:** Early game, infantry-heavy, smaller minimum army
- **Default:** Standard mid-game assault
- **Raid:** Small fast-moving force aimed at economy
- **Huge Attack:** Late-game combined arms assault with siege

### Tick-Gated Execution

Petra deliberately staggers expensive decisions across turns:

```javascript
// Every turn:
this.defenseManager.update(gameState, events);

// Every 3 turns:
if (gameState.ai.playedTurn % 3 == 0) {
    this.constructTrainingBuildings(gameState, queues);
    this.buildDefenses(gameState, queues);
}

// Every 30 turns:
if (gameState.ai.playedTurn % 30 == 0) {
    this.buildWonder(gameState, queues, false);
}
```

This is the same amortization pattern Generals uses — reserve expensive evaluation for slower cadences.

### Unit-Level AI: Hierarchical FSM

Separately from the strategic AI, 0 A.D. has `UnitAI.js` — a massive (~6400 line) hierarchical finite state machine managing individual unit behavior:

**Stances** control engagement behavior:
| Stance      | Behavior                                          |
| ----------- | ------------------------------------------------- |
| Violent     | Attack anything nearby, pursue indefinitely       |
| Aggressive  | Attack nearby enemies, return when leash exceeded |
| Defensive   | Fight back if attacked, don't pursue              |
| Passive     | Never attack, will flee                           |
| Standground | Attack in range, never move                       |
| Skittish    | Flee from enemies (for animals)                   |

**State hierarchy:**
```
FORMATIONCONTROLLER (formation-level)
├── WALKING
├── WALKINGANDFIGHTING
├── PATROL → CHECKINGWAYPOINT
└── MEMBER

INDIVIDUAL (per-unit)
├── IDLE
├── WALKING
├── FLEEING
├── COMBAT
│   ├── APPROACHING (move into range)
│   └── ATTACKING (deal damage)
├── GATHERING (resource collection)
│   ├── APPROACHING
│   ├── GATHERING
│   └── RETURNINGRESOURCE
└── ANIMAL (special wildlife states)
```

**Target preference system:** `GetPreference()` returns a priority value (0 = best). Units prefer targets that are: attacking them, closer, lower-health, higher-value. Buildings have auto-attack with round-based firing (archers on walls).

### What Petra Teaches

1. **Influence maps work:** Even simple influence maps produce dramatically better building placement than random/nearest
2. **Priority queues are the right economics model:** Proportional resource allocation across competing needs is robust and self-correcting
3. **Manager decomposition scales:** 10+ managers each handling one concern is maintainable in JavaScript — should be clean in Rust with ECS
4. **Tick gating is essential:** Staggering expensive decisions across turns keeps frame time stable
5. **Unit AI and strategic AI should be separate:** UnitAI.js handles micro, Petra handles macro — they barely interact
6. **Composition targets drive production:** "Build what the army needs" is better than "build the strongest unit available"

---

## 6. Spring Engine

**Source:** [`spring/spring`](https://github.com/spring/spring) (GPL v2)  
**Language:** C++ (engine), external AIs in C++/Java/Lua  
**Architecture:** Engine-as-platform — provides NO built-in strategic AI

### The Engine Only Provides Unit-Level AI

Spring is the most extreme case of AI pluggability. The engine itself contains:

**CommandAI hierarchy** (unit-level command execution only):
```
CCommandAI (base — manages command queue for one unit)
├── CMobileCAI (mobile units — movement + engagement)
│   ├── CBuilderCAI (builders — repair/reclaim/build priority cascade)
│   └── CAirCAI (aircraft — special air behavior)
└── CFactoryCAI (factories — production queue management)
```

Key unit-level patterns:
- **MobileCAI leash radius:** `100.0f * moveState * moveState + maxRange`. Units in "hold position" (moveState=0) only engage at weapon range. Roaming units (moveState=2) pursue up to 400 + weapon range distance.
- **BuilderCAI priority cascade:** When idle, check: Can repair? → Can reclaim? → Can resurrect? → Can fight? This is a fixed priority order.
- **AirCAI auto-target:** Aircraft circle and engage the closest valid target within range. No strategic target selection.
- **Formation AI:** `SelectedUnitsAI` orders units in formations by value: `(metal*60 + energy) / health * range`. Expensive ranged units sort to the back, cheap melee units to the front.

### External AI Interface (5000+ Lines)

All strategic intelligence comes from external AI plugins loaded via `SkirmishAILibrary`. The engine exposes a massive callback interface (`SSkirmishAICallbackImpl`):

**Economy queries:**
- `getIncome()`, `getUsage()`, `getStorage()`, `getPull()`, `getShare()`, `getSent()`, `getReceived()`, `getExcess()` — per resource type

**Map queries:**
- Full heightmap, slope map, metal map
- Line-of-sight map, radar map
- Pathability/terrain type queries

**Unit queries:**
- All unit definitions with stats (via UnitDef)
- Current unit positions, health, orders
- Build options per unit type
- Custom parameters per unit type

**Action commands:**
- Build, move, attack, repair, reclaim, patrol, guard
- Set formation, set fire state, set move state

### Cheat Interface for AI Difficulty

`AICheats.cpp` provides god-mode access:
- `GetUnitResourceInfo()` — see enemy economy
- `GetCurrentUnitCommands()` — see enemy orders
- See through fog of war

AI difficulty can be implemented by controlling how much of the cheat interface the AI uses. A "fair" AI uses no cheats; a "hard" AI peeks at enemy economy; a "brutal" AI sees everything.

### Notable Community AIs

Spring's community has produced sophisticated strategic AIs as external plugins:
- **Shard AI:** Behavior tree-based, aggressive multi-pronged tactics
- **KAIK:** Map analysis with economic scoring, methodical expansion
- **BAR AI (Beyond All Reason):** Modern, actively maintained, uses terrain analysis

These all operate through the same callback interface. The engine doesn't know which AI is running — it just processes the commands they emit.

### What Spring Teaches

1. **Complete separation works:** Strategic AI as a plugin is viable and produces thriving AI ecosystems
2. **The callback interface must be comprehensive:** If the AI can't query something, it can't reason about it. Spring exposes nearly everything.
3. **Cheat interface is a pragmatic difficulty tool:** "See through fog" is a cleaner difficulty dial than "bonus resources" in some ways
4. **Unit-level AI is engine territory:** Individual unit behavior (engagement, pursuit, retreat) belongs in the engine; strategic planning is for the AI layer
5. **Multiple community AIs are better than one first-party AI:** Spring's ecosystem has produced half a dozen competitive AIs

---

## 7. MicroRTS (Academic)

**Source:** [`Farama-Foundation/MicroRTS`](https://github.com/Farama-Foundation/MicroRTS) (GPL v3)  
**Language:** Java  
**Architecture:** AI research framework with pluggable AI agents

### Why MicroRTS Matters

MicroRTS is the premier academic RTS AI testbed. It's intentionally tiny (8×8 to 64×64 maps, ~5 unit types) but implements core RTS mechanics: resource gathering, building, unit production, combat. Its value is the catalog of AI techniques implemented and compared in a controlled environment. Several of these techniques are directly applicable to Iron Curtain's AI design.

### Computation Budget Pattern

Every AI in MicroRTS extends `AIWithComputationBudget`:

```java
public abstract class AIWithComputationBudget extends AI {
    protected int TIME_BUDGET = 100;      // milliseconds per decision
    protected int ITERATIONS_BUDGET = 100; // iteration cap
}
```

All AIs respect this budget via `computeDuringOneGameFrame()`. This is the formal version of Generals' timer-based updates and Petra's tick gating — a hard limit on how much computation the AI performs per frame. **This pattern directly validates our D041 design where `AiStrategy::decide()` returns within a tick budget.**

### AI Technique Catalog

MicroRTS implements the following AI approaches (all using the same interface):

#### Monte Carlo Tree Search (MCTS/UCT)

`NaiveMCTS`, `UCT`, `TwoPhaseNaiveMCTS`, `MLPSMCTS`

The workhorse of MicroRTS AI research. Each variant:
1. Start from current game state
2. Expand a tree of possible future states
3. Simulate random playouts from leaf nodes
4. Backpropagate evaluation results
5. Select the most promising action

Key parameters:
- `MAX_TREE_DEPTH = 10` — how far to plan ahead
- `MAXSIMULATIONTIME = 1024` — playout length in game cycles
- `epsilon_0`, `epsilon_l`, `epsilon_g` — exploration vs exploitation constants
- Playout policy (usually `RandomBiasedAI`)

**Relevance to Iron Curtain:** MCTS is too expensive for real-time decisions at RTS scale (hundreds of units), but the two-phase variant (explore broadly, then focus) is an interesting pattern for macro-strategic decisions made every N ticks.

#### Real-Time Minimax

`RTMinimax`, `IDRTMinimax` (Iterative Deepening)

Classical game tree search adapted for real-time:
- Greedy action scan first (fast baseline)
- Iterative deepening: increase search depth each frame until budget exhausted
- Alpha-beta pruning
- Stack-based (not recursive) for budget interruption

The iterative deepening pattern is particularly clever: the AI always has *some* answer ready (from the greedy scan), and it gets better as more time is available.

#### Portfolio Greedy Search (PGS)

`PGSAI`, `PortfolioAI`

Instead of searching over individual unit actions, PGS searches over *scripts*:
```java
UnitScript harvest = new UnitScriptHarvest(pf, utt);
UnitScript buildBarracks = new UnitScriptBuild(pf, utt.getUnitType("Barracks"));
UnitScript attack = new UnitScriptAttack(pf);
UnitScript trainWorker = new UnitScriptTrain(utt.getUnitType("Worker"));
UnitScript trainLight = new UnitScriptTrain(utt.getUnitType("Light"));
```

Each unit is assigned a script. PGS searches over script assignments:
1. Start with a default assignment (everyone attacks)
2. For each unit, try each script, simulate forward, keep the best
3. Repeat for the other player's response
4. Iterate I times per player, R times overall

**This is highly relevant to Iron Curtain.** Our `PersonalityDrivenAi` could use a similar pattern — instead of searching individual unit commands, assign "roles" (harvest, defend, attack, scout) to unit groups and search over role assignments.

#### Puppet Search

`PuppetSearchMCTS`

Layer on top of PGS: defines "puppet plans" as macro-level strategies (e.g., "rush", "expand", "tech up"). The search happens at the plan level using MCTS, then each plan is mapped to specific scripts. This is hierarchical planning — strategic decisions at the top, tactical execution at the bottom.

#### Strategy Classification (SCV)

`SCV` (Strategy Classification-based AI)

Uses machine learning to classify the current game situation and select the best counter-strategy:
- Loads a pre-trained logistic regression model
- Classifies the game state based on features (unit counts, map size, distance to enemy)
- Selects from a portfolio of strategies: WorkerRush, LightRush, RangedRush, RandomBiased
- Retrains from battle outcome data

**Relevance:** This is the reactive adaptation pattern Iron Curtain's AI needs. "What are they doing?" → "What beats that?" is more humanlike than pure tree search.

#### AHTN (Adversarial Hierarchical Task Network)

`AHTNAI`

HTN planning applied to RTS: tasks decompose into subtasks until reaching primitive actions. The adversarial component considers opponent task decompositions. Domain knowledge is specified in external definition files.

This is the most "AI textbook" approach in MicroRTS and the most expensive computationally.

### Evaluation Functions

MicroRTS provides multiple game state evaluation functions, all following the pattern `score = f(maxplayer) - f(minplayer)`:

**SimpleEvaluationFunction:**
```java
base_score = resources * 20 
           + resources_in_workers * 10
           + sum(unit_cost * hp / maxHP) * 40
```

**SimpleSqrtEvaluationFunction (default):**
```java
base_score = resources * 20
           + resources_in_workers * 10
           + sum(unit_cost * sqrt(hp / maxHP)) * 40
```
The `sqrt(hp/maxHP)` gives diminishing returns for overkill — killing a 10% HP unit is worth much less than the same cost of fresh units. This produces more realistic damage valuation.

**LanchesterEvaluationFunction:**
```java
// Weight per unit type (tuned for map size):
W_LIGHT  = [1.75, 0.13]   // light units worth ~1.75x
W_RANGE  = [1.68, 0.03]   // ranged slightly less 
W_HEAVY  = [3.90, 0.16]   // heavy worth ~4x
W_WORKER = [0.18, -0.008] // workers nearly worthless militarily

// Score scales superlinearly with unit count:
score = sum(weight * hp) * nr_units^(order-1)
// where order = 1.7
```

This implements Lanchester's Square Law — military power scales with the *square* of unit count. Two tanks aren't twice as effective as one; they're ~3.25x as effective. **This is the correct model for RTS combat evaluation and should inform Iron Curtain's threat assessment.**

### What MicroRTS Teaches

1. **Computation budgets are essential:** Every AI technique needs a time/iteration cap. `AiStrategy::decide()` must be budget-bounded.
2. **Portfolio/script search beats raw MCTS at RTS scale:** Searching over role assignments is tractable; searching over individual unit actions is not (for 500+ units).
3. **Lanchester evaluation is correct for RTS:** Military power scales superlinearly with numbers. Our threat assessment should weight army *size squared*, not linear sum.
4. **Strategy classification enables adaptation:** Classify opponent → select counter = reactive and cheap. Better than pure planning for real-time adaptation.
5. **Hierarchical planning works:** Puppet (strategy) → PGS (assignment) → Script (execution) is a clean three-layer stack.
6. **Evaluation function design matters enormously:** `sqrt(hp/maxHP)` vs `hp/maxHP` vs Lanchester produce very different AI behavior. The evaluation function IS the AI's values.

---

## 8. Cross-Project Pattern Analysis

### Architectural Patterns

| Pattern                       |  RA   | Generals | OpenRA  | 0 A.D. | Spring | MicroRTS |
| ----------------------------- | :---: | :------: | :-----: | :----: | :----: | :------: |
| Priority/urgency cascade      |   ✓   |    ✓     |    ✓    |   ✓    |   —    |    —     |
| Timer/tick-gated execution    |   —   |    ✓     |    ✓    |   ✓    |   —    |    ✓     |
| Data-driven parameters        |   —   |    ✓     |    ✓    |   ✓    |   ✓    |    ✓     |
| Influence maps                |   —   |    —     | partial |   ✓    |   ✓*   |    —     |
| Fuzzy logic                   |   —   |    —     |    ✓    |   —    |   —    |    —     |
| Tree search (MCTS/minimax)    |   —   |    —     |    —    |   —    |   —    |    ✓     |
| Composition targets           |   ✓   |    ✓     |    ✓    |   ✓    |   —    |    —     |
| Modular managers              |   —   |    —     |    ✓    |   ✓    |   —    |    —     |
| Pluggable via trait/interface |   —   |    —     |    —    |   —    |   ✓    |    ✓     |
| Cheat-based difficulty        |   ✓   |    ✓     |    —    |   —    |   ✓    |    —     |
| Economic difficulty scaling   |   —   |    ✓     |    —    |   ✓    |   ✓    |    —     |
| Behavioral difficulty         |   —   |    —     |    —    |   ✓    |   —    |    —     |

\* Spring exposes maps to external AIs, which implement their own influence maps

### What No One Does

None of these projects use:
- **Behavior trees** for strategic AI (common in action games, apparently not in RTS)
- **GOAP** (Goal-Oriented Action Planning)
- **Utility AI** in its formal sense (continuous scoring across all possible actions)
- **Neural networks** for real-time decision-making (MicroRTS has NN experiments but none viable at real-time scale)
- **Active scouting** as a first-class AI behavior (all AIs are reactive to information, none proactively seek it)

The dominance of priority cascades + composition targeting + tick-gated evaluation suggests this pattern is a natural fit for RTS — or at minimum, it's the proven path.

### Performance Patterns

| Project      | AI Decision Frequency         | Approach                        |
| ------------ | ----------------------------- | ------------------------------- |
| EA Red Alert | Every tick                    | Cheap enough to afford          |
| EA Generals  | Multiple timers (50ms–2000ms) | Amortized by importance         |
| OpenRA       | Per-module ticking            | Each module has its own cadence |
| 0 A.D. Petra | Every 1–30 turns              | Staggered by expense            |
| MicroRTS     | Budget-capped per frame       | Hard time/iteration limit       |

The clear trend: **expensive decisions less often, cheap decisions more often.** Defense response is near-instant; wonder construction evaluation happens rarely.

### What Makes AI Feel Smart vs. Actually Being Smart

From studying these implementations, "smart-feeling" AI comes from:

1. **Reasonable army composition** — even RA's basic team-fill produces credible armies
2. **Timely attack execution** — not too early (suicide), not too late (boring)
3. **Resource management** — keeping harvesters active, not sitting on excess resources
4. **Responsive defense** — reacting to attacks within seconds, not minutes
5. **Appropriate surrender/all-in** — recognizing hopeless situations (RA's fire sale)

"Actually smart" AI (that humans don't notice) comes from:
1. **Good evaluation functions** (Lanchester over linear scoring)
2. **Spatial reasoning** (influence maps for building placement)
3. **Adaptation** (strategy classification → counter-selection)
4. **Information management** (scouting, memory of enemy positions)

Most players care about the first list. Competitive players care about both.

---

## 9. Recommendations for Iron Curtain

Based on this survey, here is what Iron Curtain's default AI (`PersonalityDrivenAi`, D041/D043) should implement, organized by development phase.

### Phase 4 Target: "Better Than RA, Comparable to OpenRA"

**Strategic architecture — Priority-based manager system:**
```
IcDefaultAi → AiStrategy trait impl
├── EconomyManager
│   ├── HarvesterController (nearest-resource, with danger avoidance)
│   ├── PowerMonitor (urgency-based power building)
│   └── ExpansionPlanner (when to build new base)
├── ProductionManager
│   ├── UnitCompositionTarget (share-based, like OpenRA)
│   ├── BuildOrderEvaluator (priority queue, like Petra)
│   └── StructurePlanner (influence-map placement, from Petra)
├── MilitaryManager
│   ├── AttackPlanner (composition targets + timing, from Petra)
│   ├── DefenseResponder (reactive, OpenRA-style)
│   └── SquadManager (unit grouping and assignment)
└── AiState (shared state: threat map, resource map, enemy scouting data)
```

**Key techniques to adopt:**
1. **Priority-based resource allocation** (from Petra's QueueManager) — single most impactful pattern
2. **Share-based unit composition** (from OpenRA) — self-correcting army building
3. **Influence map for building placement** (from 0 A.D.) — dramatically better base layout
4. **Tick-gated evaluation** (from Generals/Petra/MicroRTS) — essential for performance
5. **Fuzzy engagement logic** (from OpenRA) — better combat decisions than binary attack/flee
6. **Computation budget cap** (from MicroRTS) — AiStrategy::decide() must return within budget

**Evaluation/threat assessment:**
- Implement Lanchester-inspired threat scoring: threat = Σ(unit_dps × hp) × count^0.7
- This correctly values army concentration over distributed units
- Use sqrt(hp/maxHP) when evaluating our own damage taken (diminishing overkill return)

### Phase 5+ Enhancements

**Strategy classification and adaptation:**
- Track opponent behavior patterns (build timing, unit composition, attack frequency)
- Classify into archetypes: "rush", "turtle", "boom", "all-in"
- Select counter-strategy from personality parameters
- This is the MicroRTS SCV pattern applied at RTS scale

**Active scouting system:**
- No surveyed project does this well — opportunity to lead
- Periodically send cheap units to explore unknown areas
- Maintain "last seen" timestamps for enemy building locations
- Higher urgency scouting when opponent is quiet (they're probably teching up)

**Multi-pronged attacks:**
- Graduate from Petra/OpenRA's single-army-blob pattern
- Split forces based on attack plan (main force + flanking force)
- Coordinate timing via shared countdown
- This is where the `AiEventLog` (D041) becomes valuable — coordinate sub-plans

### What to Explicitly NOT Do

1. **Don't implement MCTS/minimax for strategic decisions.** The search space is too large for 500+ unit games. Use for micro-scale decisions only (if at all).
2. **Don't use behavior trees for the strategic AI.** Every surveyed RTS uses priority cascades or manager hierarchies, not BTs. BTs add complexity without proven benefit at this scale.
3. **Don't chase "optimal" AI at launch.** RA shipped with terrible AI and sold 10 million copies. The Remastered Collection shipped with the same terrible AI. Get a good-enough AI working, then iterate.
4. **Don't hardcode strategies.** Use YAML configuration (D043's approach is correct) so modders and the difficulty system can tune behavior without code.
5. **Don't skip the evaluation function.** A bad evaluation function makes every other AI component worse. Invest time in getting threat assessment right — it's the foundation everything else builds on.

### Performance Budget

Based on the efficiency pyramid (D015) and surveyed projects:

| AI Component                   | Frequency             | Target Time | Approach                   |
| ------------------------------ | --------------------- | ----------- | -------------------------- |
| Harvester assignment           | Every 4 ticks         | < 0.1ms     | Nearest-resource lookup    |
| Defense response               | Every tick (reactive) | < 0.1ms     | Event-driven, not polling  |
| Unit production                | Every 8 ticks         | < 0.2ms     | Priority queue evaluation  |
| Building placement             | On demand             | < 1.0ms     | Influence map lookup       |
| Attack planning                | Every 30 ticks        | < 2.0ms     | Composition check + timing |
| Strategic reassessment         | Every 60 ticks        | < 5.0ms     | Full state evaluation      |
| **Total per tick (amortized)** |                       | **< 0.5ms** | Budget for 500 units       |

Pre-allocate all AI working memory in `TickScratch`. Zero per-tick allocation. Influence maps are fixed-size arrays, cleared and rebuilt periodically.

---

## Source Summary

| Project        | Key AI Pattern                                        | Code Location                                                                |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| EA Red Alert   | Urgency cascade, team-fill production                 | `HOUSE.CPP` → `Expert_AI()`, `AI_Building()`, `AI_Unit()`, `AI_Attack()`     |
| EA Generals/ZH | Timer-based, wealth-aware, INI-driven teams           | `AIPlayer.cpp`, `AISkirmishPlayer.cpp`, `TAiData` INI structs                |
| EA Remastered  | No changes from 1996                                  | Same `HOUSE.CPP` via `DLLInterface.cpp`                                      |
| OpenRA         | Modular bot modules, fuzzy logic, share-based         | `Modules/BotModules/*.cs`, `AttackOrFleeFuzzy.cs`                            |
| 0 A.D. Petra   | Influence maps, priority queues, manager hierarchy    | `simulation/ai/petra/*.js` (headquarters.js, queueManager.js, attackPlan.js) |
| Spring Engine  | External AI plugins, unit CommandAI hierarchy         | `rts/ExternalAI/`, `rts/Sim/Units/CommandAI/`                                |
| MicroRTS       | MCTS, portfolio search, evaluation functions, budgets | `src/ai/mcts/`, `src/ai/evaluation/`, `src/ai/portfolio/`                    |
