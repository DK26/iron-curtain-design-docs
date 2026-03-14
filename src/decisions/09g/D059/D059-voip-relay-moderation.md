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

