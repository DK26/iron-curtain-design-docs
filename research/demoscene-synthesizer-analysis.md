# Demoscene Software Synthesizer Analysis â€” V2, 4klang, Oidos, and Peers

> **Status:** Research reference
> **Relevance to IC:** Informs `cnc-formats` MIDI support (Phase 0), LLM music generation via MIDI/ABC (Phase 7+, D016/D047), procedural SFX generation patterns, and asset size optimization strategies
> **Cross-references:** `research/llm-soundtrack-generation-design.md`, `research/text-encoded-visual-assets-for-llm-generation.md`, `research/audio-library-music-integration-design.md`

---

## Executive Summary

Demoscene software synthesizers solve the same problem IC's LLM audio generation pipeline faces: produce complex, high-quality audio from minimal data. A 96KB executable (.kkrieger) contained a full FPS game with ambient music, weapon sounds, and environment audio â€” all synthesized in real-time from ~2â€“5 KB of patch data plus a compressed MIDI-like event stream. This analysis extracts the architectural patterns, patch definition formats, SFX synthesis techniques, and size/quality tradeoffs from six major demoscene synths.

**Key takeaway for IC:** Demoscene synth patch data is almost entirely **arrays of 0â€“127 byte values** (MIDI-style). These are trivially LLM-generatable â€” a patch is essentially 50â€“150 numbers in a defined schema. The ABCâ†’MIDIâ†’SoundFont pipeline in `llm-soundtrack-generation-design.md` is the right approach for music, but for procedural SFX, the demoscene pattern of **synthesizer parameter arrays** interpreted by a built-in synth engine would be far more compact and flexible than rendering pre-recorded samples.

---

## 1. Farbrausch V2 Synthesizer (Used in .kkrieger)

### Source

`github.com/farbrausch/fr_public`, directory `v2/`. Originally x86 assembly, ported to C++ by Tammo "kb" Hinrichs (2012). ~3,300 lines in `synth_core.cpp`. BSD-2/public domain license.

### Architecture Overview

The V2 is a **polyphonic subtractive synthesizer** with 64-voice polyphony across 16 MIDI channels, rendering at 44.1 kHz base sample rate. The signal chain per voice is:

```
3 Oscillators â†’ 2 Filters (single/serial/parallel routing) â†’ Distortion â†’ DC Filter â†’ Stereo Pan â†’ Channel Bus
```

Per-channel effects chain:
```
DC Filter â†’ Compressor â†’ Bass Boost â†’ Distortion/Chorus (configurable order) â†’ DC Filter â†’ Aux Send A/B
```

Global effects:
```
Aux A â†’ Reverb â†’ Master
Aux B â†’ Modulating Delay â†’ Master
Master â†’ DC Filter â†’ Compressor â†’ Low/High Cut â†’ Output
```

### Oscillator (V2Osc) â€” 8 Modes

| Mode    | Description                    | Implementation                                                                                     |
| ------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| OFF     | Silent                         | â€”                                                                                                |
| TRI_SAW | Triangle/sawtooth blend        | Bandlimited via box filter convolution; `color` parameter sets breakpoint between triangle and saw |
| PULSE   | Pulse wave with variable width | Bandlimited; `color` controls pulse width                                                          |
| SIN     | Sine wave                      | Uses `fastsin()` cosine lookup                                                                     |
| NOISE   | Filtered noise                 | LRC state-variable filter on random values; `color` controls filter cutoff                         |
| FM_SIN  | FM synthesis                   | Carrier = sine, modulator = voice buffer (output from previous oscillators)                        |
| AUXA    | Aux bus A input                | Feeds external audio into the voice                                                                |
| AUXB    | Aux bus B input                | Feeds external audio into the voice                                                                |

Each voice has 3 oscillators (`NOSC=3`). Parameters per oscillator: `mode`, `ring` (ring modulation on/off), `pitch`, `detune`, `color`, `gain`. Oscillator counters optionally reset on key-on (`FULL` sync = reset everything, `OSC` sync = reset just oscillator counters).

### Envelope (V2Env) â€” ADSSR Model

Not standard ADSR â€” uses an ADSSR (Attack, Decay, Sustain, Sustain-Rate, Release) model:

- **Attack:** Additive ramp toward level 128
- **Decay:** Multiplicative decay toward sustain level
- **Sustain:** Multiplicative decay toward a sustain target (not static â€” continues decaying)
- **Release:** Multiplicative decay toward zero

States: `OFF â†’ ATTACK â†’ DECAY â†’ SUSTAIN â†’ RELEASE`. 2 envelopes per voice (`NENV=2`). Envelope 0 directly controls voice amplitude.

### Filter (V2Flt) â€” 8 Modes

| Mode                            | Type                                           |
| ------------------------------- | ---------------------------------------------- |
| BYPASS                          | No filtering                                   |
| LOW / BAND / HIGH / NOTCH / ALL | State-variable filter (V2LRC), 2Ã— oversampled |
| MOOGL                           | Moog-style lowpass (4-pole ladder)             |
| MOOGH                           | Moog-style highpass                            |

2 filters per voice (`NFLT=2`). Three routing modes: `SINGLE` (one filter), `SERIAL` (filter1 â†’ filter2), `PARALLEL` (mix with balance control). Parameters: `mode`, `cutoff`, `reso` (resonance).

### LFO (V2LFO) â€” 5 Waveforms

SAW, TRI, PULSE, SIN, S&H (sample-and-hold). Features: sync to key-on, one-shot (envelope generator mode), rate, phase offset, polarity (+, -, +/-), amplitude. 2 LFOs per voice (`NLFO=2`).

### Distortion (V2Dist) â€” 5+ Modes

| Mode         | Algorithm                                                 |
| ------------ | --------------------------------------------------------- |
| OVERDRIVE    | `fastatan()` soft clipping                                |
| CLIP         | Hard clip                                                 |
| BITCRUSHER   | Quantize + XOR                                            |
| DECIMATOR    | Sample rate reduction                                     |
| Filter modes | All V2Flt filter types also available as distortion modes |

Parameters: `mode`, `ingain`, `param1`, `param2`.

### Effects

- **V2Reverb:** Freeverb-style â€” 4 parallel comb filters per stereo channel (with damping/feedback), fed into 2 serial allpass filters, plus a high-pass low-cut filter. Fixed delay line sizes (1309, 1635, 1811, 1926 samples for left combs). Parameters: `revtime`, `highcut`, `lowcut`, `vol`.

- **V2ModDel (Modulating Delay/Chorus):** Stereo delay with triangle-wave LFO modulation. Parameters: `amount` (dry/wet), `feedback`, L/R `length`, mod `rate`/`depth`/`stereo phase`.

- **V2Comp (Compressor):** Peak or RMS detection, mono or stereo linking. Lookahead delay line, with threshold, ratio, attack, release, output gain, autogain. Ring buffers for RMS calculation and lookahead delay.

- **V2Boost (Bass Boost):** Fixed low-shelving EQ at ~150 Hz using a 2nd-order IIR biquad filter.

### Patch Definition Format (V2Sound)

```c
struct V2Sound {
    sU8 voice[sizeof(syVV2)/sizeof(sF32)];  // ~50-60 bytes â€” one byte per float parameter
    sU8 chan[sizeof(syVChan)/sizeof(sF32)];  // ~30-40 bytes â€” channel effect parameters
    sU8 maxpoly;                              // Maximum polyphony for this patch
    sU8 modnum;                               // Number of modulation matrix entries
    V2Mod modmatrix[];                        // Variable length: 3 bytes per entry
};
```

**All parameters are single bytes (0â€“127 range).** The synthesis engine linearly maps each byte to its float working range. A typical patch is **80â€“150 bytes total** depending on modulation complexity.

### Modulation Matrix (V2Mod)

Each modulation entry is 3 bytes:
```c
struct V2Mod {
    sU8 source;  // velocity, CC1-7, env0, env1, lfo0, lfo1, note
    sU8 val;     // -1.0 .. +1.0 mapped from 0..128 (64 = zero)
    sU8 dest;    // Parameter index into the V2Sound byte array
};
```

**Modulation application:** Base byte values are copied to float parameters, then each mod entry adjusts the destination: `param[dest] = clamp(param[dest] + scale * source_value, 0, 128)`.

### Patch Bank (V2PatchMap)

128 program slots. Structure: `sU32 offsets[128]` (512 bytes) followed by raw patch data. Each offset indexes into the raw data block. On program change, the relevant patch bytes are copied and the modulation matrix entries loaded.

### V2M Player Format (v2mplayer.h)

The V2M format is a compressed MIDI-like event stream. Structure per channel:
- `notenum/noteptr` â€” Note on/off events with delta timing
- `pcnum/pcptr` â€” Program changes
- `pbnum/pbptr` â€” Pitch bend events
- 7 CC tracks: `ccnum[7]/ccptr[7]` â€” Controller changes

Plus global fields: `patchmap` (embedded patch bank), `globals` (reverb/delay/compressor settings), `timediv` (timing resolution), `maxtime` (song length). Optional speech data for the Ronan vocoder (MIDI channel 16).

The V2M format achieves excellent compression ratios because the event data is delta-encoded and the patch format packs well under LZW/arithmetic compression.

### MIDI Processing (processMIDI)

Parses raw MIDI byte stream with running status. Handles:
- **Note On:** Voice allocation with oldest-steal policy across 64 voices
- **Note Off:** Releases matching voice envelope
- **CC 1â€“7:** Stored in `chans[].ctl[]` for modulation matrix sources
- **CC 120:** All sound off (kills all voices on channel)
- **CC 123:** All notes off (releases all voices on channel)
- **Program Change:** Switches patch, kills active voices on channel
- **System Reset:** Panic â€” kills everything

### .kkrieger Audio Implementation

From the `werkkzeug3_kkrieger/` directory in fr_public, the file `_viruz2.hpp` shows a `sViruz2` class wrapping `CV2MPlayer`. The entire game's audio â€” ambient music, weapon sounds, explosions, UI feedback â€” was synthesized by V2 from:

- **Patch data:** ~128 patches Ã— ~100 bytes average = ~12 KB uncompressed (compresses to ~2â€“5 KB)
- **Song/event data:** V2M stream with note events for music tracks, likely ~5â€“15 KB compressed
- **Synth engine code:** ~15â€“20 KB compressed (the V2 ASM core was extremely compact)

Total audio footprint in the 96 KB executable: estimated **8â€“15 KB** including engine code, patches, and event data. This produced:
- Background music (multiple tracks/moods)
- Weapon fire sounds (synthesized from drum-hit-like patches)
- Explosion sounds (noise + filtered sweep + distortion)
- Ambient environmental sounds (pad patches with slow modulation)
- UI click/confirmation sounds (short envelope, simple waveform)

The .kkrieger Wikipedia article confirms: "The game music and sounds are produced by a multifunctional synthesizer called V2, which is fed a continuous stream of MIDI data. The synthesizer then produces the music in real time."

---

## 2. 4klang (Alcatraz)

### Source

`github.com/hzdgopher/4klang`. NASM assembly core + Win32 GUI wrapper. Created by Dominik Ries (gopher/Alcatraz). Versions: 3.0 (2012, source release), 3.0.1 (2013 bugfix), 3.11 (2015, 8klang extension), 3.2.x (2018+).

### Architecture

4klang uses a **stack-based signal processing model**. Unlike the fixed signal chain of V2, 4klang processes audio by pushing values onto a signal stack and applying operations:

- **Oscillator node:** Pushes generated waveform onto the stack. Modes include sine, sawtooth, pulse, triangle, noise, gate.
- **Filter node:** Pops input, applies filter, pushes result
- **Distortion node:** Pops input, applies distortion, pushes result
- **Arithmetic node:** Stack operations â€” push, pop, add, multiply, etc.
- **Envelope node:** ADSR envelope generator
- **LFO node:** Low-frequency oscillator
- **Store node:** Saves/loads signals for reuse and cross-instrument modulation
- **Delay/Reverb:** Global effects

This stack-based approach is extremely compact in compiled form â€” each instrument is a sequence of node operations. The NASM assembly core evaluates the stack machine per sample.

### Key Characteristics

- **16 MIDI channels** via a single VST instance (singleton pattern â€” same as V2)
- **VST plugin** for composition in any DAW (Renoise, FL Studio, MadTracker, Cubase, etc.)
- **Export to .asm/.obj:** The VST exports instrument definitions and song data as assembly source or object files for direct linking into an intro executable
- **Polyphony:** Configurable per patch (1Ã—, 2Ã—, etc.)
- **Modulation targets:** Envelope (attack, decay, release), filter, various parameters
- **Note buffer access:** Can read MIDI note values in the signal chain
- **Output format:** Stereo IEEE float buffer (44.1 kHz)
- **Cross-platform export:** Win32 .obj, Linux ELF, macOS Mach-O

### Patch Format

Patches are defined by the sequence of stack operations. Each instrument has an ordered list of nodes with byte-valued parameters. The 4klang VSTi saves all 16 instrument patches plus global delay/reverb settings to a binary file. The exported `.inc` file contains the instrument data as assembly constants.

### Size Budget

4klang is designed for **4 KB intros** (4,096 bytes total including visuals). A typical 4klang setup:
- Synth engine (player): ~1â€“2 KB compressed
- Patch definitions: ~200â€“800 bytes for 4â€“8 instruments
- Song data: ~500â€“2,000 bytes
- Total audio: ~2â€“3 KB in a 4 KB intro

### Sound Design Notes (from pouet.net community)

- Stack-based approach described as "a coder's synth" â€” powerful but requires understanding signal flow
- Wobble bass achievable via LFO â†’ filter cutoff modulation (stored parameters allow cross-instrument modulation)
- The 3.11 "8klang" extension added stereo flags, 64 slots per instrument, and instrument linking â€” aimed at 8K+ intros

---

## 3. Oidos (Aske Simon Christensen / Blueberry)

### Source

`github.com/askeksa/Oidos`. **33.2% Rust**, 28.9% Python, 19.8% Assembly, 11.8% Lua. Zlib license. 145 GitHub stars. Active development as of 2025 (recently updated to Rust 2024 edition).

### Architecture â€” Pure Additive Synthesis

Oidos takes a radically different approach from subtractive synths like V2 or 4klang. It is a **pure additive synthesizer** â€” sound is generated by summing a large number of individual sine waves ("partials"). No filters, no oscillator waveform selection.

The synthesis process:
1. From a **random seed**, generate `modes Ã— fat` partials with frequencies distributed around the base note
2. Each partial has an amplitude determined by its frequency and the `sharpness` parameter
3. The `harmonicity` parameter pulls partial frequencies toward/away from integer multiples of the base frequency (harmonics vs. inharmonics)
4. Apply per-partial amplitude decay over time (frequency-dependent via `decaylow`/`decayhigh`)
5. Apply a frequency-domain filter (specified by `filterlow`/`filterhigh` with slopes and sweeps)
6. Sum all partials, apply a nonlinear gain distortion
7. Apply amplitude envelope (attack/release)

### Parameters (All Values Are Floats Quantized to "Nice" Values)

| Parameter                | Role                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `seed`                   | Random seed for all frequency/amplitude randomization          |
| `modes`                  | Number of resonant mode groups                                 |
| `fat`                    | Number of partials per mode                                    |
| `width`                  | Spread of partial frequencies within a mode                    |
| `overtones`              | Range of mode center frequencies (semitones above base)        |
| `sharpness`              | High-frequency amplitude emphasis                              |
| `harmonicity`            | Pull toward/away from harmonic series                          |
| `decaylow`/`decayhigh`   | Frequency-dependent amplitude decay rate                       |
| `filterlow`/`filterhigh` | Band-pass filter on partials (+ slopes + sweeps)               |
| `gain`                   | Nonlinear distortion strength                                  |
| `attack`/`release`       | Amplitude envelope                                             |
| `q*` parameters          | Quantization â€” rounds internal values for better compression |

### Reverb (OidosReverb)

A separate VST effect. "Strength in numbers" approach â€” many parallel filtered feedback delays. Parameters: `mix`, `pan`, `delaymin`/`delaymax`/`delayadd`, `halftime`, filter limits, `dampen` limits, `n` (number of delays), `seed`.

### Workflow

Composition in **Renoise** tracker. Rules: one instrument per note column, no effect commands, no per-note panning/delay. The `OidosConvert` tool converts `.xrns` (Renoise song) to assembly source for inclusion in an intro. The converter outputs statistics on memory usage, computation burden, tone counts â€” essential for size optimization.

### Key Innovation: Precomputation

Oidos **precomputes the entire waveform for each unique tone/velocity combination** at load time. This means:
- Sound quality can be extremely high (thousands of partials summed)
- Playback is just mixing precomputed buffers â€” very cheap at runtime
- **Parameter automation is impossible** (sound is fully determined at note-on time)
- Memory cost = (number of unique tones) Ã— (longest note length)

### Size Budget

Used in 4K and 8K intros. The Oidos player (Rust + ASM) is compact. Instrument data compresses well because the quantization parameters round values to compression-friendly representations.

### Rust Components

The `synth/` and `reverb/` directories contain Rust code (updated to Rust 2024 edition). The `convert/` directory is the Renoise-to-ASM converter. The `player/` directory is the C + ASM runtime player.

---

## 4. 64klang (Alcatraz)

### Source

`github.com/gopher-atz/64klang`. C++ synth core (SSE4.1), .NET/WPF GUI. MIT license. 283 GitHub stars. By Dominik Ries (gopher/Alcatraz) â€” same author as 4klang.

### Architecture â€” Modular Node Graph

64klang is a **modular, node-graph-based synthesizer** â€” the "big brother" of 4klang, designed for **64 KB intros**. Unlike 4klang's stack machine, 64klang uses a fully general directed graph of processing nodes.

Key architectural features:
- **Node graph evaluated per sample** â€” enables sample-exact feedback loops
- **Unlimited connection topology** â€” any node output can feed any node input
- **Physical modeling:** Delay-based physical modeling (Karplus-Strong, waveguide) is possible through the per-sample feedback capability
- **Synthesis modes:** AM, FM, subtractive, physical modeling, all achievable through node routing
- **C++ core with heavy SSE4.1 optimization** â€” inspired by Ralph Borson (revivalizer)'s blog posts on SIMD softsynth development
- **16 MIDI channels** via singleton VST instance
- **Full source code available** (VSTiPluginSourceCode directory)

### History

- v1 (~2010â€“2011): Extended 4klang concept, ASM core, Win32 GUI â€” functional but unmaintainable
- v2 (2012â€“2014): Complete rewrite, C++/SSE4.1 core, .NET WPF GUI with proper node graph visualization, zooming, etc.

### Node Types

Based on the source structure (`VSTiPluginSourceCode/`), 64klang includes nodes for:
- Oscillators (multiple waveform types)
- Filters (various topologies)
- Envelopes and LFOs
- Delay lines (essential for physical modeling)
- Arithmetic/mixing operations
- Samplers (wavetable oscillators)
- Effects (reverb, compression, distortion, chorus)

### Size Budget

Targeting 64 KB and 32 KB executable music. Used in several prize-winning 64k intros and 32k executable music tracks by Alcatraz members (pOWL, Virgill).

---

## 5. Clinkster (Loonies / Blueberry)

### Source

Distributed as ZIP from crinkler.net. x86 NASM assembly player + Renoise VST. By Aske Simon Christensen (Blueberry) â€” same author as Oidos. Released 2013.

### Architecture â€” 2-Operator Phase Modulation

Clinkster is a **monolithic, non-modular synthesizer** using 2-operator PM (phase modulation, technically the same as Yamaha DX-series "FM" synthesis). It has **no filters** at all.

Sound quality comes from:
- **Layering:** Multiple voices per note with slight detuning
- **Random stereo variation:** Gives a "voluminous" spatial feeling
- **2Ã— oversampling:** Reduces aliasing artifacts
- **Careful use of the two PM operators** with various waveforms

### Waveforms

Available as BaseWave and ModWave:
- Sine, triangle, sawtooth, square, parabola (asymmetric â€” primarily useful as ModWave)

### Workflow

Same as Oidos â€” compose in Renoise, convert `.xrns` to assembly:
```
Renoise (.xrns) â†’ ClinksterConvert â†’ clinkster.asm â†’ link with intro
```

Like Oidos, Clinkster **precomputes sound per unique tone/velocity/length combination**, making parameter automation impossible but enabling excellent quality and compact code.

### Key Characteristics

- **Extremely compact player:** The assembly player is tiny â€” well-suited for 4K intros
- **No filter processing:** All timbral variation comes from PM modulation depth, waveform choice, layering, and detuning
- **Delay effect:** Supported as a global effect
- **Musician-friendly:** Blueberry describes it as "made for musicians who are bad coders, rather than coders who are bad musicians" â€” contrasting with 4klang's coder-oriented stack model
- **Multithreaded version available:** Computes left/right channels in separate threads for ~2Ã— faster precomputation

### Productions

Extensively used by Loonies in 4K intros: Nevada, Lumniagia, Sult, Solskool, Ikadalawampu, Terminal Fuckup, Trask, Michigan, Traskogen, and many others.

---

## 6. WaveSabre (Logicoma)

### Source

`github.com/logicomacorp/WaveSabre`. C++ core + C# toolchain. MIT license. 262 GitHub stars. By ferris (yupferris) and h0ffman of Logicoma.

### Architecture

WaveSabre is a **complete synthesizer and toolchain** for 64K intro music. Unlike the other synths which are single VSTs, WaveSabre is a collection of individual VST instruments and effects:

- Multiple synthesizer VSTs (each with different synthesis approaches)
- Effect VSTs (reverb, compression, delay, EQ, etc.)
- **WaveSabreConvert:** Converts DAW project files (Ableton Live, FL Studio) to a compact binary format
- **WaveSabrePlayerLib:** Runtime player for intros

### Workflow

The key innovation is the **DAW conversion pipeline** â€” compose normally in a standard DAW using WaveSabre's VSTs, then convert the entire project to a minimal binary representation for playback in the intro.

### Productions

Used in many award-winning Logicoma productions: `dope on wax` (2019), `trashpanda` (2018), `bros before foes` (2018), `iota` (2018), `soundproof motion` (2017), `engage` (2017), `elysian` (2016), `backscatter` (2015).

### Talks

Extensive documentation through conference talks:
- "Massive Sound, Tiny Data - WaveSabre 64k Synth" (Demobit 2019)
- "WaveSabre - A Case Study in 64k Synthesis" (The Gathering 2013)
- "Ferris Makes Demos Ep.001 - WaveSabre" (2017 stream)

---

## 7. Tunefish v4

### Source

`github.com/paynebc/tunefish`. C++/JUCE. Cross-platform VST plugin. ~299 GitHub stars. Used by Brain Control in demoscene intros.

### Architecture

Tunefish is a **virtual analog synthesizer** â€” a more traditional subtractive synthesizer architecture:
- Multiple oscillators with standard waveform types
- Filters (lowpass, highpass, bandpass)
- Envelopes and LFOs
- Effects (reverb, delay, flanger, chorus, distortion, EQ, formant filter)

Designed as a smaller replacement for Tunefish v3 with roughly equivalent power. Specifically developed for the intro "Turtles all the way down" which required maximally efficient music production in minimal code.

---

## Comparative Analysis

### Synthesis Approaches

| Synth     | Approach                            | Key Strength                                                                       |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| V2        | Subtractive (osc â†’ filter â†’ fx) | Full-featured, versatile, proven in production game (.kkrieger)                    |
| 4klang    | Stack-based signal processing       | Extremely compact code, ideal for 4K                                               |
| Oidos     | Pure additive (sum of partials)     | Unique timbres impossible with subtractive synthesis, excellent quality/byte ratio |
| 64klang   | Modular node graph                  | Maximum flexibility, physical modeling, unlimited routing                          |
| Clinkster | 2-op phase modulation               | Minimal code size, musician-friendly, surprisingly rich sound from simple tech     |
| WaveSabre | Collection of specialized VSTs      | Standard DAW workflow, multiple synthesis types                                    |
| Tunefish  | Virtual analog                      | Traditional, approachable, JUCE-based                                              |

### Patch Format Comparison

| Synth     | Format                                        | Typical Patch Size          | LLM-Generatable?                                         |
| --------- | --------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| V2        | Byte array (0â€“127) + 3-byte mod entries     | 80â€“150 bytes              | **Excellent** â€” just 50â€“150 integers in a schema     |
| 4klang    | Stack operation sequence with byte parameters | 50â€“200 bytes              | **Good** â€” ordered node list with parameters           |
| Oidos     | ~20 float parameters (quantized)              | ~80 bytes                   | **Excellent** â€” small parameter count, well-documented |
| 64klang   | Node graph serialization                      | Variable (graph complexity) | **Moderate** â€” graph topology adds complexity          |
| Clinkster | ~10â€“15 parameters per instrument            | ~60 bytes                   | **Excellent** â€” minimal parameter count                |
| WaveSabre | Per-VST parameter blobs                       | Variable                    | **Moderate** â€” depends on which synth VSTs used        |

### Size Comparison (Typical Audio Budget)

| Context              | Synth Engine         | Patch Data    | Song Data     | Total     |
| -------------------- | -------------------- | ------------- | ------------- | --------- |
| 4K intro             | 4klang/Clinkster     | 200â€“800 B   | 500â€“2,000 B | 1â€“3 KB  |
| 8K intro             | 4klang 8klang/Oidos  | 500â€“2,000 B | 1â€“5 KB      | 2â€“6 KB  |
| 64K intro            | V2/64klang/WaveSabre | 2â€“8 KB      | 5â€“20 KB     | 8â€“25 KB |
| 96K game (.kkrieger) | V2                   | ~5 KB         | ~8 KB         | ~15 KB    |

### Quality Assessment

**V2:** Professional-quality sound â€” used in actual game production. The combination of bandlimited oscillators, Moog filter emulation, Freeverb reverb, and comprehensive modulation matrix produces sounds indistinguishable from commercial synths for most use cases. The subtractive model is well-understood and covers the vast majority of classic game audio needs.

**4klang:** Impressive sound quality for its extreme compactness. The stack model can produce complex timbres but requires coding-style thinking. Best for chiptune-influenced, aggressive, or textural sounds.

**Oidos:** Unique and often wonderful-sounding â€” the additive approach excels at evolving pad textures, bell-like tones, and sounds with unusual harmonic content that subtractive synths struggle with. However, it's computationally heavy (many partials to sum) and the precomputation model means no real-time parameter changes.

**64klang:** The most sonically versatile â€” physical modeling, cross-modulation, arbitrary feedback loops. Can produce sounds none of the others can. The per-sample node graph evaluation enables sample-accurate feedback for Karplus-Strong plucked strings, waveguide wind instruments, etc.

**Clinkster:** Surprisingly good sound from just 2-op PM synthesis. The layering/detuning/stereo-spread trick compensates for the lack of filters. Excel at synthetic/digital timbres â€” less suitable for warm analog-style sounds.

**WaveSabre:** High production values â€” Logicoma's intros consistently have excellent audio quality.

---

## SFX Synthesis Patterns

### How .kkrieger Achieved Game Audio in <15 KB

.kkrieger used V2 patches designed specifically for game sound effects. The techniques:

**Weapon Sounds (Gunshots/Lasers):**
- Noise oscillator with very short attack/fast decay envelope â†’ bang/crack
- Distortion (overdrive/clip) for aggressive character
- High-frequency content from pulse oscillator mixed with noise
- Filter sweep (high â†’ low) for the characteristic "pew" of energy weapons
- Very short notes (< 100ms) triggered on fire events

**Explosions:**
- Noise oscillator with medium attack, long decay â†’ rumble
- Low-pass filter with fast cutoff sweep (high â†’ low) â†’ boom character
- Distortion (bitcrusher or overdrive) for grit
- Bass boost for the chest-thump feeling
- Reverb send for spatial impact
- Longer notes (200â€“500ms) with the envelope tail fading naturally

**Ambient/Environmental:**
- Pad-style patches: slow attack, sustained, slow release
- Detuned oscillators for warmth/width
- Slow LFO â†’ filter cutoff for evolving texture
- Low volume, continuous playback on a dedicated MIDI channel
- Multiple layers: bass drone + mid-range texture + occasional high-frequency detail

**UI Feedback (Clicks, Confirmations):**
- Sine or triangle oscillator
- Extremely short envelope (< 20ms attack, < 50ms release)
- High pitch for "click", ascending two-note for "confirm", descending for "cancel"
- Minimal reverb â†’ dry, immediate feedback

**Footsteps/Impacts:**
- Very short noise burst with tight bandpass filter
- Envelope: near-zero attack, 10â€“30ms decay
- Filter cutoff variation between hits for natural variation
- Subtle pitch randomization via modulation matrix (velocity â†’ pitch)

### General Demoscene SFX Patterns

The demoscene SFX approach can be summarized as:

1. **Every sound is a synthesizer event** â€” no samples, no recordings
2. **Timbre = oscillator selection + filter + distortion**
3. **Shape = envelope + modulation routing**
4. **Variation = modulation from velocity/CC/random sources**
5. **Space = reverb send amount per sound category**

This model maps directly to a parameterized SFX schema:

```yaml
sfx_explosion:
  oscillator: noise
  filter: lowpass
  filter_cutoff: 100      # Initial cutoff (0-127)
  filter_sweep: -80        # Cutoff movement over duration
  envelope_attack: 5       # Fast attack (0-127)
  envelope_decay: 90       # Long decay
  distortion: overdrive
  distortion_amount: 80
  reverb_send: 60
  duration_ms: 400
```

---

## Rust-Based Synths and Ports

### Existing Rust Projects

| Project       | Description                                  | Relevance                                          |
| ------------- | -------------------------------------------- | -------------------------------------------------- |
| **Oidos**     | 33.2% Rust â€” synth core and reverb modules | Active, modern Rust edition, proven in demoscene   |
| **sonant-rs** | Rust port of Sonant 4K synthesizer           | Directly relevant â€” demoscene synth in pure Rust |
| **surge-rs**  | Rust port of Surge open-source synthesizer   | Large, full-featured synth engine                  |
| **glicol**    | Rust audio live-coding language              | Node-graph audio processing in Rust                |
| **hodaun**    | Rust audio I/O and synthesis library         | General-purpose audio synthesis                    |

### Assessment for IC

No existing Rust crate provides a demoscene-style "synthesizer from parameter bytes" engine suitable for IC's procedural SFX generation. However, the building blocks exist:

- **Oidos** proves additive synthesis can be implemented cleanly in Rust
- **sonant-rs** proves a 4K synth can be ported to Rust
- **surge-rs** proves a full-featured synth engine is viable in Rust

For IC's purposes, the ABCâ†’MIDIâ†’SoundFont pipeline (documented in `llm-soundtrack-generation-design.md`) handles music generation well. For procedural SFX, a lightweight **parameter-driven synth** (inspired by V2's byte-array patch format) could be ~500â€“1,000 lines of Rust â€” significantly simpler than porting a full demoscene synth, and tailored to IC's specific SFX needs.

---

## Implications for IC

### For Existing Design (LLM Music Generation via MIDI)

The demoscene analysis **validates** the ABCâ†’MIDIâ†’SoundFont approach documented in `llm-soundtrack-generation-design.md`:

1. **MIDI-like event streams are the proven pattern** â€” V2M, 4klang export, Oidos converter all produce compressed MIDI-style event data
2. **Symbolic music representation is compressible** â€” delta encoding + entropy coding achieves excellent ratios (the demoscene proves this)
3. **LLMs can generate patch parameters** â€” if a human musician can create a V2 patch by setting 50â€“150 byte values in a GUI, an LLM can generate equivalent JSON: `{"oscillator": "noise", "filter_cutoff": 100, "decay": 90, ...}`

### For Procedural SFX (New Design Consideration)

The demoscene pattern suggests a possible IC extension (Phase 7+, optional):

**A lightweight SFX synthesis engine** in `ic-audio` that generates sound effects from YAML-defined parameter schemas â€” no sample files needed. A mod could define:

```yaml
# In weapon_rules.yaml
Weapons:
  Rifle:
    Sound: !synth
      type: impact
      oscillator: noise
      filter: lowpass_sweep
      envelope: percussive
      pitch_base: 60
      decay: 30
      distortion: clip
      reverb: 0.3
```

This is strictly a future proposal, not a current commitment. But the demoscene proves the approach works â€” .kkrieger shipped an entire game's audio this way.

### For Asset Size Optimization

The demoscene size discipline offers useful principles:
- **Quantize everything** â€” Oidos's quantization parameters reduce entropy before compression
- **Delta-encode event streams** â€” Timestamps as deltas from previous event, not absolute
- **Reuse through variation** â€” One patch + modulation matrix beat five separate patches
- **Precompute when possible** â€” Trade load-time computation for storage (Oidos/Clinkster model)

### For LLM Patch Generation

The V2 and Oidos patch formats are **ideal for LLM generation**:
- Small, bounded parameter spaces (20â€“60 parameters, each 0â€“127 or a small float range)
- Well-defined parameter semantics (each parameter has a clear audio effect)
- Deterministic â€” same parameters always produce the same sound
- JSON-representable â€” `{"modes": 15, "fat": 4, "harmonicity": 80, "decay_low": 40, ...}`

A future IC "LLM SFX Prompt" could work like:
```
User: "Create a laser gun sound effect"
LLM generates: {"type": "laser", "osc": "sin+pulse", "filter": "bandpass_sweep_down",
                 "attack_ms": 2, "decay_ms": 150, "pitch": "C5â†’C3", "reverb": 0.1}
Engine renders: 150ms WAV from parameters
```

This is documented here as a research finding, not a committed design. The ABCâ†’MIDIâ†’SoundFont pipeline remains IC's planned approach for Phase 7.
