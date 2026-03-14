# Transcribe Module Upgrade Roadmap

## Overview

The `transcribe` module in `cnc-formats` (behind the `transcribe` feature flag) provides WAV/PCM-to-MIDI audio transcription — converting audio waveforms into symbolic MIDI note data. The current implementation uses basic YIN pitch detection with energy-based onset detection and produces SMF Type 0 MIDI output. This roadmap defines a phased upgrade path from "basic demo" to commercial-tool-competitive quality.

**Current state (2026-03-14):** 60 tests passing, clippy clean, fmt clean. Files: `pitch.rs` (YIN pitch detection + `freq_to_midi_note` / `midi_note_to_freq`), `onset.rs` (energy-based onset detection, `DetectedNote`, velocity estimation), `quantize.rs` (note-to-MIDI events, VLQ encoding, SMF Type 0 assembly), `mod.rs` (public API: `pcm_to_mid`, `pcm_to_notes`, `notes_to_mid`, `wav_to_mid`, `wav_to_xmi`, `mid_to_xmi`), `tests.rs` (20 tests: functionality, errors, Display, determinism, XMI roundtrip), `tests_validation.rs` (19 tests: boundary, overflow, V38 adversarial).

## Quality Tiers

The upgrade has two tiers, each behind its own feature flag:

| Aspect | PRISM ($69) | Current (basic YIN) | DSP-only (Phases 1-6, `transcribe`) | ML-enhanced (Phase 7, `transcribe-ml`) |
|--------|-------------|---------------------|--------------------------------------|----------------------------------------|
| Approach | Proprietary neural nets | Single-threshold YIN | pYIN + HMM + spectral flux | Basic Pitch CNN (~17K params) |
| Polyphonic | Yes (trained models) | No | Basic (HPS, 2-6 voices) | Yes (native multi-pitch) |
| Instrument-specific | Yes (piano, guitar, general) | No | No (generic spectral) | No (instrument-agnostic) |
| Monophonic quality | Excellent | Basic | Good (pYIN proven) | Excellent |
| Polyphonic quality | Excellent | N/A | Moderate (simple textures) | Good-Excellent |
| Pitch bend | Yes | No | Phase 6 only | Native (model output head) |
| Dependencies | Large ML runtime | Zero | Zero (Phases 1-4, 6) | `ort` or `candle-core` + ~3 MB model |
| Tuning | Sensitivity knob | `yin_threshold` only | Many knobs | `min_confidence` + `onset_threshold` |
| License | Proprietary | MIT/Apache-2.0 | MIT/Apache-2.0 | Apache-2.0 (model + code) |

PRISM (Aurally Sound, $69 plugin) is the commercial quality benchmark. DSP-only gets comparable to `aubio`/`librosa`/`essentia` with pYIN. ML-enhanced approaches PRISM-competitive quality using Spotify's open-source Basic Pitch model.

## Phase Plan

### Phase 1: pYIN + Viterbi (~600 lines) -- HIGHEST PRIORITY

**Why:** Eliminates octave errors (the biggest quality issue with basic YIN), smooths pitch transitions, gives voicing probability per frame.

**Algorithm:**
1. Replace single YIN threshold with 100 thresholds (0.01-1.0, step 0.01)
2. Weight candidates using **Beta(alpha=2, beta=18)** prior distribution
3. Unvoiced probability = residual mass where no CMNDF dip found
4. **HMM Viterbi decoding**: states = 480 pitch values (10-cent resolution, 50-800 Hz) + 1 unvoiced state
5. Transition matrix: Gaussian kernel (sigma=13 cents) favoring small pitch changes
6. Decode entire sequence -> smoothed pitch track

**New parameters:** `use_pyin: bool` (default: true), `beta_alpha: f32` (2.0), `beta_beta: f32` (18.0), `hmm_transition_width: f32` (13.0 cents), `voicing_penalty: f32` (0.01)

**References:** Mauch & Dixon, "pYIN: A Fundamental Frequency Estimator Using Probabilistic Threshold Distributions" (ICASSP 2014). `pyin-rs` crate on crates.io (study, don't depend on).

### Phase 2: SuperFlux Onset Detection (~300 lines)

**Why:** Better note boundaries, handles fast passages, vibrato-tolerant.

**Algorithm:**
1. Compute STFT (n_fft=2048, hop=441 i.e. 10 ms at 44.1 kHz, Hann window)
2. Apply log compression: `S_log = log(1 + gamma * |X|)` where gamma=10-100
3. Apply 138-band mel filterbank (quarter-tone resolution, 27.5-16000 Hz)
4. Maximum filter of width 3 along frequency axis on previous frame (absorbs vibrato)
5. Half-wave rectified spectral flux: `SF(n) = sum max(0, S(n) - S(n-lag))`
6. Adaptive threshold: `threshold(n) = median(SF[n-W:n+W]) + delta`
7. Peak picking with minimum inter-onset interval

**New parameters:** `onset_method: OnsetMethod` (Energy | SpectralFlux | SuperFlux, default Energy), `onset_gamma: f32` (10.0), `onset_threshold_delta: f32` (0.05), `min_inter_onset_ms: u32` (30), `onset_lag: u8` (2)

**FFT requirement:** Requires a basic FFT implementation. Options: inline radix-2 Cooley-Tukey in ~150 lines (sufficient for fixed power-of-2 sizes), or add `rustfft` as optional dep behind the `transcribe` feature. This decision also applies to Phase 5 (polyphonic HPS).

**References:** Bock & Widmer, "Maximum Filter Vibrato Suppression for Onset Detection" (DAFx 2013).

### Phase 3: Confidence Scoring (~100 lines)

**Why:** Lets users filter by quality -- "only keep notes I'm sure about."

**Algorithm:** Fuse three signals per frame:
1. `yin_confidence = 1.0 - cmndf_min` (already available from YIN)
2. `hnr = 10 * log10(r(tau) / (1 - r(tau)))` (harmonic-to-noise ratio from autocorrelation)
3. `spectral_flatness = geometric_mean(|X|) / arithmetic_mean(|X|)` (Wiener entropy; 0=tonal, 1=noise)

Combined: `confidence = 0.5*(1-cmndf) + 0.3*sigmoid(hnr-5) + 0.2*(1-flatness)`

**New parameter:** `min_confidence: f32` (default: 0.0, i.e. keep all). Adds `confidence: f32` field to `DetectedNote`.

### Phase 4: Median Filter Smoothing (~50 lines)

**Why:** Removes isolated glitch frames (single-frame octave jumps, noise spikes).

**Algorithm:** After pitch detection, before onset segmentation, apply a median filter of configurable width to the MIDI note sequence.

**New parameter:** `median_filter_width: u8` (odd number, 0=disabled, default: 3)

### Phase 5: Basic Polyphonic Detection (~400 lines)

**Why:** Detect 2-6 simultaneous voices without ML.

**Algorithm: Harmonic Product Spectrum (HPS) with iterative subtraction:**
1. Compute FFT magnitude spectrum
2. Downsample by factors 2..H, multiply -> HPS peak = fundamental
3. Subtract detected harmonics (Gaussian spectral template, width ~20 Hz)
4. Repeat on residual to find next voice
5. Stop when HPS peak-to-median ratio < threshold

**New parameters:** `max_voices: u8` (1=mono default, 2-6=poly), `num_harmonics: u8` (5), `subtraction_gain: f32` (0.9), `peak_threshold: f32` (3.0)

**Output change:** Multi-voice produces Type 1 MIDI (one track per voice) or all on channel 0 with overlapping notes.

### Phase 6: Pitch Bend Output (~100 lines)

**Why:** Preserves expression -- portamento, vibrato, micro-tuning.

**Algorithm:** When the detected frequency deviates from the nearest MIDI note by more than a configurable threshold, emit MIDI pitch bend events alongside the note.

**New parameter:** `pitch_bend: bool` (default: false)

### Phase 7: ML-Enhanced Transcription (~500 lines) -- PREMIUM

**Why:** Replaces the entire DSP pitch+onset pipeline with a single neural model that natively outputs polyphonic notes, onsets, and pitch bends. This is the path to commercial-competitive quality.

**Model: Spotify Basic Pitch**
- Apache-2.0 license (code and weights)
- ~17,000 parameters, <20 MB peak memory, ~3 MB ONNX weights
- Architecture: harmonic stacking input -> shallow CNN -> 3 output heads (notes, onsets, pitch bends)
- Polyphonic, instrument-agnostic, includes pitch bend detection natively
- Paper: Bittner et al., "A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation" (ICASSP 2022)
- ONNX weights ship with the official Python package and are on Hugging Face (`spotify/basic-pitch`)
- Prior art: `basicpitch.cpp` (C++20 port with ONNXRuntime) proves the model runs outside Python

**Integration -- two options:**

| | Option A: `ort` (ONNX Runtime) | Option B: `candle` (pure Rust) |
|-|-------------------------------|-------------------------------|
| Crate | `ort` v2.x (pyke.io) | `candle-core` + `candle-nn` v0.9.x |
| How | Load Basic Pitch `.onnx` directly | Reimplement ~17K-param CNN in Rust, load safetensors weights |
| Native deps | Links to ONNX Runtime C library | None (pure Rust) |
| Code effort | ~200 lines (glue + pre/post processing) | ~400 lines (model architecture + weight loading) |
| GPU support | CUDA, DirectML, CoreML via execution providers | CUDA, Metal via candle backends |
| Maturity | Production-grade (Microsoft-backed runtime) | Newer but actively maintained (Hugging Face) |
| Model format | `.onnx` (standard, portable) | `.safetensors` (needs weight conversion from ONNX) |

**Recommendation:** Start with Option A (`ort`) for fastest path to working ML inference. The `ort` crate wraps ONNX Runtime which is battle-tested. Basic Pitch already ships ONNX weights. If pure-Rust becomes a hard requirement later, port to candle -- the model is small enough that reimplementing the architecture is straightforward.

**Feature flag structure:**
```toml
[features]
transcribe = ["midi"]                                    # DSP-only
transcribe-ml = ["transcribe", "dep:ort"]                # ML-enhanced via ONNX Runtime
# Alternative pure-Rust path:
# transcribe-ml = ["transcribe", "dep:candle-core", "dep:candle-nn"]
```

**New files:** `src/transcribe/ml.rs` (model loading, pre-processing, inference, post-processing), `src/transcribe/ml_tests.rs` (synthetic audio tests, comparison with DSP path, adversarial inputs)

**How it integrates with existing API:**
```rust
pub fn pcm_to_mid(samples: &[f32], sample_rate: u32, config: &TranscribeConfig) -> Result<Vec<u8>> {
    #[cfg(feature = "transcribe-ml")]
    if config.use_ml {
        return ml::pcm_to_notes_ml(samples, sample_rate, config)
            .map(|notes| notes_to_mid(&notes, config));
    }
    // Fall back to DSP pipeline
    let pitches = pitch::detect_pitches(/* ... */);
    // ...
}
```

**New config parameters:** `use_ml: bool` (prefer ML model when `transcribe-ml` is enabled, default: true when feature active), `ml_onset_threshold: f32` (0.5), `ml_note_threshold: f32` (0.5), `ml_model_path: Option<PathBuf>` (custom model path, default: embedded or downloaded)

**Model weight distribution options:**
1. Embed in binary via `include_bytes!` (~3 MB increase in binary size) -- simplest
2. Separate `cnc-formats-models` crate -- keeps main crate small, model downloaded as dep
3. Download on first use -- smallest binary, requires network access

**Reusability beyond MIDI transcription:** The ML infrastructure (`ort` or `candle`) unlocked by this phase enables future modules: audio classification (instrument detection), format detection (classify unknown binary blobs), sprite upscaling (SHP super-resolution), palette optimization (learned palette generation). These would be separate feature flags sharing the same runtime dependency.

## Complete TranscribeConfig (after all phases)

```rust
pub struct TranscribeConfig {
    // --- Core (Phase 0, already implemented) ---
    pub yin_threshold: f32,         // 0.0-1.0, default 0.15
    pub window_size: usize,         // default 2048
    pub hop_size: usize,            // default 512
    pub min_freq: f32,              // Hz, default 80.0
    pub max_freq: f32,              // Hz, default 2000.0
    pub min_duration_ms: u32,       // default 50
    pub ticks_per_beat: u16,        // default 480
    pub tempo_bpm: u16,             // default 120
    pub channel: u8,                // 0-15, default 0
    pub velocity: u8,               // 1-127, default 100
    pub estimate_velocity: bool,    // default false

    // --- Phase 1: pYIN ---
    pub use_pyin: bool,             // default true
    pub beta_alpha: f32,            // Beta prior shape, default 2.0
    pub beta_beta: f32,             // Beta prior shape, default 18.0
    pub hmm_transition_width: f32,  // cents, default 13.0
    pub voicing_penalty: f32,       // default 0.01

    // --- Phase 2: Onset ---
    pub onset_method: OnsetMethod,  // Energy|SpectralFlux|SuperFlux, default Energy
    pub onset_gamma: f32,           // log compression, default 10.0
    pub onset_threshold_delta: f32, // adaptive offset, default 0.05
    pub min_inter_onset_ms: u32,    // default 30
    pub onset_lag: u8,              // SuperFlux lag, default 2

    // --- Phase 3: Confidence ---
    pub min_confidence: f32,        // 0.0-1.0, default 0.0

    // --- Phase 4: Smoothing ---
    pub median_filter_width: u8,    // 0=disabled, default 3

    // --- Phase 5: Polyphonic ---
    pub max_voices: u8,             // 1=mono, 2-6=poly, default 1
    pub num_harmonics: u8,          // HPS harmonics, default 5
    pub subtraction_gain: f32,      // harmonic removal, default 0.9
    pub peak_threshold: f32,        // HPS acceptance, default 3.0

    // --- Phase 6: Expression ---
    pub pitch_bend: bool,           // default false

    // --- Phase 7: ML (behind transcribe-ml feature) ---
    pub use_ml: bool,               // prefer ML model when available, default true
    pub ml_onset_threshold: f32,    // onset activation threshold, default 0.5
    pub ml_note_threshold: f32,     // note activation threshold, default 0.5
    pub ml_model_path: Option<std::path::PathBuf>, // custom .onnx path, None=embedded

    // --- Post-processing ---
    pub quantize_grid: Option<u32>, // snap to grid (ticks), None=free
}
```

## Test Strategy Per Phase

Each phase adds tests following AGENTS.md testing requirements:
- **Happy path** with synthetic audio (known frequencies -> known MIDI notes)
- **Comparison:** pYIN should detect the same note as YIN on clean sine, but NOT produce octave errors on edge cases
- **Adversarial:** NaN, Infinity, all-zeros, all-ones -> no panic
- **Determinism:** same input -> same output
- **Boundary:** min/max frequency, single frame, huge input

## Key Design Constraints

**DSP path (Phases 1-4, 6):** No new crate dependencies. All algorithms are pure arithmetic on `f32` slices. Phase 5 (polyphonic) needs FFT -- either inline radix-2 Cooley-Tukey (~150 lines) or optional `rustfft` dep. Phase 2 (SuperFlux) also needs FFT, so the FFT question must be decided at Phase 2.

**ML path (Phase 7):** Gated behind `transcribe-ml` feature flag. The DSP path must remain fully functional without ML deps -- `transcribe` alone never pulls in `ort` or `candle`. Users who don't want the ML overhead get the same zero-dep DSP pipeline. The ML path is strictly additive.

## External References

**DSP:**
- pYIN paper: Mauch & Dixon, ICASSP 2014
- SuperFlux: Bock & Widmer, DAFx 2013
- HPS: Schroeder (1968), improved by Noll (1970)
- YIN: de Cheveigne & Kawahara, JASA 2002
- `pyin-rs` crate: crates.io (Rust pYIN reference, study only)
- `pitch-detection` crate: crates.io (McLeod pitch method, Rust)

**ML:**
- Basic Pitch paper: Bittner et al., ICASSP 2022
- Basic Pitch repo: github.com/spotify/basic-pitch (Apache-2.0)
- Basic Pitch weights: huggingface.co/spotify/basic-pitch
- basicpitch.cpp (C++ port): github.com/sevagh/basicpitch.cpp
- CREPE: Kim et al., ICASSP 2018 (MIT)
- CREPE ONNX weights: github.com/yqzhishen/onnxcrepe
- `ort` crate: crates.io/crates/ort (ONNX Runtime for Rust, pyke.io)
- `candle` framework: github.com/huggingface/candle (MIT/Apache-2.0)

**Commercial:**
- PRISM: aurallysound.com (ML-based, $69, proprietary -- quality benchmark only)
