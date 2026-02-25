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

**Anti-coaching:** During a live game, observer messages are never forwarded to players. This prevents spectator coaching in competitive matches. In replay playback, all channels are visible (the information is historical).

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
    Chat = 2,
    Voice = 3,    // NEW — voice frames
    Bulk = 4,     // was 3, renumbered
}
```

| Lane      | Priority | Weight | Buffer | Reliability | Rationale                                                     |
| --------- | -------- | ------ | ------ | ----------- | ------------------------------------------------------------- |
| `Orders`  | 0        | 1      | 4 KB   | Reliable    | Orders must arrive; missed = Idle (deadline is the cap)       |
| `Control` | 0        | 1      | 2 KB   | Unreliable  | Latest sync hash wins; stale hashes are useless               |
| `Chat`    | 1        | 1      | 8 KB   | Reliable    | Chat messages should arrive but can wait                      |
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

#### Relay Voice Forwarding

The relay server forwards voice packets with minimal processing:

```rust
/// Relay-side voice forwarding. Per-client, per-tick.
/// The relay does NOT decode Opus — it forwards opaque bytes.
/// This keeps relay CPU cost near zero for voice.
impl RelaySession {
    fn forward_voice(&mut self, from: PlayerId, packet: &VoicePacket) {
        // 1. Validate: is this player allowed to speak? (not muted, not observer in competitive)
        if self.is_muted(from) { return; }

        // 2. Rate limit: max voice_packets_per_second per player (default 50 = 1 per 20ms)
        if !self.voice_rate_limiter.check(from) { return; }

        // 3. Stamp speaker ID (overwrite whatever the client sent)
        let mut forwarded = packet.clone();
        forwarded.speaker = from;

        // 4. Route based on VoiceTarget
        match packet.target {
            VoiceTarget::All => {
                for client in &self.clients {
                    if client.id != from && !client.has_muted(from) {
                        client.send_voice(&forwarded);
                    }
                }
            }
            VoiceTarget::Team => {
                for client in &self.clients {
                    if client.id != from
                        && client.team == self.clients[from].team
                        && !client.has_muted(from)
                    {
                        client.send_voice(&forwarded);
                    }
                }
            }
            VoiceTarget::Player(target) => {
                if let Some(client) = self.clients.get(target) {
                    if !client.has_muted(from) {
                        client.send_voice(&forwarded);
                    }
                }
            }
        }
    }
}
```

**Relay bandwidth cost:** The relay is a packet reflector for voice — it copies bytes without decoding. For an 8-player game where 2 players speak simultaneously at the default 32 kbps, the relay transmits: 2 speakers × 7 recipients × 5.4 KB/s = ~75.6 KB/s outbound. This is negligible for a server. The relay already handles order forwarding; voice adds proportionally small overhead.

#### Spatial Audio (Optional)

Inspired by ioquake3's `VOIP_SPATIAL` flag and Mumble's positional audio plugin:

When `VoiceFlags::SPATIAL` is set, the receiving client spatializes the voice based on the speaker's in-game position. The speaker's position is derived from their primary selection or camera center — NOT transmitted in the voice packet (that would leak tactical information). The receiver's client already knows all unit positions (lockstep sim), so it can compute relative direction and distance locally.

**Spatial audio is a D033 QoL toggle** (`voice.spatial_audio: bool`, default `false`). When enabled, teammates' voice is panned left/right based on where their units are on the map. This creates a natural "war room" effect — you hear your ally to your left when their base is left of yours.

**Why disabled by default:** Spatial voice is disorienting if unexpected. Players accustomed to centered voice chat need to opt in. Additionally, it only makes sense in team games with distinct player positions — 1v1 games get no benefit.

#### Browser (WASM) VoIP

Native desktop clients use raw Opus-over-UDP through the `UdpTransport` (D054). Browser clients cannot use raw UDP — they use WebRTC for voice transport.

**str0m** (github.com/algesten/str0m) is the recommended Rust WebRTC library:
- Pure Rust, Sans I/O (no internal threads — matches IC's architecture)
- Frame-level and RTP-level APIs
- Multiple crypto backends (aws-lc-rs, ring, OpenSSL, platform-native)
- Bandwidth estimation (BWE), NACK, Simulcast support
- `&mut self` pattern — no internal mutexes
- 515+ stars, 43+ contributors, 602 dependents

For browser builds, VoIP uses str0m's WebRTC data channels routed through the relay. The relay bridges WebRTC ↔ raw UDP voice packets, enabling cross-platform voice between native and browser clients. The Opus payload is identical — only the transport framing differs.

```rust
/// VoIP transport selection — the INITIAL transport chosen per platform.
/// This is a static selection at connection time (platform-dependent).
/// Runtime transport adaptation (e.g., UDP→TCP fallback) is handled by
/// VoiceTransportState (see § "Connection Recovery" below), which is a
/// separate state machine that manages degraded-mode transitions without
/// changing the VoiceTransport enum.
pub enum VoiceTransport {
    /// Raw Opus frames on MessageLane::Voice over UdpTransport.
    /// Desktop default. Lowest latency, lowest overhead.
    Native,
    /// Opus frames via WebRTC data channel (str0m).
    /// Browser builds. Higher overhead but compatible with browser APIs.
    WebRtc,
}
```

#### Muting and Moderation

Per-player mute is client-side AND relay-enforced:

| Action              | Scope       | Mechanism                                                                |
| ------------------- | ----------- | ------------------------------------------------------------------------ |
| **Player mutes**    | Client-side | Receiver ignores voice from muted player. Also sends mute hint to relay. |
| **Relay mute hint** | Server-side | Relay skips forwarding to the muting player — saves bandwidth.           |
| **Admin mute**      | Server-side | Relay drops all voice from the muted player. Cannot be overridden.       |
| **Self-mute**       | Client-side | PTT disabled, mic input stopped. "Muted" icon shown to other players.    |
| **Self-deafen**     | Client-side | All incoming voice silenced. "Deafened" icon shown.                      |

**Mute persistence:** Per-player mute decisions are stored in local SQLite (D034) keyed by the player's Ed25519 public key (D052). Muting "Bob" in one game persists across future games with the same player. The relay does not store mute relationships — mute is a client preference, communicated to the relay as a routing hint.

**Scope split (social controls vs matchmaking vs moderation):**
- **Mute** (D059): communication routing and local comfort (voice/text)
- **Block** (D059 + lobby/profile UI): social interaction preference (messages/invites/profile contact)
- **Avoid Player** (D055): matchmaking preference, best-effort only (not a communication feature)
- **Report** (D059 + D052 moderation): evidence-backed moderation signal for griefing/cheating/abuse

This separation prevents UX confusion ("I blocked them, why did I still get matched?") and avoids turning social tools into stealth matchmaking exploits.

**Hotmic protection:** If PTT is held continuously for longer than `voice.max_ptt_duration` (default 120 seconds, configurable), transmission is automatically cut and the player sees a "PTT timeout — release and re-press to continue" notification. This prevents stuck-key scenarios where a player unknowingly broadcasts for an entire match (keyboard malfunction, key binding conflict, cat on keyboard). Discord implements similar detection; CS2 cuts after ~60 seconds continuous transmission. The timeout resets immediately on key release — there is no cooldown.

**Communication abuse penalties:** Repeated mute/report actions against a player across multiple games trigger **progressive communication restrictions** on that player's community profile (D052/D053). The community server (D052) tracks reports per player:

| Threshold            | Penalty                                                    | Duration       | Scope                |
| -------------------- | ---------------------------------------------------------- | -------------- | -------------------- |
| 3 reports in 24h     | Warning displayed to player                                | Immediate      | Informational only   |
| 5 reports in 72h     | Voice-restricted: team-only voice, no all-chat voice       | 24 hours       | Per community server |
| 10 reports in 7 days | Voice-muted: cannot transmit voice                         | 72 hours       | Per community server |
| Repeated offenses    | Escalated to community moderators (D037) for manual review | Until resolved | Per community server |

Thresholds are configurable per community server — tournament communities may be stricter. Penalties are community-scoped (D052 federation), not global. A player comm-banned on one community can still speak on others. Text chat follows the same escalation path. False report abuse is itself a reportable offense.

#### Player Reports and Community Review Handoff (D052 integration)

D059 owns the **reporting UX and event capture**, but not final enforcement. Reports are routed to the community server's moderation/review pipeline (D052).

**Report categories (minimum):**
- `cheating`
- `griefing / team sabotage`
- `afk / intentional idle`
- `harassment / abusive chat/voice`
- `spam / disruptive comms`
- `other` (freeform note)

**Evidence attachment defaults (when available):**
- replay reference / signed replay ID (`.icrep`, D007)
- match ID / `CertifiedMatchResult` reference
- timestamps and player IDs
- communication context (muted/report counts, voice/text events) for abuse reports
- relay telemetry summary flags (disconnects/desyncs/timing anomalies) for cheating/griefing reports

**UX and trust rules:**
- Reports are **signals**, not automatic guilt
- The UI should communicate "submitted for review" rather than "player punished"
- False/malicious reporting is itself sanctionable by the community server (D052/D037)
- Community review (Overwatch-style, if enabled) is advisory input to moderators/anti-cheat workflows, not a replacement for evidence and thresholds

#### Jitter Buffer

Voice packets arrive with variable delay (network jitter). Without a jitter buffer, packets arriving late cause audio stuttering and packets arriving out-of-order cause gaps. Every production VoIP system uses a jitter buffer — Mumble, Discord, TeamSpeak, and WebRTC all implement one. D059 requires an **adaptive jitter buffer** per-speaker in `ic-audio`.

**Design rationale:** A fixed jitter buffer (constant delay) wastes latency on good networks and is insufficient on bad networks. An adaptive buffer dynamically adjusts delay based on observed inter-arrival jitter — expanding when jitter increases (prevents drops) and shrinking when jitter decreases (minimizes latency). This is the universal approach in production VoIP systems (see `research/open-source-voip-analysis.md` § 6).

```rust
/// Adaptive jitter buffer for voice playback.
/// Smooths variable packet arrival times into consistent playback.
/// One instance per speaker, managed by ic-audio.
///
/// Design informed by Mumble's audio pipeline and WebRTC's NetEq.
/// Mumble uses a similar approach with its Resynchronizer for echo
/// cancellation timing — IC generalizes this to all voice playback.
pub struct JitterBuffer {
    /// Ring buffer of received voice frames, indexed by sequence number.
    /// None entries represent lost or not-yet-arrived packets.
    frames: VecDeque<Option<VoiceFrame>>,
    /// Current playback delay in 20ms frame units.
    /// E.g., delay=3 means 60ms of buffered audio before playback starts.
    delay: u32,
    /// Minimum delay (frames). Default: 1 (20ms).
    min_delay: u32,
    /// Maximum delay (frames). Default: 10 (200ms).
    /// Above 200ms, voice feels too delayed for real-time conversation.
    max_delay: u32,
    /// Exponentially weighted moving average of inter-arrival jitter.
    jitter_estimate: f32,   // f32 OK — this is I/O, not sim
    /// Timestamp of last received frame for jitter calculation.
    last_arrival: Instant,
    /// Statistics: total frames received, lost, late, buffer expansions/contractions.
    stats: JitterStats,
}

impl JitterBuffer {
    /// Called when a voice packet arrives from the network.
    pub fn push(&mut self, sequence: u32, opus_data: &[u8], now: Instant) {
        // Update jitter estimate using EWMA
        let arrival_delta = now - self.last_arrival;
        let expected_delta = Duration::from_millis(20); // one frame period
        let jitter = (arrival_delta.as_secs_f32() - expected_delta.as_secs_f32()).abs();
        // Smoothing factor 0.9 — reacts within ~10 packets to jitter changes
        self.jitter_estimate = 0.9 * self.jitter_estimate + 0.1 * jitter;
        self.last_arrival = now;
        
        // Insert frame at correct position based on sequence number.
        // Handles out-of-order delivery by placing in the correct slot.
        self.insert_frame(sequence, opus_data);
        
        // Adapt buffer depth based on current jitter estimate
        self.adapt_delay();
    }
    
    /// Called every 20ms by the audio render thread.
    /// Returns the next frame to play, or None if the frame is missing.
    /// On None, the caller invokes Opus PLC (decoder with null input)
    /// to generate concealment audio from the previous frame's spectral envelope.
    pub fn pop(&mut self) -> Option<VoiceFrame> {
        self.frames.pop_front().flatten()
    }
    
    fn adapt_delay(&mut self) {
        // Target: 2× jitter estimate + 1 frame covers ~95% of variance
        let target = ((2.0 * self.jitter_estimate * 50.0) as u32 + 1)
            .clamp(self.min_delay, self.max_delay);
        
        if target > self.delay {
            // Increase delay: expand buffer immediately (insert silence frame)
            self.delay += 1;
        } else if target + 2 < self.delay {
            // Decrease delay: only when significantly over-buffered
            // Hysteresis of 2 frames prevents oscillation on borderline networks
            self.delay -= 1;
        }
    }
}
```

**Packet Loss Concealment (PLC) integration:** When `pop()` returns `None` (missing frame due to packet loss), the Opus decoder is called with null input (`opus_decode(null, 0, ...)`) to generate PLC audio. Opus's built-in PLC extrapolates from the previous frame's spectral envelope, producing a smooth fade-out over 3-5 lost frames. At 5% packet loss, PLC is barely audible. At 15% loss, artifacts become noticeable — this is where the `VoiceBitrateAdapter` reduces bitrate and increases FEC allocation. Combined with dynamic `OPUS_SET_PACKET_LOSS_PERC` (see Adaptive Bitrate above), the encoder and decoder cooperate: the encoder allocates more bits to FEC when loss is high, and the decoder conceals any remaining gaps.

#### UDP Connectivity Checks and TCP Tunnel Fallback

Learned from Mumble's protocol (see `research/open-source-voip-analysis.md` § 7): some networks block or heavily throttle UDP (corporate firewalls, restrictive NATs, aggressive ISP rate limiting). D059 must not assume voice always uses UDP.

Mumble solves this with a graceful fallback: the client sends periodic UDP ping packets; if responses stop, voice is tunneled through the TCP control connection transparently. IC adopts this pattern:

```rust
/// Voice transport state machine. Manages UDP/TCP fallback for voice.
/// Runs on each client independently. The relay accepts voice from
/// either transport — it doesn't care how the bytes arrived.
pub enum VoiceTransportState {
    /// UDP voice active. UDP pings succeeding.
    /// Default state when connection is established.
    UdpActive,
    /// UDP pings failing. Testing connectivity.
    /// Voice is tunneled through TCP/WebSocket during this state.
    /// UDP pings continue in background to detect recovery.
    UdpProbing {
        last_ping: Instant,
        consecutive_failures: u8,  // switch to TcpTunnel after 5 failures
    },
    /// UDP confirmed unavailable. Voice fully tunneled through TCP.
    /// Higher latency (~20-50ms from TCP queuing) but maintains connectivity.
    /// UDP pings continue every 5 seconds to detect recovery.
    TcpTunnel,
    /// UDP restored after tunnel period. Transitioning back.
    /// Requires 3 consecutive successful UDP pings before switching.
    UdpRestoring { consecutive_successes: u8 },
}
```

**How TCP tunneling works:** Voice frames use the same `VoicePacket` binary format regardless of transport. When tunneled through TCP, voice packets are sent as a distinct message type on the existing control connection — the relay identifies the message type and forwards the voice payload normally. The relay doesn't care whether voice arrived via UDP or TCP; it stamps the speaker ID and forwards to recipients.

**UI indicator:** A small icon in the voice overlay shows the transport state — "Direct" (UDP, normal) or "Tunneled" (TCP, yellow warning icon). Tunneled voice has ~20-50ms additional latency from TCP head-of-line blocking but is preferable to no voice at all.

**Implementation phasing note (from Mumble documentation):** "When implementing the protocol it is easier to ignore the UDP transfer layer at first and just tunnel the UDP data through the TCP tunnel. The TCP layer must be implemented for authentication in any case." This matches IC's phased approach — TCP-tunneled voice can ship in Phase 3 (alongside text chat), with UDP voice optimization in Phase 5.

#### Audio Preprocessing Pipeline

The audio capture-to-encode pipeline in `ic-audio`. Order matters — this sequence is the standard across Mumble, Discord, WebRTC, and every production VoIP system (see `research/open-source-voip-analysis.md` § 8):

```
Platform Capture (cpal) → Resample to 48kHz (rubato) →
  Echo Cancellation (optional, speaker users only) →
    Noise Suppression (nnnoiseless / RNNoise) →
      Voice Activity Detection (for VAD mode) →
        Opus Encode (audiopus, VOIP mode, FEC, DTX) →
          VoicePacket → MessageLane::Voice
```

**Recommended Rust crates for the pipeline:**

| Component         | Crate                                          | Notes                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio I/O         | `cpal`                                         | Cross-platform (WASAPI, CoreAudio, ALSA/PulseAudio, WASM AudioWorklet). Already used by Bevy's audio ecosystem.                                                                                                                       |
| Resampler         | `rubato`                                       | Pure Rust, high quality async resampler. No C dependencies. Converts from mic sample rate to Opus's 48kHz.                                                                                                                            |
| Noise suppression | `nnnoiseless`                                  | Pure Rust port of Mozilla's RNNoise. ML-based (GRU neural network). Dramatically better than DSP-based Speex preprocessing for non-stationary noise (keyboard clicks, fans, traffic). ~0.3% CPU cost per core — negligible.           |
| Opus codec        | `audiopus`                                     | Safe Rust wrapper around libopus. Required. Handles encode/decode/PLC.                                                                                                                                                                |
| Echo cancellation | Speex AEC via `speexdsp-rs`, or browser-native | Full AEC only matters for speaker/laptop users (not headset). Mumble's `Resynchronizer` shows this requires a ~20ms mic delay queue to ensure speaker data reaches the canceller first. Browser builds can use WebRTC's built-in AEC. |

**Why RNNoise (`nnnoiseless`) over Speex preprocessing:** Mumble supports both. RNNoise is categorically superior — it uses a recurrent neural network trained on 80+ hours of noise samples, whereas Speex uses traditional FFT-based spectral subtraction. RNNoise handles non-stationary noise (typing, mouse clicks — common in RTS gameplay) far better than Speex. The `nnnoiseless` crate is pure Rust (no C dependency), adding ~0.3% CPU per core versus Speex's ~0.1%. This is negligible on any hardware that can run IC. Noise suppression is a D033 QoL toggle (`voice.noise_suppression: bool`, default `true`).

**Playback pipeline (receive side):**

```
MessageLane::Voice → VoicePacket → JitterBuffer →
  Opus Decode (or PLC on missing frame) →
    Per-speaker gain (user volume setting) →
      Voice Effects Chain (if enabled — see below) →
        Spatial panning (if VoiceFlags::SPATIAL) →
          Mix with game audio → Platform Output (cpal/Bevy audio)
```

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

### 3. Beacons and Tactical Pings

The non-verbal coordination layer. Research shows this is often more effective than voice for spatial RTS communication — Respawn Entertainment play-tested Apex Legends for a month with no voice chat and found their ping system "rendered voice chat with strangers largely unnecessary" (Polygon review). EA opened the underlying patent (US 11097189, "Contextually Aware Communications Systems") for free use in August 2021.

#### OpenRA Beacon Compatibility (D024)

OpenRA's Lua API includes `Beacon` (map beacon management) and `Radar` (radar ping control) globals. IC must support these for mission script compatibility:

- `Beacon.New(owner, pos, duration, palette, isPlayerPalette)` — create a map beacon
- `Radar.Ping(player, pos, color, duration)` — flash a radar ping on the minimap

IC's beacon system is a superset — OpenRA's beacons are simple map markers with duration. IC adds contextual types, entity targeting, and the ping wheel (see below). OpenRA beacon/radar Lua calls map to `PingType::Generic` with appropriate visual parameters.

#### Ping Type System

```rust
/// Contextual ping types. Each has a distinct visual, audio cue, and
/// minimap representation. The set is fixed at the engine level but
/// game modules can register additional types via YAML.
///
/// Inspired by Apex Legends' contextual ping system, adapted for RTS:
/// Apex pings communicate "what is here" for a shared 3D space.
/// RTS pings communicate "what should we do about this location" for
/// a top-down strategic view. The emphasis shifts from identification
/// to intent.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PingType {
    /// General attention ping. "Look here."
    /// Default when no contextual modifier applies.
    Generic,
    /// Attack order suggestion. "Attack here / attack this unit."
    /// Shows crosshair icon. Red minimap flash.
    Attack,
    /// Defend order suggestion. "Defend this location."
    /// Shows shield icon. Blue minimap flash.
    Defend,
    /// Warning / danger alert. "Enemies here" or "be careful."
    /// Shows exclamation icon. Yellow minimap flash. Pulsing audio cue.
    Danger,
    /// Rally point. "Move units here" / "gather here."
    /// Shows flag icon. Green minimap flash.
    Rally,
    /// Request assistance. "I need help here."
    /// Shows SOS icon. Orange minimap flash with urgency pulse.
    Assist,
    /// Enemy spotted — marks a position where enemy units were seen.
    /// Auto-fades after the fog of war re-covers the area.
    /// Shows eye icon. Red blinking on minimap.
    EnemySpotted,
    /// Economic marker. "Expand here" / "ore field here."
    /// Shows resource icon. Green on minimap.
    Economy,
}
```

#### Contextual Ping (Apex Legends Adaptation)

The ping type auto-selects based on what's under the cursor when the ping key is pressed:

| Cursor Target                      | Auto-Selected Ping | Visual                             |
| ---------------------------------- | ------------------ | ---------------------------------- |
| Empty terrain (own territory)      | `Rally`            | Flag marker at position            |
| Empty terrain (enemy territory)    | `Attack`           | Crosshair marker at position       |
| Empty terrain (neutral/unexplored) | `Generic`          | Diamond marker at position         |
| Visible enemy unit                 | `EnemySpotted`     | Eye icon tracking the unit briefly |
| Own damaged building               | `Assist`           | SOS icon on building               |
| Ore field / resource               | `Economy`          | Resource icon at position          |
| Fog-of-war edge                    | `Danger`           | Exclamation at fog boundary        |

**Override via ping wheel:** Holding the ping key (default: `G`) opens a radial menu (ping wheel) showing all 8 ping types. Flick the mouse in the desired direction to select. Release to place. Quick-tap (no hold) uses the contextual default. This two-tier interaction (quick contextual + deliberate selection) follows Apex Legends' proven UX pattern.

#### Ping Wheel UI

```
              Danger
         ╱            ╲
    Defend              Attack
       │    [cursor]     │
    Assist              Rally
         ╲            ╱
         Economy    EnemySpotted
              Generic
```

The ping wheel is a radial menu rendered by `ic-ui`. Each segment shows the ping type icon and name. The currently highlighted segment follows the mouse direction from center. Release places the selected ping type. Escape cancels.

**Controller support (Steam Deck / future console):** Ping wheel opens on right stick click, direction selected via stick. Quick-ping on D-pad press.

#### Ping Properties

```rust
/// A placed ping marker. Managed by ic-ui (rendering) and forwarded
/// to the sim via PlayerOrder::TacticalPing for replay recording.
pub struct PingMarker {
    pub id: PingId,
    pub owner: PlayerId,
    pub ping_type: PingType,
    pub pos: WorldPos,
    /// If the ping was placed on a specific entity, track it.
    /// The marker follows the entity until it dies or the ping expires.
    pub tracked_entity: Option<UnitTag>,
    /// Ping lifetime. Default 8 seconds. Danger pings pulse.
    pub duration: Duration,
    /// Audio cue played on placement. Each PingType has a distinct sound.
    pub audio_cue: PingAudioCue,
    /// Optional short label for typed/role-aware pings (e.g., "AA", "LZ A").
    /// Empty by default for quick pings. Bounded and sanitized.
    pub label: Option<String>,
    /// Optional appearance override for scripted beacons / D070 typed markers.
    /// Core ping semantics still require shape/icon cues; color cannot be the
    /// only differentiator (accessibility and ranked readability).
    pub style: Option<CoordinationMarkerStyle>,
    /// Tick when placed (for expiration).
    pub placed_at: u64,
}
```

**Ping rate limiting:** Max 3 pings per 5 seconds per player (configurable). Exceeding the limit suppresses pings with a cooldown indicator. This prevents ping spam, which is a known toxicity vector in games with ping systems (LoL's "missing" ping spam problem).

**Ping persistence:** Pings are ephemeral — they expire after `duration` (default 8 seconds). They do NOT persist in save games. They DO appear in replays (via `PlayerOrder::TacticalPing` in the order stream).

**Audio feedback:** Each ping type has a distinct short audio cue (< 300ms). Incoming pings from teammates play the cue with a minimap flash. Audio volume follows the `voice.ping_volume` cvar (D058). Repeated rapid pings from the same player have diminishing audio (third ping in 5 seconds is silent) to reduce annoyance.

#### Beacon/Marker Colors and Optional Labels (Generals/OpenRA-style clarity, explicit in IC)

IC already supports pings and tactical markers; this section makes the **appearance and text-label rules explicit** so "colored beaconing with optional text" is a first-class, replay-safe communication feature (not an implied UI detail).

```rust
/// Shared style metadata used by pings/beacons/tactical markers.
/// Presentation-only; gameplay semantics remain in ping/marker type.
pub struct CoordinationMarkerStyle {
    pub color: MarkerColorStyle,
    pub text_label: Option<String>,       // bounded/sanitized tactical label (normalized bytes + display width caps)
    pub visibility: MarkerVisibility,     // team/allies/observers/scripted
    pub ttl_ticks: Option<u64>,           // None = persistent until cleared
}

#[derive(Clone, Copy, Debug)]
pub enum MarkerColorStyle {
    /// Use the canonical color for the ping/marker type (default).
    Canonical,
    /// Use the sender's player color (for team readability / ownership).
    PlayerColor,
    /// Use a predefined semantic color override (`Purple`, `White`, etc.).
    /// Mods/scenarios can expose a safe palette, not arbitrary RGB strings.
    Preset(CoordinationColorPreset),
}

#[derive(Clone, Copy, Debug)]
pub enum CoordinationColorPreset {
    White,
    Cyan,
    Purple,
    Orange,
    Red,
    Blue,
    Green,
    Yellow,
}

#[derive(Clone, Copy, Debug)]
pub enum MarkerVisibility {
    Team,
    AlliedTeams,
    Observer,        // tournament/admin overlays
    ScriptedAudience // mission-authored overlays / tutorials
}
```

**Rules (normative):**

- **Core ping types keep canonical meaning.** `Attack`, `Danger`, `Defend`, etc. retain distinct icons/shapes/audio, even if a style override adjusts accent color.
- **Color is never the only signal.** Icons, animation, shape, and text cues remain required (colorblind-safe requirement).
- **Optional labels are short and tactical.** Max 16 chars, sanitized, no markup; examples: `AA`, `LZ-A`, `Bridge`, `Push 1`.
- **Rate limits still apply.** Styled/labeled beacons count against the same ping/marker budgets (no spam bypass via labels/colors).
- **Replay-safe.** Label text and style metadata are preserved in replay coordination events (subject to replay stripping rules where applicable).
- **Fog-of-war and audience scope still apply.** Visibility follows team/observer/scripted rules; styling cannot leak hidden intel.

**Recommended defaults:**

- Quick ping (`G` tap): no label, canonical color, ephemeral
- Ping wheel (`Hold G`): no label by default, canonical color
- Tactical marker/beacon (`/marker`, marker submenu): optional short label + optional preset color
- D070 typed support markers (`lz`, `cas_target`, `recon_sector`): canonical type color by default, optional short label (`LZ B`, `CAS 2`)

#### RTL / BiDi Support for Chat and Marker Labels (Localization + Safety Split)

IC must support legitimate RTL (Arabic/Hebrew) communication text **without** weakening anti-spoof protections.

**Rules (normative):**

- **Display correctness:** Chat messages, ping labels, and tactical marker labels use the shared UI text renderer with Unicode BiDi + shaping support (see `02-ARCHITECTURE.md` layout/text contract).
- **Safety filtering is input-side, not display-side.** D059 sanitization removes dangerous spoofing controls and abusive invisible characters before order injection, but it does **not** reject legitimate RTL script content.
- **Bounds apply to display width and byte payload.** Label limits are enforced on both normalized byte length and rendered width so short tactical labels remain readable across scripts.
- **Direction does not replace semantics.** Marker meaning remains icon/type-driven. RTL labels are additive and must not become the only differentiator (same accessibility rule as color).
- **Replay preservation:** Normalized label bytes are stored in replay events so cross-language moderation/review tooling can reconstruct the original tactical communication context.

**Minimum test cases (required for `M7.UX.D059_RTL_CHAT_MARKER_TEXT_SAFETY`):**

1. **Pure RTL chat message renders correctly** (Arabic/Hebrew text displays in correct order; Arabic joins/shaping are preserved).
2. **Mixed-script chat renders correctly** (`RTL + LTR + numerals`, e.g. `LZ-ב 2`, `CAS 2 هدف`) with punctuation/numerals placed by BiDi rules.
3. **RTL tactical marker labels remain readable under bounds** (byte limit + rendered-width limit both enforced; truncation/ellipsis does not clip glyphs or hide marker semantics).
4. **Dangerous spoofing controls are filtered without breaking legitimate text** (bidi override/invisible abuse stripped or rejected, while normal Arabic/Hebrew labels survive normalization).
5. **Replay preservation is deterministic** (normalized chat/marker-label bytes record and replay identically across clients/platforms).
6. **Moderation/review surfaces render parity** (review UI shows the same normalized RTL/mixed-script text as the original chat/marker context, without color-only reliance).

Use the canonical test dataset in `src/tracking/rtl-bidi-qa-corpus.md` (especially categories `A`, `B`, `D`, `F`, and `G`) to keep runtime/replay/moderation behavior aligned across platforms and regressions reproducible.

**Examples (valid):**
- `هدف` (Objective)
- `LZ-ب`
- `גשר` (Bridge)
- `CAS 2`

### 4. Novel Coordination Mechanics

Beyond standard chat/voice/pings, IC introduces coordination tools not found in other RTS games:

#### 4a. Chat Wheel (Dota 2 / Rocket League Pattern)

A radial menu of pre-defined phrases that are:
- **Instantly sent** — no typing, one keypress + flick
- **Auto-translated** — each phrase has a `phrase_id` that maps to the recipient's locale, enabling communication across language barriers
- **Replayable** — sent as `PlayerOrder::ChatWheelPhrase` in the order stream

```yaml
# chat_wheel_phrases.yaml — game module provides these
chat_wheel:
  phrases:
    - id: 1
      category: tactical
      label:
        en: "Attack now!"
        de: "Jetzt angreifen!"
        ru: "Атакуем!"
        zh: "现在进攻!"
      audio_cue: "eva_attack"  # optional EVA voice line

    - id: 2
      category: tactical
      label:
        en: "Fall back!"
        de: "Rückzug!"
        ru: "Отступаем!"
        zh: "撤退!"
      audio_cue: "eva_retreat"

    - id: 3
      category: tactical
      label:
        en: "Defend the base!"
        de: "Basis verteidigen!"
        ru: "Защищайте базу!"
        zh: "防守基地!"

    - id: 4
      category: economy
      label:
        en: "Need more ore"
        de: "Brauche mehr Erz"
        ru: "Нужна руда"
        zh: "需要更多矿石"

    - id: 5
      category: social
      label:
        en: "Good game!"
        de: "Gutes Spiel!"
        ru: "Хорошая игра!"
        zh: "打得好！"
      audio_cue: null

    - id: 6
      category: social
      label:
        en: "Well played"
        de: "Gut gespielt"
        ru: "Хорошо сыграно"
        zh: "打得漂亮"

    # ... 20-30 phrases per game module, community can add more via mods
```

**Chat wheel key:** Default `V`. Hold to open, flick to select, release to send. The phrase appears in team chat (or all chat, depending on category — social phrases go to all). The phrase displays in the recipient's language, but the chat log also shows `[wheel]` tag so observers know it's a pre-defined phrase.

**Why this matters for RTS:** International matchmaking means players frequently cannot communicate by text. The chat wheel solves this with zero typing — the same phrase ID maps to every supported language. Dota 2 proved this works at scale across a global player base. For IC's Cold War setting, phrases use military communication style: "Affirmative," "Negative," "Enemy contact," "Position compromised."

**Mod-extensible:** Game modules (RA1, TD, community mods) provide their own phrase sets via YAML. The engine provides the wheel UI and `ChatWheelPhrase` order — the phrases are data, not code.

#### 4b. Minimap Drawing

Players can draw directly on the minimap to communicate tactical plans:

- **Activation:** Hold `Alt` + click-drag on minimap (or `/draw` command via D058)
- **Visual:** Freeform line drawn in the player's team color. Visible to teammates only.
- **Duration:** Drawings fade after 8 seconds (same as pings).
- **Persistence:** Drawings are sent as `PlayerOrder::MinimapDraw` — they appear in replays.
- **Rate limit:** Max 3 drawing strokes per 10 seconds, max 32 points per stroke. Prevents minimap vandalism.

```rust
/// Minimap drawing stroke. Points are quantized to cell resolution
/// to keep order size small. A typical stroke is 8-16 points.
pub struct MinimapStroke {
    pub points: Vec<CellPos>,    // max 32 points
    pub color: PlayerColor,
    pub thickness: u8,           // 1-3 pixels on minimap
    pub placed_at: u64,          // tick for expiration
}
```

**Why this is novel for RTS:** Most RTS games have no minimap drawing. Players resort to rapid pinging to trace paths, which is imprecise and annoying. Minimap drawing enables "draw the attack route" coordination naturally. Some MOBA games (LoL) have minimap drawing; no major RTS does.

#### 4c. Tactical Markers (Persistent Team Annotations)

Unlike pings (ephemeral, 8 seconds) and drawings (ephemeral, 8 seconds), tactical markers are persistent annotations placed by team leaders:

```rust
/// Persistent tactical marker. Lasts until manually removed or game ends.
/// Limited to 10 per player, 30 per team. Intended for strategic planning,
/// not moment-to-moment callouts (that's what pings are for).
pub struct TacticalMarker {
    pub id: MarkerId,
    pub owner: PlayerId,
    pub marker_type: MarkerType,
    pub pos: WorldPos,
    pub label: Option<String>,   // bounded/sanitized short tactical label (RTL/LTR supported)
    pub style: CoordinationMarkerStyle,
    pub placed_at: u64,
}

#[derive(Clone, Copy, Debug)]
pub enum MarkerType {
    /// Numbered waypoint (1-9). For coordinating multi-prong attacks.
    Waypoint(u8),
    /// Named objective marker. Shows label on the map.
    Objective,
    /// Hazard zone. Renders a colored radius indicating danger area.
    HazardZone { radius: u16 },
}
```

**Access:** Place via ping wheel (hold longer to access marker submenu) or via commands (`/marker waypoint 1`, `/marker objective "Expand here"`, `/marker hazard 50`). Optional style arguments (preset color + short label) are available in the marker panel/console, but the marker type remains the authoritative gameplay meaning. Remove with `/marker clear` or right-click on existing marker.

**Use case:** Before a coordinated push, the team leader places waypoint markers 1-3 showing the attack route, an objective marker on the target, and a hazard zone on the enemy's defensive line. These persist until the push is complete, giving the team a shared tactical picture.

#### 4d. Smart Danger Alerts (Novel)

Automatic alerts that supplement manual pings with game-state-aware warnings:

```rust
/// Auto-generated alerts based on sim state. These are NOT orders —
/// they are client-side UI events computed locally from the shared sim state.
/// Each player's client generates its own alerts; no network traffic.
///
/// CRITICAL: All alerts involving enemy state MUST filter through the
/// player's current fog-of-war vision. In standard lockstep, each client
/// has the full sim state — querying enemy positions without vision
/// filtering would be a built-in maphack. The alert system calls
/// `FogProvider::is_visible(player, cell)` before considering any
/// enemy entity. Only enemies the player can currently see trigger alerts.
/// (In fog-authoritative relay mode per V26, this is solved at the data
/// level — the client simply doesn't have hidden enemy state.)
pub enum SmartAlert {
    /// Large enemy force detected moving toward the player's base.
    /// Triggered when >= 5 **visible** enemy units are within N cells of
    /// the base and were not there on the previous check (debounced,
    /// 10-second cooldown). Units hidden by fog of war are excluded.
    IncomingAttack { direction: CompassDirection, unit_count: u32 },
    /// Ally's base is under sustained attack (> 3 buildings damaged in
    /// 10 seconds). Only fires if the attacking units or damaged buildings
    /// are within the player's shared team vision.
    AllyUnderAttack { ally: PlayerId },
    /// Undefended expansion at a known resource location.
    /// Triggered when an ore field has no friendly structures or units nearby.
    /// This alert uses only friendly-side data, so no fog filtering is needed.
    UndefendedResource { pos: WorldPos },
    /// Enemy superweapon charging (if visible). RTS-specific high-urgency alert.
    /// Only fires if the superweapon structure is within the player's vision.
    SuperweaponWarning { weapon_type: String, estimated_ticks: u64 },
}
```

**Why client-side, not sim-side:** Smart alerts are purely informational — they don't affect gameplay. Computing them client-side means zero network cost and zero impact on determinism. Each client already has the full sim state (lockstep), but **alerts must respect fog of war** — only visible enemy units are considered. The `FogProvider` trait (D041) provides the vision query; alerts call `is_visible()` before evaluating any enemy entity. In fog-authoritative relay mode (V26 in `06-SECURITY.md`), this is inherently safe because the client never receives hidden enemy state. The alert thresholds are configurable via D033 QoL toggles.

**Why this is novel:** No RTS engine has context-aware automatic danger alerts. Players currently rely on manual minimap scanning. Smart alerts reduce the cognitive load of map awareness without automating decision-making — they tell you *that* something is happening, not *what to do about it*. This is particularly valuable for newer players who haven't developed the habit of constant minimap checking.

**Competitive consideration:** Smart alerts are a D033 QoL toggle (`alerts.smart_danger: bool`, default `true`). Tournament hosts can disable them for competitive purity. Experience profiles (D033) bundle this toggle with other QoL settings.

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

**Header extension:** The replay header (`ReplayHeader`) gains a new field:

```rust
pub struct ReplayHeader {
    // ... existing fields ...
    pub voice_offset: u32,       // 0 if no voice stream
    pub voice_length: u32,       // Compressed length of voice stream
}
```

The `flags` field gains a `HAS_VOICE` bit. Replay viewers check this flag before attempting to load voice data.

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

| Context | Available requests |
|---------|-------------------|
| **Early game** (first 3 minutes) | Build expansion, Share resources, Scout here |
| **Under air attack** | "Need AA" is highlighted / auto-suggested |
| **Ally's base under attack** | "Need backup at [ally's base]" auto-fills location |
| **Low on resources** | "Need credits" is highlighted |
| **Enemy superweapon detected** | "Destroy superweapon!" appears as a special request option |

This is lightweight context — the request wheel shows all options always, but highlights contextually relevant ones with a subtle glow. No options are hidden.

#### Integration with Existing Systems

| System | How requests integrate |
|--------|----------------------|
| **Pings (D059 §3)** | Requests are an extension of the ping system — same minimap markers, same rendering pipeline, same deterministic order stream |
| **Chat wheel (D059 §4a)** | Chat wheel is for social phrases ("gg", "gl hf"). Request wheel is for tactical coordination. Separate keys, separate radials. |
| **Tactical markers (D059 §3)** | Requests create tactical markers with a request-specific icon and auto-expire behavior |
| **D070 support requests** | In Commander & SpecOps mode, the request wheel transforms into the role-specific request wheel (§10 below). Same UX, different content. |
| **Replay** | Requests are recorded as `PlayerOrder::CoordinationRequest` in the order stream. Replays show all requests with timing and responses — reviewers can see the teamwork. |
| **MVP Awards** | "Best Wingman" award (post-game.md) tracks request responses as assist actions |

#### Mode-Aware Behavior

| Game mode | Request system behavior |
|-----------|------------------------|
| **1v1** | Request wheel disabled (no teammates) |
| **2v2, 3v3, FFA teams** | Standard request wheel with military/economy/tactical categories |
| **Co-op vs AI** | Same as team games, plus cooperative-specific requests ("Hold this lane", "I'll take left") |
| **Commander & SpecOps (D070)** | Request wheel becomes the role-specific request/response system (§10 below) with lifecycle states, support queue, and Commander approval flow |
| **Survival (D070-adjacent)** | Request wheel adds survival-specific options ("Need medkit", "Cover me", "Objective spotted") |

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
- **05-FORMATS.md (Replay Format):** Voice stream extends the replay file format with a new section. The replay header gains `voice_offset`/`voice_length` fields and a `HAS_VOICE` flag bit. Voice is independent of the order and analysis streams — tools that don't process voice ignore it.
- **06-SECURITY.md:** New `ProtocolLimits` fields for voice, ping, and drawing rate limits. Voice spoofing prevention (relay-stamped speaker ID). Voice-in-replay consent model addresses privacy requirements.
- **D010 (Snapshots) / Analysis Event Stream:** The replay analysis event stream now includes **camera position samples** (`CameraPositionSample`), **selection tracking** (`SelectionChanged`), **control group events** (`ControlGroupEvent`), **ability usage** (`AbilityUsed`), **pause events** (`PauseEvent`), and **match end events** (`MatchEnded`) — see `05-FORMATS.md` § "Analysis Event Stream" for the full enum. Camera samples are lightweight (~8 bytes per player per sample at 2 Hz = ~1 KB/min for 8 players). D059 notes this integration because voice-in-replay is most valuable when combined with camera tracking — hearing what a player said while seeing what they were looking at.
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

