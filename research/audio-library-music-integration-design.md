# Audio Library Choice & Music Integration Design for `ic-audio`

> **Purpose:** Resolve P003 (Audio library choice + music integration design) — the last unresolved pending decision blocking Phase 3 ("feels like RA" skirmish milestone)
> **Date:** 2026-02-26
> **Referenced by:** `src/architecture/crate-graph.md` (ic-audio), `src/architecture/ra-experience.md` (music system, audio fidelity), `src/02-ARCHITECTURE.md` (bevy_audio row), D059 (VoIP), D032 (themes), D038 (scenario editor)
> **Resolves:** P003 (`PG.P003.AUDIO_LIBRARY` in `tracking/milestone-dependency-map.md`)
> **Unblocks:** `M3.CORE.AUDIO_EVA_MUSIC`, `G13` (EVA/VO mission-end audio), `G15` (RA "feel" pass)

---

## 1. Library Evaluation & Decision

### Candidates

Three Rust audio libraries are viable for IC's requirements. All three are actively maintained, support WASM, and can integrate with Bevy.

#### bevy_audio (rodio)

Bevy's built-in audio plugin wraps rodio, a pure-Rust audio playback library.

**Strengths:**
- Zero additional dependencies — ships with Bevy
- Simple API for basic playback
- Spatial audio support (added in Bevy 0.13+)
- WASM support via WebAudio backend

**Limitations:**
- No mixer bus topology — flat playback, no sub-tracks, no send/return
- No parameter tweening — volume/pitch changes are instant, no smooth crossfade
- No sub-sample-accurate scheduling — cannot start sounds at precise offsets
- No streaming playback for large files (loads entire audio into memory)
- No built-in effects (reverb, filter, compression)
- Sound instance management is manual — no pooling, no stealing, no instance limits

**Verdict:** Insufficient. IC requires crossfade, bus routing, streaming, and instance management. Rodio is a playback library, not a game audio engine.

#### Oddio

A Rust spatial audio library focused on 3D positional audio with a signal-processing graph model.

**Strengths:**
- Clean signal graph architecture
- Good spatial audio with HRTF support
- Designed for games
- Pure Rust

**Limitations:**
- Smaller ecosystem and community than Kira
- No Bevy integration plugin (would require custom bridging)
- No built-in mixer bus topology with send/return
- No streaming from disk — operates on in-memory samples
- Limited effect chain support
- No parameter tweening system

**Verdict:** Strong spatial audio, but missing too many features IC needs (bus topology, streaming, crossfade tweening, effects). Building the missing pieces would cost months.

#### Kira

A purpose-built game audio library designed for expressive, dynamic audio.

**Strengths:**
- **Mixer bus topology:** Sub-tracks, send tracks, per-track effects (reverb, filter, delay, compression, distortion, EQ). Exactly the bus architecture IC needs.
- **Parameter tweening:** Smooth volume, pitch, panning, and effect parameter transitions with configurable easing curves and durations. Native crossfade support.
- **Clock system:** Audio-rate clocks for synchronizing sound events to musical time. Useful for dynamic music transitions aligned to beat boundaries.
- **Spatial audio:** Spatial sub-tracks with per-listener distance attenuation. Automatic distance-based reverb mix. Panning and volume scaling from listener distance.
- **Streaming playback:** `StreamingSoundData` loads and decodes audio on-the-fly from disk. Music tracks do not need to be fully loaded into memory.
- **Sound instance control:** Per-sound handles with pause, resume, stop, seek, volume, playback rate, and tweened transitions. Foundation for pooling and stealing.
- **Effects:** Built-in reverb, filter (low-pass, high-pass, band-pass, notch, peak), delay, distortion, compressor, and EQ. Custom effects via trait.
- **Backend-agnostic:** Default `cpal` backend, but backend is a trait. WASM uses `web-sys` WebAudio backend.
- **Bevy integration:** `bevy_kira_audio` provides ECS-native API — play sounds as Bevy commands, audio channels as resources, spatial audio tied to Bevy transforms.
- **Format support:** OGG Vorbis, WAV, MP3, FLAC out of the box. Custom decoders via trait (for `.aud` IMA ADPCM).

**Limitations:**
- Additional dependency (Kira + bevy_kira_audio)
- Replaces bevy_audio entirely (not additive — must disable Bevy's default audio plugin)
- WASM backend has browser-specific constraints (see Section 7)

**Verdict:** Kira provides every feature IC needs. The mixer topology, tweening, streaming, spatial audio, and effects system are precisely what `ic-audio` requires for dynamic music crossfade, EVA priority mixing, spatial SFX, and bus-based volume control.

### Decision: Kira via `bevy_kira_audio`

**SETTLED.** `ic-audio` uses Kira as its audio backend, integrated through `bevy_kira_audio`.

**Rationale:**
1. **Dynamic music crossfade** is the critical Phase 3 requirement. Kira's tweening system provides smooth crossfade between mood tracks with configurable duration and easing — exactly what `crossfade_ms: 2000` in `ra-experience.md` demands. Rodio cannot do this without manual sample-level mixing.
2. **Bus topology** maps directly to IC's audio priority system. Each priority tier (EVA, Voice, SFX, Music, Ambient) gets its own sub-track with independent volume control. Send tracks handle shared effects (reverb bus for spatial SFX). This is the architecture described in Section 2.
3. **Streaming** is required for music. RA tracks are 3-5 minutes at OGG 128-320kbps (2-8 MB each). Loading 8+ tracks into memory for a playlist is wasteful. Kira streams from disk, decoding on a background thread.
4. **Spatial audio** with per-listener distance attenuation maps directly to IC's camera-as-listener model (see `ra-experience.md` § Spatial Audio). Kira's spatial sub-tracks provide this natively.
5. **VoIP coexistence** (D059): D059's VoIP pipeline uses `cpal` directly for capture and a dedicated audio thread for jitter buffer/decode. Kira also uses `cpal` for output. The VoIP decoded PCM is mixed into Kira's output via a custom effect on the VoIP bus sub-track (see Section 2). This avoids fighting over the audio device — Kira owns the output device, VoIP feeds into Kira's mixer.
6. **`bevy_kira_audio`** provides idiomatic Bevy integration: play sounds via ECS commands, audio channels as Bevy resources, spatial audio tied to `Transform` components. `ic-audio` wraps this with IC-specific systems (EVA queue, dynamic music FSM, sound pooling).

**What `bevy_audio` row in `02-ARCHITECTURE.md` becomes:** "Kira via `bevy_kira_audio` — `ic-audio` wraps for .aud/.ogg/EVA/dynamic music/bus mixing."

**Dependency chain:**
```
ic-audio
├── bevy_kira_audio  (Bevy plugin — ECS integration)
│   └── kira         (audio engine — mixer, tweens, spatial, streaming)
│       └── cpal     (platform audio I/O — shared with VoIP capture)
├── ra-formats       (.aud IMA ADPCM decoder)
└── bevy             (ECS, asset system, transform queries)
```

---

## 2. Audio Bus Architecture

### Mixer Topology

Kira's mixer is a tree of tracks. Each track has independent volume, panning, and an effect chain. Sub-tracks route audio to their parent. Send tracks receive audio from any track and route to the main output independently (for shared effects like reverb).

```
Main Track (master volume: settings.master_volume)
├── MusicBus (volume: settings.music_volume)
│   ├── MusicTrackA  — currently playing track
│   └── MusicTrackB  — crossfade target (swap roles on transition)
├── SfxBus (volume: settings.sfx_volume)
│   ├── WeaponSub    — weapon fire sounds
│   ├── ExplosionSub — impact/explosion sounds
│   └── UiSub        — clicks, beeps, placement sounds
├── VoiceBus (volume: settings.voice_volume)
│   ├── EvaSub       — EVA notification voice lines
│   ├── UnitSub      — unit acknowledgment/response voices
│   └── VoipSub      — decoded VoIP from D059 pipeline (custom source)
└── AmbientBus (volume: settings.ambient_volume)
    ├── BiomeSub     — per-biome ambient loops (waves, wind)
    └── WeatherSub   — weather overlay sounds (rain, storm — D022)

Send Tracks (shared effects):
├── ReverbSend   — reverb effect (fed by SfxBus spatial sounds)
└── CompressSend — limiter/compressor on master output (prevents clipping)
```

### Rust Types

```rust
use kira::track::{TrackHandle, TrackBuilder, SendTrackHandle, SendTrackBuilder};
use kira::effect::reverb::ReverbBuilder;
use kira::effect::compressor::CompressorBuilder;

/// All mixer bus handles, created once at startup and stored as a Bevy resource.
#[derive(Resource)]
pub struct AudioBuses {
    // Primary buses
    pub music: MusicBus,
    pub sfx: SfxBus,
    pub voice: VoiceBus,
    pub ambient: AmbientBus,
    // Send tracks (shared effects)
    pub reverb_send: SendTrackHandle,
    pub master_compressor: SendTrackHandle,
}

pub struct MusicBus {
    pub parent: TrackHandle,
    /// Two sub-tracks for A/B crossfade. `active` index toggles on transition.
    pub track_a: TrackHandle,
    pub track_b: TrackHandle,
    /// Which track (0=A, 1=B) is currently the "active" (audible) track.
    pub active: u8,
}

pub struct SfxBus {
    pub parent: TrackHandle,
    pub weapon: TrackHandle,
    pub explosion: TrackHandle,
    pub ui: TrackHandle,
}

pub struct VoiceBus {
    pub parent: TrackHandle,
    pub eva: TrackHandle,
    pub unit: TrackHandle,
    pub voip: TrackHandle,
}

pub struct AmbientBus {
    pub parent: TrackHandle,
    pub biome: TrackHandle,
    pub weather: TrackHandle,
}

/// Volume settings, loaded from config.toml and synced to bus volumes.
#[derive(Resource, Clone)]
pub struct AudioSettings {
    pub master_volume: f32,   // 0.0 - 1.0
    pub music_volume: f32,
    pub sfx_volume: f32,
    pub voice_volume: f32,
    pub ambient_volume: f32,
}
```

### Bus Initialization

```rust
fn init_audio_buses(
    mut commands: Commands,
    mut manager: ResMut<AudioManager>,
    settings: Res<AudioSettings>,
) {
    // Music bus with A/B crossfade sub-tracks
    let music_parent = manager.add_sub_track(
        TrackBuilder::new().volume(settings.music_volume as f64)
    ).unwrap();
    let track_a = manager.add_sub_track(TrackBuilder::new()).unwrap();
    let track_b = manager.add_sub_track(
        TrackBuilder::new().volume(0.0) // starts silent
    ).unwrap();

    // SFX bus with sub-categories
    let sfx_parent = manager.add_sub_track(
        TrackBuilder::new().volume(settings.sfx_volume as f64)
    ).unwrap();
    let weapon = manager.add_sub_track(TrackBuilder::new()).unwrap();
    let explosion = manager.add_sub_track(TrackBuilder::new()).unwrap();
    let ui = manager.add_sub_track(TrackBuilder::new()).unwrap();

    // Reverb send — spatial SFX route a portion here
    let reverb_send = manager.add_send_track(
        SendTrackBuilder::new()
            .with_effect(ReverbBuilder::new().mix(1.0).damping(0.5))
    ).unwrap();

    // Master compressor send — prevents clipping when many sounds play
    let master_compressor = manager.add_send_track(
        SendTrackBuilder::new()
            .with_effect(CompressorBuilder::new().threshold(-6.0).ratio(4.0))
    ).unwrap();

    // Voice bus
    let voice_parent = manager.add_sub_track(
        TrackBuilder::new().volume(settings.voice_volume as f64)
    ).unwrap();
    let eva = manager.add_sub_track(TrackBuilder::new()).unwrap();
    let unit = manager.add_sub_track(TrackBuilder::new()).unwrap();
    let voip = manager.add_sub_track(TrackBuilder::new()).unwrap();

    // Ambient bus
    let ambient_parent = manager.add_sub_track(
        TrackBuilder::new().volume(settings.ambient_volume as f64)
    ).unwrap();
    let biome = manager.add_sub_track(TrackBuilder::new()).unwrap();
    let weather = manager.add_sub_track(TrackBuilder::new()).unwrap();

    commands.insert_resource(AudioBuses {
        music: MusicBus { parent: music_parent, track_a, track_b, active: 0 },
        sfx: SfxBus { parent: sfx_parent, weapon, explosion, ui },
        voice: VoiceBus { parent: voice_parent, eva, unit, voip },
        ambient: AmbientBus { parent: ambient_parent, biome, weather },
        reverb_send,
        master_compressor,
    });
}
```

### Volume Sync System

```rust
/// Bevy system: syncs AudioSettings changes to Kira bus volumes with a
/// smooth 100ms tween (avoids clicks from instant volume jumps).
fn sync_bus_volumes(
    settings: Res<AudioSettings>,
    buses: Res<AudioBuses>,
) {
    if !settings.is_changed() { return; }

    let tween = Tween {
        duration: Duration::from_millis(100),
        ..Default::default()
    };
    buses.music.parent.set_volume(settings.music_volume as f64, tween);
    buses.sfx.parent.set_volume(settings.sfx_volume as f64, tween);
    buses.voice.parent.set_volume(settings.voice_volume as f64, tween);
    buses.ambient.parent.set_volume(settings.ambient_volume as f64, tween);
}
```

### VoIP Integration (D059)

D059 specifies that VoIP decode runs on a dedicated audio thread, producing PCM frames. These frames are fed into Kira's mixer via a custom sound source on the `VoipSub` track:

```rust
/// Custom Kira sound source that reads decoded VoIP PCM from a ring buffer.
/// The D059 audio thread writes decoded Opus frames into this buffer.
/// Kira's mixer thread reads from it, mixing VoIP with game audio seamlessly.
pub struct VoipSource {
    /// Per-player ring buffers. Each buffer holds decoded f32 PCM at 48kHz mono.
    player_buffers: HashMap<PlayerId, RingBuffer<f32>>,
    /// Per-player volume (from user settings / mute state).
    player_volumes: HashMap<PlayerId, f32>,
}
```

This avoids the `cpal` device contention problem: Kira owns the output device, and VoIP feeds into Kira's mixer graph rather than fighting for a separate output stream. D059's capture pipeline still uses `cpal` directly (input device is separate from output device on all platforms).

---

## 3. Dynamic Music State Machine

### Music Modes

As defined in `ra-experience.md`, `ic-audio` supports three music playback modes:

| Mode | Behavior | Use Case |
| --- | --- | --- |
| `Jukebox` | Sequential or shuffle playlist, no game-state awareness | Classic RA experience, `vanilla` profile |
| `Sequential` | Ordered playlist, advances on track end | Campaign missions with scripted music order |
| `Dynamic` | Mood-tagged tracks, game-state-driven transitions with crossfade | `iron_curtain` profile default, SDK missions |

### State Machine (Dynamic Mode)

```rust
/// Music mood categories. Each maps to a pool of tracks defined in YAML.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MusicMood {
    Ambient,   // Peaceful, no threats — base building, exploring
    Buildup,   // Tension rising — enemy detected, troops massing
    Combat,    // Active engagement — shots fired, units dying
    Victory,   // Player won (mission) or decisive advantage (skirmish)
    Defeat,    // Player lost or critical losses
}

/// Transitions between moods. Each edge has conditions and timing.
///
///  ┌──────────┐    enemy_detected     ┌──────────┐
///  │ Ambient  │ ──────────────────>   │ Buildup  │
///  └──────────┘                       └──────────┘
///       ^                                  │
///       │ no_threats(30s)                   │ combat_started
///       │                                  v
///       │                             ┌──────────┐
///       └──────────────────────────── │ Combat   │
///              combat_ended +         └──────────┘
///              linger(5s) +                │  │
///              no_threats(10s)             │  │
///                                         │  │
///                      mission_won ───────┘  └─── mission_lost
///                           v                         v
///                     ┌──────────┐             ┌──────────┐
///                     │ Victory  │             │ Defeat   │
///                     └──────────┘             └──────────┘
///
#[derive(Resource)]
pub struct DynamicMusicState {
    pub current_mood: MusicMood,
    pub mood_enter_time: f64,          // game time when mood was entered
    pub combat_score: f32,             // rolling combat intensity (0.0-1.0)
    pub last_combat_time: f64,         // game time of last combat event
    pub threat_level: f32,             // base threat (0.0-1.0)
    pub crossfade_ms: u32,            // default: 2000
    pub combat_linger_s: f32,         // default: 5.0
    pub playlist: DynamicPlaylist,     // mood -> Vec<TrackId>
    pub current_track_handle: Option<SoundHandle>,
}

/// Per-mood track pools, loaded from music_config.yaml.
#[derive(Clone)]
pub struct DynamicPlaylist {
    pub tracks: HashMap<MusicMood, Vec<TrackId>>,
    /// Track history to avoid immediate repeats within a mood.
    pub recently_played: VecDeque<TrackId>,
    pub max_history: usize,            // default: 3
}
```

### Combat Detection Algorithm

Combat intensity is a rolling score derived from simulation events. The score decays over time and spikes on combat events.

```rust
/// Combat score calculation. Runs every sim tick, reads combat events.
/// This system is in ic-audio, NOT in ic-sim — it's presentation-layer
/// interpretation of sim events, not game logic.
fn update_combat_score(
    mut state: ResMut<DynamicMusicState>,
    combat_events: EventReader<CombatEvent>,
    time: Res<GameTime>,
) {
    let dt = time.delta_seconds();

    // Decay: score drops by 20% per second toward zero
    state.combat_score *= (1.0 - 0.2 * dt).max(0.0);

    // Spike: each combat event adds to the score
    for event in combat_events.read() {
        let weight = match event.kind {
            CombatKind::WeaponFire  => 0.02, // small per-shot contribution
            CombatKind::UnitDamaged => 0.05, // more significant
            CombatKind::UnitKilled  => 0.15, // major spike
            CombatKind::BuildingHit => 0.10, // base under attack
            CombatKind::BuildingDestroyed => 0.25, // major event
        };
        state.combat_score = (state.combat_score + weight).min(1.0);
    }

    // Threat level: enemy units visible near player base
    // (updated less frequently — every 60 ticks — by a separate system)
}

/// Thresholds for mood transitions.
const COMBAT_ENTER_THRESHOLD: f32 = 0.3;   // score above this → Combat mood
const BUILDUP_ENTER_THRESHOLD: f32 = 0.1;  // score above this → Buildup
const AMBIENT_RETURN_THRESHOLD: f32 = 0.05; // score below this → eligible for Ambient
```

### Transition Logic

```rust
/// Mood transition system. Runs every frame (not every tick — audio is frame-rate).
fn update_music_mood(
    mut state: ResMut<DynamicMusicState>,
    time: Res<GameTime>,
    mission_state: Option<Res<MissionResult>>,
) {
    let now = time.elapsed_seconds();
    let time_in_mood = now - state.mood_enter_time;
    let time_since_combat = now - state.last_combat_time;

    let new_mood = match state.current_mood {
        MusicMood::Ambient => {
            if state.combat_score >= COMBAT_ENTER_THRESHOLD {
                Some(MusicMood::Combat)
            } else if state.combat_score >= BUILDUP_ENTER_THRESHOLD
                      || state.threat_level > 0.3 {
                Some(MusicMood::Buildup)
            } else {
                None
            }
        }
        MusicMood::Buildup => {
            if state.combat_score >= COMBAT_ENTER_THRESHOLD {
                Some(MusicMood::Combat)
            } else if state.combat_score < AMBIENT_RETURN_THRESHOLD
                      && time_in_mood > 30.0 {
                // Been in buildup for 30s with no combat — false alarm
                Some(MusicMood::Ambient)
            } else {
                None
            }
        }
        MusicMood::Combat => {
            // Combat linger: stay in combat mood for combat_linger_s after
            // last combat event, even if score drops
            if state.combat_score < AMBIENT_RETURN_THRESHOLD
               && time_since_combat > state.combat_linger_s as f64 {
                if state.threat_level > 0.2 {
                    Some(MusicMood::Buildup) // threats remain, don't go ambient
                } else {
                    Some(MusicMood::Ambient)
                }
            } else {
                None
            }
        }
        MusicMood::Victory | MusicMood::Defeat => {
            // Terminal states — no automatic transition out
            None
        }
    };

    // Mission end overrides all other transitions
    if let Some(result) = mission_state {
        let mission_mood = match result.outcome {
            MissionOutcome::Won => MusicMood::Victory,
            MissionOutcome::Lost => MusicMood::Defeat,
            _ => state.current_mood,
        };
        if mission_mood != state.current_mood {
            transition_music(&mut state, mission_mood, now);
            return;
        }
    }

    if let Some(mood) = new_mood {
        transition_music(&mut state, mood, now);
    }
}
```

### Crossfade Implementation

Crossfade uses Kira's tweening system on the A/B music sub-tracks:

```rust
fn transition_music(
    state: &mut DynamicMusicState,
    new_mood: MusicMood,
    now: f64,
) {
    state.current_mood = new_mood;
    state.mood_enter_time = now;

    // Select next track from the mood's pool (avoid recently played)
    let track_id = state.playlist.pick_track(new_mood);

    let fade_duration = Duration::from_millis(state.crossfade_ms as u64);
    let tween = Tween {
        duration: fade_duration,
        easing: Easing::InOutSine, // smooth S-curve, no perceptible volume dip
        ..Default::default()
    };

    // A/B crossfade: fade out current track, fade in new track on other sub-track
    // The "active" index toggles between 0 (track_a) and 1 (track_b)
    let (fade_out_track, fade_in_track) = if state.active == 0 {
        (&state.buses.music.track_a, &state.buses.music.track_b)
    } else {
        (&state.buses.music.track_b, &state.buses.music.track_a)
    };

    // Fade out the current track
    fade_out_track.set_volume(0.0, tween);

    // Start new track on the other sub-track at zero volume, then fade in
    fade_in_track.set_volume(0.0, Tween::default()); // instant to zero
    // Play new track on fade_in_track...
    // (sound is started via bevy_kira_audio play command on the target track)
    fade_in_track.set_volume(1.0, tween);

    state.active = 1 - state.active;
}
```

### Lua API Integration

As specified in `ra-experience.md`, Lua scripts can override the dynamic music system:

```lua
-- Force a specific track (hard cut, no crossfade)
Media.PlayMusic("HELLMARCH", { crossfade = 0 })

-- Force a specific track with crossfade
Media.PlayMusic("HELLMARCH", { crossfade = 3000 })

-- Override mood category temporarily
Media.SetMusicMood("combat")

-- Switch music mode for the remainder of the mission
Media.SetMusicMode("jukebox")

-- Replace the dynamic playlist at runtime
Media.SetMusicPlaylist("combat", {"HELLMARCH", "TRENCHES", "CC_THANG"})
```

---

## 4. EVA Notification System

### Priority Queue

EVA notifications are the highest-priority audio in the game. When multiple notifications fire simultaneously (common during base attacks), a priority queue ensures the most important one plays first and lower-priority ones are queued or dropped.

```rust
/// EVA notification priority. Higher numeric value = higher priority.
/// These values are YAML-configurable per game module.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum EvaPriority {
    Info       = 0,  // "Ore miner under attack" (frequent, droppable)
    Warning    = 1,  // "Unit lost", "Building captured"
    Alert      = 2,  // "Base under attack", "Ally under attack"
    Critical   = 3,  // "Nuclear launch detected", "Iron Curtain activated"
    Mission    = 4,  // "Mission accomplished", "Mission failed" (never dropped)
}

/// A single EVA notification in the queue.
#[derive(Debug, Clone)]
pub struct EvaNotification {
    pub sound: SoundId,
    pub priority: EvaPriority,
    pub cooldown_key: CooldownKey,  // notification type for cooldown tracking
    pub timestamp: f64,             // game time when notification was generated
    pub max_age_s: f32,             // discard if older than this (default: 5.0)
}

/// The EVA notification queue and playback state.
#[derive(Resource)]
pub struct EvaSystem {
    /// Priority queue — highest priority, then oldest timestamp.
    pub queue: BinaryHeap<EvaNotification>,
    /// Maximum queue depth. Entries beyond this are dropped (lowest priority first).
    pub max_queue_depth: usize,          // default: 8
    /// Per-notification-type cooldown timers. Prevents "Unit lost" spam.
    pub cooldowns: HashMap<CooldownKey, f64>,
    /// Currently playing EVA sound handle (if any).
    pub current: Option<SoundHandle>,
    /// Whether current EVA playback has finished.
    pub current_finished: bool,
}

/// Cooldown key: one per distinct notification type.
/// "Unit lost" has a single cooldown regardless of which unit.
/// "Building captured" has a separate cooldown from "Unit lost".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CooldownKey(pub u32); // mapped from notification type enum
```

### Cooldown Configuration

```yaml
# audio/eva_config.yaml
eva_cooldowns:
  unit_lost:           3.0   # seconds — at most one "Unit lost" per 3s
  building_captured:   5.0
  base_under_attack:   8.0   # frequent in heated battles — long cooldown
  ore_miner_attacked:  10.0  # very frequent, very long cooldown
  construction_complete: 0.0 # no cooldown — always play
  nuclear_launch:      0.0   # critical — always play immediately
  mission_accomplished: 0.0
  mission_failed:      0.0

eva_queue:
  max_depth: 8
  max_age_s: 5.0              # discard queued notifications older than 5s
```

### EVA Pipeline

```
Sim Event (unit killed, building captured, etc.)
    │
    ▼
notification_system() — Bevy observer on sim events
    │
    ▼
Cooldown Check: is this notification type on cooldown?
    │ YES → drop notification, do not enqueue
    │ NO  → continue
    ▼
Enqueue EvaNotification into EvaSystem.queue
    │
    ▼
eva_playback_system() — runs every frame
    │
    ├─ If current EVA is playing → wait (EVA plays one at a time)
    │
    ├─ If current EVA finished → pop next from queue
    │     │
    │     ├─ Check max_age: discard stale notifications
    │     ├─ Play sound on EvaSub track
    │     ├─ Set cooldown timer for this notification type
    │     └─ Store SoundHandle in EvaSystem.current
    │
    └─ If queue empty → idle
```

### Interruption Rules

```rust
/// Determines whether a new notification should interrupt the currently playing one.
fn should_interrupt(current: &EvaNotification, incoming: &EvaNotification) -> bool {
    // Critical and Mission priority always interrupt anything below them
    if incoming.priority >= EvaPriority::Critical
       && current.priority < EvaPriority::Critical {
        return true;
    }
    // Mission priority interrupts everything (including Critical)
    if incoming.priority >= EvaPriority::Mission {
        return true;
    }
    // Otherwise, do not interrupt — queue the incoming notification
    false
}
```

EVA audio is non-positional (plays at center, no spatial attenuation). It routes to `VoiceBus > EvaSub`, which has highest effective priority because the EVA sub-track volume is never attenuated by distance.

---

## 5. Sound Effect Management

### Concurrent Sound Limits

Unbounded concurrent sounds cause mixer saturation, CPU spikes, and clipping. IC enforces limits at three levels:

```rust
/// Global and per-category sound limits.
#[derive(Resource)]
pub struct SoundLimits {
    /// Hard ceiling on total concurrent non-music, non-EVA sounds.
    pub max_total: u32,            // default: 64
    /// Per-category limits.
    pub max_weapon: u32,           // default: 16
    pub max_explosion: u32,        // default: 12
    pub max_unit_voice: u32,       // default: 8
    pub max_ambient: u32,          // default: 8
    pub max_ui: u32,               // default: 4
    /// Per-sound-type instance limit (e.g., max 3 overlapping rifle shots).
    pub max_per_sound_type: u32,   // default: 3
}
```

### Sound Pooling

Active sounds are tracked in a pool with metadata for priority-based stealing:

```rust
#[derive(Resource)]
pub struct SoundPool {
    pub active: Vec<ActiveSound>,
}

pub struct ActiveSound {
    pub handle: SoundHandle,
    pub sound_id: SoundId,
    pub category: SoundCategory,
    pub priority: AudioPriority,
    pub start_time: f64,
    pub position: Option<WorldPos>,  // None for non-positional
    pub distance_sq: f32,            // squared distance to camera (updated per frame)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundCategory {
    Weapon,
    Explosion,
    UnitVoice,
    Ambient,
    Ui,
}
```

### Sound Stealing Algorithm

When a new sound must play but the pool is full, the least important active sound is stolen (stopped to make room):

```rust
/// Select the best candidate for stealing. Returns None if the new sound
/// should itself be dropped (lower priority than everything playing).
fn pick_steal_candidate(
    pool: &SoundPool,
    new_priority: AudioPriority,
    new_category: SoundCategory,
) -> Option<usize> {
    // Sort candidates by steal priority (best to steal = lowest score):
    // 1. Lowest AudioPriority
    // 2. Within same priority: greatest distance from camera
    // 3. Within same distance: oldest start time
    let mut best: Option<(usize, StealScore)> = None;

    for (i, sound) in pool.active.iter().enumerate() {
        let score = StealScore {
            priority: sound.priority,
            distance_sq: sound.distance_sq,
            age: sound.start_time,
        };
        if let Some((_, ref best_score)) = best {
            if score < *best_score {
                best = Some((i, score));
            }
        } else {
            best = Some((i, score));
        }
    }

    // Only steal if the new sound is higher priority (or equal priority
    // and the candidate is far away)
    if let Some((idx, score)) = best {
        if new_priority > score.priority
           || (new_priority == score.priority && score.distance_sq > 2500.0) {
            return Some(idx);
        }
    }
    None // new sound is lower priority — drop it instead
}
```

### Spatial Attenuation

Spatial SFX volume is attenuated by distance from the camera (listener). Kira's spatial sub-tracks handle this natively, but IC configures the attenuation curve:

```rust
/// Distance attenuation parameters for spatial audio.
pub struct SpatialConfig {
    /// Distance at which sound is at full volume.
    pub ref_distance: f32,     // default: 5.0 cells
    /// Distance at which sound is inaudible (culled entirely).
    pub max_distance: f32,     // default: 40.0 cells
    /// Attenuation model: inverse distance, clamped.
    /// volume = clamp(ref_distance / distance, 0.0, 1.0)
    pub rolloff: f32,          // default: 1.0
}
```

### Distance Culling

Sounds beyond `max_distance` are never started — they are dropped before entering the mixer. This is the cheapest optimization: no decode, no mix, zero CPU cost.

```rust
/// Pre-filter: do not play sounds that the player cannot hear.
fn should_play_sound(
    position: Option<WorldPos>,
    camera_pos: WorldPos,
    config: &SpatialConfig,
) -> bool {
    match position {
        None => true, // non-positional sounds always play
        Some(pos) => {
            let dist_sq = (pos - camera_pos).length_squared();
            dist_sq <= config.max_distance * config.max_distance
        }
    }
}
```

---

## 6. Format Pipeline

### `.aud` IMA ADPCM Decode Path

Original Red Alert audio files use the `.aud` format with IMA ADPCM compression. `ra-formats` provides the decoder; `ic-audio` bridges the decoded PCM into Kira.

```
.aud file on disk
    │
    ▼
ra-formats::aud::AudDecoder
    │  Reads: sample rate, channels, IMA ADPCM compressed blocks
    │  Outputs: Vec<i16> PCM samples (decoded)
    ▼
Convert i16 → f32 PCM (divide by 32768.0)
    │
    ▼
Wrap in Kira StaticSoundData::from_frames()
    │  (small files: full decode, store in memory)
    ▼
Play on appropriate Kira sub-track
```

For `.aud` files, pre-decode is always used. Original RA `.aud` files are small (unit voices: 5-50 KB compressed, <200 KB decoded). The IMA ADPCM decode is fast (pure integer math) and the resulting PCM fits easily in memory.

### Custom Bevy Asset Loader

```rust
/// Bevy asset loader for .aud files via ra-formats.
#[derive(Default)]
pub struct AudAssetLoader;

impl AssetLoader for AudAssetLoader {
    type Asset = AudioSource; // Bevy's audio asset type
    type Settings = ();
    type Error = AudDecodeError;

    async fn load(
        &self,
        reader: &mut dyn AsyncRead,
        _settings: &(),
        _load_context: &mut LoadContext<'_>,
    ) -> Result<AudioSource, AudDecodeError> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;
        let decoded = ra_formats::aud::decode(&bytes)?;
        // Convert to f32 PCM and wrap as Kira-compatible audio data
        let frames: Vec<f32> = decoded.samples
            .iter()
            .map(|&s| s as f32 / 32768.0)
            .collect();
        Ok(AudioSource::from_pcm(frames, decoded.sample_rate, decoded.channels))
    }

    fn extensions(&self) -> &[&str] {
        &["aud"]
    }
}
```

### OGG / WAV / MP3 Loading

Standard formats are handled by Kira's built-in decoders:

| Format | Decode Mode | Rationale |
| --- | --- | --- |
| `.aud` (IMA ADPCM) | Pre-decode (always) | Small files (<200 KB decoded), fast integer decode |
| `.wav` (PCM 16-bit) | Pre-decode if <512 KB, stream if larger | SFX are small; no decode cost. Large WAVs (rare) stream. |
| `.ogg` (Vorbis) | Stream if >256 KB, pre-decode if smaller | Music tracks stream (3-8 MB). Short SFX pre-decode. |
| `.mp3` | Stream if >256 KB, pre-decode if smaller | Same policy as OGG. MP3 support for workshop mods. |

### Streaming vs Pre-decode Threshold

```rust
/// Determines whether an audio file should be streamed or fully pre-decoded.
fn should_stream(file_size_bytes: u64, format: AudioFormat) -> bool {
    match format {
        AudioFormat::Aud => false,  // always pre-decode
        AudioFormat::Wav => file_size_bytes > 512 * 1024,  // >512 KB
        AudioFormat::Ogg | AudioFormat::Mp3 => file_size_bytes > 256 * 1024,  // >256 KB
    }
}
```

Music tracks are always streamed regardless of size (they are played sequentially and do not benefit from pre-loading). SFX that will be played frequently (weapon fire, explosions) are pre-decoded into memory during map load for zero-latency playback.

### Asset Loading Integration

`ic-audio` registers its asset loaders with Bevy's asset system during plugin initialization:

```rust
impl Plugin for IcAudioPlugin {
    fn build(&self, app: &mut App) {
        app
            // Register .aud loader (ra-formats integration)
            .init_asset_loader::<AudAssetLoader>()
            // Kira handles .ogg, .wav, .mp3 natively via bevy_kira_audio
            .add_plugins(AudioPlugin)  // bevy_kira_audio plugin
            // Initialize bus topology
            .add_systems(Startup, init_audio_buses)
            // Core audio systems
            .add_systems(Update, (
                sync_bus_volumes,
                update_combat_score,
                update_music_mood,
                eva_playback_system,
                sound_pool_cleanup,
                spatial_distance_update,
            ).chain());
    }
}
```

---

## 7. WASM / Browser Constraints

### Web Audio API Restrictions

Browsers impose restrictions that do not exist on desktop platforms. `ic-audio` must handle these transparently.

**Autoplay policy:** All modern browsers block audio playback until a user gesture (click, tap, key press) has occurred. Kira's WASM backend (`web-sys` WebAudio) creates an `AudioContext` in the "suspended" state. On first user interaction, the context must be resumed.

```rust
/// Browser-specific: resume AudioContext on first user interaction.
/// This system runs only on WASM builds.
#[cfg(target_arch = "wasm32")]
fn resume_audio_context_on_interaction(
    mut resumed: Local<bool>,
    input: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    audio_manager: Res<AudioManager>,
) {
    if *resumed { return; }
    if input.any_just_pressed([MouseButton::Left, MouseButton::Right])
       || keys.any_just_pressed_iter().next().is_some()
    {
        audio_manager.resume_context(); // Kira's WASM backend method
        *resumed = true;
    }
}
```

**Implementation note:** The main menu shellmap (D032) provides the natural first interaction — clicking "Play" or any menu button resumes the AudioContext before gameplay audio is needed. No special UI prompt is required.

### Concurrent Sound Limits in Browsers

WebAudio has no hard limit on concurrent sounds, but performance degrades faster than native due to JavaScript bridge overhead. Browser builds use stricter limits:

```rust
#[cfg(target_arch = "wasm32")]
pub const DEFAULT_MAX_TOTAL_SOUNDS: u32 = 32; // half of native
#[cfg(not(target_arch = "wasm32"))]
pub const DEFAULT_MAX_TOTAL_SOUNDS: u32 = 64;
```

### Streaming in WASM

Kira's WASM backend supports streaming via `fetch` + `ReadableStream`. Music tracks stream from the server (or browser cache) without loading fully into memory. This is critical for WASM builds where memory is more constrained (default WASM heap is 256 MB, shared with all game systems).

### Format Support in WASM

| Format | WASM Support | Notes |
| --- | --- | --- |
| `.ogg` | Yes (Kira's pure-Rust Vorbis decoder) | Primary format for browser |
| `.wav` | Yes (Kira's built-in PCM reader) | Works, but large files waste bandwidth |
| `.mp3` | Yes (Kira's `symphonia` decoder) | Works; less efficient than OGG |
| `.aud` | Yes (`ra-formats` is pure Rust) | IMA ADPCM decode is integer-only, WASM-safe |

### VoIP in WASM

D059 specifies that VoIP capture uses `cpal`, which maps to `AudioWorklet` on WASM. The Opus codec (`audiopus`) wraps libopus via C FFI, which requires wasm32-compatible compilation of libopus (available via Emscripten, or use the pure-Rust `opus-rs` fallback). The VoIP→Kira mixer integration (Section 2) works identically on WASM since it operates on decoded PCM frames.

**Browser-specific AEC:** Echo cancellation on WASM can delegate to the browser's built-in WebRTC AEC via `getUserMedia` constraints (`{ echoCancellation: true }`), avoiding the need for Speex AEC in WASM builds.

---

## 8. Performance Budget & Targets

### CPU Budget

| Component | Budget (per frame @ 60 FPS) | Notes |
| --- | --- | --- |
| Music streaming + crossfade | <0.1 ms | Kira decodes on background thread; mixer runs on audio thread |
| SFX mixing (64 concurrent) | <0.3 ms | Kira mixer is optimized for many voices |
| EVA queue management | <0.01 ms | Simple priority queue, runs once per frame |
| Spatial audio updates | <0.1 ms | Distance calculations for active sounds |
| Combat score calculation | <0.05 ms | Event iteration + decay, runs per-tick |
| Dynamic music FSM | <0.01 ms | State check + occasional crossfade trigger |
| VoIP decode + mix (8 players) | <0.2 ms | Opus decode on audio thread (D059 budget) |
| **Total audio CPU** | **<0.8 ms** | **Target: <1.0 ms per frame** |

Kira's mixer runs on a dedicated audio thread (not the main ECS thread). The budget above includes only the main-thread cost of `ic-audio`'s Bevy systems (queueing sounds, updating state, sending commands to Kira). The actual sample mixing is off-thread and does not compete with sim or render.

### Memory Budget

| Category | Budget | Rationale |
| --- | --- | --- |
| Pre-decoded SFX pool | 32 MB | ~200 unique SFX at ~160 KB average (16-bit PCM, 1-2s each) |
| EVA voice lines | 8 MB | ~60 voice lines, short duration, pre-decoded for instant playback |
| Unit voice responses | 16 MB | ~300 voice clips across all unit types |
| Music streaming buffers | 2 MB | Two 1 MB ring buffers for A/B crossfade streaming |
| Ambient loops (pre-decoded) | 4 MB | 2-4 looping ambient tracks per biome |
| VoIP buffers (D059) | 1 MB | 8 player jitter buffers at ~128 KB each |
| **Total audio memory** | **~63 MB** | **Budget ceiling: 80 MB** |

WASM builds halve the SFX pool budget (16 MB) and rely more on streaming. Workshop mods that add many custom sounds must respect per-mod audio memory limits (enforced by the asset system).

### Pre-load Heuristics

```rust
/// Determines when to pre-load audio assets during map loading.
/// Called by the asset loading pipeline before the game starts.
fn audio_preload_policy(sound_meta: &SoundMeta) -> PreloadPolicy {
    match sound_meta.category {
        // Always pre-load: needed instantly during gameplay
        SoundCategory::Weapon => PreloadPolicy::Immediate,
        SoundCategory::Explosion => PreloadPolicy::Immediate,
        SoundCategory::Ui => PreloadPolicy::Immediate,
        SoundCategory::UnitVoice => PreloadPolicy::Immediate,
        SoundCategory::Eva => PreloadPolicy::Immediate,
        // Stream: large, sequential playback
        SoundCategory::Music => PreloadPolicy::Stream,
        // Lazy: load when first needed (biome determined at map start)
        SoundCategory::Ambient => PreloadPolicy::LazyOnFirstUse,
    }
}
```

---

## 9. Integration Points

### Bevy Plugin Structure

`ic-audio` is a single Bevy plugin that initializes the entire audio subsystem:

```rust
pub struct IcAudioPlugin;

impl Plugin for IcAudioPlugin {
    fn build(&self, app: &mut App) {
        app
            // Disable Bevy's default audio (replaced by Kira)
            // (bevy_kira_audio handles this internally)
            .add_plugins(bevy_kira_audio::AudioPlugin)

            // Asset loaders
            .init_asset_loader::<AudAssetLoader>()

            // Resources
            .init_resource::<AudioSettings>()
            .init_resource::<AudioBuses>()
            .init_resource::<DynamicMusicState>()
            .init_resource::<EvaSystem>()
            .init_resource::<SoundPool>()
            .init_resource::<SoundLimits>()

            // Startup
            .add_systems(Startup, init_audio_buses)

            // Frame-rate systems (Update schedule)
            .add_systems(Update, (
                sync_bus_volumes,
                eva_playback_system,
                sound_pool_cleanup,
                spatial_distance_update,
                update_music_mood,
                jukebox_advance_system,
                #[cfg(target_arch = "wasm32")]
                resume_audio_context_on_interaction,
            ))

            // Sim-tick-rate systems (FixedUpdate schedule)
            .add_systems(FixedUpdate, (
                update_combat_score,
                update_threat_level,
            ))

            // Observers: sim event → audio event
            .add_observer(on_combat_event)
            .add_observer(on_unit_selected)
            .add_observer(on_unit_commanded)
            .add_observer(on_building_event)
            .add_observer(on_eva_notification)
            .add_observer(on_mission_result);
    }
}
```

### Sim Event to Audio Event Mapping (Observers)

`ic-audio` never imports `ic-sim`. It observes Bevy events that `ic-game` translates from sim state changes. This preserves the crate boundary (see `crate-graph.md`).

```rust
/// Observer: combat sim events → weapon/explosion SFX.
fn on_combat_event(
    trigger: Trigger<CombatEvent>,
    buses: Res<AudioBuses>,
    pool: ResMut<SoundPool>,
    limits: Res<SoundLimits>,
    camera: Query<&Transform, With<GameCamera>>,
    sound_assets: Res<SoundAssets>,
) {
    let event = trigger.event();
    let camera_pos = camera.single().translation;

    // Distance cull
    if let Some(pos) = event.position {
        if !should_play_sound(Some(pos), camera_pos.into(), &SPATIAL_CONFIG) {
            return;
        }
    }

    // Category limit check
    let category = match event.kind {
        CombatKind::WeaponFire => SoundCategory::Weapon,
        CombatKind::UnitDamaged | CombatKind::UnitKilled => SoundCategory::Explosion,
        CombatKind::BuildingHit | CombatKind::BuildingDestroyed => SoundCategory::Explosion,
    };
    if pool.count_category(category) >= limits.limit_for(category) {
        // At limit — try to steal or drop
        if pick_steal_candidate(&pool, AudioPriority::Effect, category).is_none() {
            return; // drop the sound
        }
    }

    // Play on appropriate sub-track (spatial)
    let sound_id = sound_assets.lookup(event.sound);
    play_spatial_sfx(&buses.sfx, &pool, sound_id, event.position, category);
}

/// Observer: EVA notification events → EVA queue.
fn on_eva_notification(
    trigger: Trigger<EvaNotificationEvent>,
    mut eva: ResMut<EvaSystem>,
    time: Res<GameTime>,
) {
    let event = trigger.event();
    let cooldown_key = event.cooldown_key();

    // Cooldown check
    if let Some(&last_time) = eva.cooldowns.get(&cooldown_key) {
        let cooldown_duration = event.cooldown_seconds();
        if time.elapsed_seconds() - last_time < cooldown_duration as f64 {
            return; // on cooldown — drop
        }
    }

    // Enqueue
    eva.queue.push(EvaNotification {
        sound: event.sound_id,
        priority: event.priority,
        cooldown_key,
        timestamp: time.elapsed_seconds(),
        max_age_s: 5.0,
    });

    // Trim queue if over max depth (drop lowest priority)
    while eva.queue.len() > eva.max_queue_depth {
        // BinaryHeap is max-heap; we need to drop the minimum.
        // In practice, rebuild with the top N entries.
        eva.trim_to_depth();
    }
}
```

### Settings Integration (config.toml)

Audio settings are loaded from the player's `config.toml` (managed by `ic-paths` data directory) and stored as a Bevy resource:

```toml
# config.toml — audio section
[audio]
master_volume = 0.8
music_volume = 0.6
sfx_volume = 1.0
voice_volume = 0.9
ambient_volume = 0.5
music_mode = "dynamic"     # "jukebox" | "sequential" | "dynamic"
```

Volume sliders in the Settings UI write to `AudioSettings`, which triggers `sync_bus_volumes` via Bevy change detection.

### Scenario Editor Music Controls (D038)

The scenario editor (D038) exposes dynamic music via two modules:

1. **Music Trigger module:** Visual node that fires `Media.PlayMusic()` on a trigger condition. Used for scripted moments ("play Hell March when tanks breach the wall").
2. **Music Playlist module:** Visual editor for mood-tagged track pools. Designer drags tracks into mood buckets. Exported as YAML `music_config.yaml` inside the map file.

Both modules emit Lua calls under the hood — the same API surface that modders use directly.

### Lua API Surface

Complete audio API exposed to Lua scripts (Tier 2 modding):

```lua
-- Music control
Media.PlayMusic(track_id, opts)            -- Play specific track. opts: {crossfade, loop}
Media.StopMusic(opts)                      -- Stop current music. opts: {fadeout_ms}
Media.SetMusicMode(mode)                   -- "jukebox" | "sequential" | "dynamic"
Media.SetMusicPlaylist(mood, track_list)   -- Override dynamic playlist for a mood
Media.SetMusicMood(mood)                   -- Force mood override (cleared on next natural transition)
Media.GetMusicMood()                       -- Returns current mood string

-- SFX
Media.PlaySound(sound_id, opts)            -- Play sound. opts: {position, volume, priority}
Media.PlaySoundAt(sound_id, x, y)          -- Shorthand for positional SFX

-- EVA
Media.PlayEVA(notification_type)           -- Queue EVA notification
Media.SetEVACooldown(type, seconds)        -- Override cooldown for a notification type

-- Volume (read-only from Lua — player controls volume, not mods)
Media.GetMusicVolume()                     -- Returns 0.0-1.0
Media.GetSFXVolume()
Media.GetVoiceVolume()
```

### VoIP Coexistence (D059)

Summary of the VoIP↔game audio integration:

| Concern | Owner | Integration Point |
| --- | --- | --- |
| Microphone capture | D059 audio thread (`cpal` input device) | No conflict — input device is separate |
| Opus encode/decode | D059 audio thread (`audiopus`) | No conflict — runs off-thread |
| Jitter buffer | D059 audio thread | Outputs decoded PCM frames |
| Voice playback mix | `ic-audio` VoipSub track | Decoded PCM fed into Kira via `VoipSource` ring buffer |
| Output device | Kira (`cpal` output device) | Kira owns the output; VoIP mixes through Kira's graph |
| Per-player volume | `ic-audio` `VoipSource` | Per-player gain applied before mixing into VoipSub track |
| Muting | `ic-audio` + `ic-ui` | Muted players have their ring buffer drained silently |

The key architectural insight: Kira owns the audio output device. VoIP does not open a separate output stream. Instead, D059's decode pipeline writes decoded PCM into a ring buffer, and a custom Kira sound source on the VoipSub track reads from that buffer. This guarantees no device contention and allows VoIP volume to be controlled by the same bus hierarchy as all other audio.

---

## Summary of Settled Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Audio library | **Kira** via `bevy_kira_audio` | Bus topology, tweening, streaming, spatial audio, effects, WASM support |
| Mixer topology | 4 primary buses (Music, SFX, Voice, Ambient) with sub-tracks | Matches IC's audio priority tiers and per-category volume control |
| Music crossfade | A/B sub-tracks with Kira tweening | Native crossfade without custom sample-level code |
| Dynamic music | Combat-score FSM with 5 moods | Closes the gap between Klepacki's compositional intent and RA's flat jukebox |
| EVA system | Priority queue with per-type cooldowns, max depth 8 | Prevents spam, ensures critical notifications always play |
| Sound limits | 64 concurrent (32 WASM), per-category caps, per-type instance limit 3 | Prevents mixer saturation and CPU spikes |
| `.aud` decode | Pre-decode always, via `ra-formats` → PCM → Kira `StaticSoundData` | Small files, fast decode, zero-latency playback |
| Streaming threshold | >256 KB OGG/MP3, >512 KB WAV, music always streams | Balances memory usage vs. playback latency |
| VoIP integration | Decoded PCM → ring buffer → custom Kira source on VoipSub track | Kira owns output device; no device contention |
| Audio CPU budget | <1.0 ms per frame (main thread); mixer off-thread | Leaves headroom for sim, render, network |
| Audio memory budget | ~63 MB (ceiling 80 MB); WASM halved | Fits within total engine memory budget |

**P003 is resolved.** `PG.P003.AUDIO_LIBRARY` gate is cleared. Phase 3 audio implementation (`M3.CORE.AUDIO_EVA_MUSIC`) can proceed.
