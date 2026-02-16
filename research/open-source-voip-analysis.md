# Open-Source VoIP Tool Analysis for Iron Curtain

> Research document analyzing battle-tested open-source voice-over-IP implementations
> used by gamers. Findings inform D059's VoIP architecture with practical lessons on
> audio processing, protocol design, scaling, lag resistance, and audio quality.

## 1. Tools Surveyed

| Tool                 | License        | Language | Codec                     | Transport                   | Key Contribution to IC                                                                                    |
| -------------------- | -------------- | -------- | ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Mumble**           | BSD            | C++ (Qt) | Opus, CELT, Speex         | TCP (control) + UDP (voice) | Protocol design, audio pipeline, TCP fallback, OCB-AES128 encryption, positional audio plugin system      |
| **Janus Gateway**    | GPL v3         | C        | Opus (AudioBridge plugin) | WebRTC (DTLS-SRTP)          | SFU/MCU architecture, plugin system, AudioBridge mixing, scalable room management                         |
| **str0m**            | MIT/Apache-2.0 | Rust     | Opus (48kHz)              | WebRTC (DTLS-SRTP)          | Sans I/O design (matches IC architecture), `&mut self` pattern, no internal threads, bandwidth estimation |
| **ioquake3**         | GPL v2         | C        | Opus (replaced Speex)     | UDP (game connection)       | Voice-in-replay pioneering, server-stamped speaker ID, VOIP_SPATIAL flag                                  |
| **Discord**          | Proprietary    | Multiple | Opus                      | WebRTC                      | Regional voice servers, 2.5M+ concurrent voice users (scale reference)                                    |
| **TeamSpeak**        | Proprietary    | C++      | Opus (since 3.5.0)        | Proprietary UDP             | 3D sound, scalable permissions, plugin system, up to 2000 users per server                                |
| **Signal (RingRTC)** | GPL v3         | Rust/C++ | Opus                      | WebRTC (Signal Protocol)    | Group calling SFU architecture, end-to-end encryption over WebRTC                                         |

## 2. Mumble — Deep Protocol Analysis

Mumble is the most relevant reference for IC because it is fully open-source, battle-tested
for 15+ years (since 2005), designed for gaming, and has a well-documented protocol.

### 2.1 Dual-Channel Architecture

Mumble uses two channels:

1. **TCP control channel** — TLS v1.2 (AES-256-SHA). Handles authentication, channel
   management, user state, text chat, Protobuf-encoded control messages (`Mumble.proto`).
2. **UDP voice channel** — OCB-AES128 encryption. Carries audio packets with custom
   binary framing (not Protobuf). Low-latency, unreliable delivery.

**IC parallel:** IC's `MessageLane` system already mirrors this: `Orders`/`Control`/`Chat`
are reliable (control equivalent), `Voice` is unreliable (voice channel equivalent).
Mumble validates that this split is correct — control data needs reliability, voice
needs low latency.

### 2.2 Voice Packet Format

Mumble's audio packet is compact and efficient:

```
+===+===+===+===+===+===+===+===+
| 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
+---+---+---+---+---+---+---+---+
|    type   |      target       |
+-----------+-------------------+
|          Payload...           |
+-------------------------------+
```

- **Type** (3 bits): Codec selection — CELT Alpha (0), Ping (1), Speex (2), CELT Beta (3), Opus (4).
- **Target** (5 bits): Routing — Normal (0), Whisper targets (1-30), Server Loopback (31).
- **Maximum packet size:** 1020 bytes (allows 1024-byte UDP recv buffers with 4-byte crypto overhead).
- **Session ID** (varint): Only on incoming packets from server — server stamps the sender ID.
- **Sequence Number** (varint): For ordering and packet loss concealment.
- **Payload:** Codec-specific. Opus uses a single frame with varint length header + terminator bit.
- **Position Info** (optional, 3×float): XYZ positional audio coordinates at packet tail.

**Lessons for IC:**

1. **Speaker ID stamped by server** — Mumble (like ioquake3) has the server stamp the
   session ID on forwarded voice packets. IC already does this in D059
   (`forwarded.speaker = from`). This is a universal pattern.

2. **Maximum 1020 bytes per voice packet** — Mumble limits this to fit in a 1024-byte
   buffer with encryption overhead. IC's `max_voice_packet_size: 256` in ProtocolLimits
   is conservative but sufficient for 64kbps Opus. Consider increasing to 512 for future
   codec flexibility or multi-frame bundling.

3. **Varint encoding** — Mumble uses variable-length integers throughout to minimize wire
   size. IC should consider varint for `sequence` in `VoicePacket` (saves 2+ bytes vs.
   fixed u32 on every packet).

4. **Target routing in the voice packet header** — Mumble encodes the target in 5 bits
   of the first byte, supporting 30 whisper targets. IC's `VoiceTarget` enum
   (`All`/`Team`/`Player`) is equivalent but less flexible. Mumble's `VoiceTarget`
   system allows pre-registered whisper groups — a feature IC could add later.

### 2.3 Codec Negotiation and History

Mumble's codec history is instructive:

1. **Speex** (original) — Low bitrate, speech-optimized.
2. **CELT 0.7.0 / 0.11.0** — Higher quality but bitstream was never frozen (versions incompatible).
3. **Opus** (since Mumble 1.2.4, June 2013) — Replaced both. Servers can force Opus.

**Key lesson:** CELT's unfrozen bitstream caused years of compatibility headaches. IC is
correct to use only Opus (which subsumes CELT and Speex). The `audiopus` crate wraps a
stable, frozen bitstream. Do not add alternative codecs unless there is a compelling
reason (e.g., a future ultra-low-bitrate AI codec proven stable).

### 2.4 UDP Connectivity Checks and TCP Tunneling

Mumble has a **graceful fallback** mechanism:

1. Client sends UDP ping packets to server.
2. If server responds, UDP voice channel is established.
3. If UDP ping responses stop arriving, voice is **tunneled through the TCP control
   connection** using the normal TCP framing (16-bit type + 32-bit length prefix).
4. UDP pings continue in the background. If connectivity is restored, voice switches
   back to UDP.
5. The TCP-tunneled voice packets use the same binary format as UDP voice (not Protobuf).

**Critical lesson for IC:** IC's D059 currently assumes voice always flows on
`MessageLane::Voice` over UDP. But some networks block or heavily throttle UDP
(corporate firewalls, restrictive NATs). Mumble's TCP tunnel pattern should be adopted:

- IC already has a TCP/WebSocket fallback in the `Transport` trait (D054).
- When `VoiceTransport::Native` (UDP) detects voice packets are being lost at >50%,
  the client should automatically switch to tunneling voice frames through the reliable
  TCP connection (or WebSocket for browser).
- This adds latency (~20-50ms from TCP queuing) but maintains voice connectivity.
- The failover should be transparent to the user with a UI indicator ("Voice: TCP tunnel").

**Implementation note from Mumble docs:** "When implementing the protocol it is easier
to ignore the UDP transfer layer at first and just tunnel the UDP data through the TCP
tunnel. The TCP layer must be implemented for authentication in any case. Making sure
that the voice transmission works before implementing the UDP protocol simplifies
debugging greatly."

This matches IC's phased approach — TCP-tunneled voice can ship in Phase 3 (alongside
text chat), with UDP voice optimization deferred to Phase 5.

### 2.5 Encryption Model

Mumble uses **two encryption layers:**

1. **TCP channel:** TLS v1.2 with AES-256-SHA.
2. **UDP channel:** OCB-AES128 (Offset Codebook Mode with AES-128).

OCB-AES128 was chosen because:
- Single-pass authenticated encryption (encrypt + MAC in one operation)
- Very low overhead — critical for per-packet voice encryption
- Sub-microsecond per packet on modern CPUs

**IC implication:** IC's D054 specifies AES-256-GCM for the transport layer. For
per-voice-packet encryption, AES-128-GCM or AES-128-OCB would reduce overhead
slightly without meaningful security reduction (128-bit AES is beyond brute-force for
the foreseeable future). However, since IC already encrypts at the transport layer
(all lanes are encrypted), per-packet voice encryption is redundant for native builds.
For WebRTC builds, DTLS-SRTP provides the encryption layer.

**Recommendation:** Do not add a separate voice encryption layer. IC's transport-layer
encryption (D054) already covers voice packets on `MessageLane::Voice`. This is simpler
than Mumble's dual-layer approach and avoids the double-encryption overhead.

### 2.6 Audio Processing Pipeline

From Mumble's `AudioInput.h` and source architecture:

```
Microphone → Platform Backend → Resampler → Echo Canceller → 
Noise Canceller → Opus Encoder → Voice Packet → Network
```

Components:
1. **Platform audio backends:** PulseAudio (Linux), CoreAudio (macOS), WASAPI (Windows).
   Implemented as subclasses of `AudioInput`.
2. **Resampler:** Speex resampler (`speex_resampler.h`). Converts from mic sample rate
   to Opus's 48kHz.
3. **Echo cancellation:** Speex echo canceller (`speex_echo.h`). Separate mic/speaker
   paths with a `Resynchronizer` queue (5 elements, ~20ms lag) to ensure speaker data
   precedes mic data in the echo canceller. State machine controls queue fill level.
4. **Noise cancellation:** Two options:
   - **Speex preprocessor** — Traditional DSP-based.
   - **RNNoise** — ML-based noise suppression (conditional compilation: `#ifdef USE_RNNOISE`).
     RNNoise uses a recurrent neural network trained on noise samples. Significantly
     better than Speex for non-stationary noise (keyboard clicks, fans, traffic).
5. **Opus encoder:** Standard `OpusEncoder` with configurable bitrate, FEC, DTX.
6. **Frame size:** 480 samples at 48kHz = 10ms per frame. Frames are batched into
   20ms packets (matching IC's D059 default).

**Lessons for IC's `ic-audio` crate:**

1. **RNNoise is the modern standard** for noise suppression. The `nnnoiseless` Rust crate
   provides a pure-Rust port of RNNoise (no C dependency). IC should use this instead of
   Speex preprocessing. RNNoise adds negligible CPU cost (~1% of one core) and
   dramatically improves voice quality in noisy environments.

2. **Echo cancellation requires careful synchronization.** Mumble's `Resynchronizer`
   class introduces a deliberate ~20ms delay in microphone input to ensure speaker
   output data is processed first by the echo canceller. IC's `ic-audio` needs the same
   pattern if echo cancellation is supported (critical for speaker users, less important
   for headset users).

3. **The preprocessing pipeline order matters:** Resample → Echo Cancel → Noise Suppress
   → Encode. This order is standard across Mumble, WebRTC, and Discord.

4. **Platform audio backends add significant implementation cost.** Consider using the
   `cpal` Rust crate (cross-platform audio I/O) to avoid per-platform audio backend
   code. `cpal` supports WASAPI, CoreAudio, ALSA/PulseAudio, and WASM
   (`AudioWorklet`). This is the standard Rust approach (used by `rodio`, `bevy_audio`).

### 2.7 Positional Audio

Mumble's positional audio system:

- **Position data** is appended to voice packets as 3×float (XYZ coordinates).
- **Plugin system** provides position data per game. Mumble ships plugins for games
  like CS:GO, Minecraft, etc. that read the game's memory to extract player position.
- **Context** field prevents voice between users in different game contexts (e.g.,
  different servers, different maps).

**IC advantage:** IC doesn't need plugins — the engine IS the game. The spatial
audio flag (`VoiceFlags::SPATIAL`) in D059 already covers this. When enabled, the
receiver computes spatial panning from the lockstep sim state (all clients have all
positions). No position data needs to be transmitted in voice packets — this is
more bandwidth-efficient than Mumble's approach.

### 2.8 Scaling: Mumble Server Architecture

Mumble's server (Murmur/mumble-server):

- **Virtual servers:** One process serves multiple independent logical servers. Each
  virtual server has its own user database, channel tree, and ACLs.
- **UDP audio thread:** Dedicated thread in `Server.cpp` handles all voice packet
  forwarding. Separate from the TCP control thread.
- **Scalability:** "Individuals to Small and medium enterprise (25-5000 users)" per
  Wikipedia's comparison table. Practical limit is server bandwidth (one speaking user
  generates one outbound copy per listener).

**IC parallel:** IC's relay server (D007) handles a single game (2-8 players typically).
Mumble's scaling concerns (thousands of users, channel trees, ACLs) don't directly apply
to IC's per-match relay model. However, if IC adds lobby voice or community voice
channels in the future, Mumble's virtual server pattern is relevant.

## 3. Janus WebRTC Gateway — SFU Architecture

Janus is the most widely-deployed open-source WebRTC server. Key architectural lessons:

### 3.1 Plugin Architecture

Janus is a **general-purpose WebRTC server** with a plugin system:

- **Core:** Handles WebRTC negotiation (ICE, DTLS, SRTP), RTP/RTCP forwarding.
- **Plugins** provide actual functionality: VideoRoom (SFU), AudioBridge (MCU/mixer),
  Streaming, SIP gateway, etc.
- **AudioBridge plugin:** Mixes audio from multiple participants into a single stream.
  Uses Opus and libopus directly. Relevant for IC's potential spectator audio mixing.

**IC lesson:** Janus validates that voice forwarding should be a thin relay layer —
the relay forwards opaque bytes without decoding. This is what IC already does in D059
(`forward_voice` copies bytes without decoding Opus). Janus does the same as an SFU
(Selective Forwarding Unit) — it receives one RTP stream per sender and forwards copies
to each receiver without transcoding.

### 3.2 Bandwidth Estimation

Janus implements:
- **TWCC (Transport-Wide Congestion Control):** Feedback sent every 200ms by default
  (configurable via `--twcc-period`). Used by senders to adapt their bitrate.
- **NACK (Negative Acknowledgement):** For video keyframe recovery. Audio is not
  NACKed — lost audio frames are tolerated (same design as IC's D059).
- **Slowlink detection:** Configurable threshold for lost packets/sec that triggers
  a 'slowlink' event. IC should adopt this: when voice packet loss exceeds a threshold
  (e.g., 15%), emit a UI warning and trigger the `VoiceBitrateAdapter` to reduce bitrate.

### 3.3 DTLS-SRTP

Janus uses **libsrtp** (Cisco's SRTP implementation) for media encryption:
- AES-128 counter mode for encryption, HMAC-SHA1 for authentication (SRTP default).
- AES-GCM mode also supported (requires libsrtp 2.x with `--enable-openssl`).

**IC lesson:** For browser builds using str0m/WebRTC, DTLS-SRTP encryption is mandatory
and handled by the WebRTC stack. For native builds, IC's transport-layer encryption
(D054) is sufficient — no need for per-packet SRTP on top of the encrypted lane.

## 4. str0m — Rust-Native WebRTC

str0m is IC's chosen WebRTC library for browser VoIP. Key architectural details:

### 4.1 Sans I/O Design

str0m has **no internal threads, no async runtime, no I/O**. All I/O is externalized:

- `rtc.poll_output()` → returns `Timeout`, `Transmit`, or `Event`
- `rtc.handle_input(Input::Receive(...))` or `Input::Timeout(...)`
- User manages the socket, the event loop, and time progression

**This is a perfect match for IC's architecture.** Both `ic-sim` (deterministic, no I/O)
and `ic-net` (pluggable transport) follow the same pattern. str0m can be driven from
IC's existing game loop without introducing separate threads for VoIP.

### 4.2 Frame-Level API

str0m provides both RTP-level and frame-level APIs:

- **Frame API (default):** `Event::MediaData` delivers complete decoded frames.
  `Writer::write` sends complete frames. RTP packetization is internal.
- **RTP API:** `Event::RtpPacket` / `StreamTx::write_rtp` for raw RTP packets.
  Needed for SFU forwarding without decode.

**IC should use the Frame API** for browser VoIP — it's simpler and hides RTP
complexity. The relay bridges between native voice packets and str0m frames.

### 4.3 Bandwidth Estimation

str0m implements **TWCC-based bandwidth estimation (BWE)**:
- No internal clock — time is an external input (`now` argument on all calls).
- BWE can be used to dynamically adjust Opus bitrate for browser clients.
- Combined with IC's `VoiceBitrateAdapter`, this provides end-to-end adaptive bitrate
  for the browser→relay→native path.

### 4.4 Missing Features (IC Must Provide)

str0m explicitly does NOT provide:
- ❌ Adaptive jitter buffer (IC must implement)
- ❌ Audio capture/render (use `cpal`)
- ❌ Audio encode/decode (use `audiopus`)
- ❌ TURN server (use external TURN or relay)
- ❌ Network interface enumeration (IC handles via platform abstraction)

**Jitter buffer implication:** IC needs its own adaptive jitter buffer for VoIP playback.
This is a critical component — see § 6 below.

## 5. Cross-Tool Comparison: Codec Parameters

All surveyed tools converged on similar Opus parameters:

| Parameter        | Mumble              | Discord         | TeamSpeak | ioquake3          | IC (D059)   | Recommendation       |
| ---------------- | ------------------- | --------------- | --------- | ----------------- | ----------- | -------------------- |
| Sample rate      | 48 kHz              | 48 kHz          | 48 kHz    | 48 kHz            | 48 kHz      | ✓ Consensus          |
| Channels         | Mono                | Mono (voice)    | Mono      | Mono              | Mono        | ✓ Consensus          |
| Frame size       | 10 ms*              | 20 ms           | 20 ms     | 20 ms (60 ms max) | 20 ms       | ✓ 20ms is optimal    |
| Default bitrate  | 40-72 kbps          | 64 kbps (Nitro) | ~48 kbps  | 24 kbps           | 24 kbps     | **Consider 32 kbps** |
| Application      | VOIP                | VOIP            | VOIP      | VOIP              | VOIP        | ✓ Consensus          |
| FEC              | Enabled             | Enabled         | Unknown   | Enabled           | Enabled     | ✓ Consensus          |
| DTX              | Enabled             | Enabled         | Unknown   | Enabled           | Enabled     | ✓ Consensus          |
| Complexity       | 10 (Mumble default) | Unknown         | Unknown   | 5                 | 5           | Consider 7           |
| Packet loss hint | Dynamic             | Dynamic         | Unknown   | 10% static        | 10% default | **Make dynamic**     |

*Mumble uses 10ms internal frames, but packets can contain multiple frames.

**Key recommendations from cross-tool comparison:**

1. **Default bitrate: increase to 32 kbps.** IC's 24 kbps is functionally fine, but
   Discord (64 kbps) and Mumble (40-72 kbps) use higher defaults because modern
   bandwidth is cheap. 32 kbps provides "very good" quality with negligible additional
   cost (~1 KB/s more per speaker). Voice quality is noticeable at this level. Reserve
   24 kbps as the adaptive minimum under mild congestion, and 8 kbps as emergency minimum.

2. **Opus complexity: increase to 7.** Every major VoIP tool uses complexity 7-10.
   Complexity 5 saves negligible CPU (Opus encoding at complexity 10 uses <1% of a
   single core). Higher complexity improves quality at the same bitrate, especially
   for consonant sounds and mixed voice+noise. Recommend complexity 7 as default with
   a cvar to adjust.

3. **Make packet loss hint dynamic.** Mumble and Discord dynamically update the
   `OPUS_SET_PACKET_LOSS_PERC` hint based on observed loss. IC should feed the
   `VoiceBitrateAdapter`'s `loss_ratio` directly to the Opus encoder's packet loss hint.
   This allows Opus's internal FEC to optimize for the actual network conditions.

## 6. Jitter Buffer Design — Critical Missing Component

D059 does not specify a jitter buffer. Every surveyed tool uses one. This is the single
most important addition from this research.

### 6.1 What a Jitter Buffer Does

Voice packets arrive with variable delay (jitter). Without a jitter buffer:
- Packets arriving late are played immediately, causing audio stuttering.
- Packets arriving early have no buffer, causing gaps.

A jitter buffer introduces a small, managed delay to smooth out arrival times:

```
Arrival:    |..P1....P2.P3......P4..P5.P6|
Buffer:     [     delay      ]
Playback:   |P1  P2  P3  P4  P5  P6|
```

### 6.2 Fixed vs. Adaptive Jitter Buffer

**Fixed jitter buffer:** Constant delay (e.g., 60ms). Simple but wastes latency on
good networks and is insufficient on bad networks.

**Adaptive jitter buffer:** Dynamically adjusts delay based on observed jitter:
- Measures inter-arrival time variance.
- When jitter increases → expands buffer (adds latency, reduces drops).
- When jitter decreases → shrinks buffer (reduces latency).
- Typical range: 20-200ms.

**Recommendation:** IC should implement an **adaptive jitter buffer** with:
- Minimum delay: 20ms (one Opus frame).
- Maximum delay: 200ms (above this, voice is too delayed to be useful).
- Target: 95th percentile of inter-arrival jitter + one frame (20ms).
- Adaptation rate: slow increase (protect against drops), fast decrease (minimize latency).

### 6.3 Proposed Jitter Buffer Design for IC

```rust
/// Adaptive jitter buffer for voice playback.
/// Smooths variable packet arrival times into consistent playback.
/// Runs per-speaker in ic-audio.
pub struct JitterBuffer {
    /// Ring buffer of received voice frames, indexed by sequence number.
    frames: VecDeque<Option<VoiceFrame>>,
    /// Current playback delay in 20ms frame units.
    /// E.g., delay=3 means 60ms of buffered audio before playback.
    delay: u32,
    /// Minimum delay (frames). Default: 1 (20ms).
    min_delay: u32,
    /// Maximum delay (frames). Default: 10 (200ms).
    max_delay: u32,
    /// Exponentially weighted moving average of inter-arrival jitter.
    jitter_estimate: f32,   // f32 OK — this is I/O, not sim
    /// Timestamp of last received frame for jitter calculation.
    last_arrival: Instant,
    /// Statistics: total frames received, lost, late.
    stats: JitterStats,
}

impl JitterBuffer {
    /// Called when a voice packet arrives from the network.
    pub fn push(&mut self, sequence: u32, opus_data: &[u8], now: Instant) {
        // Update jitter estimate
        let arrival_delta = now - self.last_arrival;
        let expected_delta = Duration::from_millis(20); // one frame period
        let jitter = (arrival_delta.as_secs_f32() - expected_delta.as_secs_f32()).abs();
        self.jitter_estimate = 0.9 * self.jitter_estimate + 0.1 * jitter;
        self.last_arrival = now;
        
        // Insert frame at correct position based on sequence number
        // Handle out-of-order delivery
        self.insert_frame(sequence, opus_data);
        
        // Adapt buffer depth
        self.adapt_delay();
    }
    
    /// Called every 20ms by the audio render thread.
    /// Returns the next frame to play, or None if the buffer is empty.
    pub fn pop(&mut self) -> Option<VoiceFrame> {
        // If frame is missing (packet loss), return None.
        // Caller should invoke Opus PLC (packet loss concealment).
        self.frames.pop_front().flatten()
    }
    
    fn adapt_delay(&mut self) {
        // Target delay = 2 * jitter_estimate + 1 frame
        // (covers ~95% of jitter variance)
        let target = ((2.0 * self.jitter_estimate * 50.0) as u32 + 1)
            .clamp(self.min_delay, self.max_delay);
        
        if target > self.delay {
            // Increase delay: add one frame immediately (insert silence)
            self.delay += 1;
        } else if target + 2 < self.delay {
            // Decrease delay: only when significantly over-buffered
            // (hysteresis prevents oscillation)
            self.delay -= 1;
        }
    }
}
```

### 6.4 Packet Loss Concealment Integration

When the jitter buffer `pop()` returns `None` (missing frame), the Opus decoder
should be called with `decode(null, frame_size)` to generate PLC audio. Opus's
built-in PLC:
- Extrapolates from the previous frame's spectral envelope.
- Produces smooth fade-out over 3-5 lost frames.
- At 5% packet loss, PLC is barely audible.
- At 15% loss, PLC artifacts become noticeable — this is where bitrate reduction +
  FEC kicks in.

## 7. TCP Fallback for Voice — Lesson from Mumble

D059 currently assumes voice always uses UDP. Mumble's TCP tunneling teaches us this
is insufficient for real-world networks.

### 7.1 When UDP Fails

Common scenarios where UDP voice fails:
- Corporate firewalls blocking outbound UDP.
- Symmetric NAT preventing UDP hole-punching.
- Aggressive rate limiting on UDP by ISPs.
- WiFi networks with high UDP packet loss.

### 7.2 Recommended Fallback Strategy

```
1. Attempt UDP voice delivery (default).
2. Monitor round-trip connectivity via voice ping packets (like Mumble).
3. If no voice ping response in 5 seconds, switch to TCP tunnel mode:
   - Voice frames are sent on the TCP/WebSocket connection as a distinct
     message type (still using VoicePacket binary format).
   - The relay identifies tunneled voice and forwards normally.
4. Continue UDP pings in background.
5. If UDP connectivity is restored (3 consecutive ping responses), 
   switch back to UDP.
6. UI indicator: "Voice: Direct" (UDP) or "Voice: Tunneled" (TCP).
```

**Implementation note:** This can be implemented as a `VoiceTransport` state machine:

```rust
pub enum VoiceTransportState {
    /// UDP voice active, UDP pings succeeding.
    UdpActive,
    /// UDP pings failing, testing connectivity.
    /// Voice tunneled through TCP during this state.
    UdpProbing { last_ping: Instant, consecutive_failures: u8 },
    /// UDP confirmed unavailable. Voice fully tunneled through TCP.
    TcpTunnel,
    /// UDP restored, transitioning back.
    UdpRestoring { consecutive_successes: u8 },
}
```

## 8. Audio Preprocessing Pipeline — Best Practices

Synthesized from Mumble, Discord engineering presentations, and WebRTC documentation:

### 8.1 Recommended Pipeline for IC

```
Platform Input (cpal) → Resample to 48kHz →
  Echo Cancellation (optional, for speaker users) →
    Noise Suppression (RNNoise / nnnoiseless) →
      Voice Activity Detection (for VAD mode) →
        Opus Encode (VOIP application, FEC, DTX) →
          VoicePacket → MessageLane::Voice
```

### 8.2 Component Recommendations

| Component      | Recommended Implementation | Fallback             | Notes                                                                      |
| -------------- | -------------------------- | -------------------- | -------------------------------------------------------------------------- |
| Audio I/O      | `cpal` crate               | Native platform APIs | Cross-platform, WASM support via AudioWorklet                              |
| Resampler      | `rubato` crate             | Speex resampler (C)  | Pure Rust, high quality, no C dependency                                   |
| Echo Cancel    | WebRTC AEC (via browser)   | Speex AEC            | Full AEC only matters for speaker users; headset users don't need it       |
| Noise Suppress | `nnnoiseless` crate        | None (raw Opus)      | Pure Rust port of RNNoise; dramatically improves quality                   |
| VAD            | Opus internal DTX          | `webrtc-vad` crate   | DTX naturally handles silence detection; explicit VAD only for VAD mode UI |
| Codec          | `audiopus` crate           | —                    | Required. Safe Rust wrapper around libopus                                 |

### 8.3 Noise Suppression: RNNoise vs. Speex

Mumble supports both. RNNoise is categorically superior:

| Metric                                | Speex Preprocessor               | RNNoise                        |
| ------------------------------------- | -------------------------------- | ------------------------------ |
| Architecture                          | DSP (FFT + spectral subtraction) | Recurrent Neural Network (GRU) |
| Stationary noise (fan, hum)           | Good                             | Excellent                      |
| Non-stationary noise (typing, clicks) | Poor                             | Excellent                      |
| Voice quality preservation            | Good                             | Excellent                      |
| CPU cost (per frame, single core)     | ~0.1%                            | ~0.3%                          |
| Training data                         | None (DSP rules)                 | 80+ hours noise + speech       |
| Rust availability                     | `speexdsp` (C bindings)          | `nnnoiseless` (pure Rust)      |

**Recommendation:** Use `nnnoiseless` as default noise suppression with a D033 toggle
to disable. The ~0.3% CPU cost is negligible and the quality improvement is dramatic.

## 9. Scaling Analysis

### 9.1 Voice Bandwidth at Scale

| Players            | Simultaneous Speakers | Per-Speaker Cost (32kbps) | Relay Outbound | Notes                     |
| ------------------ | --------------------- | ------------------------- | -------------- | ------------------------- |
| 2 (1v1)            | 1                     | 5.2 KB/s                  | 5.2 KB/s       | Negligible                |
| 4 (2v2)            | 2                     | 5.2 KB/s each             | 31.2 KB/s      | 2 speakers × 3 listeners  |
| 8 (4v4)            | 3                     | 5.2 KB/s each             | 109.2 KB/s     | 3 speakers × 7 listeners  |
| 16 (observer mode) | 4                     | 5.2 KB/s each             | 312.0 KB/s     | 4 speakers × 15 listeners |

At 32 kbps with overhead: ~5.2 KB/s per speaker per listener.
The relay's voice forwarding cost scales as `speakers × (total_clients - 1) × per_packet_size`.

**Conclusion:** Voice bandwidth is negligible for IC's use case (2-8 player games).
Even a 16-player observer scenario uses only 312 KB/s — well within any modern
server's capacity. No special scaling infrastructure is needed.

### 9.2 Discord's Scaling Reference

Discord handles 2.5M+ concurrent voice users across regional voice servers:
- Voice servers are geographically distributed.
- Each voice server handles ~100-150 channels.
- Uses WebRTC (Opus, DTLS-SRTP).
- SFU model (no server-side mixing — each client receives individual streams and mixes locally).

**IC parallel:** IC's relay server (D007) is the voice server. Since IC games have 2-8
players, a single relay easily handles the voice load. No regional voice server
infrastructure is needed at IC's scale. If IC later adds large lobby voice (>50 users),
Mumble's virtual server model or Janus's AudioBridge (server-side mixing) would be more
appropriate than SFU for that scenario.

## 10. Security Patterns Across Tools

| Security Measure        | Mumble                           | Janus                             | ioquake3                     | IC (D059)                    | Status                    |
| ----------------------- | -------------------------------- | --------------------------------- | ---------------------------- | ---------------------------- | ------------------------- |
| Transport encryption    | TLS + OCB-AES128                 | DTLS-SRTP (AES-128-CM or AES-GCM) | None (plaintext UDP)         | D054 transport encryption    | ✓                         |
| Speaker ID verification | Server-stamped session ID        | WebRTC identity                   | Server-stamped client number | Relay-stamped PlayerId       | ✓                         |
| Voice rate limiting     | Not explicit (bandwidth-limited) | Not explicit                      | Not explicit                 | 50 packets/sec per player    | ✓ Ahead of surveyed tools |
| Mute enforcement        | ACLs per channel                 | Room-level                        | Per-client                   | Relay-enforced + client-side | ✓                         |
| Voice recording consent | Not applicable (no replay)       | Plugin-dependent                  | Always recorded in demos     | Opt-in per player            | ✓ Best-in-class           |
| Positional data privacy | Position in packet (leaks info)  | N/A                               | No position data             | Computed locally (no leak)   | ✓ Superior                |

**IC's voice security posture is already strong.** The main gap (addressed above) is
TCP fallback for networks that block UDP.

## 11. Recommendations Summary — Changes for D059

Based on this research, the following specific changes are recommended for D059:

### Must-Have (Phase 3)

1. **Add jitter buffer specification.** D059 lacks any mention of a jitter buffer.
   This is critical for audio quality — without it, voice will stutter on any network
   with >5ms jitter variance. See § 6 for proposed design.

2. **Add TCP tunnel fallback.** Specify that voice falls back to TCP/WebSocket tunneling
   when UDP connectivity fails. See § 7 for the state machine design.

3. **Add audio preprocessing pipeline.** Specify `nnnoiseless` (RNNoise) for noise
   suppression and `cpal` for cross-platform audio I/O. See § 8 for the pipeline.

### Should-Have (Phase 5)

4. **Increase default bitrate to 32 kbps.** Negligible bandwidth cost, noticeable
   quality improvement. Keep 24 kbps as mild-congestion target and 8 kbps as emergency.

5. **Increase Opus complexity to 7.** Sub-percent CPU cost, better consonant clarity.

6. **Make Opus packet loss hint dynamic.** Feed observed `loss_ratio` from ack vectors
   to `OPUS_SET_PACKET_LOSS_PERC`.

### Nice-to-Have (Phase 6+)

7. **Voice whisper groups.** Mumble's VoiceTarget system allows pre-registered whisper
   groups (up to 30 targets). IC could use this for asymmetric team games, coaching
   scenarios, or tournament observer groups.

8. **Server-side mixing for spectator voice.** If IC adds large observer voice channels
   (>16 spectators), consider Janus AudioBridge-style server-side mixing to reduce
   downstream bandwidth (one mixed stream vs. N individual streams).

## References

- Mumble Protocol Documentation: https://github.com/mumble-voip/mumble/tree/master/docs/dev/network-protocol
- Mumble Source Code Architecture: https://github.com/mumble-voip/mumble/blob/master/docs/dev/TheMumbleSourceCode.md
- Janus WebRTC Gateway: https://github.com/meetecho/janus-gateway
- str0m Rust WebRTC: https://github.com/algesten/str0m
- ioquake3 VoIP: https://github.com/ioquake/ioq3 (cl_voip.c, sv_client.c)
- nnnoiseless (Rust RNNoise): https://crates.io/crates/nnnoiseless
- audiopus (Rust Opus): https://crates.io/crates/audiopus
- cpal (Rust audio I/O): https://crates.io/crates/cpal
- rubato (Rust resampler): https://crates.io/crates/rubato
- Opus Codec: https://opus-codec.org/
- Wikipedia VoIP Software Comparison: https://en.wikipedia.org/wiki/Comparison_of_VoIP_software
