## D059: In-Game Communication — Text Chat, Voice, Beacons, and Coordination

|                |                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**     | Accepted                                                                                                                                                                             |
| **Phase**      | Phase 3 (text chat, beacons), Phase 5 (VoIP, voice-in-replay)                                                                                                                        |
| **Depends on** | D006 (NetworkModel), D007 (Relay Server), D024 (Lua API), D033 (QoL Toggles), D054 (Transport), D058 (Chat/Command Console)                                                          |
| **Driver**     | No open-source RTS has built-in VoIP. OpenRA has no voice chat. The Remastered Collection added basic lobby voice via Steam. This is a major opportunity for IC to set the standard. |

### Problem

RTS multiplayer requires three kinds of player coordination:

1. **Text communication** — chat channels (all, team, whisper), emoji, mod-registered phrases
2. **Voice communication** — push-to-talk VoIP for real-time callouts during gameplay
3. **Spatial signaling** — beacons, pings, map markers, tactical annotations that convey *where* and *what* without words

D058 designed the text input/command system (chat box, `/` prefix routing, command dispatch). What D058 did NOT address:

- Chat **channel routing** — how messages reach the right recipients (all, team, whisper, observers)
- **VoIP architecture** — codec, transport, relay integration, bandwidth management
- **Beacons and pings** — the non-verbal coordination layer that Apex Legends proved is often more effective than voice
- **Voice-in-replay** — whether and how voice recordings are preserved for replay playback
- How all three systems integrate with the existing `MessageLane` infrastructure (`03-NETCODE.md`) and `Transport` trait (D054)

### Decision

Build a unified coordination system with three tiers: text chat channels, relay-forwarded VoIP, and a contextual ping/beacon system — plus novel coordination tools (chat wheel, minimap drawing, tactical markers). Voice is optionally recorded into replays as a separate stream with explicit consent.

**Revision note (2026-02-22):** Revised platform guidance to define mobile minimap/bookmark coexistence (minimap cluster + adjacent bookmark dock) and explicit touch interaction precedence so future mobile coordination features (pings, chat wheel, minimap drawing) do not conflict with fast camera navigation. This revision was informed by mobile RTS UX research and touch-layout requirements (see `research/mobile-rts-ux-onboarding-community-platform-analysis.md`).

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-22)
- **Phase:** Phase 3 (text chat, beacons), Phase 5 (VoIP, voice-in-replay)
- **Canonical for:** In-game communication architecture (text chat, voice, pings/beacons, tactical coordination) and integration with commands/replay/network lanes
- **Scope:** `ic-ui` chat/voice/ping UX, `ic-net` message lanes/relay forwarding, replay voice stream policy, moderation/muting, mobile coordination input behavior
- **Decision:** IC provides a unified coordination system with **text chat channels**, **relay-forwarded VoIP**, and **contextual pings/beacons/markers**, with optional voice recording in replays via explicit consent.
- **Why:** RTS coordination needs verbal, textual, and spatial communication; open-source RTS projects under-serve VoIP and modern ping tooling; IC can set a higher baseline.
- **Non-goals:** Text-only communication as the sole coordination path; separate mobile and desktop communication rules that change gameplay semantics.
- **Invariants preserved:** Communication integrates with existing order/message infrastructure; D058 remains the input/command console foundation and D012 validation remains relevant for command-side actions.
- **Defaults / UX behavior:** Text chat channels are first-class and sticky; voice is optional; advanced coordination tools (chat wheel/minimap drawing/tactical markers) layer onto the same system.
- **Mobile / accessibility impact:** Mobile minimap and bookmark dock coexist in one cluster with explicit touch precedence rules to avoid conflicts between camera navigation and communication gestures.
- **Security / Trust impact:** Moderation, muting, observer restrictions, and replay/voice consent rules are part of the core communication design.
- **Public interfaces / types / commands:** `ChatChannel`, chat message orders/routing, voice packet/lane formats, beacon/ping/tactical marker events (see body sections)
- **Affected docs:** `src/03-NETCODE.md`, `src/06-SECURITY.md`, `src/17-PLAYER-FLOW.md`, `src/decisions/09g-interaction.md` (D058/D065)
- **Revision note summary:** Added mobile minimap/bookmark cluster coexistence and touch precedence so communication gestures do not break mobile camera navigation.
- **Keywords:** chat, voip, pings, beacons, minimap drawing, communication lanes, replay voice, mobile coordination, command console integration

### 1. Text Chat — Channel Architecture

D058 defined the chat *input* system. This section defines the chat *routing* system — how messages are delivered to the correct recipients.

#### Channel Model

```rust
/// Chat channel identifiers. Sent as part of every ChatMessage order.
/// The channel determines who receives the message. Channel selection
/// is sticky — the player's last-used channel persists until changed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChatChannel {
    /// All players and observers see the message.
    All,
    /// Only players on the same team (including shared-control allies).
    Team,
    /// Private message to a specific player. Not visible to others.
    /// Observers cannot whisper to players (anti-coaching, V41).
    Whisper { target: PlayerId },
    /// Observer-only channel. Players do not see these messages.
    /// Prevents spectator coaching during live games (V41).
    Observer,
}
```

#### Chat Message Order

Chat messages flow through the order pipeline — they are `PlayerOrder` variants, validated by the sim (D012), and replayed deterministically:

```rust
/// Chat message as a player order. Part of the deterministic order stream.
/// This means chat is captured in replays and can be replayed alongside
/// gameplay — matching SC2's `replay.message.events` stream.
pub enum PlayerOrder {
    // ... existing variants ...
    ChatMessage {
        channel: ChatChannel,
        /// UTF-8 text, bounded by ProtocolLimits::max_chat_message_length (512 chars, V15).
        text: String,
    },
    /// Notification-only metadata marker: player started/stopped voice transmission.
    /// NOT the audio data itself — that flows outside the order pipeline
    /// via MessageLane::Voice (see D059 § VoIP Architecture). This order exists
    /// solely so the sim can record voice activity timestamps in the replay's
    /// analysis event stream. The sim DOES NOT process, decode, or relay any audio.
    /// "VoIP is not part of the simulation" — VoiceActivity is a timestamp marker,
    /// not audio data.
    VoiceActivity {
        active: bool,
    },
    /// Tactical ping placed on the map. Sim-side so it appears in replays.
    TacticalPing {
        ping_type: PingType,
        pos: WorldPos,
        /// Optional entity target (e.g., "attack this unit").
        target: Option<UnitTag>,
    },
    /// Chat wheel phrase selected. Sim-side for deterministic replay.
    ChatWheelPhrase {
        phrase_id: u16,
    },
    /// Minimap annotation stroke (batch of points). Sim-side for replay.
    MinimapDraw {
        points: Vec<WorldPos>,
        color: PlayerColor,
    },
}
```

**Why chat is in the order stream:** SC2 stores chat in a separate `replay.message.events` stream alongside `replay.game.events` (orders) and `replay.tracker.events` (analysis). IC follows this model — `ChatMessage` orders are part of the tick stream, meaning replays preserve the full text conversation. During replay playback, the chat overlay shows messages at the exact tick they were sent. This is essential for tournament review and community content creation.

#### Channel Routing

Chat routing is a relay server concern, not a sim concern. The relay inspects `ChatChannel` to determine forwarding:

| Channel              | Relay Forwards To                           | Replay Visibility | Notes                                            |
| -------------------- | ------------------------------------------- | ----------------- | ------------------------------------------------ |
| `All`                | All connected clients (players + observers) | Full              | Standard all-chat                                |
| `Team`               | Same-team players only                      | Full (after game) | Hidden from opponents during live game           |
| `Whisper { target }` | Target player only + sender echo            | Sender only       | Private — not in shared replay                   |
| `Observer`           | All observers only                          | Full              | Players never see observer chat during live game |

**Anti-coaching:** During a live game, observer messages are never forwarded to players. This prevents spectator coaching in competitive matches. In replay playback, Team and Observer channels become visible to all viewers (the information is historical and no longer competitively sensitive). Whisper messages remain private — they are only stored in the sender's local replay and are never included in shared/published replays (see routing table above: "Sender only" replay visibility).

**Chat cooldown:** Rate-limited at the relay: max 5 messages per 3 seconds per player (configurable via server cvar). Exceeding the limit queues messages with a "slow mode" indicator. This prevents chat spam without blocking legitimate rapid communication during intense moments.

#### Channel Switching

```
Enter         → Open chat in last-used channel
Shift+Enter   → Open chat in All (if last-used was Team)
Tab           → Cycle: All → Team → Observer (if spectating)
/w <name>     → Switch to whisper channel targeting <name>
/all           → Switch to All channel (D058 command)
/team          → Switch to Team channel (D058 command)
```

The active channel is displayed as a colored prefix in the chat input: `[ALL]`, `[TEAM]`, `[WHISPER → Alice]`, `[OBS]`.

#### Emoji and Rich Text

Chat messages support a limited set of inline formatting:

- **Emoji shortcodes** — `:gg:`, `:glhf:`, `:allied:`, `:soviet:` mapped to sprite-based emoji (not Unicode — ensures consistent rendering across platforms). Custom emoji can be registered by mods via YAML.
- **Unit/building links** — `[Tank]` auto-links to the unit's encyclopedia entry (if `ic-ui` has one). Parsed client-side, not in the order stream.
- **No markdown, no HTML, no BBCode.** Chat is plain text with emoji shortcodes. This eliminates an entire class of injection attacks and keeps the parser trivial.

### 2. Voice-over-IP — Architecture

No open-source RTS engine has built-in VoIP. OpenRA relies on Discord/TeamSpeak. The Remastered Collection added lobby voice via Steam's API (Steamworks `ISteamNetworkingMessages`). IC's VoIP is engine-native — no external service dependency.

#### Design Principles

1. **VoIP is NOT part of the simulation.** Voice data never enters `ic-sim`. It is pure I/O — captured, encoded, transmitted, decoded, and played back entirely in `ic-net` and `ic-audio`. The sim is unaware that voice exists (Invariant #1: simulation is pure and deterministic).

2. **Voice flows through the relay.** Not P2P. This maintains D007's architecture: the relay prevents IP exposure, provides consistent routing, and enables server-side mute enforcement. P2P voice would leak player IP addresses — a known harassment vector in competitive games.

3. **Push-to-talk is the default.** Voice activation detection (VAD) is available as an option but not default. PTT prevents accidental transmission of background noise, private conversations, and keyboard/mouse sounds — problems that plague open-mic games.

4. **Voice is best-effort.** Lost voice packets are not retransmitted. Human hearing tolerates ~5% packet loss with Opus's built-in PLC (packet loss concealment). Retransmitting stale voice data adds latency without improving quality.

5. **Voice never delays gameplay.** The `MessageLane::Voice` lane has lower priority than `Orders` and `Control` — voice packets are dropped before order packets under bandwidth pressure.

6. **End-to-end latency target: <150ms.** Mouth-to-ear latency must stay under 150ms for natural conversation. Budget: capture buffer ~5ms + encode ~2ms + network RTT/2 (typically 30-80ms) + jitter buffer (20-60ms) + decode ~1ms + playback buffer ~5ms = 63-153ms. CS2 and Valorant achieve ~100-150ms. Mumble achieves ~50-80ms on LAN, ~100-150ms on WAN. At >200ms, conversation becomes turn-taking rather than natural overlap — unacceptable for real-time RTS callouts. The adaptive jitter buffer (see below) is the primary latency knob: on good networks it stays at 1 frame (20ms); on poor networks it expands up to 10 frames (200ms) as a tradeoff. Monitoring this budget is exposed via `VoiceDiagnostics` (see UI Indicators).

#### Codec: Opus

**Opus** (RFC 6716) is the only viable choice. It is:
- Royalty-free and open-source (BSD license)
- The standard game voice codec (used by Discord, Steam, ioquake3, Mumble, WebRTC)
- Excellent at low bitrates (usable at 6 kbps, good at 16 kbps, transparent at 32 kbps)
- Built-in forward error correction (FEC) and packet loss concealment (PLC)
- Native Rust bindings available via `audiopus` crate (safe wrapper around libopus)

**Encoding parameters:**

| Parameter              | Default  | Range         | Notes                                                                     |
| ---------------------- | -------- | ------------- | ------------------------------------------------------------------------- |
| Sample rate            | 48 kHz   | Fixed         | Opus native rate; input is resampled if needed                            |
| Channels               | 1 (mono) | Fixed         | Voice chat is mono; stereo is wasted bandwidth                            |
| Frame size             | 20 ms    | 10, 20, 40 ms | 20 ms is the standard balance of latency vs. overhead                     |
| Bitrate                | 32 kbps  | 8–64 kbps     | Adaptive (see below). 32 kbps matches Discord/Mumble quality expectations |
| Application mode       | `VOIP`   | Fixed         | Opus `OPUS_APPLICATION_VOIP` — optimized for speech, enables DTX          |
| Complexity             | 7        | 0–10          | Mumble uses 10, Discord similar; 7 is quality/CPU sweet spot              |
| DTX (Discontinuous Tx) | Enabled  | On/Off        | Stops transmitting during silence — major bandwidth savings               |
| In-band FEC            | Enabled  | On/Off        | Encodes lower-bitrate redundancy of previous frame — helps packet loss    |
| Packet loss percentage | Dynamic  | 0–100         | Fed from `VoiceBitrateAdapter.loss_ratio` — adapts FEC to actual loss     |

**Bandwidth budget per player:**

| Bitrate | Opus payload/frame (20ms) | + overhead (per packet) | Per second | Quality      |
| ------- | ------------------------- | ----------------------- | ---------- | ------------ |
| 8 kbps  | 20 bytes                  | ~48 bytes               | ~2.4 KB/s  | Intelligible |
| 16 kbps | 40 bytes                  | ~68 bytes               | ~3.4 KB/s  | Good         |
| 24 kbps | 60 bytes                  | ~88 bytes               | ~4.4 KB/s  | Very good    |
| 32 kbps | 80 bytes                  | ~108 bytes              | ~5.4 KB/s  | **Default**  |
| 64 kbps | 160 bytes                 | ~188 bytes              | ~9.4 KB/s  | Music-grade  |

Overhead = 28 bytes UDP/IP + lane header. With DTX enabled, actual bandwidth is ~60% of these figures (voice is ~60% activity, ~40% silence in typical conversation). An 8-player game where 2 players speak simultaneously at the default 32 kbps uses 2 × 5.4 KB/s = ~10.8 KB/s inbound — negligible compared to the order stream.

#### Adaptive Bitrate

The relay monitors per-connection bandwidth using the same ack vector RTT measurements used for order delivery (`03-NETCODE.md` § Per-Ack RTT Measurement). When bandwidth is constrained:

```rust
/// Voice bitrate adaptation based on available bandwidth.
/// Runs on the sending client. The relay reports congestion via
/// a VoiceBitrateHint control message (not an order — control lane).
pub struct VoiceBitrateAdapter {
    /// Current target bitrate (Opus encoder parameter).
    pub current_bitrate: u32,
    /// Minimum acceptable bitrate. Below this, voice is suspended
    /// with a "low bandwidth" indicator to the UI.
    pub min_bitrate: u32,       // default: 8_000
    /// Maximum bitrate when bandwidth is plentiful.
    pub max_bitrate: u32,       // default: 32_000
    /// Smoothed trip time from ack vectors (updated every packet).
    pub srtt_us: u64,
    /// Packet loss ratio (0.0–1.0) from ack vector analysis.
    pub loss_ratio: f32,        // f32 OK — this is I/O, not sim
}

impl VoiceBitrateAdapter {
    /// Called each frame. Returns the bitrate to configure on the encoder.
    /// Also updates Opus's OPUS_SET_PACKET_LOSS_PERC hint dynamically
    /// (learned from Mumble/Discord — static loss hints under-optimize FEC).
    pub fn adapt(&mut self) -> u32 {
        if self.loss_ratio > 0.15 {
            // Heavy loss: drop to minimum, prioritize intelligibility
            self.current_bitrate = self.min_bitrate;
        } else if self.loss_ratio > 0.05 {
            // Moderate loss: reduce by 25%
            self.current_bitrate = (self.current_bitrate * 3 / 4).max(self.min_bitrate);
        } else if self.srtt_us < 100_000 {
            // Low latency, low loss: increase toward max
            self.current_bitrate = (self.current_bitrate * 5 / 4).min(self.max_bitrate);
        }
        self.current_bitrate
    }

    /// Returns the packet loss percentage hint for OPUS_SET_PACKET_LOSS_PERC.
    /// Dynamic: fed from observed loss_ratio rather than a static 10% default.
    /// At higher loss hints, Opus allocates more bits to in-band FEC.
    pub fn opus_loss_hint(&self) -> i32 {
        // Quantize to 0, 5, 10, 15, 20, 25 — Opus doesn't need fine granularity
        ((self.loss_ratio * 100.0) as i32 / 5 * 5).clamp(0, 25)
    }
}
```

#### Message Lane: Voice

Voice traffic uses a new `MessageLane::Voice` lane, positioned between `Chat` and `Bulk`:

```rust
pub enum MessageLane {
    Orders = 0,
    Control = 1,
    Chat = 2,     // Lobby/post-game chat only; in-match chat flows as PlayerOrder in Orders lane
    Voice = 3,    // NEW — voice frames
    Bulk = 4,     // was 3, renumbered
}
```

| Lane      | Priority | Weight | Buffer | Reliability | Rationale                                                     |
| --------- | -------- | ------ | ------ | ----------- | ------------------------------------------------------------- |
| `Orders`  | 0        | 1      | 4 KB   | Reliable    | Orders must arrive; missed = Idle (deadline is the cap)       |
| `Control` | 0        | 1      | 2 KB   | Unreliable  | Latest sync hash wins; stale hashes are useless               |
| `Chat`    | 1        | 1      | 8 KB   | Reliable    | Lobby/post-game chat; in-match chat is in Orders lane         |
| `Voice`   | 1        | 2      | 16 KB  | Unreliable  | Real-time voice; dropped frames use Opus PLC (not retransmit) |
| `Bulk`    | 2        | 1      | 64 KB  | Unreliable  | Telemetry/observer data uses spare bandwidth                  |

**Voice and Chat share priority tier 1** with a 2:1 weight ratio — voice gets twice the bandwidth share because it's time-sensitive. Under bandwidth pressure, Orders and Control are served first (tier 0), then Voice and Chat split the remainder (tier 1, 67%/33%), then Bulk gets whatever is left (tier 2). This ensures voice never delays order delivery, but voice frames are prioritized over chat messages within the non-critical tier.

**Buffer limit:** 16 KB allows ~73ms of buffered voice at the default 32 kbps (~148 frames at 108 bytes each). If the buffer fills (severe congestion), the oldest voice frames are dropped — this is correct behavior for real-time audio (stale audio is worse than silence).

#### Voice Packet Format

```rust
/// Voice data packet. Travels on MessageLane::Voice.
/// NOT a PlayerOrder — voice never enters the sim.
/// Encoded in the lane's framing, not the order TLV format.
pub struct VoicePacket {
    /// Which player is speaking. Set by relay (not client) to prevent spoofing.
    pub speaker: PlayerId,
    /// Monotonically increasing sequence number for ordering + loss detection.
    pub sequence: u32,
    /// Opus frame count in this packet (typically 1, max 3 for 60ms bundling).
    pub frame_count: u8,
    /// Voice routing target. The relay uses this to determine forwarding.
    pub target: VoiceTarget,
    /// Flags: SPATIAL (positional audio hint), FEC (frame contains FEC data).
    pub flags: VoiceFlags,
    /// Opus-encoded audio payload. Size determined by bitrate and frame_count.
    pub data: Vec<u8>,
}

/// Who should hear this voice transmission.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoiceTarget {
    /// All players and observers hear the transmission.
    All,
    /// Only same-team players.
    Team,
    /// Specific player (private voice — rare, but useful for coaching/tutoring).
    Player(PlayerId),
}

bitflags! {
    pub struct VoiceFlags: u8 {
        /// Positional audio hint — the listener should spatialize this
        /// voice based on the speaker's camera position or selected units.
        /// Opt-in via D033 QoL toggle. Disabled by default.
        const SPATIAL = 0x01;
        /// This packet contains Opus in-band FEC data for the previous frame.
        const FEC     = 0x02;
    }
}
```

**Speaker ID is relay-assigned.** The client sends voice data; the relay stamps `speaker` before forwarding. This prevents voice spoofing — a client cannot impersonate another player's voice. Same pattern as ioquake3's server-side VoIP relay (where `sv_client.c` stamps the client number on forwarded voice packets).

