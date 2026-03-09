# Pure Rust Inference Runtime — Feasibility Proof

> Demonstrates that IC's Tier 1 (IC Built-in) CPU inference can be assembled from
> existing pure Rust crates — no C/C++ bindings, no reimplementation of solved
> problems. IC writes only the thin integration layer that bridges these crates
> to the existing `LlmProvider` trait. Where IC has specific requirements not
> served by existing crates, those narrow pieces are built custom and documented below.

## Table of Contents

1. [Philosophy: Assemble, Don't Reimplement](#1-philosophy-assemble-dont-reimplement)
2. [Crate Selection](#2-crate-selection)
3. [Architecture: What IC Writes vs. What Crates Provide](#3-architecture-what-ic-writes-vs-what-crates-provide)
4. [IcBuiltInProvider — The IC-Specific Bridge](#4-icbuiltinprovider--the-ic-specific-bridge)
5. [Model Pack Loading](#5-model-pack-loading)
6. [Chat Template Formatting](#6-chat-template-formatting)
7. [Grammar-Constrained Decoding (IC-Specific)](#7-grammar-constrained-decoding-ic-specific)
8. [Bevy Integration via Thread Pool](#8-bevy-integration-via-thread-pool)
9. [Dependency Inventory](#9-dependency-inventory)
10. [IC-Authored Code Estimate](#10-ic-authored-code-estimate)
11. [WASM Compatibility](#11-wasm-compatibility)
12. [Risk Assessment](#12-risk-assessment)

---

## 1. Philosophy: Assemble, Don't Reimplement

The pure Rust ML ecosystem already solves the hard problems:

- **GGUF parsing** — candle reads and writes GGUF files, handles all quantized types, provides mmap support
- **Quantized tensor math** — candle implements all GGML quant types (Q4_K, Q5_K, Q8_0, etc.) with SIMD-accelerated `vec_dot` kernels for AVX2, NEON, and WASM simd128
- **Transformer architectures** — candle-transformers ships model implementations for Qwen2, Phi-3/Phi-4, Llama, Mistral, and dozens more
- **Tokenization** — HuggingFace `tokenizers` is the reference BPE implementation, pure Rust, Apache 2.0
- **Sampling** — candle provides temperature, top-p, top-k, repetition penalty

IC does not rewrite any of this. IC's contribution is the **integration layer**: a ~400-line `IcBuiltInProvider` that loads a model pack, builds a generation pipeline from these crates, and exposes it through the existing `LlmProvider` trait.

Custom IC code is only written where:
1. No existing crate covers the requirement (grammar-constrained JSON decoding for the orchestrator's structured output)
2. The existing crate's API doesn't fit IC's specific need and wrapping it is simpler than forking (model pack manifest parsing, chat template formatting per IC's D047 model pack spec)

---

## 2. Crate Selection

### Primary Dependencies

| Crate                 | Version | License        | What IC Uses It For                                                             |
| --------------------- | ------- | -------------- | ------------------------------------------------------------------------------- |
| `candle-core`         | 0.8+    | MIT/Apache 2.0 | Tensor types, quantized ops, GGUF loading, SIMD kernels, Device abstraction     |
| `candle-transformers` | 0.8+    | MIT/Apache 2.0 | Pre-built Qwen2 and Phi model architectures, generation pipeline, sampling      |
| `candle-nn`           | 0.8+    | MIT/Apache 2.0 | Neural network building blocks (RMSNorm, Linear, Embedding, VarBuilder)         |
| `tokenizers`          | 0.20+   | Apache 2.0     | BPE tokenizer loading and encode/decode (HuggingFace format)                    |
| `hf-hub`              | 0.3+    | Apache 2.0     | Optional: download models from HuggingFace Hub (if model isn't bundled in pack) |

### Why Candle?

Candle is HuggingFace's official Rust ML framework. It is the most mature pure Rust inference library:

- **Pure Rust, zero C/C++ in the CPU path** — `std::arch` SIMD intrinsics, no FFI
- **MIT/Apache 2.0** — GPL-compatible, no license concerns
- **WASM target support** — compiles to `wasm32-unknown-unknown` with simd128
- **GGUF native** — reads the exact file format IC's model packs use
- **Quantized inference built-in** — all GGML quant types with architecture-specific SIMD
- **Model zoo** — Qwen2 and Phi implementations already exist and are maintained by HuggingFace
- **Active development** — regular releases, responsive maintainers, used in production at HuggingFace

### Alternative Considered: `llm` Crate (formerly `llama-rs`)

The `llm` crate (`rustformers/llm`) was an early pure Rust GGML inference library. It is **no longer actively maintained** (last significant commit mid-2023) and lacks support for newer model architectures (Qwen2, Phi-4) and GGUF v3. Candle supersedes it in every dimension. Mentioned here for completeness — not a viable option.

### Alternative Considered: `burn` Crate

`burn` is a Rust deep learning framework with a different design philosophy (backend-agnostic, JIT compilation). It does not natively support GGUF or quantized inference. Using it would require implementing GGUF loading and quantized matmul from scratch — exactly the work we're avoiding. Not suitable for IC's use case.

---

## 3. Architecture: What IC Writes vs. What Crates Provide

```
┌─────────────────────────────────────────────────────────────────┐
│  ic-llm crate                                                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ IC-AUTHORED CODE (~400 lines)                             │  │
│  │                                                           │  │
│  │  IcBuiltInProvider                                        │  │
│  │   ├─ Implements LlmProvider trait (from byollm spec)      │  │
│  │   ├─ Model pack manifest loader (D047 model pack spec)    │  │
│  │   ├─ Chat template formatting (ChatML for Qwen2/Phi)      │  │
│  │   ├─ Lazy model loading / unloading                       │  │
│  │   └─ Grammar-constrained JSON decoding (IC-specific)      │  │
│  └──────────┬────────────────────────────────────────────────┘  │
│             │ uses                                               │
│  ┌──────────▼────────────────────────────────────────────────┐  │
│  │ EXISTING CRATES (zero IC code)                            │  │
│  │                                                           │  │
│  │  candle-core          → GGUF parsing, quantized tensors,  │  │
│  │                         SIMD matmul, Device abstraction    │  │
│  │  candle-transformers  → Qwen2Model, PhiModel, sampling,   │  │
│  │                         LogitsProcessor, generation loop   │  │
│  │  candle-nn            → VarBuilder, RmsNorm, Linear,      │  │
│  │                         Embedding                          │  │
│  │  tokenizers           → BPE tokenize/detokenize            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Everything below the dashed line is library code IC depends on, not code IC writes.** The GGUF parser, quantized block types, SIMD kernels, transformer forward pass, RoPE, KV cache, RMSNorm, attention — all provided by candle.

---

## 4. IcBuiltInProvider — The IC-Specific Bridge

This is the core IC-authored code. It implements the `LlmProvider` trait (from `byollm-implementation-spec.md`) by orchestrating candle's inference pipeline.

```rust
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025–present Iron Curtain contributors
//
// IcBuiltInProvider: bridges candle's inference pipeline to IC's
// LlmProvider trait (D047 Tier 1).

use crate::provider::{
    ChatMessage, LlmError, LlmProvider, LlmRequest, LlmResponse,
    ProviderStatus, ProviderType, ResponseFormat, Role,
};
use candle_core::{quantized::gguf_file, Device, Tensor};
use candle_transformers::models::quantized_llama as qllama;
use candle_transformers::generation::LogitsProcessor;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tokenizers::Tokenizer;

/// IC Built-in provider: pure Rust CPU inference via candle.
/// Wraps a candle quantized model + tokenizer + generation config.
pub struct IcBuiltInProvider {
    state: Mutex<ProviderState>,
    model_path: PathBuf,
    tokenizer_path: PathBuf,
    role: String,
}

enum ProviderState {
    /// Model not yet loaded. Loaded lazily on first request.
    Unloaded,
    /// Model loaded and ready for inference.
    Ready {
        model: qllama::ModelWeights,
        tokenizer: Tokenizer,
        device: Device,
    },
}

impl IcBuiltInProvider {
    pub fn new(model_path: PathBuf, tokenizer_path: PathBuf, role: String) -> Self {
        Self {
            state: Mutex::new(ProviderState::Unloaded),
            model_path,
            tokenizer_path,
            role,
        }
    }

    /// Lazy-load on first use. Avoids consuming RAM for models the player
    /// never triggers (e.g., coaching model during a quick skirmish).
    fn ensure_loaded(&self) -> Result<(), LlmError> {
        let mut state = self.state.lock()
            .map_err(|e| LlmError::ProviderUnavailable(format!("lock poisoned: {e}")))?;

        if matches!(*state, ProviderState::Unloaded) {
            let device = Device::Cpu;

            // candle's GGUF loader handles all the hard work:
            // magic validation, metadata parsing, tensor deserialization,
            // quantized block type dispatch, mmap if available.
            let mut file = std::fs::File::open(&self.model_path)
                .map_err(|e| LlmError::ProviderUnavailable(format!("open model: {e}")))?;
            let gguf = gguf_file::Content::read(&mut file)
                .map_err(|e| LlmError::ProviderUnavailable(format!("parse GGUF: {e}")))?;

            // candle's ModelWeights::from_gguf handles architecture detection,
            // weight loading, and quantized tensor construction — all internally.
            let model = qllama::ModelWeights::from_gguf(gguf, &mut file, &device)
                .map_err(|e| LlmError::ProviderUnavailable(format!("load model: {e}")))?;

            let tokenizer = Tokenizer::from_file(&self.tokenizer_path)
                .map_err(|e| LlmError::ProviderUnavailable(format!("load tokenizer: {e}")))?;

            *state = ProviderState::Ready { model, tokenizer, device };
        }
        Ok(())
    }
}

#[async_trait::async_trait]
impl LlmProvider for IcBuiltInProvider {
    async fn chat_complete(&self, request: LlmRequest) -> Result<LlmResponse, LlmError> {
        self.ensure_loaded()?;
        let start = Instant::now();

        let mut state = self.state.lock()
            .map_err(|e| LlmError::ProviderUnavailable(format!("{e}")))?;
        let (model, tokenizer, device) = match &mut *state {
            ProviderState::Ready { model, tokenizer, device } => (model, tokenizer, device),
            ProviderState::Unloaded => unreachable!("ensure_loaded succeeded"),
        };

        // IC-specific: format chat messages into the model's expected prompt format.
        let prompt = format_chat_prompt(&request.messages);

        // Tokenize using the HuggingFace tokenizers crate.
        let encoding = tokenizer.encode(prompt.as_str(), true)
            .map_err(|e| LlmError::MalformedResponse(format!("tokenize: {e}")))?;
        let prompt_tokens = encoding.get_ids();

        // Build the prompt tensor — candle handles the rest.
        let input_ids = Tensor::new(prompt_tokens, device)
            .map_err(|e| LlmError::ProviderUnavailable(format!("tensor: {e}")))?
            .unsqueeze(0)
            .map_err(|e| LlmError::ProviderUnavailable(format!("unsqueeze: {e}")))?;

        // Configure sampling — candle provides LogitsProcessor with
        // temperature, top-p, top-k, repetition penalty built in.
        let temperature = request.temperature.unwrap_or(0.7) as f64;
        let mut logits_processor = LogitsProcessor::new(
            /* seed */ 42,
            Some(temperature),
            Some(0.9), // top-p
        );

        let max_tokens = request.max_tokens.unwrap_or(500) as usize;
        let eos_token = tokenizer.token_to_id("</s>")
            .or_else(|| tokenizer.token_to_id("<|im_end|>"))
            .unwrap_or(2);

        // IC-specific: optional grammar constraint for structured JSON output.
        let mut grammar = match request.response_format {
            Some(ResponseFormat::Json) => Some(JsonGrammarFilter::new()),
            _ => None,
        };

        // ── Generation loop ──
        // Feed prompt tokens through the model, then generate autoregressively.
        let mut generated_tokens = Vec::with_capacity(max_tokens);
        let mut next_token = {
            // Prefill: process all prompt tokens at once.
            let logits = model.forward(&input_ids, 0)
                .map_err(|e| LlmError::ProviderUnavailable(format!("forward: {e}")))?;
            let logits = logits.squeeze(0)
                .map_err(|e| LlmError::ProviderUnavailable(format!("squeeze: {e}")))?;

            // Apply grammar bias if active
            let logits = apply_grammar_bias(&logits, &grammar, tokenizer)?;

            logits_processor.sample(&logits)
                .map_err(|e| LlmError::ProviderUnavailable(format!("sample: {e}")))?
        };

        generated_tokens.push(next_token);

        // Autoregressive generation
        for pos in 0..max_tokens.saturating_sub(1) {
            if next_token == eos_token {
                break;
            }

            // Check stop sequences
            if is_stop_sequence(&generated_tokens, &request.stop_sequences, tokenizer) {
                break;
            }

            let input = Tensor::new(&[next_token], device)
                .map_err(|e| LlmError::ProviderUnavailable(format!("{e}")))?
                .unsqueeze(0)
                .map_err(|e| LlmError::ProviderUnavailable(format!("{e}")))?;

            let logits = model.forward(&input, prompt_tokens.len() + pos + 1)
                .map_err(|e| LlmError::ProviderUnavailable(format!("forward: {e}")))?;
            let logits = logits.squeeze(0)
                .map_err(|e| LlmError::ProviderUnavailable(format!("{e}")))?;

            // Advance grammar state and apply token bias
            if let Some(ref mut g) = grammar {
                if let Some(text) = tokenizer.id_to_token(next_token) {
                    g.advance(&text);
                }
            }
            let logits = apply_grammar_bias(&logits, &grammar, tokenizer)?;

            next_token = logits_processor.sample(&logits)
                .map_err(|e| LlmError::ProviderUnavailable(format!("sample: {e}")))?;
            generated_tokens.push(next_token);
        }

        // Decode generated tokens back to text
        let content = tokenizer.decode(&generated_tokens, true)
            .map_err(|e| LlmError::MalformedResponse(format!("detokenize: {e}")))?;

        Ok(LlmResponse {
            content,
            model: self.role.clone(),
            tokens_used: Some(generated_tokens.len() as u32),
            latency_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn health_check(&self) -> Result<ProviderStatus, LlmError> {
        let loaded = self.state.lock()
            .map(|s| matches!(*s, ProviderState::Ready { .. }))
            .unwrap_or(false);

        Ok(ProviderStatus {
            connected: true, // always "connected" — it's local
            model_loaded: loaded,
            latency_ms: None,
        })
    }

    fn display_name(&self) -> &str { "IC Built-in" }
    fn provider_type(&self) -> ProviderType { ProviderType::IcBuiltIn }
    fn context_window(&self) -> Option<u32> { Some(4096) }
}

/// Check if the generated token sequence ends with any stop sequence.
fn is_stop_sequence(
    tokens: &[u32],
    stop_sequences: &[String],
    tokenizer: &Tokenizer,
) -> bool {
    if stop_sequences.is_empty() {
        return false;
    }
    // Decode the tail of generated tokens and check for stop strings.
    // Only decode the last ~50 tokens to bound cost.
    let tail_start = tokens.len().saturating_sub(50);
    let tail_text = tokenizer.decode(&tokens[tail_start..], true).unwrap_or_default();
    stop_sequences.iter().any(|s| tail_text.ends_with(s))
}

/// Apply grammar bias to logits tensor if grammar is active.
fn apply_grammar_bias(
    logits: &Tensor,
    grammar: &Option<JsonGrammarFilter>,
    tokenizer: &Tokenizer,
) -> Result<Tensor, LlmError> {
    match grammar {
        Some(g) => {
            let vocab_size = logits.dim(0)
                .map_err(|e| LlmError::ProviderUnavailable(format!("{e}")))?;
            let bias = g.compute_bias(vocab_size, tokenizer);
            let bias_tensor = Tensor::new(bias.as_slice(), logits.device())
                .map_err(|e| LlmError::ProviderUnavailable(format!("{e}")))?;
            logits.add(&bias_tensor)
                .map_err(|e| LlmError::ProviderUnavailable(format!("{e}")))
        }
        None => Ok(logits.clone()),
    }
}
```

**What this code does NOT contain:** GGUF parsing, quantized block types, SIMD kernels, transformer layers, attention mechanisms, RMSNorm, RoPE, KV cache management, tensor allocation, matrix multiplication. All of that is candle's job.

**What this code DOES contain:** The IC-specific concerns that no crate provides — the `LlmProvider` trait bridge, lazy model lifecycle, chat formatting, grammar-constrained decoding, and stop sequence detection.

---

## 5. Model Pack Loading

Model packs (D047) are Workshop resources containing a GGUF model file, a tokenizer, and a manifest. IC needs a small loader that reads the manifest and wires up the `IcBuiltInProvider`.

```rust
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025–present Iron Curtain contributors
//
// Model pack manifest and loader — IC-specific, no crate provides this.

use serde::Deserialize;
use std::path::{Path, PathBuf};

/// Model pack manifest (`manifest.toml` inside a model pack directory).
/// Defined by D047. No existing crate handles this — it's IC's own spec.
#[derive(Debug, Deserialize)]
pub struct ModelPackManifest {
    pub name: String,
    pub version: String,
    pub roles: Vec<ModelRole>,
}

#[derive(Debug, Deserialize)]
pub struct ModelRole {
    /// Which IC task this model serves: "orchestrator", "coaching", "generation"
    pub role: String,
    /// Relative path to the GGUF file within the pack
    pub model_file: String,
    /// Relative path to tokenizer.json
    pub tokenizer_file: String,
    /// Context window size for this model
    pub context_window: u32,
    /// RAM estimate in MB (for UI display and model swap decisions)
    pub ram_estimate_mb: u32,
}

/// Load a model pack from disk and create providers for each role.
pub fn load_model_pack(
    pack_dir: &Path,
) -> Result<Vec<(String, IcBuiltInProvider)>, Box<dyn std::error::Error>> {
    let manifest_path = pack_dir.join("manifest.toml");
    let manifest_text = std::fs::read_to_string(&manifest_path)?;
    let manifest: ModelPackManifest = toml::from_str(&manifest_text)?;

    let mut providers = Vec::new();
    for role in &manifest.roles {
        let model_path = pack_dir.join(&role.model_file);
        let tokenizer_path = pack_dir.join(&role.tokenizer_file);

        // Validate paths exist before creating provider
        if !model_path.exists() {
            return Err(format!(
                "model file not found: {} (role: {})", model_path.display(), role.role
            ).into());
        }
        if !tokenizer_path.exists() {
            return Err(format!(
                "tokenizer not found: {} (role: {})", tokenizer_path.display(), role.role
            ).into());
        }

        let provider = IcBuiltInProvider::new(model_path, tokenizer_path, role.role.clone());
        providers.push((role.role.clone(), provider));
    }

    Ok(providers)
}
```

This is ~70 lines of IC-specific code for a spec that only IC defines.

---

## 6. Chat Template Formatting

Candle's model implementations handle the forward pass but don't prescribe how chat messages are formatted into a prompt string. IC needs this because the `LlmProvider` trait accepts structured `ChatMessage` arrays, but the underlying model expects a single prompt string.

```rust
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025–present Iron Curtain contributors
//
// Chat template formatting. IC-specific because IC defines
// which models ship in default packs and their prompt formats.

/// Format structured chat messages into a prompt string using ChatML.
/// Both Qwen2 and Phi use ChatML-compatible templates.
pub fn format_chat_prompt(messages: &[ChatMessage]) -> String {
    let mut prompt = String::with_capacity(2048);
    for msg in messages {
        let role_tag = match msg.role {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
        };
        prompt.push_str("<|im_start|>");
        prompt.push_str(role_tag);
        prompt.push('\n');
        prompt.push_str(&msg.content);
        prompt.push_str("<|im_end|>\n");
    }
    // Prompt the model to generate an assistant response
    prompt.push_str("<|im_start|>assistant\n");
    prompt
}
```

~25 lines. Trivial, but IC-specific because it depends on which models IC ships.

---

## 7. Grammar-Constrained Decoding (IC-Specific)

This is the one area where IC may need custom code. The orchestrator AI needs structured JSON output (D044), and grammar-constrained decoding ensures the model only generates valid JSON without parse-and-retry loops.

Candle does not ship a grammar constraint system. Options:

### Option A: Use the `outlines-core` Crate (Recommended if Mature)

[`outlines-core`](https://github.com/dottxt-ai/outlines-core) (Apache 2.0) is a Rust library for structured generation. It builds a token-level index from a JSON schema or regex, then provides a bias mask at each generation step. If it matures to a stable API by IC's Phase 4/7 timeline, IC should depend on it directly — same "assemble, don't reimplement" philosophy.

### Option B: Simple JSON State Machine (~120 lines)

If `outlines-core` doesn't fit IC's needs (too heavy, unstable API, WASM issues), a minimal JSON grammar filter is ~120 lines of custom code. This is one of the cases where building a narrow piece makes more sense than pulling in a larger dependency — IC only needs valid-JSON enforcement, not arbitrary grammar support:

```rust
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025–present Iron Curtain contributors
//
// Minimal JSON grammar filter for the orchestrator's structured output.
// Only written if outlines-core doesn't meet IC's needs at implementation time.

use tokenizers::Tokenizer;

/// Tracks JSON parse state to mask invalid continuations.
pub struct JsonGrammarFilter {
    /// Stack of nested contexts: Object, Array, String, etc.
    stack: Vec<JsonContext>,
    /// Whether the last character was an escape backslash.
    escaped: bool,
}

#[derive(Debug, Clone, PartialEq)]
enum JsonContext {
    Object,
    Array,
    String,
    Number,
    /// Top level — expecting any JSON value.
    Root,
}

impl JsonGrammarFilter {
    pub fn new() -> Self {
        Self { stack: vec![JsonContext::Root], escaped: false }
    }

    /// Advance the parser state after a token is generated.
    pub fn advance(&mut self, token_text: &str) {
        for ch in token_text.chars() {
            let ctx = self.stack.last().cloned().unwrap_or(JsonContext::Root);
            match ctx {
                JsonContext::String => {
                    if self.escaped {
                        self.escaped = false;
                    } else if ch == '\\' {
                        self.escaped = true;
                    } else if ch == '"' {
                        self.stack.pop(); // end of string
                    }
                }
                _ => match ch {
                    '{' => self.stack.push(JsonContext::Object),
                    '[' => self.stack.push(JsonContext::Array),
                    '"' => self.stack.push(JsonContext::String),
                    '}' | ']' => { self.stack.pop(); }
                    _ => {} // whitespace, colons, commas, digits, booleans
                },
            }
        }
    }

    /// Compute a bias vector: 0.0 for valid tokens, NEG_INFINITY for invalid.
    /// Only tokens that could continue valid JSON are allowed.
    pub fn compute_bias(&self, vocab_size: usize, tokenizer: &Tokenizer) -> Vec<f32> {
        let mut bias = vec![0.0f32; vocab_size];
        let ctx = self.stack.last().cloned().unwrap_or(JsonContext::Root);

        // In a string context, nearly all tokens are valid.
        // In structural contexts, restrict to valid JSON characters.
        if ctx != JsonContext::String {
            for id in 0..vocab_size as u32 {
                if let Some(text) = tokenizer.id_to_token(id) {
                    let trimmed = text.trim_start();
                    if !trimmed.is_empty() && !is_valid_json_continuation(trimmed, &ctx) {
                        bias[id as usize] = f32::NEG_INFINITY;
                    }
                }
            }
        }
        bias
    }
}

fn is_valid_json_continuation(s: &str, ctx: &JsonContext) -> bool {
    let first = match s.chars().next() {
        Some(c) => c,
        None => return true,
    };
    match ctx {
        JsonContext::Root => matches!(first, '{' | '[' | '"' | '0'..='9' | '-' | 't' | 'f' | 'n'),
        JsonContext::Object => matches!(first, '"' | '}' | ',' | ':' | ' ' | '\n'),
        JsonContext::Array => matches!(
            first,
            '{' | '[' | '"' | '0'..='9' | '-' | 't' | 'f' | 'n' | ']' | ',' | ' ' | '\n'
        ),
        JsonContext::Number => matches!(
            first,
            '0'..='9' | '.' | 'e' | 'E' | '-' | '+' | ',' | '}' | ']' | ' ' | '\n'
        ),
        JsonContext::String => true, // handled separately
    }
}
```

---

## 8. Bevy Integration via Thread Pool

No new patterns needed. `IcBuiltInProvider` implements `LlmProvider`, so it plugs directly into the existing async consultation pattern from `byollm-implementation-spec.md`:

```rust
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025–present Iron Curtain contributors
//
// Registration with ProviderFactory — identical pattern for all providers.

use crate::provider::ProviderFactory;

pub fn register_builtin_provider(factory: &mut ProviderFactory) {
    factory.register("ic-built-in", |cfg| {
        let model_path = PathBuf::from(&cfg.endpoint);
        let tokenizer_path = model_path.with_file_name("tokenizer.json");
        Ok(Box::new(IcBuiltInProvider::new(
            model_path, tokenizer_path, cfg.model.clone(),
        )))
    });
}

// The spawn/poll pattern is already defined in byollm-implementation-spec.md §1.2.
// IcBuiltInProvider is just another LlmProvider instance — no special handling.
// Bevy's AsyncComputeTaskPool runs the CPU-bound inference on a worker thread.
```

Zero new architecture. The trait abstraction pays off — `LlmOrchestratorAi`, `TaskRouter`, rate limiting, error handling, and the skill library are completely unaware of which provider is running.

---

## 9. Dependency Inventory

### Crates IC Adds to `Cargo.toml`

| Crate                 | License        | Provides                                   |
| --------------------- | -------------- | ------------------------------------------ |
| `candle-core`         | MIT/Apache 2.0 | Tensors, GGUF, quantized ops, SIMD, Device |
| `candle-transformers` | MIT/Apache 2.0 | Qwen2, Phi models, sampling, generation    |
| `candle-nn`           | MIT/Apache 2.0 | NN building blocks                         |
| `tokenizers`          | Apache 2.0     | BPE tokenization                           |
| `hf-hub`              | Apache 2.0     | Model download (optional feature flag)     |
| `async-trait`         | MIT/Apache 2.0 | Async trait support (already in ic-llm)    |
| `toml`                | MIT/Apache 2.0 | Manifest parsing (already in ic-game)      |

### What IC Does NOT Depend On

| Not This                     | Why                                                               |
| ---------------------------- | ----------------------------------------------------------------- |
| `llama-cpp-rs` / `llama.cpp` | C/C++ bindings — violates pure Rust goal                          |
| `burn`                       | No GGUF support, would require reimplementing quantized inference |
| `llm` (rustformers)          | Unmaintained, lacks Qwen2/Phi-4 support                           |
| `ort` / ONNX Runtime         | C++ runtime, not pure Rust                                        |

---

## 10. IC-Authored Code Estimate

| Component                              | Est. Lines   | Rationale                                      |
| -------------------------------------- | ------------ | ---------------------------------------------- |
| `IcBuiltInProvider` (LlmProvider impl) | ~170         | Bridge: model load, forward, sample, decode    |
| Model pack manifest loader             | ~70          | IC-specific D047 manifest format               |
| Chat template formatting               | ~25          | ChatML for Qwen2/Phi                           |
| Grammar-constrained JSON filter        | ~120         | IC-specific; only if outlines-core doesn't fit |
| Provider registration                  | ~20          | ProviderFactory wiring                         |
| Tests                                  | ~200         | Integration tests against a small test model   |
| **Total IC-authored**                  | **~400–600** |                                                |

By depending on existing crates instead of reimplementing, IC reduces its code surface by **~80%** compared to writing everything from scratch (~2,750 lines), while gaining:
- Battle-tested SIMD kernels maintained by HuggingFace
- Immediate support for new quant types as candle adds them
- Model architecture updates tracked upstream (Qwen2.5, Phi-4, etc.)
- WASM compatibility tested and maintained by a larger community

---

## 11. WASM Compatibility

A key advantage of the pure Rust crate approach over C/C++ bindings:

| Concern                | candle Status     | Notes                                                |
| ---------------------- | ----------------- | ---------------------------------------------------- |
| `candle-core` → WASM   | ✅ Supported       | `wasm32-unknown-unknown` with `simd128` feature      |
| `tokenizers` → WASM    | ✅ Supported       | Used in HuggingFace's browser inference demos        |
| GGUF loading in WASM   | ✅ Works           | File data passed as byte slice, no filesystem needed |
| SIMD in browser        | ✅ wasm simd128    | Supported in Chrome 91+, Firefox 89+, Safari 16.4+   |
| `std::arch` intrinsics | ✅ Maps to simd128 | candle handles the `#[cfg(target_feature)]` dispatch |

With C/C++ bindings (llama-cpp-rs), WASM would require cross-compiling C++ to WASM via Emscripten — a brittle toolchain. With candle, `cargo build --target wasm32-unknown-unknown` just works.

---

## 12. Risk Assessment

### Risk: candle API breaking changes

**Severity:** Low-Medium.

**Mitigation:** Pin candle version in `Cargo.toml` per IC's Bevy version pinning strategy. candle follows semver. Even across major versions, the core `ModelWeights::from_gguf()` → `forward()` → `LogitsProcessor::sample()` pipeline has been stable since candle 0.3. IC's ~400-line bridge is small enough to adapt quickly.

### Risk: candle doesn't support a future model architecture IC wants

**Severity:** Low.

**Mitigation:** candle-transformers already supports 30+ architectures. If IC adds a model to the default pack that candle doesn't support, IC can implement a single model architecture against candle-core's tensor API — that's ~200 lines of model definition, not a GGUF parser or SIMD kernel rewrite. This follows the "only build custom where the crate doesn't cover it" principle.

### Risk: Performance gap vs. llama.cpp

**Severity:** Low.

**Analysis:** candle's quantized CPU inference benchmarks at ~80–90% of llama.cpp throughput for equivalent quant types. For IC's small models (1.5B–3.8B params), this means ~15–25 tokens/sec on a modern CPU vs. llama.cpp's ~20–30 tok/s. IC's consultation interval is 10 seconds (~200 tokens budget) — both speeds are well within budget.

### Risk: candle crate size bloat

**Severity:** Low.

**Mitigation:** candle supports feature flags. IC only enables CPU backend (`candle-core/default-features = false`) and the specific model architectures needed. GPU backends (CUDA, Metal) are behind feature flags and not compiled in.

### Risk: Maintenance burden if candle becomes unmaintained

**Severity:** Low.

**Mitigation:** candle is MIT/Apache 2.0 — IC can fork if needed. More importantly, candle is HuggingFace's strategic Rust investment with corporate backing and production use. Even in the unlikely event of abandonment, the pinned version continues to work (it's a library, not a service). IC could also migrate to another pure Rust inference library if one emerges, since the bridge layer is only ~400 lines.

---

## Conclusion

The feasibility of IC's Tier 1 pure Rust inference runtime rests on a simple observation: **the hard problems are already solved by existing MIT/Apache 2.0 Rust crates**. IC's job is assembly and integration, not reimplementation.

| Layer                               | Who Provides It           | IC Code      |
| ----------------------------------- | ------------------------- | ------------ |
| GGUF parsing                        | candle-core               | 0 lines      |
| Quantized tensor types + SIMD       | candle-core               | 0 lines      |
| Transformer forward pass + KV cache | candle-transformers       | 0 lines      |
| Tokenization                        | tokenizers                | 0 lines      |
| Sampling (temperature, top-p)       | candle-transformers       | 0 lines      |
| **LlmProvider bridge**              | **IC**                    | **~170**     |
| **Model pack loading**              | **IC**                    | **~70**      |
| **Chat templates**                  | **IC**                    | **~25**      |
| **Grammar constraint**              | **IC (or outlines-core)** | **~0–120**   |
| **Tests**                           | **IC**                    | **~200**     |
| **Total IC-authored**               |                           | **~400–600** |

Zero C/C++ dependencies. WASM-compatible out of the box. The `LlmProvider` trait abstraction means the rest of ic-llm doesn't know or care whether the inference runs on candle, Ollama, OpenAI, or anything else.
