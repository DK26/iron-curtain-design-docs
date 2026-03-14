# AI Director Pattern — Analysis Against IC's Puppet Master Architecture

> **Purpose:** Evaluate Left 4 Dead's AI Director and related dynamic game systems as inspiration for IC's Puppet Master architecture (D043) and related pacing infrastructure (D070 Commander & Field Ops / Operational Momentum pacing layer, D038 Game Master, D065 adaptive pacing).
> **Scope:** Pattern analysis, structural comparison, concrete applicability assessment. Not a general game AI survey — focused on the "outer guidance layer directing inner behavior" pattern.
> **Related docs:** `src/decisions/09d/D043/commanders-and-puppet-masters.md`, `src/decisions/09d/D070-asymmetric-coop.md`, `src/decisions/09f/D038/D038-game-master-replay-multiplayer.md`, `research/rts-ai-implementation-survey.md`

---

## Table of Contents

1. [The AI Director Pattern](#1-the-ai-director-pattern)
2. [Case Studies](#2-case-studies)
3. [Structural Comparison with IC](#3-structural-comparison-with-ic)
4. [Applicable Inspirations](#4-applicable-inspirations)
5. [What Does NOT Transfer](#5-what-does-not-transfer)
6. [Recommendations](#6-recommendations)

---

## 1. The AI Director Pattern

The AI Director is a meta-level game system that monitors player experience in real-time and dynamically adjusts game parameters to maintain a desired emotional intensity curve. It does not play the game — it shapes the *experience envelope* around the players.

**Core architecture (generalized from multiple implementations):**

```
┌──────────────────────────────────────────────────────┐
│                    AI Director                        │
│  • Monitors player state (stress, health, pace)      │
│  • Maintains intensity model (current vs target)     │
│  • Decides macro events (spawn waves, lulls, peaks)  │
│  • Adjusts parameters on subordinate systems         │
└──────────────┬───────────────────────┬───────────────┘
               │ adjusts               │ triggers
               ▼                       ▼
┌──────────────────────┐   ┌──────────────────────┐
│  Population Manager  │   │   Event Scheduler    │
│  (spawn rates, comp) │   │   (crescendos, lulls)│
└──────────┬───────────┘   └──────────┬───────────┘
           │ spawns                    │ activates
           ▼                           ▼
┌──────────────────────┐   ┌──────────────────────┐
│  Individual AI       │   │  Scripted Events     │
│  (behavior, pathing) │   │  (finales, bosses)   │
└──────────────────────┘   └──────────────────────┘
```

**Key properties:**
- **Two-layer separation:** The Director decides *what should happen at a high level*; subordinate systems handle *how it happens*
- **Intensity curve management:** The Director maintains a target emotional arc (tension → peak → relief → rebuild) and adjusts parameters to track it
- **Player state monitoring:** Composite "stress" or "intensity" metrics drive decisions, not raw difficulty
- **Invisible hand:** Players should feel the experience, not see the mechanism

---

## 2. Case Studies

### 2.1. Left 4 Dead / Left 4 Dead 2 (Valve, 2008/2009)

**Source:** Valve GDC talks (Michael Booth, "The AI Systems of Left 4 Dead," GDC 2009; Chris Hecker interviews); Valve Developer Wiki.

**Architecture — two Directors working in concert:**

| Component                      | Role                                                                                   | Mechanism                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Population Director**        | Controls zombie spawn timing, density, and composition                                 | Monitors per-player "stress" (composite of: damage taken recently, health, proximity to teammates, whether actively being attacked, time since last combat). Maintains a target intensity curve with BUILD UP → PEAK → SUSTAIN PEAK → FADE phases. Spawns common infected to hit target intensity; withholds spawns during relaxation windows. |
| **Dramatic/Scenario Director** | Controls macro events — Tank spawns, Witch placement, crescendo events, item placement | Reads aggregate team stress. Places Tanks and crescendo triggers when the team is in a relaxation phase and has recovered enough for a peak event. Adjusts item placement (health kits, ammo, throwables) based on team state.                                                                                                                 |

**Intensity model:**

```
Intensity
  ▲
  │     ╱╲           ╱╲ PEAK
  │    ╱  ╲    ╱╲   ╱  ╲
  │   ╱    ╲  ╱  ╲ ╱    ╲
  │  ╱      ╲╱    ╲╱      ╲
  │ ╱ BUILD         RELAX   ╲
  │╱  UP                      ╲
  └──────────────────────────────→ Time
```

The Director ensures peaks are followed by valleys — players never face unrelenting pressure (which causes fatigue and frustration) or unrelenting calm (which causes boredom). The signature L4D feeling of "quiet moment → distant horde sound → wall-to-wall chaos → silence" is the Director's intensity curve made audible.

**Key design insight:** The Director optimizes for *emotional pacing*, not difficulty. A harder game is not the goal — a more *dramatic* game is. Stress is the input metric, not player skill.

### 2.2. Alien: Isolation (Creative Assembly, 2014)

**Source:** GDC 2015 talk (Andy Bray, "The Unexpected Complexity of the Alien AI"); technical postmortems.

**Architecture — dual-brain AI with Director oversight:**

| Component                          | Role                                                                                                                                | Mechanism                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Director AI** ("Menace Manager") | Controls the Xenomorph's macro behavior envelope — where it patrols, how aggressive it is, when it gives the player breathing room  | Maintains a "menace gauge" based on player proximity to the alien, time since last sighting, player deaths, and mission progress. When menace is low (player hasn't seen the alien in a while), the Director gives the alien hints about the player's location. When menace is high (player just had a close encounter), the Director pulls the alien away. |
| **Alien AI** (micro)               | Handles pathfinding, sensory processing (sound, sight, motion detector), vent navigation, search patterns, behavioral state machine | Reacts to actual stimuli — the Director doesn't puppet-control it. The alien genuinely investigates sounds, tracks footprints, and learns from player tool usage. The Director's hints are suggestions, not commands.                                                                                                                                       |

**Critical architectural parallel to Puppet Master:** The Director provides *guidance through a constrained interface* (hint system), and the Alien AI retains *full behavioral autonomy*. The Director says "the player is roughly in this area" — the alien decides how to search. This is structurally identical to IC's `PuppetMaster.consult()` → `StrategicGuidance` → `AiStrategy.set_parameter()` flow.

**Adaptation loop:** The Alien learns from player behavior over time. If the player hides in lockers frequently, the alien starts checking lockers. If the player uses the flamethrower a lot, the alien becomes more resistant to it temporarily. This is a form of behavioral profiling — parallel to D042's `PlayerStyleProfile`, applied to an NPC rather than a human.

### 2.3. Shadow of Mordor / Shadow of War — Nemesis System (Monolith, 2014/2017)

**Architecture:** Not a Director in the pacing sense, but a *persistent AI individuality and memory system*.

| Component          | Role                                                             | Mechanism                                                                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nemesis System** | Gives enemy captains persistent identity, memory, and adaptation | Each captain has a name, personality traits, strengths, weaknesses, fears, and a memory of prior encounters with the player. If a captain kills the player, it levels up and gains personality changes. If the player defeats but doesn't kill a captain, it returns scarred and vengeful. |

**Relevance to IC:** More adjacent to D043's AI Commanders than to Puppet Masters. The Nemesis System's contribution is that *giving AI opponents persistent character and memory creates emergent narrative*. IC's Commander personas (portrait, agenda, contextual taunts, personality overrides) capture the character layer. The Nemesis System adds *evolving relationships* and *cross-session memory* — concepts that could inspire a future "rival commander" feature in campaign play (a D021 persistent state application), but this is not a Director pattern.

### 2.4. Deep Rock Galactic (Ghost Ship Games, 2018/2020)

**Architecture:** Mission Director controlling wave spawns, special enemy timing, and resource distribution.

| Component            | Role                                                                               | Mechanism                                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mission Director** | Controls enemy spawn timing, wave composition, swarm intensity, and mission events | Uses a difficulty curve with escalating intensity over mission duration. Wave timing has randomized intervals within bounds. Special enemies (bulk detonators, dreadnoughts) spawn at Director-chosen moments. Resource distribution (nitra, gold) is partially randomized, partially Director-placed. |

**Key insight for IC:** DRG's Director operates in a cooperative PvE context where environmental control is the primary lever. The game's sense of rhythm — mining in relative calm → warning audio cue → swarm → frantic fighting → calm → repeat — is Director-paced. The Director's parameters are tunable by difficulty level and mission type.

### 2.5. Vermintide 2 / Darktide (Fatshark, 2018/2023)

**Architecture:** Wave-based Director managing enemy spawns, special enemy timing, and ambient threats.

| Component    | Role                                                                             | Mechanism                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Director** | Controls horde timing, special spawn rates, ambient enemy density, boss triggers | Tracks "threat level" and "intensity" separately. Threat is what's currently active; intensity is the recent history. Hordes spawn when intensity has been low for long enough. Specials spawn on cooldown timers modified by player performance. |

**Key insight for IC:** Fatshark's Director separates *current threat* (what's attacking now) from *intensity history* (how stressed players have been recently). This prevents stacking — a team already fighting a horde won't get a second horde immediately. IC's replay event stream (D031) already tracks similar metrics (engagement density, momentum swings) in its highlight detection pipeline (D077). The same data could drive a Director-style system.

---

## 3. Structural Comparison with IC

### 3.1. Puppet Master vs AI Director — Where They Overlap

| Aspect                    | AI Director                                       | IC Puppet Master                                    |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| **Layered architecture**  | Director (macro) → Population/Behavior AI (micro) | PuppetMaster (strategic) → AiStrategy (tactical)    |
| **Constrained interface** | Hints, spawn parameters, event triggers           | `StrategicGuidance` → `set_parameter()` calls       |
| **Inner autonomy**        | Zombie/Alien AI acts on its own behavioral logic  | Inner `AiStrategy` handles all tick-level decisions |
| **Periodic consultation** | Director evaluates continuously or on intervals   | `GuidedAi` consults PM at `consultation_interval`   |
| **State monitoring**      | Composite stress/intensity metrics                | `FogFilteredView` + `event_narrative`               |

**Core structural similarity:** Both patterns implement a *guidance layer that influences but does not replace autonomous behavior through a narrow interface*. This is the same design pattern applied to different domains.

### 3.2. Where They Differ Fundamentally

| Aspect                  | AI Director                                                           | IC Puppet Master                                                          |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **What it controls**    | *Player experience pacing* — emotional intensity curves, dramatic arc | *AI strategic decisions* — build orders, attack targets, army composition |
| **Optimization target** | Drama / emotional engagement (stress curves)                          | Competitive effectiveness / strategic adaptation                          |
| **Domain**              | PvE environmental control (spawns, items, events)                     | PvP/PvE strategic advising (one AI player's decisions)                    |
| **Visibility**          | Invisible — players should never see the Director's hand              | Visible — PM type is shown in lobby, reasoning in spectator overlay       |
| **Determinism**         | Non-deterministic is fine (single-player/co-op)                       | Must be determinism-safe (lockstep multiplayer)                           |
| **Scope of influence**  | Controls the entire game environment                                  | Advises one AI player among many                                          |

**Key distinction:** Directors manage the *experience envelope* (pacing, tension, dramatic structure). Puppet Masters manage *strategic intelligence* (what objectives to pursue, what to build). These are orthogonal concerns that happen to share a structural pattern.

### 3.3. Mapping to Existing IC Systems

| AI Director Function                    | IC Equivalent                                                                                      | Status                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Dynamic difficulty adjustment (DDA)     | D065 adaptive pacing engine (skill assessment, difficulty calibration)                             | Designed (Phase 4–6a), onboarding-focused  |
| Spawn wave timing/composition           | D038 Game Master mode (human GM controls reinforcements)                                           | Designed (Phase 6b), human-operated        |
| Intensity curve management              | D070 Commander & Field Ops — Operational Momentum pacing layer (authored pacing with agenda lanes) | Designed (Phase 6b), mission-author-driven |
| Environmental tension (weather, events) | D022 dynamic weather state machine                                                                 | Designed (Phase 2+), deterministic         |
| Dynamic music response                  | D013 dynamic music FSM (5 moods: calm/tension/combat/victory/defeat)                               | Designed (Phase 3+), audio only            |
| Macro AI guidance → inner AI execution  | D043 Puppet Master → `GuidedAi` → `AiStrategy`                                                     | Designed (Phase 7), strategy-focused       |
| Replay highlight detection              | D077 four-dimension scoring pipeline (engagement density, momentum swing, anomaly, rarity)         | Designed (Phase 2–3+), post-hoc analysis   |

---

## 4. Applicable Inspirations

### 4.1. Intensity Metrics as AI State Input (Strongest Fit)

**L4D insight:** The Director's composite stress metric is a richer game state signal than raw numbers. "Player 1 has 60 health" is less useful than "Player 1 has been under continuous attack for 12 seconds, lost 40% health in the last 5 seconds, and is separated from their team."

**IC application:** IC's Puppet Master already receives `FogFilteredView` and `event_narrative`. The event narrative is a text summary of recent events (built from D031's telemetry stream). This could be enriched with **computed intensity metrics** — not just "what happened" but "how intense was it":

- **Combat pressure:** ratio of incoming DPS to army value, engagement duration, losses per second
- **Economic momentum:** income trend (growing/stable/declining), resource stockpile trajectory
- **Positional control:** percentage of map under fog vs revealed, forward unit positions vs base proximity
- **Threat convergence:** are enemy forces concentrating or dispersed relative to the AI's position

These composite metrics would make `LlmPuppetMaster` prompts more informative and `AlgorithmicPuppetMaster` heuristics more nuanced. They are also exactly the kind of data that D077's highlight detection already computes — the same analysis event stream serves both purposes.

**Implementation note:** These metrics can be computed deterministically from sim state. They are read-only analysis, not new game mechanics. They live in `ic-ai`, derived from `FogFilteredView` data. No sim-layer changes required.

### 4.2. Alien: Isolation's Dual-Brain as Validation of PM Architecture (Direct Parallel)

**A:I insight:** The xenomorph's dual-brain architecture (Director AI provides strategic hints → Alien AI retains behavioral autonomy) is structurally identical to IC's `PuppetMaster.consult()` → `StrategicGuidance` → `AiStrategy.set_parameter()` pipeline.

**Key shared properties:**
- The outer layer (Director / PM) never issues direct movement or attack commands
- The inner layer (Alien AI / AiStrategy) processes guidance through its own behavioral logic
- The guidance interface is narrow and constrained (hints / parameter adjustments)
- The inner AI can ignore or partially follow guidance when it conflicts with immediate tactical needs
- The outer layer operates on a slower cadence than the inner layer

**What IC already gets right:** The Puppet Master architecture captures this pattern cleanly. No design changes needed — the Alien: Isolation comparison validates the existing approach.

**One nuance worth noting:** In A:I, the Director sometimes *withholds* information from the alien (pulling it away to give the player breathing room). IC's Puppet Master doesn't have a "pull back" mechanism — it only provides positive guidance. A future refinement could add a `disengage_priority` parameter to `StrategicGuidance` that tells the inner AI to de-escalate, consolidate, or take a defensive posture. This would let an LLM Puppet Master create more dramatic pacing — "he's weak, push now" followed later by "consolidate, rebuild, then hit his expansion."

### 4.3. Intensity Curves for PvE Mission Pacing (D070 Pacing Layer Enhancement)

**L4D insight:** The Director maintains a deliberate Build → Peak → Sustain → Fade intensity cycle. Players never face monotonic difficulty — the valleys make the peaks feel more intense.

**IC application — D070 Operational Momentum pacing layer enhancement:** D070's optional Operational Momentum pacing layer already defines three-horizon pacing (Immediate / Operational / Strategic) with authored milestones. A Director-inspired refinement would add **intensity-aware objective sequencing** — the mission author defines not just *what* happens but *the emotional arc*:

```yaml
# Example: D070 scenario using Director-inspired pacing metadata
operational_momentum:
  pacing_profile: director_curves  # opt-in authored pacing mode
  intensity_phases:
    - phase: buildup
      duration_range: [60, 120]    # seconds
      enemy_pressure: low
      objective_type: economy      # low-intensity tasks during buildup
    - phase: peak
      duration_range: [30, 90]
      enemy_pressure: high
      objective_type: combat       # crescendo — major engagement
    - phase: sustain
      duration_range: [20, 45]
      enemy_pressure: medium
      objective_type: extraction   # "stay or go" decision under pressure
    - phase: relief
      duration_range: [30, 60]
      enemy_pressure: minimal
      objective_type: logistics    # breathing room, regroup, loot
```

This is NOT a runtime AI Director — it is **authored pacing metadata** that the D038 scenario editor exposes for mission designers. The mission's Lua scripts use these phases to time reinforcements, gate objectives, and control enemy aggression levels. The Operational Momentum board surfaces the current phase to players.

**Why authored, not runtime-dynamic:** In a deterministic lockstep RTS, a runtime Director that adjusts spawn rates based on player stress would be a determinism hazard. All clients must see the same spawns at the same ticks. IC's approach — authored pacing with Lua-scripted triggers — preserves determinism while capturing the Director's dramatic arc philosophy. The mission author IS the Director; the Lua triggers are the Director's spawn system; the Operational Momentum board is the Director's intensity model made visible to the player.

### 4.4. Game Master as Human Director (D038 Enrichment)

**L4D insight:** The AI Director is an automated Game Master. IC already has a *human* Game Master (D038).

**IC application:** The Game Master mode could expose Director-inspired tools:

- **Intensity dashboard:** Show the GM real-time intensity metrics (combat density, player stress proxy, economy rate) so they can make informed pacing decisions
- **Pacing templates:** Pre-authored pacing arcs (tension → relief → crescendo → finale) that the GM can activate, with suggested actions at each phase
- **Phase markers:** The GM marks the current "intensity phase" (buildup / peak / relief), and the music system (D013 dynamic music FSM) automatically transitions to match

These are UI/UX enhancements to an already-designed system, not new mechanics.

### 4.5. Director-Style Algorithmic Puppet Master (Future PM Implementation)

The existing Puppet Master futures list includes "Rule-based advisor" and "Training coach." The AI Director pattern suggests a specific flavor:

**`PacingDirector` PuppetMaster** — an algorithmic PM that monitors game intensity and adjusts AI behavior to create deliberate pacing:

- In a PvE mission: the AI opponent (controlled by this PM) deliberately creates tension cycles — aggressive pushes followed by consolidation periods — rather than maximally efficient constant pressure
- In a training context (D065): the PM creates escalating difficulty curves based on the human player's assessed skill level
- In an exhibition match (D073): the PM creates dramatic games by preventing snowballs — if one AI is crushing the other, the PM tells it to diversify tactics rather than end the game, creating closer, more exciting matches for spectators

This would be a specific `PuppetMaster` implementation with `kind() → Algorithmic`. It fits cleanly into the existing trait architecture — no design changes needed, just a new implementation. Phase 7 or later.

### 4.6. D077 Highlights as Retrospective Director Analysis

**L4D insight:** The Director tracks intensity in real-time to control pacing.

**IC insight:** D077's highlight detection already runs the same analysis *retrospectively* on replays — identifying engagement density spikes, momentum swings, z-score anomalies, and rarity. This is a retrospective Director that identifies where the game's natural "Director moments" occurred.

**Connection:** If IC ever implements a runtime `PacingDirector` PM, the same scoring dimensions from D077 (engagement density, momentum swing, anomaly detection, rarity bonus) would serve as the real-time intensity metrics. The difference is timing: D077 runs post-game on recorded events; a `PacingDirector` would run live on streaming events using the same formulas.

---

## 5. What Does NOT Transfer

### 5.1. Runtime Spawn Manipulation in Competitive RTS

L4D's Director can add or remove enemies at will because it controls a PvE environment with no fairness constraints. In IC's competitive context (even unranked PvP), dynamically spawning units outside the normal production pipeline would break game integrity and determinism. The "environment" in an RTS is the map, resources, and starting conditions — all fixed at match start.

**Exception:** In authored PvE scenarios (D070, campaign missions), Lua-scripted reinforcement triggers already serve this function. They're authored, not runtime-dynamic, which preserves determinism.

### 5.2. Invisible Hand Philosophy

Directors are designed to be invisible — players should feel the pacing without seeing the mechanism. IC's Puppet Master is the opposite: the PM type is lobby-visible, reasoning is available in spectator overlays, and the architecture is explicitly documented. Transparency fits IC's competitive and modding culture better than hidden manipulation.

### 5.3. Stress-Based Difficulty Adjustment in PvP

L4D adjusts difficulty based on player stress. In a PvP RTS, one player's stress implies the opponent is winning — making the game easier for the losing player would be rubber-banding, which competitive players despise. DDA only makes sense in IC's PvE contexts (D065 onboarding, D070 co-op missions).

### 5.4. Continuous Environmental Control

Directors continuously adjust environmental variables (zombie density, item placement, weather). RTS maps have discrete, authored environments. Weather exists (D022) but is a state machine with authored transitions, not a Director-controlled fader. This is appropriate — an RTS environment should feel authored and predictable, not secretly manipulated.

---

## 6. Recommendations

### 6.1. No New Decision Required

The AI Director pattern validates IC's existing Puppet Master architecture rather than requiring a new design. The two-layer separation (guidance layer → autonomous executor) is the same structural pattern applied to different domains. IC already has the right architecture.

### 6.2. Concrete Enhancements (Within Existing Decisions)

| Enhancement                                                                                                                   | Affected Decision    | Effort                                             | Priority                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| **Intensity metrics** in PM consultation context (combat pressure, economic momentum, positional control, threat convergence) | D043 PM architecture | Low — derived from existing `FogFilteredView` data | `P-Differentiator` — makes PM guidance more nuanced  |
| **Pacing phase metadata** for D070's Operational Momentum pacing layer (authored intensity curves)                            | D070, D038           | Medium — YAML schema + scenario editor support     | `P-Optional` — enriches authored PvE scenarios       |
| **Intensity dashboard for Game Master** (real-time combat density, economy rate metrics)                                      | D038                 | Low — UI overlay reading existing sim state        | `P-Optional` — enhances GM tool quality              |
| **`PacingDirector` PM implementation** (algorithmic PM creating deliberate tension cycles)                                    | D043 PM futures      | Medium — new `PuppetMaster` impl                   | `P-Optional` — Phase 7+, specific PvE/exhibition use |
| **Cross-reference AI Director as prior art** in PM sub-file                                                                   | D043                 | Trivial — documentation only                       | Immediate                                            |

### 6.3. Prior Art Section Addition

The Puppet Master documentation should cite the AI Director pattern as a validated prior art for the two-layer guidance architecture. Specifically:
- L4D AI Director and Alien: Isolation's dual-brain as the clearest structural analogs
- Note: IC applies the same pattern to *strategic advising* rather than *experience pacing*
- The pattern's strength (separation of guidance from execution) is domain-independent

### 6.4. What to Resist

- Do NOT add a runtime AI Director that dynamically manipulates the game environment in multiplayer — this conflicts with deterministic lockstep and competitive integrity
- Do NOT add invisible difficulty adjustment in PvP contexts — transparency is an IC value
- Do NOT try to make the Puppet Master into a Director — they serve different purposes (strategy vs pacing) and the distinction is valuable
- Do NOT conflate D070's Operational Momentum pacing layer (authored pacing) with a runtime Director (dynamic pacing) — authored is correct for IC's determinism model

---

## Summary

The AI Director pattern (L4D, Alien: Isolation, DRG, Vermintide) and IC's Puppet Master pattern are instances of the same structural design: **an outer guidance layer that influences but does not replace an inner autonomous agent through a narrow interface**. They differ in *what* they optimize: Directors optimize for *emotional pacing* (dramatic intensity curves); Puppet Masters optimize for *strategic intelligence* (competitive effectiveness).

IC already has the right architecture. The main inspirations to incorporate are: (1) richer intensity metrics as PM consultation context, (2) Director-inspired authored pacing metadata for PvE missions, and (3) citing the AI Director as validating prior art. The key thing to avoid is importing the Director's runtime environmental manipulation into IC's deterministic competitive context.
