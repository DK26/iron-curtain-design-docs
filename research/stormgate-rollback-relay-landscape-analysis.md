# Stormgate Rollback, Delta Rollback & RTS Relay Landscape Analysis

> Research for Iron Curtain. Covers the first shipping RTS with rollback netcode, newer rollback cost-reduction techniques, and a comparative catalog of relay-based lockstep architectures in commercial RTS games.
>
> **Date:** 2026-02-27
> **Motivation:** IC's rollback section (03-NETCODE.md §Rollback / GGPO-Style) was written before Stormgate shipped production RTS rollback. This note records the new evidence and evaluates IC implications.

---

## Table of Contents

1. [Stormgate / SnowPlay — Architecture & Rollback](#1-stormgate--snowplay--architecture--rollback)
2. [Delta Rollback — Cost-Reduction Technique](#2-delta-rollback--cost-reduction-technique)
3. [Alternative Rollback Approaches](#3-alternative-rollback-approaches)
4. [Commercial RTS Relay Landscape](#4-commercial-rts-relay-landscape)
5. [IC Implications & Gap Assessment](#5-ic-implications--gap-assessment)

---

## 1. Stormgate / SnowPlay — Architecture & Rollback

### 1.1 What SnowPlay Is

Stormgate (Frost Giant Studios, early access 2024) is built on a dual-engine architecture:

- **SnowPlay** (proprietary, C++): all game logic, pathfinding, unit interactions, fog of war, the deterministic simulation, and rollback netcode.
- **UE5**: rendering, UI, audio, particle effects, non-deterministic visual physics (debris, explosions), input capture.

The deterministic simulation is "completely independent and can be sandboxed and protected from the non-deterministic visualization." UE5 acts purely as a presentation layer. This is architecturally identical to IC's `ic-sim` / `ic-render` separation — the sim produces authoritative state, the renderer reads it.

Chief Architect James Anhalt chose C++ over Rust, Zig, and others because the team are "C++ experts and know it will be performant on day one." SnowPlay's modding layer compiles C++ scripts to **WebAssembly** — parallel to IC's WASM modding tier.

**GDC 2024 talk:** ["Stormgate and SnowPlay: Modernizing RTS on UE5"](https://dev.epicgames.com/community/learning/talks-and-demos/pwm8/unreal-engine-stormgate-and-snowplay-modernizing-rts-on-ue5-gdc-2024)

### 1.2 Key Technical Parameters

| Parameter | Stormgate/SnowPlay | IC (relay lockstep) | SC2 | AoE IV | Spring/Recoil |
|---|---|---|---|---|---|
| Tick rate | 64 Hz | 30 Hz | ~22.4 Hz | ~8 Hz | 30 Hz |
| Netcode model | Rollback | Relay lockstep + sub-tick | Lockstep (static delay) | Lockstep | Server-auth lockstep |
| Threading | Single-threaded sim | Single-threaded sim (Bevy FixedUpdate) | Unknown | Unknown | Single-threaded sim |
| Determinism | Sandboxed sim (details undisclosed) | Fixed-point math (i32/i64), no floats | Deterministic (details undisclosed) | Cross-platform issues (Linux desync fix Jan 2024) | x86-64 only |
| Max units | ~1,300 per game | Design target TBD | ~400 practical | ~200 practical | 3,000+ |
| Stall policy | Never stalls (rollback predicts) | Never stalls (relay drops late orders) | Stalls on late input | Stalls on late input | Stalls on late input |

### 1.3 How Stormgate's Rollback Works

Stormgate claims to be the **first RTS to implement rollback netcode** — a technique previously confined to fighting games. The mechanism:

1. Each client simulates forward using **only local input** — it does not wait for the opponent's input to arrive.
2. When the opponent's input arrives (possibly late), the engine **rolls back** to the tick where that input should have been applied.
3. It **re-simulates forward** from that point using the correct inputs.
4. The game snaps to the corrected state. In most cases, this happens invisibly.

**Why RTS rollback is feasible (Anhalt's key insight):** Professional RTS players average 50–350 APM, which is fewer than 6 actions per second. Input streams are far sparser than in fighting games. This means:

- Mispredictions are rare (most ticks have no remote input to mis-predict).
- When rollbacks occur, the corrected state often matches the predicted state.
- Re-simulation budget is manageable for the typical case.

### 1.4 Performance vs. SC2 (Anhalt's Published Benchmarks)

Despite 64 Hz (3× SC2's tick rate):

| Metric | SnowPlay vs. SC2 |
|---|---|
| Fog of war | ~30× faster than SC2's original 4 Hz implementation |
| Per-unit CPU cost | ~50% of SC2 |
| Pathfinding mesh memory | Less than SC2 |
| Total sim CPU | ~14% less than SC2 (Anhalt's example calculation) |

These numbers explain how 64 Hz + rollback re-simulation fits in the CPU budget: if per-tick cost is roughly half of SC2's at 3× the tick rate, the total sim cost is comparable, leaving headroom for occasional re-simulation.

### 1.5 Server Infrastructure (Hathora)

Stormgate uses **Hathora** (serverless game hosting) for on-demand per-match server provisioning:

- **Pragma** (backend engine) handles matchmaking and signals Hathora to spin up a server in the optimal region for each match.
- Servers are **deprovisioned** after the match ends.
- Load-tested to **1.1 million CCU** (exceeded 1M target).

Scale bottlenecks encountered during testing:

| Scale | Bottleneck | Solution |
|---|---|---|
| 10k CCU | DB query rate exceeded 50k/s, maxed API server CPU | Optimized DB layer + horizontal scaling |
| 100k CCU | Game server sidecars creating persistent DB connections | Shifted from push to pull model with dedicated metrics backend |
| 1M CCU | Kubernetes control plane CPU saturation | Vertical scaling of control plane + larger nodes |

Each EC2 instance simulated ~6,300 players per vCPU. Room creation rate: 30 new matches/second (~100k matches/hour).

### 1.6 What Remains Undisclosed

The following technical details have **not** been publicly confirmed despite extensive searching:

- Snapshot/state serialization format for rollback checkpoints
- Rollback window depth (how many ticks back the system can rewind)
- Snapshot sizes (memory footprint per checkpoint)
- Whether fixed-point math is used (strongly implied but unconfirmed)
- RNG seeding strategy
- State diff vs. full snapshot during rollback
- Re-simulation time budget (max ms per visual frame)
- Desync recovery (recover vs. terminate)

### 1.7 Known Issues (Community-Reported)

- Persistent connection losses during 1v1 games
- Units becoming uncontrollable mid-game (possibly rollback edge cases)
- "Unexpected network error" reports on Steam forums
- Frost Giant reports their **only desyncs were caused by bugs in desync detection code and undetected memory corruption** — not actual simulation divergence

These appear to be infrastructure/connectivity issues rather than fundamental rollback architecture problems.

---

## 2. Delta Rollback — Cost-Reduction Technique

### 2.1 The Problem with Traditional Rollback for Large State

Traditional rollback (GGPO-style) requires three expensive operations every tick:

1. **Snapshot the entire game state** (serialize everything for potential rewind).
2. **Detect misprediction** (compare against authoritative inputs when they arrive).
3. **Resimulate N frames** (roll back to divergence, replay forward with correct inputs).

At 60 FPS with 15-frame rollback window, re-simulation must fit in ~1.1 ms per tick. In many implementations, **snapshotting alone takes longer than running the simulation** (SnapNet). For RTS with hundreds/thousands of entities, full-snapshot rollback is prohibitively expensive.

### 2.2 Delta Rollback (David Dehaene, 2024)

Core insight: **most synchronized objects do not change on most ticks.** Measurements in the shipping game Jewel Run showed **only ~5% of synchronized objects changed state on any given frame**.

**How it works:**

1. A **Property Manager** intercepts all property mutations via `set_synced()`.
2. For each change, it records: previous value, new value, tick number.
3. **Rollback = reverse-apply deltas.** Walk the delta log backward to the target tick, restoring old values. No full deserialization.
4. Objects unchanged for longer than `max_rollback_window` are **excluded** from save/load entirely (skip-unchanged optimization). Re-armed only when they change again.

**Cost characteristics:**

| Operation | Traditional GGPO | Delta Rollback |
|---|---|---|
| Save per tick | O(total state) | O(changed properties) — ~5% |
| Memory | N full copies | Delta records only |
| Rollback restore | Full state load | Reverse-apply deltas |
| Re-simulation | Same | Same |

**Asymmetric design:** Backward rollback (rewinding) is optimized for speed; forward execution (replays, late-join) can tolerate slight penalties.

**Implementation:**

- Core rewritten in C++ as a GDExtension (originally GDScript).
- Godot 4.2+, MIT license.
- Repository: [GitLab — BimDav/delta-rollback](https://gitlab.com/BimDav/delta-rollback) (v0.7)
- Mismatch detection via `HashSerializer` per tick for peer comparison.
- Shipped in Jewel Run (10-player multiplayer action game) without rollback-induced performance problems — a scenario where traditional full-snapshot rollback would be unworkable.

**Source:** [Delta Rollback: New optimizations for Rollback Netcode (Medium)](https://medium.com/@david.dehaene/delta-rollback-new-optimizations-for-rollback-netcode-7d283d56e54b)

### 2.3 Worst-Case Scenarios

- **Mass state change:** An ability that damages all units on the map dirties ~100% of entities. Delta log for that tick approaches full-snapshot cost. Mitigation: fall back to full snapshot when change ratio exceeds a threshold.
- **High rollback distance + high churn:** Both network latency and game activity peaking simultaneously makes delta log replay expensive. Spiral-of-death risk remains.
- **Delta log memory spikes:** Bursty changes (explosions, mass spawns) create large delta entries. Ring-buffer with pre-allocated capacity prevents allocation pressure.

---

## 3. Alternative Rollback Approaches

### 3.1 MMU Dirty-Page Tracking (FaultyPine/incremental-rollback)

Uses hardware MMU dirty bits to detect changed memory pages without manual annotation. On Windows, `GetWriteWatch` API exposes dirty pages to userspace.

Measured in Brawl/Project+ (Wii emulator, ~80 MB state):

| Operation | Cost |
|---|---|
| Non-rollback frame savestate | ~1 ms |
| Dirty pages per frame | ~1,500 pages (typical) |
| 7-frame rollback + resim | ~16 ms total |

**Advantage:** Captures all memory changes with zero manual annotation — eliminates a class of desync bugs. **Limitation:** Windows-only (`GetWriteWatch`); page granularity (4 KB) means scattered writes are expensive.

Source: [GitHub — FaultyPine/incremental-rollback](https://github.com/FaultyPine/incremental-rollback)

### 3.2 Contiguous Memory Block (INVERSUS)

All game state lives in a single pre-allocated ~1 MB contiguous block. Snapshot = memcpy; restore = memcpy back. 20-frame rollback at 60 FPS. Only works for small, bounded game state — would not scale to RTS without delta optimization.

Source: [Rollback Networking in INVERSUS (Game Developer)](https://www.gamedeveloper.com/design/rollback-networking-in-inversus)

### 3.3 ECS Circular Buffer (bevy_timewarp)

Maintains `ComponentHistory<T>` — a circular buffer of the last N frames per component per entity. No dirty detection: clones components every frame regardless of change. Memory scales as O(entities × components × buffer_depth). Viable for small entity counts but prohibitive for RTS-scale.

Source: [GitHub — RJ/bevy_timewarp](https://github.com/RJ/bevy_timewarp)

### 3.4 Comparative Summary

| Approach | Save Cost/Tick | Memory | Rollback Cost | RTS Suitability |
|---|---|---|---|---|
| Full-state copy (GGPO) | O(total state) | N full copies | Restore + resim | Poor for large state |
| Delta Rollback (BimDav) | O(changed properties) | Delta records only | Reverse-apply deltas + resim | Good (~5% touched/tick) |
| MMU dirty pages | O(dirty pages) | Page-granularity copies | Restore base + apply deltas | Good but platform-specific |
| Contiguous block (INVERSUS) | O(1) memcpy | N full copies, bounded | O(1) memcpy + resim | Small state only |
| ECS circular buffer | O(all tracked components) | N × components × entities | Overwrite + resim | Poor without dirty tracking |

---

## 4. Commercial RTS Relay Landscape

### 4.1 Catalog of Known Relay-Based Lockstep in Shipping RTS

| Game | Year | Relay Type | Protocol | Relay Does Game Logic? | Sub-tick? | Anti-lag-switch? |
|---|---|---|---|---|---|---|
| **AoE2: DE** | 2019 | Always-on TLS/TCP dumb proxy | TCP/TLS | No | No | No |
| **StarCraft 2** | 2010 | Central Blizzard relay | Undisclosed | No (command relay) | No | No |
| **SC: Remastered** | 2017 | Conditional proxy (NAT fallback) | UDP direct, proxy if needed | No | No | No |
| **WC3: Reforged** | 2020 | Proxy for IP masking | P2P through proxy | No | No | No |
| **Stormgate** | 2024 | Dedicated per-match server (Hathora) | Undisclosed | Rollback authority | N/A (rollback) | N/A (rollback) |
| **Planetary Annihilation** | 2014 | True authoritative server | Proprietary | **Yes** (full sim) | N/A | N/A |
| **Iron Curtain** (design) | — | Relay with time authority (RelayCore) | UDP + custom reliability | **No** (order relay + timing authority) | **Yes** (D008) | **Yes** (D007) |

**Key observation:** Every confirmed relay-based lockstep RTS uses a **dumb relay** — the server forwards packets, hides IPs, and handles NAT, but does zero game-level processing. IC's relay is unique in the lockstep category: it acts as **timing authority** (canonical tick deadlines, sub-tick normalization, lag-switch detection) without running the sim. This is a strictly richer role than any shipping lockstep relay.

### 4.2 AoE2:DE Relay — Technical Details

From reverse engineering by RedRocket and community projects (librematch, ageLANServer):

- Traffic over **TLS/TCP** to Microsoft relay servers, replacing the original game's direct UDP P2P.
- The relay is a **dumb proxy** — no game-level processing, no state validation, no anti-cheat.
- "There seem to be no sanity checks whatsoever" on command validation (RedRocket) — players can invoke functions controlling opponent units.
- Authentication uses Steam's `createEncryptedAppTicket` with RLINK buffer.
- LAN server projects replace the HTTPS API surface and install self-signed certificates.
- Lobby updates via **WebSocket** push notifications.
- LAN discovery via **UDP multicast** on ports 9999/8888.

**IC comparison:** IC's relay adds timing authority, order validation (D012), behavioral analysis (Kaladin), sub-tick normalization, anti-lag-switch, replay signing, and QoS auto-profile — none of which AoE2:DE's dumb proxy provides. The AoE2:DE model is the closest commercial precedent to IC's architecture but IC improves on every dimension except simplicity.

### 4.3 The Bettner/Terrano Paper — Still-Relevant Insights (GDC 2001)

"1500 Archers on a 28.8" (AoE1/AoE2 networking, Paul Bettner & Mark Terrano):

- **Two-turn-ahead scheduling:** Commands issued during turn N execute during turn N+2. This allows receipt and acknowledgment while gameplay continues.
- **Dynamic turn length:** Adjusted based on frame rate (2 bytes per message) and RTT. Rapid increases, gradual decreases.
- **Application-layer reliability on UDP:** Messages tagged with target execution turn and sequence numbers. Anticipatory retransmission when ACKs exceed predicted timing.
- **Determinism as the hardest bug class:** "Subtle differences (misaligned map objects) cascaded over time." Desyncs are silent until they compound.

IC already adopts the core patterns (command scheduling, adaptive timing, UDP + app-layer reliability) and improves on each: sub-tick ordering within turns, relay-canonical timestamps instead of peer-agreed scheduling, and multi-level desync debugging instead of silent cascade.

Source: [1500 Archers on a 28.8 (Gamedeveloper)](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond), [Yale PDF](https://zoo.cs.yale.edu/classes/cs538/readings/papers/terrano_1500arch.pdf)

---

## 5. IC Implications & Gap Assessment

### 5.1 Stormgate Validates: RTS Rollback Is Production-Viable

IC's rollback section (03-NETCODE.md:1148–1150) says: "Expensive for RTS (re-simulating hundreds of entities), but feasible with Rust's performance." This was written before Stormgate shipped it. Stormgate has now demonstrated production viability at 64 tps with ~1,300 units.

**IC should note the existence proof but the design choice remains sound.** IC's relay-lockstep-with-sub-tick achieves the same no-stall guarantee as rollback (relay drops late orders instead of stalling) without:

- Re-simulation CPU cost on every misprediction
- Rollback visual artifacts ("events triggered then un-triggered" — Frost Giant's acknowledged edge case)
- The memory overhead of state checkpointing every tick
- The complexity of rollback-safe code across the entire sim

The tradeoff is explicit: IC accepts ~1 tick of input delay (33 ms at 30 tps) in exchange for simpler code, zero re-simulation cost, and architecturally guaranteed fairness (relay-canonical timing). Stormgate accepts zero perceived input delay in exchange for re-simulation cost and visual correction artifacts.

Both approaches avoid the stall problem that plagues traditional lockstep (SC2, AoE, 0 A.D.).

### 5.2 Delta Rollback Strengthens the M11 Deferred Path

If the M11 rollback experiment ever happens, delta rollback directly addresses IC's stated cost concern. The technique maps naturally to Bevy ECS:

1. **Bevy's built-in change detection** (`Changed<T>`, `Added<T>` query filters) provides the dirty flag that Delta Rollback's Property Manager implements manually.
2. **Component-level deltas:** Track only components that changed since the last confirmed tick. Store `(entity, ComponentTypeId, old_value, tick)` tuples.
3. **Rollback = reverse-apply deltas:** Walk the delta log backward to the target tick, restoring old values. Then resimulate forward.
4. **Memory bound:** Delta log size is bounded by `max_rollback_window × average_changes_per_tick`. At ~5% entity churn per tick, this is dramatically smaller than N full snapshots.

**Recommendation for M11:** If the rollback experiment is ever pursued, delta rollback (not full-snapshot GGPO) should be the baseline approach. The Bevy ECS architecture gives IC a natural advantage here that Stormgate's raw C++ struct approach doesn't have.

### 5.3 AoE2:DE Validates IC's Relay Architecture (Not Already Cited)

IC's relay design docs cite Generals' "packet router" and Quilkin's filter chain as precedents but do not cite AoE2:DE. AoE2:DE is the closest commercial precedent — it's literally a TLS relay proxy for lockstep RTS. IC improves on it in every dimension (UDP transport, timing authority, order validation, anti-cheat, sub-tick ordering). Adding AoE2:DE as a validating reference strengthens the design rationale.

### 5.4 Serverless/On-Demand Relay Provisioning

Stormgate's Hathora integration demonstrates on-demand per-match server provisioning at scale (1M CCU). IC's `RelayCore` library design already enables this pattern — it's a Rust library anyone can embed or deploy. D052 (community servers) and 15-SERVER-GUIDE describe dedicated and embedded relay modes but don't explicitly discuss cloud-native deployment patterns (containers, serverless, auto-scaling). This is an operational concern worth a brief note in the server guide, not an architectural gap.

### 5.5 No Design Changes Required

Stormgate's existence does not invalidate IC's architecture. The two designs solve the same problems (stall elimination, fairness, competitive integrity) through different mechanisms:

| Property | IC (relay lockstep) | Stormgate (rollback) |
|---|---|---|
| Stall elimination | Relay drops late orders | Client predicts, rolls back |
| Perceived input delay | ~33 ms (1 tick at 30 tps) | ~0 ms (local prediction) |
| Fairness guarantee | Relay-canonical sub-tick ordering | Server timestamps inputs |
| CPU cost | Fixed (no re-simulation) | Variable (re-simulation on misprediction) |
| Code complexity | Lower (no rollback-safe invariants) | Higher (entire sim must be rewindable) |
| Visual artifacts | None (sim is always authoritative) | Possible (rollback corrections) |
| Sim determinism burden | Standard (all clients must agree) | Heavier (re-simulation must exactly match) |

IC's approach is the conservative, correct-by-construction choice. Stormgate's is the aggressive, lower-latency choice. Both are valid. IC preserves the ability to experiment with rollback via M11 without committing to it now.

---

## Sources

### Stormgate / SnowPlay
- [Stormgate and SnowPlay: Modernizing RTS on UE5 — GDC 2024 (Epic Games)](https://dev.epicgames.com/community/learning/talks-and-demos/pwm8/unreal-engine-stormgate-and-snowplay-modernizing-rts-on-ue5-gdc-2024)
- [James Anhalt & Tim Morten Interview: SnowPlay Technology (Screen Rant)](https://screenrant.com/james-anhalt-tim-morten-interview-snowplay-technology-stormgate/)
- [Andrew Sabri / Digital Foundry on SnowPlay (Stormgate Nexus)](https://www.stormgatenexus.com/article/digital-foundry-snowplay-tech)
- [December Dev Update: Rollback Netcode (Stormgate Nexus)](https://www.stormgatenexus.com/article/december-dev-update-rollback-netcode-and-art)
- [What is Stormgate's SnowPlay Engine? (Stormgate Hub)](https://stormgatehub.com/what-is-stormgates-snowplay-engine/)
- [Stormgate First RTS with Rollback Netcode (Niche Gamer)](https://nichegamer.com/stormgate-first-rts-rollback-netcode/)
- [Launching Stormgate Demo during Steam Next Fest (Hathora Blog)](https://blog.hathora.dev/launching-stormgates-open-demo-during-steams-next-fest/)
- [Scaling to 1 Million CCU (Hathora Blog)](https://blog.hathora.dev/1-million-ccu/)
- [Serverless Gaming: Frost Giant × Hathora (Stormgate Nexus)](https://www.stormgatenexus.com/article/serverless-gaming-frost-giant-hathora-deal)

### Delta Rollback
- [Delta Rollback: New optimizations for Rollback Netcode (David Dehaene, Medium)](https://medium.com/@david.dehaene/delta-rollback-new-optimizations-for-rollback-netcode-7d283d56e54b)
- [BimDav/delta-rollback (GitLab, MIT)](https://gitlab.com/BimDav/delta-rollback)
- [David Dehaene (LinkedIn)](https://fr.linkedin.com/posts/david-dehaene-5a88b595_delta-rollback-new-optimizations-for-rollback-activity-7217157210731081730-Hbir)

### Alternative Rollback Approaches
- [FaultyPine/incremental-rollback (GitHub)](https://github.com/FaultyPine/incremental-rollback)
- [Rollback Networking in INVERSUS (Game Developer)](https://www.gamedeveloper.com/design/rollback-networking-in-inversus)
- [RJ/bevy_timewarp (GitHub)](https://github.com/RJ/bevy_timewarp)
- [nilpunch/massive-ecs (GitHub)](https://github.com/nilpunch/massive-ecs)

### Commercial RTS Relay Landscape
- [AoEZone: AoE2 DE is still P2P, just proxied via a server](https://aoezone.net/threads/aoe2-de-is-still-p2p-just-proxied-via-a-server.188687/)
- [RedRocket: Reversing Age of Empires 2: Definitive Edition](https://redrocket.club/posts/age_of_empires/)
- [librematch/rlink-lan-server_go (GitHub)](https://github.com/librematch/rlink-lan-server_go)
- [luskaner/ageLANServer (GitHub)](https://github.com/luskaner/ageLANServer)
- [1500 Archers on a 28.8 (Gamedeveloper)](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond)
- [1500 Archers on a 28.8 (Yale PDF)](https://zoo.cs.yale.edu/classes/cs538/readings/papers/terrano_1500arch.pdf)
- [OpenSAGE Networking Memo (GitHub Issue #34)](https://github.com/OpenSAGE/OpenSAGE/issues/34)
- [TeamLiquid: StarCraft 2 Networking Model](https://tl.net/forum/starcraft-2/338578-starcraft-2-networking-model)
- [SnapNet: Netcode Architectures Part 1 — Lockstep](https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/)
- [SnapNet: Netcode Architectures Part 2 — Rollback](https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/)
- [Valve Steam Datagram Relay Documentation](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)
