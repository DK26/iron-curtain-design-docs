# Sub-Tick Timing & Fairness

### Sub-Tick Order Fairness (from CS2)

Counter-Strike 2 introduced "sub-tick" architecture: instead of processing all actions at discrete tick boundaries, the client timestamps every input with sub-tick precision. The server collects inputs from all clients and processes them in chronological order within each tick window. The server still ticks at 64Hz, but events are ordered by their actual timestamps.

For an RTS, the core idea — **timestamped orders processed in chronological order within a tick** — produces fairer results for edge cases:

- Two players grabbing the same crate → the one who clicked first gets it
- Engineer vs engineer racing to capture a building → chronological winner
- Simultaneous attack orders → processed in actual order, not arrival order

**What's NOT relevant from CS2:** CS2 is client-server authoritative with prediction and interpolation. An RTS with hundreds of units can't afford server-authoritative simulation — the bandwidth would be enormous. We stay with deterministic lockstep (clients run identical sims), so CS2's prediction/reconciliation doesn't apply.

#### Why Sub-Tick Instead of a Higher Tick Rate

In client-server FPS (CS2, Overwatch), a tick is just a simulation step — the server runs alone and sends corrections. In **lockstep**, a tick is a **synchronization barrier**: every tick requires collecting all players' orders (or hitting the deadline), processing them deterministically, advancing the full ECS simulation, and exchanging sync hashes. Each tick is a coordination point between all players.

This means higher tick rates have multiplicative cost in lockstep:

| Approach                 | Sim Cost                        | Network Cost                                                    | Fairness Outcome                                                            |
| ------------------------ | ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **30 tps + sub-tick**    | 30 full sim updates/sec         | 30 sync barriers/sec, 3-tick run-ahead for 100ms buffer         | Fair — orders sorted by timestamp within each tick                          |
| **128 tps, no sub-tick** | 128 full sim updates/sec (4.3×) | 128 sync barriers/sec, ~13-tick run-ahead for same 100ms buffer | Unfair — ties within 8ms windows still broken by player ID or arrival order |
| **128 tps + sub-tick**   | 128 full sim updates/sec (4.3×) | 128 sync barriers/sec                                           | Fair — but at enormous cost for zero additional benefit                     |

At 128 tps, you're running all pathfinding, spatial queries, combat resolution, fog updates, and economy for 500+ units 128 times per second instead of 30. That's a 4× CPU increase with no gameplay benefit — RTS units move cell-to-cell, not sub-millimeter. Visual interpolation already makes 30 tps look smooth at 60+ FPS render.

Critically, **128 tps doesn't even eliminate the problem sub-tick solves.** Two orders landing in the same 8ms window still need a tiebreaker. You've paid 4× the cost and still need sub-tick logic (or unfair player-ID tiebreaking) for simultaneous orders.

Sub-tick **decouples order fairness from simulation rate.** That's why it's the right tool: it solves the fairness problem without paying the simulation cost. A tick's purpose in lockstep is synchronization, and you want the *fewest* synchronization barriers that still produce good gameplay — not the most.

#### Relay-Side Timestamp Normalization (Trust Boundary)

The relay's "time authority" guarantee is only meaningful if it does **not** blindly trust client-claimed sub-tick timestamps. Therefore:

- **Client `sub_tick_time` is a hint, not an authoritative fact**
- **Relay assigns the canonical timestamp** that is broadcast in `TickOrders`
- **Impossible timestamps are clamped/flagged**, not accepted as-is

The relay maintains a per-player timing calibration (offset/skew estimate + jitter envelope) derived from transport RTT samples and timing feedback. When an order arrives, the relay:

1. Determines the relay tick window the order belongs to (or drops it as late)
2. Computes a feasible arrival-time envelope for that player in that tick
3. Maps the client's `sub_tick_time` hint into relay time using the calibration
4. Clamps to the feasible envelope and `[0, tick_window_us)` bounds
5. Emits the **relay-normalized** `sub_tick_time` in canonical `TickOrders`

Orders with repeated timestamp claims outside the allowed skew budget are treated as suspicious (telemetry + anti-abuse scoring; optional strike escalation in ranked relay deployments). This preserves the fairness benefit of sub-tick ordering while preventing "I clicked first" spoofing by client clock manipulation.

### Adaptive Run-Ahead (from C&C Generals)

Every lockstep RTS has inherent input delay — the game schedules your order a few ticks into the future so remote players' orders have time to arrive:

```
Local input at tick 50 → scheduled for tick 53 (3-tick delay)
Remote input has 3 ticks to arrive before we need it
Delay dynamically adjusted based on connection quality AND client performance
```

This input delay ("run-ahead") is not static. It adapts dynamically based on **both** network latency **and** client frame rate — a pattern proven by C&C Generals/Zero Hour (see `research/generals-zero-hour-netcode-analysis.md`). Generals tracked a 200-sample rolling latency history plus a "packet arrival cushion" (how many frames early orders arrive) to decide when to adjust. Their run-ahead changes were themselves synchronized network commands, ensuring all clients switch on the same frame.

We adopt this pattern:

```rust
/// Sent periodically by each client to report its performance characteristics.
/// The relay authority (embedded or dedicated) uses this to adjust the tick deadline.
pub struct ClientMetrics {
    pub avg_latency_us: u32,      // Rolling average RTT to relay/host (microseconds)
    pub avg_fps: u16,             // Client's current rendering frame rate
    pub arrival_cushion: i16,     // How many ticks early orders typically arrive
    pub tick_processing_us: u32,  // How long the client takes to process one sim tick
}
```

Why FPS matters: a player running at 15 FPS needs roughly 67ms to process and display each frame. If run-ahead is only 2 ticks (66ms at 30 tps), they have zero margin — any network jitter causes a stall. By incorporating FPS into the adaptive algorithm, we prevent slow machines from dragging down the experience for everyone.

`ClientMetrics` informs the relay's tick deadline calculation. The embedded relay and dedicated relay both use the same adaptive algorithm.

#### Input Timing Feedback (from DDNet)

The relay server periodically reports order arrival timing **back to each client**, enabling client-side self-calibration. This pattern is proven by DDNet's timing feedback system (see `research/veloren-hypersomnia-openbw-ddnet-netcode-analysis.md`) where the server reports how early/late each player's input arrived:

```rust
/// Sent by the relay to each client after every N ticks (default: 30).
/// Tells the client how its orders are arriving relative to the tick deadline.
pub struct TimingFeedback {
    pub early_us: i32,               // avg μs before deadline (0 if not early)
    pub late_us: i32,                // avg μs after deadline (0 if not late)
    pub recommended_offset_us: i32,  // relay's suggested adjustment
    pub late_count: u16,             // orders missed deadline in this window
}
```

The client uses this feedback to adjust when it submits orders — if `late_count > 0`, the client shifts submission earlier by up to `recommended_offset_us`. If `early_us` is large (orders arriving very early, wasting buffer), the client relaxes. This is a feedback loop that converges toward optimal submission timing without the relay needing to adjust global tick deadlines, reducing the number of late drops for marginal connections. See `system-wiring.md` § `RelayLockstepNetwork::apply_timing_feedback()` for the client-side consumption and `system-wiring.md` § `RelayCore::compute_timing_feedback()` for the relay-side computation.

#### Match-Start Calibration

The adaptive run-ahead and sub-tick normalization algorithms converge during play — but convergence takes time. Without calibration, the first few seconds of a match use generic defaults (e.g., 3-tick run-ahead for everyone, zero clock offset estimate), which may under- or over-buffer for the actual latency profile of the players in this match. This creates a brief window where orders are more likely to arrive late (stall-risk) or where sub-tick normalization is less accurate (fairness-risk).

To eliminate this convergence period, the relay runs a **calibration handshake** during the loading screen — a phase all players already wait through (map loading, asset sync, per-player progress bars):

```rust
/// Calibration results computed during loading screen.
/// Used to seed adaptive algorithms with match-specific values
/// instead of generic defaults.
pub struct MatchCalibration {
    pub per_player: Vec<PlayerCalibration>,
    pub shared_initial_run_ahead: u8, // one value for the whole match
    pub initial_tick_deadline_us: u32, // derived from match-wide latency envelope
    pub qos_profile: MatchQosProfile,  // selected by queue type (ranked/casual)
}

pub struct PlayerCalibration {
    pub player: PlayerId,
    pub median_rtt_us: u32,         // median of N RTT samples
    pub jitter_us: u32,             // RTT variance (P95 - P5)
    pub estimated_one_way_us: u32,  // median_rtt / 2 (initial estimate)
    pub submit_offset_us: i32,      // client-side send offset (timing assist only)
}

pub struct MatchQosProfile {
    pub deadline_min_us: u32,      // floor for fairness/anti-abuse
    pub deadline_max_us: u32,      // ceiling for responsiveness
    pub run_ahead_min_ticks: u8,   // lower bound for shared run-ahead
    pub run_ahead_max_ticks: u8,   // upper bound for shared run-ahead
    pub max_step_per_update: u8,   // usually 1 tick per adjustment window
    pub hysteresis_windows: u8,    // consecutive windows before lowering delay
    pub one_way_clip_us: u32,      // outlier clip above median one-way during init
    pub jitter_clip_us: u32,       // outlier clip above median jitter during init
    pub safety_margin_us: u32,     // fixed buffer added to initial deadline
    pub ewma_alpha_q15: u16,       // EWMA smoothing (0..32767 => 0.0..1.0)
    pub raise_late_rate_bps: u16,  // raise threshold in basis points (100 = 1.0%)
    pub lower_late_rate_bps: u16,  // lower threshold in basis points
    pub raise_windows: u8,         // consecutive windows above raise threshold
    pub lower_windows: u8,         // consecutive windows below lower threshold
    pub cooldown_windows: u8,      // minimum windows between adjustments
    pub per_player_influence_cap_bps: u16, // cap one player's influence on global raise
}
```

**Calibration sequence** (runs in parallel with map loading — adds zero wait time):

1. **During loading screen:** The relay exchanges 15–20 ping packets with each client over ~2 seconds (spread across the loading phase). These are lightweight `CalibrationPing`/`CalibrationPong` packets — no game data, just timing.
2. **Relay computes per-player calibration:** Median RTT, jitter estimate, initial one-way delay estimate (RTT/2), and each player's `submit_offset_us`.
3. **Relay computes robust match envelope:** Use per-player `one_way_p95` and `jitter_p95`, then clip outliers before deriving the candidate deadline:

   `clipped_one_way_i = min(one_way_p95_i, median_one_way_p95 + one_way_clip_us)`

   `clipped_jitter_i = min(jitter_p95_i, median_jitter_p95 + jitter_clip_us)`

   `candidate_deadline_us = p90(clipped_one_way_i) + (2 * p90(clipped_jitter_i)) + safety_margin_us`

   This avoids one unstable player forcing a large global delay jump at match start.

4. **Relay clamps to profile bounds:** Clamp `candidate_deadline_us` to `qos_profile.deadline_min_us..=deadline_max_us`.
5. **Relay derives one shared run-ahead:** `shared_initial_run_ahead = ceil(initial_tick_deadline_us / tick_interval_us)`, clamped to `run_ahead_min_ticks..=run_ahead_max_ticks`.
6. **Relay seeds timestamp normalization + broadcasts calibration:** Per-player `ClockCalibration` starts with measured offsets, and all clients receive the same `shared_initial_run_ahead`.

**After the first tick:** The normal adaptive algorithms (rolling latency history, `ClientMetrics`, `TimingFeedback`) take over and continue refining. The calibration is just the seed — it ensures the adaptive system starts near the correct operating point instead of hunting for it during early gameplay.

**Why this matters for fairness:** Without calibration, the relay's sub-tick normalization offset for each player starts at zero. For the first ~1–2 seconds (until enough RTT samples accumulate), a 150ms-ping player's timestamps are not properly normalized — they're treated as if they had zero latency, systematically losing ties to low-ping players. With calibration, normalization is accurate from tick one.

#### In-Match QoS Auto-Tuning (Bounded)

Calibration seeds the system; bounded adaptation keeps it stable:

- **Update window:** Every `timing_feedback_interval` ticks (default 30).
- **EWMA smoothing:** Use `ewma_alpha_q15` (default 0.20 ranked, 0.25 casual) to smooth late-rate noise.
- **Increase quickly:** If EWMA late-rate exceeds `raise_late_rate_bps` for `raise_windows` consecutive windows (default ranked: 2.0% for 3 windows), increase shared run-ahead by at most `max_step_per_update` (default 1 tick) and increase deadline by at most 10ms per update.
- **Decrease slowly:** Only decrease when EWMA late-rate stays below `lower_late_rate_bps` and arrival cushion remains healthy for `lower_windows` consecutive windows (default ranked: 0.2% for 8 windows).
- **Cooldown:** Enforce `cooldown_windows` between adjustments (default ranked: 2 windows).
- **Global fairness rule:** `shared_run_ahead` and `tick_deadline` are match-global values, never per-player. Per-player logic only adjusts `submit_offset_us` (when to send), not order priority semantics.
- **Bounded by profile:** No adaptation can exceed `MatchQosProfile` min/max limits.
- **Anti-abuse guardrails:** Per-player influence on raise decisions is capped by `per_player_influence_cap_bps` (default ranked: 40%). Players with repeated "late without matching RTT/jitter/loss evidence" patterns are flagged and excluded from adaptation math for a cooling period, while anti-lag-switch strikes continue.

This achieves the intended tradeoff: resilient feel up to a defined lag envelope while preserving deterministic fairness and anti-lag-switch guarantees.

#### QoS Audit Trail (Replay + Telemetry)

Every QoS adjustment is recorded as a deterministic control event so fairness disputes can be audited post-match:

```rust
pub struct QosAdjustmentEvent {
    pub tick: u64,
    pub old_deadline_us: u32,
    pub new_deadline_us: u32,
    pub old_run_ahead: u8,
    pub new_run_ahead: u8,
    pub late_rate_bps_ewma: u16,
    pub reason: QosAdjustReason, // RaiseLateRate | LowerStableWindow | AdminOverride
}
```

Events are emitted to replay metadata and relay telemetry (`relay.qos.adjust`) with the same values.

#### Player-Facing Timing Feedback

Fairness is objective, but frustration is subjective. The client should surface concise timing outcomes:

- When a local order misses deadline: show a small non-intrusive indicator, e.g., `Late order (+34ms)`.
- Rate-limit to avoid spam (for example, max once every 3 seconds with aggregation).
- Keep this informational only; it does not alter sim outcomes.

This directly addresses "I clicked first" confusion without introducing per-player fairness exceptions.

### Anti-Lag-Switch

The relay server owns the clock. If your orders don't arrive within the tick deadline, they're dropped — replaced with `PlayerOrder::Idle`. Lag switch only punishes the attacker:

```rust
impl RelayServer {
    fn process_tick(&mut self, tick: u64) {
        let deadline = Instant::now() + self.tick_deadline; // e.g., 120ms

        for player in &self.players {
            match self.receive_orders_from(player, deadline) {
                Ok(orders) => self.tick_orders.add(player, orders),
                Err(Timeout) => {
                    // Missed deadline → strikes system
                    // Game never stalls for honest players
                    self.tick_orders.add(player, PlayerOrder::Idle);
                }
            }
        }
        self.broadcast_tick_orders(tick);
    }
}
```

Repeated late deliveries accumulate strikes. Enough strikes → disconnection. The relay's tick cadence is authoritative — client clock is irrelevant. See `06-SECURITY.md` for the full anti-cheat implications.

**Token-based liveness** (from OpenTTD): The relay embeds a random nonce in each FRAME packet. The client must echo it in their ACK. This distinguishes "slow but actively processing" from "TCP-alive but frozen" — a client that maintains a connection without processing game frames (crashed renderer, debugger attached, frozen UI) is caught within one missed token, not just by eventual heartbeat timeout. The token check is separate from frame acknowledgment: legitimate lag (slow packets) delays the ACK but eventually echoes the correct token, while a frozen client never echoes.

### Order Rate Control

Order throughput is controlled by three independent layers, each catching what the others miss:

**Layer 1 — Time-budget pool (primary).** Inspired by Minetest's LagPool anti-cheat system. Each player has an order budget that refills at a fixed rate per tick and caps at a burst limit:

```rust
pub struct OrderBudget {
    pub tokens: u32,         // Current budget (each order costs 1 token)
    pub refill_per_tick: u32, // Tokens added per tick (e.g., 16 at 30 tps)
    pub burst_cap: u32,       // Maximum tokens (e.g., 128)
}

impl OrderBudget {
    fn tick(&mut self) {
        self.tokens = (self.tokens + self.refill_per_tick).min(self.burst_cap);
    }

    fn try_consume(&mut self, count: u32) -> u32 {
        let accepted = count.min(self.tokens);
        self.tokens -= accepted;
        accepted // excess orders silently dropped
    }
}
```

Why this is better than a flat cap: normal play (5-10 orders/tick) never touches the limit. Legitimate bursts (mass-select 50 units and move) consume from the burst budget and succeed. Sustained abuse (bot spamming hundreds of orders per second) exhausts the budget within a few ticks, and excess orders are silently dropped. During real network lag (no orders submitted), the budget refills naturally — when the player reconnects, they have a full burst budget for their queued commands.

**Layer 2 — Bandwidth throttle.** A token bucket rate limiter on raw bytes per client (from OpenTTD). `bytes_per_tick` adds tokens each tick, `bytes_per_tick_burst` caps the bucket. This catches oversized orders or rapid data that might pass the order-count budget but overwhelm bandwidth. Parameters are tuned so legitimate traffic never hits the limit.

**Layer 3 — Hard ceiling.** An absolute maximum of 256 orders per player per tick (defined in `ProtocolLimits`). This is the last resort — if somehow both budget and bandwidth checks fail, this hard cap prevents any single player from flooding the tick's order list. See `06-SECURITY.md` § Vulnerability 15 for the full `ProtocolLimits` definition.

**Half-open connection defense** (from Minetest): New UDP connections to the relay are marked half-open. The relay inhibits retransmission and ping responses until the client proves liveness by using its assigned session ID in a valid packet. This prevents the relay from being usable as a UDP amplification reflector — critical for any internet-facing server.

**Relay connection limits:** In addition to per-player order rate control, the relay enforces connection-level limits to prevent resource exhaustion (see `06-SECURITY.md` § Vulnerability 24):

- **Max total connections per relay instance:** configurable, default 1000. Returns 503 when at capacity.
- **Max connections per IP:** configurable, default 5. Prevents single-source connection flooding.
- **New connection rate per IP:** max 10/sec (token bucket). Prevents rapid reconnection spam.
- **Memory budget per connection:** bounded; torn down if exceeded.
- **Idle timeout:** 60 seconds for unauthenticated, 5 minutes for authenticated.

These limits complement the order-level defenses — rate control handles abuse from established connections, connection limits prevent exhaustion of server resources before a game even starts.
