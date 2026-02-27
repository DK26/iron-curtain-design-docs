## D041: Trait-Abstracted Subsystem Strategy — Beyond Networking and Pathfinding

**Decision:** Extend the `NetworkModel`/`Pathfinder`/`SpatialIndex` trait-abstraction pattern to five additional engine subsystems that carry meaningful risk of regret if hardcoded: **AI strategy, fog of war, damage resolution, ranking/matchmaking, and order validation**. Each gets a formal trait in the engine, a default implementation in the RA1 game module, and the same "costs near-zero now, prevents rewrites later" guarantee.

**Context:** The engine already trait-abstracts 14 subsystems (see inventory below, including Transport added by D054). These were designed individually — some as architectural invariants (D006 networking, D013 pathfinding), others as consequences of multi-game extensibility (D018 `GameModule`, `Renderable`, `FormatRegistry`). But several critical *algorithm-level* concerns remain hardcoded in RA1's system implementations. For data-driven concerns (weather, campaigns, achievements, themes), YAML+Lua modding provides sufficient flexibility — no trait needed. For *algorithmic* concerns, the resolution logic itself is what varies between game types and modding ambitions.

**The principle:** Abstract the *algorithm*, not the *data*. If a modder can change behavior through YAML values or Lua scripts, a trait is unnecessary overhead. If changing behavior requires replacing the *logic* — the decision-making process, the computation pipeline, the scoring formula — that's where a trait prevents a future rewrite.

### Inventory: Already Trait-Abstracted (14)

| Trait                             | Crate                              | Decision  | Phase  |
| --------------------------------- | ---------------------------------- | --------- | ------ |
| `NetworkModel`                    | ic-net                             | D006      | 2      |
| `Pathfinder`                      | ic-sim (trait), game module (impl) | D013      | 2      |
| `SpatialIndex`                    | ic-sim (trait), game module (impl) | D013      | 2      |
| `InputSource`                     | ic-game                            | D018      | 2      |
| `ScreenToWorld`                   | ic-render                          | D018      | 1      |
| `Renderable` / `RenderPlugin`     | ic-render                          | D017/D018 | 1      |
| `GameModule`                      | ic-game                            | D018      | 2      |
| `OrderCodec`                      | ic-protocol                        | D007      | 5      |
| `TrackingServer`                  | ic-net                             | D007      | 5      |
| `LlmProvider`                     | ic-llm                             | D016      | 7      |
| `FormatRegistry` / `FormatLoader` | ra-formats                         | D018      | 0      |
| `SimReconciler`                   | ic-net                             | D011      | Future |
| `CommunityBridge`                 | ic-net                             | D011      | Future |
| `Transport`                       | ic-net                             | D054      | 5      |

### New Trait Abstractions (5)

#### 1. `AiStrategy` — Pluggable AI Decision-Making

**Problem:** `ic-ai` defines `AiPersonality` as a YAML-configurable parameter struct (aggression, tech preference, micro level) that tunes behavior within a fixed decision algorithm. This is great for balance knobs — but a modder who wants a fundamentally different AI approach (GOAP planner, Monte Carlo tree search, neural network, scripted state machine, or a tournament-specific meta-counter AI) cannot plug one in. They'd have to fork `ic-ai` or write a WASM mod that reimplements the entire AI from scratch.

**Solution:**

```rust
/// Game modules and mods implement this to provide AI opponents.
/// The default RA1 implementation uses AiPersonality-driven behavior trees.
/// Mods can provide alternatives: planning-based, neural, procedural, etc.
pub trait AiStrategy: Send + Sync {
    /// Called once per AI player per tick. Reads visible game state, emits orders.
    fn decide(
        &mut self,
        player: PlayerId,
        view: &FogFilteredView,  // only what this player can see
        tick: u64,
    ) -> Vec<PlayerOrder>;

    /// Human-readable name for lobby display.
    fn name(&self) -> &str;

    /// Difficulty tier for matchmaking/UI categorization.
    fn difficulty(&self) -> AiDifficulty;

    /// Optional: per-tick compute budget hint (microseconds).
    fn tick_budget_hint(&self) -> Option<u64>;

    // --- Event callbacks (inspired by Spring Engine + BWAPI research) ---
    // Default implementations are no-ops. AIs override what they care about.
    // Events are pushed by the engine at the same pipeline point as decide(),
    // before the decide() call — so the AI can react within the same tick.

    /// Own unit finished construction/training.
    fn on_unit_created(&mut self, _unit: EntityId, _unit_type: &str) {}
    /// Own unit destroyed.
    fn on_unit_destroyed(&mut self, _unit: EntityId, _attacker: Option<EntityId>) {}
    /// Own unit has no orders (idle).
    fn on_unit_idle(&mut self, _unit: EntityId) {}
    /// Enemy unit enters line of sight.
    fn on_enemy_spotted(&mut self, _unit: EntityId, _unit_type: &str) {}
    /// Known enemy unit destroyed.
    fn on_enemy_destroyed(&mut self, _unit: EntityId) {}
    /// Own unit taking damage.
    fn on_under_attack(&mut self, _unit: EntityId, _attacker: EntityId) {}
    /// Own building completed.
    fn on_building_complete(&mut self, _building: EntityId) {}
    /// Research/upgrade completed.
    fn on_research_complete(&mut self, _tech: &str) {}

    // --- Parameter introspection (inspired by MicroRTS research) ---
    // Enables: automated parameter tuning, UI-driven difficulty sliders,
    // tournament parameter search, AI vs AI evaluation.

    /// Expose tunable parameters for external configuration.
    fn get_parameters(&self) -> Vec<ParameterSpec> { vec![] }
    /// Set a parameter value (called by engine from YAML config or UI).
    fn set_parameter(&mut self, _name: &str, _value: i32) {}

    // --- Engine difficulty scaling (inspired by 0 A.D. + AoE2 research) ---

    /// Whether this AI uses engine-level difficulty scaling (resource bonuses,
    /// reaction delays, etc.). Default: true. Sophisticated AIs that handle
    /// difficulty internally can return false to opt out.
    fn uses_engine_difficulty_scaling(&self) -> bool { true }
}

pub enum AiDifficulty { Sandbox, Easy, Normal, Hard, Brutal, Custom(String) }

pub struct ParameterSpec {
    pub name: String,
    pub description: String,
    pub min_value: i32,
    pub max_value: i32,
    pub default_value: i32,
    pub current_value: i32,
}
```

**`FogFilteredView` — the AI's window into the game:**

```rust
/// Everything an AI player is allowed to see. Constructed by the engine from
/// FogProvider (this decision) and passed to AiStrategy::decide() each tick.
/// This is the ONLY game state interface available to AI — no back-door access
/// to the full sim state.
pub struct FogFilteredView {
    // --- Own forces ---
    pub own_units: Vec<AiUnitInfo>,
    pub own_structures: Vec<AiStructureInfo>,
    pub own_production_queues: Vec<AiProductionQueue>,

    // --- Visible enemies (currently in line of sight) ---
    pub visible_enemies: Vec<AiUnitInfo>,
    pub visible_enemy_structures: Vec<AiStructureInfo>,

    // --- Explored-but-not-visible enemies (last known state) ---
    pub known_enemy_structures: Vec<AiLastKnownInfo>,

    // --- Neutrals ---
    pub visible_neutrals: Vec<AiUnitInfo>,

    // --- Economy ---
    pub resources: AiResourceInfo,
    pub power: AiPowerInfo,

    // --- Map knowledge ---
    pub map_bounds: (u32, u32),          // map dimensions in cells
    pub current_tick: u64,
    pub explored_fraction_permille: u16, // 0-1000, how much map is explored
    pub terrain_passability: &TerrainData, // for pathfinding queries
}

pub struct AiUnitInfo {
    pub entity: EntityId,
    pub unit_type: String,
    pub owner: PlayerId,
    pub position: WorldPos,
    pub health_permille: u16,    // 0-1000 (current/max × 1000)
    pub facing: WAngle,
    pub veterancy: u8,           // 0-3
    pub is_idle: bool,
    pub current_order: Option<String>,  // "move", "attack", "harvest", etc.
}

pub struct AiStructureInfo {
    pub entity: EntityId,
    pub structure_type: String,
    pub owner: PlayerId,
    pub position: WorldPos,
    pub health_permille: u16,
    pub is_powered: bool,
    pub is_producing: bool,
}

pub struct AiLastKnownInfo {
    pub entity: EntityId,
    pub structure_type: String,
    pub owner: PlayerId,
    pub position: WorldPos,
    pub last_seen_tick: u64,     // when this was last visible
}

pub struct AiResourceInfo {
    pub credits: i32,
    pub credits_per_tick: i32,       // current income rate (fixed-point, 1024 scale)
    pub ore_fields_known: u16,       // number of ore patches the AI has explored
    pub harvesters_active: u8,
    pub refineries_count: u8,
    pub storage_capacity: i32,       // max credits before overflow
}

pub struct AiPowerInfo {
    pub power_generated: i32,
    pub power_consumed: i32,
    pub is_low_power: bool,          // consumed > generated
    pub surplus: i32,                // generated - consumed (negative = deficit)
}

pub struct AiProductionQueue {
    pub queue_type: String,          // "infantry", "vehicle", "aircraft", "building", "naval"
    pub current_item: Option<String>,
    pub progress_permille: u16,      // 0-1000
    pub queue_length: u8,
    pub can_produce: Vec<String>,    // unit/structure types available given current tech
}
```

**`EventSummary` — structured digest of recent events:**

```rust
/// Returned by AiEventLog::summary(). Provides aggregate statistics
/// about recent events for AIs that prefer structured data over narrative.
pub struct EventSummary {
    pub total_events: u32,
    pub events_by_type: HashMap<AiEventType, u32>,
    pub most_recent_threat: Option<ThreatSummary>,
    pub units_lost_since: u32,       // units lost since last summary request
    pub units_gained_since: u32,     // units created since last summary request
    pub enemies_spotted_since: u32,
    pub last_attack_tick: Option<u64>,
}

pub struct ThreatSummary {
    pub direction: WAngle,           // approximate compass direction of most recent threat
    pub estimated_strength: u16,     // rough unit count of visible enemy forces
    pub threat_type: String,         // "armor", "air", "infantry", "mixed"
    pub last_spotted_tick: u64,
}
```

**Key design points:**
- `FogFilteredView` ensures AI honesty — no maphack by default. Campaign scripts can provide an omniscient view for specific AI players via conditions.
- `AiPersonality` becomes the configuration for the *default* `AiStrategy` implementation (`PersonalityDrivenAi`), not the only way to configure AI.
- **Event callbacks** (from Spring Engine/BWAPI research, see `research/rts-ai-extensibility-survey.md`) enable reactive AI without polling. Pure `decide()`-only AI works fine (events are optional), but event-aware AI can respond immediately to threats, idle units, and scouting information. Events fire before `decide()` in the same tick, so the AI can incorporate event data into its tick decision.
- **Parameter introspection** (from MicroRTS research) enables automated parameter tuning and UI-driven difficulty sliders. Every `AiStrategy` can expose its knobs — tournament systems use this for automated parameter search, the lobby UI uses it for "Advanced AI Settings" sliders.
- **Engine difficulty scaling opt-out** (from 0 A.D. + AoE2 research) lets sophisticated AIs handle difficulty internally. Simple AIs get engine-provided resource bonuses and reaction time delays; advanced AIs that model difficulty as behavioral parameters can opt out.
- AI strategies are selectable in the lobby: "IC Default (Normal)", "IC Default (Brutal)", "Workshop: Neural Net v2.1", etc.
- WASM Tier 3 mods can provide `AiStrategy` implementations — the trait is part of the stable mod API surface.
- Lua Tier 2 mods can script lightweight AI via the existing Lua API (trigger-based). `AiStrategy` trait is for full-replacement AI, not scripted behaviors.
- Adaptive difficulty (D034 integration) is implemented inside the default strategy, not in the trait — it's an implementation detail of `PersonalityDrivenAi`.
- Determinism: `decide()` and all event callbacks are called at a fixed point in the system pipeline. All clients run the same AI with the same state → same orders. Mod-provided AI is subject to the same determinism requirements as any sim code.

**Event accumulation — `AiEventLog`:**

The engine provides an `AiEventLog` utility struct to every `AiStrategy` instance. It accumulates fog-filtered events from the callbacks above into a structured, queryable log — the "inner game event log" that D044 (LLM-enhanced AI) consumes as its primary context source. Non-LLM AI can ignore the log entirely (zero cost if `to_narrative()` is never called); LLM-based AI uses it as the bridge between simulation events and natural-language prompts.

```rust
/// Accumulates fog-filtered game events into a structured log.
/// Provided by the engine to every AiStrategy instance. Events are pushed
/// into the log when callbacks fire — the AI gets both the callback
/// AND a persistent log entry.
pub struct AiEventLog {
    entries: CircularBuffer<AiEventEntry>,  // bounded, oldest entries evicted
    capacity: usize,                        // default: 1000 entries
}

pub struct AiEventEntry {
    pub tick: u64,
    pub event_type: AiEventType,
    pub description: String,  // human/LLM-readable summary
    pub entity: Option<EntityId>,
    pub related_entity: Option<EntityId>,
}

pub enum AiEventType {
    UnitCreated, UnitDestroyed, UnitIdle,
    EnemySpotted, EnemyDestroyed,
    UnderAttack, BuildingComplete, ResearchComplete,
    StrategicUpdate,  // injected by orchestrator AI when plan changes (D044)
}

impl AiEventLog {
    /// All events since a given tick (for periodic LLM consultations).
    pub fn since(&self, tick: u64) -> &[AiEventEntry] { /* ... */ }

    /// Natural-language narrative summary — suitable for LLM prompts.
    /// Produces chronological text: "Tick 450: Enemy tank spotted near our
    /// expansion. Tick 460: Our refinery under attack by 3 enemy units."
    pub fn to_narrative(&self, since_tick: u64) -> String { /* ... */ }

    /// Structured summary — counts by event type, key entities, threat level.
    pub fn summary(&self) -> EventSummary { /* ... */ }
}
```

Key properties of the event log:
- **Fog-filtered by construction.** All entries originate from the same callback pipeline that respects `FogFilteredView` — no event reveals information the AI shouldn't have. This is the architectural guarantee the user asked for: the "action story / context" the LLM reads is honest.
- **Bounded.** Circular buffer with configurable capacity (default 1000 entries). Oldest entries are evicted. No unbounded memory growth.
- **`to_narrative(since_tick)`** generates a chronological natural-language account of events since a given tick — this is the "inner game event log / action story / context" that D044's `LlmOrchestratorAi` sends to the LLM for strategic guidance.
- **`StrategicUpdate` event type.** D044's LLM orchestrator records its own plan changes into the log, creating a complete narrative that includes both game events and AI strategic decisions.
- **Useful beyond LLM.** Debug/spectator overlays for any AI ("what does this AI know?"), D042's behavioral profile building, and replay analysis all benefit from a structured event log.
- **Zero cost if unused.** The engine pushes entries regardless (they're cheap structs), but `to_narrative()` — the expensive serialization — is only called by consumers that need it.

**Modder-selectable and modder-provided:** The `AiStrategy` trait is open — not locked to first-party implementations. This follows the same pattern as `Pathfinder` (D013/D045) and render modes (D048):
1. **Select** any registered `AiStrategy` for a mod (e.g., a Generals total conversion uses a GOAP planner instead of behavior trees)
2. **Provide** a custom `AiStrategy` via a Tier 3 WASM module and distribute it through the Workshop (D030)
3. **Use someone else's** community-created AI — declare it as a dependency in the mod manifest

Unlike pathfinders (one axis: algorithm), AI has **two orthogonal axes**: which algorithm (`AiStrategy` impl) and how hard it plays (difficulty level). See D043 for the full two-axis difficulty system.

**What we build now:** Only `PersonalityDrivenAi` (the existing YAML-configurable behavior). The trait exists from Phase 4 (when AI ships); alternative implementations are future work by us or the community.

**Phase:** Phase 4 (AI & Single Player).

#### 2. `FogProvider` — Pluggable Fog of War Computation

**Problem:** `fog_system()` is system #21 in the RA1 pipeline. It computes visibility based on unit sight ranges — but the computation algorithm is baked into the system implementation. Different game modules need different fog models: radius-based (RA1), line-of-sight with elevation raycast (RA2/TS), hex-grid fog (non-C&C mods), or even no fog at all (sandbox modes). The future fog-authoritative `NetworkModel` needs server-side fog computation that fundamentally differs from client-side — the same `FogProvider` trait would serve both.

**Solution:**

```rust
/// Game modules implement this to define how visibility is computed.
/// The engine calls this from fog_system() — the system schedules the work,
/// the provider computes the result.
pub trait FogProvider: Send + Sync {
    /// Recompute visibility for a player. Called by fog_system() each tick
    /// (or staggered per 10-PERFORMANCE.md amortization rules).
    fn update_visibility(
        &mut self,
        player: PlayerId,
        sight_sources: &[(WorldPos, SimCoord)],  // (position, sight_range) pairs
        terrain: &TerrainData,
    );

    /// Is this position visible to this player right now?
    fn is_visible(&self, player: PlayerId, pos: WorldPos) -> bool;

    /// Is this position explored (ever seen) by this player?
    fn is_explored(&self, player: PlayerId, pos: WorldPos) -> bool;

    /// Bulk query: all entity IDs visible to this player (for AI, render culling).
    fn visible_entities(&self, player: PlayerId) -> &[EntityId];
}
```

**Key design points:**
- RA1 module registers `RadiusFogProvider` — simple circle-based visibility. Fast, cache-friendly, matches original RA behavior.
- RA2/TS module would register `ElevationFogProvider` — raycasts against terrain heightmap for line-of-sight.
- Non-C&C mods could implement hex fog, cone-of-vision, or always-visible. Sandbox/debug modes: `NoFogProvider` (everything visible).
- Fog-authoritative server (`FogAuthoritativeNetwork` from D006 future architectures) reuses the same `FogProvider` on the server side to determine which entities to send to each client.
- Performance: `fog_system()` drives the amortization schedule (stagger updates per `10-PERFORMANCE.md`). The provider does the math; the system decides when to call it.
- Shroud (unexplored terrain) vs. fog (explored but not currently visible) distinction is preserved in the trait via `is_visible()` vs. `is_explored()`.

**What we build now:** Only `RadiusFogProvider`. The trait exists from Phase 2; `ElevationFogProvider` ships when RA2/TS module development begins.

**Phase:** Phase 2 (built alongside `fog_system()` in the sim).

#### 3. `DamageResolver` — Pluggable Damage Pipeline Resolution

**Problem:** D028 defines the full damage pipeline: Armament → Projectile → Warhead → Versus table → multiplier stack → Health reduction. The *data* flowing through this pipeline is deeply moddable — warheads, versus tables, modifier stacks are all YAML-configurable. But the *resolution algorithm* — the order in which shields, armor, conditions, and multipliers are applied — is hardcoded in `projectile_system()`. A game module where shields absorb before armor checks, or where sub-object targeting distributes damage across components (Generals-style), or where damage types bypass armor entirely (TS ion storms) needs a different resolution order. These aren't data changes — they're algorithmic.

**Solution:**

```rust
/// Game modules implement this to define how damage is resolved after
/// a warhead makes contact. The default RA1 implementation applies the
/// standard Versus table + modifier stack pipeline.
pub trait DamageResolver: Send + Sync {
    /// Resolve final damage from a warhead impact on a target.
    /// Called by projectile_system() after hit detection.
    fn resolve_damage(
        &self,
        warhead: &WarheadDef,
        target: &DamageTarget,
        modifiers: &StatModifiers,
        distance_from_impact: SimCoord,
    ) -> DamageResult;
}

pub struct DamageTarget {
    pub entity: EntityId,
    pub armor_type: ArmorType,
    pub current_health: i32,
    pub shield: Option<ShieldState>,  // D029 shield system
    pub conditions: Conditions,
}

pub struct DamageResult {
    pub health_damage: i32,
    pub shield_damage: i32,
    pub conditions_applied: Vec<(ConditionId, u32)>,  // condition grants from warhead
    pub overkill: i32,  // excess damage (for death effects)
}
```

**Key design points:**
- The default `StandardDamageResolver` implements the RA1 pipeline from D028: Versus table lookup → distance falloff → multiplier stack → health reduction. This handles 95% of C&C damage scenarios.
- RA2 registers `ShieldFirstDamageResolver`: absorb shield → then armor → then health. Same trait, different algorithm.
- Generals-class modules could register `SubObjectDamageResolver`: distributes damage across multiple hit zones per unit.
- The trait boundary is *after hit detection* and *before health reduction*. Projectile flight, homing, and area-of-effect detection are shared infrastructure. Only the final damage-number calculation varies.
- Warhead-applied conditions (e.g., "irradiated" from D028's composable warhead design) flow through `DamageResult.conditions_applied` — the resolver decides which conditions apply based on its game's rules.
- WASM Tier 3 mods can provide custom resolvers for total conversions.

**What we build now:** Only `StandardDamageResolver`. The trait exists from Phase 2 (ships with D028). Shield-aware resolver ships when the D029 shield system lands.

**Phase:** Phase 2 (ships with D028 damage pipeline).

#### 4. `RankingProvider` — Pluggable Rating and Matchmaking

**Problem:** The competitive infrastructure (AGENTS.md) specifies Glicko-2 ratings, but the ranking algorithm is implemented directly in the relay/tracking server with no abstraction boundary. Tournament organizers and community servers may want Elo (simpler, well-understood), TrueSkill (better for team games), or custom rating systems (handicap-adjusted, seasonal decay variants, faction-specific ratings). Since tracking servers are community-hostable and federated (D030/D037), locking the rating algorithm to Glicko-2 limits what community operators can offer.

**Solution:**

```rust
/// Tracking servers implement this to provide rating calculations.
/// The default implementation uses Glicko-2.
pub trait RankingProvider: Send + Sync {
    /// Calculate updated ratings after a match result.
    fn update_ratings(
        &mut self,
        result: &CertifiedMatchResult,
        current_ratings: &[PlayerRating],
    ) -> Vec<PlayerRating>;

    /// Estimate match quality / fairness for proposed matchmaking.
    fn match_quality(&self, team_a: &[PlayerRating], team_b: &[PlayerRating]) -> MatchQuality;

    /// Rating display for UI (e.g., "1500 ± 200" for Glicko, "Silver II" for league).
    fn display_rating(&self, rating: &PlayerRating) -> String;

    /// Algorithm identifier for interop (ratings from different algorithms aren't comparable).
    fn algorithm_id(&self) -> &str;
}

pub struct PlayerRating {
    pub player_id: PlayerId,
    pub rating: i64,        // fixed-point, algorithm-specific
    pub deviation: i64,     // uncertainty (Glicko RD, TrueSkill σ)
    pub volatility: i64,    // Glicko-2 specific; other algorithms may ignore
    pub games_played: u32,
}

pub struct MatchQuality {
    pub fairness: i32,      // 0-1000 (fixed-point), higher = more balanced
    pub estimated_draw_probability: i32,  // 0-1000 (fixed-point)
}
```

**Key design points:**
- Default: `Glicko2Provider` — well-suited for 1v1 and small teams, proven in chess and competitive gaming. Validated by Valve's CS Regional Standings (see `research/valve-github-analysis.md` § Part 4), which uses Glicko with RD fixed at 75 for team competitive play.
- Community operators provide alternatives: `EloProvider` (simpler), `TrueSkillProvider` (better team rating), or custom implementations.
- `algorithm_id()` prevents mixing ratings from different algorithms — a Glicko-2 "1800" is not an Elo "1800".
- `CertifiedMatchResult` (from relay server, D007) is the input — no self-reported results.
- Ratings stored in SQLite (D034) on the tracking server.
- The official tracking server uses Glicko-2. Community tracking servers choose their own.
- Fixed-point ratings (matching sim math conventions) — no floating-point in the ranking pipeline.

**Information content weighting (from Valve CS Regional Standings):** The `match_quality()` method returns a `MatchQuality` struct that includes an `information_content` field (0–1000, fixed-point). This parameter scales how much a match affects rating changes — low-information matches (casual, heavily mismatched, very short duration) contribute less to rating updates, while high-information matches (ranked, well-matched, full-length) contribute more. This prevents rating inflation/deflation from low-quality matches. For IC, information content is derived from: (1) game mode (ranked vs. casual), (2) player count balance (1v1 is higher information than 3v1), (3) game duration (very short games may indicate disconnection, not skill), (4) map symmetry rating (if available). See `research/valve-github-analysis.md` § 4.2.

```rust
pub struct MatchQuality {
    pub fairness: i32,                // 0-1000 (fixed-point), higher = more balanced
    pub estimated_draw_probability: i32,  // 0-1000 (fixed-point)
    pub information_content: i32,     // 0-1000 (fixed-point), scales rating impact
}
```

**New player seeding (from Valve CS Regional Standings):** New players entering ranked play are seeded using a weighted combination of calibration performance and opponent quality — not placed at a flat default rating:

```rust
/// Seeding formula for new players completing calibration.
/// Inspired by Valve's CS seeding (bounty, opponent network, LAN factor).
/// IC adapts: no prize money, but the weighted-combination approach is sound.
pub struct SeedingResult {
    pub initial_rating: i64,       // Fixed-point, mapped into rating range
    pub initial_deviation: i64,    // Higher than settled players (fast convergence)
}

/// Inputs to the seeding formula:
/// - calibration_performance: win rate across calibration matches (0-1000)
/// - opponent_quality: average rating of calibration opponents (fixed-point)
/// - match_count: number of calibration matches played
/// The seed is mapped into the rating range (e.g., 800–1800 for Glicko-2).
```

This prevents the cold-start problem where a skilled player placed at 1500 stomps their way through dozens of mismatched games before reaching their true rating. Valve's system proved that even ~5–10 calibration matches with quality weighting produce a dramatically better initial placement.

**Ranking visibility thresholds (from Valve CS Regional Standings):**
- **Minimum 5 matches** to appear on leaderboards — prevents noise from one-game players.
- **Must have defeated at least 1 distinct opponent** — prevents collusion (two friends repeatedly playing each other to inflate ratings).
- **RD decay for inactivity:** `sqrt(rd² + C²*t)` where C=34.6, t=rating periods since last match. Inactive players' ratings become less certain, naturally widening their matchmaking range until they play again.

**Ranking model validation (from Valve CS Regional Standings):** The `Glicko2Provider` implementation logs **expected win probabilities alongside match results** from day one. This enables post-hoc model validation using the methodology Valve describes: (1) bin expected win rates into 5% buckets, (2) compare expected vs. observed win rates within each bucket, (3) compute Spearman's rank correlation (ρ). Valve achieved ρ = 0.98 — excellent. IC targets ρ ≥ 0.95 as a health threshold; below that triggers investigation of the rating model parameters. This data feeds into the OTEL telemetry pipeline (D031) and is visible on the Grafana dashboard for community server operators. See `research/valve-github-analysis.md` § 4.5.

**What we build now:** Only `Glicko2Provider`. The trait exists from Phase 5 (when competitive infrastructure ships). Alternative providers are community work.

**Phase:** Phase 5 (Multiplayer & Competitive).

#### 5. `OrderValidator` — Explicit Per-Module Order Validation

**Problem:** D012 mandates that every order is validated inside the sim before execution, deterministically. Currently, validation is implicit — it happens inside `apply_orders()`, which is part of the game module's system pipeline. This works because `GameModule::system_pipeline()` lets each module define its own `apply_orders()` implementation. But the validation contract is informal: nothing in the architecture *requires* a game module to validate orders, or specifies what validation means. A game module that forgets validation breaks the anti-cheat guarantee (D012) silently.

**Solution:** Add `order_validator()` to the `GameModule` trait, making validation an explicit, required contract:

```rust
/// Added to GameModule trait (D018):
pub trait GameModule: Send + Sync + 'static {
    // ... existing methods ...

    /// Provide the module's order validation logic.
    /// Called by the engine before apply_orders() — not by the module's own systems.
    /// The engine enforces that ALL orders pass validation before execution.
    fn order_validator(&self) -> Box<dyn OrderValidator>;
}

/// Game modules implement this to define legal orders.
/// The engine calls this for EVERY order, EVERY tick — the game module
/// cannot accidentally skip validation.
pub trait OrderValidator: Send + Sync {
    /// Validate an order against current game state.
    /// Returns Valid or Rejected with a reason for logging/anti-cheat.
    fn validate(
        &self,
        player: PlayerId,
        order: &PlayerOrder,
        state: &SimReadView,
    ) -> OrderValidity;
}

pub enum OrderValidity {
    Valid,
    Rejected(RejectionReason),
}

pub enum RejectionReason {
    NotOwner,
    InsufficientFunds,
    MissingPrerequisite,
    InvalidPlacement,
    CooldownActive,
    InvalidTarget,
    RateLimited,       // OrderBudget exceeded (D006 security)
    Custom(String),    // game-module-specific reasons
}
```

**Key design points:**
- The engine (not the game module) calls `validate()` before `apply_orders()`. This means a game module *cannot* skip validation — the architecture enforces D012's anti-cheat guarantee.
- `SimReadView` is a read-only view of sim state — the validator cannot mutate game state.
- `RejectionReason` includes standard reasons (shared across all game modules) plus `Custom` for game-specific rules.
- Repeated rejections from the same player are logged for anti-cheat pattern detection (existing D012 design, now formalized).
- The default RA1 implementation validates ownership, affordability, prerequisites, placement rules, and rate limits. RA2 would add superweapon authorization, garrison capacity checks, etc.
- This is the lowest-risk trait in the set — it formalizes what `apply_orders()` already does informally. The cost is moving validation from "inside the first system" to "explicit engine-level contract."

**What we build now:** RA1 `StandardOrderValidator`. The trait exists from Phase 2.

**Phase:** Phase 2 (ships with `apply_orders()`).

### Cost/Benefit Analysis

| Trait             | Cost Now                                  | Prevents Later                                                                                             |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AiStrategy`      | One trait + `PersonalityDrivenAi` wrapper | Community AI cannot plug in without forking ic-ai                                                          |
| `FogProvider`     | One trait + `RadiusFogProvider`           | RA2 elevation fog requires rewriting fog_system(); fog-authoritative server requires separate fog codebase |
| `DamageResolver`  | One trait + `StandardDamageResolver`      | Shield/sub-object games require rewriting projectile_system()                                              |
| `RankingProvider` | One trait + `Glicko2Provider`             | Community tracking servers stuck with one rating algorithm                                                 |
| `OrderValidator`  | One trait + explicit validate() call      | Game modules can silently skip validation; anti-cheat guarantee is informal                                |

All five follow the established pattern: **one trait definition + one default implementation with near-zero architectural cost**. Dispatch strategy is subsystem-dependent (profiling decides, not dogma). The architectural cost is 5 trait definitions (~50 lines total) and 5 wrapper implementations (~200 lines total). The benefit is that none of these subsystems becomes a rewrite-required bottleneck when game modules, mods, or community servers need different behavior.

### What Does NOT Need a Trait

These subsystems are already sufficiently modular through data-driven design (YAML/Lua/WASM):

| Subsystem              | Why No Trait Needed                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Weather (D022)         | State machine defined in YAML, transitions driven by Lua. Algorithm is trivial; data is everything.         |
| Campaign (D021)        | Graph structure in YAML, logic in Lua. The campaign engine runs any graph; no algorithmic variation needed. |
| Achievements (D036)    | Definitions in YAML, triggers in Lua. Storage in SQLite. No algorithm to swap.                              |
| UI Themes (D032)       | Pure YAML + sprite sheets. No computation to abstract.                                                      |
| QoL Toggles (D033)     | YAML config flags. Each toggle is a sim-affecting or client-only boolean.                                   |
| Audio (P003)           | Bevy abstracts the audio backend. `ic-audio` is a Bevy plugin, not an algorithm.                            |
| Balance Presets (D019) | YAML rule sets. Switching preset = loading different YAML.                                                  |

The distinction: **traits abstract algorithms; YAML/Lua abstracts data and behavior parameters.** A damage *formula* is an algorithm (trait). A damage *value* is data (YAML). An AI *decision process* is an algorithm (trait). An AI *aggression level* is a parameter (YAML).

**Alternatives considered:**
- Trait-abstract everything (rejected — unnecessary overhead for data-driven systems; violates D015's "no speculative abstractions" principle from D018)
- Trait-abstract nothing new (rejected — the 5 identified systems carry real risk of regret; the `NetworkModel` pattern has proven its value; the cost is near-zero)
- Abstract only AI and fog (rejected — damage resolution and ranking carry comparable risk, and `OrderValidator` formalizes an existing implicit contract)

**Relationship to existing decisions:**
- Extends D006's philosophy ("pluggable via trait") to 5 new subsystems
- Extends D013's pattern ("trait-abstracted, default impl first") identically
- Extends D018's `GameModule` trait with `order_validator()`
- Supports D028 (damage pipeline) by abstracting the resolution step
- Supports D029 (shield system) by allowing shield-first damage resolution
- Supports future fog-authoritative server (D006 future architecture)
- Extended by D054 (Transport trait, SignatureScheme enum, SnapshotCodec version dispatch) — one additional trait and two version-dispatched mechanisms identified by architecture switchability audit

**Phase:** Trait definitions exist from the phase each subsystem ships (Phase 2–5). Alternative implementations are future work.

---

---

