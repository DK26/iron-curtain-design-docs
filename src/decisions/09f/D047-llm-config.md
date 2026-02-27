## D047: LLM Configuration Manager — Provider Management & Community Sharing

**Status:** Accepted
**Scope:** `ic-ui`, `ic-llm`, `ic-game`
**Phase:** Phase 7 (ships with LLM features)

### The Problem

D016 established the BYOLLM architecture: users configure an `LlmProvider` (endpoint, API key, model name) in settings. But as LLM features expand across the engine — mission generation (D016), coaching (D042), AI orchestrator (D044), asset generation (D040) — managing provider configurations becomes non-trivial. Users may want:

- Multiple providers configured simultaneously (local Ollama for AI orchestrator speed, cloud API for high-quality mission generation)
- Task-specific routing (use a cheap model for real-time AI, expensive model for campaign generation)
- Sharing working configurations with the community (without sharing API keys)
- Discovering which models work well for which IC features
- Different prompt/inference strategies for local vs cloud models (or even model-family-specific behavior)
- Capability probing to detect JSON/tool-call reliability, context limits, and template quirks before assigning a provider to a task
- An achievement for configuring and using LLM features (engagement incentive)

### Decision

Provide a dedicated **LLM Manager** UI screen, a community-shareable configuration format for LLM provider setups, and a provider/model-aware **Prompt Strategy Profile** system with optional capability probing and task-level overrides.

### LLM Manager UI

Accessible from Settings → LLM Providers:

```
┌─────────────────────────────────────────────────────────┐
│  LLM Providers                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [+] Add Provider                                       │
│                                                         │
│  ┌─ Local Ollama (llama3.2) ──────── ✓ Active ───────┐ │
│  │  Endpoint: http://localhost:11434                   │ │
│  │  Model: llama3.2:8b                                │ │
│  │  Prompt Mode: Auto → Local-Compact (probed)        │ │
│  │  Assigned to: AI Orchestrator, Quick coaching       │ │
│  │  Avg latency: 340ms  │  Status: ● Connected        │ │
│  │  [Probe] [Test] [Edit] [Remove]                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ OpenAI API (GPT-4o) ───────── ✓ Active ──────────┐ │
│  │  Endpoint: https://api.openai.com/v1               │ │
│  │  Model: gpt-4o                                     │ │
│  │  Prompt Mode: Auto → Cloud-Rich                    │ │
│  │  Assigned to: Mission generation, Campaign briefings│ │
│  │  Avg latency: 1.2s   │  Status: ● Connected        │ │
│  │  [Probe] [Test] [Edit] [Remove]                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ Anthropic API (Claude) ────── ○ Inactive ─────────┐ │
│  │  Endpoint: https://api.anthropic.com/v1            │ │
│  │  Model: claude-sonnet-4-20250514                          │ │
│  │  Assigned to: (none)                               │ │
│  │  [Test] [Edit] [Remove] [Activate]                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  Task Routing:                                          │
│  ┌──────────────────────┬──────────────────────────┐    │
│  │ Task                 │ Provider / Strategy      │    │
│  ├──────────────────────┼──────────────────────────┤    │
│  │ AI Orchestrator      │ Local Ollama / Compact   │    │
│  │ Mission Generation   │ OpenAI / Cloud-Rich      │    │
│  │ Campaign Briefings   │ OpenAI / Cloud-Rich      │    │
│  │ Post-Match Coaching  │ Local Ollama / Structured│    │
│  │ Asset Generation     │ OpenAI API (quality)     │    │
│  │ Voice Synthesis      │ ElevenLabs (quality)     │    │
│  │ Music Generation     │ Suno API (quality)       │    │
│  └──────────────────────┴──────────────────────────┘    │
│                                                         │
│  [Run Prompt Test] [Export Config] [Import Config] [Browse Community] │
└─────────────────────────────────────────────────────────┘
```

### Prompt Strategy Profiles (Local vs Cloud, Auto-Selectable)

The LLM Manager defines **Prompt Strategy Profiles** that sit between task routing and prompt assembly. This allows IC to adapt behavior for local models without forking every feature prompt manually.

**Examples (built-in profiles):**
- `CloudRich` — larger context budget, richer instructions/few-shot examples, complex schema prompts when supported
- `CloudStructuredJson` — strict structured output / repair-pass-oriented profile
- `LocalCompact` — shorter prompts, tighter context budget, reduced examples, simpler schema wording
- `LocalStructured` — conservative JSON/schema mode for local models that pass structured-output probes
- `LocalStepwise` — task decomposition into multiple smaller calls (plan → validate → emit)
- `Custom` — user-defined/Workshop-shared profile

**Why profiles instead of one "local prompt":**
- Different local model families behave differently (`llama`, `qwen`, `mistral`, etc.)
- Quantization level and hardware constraints affect usable context and latency
- Some local setups support tool-calling/JSON reliably; others do not
- The prompt *text* may be fine while the **chat template** or decoding settings are wrong

**Auto mode (recommended default):**
- `Auto` chooses a prompt strategy profile based on:
  - provider type (`ollama`, `llama.cpp`, cloud API, etc.)
  - capability probe results (see below)
  - task type (coaching vs mission generation vs orchestrator)
- Users can override Auto per-provider and per-task.

### Capability Probing (Optional, User-Triggered + Cached)

The LLM Manager can run a lightweight **capability probe** against a configured provider/model to guide prompt strategy selection and warn about likely failure modes.

Probe outputs (examples):
- chat template compatibility (provider-native vs user override)
- structured JSON reliability (pass/fail + repair-needed rate on canned tests)
- effective context window estimate (configured + observed practical limit)
- latency bands for short/medium prompts
- tool-call/function-call support (if provider advertises or passes tests)
- stop-token / truncation behavior quirks

**Probe design rules:**
- Probes are explicit (`[Probe]`) or run during `[Test]`; no hidden background benchmarking by default.
- Probes use small canned prompts and never access player personalization data.
- Probe results are cached locally and tied to `(provider endpoint, model, version fingerprint if available)`.
- Probe results are advisory — users can still force a profile.

### Prompt Test / Eval Harness (D047 UX, D016 Reliability Support)

`[Run Prompt Test]` in the LLM Manager launches a small test harness to validate a provider/profile combo before the user relies on it for campaign generation.

**Modes:**
- **Smoke test:** connectivity, auth, simple response
- **Structured output test:** emit a tiny YAML/JSON snippet and parse/repair it
- **Task sample test:** representative mini-task (e.g., 1 mission objective block, coaching summary)
- **Latency/cost estimate test:** show rough turnaround and token/cost estimate where available

**Outputs shown to user:**
- selected prompt strategy profile (`Auto -> LocalCompact`, etc.)
- chat template used (advanced view)
- decoding settings used (temperature/top_p/etc.)
- success/failure + parser diagnostics
- recommended adjustments (e.g., "Use LocalStepwise for mission generation on this model")

This lowers BYOLLM friction and directly addresses the "prompted like a cloud model" failure mode without requiring users to become prompt-engineering experts.

### Community-Shareable Configurations

LLM configurations can be exported (without API keys) and shared via the Workshop (D030):

```yaml
# Exported LLM configuration (shareable)
llm_config:
  name: "Budget-Friendly RA Setup"
  author: "PlayerName"
  description: "Ollama for real-time features, free API tier for generation"
  version: 1
  providers:
    - name: "Local Ollama"
      type: ollama
      endpoint: "http://localhost:11434"
      model: "llama3.2:8b"
      prompt_mode: auto              # auto | explicit profile id
      preferred_prompt_profile: "local_compact_v1"
      # NO api_key — never exported
    - name: "Cloud Provider"
      type: openai-compatible
      # endpoint intentionally omitted — user fills in their own
      model: "gpt-4o-mini"
      preferred_prompt_profile: "cloud_rich_v1"
      notes: "Works well with OpenAI or any compatible API"
  prompt_profiles:
    - id: "local_compact_v1"
      base: "LocalCompact"
      max_context_tokens: 8192
      few_shot_examples: 1
      schema_mode: "simplified"
      retry_repair_passes: 1
      notes: "Good for 7B-8B local models on consumer hardware."
    - id: "cloud_rich_v1"
      base: "CloudRich"
      few_shot_examples: 3
      schema_mode: "strict"
      retry_repair_passes: 2
  routing:
    ai_orchestrator: "Local Ollama"
    mission_generation: "Cloud Provider"
    coaching: "Local Ollama"
    campaign_briefings: "Cloud Provider"
    asset_generation: "Cloud Provider"
  routing_prompt_profiles:
    ai_orchestrator: "local_compact_v1"
    mission_generation: "cloud_rich_v1"
    coaching: "local_compact_v1"
    campaign_briefings: "cloud_rich_v1"
  performance_notes: |
    Tested on RTX 3060 + Ryzen 5600X.
    Ollama latency ~300ms for orchestrator (acceptable).
    GPT-4o-mini at ~$0.02 per mission generation.
  compatibility:
    ic_version: ">=0.5.0"
    tested_models:
      - "llama3.2:8b"
      - "mistral:7b"
      - "gpt-4o-mini"
      - "gpt-4o"
```

**Security:** API keys are **never** included in exported configurations. The export contains provider types, model names, routing, and prompt strategy preferences — the user fills in their own credentials after importing.

**Portability note:** Exported configurations may include prompt strategy profiles and capability hints, but these are treated as **advisory** on import. The importing user can re-run capability probes, and Auto mode may choose a different profile for the same nominal model on different hardware/quantization/provider wrappers.

### Workshop Integration

LLM configurations are a Workshop resource type (D030):

- **Category:** "LLM Configurations" in the Workshop browser
- **Ratings and reviews:** Community rates configurations by reliability, cost, quality
- **Tagging:** `budget`, `high-quality`, `local-only`, `fast`, `creative`, `coaching`
- **Compatibility tracking:** Configurations specify which IC version and features they've been tested with

### Achievement Integration (D036)

LLM configuration is an achievement milestone — encouraging discovery and adoption:

| Achievement               | Trigger                                           | Category    |
| ------------------------- | ------------------------------------------------- | ----------- |
| "Intelligence Officer"    | Configure your first LLM provider                 | Community   |
| "Strategic Command"       | Win a game with LLM Orchestrator AI active        | Exploration |
| "Artificial Intelligence" | Play 10 games with any LLM-enhanced AI mode       | Exploration |
| "The Sharing Protocol"    | Publish an LLM configuration to the Workshop      | Community   |
| "Commanding General"      | Use task routing with 2+ providers simultaneously | Exploration |

### Storage (D034)

```sql
CREATE TABLE llm_providers (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,           -- 'ollama', 'openai', 'anthropic', 'custom'
    endpoint    TEXT,
    model       TEXT NOT NULL,
    api_key     TEXT,                    -- encrypted at rest
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    last_tested TEXT
);

CREATE TABLE llm_task_routing (
    task_name   TEXT PRIMARY KEY,        -- 'ai_orchestrator', 'mission_generation', etc.
    provider_id INTEGER REFERENCES llm_providers(id)
);

CREATE TABLE llm_prompt_profiles (
    id              TEXT PRIMARY KEY,    -- e.g. 'local_compact_v1'
    display_name    TEXT NOT NULL,
    base_profile    TEXT NOT NULL,       -- built-in family: CloudRich, LocalCompact, etc.
    config_json     TEXT NOT NULL,       -- profile overrides (schema mode, retries, limits)
    source          TEXT NOT NULL,       -- 'builtin', 'user', 'workshop'
    created_at      TEXT NOT NULL
);

CREATE TABLE llm_task_prompt_strategy (
    task_name       TEXT PRIMARY KEY,
    provider_id     INTEGER REFERENCES llm_providers(id),
    mode            TEXT NOT NULL,       -- 'auto' or 'explicit'
    profile_id      TEXT REFERENCES llm_prompt_profiles(id)
);

CREATE TABLE llm_provider_capability_probe (
    provider_id      INTEGER REFERENCES llm_providers(id),
    model            TEXT NOT NULL,
    probed_at        TEXT NOT NULL,
    provider_fingerprint TEXT,           -- version/model hash if available
    result_json      TEXT NOT NULL,      -- structured probe results + diagnostics
    PRIMARY KEY (provider_id, model)
);
```

### Prompt Strategy & Capability Interfaces (Spec-Level)

```rust
pub enum PromptStrategyMode {
    Auto,
    Explicit { profile_id: String },
}

pub enum BuiltinPromptProfile {
    CloudRich,
    CloudStructuredJson,
    LocalCompact,
    LocalStructured,
    LocalStepwise,
}

pub struct PromptStrategyProfile {
    pub id: String,
    pub base: BuiltinPromptProfile,
    pub max_context_tokens: Option<u32>,
    pub few_shot_examples: u8,
    pub schema_mode: SchemaPromptMode,
    pub retry_repair_passes: u8,
    pub decoding_overrides: Option<DecodingParams>,
    pub notes: Option<String>,
}

pub enum SchemaPromptMode {
    Relaxed,
    Simplified,
    Strict,
}

pub struct ModelCapabilityProbe {
    pub provider_id: String,
    pub model: String,
    pub chat_template_ok: bool,
    pub json_reliability_score: Option<f32>,
    pub tool_call_support: Option<bool>,
    pub effective_context_estimate: Option<u32>,
    pub latency_short_ms: Option<u32>,
    pub latency_medium_ms: Option<u32>,
    pub diagnostics: Vec<String>,
}

pub struct PromptExecutionPlan {
    pub selected_profile: String,
    pub chat_template: Option<String>,
    pub decoding: DecodingParams,
    pub staged_steps: Vec<String>, // used by LocalStepwise, etc.
}
```

### Relationship to Existing Decisions

- **D016 (BYOLLM):** D047 is the UI and management layer for D016's `LlmProvider` trait. D016 defined the trait and provider types; D047 provides the user experience for configuring them.
- **D016 (prompt strategy note):** D047 operationalizes D016's local-vs-cloud prompt-strategy distinction through Prompt Strategy Profiles, capability probing, and test/eval UX.
- **D036 (Achievements):** LLM-related achievements encourage exploration of optional features without making them required.
- **D030 (Workshop):** LLM configurations become another shareable resource type.
- **D034 (SQLite):** Provider configurations stored locally, encrypted API keys.
- **D044 (LLM AI):** The task routing table directly determines which provider the orchestrator and LLM player use.
- **Player Flow (BYOLLM Feature Discovery):** A one-time GUI prompt lists all features unlocked by configuring an LLM provider, with direct links to D047's LLM Manager and community configs. See `player-flow/settings.md` § BYOLLM Feature Discovery Prompt.

### Alternatives Considered

- Settings-only configuration, no dedicated UI (rejected — multiple providers with task routing is too complex for a settings page)
- No community sharing (rejected — LLM configuration is a significant friction point; community knowledge sharing reduces the barrier)
- Include API keys in exports (rejected — obvious security risk; never export secrets)
- Centralized LLM service run by IC project (rejected — conflicts with BYOLLM principle; users control their own data and costs)
- **One universal prompt template/profile for all providers** (rejected — local/cloud/model-family differences make this brittle; capability-driven strategy selection is more reliable)

---

---

