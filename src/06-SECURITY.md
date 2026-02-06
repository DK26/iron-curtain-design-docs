# 06 — Security & Threat Model

## Fundamental Constraint

In deterministic lockstep, every client runs the full simulation. Every player has **complete game state in memory** at all times. This shapes every vulnerability and mitigation.

## Threat Matrix by Network Model

| Threat | Pure P2P Lockstep | Relay Server Lockstep | Authoritative Fog Server |
|--------|-------------------|----------------------|------------------------|
| Maphack | **OPEN** | **OPEN** | **BLOCKED** ✓ |
| Order injection | Sim rejects | Server rejects | Server rejects |
| Lag switch | **OPEN** | **BLOCKED** ✓ | **BLOCKED** ✓ |
| Desync exploit | Possible | Server-only analysis | N/A |
| Replay tampering | **OPEN** | Signed ✓ | Signed ✓ |
| WASM mod cheating | Sandbox | Sandbox | Sandbox |
| Reconciler abuse | N/A | N/A | Bounded + signed ✓ |

**Recommendation:** Relay server is the minimum for ranked/competitive play. Fog-authoritative server for high-stakes tournaments.

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
Server runs full sim, sends each client only entities they can see. Breaks pure lockstep. Requires server compute per game.

```rust
pub struct FogAuthoritativeNetwork {
    known_entities: HashSet<EntityId>,
}
impl NetworkModel for FogAuthoritativeNetwork {
    fn poll_tick(&mut self) -> Option<TickOrders> {
        // Returns orders AND visibility deltas:
        // "Entity 47 entered your vision at (30, 8)"
        // "Entity 23 left your vision"
    }
}
```

**Trade-off:** Relay server (just forwards orders) = cheap VPS handles thousands of games. Authoritative sim server = real CPU per game.

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
                    self.player_budgets[player].strikes += 1;
                    if strikes > 3 {
                        // Drop or use last known orders
                        self.tick_orders.add(player, PlayerOrder::RepeatLast);
                    } else {
                        self.tick_orders.add(player, PlayerOrder::Idle);
                    }
                }
            }
        }
        // Game never stalls for honest players
        self.broadcast_tick_orders(tick);
    }
}
```

Server owns the clock. Miss the window → your orders are dropped. Lag switch only punishes the attacker.

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

## Vulnerability 6: Replay Tampering

### The Problem
Modified replay files to fake tournament results.

### Mitigation: Signed Hash Chain

```rust
pub struct SignedReplay {
    pub data: ReplayData,
    pub server_signature: Ed25519Signature,
    pub hash_chain: Vec<(u64, u64)>,  // tick, cumulative_hash
}

impl SignedReplay {
    pub fn verify(&self, server_public_key: &PublicKey) -> bool {
        // 1. Verify server signature
        // 2. Verify hash chain integrity (tampering any tick invalidates all subsequent)
    }
}
```

## Vulnerability 7: Reconciler as Attack Surface

### The Problem
If the client accepts "corrections" from an external authority (cross-engine reconciler), a fake server could send malicious corrections.

### Mitigation: Bounded and Authenticated Corrections

```rust
fn is_sane_correction(&self, c: &EntityCorrection) -> bool {
    match &c.field {
        CorrectionField::Position(new_pos) => {
            let current = self.sim.entity_position(c.entity);
            let max_drift = MAX_UNIT_SPEED * self.ticks_since_sync;
            current.distance_to(new_pos) <= max_drift
        }
        CorrectionField::Credits(amount) => {
            *amount >= 0 && 
            (*amount - self.last_known_credits).abs() <= MAX_CREDIT_DELTA
        }
    }
}
```

All corrections must be: signed by the authority, bounded to physically possible values, and rejectable if suspicious.
