# ML Training Pipeline — Replay-to-Dataset Conversion for AI Model Training

> **Status:** Research / design study
> **Scope:** `ic-sim` (read-only), `ic-ai`, `ic-llm`, `ic-game` (tooling)
> **Phase:** Phase 7 (M11) — AI training infrastructure builds on stabilized gameplay, replay, and telemetry foundations
> **Depends on:** D010 (Snapshottable State), D031 (Telemetry), D034 (SQLite), D041 (AiStrategy), D044 (LLM-Enhanced AI), D057 (Skill Library), D056 (Foreign Replay Import)

## Problem

IC's replay files (`.icrep`) contain everything needed to reconstruct every moment of an RTS match — orders, state snapshots, analysis events, and outcome data. The telemetry system (D031) records rich per-match gameplay metrics. The skill library (D057) accumulates verified strategic patterns. But **no specification exists for converting these raw data sources into structured training datasets** suitable for training AI models — whether text-based LLMs (D044), custom neural networks (behavior cloning, imitation learning), or reinforcement learning systems.

The gap is not infrastructure — the infrastructure exists (replays, snapshots, SQLite, headless sim). The gap is the **pipeline specification**: how to align state observations with actions and outcomes, how to format training pairs, how to collect corpora at scale, and how to index datasets for efficient retrieval.

## Solution Overview

A three-layer pipeline converts IC's existing data into training-ready datasets:

```
Layer 1: Data Sources
  .icrep replay files (orders + snapshots + analysis events)
  telemetry.db (match metadata, gameplay events, pace snapshots)
  player_profiles (D042 behavioral aggregates)
  skill library (D057 verified patterns)
  foreign replays (D056 .orarep + Remastered imports)
      │
Layer 2: Extraction & Alignment
  Replay deserializer → per-tick (state, orders) alignment
  Keyframe interpolation → state at arbitrary ticks
  Fog-of-war filtering → per-player observation space
  Outcome labeling → win/loss/score attached to trajectories
      │
Layer 3: Output Formats
  Training pairs (state, events, orders, outcome)
  Parquet columnar format (for ML frameworks)
  SQLite training index (metadata queries)
  Skill library enrichment (verified patterns → few-shot examples)
```

## Training Pair Schema

The fundamental unit of training data is a **training pair** — a snapshot of what a player could see, what had recently happened, and what they decided to do next, labeled with the eventual match outcome.

### Core Schema

```rust
/// A single training sample extracted from a replay at a specific tick.
/// Represents one decision point: observation → action, labeled by outcome.
pub struct TrainingPair {
    // --- Identity ---
    pub replay_id: String,           // source replay hash
    pub tick: u64,                   // sim tick this sample was extracted at
    pub player_id: u8,              // which player's perspective (0-indexed)

    // --- Observation (what the player could see) ---
    pub game_state: FogFilteredState, // fog-filtered game state at this tick
    pub event_history: Vec<GameplayEvent>, // recent events (configurable window, default ~300 ticks)

    // --- Action (what the player did) ---
    pub orders: Vec<PlayerOrder>,    // orders issued at this tick (may be empty)

    // --- Label (how it turned out) ---
    pub outcome: MatchOutcome,

    // --- Context ---
    pub metadata: SampleMetadata,
}

pub struct FogFilteredState {
    pub own_credits: i32,
    pub own_power_balance: i32,
    pub own_units: Vec<UnitSnapshot>,     // type, position, health, stance, cargo
    pub own_buildings: Vec<BuildingSnapshot>, // type, position, health, production queue
    pub visible_enemy_units: Vec<UnitSnapshot>,
    pub visible_enemy_buildings: Vec<BuildingSnapshot>,
    pub visible_terrain: Vec<TerrainCell>, // resource cells, modifications
    pub tech_available: Vec<String>,       // unlocked unit/building types
    pub harvesters_active: u8,
    pub army_value: i32,                   // fixed-point, scale 1024
    pub map_control_estimate: i32,         // fixed-point 0-1024
}

pub struct UnitSnapshot {
    pub unit_type: String,
    pub position: [i32; 3],        // WorldPos as [x, y, z], fixed-point scale 1024
    pub health: u16,               // current HP
    pub max_health: u16,
    pub stance: u8,
    pub is_moving: bool,
    pub cargo_count: u8,           // for transports/harvesters
}

pub struct BuildingSnapshot {
    pub building_type: String,
    pub position: [i32; 3],
    pub health: u16,
    pub max_health: u16,
    pub production_queue: Vec<String>, // unit types being produced
    pub production_progress: u16,      // 0-1024 fixed-point
    pub rally_point: Option<[i32; 3]>,
}

pub struct MatchOutcome {
    pub result: MatchResult,         // Win, Loss, Draw, Disconnect
    pub final_tick: u64,             // when the match ended
    pub ticks_remaining: u64,        // final_tick - current tick (temporal distance to outcome)
    pub army_value_ratio_at_end: i32, // fixed-point, player/opponent
}

pub enum MatchResult { Win, Loss, Draw, Disconnect }

pub struct SampleMetadata {
    pub game_module: String,         // "ra1", "td"
    pub balance_preset: String,      // "ra1-default", "openra-compat", etc.
    pub engine_version: String,
    pub map_name: String,
    pub map_hash: String,
    pub player_faction: String,
    pub opponent_faction: String,
    pub game_speed: String,          // "Normal", "Faster", etc.
    pub data_source: DataSource,
    pub player_apm: u16,             // average APM for the match
}

pub enum DataSource {
    SelfPlay,           // headless AI-vs-AI generation
    HumanMultiplayer,   // relay-recorded ranked/unranked match
    HumanVsAi,          // skirmish against AI
    ForeignImport,      // converted from OpenRA/Remastered replay
    CommunityDonation,  // voluntarily shared replay
}
```

### Serialization Format: Parquet

Training pairs serialize to **Apache Parquet** for consumption by ML frameworks (PyTorch, TensorFlow, JAX). Parquet is columnar, compressed, and natively supported by every ML ecosystem.

```
training_corpus/
├── manifest.json              # corpus metadata, version, balance preset
├── ra1_self_play_001.parquet  # ~10,000 samples per file
├── ra1_self_play_002.parquet
├── ra1_human_ranked_001.parquet
└── index.db                   # SQLite metadata index (see below)
```

**Parquet schema (flattened for ML consumption):**

| Column                     | Type   | Description                                         |
| -------------------------- | ------ | --------------------------------------------------- |
| `replay_id`                | string | Source replay hash                                  |
| `tick`                     | int64  | Sim tick                                            |
| `player_id`                | int8   | Player index                                        |
| `own_credits`              | int32  | Current credits                                     |
| `own_power_balance`        | int32  | Power surplus/deficit                               |
| `own_unit_count`           | int16  | Total own units                                     |
| `own_army_value`           | int32  | Fixed-point army value                              |
| `own_harvesters`           | int8   | Active harvesters                                   |
| `own_tech_tier`            | int8   | Highest tech level                                  |
| `visible_enemy_unit_count` | int16  | Visible enemy units                                 |
| `visible_enemy_army_value` | int32  | Estimated enemy army value                          |
| `map_control`              | int16  | Map control estimate (0-1024)                       |
| `own_units_json`           | string | JSON array of UnitSnapshot                          |
| `own_buildings_json`       | string | JSON array of BuildingSnapshot                      |
| `visible_enemies_json`     | string | JSON array of UnitSnapshot                          |
| `event_history_json`       | string | JSON array of recent GameplayEvent                  |
| `orders_json`              | string | JSON array of PlayerOrder                           |
| `order_count`              | int8   | Number of orders this tick                          |
| `primary_order_type`       | string | Most significant order type (Move/Attack/Build/...) |
| `outcome`                  | string | Win/Loss/Draw                                       |
| `ticks_remaining`          | int64  | Ticks until match end                               |
| `game_module`              | string | "ra1" / "td"                                        |
| `balance_preset`           | string | Balance ruleset                                     |
| `player_faction`           | string | Faction name                                        |
| `opponent_faction`         | string | Opponent faction                                    |
| `player_apm`               | int16  | Average APM                                         |
| `data_source`              | string | SelfPlay/HumanMultiplayer/...                       |
| `engine_version`           | string | Engine version that produced this data              |

The JSON columns (`*_json`) contain the full structured data for models that need spatial detail. The scalar columns enable fast filtering and aggregation without parsing JSON.

## SQLite Training Data Index

A dedicated `training_index.db` catalogs all available training data for efficient corpus management:

```sql
CREATE TABLE replays (
    replay_hash     TEXT PRIMARY KEY,
    file_path       TEXT NOT NULL,          -- path to .icrep file
    data_source     TEXT NOT NULL,          -- 'self_play' | 'human_mp' | 'human_ai' | 'foreign' | 'community'
    game_module     TEXT NOT NULL,          -- 'ra1', 'td'
    balance_preset  TEXT NOT NULL,
    engine_version  TEXT NOT NULL,
    map_name        TEXT NOT NULL,
    map_hash        TEXT NOT NULL,
    duration_ticks  INTEGER NOT NULL,
    player_count    INTEGER NOT NULL,
    has_analysis     INTEGER DEFAULT 0,     -- 1 if HAS_EVENTS flag set
    quality_tier    TEXT DEFAULT 'unrated', -- 'expert' | 'intermediate' | 'casual' | 'unrated' | 'bot'
    imported_at     TEXT NOT NULL,          -- ISO 8601
    exported        INTEGER DEFAULT 0       -- 1 if exported to Parquet
);

CREATE TABLE replay_players (
    replay_hash     TEXT REFERENCES replays(replay_hash),
    player_index    INTEGER NOT NULL,
    faction         TEXT NOT NULL,
    outcome         TEXT NOT NULL,          -- 'win' | 'loss' | 'draw' | 'disconnect'
    avg_apm         INTEGER,
    mmr_estimate    INTEGER,                -- if available from ranked match
    PRIMARY KEY (replay_hash, player_index)
);

CREATE TABLE export_batches (
    batch_id        TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    sample_count    INTEGER NOT NULL,
    parquet_files   TEXT NOT NULL,          -- JSON array of file paths
    tick_stride     INTEGER NOT NULL,       -- sampling interval
    balance_preset  TEXT NOT NULL,
    filters_applied TEXT NOT NULL            -- JSON description of query filters
);

-- Indexes for common training queries
CREATE INDEX idx_replays_source ON replays(data_source, game_module);
CREATE INDEX idx_replays_quality ON replays(quality_tier, data_source);
CREATE INDEX idx_replays_balance ON replays(balance_preset, engine_version);
CREATE INDEX idx_players_outcome ON replay_players(outcome, faction);
```

**Example queries for corpus curation:**

```sql
-- Find all winning Allied games on RA1 default balance with APM > 60
SELECT r.replay_hash, r.map_name, r.duration_ticks, p.avg_apm
FROM replays r
JOIN replay_players p ON r.replay_hash = p.replay_hash
WHERE p.outcome = 'win'
  AND p.faction = 'allies'
  AND r.game_module = 'ra1'
  AND r.balance_preset = 'ra1-default'
  AND p.avg_apm > 60
  AND r.quality_tier IN ('expert', 'intermediate');

-- Count available samples by data source
SELECT data_source, COUNT(*) AS replays,
       SUM(duration_ticks) / 300 AS approx_samples_at_stride_300
FROM replays
GROUP BY data_source;
```

## Extraction Pipeline

### Replay → Training Pairs

The extraction process converts `.icrep` files into aligned (observation, action, outcome) tuples:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ic replay export-training                                           │
│                                                                      │
│  1. Open .icrep, read metadata → register in training_index.db       │
│  2. Load tick order stream (LZ4 decompress)                          │
│  3. Load keyframe index                                              │
│  4. For each sample tick (stride-based):                             │
│     a. Seek to nearest keyframe, apply deltas to reach target tick   │
│     b. Apply fog-of-war filter for target player                     │
│     c. Extract FogFilteredState from sim snapshot                    │
│     d. Gather event_history (events in [tick-window, tick])          │
│     e. Gather orders issued at this tick by target player            │
│     f. Attach outcome label from match metadata                      │
│     g. Emit TrainingPair                                             │
│  5. Batch TrainingPairs → write Parquet file                         │
│                                                                      │
│  Modes:                                                              │
│  - Full extraction: every player, every stride tick                  │
│  - Winner-only: only extract from winning player's perspective       │
│  - Balanced: equal win/loss samples (undersample majority)           │
│  - Action-only: skip ticks where player issued no orders             │
└──────────────────────────────────────────────────────────────────────┘
```

### Tick Stride (Sampling Rate)

Not every tick is a useful training sample — most ticks contain no orders. The `tick_stride` parameter controls sampling density:

| Stride | Samples per 60-min game (Normal speed) | Use Case                                                               |
| ------ | -------------------------------------- | ---------------------------------------------------------------------- |
| 1      | ~54,000                                | Maximum density — every tick. Large dataset, many empty-order samples. |
| 30     | ~1,800                                 | One sample per second. Balanced density for strategy models.           |
| 60     | ~900                                   | One sample per 2 seconds. Good for macro-strategy models.              |
| 300    | ~180                                   | One sample per 10 seconds. Matches LLM consultation interval (D044).   |

**Default: `tick_stride = 30`** — one sample per second of game time. This matches the granularity at which human players typically make meaningful decisions.

### Fog-of-War Filtering

Training data must respect fog of war — a model trained on omniscient state would learn to "cheat." The extraction pipeline applies the same `FogFilteredView` that the sim provides to `AiStrategy` implementations (D041):

1. Load full game state from keyframe snapshot
2. Compute visibility mask for target player (same fog system as live gameplay)
3. Filter entities: only include units/buildings visible to target player
4. Filter terrain: only include explored cells
5. Enemy unit types visible; exact health visible only for units in line-of-sight

This is an architectural guarantee — the same fog code path runs during extraction as during live gameplay. No information leakage is possible.

## Dataset Collection Strategy

### Source 1: Self-Play Generation (Primary)

Headless simulation drives AI-vs-AI matches at maximum speed, producing large volumes of training data with zero human time cost.

```
ic training generate \
  --games 1000 \
  --ai-a "IC Default Hard" \
  --ai-b "IC Default Medium" \
  --maps all_1v1 \
  --balance ra1-default \
  --output ./training_replays/ \
  --parquet ./training_corpus/
```

**Self-play architecture:**

- `ic training generate` runs headless simulation internally (no rendering, no UI) — this is an `ic` CLI command (D020), not `ic-server` which is the community-server binary (D074)
- `Simulation::apply_tick()` runs at CPU speed (no frame-rate limiting)
- A 60-minute game at Normal speed completes in ~5-15 seconds headless
- Each game produces a `.icrep` file and optionally streams training pairs directly to Parquet
- Parallelism: multiple headless instances on separate cores (one sim per core, no shared state)

**Opponent diversity schedule:**

To prevent models from overfitting to one opponent style, self-play rotates across:

| Dimension        | Variation                                                             |
| ---------------- | --------------------------------------------------------------------- |
| AI difficulty    | Easy, Medium, Hard, Brutal                                            |
| AI preset (D043) | IC Default, Classic RA, Aggressive, Turtle, Rush                      |
| Faction matchups | All faction pairs (Allies vs Soviet, Soviet vs Allies, mirror)        |
| Map pool         | All ranked 1v1 maps + community maps                                  |
| Balance preset   | RA1 Default, OpenRA Compat (if targeting cross-engine generalization) |

A **curriculum schedule** controls diversity — early batches favor simpler scenarios (Easy AI, standard maps), later batches increase difficulty and variety.

### Source 2: Foreign Replay Import (Bootstrap)

D056 defines import of OpenRA `.orarep` and Remastered Collection replays. These provide a **bootstrap corpus** of human gameplay before IC has its own large player base:

```
ic replay import --format orarep ./openra_replays/*.orarep --output ./converted/
ic training ingest --source foreign --replays ./converted/*.icrep
```

**Caveats for foreign data:**
- Simulation may not be bit-identical (D011) — state snapshots are IC's re-simulation, not the original engine's
- Balance differences mean tactics may not transfer perfectly
- Useful for general strategic patterns (expand timing, army composition ratios) rather than precise micro
- Labeled as `DataSource::ForeignImport` in training index — can be filtered in or out per training run

### Source 3: Community Replay Donation (Opt-In)

Players who opt in can contribute replays to a community training corpus:

```
ic replay donate [replay_file.icrep] --anonymize
```

- Runs `ic replay anonymize` first (strips player names → "Player 1", "Player 2") — uses the same anonymization infrastructure described in D049 § "Privacy Considerations" and D056
- Registers in local `training_index.db` with `DataSource::CommunityDonation`
- Published via Workshop as a replay pack (D030) for centralized collection
- Privacy-safe: no PII in replay files by design; anonymization removes display names
- **Canonical sharing/privacy policy:** The replay donation flow builds on D049's existing replay sharing and anonymization patterns. The `ic replay donate` CLI command is research-only — it will be formalized in the canonical CLI surface (D020) when the ML training spec becomes a settled decision.

### Source 4: Skill Library Verification Runs (D057)

When `ic skill verify` runs headless matches to validate candidate skills, those matches produce replays as a side effect. These are particularly valuable because they contain labeled strategic patterns:

- The skill being tested is known → the "intended strategy" is labeled
- The outcome is measured → success/failure of that strategy is labeled
- Multiple verification runs create repeated observations of the same strategy → statistical significance

These replays are labeled `DataSource::SelfPlay` with additional skill provenance metadata.

## Quality Tiers

Not all replays are equally valuable for training. The training index assigns quality tiers:

| Tier           | Criteria                                                           | Training Value                                  |
| -------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| `expert`       | Ranked match, both players MMR > threshold (e.g., top 20%)         | Highest — expert play patterns                  |
| `intermediate` | Ranked match, MMR in middle range; or unranked with APM > 60       | Good — competent play                           |
| `casual`       | Unranked, low APM, or AI difficulty < Medium                       | Lower — may contain suboptimal patterns         |
| `bot`          | Self-play AI-vs-AI                                                 | Consistent but potentially exploitable patterns |
| `unrated`      | No quality signal available (foreign imports, incomplete metadata) | Use with caution                                |

Quality tiers enable corpus curation: a fine-tuning run targeting competitive play would filter to `expert` + `intermediate`; a general-purpose model would use all tiers with appropriate weighting.

## Custom Model Integration Path

### Beyond Text-Based LLMs

D044 defines text-based LLM integration (natural language state → natural language plan). For maximum gameplay performance, custom models should bypass text entirely:

**Option A: WASM `AiStrategy` (recommended for gameplay models)**

A trained neural network can be compiled to WASM and loaded as a Workshop mod (D043). The model receives `FogFilteredView` as structured data and emits `Vec<PlayerOrder>` directly — no text serialization, no prompt engineering, no token counting.

```rust
// Custom model implements AiStrategy trait via WASM
impl AiStrategy for TrainedModel {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // Feed view into neural network (tensor operations in WASM)
        let features = self.encode_state(view);
        let action_logits = self.model.forward(&features);
        // Decode action logits into concrete orders
        self.decode_orders(action_logits, view)
    }
}
```

Inference frameworks like `candle` (MIT, pure Rust) can compile to WASM. The model weights ship as a Workshop resource alongside the WASM binary. Inference latency target: < 5ms per `decide()` call (achievable for small models on modern hardware).

**Option B: `LlmProvider` Tier 4 (Local External)**

A custom model runs as a local HTTP server and implements the `LlmProvider` trait (D047 Tier 4). The model receives fog-filtered state as JSON and returns orders as JSON. This path has higher latency (~10-100ms per call) but supports any model framework (PyTorch, ONNX Runtime, TensorFlow Serving) without WASM compilation.

**Option C: Direct `AiStrategy` in Rust (native performance)**

For maximum optimization, a custom model can be compiled directly as a Rust `AiStrategy` implementation in `ic-ai`. This bypasses both WASM overhead and HTTP latency, running at native speed alongside the sim. This requires building against IC's crate API — suitable for first-party or deeply integrated community models.

### Feature Encoding for Neural Models

Models that receive structured game state (not text) need a feature encoding scheme. The training pipeline defines a canonical encoding:

**Spatial features (grid-based):**
- Map divided into N×N grid cells (e.g., 32×32 for a standard map)
- Per-cell channels: own_units (count), own_buildings (bool), enemy_units (count), enemy_buildings (bool), terrain_type, fog_status, resource_amount
- Gives the model a "minimap image" representation

**Scalar features:**
- Own credits, power balance, army value, unit count, harvester count, tech tier
- Visible enemy army value estimate, visible enemy unit count
- Game tick (normalized to game phase: early/mid/late)
- Map control estimate

**Sequence features (event history):**
- Last N events encoded as (event_type_id, tick_delta, position_x, position_y)
- Gives the model temporal context beyond the current snapshot

## Headless Dataset Generation Architecture

### CLI Interface

```
ic training generate [OPTIONS]

Options:
  --games <N>           Number of games to generate (required)
  --ai-a <SPEC>         AI for player 0 (e.g., "IC Default Hard")
  --ai-b <SPEC>         AI for player 1 (e.g., "IC Default Medium")
  --maps <PATTERN>      Map selection (all_1v1, specific map names, random)
  --balance <PRESET>    Balance preset
  --factions <SPEC>     Faction matchup (all_pairs, allies_vs_soviet, mirror, random)
  --output <DIR>        Directory for .icrep replay files
  --parquet <DIR>       Directory for Parquet training files (optional, skip replay-to-parquet)
  --tick-stride <N>     Sampling stride for Parquet extraction (default: 30)
  --workers <N>         Parallel headless instances (default: number of CPU cores - 1)
  --seed <N>            Base RNG seed for reproducibility
  --resume              Resume interrupted generation (reads progress from output dir)

ic training export [OPTIONS]

Options:
  --replays <GLOB>      Replay files to export (e.g., "./replays/*.icrep")
  --output <DIR>        Parquet output directory
  --tick-stride <N>     Sampling stride (default: 30)
  --players <SPEC>      Which players to extract (winners, losers, all, both)
  --balance-by-outcome  Undersample to equalize win/loss samples
  --fog-filter          Apply fog-of-war filtering (default: true)
  --quality-min <TIER>  Minimum quality tier (expert, intermediate, casual, bot, unrated)
  --max-samples <N>     Cap total samples

ic training stats

  Shows: total replays, total samples, breakdown by source/quality/faction/outcome
```

### Parallel Generation

```
┌─────────────────────────────────────────┐
│  ic training generate --workers 4       │
│                                         │
│  Coordinator                            │
│  ├── Worker 0: Game 1, Game 5, Game 9   │
│  ├── Worker 1: Game 2, Game 6, Game 10  │
│  ├── Worker 2: Game 3, Game 7, Game 11  │
│  └── Worker 3: Game 4, Game 8, Game 12  │
│                                         │
│  Each worker:                           │
│  - Spawns headless ic-sim instance      │
│  - Configures AI, map, factions         │
│  - Runs sim to completion               │
│  - Writes .icrep + optional Parquet     │
│  - Reports progress to coordinator      │
│                                         │
│  Coordinator:                           │
│  - Assigns games round-robin            │
│  - Tracks progress (games_complete.txt) │
│  - Resumes from last checkpoint         │
│  - Aggregates stats on completion       │
└─────────────────────────────────────────┘
```

Workers are separate OS processes (not threads) — each owns its own `Simulation` instance with no shared mutable state. This avoids all synchronization overhead and leverages multi-core hardware for embarrassingly parallel generation.

**Progress tracking:** A `generation_progress.json` file in the output directory records completed games, enabling `--resume` after interruption:

```json
{
  "total_games": 1000,
  "completed": 456,
  "last_completed_seed": 456,
  "config_hash": "abc123...",
  "started_at": "2026-03-01T10:00:00Z"
}
```

## Volume Estimates

| Scenario       | Games   | Duration   | Samples (stride 30) | Parquet Size | Generation Time (4 cores) |
| -------------- | ------- | ---------- | ------------------- | ------------ | ------------------------- |
| Quick test     | 10      | 10 min avg | ~18,000             | ~50 MB       | ~2 minutes                |
| Small corpus   | 100     | 20 min avg | ~360,000            | ~500 MB      | ~15 minutes               |
| Medium corpus  | 1,000   | 30 min avg | ~5.4M               | ~5 GB        | ~2 hours                  |
| Large corpus   | 10,000  | 30 min avg | ~54M                | ~50 GB       | ~20 hours                 |
| Research-grade | 100,000 | 30 min avg | ~540M               | ~500 GB      | ~8 days                   |

Replay files add ~50-100 MB per game if retained. For training-only workflows, the `--parquet` flag can skip replay file creation and stream training pairs directly.

## Integration with Existing Systems

### D057 Skill Library → Training Data

Verified skills from the skill library provide **labeled strategy examples** — the training data equivalent of expert annotations:

```
Skill: "Rush with light vehicles at 5:00 against turtle opponent"
  → SituationSignature: { game_phase: Early, economy: Ahead, threat: Low }
  → StrategicPlan: { priority: Attack, build_focus: Infantry, time_pressure: Urgent }
  → Verified: 12 games, 75% success rate

Training enrichment:
  - Replay ticks matching this SituationSignature can be labeled with the skill ID
  - Models can predict not just "what order" but "what strategy" (higher-level supervision)
  - Few-shot examples in the training prompt include verified skill descriptions
```

### D031 Telemetry → Sample Enrichment

Telemetry events (D031) enrich training samples with contextual data not in the replay:

| Telemetry Event          | Training Enrichment                                        |
| ------------------------ | ---------------------------------------------------------- |
| `match.pace` (every 60s) | Economic time-series for pacing analysis                   |
| `input.ctrl_group`       | Control group usage patterns (micro skill indicator)       |
| `match.surrender_point`  | When players perceive they've lost (reward shaping signal) |
| `input.camera`           | Attention patterns (what the player was looking at)        |

Telemetry enrichment is optional — training pairs are complete without it, but richer with it.

### D042 Behavioral Profiles → Opponent Modeling

Player behavioral profiles (D042) provide aggregate characterizations that can serve as training labels:

- `aggression_index` → labels for "aggressive vs. defensive" playstyle classification
- `build_order_templates` → clustering supervision for build order prediction
- `tech_priority` → labels for strategic preference classification

### D056 Foreign Replays → Bootstrap Corpus

Foreign replays converted via D056 provide initial training data before IC has a large player base:

- OpenRA community has thousands of `.orarep` replay files
- Converted to `.icrep` format, then processed through the standard extraction pipeline
- Labeled as `DataSource::ForeignImport` — distinguishable in training index
- Useful for pre-training; fine-tune on IC-native data once available

## Privacy & Ethics

- **No PII in training data.** Replay files contain no hardware identifiers, IP addresses, or filesystem paths. Display names are optional and removable via `ic replay anonymize`.
- **Consent model.** Self-play data requires no consent (AI-generated). Human replays used for training require opt-in donation. Community replay packs on Workshop include licensing terms.
- **Transparency.** Training corpora are documented in `manifest.json` — source distribution, quality tiers, engine versions. Models trained on IC data should declare their training corpus composition.
- **No competitive advantage from training data.** Models trained on replay data are not allowed in ranked matchmaking (D044 constraint). Training infrastructure enables better AI opponents and LLM coaching, not unfair competitive tools.

## What This Is NOT

- **NOT a model training framework.** IC provides the data pipeline — converting replays to training-ready Parquet. The actual model training (gradient descent, loss functions, hyperparameter tuning) happens in external ML frameworks (PyTorch, etc.).
- **NOT fine-tuning of LLM weights.** D057 explicitly rejects fine-tuning in favor of few-shot skill retrieval. This pipeline supports both approaches — the Parquet output can feed either fine-tuning (external) or skill library accumulation (D057).
- **NOT required for any gameplay feature.** The game and all AI systems work without training data infrastructure. This pipeline enables optional advanced AI development.

## Relationship to Other Designs

| Design                | Relationship                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------- |
| D010 (Snapshots)      | Training pairs are built from snapshot keyframes — same serialization format                |
| D031 (Telemetry)      | Telemetry events optionally enrich training samples; `telemetry.db` provides match metadata |
| D034 (SQLite)         | Training index uses SQLite; same infrastructure as all IC persistent storage                |
| D041 (AiStrategy)     | `FogFilteredView` used for fog filtering is the same interface AIs receive during gameplay  |
| D044 (LLM AI)         | Training data can improve LLM consultation quality via skill library or fine-tuning         |
| D047 (LLM Config)     | Custom models integrate via Tier 4 (Local External) or WASM AiStrategy                      |
| D056 (Foreign Replay) | Foreign replay import bootstraps training corpus before IC has its own player base          |
| D057 (Skill Library)  | Verified skills are high-quality labeled training examples; training validates skills       |

---
