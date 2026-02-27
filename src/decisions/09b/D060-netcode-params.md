## D060: Netcode Parameter Philosophy — Automate Everything, Expose Almost Nothing

**Status:** Settled
**Decided:** 2026-02
**Scope:** `ic-net`, `ic-game` (lobby), D058 (console)
**Phase:** Phase 5 (Multiplayer)

### Decision Capsule (LLM/RAG Summary)

- **Status:** Settled
- **Phase:** Phase 5 (Multiplayer)
- **Canonical for:** Netcode parameter exposure policy (what is automated vs player/admin-visible) and multiplayer UX philosophy for netcode tuning
- **Scope:** `ic-net`, lobby/settings UI in `ic-game`, D058 command/cvar exposure policy
- **Decision:** IC automates nearly all netcode parameters and exposes only a minimal, player-comprehensible surface, with adaptive systems handling most tuning internally.
- **Why:** Manual netcode tuning hurts usability and fairness, successful games hide this complexity, and IC's sub-tick/adaptive systems are designed to self-tune.
- **Non-goals:** A comprehensive player-facing "advanced netcode settings" panel; exposing internal transport/latency/debug knobs as normal gameplay UX.
- **Invariants preserved:** D006 pluggable netcode architecture remains intact; automation policy does not prevent internal default changes or future netcode replacement.
- **Defaults / UX behavior:** Players see only understandable controls (e.g., game speed where applicable); admin/operator controls remain narrowly scoped; developer/debug knobs stay non-player-facing.
- **Security / Trust impact:** Fewer exposed knobs reduces misconfiguration and exploit/abuse surface in competitive play.
- **Performance / Ops impact:** Adaptive tuning lowers support burden and avoids brittle hand-tuned presets across diverse network conditions.
- **Public interfaces / types / commands:** D058 cvar/command exposure policy, lobby parameter surfaces, internal adaptive tuning systems (see body for exact parameters)
- **Affected docs:** `src/03-NETCODE.md`, `src/17-PLAYER-FLOW.md`, `src/06-SECURITY.md`, `src/decisions/09g-interaction.md`
- **Revision note summary:** None
- **Keywords:** netcode parameters, automate everything, expose almost nothing, run-ahead, command delay, tick rate, cvars, multiplayer settings

### Context

Every lockstep RTS has tunable netcode parameters: tick rate, command delay (run-ahead), game speed, sync check frequency, stall policy, and more. The question is which parameters to expose to players, which to expose to server admins, and which to keep as fixed engine constants.

This decision was informed by a cross-game survey of configurable netcode parameters — covering both RTS (C&C Generals, StarCraft/Brood War, Spring Engine, 0 A.D., OpenTTD, Factorio, Age of Empires II, original Red Alert) and FPS (Counter-Strike 2) — plus analysis of IC's own sub-tick and adaptive run-ahead systems.

### The Pattern: Successful Games Automate

Every commercially successful game in the survey converged on the same answer: **automate netcode parameters, expose almost nothing to players.**

| Game / Engine            | Player-Facing Netcode Controls                        | Automatic Systems                                                                            | Outcome                                                                       |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **C&C Generals/ZH**      | Game speed only                                       | Adaptive run-ahead (200-sample rolling RTT + FPS), synchronized `RUNAHEAD` command           | Players never touch latency settings; game adapts silently                    |
| **Factorio**             | None (game speed implicit)                            | Latency hiding (always-on since 0.14.0, toggle removed), server never waits for slow clients | Removed the only toggle because "always on" was always better                 |
| **Counter-Strike 2**     | None                                                  | Sub-tick always-on; fixed 64 Hz tick (removed 64/128 choice from CS:GO)                      | Removed tick rate choice because sub-tick made it irrelevant                  |
| **AoE II: DE**           | Game speed only                                       | Auto-adapts command delay based on connection quality                                        | No exposed latency controls in ranked                                         |
| **Original Red Alert**   | Game speed only                                       | MaxAhead adapts automatically every 128 frames via host `TIMING` events                      | Players never interact with MaxAhead; formula-driven                          |
| **StarCraft: Brood War** | Game speed + latency setting (Low/High/Extra High)    | None (static command delay per setting)                                                      | Latency setting confuses new players; competitive play mandates "Low Latency" |
| **Spring Engine**        | Game speed (host) + LagProtection mode (server admin) | Dynamic speed adjustment based on CPU reporting; two speed control modes                     | More controls → more community complaints about netcode                       |
| **0 A.D.**               | None                                                  | None (hardcoded 200ms turns, no adaptive run-ahead, stalls for everyone)                     | Least adaptive → most stalling complaints                                     |

**The correlation is clear:** games that expose fewer netcode controls and invest in automatic adaptation have fewer player complaints and better perceived netcode quality. Games that expose latency settings (BW) or lack automatic adaptation (0 A.D.) have worse player experiences.

### Decision

IC adopts a **three-tier exposure model** for netcode parameters:

#### Tier 1: Player-Facing (Lobby GUI)

| Setting        | Values                                       | Default          | Who Sets     | Scope                |
| -------------- | -------------------------------------------- | ---------------- | ------------ | -------------------- |
| **Game Speed** | Slowest / Slower / Normal / Faster / Fastest | Slower (~15 tps) | Host (lobby) | Synced — all clients |

One setting. Game speed is the only parameter where player preference is legitimate ("I like slower, more strategic games" vs. "I prefer fast-paced gameplay"). In ranked play, game speed is server-enforced and not configurable.

Game speed affects only the interval between sim ticks — system behavior is tick-count-based, so all game logic works identically at any speed. Single-player can change speed mid-game; multiplayer sets it in lobby. This matches how every C&C game handled speed (see `02-ARCHITECTURE.md` § Game Speed).

**Mobile tempo advisor compatibility (D065):** Touch-specific "tempo comfort" recommendations are **client/UI advisory only**. They may highlight a recommended band (`slower`-`normal`, etc.) or warn a host that touch players may be overloaded, but they do not create a new authority path for speed selection. The host/queue-selected game speed remains the only synced value, and ranked speed remains server-enforced.

#### Tier 2: Advanced / Console (Power Users, D058)

Available via console commands or `config.toml`. Not in the main GUI. Flagged with appropriate cvar flags:

| Cvar                     | Type  | Default | Flags        | What It Does                                                                       |
| ------------------------ | ----- | ------- | ------------ | ---------------------------------------------------------------------------------- |
| `net.sync_frequency`     | int   | 120     | `SERVER`     | Ticks between full state hash checks                                               |
| `net.desync_debug_level` | int   | 0       | `DEV_ONLY`   | 0-3, controls desync diagnosis overhead (see `03-NETCODE.md` § Debug Levels)       |
| `net.show_diagnostics`   | bool  | false   | `PERSISTENT` | Toggle network overlay (latency, jitter, packet loss, tick timing)                 |
| `net.visual_prediction`  | bool  | true    | `DEV_ONLY`   | Client-side visual prediction; disabling useful only for testing perceived latency |
| `net.simulate_latency`   | int   | 0       | `DEV_ONLY`   | Artificial one-way latency in ms (debug builds only)                               |
| `net.simulate_loss`      | float | 0.0     | `DEV_ONLY`   | Artificial packet loss percentage (debug builds only)                              |
| `net.simulate_jitter`    | int   | 0       | `DEV_ONLY`   | Artificial jitter in ms (debug builds only)                                        |

These are diagnostic and testing tools, not gameplay knobs. The `DEV_ONLY` flag prevents them from affecting ranked play. The `SERVER` flag on `sync_frequency` ensures all clients use the same value.

#### Tier 3: Engine Constants (Not Configurable at Runtime)

| Parameter              | Value                                 | Why Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sim tick rate**      | 30 tps (33ms/tick)                    | In lockstep, ticks are synchronization barriers (collect orders → process → advance sim → exchange hashes), not just simulation steps. Higher rates multiply CPU cost (full ECS update per tick for 500+ units), network overhead (more sync barriers, larger run-ahead in ticks), and late-arrival risk — with no gameplay benefit. RTS units move cell-to-cell, not sub-millimeter. Visual interpolation makes 30 tps smooth at 60+ FPS render. Game speed multiplies the tick *interval*, not the tick *rate*. See `03-NETCODE.md` § "Why Sub-Tick Instead of a Higher Tick Rate" |
| **Sub-tick ordering**  | Always on                             | Zero cost (~4 bytes/order + one sort of ≤5 items); produces visibly fairer outcomes in simultaneous-action edge cases; CS2 proved universal acceptance; no reason to toggle                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Adaptive run-ahead** | Always on                             | Generals proved this works over 20 years; adapts to both RTT and FPS; synchronized via network command                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Timing feedback**    | Always on                             | Client self-calibrates order submission timing based on relay feedback; DDNet-proven pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Match QoS auto-profile** | Always on | Relay calibrates deadline/run-ahead at match start and adapts within bounded profiles. Gives better feel under real-world lag while preserving match-wide fairness semantics |
| **Stall policy**       | Never stall (relay drops late orders) | Core architectural decision; stalling punishes honest players for one player's bad connection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Anti-lag-switch**    | Always on                             | Relay owns the clock; non-negotiable for competitive integrity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Visual prediction**  | Always on                             | Factorio lesson — removed the toggle in 0.14.0 because always-on was always better; cosmetic only (sim unchanged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Sub-Tick Is Not Optional

Sub-tick order fairness (D008) is **always-on** — not a configurable feature:

- **Cost:** ~4 bytes per order (`sub_tick_time: u32`) + one stable sort per tick of the orders array (typically 0-5 orders — negligible).
- **Benefit:** Fairer resolution of simultaneous events (engineer races, crate grabs, simultaneous attacks). "I clicked first, I won" matches player intuition.
- **Player experience:** The mechanism is automatic (players don't configure timestamps), but the outcome is **very visible** — who wins the engineer race, who grabs the contested crate, whose attack order resolves first. These moments define close games. Without sub-tick, ties are broken by player ID (always unfair to higher-numbered players) or packet arrival order (network-dependent randomness). With sub-tick, the player who acted first wins. That's a gameplay experience players notice and care about.
- **If made optional:** Would require two code paths in the sim (sorted vs. unsorted order processing), a deterministic fallback that's always unfair to higher-numbered players (player ID tiebreak), and a lobby setting nobody understands. Ranked would mandate one mode anyway. CS2 faced zero community backlash — no one asked for "the old random tie-breaking."

### Match QoS Auto-Profile (Fairness + Feel)

To avoid the "first 1-2 seconds feel wrong" problem and to improve playability under moderate lag, relay matches use an always-on **Match QoS auto-profile**:

1. **Pre-match calibration during loading:** collect short RTT/jitter samples for each player.
2. **Profile-bounded initialization:** derive one shared `tick_deadline` and one shared `run_ahead` for the match from the measured envelope, then clamp to policy bounds.
3. **Bounded in-match adaptation:** increase quickly on sustained late arrivals, decrease slowly after sustained stability (hysteresis).
4. **Per-player assist only for submission timing:** clients may use per-player send offsets, but fairness semantics stay match-global.

The key guardrail is deliberate:
- **Never per-player fairness rules.** Intra-tick ordering remains one canonical relay rule for all players.
- **Only per-player delivery assist.** Individual timing offsets influence when a client sends, not how the relay ranks contested actions.

Recommended policy envelopes:

| Queue Type | `tick_deadline_ms` envelope | Shared run-ahead envelope | Goal |
| ---------- | ---------------------------- | ------------------------- | ---- |
| **Ranked / Competitive** | 90-140 | 3-5 ticks | Tight fairness and responsiveness; strict anti-abuse posture |
| **Casual / Community**   | 120-220 | 4-7 ticks | Better tolerance for mixed/WiFi links; fewer late-drop frustrations |

These are policy bounds, not player settings. The relay auto-selects/adjusts inside them.

At 30 tps (`tick_interval_ms ≈ 33.33`), these run-ahead envelopes are derived from `ceil(tick_deadline_ms / tick_interval_ms)` so delay and scheduling budgets stay internally consistent.

Default QoS adaptation constants (per queue profile):

| Constant | Ranked / Competitive | Casual / Community |
| -------- | -------------------- | ------------------ |
| Initialization one-way clip (`one_way_clip_us`) | 25 ms | 80 ms |
| Initialization jitter clip (`jitter_clip_us`) | 12 ms | 40 ms |
| Safety margin (`safety_margin_us`) | 8 ms | 15 ms |
| EWMA alpha (`ewma_alpha_q15`) | 0.20 | 0.25 |
| Raise threshold (`raise_late_rate_bps`) | 2.0% | 3.5% |
| Raise windows (`raise_windows`) | 3 | 2 |
| Lower threshold (`lower_late_rate_bps`) | 0.2% | 0.5% |
| Lower windows (`lower_windows`) | 8 | 6 |
| Cooldown windows (`cooldown_windows`) | 2 | 1 |
| Per-player influence cap (`per_player_influence_cap_bps`) | 40% | 60% |

Operational guardrails:

- **Outlier-resistant initialization:** Use clipped percentile aggregation at match start, not raw worst-player values.
- **Abuse resistance:** A player with repeated late bursts that do not correlate with RTT/jitter/loss cannot unilaterally push global delay up.
- **Auditability:** Every QoS adjustment is recorded to replay metadata and relay telemetry.
- **Player feedback:** Missed-deadline outcomes should be surfaced with concise in-game indicators to reduce perceived unfairness.

### Rationale

**Netcode parameters are not like graphics settings.** Graphics preferences are subjective (some players prefer performance over visual quality). Netcode parameters have objectively correct values — or correct adaptive algorithms. Exposing the knob creates confusion:

1. **Support burden:** "My game feels laggy" → "What's your tick rate set to?" → "I changed some settings and now I don't know which one broke it."
2. **False blame:** Players blame netcode settings when the real issue is their WiFi or ISP. Exposing knobs gives them something to fiddle with instead of addressing the root cause.
3. **Competitive fragmentation:** If netcode parameters are configurable, tournaments must mandate specific values. Different communities pick different values. Replays from one community don't feel the same on another's settings.
4. **Testing matrix explosion:** Every configurable parameter multiplies the QA matrix. Sub-tick on/off × 5 sync frequencies × 3 debug levels = 30 configurations to test.

The games that got this right — Generals, Factorio, CS2 — all converged on the same philosophy: **invest in adaptive algorithms, not exposed knobs.**

### Alternatives Considered

- **Expose tick rate as a lobby setting** (rejected — unlike game speed, tick rate affects CPU cost, bandwidth, and netcode timing in ways players can't reason about. If 30 tps causes issues on low-end hardware, that's a game speed problem (lower speed = lower effective tps), not a tick rate problem.)
- **Expose latency setting like StarCraft BW** (rejected — BW's Low/High/Extra High was necessary because the game had no adaptive run-ahead. IC has adaptive run-ahead from Generals. The manual setting is replaced by a better automatic system.)
- **Expose sub-tick as a toggle** (rejected — see analysis above. Zero-cost, always-fairer, produces visibly better outcomes in contested actions, CS2 precedent.)
- **Expose everything in "Advanced Network Settings" panel** (rejected — the Spring Engine approach. More controls correlate with more complaints, not fewer.)

### Integration with Existing Decisions

- **D006 (Pluggable Networking):** The `NetworkModel` trait encapsulates all netcode behavior. Parameters are internal to each implementation, not exposed through the trait interface. `LocalNetwork` ignores network parameters entirely (zero delay, no adaptation needed). `RelayLockstepNetwork` manages run-ahead, timing feedback, and anti-lag-switch internally.
- **D007 (Relay Server):** The relay's tick deadline, strike thresholds, and session limits are server admin configuration, not player settings. These map to relay config files, not lobby GUI.
- **D008 (Sub-Tick Timestamps):** Explicitly non-optional per this decision.
- **D015 (Efficiency-First Performance):** Adaptive algorithms (run-ahead, timing feedback) are the "better algorithms" tier of the efficiency pyramid — they solve the problem before reaching for brute-force approaches.
- **D033 (Toggleable QoL):** Game speed is the one netcode-adjacent setting that fits D033's toggle model. All other netcode parameters are engineering constants, not user preferences.
- **D058 (Console):** The `net.*` cvars defined above follow D058's cvar system with appropriate flags. The diagnostic overlay (`net_diag`) is a console command, not a GUI setting.

