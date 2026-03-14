#### Cinematic & Narrative Generation

A generated mission that plays well but *feels* empty — no mid-mission dialogue, no music shifts, no character moments, no dramatic reveals — is a mission that fails the C&C fantasy. The original Red Alert didn't just have good missions; it had missions where Stavros called you on the radar mid-battle, where the music shifted from ambient to Hell March when the tanks rolled in, where Tanya dropped a one-liner before breaching the base. That's the standard.

The LLM generates the **full cinematic layer** for each mission — not just objectives and unit placement, but the narrative moments that make a mission feel authored:

**Mid-mission radar comm events:**

The classic C&C moment: your radar screen flickers, a character's face appears, they deliver intel or a dramatic line. The LLM generates these as D038 Radar Comm modules, triggered by game events:

```yaml
# LLM-generated radar comm event
radar_comms:
  - id: bridge_warning
    trigger:
      type: unit_enters_region
      region: bridge_approach
      faction: player
    speaker: "General Stavros"
    portrait: stavros_concerned
    text: "Commander, our scouts report heavy armor at the bridge. Going in head-on would be suicide. There's a ford upstream — shallow enough for infantry."
    audio: null                        # TTS if available, silent otherwise
    display_mode: radar_comm           # replaces radar panel
    duration: 6.0                      # seconds, then radar returns

  - id: betrayal_reveal
    trigger:
      type: objective_complete
      objective: capture_command_post
    speaker: "Colonel Vasquez"
    portrait: vasquez_smug
    text: "Surprised to see me, Commander? Your General Stavros sold you out. These men now answer to me."
    display_mode: radar_comm
    effects:
      - set_flag: vasquez_betrayal
      - convert_units:                 # allied garrison turns hostile
          region: command_post_interior
          from_faction: player
          to_faction: enemy
    cinematic: true                    # brief letterbox + game pause for drama
```

The LLM decides *when* these moments should happen based on the mission's narrative arc. A routine mission might have 1-2 comms (intel at start, debrief at end). A story-critical mission might have 5-6, including a mid-battle betrayal, a desperate plea for reinforcements, and a climactic confrontation.

**In-mission branching dialogues (RPG-style choices):**

Not just in intermissions — branching dialogue can happen *during* a mission. An NPC unit is reached, a dialogue triggers, the player makes a choice that affects the mission in real-time:

```yaml
mid_mission_dialogues:
  - id: prisoner_interrogation
    trigger:
      type: unit_enters_region
      unit: tanya
      region: prison_compound
    pause_game: true                   # freezes game during dialogue
    tree:
      - speaker: "Captured Officer"
        portrait: captured_officer
        text: "I'll tell you everything — the mine locations, the patrol routes. Just let me live."
        choices:
          - label: "Talk. Now."
            effects:
              - reveal_shroud: minefield_region
              - set_flag: intel_acquired
            next: officer_cooperates
          - label: "We don't negotiate with the enemy."
            effects:
              - set_flag: officer_executed
              - adjust_character: { name: "Tanya", loyalty: -5 }
            next: tanya_reacts
          - label: "You'll come with us. Command will want to talk to you."
            effects:
              - spawn_unit: { type: prisoner_escort, region: prison_compound }
              - add_objective: { text: "Extract the prisoner to the LZ", type: secondary }
            next: extraction_added

      - id: officer_cooperates
        speaker: "Captured Officer"
        text: "The mines are along the ridge — I'll mark them on your map. And Commander... the base commander is planning to retreat at 0400."
        effects:
          - add_objective: { text: "Destroy the base before 0400", type: bonus, timer: 300 }

      - id: tanya_reacts
        speaker: "Tanya"
        portrait: tanya_cold
        text: "Your call, Commander. But he might have known something useful."
```

These are **full D038 Dialogue Editor trees** — the same format a human designer would create. The LLM generates them with awareness of the mission's objectives, characters, and narrative context. The choices have *mechanical consequences* — revealing shroud, adding objectives, changing timers, spawning units, adjusting character loyalty.

The LLM can also generate **consequence chains** — a choice in Mission 5's dialogue affects Mission 7's setup (via story flags). "You spared the officer in Mission 5" → in Mission 7, that officer appears as an informant. The LLM tracks these across the campaign context.

**Dynamic music generation:**

The LLM doesn't compose music — it curates it. For each mission, the LLM generates a D038 Music Playlist with mood-tagged tracks selected from the game module's soundtrack and any Workshop music packs the player has installed:

```yaml
music:
  mode: dynamic
  tracks:
    ambient:
      - fogger                         # game module default
      - workshop:cold-war-ost/frozen_fields   # from Workshop music pack
    combat:
      - hell_march
      - grinder
    tension:
      - radio_2
      - workshop:cold-war-ost/countdown
    victory:
      - credits

  # Scripted music cues (override dynamic system at specific moments)
  scripted_cues:
    - trigger: { type: timer, seconds: 0 }         # mission start
      track: fogger
      fade_in: 3.0
    - trigger: { type: objective_complete, objective: breach_wall }
      track: hell_march
      fade_in: 0.5                                  # hard cut — dramatic
    - trigger: { type: flag_set, flag: vasquez_betrayal }
      track: workshop:cold-war-ost/countdown
      fade_in: 1.0
```

The LLM picks tracks that match the mission's tone. A desperate defense mission gets tense ambient tracks and hard-hitting combat music. A stealth infiltration gets quiet ambient and reserves the intense tracks for when the alarm triggers. The scripted cues tie specific music moments to narrative beats — the betrayal hits differently when the music shifts at exactly the right moment.

**Cinematic sequences:**

For high-stakes moments, the LLM generates full D038 Cinematic Sequences — multi-step scripted events combining camera movement, dialogue, music, unit spawns, and letterbox:

```yaml
cinematic_sequences:
  - id: reinforcement_arrival
    trigger:
      type: objective_complete
      objective: hold_position_2_min
    skippable: true
    steps:
      - type: letterbox
        enable: true
        transition_time: 0.5
      - type: camera_pan
        from: player_base
        to: beach_landing
        duration: 3.0
        easing: ease_in_out
      - type: play_music
        track: hell_march
        fade_in: 0.5
      - type: spawn_units
        units: [medium_tank, medium_tank, medium_tank, apc, apc]
        position: beach_landing
        faction: player
        arrival: landing_craft          # visual: landing craft delivers them
      - type: dialogue
        speaker: "Admiral Kowalski"
        portrait: kowalski_grinning
        text: "The cavalry has arrived, Commander. Where do you want us?"
        duration: 4.0
      - type: camera_pan
        to: player_base
        duration: 2.0
      - type: letterbox
        enable: false
        transition_time: 0.5
```

The LLM generates these for **key narrative moments** — not every trigger. Typical placement:

| Moment                     | Frequency           | Example                                                        |
| -------------------------- | ------------------- | -------------------------------------------------------------- |
| **Mission intro**          | Every mission       | Camera pan across the battlefield, briefing dialogue overlay   |
| **Reinforcement arrival**  | 30-50% of missions  | Camera shows troops landing/parachuting in, commander dialogue |
| **Mid-mission plot twist** | 20-40% of missions  | Betrayal reveal, surprise enemy, intel discovery               |
| **Objective climax**       | Key objectives only | Bridge explosion, base breach, hostage rescue                  |
| **Mission conclusion**     | Every mission       | Victory/defeat sequence, debrief comm                          |

**Intermission dialogue and narrative scenes:**

Between missions, the LLM generates intermission screens that go beyond simple briefings:

- **Branching dialogue with consequences** — "General, do we reinforce the eastern front or push west?" The choice affects the next mission's setup, available forces, or strategic position.
- **Character moments** — two named characters argue about strategy. The player's choice affects their loyalty and relationship. A character whose advice is ignored too many times might defect (Campaign Event Patterns).
- **Intel briefings** — the player reviews intelligence gathered from the previous mission. What they focus on (or ignore) shapes the next mission's surprises.
- **Moral dilemmas** — execute the prisoner or extract intel? Bomb the civilian bridge or let the enemy escape? These set story flags that ripple forward through the campaign.

The LLM generates these as D038 Intermission Screens using the Dialogue template with Choice panels. Every choice links to a story flag; every flag feeds back into the LLM's campaign context for future mission generation.

**EVA and ambient audio:**

The LLM generates custom EVA notification scripts — mission-specific voice cues beyond the default "Unit lost" / "Construction complete":

```yaml
custom_eva:
  - event: unit_enters_region
    region: minefield_zone
    text: "Warning: mines detected in this area."
    priority: high
    cooldown: 30                       # don't repeat for 30 seconds

  - event: building_captured
    building: enemy_radar
    text: "Enemy radar facility captured. Shroud cleared."
    priority: normal

  - event: timer_warning
    timer: evacuation_timer
    remaining: 60
    text: "60 seconds until evacuation window closes."
    priority: critical
```

The LLM also generates ambient sound zone definitions for narrative atmosphere — a mission in a forest gets wind and bird sounds; a mission in a bombed-out city gets distant gunfire and sirens.

**What this means in practice:**

A generated mission doesn't just drop units on a map with objectives. A generated mission:

1. Opens with a **cinematic pan** across the battlefield while the commander briefs you
2. Plays **ambient music** that matches the terrain and mood
3. Calls you on the **radar** when something important happens — a new threat, a character moment, a plot development
4. Presents **RPG-style dialogue choices** when you reach key locations or NPCs
5. **Shifts the music** from ambient to combat when the fighting starts
6. Triggers a **mid-mission cinematic** when the plot twists — a betrayal, a reinforcement arrival, a bridge explosion
7. Announces custom **EVA warnings** for mission-specific hazards
8. Ends with a **conclusion sequence** — victory celebration or desperate evacuation
9. Transitions to an **intermission** with character dialogue, choices, and consequences

All of it is standard D038 format. All of it is editable after generation. All of it works exactly like hand-crafted content. The LLM just writes it faster.

#### Generative Media Pipeline (Forward-Looking)

The sections above describe the LLM generating *text*: YAML definitions, Lua triggers, briefing scripts, dialogue trees. But the full C&C experience isn't text — it's voice-acted briefings, dynamic music, sound effects, and cutscenes. Currently, generative campaigns use existing media assets: game module sound libraries, Workshop music packs, the player's installed voice collections. A mission briefing is *text* that the player reads; a radar comm event is a text bubble without voice audio.

AI-generated media — voice synthesis, music generation, sound effect creation, and a deferred optional `M11` video/cutscene generation layer — is advancing rapidly. By the time IC reaches Phase 7, production-quality AI voice synthesis will be mature (it largely is already in 2025–2026), AI music generation is approaching usable quality, and AI video is on a clear trajectory. The generative media pipeline prepares for this without creating obstacles for a media-free fallback.

**Core design principle: every generative media feature is a progressive enhancement.** A generative campaign plays identically with or without media generation. Text briefings work. Music from the existing library works. Silent radar comms with text work. When AI media providers are available, they *enhance* the experience — voiced briefings, custom music, generated sound effects — but nothing *depends* on them.

**Three tiers of generative media (from most ambitious to most conservative):**

**Tier 1 — Live generation during generative campaigns:**

The most ambitious mode. The player is playing a generative campaign. Between missions, during the loading/intermission screen, the system generates media for the next mission in real-time. The player reads the text briefing while voice synthesis runs in the background; when ready, the briefing replays with voice. If voice generation isn't finished in time, the text-only version is already playing — no delay.

| Media Type       | Generation Window                                       | Fallback (if not ready or unavailable)          | Provider Class                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voice lines**  | Loading screen / intermission (~15–30s)               | Text-only briefing, text bubble radar comms     | Voice synthesis (ElevenLabs, local TTS, XTTS, Bark, Piper)                                                                                                                                                                                    |
| **Music tracks** | Pre-generated during campaign setup or between missions | Existing game module soundtrack, Workshop packs | Music generation (Suno, Udio, MusicGen, local models) **or** built-in ABC→MIDI→SoundFont pipeline (CPU-only, no external provider needed — see `research/llm-soundtrack-generation-design.md`)                                          |
| **Sound FX**     | Pre-generated during mission generation                 | Game module default sound library               | Sound generation (AudioGen, Stable Audio, local models) **or** built-in ABC→MIDI→SoundFont / `!synth` parameter synthesis (CPU-only — see `research/llm-soundtrack-generation-design.md`, `research/demoscene-synthesizer-analysis.md`) |
| **Cutscenes**    | Pre-generated between missions (longer)                 | Text+portrait briefing, radar comm text overlay | Video generation (deferred optional `M11` — Sora class, Runway, local models)                                                                                                                                                               |

**Architecture:**

```rust
/// Trait for media generation providers. Same BYOLLM pattern as LlmProvider.
/// Each media type has its own trait — providers are specialized.
pub trait VoiceProvider: Send + Sync {
    /// Generate speech audio from text + voice profile.
    /// Returns audio data in a standard format (WAV/OGG).
    fn synthesize(
        &self,
        text: &str,
        voice_profile: &VoiceProfile,
        options: &VoiceSynthesisOptions,
    ) -> Result<AudioData>;
}

pub trait MusicProvider: Send + Sync {
    /// Generate a music track from mood/style description.
    /// Returns audio data in a standard format.
    fn generate_track(
        &self,
        description: &MusicPrompt,
        duration_secs: f32,
        options: &MusicGenerationOptions,
    ) -> Result<AudioData>;
}

pub trait SoundFxProvider: Send + Sync {
    /// Generate a sound effect from description.
    fn generate_sfx(
        &self,
        description: &str,
        duration_secs: f32,
    ) -> Result<AudioData>;
}

pub trait VideoProvider: Send + Sync {
    /// Generate a video clip from description + character portraits + context.
    fn generate_video(
        &self,
        description: &VideoPrompt,
        options: &VideoGenerationOptions,
    ) -> Result<VideoData>;
}

/// Voice profile for consistent character voices across a campaign.
/// Stored in campaign context alongside CharacterState.
pub struct VoiceProfile {
    /// Character name — links to campaign skeleton character.
    pub character_name: String,
    /// Voice description for the provider (text prompt).
    /// e.g., "Deep male voice, Russian accent, military authority, clipped speech."
    pub voice_description: String,
    /// Provider-specific voice ID (if using a cloned/preset voice).
    pub voice_id: Option<String>,
    /// Reference audio sample (if provider supports voice cloning from sample).
    pub reference_audio: Option<AudioData>,
}
```

**Voice consistency model:** The most critical challenge for campaign voice generation is consistency — the same character must sound the same across 24 missions. The `VoiceProfile` is created during campaign skeleton generation (Step 2) and persisted in `GenerativeCampaignContext`. The LLM generates the voice description from the character's personality profile (Principle #20 — a ISTJ commander sounds different from an ESTP commando). If the provider supports voice cloning from a sample, the system generates one calibration line during setup and uses that sample as the reference for all subsequent voice generation. If not, the text description must be consistent enough that the provider produces recognizably similar output.

**Music mood integration:** The generation pipeline already produces music playlists with mood tags (combat, tension, ambient, victory). When a `MusicProvider` is configured, the system can generate mission-specific tracks from these mood tags instead of selecting from existing libraries. The LLM adds mission-specific context to the music prompt: "Tense ambient track for a night infiltration mission in an Arctic setting, building to war drums when combat triggers fire." Generated tracks are cached in the campaign save — once created, they're standard audio files.

**Tier 2 — Pre-generated campaign (full media creation upfront):**

The more conservative mode. The player configures a generative campaign, clicks "Generate Campaign," and the system creates the entire campaign — all missions, all briefings, all media — before the first mission starts. This takes longer (minutes to hours depending on provider speed and campaign length) but produces a complete, polished campaign package.

This mode is also the **content creator workflow**: a modder or community member generates a campaign, reviews/edits it in the SDK (D038), replaces any weak AI-generated media with hand-crafted alternatives, and publishes the polished result to the Workshop. The AI-generated media is a *starting point*, not a final product.

| Advantage                      | Trade-off                                                           |
| ------------------------------ | ------------------------------------------------------------------- |
| Complete before play begins    | Long generation time (depends on provider)                          |
| All media reviewable in SDK    | Higher API cost (all media generated at once)                       |
| Publishable to Workshop as-is  | Less reactive to player choices (media pre-committed, not adaptive) |
| Can replace weak media by hand | Requires all providers configured upfront                           |

**Generation pipeline (extends Step 2 — Campaign Skeleton):**

After the campaign skeleton is generated, the media pipeline runs:

1. **Voice profiles** — create `VoiceProfile` for each named character. If voice cloning is supported, generate calibration samples.
2. **All mission briefings** — generate voice audio for every briefing text, every radar comm event, every intermission dialogue line.
3. **Mission music** — generate mood-appropriate tracks for each mission (or select from existing library + generate only gap-filling tracks).
4. **Mission-specific sound FX** — generate any custom sound effects referenced in mission scripts (ambient weather, unique weapon sounds, environmental audio).
5. **Cutscenes** (deferred optional `M11`) — generate video sequences for mission intros, mid-mission cinematics, campaign intro/outro.

Each step is independently skippable — a player might configure voice synthesis but skip music generation, using the game's built-in soundtrack. The campaign save tracks which media was generated vs. sourced from existing libraries.

**Tier 3 — SDK Asset Studio integration:**

This tier already exists architecturally (D040 § Layer 3 — Agentic Asset Generation) but currently covers only visual assets (sprites, palettes, terrain, chrome). The generative media pipeline extends the Asset Studio to cover audio and video:

| Capability              | Asset Studio Tool                                                                                         | Provider Trait    |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ----------------- |
| **Voice acting**        | Record text → generate voice → preview on timeline → adjust pitch/speed → export .ogg/.wav        | `VoiceProvider`   |
| **EVA line generation** | Select EVA event type → generate authoritative voice → preview in-game → export to sound library    | `VoiceProvider`   |
| **Music composition**   | Describe mood/style → generate track → preview against gameplay footage → trim/fade → export .ogg | `MusicProvider`   |
| **Sound FX design**     | Describe effect → generate → preview → layer with existing FX → export .wav                       | `SoundFxProvider` |
| **Cutscene creation**   | Write script → generate video → preview in briefing player → edit → export .mp4/.webm             | `VideoProvider`   |
| **Voice pack creation** | Define character → generate all voice lines → organize → preview → publish as Workshop voice pack | `VoiceProvider`   |

This is the modder-facing tooling. A modder creating a total conversion can generate an entire voice pack for their custom EVA, unit voice lines for new unit types, ambient music that matches their mod's theme, and briefing videos — all within the SDK, using the same BYOLLM infrastructure.

**Crate boundaries:**

- **`ic-llm`** — implements all provider traits (`VoiceProvider`, `MusicProvider`, `SoundFxProvider`, `VideoProvider`). Routes to configured providers via D047 task routing. Handles API communication, format conversion, caching.
- **`ic-editor`** (SDK) — defines the provider traits (same pattern as `AssetGenerator`). Provides UI for media preview, editing, and export. Tier 3 tools live here.
- **`ic-game`** — wires providers at startup. In generative campaign mode, triggers Tier 1 generation during loading/intermission. Plays generated media through standard `ic-audio` and video playback systems.
- **`ic-audio`** — plays generated audio identically to pre-existing audio. No awareness of generation source.

**What the AI does NOT replace:**

- **Professional voice acting.** AI voice synthesis is serviceable for procedural content but cannot match a skilled human performance. Hand-crafted campaigns (D021) will always benefit from real voice actors. The AI-generated voice is a first draft, not a final product.
- **Composed music.** Frank Klepacki's Hell March was not generated by an algorithm. AI music fills gaps and provides variety; it doesn't replace composed soundtracks. The game module ships with a human-composed soundtrack; AI supplements it.
- **Quality judgment.** The modder/player decides if generated media meets their standards. The SDK shows it in context. The Workshop provides a distribution channel for polished results.

**D047 integration — task routing for media providers:**

The LLM Configuration Manager (D047) extends its task routing to include media generation tasks:

| Task                                     | Provider Type     | Typical Routing                                      |
| ---------------------------------------- | ----------------- | ---------------------------------------------------- |
| Mission Generation                       | `LlmProvider`     | Cloud API (quality)                                  |
| Campaign Briefings                       | `LlmProvider`     | Cloud API (quality)                                  |
| Voice Synthesis                          | `VoiceProvider`   | ElevenLabs / Local TTS (quality vs. speed trade-off) |
| Music Generation                         | `MusicProvider`   | Suno API / Local MusicGen                            |
| Sound FX Generation                      | `SoundFxProvider` | AudioGen / Stable Audio                              |
| Video/Cutscene (deferred optional `M11`) | `VideoProvider`   | Cloud API (when mature)                              |
| Asset Generation (visual)                | `AssetGenerator`  | DALL-E / Stable Diffusion / Local                    |
| AI Orchestrator                          | `LlmProvider`     | Local Ollama (fast)                                  |
| Post-Match Coaching                      | `LlmProvider`     | Local model (fast)                                   |

Each media provider type is independently configurable. A player might have voice synthesis (local Piper TTS — free, fast, lower quality) but no music generation. The system adapts: generated missions get voiced briefings but use the existing soundtrack.

**Phase:**

- **Phase 7:** Voice synthesis integration (`VoiceProvider` trait, ElevenLabs/Piper/XTTS providers, voice profile system, Tier 1 live generation, Tier 2 pre-generation, Tier 3 SDK voice tools). Voice is the highest-impact media type and the most mature AI capability.
- **Phase 7:** Music generation integration (`MusicProvider` trait, Suno/MusicGen providers, mood-to-prompt translation). Lower priority than voice — existing soundtrack provides good coverage.
- **Phase 7+:** Sound FX generation (`SoundFxProvider`). Useful but niche — game module sound libraries cover most needs.
- **Future:** Video/cutscene generation (`VideoProvider`). Depends on AI video technology maturity. The trait is defined now so the architecture is ready; implementation waits until quality meets the bar. The Asset Studio video pipeline (D040 — .mp4/.webm/.vqa conversion) provides the playback infrastructure.

> **Architectural note:** The design deliberately separates provider traits by media type rather than using a single unified `MediaProvider`. Voice, music, sound, and video providers have fundamentally different inputs, outputs, quality curves, and maturity timelines. A player may have excellent voice synthesis available but no music generation at all. Per-type traits and per-type D047 task routing enable this mix-and-match reality. The progressive enhancement principle ensures every combination works — from "no media providers" (text-only, existing assets) to "all providers configured" (fully generated multimedia campaigns).

