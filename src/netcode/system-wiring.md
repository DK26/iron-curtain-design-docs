# System Wiring: Integration Proof

This section proves that all netcode components defined above wire together into a coherent system. Every type referenced below is either defined earlier in this chapter, in a cross-referenced file, or newly introduced here to fill an explicit gap.

**Existing types referenced (not redefined):**

| Type                                                        | Defined In                                             | Crate         |
| ----------------------------------------------------------- | ------------------------------------------------------ | ------------- |
| `PlayerOrder`, `TimestampedOrder`, `TickOrders`, `PlayerId` | This chapter § "The Protocol"                          | `ic-protocol` |
| `NetworkModel` trait                                        | This chapter § "The NetworkModel Trait"                | `ic-net`      |
| `RelayCore`                                                 | This chapter § "RelayCore: Library, Not Just a Binary" | `ic-net`      |
| `ClientMetrics`                                             | This chapter § "Adaptive Run-Ahead"                    | `ic-net`      |
| `TimingFeedback`                                            | This chapter § "Input Timing Feedback"                 | `ic-net`      |
| `MatchCalibration`, `PlayerCalibration`, `MatchQosProfile`  | This chapter § "Match-Start Calibration"               | `ic-net`      |
| `QosAdjustmentEvent`                                        | This chapter § "QoS Audit Trail"                       | `ic-net`      |
| `ClockCalibration`                                          | `research/relay-wire-protocol-design.md`               | `ic-net`      |
| `TransportCrypto`                                           | This chapter § "Transport Encryption"                  | `ic-net`      |
| `OrderBatcher`                                              | This chapter § "Order Batching"                        | `ic-net`      |
| `AckVector`                                                 | This chapter § "Selective Acknowledgment"              | `ic-net`      |
| `DesyncDebugLevel`                                          | This chapter § "Desync Debugging"                      | `ic-net`      |
| `Transport` trait                                           | `decisions/09d/D054-extended-switchability.md`         | `ic-net`      |
| `RelayLockstepNetwork<T>` (struct header)                   | `decisions/09d/D054-extended-switchability.md`         | `ic-net`      |
| `GameLoop<N, I>` (struct + `frame()`)                       | `architecture/game-loop.md`                            | `ic-game`     |
| `ReadyCheckState`, `MatchOutcome`                           | `netcode/match-lifecycle.md`                           | `ic-net`      |

### ClientMetrics / PlayerMetrics Resolution

`ClientMetrics` (defined above in § "Adaptive Run-Ahead") is the client-submitted report — it carries what the client knows about its own performance. The relay combines this with relay-observed timing data to produce `PlayerMetrics`, which is what `compute_run_ahead()` and QoS adaptation operate on:

```rust
/// Relay-side per-player metrics — combines client-reported ClientMetrics
/// with relay-observed timing data. Lives in ic-net (relay_core module).
/// compute_run_ahead() and evaluate_qos_window() operate on this.
pub struct PlayerMetrics {
    // From ClientMetrics (client-reported):
    pub avg_latency_us: u32,
    pub avg_fps: u16,
    pub arrival_cushion: i16,
    pub tick_processing_us: u32,
    // Relay-observed (not client-reported):
    pub jitter_us: u32,                // computed from arrival time variance
    pub late_count_window: u16,        // late orders in current QoS window
    pub ewma_late_rate_bps: u16,       // EWMA-smoothed late rate (basis points)
}

impl PlayerMetrics {
    /// Merge a fresh ClientMetrics report into this relay-side aggregate.
    fn update_from_client(&mut self, cm: &ClientMetrics) {
        self.avg_latency_us = cm.avg_latency_us;
        self.avg_fps = cm.avg_fps;
        self.arrival_cushion = cm.arrival_cushion;
        self.tick_processing_us = cm.tick_processing_us;
    }
}
```

### CalibrationPing / CalibrationPong

These lightweight packet types are exchanged during the loading screen (§ "Match-Start Calibration" steps 1–2). 15–20 round trips over ~2 seconds, in parallel with map loading:

```rust
/// Sent by relay during loading screen. Lightweight timing probe.
pub struct CalibrationPing {
    pub seq: u16,                // sequence number (0..19)
    pub relay_send_us: u64,      // relay wall-clock at send (microseconds)
}

/// Client response. Echoes relay timestamp, adds client-side timing.
pub struct CalibrationPong {
    pub seq: u16,                // echoed from ping
    pub relay_send_us: u64,      // echoed from ping
    pub client_recv_us: u64,     // client wall-clock at receive
    pub client_send_us: u64,     // client wall-clock at send (captures processing delay)
}
```

The relay derives `median_rtt_us`, `jitter_us`, and `estimated_one_way_us` per player from these samples, then feeds them into `MatchCalibration` (§ "Match-Start Calibration" step 3).

### EncryptedTransport\<T\>: Transport Encryption Wrapper

`TransportCrypto` (defined in § "Transport Encryption") wraps any `Transport` implementation (D054), sitting between Transport and NetworkModel as described in the prose:

```rust
/// Encryption layer between Transport and NetworkModel.
/// Wraps any Transport, encrypting outbound and decrypting inbound.
/// MemoryTransport (testing) and LocalNetwork (single-player) skip this.
pub struct EncryptedTransport<T: Transport> {
    inner: T,
    crypto: TransportCrypto,  // defined in § "Transport Encryption"
}

impl<T: Transport> Transport for EncryptedTransport<T> {
    fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        let ciphertext = self.crypto.encrypt(data)?;  // AES-256-GCM
        self.inner.send(&ciphertext)
    }

    fn recv(&mut self, buf: &mut [u8]) -> Result<Option<usize>, TransportError> {
        let mut cipher_buf = [0u8; MAX_PACKET_SIZE];
        match self.inner.recv(&mut cipher_buf)? {
            None => Ok(None),
            Some(len) => {
                let plaintext = self.crypto.decrypt(&cipher_buf[..len])?;
                buf[..plaintext.len()].copy_from_slice(&plaintext);
                Ok(Some(plaintext.len()))
            }
        }
    }

    fn max_payload(&self) -> usize {
        self.inner.max_payload() - AEAD_OVERHEAD  // 16-byte tag
    }

    fn connect(&mut self, target: &Endpoint) -> Result<(), TransportError> {
        self.inner.connect(target)?;
        // X25519 key exchange → derive AES-256-GCM session key
        // Ed25519 identity binding (D052) signs handshake transcript
        self.crypto = TransportCrypto::negotiate(&mut self.inner)?;
        Ok(())
    }

    fn disconnect(&mut self) { self.inner.disconnect(); }
}
```

### RelayLockstepNetwork\<T\>: NetworkModel Implementation

The struct header is defined in D054. Here are the method bodies proving `NetworkModel` integration with `Transport`, the order batcher, frame decoding, and timing feedback:

```rust
/// Full fields for the client-side relay connection.
/// Struct header is in D054; fields shown here for integration clarity.
pub struct RelayLockstepNetwork<T: Transport> {
    transport: T,
    codec: NativeCodec,                          // OrderCodec impl (§ "Wire Format")
    batcher: OrderBatcher,                       // § "Order Batching"
    reliability: AckVector,                      // processed at packet header level (wire-format.md), not as Frame
    session_auth: ClientSessionAuth,                   // per-session Ed25519 signing (vulns-protocol.md V16)
    inbound_ticks: VecDeque<TickOrders>,         // confirmed ticks from relay
    submit_offset_us: i32,                       // adjusted by TimingFeedback
    status: NetworkStatus,
    diagnostics: NetworkDiagnostics,
    // Desync debug: if the relay requests a debug report, store the request
    // so the game loop can collect sim state and respond.
    pending_desync_request: Option<(SimTick, DesyncDebugLevel)>,
    // Post-game frame storage (consumed by run_post_game, not by poll_tick caller):
    pending_credentials: Vec<SignedCredentialRecord>,
    chat_inbox: VecDeque<ChatNotification>,
}

impl<T: Transport> NetworkModel for RelayLockstepNetwork<T> {
    fn submit_order(&mut self, order: TimestampedOrder) {
        // Apply timing feedback offset to submission time.
        // submit_offset_us is adjusted by apply_timing_feedback() based on
        // relay-reported arrival timing. A negative offset shifts submission
        // earlier (orders were arriving late); a positive offset relaxes it.
        let adjusted_sub_tick = (order.sub_tick_time as i32 + self.submit_offset_us)
            .max(0) as u32;
        let adjusted = TimestampedOrder {
            sub_tick_time: adjusted_sub_tick,  // hint only — relay normalizes
            ..order
        };
        // Sign with per-session ephemeral Ed25519 key (V16 defense-in-depth).
        // AuthenticatedOrder wraps TimestampedOrder + signature at the
        // transport layer (ic-net), not in ic-protocol.
        let authenticated = self.session_auth.sign_order(&adjusted);
        self.batcher.push(authenticated);
    }

    fn poll_tick(&mut self) -> Option<TickOrders> {
        // 1. Flush batched outbound orders
        if self.batcher.should_flush() {
            let batch = self.batcher.drain();
            let encoded = self.codec.encode_frame(&Frame::OrderBatch(batch));
            self.transport.send(&encoded).ok();
        }

        // 2. Receive from transport (non-blocking)
        let mut buf = [0u8; MAX_PACKET_SIZE];
        while let Ok(Some(len)) = self.transport.recv(&mut buf) {
            let frame = match self.codec.decode_frame(&buf[..len]) {
                Ok(f) => f,
                Err(_) => continue, // skip malformed frames (vulns-protocol.md)
            };
            match frame {
                Frame::TickOrders(tick_orders) => {
                    self.inbound_ticks.push_back(tick_orders);
                }
                Frame::TimingFeedback(fb) => {
                    self.apply_timing_feedback(fb);
                }
                Frame::DesyncDetected { tick } => {
                    self.status = NetworkStatus::DesyncDetected(tick);
                }
                Frame::DesyncDebugRequest { tick, level } => {
                    // Relay requests desync debug data (desync-recovery.md §
                    // Desync Log Transfer Protocol). Store the request; the
                    // game loop collects sim state via take_desync_request()
                    // and responds with send_desync_report().
                    self.pending_desync_request = Some((tick, level));
                }
                Frame::MatchEnd(outcome) => {
                    self.status = NetworkStatus::MatchCompleted(outcome);
                }
                Frame::CertifiedMatchResult(result) => {
                    // Relay sends this after MatchEnd with Ed25519-signed certificate.
                    // Transitions MatchCompleted → PostGame, preserving the full
                    // certificate (hashes, players, duration, signature) for stats
                    // display and ranked result submission.
                    self.status = NetworkStatus::PostGame(result);
                }
                Frame::RatingUpdate(scrs) => {
                    // Community-server-signed SCRs delivered during post-game.
                    // Typically: rating SCR + match record SCR (D052).
                    self.pending_credentials.extend(scrs);
                }
                Frame::ChatNotification(msg) => {
                    // Post-game / lobby chat, system messages, player status.
                    self.chat_inbox.push_back(msg);
                }
                _ => {}
            }
        }

        // 3. Return next confirmed tick
        self.inbound_ticks.pop_front()
    }

    fn report_sync_hash(&mut self, tick: SimTick, hash: SyncHash) {
        let encoded = self.codec.encode_frame(&Frame::SyncHash { tick, hash });
        self.transport.send(&encoded).ok();
    }

    fn report_state_hash(&mut self, tick: SimTick, hash: StateHash) {
        let encoded = self.codec.encode_frame(&Frame::StateHash { tick, hash });
        self.transport.send(&encoded).ok();
    }

    fn status(&self) -> NetworkStatus { self.status.clone() }
    fn diagnostics(&self) -> NetworkDiagnostics { self.diagnostics.clone() }
}

/// Relay-specific accessors — not part of the NetworkModel trait.
/// LocalNetwork and ReplayPlayback never produce these frames.
impl<T: Transport> RelayLockstepNetwork<T> {
    /// Take all pending credential records (rating SCR + match record SCR).
    pub fn take_credentials(&mut self) -> Vec<SignedCredentialRecord> {
        std::mem::take(&mut self.pending_credentials)
    }
    /// Drain all pending chat/system notifications since last call.
    pub fn drain_chat(&mut self) -> impl Iterator<Item = ChatNotification> + '_ {
        self.chat_inbox.drain(..)
    }
    /// Take a pending desync debug request, if the relay sent one.
    /// The game loop calls this after poll_tick(), collects the requested
    /// sim state (desync-recovery.md § DesyncDebugReport), and responds
    /// via send_desync_report().
    pub fn take_desync_request(&mut self) -> Option<(SimTick, DesyncDebugLevel)> {
        self.pending_desync_request.take()
    }
    /// Send a desync debug report back to the relay.
    pub fn send_desync_report(&mut self, report: DesyncDebugReport) {
        let encoded = self.codec.encode_frame(&Frame::DesyncDebugReport(report));
        self.transport.send(&encoded).ok();
    }
    /// Send out-of-band chat (post-game/lobby). In-match chat flows as
    /// PlayerOrder::ChatMessage through submit_order() — see D059.
    pub fn send_chat(&mut self, msg: ChatNotification) {
        let encoded = self.codec.encode_frame(&Frame::ChatNotification(msg));
        self.transport.send(&encoded).ok();
    }
}

impl<T: Transport> RelayLockstepNetwork<T> {
    /// Adjust local order submission timing based on relay feedback.
    fn apply_timing_feedback(&mut self, fb: TimingFeedback) {
        if fb.late_count > 0 {
            // Orders arriving late — shift submission earlier
            self.submit_offset_us -= fb.recommended_offset_us.min(5_000);
        } else if fb.early_us > 20_000 {
            // Orders arriving very early — relax by 1ms
            self.submit_offset_us += 1_000;
        }
        self.diagnostics.last_timing_feedback = Some(fb);
    }
}
```

### RelayCore: Accepting Calibration and Seeding State

Shows `MatchCalibration` (§ "Match-Start Calibration") entering `RelayCore`, proving the calibration → relay wiring:

```rust
impl RelayCore {
    /// Called after calibration handshake completes, before tick 0.
    /// Seeds all adaptive algorithms with match-specific measurements
    /// instead of generic defaults.
    pub fn apply_calibration(&mut self, cal: MatchCalibration) {
        // Seed per-player clock calibration from CalibrationPing/Pong results
        for pc in &cal.per_player {
            self.clock_calibration.insert(pc.player, ClockCalibration {
                offset_us: pc.estimated_one_way_us as i64,
                ewma_offset_us: pc.estimated_one_way_us as i64,
                jitter_us: pc.jitter_us,
                sample_count: 0,
                last_update_us: 0,
                suspicious_count: 0,
            });
            // Seed per-player submit offset (timing assist, not fairness)
            self.player_metrics.insert(pc.player, PlayerMetrics {
                avg_latency_us: pc.median_rtt_us / 2,
                jitter_us: pc.jitter_us,
                ..Default::default()
            });
        }

        // Set match-global timing from calibration envelope
        self.run_ahead = cal.shared_initial_run_ahead;
        self.tick_deadline_us = cal.initial_tick_deadline_us;
        self.qos_profile = cal.qos_profile;

        // Initialize QoS adaptation state
        self.qos_state = QosAdaptationState::default();
    }
}
```

### QoS Adaptation: State and Per-Window Evaluation

Who holds the EWMA state and what triggers the adaptation loop:

```rust
/// Held by RelayCore. Updated every timing_feedback_interval ticks (default 30).
pub struct QosAdaptationState {
    pub ewma_late_rate_bps: u16,       // EWMA-smoothed late rate (basis points)
    pub consecutive_raise_windows: u8,  // windows above raise threshold
    pub consecutive_lower_windows: u8,  // windows below lower threshold
    pub cooldown_remaining: u8,         // windows until next adjustment allowed
}

impl RelayCore {
    /// Called every timing_feedback_interval ticks.
    /// Evaluates whether to adjust match-global run-ahead / tick deadline.
    /// Returns a QosAdjustmentEvent if an adjustment was made (for replay + telemetry).
    fn evaluate_qos_window(&mut self) -> Option<QosAdjustmentEvent> {
        let qp = &self.qos_profile;

        // 1. Compute raw late rate across all players this window
        let raw_late_bps = if self.window_total_orders > 0 {
            ((self.window_total_late as u32) * 10_000
                / (self.window_total_orders as u32)) as u16
        } else { 0 };

        // 2. EWMA smooth (fixed-point: alpha = ewma_alpha_q15 / 32768)
        let alpha = qp.ewma_alpha_q15 as u32;
        let qs = &mut self.qos_state;
        qs.ewma_late_rate_bps = ((alpha * raw_late_bps as u32
            + (32768 - alpha) * qs.ewma_late_rate_bps as u32) / 32768) as u16;

        // 3. Cooldown check
        if qs.cooldown_remaining > 0 {
            qs.cooldown_remaining -= 1;
            self.reset_window_counters();
            return None;
        }

        let old_deadline = self.tick_deadline_us;
        let old_run_ahead = self.run_ahead;

        // 4. Raise check: EWMA above threshold for N consecutive windows
        if qs.ewma_late_rate_bps > qp.raise_late_rate_bps {
            qs.consecutive_raise_windows += 1;
            qs.consecutive_lower_windows = 0;
            if qs.consecutive_raise_windows >= qp.raise_windows {
                self.tick_deadline_us = (self.tick_deadline_us + 10_000)
                    .min(qp.deadline_max_us);
                self.run_ahead = (self.run_ahead + 1)
                    .min(qp.run_ahead_max_ticks);
                qs.cooldown_remaining = qp.cooldown_windows;
                qs.consecutive_raise_windows = 0;
            }
        }
        // 5. Lower check: EWMA below threshold for N consecutive windows
        else if qs.ewma_late_rate_bps < qp.lower_late_rate_bps {
            qs.consecutive_lower_windows += 1;
            qs.consecutive_raise_windows = 0;
            if qs.consecutive_lower_windows >= qp.lower_windows {
                self.tick_deadline_us = (self.tick_deadline_us - 5_000)
                    .max(qp.deadline_min_us);
                self.run_ahead = (self.run_ahead - 1)
                    .max(qp.run_ahead_min_ticks);
                qs.cooldown_remaining = qp.cooldown_windows;
                qs.consecutive_lower_windows = 0;
            }
        } else {
            qs.consecutive_raise_windows = 0;
            qs.consecutive_lower_windows = 0;
        }

        self.reset_window_counters();

        // 6. Emit event if anything changed
        if self.tick_deadline_us != old_deadline || self.run_ahead != old_run_ahead {
            Some(QosAdjustmentEvent {
                tick: self.tick,
                old_deadline_us: old_deadline,
                new_deadline_us: self.tick_deadline_us,
                old_run_ahead,
                new_run_ahead: self.run_ahead,
                late_rate_bps_ewma: qs.ewma_late_rate_bps,
                reason: if self.run_ahead > old_run_ahead {
                    QosAdjustReason::RaiseLateRate
                } else {
                    QosAdjustReason::LowerStableWindow
                },
            })
        } else { None }
    }
}
```

### TimingFeedback: Relay Computes, Client Consumes

The relay side of the feedback loop (client consumption shown in `RelayLockstepNetwork::apply_timing_feedback()` above):

```rust
impl RelayCore {
    /// Compute per-player TimingFeedback from this QoS window's arrival data.
    /// Called every timing_feedback_interval ticks, once per player.
    fn compute_timing_feedback(&self, player: PlayerId) -> TimingFeedback {
        let pm = &self.player_metrics[&player];
        let stats = &self.arrival_stats[&player];
        TimingFeedback {
            early_us: stats.avg_early_us(),
            late_us: stats.avg_late_us(),
            recommended_offset_us: stats.recommended_adjustment_us(),
            late_count: pm.late_count_window,
        }
    }
}
```

### Desync Detection Wiring

Shows the relay collecting and comparing sync hashes from all clients (§ "Desync Detection" describes the protocol; this shows the code path):

```rust
impl RelayCore {
    /// Called when a client reports its sync hash for a completed tick.
    pub fn receive_sync_hash(&mut self, player: PlayerId, tick: u64, hash: u64) {
        let entry = self.sync_hashes.entry(tick).or_default();
        entry.insert(player, hash);

        // All players reported for this tick?
        if entry.len() == self.player_count {
            let first = *entry.values().next().unwrap();
            let all_agree = entry.values().all(|&h| h == first);

            if !all_agree {
                self.broadcast(Frame::DesyncDetected { tick });
                if self.desync_debug_level > DesyncDebugLevel::Off {
                    self.broadcast(Frame::DesyncDebugRequest {
                        tick,
                        level: self.desync_debug_level,
                    });
                }
            }
            // Prune old entries (keep last ~4 seconds at 30 tps)
            self.sync_hashes.retain(|&t, _| t > tick.saturating_sub(120));
        }
    }
}
```

### Match Lifecycle: Connected End-to-End

The capstone: relay-side session lifecycle and client-side match lifecycle showing how every component wires together through a full match.

**Relay side:**

```rust
/// Top-level relay match session — shows how all relay-side components
/// connect through the full lobby → gameplay → post-game lifecycle.
pub fn run_relay_session(relay: &mut RelayCore, transport: &mut RelayTransportLayer) {
    // The embedding layer (standalone binary or game client) owns the codec.
    // RelayCore is pure logic — no I/O, no serialization.
    let codec = NativeCodec::new();
    let mut match_outcome: Option<MatchOutcome> = None;

    // ── Phase 1: Lobby ──
    // Accept connections (Connection<Connecting> → Authenticated → InLobby).
    // Ready-check state machine: WaitingForAccept → MapVeto → Loading.

    // ── Phase 2: Loading + Calibration (parallel) ──
    // Exchange CalibrationPing/CalibrationPong with each client (~2 seconds).
    let calibration = relay.run_calibration(transport);
    // Seed adaptive algorithms with match-specific measurements:
    relay.apply_calibration(calibration);
    // Wait for all clients to report loading complete.

    // ── Phase 3: Commit-reveal game seed ──
    // Collect SeedCommitment → broadcast → collect SeedReveal → compute_game_seed()
    let seed = relay.run_seed_exchange(transport);
    transport.broadcast(&codec.encode_frame(&Frame::GameSeed(seed)));

    // ── Phase 4: Countdown → tick 0 ──

    // ── Phase 5: Gameplay tick loop ──
    loop {
        // a. Collect orders from all clients within tick deadline
        //    Late orders → PlayerOrder::Idle + anti-lag-switch strike
        relay.collect_orders_until_deadline(transport);

        // b. Sub-tick sort + filter chain → canonical TickOrders
        let tick_orders = relay.finalize_tick();

        // b2. Hash the full pre-filtering order stream for certification (V13).
        //     order_stream_hash covers ALL orders including all ChatMessage channels.
        //     Per-recipient chat filtering (step c) happens AFTER hashing.
        relay.order_stream_hasher.update(&tick_orders);

        // c. Send per-recipient TickOrders to each client + observers.
        //    Gameplay orders are identical for all recipients (lockstep invariant).
        //    ChatMessage orders are per-recipient filtered by ChatChannel (D059):
        //    Team → same-team only, Whisper → target only, Observer → observers only.
        //    Chat filtering is safe because ChatMessage does not affect game state.
        //    RelayCore produces the data; the embedding layer frames and sends it.
        //    All relay→client messages use Frame::* envelopes so the client's
        //    codec.decode_frame() receives a uniform stream.
        for player in relay.players_and_observers() {
            let filtered = relay.build_recipient_tick_orders(player, &tick_orders);
            let frame = Frame::TickOrders(filtered);
            transport.send_to(player, &codec.encode_frame(&frame));
        }

        // d. Sync hashes arrive asynchronously — relay.receive_sync_hash() handles comparison

        // e. Every timing_feedback_interval ticks: QoS evaluation + timing feedback
        if relay.tick % relay.timing_feedback_interval == 0 {
            if let Some(event) = relay.evaluate_qos_window() {
                relay.replay_writer.record_qos_event(&event);
            }
            for player in relay.players() {
                let fb = relay.compute_timing_feedback(player);
                transport.send_to(player, &codec.encode_frame(&Frame::TimingFeedback(fb)));
            }
        }

        // f. Check termination (MatchOutcome from match-lifecycle.md)
        if let Some(outcome) = relay.check_match_end() {
            transport.broadcast(&codec.encode_frame(&Frame::MatchEnd(outcome.clone())));
            match_outcome = Some(outcome);
            break;
        }

        relay.tick += 1;
    }

    // ── Phase 6: Post-game ──
    // Broadcast CertifiedMatchResult (Ed25519-signed by relay).
    // Clients' poll_tick() receives this frame and transitions
    // NetworkStatus from MatchCompleted → PostGame(CertifiedMatchResult).
    let outcome = match_outcome.expect("loop exits only via check_match_end");
    let certified = relay.certify_match_result(&outcome);
    transport.broadcast(&codec.encode_frame(&Frame::CertifiedMatchResult(certified)));
    // 5-minute post-game lobby for stats/chat.
    // BackgroundReplayWriter finalizes and flushes .icrep file.
    // Connections close.
}
```

**Client side:**

```rust
/// Client-side match lifecycle — shows how GameLoop<N, I> integrates
/// with RelayLockstepNetwork and the transport layer.
/// GameLoop struct and frame() method are defined in architecture/game-loop.md.
pub fn run_client_match<T: Transport>(
    mut transport: EncryptedTransport<T>,
    input: impl InputSource,
    local_player: PlayerId,
    rules: GameRules,
) {
    // 1. Transport is already connected + encrypted (signaling + key exchange)

    // 2. Respond to CalibrationPing → CalibrationPong during loading
    //    (handled by the pre-game connection layer)

    // 3. Participate in seed commit-reveal.
    //    Reads directly from transport (pre-NetworkModel). The relay sends
    //    Frame::GameSeed after collecting all SeedReveal messages.
    //    This function decodes Frame::GameSeed via codec.decode_frame()
    //    on the raw transport — the same codec the NetworkModel will use later.
    let seed = participate_in_seed_exchange(&mut transport, local_player);

    // 4. Construct NetworkModel over encrypted transport
    let network = RelayLockstepNetwork::new(transport);

    // 5. Construct GameLoop — the client-side frame driver (always renders).
    //    Headless consumers (servers, bots, tests) drive Simulation directly
    //    and never instantiate GameLoop. See architecture/game-loop.md.
    let mut game_loop = GameLoop {
        sim: Simulation::new(seed, rules),
        renderer: Renderer::new(),
        network,
        input,
        local_player,
        order_buf: Vec::new(),
    };

    // 6. Frame loop — GameLoop::frame() handles the core cycle:
    //    drain input → submit_order() → poll_tick() → sim.apply_tick()
    //    → report_sync_hash() → report_state_hash() (at signing cadence)
    //    → renderer.draw()
    while game_loop.network.status() == NetworkStatus::Active {
        game_loop.frame();
    }

    // 7. Post-game phase (match-lifecycle.md § Post-Game Flow).
    //    MatchCompleted status breaks the frame loop above.
    //    run_post_game() runs its own event loop that continues calling
    //    network.poll_tick() to drain transport — this is how the
    //    Frame::CertifiedMatchResult arrives and transitions the status
    //    from MatchCompleted → PostGame(CertifiedMatchResult).
    //    The post-game loop also renders the stats screen, processes
    //    lobby chat (MessageLane::Chat), and handles user input
    //    (leave / re-queue / view stats). Connection stays open for
    //    up to 5 minutes (match-lifecycle.md § Post-Game Timeout).
    if let NetworkStatus::MatchCompleted(_) | NetworkStatus::PostGame(_) = game_loop.network.status() {
        run_post_game(&mut game_loop);  // blocks until user leaves or 5min timeout
    }

    // 8. Return to menu, save replay
}

/// Post-game event loop. Keeps pumping the network so late frames
/// (CertifiedMatchResult, RatingUpdate, ChatNotification) arrive.
/// Renders the stats screen, displays rating changes, shows chat.
/// Exits on user action (leave / re-queue) or 5-minute timeout.
///
/// Takes the concrete RelayLockstepNetwork (not trait-generic) because
/// post-game accessors (take_credentials, drain_chat, send_chat) are
/// relay-specific — LocalNetwork and ReplayPlayback never produce these
/// frames. The caller (run_client_match) already holds the concrete type.
fn run_post_game<T: Transport, I: InputSource>(
    game_loop: &mut GameLoop<RelayLockstepNetwork<T>, I>,
) {
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        // Keep draining transport — CertifiedMatchResult, RatingUpdate,
        // and ChatNotification arrive here. poll_tick() stores them in
        // their respective fields and transitions status accordingly.
        game_loop.network.poll_tick();

        // Consume post-game credentials (rating SCR + match record SCR).
        let credentials = game_loop.network.take_credentials();
        // Consume post-game chat/system notifications.
        let chat: Vec<_> = game_loop.network.drain_chat().collect();

        // Render stats screen with concrete post-game data.
        game_loop.renderer.draw_post_game(
            &game_loop.network.status(),
            &credentials,
            &chat,
        );

        // Send outbound post-game chat if the user typed a message.
        if let Some(msg) = game_loop.input.drain_chat_input() {
            game_loop.network.send_chat(msg);
        }

        match game_loop.network.status() {
            NetworkStatus::PostGame(_) | NetworkStatus::MatchCompleted(_) => {
                if game_loop.input.wants_leave() || Instant::now() > deadline {
                    break;
                }
            }
            _ => break, // Disconnected or unexpected — exit immediately
        }
    }
}
```

**Connection topology — complete data flow through one tick:**

```
Client A                     Relay (RelayCore)                Client B
────────                     ────────────────                ────────
input.drain_orders()
  → TimestampedOrder
    → OrderBatcher.push()
      → Transport.send()
        ─── encrypted UDP ──▶  receive_order()
                                normalize_timestamp()    ◀── encrypted UDP ───
                                check_skew()                  (Client B's orders)
                                order_budget.try_consume()
                                finalize_tick()
                                  → sub-tick sort
                                  → filter chain
                                  → canonical TickOrders
                              send_to(per-recipient filtered)
        ◀── encrypted UDP ──  ─── encrypted UDP ──▶
      Transport.recv()                               Transport.recv()
    codec.decode_frame()                             codec.decode_frame()
  poll_tick() → Some(TickOrders)                     poll_tick() → Some(TickOrders)
sim.apply_tick(&tick_orders)                         sim.apply_tick(&tick_orders)
sim.state_hash()                                     sim.state_hash()
  → report_sync_hash()                                → report_sync_hash()
        ─── encrypted UDP ──▶  receive_sync_hash()   ◀── encrypted UDP ───
                                compare hashes
                                (if mismatch → DesyncDetected)
  (every N ticks: signing cadence)                   (every N ticks: signing cadence)
  sim.full_state_hash()                              sim.full_state_hash()
  → report_state_hash()                                → report_state_hash()
        ─── encrypted UDP ──▶  receive_state_hash()  ◀── encrypted UDP ───
                                store for TickSignature chain
                                (replay signing + strong verification)
renderer.draw()                                      renderer.draw()
```
