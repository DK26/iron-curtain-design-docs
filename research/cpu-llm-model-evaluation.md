# CPU-Only LLM Model Evaluation for IC Built-in (Tier 1)

> Research document evaluating small language models for CPU-only inference as
> IC's Built-in tier (D047 Tier 1). All models evaluated in GGUF quantized form
> for IC's pure Rust inference runtime. Target: minimal gameplay impact on 8 GB RAM
> systems without GPU.

## IC Task Requirements Summary

IC uses LLMs for several distinct task roles (D047, BYOLLM spec). Each has
different latency, quality, and output format requirements:

| Task                       | Role           | Latency Budget                             | Typical Output   | Format                       | Quality Need                   |
| -------------------------- | -------------- | ------------------------------------------ | ---------------- | ---------------------------- | ------------------------------ |
| AI Orchestrator (D044)     | `orchestrator` | ~10s between consultations; 500 max_tokens | 50–200 tokens    | Structured JSON              | Moderate — must parse reliably |
| Post-Match Coaching (D042) | `coaching`     | Seconds to minutes (post-match)            | 500–1500 tokens  | Natural language + structure | Moderate-high                  |
| Replay Analysis (D042)     | `coaching`     | No real-time constraint                    | 500–2000 tokens  | Natural language + stats     | Moderate-high                  |
| Mission Generation (D016)  | `generation`   | One-shot, user waits                       | 1000–4000 tokens | YAML + Lua                   | High — must be valid syntax    |
| Campaign Briefings (D016)  | `generation`   | One-shot, user waits                       | 500–2000 tokens  | Natural language (narrative) | High — creative quality        |
| Asset Generation (D040)    | `generation`   | SDK tool, user waits                       | Variable         | YAML/structured              | High                           |
| Voice Synthesis            | (future)       | —                                          | —                | —                            | Out of scope for text LLMs     |
| Music Generation           | (future)       | —                                          | —                | —                            | Out of scope for text LLMs     |

**Key constraint:** The `orchestrator` role runs *during gameplay*. It must not
cause frame drops or perceptible stuttering. All other roles run outside active
gameplay (post-match, SDK, menus) where a few seconds of latency is acceptable.

## CPU Inference Performance Model

Text generation speed on CPU is dominated by **memory bandwidth**, not compute.
Each token requires reading the full model weights from RAM once (memory-bound
decode). The formula:

```
Theoretical tok/s ≈ RAM Bandwidth (GB/s) / Model Size (GB)
Real-world tok/s ≈ Theoretical × 0.55–0.70 (overhead factor)
```

Reference memory bandwidth by platform:

| RAM Type         | Bandwidth (dual-channel) | Typical Hardware                        |
| ---------------- | ------------------------ | --------------------------------------- |
| DDR4-2400        | ~38 GB/s                 | 2016–2018 laptops, budget desktops      |
| DDR4-3200        | ~51 GB/s                 | 2019–2022 mainstream desktops           |
| DDR5-4800        | ~77 GB/s                 | 2022+ desktops/laptops                  |
| LPDDR5-6400      | ~51 GB/s                 | Modern ultrabooks, Steam Deck           |
| ARM (OnePlus 12) | ~50 GB/s                 | Mobile reference (Llama 3.2 benchmarks) |

**What this means for model sizes at Q4_K_M quantization:**

| Model Size (params) | GGUF Q4_K_M (approx) | DDR4-2400 tok/s | DDR4-3200 tok/s | DDR5-4800 tok/s |
| ------------------- | -------------------- | --------------- | --------------- | --------------- |
| ~0.5B               | ~0.4 GB              | ~55             | ~70             | ~105            |
| ~1.0B               | ~0.7 GB              | ~30             | ~40             | ~60             |
| ~1.5B               | ~1.0 GB              | ~22             | ~30             | ~45             |
| ~3.0B               | ~1.9 GB              | ~12             | ~16             | ~24             |
| ~3.8B               | ~2.5 GB              | ~9              | ~12             | ~18             |

*Estimates based on the bandwidth model, validated against Llama 3.2 ARM data
(3B SpinQuant: 19.7 tok/s on ~50 GB/s mobile SoC) and Mac Pro 2013 Xeon data
(7B Q4_0: ~10.8 tok/s CPU-only on 2013-era Xeon).*

## Candidate Models

### ~1B Parameter Class (Orchestrator Candidates)

| Model            | Params | Context         | License    | MMLU | BBH  | GSM8K | JSON/Tool         | Q4_K_M Size |
| ---------------- | ------ | --------------- | ---------- | ---- | ---- | ----- | ----------------- | ----------- |
| **Gemma 3 1B**   | 1.0B   | 32K             | Gemma      | 59.6 | 28.4 | 38.4  | No native         | ~0.7 GB     |
| **Qwen2.5-0.5B** | 0.49B  | 32K             | Apache 2.0 | —    | —    | —     | Yes (Qwen family) | ~0.4 GB     |
| **SmolLM2-1.7B** | 1.7B   | 8K              | Apache 2.0 | —    | 32.2 | 48.2  | 27% BFCL          | ~1.1 GB     |
| **Llama 3.2-1B** | 1.24B  | 128K (8K quant) | Llama 3.2  | —    | —    | —     | Moderate          | ~0.7 GB     |

### ~1.5B Parameter Class (Orchestrator/Light Coaching)

| Model            | Params | Context | License    | MMLU | BBH | GSM8K | JSON/Tool            | Q4_K_M Size |
| ---------------- | ------ | ------- | ---------- | ---- | --- | ----- | -------------------- | ----------- |
| **Qwen2.5-1.5B** | 1.54B  | 32K     | Apache 2.0 | —    | —   | —     | Strong (Qwen family) | ~1.0 GB     |

Qwen2.5 is specifically noted for "generating structured outputs especially
JSON" in its model card. The Qwen family consistently leads structured output
benchmarks at every size. This is the critical differentiator for the orchestrator
role, which requires reliable JSON parsing.

### ~3–4B Parameter Class (Coaching/Generation Candidates)

| Model            | Params | Context         | License    | MMLU | BBH  | GSM8K | MATH | Tool Call | Q4_K_M Size |
| ---------------- | ------ | --------------- | ---------- | ---- | ---- | ----- | ---- | --------- | ----------- |
| **Phi-4-mini**   | 3.8B   | 128K            | MIT        | 67.3 | 70.4 | 88.6  | 64.0 | Native    | ~2.5 GB     |
| **Qwen2.5-3B**   | 3.09B  | 32K             | Apache 2.0 | —    | —    | —     | —    | Strong    | 1.93 GB     |
| **Llama 3.2-3B** | 3.21B  | 128K (8K quant) | Llama 3.2  | 63.4 | —    | 77.7  | 48.0 | 67% BFCL  | ~2.0 GB     |
| **Phi-3.5-mini** | 3.8B   | 128K            | MIT        | 69.0 | 69.0 | 86.2  | 48.5 | Moderate  | ~2.5 GB     |
| **Gemma 3 4B**   | 4.0B   | 128K            | Gemma      | 74.5 | 50.9 | 71.0  | 43.3 | No native | ~2.6 GB     |

**Phi-4-mini is the clear winner** in the 3–4B class:
- Highest overall benchmark score (63.5 composite) among models ≤4B
- Strongest reasoning (BBH 70.4 — significantly ahead of all competitors)
- Strongest math (MATH 64.0 — 15+ points ahead of Phi-3.5-mini)
- Native tool/function calling support
- MIT license — maximally permissive, zero redistribution friction
- Released February 2025 — benefits from latest training techniques

## Task-to-Model Mapping

### Orchestrator Role

**Requirements:** Fast inference (must complete within ~10s consultation window),
reliable JSON output, small RAM footprint during gameplay.

**Typical workload:** 200–400 token prompt → 50–200 token JSON response.
At ~30 tok/s (1.5B Q4_K_M on DDR4-3200): ~2–7 seconds. Fits the window.
At ~12 tok/s (3B Q4_K_M on DDR4-2400 worst case): ~4–17 seconds. Too slow on
older hardware at high end.

**Recommendation: Qwen2.5-1.5B-Instruct (Q4_K_M)**

| Criterion         | Rating | Notes                                              |
| ----------------- | ------ | -------------------------------------------------- |
| Speed             | ★★★★★  | ~1.0 GB model, fastest viable option               |
| JSON reliability  | ★★★★★  | Qwen family is purpose-built for structured output |
| Reasoning quality | ★★★☆☆  | Adequate for tactical decision-making              |
| License           | ★★★★★  | Apache 2.0 — ideal for bundling                    |
| RAM footprint     | ★★★★★  | ~2 GB runtime (model + KV cache)                   |

**Runner-up:** Gemma 3 1B for even lower RAM (~1.5 GB runtime) on extremely
constrained systems, though weaker JSON adherence (BBH 28.4 vs likely higher for
Qwen2.5-1.5B) and Gemma license adds redistribution friction.

**Why not smaller?** Qwen2.5-0.5B exists but its reasoning quality is too low for
tactical AI decisions. The orchestrator needs to read game state summaries and
produce coherent strategic assessments — 0.5B models hallucinate too frequently.

**Why not larger?** A 3B model during gameplay risks:
- Consuming ~3.5–4 GB RAM during a game (model + KV cache), leaving marginal
  headroom on 8 GB systems running both the game and the OS
- Slower inference increases the chance of the consultation window slipping,
  which cascades into delayed AI decisions
- The async polling model (BYOLLM spec §2.1) handles slow responses gracefully,
  but the *gameplay experience* degrades if the AI takes 15+ seconds to react

### Coaching Role

**Requirements:** Good reasoning and analytical quality, natural language + light
structure, runs post-match (no real-time constraint), can afford higher RAM.

**Typical workload:** 500–1500 token prompt → 500–1500 token response.
At ~12 tok/s (3.8B Q4_K_M on DDR4-3200): ~40–125 seconds. Acceptable post-match.

**Recommendation: Phi-4-mini-instruct (Q4_K_M)**

| Criterion         | Rating | Notes                                        |
| ----------------- | ------ | -------------------------------------------- |
| Speed             | ★★★☆☆  | ~2.5 GB model, 12–18 tok/s on typical CPUs   |
| Reasoning quality | ★★★★★  | BBH 70.4, best-in-class reasoning for size   |
| Analytical depth  | ★★★★★  | GSM8K 88.6, strong quantitative analysis     |
| Natural language  | ★★★★☆  | Good fluency, some prompt engineering needed |
| License           | ★★★★★  | MIT — ideal                                  |
| RAM footprint     | ★★★☆☆  | ~4 GB runtime                                |

**Runner-up:** Qwen2.5-3B-Instruct for ~0.5 GB less RAM at slight quality cost.
Qwen2.5-3B Q4_K_M is 1.93 GB (vs 2.5 GB for Phi-4-mini), meaningful on
constrained systems.

### Generation Role

**Requirements:** Highest quality output, must produce syntactically valid YAML,
Lua, and narrative text. Speed is secondary — user waits consciously.

**Typical workload:** 500–2000 token prompt → 1000–4000 token response.
At ~12 tok/s (3.8B Q4_K_M): ~80–330 seconds. A progress bar is essential.

**Recommendation: Phi-4-mini-instruct (Q5_K_M)**

Same model as coaching, but at higher quantization (Q5_K_M ≈ 3.0 GB) for
maximum quality since speed is not the priority. Users in the SDK can afford to
wait, and the quality improvement from Q5_K_M vs Q4_K_M is material for
syntax-sensitive output like YAML and Lua.

| Criterion        | Rating | Notes                                        |
| ---------------- | ------ | -------------------------------------------- |
| YAML/Lua syntax  | ★★★★☆  | HumanEval ~62, strong code generation        |
| Creative writing | ★★★★☆  | Adequate for briefings; cloud tier is better |
| Quality at size  | ★★★★★  | Best benchmarks in ≤4B class                 |
| License          | ★★★★★  | MIT                                          |

**Important caveat:** For mission generation and campaign briefings, the built-in
tier provides a *functional baseline*. Users who want publication-quality output
should upgrade to cloud providers (Tier 2–3) which offer 70B+ class models. The
built-in tier makes the feature *work*; cloud makes it *shine*. This is the exact
design intent of the tiered system.

## Recommended Default Model Packs

### IC Essential (Default Pack)

Ships as the default when users enable "AI Features" in Quick Setup.

```toml
# Orchestrator pack
[pack]
id = "ic.builtin.orchestrator-v1"
display_name = "IC Orchestrator"
version = "1.0.0"
roles = ["orchestrator"]
license = "Apache-2.0"

[requirements]
min_ram_gb = 4
recommended_ram_gb = 6
cpu_only = true

[model]
family = "Qwen2.5"
base_model = "Qwen/Qwen2.5-1.5B-Instruct"
format = "gguf"
quantization = "Q4_K_M"
context_window = 4096  # limited for speed; 32K available if needed
filename = "ic-orchestrator-v1-qwen25-1.5b-q4km.gguf"
file_size_mb = 1024    # ~1.0 GB download

[validation]
ic_version = ">=0.8.0"
prompt_profile = "EmbeddedCompact"
eval_suite = "orchestrator-json-v1"
eval_pass_rate = 0.95
```

```toml
# Coaching + Generation pack
[pack]
id = "ic.builtin.coach-gen-v1"
display_name = "IC Coach & Generator"
version = "1.0.0"
roles = ["coaching", "replay_analysis", "generation"]
license = "MIT"

[requirements]
min_ram_gb = 6
recommended_ram_gb = 8
cpu_only = true

[model]
family = "Phi-4"
base_model = "microsoft/Phi-4-mini-instruct"
format = "gguf"
quantization = "Q4_K_M"
context_window = 8192  # limited from 128K for RAM; sufficient for coaching
filename = "ic-coach-gen-v1-phi4mini-q4km.gguf"
file_size_mb = 2560    # ~2.5 GB download

[validation]
ic_version = ">=0.8.0"
prompt_profile = "EmbeddedCompact"
eval_suite = "coaching-generation-v1"
eval_pass_rate = 0.90
```

**Total download:** ~3.5 GB for both packs.
**Runtime RAM (orchestrator during gameplay):** ~2 GB (only orchestrator loaded).
**Runtime RAM (coaching/generation post-match):** ~4 GB (orchestrator unloaded,
coach loaded). The runtime manages model loading/unloading automatically.

### IC Minimal (Lightweight Pack)

For systems with ≤6 GB total RAM or users who want the smallest download.

```toml
[pack]
id = "ic.builtin.minimal-v1"
display_name = "IC Minimal"
version = "1.0.0"
roles = ["orchestrator", "coaching", "replay_analysis"]
license = "Apache-2.0"

[requirements]
min_ram_gb = 4
recommended_ram_gb = 4
cpu_only = true

[model]
family = "Qwen2.5"
base_model = "Qwen/Qwen2.5-1.5B-Instruct"
format = "gguf"
quantization = "Q4_K_M"
context_window = 4096
filename = "ic-minimal-v1-qwen25-1.5b-q4km.gguf"
file_size_mb = 1024

[validation]
ic_version = ">=0.8.0"
prompt_profile = "EmbeddedCompact"
eval_suite = "minimal-all-roles-v1"
eval_pass_rate = 0.85
```

**Total download:** ~1.0 GB. One model serves all roles at reduced quality.
Generation role (mission/campaign) is disabled in this pack — the 1.5B model
cannot reliably produce valid YAML/Lua. Users see a message: "Upgrade to IC
Essential or connect a cloud provider for mission generation."

### IC Enhanced (Quality Pack — Workshop)

Published to Workshop for users with 16+ GB RAM who want the best CPU quality.

```toml
[pack]
id = "ic.builtin.enhanced-v1"
display_name = "IC Enhanced"
version = "1.0.0"
roles = ["orchestrator"]
license = "Apache-2.0"

[requirements]
min_ram_gb = 6
recommended_ram_gb = 8
cpu_only = true

[model]
family = "Qwen2.5"
base_model = "Qwen/Qwen2.5-3B-Instruct"
format = "gguf"
quantization = "Q4_K_M"
context_window = 8192
filename = "ic-enhanced-orch-v1-qwen25-3b-q4km.gguf"
file_size_mb = 1930
```

```toml
[pack]
id = "ic.builtin.enhanced-coach-v1"
display_name = "IC Enhanced Coach"
version = "1.0.0"
roles = ["coaching", "replay_analysis", "generation"]
license = "MIT"

[requirements]
min_ram_gb = 8
recommended_ram_gb = 12
cpu_only = true

[model]
family = "Phi-4"
base_model = "microsoft/Phi-4-mini-instruct"
format = "gguf"
quantization = "Q5_K_M"
context_window = 16384
filename = "ic-enhanced-coach-v1-phi4mini-q5km.gguf"
file_size_mb = 3072
```

**Total download:** ~5.0 GB. Higher quantization + larger context for better
quality.

## License Analysis

| Model           | License             | Bundling OK? | Workshop Redistribution | Notes                                                                                               |
| --------------- | ------------------- | ------------ | ----------------------- | --------------------------------------------------------------------------------------------------- |
| Qwen2.5-1.5B    | Apache 2.0          | ✓            | ✓                       | Ideal. No restrictions.                                                                             |
| Qwen2.5-3B      | Apache 2.0          | ✓            | ✓                       | Same as above.                                                                                      |
| Phi-4-mini      | MIT                 | ✓            | ✓                       | Maximally permissive.                                                                               |
| Phi-3.5-mini    | MIT                 | ✓            | ✓                       | Same as above.                                                                                      |
| SmolLM2-1.7B    | Apache 2.0          | ✓            | ✓                       | HuggingFace's own model.                                                                            |
| Gemma 3 1B/4B   | Gemma               | ⚠            | ⚠                       | Requires license acceptance. Redistribution requires passing through Google's terms. Adds friction. |
| Llama 3.2 1B/3B | Llama 3.2 Community | ⚠            | ⚠                       | >700M MAU needs separate license. Redistribution requires Meta's terms acceptance.                  |

**Conclusion:** Apache 2.0 and MIT models are strongly preferred for IC's
first-party model packs. Gemma and Llama community licenses are viable but add
legal friction for redistribution through the Workshop. Community-published model
packs may use any license — the Workshop resource system already tracks SPDX
identifiers (D030).

## RAM Budget Analysis

Target: 8 GB total system RAM, running IC + OS + model inference.

| Component                  | RAM Usage       | Notes                       |
| -------------------------- | --------------- | --------------------------- |
| OS + background            | ~2.0 GB         | Windows 10/11 typical       |
| IC game (sim + render)     | ~1.5–2.5 GB     | Estimate for 500-unit game  |
| GGUF model (orchestrator)  | ~1.0 GB         | Qwen2.5-1.5B Q4_K_M weights |
| KV cache (4K context)      | ~0.2 GB         | Scales with context window  |
| Inference runtime overhead | ~0.1 GB         | Scratch buffers             |
| **Total during gameplay**  | **~5.0–6.0 GB** | Fits in 8 GB                |
| Headroom                   | ~2.0–3.0 GB     | Comfortable margin          |

Post-match (orchestrator unloaded, Phi-4-mini loaded):

| Component                   | RAM Usage   |
| --------------------------- | ----------- |
| OS + background             | ~2.0 GB     |
| IC (reduced, no active sim) | ~1.0 GB     |
| Phi-4-mini Q4_K_M           | ~2.5 GB     |
| KV cache (8K context)       | ~0.4 GB     |
| **Total post-match**        | **~6.0 GB** |

**Critical design rule:** Only one model is loaded at a time. The runtime must
unload the orchestrator before loading the coach, and vice versa. A warm/cold
loading strategy (keep recently used model in RAM if headroom permits, evict
under pressure) is an optimization for systems with >8 GB RAM.

## Risks and Mitigations

### Risk: Model quality degrades with quantization

**Severity:** Medium. Q4_K_M typically loses 1–3% on benchmarks vs FP16.

**Mitigation:** The eval suite (D047) runs against the *quantized* GGUF, not the
base model. If a quantization level fails the eval threshold, the pack is not
published. IC validates what it ships.

### Risk: CPU inference causes game stutter

**Severity:** High for orchestrator; Low for coaching/generation.

**Mitigation:**
- Inference runs on a dedicated thread, never on the main/render thread
- The async polling model (BYOLLM spec §2.1) means the game loop never blocks
  waiting for inference — it checks for results and acts on them when ready
- Thread priority is set to below-normal to yield to game threads
- If system load is detected (frame time > threshold), consultation interval
  automatically extends (existing backoff mechanism)

### Risk: 1.5B model produces unreliable JSON for orchestrator

**Severity:** Medium.

**Mitigation:**
- The `EmbeddedCompact` prompt profile uses constrained output formatting
  (guided generation / grammar-constrained decoding via the inference
  runtime's grammar feature)
- JSON schema is provided in the system prompt as a strict template
- Parse failures trigger a retry with simplified prompt before falling back to
  the rule-based AI system (D044 always has a non-LLM fallback)
- The eval suite `orchestrator-json-v1` specifically tests JSON parse rate —
  target is ≥95% valid parses

### Risk: Models become outdated

**Severity:** Low-medium.

**Mitigation:** Model packs are versioned Workshop resources tied to IC engine
versions. When better models appear (which happens quarterly in the current
landscape), IC publishes updated packs. The Workshop update mechanism handles
distribution. Users on older engine versions keep their validated packs.

## Excluded Models and Rationale

| Model                     | Why Excluded                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Mistral 7B / Llama 3.1 8B | Too large for CPU-only on 8 GB systems (~5 GB Q4_K_M + KV cache)                                                                |
| TinyLlama 1.1B            | Trained on only 3T tokens (vs 18T for Qwen2.5); significantly weaker benchmarks; superseded                                     |
| StableLM 2 1.6B           | Decent but older (2024-01); SmolLM2 and Qwen2.5-1.5B outperform it on all benchmarks                                            |
| Qwen2.5-0.5B              | Too small for reliable reasoning; suitable only for classification/routing, not generation                                      |
| Gemma 3 4B                | Strong benchmarks but Gemma license adds redistribution friction; Phi-4-mini matches or exceeds it on reasoning while being MIT |
| Gemma 3 1B                | Weaker BBH (28.4) and JSON adherence than Qwen2.5-1.5B; Gemma license                                                           |

## Summary Recommendation

| Role             | Model                        | Size (Q4_K_M) | Runtime RAM | License    | Key Strength                            |
| ---------------- | ---------------------------- | ------------- | ----------- | ---------- | --------------------------------------- |
| **Orchestrator** | Qwen2.5-1.5B-Instruct        | ~1.0 GB       | ~2 GB       | Apache 2.0 | Best JSON output at small size          |
| **Coaching**     | Phi-4-mini-instruct          | ~2.5 GB       | ~4 GB       | MIT        | Best reasoning in ≤4B class             |
| **Generation**   | Phi-4-mini-instruct (Q5_K_M) | ~3.0 GB       | ~5 GB       | MIT        | Best code/creative quality in ≤4B class |

**Two models, two licenses, zero redistribution friction.** The default IC
Essential pack ships ~3.5 GB of model weights and makes every LLM feature
functional on CPU. Users wanting higher quality upgrade to cloud (Tier 2–3) or
bring their own local models (Tier 4).

## Landscape Monitoring

This evaluation reflects models available as of mid-2025. The small model
landscape moves fast. Models to watch for future pack updates:

- **Qwen3 / Qwen2.6 small variants** — Alibaba typically advances structured
  output with each release
- **Phi-5-mini** — Microsoft's ≤4B reasoning continues to improve
- **Gemma 4 small** — if Google moves to a more permissive license
- **SmolLM3** — HuggingFace's next iteration; Apache 2.0 is a strong advantage
- **Llama 4 small** — Meta's distillation techniques are advancing rapidly

The model pack system (D047) makes model upgrades a Workshop resource update,
not an engine change. Pin models per engine version for stability; update
quarterly when validated.

## Runtime Implementation Note

The inference runtime is **pure Rust** — no C/C++ bindings, no FFI. IC depends on
existing pure Rust crates for the heavy lifting: `candle-core` and
`candle-transformers` (HuggingFace, MIT/Apache 2.0) provide GGUF loading,
quantized tensor math with SIMD kernels (AVX2/NEON/WASM simd128), and pre-built
model architectures for both Qwen2 and Phi families. The `tokenizers` crate
(Apache 2.0) handles BPE tokenization. IC writes only a thin bridge layer
(~400–600 lines): `IcBuiltInProvider` implementing the `LlmProvider` trait,
model pack manifest loading (D047), chat template formatting, and
grammar-constrained JSON decoding. This approach is WASM-portable out of the box.
See `research/pure-rust-inference-feasibility.md` for the full architecture and
draft implementations. See D047 § "Runtime embedding."
