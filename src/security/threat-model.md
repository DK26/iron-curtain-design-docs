# 06 — Security & Threat Model

**Keywords:** security, threat model, relay server, lockstep vulnerabilities, maphack, lag switch, replay signing, order validation, ranked trust, anti-cheat, rate limiting, sandboxing

## Fundamental Constraint

In deterministic lockstep, every client runs the full simulation. Every player has **complete game state in memory** at all times. This shapes every vulnerability and mitigation.

## Threat Matrix by Network Model

| Threat                | Relay Server Lockstep   | Authoritative Fog Server |
| --------------------- | ----------------------- | ------------------------ |
| Maphack               | **OPEN**                | **BLOCKED** ✓            |
| Order injection       | Server rejects          | Server rejects           |
| Order forgery         | Server stamps + sigs    | Server stamps + sigs     |
| Lag switch            | **BLOCKED** ✓           | **BLOCKED** ✓            |
| Eavesdropping         | AEAD encrypted          | AEAD encrypted           |
| Packet forgery        | AEAD rejects            | AEAD rejects             |
| Protocol DoS          | Relay absorbs + limits  | Server absorbs + limits  |
| State saturation      | Rate caps ✓             | Rate caps ✓              |
| Desync exploit        | Server-only analysis    | N/A                      |
| Replay tampering      | Signed ✓                | Signed ✓                 |
| WASM mod cheating     | Sandbox                 | Sandbox                  |
| Reconciler abuse      | N/A                     | Bounded + signed ✓       |
| Join code brute-force | Rate limit + expiry     | Rate limit + expiry      |
| Tracking server abuse | Rate limit + validation | Rate limit + validation  |
| Version mismatch      | Handshake ✓             | Handshake ✓              |

**Recommendation:** Relay server is the minimum for ranked/competitive play. Fog-authoritative server for high-stakes tournaments.

**Scope note:** This threat matrix covers gameplay session transport. P2P in Workshop/content distribution (D049/D074) is a separate subsystem with its own trust model.

**A note on lockstep and DoS resilience:** Bryant & Saiedian (2021) observe that deterministic lockstep is surprisingly the *best* architecture for resisting volumetric denial-of-service attacks. Because the simulation halts and awaits input from all clients before progressing, an attacker attempting to exhaust a victim's bandwidth unintentionally introduces lag into their own experience as well. The relay server model adds further resilience — the relay absorbs attack traffic without forwarding it to clients.

## Vulnerability 1: Maphack (Architectural Limit)

### The Problem
Both clients must simulate everything (enemy movement, production, harvesting), so all game state exists in process memory. Fog of war is a rendering filter — the data is always there.

Every lockstep RTS has this problem: OpenRA, StarCraft, Age of Empires.

### Mitigations (partial, not solutions)

**Memory obfuscation** (raises bar for casual cheats):
```rust
pub struct ObfuscatedWorld {
    inner: World,
    xor_key: u64,  // rotated every N ticks
}
```

**Partitioned memory** (harder to scan):
```rust
pub struct PartitionedWorld {
    visible: World,              // Normal memory
    hidden: ObfuscatedStore,     // Encrypted, scattered, decoy entries
}
```

**Actual solution: Fog-Authoritative Server**

> **Full design specification:** For the complete FogAuth server-side sim loop, visibility computation, entity state delta wire format (byte-level), Fiedler priority accumulator algorithm, bandwidth budget model, client reconciler, and deployment cost analysis, see `research/fog-authoritative-server-design.md`.
>
> **FogAuth wire format:** Complete byte-level entity delta format (EntityEnter/Update/Leave with offset tables), bandwidth budget constants (64 KB/s, 2184 bytes/tick, capacity estimates per delta type), and Fiedler priority accumulator algorithm (1024-scale tier constants, staleness bonus formula, starvation timing guarantees) are specified in `research/fog-authoritative-server-design.md`.

Server runs full sim, sends each client only entities they can see. Breaks pure lockstep. Requires server compute per game.

**Client architecture change:** FogAuth clients do not run the full deterministic sim — they maintain a partial world and consume server-sent entity state deltas via a reconciler. This requires a client-side game loop variant beyond the lockstep `GameLoop<N, I>` (see `architecture/game-loop.md`). The `NetworkModel` trait boundary is preserved, but the client loop that drives it differs. See `research/fog-authoritative-server-design.md` § 7 (client reconciler) and § 9 (trait implementation) for the full design. Implementation milestone: `M11` (`P-Optional`).

```rust
// Simplified sketch — full implementation in research/fog-authoritative-server-design.md § 9
pub struct FogAuthClientNetwork {
    outgoing_orders: VecDeque<TimestampedOrder>,
    incoming_updates: VecDeque<FogAuthTickData>,
}
impl NetworkModel for FogAuthClientNetwork {
    fn poll_tick(&mut self) -> Option<TickOrders> {
        // Returns mostly-empty TickOrders; entity state deltas are
        // side-channeled to the reconciler (not through TickOrders).
        // The lockstep GameLoop's sim.apply_tick() is NOT called —
        // a FogAuthGameLoop variant drives the reconciler instead.
    }
}
```

**Trade-off:** Relay server (just forwards orders) = cheap VPS handles thousands of games. Authoritative sim server = real CPU per game.

**Entity prioritization (Fiedler's priority accumulator):** When the fog-authoritative server sends partial state to each client, it must decide *what* to send within the bandwidth budget. Fiedler (2015) devised a priority accumulator that tracks object priority persistently between frames — objects accrue additional priority based on staleness (time since last update). High-priority objects (units in combat, projectiles) are sent every frame; low-priority objects (distant static structures) are deferred but eventually sent. This ensures a strict bandwidth upper bound while guaranteeing no object is permanently starved. Iron Curtain's `FogAuthoritativeNetwork` should implement this pattern: player-owned units and nearby enemies at highest priority, distant visible terrain objects at lowest, with staleness-based promotion ensuring eventual consistency.

**Traffic class segregation:** In FogAuth mode, player *input* (orders) and server *state* (entity updates) have different reliability requirements. Orders are small, latency-critical, and loss-intolerant — best suited for a reliable ordered channel. State updates are larger, frequent, and can tolerate occasional loss (the next update supersedes) — suited for an unreliable channel with delta compression. Bryant & Saiedian (2021) recommend this segregation. A dual-channel approach (reliable for orders, unreliable for state) optimizes both latency and bandwidth.

## Vulnerability 2: Order Injection / Spoofing

### The Problem
Malicious client sends impossible orders (build without resources, control enemy units).

### Mitigation: Deterministic Validation in Sim

```rust
fn validate_order(&self, player: PlayerId, order: &PlayerOrder) -> OrderValidity {
    match order {
        PlayerOrder::Build { structure, position } => {
            let house = self.player_state(player);
            if house.credits < structure.cost() { return Rejected(InsufficientFunds); }
            if !house.has_prerequisite(structure) { return Rejected(MissingPrerequisite); }
            if !self.can_place_building(player, structure, position) { return Rejected(InvalidPlacement); }
            Valid
        }
        PlayerOrder::Move { unit_ids, .. } => {
            for id in unit_ids {
                if self.unit_owner(*id) != Some(player) { return Rejected(NotOwner); }
            }
            Valid
        }
        // Every order type validated
    }
}
```

**Key:** Validation is deterministic and inside the sim. All clients run the same validation → all agree on rejections → no desync. Relay server also validates before broadcasting (defense in depth).

**Scaling consideration (uBO pattern):** At relay scale (thousands of orders/second across many games), the `match` dispatch above is adequate — RTS order type cardinality is low (~20 types). However, if mod-defined order types or conditional validation rules (D028) significantly expand the rule set, a **token-dispatch** pattern — bucketing validators by a discriminant key (order type + context flags), skipping irrelevant validators entirely — would avoid linear scanning. This is the same architecture uBlock Origin uses to evaluate ~300K filter rules in <1ms: extract a discriminating token, look up only the matching bucket (see `research/ublock-origin-pattern-matching-analysis.md`). For most IC deployments, the simple `match` suffices; the dispatch pattern is insurance for heavily modded environments.

## Vulnerability 3: Lag Switch (Timing Manipulation)

### The Problem
Player deliberately delays packets → opponent's game stalls → attacker gets extra thinking time.

### Mitigation: Relay Server with Time Authority

```rust
impl RelayServer {
    fn process_tick(&mut self, tick: u64) {
        let deadline = Instant::now() + self.tick_deadline;
        for player in &self.players {
            match self.receive_orders_from(player, deadline) {
                Ok(orders) => self.tick_orders.add(player, orders),
                Err(Timeout) => {
                    // Missed deadline → always Idle (never RepeatLast —
                    // repeating the last order benefits the attacker)
                    self.tick_orders.add(player, PlayerOrder::Idle);
                    self.player_strikes[player] += 1;
                    // Enough strikes → disconnect
                }
            }
        }
        // Game never stalls for honest players
        self.broadcast_tick_orders(tick);
    }
}
```

Server owns the clock. Miss the window → your orders are replaced with Idle. Lag switch only punishes the attacker. Repeated late deliveries accumulate strikes; enough strikes trigger disconnection. See `03-NETCODE.md` § Order Rate Control for the full three-layer rate limiting system (time-budget pool + bandwidth throttle + hard ceiling).

## Vulnerability 4: Desync Exploit for Information Gathering

### The Problem
Cheating client intentionally causes desync, then analyzes desync report to extract hidden state.

### Mitigation: Server-Side Only Desync Analysis

```rust
pub struct DesyncReport {
    pub tick: u64,
    pub player_hashes: HashMap<PlayerId, u64>,
    // Full state diffs are SERVER-SIDE ONLY
    // Never transmitted to clients
}
```

Never send full state dumps to clients. Clients only learn "desync detected at tick N." Admins can review server-side diffs.

## Vulnerability 5: WASM Mod as Attack Vector

### The Problem
Malicious mod reads entity positions, sends data to external overlay, or subtly modifies local sim.

### Mitigation: Capability-Based API Design

The WASM host API surface IS the security boundary:

```rust
pub struct ModCapabilities {
    pub read_own_state: bool,
    pub read_visible_state: bool,
    // read_fogged_state doesn't exist as a capability — the API function doesn't exist
    pub issue_orders: bool,
    pub filesystem: FileAccess,    // Usually None
    pub network: NetworkAccess,    // Usually None
}

pub enum NetworkAccess {
    None,
    AllowList(Vec<String>),
    // Never unrestricted
}
```

**Key principle:** Don't expose `get_all_units()` or `get_enemy_state()`. Only expose `get_visible_units()` which checks fog. Mods literally cannot request hidden data because the function doesn't exist.

**Timing oracle resistance (F5 closure):** Even without `get_all_units()`, a malicious WASM mod can infer fogged information via timing side channels. `ic_query_units_in_range()` execution time correlates with the total number of units in the spatial index (including fogged units), because the spatial query runs against world state before visibility filtering. A mod measuring host call duration across successive ticks can detect unit movement in fogged regions — a maphack that bypasses the capability model entirely.

**Mitigation:** Host API functions that query spatial data must **filter by the calling player's fog-of-war before performing the query** — not filter results after the query. The query itself operates only on the visibility-filtered entity set, so execution time does not leak fogged entity count. As a defense-in-depth measure, all spatial query host calls are padded to a **constant minimum execution time** (ceiling of worst-case for the map size, sampled at map load). This ensures timing measurements reveal nothing about entity density.

- "Timing oracle resistance" is a WASM host API design principle in `04-MODDING.md` § WASM Sandbox Rules
- In fog-authoritative mode (V1), fogged entities do not exist on the client at all — this timing attack is structurally impossible. This is an additional argument for fog-authoritative in competitive play.
- A proptest property verifies: "For any entity configuration, `ic_query_units_in_range()` execution time does not vary beyond ±5% based on fogged entity count" (see `tracking/testing-strategy.md`).

**Phase:** Timing oracle resistance ships with Tier 3 WASM modding (Phase 4–6). Constant-time spatial queries are a Phase 6 exit criterion.

**WASM network access denial (F10 closure):** WASM mods access the network **exclusively** through host-provided `ic_http_get()` / `ic_http_post()` imports. No WASI networking capabilities are granted. Raw socket, DNS resolution, and TCP/UDP access are never available to WASM modules. The `wasmtime::Config` must explicitly deny all WASI networking proposals — this is a Phase 4 exit criterion. Cross-reference: V43 (DNS rebinding assumes host-mediated network access; this entry confirms that assumption is enforced).
