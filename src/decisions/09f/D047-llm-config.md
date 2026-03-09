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
- **A zero-configuration path for non-technical players** — clicking "Enable AI features" and having something work immediately, without installing third-party software, creating accounts, or pasting API keys

### Decision

Provide a dedicated **LLM Manager** UI screen, a community-shareable configuration format for LLM provider setups, a provider/model-aware **Prompt Strategy Profile** system with optional capability probing and task-level overrides, and a **tiered provider system** that ranges from zero-setup IC Built-in models to full BYOLLM power-user configurations.

### Provider Tiers

IC supports four provider tiers, ordered from easiest to most configurable. All tiers implement the same `LlmProvider` trait and participate in the same task routing and prompt strategy infrastructure. The tiers serve different audiences — the goal is that every user has a path to LLM features regardless of technical skill.

#### Tier 1: IC Built-in (Zero Configuration)

IC ships an embedded inference runtime and optional first-party **model packs** — small, prebuilt, CPU-optimized models that run entirely on the user's machine with no external dependencies.

**Design rules:**
- The inference runtime ships with the game binary. No separate install, no sidecar process, no `PATH` configuration.
- Model weights are **not** bundled in the base install. They are downloaded on demand when the user enables a built-in model pack (or via Workshop as a resource type).
- First-party model packs target **CPU-only inference** (no GPU required). The emphasis is on broad hardware compatibility and a "just works" experience, not maximum quality. GPU acceleration is not planned for initial delivery (Phase 7, M11); if profiling shows CPU inference is a bottleneck on target hardware, GPU support would be scoped as a separate feature at that time.
- Model packs are GGUF-quantized (or equivalent) for minimal RAM footprint. Target: usable on 8 GB RAM systems.
- The runtime is managed by `ic-llm` — started lazily on first use, kept warm while active, unloaded when idle or under memory pressure.
- Built-in models use the `EmbeddedCompact` prompt strategy profile (see below) — shorter prompts, smaller context windows, optimized for the specific models IC ships.
- IC selects and validates specific model checkpoints for each release. The user does not choose models — they enable a capability ("Enable AI coaching," "Enable AI opponents") and the correct model pack is resolved automatically.

**What this looks like for the user:**
```
Settings → LLM → Quick Setup:

  ┌─────────────────────────────────────────────────────────┐
  │  AI Features — Quick Setup                              │
  │                                                         │
  │  IC can run AI features using built-in models that run  │
  │  locally on your computer. No account needed.           │
  │                                                         │
  │  ● AI Coaching & Replay Analysis     [Enable] (850 MB)  │
  │  ● AI Opponents (Orchestrator)       [Enable] (850 MB)  │
  │  ● Mission & Campaign Drafting       [Enable] (850 MB)  │
  │                                                         │
  │  System: 16 GB RAM / 8 GB available ✓                   │
  │  Models run on CPU — no GPU required.                   │
  │                                                         │
  │  ─ or ─                                                 │
  │                                                         │
  │  [Connect Cloud Provider →]  for higher quality output  │
  │  [Connect Local LLM →]      (Ollama, LM Studio, etc.)  │
  │  [Advanced Setup →]         API keys, task routing      │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
```

**Model pack management:**
- Model packs are Workshop resource type `llm-model-pack` (D030). First-party packs are published to the Workshop by the IC project account and pinned per engine version.
- Each pack includes: GGUF weights, a manifest (`model_pack.toml`), the prompt strategy profile it was validated against, and a minimal eval suite result.
- Packs declare their role (`coaching`, `orchestrator`, `generation`) and hardware requirements (`min_ram_gb`, `recommended_ram_gb`).
- Users can replace IC's default packs with community or third-party packs from the Workshop, but the Quick Setup path always uses IC-validated defaults.

**Model pack manifest example (`model_pack.toml`):**
```toml
[pack]
id = "ic.builtin.coach-v1"
display_name = "IC Replay Coach"
version = "1.0.0"
roles = ["coaching", "replay_analysis"]
license = "Apache-2.0"  # IC first-party packs prefer Apache-2.0/MIT models

[requirements]
min_ram_gb = 6
recommended_ram_gb = 8
cpu_only = true          # no GPU needed

[model]
format = "gguf"
quantization = "Q4_K_M"
context_window = 8192
filename = "ic-coach-v1-q4km.gguf"
checksum_sha256 = "..."

[validation]
ic_version = ">=0.8.0"
prompt_profile = "EmbeddedCompact"
eval_suite = "coaching-basic-v1"
eval_pass_rate = 0.92
```

**Runtime embedding — not a sidecar:**
The inference runtime uses existing **pure Rust** crates (`candle-core`, `candle-transformers`, `tokenizers` — all MIT/Apache 2.0) compiled directly into `ic-llm`. It runs in-process on a dedicated thread pool, not as a separate OS process. This eliminates process lifecycle management, port conflicts, and the "is the server running?" failure mode. `candle` provides GGUF loading, quantized tensor math with SIMD kernels (AVX2/NEON/WASM simd128), and pre-built Qwen2/Phi model architectures — no C/C++ bindings, no FFI. IC writes only a thin bridge layer (~400–600 lines) implementing `LlmProvider`. The tradeoff (larger binary size) is acceptable because model weights — not the runtime — dominate the download. See `research/pure-rust-inference-feasibility.md` for full architecture.

**Relationship to BYOLLM:**
IC Built-in is not a replacement for BYOLLM — it is the **floor**. Users who want higher quality, larger context, GPU acceleration, or specific model families upgrade to Tier 2–4. The built-in models provide a baseline that makes every LLM feature *functional* without external setup. BYOLLM provides the ceiling.

#### Tier 2: Cloud Provider — OAuth Login

For users who have accounts with major LLM platforms but don't want to manage API keys, IC supports **OAuth 2.0 login flows** against supported cloud providers.

**Design rules:**
- IC registers as an OAuth client with each supported provider (OpenAI, Anthropic, Google AI, etc.).
- The user clicks "Sign in with OpenAI" (or equivalent), completes the browser-based OAuth flow, and IC receives a scoped access token.
- Tokens are stored encrypted in the local credential store (`CredentialStore` in `ic-paths` — OS keyring primary, Argon2id vault passphrase fallback; see `research/credential-protection-design.md`).
- **Decryption failure recovery:** If the DEK is lost or the token blob is corrupted, the provider shows a ⚠ badge and [Sign In] button in Settings → LLM. The player clicks [Sign In] to redo the OAuth flow — provider name, endpoint, and model are preserved. A non-blocking banner appears only when the player triggers an LLM-gated action (not at launch). See `research/credential-protection-design.md` § Decryption Failure Recovery.
- Token refresh is handled automatically. The user never sees a token or API key.
- Billing is through the user's existing platform account — IC never processes payments.
- Not all providers offer OAuth for API access. This tier is available only where the provider's auth model supports it. Providers without OAuth fall back to Tier 3.

**UX advantage:** The user clicks a button, logs in through their browser, and the provider is configured. No copy-pasting API keys, no endpoint URLs, no model name lookups.

#### Tier 3: Cloud Provider — API Key

The existing BYOLLM model: the user creates an API key on their provider's dashboard and pastes it into IC's LLM Manager.

**Design rules:**
- Supports any OpenAI-compatible API endpoint (covers Ollama remote, vLLM, LiteLLM, Azure OpenAI, and dozens of other providers).
- Also supports provider-specific APIs where the protocol differs (Anthropic's Messages API).
- API keys encrypted at rest via `CredentialStore` (AES-256-GCM with DEK from OS keyring or vault passphrase; see `research/credential-protection-design.md`).
- **Decryption failure recovery:** If the DEK is lost (new machine, keyring cleared, forgotten vault passphrase) or a credential blob is corrupted, the provider shows a ⚠ badge and [Sign In] button in Settings → LLM. The player is prompted to re-enter the API key — provider name, endpoint, and model are preserved. LLM features fall back to built-in models until re-entry is complete. Vault passphrase reset is available via Settings → Data → Security → [Reset Vault Passphrase] (or `/vault reset` in console). See `research/credential-protection-design.md` § Decryption Failure Recovery.
- Keys are **never** exported in shareable configurations.

#### Tier 4: Local External — Self-Managed

For power users running their own inference infrastructure: Ollama, LM Studio, vLLM, text-generation-webui, or any local/remote server exposing an OpenAI-compatible HTTP API.

**Design rules:**
- User provides endpoint URL, model name, and optionally an API key.
- IC auto-detects Ollama at `localhost:11434` and LM Studio at `localhost:1234` for convenience.
- Full control: the user manages their own hardware, model selection, quantization, GPU allocation.
- This tier gets the full D047 experience: capability probing, prompt strategy profiles, task routing.

#### Tier Summary

| Tier | Name           | Auth Method   | Setup Effort              | Target Audience              | Quality Ceiling                         |
| ---- | -------------- | ------------- | ------------------------- | ---------------------------- | --------------------------------------- |
| 1    | IC Built-in    | None          | Click "Enable" + download | Everyone                     | Functional (CPU-optimized small models) |
| 2    | Cloud OAuth    | Browser login | 2 clicks                  | Users with platform accounts | High (cloud-scale models)               |
| 3    | Cloud API Key  | Paste API key | Copy-paste + configure    | Developers, power users      | High (any cloud model)                  |
| 4    | Local External | Endpoint URL  | Install + configure       | Enthusiasts, self-hosters    | Variable (user's hardware)              |

All four tiers produce the same `LlmProvider` trait object. Task routing, prompt strategy profiles, capability probing, and the eval harness work identically across tiers. A user can mix tiers — IC Built-in for quick coaching responses, cloud OAuth for high-quality mission generation.

### LLM Manager UI

Accessible from Settings → LLM Providers. The UI opens with the Quick Setup view (Tier 1) and an expandable "Advanced" section for Tiers 2–4.

```
┌─────────────────────────────────────────────────────────┐
│  LLM Providers                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Built-in AI (runs locally, no account needed)          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ● AI Coaching & Replay Analysis   ✓ Enabled       │ │
│  │  ● AI Opponents (Orchestrator)     ✓ Enabled       │ │
│  │  ● Mission & Campaign Drafting     ○ Not installed  │ │
│  │  Model: IC Coach v1 (Q4, CPU) │ RAM: 4.2/8 GB     │ │
│  │  Status: ● Ready  │  Avg latency: 1.8s             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  [+] Add Cloud or Local Provider                        │
│                                                         │
│  ┌─ OpenAI (OAuth) ────────────── ✓ Active ───────────┐ │
│  │  Signed in as: user@example.com                    │ │
│  │  Model: gpt-4o                                     │ │
│  │  Prompt Mode: Auto → Cloud-Rich                    │ │
│  │  Assigned to: Mission generation, Campaign briefings│ │
│  │  Avg latency: 1.2s   │  Status: ● Connected        │ │
│  │  [Probe] [Test] [Edit] [Sign Out]                  │ │
│  └────────────────────────────────────────────────────┘ │
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
│  ┌─ Anthropic API (Claude) ────── ○ Inactive ─────────┐ │
│  │  Auth: API Key                                     │ │
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
│  │ Post-Match Coaching  │ IC Built-in / Embedded   │    │
│  │ Asset Generation     │ OpenAI (quality)         │    │
│  │ Voice Synthesis      │ ElevenLabs (quality)     │    │
│  │ Music Generation     │ Suno API (quality)       │    │
│  └──────────────────────┴──────────────────────────┘    │
│                                                         │
│  [Run Prompt Test] [Export Config] [Import Config] [Browse Community] │
└─────────────────────────────────────────────────────────┘
```

**Add Provider flow** (Tiers 2–4):
```
┌─────────────────────────────────────────────────────────┐
│  Add LLM Provider                                       │
│                                                         │
│  Sign in with a cloud provider:                         │
│  [Sign in with OpenAI]                                  │
│  [Sign in with Anthropic]                               │
│  [Sign in with Google AI]                               │
│                                                         │
│  ── or ──                                               │
│                                                         │
│  Paste an API key:                                      │
│  Provider: [OpenAI-Compatible ▾]                        │
│  Endpoint: [https://...              ]                  │
│  Model:    [                         ]                  │
│  API Key:  [••••••••••••••           ]                  │
│                                                         │
│  ── or ──                                               │
│                                                         │
│  Connect a local LLM server:                            │
│  [Auto-detect Ollama]  [Auto-detect LM Studio]          │
│  Endpoint: [http://localhost:11434   ]                  │
│  Model:    [llama3.2:8b              ]                  │
│                                                         │
│  [Test Connection]  [Save]  [Cancel]                    │
└─────────────────────────────────────────────────────────┘
```

### Prompt Strategy Profiles (Local vs Cloud, Auto-Selectable)

The LLM Manager defines **Prompt Strategy Profiles** that sit between task routing and prompt assembly. This allows IC to adapt behavior for local models without forking every feature prompt manually.

**Examples (built-in profiles):**
- `EmbeddedCompact` — minimal prompts, small context budgets, and format constraints specifically validated against IC's first-party model packs. Not user-configurable — tied to the built-in model version. Used automatically by Tier 1 providers.
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
  - provider type (`ic-built-in`, `ollama`, cloud API, etc.)
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

**Credential encryption:** Sensitive columns (`api_key`, `oauth_token`, `oauth_refresh_token`) are stored as AES-256-GCM encrypted BLOBs, never plaintext. The Data Encryption Key (DEK) is held in the OS credential store (Windows DPAPI / macOS Keychain / Linux Secret Service) via the `keyring` crate, or derived from a user-provided vault passphrase (Argon2id) when no OS keyring is available. See `research/credential-protection-design.md` for the full three-tier `CredentialStore` design, threat model, and `zeroize`-based memory protection.

```sql
CREATE TABLE llm_providers (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    tier        TEXT NOT NULL,           -- 'builtin', 'cloud_oauth', 'cloud_apikey', 'local_external'
    type        TEXT NOT NULL,           -- 'ic_builtin', 'ollama', 'openai', 'anthropic', 'google_ai', 'openai_compatible', 'custom'
    auth_method TEXT NOT NULL,           -- 'none', 'oauth', 'api_key'
    endpoint    TEXT,
    model       TEXT NOT NULL,
    api_key     BLOB,                   -- AES-256-GCM encrypted (CredentialStore DEK); NULL for OAuth/builtin
    oauth_token BLOB,                   -- AES-256-GCM encrypted (CredentialStore DEK); NULL for API key/builtin
    oauth_refresh_token BLOB,           -- AES-256-GCM encrypted (CredentialStore DEK); NULL for non-OAuth
    oauth_token_expiry TEXT,             -- RFC 3339 UTC; NULL if token does not expire
    oauth_provider TEXT,                 -- 'openai', 'anthropic', 'google_ai'; NULL for non-OAuth tiers
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    last_tested TEXT
);

CREATE TABLE llm_model_packs (
    id              TEXT PRIMARY KEY,    -- e.g. 'ic.builtin.coach-v1'
    display_name    TEXT NOT NULL,
    roles_json      TEXT NOT NULL,       -- JSON array: ["coaching", "replay_analysis"]
    license         TEXT NOT NULL,       -- SPDX identifier
    format          TEXT NOT NULL,       -- 'gguf'
    quantization    TEXT NOT NULL,       -- 'Q4_K_M', 'Q5_K_M', etc.
    context_window  INTEGER NOT NULL,
    min_ram_gb      INTEGER NOT NULL,
    filename        TEXT NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    ic_version_min  TEXT NOT NULL,
    installed       INTEGER NOT NULL DEFAULT 0,
    install_path    TEXT,
    source          TEXT NOT NULL        -- 'first_party', 'workshop', 'custom'
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
    EmbeddedCompact,        // Tier 1 IC Built-in: validated against first-party model packs
    CloudRich,
    CloudStructuredJson,
    LocalCompact,
    LocalStructured,
    LocalStepwise,
}

pub enum ProviderTier {
    /// Tier 1: IC-shipped models, CPU-only, zero config.
    IcBuiltIn,
    /// Tier 2: Cloud provider via OAuth browser login.
    CloudOAuth,
    /// Tier 3: Cloud provider via pasted API key.
    CloudApiKey,
    /// Tier 4: User-managed local/remote server (Ollama, LM Studio, vLLM, etc.).
    LocalExternal,
}

pub enum AuthMethod {
    /// No authentication needed (IC Built-in).
    None,
    /// OAuth 2.0 browser flow — token managed automatically.
    OAuth { provider: OAuthProvider },
    /// User-provided API key — encrypted at rest.
    ApiKey,
}

pub enum OAuthProvider {
    OpenAi,
    Anthropic,
    GoogleAi,
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

- **D016 (BYOLLM):** D047 is the UI and management layer for D016's `LlmProvider` trait. D016 defined the trait and provider types; D047 provides the user experience for configuring them. The Tier 1 built-in models extend BYOLLM with a zero-config floor — BYOLLM remains the architecture, built-in is the product default.
- **D016 (prompt strategy note):** D047 operationalizes D016's local-vs-cloud prompt-strategy distinction through Prompt Strategy Profiles, capability probing, and test/eval UX. The `EmbeddedCompact` profile is purpose-built for Tier 1's small CPU models.
- **D036 (Achievements):** LLM-related achievements encourage exploration of optional features without making them required.
- **D030 (Workshop):** LLM configurations and model packs are Workshop resource types. First-party model packs use `llm-model-pack` type. Community model packs follow the same manifest schema with required license metadata.
- **D034 (SQLite):** Provider configurations and model pack state stored locally, encrypted credentials (API keys and OAuth tokens).
- **D044 (LLM AI):** The task routing table directly determines which provider the orchestrator and LLM player use. IC Built-in is a valid routing target.
- **D049 (Workshop asset formats):** Model packs use the Workshop distribution and integrity-verification infrastructure.
- **Player Flow (BYOLLM Feature Discovery):** The discovery prompt now leads with Quick Setup (Tier 1 built-in) and offers cloud/local as upgrade paths. See `player-flow/settings.md` § BYOLLM Feature Discovery Prompt.

### Alternatives Considered

- Settings-only configuration, no dedicated UI (rejected — multiple providers with task routing is too complex for a settings page)
- No community sharing (rejected — LLM configuration is a significant friction point; community knowledge sharing reduces the barrier)
- Include API keys in exports (rejected — obvious security risk; never export secrets)
- Centralized LLM service run by IC project (rejected — conflicts with BYOLLM principle; users control their own data and costs)
- **One universal prompt template/profile for all providers** (rejected — local/cloud/model-family differences make this brittle; capability-driven strategy selection is more reliable)
- **Sidecar process instead of embedded runtime for Tier 1** (rejected — a separate inference server process introduces lifecycle management, port conflicts, firewall issues, and "is the server running?" support burden; in-process pure Rust inference is simpler for the zero-config audience)
- **C/C++ inference library bindings (e.g., llama-cpp-rs)** (rejected — introduces FFI complexity, C++ build toolchain dependency, platform-specific compilation issues, and conflicts with the project's pure Rust philosophy; Rust's native SIMD via `std::arch`/`std::simd` provides equivalent CPU performance for IC's narrow model support scope)
- **GPU-first for built-in models** (rejected for launch — GPU inference is faster but creates driver compatibility issues, VRAM conflicts with the game's own renderer, and platform variance; CPU-first ensures broadest compatibility; GPU acceleration is not in scope for M11 delivery)
- **Shipping model weights in the base install** (rejected — model packs add 500 MB–2 GB per role; on-demand download via Workshop keeps the base install small)
- **BYOLLM only, no built-in tier** (rejected — the original position, but excludes non-technical players entirely; the built-in tier is the floor, BYOLLM is the ceiling)

---

---

