## D042: Player Behavioral Profiles & Training System — The Black Box

**Status:** Accepted
**Scope:** `ic-ai`, `ic-ui`, `ic-llm` (optional), `ic-sim` (read-only), D034 SQLite extension
**Phase:** Core profiles + quick training: Phase 4–5. LLM coaching loop: Phase 7.

### The Problem

Every gameplay session generates rich structured data (D031 `GameplayEvent` stream, D034 SQLite storage). Today this data feeds:
- Post-game stats and career analytics (`ic-ui`)
- Adaptive AI difficulty and counter-strategy (`ic-ai`, between-game queries)
- LLM personalization: coaching suggestions, post-match commentary, rivalry narratives (`ic-llm`, optional)
- Replay-to-scenario pipeline: extract one replay's behavior into AI modules (`ic-editor` + `ic-ai`, D038)

But three capabilities are missing:

1. **Aggregated player style profiles.** The replay-to-scenario pipeline extracts behavior from *one* replay. The adaptive AI mentions "per-player gameplay patterns" but only for difficulty tuning, not for creating a reusable AI opponent. There's no cross-game model that captures *how a specific player tends to play* — their preferred build orders, timing windows, unit composition habits, engagement style, faction tendencies — aggregated from all recorded games.

2. **Quick training mode.** Training against a human's style currently requires the full scenario editor pipeline (import replay → configure extraction → save → play). There's no "pick an opponent from your match history and play against their style on any map right now" flow.

3. **Iterative training loop with progress tracking.** Coaching suggestions exist as one-off readouts. There's no structured system for: play → get coached → play again with targeted AI → measure improvement → repeat. No weakness tracking over time.

### The Black Box Concept

Every match produces a *flight recorder* — a structured event log informative enough that an AI system (rule-based or LLM) can reconstruct:
- **What happened** — build timelines, army compositions, engagement sequences, resource curves
- **How the player plays** — timing patterns, aggression level, unit preferences, micro tendencies, strategic habits
- **Where the player struggles** — loss patterns, weaknesses by faction/map/timing, unit types with poor survival rates

The gameplay event stream (D031) already captures this data. D042 adds the systems that *interpret* it: profile building, profile-driven AI, and a training workflow that uses both.

### Player Style Profiles

A `PlayerStyleProfile` aggregates gameplay patterns across multiple games into a reusable behavioral model:

```rust
/// Aggregated behavioral model built from gameplay event history.
/// Drives StyleDrivenAi and training recommendations.
pub struct PlayerStyleProfile {
    pub player_id: HashedPlayerId,
    pub games_analyzed: u32,
    pub last_updated: Timestamp,

    // Strategic tendencies (averages across games)
    pub preferred_factions: Vec<(String, f32)>,         // faction → usage rate
    pub avg_expansion_timing: FixedPoint,               // ticks until first expansion
    pub avg_first_attack_timing: FixedPoint,            // ticks until first offensive
    pub build_order_templates: Vec<BuildOrderTemplate>, // most common opening sequences
    pub unit_composition_profile: UnitCompositionProfile, // preferred unit mix by game phase
    pub aggression_index: FixedPoint,                   // 0.0 = turtle, 1.0 = all-in rusher
    pub tech_priority: TechPriority,                    // rush / balanced / fast-tech
    pub resource_efficiency: FixedPoint,                // avg resource utilization rate
    pub micro_intensity: FixedPoint,                    // orders-per-unit-per-minute

    // Engagement patterns
    pub preferred_attack_directions: Vec<MapQuadrant>,  // where they tend to attack from
    pub retreat_threshold: FixedPoint,                  // health % at which units disengage
    pub multi_prong_frequency: FixedPoint,              // how often they split forces

    // Weakness indicators (for training)
    pub loss_patterns: Vec<LossPattern>,                // recurring causes of defeat
    pub weak_matchups: Vec<(String, FixedPoint)>,       // faction/strategy → loss rate
    pub underused_counters: Vec<String>,                // unit types available but rarely built
}
```

**How profiles are built:**
- `ic-ai` runs aggregation queries against the SQLite `gameplay_events` and `match_players` tables at profile-build time (not during matches)
- Profile building is triggered after each completed match and cached in a new `player_profiles` SQLite table
- For the local player: full data from all local games
- For opponents: data reconstructed from matches where you were a participant — you can only model players you've actually played against, using the events visible in those shared sessions

**Privacy:** Opponent profiles are built entirely from your local replay data. No data is fetched from other players' machines. You see their behavior *from your games with them*, not from their solo play. No profile data is exported or shared unless the player explicitly opts in.

#### SQLite Extension (D034)

```sql
-- Player style profiles (D042 — cached aggregated behavior models)
CREATE TABLE player_profiles (
    id              INTEGER PRIMARY KEY,
    player_id_hash  TEXT NOT NULL UNIQUE,  -- hashed player identifier
    display_name    TEXT,                  -- last known display name
    games_analyzed  INTEGER NOT NULL,
    last_updated    TEXT NOT NULL,
    profile_json    TEXT NOT NULL,         -- serialized PlayerStyleProfile
    is_local        INTEGER NOT NULL DEFAULT 0  -- 1 for the local player's own profile
);

-- Training session tracking (D042 — iterative improvement measurement)
CREATE TABLE training_sessions (
    id              INTEGER PRIMARY KEY,
    started_at      TEXT NOT NULL,
    target_weakness TEXT NOT NULL,         -- what weakness this session targets
    opponent_profile TEXT,                 -- player_id_hash of the style being trained against
    map_name        TEXT NOT NULL,
    result          TEXT,                  -- 'victory', 'defeat', null if incomplete
    duration_ticks  INTEGER,
    weakness_score_before REAL,            -- measured weakness metric before session
    weakness_score_after  REAL,            -- measured weakness metric after session
    notes_json      TEXT                   -- LLM-generated or rule-based coaching notes
);
```

### Style-Driven AI

A new `AiStrategy` implementation (extends D041) that reads a `PlayerStyleProfile` and approximates that player's behavior:

```rust
/// AI strategy that mimics a specific player's style from their profile.
pub struct StyleDrivenAi {
    profile: PlayerStyleProfile,
    variance: FixedPoint,  // 0.0 = exact reproduction, 1.0 = loose approximation
    difficulty_scale: FixedPoint,  // adjusts execution speed/accuracy
}

impl AiStrategy for StyleDrivenAi {
    fn name(&self) -> &str { "style_driven" }

    fn decide(&self, world: &World, player: PlayerId, budget: &mut TickBudget) -> Vec<PlayerOrder> {
        // 1. Check game phase (opening / mid / late) from tick count + base count
        // 2. Select build order template from profile.build_order_templates
        //    (with variance: slight timing jitter, occasional substitution)
        // 3. Match unit composition targets from profile.unit_composition_profile
        // 4. Engagement decisions use profile.aggression_index and retreat_threshold
        // 5. Attack timing follows profile.avg_first_attack_timing (± variance)
        // 6. Multi-prong attacks at profile.multi_prong_frequency rate
        todo!()
    }

    fn difficulty(&self) -> AiDifficulty { AiDifficulty::Custom }
    fn tick_budget_hint(&self) -> Duration { Duration::from_micros(200) }
}
```

**Relationship to existing `ReplayBehaviorExtractor` (D038):** The extractor converts one replay into scripted AI waypoints/triggers (deterministic, frame-level). `StyleDrivenAi` is different — it reads an aggregated *profile* and makes real-time decisions based on tendencies, not a fixed script. The extractor says "at tick 300, build a Barracks at (120, 45)." `StyleDrivenAi` says "this player tends to build a Barracks within the first 250–350 ticks, usually near their War Factory" — then adapts to the actual game state. Both are useful:

| System                           | Input                           | Output                                          | Fidelity                                    | Replayability                                                         |
| -------------------------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `ReplayBehaviorExtractor` (D038) | One replay file                 | Scripted AI modules (waypoints, timed triggers) | High — frame-level reproduction of one game | Low — same script every time (mitigated by Probability of Presence)   |
| `StyleDrivenAi` (D042)           | Aggregated `PlayerStyleProfile` | Real-time AI decisions based on tendencies      | Medium — captures style, not exact moves    | High — different every game because it reacts to the actual situation |

### Quick Training Mode

A streamlined UI flow that bypasses the scenario editor entirely:

**"Train Against" flow:**
1. Open match history or player profile screen
2. Click "Train Against \[Player Name\]" on any opponent you've encountered
3. Pick a map (or let the system choose one matching your weak matchups)
4. The engine generates a temporary scenario: your starting position + `StyleDrivenAi` loaded with that opponent's profile
5. Play immediately — no editor, no saving, no publishing

**"Challenge My Weakness" flow:**
1. Open training menu (accessible from main menu)
2. System shows your weakness summary: "You lose 68% of games against Allied air rushes" / "Your expansion timing is slow (6:30 vs. 4:15 average)"
3. Click a weakness → system auto-generates a training scenario:
   - Selects a map that exposes the weakness (e.g., map with air-favorable terrain)
   - Configures AI to exploit that specific weakness (aggressive air build)
   - Sets appropriate difficulty (slightly above your current level)
4. Play → post-match summary highlights whether the weakness improved

**Implementation:**
- `ic-ui` provides the training screens (match history integration, weakness display, map picker)
- `ic-ai` provides `StyleDrivenAi` + weakness analysis queries + temporary scenario generation
- No `ic-editor` dependency — training scenarios are generated programmatically and never saved to disk (unless the player explicitly exports them)
- The temporary scenario uses the same sim infrastructure as any skirmish — `LocalNetwork` (D006), standard map loading, standard game loop

### Iterative Training Loop

Training isn't one session — it's a cycle with tracked progress:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Analyze        │────▶│  Train           │────▶│  Review         │
│  (identify      │     │  (play targeted  │     │  (measure       │
│  weaknesses)    │     │  session)        │     │  improvement)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        ▲                                                │
        └────────────────────────────────────────────────┘
                         next cycle
```

**Without LLM (always available):**
- Weakness identification: rule-based analysis of `gameplay_events` aggregates — loss rate by faction/map/timing window, unit survival rates, resource efficiency compared to wins
- Training scenario generation: map + AI configuration targeting the weakness
- Progress tracking: `training_sessions` table records before/after weakness scores per area
- Post-session summary: structured stats comparison ("Your anti-air unit production increased from 2.1 to 4.3 per game. Survival rate against air improved 12%.")

**With LLM (optional, BYOLLM — D016):**
- Natural language training plans: "Week 1: Focus on expansion timing. Session 1: Practice fast expansion against passive AI. Session 2: Defend early rush while expanding. Session 3: Full game with aggressive opponent."
- Post-session coaching: "You expanded at 4:45 this time — 90 seconds faster than your average. But you over-invested in base defense, delaying your tank push by 2 minutes. Next session, try lighter defenses."
- Contextual tips during weakness review: "PlayerX always opens with two Barracks into Ranger rush. Build a Pillbox at your choke point before your second Refinery."
- LLM reads `training_sessions` history to track multi-session arcs: "Over 5 sessions, your anti-air response time improved from 45s to 18s. Let's move on to defending naval harassment."

### What This Is NOT

- **Not machine learning during gameplay.** All profile building and analysis happens between sessions, reading SQLite. The sim remains deterministic (invariant #1).
- **Not a replay bot.** `StyleDrivenAi` makes real-time strategic decisions informed by tendencies, not a frame-by-frame replay script. It adapts to the actual game state.
- **Not surveillance.** Opponent profiles are built from your local data only. You cannot fetch another player's solo games, ranked history, or private matches. You model what you've seen firsthand.
- **Not required.** The training system is entirely optional. Players can ignore it and play skirmish/multiplayer normally. No game mode requires a profile to exist.

### Crate Boundaries

| Component                                                 | Crate             | Reason                                                   |
| --------------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| `PlayerStyleProfile` struct                               | `ic-ai`           | Behavioral model — part of AI system                     |
| `StyleDrivenAi` (AiStrategy impl)                         | `ic-ai`           | AI decision-making logic                                 |
| Profile aggregation queries                               | `ic-ai`           | Reads SQLite `gameplay_events` + `match_players`         |
| Training UI (match history, weakness display, map picker) | `ic-ui`           | Player-facing screens                                    |
| Temporary scenario generation                             | `ic-ai`           | Programmatic scenario setup without `ic-editor`          |
| Training session recording                                | `ic-ui` + `ic-ai` | Writes `training_sessions` to SQLite after each session  |
| LLM coaching + training plans                             | `ic-llm`          | Optional — reads `training_sessions` + `player_profiles` |
| SQLite schema (`player_profiles`, `training_sessions`)    | `ic-game`         | Schema migration on startup, like all D034 tables        |

`ic-editor` is NOT involved in quick training mode. The scenario editor's replay-to-scenario pipeline (D038) remains separate — it's for creating publishable community content, not ephemeral training matches.

### Consumers of Player Data (D034 Extension)

Two new rows for the D034 consumer table:

| Consumer                  | Crate             | What it reads                                             | What it produces                                                                    | Required?                    |
| ------------------------- | ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| **Player style profiles** | `ic-ai`           | `gameplay_events`, `match_players`, `matches`             | `player_profiles` table — aggregated behavioral models for local player + opponents | Always on (profile building) |
| **Training system**       | `ic-ai` + `ic-ui` | `player_profiles`, `training_sessions`, `gameplay_events` | Quick training scenarios, weakness analysis, progress tracking                      | Always on (training UI)      |

### Relationship to Existing Decisions

- **D031 (telemetry):** Gameplay events are the raw data. D042 adds interpretation — the `GameplayEvent` stream is the black box recorder; the profile builder is the flight data analyst.
- **D034 (SQLite):** Two new tables (`player_profiles`, `training_sessions`). Same patterns: schema migration, read-only consumers, local-first.
- **D038 (replay-to-scenario):** Complementary, not overlapping. D038 extracts one replay into a publishable scenario. D042 aggregates many games into a live AI personality. D038 produces scripts; D042 produces strategies.
- **D041 (trait abstraction):** `StyleDrivenAi` implements the `AiStrategy` trait. Same plug-in pattern — the engine doesn't know it's running a profile-driven AI vs. a scripted one.
- **D016 (BYOLLM):** LLM coaching is optional. Without it, the rule-based weakness identification and structured summary system works standalone.
- **D010 (snapshots):** Training sessions use standard sim snapshots for save/restore. No special infrastructure needed.

### Alternatives Considered

| Alternative                                              | Why Not                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ML model trained on replays (neural-net opponent)        | Too complex, non-deterministic, opaque behavior, requires GPU inference during gameplay. Profile-driven rule selection is transparent and runs in microseconds.                                                |
| Server-side profile building                             | Conflicts with local-first principle. Opponent profiles come from your replays, not a central database. Server could aggregate opt-in community profiles in the future, but the base system is entirely local. |
| Manual profile creation ("custom AI personality editor") | Useful but separate. D042 is about automated profile extraction. A manual personality editor is a planned optional extension deferred to `M10-M11` (`P-Creator`/`P-Optional`) after D042 extraction + D038/D053 profile tooling foundations; it reads/writes the same `PlayerStyleProfile` and is not part of D042 Phase 4–5 exit criteria. |
| Integrate training into scenario editor only             | Too much friction for casual training. The editor is for content creation; training is a play mode. Different UX goals.                                                                                        |

**Phase:** Profile building infrastructure ships in **Phase 4** (available for single-player training against AI tendencies). Opponent profile building and "Train Against" flow ship in **Phase 5** (requires multiplayer match data). LLM coaching loop ships in **Phase 7** (optional BYOLLM). The `training_sessions` table and progress tracking ship alongside the training UI in Phase 4–5.

---

---
