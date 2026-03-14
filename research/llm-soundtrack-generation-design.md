# LLM Music & Sound Effect Generation via MIDI â€” Research Design

> **Status:** Research/proposal â€” not a committed design.
> **Phase:** MIDI format support in `cnc-formats` (Phase 0); LLM generation (Phase 7+, optional)
> **Priority class:** `cnc-formats` MIDI = P-Core; LLM generation = P-Optional
> **Dependencies:** `cnc-formats` (D076), audio system (P003 resolved); LLM generation adds D016 (missions), D047 (LLM config manager)
> **Cross-references:** `research/demoscene-synthesizer-analysis.md` (V2/.kkrieger synth analysis, parameter synthesis patterns), `research/audio-library-music-integration-design.md` (Kira audio system), `research/text-encoded-visual-assets-for-llm-generation.md` (IST parallel)

## Design Philosophy

**Zero external dependencies. Works out of the box. No installation wizards, no GPU requirements, no cloud accounts.**

This document covers two distinct but connected capabilities:

1. **MIDI as a first-class format in `cnc-formats` and IC (Phase 0+).** MIDI is the intermediate format for IC's LLM audio generation pipeline (ABC â†’ MIDI â†’ SoundFont â†’ PCM) and a standard format in the broader game modding ecosystem. `cnc-formats` should parse, write, validate, inspect, and convert MIDI files â€” including MIDâ†’WAV conversion via SoundFont synthesis. This is a format support decision independent of LLM generation, and useful to anyone working with game audio in Rust.

2. **LLM-powered music AND sound effect generation via MIDI (Phase 7+, optional).** Text LLMs generate symbolic music notation (ABC format). IC converts it to MIDI, then renders audio through a SoundFont synthesizer. This covers both **soundtrack/music** (ambient, combat, victory themes) and **sound effects** (explosions, gunshots, UI clicks, ability sounds, environmental ambience) â€” anywhere a mod or generated mission needs custom audio.

The entire pipeline â€” from LLM inference through symbolic notation to rendered audio â€” must run self-contained using only pure Rust crates with permissive licenses. This mirrors IC's broader stance: the built-in Tier 1 CPU models (D047) generate text, the IST format (D076) enables sprite generation, and now ABC/MIDI notation enables audio generation â€” all on CPU, all working on day one including in the browser via WASM.

External neural audio models (BYOLLM Tiers 2â€“4) are a **bonus** for users who happen to have GPU hardware or cloud API access. They are documented in an appendix but are not part of the core design.

### Scope: Music AND Sound Effects

MIDI is not just for music. Short MIDI sequences (0.1â€“3 seconds) rendered through appropriate SoundFont patches produce usable sound effects:

- **Weapon sounds:** Drum hits, cymbal crashes, low-frequency booms â†’ explosions, gunshots, impacts
- **UI feedback:** Short melodic notes, clicks, confirmation tones
- **Ability/power sounds:** Synthesizer sweeps, arpeggiated sequences, dramatic stingers
- **Environmental ambience:** Looping pad notes, wind-like textures, industrial drones
- **Alert sounds:** EVA-style notification tones, alarm patterns, warning klaxons

The quality floor for SFX is lower than for music â€” a 0.5-second explosion rendered through a drum kit SoundFont patch is perfectly adequate for a mod that needs custom sounds quickly. Workshop SoundFont packs raise the ceiling. The same pipeline (ABC â†’ MIDI â†’ SoundFont â†’ WAV/OGG) handles both music and SFX â€” the difference is just prompt template and duration.

## Problem Statement

IC's existing audio system (Kira via `bevy_kira_audio`) plays pre-authored music tracks through a 5-mood dynamic music FSM. All soundtrack and SFX content is pre-recorded `.ogg`/`.wav` files. LLM-generated missions (D016) can produce maps, scripts, briefings, and custom factions â€” but the audio is always from the existing pool.

MIDI is a universal standard in game audio tooling and the natural intermediate format for procedural music generation. Yet `cnc-formats` currently has no MIDI support â€” a gap given that IC's LLM generation pipeline (Phase 7+) needs MIDI as its core intermediate representation, and community modders regularly work with `.mid` files in broader game audio workflows.

> **Historical note:** The original C&C games (Tiberian Dawn 1995, Red Alert 1996) shipped music as `.aud` files (Westwood's IMA ADPCM compressed digital audio in `SCORES.MIX`), not MIDI. Earlier Westwood titles used synthesizer-driven formats: Dune II used `.adl` (AdLib OPL2 FM synthesis data), and the Kyrandia series used XMIDI (`.xmi`, an extended MIDI variant for the Miles Sound System) â€” neither is standard `.mid`. The switch to pre-rendered digital audio with C&C gave Westwood hardware-independent playback â€” "Hell March" sounds identical on every sound card. Frank Klepacki composed using MIDI-capable gear, but the distribution format was always pre-rendered digital audio from C&C onwards.

**Two questions:**

1. **Should `cnc-formats` support `.mid` files?** Yes. MIDI is the intermediate format for IC's LLM audio generation pipeline and a universal standard in game audio tooling. Parsing, writing, validation, inspection, and conversion (MIDâ†’WAV via SoundFont synthesis) belongs in `cnc-formats` alongside the existing AUDâ†”WAV conversion. This is useful to modders and tool authors regardless of IC.

2. **Can LLMs generate *new* music and sound effects for IC?** Yes. Text LLMs generate symbolic music notation (ABC format). IC converts it to MIDI, then renders audio through a SoundFont synthesizer. This covers both background music and short SFX stingers.

---

## MIDI in `cnc-formats` (Phase 0 â€” Format Support)

MIDI support in `cnc-formats` is independent of LLM generation. It serves anyone working with game audio:

- **Community tool authors** building game audio utilities in Rust
- **Modders** converting between MIDI and WAV for game engines
- **IC's own Asset Studio** (D040) for audio preview and conversion
- **IC's LLM pipeline** (Phase 7+, optional) as the intermediate format

### Related: Westwood-Lineage Audio Formats (ADL, XMI)

`cnc-formats` also supports two pre-C&C Westwood audio formats â€” not part of the LLM generation pipeline, but part of the same audio format toolbox:

- **`.adl` (AdLib OPL2):** Dune II (1992) soundtrack. Sequential OPL2 register writes for Yamaha YM3812 FM synthesis. Behind `adl` feature flag. `cnc-formats` provides the parser (MIT/Apache-2.0); `ra-formats` provides ADLâ†’WAV rendering via `opl-emu` (GPL-3.0, pure Rust OPL emulator) because no permissively-licensed pure Rust OPL emulator exists.
- **`.xmi` (XMIDI / Miles Sound System):** Kyrandia series and other Miles AIL-licensed titles. IFF FORM:XMID container with IFTHEN absolute timing and for-loop markers. Behind `xmi` feature flag (implies `midi`). Clean-room XMIâ†’MID conversion (~300 lines), then the existing MIDI pipeline handles SoundFont rendering to WAV/AUD.

These formats serve the broader Westwood game preservation/modding community. The LLM generation pipeline itself only uses standard MIDI (`.mid`).

### Feature Flag: `midi`

```toml
[features]
midi = ["dep:midly", "dep:nodi", "dep:rustysynth"]  # MIDI parse/write/synth
```

Behind the `midi` feature flag (opt-in, like `meg` and `ist`). Adds three pure Rust permissively licensed dependencies with zero C bindings â€” all WASM-compatible (`midly` is Unlicense; `nodi` and `rustysynth` are MIT).

### Conversions Added

| Conversion  | Direction         | Notes                                                                                                                             |
| ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| MID → WAV   | Export            | Requires SoundFont (`.sf2`). `--soundfont` flag (required — `cnc-formats` bundles none; IC ships one in the engine content pack). |
| WAV â†’ MID | **Not supported** | Transcription (audio â†’ symbolic) is an unsolved ML problem. Explicitly out of scope.                                            |
| MID â†’ AUD | Export            | MID â†’ WAV (SoundFont) â†’ AUD (IMA ADPCM). Two-step, single CLI command.                                                        |
| AUD â†’ MID | **Not supported** | Same reason as WAV â†’ MID â€” audio waveforms cannot be reverse-engineered to symbolic notes.                                    |

**MID â†’ AUD makes sense** for modders targeting the original game engine, which expects `.aud` files. The pipeline is: render MIDI through SoundFont to get PCM, then encode PCM as Westwood IMA ADPCM. Both steps use existing `cnc-formats` infrastructure (SoundFont via `rustysynth`, ADPCM via `aud::encode_adpcm()`).

**AUD/WAV â†’ MID does NOT make sense.** MIDI is symbolic (note events); AUD/WAV is a waveform. Converting waveform to notes requires music transcription â€” a hard ML problem with no clean-room pure Rust solution. This is a fundamentally lossy, best-guess operation that doesn't belong in a format conversion tool.

### CLI Examples

```bash
# Render MIDI to WAV (--soundfont required — cnc-formats bundles no SoundFont)
cnc-formats convert --format mid --to wav soundtrack.mid --soundfont GeneralUser_GS.sf2 -o soundtrack.wav

# Render MIDI to WAV with a different SoundFont
cnc-formats convert --format mid --to wav soundtrack.mid --soundfont military.sf2 -o soundtrack.wav

# Render MIDI to AUD (for original game engine modding)
cnc-formats convert --format mid --to aud soundtrack.mid --soundfont default.sf2 -o soundtrack.aud

# Validate MIDI file structure
cnc-formats validate soundtrack.mid

# Inspect MIDI contents (tracks, channels, tempo, duration)
cnc-formats inspect soundtrack.mid
cnc-formats inspect --json soundtrack.mid
```

### Rust Types

```rust
// Behind `midi` feature flag
pub struct MidFile { /* parsed MIDI via midly */ }
pub fn mid::parse(data: &[u8]) -> Result<MidFile>
pub fn mid::write(file: &MidFile) -> Result<Vec<u8>>
pub fn mid::render_to_pcm(file: &MidFile, soundfont: &SoundFont, sample_rate: u32) -> Result<Vec<f32>>
pub fn mid::render_to_wav(file: &MidFile, soundfont: &SoundFont, sample_rate: u32) -> Result<Vec<u8>>
```

### Should IC Play `.mid` Directly at Runtime?

IC *could* play MIDI directly using `rustysynth` on a background thread â€” the crate supports real-time synthesis. This would mean:

**Advantages of direct MIDI playback:**
- Smaller file sizes (`.mid` is 5â€“50 KB vs `.ogg` at 2â€“8 MB)
- Live SoundFont switching (players swap instrument sets without re-rendering)
- Authentic retro experience (Classic render mode D048 can play MIDI soundtracks via SoundFont synthesis)
- Mod-friendly (modders drop in `.mid` files, engine handles SoundFont rendering)

**Disadvantages:**
- Additional CPU load (SoundFont synthesis per audio frame)
- Quality depends on SoundFont availability (no SoundFont = no audio)
- Adds complexity to the audio pipeline

**Decision: Support both, prefer pre-rendered.** IC's primary music format remains OGG Vorbis. However, `.mid` files in the asset pipeline are auto-rendered to PCM at load time using the active SoundFont. Mods can ship `.mid` files directly â€” the engine handles conversion transparently. For the Classic render mode (D048), optional real-time MIDI playback via `rustysynth` provides authentic retro audio. This is a Phase 3+ feature (audio pipeline integration), not Phase 0.

---

## The Self-Contained LLM Generation Pipeline

MIDI is to audio what IST is to sprites: a **text-representable, structured, low-dimensional format** that standard text LLMs can generate without specialized audio training. This pipeline builds on `cnc-formats`' MIDI capability (above) and adds LLM-driven generation.

```
Phi-4-mini (ships with IC, CPU-only)
    â†’ ABC notation text (~200â€“800 tokens)
    â†’ IC's clean-room ABC parser (pure Rust, ~300 lines)
    â†’ MIDI event stream
    â†’ rustysynth SoundFont renderer (pure Rust, MIT)
    â†’ PCM audio â†’ OGG encoder â†’ .ogg file
    â†’ Kira playback via existing dynamic music FSM
```

**Every link in this chain is pure Rust, permissively licensed (Unlicense/MIT/Apache-2.0), WASM-compatible, and ships with IC.** No Python. No C bindings. No external services. No GPU.

### Why MIDI Is the Right Intermediate Format

| Property            | MIDI/ABC                                                  | Raw Audio                                |
| ------------------- | --------------------------------------------------------- | ---------------------------------------- |
| Representation      | Discrete note events (pitch, velocity, duration, channel) | Continuous waveform samples (44,100/sec) |
| Token cost          | A 60-second 4-track piece â‰ˆ 200â€“800 tokens            | Impossible for text LLMs                 |
| LLM capability      | Standard text LLMs generate MIDI event sequences well     | Requires specialized audio transformer   |
| Deterministic       | Yes â€” same MIDI + same SoundFont = identical audio      | Model-dependent                          |
| File size           | 5â€“50 KB for a full track                                | 2â€“8 MB (OGG)                           |
| Moddable            | Modders can edit individual notes                         | Opaque binary blob                       |
| SoundFont-swappable | Same MIDI plays differently with different SoundFonts     | N/A                                      |

### Text Representations for LLM Input/Output

Several proven text encodings exist for representing MIDI as text tokens that LLMs can generate:

#### ABC Notation (Recommended for IC)

```
X:1
T:Soviet March
M:4/4
L:1/8
Q:1/4=140
K:Dm
V:1 name="Lead" clef=treble
|: D2 F2 A2 d2 | c2 A2 F2 D2 | E2 G2 B2 e2 | d4 z4 :|
V:2 name="Bass" clef=bass
|: D,4 A,,4 | F,4 C,4 | E,4 B,,4 | D,8 :|
```

- **Most compact:** ~50â€“150 tokens for a full melody line
- **Well-studied:** Microsoft's MuseCoco and CLaMP models use ABC notation
- **Human-readable:** Modders can hand-edit generated music
- **Proven LLM generation:** GPT-4, Claude, and even smaller models generate valid ABC notation
- **Clean-room parser:** IC writes its own minimal ABC subset parser in pure Rust (~300 lines). Existing Rust ABC crates are sparse and unmaintained. A purpose-built parser for IC's controlled LLM output subset is smaller, more reliable, and avoids an external dependency. Full ABC notation is complex (ornaments, lyrics, inline chords, nested repeats), but IC's LLM output uses a predictable subset: headers, notes with octave/duration, rests, bar lines, voices, and simple repeats.

#### MIDI Event Sequence (Alternative)

```
NOTE_ON ch=0 pitch=62 vel=100 t=0
NOTE_ON ch=0 pitch=65 vel=100 t=0
NOTE_OFF ch=0 pitch=62 t=480
NOTE_ON ch=0 pitch=69 vel=100 t=480
...
```

- More verbose (~2â€“4x tokens vs ABC) but unambiguous
- Direct mapping to MIDI bytes â€” no parser ambiguity
- Better for multi-channel/percussion tracks

#### Recommendation

Use **ABC notation as the primary LLM output format** with a fallback to MIDI event sequences for complex multi-track pieces. IC writes a clean-room ABC subset parser rather than depending on external crates. The generation pipeline:

```
LLM prompt (mood, tempo, key, style, duration)
    â†’ ABC notation text
    â†’ IC's ABC subset parser â†’ MIDI events
    â†’ rustysynth SoundFont synthesis â†’ PCM
    â†’ Kira audio playback (or OGG encode for pre-rendered export)
```

### Rust Crate Dependencies

The pipeline uses three external crates â€” all pure Rust, all permissively licensed, all WASM-compatible, all zero-C-dependency:

| Crate        | Purpose                                                | License   | WASM | Notes                                                                             |
| ------------ | ------------------------------------------------------ | --------- | ---- | --------------------------------------------------------------------------------- |
| `midly`      | MIDI file parsing/writing                              | Unlicense | Yes  | Zero-allocation parser, `no_std` compatible                                       |
| `nodi`       | MIDI playback abstraction, track merging, time-mapping | MIT       | Yes  | Works alongside `midly`                                                           |
| `rustysynth` | SoundFont (SF2) MIDI synthesizer                       | MIT       | Yes  | Pure Rust port of MeltySynth, no dependencies, real-time capable, reverb + chorus |

**`rustysynth` is the key enabler.** It loads `.sf2` SoundFont files and renders MIDI to PCM audio with reverb and chorus effects. No C dependencies, no GPU required, WASM-compatible. IC would not need to write a SoundFont synthesizer from scratch â€” `rustysynth` is exactly the kind of focused, well-maintained, pure Rust crate that IC should depend on rather than reimplement (see AGENTS.md: "Don't reimplement what existing crates already solve").

### IC-Owned Code: ABC Subset Parser

IC writes its own ABC-to-MIDI converter (~300 lines of Rust). This is the one piece where no adequate crate exists and the scope is narrow enough to justify custom code.

**Supported ABC subset** (controlled by constrained LLM output):

```
X:1                    # Tune number
T:Track Title          # Title
M:4/4                  # Time signature
L:1/8                  # Default note length
Q:1/4=140              # Tempo (BPM)
K:Dm                   # Key signature
V:1 name="Lead"        # Voice/channel declaration
|: ... :|              # Repeat bars
z                      # Rest
A-G, a-g              # Notes (upper/lower octave)
, and '               # Octave modifiers
2, 4, /2              # Duration modifiers
```

**Not supported** (intentionally excluded from the LLM prompt template to avoid generation complexity): ornaments, grace notes, inline chord symbols, lyrics, slurs, ties across bars, nested repeats, overlay voices (`&`). If the LLM generates unsupported syntax, the parser reports a structured error and the validation pipeline triggers a regeneration.

**Parser outputs:** `Vec<MidiEvent>` â€” note-on, note-off, program change, tempo change. These feed directly into `midly` for `.mid` file writing and `rustysynth` for audio rendering.

### Token Budget Analysis

For Tier 1 CPU inference (Phi-4-mini at ~12 tok/s):

| Output                                  | Tokens     | Generation Time | Result                        |
| --------------------------------------- | ---------- | --------------- | ----------------------------- |
| Single SFX (explosion, gunshot)         | ~10â€“30   | ~1â€“3s         | Short percussive hit          |
| UI sound set (10 clicks/tones)          | ~50â€“150  | ~4â€“13s        | Complete UI audio kit         |
| 30-sec ambient loop (ABC, single voice) | ~100â€“200 | ~10â€“17s       | Simple atmospheric pad        |
| 60-sec combat theme (ABC, 3 voices)     | ~300â€“600 | ~25â€“50s       | Melodic theme + bass + rhythm |
| 90-sec full arrangement (ABC, 4 voices) | ~500â€“900 | ~42â€“75s       | Complete dynamic music piece  |

SFX generation is near-instant even on CPU. Music generation is acceptable for **offline generation** (SDK tool, mission generation pipeline, mod authoring). Not suitable for real-time generation during gameplay â€” but that's fine. Generated tracks are saved as `.mid` + `.ogg`/`.wav` assets and loaded by the normal audio system.

### Prompt Engineering for C&C Audio

The LLM needs context about what to generate. Two prompt templates â€” one for music, one for SFX:

**Music prompt template:**
```yaml
system: |
  You are a military RTS game music composer. Generate music in ABC notation.
  Style reference: Hell March (industrial march), Frank Klepacki (heavy guitar riffs,
  electronic beats, brass stabs). The music should feel urgent, militaristic,
  and powerful. Use minor keys, strong rhythmic patterns, and dramatic dynamics.

user: |
  Generate a {{duration}}-second {{mood}} track for a {{faction}} faction.
  Tempo: {{tempo}} BPM
  Key: {{key}}
  Time signature: {{time_sig}}
  Instruments: {{instruments}}

  Context: {{mission_briefing_summary}}

  Output ABC notation only. Include at least {{voice_count}} voices.
```

**SFX prompt template:**
```yaml
system: |
  You are a sound effect designer for a military RTS game. Generate short sound
  effects in ABC notation. Use percussion channels (MIDI channel 10) for impacts.
  Keep sounds punchy and recognizable. Duration: 0.1â€“3 seconds.

user: |
  Generate a {{sfx_type}} sound effect.
  Duration: {{duration}} seconds
  Intensity: {{intensity}} (1â€“10 scale)
  Channel: {{midi_channel}} (10 = percussion)
  Instrument: {{gm_patch}} (General MIDI patch number)

  Output ABC notation only. Single voice.
```

**Music mood** maps to the dynamic music FSM states:
- **Ambient** â†’ atmospheric pads, slow tempo (80â€“100 BPM), sparse notes
- **Buildup** â†’ rising tension, accelerating rhythmic patterns, layering voices
- **Combat** â†’ driving percussion, aggressive bass, fast tempo (130â€“160 BPM)
- **Victory** â†’ triumphant brass fanfares, major key resolution
- **Defeat** â†’ somber melody, diminished chords, decaying dynamics

**SFX categories** (General MIDI patch mapping):

| SFX Type       | GM Patch / Channel                              | ABC Pattern                | Duration     |
| -------------- | ----------------------------------------------- | -------------------------- | ------------ |
| Explosion      | Ch.10 (Low Tom, Bass Drum)                      | `C,,4 z`                   | 0.3â€“1.0s   |
| Gunshot        | Ch.10 (Snare, Rimshot)                          | `C,2 z`                    | 0.1â€“0.3s   |
| UI click       | Ch.10 (Hi-Hat) or Ch.1 Patch 116 (Woodblock)    | `c`                        | 0.05â€“0.15s |
| Ability charge | Ch.1 Patch 81 (Synth Lead)                      | `C,C E G c` ascending      | 0.5â€“2.0s   |
| Alarm/klaxon   | Ch.1 Patch 80 (Square Lead)                     | `e c e c` repeating        | 0.5â€“3.0s   |
| Power-up       | Ch.1 Patch 99 (FX Atmosphere)                   | `C E G c e` fast ascending | 0.3â€“0.8s   |
| Radio static   | Ch.10 (Open Hi-Hat) + Ch.1 Patch 122 (Seashore) | noise texture              | 0.2â€“1.0s   |

The quality floor for SFX is adequate for mods and generated content â€” not a replacement for hand-crafted Foley recordings, but usable out of the box and improvable via better SoundFonts.

### Integration with Existing Audio System

Generated MIDI content slots directly into IC's existing audio infrastructure:

1. **Generation phase** (SDK / mission gen / mod authoring):
   - LLM generates ABC notation â†’ parse â†’ MIDI â†’ SoundFont synthesis â†’ `.ogg`/`.wav`
   - Music saved as `.ogg` alongside mission/mod assets in standard music directory
   - SFX saved as `.wav` (zero decode latency) in standard SFX directory
   - Source `.mid` files kept alongside rendered audio (enables re-rendering with different SoundFonts)

2. **Runtime** (normal playback):
   - `.ogg`/`.wav` files loaded by Kira via existing `AssetSource` pipeline
   - Dynamic music FSM selects music tracks by mood tag (same as pre-authored music)
   - SFX played through the SFX bus with spatial positioning (same as pre-authored SFX)
   - No runtime MIDI synthesis needed for pre-rendered content

3. **Direct MIDI playback** (mods and Classic render mode):
   - `.mid` files in the asset pipeline auto-rendered to PCM at load time using active SoundFont
   - Classic render mode (D048) can optionally use real-time `rustysynth` playback for authenticity
   - Mods can ship `.mid` files directly â€” smaller than OGG, SoundFont-switchable by the player

4. **cnc-formats CLI** (community tooling):
   - `cnc-formats convert --format mid --to wav` renders MIDI via SoundFont for any use
   - `cnc-formats convert --format mid --to aud` produces AUD for original game engine modding
   - Useful to the broader C&C community regardless of IC

### Validation Pipeline

Extend D016's 5-pass validation with music-specific checks:

1. **ABC syntax validation** â€” parse succeeds, all voices well-formed
2. **Musical sanity** â€” tempo within range, key signature valid, note pitches in playable range (MIDI 0â€“127)
3. **Duration check** â€” generated piece is within Â±20% of requested duration
4. **Mood consistency** â€” tempo/key/density match the requested mood (heuristic: combat â‰¥ 120 BPM, ambient â‰¤ 100 BPM, minor keys for tension)
5. **MIDI render test** â€” SoundFont synthesis succeeds, output is non-silent, peak amplitude within range

Failed pieces get regenerated (same retry logic as D016 mission generation).

---

## SoundFont Strategy â€” Bundled, Not Optional

SoundFonts determine the audio quality of rendered MIDI. A General MIDI SoundFont maps the 128 standard MIDI instruments to sampled audio. The same MIDI file sounds completely different through different SoundFonts â€” from 16-bit chiptune to near-orchestral.

**IC bundles a SoundFont by default.** This is not an optional download. The music generation feature must produce audible, reasonable-quality output on first use without the user doing anything.

### Bundled Default (Ships with IC)

**GeneralUser GS** (~30 MB, custom permissive license â€” free for any use including commercial, no attribution required):
- 259 instruments, 11 drum kits
- Good quality across brass, strings, synths, percussion â€” all relevant to C&C aesthetics
- Widely used in open-source projects
- 30 MB is acceptable within IC's install footprint (a single OGG music track is 2â€“8 MB)

Alternative: **TimGM6mb** (~6 MB, GPL-2) â€” lower quality but smaller. GPL-2 is compatible with IC's GPL-3 license but not with `cnc-formats`' MIT/Apache-2.0 standalone crate; bundling should be in `ra-formats` or `ic-audio` if needed.

### Selective Installation (D068)

Under IC's selective installation system (D068), the bundled SoundFont falls under the `music_generation` optional content pack. Users who disable LLM features can skip it. Users who enable music generation get it automatically â€” no separate download step.

### C&C-Themed SoundFont Pack (Workshop, Phase 7+)

Community or first-party SoundFont packs optimized for C&C music:
- **Military brass:** Trumpets, trombones, snare drums, timpani
- **Industrial:** Distorted guitar, heavy bass, industrial percussion
- **Electronic:** Synth leads, pads, arpeggiated sequences
- **Orchestral:** Strings, choir, cinematic percussion

Workshop resource (`category: soundfont`, ~20â€“50 MB). Enhances quality but is not required â€” the bundled default always works.

### SoundFont Selection in YAML

```yaml
# In a mod's audio configuration
music_generation:
  soundfont: "soundfonts/cnc_military.sf2"    # Custom C&C SoundFont
  fallback_soundfont: "soundfonts/default.sf2" # General MIDI fallback
  reverb: 0.3
  chorus: 0.1
```

---

## Implementation Plan

### Phase 0 â€” MIDI Format Support in `cnc-formats`

`cnc-formats` gains MIDI as a first-class format behind the `midi` feature flag. This is format infrastructure â€” no LLM involvement.

1. Add `midi` feature flag, gating `midly` (Unlicense) + `nodi` (MIT) + `rustysynth` (MIT) dependencies (all pure Rust)
2. Implement `MidFile` parser/writer wrapping `midly`
3. Implement `mid::render_to_pcm()` / `mid::render_to_wav()` using `rustysynth`
4. Add `convert` support: MIDâ†’WAV, MIDâ†’AUD (via SoundFont + ADPCM encoding)
5. Add `validate` and `inspect` support for `.mid` files (track count, channels, tempo, duration)
6. Accept `--soundfont` flag for SoundFont selection (required for MIDâ†’WAV/AUD conversion; no SoundFont bundled in `cnc-formats` â€” TimGM6mb is GPL-2, incompatible with MIT/Apache-2.0; GeneralUser GS is bundled in IC itself, not in the standalone crate)
7. Add `.mid` to `ConvertFormat` enum and wire into CLI dispatch

**Exit criteria:** `cnc-formats convert --format mid --to wav track.mid -o track.wav` works. Modders can convert MIDI files to WAV/AUD for any game engine.

### Phase 3 â€” IC Runtime MIDI Support

IC's audio pipeline recognizes `.mid` files as a loadable music/SFX format.

8. `ra-formats` Bevy asset loader recognizes `.mid` and auto-renders to PCM via SoundFont at load time
9. Mods can ship `.mid` files directly â€” engine handles SoundFont rendering transparently
10. Optional real-time MIDI playback via `rustysynth` for Classic render mode (D048)

### Phase 7a â€” Self-Contained LLM Audio Generation (music + SFX)

All items below are required for the LLM generation feature. No external dependencies.

11. Write clean-room ABC subset parser in pure Rust (~300 lines) â€” outputs `Vec<MidiEvent>`
12. Implement `AudioGenerator` â€” orchestrates: LLM prompt â†’ ABC â†’ parse â†’ MIDI â†’ SoundFont â†’ OGG/WAV
13. Bundle GeneralUser GS SoundFont (~30 MB) as part of `music_generation` content pack (D068)
14. Add `music_generation` and `sfx_generation` task roles to D047 `TaskRouter`
15. Integrate with D016 mission generation â€” optional audio generation step (mood tracks + custom SFX)
16. Implement validation pipeline (5 checks for music, 3 checks for SFX) + retry on failure
17. Save both `.mid` (source) and `.ogg`/`.wav` (playback) alongside mission assets
18. Mood-tag generated music files so the dynamic music FSM picks them up automatically
19. SFX generation: prompt templates for weapon sounds, UI feedback, ability sounds, alerts

**Exit criteria:** A user generates a mission via D016, and the mission ships with a unique procedurally generated soundtrack AND custom SFX â€” playable immediately with zero additional setup.

### Phase 7b â€” Quality Enhancements (still self-contained)

20. Curate few-shot ABC examples in Skill Library (D057) for C&C music styles AND SFX categories
21. Workshop SoundFont packs (community-created, higher-quality instruments)
22. Community-shared prompt templates for music genres and SFX categories
23. SFX layering â€” combine multiple short MIDI renders for richer sound effects

### Phase 7+ â€” BYOLLM Bonus (optional, external)

24. Define `MusicProvider` trait in `ic-llm` (see Appendix A)
25. Implement provider wrappers for external neural audio models (MusicGen, cloud APIs)
26. Music/SFX generation UI in SDK/Asset Studio

---

## Risk Assessment

| Risk                                          | Severity | Mitigation                                                                                                                                                |
| --------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ABC generation quality varies by model        | Medium   | Validation pipeline + retry; constrained output subset; curated Skill Library (D057) few-shot examples                                                    |
| SoundFont quality perceived as "MIDI-y"       | Medium   | Bundle decent default (GeneralUser GS); Workshop SoundFont packs raise ceiling; retro SoundFont aesthetic fits RTS genre                                  |
| MIDI generation produces repetitive music     | Medium   | Multi-voice prompting; mood-specific style templates; human curation step in SDK; Skill Library accumulates good patterns                                 |
| CPU models too slow for iterative composition | Low      | Offline generation only (SDK/mod authoring); pre-render and cache; batch generation                                                                       |
| ABC subset parser bugs                        | Low      | Constrained LLM output reduces surface area; validation catches parse failures; fuzz testing                                                              |
| `rustysynth` maintenance risk                 | Low      | Pure Rust, stable API, MIT-licensed â€” IC can fork if needed. ~3,000 lines of code, well-understood SoundFont spec.                                      |
| SoundFont licensing                           | Low      | GeneralUser GS is free for any use (custom permissive, no attribution required); fallback to TimGM6mb (GPL-2, compatible with IC's GPL-3) if terms change |
| WASM compatibility                            | Low      | `midly` is `no_std`; `rustysynth` is pure Rust; ABC parser is IC-owned pure Rust; all compile to WASM                                                     |

---

## Demoscene-Inspired Parameter Synthesis (Optional Enhancement, Phase 7+)

The ABCâ†’MIDIâ†’SoundFont pipeline above is IC's primary approach for LLM-generated audio. It handles music well and produces adequate SFX through General MIDI percussion patches. However, demoscene software synthesizers â€” particularly Farbrausch's V2 (used in .kkrieger, a 96KB FPS that synthesized all audio in real-time) â€” demonstrate a complementary pattern for **procedural SFX** that IC could optionally adopt.

See `research/demoscene-synthesizer-analysis.md` for the full architectural analysis of V2, 4klang, Oidos, 64klang, Clinkster, WaveSabre, and Tunefish.

### The Demoscene Pattern

.kkrieger shipped an entire game's audio â€” ambient music, weapon sounds, environment effects â€” in ~8â€“15 KB of patch data plus a compressed MIDI event stream, synthesized in real-time by V2's ~3,300-line C++ synth engine. The key insight: **all sound design is defined as small byte-array patches** (~80â€“150 bytes each, parameter values 0â€“127), interpreted by a synthesis engine at runtime.

Every major demoscene synth follows this pattern:

| Synth          | Patch Format         | Params per Patch | Total Audio Budget |
| -------------- | -------------------- | ---------------- | ------------------ |
| V2 (.kkrieger) | Byte array (0â€“127) | ~80â€“150        | ~8â€“15 KB         |
| 4klang         | Stack-based ops      | ~30â€“60         | ~1â€“3 KB          |
| Oidos          | Quantized floats     | ~20              | ~2â€“5 KB          |
| Clinkster      | 2-op PM params       | ~10â€“15         | ~1â€“2 KB          |

These parameter arrays are **trivially LLM-generatable** â€” a patch is 50â€“150 numbers in a defined schema. An LLM producing `{"oscillator": "noise", "filter_cutoff": 100, "decay": 90, "distortion": 45}` for an explosion sound is well within Phi-4-mini's capability.

### How This Complements ABCâ†’MIDIâ†’SoundFont

The two approaches serve different strengths:

|                         | ABCâ†’MIDIâ†’SoundFont (Primary)             | Parameter Synthesis (Enhancement)                         |
| ----------------------- | -------------------------------------------- | --------------------------------------------------------- |
| **Best for**            | Music, melodic SFX, orchestral               | Procedural SFX, electronic, noise-based                   |
| **Explosion sound**     | GM drum hit â€” adequate, sample-dependent   | Noiseâ†’lowpass sweepâ†’distortion â€” tunable, authentic |
| **Laser/sci-fi**        | Synth lead patch â€” limited by SoundFont    | Oscillator sweep + ring mod â€” unlimited variation       |
| **UI clicks**           | Hi-hat or woodblock â€” fine                 | Short envelope â†’ click â€” precise control              |
| **Music**               | Full orchestral quality via SoundFont        | Not suitable (no polyphonic composition)                  |
| **File size per sound** | 5â€“50 KB (MIDI) + SoundFont (~30 MB shared) | 80â€“150 bytes (patch only)                               |
| **LLM output**          | ABC notation text (~10â€“30 tokens for SFX)  | JSON parameter object (~20â€“50 tokens)                   |

### Proposed YAML Integration

A mod could define synthesized SFX directly in weapon/unit rules:

```yaml
# In weapon_rules.yaml
Weapons:
  Rifle:
    Sound: !synth
      type: impact
      oscillator: noise
      filter: lowpass_sweep
      filter_cutoff: 3200
      envelope: percussive
      attack_ms: 2
      decay_ms: 80
      distortion: clip
      reverb: 0.2

  LaserTurret:
    Sound: !synth
      type: laser
      oscillator: sin_sweep
      pitch_start: 1200
      pitch_end: 400
      duration_ms: 150
      filter: bandpass
      resonance: 0.8
```

The `!synth` tag tells the audio system to render the sound from parameters at load time rather than loading a sample file. The rendered PCM is cached â€” no runtime synthesis overhead during gameplay.

### LLM SFX Patch Generation

An LLM prompt for procedural SFX follows the same text-to-resource pattern as IST (sprites) and ABC (music):

```
User: "Create a laser gun sound effect"
LLM generates: {"type": "laser", "osc": "sin_sweep", "pitch_start": 1200,
                 "pitch_end": 400, "duration_ms": 150, "filter": "bandpass",
                 "resonance": 0.8, "reverb": 0.1}
Engine renders: 150ms WAV from parameters â†’ cached as .wav asset
```

Token budget: ~20â€“50 tokens per SFX patch (even cheaper than ABC notation's 10â€“30 tokens).

### Implementation Scope

A lightweight parameter-driven SFX synth engine would be ~500â€“1,000 lines of Rust in `ic-audio`, covering:

- **Oscillators:** Sine, saw, square, pulse, noise, FM
- **Filters:** Lowpass, highpass, bandpass with resonance and sweep
- **Envelopes:** ADSR with per-parameter modulation
- **Effects:** Distortion (clip/fold/bitcrush), reverb send, stereo pan
- **Rendering:** Offline render to PCM at load time (no real-time synthesis during gameplay)

No existing Rust crate provides this exact capability (demoscene-style "parameters to PCM" engine). However, the building blocks exist â€” Oidos (33% Rust, additive synthesis), sonant-rs (4K synth port), surge-rs (full Surge port) â€” proving the approach is viable in Rust.

### Phase Placement

This is strictly **Phase 7+, P-Optional** â€” an enhancement to the primary ABCâ†’MIDIâ†’SoundFont pipeline, not a replacement. The ABC pipeline ships first and handles all audio generation needs adequately. Parameter synthesis is a quality-of-life upgrade for procedural SFX that could be added later based on community interest.

---

## Prior Art

### Demoscene Software Synthesizers

The demoscene has 20+ years of experience synthesizing high-quality audio from minimal data. Key systems analyzed in `research/demoscene-synthesizer-analysis.md`:

- **Farbrausch V2** (.kkrieger, BSD/public domain): Polyphonic subtractive synth â€” 3 oscillators, 2 filters, ADSSR envelopes, modulation matrix. Byte-array patches interpreted by ~3,300 lines of C++. Powered a 96KB game's entire audio.
- **4klang** (Alcatraz): Stack-based signal processing â€” extremely compact (1â€“3 KB total audio in 4K intros).
- **Oidos** (Logicoma, 33% Rust): Pure additive synthesis with quantized float parameters â€” proves Rust viability.
- **Clinkster** (Loonies): Minimal 2-operator phase modulation â€” surprisingly rich audio from ~10â€“15 parameters per sound.

All validate the core insight: **small parameter arrays â†’ synthesis engine â†’ high-quality audio** is a proven, mature pattern.

### LLM Music Generation Research

- **MuseCoco** (Microsoft Muzic, MIT): Text-conditioned symbolic music generation. Uses a two-stage pipeline: text→attributes, attributes→MIDI tokens (custom REMI-like vocabulary). Validates that text descriptions can drive coherent symbolic music output.
- **CLaMP/CLaMP2** (Microsoft, ISMIR 2023 Best Student Paper): Contrastive Language-Music Pre-training â€” learns alignment between text descriptions and symbolic music (ABC/MIDI). Enables text-conditioned music retrieval and generation.
- **MusicAgent** (Microsoft Muzic, EMNLP 2023): LLM orchestrator that routes music tasks to specialized tools â€” similar to IC's `TaskRouter` pattern. Validates the "LLM as conductor, specialized tools as instruments" architecture.
- **Magenta** (Google, archived Jan 2026): Pioneered ML music generation. MelodyRNN, MusicVAE, DDSP. The `magenta-js` library runs MIDI generation in-browser â€” proves WASM viability. Repository is now archived; Google has moved to Lyria/Gemini integration.

### Symbolic-First Approaches in Games

- **Generative Music in Spore (2008):** Brian Eno's procedural music system used symbolic/rule-based generation layered on pre-authored samples. Proves that procedural symbolic music can work in games.
- **No Man's Sky (2016):** 65daysofstatic's procedural soundtrack uses layered stems with algorithmic mixing. Hybrid approach: pre-authored elements + procedural arrangement.
- **Minecraft (C418):** While not procedural, the ambient/sparse aesthetic of Minecraft's soundtrack demonstrates that simpler musical textures (fewer instruments, slower tempo, more space) can be highly effective for game ambience â€” and these are exactly what small LLMs generate best.

### IST Parallel

IC's IST (IC Sprite Text) format established the pattern: **use a text-friendly intermediate representation that LLMs can generate, then convert to the engine's native binary format.** MIDI/ABC is the audio equivalent, and demoscene-inspired parameter synthesis extends the pattern further:

|                       | IST (Sprites)                        | ABC/MIDI (Music + SFX)                  | `!synth` Params (Procedural SFX)           |
| --------------------- | ------------------------------------ | --------------------------------------- | ------------------------------------------ |
| LLM output format     | YAML-wrapped hex pixel grid          | ABC notation text                       | JSON parameter object                      |
| Binary format         | `.shp` + `.pal`                      | `.mid`                                  | Inline YAML (`!synth` tag)                 |
| Runtime format        | Bevy sprite atlas                    | `.ogg`/`.wav` (via SoundFont synthesis) | `.wav` (rendered at load time)             |
| Token cost            | ~200 tokens/frame                    | Music: ~100â€“300/voice; SFX: ~10â€“30  | ~20â€“50 tokens/patch                      |
| Quality ceiling       | Pixel art (low-res, palette-indexed) | SoundFont-dependent                     | Synth-quality (electronic/noise)           |
| Enhancement path      | Better models, fine-tuning           | Better SoundFonts, neural audio BYOLLM  | Richer synth engine, more oscillator modes |
| `cnc-formats` feature | `ist`                                | `midi`                                  | N/A (`ic-audio` native)                    |

---

## Resolved Design Decisions

1. **Keep `.mid` alongside `.ogg` renders? â†’ Yes.** Keeping MIDI source files enables SoundFont hot-swapping, community remixing, and Workshop sharing. ~5â€“50 KB per track (negligible). Generated missions ship both files.

2. **ABC parser: use existing crate or write our own? â†’ Write our own.** Existing Rust ABC parsers are sparse and unmaintained. IC's constrained LLM output subset is small enough (~300 lines of parser code) that a purpose-built clean-room parser is more reliable than wrapping an external dependency. The parser is trivially testable (fixed input â†’ fixed MIDI output) and fuzz-targetable.

3. **Live SoundFont switching during playback? â†’ Defer to Phase 3 (runtime MIDI support).** `rustysynth` supports real-time rendering, so this is architecturally possible. Pre-rendered `.ogg` covers 95% of use cases. But for Classic render mode (D048) authenticity and mod convenience, direct MIDI playback is worth supporting.

4. **Original C&C audio as few-shot examples? â†’ Use style descriptions, not raw audio.** The original RA1/TD soundtracks are Frank Klepacki compositions â€” EA-copyrighted `.aud` files (not MIDI). Use textual style descriptions ("industrial march, 140 BPM, minor key, heavy brass stabs, driving snare pattern") as few-shot examples in the Skill Library. Achieves style guidance without copyright entanglement.

5. **MID â†’ AUD conversion? â†’ Yes, via SoundFont + ADPCM.** Useful for modders targeting original game engines that expect `.aud` files. Pipeline: render MIDI through SoundFont to PCM, encode PCM as Westwood IMA ADPCM. Both steps use existing `cnc-formats` infrastructure.

6. **AUD/WAV â†’ MID conversion? â†’ No, not feasible.** Audio-to-MIDI transcription is an unsolved ML problem. The conversion is fundamentally lossy and non-deterministic. Explicitly out of scope for a format conversion tool.

7. **Should IC play `.mid` directly at runtime? â†’ Yes, as a supported asset format.** `.mid` files in the asset pipeline are auto-rendered to PCM at load time via SoundFont. Mods can ship `.mid` files directly â€” smaller than OGG, SoundFont-switchable by the player. Real-time MIDI playback (as opposed to load-time rendering) is optional for Classic render mode.

8. **MIDI for SFX, not just music? â†’ Yes.** Short MIDI sequences (0.1â€“3 seconds) rendered through appropriate SoundFont patches produce usable sound effects. The quality floor is adequate for mods and generated content. Same pipeline, different prompt templates and durations.

---

## Summary

Two layers of capability:

**Layer 1 â€” MIDI Format Support (`cnc-formats`, Phase 0):**

| Capability           | What                           | Dependencies                                  | External Install? |
| -------------------- | ------------------------------ | --------------------------------------------- | ----------------- |
| MIDI parsing/writing | `MidFile` via `midly`          | `midly` (Unlicense, pure Rust)                | **No**            |
| MIDI â†’ WAV         | SoundFont rendering            | `rustysynth` (MIT, pure Rust)                 | **No**            |
| MIDI â†’ AUD         | SoundFont + IMA ADPCM          | `rustysynth` + existing `aud::encode_adpcm()` | **No**            |
| Validate/Inspect     | Track, channel, tempo metadata | `midly`                                       | **No**            |

Useful to modders and tool authors. Anyone working with game audio can convert MIDI files to WAV/AUD.

**Layer 2 â€” LLM Audio Generation (Phase 7+, optional):**

| Component       | What                             | Source                      | License                              | External Install? |
| --------------- | -------------------------------- | --------------------------- | ------------------------------------ | ----------------- |
| LLM inference   | Phi-4-mini (CPU)                 | Ships with IC (D047 Tier 1) | MIT                                  | **No**            |
| ABC parser      | ~300-line clean-room Rust parser | IC-owned code               | GPL v3 (IC engine)                   | **No**            |
| MIDI handling   | `midly` + `nodi` crates          | Pure Rust, existing         | Unlicense / MIT                      | **No**            |
| SoundFont synth | `rustysynth` crate               | Pure Rust, existing         | MIT                                  | **No**            |
| SoundFont data  | GeneralUser GS (~30 MB)          | Bundled with IC             | Custom permissive (free for any use) | **No**            |
| Audio playback  | Kira via `bevy_kira_audio`       | Already in IC               | MIT/Apache-2.0                       | **No**            |

**A user installs IC. A user generates a mission. The mission has a unique soundtrack AND custom sound effects. Nothing else required.**

Quality ranges from chiptune/retro (adequate) to surprisingly good (with the bundled SoundFont). Workshop SoundFont packs and BYOLLM neural audio can raise the ceiling further, but the floor is already functional and charming.

---

## Appendix A: BYOLLM Neural Audio (Bonus, Not Required)

For users who happen to have GPU hardware or cloud API access, IC can route music generation through specialized audio models via the existing BYOLLM infrastructure (D047 Tiers 2â€“4). This produces higher-quality audio than SoundFont synthesis but is **never required** â€” the built-in MIDI pipeline always works as the fallback.

### Landscape (as of early 2026)

| Model                               | License                              | Quality           | Requirements              | Notes                                                                                       |
| ----------------------------------- | ------------------------------------ | ----------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| **MusicGen** (Meta AudioCraft)      | Code: MIT, Weights: **CC-BY-NC 4.0** | High              | GPU 4â€“12 GB VRAM        | Best open-source text-to-music; NC license limits commercial use                            |
| **JASCO** (Meta AudioCraft)         | Code: MIT, Weights: **CC-BY-NC 4.0** | High              | GPU                       | Chord + drum conditioning â€” more controllable than MusicGen                               |
| **Bark** (Suno)                     | **MIT** (code + weights)             | Medium            | GPU 2â€“12 GB or slow CPU | Most permissive license; ~13s segments; music is secondary to speech                        |
| **MuseCoco** (Microsoft Muzic)      | **MIT**                              | Medium (symbolic) | CPU possible              | Text-conditioned symbolic music generation (MIDI-centric); validates text→symbolic pipeline |
| **Suno v3/v4, Lyria, Stable Audio** | API-only (commercial)                | Very high         | Cloud API                 | Highest quality; sidestep GPU requirements; require API keys + internet                     |

### MusicProvider Trait

```rust
/// Optional provider for neural audio generation.
/// Registered as `music_generation` role in D047 TaskRouter.
/// Falls back to built-in MIDI pipeline if unavailable.
#[async_trait]
pub trait MusicProvider: Send + Sync {
    async fn generate_music(&self, request: MusicRequest) -> Result<MusicResponse>;
    async fn health_check(&self) -> Result<ProviderStatus>;
    fn max_duration_secs(&self) -> u32;
    fn output_format(&self) -> MusicOutputFormat;
}
```

### Fallback Chain

```
User-configured MusicProvider (BYOLLM)
    â†’ fails or unavailable?
    â†’ Built-in MIDI pipeline (Phi-4-mini â†’ ABC â†’ SoundFont â†’ OGG)
    â†’ fails?
    â†’ Existing pre-authored soundtrack pool (always works)
```

Both BYOLLM and built-in paths produce standard `.ogg` files that slot into IC's existing dynamic music FSM. The audio system doesn't know or care how the `.ogg` was generated.
