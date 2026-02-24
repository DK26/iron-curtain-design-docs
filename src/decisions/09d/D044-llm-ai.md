## D044: LLM-Enhanced AI — Orchestrator and Experimental LLM Player

**Status:** Accepted
**Scope:** `ic-llm`, `ic-ai`, `ic-sim` (read-only)
**Phase:** LLM Orchestrator: Phase 7. LLM Player: Experimental, no scheduled phase.

### The Problem

D016 provides LLM integration for mission generation. D042 provides LLM coaching between games. But neither addresses LLM involvement *during* gameplay — using an LLM to influence or directly control AI decisions in real-time. Two distinct use cases exist:

1. **Enhancing existing AI** — an LLM advisor that reads game state and nudges a conventional AI toward better strategic decisions, without replacing the tick-level execution
2. **Full LLM control** — an experimental mode where an LLM makes every decision, exploring whether modern language models can play RTS games competently

### Decision

Define two new `AiStrategy` implementations (D041) for LLM-integrated gameplay:

### 1. LLM Orchestrator (`LlmOrchestratorAi`)

Wraps any existing `AiStrategy` implementation (D041) and periodically consults an LLM for high-level strategic guidance. The inner AI handles tick-level execution; the LLM provides strategic direction.

```rust
/// Wraps an existing AiStrategy with LLM strategic oversight.
/// The inner AI makes tick-level decisions; the LLM provides
/// periodic strategic guidance that the inner AI incorporates.
pub struct LlmOrchestratorAi {
    inner: Box<dyn AiStrategy>,         // the AI that actually issues orders
    provider: Box<dyn LlmProvider>,     // D016 BYOLLM
    consultation_interval: u64,         // ticks between LLM consultations
    last_consultation: u64,
    current_plan: Option<StrategicPlan>,
    event_log: AiEventLog,              // D041 — fog-filtered event accumulator
}
```

**How it works:**

```
Every N ticks (configurable, default ~300 = ~10 seconds at 30 tick/s):
  1. Serialize visible game state into a structured prompt:
     - Own base layout, army composition, resource levels
     - Known enemy positions, army composition estimate
     - Current strategic plan (if any)
     - event_log.to_narrative(last_consultation) — fog-filtered event chronicle
  2. Send prompt to LlmProvider (D016)
  3. LLM returns a StrategicPlan:
     - Priority targets (e.g., "attack enemy expansion at north")
     - Build focus (e.g., "switch to anti-air production")
     - Economic guidance (e.g., "expand to second ore field")
     - Risk assessment (e.g., "enemy likely to push soon, fortify choke")
  4. Translate StrategicPlan into inner AI parameter adjustments via set_parameter()
     (e.g., "switch to anti-air" → set_parameter("tech_priority_aa", 80))
  5. Record plan change as StrategicUpdate event in event_log
  6. Inner AI incorporates guidance into its normal tick-level decisions

Between consultations:
  - Inner AI runs normally, using the last parameter adjustments as guidance
  - Tick-level micro, build queue management, unit control all handled by inner AI
  - No LLM latency in the hot path
  - Events continue accumulating in event_log for the next consultation
```

**Event log as LLM context (D041 integration):**

The `AiEventLog` (defined in D041) is the bridge between simulation events and LLM understanding. The orchestrator accumulates fog-filtered events from the D041 callback pipeline — `on_enemy_spotted`, `on_under_attack`, `on_unit_destroyed`, etc. — and serializes them into a natural-language narrative via `to_narrative(since_tick)`. This narrative is the "inner game event log / action story / context" the LLM reads to understand what happened since its last consultation.

The event log is **fog-filtered by construction** — all events originate from the same fog-filtered callback pipeline that respects `FogFilteredView`. The LLM never receives information about actions behind fog of war, only events the AI player is supposed to be aware of. This is an architectural guarantee, not a filtering step that could be bypassed.

**Event callback forwarding:**

The orchestrator implements all D041 event callbacks by forwarding to both the inner AI and the event log:

```rust
impl AiStrategy for LlmOrchestratorAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // Check if it's time for an LLM consultation
        if tick - self.last_consultation >= self.consultation_interval {
            self.consult_llm(player, view, tick);
        }
        // Delegate tick-level decisions to the inner AI
        self.inner.decide(player, view, tick)
    }

    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        self.event_log.push(AiEventEntry {
            tick: self.current_tick,
            event_type: AiEventType::EnemySpotted,
            description: format!("Enemy {} spotted", unit_type),
            entity: Some(unit),
            related_entity: None,
        });
        self.inner.on_enemy_spotted(unit, unit_type);  // forward to inner AI
    }

    fn on_under_attack(&mut self, unit: EntityId, attacker: EntityId) {
        self.event_log.push(/* ... */);
        self.inner.on_under_attack(unit, attacker);
    }

    // ... all other callbacks follow the same pattern:
    // 1. Record in event_log  2. Forward to inner AI

    fn name(&self) -> &str { "LLM Orchestrator" }
    fn difficulty(&self) -> AiDifficulty { self.inner.difficulty() }
    fn tick_budget_hint(&self) -> Option<u64> { self.inner.tick_budget_hint() }

    // Delegate parameter introspection — expose orchestrator params + inner AI params
    fn get_parameters(&self) -> Vec<ParameterSpec> {
        let mut params = vec![
            ParameterSpec {
                name: "consultation_interval".into(),
                description: "Ticks between LLM consultations".into(),
                min_value: 30, max_value: 3000,
                default_value: 300, current_value: self.consultation_interval as i32,
            },
        ];
        // Include inner AI's parameters (prefixed for clarity)
        params.extend(self.inner.get_parameters());
        params
    }

    fn set_parameter(&mut self, name: &str, value: i32) {
        match name {
            "consultation_interval" => self.consultation_interval = value as u64,
            _ => self.inner.set_parameter(name, value),  // delegate to inner AI
        }
    }

    // Delegate engine scaling to inner AI — the orchestrator adds LLM guidance,
    // difficulty scaling applies to the underlying AI that executes orders
    fn uses_engine_difficulty_scaling(&self) -> bool {
        self.inner.uses_engine_difficulty_scaling()
    }
}
```

**How StrategicPlan reaches the inner AI:**

The orchestrator translates `StrategicPlan` fields into `set_parameter()` calls on the inner AI (D041). For example:
- "Switch to anti-air production" → `set_parameter("tech_priority_aa", 80)`
- "Be more aggressive" → `set_parameter("aggression", 75)`
- "Expand to second ore field" → `set_parameter("expansion_priority", 90)`

This uses D041's existing parameter introspection infrastructure — no new trait methods needed. The inner AI's `get_parameters()` exposes its tunable knobs; the LLM's strategic output maps to those knobs. An inner AI that doesn't expose relevant parameters simply ignores guidance it can't act on — the orchestrator degrades gracefully.

**Key design points:**
- **No latency impact on gameplay.** LLM consultation is async — fires off a request, continues with the previous plan until the response arrives. If the LLM is slow (or unavailable), the inner AI plays normally.
- **BYOLLM (D016).** Same provider system — users configure their own model. Local models (Ollama) give lowest latency; cloud APIs work but add ~1-3s round-trip per consultation.
- **Determinism maintained.** In multiplayer, the LLM runs on exactly one machine (the AI slot owner's client). The resulting `StrategicPlan` is submitted as an order through the `NetworkModel` — the same path as human player orders. Other clients never run the LLM; they receive and apply the same plan at the same deterministic tick boundary. In singleplayer, determinism is trivially preserved (orders are recorded in the replay, not LLM calls).
- **Inner AI is any `AiStrategy`.** Orchestrator wraps IC Default, Classic RA, a community WASM AI (D043), or even a `StyleDrivenAi` (D042). The LLM adds strategic thinking on top of whatever execution style is underneath. Because the orchestrator communicates through the generic `AiStrategy` trait (event callbacks + `set_parameter()`), it works with any implementation — including community-provided WASM AI mods.
- **Two-axis difficulty compatibility (D043).** The orchestrator delegates `difficulty()` and `uses_engine_difficulty_scaling()` to the inner AI. Engine-level difficulty scaling (resource bonuses, reaction delays) applies to the inner AI's execution; the LLM consultation frequency and depth are separate parameters exposed via `get_parameters()`. In the lobby, players select the inner AI + difficulty normally, then optionally enable LLM orchestration on top.
- **Observable.** The current `StrategicPlan` and the event log narrative are displayed in a debug overlay (developer/spectator mode), letting players see the LLM's "thinking" and the events that informed it.
- **Prompt engineering is in YAML.** Prompt templates are mod-data, not hardcoded. Modders can customize LLM prompts for different game modules or scenarios.

```yaml
# llm/prompts/orchestrator.yaml
orchestrator:
  system_prompt: |
    You are a strategic advisor for a Red Alert AI player.
    Analyze the game state and provide high-level strategic guidance.
    Do NOT issue specific unit orders — your AI subordinate handles execution.
    Focus on: what to build, where to expand, when to attack, what threats to prepare for.
  response_format:
    type: structured
    schema: StrategicPlan
  consultation_interval_ticks: 300
  max_tokens: 500
```

### 2. LLM Player (`LlmPlayerAi`) — Experimental

A fully LLM-driven player where the language model makes every decision. No inner AI — the LLM receives game state and emits player orders directly. This is the "LLM makes every small decision" path — the architecture supports it through the same `AiStrategy` trait and `AiEventLog` infrastructure as the orchestrator.

```rust
/// Experimental: LLM makes all decisions directly.
/// Every N ticks, the LLM receives game state and returns orders.
/// Performance and quality depend entirely on the LLM model and latency.
pub struct LlmPlayerAi {
    provider: Box<dyn LlmProvider>,
    decision_interval: u64,           // ticks between LLM decisions
    pending_orders: Vec<PlayerOrder>, // buffered orders from last LLM response
    order_cursor: usize,              // index into pending_orders for drip-feeding
    event_log: AiEventLog,            // D041 — fog-filtered event accumulator
}
```

**How it works:**
- Every N ticks, serialize `FogFilteredView` + `event_log.to_narrative(last_decision_tick)` → send to LLM → receive a batch of `PlayerOrder` values
- The event log narrative gives the LLM a chronological understanding of what happened — "what has been going on in this game" — rather than just a snapshot of current state
- Between decisions, drip-feed buffered orders to the sim (one or few per tick)
- If the LLM response is slow, the player idles (no orders until response arrives)
- Event callbacks continue accumulating into the event log between LLM decisions, building a richer narrative for the next consultation

**Why the event log matters for full LLM control:**

The LLM Player receives `FogFilteredView` (current game state) AND `AiEventLog` (recent game history). Together these give the LLM:
- **Spatial awareness** — what's where right now (from `FogFilteredView`)
- **Temporal awareness** — what happened recently (from the event log narrative)
- **Causal understanding** — "I was attacked from the north, my refinery was destroyed, I spotted 3 enemy tanks" forms a coherent story the LLM can reason about

Without the event log, the LLM would see only a static snapshot every N ticks, with no continuity between decisions. The log bridges decisions into a narrative that LLMs are natively good at processing.

**Why this is experimental:**
- **Latency.** Even local LLMs take 100-500ms per response. A 30 tick/s sim expects decisions every 33ms. The LLM Player will always be slower than a conventional AI.
- **Quality ceiling.** Current LLMs struggle with spatial reasoning and precise micro. The LLM Player will likely lose to even Easy conventional AI in direct combat efficiency.
- **Cost.** Cloud LLMs charge per token. A full game might generate thousands of consultations. Local models are free but slower.
- **The value is educational and entertaining**, not competitive. Watching an LLM try to play Red Alert — making mistakes, forming unexpected strategies, explaining its reasoning — is intrinsically interesting. Community streaming of "GPT vs. Claude playing Red Alert" is a content opportunity.

**Design constraints:**
- **Never the default.** LLM Player is clearly labeled "Experimental" in the lobby.
- **Not allowed in ranked.** LLM AI modes are excluded from competitive matchmaking.
- **Observable.** The LLM's reasoning text and event log narrative are capturable as a spectator overlay, enabling commentary-style viewing.
- **Same BYOLLM infrastructure.** Uses `LlmProvider` trait (D016), same configuration, same provider options.
- **Two-axis difficulty compatibility (D043).** Engine-level difficulty scaling (resource bonuses, reaction delays) applies normally — `uses_engine_difficulty_scaling()` returns `true`. The LLM's "skill" is inherent in the model's capability and prompt engineering, not in engine parameters. `get_parameters()` exposes LLM-specific knobs: decision interval, max tokens, model selection, prompt template — but the LLM's quality is ultimately model-dependent, not engine-controlled. This is an honest design: we don't pretend to make the LLM "harder" or "easier" through engine scaling, but we do let the engine give it economic advantages or handicaps.
- **Determinism:** The LLM runs on one machine (the AI slot owner's client) and submits orders through the `NetworkModel`, just like human input. All clients apply the same orders at the same deterministic tick boundaries. The LLM itself is non-deterministic (different responses per run), but that non-determinism is resolved before orders enter the sim — the sim only sees deterministic order streams. Replays record orders (not LLM calls), so replay playback is fully deterministic.

### Relationship to D041/D043 — Integration Summary

The LLM AI modes build entirely on the `AiStrategy` trait (D041) and the two-axis difficulty system (D043):

| Concern                             | Orchestrator                                                                                   | LLM Player                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Implements `AiStrategy`?            | Yes — wraps an inner `AiStrategy`                                                              | Yes — direct implementation                                 |
| Uses `AiEventLog`?                  | Yes — accumulates events for LLM prompts, forwards callbacks to inner AI                       | Yes — accumulates events for LLM self-context               |
| `FogFilteredView`?                  | Yes — serialized into LLM prompt alongside event narrative                                     | Yes — serialized into LLM prompt                            |
| Event callbacks?                    | Forwards to inner AI + records in event log                                                    | Records in event log for next LLM consultation              |
| `set_parameter()`?                  | Exposes orchestrator params + delegates to inner AI; translates LLM plans to param adjustments | Exposes LLM-specific params (decision_interval, max_tokens) |
| `get_parameters()`?                 | Returns orchestrator params + inner AI's params                                                | Returns LLM Player params                                   |
| `uses_engine_difficulty_scaling()`? | Delegates to inner AI                                                                          | Returns `true` (engine bonuses/handicaps apply)             |
| `difficulty()`?                     | Delegates to inner AI                                                                          | Returns selected difficulty (user picks in lobby)           |
| Two-axis difficulty?                | Inner AI axis applies to execution; orchestrator params are separate                           | Engine scaling applies; LLM quality is model-dependent      |

The critical architectural property: **neither LLM AI mode introduces any new trait methods, crate dependencies, or sim-layer concepts.** They compose entirely from existing infrastructure — `AiStrategy`, `AiEventLog`, `FogFilteredView`, `set_parameter()`, `LlmProvider`. This means the LLM AI path doesn't constrain or complicate the non-LLM AI path. A modder who never uses LLM features is completely unaffected.

### Future Path: Full LLM Control at Scale

The current `LlmPlayerAi` is limited by latency (LLM responses take 100-500ms vs. 33ms sim ticks) and spatial reasoning capability. As LLM inference speeds improve and models gain better spatial/numerical reasoning, the same architecture scales:
- Faster models → lower `decision_interval` → more responsive LLM play
- Better spatial reasoning → LLM can handle micro, not just strategy
- Multimodal models → render a minimap image as additional LLM context alongside the event narrative
- The `AiStrategy` trait, `AiEventLog`, and `FogFilteredView` infrastructure are all model-agnostic — they serve whatever LLM capability exists at runtime

The architecture is deliberately designed not to stand in the way of full LLM control becoming practical. Every piece needed for "LLM makes every small decision" already exists in the trait design — the only bottleneck is LLM speed and quality, which are external constraints that improve over time.

### Crate Boundaries

| Component                     | Crate    | Reason                                                         |
| ----------------------------- | -------- | -------------------------------------------------------------- |
| `LlmOrchestratorAi` struct    | `ic-ai`  | AI strategy implementation                                     |
| `LlmPlayerAi` struct          | `ic-ai`  | AI strategy implementation                                     |
| `StrategicPlan` type          | `ic-ai`  | AI-internal data structure                                     |
| `AiEventLog` struct           | `ic-ai`  | Engine-provided event accumulator (D041 design, `ic-ai` impl)  |
| `LlmProvider` trait           | `ic-llm` | Existing D016 infrastructure                                   |
| Prompt templates (YAML)       | mod data | Game-module-specific, moddable                                 |
| Game state serializer for LLM | `ic-ai`  | Reads sim state (read-only), formats for LLM prompts           |
| Debug overlay (plan viewer)   | `ic-ui`  | Spectator/dev UI for observing LLM reasoning + event narrative |

### Alternatives Considered

- LLM replaces inner AI entirely in orchestrator mode (rejected — latency makes tick-level LLM control impractical; hybrid is better)
- LLM operates between games only (rejected — D042 already covers between-game coaching; real-time guidance is the new capability)
- No LLM Player mode (rejected — the experimental mode has minimal implementation cost and high community interest/entertainment value)
- LLM in the sim crate (rejected — violates BYOLLM optionality; `ic-ai` imports `ic-llm` optionally, `ic-sim` never imports either)
- New trait method `set_strategic_guidance()` for LLM → inner AI communication (rejected — `set_parameter()` already provides the mechanism; adding an LLM-specific method to the generic `AiStrategy` trait would couple the trait to an optional feature)
- Custom event log per AI instead of engine-provided `AiEventLog` (rejected — the log benefits all AI implementations for debugging/observation, not just LLM; making it engine infrastructure avoids redundant implementations)

### Relationship to Existing Decisions

- **D016 (BYOLLM):** Same provider infrastructure. Both LLM AI modes use `LlmProvider` trait for model access.
- **D041 (`AiStrategy` trait):** Both modes implement `AiStrategy`. The orchestrator wraps any `AiStrategy` via the generic trait. Both use `AiEventLog` (D041) for fog-filtered event accumulation. The orchestrator communicates with the inner AI through `set_parameter()` and event callback forwarding — all D041 infrastructure.
- **D042 (`StyleDrivenAi`):** The orchestrator can wrap `StyleDrivenAi` — LLM strategic guidance on top of a mimicked player's style. The `AiEventLog` serves both D042 (profile building reads events) and D044 (LLM reads events).
- **D043 (AI presets + two-axis difficulty):** LLM AI integrates with the two-axis difficulty system. Orchestrator delegates difficulty to inner AI; LLM Player accepts engine scaling. Users select inner AI + difficulty in the lobby, then optionally enable LLM orchestration.
- **D031 (telemetry):** The `GameplayEvent` stream (D031) feeds the fog-filtered callback pipeline that populates `AiEventLog`. D031 is the raw data source; D041 callbacks are the filtered AI-facing interface; `AiEventLog` is the accumulated narrative.
- **D034 (SQLite):** LLM consultation history (prompts sent, plans received, execution outcomes) stored in SQLite for debugging and quality analysis. No new tables required — uses the existing `gameplay_events` schema with LLM-specific event types.
- **D057 (Skill Library):** The orchestrator is the primary producer and consumer of AI strategy skills. Proven `StrategicPlan` outputs are stored in the skill library; future consultations retrieve relevant skills as few-shot prompt context. See D057 for the full verification→storage→retrieval loop.

---

---

