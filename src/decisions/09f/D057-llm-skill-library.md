## D057: LLM Skill Library — Lifelong Learning for AI and Content Generation

**Status:** Settled
**Scope:** `ic-llm`, `ic-ai`, `ic-sim` (read-only via `FogFilteredView`)
**Phase:** Phase 7 (LLM Missions + Ecosystem), with AI skill accumulation feasible as soon as D044 ships
**Depends on:** D016 (LLM-Generated Missions), D034 (SQLite Storage), D041 (AiStrategy), D044 (LLM-Enhanced AI), D030 (Workshop)
**Inspired by:** Voyager (NVIDIA/MineDojo, 2023) — LLM-powered lifelong learning agent for Minecraft with an ever-growing skill library of verified, composable, semantically-indexed executable behaviors

### Problem

IC's LLM features are currently **stateless between sessions**:

- **D044 (`LlmOrchestratorAi`):** Every strategic consultation starts from scratch. The LLM receives game state + `AiEventLog` narrative and produces a `StrategicPlan` with no memory of what strategies worked in previous games. A 100-game-old AI is no smarter than a first-game AI.
- **D016 (mission generation):** Every mission is generated from raw prompts or template-filling. The LLM has no knowledge of which encounter compositions produced missions that players rated highly, completed at target difficulty, or found genuinely fun.
- **D044 (`LlmPlayerAi`):** The experimental full-LLM player repeats the same reasoning mistakes across games because it has no accumulated knowledge of what works in Red Alert.

The scene template library (`04-MODDING.md` § Scene Templates) is a **hand-authored** skill library — pre-built, verified building blocks (ambush, patrol, convoy escort, defend position). But there's no mechanism for the LLM to **discover, verify, and accumulate** its own proven patterns over time.

Voyager (Wang et al., 2023) demonstrated that an LLM agent with a **skill library** — verified executable behaviors indexed by semantic embedding, retrieved by similarity, and composed for new tasks — dramatically outperforms a stateless LLM agent. Voyager obtained 3.3x more unique items and unlocked tech tree milestones 15.3x faster than agents without skill accumulation. The key insight: storing verified skills eliminates catastrophic forgetting and compounds the agent's capabilities over time.

IC already has almost every infrastructure piece needed for this pattern. The missing component is the **verification → storage → retrieval → composition** loop that turns individual LLM outputs into a growing library of proven capabilities.

### Decision

Add a **Skill Library** system to `ic-llm` — a persistent, semantically-indexed store of verified LLM outputs that accumulates knowledge across sessions. The library serves two domains with shared infrastructure:

1. **AI Skills** — strategic patterns verified through gameplay outcomes (D044)
2. **Generation Skills** — mission/encounter patterns verified through player ratings and validation (D016)

Both domains use the same storage format, retrieval mechanism, verification pipeline, and sharing infrastructure. They differ only in what constitutes a "skill" and how verification works.

### Architecture

#### The Skill

A skill is a verified, reusable LLM output with provenance and quality metadata:

```rust
/// A verified, reusable LLM output stored in the skill library.
/// Applicable to both AI strategy skills and content generation skills.
pub struct Skill {
    pub id: SkillId,                        // UUID
    pub domain: SkillDomain,
    pub name: String,                       // human-readable, LLM-generated
    pub description: String,                // semantic description for retrieval
    pub description_embedding: Vec<f32>,    // embedding vector for similarity search
    pub body: SkillBody,                    // the actual executable content
    pub provenance: SkillProvenance,
    pub quality: SkillQuality,
    pub tags: Vec<String>,                  // searchable tags (e.g., "anti-air", "early-game", "naval")
    pub composable_with: Vec<SkillId>,      // skills this has been successfully composed with
    pub created_at: String,                 // ISO 8601
    pub last_used: String,
    pub use_count: u32,
}

pub enum SkillDomain {
    /// Strategic AI patterns (D044) — "how to play"
    AiStrategy,
    /// Mission/encounter generation patterns (D016) — "how to build content"
    ContentGeneration,
}

pub enum SkillBody {
    /// A strategic plan template with parameter bindings.
    /// Used by LlmOrchestratorAi to guide inner AI behavior.
    StrategicPattern {
        /// The situation this pattern addresses (serialized game state features).
        situation: SituationSignature,
        /// The StrategicPlan that worked in this situation.
        plan: StrategicPlan,
        /// Parameter adjustments applied to the inner AI.
        parameter_bindings: Vec<(String, i32)>,
    },
    /// A mission encounter composition — scene templates + parameter values.
    /// Used by D016 mission generation to compose proven building blocks.
    EncounterPattern {
        /// Scene template IDs and their parameter values.
        scene_composition: Vec<SceneInstance>,
        /// Overall mission structure metadata.
        mission_structure: MissionStructureHints,
    },
    /// A raw prompt+response pair that produced a verified good result.
    /// Injected as few-shot examples in future LLM consultations.
    VerifiedExample {
        prompt_context: String,
        response: String,
    },
}

pub struct SkillProvenance {
    pub source: SkillSource,
    pub model_id: Option<String>,           // which LLM model generated it
    pub game_module: String,                // "ra1", "td", etc.
    pub engine_version: String,
}

pub enum SkillSource {
    /// Discovered by the LLM during gameplay or generation, then verified.
    LlmDiscovered,
    /// Hand-authored by a human (e.g., built-in scene templates promoted to skills).
    HandAuthored,
    /// Imported from Workshop.
    Workshop { source_id: String, author: String },
    /// Refined from an LLM-discovered skill by a human editor.
    HumanRefined { original_id: SkillId },
}

pub struct SkillQuality {
    pub verification_count: u32,            // how many times verified
    pub success_rate: f64,                  // wins / uses for AI; completion rate for missions
    pub average_rating: Option<f64>,        // player rating (1-5) for generation skills
    pub confidence: SkillConfidence,
    pub last_verified: String,              // ISO 8601
}

pub enum SkillConfidence {
    /// Passed initial validation but low sample size (< 3 verifications).
    Tentative,
    /// Consistently successful across multiple verifications (3-10).
    Established,
    /// Extensively verified with high success rate (10+).
    Proven,
}
```

#### Storage: SQLite (D034)

Skills are stored in SQLite — same embedded database as all other IC persistent state. No external vector database required.

```sql
CREATE TABLE skills (
    id              TEXT PRIMARY KEY,
    domain          TEXT NOT NULL,       -- 'ai_strategy' | 'content_generation'
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    body_json       TEXT NOT NULL,       -- JSON-serialized SkillBody
    tags            TEXT NOT NULL,       -- JSON array of tags
    game_module     TEXT NOT NULL,
    source          TEXT NOT NULL,       -- 'llm_discovered' | 'hand_authored' | 'workshop' | 'human_refined'
    model_id        TEXT,
    verification_count  INTEGER DEFAULT 0,
    success_rate    REAL DEFAULT 0.0,
    average_rating  REAL,
    confidence      TEXT DEFAULT 'tentative',
    use_count       INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    last_used       TEXT,
    last_verified   TEXT
);

-- FTS5 for text-based skill retrieval (fast, no external dependencies)
CREATE VIRTUAL TABLE skills_fts USING fts5(
    name, description, tags,
    content=skills, content_rowid=rowid
);

-- Embedding vectors stored as BLOBs for similarity search
CREATE TABLE skill_embeddings (
    skill_id        TEXT PRIMARY KEY REFERENCES skills(id),
    embedding       BLOB NOT NULL,       -- f32 array, serialized
    model_id        TEXT NOT NULL         -- which embedding model produced this
);

-- Composition history: which skills have been successfully used together
CREATE TABLE skill_compositions (
    skill_a         TEXT REFERENCES skills(id),
    skill_b         TEXT REFERENCES skills(id),
    success_count   INTEGER DEFAULT 0,
    PRIMARY KEY (skill_a, skill_b)
);
```

**Retrieval strategy (two-tier):**

1. **FTS5 keyword search** — fast, zero-dependency, works offline. Query: `"anti-air defense early-game"` matches skills with those terms in name/description/tags. This is the primary retrieval path and works without an embedding model.
2. **Embedding similarity** — optional, higher quality. If the user's `LlmProvider` (D016) supports embeddings (most do), skill descriptions are embedded at storage time. Retrieval computes cosine similarity between the query embedding and stored embeddings. This is a SQLite scan with in-process vector math — no external vector database.

FTS5 is always available. Embedding similarity is used when an embedding model is configured and falls back to FTS5 otherwise. Both paths return ranked results; the top-K skills are injected into the LLM prompt as few-shot context.

#### Verification Pipeline

The critical difference between a skill library and a prompt cache: **skills are verified**. An unverified LLM output is a candidate; a verified output is a skill.

**AI Strategy verification (D044):**

```
LlmOrchestratorAi generates StrategicPlan
  → Inner AI executes the plan over the next consultation interval
  → Match outcome observed (win/loss, resource delta, army value delta, territory change)
  → If favorable outcome: candidate skill created
  → Candidate includes: SituationSignature (game state features at plan time)
                        + StrategicPlan + parameter bindings + outcome metrics
  → Same pattern used in 3+ games with >60% success → promoted to Established skill
  → 10+ uses with >70% success → promoted to Proven skill
```

`SituationSignature` captures the game state features that made this plan applicable — not the entire state, but the strategically relevant dimensions:

```rust
/// A compressed representation of the game situation when a skill was applied.
/// Used to match current situations against stored skills.
pub struct SituationSignature {
    pub game_phase: GamePhase,              // early / mid / late (derived from tick + tech level)
    pub economy_state: EconomyState,        // ahead / even / behind (relative resource flow)
    pub army_composition: Vec<(String, u8)>, // top unit types by proportion
    pub enemy_composition_estimate: Vec<(String, u8)>,
    pub map_control: f32,                   // 0.0-1.0 estimated map control
    pub threat_level: ThreatLevel,          // none / low / medium / high / critical
    pub active_tech: Vec<String>,           // available tech tiers
}
```

**Content Generation verification (D016):**

```
LLM generates mission (from template or raw)
  → Schema validation passes (valid unit types, reachable objectives, balanced resources)
  → Player plays the mission
  → Outcome observed: completion (yes/no), time-to-complete, player rating (if provided)
  → If completed + rated ≥ 3 stars: candidate encounter skill created
  → Candidate includes: scene composition + parameter values + mission structure + rating
  → Aggregated across 3+ players/plays with avg rating ≥ 3.5 → Established
  → Workshop rating data (if published) feeds back into quality scores
```

**Automated pre-verification (no player required):**

For AI skills, headless simulation provides automated verification:

```
ic skill verify --domain ai --games 20 --opponent "IC Default Hard"
```

This runs the AI with each candidate skill against a reference opponent headlessly, measuring win rate. Skills that pass automated verification at a lower threshold (>40% win rate against Hard AI) are promoted to `Tentative`. Human play promotes them further.

#### Prompt Augmentation — How Skills Reach the LLM

When the `LlmOrchestratorAi` or mission generator prepares a prompt, the skill library injects relevant context:

```rust
/// Retrieves relevant skills and augments the LLM prompt.
pub struct SkillRetriever {
    db: SqliteConnection,
    embedding_provider: Option<Box<dyn EmbeddingProvider>>,
}

impl SkillRetriever {
    /// Find skills relevant to the current context.
    /// Returns top-K skills ranked by relevance, filtered by domain and game module.
    pub fn retrieve(
        &self,
        query: &str,
        domain: SkillDomain,
        game_module: &str,
        max_results: usize,
    ) -> Vec<Skill> {
        // 1. Try embedding similarity if available
        // 2. Fall back to FTS5 keyword search
        // 3. Filter by confidence >= Tentative
        // 4. Rank by (relevance_score * quality.success_rate)
        // 5. Return top-K
        ...
    }

    /// Format retrieved skills as few-shot context for the LLM prompt.
    pub fn format_as_context(&self, skills: &[Skill]) -> String {
        // Each skill becomes a "Previously successful approach:" block
        // in the prompt, with situation → plan → outcome
        ...
    }
}
```

**In the orchestrator prompt flow (D044):**

```
System prompt (from llm/prompts/orchestrator.yaml)
  + "Previously successful strategies in similar situations:"
  + [top 3-5 retrieved AI skills, formatted as situation/plan/outcome examples]
  + "Current game state:"
  + [serialized FogFilteredView]
  + "Recent events:"
  + [event_log.to_narrative(since_tick)]
  → LLM produces StrategicPlan
    (informed by proven patterns, but free to adapt or deviate)
```

**In the mission generation prompt flow (D016):**

```
System prompt (from llm/prompts/mission_generator.yaml)
  + "Encounter patterns that players enjoyed:"
  + [top 3-5 retrieved generation skills, formatted as composition/rating examples]
  + Campaign context (skeleton, current act, character states)
  + Player preferences
  → LLM produces mission YAML
    (informed by proven encounter patterns, but free to create new ones)
```

The LLM is never forced to use retrieved skills — they're few-shot examples that bias toward proven patterns while preserving creative freedom. If the current situation is genuinely novel (no similar skills found), the retrieval returns nothing and the LLM operates as it does today — statelessly.

#### Skill Composition

Complex gameplay requires combining multiple skills. Voyager's key insight: skills compose — "mine iron" + "craft furnace" + "smelt iron ore" compose into "make iron ingots." IC skills compose similarly:

**AI skill composition:**
- "Rush with light vehicles at 5:00" + "transition to heavy armor at 12:00" = an early-aggression-into-late-game strategic arc
- The `composable_with` field and `skill_compositions` table track which skills have been successfully used in sequence
- The orchestrator can retrieve a *sequence* of skills for different game phases, not just a single skill for the current moment

**Generation skill composition:**
- "bridge_ambush" + "timed_extraction" + "weather_escalation" = a specific mission pattern
- This is exactly the existing scene template hierarchy (`04-MODDING.md` § Template Hierarchy), but with LLM-discovered compositions alongside hand-authored ones
- The `EncounterPattern` skill body stores the full composition — which scene templates, in what order, with what parameter values

#### Workshop Distribution (D030)

Skill libraries are Workshop-shareable resources:

```yaml
# workshop/my-ai-skill-library/resource.yaml
type: skill_library
display_name: "Competitive RA1 AI Strategies"
description: "150 verified strategic patterns learned over 500 games against Hard AI"
game_module: ra1
domain: ai_strategy
skill_count: 150
average_confidence: proven
license: CC-BY-SA-4.0
ai_usage: Allow
```

**Sharing model:**
- Players export their skill library (or a curated subset) as a Workshop package
- Other players subscribe and merge into their local library
- Skill provenance tracks origin — `Workshop { source_id, author }`
- Community curation: Workshop ratings on skill libraries indicate quality
- AI tournament leaderboards (D043) can require contestants to publish their skill libraries, creating a knowledge commons

**Privacy:**
- Skill libraries contain **no player data** — only LLM outputs, game state features, and outcome metrics
- No replays, no player names, no match IDs in the exported skill data
- A skill that says "rush at 5:00 with 3 light tanks against enemy who expanded early" reveals a strategy, not a person

#### Skill Lifecycle

```
1. DISCOVERY      LLM generates an output (StrategicPlan or mission content)
        ↓
2. EXECUTION      Output is used in gameplay or mission play
        ↓
3. EVALUATION     Outcome measured (win/loss, rating, completion)
        ↓
4. CANDIDACY      If outcome meets threshold → candidate skill created
        ↓
5. VERIFICATION   Same pattern reused 3+ times with consistent success → Established
        ↓
6. PROMOTION      10+ verifications with high success → Proven
        ↓
7. RETRIEVAL      Proven skills injected as few-shot context in future LLM consultations
        ↓
8. COMPOSITION    Skills used together successfully → composition recorded
        ↓
9. SHARING        Player exports library to Workshop; community benefits
```

**Skill decay:** Skills verified against older engine versions may become less relevant as game balance changes. Skills include `engine_version` in provenance. A periodic maintenance pass (triggered by engine update) re-validates `Proven` skills by running them through headless simulation. Skills that fall below threshold are downgraded to `Tentative` rather than deleted — balance might revert, or the pattern might work in a different context.

**Skill pruning:** Libraries grow unboundedly without curation. Automatic pruning removes skills that are: (a) `Tentative` for >30 days with no additional verifications, (b) `use_count == 0` for >90 days, or (c) superseded by a strictly-better skill (same situation, higher success rate). Manual pruning via `ic skill prune` CLI. Users set a max library size; pruning prioritizes keeping `Proven` skills and removing `Tentative` duplicates.

### Embedding Provider

Embeddings require a model. IC does not ship one — same BYOLLM principle as D016:

```rust
/// Produces embedding vectors from text descriptions.
/// Optional — FTS5 provides retrieval without embeddings.
pub trait EmbeddingProvider: Send + Sync {
    fn embed(&self, text: &str) -> Result<Vec<f32>>;
    fn embedding_dimensions(&self) -> usize;
    fn model_id(&self) -> &str;
}
```

Built-in implementations:
- `OpenAIEmbeddings` — uses OpenAI's `text-embedding-3-small` (or compatible API)
- `OllamaEmbeddings` — uses any Ollama model with embedding support (local, free)
- `NoEmbeddings` — disables embedding similarity; FTS5 keyword search only

The embedding model is configured alongside the `LlmProvider` in D047's task routing table. If no embedding provider is configured, the skill library works with FTS5 only — slightly lower retrieval quality, but fully functional offline with zero external dependencies.

### CLI

```
ic skill list [--domain ai|content] [--confidence proven|established|tentative] [--game-module ra1]
ic skill show <skill-id>
ic skill verify --domain ai --games 20 --opponent "IC Default Hard"
ic skill export [--domain ai] [--confidence established+] -o skills.icpkg
ic skill import skills.icpkg [--merge|--replace]
ic skill prune [--max-size 500] [--dry-run]
ic skill stats     # library overview: counts by domain/confidence/game module
```

### What This Is NOT

- **NOT fine-tuning.** The LLM model parameters are never modified. Skills are retrieved context (few-shot examples), not gradient updates. Users never need GPU training infrastructure.
- **NOT a replay database.** Skills store compressed patterns (situation signature + plan + outcome), not full game replays. A skill is ~1-5 KB; a replay is ~2-5 MB.
- **NOT required for any LLM feature to work.** All LLM features (D016, D044) work without a skill library — they just don't improve over time. The library is an additive enhancement, not a prerequisite.
- **NOT a replacement for hand-authored content.** The built-in scene templates, AI behavior presets (D043), and campaign content (D021) are hand-crafted and don't depend on the skill library. The library augments LLM capabilities; it doesn't replace authored content.

### Alternatives Considered

- **Full model fine-tuning per user** (rejected — requires GPU infrastructure, violates BYOLLM portability, incompatible with API-based providers, and risks catastrophic forgetting of general capabilities)
- **Replay-as-skill (store full replays as skills)** (rejected — replays are too large and unstructured for retrieval; skills must be compressed to situation+plan patterns that fit in a prompt context window)
- **External vector database (Pinecone, Qdrant, Chroma)** (rejected — violates D034's "no external DB" principle; SQLite + FTS5 + in-process vector math is sufficient for a skill library measured in hundreds-to-thousands of entries, not millions)
- **Skills stored in the LLM's context window only (no persistence)** (rejected — context windows are bounded and ephemeral; the whole point is cross-session accumulation)
- **Shared global skill library** (rejected — violates local-first privacy principle; players opt in to sharing via Workshop, never forced; global aggregation risks homogenizing strategies)
- **AI training via reinforcement learning instead of skill accumulation** (rejected — RL requires model parameter access, massive compute, and is incompatible with BYOLLM API models; skill retrieval works with any LLM including cloud APIs)

### Integration with Existing Decisions

- **D016 (LLM Missions):** Generation skills are accumulated from D016's mission generation pipeline. The template-first approach (`04-MODDING.md` § LLM + Templates) benefits most — proven template parameter combinations become generation skills, dramatically improving template-filling reliability.
- **D034 (SQLite):** Skill storage uses the same embedded SQLite database as replay catalogs, match history, and gameplay events. New tables, same infrastructure. FTS5 is already available for search.
- **D041 (AiStrategy):** The `AiEventLog`, `FogFilteredView`, and `set_parameter()` infrastructure provide the verification feedback loop. Skill outcomes are measured through the same event pipeline that informs the orchestrator.
- **D043 (AI Presets):** Built-in AI behavior presets can be promoted to hand-authored skills in the library, giving the retrieval system access to the same proven patterns that the preset system encodes — but indexed for semantic search rather than manual selection.
- **D044 (LLM AI):** AI strategy skills directly augment the orchestrator's consultation prompts. The `LlmOrchestratorAi` becomes the primary skill producer and consumer. The `LlmPlayerAi` also benefits — its reasoning improves with proven examples in context.
- **D047 (LLM Configuration Manager):** The embedding provider is configured alongside other LLM providers in D047's task routing table. Task: `embedding` → Provider: Ollama/OpenAI.
- **D030 (Workshop):** Skill libraries are Workshop resources — shareable, versionable, ratable. AI tournament communities can maintain curated skill libraries.
- **D031 (Observability):** Skill retrieval, verification, and promotion events are logged as telemetry events — observable in Grafana dashboards for debugging skill library behavior.

### Relationship to Voyager

IC's skill library adapts Voyager's three core insights to the RTS domain:

| Voyager Concept                                 | IC Adaptation                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Skill = executable JavaScript function**      | Skill = `StrategicPlan` (AI) or `EncounterPattern` (generation) — domain-specific executable content                                                                     |
| **Skill verification via environment feedback** | Verification via match outcome (AI) or player rating + schema validation (generation)                                                                                    |
| **Embedding-indexed retrieval**                 | Two-tier: FTS5 keyword (always available) + optional embedding similarity                                                                                                |
| **Compositional skills**                        | `composable_with` + `skill_compositions` table; scene template hierarchy for generation                                                                                  |
| **Automatic curriculum**                        | Not directly adopted — IC's curriculum is human-driven (player picks missions, matchmaking picks opponents). The skill library accumulates passively during normal play. |
| **Iterative prompting with self-verification**  | Schema validation + headless sim verification (`ic skill verify`) replaces Voyager's in-environment code testing                                                         |

The key architectural difference: Voyager's agent runs in a single-player sandbox with fast iteration loops (try code → observe → refine → store). IC's skills accumulate more slowly — each verification requires a full game or mission play. This means IC's library grows over days/weeks rather than hours, but the skills are verified against real gameplay rather than sandbox experiments, producing higher-quality patterns.

---
