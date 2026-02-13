# RTS AI Extensibility Survey

> Research findings on how open-source and notable RTS projects handle AI extensibility, difficulty levels, and community AI contributions. Conducted 2026-02 across 7 projects. All findings are sourced from public source code, documentation, and wiki pages — not speculation.

## Table of Contents

1. [Spring Engine / BAR](#1-spring-engine--bar)
2. [0 A.D. (Pyrogenesis)](#2-0-ad-pyrogenesis)
3. [OpenRA](#3-openra)
4. [MicroRTS](#4-microrts)
5. [BWAPI (StarCraft: Brood War)](#5-bwapi-starcraft-brood-war)
6. [Age of Empires II](#6-age-of-empires-ii)
7. [Wargus / Stratagus](#7-wargus--stratagus)
8. [Cross-Project Comparison](#8-cross-project-comparison)
9. [Lessons for Iron Curtain](#9-lessons-for-iron-curtain)

---

## 1. Spring Engine / BAR

**Source:** Spring Engine wiki, GitHub `spring/spring` repo, BAR community wiki

### Architectural Separation

Spring uses a **two-layer plugin architecture** — the most sophisticated AI integration of any open-source RTS:

1. **AI Interfaces** — plugins for the engine that provide language bindings (C, C++, Java, Lua, Python, C#)
2. **Skirmish AIs** — plugins for AI Interfaces that implement actual game-playing behavior

This separation means AI authors can write in any supported language without touching the engine. The engine communicates with AI Interfaces through a **C function-pointer struct**, and AI Interfaces translate between the engine's C API and their target language.

#### Core API: `SSkirmishAILibrary`

```c
struct SSkirmishAILibrary {
    int (*init)(int skirmishAIId, const SSkirmishAICallback* callback);
    int (*release)(int skirmishAIId);
    int (*handleEvent)(int skirmishAIId, int topicId, const void* data);
};
```

The `init` function receives a massive callback struct (`SSkirmishAICallback`) with hundreds of function pointers for querying game state:

```c
// Examples from SSkirmishAICallback (abbreviated):
float (*Economy_getIncome)(int skirmishAIId, int resourceId);
int   (*getEnemyUnits)(int skirmishAIId, int* unitIds, int unitIds_sizeMax);
float (*Unit_getHealth)(int skirmishAIId, int unitId);
int   (*Unit_getDef)(int skirmishAIId, int unitId);
float (*Unit_getMaxSpeed)(int skirmishAIId, int unitId);
int   (*Map_getWidth)(int skirmishAIId);
// ... hundreds more
```

#### Event System

All AI behavior is **event-driven**. The engine pushes events through `handleEvent()`:

| Event Constant          | When Fired                            |
| ----------------------- | ------------------------------------- |
| `EVENT_INIT`            | AI initialized                        |
| `EVENT_RELEASE`         | AI shutting down                      |
| `EVENT_UPDATE`          | Every game frame                      |
| `EVENT_UNIT_CREATED`    | Own unit starts building              |
| `EVENT_UNIT_FINISHED`   | Own unit completes                    |
| `EVENT_UNIT_IDLE`       | Own unit has no orders                |
| `EVENT_UNIT_DAMAGED`    | Own unit takes damage                 |
| `EVENT_UNIT_DESTROYED`  | Own unit dies                         |
| `EVENT_UNIT_GIVEN`      | Unit transferred to this player       |
| `EVENT_UNIT_CAPTURED`   | Unit captured by another player       |
| `EVENT_ENEMY_CREATED`   | Enemy unit spotted being built        |
| `EVENT_ENEMY_FINISHED`  | Enemy unit completes                  |
| `EVENT_ENEMY_ENTER_LOS` | Enemy enters line of sight            |
| `EVENT_ENEMY_LEAVE_LOS` | Enemy leaves line of sight            |
| `EVENT_ENEMY_DESTROYED` | Known enemy unit destroyed            |
| `EVENT_WEAPON_FIRED`    | Own unit fires weapon                 |
| `EVENT_MESSAGE`         | Chat message received                 |
| `EVENT_LUA_MESSAGE`     | Lua widget/gadget sends message to AI |

#### OO Wrappers

The raw C API is wrapped into idiomatic OO interfaces for each language:

**Legacy C++ wrapper (`IGlobalAI`):**
```cpp
class IGlobalAI {
    virtual void InitAI(IGlobalAICallback* callback, int team) = 0;
    virtual void UnitCreated(int unit) = 0;
    virtual void UnitFinished(int unit) = 0;
    virtual void UnitDestroyed(int unit, int attacker) = 0;
    virtual void EnemyCreated(int enemy) = 0;
    virtual void EnemyEnterLOS(int enemy) = 0;
    virtual void Update() = 0;
    // ...
};
```

**Java OO wrapper (`OOAI`):**
```java
public class OOAI {
    public int unitCreated(Unit unit, Unit builder) { return 0; }
    public int unitFinished(Unit unit) { return 0; }
    public int update(int frame) { return 0; }
    public int enemyEnterLOS(Unit enemy) { return 0; }
    // ...
}
```

### Difficulty Modeling

Spring Engine itself does **not** provide a built-in difficulty system. Difficulty is handled entirely within individual AI implementations. Each AI manages its own difficulty parameters — some use handicaps (resource bonuses/penalties), some adjust aggressiveness, some limit APM. This is a deliberate design choice: the engine provides maximum flexibility, the AI author decides what "difficulty" means.

### Community Extensibility & Distribution

Community AI ecosystem is **extensive** — the most mature of any open-source RTS:

| AI Name    | Language | Status     | Focus              |
| ---------- | -------- | ---------- | ------------------ |
| AAI        | C++      | Active     | General purpose    |
| BAI        | C++      | Historical |                    |
| KAIK       | C++      | Historical | Multi-threaded     |
| RAI        | C++      | Historical |                    |
| E323AI     | C++      | Active     | Economic focus     |
| Shard      | Lua      | Active     | Scripted behaviors |
| NTai       | C++      | Historical |                    |
| C.R.A.I.G. | C++      | Active     |                    |

AIs are distributed as **separate directories** alongside the engine installation. Engine commands enable runtime AI management:
- `/ailist` — list available AIs
- `/aireload` — hot-reload an AI
- `/aikill` — terminate an AI player
- `/aicontrol` — reassign AI control

### Key Takeaways

- Two-layer plugin architecture provides maximum language flexibility at the cost of API complexity
- Event-driven design (not polling) is the right model for deterministic simulation
- Hundreds of callback functions = large API surface to maintain, but AIs get full game state access
- No built-in difficulty system — delegates entirely to AI implementations
- Largest community AI ecosystem of any open-source RTS, proving the architecture works

---

## 2. 0 A.D. (Pyrogenesis)

**Source:** GitHub `0ad/0ad`, specifically `binaries/data/mods/public/simulation/ai/petra/config.js`

### Architectural Separation

0 A.D. uses a **JavaScript AI framework** where AI code lives in `binaries/data/mods/public/simulation/ai/`. The built-in AI is called **Petra** (replaced the earlier QBOT AI). AIs are implemented as JavaScript modules that the engine loads and calls each turn.

The AI framework provides a structured API through objects like `gameState`, `SharedScript`, and `PlayerData`. AIs do not have direct access to engine internals — they query through the framework's API layer.

### Difficulty Modeling

Petra has the most **explicitly parameterized** difficulty system of any project surveyed. Six discrete levels with a continuous personality overlay:

#### Difficulty Constants
```javascript
PETRA.DIFFICULTY_SANDBOX   = 0;
PETRA.DIFFICULTY_VERY_EASY = 1;
PETRA.DIFFICULTY_EASY      = 2;
PETRA.DIFFICULTY_MEDIUM    = 3;
PETRA.DIFFICULTY_HARD      = 4;
PETRA.DIFFICULTY_VERY_HARD = 5;
```

#### Personality System
```javascript
// Continuous personality axes (0.0 to 1.0)
this.personality = {
    aggressive:  0.5,
    cooperative: 0.5,
    defensive:   0.5
};

// Named presets with min/max ranges
//   "random"     → aggressive: [0.0, 1.0], cooperative: [0.0, 1.0], defensive: [0.0, 1.0]
//   "defensive"  → aggressive: [0.0, 0.3], cooperative: [0.5, 0.9], defensive: [0.7, 1.0]
//   "balanced"   → aggressive: [0.4, 0.6], cooperative: [0.3, 0.7], defensive: [0.4, 0.6]
//   "aggressive" → aggressive: [0.7, 1.0], cooperative: [0.0, 0.4], defensive: [0.0, 0.3]

// Personality cuts for branching behavior
this.cut = { weak: 0.3, medium: 0.5, strong: 0.7 };
```

#### Difficulty Affects Concrete Parameters

```javascript
// Population scaling by difficulty
if (this.difficulty < PETRA.DIFFICULTY_EASY)
    this.popScaling = 0.5;
else if (this.difficulty < PETRA.DIFFICULTY_MEDIUM)
    this.popScaling = 0.75;
else
    this.popScaling = 1.0;

// Economy
this.Economy = {
    supportRatio:     (difficulty >= HARD) ? 0.3 : 0.4,
    targetNumWorkers: (difficulty >= HARD) ? 85 : (difficulty >= MEDIUM) ? 75 : 55,
    targetNumTraders: (difficulty >= HARD) ? 5 : 3,
};

// Military
this.Military = {
    numSentryTowers: (difficulty >= HARD) ? 3 : (difficulty >= MEDIUM) ? 1 : 0,
};
```

#### Cheat-Based Bonuses (Engine Level)

```javascript
// Resource gathering rate multipliers per difficulty
const rate = [0.42, 0.56, 0.75, 1.00, ...]; // sandbox→very hard
// Build time multipliers per difficulty
const time = [...];
// Applied via game engine modifier system — AI gets inherent bonuses
```

This is a **two-axis system**: the engine provides resource/build-time multipliers that scale the AI's raw capability, while the AI script adjusts its strategic behavior (what to build, how aggressively to attack).

### Community Extensibility

Custom AIs can be created as new directories in `simulation/ai/`. The framework provides standard interfaces. Community contribution is possible but the ecosystem is smaller than Spring's — most players use Petra with difficulty/personality adjustments.

### Key Takeaways

- Cleanest difficulty parameterization of any project surveyed
- Two-axis difficulty: engine-level cheats (resource bonuses) + script-level behavior (strategy adjustment)
- Continuous personality system allows fine-grained behavioral blending without discrete "personality" enum values
- JavaScript AI framework makes modding accessible but limits performance for complex algorithms
- Named personality cuts (`weak`/`medium`/`strong`) at 0.3/0.5/0.7 enable discontinuous behavior thresholds within the continuous system

---

## 3. OpenRA

**Source:** GitHub `OpenRA/OpenRA`, `mods/ra/rules/ai.yaml`, `mods/cnc/rules/ai.yaml`, `OpenRA.Mods.Common/Traits/BotModules/`

### Architectural Separation

OpenRA uses a **trait-based modular system** that composes AI behavior from independent `BotModule` traits attached to the `Player` actor. This is the most data-driven AI architecture surveyed — all AI parameters live in YAML, not code.

#### Bot Module Inventory

| Module                         | Responsibility                  |
| ------------------------------ | ------------------------------- |
| `BaseBuilderBotModule`         | Base construction strategy      |
| `BuildingRepairBotModule`      | Auto-repair damaged buildings   |
| `CaptureManagerBotModule`      | Capture enemy/neutral buildings |
| `HarvesterBotModule`           | Harvester management            |
| `McvExpansionManagerBotModule` | Expansion with MCVs             |
| `McvManagerBotModule`          | MCV deployment decisions        |
| `MinelayerBotModule`           | Mine placement                  |
| `PowerDownBotModule`           | Low-power building management   |
| `ResourceMapBotModule`         | Resource location scouting      |
| `SquadManagerBotModule`        | Combat unit grouping & assault  |
| `SupportPowerBotModule`        | Superweapon usage               |
| `UnitBuilderBotModule`         | Unit production priorities      |

Each module implements interfaces:
```csharp
// C# interfaces for bot behavior
IBotTick                // Called every N ticks
IBotRespondToAttack     // React to being attacked
IBotPositionsUpdated    // React to map position updates
```

Modules extend `ConditionalTrait<TInfo>`, meaning each module can be enabled/disabled per bot type via conditions.

#### Condition-Based Bot Activation

```yaml
# From mods/ra/rules/ai.yaml
Player:
    ModularBot@RushAI:
        Name: bot-rush-ai.name
        Type: rush
    ModularBot@NormalAI:
        Name: bot-normal-ai.name
        Type: normal
    ModularBot@TurtleAI:
        Name: bot-turtle-ai.name
        Type: turtle
    ModularBot@NavalAI:
        Name: bot-naval-ai.name
        Type: naval

    GrantConditionOnBotOwner@rush:
        Condition: enable-rush-ai
        Bots: rush
    GrantConditionOnBotOwner@normal:
        Condition: enable-normal-ai
        Bots: normal
    # ... etc
```

Each module has a `RequiresCondition` that gates it to specific bot types:
```yaml
BaseBuilderBotModule@rush:
    RequiresCondition: enable-rush-ai
    # ... rush-specific parameters

BaseBuilderBotModule@normal:
    RequiresCondition: enable-normal-ai
    # ... normal-specific parameters
```

### Difficulty Modeling

OpenRA does **not** have discrete difficulty levels. Instead, "difficulty" emerges from the parameter values on each bot module. Different named bots have different YAML configurations:

#### Rush AI vs Normal AI vs Turtle AI (concrete parameter differences)

| Parameter                  | Rush      | Normal    | Turtle                 |
| -------------------------- | --------- | --------- | ---------------------- |
| `SquadSize`                | 20        | 40        | 10                     |
| `MinimumExcessPower`       | 0         | 0         | 20                     |
| `MaximumExcessPower`       | 160       | 200       | 250                    |
| `InitialHarvesters`        | 2         | 4         | 4                      |
| `RushInterval`             | (default) | (default) | 100000                 |
| `MinimumAttackForceDelay`  | (default) | (default) | 100000                 |
| Building barracks limit    | 7         | 7         | 1                      |
| Defense building fractions | Low       | Medium    | High (pbox:13, gun:12) |
| `ProtectUnitScanRadius`    | (default) | 15        | 30                     |

#### Unit Production Weights (UnitBuilderBotModule)

```yaml
# Rush AI — infantry-heavy, no air/naval
UnitsToBuild:
    e1: 65      # Rifle Infantry
    2tnk: 50    # Heavy Tank
    harv: 10    # Harvester (low priority)
UnitLimits:
    harv: 8
    dog: 4

# Normal AI — balanced, includes air/naval
UnitsToBuild:
    e1: 65
    2tnk: 50
    heli: 30    # Helicopters
    ss: 10      # Submarines
UnitLimits:
    harv: 8

# Turtle AI — defense-heavy, mines
UnitsToBuild:
    ftrk: 50    # Flak truck (high)
    mnly: 2     # Minelayer
UnitLimits:
    mnly: 2     # Capped
```

#### Support Power Decision System

```yaml
SupportPowerBotModule:
    Decisions:
        nukepower:
            OrderName: NukePowerInfoOrder
            MinimumAttractiveness: 3000
            Consideration@1:
                Against: Enemy
                Types: Structure
                Attractiveness: 1
                TargetMetric: Value
                CheckRadius: 5c0
            Consideration@2:
                Against: Ally
                Types: Air, Ground, Water
                Attractiveness: -10   # Avoid friendly fire
                TargetMetric: Value
                CheckRadius: 7c0
```

The `SquadManagerBotModule` uses fuzzy logic for attack/retreat decisions: `AttackOrFleeFuzzy.Rush.CanAttack()`.

#### TD Module (mods/cnc/rules/ai.yaml)

CnC/TD uses named bot personalities instead of behavioral archetypes:
- **Cabal** — aggressive (SquadSize: 50, RushInterval: 1000)
- **Watson** — moderate (SquadSize: 15)
- **HAL 9001** — balanced (SquadSize: 15, more unit variety)

### Community Extensibility

Modders create custom bots by:
1. Defining new `ModularBot` entries in YAML
2. Setting up `GrantConditionOnBotOwner` conditions
3. Adding per-module parameter overrides
4. No code required — purely data-driven configuration

Limitations: Custom *code* modules require C# and recompilation. The bot module interfaces (`IBotTick`, etc.) are C#-only. YAML can only parameterize existing modules, not create new behavioral patterns.

### Key Takeaways

- Most data-driven AI of any project — all parameters in YAML
- Composable module system via conditions is elegant and mod-friendly
- No discrete "difficulty" concept — difficulty is implicit in which bot you select and its parameter values
- Fuzzy logic for tactical decisions (attack/flee) adds sophistication
- Support power targeting uses a weighted consideration system — good model for Iron Curtain
- Limitation: custom behavior requires C# code, not just YAML. This is a modding ceiling.

---

## 4. MicroRTS

**Source:** GitHub `santiontanon/microrts`, `Farama-Foundation/MicroRTS-Py`

### Architectural Separation

MicroRTS was designed from the ground up as an **AI research platform**, not a commercial game. Its AI interface is the simplest and most academically-oriented of any project surveyed.

#### Abstract AI Class

```java
public abstract class AI {
    // Called when game starts or resets
    public abstract void reset();
    public void reset(UnitTypeTable utt) { reset(); }

    // Core: return actions for this player this frame
    public abstract PlayerAction getAction(int player, GameState gs)
        throws Exception;

    // Required: AI must be cloneable for tournament evaluation
    public abstract AI clone();

    // Required: expose tunable parameters for automated search
    public abstract List<ParameterSpecification> getParameters();

    // Optional: pre-game analysis (map scouting before match starts)
    public void preGameAnalysis(GameState gs, long milliseconds) {}
    public void preGameAnalysis(GameState gs, long ms, String readWriteFolder) {}

    // Optional: notification when game ends
    public void gameOver(int winner) {}

    // Optional: statistics for logging
    public String statisticsString() { return "";  }
}
```

Key design decisions:
- **`getAction()`** receives the full `GameState` — no fog of war by default (configurable)
- **`getParameters()`** enables automated parameter tuning and tournament systems
- **`clone()`** is required for the tournament framework to instantiate fresh copies
- **`preGameAnalysis()`** allows map analysis before the game clock starts

#### Built-in AI Implementations

| AI               | Strategy                              |
| ---------------- | ------------------------------------- |
| `RandomBiasedAI` | Random valid actions with attack bias |
| `WorkerRushAI`   | Rush with workers immediately         |
| `LightRushAI`    | Rush with light military units        |
| `CoacAI`         | More sophisticated strategy           |

### Difficulty Modeling

No built-in difficulty system. Since MicroRTS is a research platform, "difficulty" is measured by the AI algorithm's strength, evaluated through tournament play with **TrueSkill ratings** (stored in `experiments/league.db`).

### Community Extensibility & Academic Integration

#### MicroRTS-Py (OpenAI Gym Wrapper)

```python
# Gym-compatible environment for RL research
import gym
env = gym.make("MicroRTS-v0")

# Observation space: spatial grid with 29 feature planes
# Box(low=0, high=1, shape=(height, width, 29), dtype=int32)

# Action space: multi-discrete per cell
# MultiDiscrete([...])

# Training with PPO:
# python ppo_gridnet.py --total-timesteps 100000000
```

#### Socket-Based External AI

MicroRTS supports a **client-server mode** where external AI processes connect via socket and send/receive game state as serialized data. This enables:
- Any language for AI implementation
- Remote AI execution
- Integration with ML frameworks (PyTorch, TensorFlow)

#### Competition Infrastructure

- **Annual competition** at IEEE Conference on Games (CoG) / IEEE Conference on Computational Intelligence and Games (CIG)
- TrueSkill-based evaluation
- Published academic papers: CoG 2021, AAAI RLG 2021, AIIDE 2019/2020/2022
- Now maintained by **Farama Foundation** (same organization behind Gymnasium, formerly OpenAI Gym)

### Key Takeaways

- Simplest AI interface (one method: `getAction()`) is sufficient for research
- `getParameters()` requirement enables automated parameter tuning — **Iron Curtain should adopt this pattern** for `AiStrategy` implementations
- Gym wrapper proves that RTS AI can be made RL-friendly with proper observation/action space design
- Socket-based external AI enables polyglot AI development without engine modifications
- TrueSkill evaluation provides objective difficulty ranking without manually-defined difficulty levels
- Deprecated in favor of Gymnasium ecosystem (Aug 2025) — lesson: academic platforms need long-term maintenance plans

---

## 5. BWAPI (StarCraft: Brood War)

**Source:** GitHub `bwapi/bwapi`, BWAPI documentation

### Architectural Separation

BWAPI (Brood War Application Programming Interface) takes a **DLL injection** approach: AI code is compiled as a Windows DLL, injected into the running StarCraft process via Chaoslauncher. The AI communicates with the game through a global `BWAPI::Broodwar` interface object.

#### AIModule Virtual Class

```cpp
class AIModule {
public:
    virtual void onStart() {}
    virtual void onEnd(bool isWinner) {}
    virtual void onFrame() {}              // Called every game frame
    virtual void onSendText(std::string text) {}
    virtual void onReceiveText(BWAPI::Player player, std::string text) {}
    virtual void onPlayerLeft(BWAPI::Player player) {}
    virtual void onNukeDetect(BWAPI::Position target) {}
    virtual void onUnitDiscover(BWAPI::Unit unit) {}   // Unit first seen
    virtual void onUnitEvade(BWAPI::Unit unit) {}      // Unit leaves vision
    virtual void onUnitShow(BWAPI::Unit unit) {}       // Unit becomes visible
    virtual void onUnitHide(BWAPI::Unit unit) {}       // Unit becomes invisible
    virtual void onUnitCreate(BWAPI::Unit unit) {}
    virtual void onUnitDestroy(BWAPI::Unit unit) {}
    virtual void onUnitMorph(BWAPI::Unit unit) {}      // Zerg morphing
    virtual void onUnitRenegade(BWAPI::Unit unit) {}   // Player changes
    virtual void onSaveGame(std::string gameName) {}
    virtual void onUnitComplete(BWAPI::Unit unit) {}
};
```

Notable design: `onFrame()` is the primary decision point (polling, not purely event-driven). Events (`onUnitCreate`, etc.) are supplementary notifications. This differs from Spring's purely event-driven model.

#### Game Interface

```cpp
// Global game interface — AI accesses everything through this
BWAPI::Game* Broodwar;

// Examples:
Broodwar->self()->getUnits();           // Own units
Broodwar->enemy()->getUnits();          // Enemy units (if visible)
Broodwar->getMap();                     // Map data
Broodwar->canBuildHere(tilePos, type);  // Build placement check
```

Fog of war is **enforced by default** (non-cheating flag). AIs can only see what a human player would see. Cheating flags can be enabled for research:
- `Flag::CompleteMapInformation` — removes fog
- `Flag::UserInput` — allows human input alongside AI

### Difficulty Modeling

No built-in difficulty system in BWAPI itself. Difficulty emerges from the AI implementation's sophistication. The competition ecosystem provides objective ranking.

### Community Extensibility & Competition

BWAPI has the **most active competitive AI ecosystem** of any project surveyed:

| Competition                    | Venue                           | Format               |
| ------------------------------ | ------------------------------- | -------------------- |
| AIIDE StarCraft AI Competition | AAAI AIIDE conference           | Academic, annual     |
| IEEE CoG StarCraft Competition | IEEE CoG conference             | Academic, annual     |
| SSCAI Tournament               | Student StarCraft AI Tournament | Continuous, 24/7     |
| BWAPI Bots Ladder              | Community-run                   | Continuous ELO-based |

#### DLL Distribution

AIs are distributed as compiled DLLs placed in `bwapi-data/AI/`. This has trade-offs:
- **Pro:** Any C++ code can be an AI, maximum performance
- **Con:** Windows-only, binary distribution, no sandboxing, potential for malicious code

#### Tournament Module

BWAPI includes a **Tournament Module** (`TournamentModule`) that acts as referee:
- Enforces game rules
- Prevents illegal actions
- Standardizes match conditions
- Enables automated tournament execution

#### Language Wrappers

While native C++, BWAPI has community wrappers for Java (via JNI), Python (via ctypes), and other languages.

### Key Takeaways

- DLL injection is Windows-only and unsandboxed — the opposite of Iron Curtain's WASM mod security model
- `onFrame()` polling + event callbacks is a practical hybrid approach
- Fog of war enforcement by default with opt-in cheating flags is exactly what Iron Curtain needs for `AiStrategy` vs debug/training modes
- Tournament Module concept (referee process) is valuable for Iron Curtain's ranked mode
- The most competitive AI ecosystem proves that a good API + competition framework = vibrant community
- Binary DLL distribution = zero sandboxing. This is the cautionary tale that motivates Iron Curtain's WASM approach

---

## 6. Age of Empires II

**Source:** airef.github.io (AoE2 AI Scripting Encyclopedia), community documentation

### Architectural Separation

AoE2 uses a **custom rule-based scripting language** embedded in the game engine. This is NOT a general-purpose language — it's a domain-specific language (DSL) with its own parser, rule evaluation engine, and set of commands/parameters.

#### Rule Structure

```
(defrule
    (condition1)
    (condition2)
=>
    (action1)
    (action2)
)
```

Rules are evaluated continuously. When all conditions are true, actions fire.

```
; Example: Build houses when population headroom is low
(defrule
    (housing-headroom < 5)
    (can-build house)
=>
    (build house)
)

; Example: Attack when army size is sufficient
(defrule
    (military-population > 40)
    (current-age >= castle-age)
=>
    (attack-now)
)
```

### Strategic Numbers (The Knob System)

AoE2's AI has **512 strategic number slots** (IDs 0-511), of which ~307 are actively used. These are the primary mechanism for tuning AI behavior — each is an integer value the AI script can read and write at runtime.

Representative strategic numbers (from airef.github.io):

| ID  | Strategic Number                       | Default | Purpose                              |
| --- | -------------------------------------- | ------- | ------------------------------------ |
| 0   | `sn-percent-civilian-explorers`        | 34      | % of civilians assigned to explore   |
| 16  | `sn-minimum-attack-group-size`         | 4       | Min units before attacking           |
| 26  | `sn-maximum-attack-group-size`         | 10      | Max units in attack group            |
| 73  | `sn-minimum-town-size`                 | 12      | Min tiles for town boundary          |
| 74  | `sn-maximum-town-size`                 | 20      | Max tiles for town boundary          |
| 104 | `sn-initial-attack-delay`              | 0       | Seconds before first attack          |
| 117 | `sn-food-gatherer-percentage`          | 0       | % of gatherers on food               |
| 118 | `sn-gold-gatherer-percentage`          | 0       | % of gatherers on gold               |
| 119 | `sn-stone-gatherer-percentage`         | 0       | % of gatherers on stone              |
| 120 | `sn-wood-gatherer-percentage`          | 0       | % of gatherers on wood               |
| 189 | `sn-aggressiveness`                    | 50      | (Unused — available as custom goal)  |
| 229 | `sn-do-not-scale-for-difficulty-level` | 0       | Opt out of engine difficulty scaling |

#### Engine Difficulty Scaling

The magic strategic number: **`sn-do-not-scale-for-difficulty-level`** (ID 229). When 0, the engine automatically scales certain AI behaviors based on the game's difficulty setting. When 1, the AI script takes full control. This reveals that the engine has a built-in difficulty modifier system that AI scripts can opt out of.

Related reaction-percentage SNs:
- `sn-easiest-reaction-percentage` (ID 218, default 100) — scales AI reaction speed at easiest difficulty
- `sn-easier-reaction-percentage` (ID 219, default 100) — scales AI reaction speed at easier difficulty

#### Direct Unit Control (DUC)

Modern AoE2 DE added **Direct Unit Control** — enabling AI scripts to issue commands to individual units (move, attack, garrison) rather than just setting high-level strategic parameters. This dramatically increased AI sophistication and is considered a watershed feature by the community.

### Community Extensibility

AoE2 has the **longest-lived AI modding community** of any project surveyed — **20+ years** of continuous activity:

- **AI Scripters Discord** — active community server
- **AI Scripters Forums** (forums.aiscripters.com) — decades of discussion archives
- **AI Ladder** (Google Sheets) — community-maintained rankings
- **AI Tournaments History** — documented competitive history
- **VS Code Extension** for AI scripting (`aoe2-aiscript`)
- **AoE AI Database** (aoeaidatabase.pythonanywhere.com) — Elo rankings per AI
- **YouTube tutorial series** from multiple creators
- **Cross-version compatibility**: same core AI engine across CD, HD, UserPatch, and Definitive Edition

AI scripts are distributed as `.per` (personality) files. The game loads them from the AI directory. No compilation required.

### Key Takeaways

- Rule-based DSL is extremely accessible to non-programmers — lowest barrier to entry of any project
- Strategic numbers as a "knob system" is an excellent parameterization model — Iron Curtain's `PersonalityDrivenAi` (D043) should use a similar approach
- 512 strategic number slots = far more parameters than any AI author typically uses, proving that over-provisioning parameter space is better than under-provisioning
- Engine-level difficulty scaling that AI scripts can opt out of is a clean separation of concerns
- 20+ year community longevity proves that a simple, stable API with good documentation outlasts technically superior but unstable alternatives
- Direct Unit Control (DUC) as a later addition shows that starting with high-level strategic APIs and adding low-level unit control later is a viable evolution path

---

## 7. Wargus / Stratagus

**Source:** GitHub `Wargus/stratagus`, `src/ai/script_ai.cpp`, `doc/scripts/ai.html`

### Architectural Separation

Stratagus uses **Lua-scripted AI** with a sequential execution model. AI scripts are Lua functions that execute as coroutine-like sequences of commands. The engine provides a set of C-registered Lua functions for AI control.

#### DefineAi — AI Registration

```lua
DefineAi("ai-name", "race", "ai-class", function()
    -- AI script function
end)
```

Parameters:
- **name:** Unique AI identifier
- **race:** Race restriction ("*" for any race)
- **class:** Category ("passive", "land-attack", "sea-attack", "air-attack")
- **script:** Lua function containing the AI logic

#### Lua AI API Functions

```lua
-- Registered C functions available to AI scripts:
AiNeed("unit-type")           -- Request building/training a unit
AiSet("unit-type", count)     -- Set desired count of a unit type
AiWait("unit-type")           -- Block until unit is ready
AiForce(id, {"unit-type", count, ...})  -- Define a military force
AiForceRole(id, "attack"|"defend")      -- Set force role
AiWaitForce(id)               -- Block until force is assembled
AiAttackWithForce(id)         -- Send force to attack
AiSleep(cycles)               -- Wait N game cycles
AiResearch("upgrade-name")    -- Research an upgrade
AiUpgradeTo("unit-type")      -- Upgrade a building
AiSetCollect({0,50,50,0,0,0,0})  -- Set resource gathering priorities
AiSetReserve({...})           -- Set resource reserves
AiGetSleepCycles()            -- Get recommended sleep duration
AiGetRace()                   -- Get current player's race
AiPlayer()                    -- Get current player number
AiDump()                      -- Debug: print AI state
AiDebug(true|false)           -- Enable/disable debug output
AiLoop(table, index)          -- Loop through a table of functions
```

#### Typical AI Script Pattern

```lua
local simple_ai_loop = {
    function() return AiSleep(9000) end,
    function()
        stratagus.gameData.AIState.loop_index[1 + AiPlayer()] = 0
        return false
    end,
}

local simple_ai = {
    function() return AiSleep(AiGetSleepCycles()) end,
    function() return AiNeed("unit-town-hall") end,
    function() return AiWait("unit-town-hall") end,
    function() return AiSet("unit-peasant", 4) end,
    function() return AiNeed("unit-human-barracks") end,
    function() return AiWait("unit-human-barracks") end,
    function() return AiForce(1, {"unit-footman", 3}) end,
    function() return AiForceRole(1, "attack") end,
    function() return AiWaitForce(1) end,
    function() return AiAttackWithForce(1) end,
    function() return AiLoop(simple_ai_loop, stratagus.gameData.AIState.loop_index) end,
}

function custom_ai()
    return AiLoop(simple_ai, stratagus.gameData.AIState.index)
end

DefineAi("example_ai", "human", "class_ai", custom_ai)
```

#### Internal Data Structures

```cpp
// C++ side: PlayerAi struct
class PlayerAi {
    CPlayer *Player;
    CAiType *AiType;
    std::string Script;
    unsigned long SleepCycles;
    AiForceManager Force;
    int Reserve[MaxCosts];
    int Collect[MaxCosts];
    int Needed[MaxCosts];
    bool BuildDepots;
    // ...
};
```

### Difficulty Modeling

No formal difficulty system. The engine's own documentation admits: *"Stratagus uses a very simple scripted AI. There are no optimizations yet. The complete AI was written on one weekend."*

Different AI scripts provide different challenge levels:
- `"passive"` class — does nothing
- `"land-attack"` class — basic land assault
- `"sea-attack"` class — includes naval units
- `"air-attack"` class — includes air units

### Community Extensibility

AI scripts are Lua files in the game's scripts directory. Modders add new AIs by writing Lua files and registering them with `DefineAi()`. The barrier to entry is low (Lua is simple), but the API is limited — the AI can only issue high-level commands, not make fine-grained tactical decisions.

### Key Takeaways

- Sequential Lua scripting is the simplest implementation model — easy to understand, easy to write
- `AiForce()` / `AiForceRole()` / `AiAttackWithForce()` — the force composition API is a clean abstraction for army management
- `AiSetCollect({0,50,50,0,0,0,0})` — resource priority as a percentage vector is a simple, effective interface
- The "written in one weekend" comment is a warning: simple APIs need ongoing investment to become competitive
- Sequential blocking model (`AiWait`/`AiSleep`) doesn't scale to reactive AI — a reactive event-driven model is better for sophisticated behavior
- Lua embedding for AI is proven and accessible, but needs game-specific API design investment to be powerful

---

## 8. Cross-Project Comparison

### Architecture Patterns

| Project       | AI Language              | Interface Model                 | Separation Quality                       |
| ------------- | ------------------------ | ------------------------------- | ---------------------------------------- |
| Spring Engine | C/C++/Java/Lua/Python/C# | Two-layer plugin (event-driven) | Excellent — full plugin isolation        |
| 0 A.D.        | JavaScript               | Framework with API objects      | Good — AI in separate directory          |
| OpenRA        | C# (data in YAML)        | Trait-based modules             | Good — YAML data / C# code split         |
| MicroRTS      | Java (Python via Gym)    | Abstract class + socket         | Excellent — clean `getAction()` boundary |
| BWAPI         | C++ (wrappers available) | DLL injection + virtual class   | Moderate — DLL injection, shares process |
| AoE2          | Custom DSL               | Rule-based engine               | Good — completely separate scripting     |
| Stratagus     | Lua                      | C-registered functions          | Moderate — Lua and C++ share state       |

### Difficulty Systems

| Project       | Approach                                             | Levels                              | Customizable?               |
| ------------- | ---------------------------------------------------- | ----------------------------------- | --------------------------- |
| Spring Engine | AI-specific (no engine support)                      | Varies by AI                        | Per-AI                      |
| 0 A.D.        | Engine cheats + script parameters + personality axes | 6 levels + continuous personality   | Yes — per axis              |
| OpenRA        | Named bot presets with different YAML parameters     | 4 bot types (RA), 3 bot types (TD)  | Yes — YAML editable         |
| MicroRTS      | No levels — TrueSkill ranking                        | N/A (research platform)             | N/A                         |
| BWAPI         | No levels — competition ranking                      | N/A (competition platform)          | N/A                         |
| AoE2          | Engine scaling + strategic numbers + DSL rules       | Engine: 5 levels, Script: unlimited | Yes — 307 strategic numbers |
| Stratagus     | Script-defined (passive/land/sea/air classes)        | ~4 classes                          | Yes — write new Lua scripts |

### Community AI Ecosystem Maturity

| Project       | Active AIs           | Distribution           | Competition?            | Community Longevity |
| ------------- | -------------------- | ---------------------- | ----------------------- | ------------------- |
| Spring Engine | 10+ community AIs    | Files alongside engine | Informal                | ~15 years           |
| 0 A.D.        | 1 (Petra) + mods     | Mod directory          | No                      | ~10 years           |
| OpenRA        | Built-in only        | YAML in mod rules      | No                      | ~10 years           |
| MicroRTS      | Research AIs         | Source code            | Yes (IEEE CoG)          | ~8 years            |
| BWAPI         | 50+ competition bots | DLL files              | Yes (AIIDE, SSCAI, CoG) | ~15 years           |
| AoE2          | 20+ community AIs    | .per script files      | Yes (community ladder)  | ~20+ years          |
| Stratagus     | Few                  | Lua scripts            | No                      | ~15 years           |

### Event Model Comparison

| Project   | Primary Model       | Events?              | Frame Callback?                    |
| --------- | ------------------- | -------------------- | ---------------------------------- |
| Spring    | Event-driven        | Yes (full event set) | Yes (via EVENT_UPDATE)             |
| 0 A.D.    | Turn-based query    | No explicit events   | Yes (per-turn)                     |
| OpenRA    | Tick-based polling  | Yes (via interfaces) | Yes (IBotTick)                     |
| MicroRTS  | Frame-based query   | No                   | Yes (getAction per frame)          |
| BWAPI     | Frame + events      | Yes (unit events)    | Yes (onFrame)                      |
| AoE2      | Rule evaluation     | No                   | Continuous (all rules every cycle) |
| Stratagus | Sequential blocking | No                   | Timer-based (AiSleep)              |

---

## 9. Lessons for Iron Curtain

### What to Adopt

#### 1. Event-Driven AI Interface (from Spring Engine + BWAPI)

Iron Curtain's `AiStrategy` trait should combine:
- **Per-tick callback** (`on_tick(&self, state: &SimState) -> Vec<PlayerOrder>`) — the primary decision point
- **Event notifications** (`on_unit_created`, `on_unit_destroyed`, `on_enemy_spotted`, etc.) — reactive behavior triggers

This is the proven pattern used by both Spring (EVENT_*) and BWAPI (onUnitCreate/onFrame). Pure polling (MicroRTS's `getAction()`) is simpler but less efficient for reactive AI. Pure events (no per-tick callback) makes proactive strategy harder.

#### 2. Parameterized Personality System (from 0 A.D.'s Petra)

Iron Curtain's `PersonalityDrivenAi` (D043) should adopt 0 A.D.'s approach:
- **Continuous personality axes** (0.0–1.0): aggressiveness, defensiveness, economy focus, expansion tendency, tech rush tendency
- **Named presets** that map to parameter ranges (not fixed values)
- **Difficulty as multipliers** separate from strategy: engine-level resource bonuses (easy AI gets more) vs behavior changes (easy AI attacks less)

The two-axis model (engine cheats vs behavior changes) cleanly separates "how strong is the AI's economy" from "how smart are its decisions."

#### 3. Strategic Number Pattern (from AoE2)

Iron Curtain's AI configuration should provide a large parameter space (AoE2 has 307 active parameters out of 512 slots). Key parameter categories to expose:

- **Economy:** resource allocation percentages, worker counts, expansion timing
- **Military:** minimum/maximum attack group sizes, attack delay, retreat thresholds
- **Defense:** defense radius, sentry placement, garrison behavior
- **Diplomacy:** cooperation thresholds, tribute behavior

AoE2's `sn-do-not-scale-for-difficulty-level` pattern is directly applicable: let AI scripts opt out of engine-level difficulty bonuses to take full control.

#### 4. Data-Driven Bot Configuration (from OpenRA)

OpenRA's YAML-driven bot modules are directly aligned with Iron Curtain's design philosophy (D003: real YAML). The condition-based module gating pattern (`RequiresCondition: enable-rush-ai`) maps cleanly to our ECS condition system.

Adopt: composable behavior modules where each module is independently parameterized via YAML.

#### 5. Socket/External AI Interface (from MicroRTS + BWAPI)

For D042 (player behavioral profiles) and D044 (LLM-enhanced AI), Iron Curtain needs an external AI interface. MicroRTS's socket-based approach (serialize game state → send to external process → receive actions) is the right model for:
- LLM integration (D044: `LlmPlayerAi`)
- RL training environments
- Academic competitions
- Community AIs in any language

#### 6. `getParameters()` Pattern (from MicroRTS)

Every `AiStrategy` implementation should expose its tunable parameters programmatically:
```rust
trait AiStrategy {
    fn get_parameters(&self) -> Vec<ParameterSpec>;
    fn set_parameter(&mut self, name: &str, value: i32);
    // ... other methods
}
```
This enables: automated parameter tuning, UI-driven difficulty sliders, tournament parameter search, AI vs AI evaluation.

#### 7. Tournament Module Pattern (from BWAPI)

Iron Curtain's competitive infrastructure (D037) should include a Tournament Module concept:
- Referee process that validates AI actions
- Standardized match conditions
- Automated result recording
- Works for both human-vs-AI and AI-vs-AI matches

### What to Avoid

#### 1. DLL Injection (BWAPI)
Windows-only, unsandboxed, shares process memory. Iron Curtain's WASM mod system (D005) is the correct alternative — sandboxed, cross-platform, deterministic.

#### 2. No Difficulty System at All (Spring Engine, BWAPI)
Delegating difficulty entirely to AI implementations means players get inconsistent difficulty experiences. Iron Curtain should provide engine-level difficulty scaling (resource bonuses, reaction time delays) that all AIs benefit from, with an opt-out for sophisticated AIs that handle difficulty internally.

#### 3. Sequential Blocking Model (Stratagus)
`AiWait()` / `AiSleep()` blocks the AI from reacting to events. This produces rigid, predictable AI. Iron Curtain's AI should always be reactive (event + tick model), never blocking.

#### 4. Rule-Based-Only DSL (AoE2)
While accessible, a DSL limits what AIs can express. Community AI in AoE2 has hit ceilings that required engine changes (DUC). Iron Curtain's tiered model (YAML → Lua → WASM) avoids this by providing escape hatches to more powerful layers.

#### 5. C#-Only Custom Modules (OpenRA)
OpenRA's YAML configuration is great, but custom behavior requires C# and recompilation. Iron Curtain avoids this by making Lua and WASM the extension layers — no engine recompilation for custom AI behaviors.

### Architecture Recommendation Summary

```
Iron Curtain AiStrategy Trait Design
├── Core Interface
│   ├── on_tick(state) → orders         [MicroRTS getAction pattern]
│   ├── on_event(event)                 [Spring/BWAPI event pattern]
│   └── get_parameters() → params       [MicroRTS parameter pattern]
│
├── Configuration Layer
│   ├── YAML personality parameters     [OpenRA data-driven pattern]
│   ├── Strategic numbers (int slots)   [AoE2 SN pattern]
│   └── Named presets                   [0 A.D. personality presets]
│
├── Difficulty System (Two-Axis)
│   ├── Engine: resource bonuses/penalties  [0 A.D. cheat pattern]
│   ├── Engine: reaction time scaling       [AoE2 SN scaling]
│   └── Script: behavioral parameters      [0 A.D. Petra config]
│
├── External AI Interface
│   ├── Socket-based game state streaming   [MicroRTS socket mode]
│   ├── Gym-compatible observation space    [MicroRTS-Py pattern]
│   └── LLM prompt interface               [IC D044 specific]
│
└── Distribution
    ├── YAML configs (no code)              [OpenRA pattern]
    ├── Lua scripts (sandboxed)             [Stratagus/Spring pattern]
    ├── WASM modules (sandboxed, any lang)  [IC D005 unique]
    └── Workshop (D030)                     [No precedent — IC innovation]
```

---

## Sources

| Project       | Primary Sources                                                                              |
| ------------- | -------------------------------------------------------------------------------------------- |
| Spring Engine | spring/spring GitHub repo (`ExternalAI/` directory), Spring wiki (springrts.com/wiki/)       |
| 0 A.D.        | 0ad/0ad GitHub repo (`binaries/data/mods/public/simulation/ai/petra/config.js`)              |
| OpenRA        | OpenRA/OpenRA GitHub repo (`mods/ra/rules/ai.yaml`, `OpenRA.Mods.Common/Traits/BotModules/`) |
| MicroRTS      | santiontanon/microrts GitHub, Farama-Foundation/MicroRTS-Py GitHub                           |
| BWAPI         | bwapi/bwapi GitHub, BWAPI documentation site                                                 |
| AoE2          | airef.github.io (AoE2 AI Scripting Encyclopedia)                                             |
| Stratagus     | Wargus/stratagus GitHub (`src/ai/script_ai.cpp`, `doc/scripts/ai.html`)                      |
