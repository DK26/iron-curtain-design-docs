# BYOLLM Implementation Specification

> Integration wiring, gap fills, working prototype, and phased roadmap for Iron Curtain's LLM subsystem.
>
> **Date:** 2026-02-27
> **Status:** Implementation-ready specification
> **Referenced by:** D016, D044, D047, D057, D073

---

## Table of Contents

1. [System Wiring — Integration Proof](#1-system-wiring--integration-proof)
2. [Gap Fills](#2-gap-fills)
3. [Working Prototype — Ollama + Orchestrator](#3-working-prototype--ollama--orchestrator)
4. [Implementation Roadmap](#4-implementation-roadmap)

---

## Existing Types Referenced (Not Redefined)

| Type | Defined In | Crate |
|------|-----------|-------|
| `StrategicPlan`, `StrategicTarget`, `BuildFocus`, `EconomicGuidance`, `RiskAssessment` | D044 + `llm-generation-schemas.md` §9 | `ic-ai` |
| `LlmOrchestratorAi`, `LlmPlayerAi` | D044 | `ic-ai` |
| `AiStrategy` trait, `AiEventLog`, `FogFilteredView`, `ParameterSpec` | D041 | `ic-ai` |
| `Skill`, `SkillBody`, `SkillDomain`, `SituationSignature`, `SkillQuality` | D057 | `ic-llm` |
| `PlayerOrder`, `TimestampedOrder`, `TickOrders`, `PlayerId` | `03-NETCODE.md` §Protocol | `ic-protocol` |
| `GameLoop<N, I>` | `architecture/game-loop.md` | `ic-game` |
| `NetworkModel` trait | `03-NETCODE.md` §NetworkModel Trait | `ic-net` |
| `PromptStrategyProfile`, `ModelCapabilityProbe` | D047 | `ic-llm` |
| `llm_providers`, `llm_task_routing`, `llm_prompt_profiles` tables | D047 | SQLite |
| `VoiceProvider`, `MusicProvider`, `SoundFxProvider` traits | D016 | `ic-llm` |
| `CampaignSkeleton`, `GenerativeCampaignContext`, `BattleReport` | D016 | `ic-llm` |

---

## 1. System Wiring — Integration Proof

### 1.1 Crate Dependency Graph

```
ic-game
  ├── ic-ai           AiStrategy impls, LlmOrchestratorAi, LlmPlayerAi
  │     └── ic-llm    LlmProvider trait, SkillRetriever, prompt assembly
  │           └── (no ic-sim, no ic-ai imports — traits + infra only)
  ├── ic-sim          Pure deterministic sim — ZERO knowledge of LLM
  │     └── ic-protocol
  └── ic-net
        └── ic-protocol
```

**Critical boundary:** `ic-llm` does NOT import `ic-sim` or `ic-ai`. It defines provider traits, prompt infrastructure, and the skill library. `ic-ai` imports `ic-llm` to use providers and skill retrieval. `ic-sim` has zero knowledge that LLM exists — it only sees `PlayerOrder` values arriving through `NetworkModel`.

### 1.2 LlmProvider Trait — Full Async Signature

```rust
/// The core LLM provider trait. Lives in ic-llm.
/// Implemented for each backend (Ollama, OpenAI, Anthropic, etc.)
/// Does NOT import ic-sim or ic-ai.
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Send a chat completion request. Returns the model's text response.
    async fn chat_complete(&self, request: LlmRequest) -> Result<LlmResponse, LlmError>;

    /// Check provider health / connectivity.
    async fn health_check(&self) -> Result<ProviderStatus, LlmError>;

    /// Provider display name for UI.
    fn display_name(&self) -> &str;

    /// Provider type identifier (for D047 factory).
    fn provider_type(&self) -> ProviderType;

    /// Maximum context window in tokens (if known from config or probe).
    fn context_window(&self) -> Option<u32>;
}

pub struct LlmRequest {
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,       // 0.0-2.0, default 0.7
    pub max_tokens: Option<u32>,        // default 500 for orchestrator
    pub stop_sequences: Vec<String>,
    pub response_format: ResponseFormat,
}

pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

pub enum Role { System, User, Assistant }

pub enum ResponseFormat {
    Text,
    Json,   // Ollama "format": "json", OpenAI response_format: json_object
    Yaml,
}

pub struct LlmResponse {
    pub content: String,
    pub model: String,
    pub tokens_used: Option<u32>,       // from provider if available
    pub latency_ms: u64,
}

pub enum LlmError {
    Timeout(u64),                       // waited N ms
    RateLimited { retry_after_ms: u64 },
    AuthError(String),
    NetworkError(String),
    MalformedResponse(String),          // response received but unparseable
    ContextWindowExceeded { limit: u32, requested: u32 },
    ProviderUnavailable(String),
}

pub enum ProviderType {
    Ollama,
    OpenAi,
    Anthropic,
    OpenAiCompatible,
}

pub struct ProviderStatus {
    pub connected: bool,
    pub model_loaded: bool,
    pub latency_ms: Option<u64>,
}
```

### 1.3 Async Execution Model

LLM calls NEVER block the game loop. The pattern uses Bevy's `AsyncComputeTaskPool` with non-blocking polling:

```rust
use bevy::tasks::{AsyncComputeTaskPool, Task};
use futures_lite::future;

/// Fields added to LlmOrchestratorAi (defined in D044).
/// These are the async integration fields not shown in D044's design.
struct LlmAsyncState {
    provider: Arc<dyn LlmProvider>,
    pending_consultation: Option<Task<Result<LlmResponse, LlmError>>>,
    last_consultation: u64,
    consultation_interval: u64,         // default 300 ticks (~10s at 30 tps)
    error_policy: LlmErrorPolicy,       // §2.1
    rate_limiter: RateLimiter,          // §2.4
    token_budget: TokenBudget,          // §2.2
}

impl LlmOrchestratorAi {
    /// Spawn an async LLM consultation. Does NOT block.
    fn consult_llm(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) {
        // Rate limit check
        if self.async_state.rate_limiter.try_acquire(500).is_err() {
            return; // silently skip — inner AI continues
        }

        // Build prompt (sync, fast — just string formatting)
        let prompt = self.build_prompt(view, tick);
        let request = LlmRequest {
            messages: prompt.messages,
            temperature: Some(0.7),
            max_tokens: Some(500),
            stop_sequences: vec![],
            response_format: ResponseFormat::Json,
        };

        // Spawn async task — runs on Bevy's compute thread pool
        let provider = self.async_state.provider.clone();
        let timeout_ms = self.async_state.error_policy.timeout_ms;
        let task = AsyncComputeTaskPool::get().spawn(async move {
            tokio::time::timeout(
                std::time::Duration::from_millis(timeout_ms),
                provider.chat_complete(request),
            )
            .await
            .map_err(|_| LlmError::Timeout(timeout_ms))?
        });

        self.async_state.pending_consultation = Some(task);
        self.async_state.last_consultation = tick;
    }

    /// Called every tick via AiStrategy::decide(). Polls non-blockingly.
    fn poll_consultation(&mut self) {
        if let Some(ref mut task) = self.async_state.pending_consultation {
            // Non-blocking poll — returns None if not yet complete
            if let Some(result) = future::block_on(future::poll_once(task)) {
                match result {
                    Ok(response) => {
                        match self.parse_strategic_plan(&response.content) {
                            Ok(plan) => {
                                self.apply_strategic_plan(&plan);
                                self.current_plan = Some(plan);
                                // Candidate skill for D057 verification
                                self.skill_candidate = Some(self.capture_skill_candidate());
                            }
                            Err(e) => self.handle_parse_error(e, &response.content),
                        }
                    }
                    Err(e) => self.handle_llm_error(e),
                }
                self.async_state.pending_consultation = None;
            }
            // If None: task still running. Inner AI continues with previous plan.
        }
    }
}

// Integration with AiStrategy::decide() (D044):
impl AiStrategy for LlmOrchestratorAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // 1. Poll any pending LLM consultation (non-blocking)
        self.poll_consultation();

        // 2. Start new consultation if interval elapsed and no pending
        if self.async_state.pending_consultation.is_none()
            && tick - self.async_state.last_consultation >= self.async_state.consultation_interval
        {
            self.consult_llm(player, view, tick);
        }

        // 3. ALWAYS delegate to inner AI — never stall on LLM
        self.inner.decide(player, view, tick)
    }

    // All callbacks forwarded to inner AI + recorded in event_log (D044 §callbacks)
    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        self.event_log.push(/* ... */);
        self.inner.on_enemy_spotted(unit, unit_type);
    }
    // ... remaining callbacks identical to D044 pattern
}
```

### 1.4 Provider → TaskRouter → PromptAssembler Wiring

```rust
/// Constructed at startup from D047 SQLite tables.
/// Lives in ic-llm.
pub struct ProviderRegistry {
    providers: HashMap<i64, Arc<dyn LlmProvider>>,
}

pub struct TaskRouter {
    registry: ProviderRegistry,
    routing: HashMap<String, i64>,                  // task_name → provider_id
    profiles: HashMap<String, PromptStrategyProfile>, // task_name → profile
}

impl TaskRouter {
    /// Load from D047 SQLite tables at startup.
    pub fn from_db(db: &Connection) -> Result<Self, DbError> {
        let providers = load_providers(db)?;    // llm_providers table
        let routing = load_routing(db)?;        // llm_task_routing table
        let profiles = load_profiles(db)?;      // llm_task_prompt_strategy + llm_prompt_profiles
        Ok(Self { registry: ProviderRegistry { providers }, routing, profiles })
    }

    pub fn provider_for(&self, task: &str) -> Option<Arc<dyn LlmProvider>> {
        let id = self.routing.get(task)?;
        self.registry.providers.get(id).cloned()
    }

    pub fn profile_for(&self, task: &str) -> Option<&PromptStrategyProfile> {
        self.profiles.get(task)
    }
}

/// Startup wiring — called during game initialization.
pub fn setup_llm_system(db: &Connection) -> Option<TaskRouter> {
    // 1. Load task router from D047 tables
    let router = TaskRouter::from_db(db).ok()?;

    // 2. Health-check active providers (async, non-blocking)
    for (id, provider) in &router.registry.providers {
        AsyncComputeTaskPool::get().spawn(async move {
            match provider.health_check().await {
                Ok(status) => log::info!("Provider {} ready: {:?}", provider.display_name(), status),
                Err(e) => log::warn!("Provider {} unavailable: {:?}", provider.display_name(), e),
            }
        });
    }

    Some(router)
}

/// When constructing LlmOrchestratorAi for a match:
pub fn create_orchestrator_ai(
    router: &TaskRouter,
    inner: Box<dyn AiStrategy>,
    skill_db: &Connection,
    game_module: &str,
) -> Box<dyn AiStrategy> {
    match router.provider_for("ai_orchestrator") {
        Some(provider) => {
            let profile = router.profile_for("ai_orchestrator");
            let skill_retriever = SkillRetriever::new(skill_db, game_module);
            Box::new(LlmOrchestratorAi {
                inner,
                async_state: LlmAsyncState {
                    provider,
                    pending_consultation: None,
                    last_consultation: 0,
                    consultation_interval: 300,
                    error_policy: LlmErrorPolicy::default(),
                    rate_limiter: RateLimiter::default(),
                    token_budget: TokenBudget::for_provider(provider.context_window()),
                },
                skill_retriever: Some(skill_retriever),
                prompt_profile: profile.cloned(),
                current_plan: None,
                event_log: AiEventLog::new(),
                // ... remaining D044 fields
            })
        }
        None => inner, // No LLM configured — inner AI plays alone
    }
}
```

### 1.5 Multiplayer Determinism Proof

```
Client A (AI slot owner)          Relay             Client B (human)
─────────────────────────        ──────             ────────────────
LlmOrchestratorAi.decide()
  → inner AI produces Vec<PlayerOrder>
  → orders submitted via NetworkModel.submit_order()
    ── encrypted UDP ──────▶  receive_order()
                               finalize_tick()  ◀── (Client B's orders)
                               broadcast()
    ◀── encrypted UDP ──────  ── encrypted UDP ──▶
sim.apply_tick(&tick_orders)                     sim.apply_tick(&tick_orders)
                                                 (identical tick, identical orders)
```

The LLM runs ONLY on Client A. Client B never runs an LLM call. The LLM affects which `PlayerOrder` values the inner AI emits, but those orders are standard protocol types that flow through the deterministic relay pipeline. Replays record orders, not LLM calls — replay playback is fully deterministic with zero LLM dependency.

### 1.6 Skill Library Integration

```rust
impl LlmOrchestratorAi {
    /// Build the full prompt for one orchestrator consultation.
    /// Connects: game state + event log + skill library + prompt profile.
    fn build_prompt(&self, view: &FogFilteredView, tick: u64) -> LlmPrompt {
        // 1. Serialize visible game state (format from llm-generation-schemas.md §9)
        let game_state_yaml = serialize_game_state(view, tick);

        // 2. Serialize recent events as narrative
        let event_narrative = self.event_log.to_narrative(self.async_state.last_consultation);

        // 3. Retrieve relevant skills from D057 library (if available)
        let skill_context = match &self.skill_retriever {
            Some(retriever) => {
                let situation = SituationSignature::from_view(view, tick);
                let skills = retriever.retrieve_for_situation(
                    &situation,
                    SkillDomain::AiStrategy,
                    3, // top 3
                );
                format_skills_as_context(&skills)
            }
            None => String::new(),
        };

        // 4. Format current plan (if any)
        let current_plan = self.current_plan.as_ref()
            .map(|p| format_current_plan(p))
            .unwrap_or_default();

        // 5. Assemble using prompt profile (D047)
        let system_prompt = self.load_system_prompt(); // from llm/prompts/orchestrator.yaml

        // 6. Apply token budget (§2.2) — truncate if needed
        let mut budget = self.async_state.token_budget.clone();
        let system_tokens = budget.estimate_tokens(&system_prompt);
        budget.reserve(system_tokens);

        // Truncation priority: skills first, events second, state last
        let skill_text = budget.fit_or_truncate(&skill_context);
        let event_text = budget.fit_or_truncate(&event_narrative);
        let state_text = budget.fit_or_truncate(&game_state_yaml);

        let user_content = format!(
            "{state_text}\n\n{event_text}\n\n{current_plan}\n\n{skill_text}"
        );

        LlmPrompt {
            messages: vec![
                ChatMessage { role: Role::System, content: system_prompt },
                ChatMessage { role: Role::User, content: user_content },
            ],
        }
    }
}
```

---

## 2. Gap Fills

### 2.1 Error Handling

```rust
pub struct LlmErrorPolicy {
    pub timeout_ms: u64,                    // default: 10_000 (10s)
    pub max_retries: u8,                    // default: 1
    pub retry_delay_ms: u64,               // default: 500
    pub malformed_strategy: MalformedStrategy,
}

pub enum MalformedStrategy {
    /// Try to extract partial data from malformed JSON.
    BestEffortParse,
    /// Re-prompt with error context (llm-generation-schemas.md §12 pattern).
    RepromptWithError { max_repair_attempts: u8 },
    /// Fall back to previous plan (no change to inner AI).
    KeepPreviousPlan,
}

impl Default for LlmErrorPolicy {
    fn default() -> Self {
        Self {
            timeout_ms: 10_000,
            max_retries: 1,
            retry_delay_ms: 500,
            malformed_strategy: MalformedStrategy::BestEffortParse,
        }
    }
}

impl LlmOrchestratorAi {
    fn handle_llm_error(&mut self, error: LlmError) {
        match error {
            LlmError::Timeout(_) => {
                // Inner AI continues with previous plan. Log warning.
                log::warn!("LLM consultation timed out — keeping previous plan");
                self.consecutive_errors += 1;
            }
            LlmError::NetworkError(_) | LlmError::ProviderUnavailable(_) => {
                log::warn!("LLM provider unavailable — disabling for this match");
                self.provider_disabled = true;
                // Inner AI plays alone for remainder of match
            }
            LlmError::AuthError(msg) => {
                log::error!("LLM auth failed: {} — disabling", msg);
                self.provider_disabled = true;
            }
            LlmError::RateLimited { retry_after_ms } => {
                // Back off: extend consultation interval temporarily
                self.async_state.consultation_interval =
                    (self.async_state.consultation_interval * 2).min(1800); // max 60s
                log::info!("LLM rate limited — extending interval to {}",
                    self.async_state.consultation_interval);
            }
            _ => {
                self.consecutive_errors += 1;
            }
        }

        // After 5 consecutive errors, disable for remainder of match
        if self.consecutive_errors >= 5 {
            log::warn!("5 consecutive LLM errors — disabling for this match");
            self.provider_disabled = true;
        }
    }

    fn handle_parse_error(&mut self, error: ParseError, raw: &str) {
        match self.async_state.error_policy.malformed_strategy {
            MalformedStrategy::BestEffortParse => {
                // Try lenient extraction (§3.6 parse chain)
                if let Some(partial) = self.lenient_parse(raw) {
                    self.apply_strategic_plan(&partial);
                    self.current_plan = Some(partial);
                }
                // else: keep previous plan silently
            }
            MalformedStrategy::RepromptWithError { max_repair_attempts } => {
                if self.repair_attempts < max_repair_attempts {
                    self.repair_attempts += 1;
                    // Spawn repair prompt with error context
                    self.consult_llm_with_repair(raw, &error);
                }
            }
            MalformedStrategy::KeepPreviousPlan => {
                // Do nothing — inner AI continues with previous plan
            }
        }
    }
}
```

**Key principle:** Every error path ends with the inner AI playing normally. The LLM is purely additive — failure means "play without guidance," never "crash" or "hang."

### 2.2 Token Counting and Context Window Management

```rust
pub struct TokenBudget {
    pub context_window: u32,               // from LlmProvider::context_window() or configured
    pub reserved_for_response: u32,        // default: 600 tokens
    remaining: u32,
}

pub trait TokenEstimator: Send + Sync {
    fn estimate_tokens(&self, text: &str) -> u32;
}

/// Conservative: ~4 chars per token for English text.
/// Good enough for budget management. Not used for billing.
pub struct SimpleTokenEstimator;
impl TokenEstimator for SimpleTokenEstimator {
    fn estimate_tokens(&self, text: &str) -> u32 {
        (text.len() as u32 / 4).max(1)
    }
}

impl TokenBudget {
    pub fn for_provider(context_window: Option<u32>) -> Self {
        let window = context_window.unwrap_or(4096);
        Self {
            context_window: window,
            reserved_for_response: 600,
            remaining: window.saturating_sub(600),
        }
    }

    pub fn reserve(&mut self, tokens: u32) {
        self.remaining = self.remaining.saturating_sub(tokens);
    }

    /// Fit text into remaining budget. Truncates from the START (keeps recent content).
    pub fn fit_or_truncate(&mut self, text: &str) -> String {
        let estimator = SimpleTokenEstimator;
        let tokens = estimator.estimate_tokens(text);
        if tokens <= self.remaining {
            self.remaining -= tokens;
            text.to_string()
        } else {
            // Truncate from the start, keeping the most recent content
            let char_budget = (self.remaining as usize) * 4;
            let truncated = if text.len() > char_budget {
                let start = text.len() - char_budget;
                format!("[...truncated...]\n{}", &text[start..])
            } else {
                text.to_string()
            };
            self.remaining = 0;
            truncated
        }
    }
}
```

**Truncation priority in prompt assembly (§1.6):**
1. Skill context — truncated first (least time-sensitive)
2. Event narrative — truncated second (keep most recent events)
3. Game state — truncated last (always include resource levels and army counts)
4. System prompt — NEVER truncated

### 2.3 Credential Encryption

```rust
/// API key storage. Lives in ic-llm.
/// Keys encrypted at rest in SQLite llm_providers.api_key column.
pub struct CredentialStore {
    backend: CredentialBackend,
}

enum CredentialBackend {
    /// Primary: OS credential manager (Windows Credential Locker, macOS Keychain, Linux Secret Service)
    Keyring { service: String },
    /// Fallback: AES-256-GCM with machine-derived key
    Aes256Gcm { key: [u8; 32] },
}

impl CredentialStore {
    pub fn new() -> Self {
        // Try keyring first, fall back to AES
        match keyring::Entry::new("iron-curtain", "llm-master-key") {
            Ok(_) => Self { backend: CredentialBackend::Keyring { service: "iron-curtain".into() } },
            Err(_) => {
                // Derive key from machine-specific entropy
                let key = derive_machine_key(); // MAC + username + fixed salt → PBKDF2
                Self { backend: CredentialBackend::Aes256Gcm { key } }
            }
        }
    }

    pub fn store(&self, provider_id: i64, api_key: &str) -> Result<(), CredentialError> {
        match &self.backend {
            CredentialBackend::Keyring { service } => {
                let entry = keyring::Entry::new(service, &provider_id.to_string())?;
                entry.set_password(api_key)?;
                Ok(())
            }
            CredentialBackend::Aes256Gcm { key } => {
                let encrypted = aes_gcm_encrypt(key, api_key.as_bytes())?;
                // Store encrypted blob in SQLite
                Ok(())
            }
        }
    }

    pub fn retrieve(&self, provider_id: i64) -> Result<String, CredentialError> {
        // Reverse of store — decrypt from keyring or AES blob
        // Key lives in memory only while LlmProvider instance exists
        todo!()
    }
}
```

**Export safety (D047):** The `ic llm export` command and Workshop config sharing NEVER include `api_key`. The export serializer explicitly skips the column.

### 2.4 Rate Limiting

```rust
pub struct RateLimiter {
    pub per_minute_limit: u32,             // default: 20
    pub per_match_limit: u32,              // default: 200
    pub per_session_limit: u32,            // default: 1000
    pub token_budget_per_match: u32,       // default: 100_000
    minute_window: SlidingWindow,
    match_count: u32,
    session_count: u32,
    match_tokens: u32,
}

pub struct RateLimitExceeded {
    pub limit_name: &'static str,
    pub retry_after_ms: u64,
}

impl RateLimiter {
    pub fn try_acquire(&mut self, estimated_tokens: u32) -> Result<(), RateLimitExceeded> {
        if self.minute_window.count() >= self.per_minute_limit {
            return Err(RateLimitExceeded {
                limit_name: "per_minute",
                retry_after_ms: self.minute_window.time_until_next_slot(),
            });
        }
        if self.match_count >= self.per_match_limit {
            return Err(RateLimitExceeded { limit_name: "per_match", retry_after_ms: 0 });
        }
        if self.match_tokens + estimated_tokens > self.token_budget_per_match {
            return Err(RateLimitExceeded { limit_name: "token_budget", retry_after_ms: 0 });
        }

        self.minute_window.record();
        self.match_count += 1;
        self.session_count += 1;
        self.match_tokens += estimated_tokens;
        Ok(())
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self {
            per_minute_limit: 20,
            per_match_limit: 200,
            per_session_limit: 1000,
            token_budget_per_match: 100_000,
            minute_window: SlidingWindow::new(60_000), // 60s window
            match_count: 0,
            session_count: 0,
            match_tokens: 0,
        }
    }
}
```

When rate limited, `LlmOrchestratorAi` extends `consultation_interval` (backs off gracefully). The D047 LLM Manager UI shows a rate limit indicator when active.

### 2.5 SituationSignature Matching

```rust
impl SituationSignature {
    /// Weighted similarity score (0.0–1.0) between two game situations.
    /// Used to re-rank skill candidates after FTS5/embedding initial retrieval.
    pub fn similarity(&self, other: &SituationSignature) -> f32 {
        let mut score = 0.0f32;
        let mut weight_total = 0.0f32;

        // Game phase: exact=1.0, adjacent=0.5, distant=0.0 (weight: 3)
        let phase_score = if self.game_phase == other.game_phase {
            1.0
        } else if self.game_phase.distance(other.game_phase) == 1 {
            0.5
        } else {
            0.0
        };
        score += phase_score * 3.0;
        weight_total += 3.0;

        // Economy state: exact=1.0, adjacent=0.5 (weight: 2)
        let econ_score = if self.economy_state == other.economy_state {
            1.0
        } else if self.economy_state.distance(other.economy_state) == 1 {
            0.5
        } else {
            0.0
        };
        score += econ_score * 2.0;
        weight_total += 2.0;

        // Army composition: Jaccard similarity on unit type sets (weight: 2)
        let self_types: HashSet<&str> = self.army_composition.iter().map(|(t, _)| t.as_str()).collect();
        let other_types: HashSet<&str> = other.army_composition.iter().map(|(t, _)| t.as_str()).collect();
        let intersection = self_types.intersection(&other_types).count() as f32;
        let union = self_types.union(&other_types).count() as f32;
        let army_score = if union > 0.0 { intersection / union } else { 1.0 };
        score += army_score * 2.0;
        weight_total += 2.0;

        // Map control: continuous distance (weight: 1)
        let control_score = 1.0 - (self.map_control as f32 - other.map_control as f32).abs() / 100.0;
        score += control_score.max(0.0) * 1.0;
        weight_total += 1.0;

        // Threat level: ordinal distance (weight: 2)
        let threat_score = 1.0 - (self.threat_level.ordinal() as f32
            - other.threat_level.ordinal() as f32).abs() / 3.0;
        score += threat_score.max(0.0) * 2.0;
        weight_total += 2.0;

        score / weight_total
    }
}

impl SkillRetriever {
    /// Retrieve top-K skills matching a situation. Two-tier strategy (D057):
    /// 1. FTS5 keyword search (always available, offline)
    /// 2. Optional embedding similarity (if embedding provider configured)
    /// 3. Re-rank by SituationSignature similarity
    pub fn retrieve_for_situation(
        &self,
        situation: &SituationSignature,
        domain: SkillDomain,
        top_k: usize,
    ) -> Vec<Skill> {
        // Initial retrieval: FTS5 or embedding (10 candidates)
        let query = situation.to_search_query(); // "early_game anti_armor economy_ahead"
        let candidates = self.fts_search(&query, domain, 10);

        // Re-rank by situation similarity
        let mut scored: Vec<(f32, Skill)> = candidates.into_iter()
            .filter_map(|skill| {
                let sig = skill.body.situation_signature()?;
                Some((situation.similarity(sig), skill))
            })
            .collect();
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

        scored.into_iter().take(top_k).map(|(_, s)| s).collect()
    }
}
```

### 2.6 Provider Registration

```rust
/// Factory for constructing LlmProvider instances from D047 config.
pub struct ProviderFactory {
    factories: HashMap<String, Box<dyn Fn(ProviderConfig) -> Result<Box<dyn LlmProvider>, LlmError>>>,
}

pub struct ProviderConfig {
    pub provider_type: String,
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,    // decrypted, in memory only
    pub extra: HashMap<String, String>,
}

impl ProviderFactory {
    pub fn with_builtins() -> Self {
        let mut factory = Self { factories: HashMap::new() };
        factory.register("ollama", |cfg| Ok(Box::new(OllamaProvider::new(cfg))));
        factory.register("openai", |cfg| Ok(Box::new(OpenAiProvider::new(cfg))));
        factory.register("anthropic", |cfg| Ok(Box::new(AnthropicProvider::new(cfg))));
        factory.register("openai-compatible", |cfg| Ok(Box::new(OpenAiProvider::new(cfg))));
        factory
    }

    pub fn register(&mut self, type_name: &str,
        f: impl Fn(ProviderConfig) -> Result<Box<dyn LlmProvider>, LlmError> + 'static,
    ) {
        self.factories.insert(type_name.to_string(), Box::new(f));
    }

    pub fn create(&self, config: ProviderConfig) -> Result<Box<dyn LlmProvider>, LlmError> {
        let factory = self.factories.get(&config.provider_type)
            .ok_or(LlmError::ProviderUnavailable(
                format!("Unknown provider type: {}", config.provider_type)
            ))?;
        factory(config)
    }
}
```

WASM plugin extension: a future WASM mod can register a custom provider type via `factory.register("my_provider", ...)` through the plugin bridge. The factory pattern is deliberately simple — it's a closure map, not a complex registry.

---

## 3. Working Prototype — Ollama + Orchestrator

### 3.1 Prerequisites

- **Ollama** installed with any model supporting JSON mode (e.g., `ollama pull llama3.2:8b`)
- **Rust dependencies:** `reqwest`, `tokio`, `serde`, `serde_json`
- No full IC engine needed — the test harness uses mock game state

### 3.2 OllamaProvider Implementation

```rust
pub struct OllamaProvider {
    endpoint: String,
    model: String,
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            endpoint: config.endpoint,
            model: config.model,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn chat_complete(&self, request: LlmRequest) -> Result<LlmResponse, LlmError> {
        let url = format!("{}/api/chat", self.endpoint);
        let start = std::time::Instant::now();

        let messages: Vec<serde_json::Value> = request.messages.iter().map(|m| {
            serde_json::json!({
                "role": match m.role { Role::System => "system", Role::User => "user", Role::Assistant => "assistant" },
                "content": &m.content,
            })
        }).collect();

        let body = serde_json::json!({
            "model": &self.model,
            "messages": messages,
            "stream": false,
            "format": "json",
            "options": {
                "temperature": request.temperature.unwrap_or(0.7),
                "num_predict": request.max_tokens.unwrap_or(500),
            }
        });

        let response = self.client.post(&url)
            .json(&body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() { LlmError::Timeout(30_000) }
                else { LlmError::NetworkError(e.to_string()) }
            })?;

        if !response.status().is_success() {
            return Err(LlmError::ProviderUnavailable(
                format!("Ollama returned HTTP {}", response.status())
            ));
        }

        let json: serde_json::Value = response.json().await
            .map_err(|e| LlmError::MalformedResponse(e.to_string()))?;

        let content = json["message"]["content"].as_str()
            .ok_or(LlmError::MalformedResponse("No message.content in response".into()))?
            .to_string();

        Ok(LlmResponse {
            content,
            model: json["model"].as_str().unwrap_or("unknown").to_string(),
            tokens_used: json["eval_count"].as_u64().map(|t| t as u32),
            latency_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn health_check(&self) -> Result<ProviderStatus, LlmError> {
        let url = format!("{}/api/tags", self.endpoint);
        let resp = self.client.get(&url).timeout(std::time::Duration::from_secs(5))
            .send().await.map_err(|e| LlmError::NetworkError(e.to_string()))?;
        Ok(ProviderStatus { connected: resp.status().is_success(), model_loaded: true, latency_ms: None })
    }

    fn display_name(&self) -> &str { "Local Ollama" }
    fn provider_type(&self) -> ProviderType { ProviderType::Ollama }
    fn context_window(&self) -> Option<u32> { Some(8192) } // llama3.2 default
}
```

### 3.2b OpenAiProvider Implementation (ChatGPT, GPT-4o, and Compatible APIs)

Covers OpenAI, Azure OpenAI, Groq, Together.ai, OpenRouter, and any service exposing the `/v1/chat/completions` endpoint. The same struct handles all of these — the only differences are `endpoint` and `api_key`.

```rust
pub struct OpenAiProvider {
    endpoint: String,       // "https://api.openai.com/v1" or compatible
    model: String,          // "gpt-4o-mini", "gpt-4o", "llama-3.1-70b-versatile", etc.
    api_key: String,        // from CredentialStore, in memory only
    client: reqwest::Client,
    context_window_override: Option<u32>,
}

impl OpenAiProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            endpoint: config.endpoint.trim_end_matches('/').to_string(),
            model: config.model,
            api_key: config.api_key.unwrap_or_default(),
            client: reqwest::Client::new(),
            context_window_override: config.extra.get("context_window")
                .and_then(|v| v.parse().ok()),
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn chat_complete(&self, request: LlmRequest) -> Result<LlmResponse, LlmError> {
        let url = format!("{}/chat/completions", self.endpoint);
        let start = std::time::Instant::now();

        let messages: Vec<serde_json::Value> = request.messages.iter().map(|m| {
            serde_json::json!({
                "role": match m.role { Role::System => "system", Role::User => "user", Role::Assistant => "assistant" },
                "content": &m.content,
            })
        }).collect();

        let mut body = serde_json::json!({
            "model": &self.model,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(500),
        });

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if !request.stop_sequences.is_empty() {
            body["stop"] = serde_json::json!(request.stop_sequences);
        }
        if matches!(request.response_format, ResponseFormat::Json) {
            body["response_format"] = serde_json::json!({"type": "json_object"});
        }

        let response = self.client.post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() { LlmError::Timeout(30_000) }
                else { LlmError::NetworkError(e.to_string()) }
            })?;

        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(LlmError::AuthError("Invalid API key".into()));
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = response.headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(5000);
            return Err(LlmError::RateLimited { retry_after_ms: retry_after * 1000 });
        }
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(LlmError::ProviderUnavailable(format!("HTTP {} — {}", status, body)));
        }

        let json: serde_json::Value = response.json().await
            .map_err(|e| LlmError::MalformedResponse(e.to_string()))?;

        let content = json["choices"][0]["message"]["content"].as_str()
            .ok_or(LlmError::MalformedResponse("No choices[0].message.content".into()))?
            .to_string();

        let tokens_used = json["usage"]["total_tokens"].as_u64().map(|t| t as u32);

        Ok(LlmResponse {
            content,
            model: json["model"].as_str().unwrap_or(&self.model).to_string(),
            tokens_used,
            latency_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn health_check(&self) -> Result<ProviderStatus, LlmError> {
        // OpenAI has no /health — try a minimal completion
        let request = LlmRequest {
            messages: vec![ChatMessage { role: Role::User, content: "Say OK".into() }],
            temperature: Some(0.0),
            max_tokens: Some(5),
            stop_sequences: vec![],
            response_format: ResponseFormat::Text,
        };
        self.chat_complete(request).await?;
        Ok(ProviderStatus { connected: true, model_loaded: true, latency_ms: None })
    }

    fn display_name(&self) -> &str { "OpenAI Compatible" }
    fn provider_type(&self) -> ProviderType { ProviderType::OpenAiCompatible }
    fn context_window(&self) -> Option<u32> {
        self.context_window_override.or(Some(128_000)) // GPT-4o default
    }
}
```

**Compatible services using this exact provider (only `endpoint` and `model` differ):**

| Service | `endpoint` | Example `model` | Notes |
|---------|-----------|-----------------|-------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Cheapest good option |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` | Best quality |
| Azure OpenAI | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` | `gpt-4o` | Enterprise |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` | Very fast inference |
| Together.ai | `https://api.together.xyz/v1` | `meta-llama/Llama-3.1-70B-Instruct-Turbo` | Open models on cloud |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4` | Multi-provider router |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p1-70b-instruct` | Fast open models |

### 3.2c AnthropicProvider Implementation (Claude)

Anthropic uses a different API format (`/v1/messages` instead of `/v1/chat/completions`), so it needs its own implementation.

```rust
pub struct AnthropicProvider {
    api_key: String,
    model: String,          // "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            api_key: config.api_key.unwrap_or_default(),
            model: config.model,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn chat_complete(&self, request: LlmRequest) -> Result<LlmResponse, LlmError> {
        let url = "https://api.anthropic.com/v1/messages";
        let start = std::time::Instant::now();

        // Anthropic separates system prompt from messages
        let system_prompt = request.messages.iter()
            .find(|m| matches!(m.role, Role::System))
            .map(|m| m.content.clone());

        let messages: Vec<serde_json::Value> = request.messages.iter()
            .filter(|m| !matches!(m.role, Role::System))
            .map(|m| serde_json::json!({
                "role": match m.role { Role::User => "user", Role::Assistant => "assistant", _ => "user" },
                "content": &m.content,
            }))
            .collect();

        let mut body = serde_json::json!({
            "model": &self.model,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(500),
        });

        if let Some(sys) = &system_prompt {
            body["system"] = serde_json::json!(sys);
        }
        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if !request.stop_sequences.is_empty() {
            body["stop_sequences"] = serde_json::json!(request.stop_sequences);
        }

        let response = self.client.post(url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() { LlmError::Timeout(60_000) }
                else { LlmError::NetworkError(e.to_string()) }
            })?;

        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(LlmError::AuthError("Invalid Anthropic API key".into()));
        }
        if status.as_u16() == 429 {
            return Err(LlmError::RateLimited { retry_after_ms: 10_000 });
        }
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(LlmError::ProviderUnavailable(format!("HTTP {} — {}", status, body)));
        }

        let json: serde_json::Value = response.json().await
            .map_err(|e| LlmError::MalformedResponse(e.to_string()))?;

        // Anthropic returns content as array of blocks
        let content = json["content"][0]["text"].as_str()
            .ok_or(LlmError::MalformedResponse("No content[0].text".into()))?
            .to_string();

        let input_tokens = json["usage"]["input_tokens"].as_u64().unwrap_or(0);
        let output_tokens = json["usage"]["output_tokens"].as_u64().unwrap_or(0);

        Ok(LlmResponse {
            content,
            model: json["model"].as_str().unwrap_or(&self.model).to_string(),
            tokens_used: Some((input_tokens + output_tokens) as u32),
            latency_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn health_check(&self) -> Result<ProviderStatus, LlmError> {
        let request = LlmRequest {
            messages: vec![ChatMessage { role: Role::User, content: "Say OK".into() }],
            temperature: Some(0.0),
            max_tokens: Some(5),
            stop_sequences: vec![],
            response_format: ResponseFormat::Text,
        };
        self.chat_complete(request).await?;
        Ok(ProviderStatus { connected: true, model_loaded: true, latency_ms: None })
    }

    fn display_name(&self) -> &str { "Anthropic Claude" }
    fn provider_type(&self) -> ProviderType { ProviderType::Anthropic }
    fn context_window(&self) -> Option<u32> { Some(200_000) } // Claude Sonnet 4 default
}
```

### 3.2d Google Gemini via OpenAI-Compatible Endpoint

Google Gemini exposes an OpenAI-compatible endpoint — use `OpenAiProvider` directly:

| Setting | Value |
|---------|-------|
| `endpoint` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `model` | `gemini-2.0-flash` or `gemini-2.5-pro` |
| `api_key` | Google AI Studio API key |

No separate provider implementation needed.

### 3.3 Complete System Prompt

This is the full orchestrator system prompt, stored in `llm/prompts/orchestrator.yaml` as mod-data:

```yaml
# llm/prompts/orchestrator.yaml
# Moddable — game modules can override this for different RTS games.
orchestrator:
  system_prompt: |
    You are a strategic advisor for a Red Alert RTS AI player. You analyze the
    current game state and provide high-level strategic guidance.

    Your role:
    - Decide what to build (unit composition priorities)
    - Recommend where to attack or defend
    - Guide economic decisions (expand? protect harvesters?)
    - Assess the threat level and recommend posture

    You will receive the current game state as structured data. Respond with
    valid JSON matching the schema below. No markdown, no code blocks, no
    preamble — ONLY the JSON object.

    Response schema:
    {
      "priority_targets": [
        {
          "description": "what to do and why",
          "target_type": "unit_group | structure | zone",
          "location_hint": "compass direction or landmark",
          "urgency": "immediate | soon | when_ready"
        }
      ],
      "build_focus": {
        "unit_priority": "anti_armor | anti_air | infantry_mass | balanced | naval",
        "structure_priority": "defense | economy | tech_up | production",
        "specific_units": ["unit_type_1", "unit_type_2"]
      },
      "economic_guidance": {
        "expand": true or false,
        "protect_harvesters": true or false,
        "target_income": "maximize | sufficient | minimal"
      },
      "risk_assessment": {
        "threat_level": "low | medium | high | critical",
        "expected_attack_direction": "direction or null",
        "defensive_posture": "aggressive | balanced | defensive | turtle",
        "time_pressure": "none | moderate | urgent"
      },
      "reasoning": "2-4 sentences explaining your strategic thinking."
    }

    Rules:
    - Only use information from the game state provided.
    - Do not invent enemy units or structures not listed.
    - Be specific about locations and unit types.
    - Respond ONLY with the JSON object.
  max_tokens: 500
  temperature: 0.7
```

### 3.4 Complete User Prompt (Example Game State)

From `llm-generation-schemas.md` §9, formatted as the user message:

```
game_state:
  tick: 9000
  game_time_seconds: 300

  resources:
    credits: 4200
    ore_income_rate: 85
    power_balance: +50

  own_units:
    rifle_infantry: 24
    rocket_infantry: 8
    medium_tank: 6
    heavy_tank: 3
    v2_launcher: 2
    ore_truck: 3
    mig: 4

  own_structures:
    construction_yard: 1
    power_plant: 4
    ore_refinery: 2
    barracks: 1
    war_factory: 1
    airfield: 1
    tesla_coil: 3

  visible_enemies:
    units:
      - type: medium_tank, count: 4, location: "north_east, near ore field"
      - type: rifle_infantry, count: 12, location: "central choke, dug in"
      - type: artillery, count: 2, location: "behind central ridge"
    estimated_value: 8400

  enemy_structures_known:
    - construction_yard at north_west (seen tick 3000)
    - war_factory at north_west (seen tick 3000)
    - ore_refinery at north_east (seen tick 6000)

  recent_events: |
    Tick 7200: Enemy tanks spotted moving south through central passage.
    Tick 7500: Our tesla coil engaged 3 enemy tanks — destroyed 1, damaged 2.
    Tick 7800: Enemy artillery shelling our eastern ore refinery.
    Tick 8100: Our MiGs destroyed enemy ore truck near their expansion.
    Tick 8400: Enemy infantry infiltrating through western forest.
    Tick 8900: Enemy massing units north of central choke point.

  current_plan:
    build_focus: "Anti-armor"
    risk_assessment: "Enemy preparing major push through central choke"
    plan_age_ticks: 300
```

### 3.5 Expected JSON Response

```json
{
  "priority_targets": [
    {
      "description": "Destroy the enemy artillery shelling our eastern refinery",
      "target_type": "unit_group",
      "location_hint": "behind central ridge",
      "urgency": "immediate"
    },
    {
      "description": "Raid the enemy ore refinery to cripple their economy",
      "target_type": "structure",
      "location_hint": "north_east near ore field",
      "urgency": "soon"
    }
  ],
  "build_focus": {
    "unit_priority": "anti_armor",
    "structure_priority": "defense",
    "specific_units": ["heavy_tank", "v2_launcher"]
  },
  "economic_guidance": {
    "expand": false,
    "protect_harvesters": true,
    "target_income": "sufficient"
  },
  "risk_assessment": {
    "threat_level": "high",
    "expected_attack_direction": "central choke point",
    "defensive_posture": "balanced",
    "time_pressure": "moderate"
  },
  "reasoning": "The enemy artillery is actively damaging our economy and must be neutralized first. A central push is imminent based on the massing. Our air superiority (4 MiGs vs no visible AA) should be used against high-value targets like the artillery and refinery. Do not over-commit to the western infantry — it is likely a diversion."
}
```

### 3.6 Robust StrategicPlan Parser

```rust
/// Parse LLM response into StrategicPlan. Three-tier fallback chain.
fn parse_strategic_plan(response: &str) -> Result<StrategicPlan, ParseError> {
    // Try 1: direct JSON parse
    if let Ok(plan) = serde_json::from_str::<StrategicPlan>(response) {
        return Ok(plan);
    }

    // Try 2: extract JSON from markdown code block (```json ... ```)
    if let Some(json_block) = extract_json_block(response) {
        if let Ok(plan) = serde_json::from_str::<StrategicPlan>(json_block) {
            return Ok(plan);
        }
    }

    // Try 3: lenient parse — extract fields with defaults
    let value: serde_json::Value = serde_json::from_str(response)
        .map_err(|e| ParseError::NoValidJson(e.to_string()))?;

    Ok(StrategicPlan {
        priority_targets: value.get("priority_targets")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default(),
        build_focus: value.get("build_focus")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or(BuildFocus {
                unit_priority: "balanced".into(),
                structure_priority: "production".into(),
                specific_units: vec![],
            }),
        economic_guidance: value.get("economic_guidance")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or(EconomicGuidance {
                expand: false,
                protect_harvesters: true,
                target_income: "sufficient".into(),
            }),
        risk_assessment: value.get("risk_assessment")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or(RiskAssessment {
                threat_level: "medium".into(),
                expected_attack_direction: None,
                defensive_posture: "balanced".into(),
                time_pressure: "none".into(),
            }),
        tactical_notes: value.get("tactical_notes")
            .and_then(|v| v.as_str()).map(String::from),
        reasoning: value.get("reasoning")
            .and_then(|v| v.as_str())
            .unwrap_or("(no reasoning provided)")
            .to_string(),
    })
}

fn extract_json_block(text: &str) -> Option<&str> {
    let start = text.find("```json").map(|i| i + 7)
        .or_else(|| text.find("```").map(|i| i + 3))?;
    let end = text[start..].find("```").map(|i| start + i)?;
    Some(text[start..end].trim())
}
```

### 3.7 Parameter Mapping

```rust
/// Translate StrategicPlan into set_parameter() calls on the inner AI.
/// From D044 mapping table + llm-generation-schemas.md §9.3.
fn apply_strategic_plan(inner: &mut dyn AiStrategy, plan: &StrategicPlan) {
    // Build focus → production parameters
    match plan.build_focus.unit_priority.as_str() {
        "anti_armor" => {
            inner.set_parameter("tech_priority_armor", 80);
            inner.set_parameter("tech_priority_aa", 20);
        }
        "anti_air" => {
            inner.set_parameter("tech_priority_aa", 80);
            inner.set_parameter("tech_priority_armor", 30);
        }
        "infantry_mass" => {
            inner.set_parameter("infantry_ratio", 70);
            inner.set_parameter("vehicle_ratio", 20);
        }
        "naval" => {
            inner.set_parameter("naval_priority", 80);
        }
        _ => { /* "balanced" — no parameter changes */ }
    }

    // Threat level → aggression
    match plan.risk_assessment.threat_level.as_str() {
        "low"      => inner.set_parameter("aggression", 70),
        "medium"   => inner.set_parameter("aggression", 50),
        "high"     => inner.set_parameter("aggression", 30),
        "critical" => inner.set_parameter("aggression", 15),
        _ => {}
    }

    // Defensive posture
    match plan.risk_assessment.defensive_posture.as_str() {
        "aggressive" => inner.set_parameter("defense_ratio", 20),
        "balanced"   => inner.set_parameter("defense_ratio", 40),
        "defensive"  => inner.set_parameter("defense_ratio", 65),
        "turtle"     => inner.set_parameter("defense_ratio", 85),
        _ => {}
    }

    // Economic guidance
    inner.set_parameter("expansion_priority", if plan.economic_guidance.expand { 80 } else { 15 });
    inner.set_parameter("harvester_defense", if plan.economic_guidance.protect_harvesters { 70 } else { 30 });

    // Priority targets → attack coordinates (first target only for MVP)
    if let Some(target) = plan.priority_targets.first() {
        // Location hint → approximate coordinates (game-module-specific translation)
        // For MVP: just set the attack direction
        if let Some(dir) = &plan.risk_assessment.expected_attack_direction {
            inner.set_parameter("watch_direction", direction_to_param(dir));
        }
    }
}
```

### 3.8 Complete Test Harness

```rust
/// Standalone test harness — run with: cargo run --example byollm_prototype
/// Requires: Ollama running on localhost:11434 with a model that supports JSON mode.
#[tokio::main]
async fn main() {
    // 1. Create provider
    let provider = OllamaProvider::new(ProviderConfig {
        provider_type: "ollama".into(),
        endpoint: "http://localhost:11434".into(),
        model: "llama3.2:8b".into(),
        api_key: None,
        extra: HashMap::new(),
    });

    // Health check
    match provider.health_check().await {
        Ok(status) => println!("Provider ready: connected={}", status.connected),
        Err(e) => { eprintln!("Provider unavailable: {:?}", e); return; }
    }

    // 2. Load system prompt
    let system_prompt = include_str!("../llm/prompts/orchestrator_system.txt");

    // 3. Simulate 10 consultations
    let mut tick: u64 = 9000;
    let mut total_latency_ms: u64 = 0;
    let mut successes: u32 = 0;
    let mut failures: u32 = 0;

    for i in 1..=10 {
        println!("\n=== Consultation {}/10 (tick {}) ===", i, tick);

        // Build game state (mutate slightly each iteration to simulate progression)
        let game_state = build_mock_game_state(tick, i);

        let request = LlmRequest {
            messages: vec![
                ChatMessage { role: Role::System, content: system_prompt.to_string() },
                ChatMessage { role: Role::User, content: game_state },
            ],
            temperature: Some(0.7),
            max_tokens: Some(500),
            stop_sequences: vec![],
            response_format: ResponseFormat::Json,
        };

        // Call LLM
        match provider.chat_complete(request).await {
            Ok(response) => {
                total_latency_ms += response.latency_ms;
                match parse_strategic_plan(&response.content) {
                    Ok(plan) => {
                        successes += 1;
                        println!("  Latency: {}ms | Tokens: {:?}", response.latency_ms, response.tokens_used);
                        println!("  Focus: {} | Threat: {} | Expand: {}",
                            plan.build_focus.unit_priority,
                            plan.risk_assessment.threat_level,
                            plan.economic_guidance.expand);
                        println!("  Targets: {}", plan.priority_targets.len());
                        println!("  Reasoning: {}", &plan.reasoning[..plan.reasoning.len().min(120)]);
                    }
                    Err(e) => {
                        failures += 1;
                        println!("  Parse error: {:?}", e);
                        println!("  Raw (first 200 chars): {}", &response.content[..response.content.len().min(200)]);
                    }
                }
            }
            Err(e) => {
                failures += 1;
                println!("  LLM error: {:?}", e);
                println!("  Inner AI would continue with previous plan.");
            }
        }

        tick += 300; // simulate 10 seconds between consultations
    }

    // Summary
    println!("\n=== Summary ===");
    println!("Consultations: 10 | Successes: {} | Failures: {}", successes, failures);
    println!("Avg latency: {}ms", if successes > 0 { total_latency_ms / successes as u64 } else { 0 });
    println!("Parse success rate: {}%", successes * 10);
}

fn build_mock_game_state(tick: u64, iteration: u32) -> String {
    // Simulate game progression: more units, more scouting data each iteration
    let tanks = 6 + iteration;
    let credits = 4200 - (iteration as i32 * 200); // spending resources
    let enemy_tanks = 4 + iteration / 2;

    format!(r#"game_state:
  tick: {tick}
  game_time_seconds: {time}
  resources:
    credits: {credits}
    ore_income_rate: 85
    power_balance: +50
  own_units:
    medium_tank: {tanks}
    heavy_tank: 3
    mig: 4
    rifle_infantry: 24
    ore_truck: 3
  own_structures:
    construction_yard: 1
    ore_refinery: 2
    war_factory: 1
    airfield: 1
    tesla_coil: 3
  visible_enemies:
    units:
      - type: medium_tank, count: {enemy_tanks}, location: "north_east"
      - type: artillery, count: 2, location: "behind central ridge"
  recent_events: |
    Tick {prev}: Enemy tanks spotted moving south.
    Tick {tick}: Our tesla coils engaged enemy armor.
  current_plan:
    build_focus: "Anti-armor"
    plan_age_ticks: 300"#,
        tick = tick,
        time = tick / 30,
        credits = credits.max(0),
        tanks = tanks,
        enemy_tanks = enemy_tanks,
        prev = tick - 300,
    )
}
```

---

## 4. Implementation Roadmap

### Dependency DAG

```
Phase 1 (MVP)
  ↓
Phase 2 (Async + Errors)
  ↓         ↓
Phase 3     Phase 5
(Providers) (LlmPlayer)
  ↓
Phase 4 (Skill Library)
  ↓
Phase 6 (Profiles + Probing)
```

### Phase 1: MVP — "LLM Talks to Game" (2–3 weeks)

**Build real:**
- `LlmProvider` trait + `LlmRequest`/`LlmResponse`/`LlmError` types
- `OllamaProvider` implementation (§3.2)
- Prompt assembly for orchestrator (single YAML template)
- `parse_strategic_plan()` with 3-tier fallback (§3.6)
- `apply_strategic_plan()` parameter mapping (§3.7)
- Test harness (§3.8)

**Stub:**
- `ProviderRegistry` — hardcode single Ollama provider
- `TaskRouter` — hardcode "ai_orchestrator" → Ollama
- `RateLimiter` — no limits
- `SkillRetriever` — no skill library
- `CredentialStore` — plaintext (Ollama has no API key)

**Test strategy:**
- Unit: prompt assembly produces valid text
- Unit: JSON parser handles well-formed, malformed, and partial responses
- Unit: parameter mapping produces expected set_parameter() calls
- Integration: actual Ollama call (`#[ignore]` — requires running Ollama)
- Mock: canned responses → verify full parse → apply chain

**Exit criteria:** Test harness runs 10 consultations against Ollama, prints strategic plans, parse success rate > 80%.

### Phase 2: Async Integration + Error Handling (1–2 weeks)

**Build real:**
- `LlmAsyncState` with `Task<Result<LlmResponse, LlmError>>`
- `consult_llm()` spawning on `AsyncComputeTaskPool` (§1.3)
- Non-blocking `poll_consultation()` in `decide()` (§1.3)
- `LlmErrorPolicy` + full error handling chain (§2.1)
- `RateLimiter` with per-minute and per-match limits (§2.4)
- `TokenBudget` + `SimpleTokenEstimator` (§2.2)

**Test strategy:**
- Mock provider with configurable latency → verify non-blocking behavior
- Mock provider that times out → verify inner AI continues
- Mock provider that returns errors → verify graceful degradation
- Mock provider that returns malformed JSON → verify 3-tier parse fallback
- Rate limiter stress test: rapid calls → verify limiting

**Exit criteria:** Orchestrator AI runs in simulated game loop, LLM calls are non-blocking, all error paths end with inner AI playing.

### Phase 3: Provider Management + Multiple Providers (1–2 weeks)

**Build real:**
- `ProviderFactory` with built-in registrations (§2.6)
- `ProviderRegistry` loading from SQLite
- `TaskRouter` reading from D047 tables (§1.4)
- `CredentialStore` with keyring backend (§2.3)
- `OpenAiProvider` (OpenAI-compatible endpoints)
- D047 SQLite tables: `llm_providers`, `llm_task_routing`, `llm_prompt_profiles`

**Stub:**
- D047 UI — use CLI/config file to add providers
- Capability probing — manual profile selection

**Test strategy:**
- SQLite round-trip: write provider config → read → construct provider
- Multi-provider routing: mock providers for different tasks
- Credential encryption round-trip: store → retrieve → verify match
- Provider factory: construct from config, handle unknown type gracefully

**Exit criteria:** Two providers (Ollama + OpenAI-compatible) configured via SQLite, task routing works, API keys encrypted.

### Phase 4: Skill Library + Situation Matching (2–3 weeks)

**Build real:**
- D057 SQLite tables (`skills`, `skills_fts`, `skill_embeddings`, `skill_compositions`)
- `Skill` storage and retrieval
- FTS5 keyword search
- `SituationSignature::similarity()` (§2.5)
- `SkillRetriever` with prompt augmentation (§1.6)
- Skill verification pipeline: match outcome → candidate → established → proven
- CLI: `ic skill list`, `ic skill show`, `ic skill verify`, `ic skill export`

**Stub:**
- Embedding similarity (FTS5 only)
- Workshop sharing
- Skill composition tracking

**Dependencies:** Phase 2 (async infrastructure for verification)

**Test strategy:**
- Unit: SituationSignature similarity scoring
- Unit: FTS5 retrieval against seeded skill corpus
- Integration: play 5 games → verify skill candidates created → verify retrieval augments prompts
- CLI smoke test: list/show/export/import round trip

**Exit criteria:** Skills accumulate from gameplay, retrieved skills appear in prompts, verification promotes candidates.

### Phase 5: LlmPlayerAi + Exhibition Modes (2 weeks)

**Build real:**
- `LlmPlayerAi` — direct `PlayerOrder` emission from LLM responses
- Order batching and drip-feed (1–3 orders per tick until batch exhausted)
- D073 exhibition mode policy labels
- Replay annotation: LLM reasoning text recorded to replay metadata

**Dependencies:** Phase 2 (reuses async infrastructure)

**Test strategy:**
- Mock LLM returns order batches → verify drip-feed pacing
- Exhibition mode labels visible in replay metadata
- Ranked mode correctly rejects LlmPlayerAi

**Exit criteria:** LlmPlayerAi plays a complete game via Ollama, replay records reasoning.

### Phase 6: Prompt Profiles + Capability Probing (1–2 weeks)

**Build real:**
- `PromptStrategyProfile` selection logic (D047)
- Built-in profiles: CloudRich, CloudStructuredJson, LocalCompact, LocalStructured, LocalStepwise
- Capability probing: chat template test, JSON reliability test, context window estimate
- Auto-selection: probe results → best profile for model

**Dependencies:** Phase 3 (multi-provider infrastructure)

**Test strategy:**
- Probe against real Ollama model → verify structured JSON test passes
- Profile selection: probe results → verify correct profile chosen
- Regression: ensure existing test harness still works with auto-selected profile

**Exit criteria:** Capability probe runs, auto-selects appropriate profile, user can override.

---

## Sources

- D016: `src/decisions/09f/D016-llm-missions.md`
- D044: `src/decisions/09d/D044-llm-ai.md`
- D047: `src/decisions/09f/D047-llm-config.md`
- D057: `src/decisions/09f/D057-llm-skill-library.md`
- D073: `src/decisions/09d/D073-llm-exhibition-modes.md`
- LLM generation schemas: `research/llm-generation-schemas.md`
- Netcode integration proof pattern: `src/03-NETCODE.md` § System Wiring
