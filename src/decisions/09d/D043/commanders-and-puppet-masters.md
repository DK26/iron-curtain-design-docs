## AI Commanders & Puppet Masters

> **Parent:** [D043 — AI Behavior Presets](../D043-ai-presets.md)
> **Scope:** `ic-ai`, `ic-llm` (Puppet Master implementations), game module configuration
> **Phase:** Phase 4 (commanders), Phase 7 (Puppet Master implementations)

This sub-page covers two layers on top of D043's behavioral AI presets:

1. **AI Commanders** — named character personas (portrait, agenda, taunts) wrapped around personality presets
2. **Puppet Masters** — external strategic guidance sources that direct an AI player's objectives without controlling units

---

### AI Commanders — Named Personas

The personality parameters in D043 define *how* an AI plays. AI Commanders add *who* is playing — a named character with a portrait, specialization, visible agenda, and contextual taunts. This is the presentation layer on top of the behavioral engine.

**Prior art:** C&C Generals: Zero Hour (9 named generals with unique unit rosters and playstyle identities), Civilization V/VI (named leaders with visible agendas and personality-driven diplomacy), StarCraft II co-op (named commanders with distinct abilities), C&C3/RA3 skirmish (named AI personalities like "Rusher" and "Turtler"). The common pattern: giving AI opponents a *character* makes them memorable and replayable. Playing against "Colonel Volkov — Armor Specialist" is more engaging than playing against "AI Hard."

**What commanders are NOT:** Commanders do not have unique unit rosters or passive gameplay bonuses — that would be a balance/mod concern (D019), not an AI presentation concern. A commander is a named wrapper around a D043 personality preset. The personality params drive behavior; the commander definition adds identity. Mods that want Generals ZH-style unique tech trees per commander can layer that on top via faction variants in YAML rules, but the engine doesn't couple unit availability to AI persona selection.

#### Commander Definition (YAML)

```yaml
# ai/commanders/colonel-volkov.yaml
commander:
  id: colonel-volkov
  name: "Colonel Volkov"
  faction: soviet
  portrait: "portraits/commanders/volkov.png"
  specialization: "Armor Specialist"
  agenda: "Overwhelm with heavy armor; disdains infantry"
  flavor_text: "Former tank brigade commander who believes wars are won with steel, not flesh."

  # References a D043 personality preset as the behavioral foundation
  personality_preset: ic-default
  # Overrides specific personality parameters to create the commander's identity
  personality_overrides:
    aggression: 0.7
    tech_priority: vehicles_first
    expansion_style: aggressive
    unit_composition_bias:
      heavy_armor: 0.6
      infantry: 0.1
      air: 0.15
      naval: 0.15

  # Contextual taunts — delivered via D059 chat system (all-chat or team-chat)
  taunts:
    game_start:
      - "Your infantry will be crushed beneath Soviet steel."
      - "I hope you brought anti-armor. You will need it."
    first_attack:
      - "My tanks roll across your border. Surrender now."
    building_destroyed:
      - "Another structure falls. Your base crumbles."
    unit_killed_vehicle:
      - "Another tin can opened."
    unit_killed_infantry:
      - "Infantry? Hardly worth the ammunition."
    under_attack:
      - "You dare strike me? My counterattack will be devastating."
    economy_lead:
      - "My war machine outproduces yours. It is only a matter of time."
    losing:
      - "A temporary setback. My reserves are deep."
    victory:
      - "As expected. Steel conquers all."
    defeat:
      - "Impossible... my armor was supposed to be impenetrable."
    idle:  # periodic mid-game taunts (rate-limited, not spammy)
      - "Building up your defenses? They will not hold."
      - "I can hear your economy struggling from here."
```

**Taunt delivery:** Taunts use the D059 chat system. The engine sends them as all-chat messages attributed to the commander name (e.g., `[Col. Volkov] Your infantry will be crushed beneath Soviet steel.`). Taunts are rate-limited (at most one every 60–90 seconds) and context-triggered (the "first_attack" taunt fires once when the commander's units first engage an enemy). Players can mute AI taunts in settings (D033 QoL toggle: `ai_taunts: on/off`). Taunts are cosmetic — they do not affect simulation.

**Taunt trigger events:** `game_start`, `first_attack`, `first_expansion`, `building_destroyed` (enemy building), `unit_killed_vehicle`, `unit_killed_infantry`, `unit_killed_air`, `under_attack` (own base), `economy_lead` (>150% of opponent's income), `tech_advantage` (higher tech tier), `losing` (<50% army value vs opponent), `victory`, `defeat`, `idle` (periodic, mid-game). Each trigger has a cooldown to prevent spam. Multiple lines per trigger are chosen randomly.

#### Built-In Commanders (RA1 Game Module)

The Red Alert game module ships with a roster of built-in commanders themed as Cold War-era military officers. Each has a distinct playstyle identity:

| Commander           | Faction | Specialization      | Personality Summary                                                |
| ------------------- | ------- | ------------------- | ------------------------------------------------------------------ |
| **Col. Volkov**     | Soviet  | Armor Specialist    | Heavy tank rushes, aggressive expansion, disdains infantry         |
| **Cmdr. Nadia**     | Soviet  | Intelligence Ops    | Scouts obsessively, adapts to counter opponent, surgical strikes   |
| **Gen. Kukov**      | Soviet  | Brute Force         | Massive army blobs, no subtlety, overwhelming numbers              |
| **Cdr. Stavros**    | Allied  | Air Superiority     | Fast air tech, airfield spam, harasses economy from above          |
| **Col. von Esling** | Allied  | Defensive Fortifier | Turtles behind walls and turrets, waits for overwhelming advantage |
| **Lt. Tanya**       | Allied  | Spec Ops & Raiding  | Small elite squads, hit-and-run, targets economy and key buildings |

These are starting points — the community will create many more. The names reference existing Red Alert characters (Volkov, Tanya, Nadia, von Esling are RA1 names; Kukov appears in RA2/3; Stavros is RA1). This is appropriate for the RA game module, which explicitly aims for Red Alert compatibility — the same module already uses RA faction names, unit names, and map names. Per the project's trademark disclaimer, these names identify the game the module is compatible with (nominative fair use). Mods and community commanders can use any names they choose.

**Unnamed presets still available:** Players who prefer the abstract preset names (Classic RA, OpenRA, IC Default) can select those directly — they appear in the commander list as "Classic RA AI", "OpenRA AI", "IC Default AI" without a character name, portrait, or taunts. This preserves the minimal-presentation option for players who find character flavor distracting.

#### Lobby Integration

Commander selection replaces the former "AI preset" dropdown with a richer picker showing portrait thumbnails, names, and specialization summaries:

```
Player 1: [Human]           Faction: Soviet
Player 2: [AI] Col. Stavros — Air Superiority (Hard)      Faction: Allied
Player 3: [AI] Gen. Kukov — Brute Force (Normal)          Faction: Soviet
Player 4: [AI] IC Default AI (Brutal)                     Faction: Allied

Balance Preset: Classic RA
```

The two-axis model is preserved (commander/preset × difficulty). Selecting a commander implicitly selects its personality preset + overrides. The difficulty axis remains independent — "Col. Volkov (Easy)" plays with armor-specialist tendencies but gathers slowly and reacts late; "Col. Volkov (Brutal)" plays armor-specialist with economic bonuses and instant reactions.

**Commander detail tooltip:** Hovering over a commander in the lobby shows their full agenda description, specialization, and a personality radar chart (aggression, tech preference, expansion speed, micro level, adaptation) so players can see at a glance how the AI will play.

#### Workshop Commanders

Community-created commanders are Workshop resources (D030, Tier 1 YAML — no code required):

- YAML personality definition + portrait image + taunt strings
- Taunt localization: community can provide `taunts.en.yaml`, `taunts.de.yaml`, etc.
- Rated and reviewed like other Workshop content
- Commander packs: themed collections (e.g., "World War II Generals Pack", "Sci-Fi Commanders Pack")

#### LLM-Generated Commanders (Phase 7)

The LLM generation pipeline (D016) can create commanders on the fly:

- **Personality generation:** Given a faction and specialization prompt, the LLM outputs a valid commander YAML (personality overrides + taunts + flavor text)
- **Portrait generation:** Using the IST sprite text format, the LLM can generate a pixel-art commander portrait (~200 tokens for a 32×32 portrait)
- **Narrative integration:** Generated commanders can appear as opponents in LLM-generated campaigns (D016) with consistent personality across missions
- **Skill library (D057):** Verified commander definitions (personality params that produce interesting gameplay + well-written taunts) are stored in the skill library for few-shot examples in future generation

---

### Puppet Masters — Strategic Guidance Architecture

A **Puppet Master** is an external strategic guidance source that influences an AI player's objectives and priorities without directly controlling units. The AI retains autonomous tick-level decision-making (movement, combat micro, build queue); the Puppet Master provides high-level strategic direction — what to build, where to expand, when to attack, what to prioritize.

This formalizes and generalizes a pattern D044 already established: `LlmOrchestratorAi` wraps an inner `AiStrategy` and periodically translates LLM output into `set_parameter()` calls. The "Puppet Master" concept names that guidance layer as a first-class architectural element and opens it to non-LLM implementations.

#### Three Tiers

| Tier  | Name                    | Description                                                                                                                                                                                                                                                                    | Implementation                                                                                                         |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **0** | **Masterless**          | No Puppet Master assigned. The AI plays autonomously using its personality preset and difficulty settings. This is the standard RTS AI experience — every other RTS game works this way by default.                                                                            | Default. `PersonalityDrivenAi` (D043), `StyleDrivenAi` (D042), or any `AiStrategy` running alone.                      |
| **1** | **AI Puppet Master**    | An algorithmic or LLM-based system that periodically evaluates game state and provides strategic guidance. The AI executes; the Puppet Master advises.                                                                                                                         | D044 `LlmOrchestratorAi` is the primary implementation. Future: rule-based advisors, ML models, multi-agent ensembles. |
| **2** | **Human Puppet Master** | A real player who guides AI objectives and priorities in real-time through structured intents (text prompts, preset directives, priority adjustments). The human does not issue unit orders directly — they set strategic direction, and the AI translates that into gameplay. | D073 Prompt-Coached mode is the primary implementation.                                                                |

**Masterless is the default.** Unless a Puppet Master is explicitly assigned (in the lobby or via match configuration), every AI player runs Masterless. A player launching a standard skirmish against "Col. Volkov (Hard)" gets Masterless Tier 0 — the commander persona and personality params drive all decisions autonomously. This is the experience any RTS player expects.

#### The `PuppetMaster` Trait

The `PuppetMaster` trait abstracts the guidance source so that the wrapping AI can accept direction from any implementation — LLM, human, algorithmic, or types not yet conceived.

```rust
/// A strategic guidance source for an AI player.
/// Provides high-level direction; the AI retains autonomous tick-level control.
/// Lives in `ic-ai`. Implementations may depend on `ic-llm` (for LLM-based PMs)
/// or `ic-net` (for human input routing), but the trait itself has no such deps.
pub trait PuppetMaster: Send + Sync {
    /// Display name for lobby/spectator UI (e.g., "LLM Advisor", "Coach: Alice").
    fn name(&self) -> &str;

    /// Whether this PM requires a human seat in the lobby.
    /// True for Human Puppet Master; false for AI/algorithmic PMs.
    fn requires_human_seat(&self) -> bool;

    /// The kind of guidance source, for UI badging and policy enforcement.
    fn kind(&self) -> PuppetMasterKind;

    /// Provide strategic guidance based on current game state and recent events.
    /// Returns guidance (parameter updates + optional strategic plan), or None
    /// if the PM has no update this cycle. Called by GuidedAi at a rate
    /// determined by the implementation — not every tick.
    fn consult(
        &mut self,
        view: &FogFilteredView,
        event_narrative: &str,
        current_plan: Option<&StrategicPlan>,
    ) -> Option<StrategicGuidance>;
}

/// Classification for UI, policy enforcement, and replay metadata.
pub enum PuppetMasterKind {
    /// No PM — AI plays autonomously. (Not a trait implementor; represented
    /// by absence of a PM on the AI slot.)
    // Masterless is not a PuppetMaster impl — it's the absence of one.
    Algorithmic,  // Rule-based or ML-based AI advisor
    Llm,          // LLM-based (D044 LlmOrchestratorAi)
    Human,        // Real player (D073 Prompt-Coached)
}

/// The output of a PuppetMaster consultation.
pub struct StrategicGuidance {
    /// Parameter adjustments to apply via set_parameter() on the inner AI.
    pub parameter_updates: Vec<(String, i32)>,
    /// Optional structured strategic plan (D044 StrategicPlan).
    pub plan: Option<StrategicPlan>,
    /// Human-readable reasoning for spectator overlay / replay annotation.
    pub reasoning: Option<String>,
}
```

#### `GuidedAi` — The Generalized Wrapper

`GuidedAi` is the generalized form of D044's `LlmOrchestratorAi`. It wraps any `AiStrategy` (the executor) with any `PuppetMaster` (the advisor), bridging them through `set_parameter()`.

```rust
/// Wraps an AiStrategy with a PuppetMaster for strategic guidance.
/// The inner AI handles tick-level execution; the PM provides direction.
/// Generalizes D044's LlmOrchestratorAi pattern.
pub struct GuidedAi {
    inner: Box<dyn AiStrategy>,
    master: Box<dyn PuppetMaster>,
    consultation_interval: u64,
    last_consultation: u64,
    current_plan: Option<StrategicPlan>,
    event_log: AiEventLog,
}

impl AiStrategy for GuidedAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64)
        -> Vec<PlayerOrder>
    {
        if tick - self.last_consultation >= self.consultation_interval {
            let narrative = self.event_log.to_narrative(self.last_consultation);
            if let Some(guidance) = self.master.consult(
                view, &narrative, self.current_plan.as_ref()
            ) {
                for (name, value) in &guidance.parameter_updates {
                    self.inner.set_parameter(name, *value);
                }
                self.current_plan = guidance.plan;
            }
            self.last_consultation = tick;
        }
        self.inner.decide(player, view, tick)
    }

    // Event callbacks: forward to inner AI + accumulate in event_log
    // (same pattern as D044's LlmOrchestratorAi)
    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        self.event_log.push(/* ... */);
        self.inner.on_enemy_spotted(unit, unit_type);
    }
    // ... remaining callbacks follow the same dual-forward pattern
}
```

**Relationship to `LlmOrchestratorAi`:** D044's `LlmOrchestratorAi` is the first and primary `GuidedAi` + `PuppetMaster` combination. The LLM-specific logic (prompt construction, `LlmProvider` calls, `StrategicPlan` parsing) lives in the `LlmPuppetMaster` implementation of the `PuppetMaster` trait. `GuidedAi` handles the generic wrapper mechanics (consultation scheduling, parameter bridging, event forwarding) that apply to all Puppet Master types.

#### Implementations

**`LlmPuppetMaster` (AI Puppet Master — LLM-based):**
- Implements `PuppetMaster` with `kind() → Llm`
- Contains `LlmProvider` (D016 BYOLLM), prompt templates, response parsing
- `consult()` serializes game state into a prompt, sends to LLM, parses `StrategicPlan`
- Async consultation — fires request, returns previous guidance until response arrives
- This is the guidance logic extracted from D044's `LlmOrchestratorAi`
- See D044 for the full `StrategicPlan` schema, parameter mapping table, and design points

**`HumanPuppetMaster` (Human Puppet Master):**
- Implements `PuppetMaster` with `kind() → Human`
- Receives structured intents from a human player via the D073 prompt submission pipeline
- The human submits strategic directives (text or structured: "focus anti-air", "expand north", "defend and tech up")
- `consult()` translates the most recent human directive into `StrategicGuidance`
- Requires a designated human seat in the lobby (D073 coach slot)
- Vision scope follows D073 policy: team-shared vision in fair modes, observer vision in showmatch only

**Future implementations (architecture supports but does not schedule):**
- **Rule-based advisor** — hand-authored strategy rules ("if opponent has more air than ground, prioritize AA") as a simpler, deterministic alternative to LLM guidance
- **ML model advisor** — a trained neural network that reads game state and outputs strategic parameters, compiled to WASM and distributed via Workshop
- **Multi-agent ensemble** — multiple PMs voting or averaging their guidance for more robust strategy
- **Training coach** — a PM designed for new player onboarding (D065) that guides the AI in ways that teach the human player

#### Lobby Integration

The lobby displays Puppet Master assignment per AI slot when a PM is configured:

```
Player 1: [Human]                                                    Faction: Soviet
Player 2: [AI] Col. Volkov — Armor (Hard)                           Faction: Soviet
Player 3: [AI] Col. Stavros — Air (Normal) ◆ LLM Advisor            Faction: Allied
Player 4: [AI] IC Default AI (Brutal)      ◆ Coach: Alice           Faction: Allied

Balance Preset: IC Default
```

- **No badge** = Masterless (Tier 0) — the default, no special UI
- **◆ LLM Advisor** = AI Puppet Master via LLM (Tier 1)
- **◆ Coach: [Name]** = Human Puppet Master via prompt-coached seat (Tier 2)

Puppet Master assignment is optional and separate from commander/difficulty selection. A player can assign any PM to any AI slot — "Col. Volkov with LLM Advisor" or "IC Default AI with Coach: Alice" are both valid.

**Policy enforcement:** Puppet Master assignment respects D073's match policy matrix. In ranked matches, no PMs are allowed (all AI is Masterless). In custom/LAN, any PM type is available. In tournaments, organizer policy governs PM availability.

#### Determinism and Multiplayer

Puppet Master guidance flows through the same determinism-safe path as D044:

1. The PM produces `StrategicGuidance` on one machine (the AI slot owner's client)
2. `GuidedAi` translates guidance to `set_parameter()` calls on the inner AI
3. The inner AI's `decide()` produces `PlayerOrder`s that enter the `NetworkModel` pipeline
4. All clients execute the same orders at the same tick boundaries
5. Replays record orders, not PM consultations — replay playback is fully deterministic

For Human Puppet Masters specifically: the human's directives are submitted through the relay as prompt messages (D073 pipeline), stamped with role and vision scope, and delivered to the AI slot owner's client. The directive itself is not a sim event — only the resulting orders are.

#### Observability

The current Puppet Master state is visible in spectator/debug overlays:

- PM kind badge and display name
- Current strategic guidance summary (from `StrategicGuidance.reasoning`)
- Last consultation tick and next scheduled consultation
- Parameter changes applied (for debugging)
- For Human PMs: the most recent directive text (if replay annotation capture is enabled per D073 privacy rules)

#### Crate Boundaries

| Component                  | Crate                | Reason                                                                |
| -------------------------- | -------------------- | --------------------------------------------------------------------- |
| `PuppetMaster` trait       | `ic-ai`              | AI infrastructure — no external deps                                  |
| `GuidedAi` struct          | `ic-ai`              | Generic wrapper, same crate as `AiStrategy` impls                     |
| `LlmPuppetMaster`          | `ic-ai`              | Uses `ic-llm`'s `LlmProvider` via dependency                          |
| `HumanPuppetMaster`        | `ic-ai`              | Receives directives via channel from `ic-net`/`ic-game` input routing |
| Prompt submission pipeline | `ic-net` / `ic-game` | D073 infrastructure routes human directives to the PM                 |
| PM display in lobby        | `ic-ui`              | Lobby presentation                                                    |
| PM spectator overlay       | `ic-ui`              | Observability display                                                 |

#### Relationship to Existing Decisions

- **D041 (`AiStrategy` trait):** The Puppet Master operates *on top of* `AiStrategy`, not alongside it. `GuidedAi` implements `AiStrategy` by wrapping an inner `AiStrategy` + a `PuppetMaster`. The `set_parameter()` mechanism (D041) is the bridge — the PM speaks through parameter adjustments, the AI listens through its existing parameter infrastructure.
- **D043 (AI presets + commanders):** Puppet Masters are orthogonal to personality presets and commanders. "Col. Volkov (Hard) with LLM Advisor" layers three independent axes: character presentation (commander) × behavioral parameters (preset + overrides) × strategic guidance (Puppet Master). Masterless is the default — commander personas work perfectly without any PM.
- **D044 (LLM AI):** `LlmOrchestratorAi` is reconceptualized as `GuidedAi<LlmPuppetMaster>` — a `GuidedAi` wrapper with an LLM-based Puppet Master. The full `StrategicPlan` schema, parameter mapping, event log integration, and design points from D044 apply directly to `LlmPuppetMaster`. `LlmPlayerAi` (experimental full LLM control) is a separate concept — it bypasses the PM pattern entirely because the LLM *is* the AI, not an advisor to one.
- **D070 (Asymmetric Co-op):** The Commander & Field Ops pattern is distinct from Puppet Masters. In D070, the Commander is a *player* who directly controls base-building and production while Field Ops players control units. In the Puppet Master pattern, the human provides *strategic direction* but has no direct unit or building control — the AI executes everything. A D070 Commander issues build orders; a Human Puppet Master says "focus on anti-air" and the AI decides when and how to build AA.
- **D073 (LLM Exhibition Modes):** Prompt-Coached mode is the primary delivery surface for Human Puppet Masters. D073's prompt submission pipeline, rate limiting, vision scope rules, relay routing, and replay privacy all apply. Director/Audience prompt sources from D073 showmatch mode are specialized variants of Human Puppet Master with different vision and trust policies.
- **D055 (Ranked):** No Puppet Masters in ranked play. All AI slots in ranked matches are Masterless — this is enforced by D073's match policy matrix.

---
