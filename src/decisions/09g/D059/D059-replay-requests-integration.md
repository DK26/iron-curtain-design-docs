### 5. Voice-in-Replay — Architecture & Feasibility

The user asked: "would it make sense technically speaking and otherwise, to keep player voice records in the replay?"

**Yes — technically feasible, precedented, and valuable. But: strictly opt-in with clear consent.**

#### Technical Approach

Voice-in-replay follows ioquake3's proven pattern (the only open-source game with this feature): inject Opus frames as tagged messages into the replay file alongside the order stream.

IC's replay format (`05-FORMATS.md`) already separates streams:
- **Order stream** — deterministic tick frames (for playback)
- **Analysis event stream** — sampled sim state (for stats tools)

Voice adds a third stream:
- **Voice stream** — timestamped Opus frames (for communication context)

```rust
/// Replay file structure with voice stream.
/// Voice is a separate section with its own offset in the header.
/// Tools that don't need voice skip it entirely — zero overhead.
///
/// The voice stream is NOT required for replay playback — it adds
/// communication context, not gameplay data.
pub struct ReplayVoiceStream {
    /// Per-player voice tracks, each independently seekable.
    pub tracks: Vec<VoiceTrack>,
}

pub struct VoiceTrack {
    pub player: PlayerId,
    /// Whether this player consented to voice recording.
    /// If false, this track is empty (header only, no frames).
    pub consented: bool,
    pub frames: Vec<VoiceReplayFrame>,
}

pub struct VoiceReplayFrame {
    /// Game tick when this audio was transmitted.
    pub tick: u64,
    /// Opus-encoded audio data. Same codec as live audio.
    pub opus_data: Vec<u8>,
    /// Original voice target (team/all). Preserved for replay filtering.
    pub target: VoiceTarget,
}
```

**Header extension:** The replay header (`ReplayHeader`) gains voice-related fields. The full canonical header is defined in `formats/save-replay-formats.md`; only the voice-specific additions are shown here:

```rust
pub struct ReplayHeader {
    // ... existing fields (magic, version, compression, flags, offsets, hashes,
    //     lost_frame_count) — see formats/save-replay-formats.md for complete definition ...
    pub voice_offset: u32,       // 0 if no voice stream
    pub voice_length: u32,       // Compressed length of voice stream
}
```

The `flags` field gains a `HAS_VOICE` bit (bit 3). The canonical `flags` definition also includes `INCOMPLETE` (bit 4, for frame-loss tracking — see V45). Replay viewers check the `HAS_VOICE` flag before attempting to load voice data.

#### Storage Cost

| Game Duration | Players Speaking | Avg Bitrate | DTX Savings | Voice Stream Size |
| ------------- | ---------------- | ----------- | ----------- | ----------------- |
| 20 min        | 2 of 4           | 32 kbps     | ~40%        | ~1.3 MB           |
| 45 min        | 3 of 8           | 32 kbps     | ~40%        | ~4.7 MB           |
| 60 min        | 4 of 8           | 32 kbps     | ~40%        | ~8.3 MB           |

Compare to the order stream: a 60-minute game's order stream (compressed) is ~2-5 MB. Voice roughly doubles the replay size when all players are recorded. For `Minimal` replays (the default), voice adds 1-8 MB — still well within reasonable file sizes for modern storage.

**Mitigation:** Voice data is LZ4-compressed independently of the order stream. Opus is already compressed (it does not benefit much from generic compression), so LZ4 primarily helps with the framing overhead and silence gaps.

#### Consent Model

**Recording voice in replays is a serious privacy decision.** The design must make consent explicit, informed, and revocable:

1. **Opt-in, not opt-out.** Voice recording for replays is disabled by default. Players enable it via a settings toggle (`replay.record_voice: bool`, default `false`).

2. **Per-session consent display.** When joining a game where ANY player has voice recording enabled, all players see a notification: "Voice may be recorded for replay by: Alice, Bob." This ensures no one is unknowingly recorded.

3. **Per-player granularity.** Each player independently decides whether THEIR voice is recorded. Alice can record her own voice while Bob opts out — Bob's track in the replay is empty.

4. **Relay enforcement.** The relay server tracks each player's recording consent flag. The replay writer (each client) only writes voice frames for consenting players. Even if a malicious client records non-consenting voice locally, the *shared* replay file (relay-signed, D007) contains only consented tracks.

5. **Post-game stripping.** The `/replay strip-voice` command (D058) removes the voice stream from a replay file, producing a voice-free copy. Players can share gameplay replays without voice.

6. **No voice in ranked replays by default.** Ranked match replays submitted for ladder certification (D055) strip voice automatically. Voice is a communication channel, not a gameplay record — it has no bearing on match verification.

7. **Legal compliance.** In jurisdictions requiring two-party consent for recording (e.g., California, Germany), the per-session notification + opt-in model satisfies the consent requirement. Players who haven't enabled recording cannot have their voice captured.

#### Replay Playback with Voice

During replay playback, voice is synchronized to the game tick:

- Voice frames are played at the tick they were originally transmitted
- Fast-forward/rewind seeks the voice stream to the nearest frame boundary
- Voice is mixed into playback audio at a configurable volume (`replay.voice_volume` cvar)
- Individual player voice tracks can be muted/soloed (useful for analysis: "what was Alice saying when she attacked?")
- Voice target filtering: viewer can choose to hear only `All` chat, only `Team` chat, or both

**Use cases for voice-in-replay:**
- **Tournament commentary:** Casters can hear team communication during featured replays (with player consent), adding depth to analysis
- **Coaching:** A coach reviews a student's replay with voice to understand decision-making context
- **Community content:** YouTubers/streamers share replays with natural commentary intact
- **Post-game review:** Players review their own team communication for improvement

### 6. Security Considerations

| Vulnerability               | Risk   | Mitigation                                                                                                                                                                                                       |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voice spoofing**          | HIGH   | Relay stamps `speaker: PlayerId` on all forwarded voice packets. Client-submitted speaker ID is overwritten. Same pattern as ioquake3 server-side VoIP.                                                          |
| **Voice DDoS**              | MEDIUM | Rate limit: max 50 voice packets/sec per player (relay-enforced). Bandwidth cap: `MessageLane::Voice` has a 16 KB buffer — overflow drops oldest frames. Exceeding rate limit triggers mute + warning.           |
| **Voice data in replays**   | HIGH   | Opt-in consent model (see § 5). Voice tracks only written for consenting players. `/replay strip-voice` for post-hoc removal. No voice in ranked replays by default.                                             |
| **Ping spam / toxicity**    | MEDIUM | Max 3 pings per 5 seconds per player. Diminishing audio on rapid pings. Report pathway for ping abuse.                                                                                                           |
| **Chat flood**              | LOW    | 5 messages per 3 seconds (relay-enforced). Slow mode indicator. Already addressed by ProtocolLimits (V15).                                                                                                       |
| **Minimap drawing abuse**   | LOW    | Max 3 strokes per 10 seconds, 32 points per stroke. Drawings are team-only. Report pathway.                                                                                                                      |
| **Whisper harassment**      | MEDIUM | Player-level mute persists across sessions (SQLite, D034). Whisper requires mutual non-mute (if either party has muted the other, whisper is silently dropped). Report → admin mute pathway.                     |
| **Observer voice coaching** | HIGH   | In competitive/ranked games, observers cannot transmit voice to players. Observer `VoiceTarget::All/Team` is restricted to observer-only routing. Same isolation as observer chat.                               |
| **Content in voice data**   | MEDIUM | IC does not moderate voice content in real-time (no speech-to-text analysis). Moderation is reactive: player reports + replay review. Community server admins (D052) can review voice replays of reported games. |

**New ProtocolLimits fields:**

```rust
pub struct ProtocolLimits {
    // ... existing fields (V15) ...
    pub max_voice_packets_per_second: u32,    // 50 (1 per 20ms frame)
    pub max_voice_packet_size: usize,         // 256 bytes (covers single-frame 64kbps Opus
                                              // = ~160 byte payload + headers. Multi-frame
                                              // bundles (frame_count > 1) send multiple packets,
                                              // not one oversized packet.)
    pub max_pings_per_interval: u32,          // 3 per 5 seconds
    pub max_minimap_draw_points: usize,       // 32 per stroke
    pub max_tactical_markers_per_player: u8,  // 10
    pub max_tactical_markers_per_team: u8,    // 30
}
```

### 7. Platform Considerations

| Platform            | Text Chat     | VoIP                     | Pings               | Chat Wheel          | Minimap Draw  |
| ------------------- | ------------- | ------------------------ | ------------------- | ------------------- | ------------- |
| **Desktop**         | Full keyboard | PTT or VAD; Opus/UDP     | G key + wheel       | V key + wheel       | Alt+drag      |
| **Browser (WASM)**  | Full keyboard | PTT; Opus/WebRTC (str0m) | Same                | Same                | Same          |
| **Steam Deck**      | On-screen KB  | PTT on trigger/bumper    | D-pad or touchpad   | D-pad submenu       | Touch minimap |
| **Mobile (future)** | On-screen KB  | PTT button on screen     | Tap-hold on minimap | Radial menu on hold | Finger draw   |

**Mobile minimap + bookmark coexistence:** On phone/tablet layouts, camera bookmarks sit in a **bookmark dock adjacent to the minimap/radar cluster** rather than overloading minimap gestures. This keeps minimap interactions free for camera jump, pings, and drawing (D059), while giving touch players a fast, visible "save/jump camera location" affordance similar to C&C Generals. Gesture priority is explicit: touches that start on bookmark chips stay bookmark interactions; touches that start on the minimap stay minimap interactions.

**Layout and handedness:** The minimap cluster (minimap + alerts + bookmark dock) mirrors with the player's handedness setting. The command rail remains on the dominant-thumb side, so minimap communication and camera navigation stay on the opposite side and don't fight for the same thumb.

**Official binding profile integration (D065):** Communication controls in D059 are not a separate control scheme. They are semantic actions in D065's canonical input action catalog (e.g., `open_chat`, `voice_ptt`, `ping_wheel`, `chat_wheel`, `minimap_draw`, `callvote`, `mute_player`) and are mapped through the same official profiles (`Classic RA`, `OpenRA`, `Modern RTS`, `Gamepad Default`, `Steam Deck Default`, `Touch Phone/Tablet`). This keeps tutorial prompts, Quick Reference, and "What's Changed in Controls" updates consistent across devices and profile changes.

**Discoverability rule (controller/touch):** Every D059 communication action must have a visible UI path in addition to any shortcut/button chord. Example: PTT may be on a shoulder button, but the voice panel still exposes the active binding and a test control; pings/chat wheel may use radial holds, but the pause/controls menu and Quick Reference must show how to trigger them on the current profile.

### 8. Lua API Extensions (D024)

Building on the existing `Beacon` and `Radar` globals from OpenRA compatibility:

```lua
-- Existing OpenRA globals (unchanged)
Beacon.New(owner, pos, duration, palette, isPlayerPalette)
Radar.Ping(player, pos, color, duration)

-- IC extensions
Ping.Place(player, pos, pingType)          -- Place a typed ping
Ping.PlaceOnTarget(player, target, pingType) -- Ping tracking an entity
Ping.Clear(player)                          -- Clear all pings from player
Ping.ClearAll()                             -- Clear all pings (mission use)

ChatWheel.Send(player, phraseId)           -- Trigger a chat wheel phrase
ChatWheel.RegisterPhrase(id, translations) -- Register a custom phrase

Marker.Place(player, pos, markerType, label)       -- Place tactical marker (default style)
Marker.PlaceStyled(player, pos, markerType, label, style) -- Optional color/TTL/visibility style
Marker.Remove(player, markerId)                    -- Remove a marker
Marker.ClearAll(player)                            -- Clear all markers

Chat.Send(player, channel, message)        -- Send a chat message
Chat.SendToAll(player, message)            -- Convenience: all-chat
Chat.SendToTeam(player, message)           -- Convenience: team-chat
```

**Mission scripting use cases:** Lua mission scripts can place scripted pings ("attack this target"), send narrated chat messages (briefing text during gameplay), and manage tactical markers (pre-placed waypoints for mission objectives). The `Chat.Send` function enables bot-style NPC communication in co-op scenarios.

### 9. Console Commands (D058 Integration)

All coordination features are accessible via the command console:

```
/all <message>           # Send to all-chat
/team <message>          # Send to team chat
/w <player> <message>    # Whisper to player
/mute <player>           # Mute player (voice + text)
/unmute <player>         # Unmute player
/mutelist                # Show muted players
/block <player>          # Block player socially (messages/invites/profile contact)
/unblock <player>        # Remove social block
/blocklist               # Show blocked players
/report <player> <category> [note] # Submit moderation report (D052 review pipeline)
/avoid <player>          # Add best-effort matchmaking avoid preference (D055; queue feature)
/unavoid <player>        # Remove matchmaking avoid preference
/voice volume <0-100>    # Set incoming voice volume
/voice ptt <key>         # Set push-to-talk key
/voice toggle            # Toggle voice on/off
/voice diag              # Open voice diagnostics overlay
/voice effect list       # List available effect presets (built-in + Workshop)
/voice effect set <name> # Apply effect preset (e.g., "Military Radio")
/voice effect off        # Disable voice effects
/voice effect preview <name>  # Play sample clip with effect applied
/voice effect info <name>     # Show preset details (stages, CPU estimate, author)
/voice isolation toggle  # Toggle enhanced voice isolation (receiver-side double-pass)
/ping <type> [x] [y] [label] [color] # Place a ping (optional short label/preset color)
/ping clear              # Clear your pings
/draw                    # Toggle minimap drawing mode
/marker <type> [label] [color] [ttl] [scope] # Place tactical marker/beacon at cursor
/marker clear [id|all]   # Remove marker(s)
/wheel <phrase_id>       # Send chat wheel phrase by ID
/support request <type> [target] [note] # D070 support/requisition request
/support respond <id> <approve|deny|eta|hold> [reason] # D070 commander response
/replay strip-voice <file> # Remove voice from replay file
```

### 10. Tactical Coordination Requests (Team Games)

In team games (2v2, 3v3, co-op), players need to coordinate beyond chat and pings. IC provides a lightweight **tactical request system** — structured enough to be actionable, fast enough to not feel like work.

**Design principle:** This is a game, not a project manager. Requests are quick, visual, contextual, and auto-expire. Zero backlog. Zero admin overhead. The system should feel like a C&C battlefield radio — short, punchy, tactical.

#### Request Wheel (Standard Team Games)

A second radial menu (separate from the chat wheel) for structured team requests. Opened with a dedicated key (default: `T`) or by holding the ping key and flicking to "Request."

```
         ┌──────────────┐
    ┌────┤ Need Backup  ├────┐
    │    └──────────────┘    │
┌───┴──────┐          ┌─────┴────┐
│ Need AA  │    [T]   │ Need Tanks│
└───┬──────┘          └─────┬────┘
    │    ┌──────────────┐    │
    └────┤ Build Expand ├────┘
         └──────────────┘
```

**Request categories (YAML-defined, moddable):**

```yaml
# coordination_requests.yaml
requests:
  - id: need_backup
    category: military
    label: { en: "Need backup here!", ru: "Нужна подмога!" }
    icon: shield
    target: location           # Request is pinned to where cursor was
    audio_cue: "eva_backup"
    auto_expire_seconds: 60

  - id: need_anti_air
    category: military
    label: { en: "Need anti-air!", ru: "Нужна ПВО!" }
    icon: aa_gun
    target: location
    audio_cue: "eva_air_threat"
    auto_expire_seconds: 45

  - id: need_tanks
    category: military
    label: { en: "Send armor!", ru: "Нужна бронетехника!" }
    icon: heavy_tank
    target: location
    audio_cue: "eva_armor"
    auto_expire_seconds: 60

  - id: build_expansion
    category: economy
    label: { en: "Build expansion here", ru: "Постройте базу здесь" }
    icon: refinery
    target: location
    auto_expire_seconds: 90

  - id: attack_target
    category: tactical
    label: { en: "Focus fire this target!", ru: "Огонь по цели!" }
    icon: crosshair
    target: entity_or_location  # Can target a specific building/unit
    auto_expire_seconds: 45

  - id: defend_area
    category: tactical
    label: { en: "Defend this area!", ru: "Защитите зону!" }
    icon: fortify
    target: location
    auto_expire_seconds: 90

  - id: share_resources
    category: economy
    label: { en: "Need credits!", ru: "Нужны деньги!" }
    icon: credits
    target: none               # No location — general request
    auto_expire_seconds: 30

  - id: retreat_now
    category: tactical
    label: { en: "Fall back! Regrouping.", ru: "Отступаем! Перегруппировка." }
    icon: retreat
    target: location           # Suggested rally point
    auto_expire_seconds: 30
```

#### How It Looks In-Game

When a player sends a request:

1. **Minimap marker** appears at the target location with the request icon (pulsing gently for 5 seconds, then steady)
2. **Brief audio cue** plays for teammates (EVA voice line if configured, otherwise a notification sound)
3. **Team chat message** auto-posted: `[CommanderZod] requests: Need backup here! [minimap ping]`
4. **Floating indicator** appears at the world location (visible when camera is nearby — same rendering as tactical markers)

When a teammate responds:

```
┌──────────────────────────────────┐
│  CommanderZod requests:          │
│  "Need backup here!" (0:42 left) │
│                                  │
│  [✓ On my way]  [✗ Can't help]  │
└──────────────────────────────────┘
```

- **"On my way"** — small notification to the requester: `"alice is responding to your request"`. Marker changes to show a responder icon.
- **"Can't help"** — small notification: `"alice can't help right now"`. No judgment, no penalty.
- **No response required** — teammates can ignore requests. The request auto-expires silently. No nagging.

#### Auto-Expire and Anti-Spam

- **Auto-expire:** Every request has a `auto_expire_seconds` value (30–90 seconds depending on type). When it expires, the marker fades and disappears. No clutter accumulation.
- **Max active requests:** 3 per player at a time. Sending a 4th replaces the oldest.
- **Cooldown:** 5-second cooldown between requests from the same player.
- **Duplicate collapse:** If a player requests "Need backup" twice at nearly the same location, the second request refreshes the timer instead of creating a duplicate.

#### Context-Aware Requests

The request wheel adapts based on game state:

| Context                          | Available requests                                         |
| -------------------------------- | ---------------------------------------------------------- |
| **Early game** (first 3 minutes) | Build expansion, Share resources, Scout here               |
| **Under air attack**             | "Need AA" is highlighted / auto-suggested                  |
| **Ally's base under attack**     | "Need backup at [ally's base]" auto-fills location         |
| **Low on resources**             | "Need credits" is highlighted                              |
| **Enemy superweapon detected**   | "Destroy superweapon!" appears as a special request option |

This is lightweight context — the request wheel shows all options always, but highlights contextually relevant ones with a subtle glow. No options are hidden.

#### Integration with Existing Systems

| System                         | How requests integrate                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pings (D059 §3)**            | Requests are an extension of the ping system — same minimap markers, same rendering pipeline, same deterministic order stream                                          |
| **Chat wheel (D059 §4a)**      | Chat wheel is for social phrases ("gg", "gl hf"). Request wheel is for tactical coordination. Separate keys, separate radials.                                         |
| **Tactical markers (D059 §3)** | Requests create tactical markers with a request-specific icon and auto-expire behavior                                                                                 |
| **D070 support requests**      | In Commander & SpecOps mode, the request wheel transforms into the role-specific request wheel (§10 below). Same UX, different content.                                |
| **Replay**                     | Requests are recorded as `PlayerOrder::CoordinationRequest` in the order stream. Replays show all requests with timing and responses — reviewers can see the teamwork. |
| **MVP Awards**                 | "Best Wingman" award (post-game.md) tracks request responses as assist actions                                                                                         |

#### Mode-Aware Behavior

| Game mode                      | Request system behavior                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **1v1**                        | Request wheel disabled (no teammates)                                                                                                         |
| **2v2, 3v3, FFA teams**        | Standard request wheel with military/economy/tactical categories                                                                              |
| **Co-op vs AI**                | Same as team games, plus cooperative-specific requests ("Hold this lane", "I'll take left")                                                   |
| **Commander & SpecOps (D070)** | Request wheel becomes the role-specific request/response system (§10 below) with lifecycle states, support queue, and Commander approval flow |
| **Survival (D070-adjacent)**   | Request wheel adds survival-specific options ("Need medkit", "Cover me", "Objective spotted")                                                 |

#### Fun Factor Alignment

The coordination system is designed around C&C's "toy soldiers on a battlefield" identity:

- **EVA voice lines** for requests make them feel like military radio chatter, not UI notifications
- **Visual language matches the game** — request markers use the same art style as other tactical markers (military iconography, faction-colored)
- **Speed over precision** — one key + one flick = request sent. No menus, no typing, no forms
- **Social, not demanding** — responses are optional, positive ("On my way" vs "Can't help" — no "Why aren't you helping?")
- **Auto-expire = no guilt** — missed requests vanish. No persistent task list making players feel like they failed
- **Post-game recognition** — "Best Wingman" award rewards players who respond to requests. Positive reinforcement, not punishment for ignoring them

#### Moddable

The entire request catalog is YAML-driven. Modders and game modules can:
- Add game-specific requests (Tiberian Dawn: "Need ion cannon target", "GDI reinforcements")
- Change auto-expire timers, cooldowns, max active count
- Add custom EVA voice lines per request
- Publish custom request sets to Workshop
- Total conversion mods can replace the entire request vocabulary

### 11. Role-Aware Coordination Presets (D070 Commander & Field Ops Co-op)

D070's asymmetric co-op mode (`Commander & Field Ops`) extends D059 with a **standardized request/response coordination layer**. This is a D059 communication feature, not a separate subsystem.

**Scope split:**
- **D059 owns** request/response UX, typed markers, status vocabulary, shortcuts, and replay-visible coordination events
- **D070/D038 scenarios own** gameplay meaning (which support exists, costs/cooldowns, what happens on approval)

#### Support request lifecycle (D070 extension)

For D070 scenarios, D059 supports a visible lifecycle for role-aware support requests:

- `Pending`
- `Approved`
- `Denied`
- `Queued`
- `Inbound`
- `Completed`
- `Failed`
- `CooldownBlocked`

These statuses appear in role-specific HUD panels (Commander queue, Field Ops request feedback) and can be mirrored to chat/log output for accessibility and replay review.

#### Role-aware coordination surfaces (minimum v1)

- Field Ops request wheel / quick actions (`Need CAS`, `Need Recon`, `Need Reinforcements`, `Need Extraction`, `Need Funds`, `Objective Complete`)
- Commander response shortcuts (`Approved`, `Denied`, `On Cooldown`, `ETA`, `Marking LZ`, `Hold Position`)
- Typed support markers/pings (`lz`, `cas_target`, `recon_sector`, `extraction`, `fallback`)
- Request queue + status panel on Commander HUD
- Request status feedback on Field Ops HUD (not chat-only)

#### Request economy / anti-spam UX requirements (D070)

D059 must support D070's request economy by providing UI and status affordances for:
- duplicate-request collapse ("same request already pending")
- cooldown/availability reasons (`On Cooldown`, `Insufficient Budget`, `Not Unlocked`, `Out of Range`, etc.)
- queue ordering / urgency visibility on the Commander side
- fast Commander acknowledgments that reduce chat/voice load under pressure
- typed support-marker labels and color accents (optional) without replacing marker-type semantics

This keeps the communication layer useful when commandos/spec-ops become high-impact enough that both teams may counter with their own special units.

#### Replay / determinism policy

Request creation/response actions and typed coordination markers should be represented as deterministic coordination events/orders (same design intent as pings/chat wheel) so replays preserve the teamwork context. Actual support execution remains normal gameplay orders validated by the sim (D012).

#### Discoverability / accessibility rule (reinforced for D070)

Every D070 role-critical coordination action must have:
- a shortcut path (keyboard/controller/touch quick access)
- a visible UI path
- non-color-only status signaling for request states

### Alternatives Considered

- **External voice only (Discord/TeamSpeak/Mumble)** (rejected — external voice is the status quo for OpenRA and it's the #1 friction point for new players. Forcing third-party voice excludes casual players, fragments the community, and makes beacons/pings impossible to synchronize with voice. Built-in voice is table stakes for a modern multiplayer game. However, deep analysis of Mumble's protocol, Janus SFU, and str0m's sans-I/O WebRTC directly informed IC's VoIP design — see `research/open-source-voip-analysis.md` for the full survey.)
- **P2P voice instead of relay-forwarded** (rejected — P2P voice exposes player IP addresses to all participants. This is a known harassment vector: competitive players have been DDoS'd via IPs obtained from game voice. Relay-forwarded voice maintains D007's IP privacy guarantee. The bandwidth cost is negligible for the relay.)
- **WebRTC for all platforms** (rejected — WebRTC's complexity (ICE negotiation, STUN/TURN, DTLS) is unnecessary overhead for native desktop clients that already have a UDP connection to the relay. Raw Opus-over-UDP is simpler, lower latency, and sufficient. WebRTC is used only for browser builds where raw UDP is unavailable.)
- **Voice activation (VAD) as default** (rejected — VAD transmits background noise, keyboard sounds, and private conversations. Every competitive game that tried VAD-by-default reverted to PTT-by-default. VAD remains available as a user preference for casual play.)
- **Voice moderation via speech-to-text** (rejected — real-time STT is compute-intensive, privacy-invasive, unreliable across accents/languages, and creates false positive moderation actions. Reactive moderation via reports + voice replay review is more appropriate. IC is not a social platform with tens of millions of users — community-scale moderation (D037/D052) is sufficient.)
- **Always-on voice recording in replays** (rejected — recording without consent is a privacy violation in many jurisdictions. Even with consent, always-on recording creates storage overhead for every game. Opt-in recording is the correct default. ioquake3 records voice in demos by default, but ioquake3 predates modern privacy law.)
- **Opus alternative: Lyra/Codec2** (rejected — Lyra is a Google ML-based codec with excellent compression (3 kbps) but requires ML model distribution, is not WASM-friendly, and has no Rust bindings. Codec2 is designed for amateur radio with lower quality than Opus at comparable bitrates. Opus is the industry standard, has mature Rust bindings, and is universally supported.)
- **Custom ping types per mod** (partially accepted — the engine defines the 8 core ping types; game modules can register additional types via YAML. This avoids UI inconsistency while allowing mod creativity. Custom ping types inherit the rate-limiting and visual framework.)
- **Sender-side voice effects** (rejected — applying DSP effects before Opus encoding wastes codec bits on the effect rather than the voice, degrades quality, and forces the sender's aesthetic choice on all listeners. Receiver-side effects let each player choose their own experience while preserving clean audio for replays and broadcast.)
- **External DSP library (fundsp/dasp) for voice effects** (deferred to `M11` / Phase 7+, `P-Optional` — the built-in DSP stages (biquad, compressor, soft-clip, noise gate, reverb, de-esser) are ~500 lines of straightforward Rust. External libraries add dependency weight for operations that don't need their generality. Validation trigger: convolution reverb / FFT-based effects become part of accepted scope.)
- **Voice morphing / pitch shifting** (deferred to `M11` / Phase 7+, `P-Optional` — AI-powered voice morphing (deeper voice, gender shifting, character voices) is technically feasible but raises toxicity concerns: voice morphing enables identity manipulation in team games. Competitive games that implemented voice morphing (Fortnite's party effects) limit it to cosmetic fun modes. If adopted, it is a Workshop resource type with social guardrails, not a competitive baseline feature.)
- **Shared audio channels / proximity voice** (deferred to `M11` / Phase 7+, `P-Optional` — proximity voice where you hear players based on their units' positions is interesting for immersive scenarios but confusing for competitive play. The `SPATIAL` flag provides spatial panning as a toggle-able approximation. Full proximity voice is outside the current competitive baseline and requires game-mode-specific validation.)

### Integration with Existing Decisions

- **D006 (NetworkModel):** Voice is not a NetworkModel concern — it is an `ic-net` service that sits alongside `NetworkModel`, using the same `Transport` connection but on a separate `MessageLane`. `NetworkModel` handles orders; voice forwarding is independent.
- **D007 (Relay Server):** Voice packets are relay-forwarded, maintaining IP privacy and consistent routing. The relay's voice forwarding is stateless — it copies bytes without decoding Opus. The relay's rate limiting (per-player voice packet cap) defends against voice DDoS.
- **D024 (Lua API):** IC extends Beacon and Radar globals with `Ping`, `ChatWheel`, `Marker`, and `Chat` globals. OpenRA beacon/radar calls map to IC's ping system with `PingType::Generic`.
- **D033 (QoL Toggles):** Spatial audio, voice effects (preset selection), enhanced voice isolation, smart danger alerts, ping sounds, voice recording are individually toggleable. Experience profiles (D033) bundle communication preferences — e.g., an "Immersive" profile enables spatial audio + Military Radio voice effect + smart danger alerts.
- **D054 (Transport):** On native builds, voice uses the same `Transport` trait connection as orders — Opus frames are sent on `MessageLane::Voice` over `UdpTransport`. On browser builds, voice uses a parallel `str0m` WebRTC session *alongside* (not through) the `Transport` trait, because browser audio capture/playback requires WebRTC media APIs. The relay bridges between the two: it receives voice from native clients on `MessageLane::Voice` and from browser clients via WebRTC, then forwards to each recipient using their respective transport. The `VoiceTransport` enum (`Native` / `WebRtc`) selects the appropriate path per platform.
- **D055 (Ranked Matchmaking):** Voice is stripped from ranked replay submissions. Chat and pings are preserved (they are orders in the deterministic stream).
- **D058 (Chat/Command Console):** All coordination features are accessible via console commands. D058 defined the input system; D059 defines the routing, voice, spatial signaling, and voice effect selection that D058's commands control. The `/all`, `/team`, `/w` commands were placeholder in D058 — D059 specifies their routing implementation. Voice effect commands (`/voice effect list`, `/voice effect set`, `/voice effect preview`) give console-first access to the voice effects system.
- **D070 (Asymmetric Commander & Field Ops Co-op):** D059 provides the standardized request/response coordination UX, typed support markers, and status vocabulary for D070 scenarios. D070 defines gameplay meaning and authoring; D059 defines the communication surfaces and feedback loops.
- **05-FORMATS.md (Replay Format):** Voice stream extends the replay file format with a new section. The replay header gains `voice_offset`/`voice_length` fields and a `HAS_VOICE` flag bit (bit 3). The canonical replay header also includes `lost_frame_count` and an `INCOMPLETE` flag (bit 4) for frame-loss tracking (V45) — see `formats/save-replay-formats.md` for the complete header definition. Voice is independent of the order and analysis streams — tools that don't process voice ignore it.
- **06-SECURITY.md:** New `ProtocolLimits` fields for voice, ping, and drawing rate limits. Voice spoofing prevention (relay-stamped speaker ID). Voice-in-replay consent model addresses privacy requirements.
- **D010 (Snapshots) / Analysis Event Stream:** The replay analysis event stream now includes **camera position samples** (`CameraPositionSample`), **selection tracking** (`SelectionChanged`), **control group events** (`ControlGroupEvent`), **ability usage** (`AbilityUsed`), **pause events** (`PauseEvent`), and **match end events** (`MatchEnded`) — see `formats/save-replay-formats.md` § "Analysis Event Stream" for the full enum. Camera samples are lightweight (~8 bytes per player per sample at 2 Hz = ~1 KB/min for 8 players). D059 notes this integration because voice-in-replay is most valuable when combined with camera tracking — hearing what a player said while seeing what they were looking at.
- **03-NETCODE.md (Match Lifecycle):** D059's competitive voice rules (pause behavior, eliminated player routing, ranked restrictions, coach slot) integrate with the match lifecycle protocol defined in `03-NETCODE.md` § "Match Lifecycle." Voice pause behavior follows the game pause state — voice continues during pause per D059's competitive voice rules. Surrender and disconnect events affect voice routing (eliminated-to-observer transition). The **In-Match Vote Framework** (`03-NETCODE.md` § "In-Match Vote Framework") extends D059's tactical coordination: tactical polls build on the chat wheel phrase system (`poll: true` phrases in `chat_wheel_phrases.yaml`), and `/callvote` commands are registered via D058's Brigadier command tree. See vote framework research: `research/vote-callvote-system-analysis.md`.

### Shared Infrastructure: Voice, Game Netcode & Workshop Cross-Pollination

IC's voice system (D059), game netcode (`03-NETCODE.md`), and Workshop distribution (D030/D049/D050) share underlying networking patterns. This section documents concrete improvements that flow between them — shared infrastructure that avoids duplicate work and strengthens all three systems.

#### Unified Connection Quality Monitor

Both voice (D059's `VoiceBitrateAdapter`) and game netcode (`03-NETCODE.md` § Adaptive Run-Ahead) independently monitor connection quality to adapt their behavior. Voice adjusts Opus bitrate based on packet loss and RTT. Game adjusts order submission timing based on relay timing feedback. Both systems need the same measurements — yet without coordination, they probe independently.

**Improvement:** A single `ConnectionQuality` resource in `ic-net`, updated by the relay connection, feeds both systems:

```rust
/// Shared connection quality state — updated by the relay connection,
/// consumed by voice, game netcode, and Workshop download scheduler.
#[derive(Resource)]
pub struct ConnectionQuality {
    pub rtt_ms: u32,                  // smoothed RTT (EWMA)
    pub rtt_variance_ms: u32,         // jitter estimate
    pub packet_loss_pct: u8,          // 0-100, rolling window
    pub bandwidth_estimate_kbps: u32, // estimated available bandwidth
    pub quality_tier: QualityTier,    // derived summary for quick decisions
}

pub enum QualityTier {
    Excellent,  // <30ms RTT, <1% loss
    Good,       // <80ms RTT, <3% loss
    Fair,       // <150ms RTT, <5% loss
    Poor,       // <300ms RTT, <10% loss
    Critical,   // >300ms RTT or >10% loss
}
```

**Who benefits:**
- **Voice:** `VoiceBitrateAdapter` reads `ConnectionQuality` instead of maintaining its own RTT/loss measurements. Bitrate decisions align with the game connection's actual state.
- **Game netcode:** Adaptive run-ahead uses the same smoothed RTT that voice uses, ensuring consistent latency estimation across systems.
- **Workshop downloads:** Large package downloads (D049) can throttle based on `bandwidth_estimate_kbps` during gameplay — never competing with order delivery or voice. Downloads pause automatically when `quality_tier` drops to `Poor` or `Critical`.

#### Voice Jitter Buffer ↔ Game Order Buffering

D059's adaptive jitter buffer (EWMA-based target depth, packet loss concealment) solves the same fundamental problem as game order delivery: variable-latency packet arrival that must be smoothed into regular consumption.

**Voice → Game improvement:** The jitter buffer's adaptive EWMA algorithm can inform the game's run-ahead calculation. Currently, adaptive run-ahead adjusts order submission timing based on relay feedback. The voice jitter buffer's `target_depth` — computed from the same connection's actual packet arrival variance — provides a more responsive signal: if voice packets are arriving with high jitter, game order submission should also pad its timing.

**Game → Voice improvement:** The game netcode's token-based liveness check (nonce echo, `03-NETCODE.md` § Anti-Lag-Switch) detects frozen clients within one missed token. The voice system should use the same liveness signal — if the game connection's token check fails (client frozen), the voice system can immediately switch to PLC (Opus Packet Loss Concealment) rather than waiting for voice packet timeouts. This reduces the detection-to-concealment latency from ~200ms (voice timeout) to ~33ms (one game tick).

#### Lane Priority & Voice/Order Bandwidth Arbitration

D059 uses `MessageLane::Voice` (priority tier 1, weight 2) alongside game orders (`MessageLane::Orders`, priority tier 0). The lane system already prevents voice from starving orders. But the interaction can be tighter:

**Improvement:** When `ConnectionQuality.quality_tier` drops to `Poor`, the voice system should proactively reduce bitrate *before* the lane system needs to drop voice packets. The sequence:
1. `ConnectionQuality` detects degradation
2. `VoiceBitrateAdapter` drops to minimum bitrate (16 kbps) preemptively
3. Lane scheduler sees reduced voice traffic, allocates freed bandwidth to order reliability (retransmits)
4. When quality recovers, voice ramps back up over 2 seconds

This is better than the current design where voice and orders compete reactively — the voice system cooperates proactively because it reads the same quality signal.

#### Workshop P2P Distribution ↔ Spectator Feeds

D049's BitTorrent/WebTorrent infrastructure for Workshop package distribution can serve double duty:

**Spectator feed fan-out:** When a popular tournament match has 500+ spectators, the relay server becomes a bandwidth bottleneck (broadcasting delayed `TickOrders` to all spectators). Workshop's P2P distribution pattern solves this: the relay sends the spectator feed to N seed peers, who redistribute to other spectators via WebTorrent. The feed is chunked by tick range (matching the replay format's 256-tick LZ4 blocks) — each chunk is a small torrent piece that peers can share immediately after receiving it.

**Replay distribution:** Tournament replays often see thousands of downloads in the first hour. Instead of serving from a central server, popular `.icrep` files can use Workshop's BitTorrent distribution — the replay file format's block structure (header + per-256-tick LZ4 chunks) maps naturally to torrent pieces.

#### Unified Cryptographic Identity

Five systems independently use Ed25519 signing:
1. **Game netcode** — relay server signs `CertifiedMatchResult` (D007)
2. **Voice** — relay stamps speaker ID on forwarded voice packets (D059)
3. **Replay** — signature chain hashes each tick (05-FORMATS.md)
4. **Workshop** — package signatures (D049)
5. **Community servers** — SCR credential records (D052)

**Improvement:** A single `IdentityProvider` in `ic-net` manages the relay's signing key and exposes a `sign(payload: &[u8])` method. All five systems call this instead of independently managing `ed25519_dalek` instances. Key rotation (required for long-running servers) happens in one place. The `SignatureScheme` enum (D054) gates algorithm selection for all five systems uniformly.

#### Voice Preprocessing ↔ Workshop Audio Content

D059's audio preprocessing pipeline (noise suppression via `nnnoiseless`, echo cancellation via `speexdsp-rs`, Opus encoding via `audiopus`) is a complete audio processing chain that has value beyond real-time voice:

**Workshop audio quality tool:** Content creators producing voice packs, announcer mods, and sound effect packs for the Workshop can use the same preprocessing pipeline as a quality normalization tool (`ic audio normalize`). This ensures Workshop audio content meets consistent quality standards (sample rate, loudness, noise floor) without requiring creators to own professional audio software.

**Workshop voice effect presets:** The DSP stages used in voice effects (biquad filters, compressors, reverb, distortion) are shared infrastructure between the real-time voice effects chain and the `ic audio effect` CLI tools. Content creators developing custom voice effect presets use the same `ic audio effect preview` and `ic audio effect validate` commands that the engine uses to instantiate chains at runtime. The YAML preset format is a Workshop resource type — presets are published, versioned, rated, and discoverable through the same Workshop browser as maps and mods.

#### Adaptive Quality Is the Shared Pattern

The meta-pattern across all three systems is **adaptive quality degradation** — gracefully reducing fidelity when resources are constrained, rather than failing:

| System             | Constrained Resource      | Degradation Response                           | Recovery                               |
| ------------------ | ------------------------- | ---------------------------------------------- | -------------------------------------- |
| **Voice**          | Bandwidth/loss            | Reduce Opus bitrate (32→16 kbps), increase FEC | Ramp back over 2s                      |
| **Game**           | Latency                   | Increase run-ahead, pad order submission       | Reduce run-ahead as RTT improves       |
| **Workshop**       | Bandwidth during gameplay | Pause/throttle downloads                       | Resume at full speed post-game         |
| **Spectator feed** | Relay bandwidth           | Switch to P2P fan-out, reduce feed rate        | Return to relay-direct when load drops |
| **Replay**         | Storage                   | `Minimal` embedding mode (no map/assets)       | `SelfContained` when storage allows    |

All five responses share the same trigger signal (`ConnectionQuality`), the same reaction pattern (reduce → adapt → recover), and the same design philosophy (D015's efficiency pyramid — better algorithms before more resources). Building them on shared infrastructure ensures they cooperate rather than compete.

---

---

