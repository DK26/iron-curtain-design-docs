#### Voice Effects & Enhancement

Voice effects apply DSP processing to incoming voice on the **receiver side** — after Opus decode, before spatial panning and mixing. This is a deliberate architectural choice:

- **Receiver controls their experience.** Alice hears radio-filtered voice; Bob hears clean audio. Neither imposes on the other.
- **Clean audio preserved.** The Opus-encoded stream in replays (voice-in-replay, D059 § 7) is unprocessed. Effects can be re-applied during replay playback with different presets — a caster might use clean voice while a viewer uses radio flavor.
- **No codec penalty.** Applying effects before Opus encoding wastes bits encoding the effect rather than the voice. Receiver-side effects are "free" from a compression perspective.
- **Per-speaker effects.** A player can assign different effects to different teammates (e.g., radio filter on ally A, clean for ally B) via per-speaker settings.

##### DSP Chain Architecture

Each voice effect preset is a composable chain of lightweight DSP stages:

```rust
/// A single DSP processing stage. Implementations are stateful
/// (filters maintain internal buffers) but cheap — a biquad filter
/// processes 960 samples (20ms at 48kHz) in <5 microseconds.
pub trait VoiceEffectStage: Send + 'static {
    /// Process samples in-place. Called on the audio thread.
    /// `sample_rate` is always 48000 (Opus output).
    fn process(&mut self, samples: &mut [f32], sample_rate: u32);

    /// Reset internal state. Called when a speaker stops and restarts
    /// (avoids filter ringing from stale state across transmissions).
    fn reset(&mut self);

    /// Human-readable name for diagnostics.
    fn name(&self) -> &str;
}

/// A complete voice effect preset — an ordered chain of DSP stages
/// plus optional transmission envelope effects (squelch tones).
pub struct VoiceEffectChain {
    pub stages: Vec<Box<dyn VoiceEffectStage>>,
    pub squelch: Option<SquelchConfig>,
    pub metadata: EffectMetadata,
}

/// Squelch tones — short audio cues on transmission start/end.
/// Classic military radio has a distinctive "roger beep."
pub struct SquelchConfig {
    pub start_tone_hz: u32,       // e.g., 1200 Hz
    pub end_tone_hz: u32,         // e.g., 800 Hz
    pub duration_ms: u32,         // e.g., 60ms
    pub volume: f32,              // 0.0-1.0, relative to voice
}

pub struct EffectMetadata {
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,         // semver
    pub tags: Vec<String>,
}
```

**Built-in DSP stages** (implemented in `ic-audio`, no external crate dependencies beyond `std` math):

| Stage             | Parameters                                              | Use                                                                      | CPU Cost (960 samples) |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `BiquadFilter`    | `mode` (LP/HP/BP/notch/shelf), `freq_hz`, `q`, `gain`   | Band-pass for radio; high-shelf for presence; low-cut for clarity        | ~3 μs                  |
| `Compressor`      | `threshold_db`, `ratio`, `attack_ms`, `release_ms`      | Even out loud/quiet speakers; radio dynamic range control                | ~5 μs                  |
| `SoftClipDistort` | `drive` (0.0-1.0), `mode` (soft_clip / tube / foldback) | Subtle harmonic warmth for vintage radio; tube saturation                | ~2 μs                  |
| `NoiseGate`       | `threshold_db`, `attack_ms`, `release_ms`, `hold_ms`    | Radio squelch — silence below threshold; clean up mic bleed              | ~3 μs                  |
| `NoiseLayer`      | `type` (static / crackle / hiss), `level_db`, `seed`    | Atmospheric static for radio presets; deterministic seed for consistency | ~4 μs                  |
| `SimpleReverb`    | `decay_ms`, `mix` (0.0-1.0), `pre_delay_ms`             | Room/bunker ambiance; short decay for command post feel                  | ~8 μs                  |
| `DeEsser`         | `frequency_hz`, `threshold_db`, `ratio`                 | Sibilance reduction; tames harsh microphones                             | ~5 μs                  |
| `GainStage`       | `gain_db`                                               | Level adjustment between stages; makeup gain after compression           | ~1 μs                  |
| `FrequencyShift`  | `shift_hz`, `mix` (0.0-1.0)                             | Subtle pitch shift for scrambled/encrypted effect                        | ~6 μs                  |

**CPU budget:** A 6-stage chain (typical for radio presets) costs ~25 μs per speaker per 20ms frame. With 8 simultaneous speakers, that's 200 μs — well under 5% of the audio thread's budget. Even aggressive 10-stage custom chains remain negligible.

**Why no external DSP crate:** Audio DSP filter implementations are straightforward (a biquad is ~10 lines of Rust). External crates like `fundsp` or `dasp` are excellent for complex synthesis but add dependency weight for operations that IC needs in their simplest form. The built-in stages above total ~500 lines of Rust. If future effects need convolution reverb or FFT-based processing, `fundsp` becomes a justified dependency — but the Phase 3 built-in presets don't require it.

##### Built-in Presets

Six presets ship with IC, spanning practical enhancement to thematic immersion. All are defined in YAML — the same format modders use for custom presets.

**1. Clean Enhanced** — *Practical voice clarity without character effects.*

Noise gate removes mic bleed, gentle compression evens volume differences between speakers, de-esser tames harsh sibilance, and a subtle high-shelf adds presence. Recommended for competitive play where voice clarity matters more than atmosphere.

```yaml
name: "Clean Enhanced"
description: "Improved voice clarity — compression, de-essing, noise gate"
tags: ["clean", "competitive", "clarity"]
chain:
  - type: noise_gate
    threshold_db: -42
    attack_ms: 1
    release_ms: 80
    hold_ms: 50
  - type: compressor
    threshold_db: -22
    ratio: 3.0
    attack_ms: 8
    release_ms: 60
  - type: de_esser
    frequency_hz: 6500
    threshold_db: -15
    ratio: 4.0
  - type: biquad_filter
    mode: high_shelf
    freq_hz: 3000
    q: 0.7
    gain_db: 2.0
```

**2. Military Radio** — *NATO-standard HF radio. The signature IC effect.*

Tight band-pass (300 Hz–3.4 kHz) matches real HF radio bandwidth. Compression squashes dynamic range like AGC circuitry. Subtle soft-clip distortion adds harmonic warmth. Noise gate creates a squelch effect. A faint static layer completes the illusion. Squelch tones mark transmission start/end — the distinctive "roger beep" of military comms.

```yaml
name: "Military Radio"
description: "NATO HF radio — tight bandwidth, squelch, static crackle"
tags: ["radio", "military", "immersive", "cold-war"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 300
    q: 0.7
  - type: biquad_filter
    mode: low_pass
    freq_hz: 3400
    q: 0.7
  - type: compressor
    threshold_db: -18
    ratio: 6.0
    attack_ms: 3
    release_ms: 40
  - type: soft_clip_distortion
    drive: 0.12
    mode: tube
  - type: noise_gate
    threshold_db: -38
    attack_ms: 1
    release_ms: 100
    hold_ms: 30
  - type: noise_layer
    type: static_crackle
    level_db: -32
squelch:
  start_tone_hz: 1200
  end_tone_hz: 800
  duration_ms: 60
  volume: 0.25
```

**3. Field Radio** — *Forward observer radio with environmental interference.*

Wider band-pass than Military Radio (less "studio," more "field"). Heavier static and occasional signal drift (subtle frequency wobble). No squelch tones — field conditions are rougher. The effect intensifies when `ConnectionQuality.quality_tier` drops (more static at lower quality) — adaptive degradation as a feature, not a bug.

```yaml
name: "Field Radio"
description: "Frontline field radio — static interference, signal drift"
tags: ["radio", "military", "atmospheric", "cold-war"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 250
    q: 0.5
  - type: biquad_filter
    mode: low_pass
    freq_hz: 3800
    q: 0.5
  - type: compressor
    threshold_db: -20
    ratio: 4.0
    attack_ms: 5
    release_ms: 50
  - type: soft_clip_distortion
    drive: 0.20
    mode: soft_clip
  - type: noise_layer
    type: static_crackle
    level_db: -26
  - type: frequency_shift
    shift_hz: 0.3
    mix: 0.05
```

**4. Command Post** — *Bunker-filtered comms with short reverb.*

Short reverb (~180ms decay) creates the acoustic signature of a concrete command bunker. Slight band-pass and compression. No static — the command post has clean equipment. This is the "mission briefing room" voice.

```yaml
name: "Command Post"
description: "Concrete bunker comms — short reverb, clean equipment"
tags: ["bunker", "military", "reverb", "cold-war"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 200
    q: 0.7
  - type: biquad_filter
    mode: low_pass
    freq_hz: 5000
    q: 0.7
  - type: compressor
    threshold_db: -20
    ratio: 3.5
    attack_ms: 5
    release_ms: 50
  - type: simple_reverb
    decay_ms: 180
    mix: 0.20
    pre_delay_ms: 8
```

**5. SIGINT Intercept** — *Encrypted comms being decoded. For fun.*

Frequency shifting, periodic glitch artifacts, and heavy processing create the effect of intercepted encrypted communications being partially decoded. Not practical for serious play — this is the "I'm playing a spy" preset.

```yaml
name: "SIGINT Intercept"
description: "Intercepted encrypted communications — partial decode artifacts"
tags: ["scrambled", "spy", "fun", "cold-war"]
chain:
  - type: biquad_filter
    mode: band_pass
    freq_hz: 1500
    q: 2.0
  - type: frequency_shift
    shift_hz: 3.0
    mix: 0.15
  - type: soft_clip_distortion
    drive: 0.30
    mode: foldback
  - type: compressor
    threshold_db: -15
    ratio: 8.0
    attack_ms: 1
    release_ms: 30
  - type: noise_layer
    type: hiss
    level_db: -28
```

**6. Vintage Valve** — *1940s vacuum tube radio warmth.*

Warm tube saturation, narrower bandwidth than HF radio, gentle compression. Evokes WW2-era communications equipment. Pairs well with Tiberian Dawn's earlier-era aesthetic.

```yaml
name: "Vintage Valve"
description: "Vacuum tube radio — warm saturation, WW2-era bandwidth"
tags: ["radio", "vintage", "warm", "retro"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 350
    q: 0.5
  - type: biquad_filter
    mode: low_pass
    freq_hz: 2800
    q: 0.5
  - type: soft_clip_distortion
    drive: 0.25
    mode: tube
  - type: compressor
    threshold_db: -22
    ratio: 3.0
    attack_ms: 10
    release_ms: 80
  - type: gain_stage
    gain_db: -2.0
  - type: noise_layer
    type: hiss
    level_db: -30
squelch:
  start_tone_hz: 1000
  end_tone_hz: 600
  duration_ms: 80
  volume: 0.20
```

##### Enhanced Voice Isolation (Background Voice Removal)

The user's request for "getting rid of background voices" is addressed at two levels:

1. **Sender-side (existing):** `nnnoiseless` (RNNoise) already handles this on the capture side. RNNoise's GRU neural network is trained specifically to isolate a primary speaker from background noise — including other voices. It performs well against TV audio, family conversations, and roommate speech because these register as non-stationary noise at lower amplitude than the primary mic input. This is already enabled by default (`voice.noise_suppression: true`).

2. **Receiver-side (new, optional):** An enhanced isolation mode applies a second `nnnoiseless` pass on the decoded audio. This catches background voices that survived Opus compression (Opus preserves all audio above the encoding threshold — including faint background voices that RNNoise on the sender side left in). The double-pass is more aggressive but risks removing valid speaker audio in edge cases (e.g., two people talking simultaneously into one mic). Exposed as `voice.enhanced_isolation: bool` (D033 toggle, default `false`).

**Why receiver-side isolation is optional:** Double-pass noise suppression can create audible artifacts — "underwater" voice quality when the second pass is too aggressive. Most users will find sender-side RNNoise sufficient. Enhanced isolation is for environments where background voices are a persistent problem (shared rooms, open offices) and the speaker cannot control their environment.

##### Workshop Voice Effect Presets

Voice effect presets are a Workshop resource type (D030), published and shared like any other mod resource:

**Resource type:** `voice_effect` (Workshop category: "Voice Effects")
**File format:** YAML with `.icvfx.yaml` extension (standard YAML — `serde_yaml` deserialization)
**Version:** Semver, following Workshop resource conventions (D030)

**Workshop preset structure:**

```yaml
# File: radio_spetsnaz.icvfx.yaml
# Workshop metadata block (same as all Workshop resources)
workshop:
  name: "Spetsnaz Radio"
  description: "Soviet military radio — heavy static, narrow bandwidth, authentic squelch"
  author: "comrade_modder"
  version: "1.2.0"
  license: "CC-BY-4.0"
  tags: ["radio", "soviet", "military", "cold-war", "immersive"]
  # Optional LLM metadata (D016 narrative DNA)
  llm:
    tone: "Soviet military communications — terse, formal"
    era: "Cold War, 1980s"

# DSP chain — same format as built-in presets
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 400
    q: 0.8
  - type: biquad_filter
    mode: low_pass
    freq_hz: 2800
    q: 0.8
  - type: compressor
    threshold_db: -16
    ratio: 8.0
    attack_ms: 2
    release_ms: 30
  - type: soft_clip_distortion
    drive: 0.18
    mode: tube
  - type: noise_layer
    type: static_crackle
    level_db: -24
squelch:
  start_tone_hz: 1400
  end_tone_hz: 900
  duration_ms: 50
  volume: 0.30
```

**Preview before subscribing:** The Workshop browser includes an "audition" feature — a 5-second sample voice clip (bundled with IC) is processed through the effect in real-time and played back. Players hear exactly what the effect sounds like before downloading. This uses the same DSP chain instantiation as live voice — no separate preview system.

**Validation:** Workshop voice effects are pure data (YAML DSP parameters). The DSP stages are built-in engine code — presets cannot execute arbitrary code. Parameter values are clamped to safe ranges (e.g., `drive` 0.0-1.0, `freq_hz` 20-20000, `gain_db` -40 to +20). This is inherently sandboxed — a malicious preset can at worst produce unpleasant audio, never crash the engine or access the filesystem. If a `chain` stage references an unknown `type`, it is skipped with a warning log.

**CLI tooling:** The `ic` CLI supports effect preset development:

```bash
ic audio effect preview radio_spetsnaz.icvfx.yaml      # Preview with sample clip
ic audio effect validate radio_spetsnaz.icvfx.yaml      # Check YAML structure + param ranges
ic audio effect chain-info radio_spetsnaz.icvfx.yaml    # Print stage count, CPU estimate
ic workshop publish --type voice-effect radio_spetsnaz.icvfx.yaml
```

##### Voice Effect Settings Integration

Updated `VoiceSettings` resource (additions in bold comments):

```rust
#[derive(Resource)]
pub struct VoiceSettings {
    pub noise_suppression: bool,       // D033 toggle, default true
    pub enhanced_isolation: bool,      // D033 toggle, default false — receiver-side double-pass
    pub spatial_audio: bool,           // D033 toggle, default false
    pub vad_mode: bool,                // false = PTT, true = VAD
    pub ptt_key: KeyCode,
    pub max_ptt_duration_secs: u32,    // hotmic protection, default 120
    pub effect_preset: Option<String>, // D033 setting — preset name or None for bypass
    pub effect_enabled: bool,          // D033 toggle, default false — master effect switch
    pub per_speaker_effects: HashMap<PlayerId, String>, // per-speaker override presets
}
```

**D033 QoL toggle pattern:** Voice effects follow the same toggle pattern as spatial audio and noise suppression. The `effect_preset` name is a D033 setting (selectable in voice settings UI). Experience profiles (D033) can bundle a voice effect preset with other preferences — e.g., an "Immersive" profile might enable spatial audio + Military Radio effect + smart danger alerts.

**Audio thread sync:** When `VoiceSettings` changes (user selects a new preset in the UI), the ECS → audio thread channel sends a `VoiceCommand::SetEffectPreset(chain)` message. The audio thread instantiates the new `VoiceEffectChain` and applies it starting from the next decoded frame. No glitch — the old chain's state is discarded and the new chain processes from a clean `reset()` state.

##### Competitive Considerations

Voice effects are **cosmetic audio processing** with no competitive implications:

- **Receiver-side only** — what you hear is your choice, not imposed on others. No player gains information advantage from voice effects.
- **No simulation interaction** — effects run entirely in `ic-audio` on the playback thread. Zero contact with `ic-sim`.
- **Tournament mode (D058):** Tournament organizers can restrict voice effects via lobby settings (`voice_effects_allowed: bool`). Broadcast streams may want clean voice for professional production. The restriction is per-lobby, not global — community tournaments set their own rules.
- **Replay casters:** When casting replays with voice-in-replay, casters apply their own effect preset (or none). This means the same replay can sound like a military briefing or a clean podcast depending on the caster's preference.

#### ECS Integration and Audio Thread Architecture

Voice state management uses Bevy ECS. The real-time audio pipeline runs on a dedicated thread. This follows the same pattern as Bevy's own audio system — ECS components are the *control surface*; the audio thread is the *engine*.

**ECS components and resources** (in `ic-audio` and `ic-net` systems, regular `Update` schedule — NOT in `ic-sim`'s `FixedUpdate`):

**Crate boundary note:** `ic-audio` (voice processing, jitter buffer, Opus encode/decode) and `ic-net` (VoicePacket send/receive on `MessageLane::Voice`) do not depend on each other directly. The bridge is `ic-game`, which depends on both and wires them together at app startup: `ic-net` systems write incoming `VoicePacket` data to a crossbeam channel; `ic-audio` systems read from that channel to feed the jitter buffer. Outgoing voice follows the reverse path. This preserves crate independence while enabling data flow — the same integration pattern `ic-game` uses to wire `ic-sim` and `ic-net` via `ic-protocol`.

```rust
/// Attached to player entities. Updated by the voice network system
/// when VoicePackets arrive (or VoiceActivity orders are processed).
/// Queried by ic-ui to render speaker icons.
#[derive(Component)]
pub struct VoiceActivity {
    pub speaking: bool,
    pub last_transmission: Instant,
}

/// Per-player mute/deafen state. Written by UI and /mute commands.
/// Read by the voice network system to filter forwarding hints.
#[derive(Component)]
pub struct VoiceMuteState {
    pub self_mute: bool,
    pub self_deafen: bool,
    pub muted_players: HashSet<PlayerId>,
}

/// Per-player incoming voice volume (0.0–2.0). Written by UI slider.
/// Sent to the audio thread via channel for per-speaker gain.
#[derive(Component)]
pub struct VoiceVolume(pub f32);

/// Per-speaker diagnostics. Updated by the audio thread via channel.
/// Queried by ic-ui to render connection quality indicators.
#[derive(Component)]
pub struct VoiceDiagnostics {
    pub jitter_ms: f32,
    pub packet_loss_pct: f32,
    pub round_trip_ms: f32,
    pub buffer_depth_frames: u32,
    pub estimated_latency_ms: f32,
}

/// Global voice settings. Synced to audio thread on change.
#[derive(Resource)]
pub struct VoiceSettings {
    pub noise_suppression: bool,     // D033 toggle, default true
    pub enhanced_isolation: bool,    // D033 toggle, default false
    pub spatial_audio: bool,         // D033 toggle, default false
    pub vad_mode: bool,              // false = PTT, true = VAD
    pub ptt_key: KeyCode,
    pub max_ptt_duration_secs: u32,  // hotmic protection, default 120
    pub effect_preset: Option<String>, // D033 setting, None = bypass
    pub effect_enabled: bool,        // D033 toggle, default false
}
```

**ECS ↔ Audio thread communication** via lock-free `crossbeam` channels:

```
┌─────────────────────────────────────────────────────┐
│  ECS World (Bevy systems — ic-audio, ic-ui, ic-net) │
│                                                     │
│  Player entities:                                   │
│    VoiceActivity, VoiceMuteState, VoiceVolume,      │
│    VoiceDiagnostics                                 │
│                                                     │
│  Resources:                                         │
│    VoiceBitrateAdapter, VoiceTransportState,         │
│    PttState, VoiceSettings                          │
│                                                     │
│  Systems:                                           │
│    voice_ui_system — reads activity, renders icons  │
│    voice_settings_system — syncs settings to thread │
│    voice_network_system — sends/receives packets    │
│      via channels, updates diagnostics              │
└──────────┬──────────────────────────┬───────────────┘
           │ crossbeam channel        │ crossbeam channel
           │ (commands ↓)             │ (events ↑)
┌──────────▼──────────────────────────▼───────────────┐
│  Audio Thread (dedicated, NOT ECS-scheduled)        │
│                                                     │
│  Capture: cpal → resample → denoise → encode        │
│  Playback: jitter buffer → decode/PLC → mix → cpal  │
│                                                     │
│  Runs on OS audio callback cadence (~5-10ms)        │
└─────────────────────────────────────────────────────┘
```

**Why the audio pipeline cannot be an ECS system:** ECS systems run on Bevy's task pool at frame rate (16ms at 60fps, 33ms at 30fps). Audio capture/playback runs on OS audio threads with ~5ms deadlines via `cpal` callbacks. A jitter buffer that pops every 20ms cannot be driven by a system running at frame rate — the timing mismatch causes audible artifacts. The audio thread runs independently and communicates with ECS via channels: the ECS side sends commands ("PTT pressed", "mute player X", "change bitrate") and receives events ("speaker X started", "diagnostics update", "encoded packet ready").

**What lives where:**

| Concern                                   | ECS? | Rationale                                                 |
| ----------------------------------------- | ---- | --------------------------------------------------------- |
| Voice state (speaking, mute, volume)      | Yes  | Components on player entities, queried by UI systems      |
| Voice settings (PTT key, noise suppress)  | Yes  | Bevy resource, synced to audio thread via channel         |
| Voice effect preset selection             | Yes  | Part of VoiceSettings; chain instantiated on audio thread |
| Network send/receive (VoicePacket ↔ lane) | Yes  | ECS system bridges network layer and audio thread         |
| Voice UI (speaker icons, PTT indicator)   | Yes  | Standard Bevy UI systems querying voice components        |
| Audio capture + encode pipeline           | No   | Dedicated audio thread, cpal callback timing              |
| Jitter buffer + decode/PLC                | No   | Dedicated audio thread, 20ms frame cadence                |
| Audio output + mixing                     | No   | Bevy audio backend thread (existing)                      |

#### UI Indicators

Voice activity is shown in the game UI:

- **In-game overlay:** Small speaker icon next to the player's name/color indicator when they are transmitting. Follows the same placement as SC2's voice indicators (top-right player list).
- **Lobby:** Speaker icon pulses when a player is speaking. Volume slider per player.
- **Chat log:** `[VOICE] Alice is speaking` / `[VOICE] Alice stopped` timestamps in the chat log (optional, toggle via D033 QoL).
- **PTT indicator:** Small microphone icon in the bottom-right corner when PTT key is held. Red slash through it when self-muted.
- **Connection quality:** Per-speaker signal bars (1-4 bars) derived from `VoiceDiagnostics` — jitter, loss, and latency combined into a single quality score. Visible in the player list overlay next to the speaker icon. A player with consistently poor voice quality sees a tooltip: "Poor voice connection — high packet loss" to distinguish voice issues from game network issues. Transport state ("Direct" vs "Tunneled") shown as a small icon when TCP fallback is active.
- **Hotmic warning:** If PTT exceeds 90 seconds (75% of the 120s auto-cut threshold), the PTT indicator turns yellow with a countdown. At 120s, it cuts and shows a brief "PTT timeout" notification.
- **Voice diagnostics panel:** `/voice diag` command opens a detailed overlay (developer/power-user tool) showing per-speaker jitter histogram, packet loss graph, buffer depth, estimated mouth-to-ear latency, and encode/decode CPU time. This is the equivalent of Discord's "Voice & Video Debug" panel.
- **Voice effect indicator:** When a voice effect preset is active, a small filter icon appears next to the microphone indicator. Hovering shows the active preset name (e.g., "Military Radio"). The icon uses the preset's primary tag color (radio presets = olive drab, clean presets = blue, fun presets = purple).

#### Competitive Voice Rules

Voice behavior in competitive contexts requires explicit rules that D058's tournament/ranked modes enforce:

**Voice during pause:** Voice transmission continues during game pauses and tactical timeouts. Voice is I/O, not simulation — pausing the sim does not pause communication. This matches CS2 (voice continues during tactical timeout) and SC2 (voice unaffected by pause). Team coordination during pauses is a legitimate strategic activity.

**Eliminated player voice routing:** When a player is eliminated (all units/structures destroyed), their voice routing depends on the game mode:

| Mode              | Eliminated player can...                                                                  | Rationale                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Casual / unranked | Remain on team voice                                                                      | Social experience; D021 eliminated-player roles (advisor, reinforcement controller) require voice                     |
| Ranked 1v1        | N/A (game ends on elimination)                                                            | No team to talk to                                                                                                    |
| Ranked team       | Remain on team voice for 60 seconds, then observer-only                                   | Brief window for handoff callouts, then prevents persistent backseat gaming. Configurable via tournament rules (D058) |
| Tournament        | Configurable by organizer: permanent team voice, timed cutoff, or immediate observer-only | Tournament organizers decide the rule for their event                                                                 |

**Ranked voice channel restrictions:** In ranked matchmaking (D055), `VoiceTarget::All` (all-chat voice) is **disabled**. Players can only use `VoiceTarget::Team`. All-chat text remains available (for gg/glhf). This matches CS2 and Valorant's competitive modes, which restrict voice to team-only. Rationale: cross-team voice is a toxicity vector and provides no competitive value. Tournament mode (D058) can re-enable all-voice if the organizer chooses (e.g., for show matches).

**Coach slot:** Community servers (D052) can designate a **coach slot** per team — a non-playing participant who has team voice access but cannot issue orders. The coach sees the team's shared vision (not full-map observer view). Coach voice routing uses `VoiceTarget::Team` but the coach's `PlayerId` is flagged as `PlayerRole::Coach` in the lobby. Coaches are subject to the same mute/report system as players. For ranked, coach slots are disabled (pure player skill measurement). For tournaments, organizer configures per-event. This follows CS2's coach system (voice during freezetime/timeouts, restricted during live rounds) but adapted for RTS where there are no freezetime rounds — the coach can speak at all times.

