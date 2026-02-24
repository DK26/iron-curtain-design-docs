## D029: Cross-Game Component Library (Phase 2 Targets)

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 2 (stretch goal — target Phase 2, can slip to early Phase 3 without blocking)
- **Execution overlay mapping:** `M2.SIM.CROSS_GAME_COMPONENTS` (P-Core); D028 is the hard Phase 2 gate, D029 components are high-priority targets with phased fallback
- **Deferred features / extensions:** Game-module-specific variants (RA2 prism forwarding, TS subterranean) added when those game modules ship
- **Deferral trigger:** Game module milestone start
- **Canonical for:** 7 first-party reusable gameplay systems that serve multiple C&C titles and the broader RTS modding community
- **Scope:** `ic-sim` (components + systems), game module registration, `04-MODDING.md`
- **Decision:** IC ships 7 cross-game component systems as first-party engine features: mind control, carrier/spawner, teleport networks, shields, upgrade system, delayed weapons, and dual asset rendering. These are ECS components and systems — not mod-level WASM — because they are required by multiple game modules (RA2, TS, C&C3) and by major OpenRA total conversion mods (Combined Arms, Romanov's Vengeance).
- **Why:**
  - OpenRA's biggest mods (CA, RV) implement these via custom C# DLLs — IC must provide them natively since there's no C# runtime (Invariant #3)
  - Every C&C title beyond RA1 needs at least 3 of these systems (RA2: mind control, carriers, shields, teleports; TS: shields, upgrades, delayed weapons)
  - First-party components are deterministic by construction; mod-level WASM implementations would need extra validation
  - Reusable across game modules without importing foreign game code (D026 mod composition)
- **Non-goals:** Hardcoding game-specific tuning. All 7 systems are YAML-configurable. Game modules and mods customize behavior through data, not code.
- **Invariants preserved:** Deterministic sim (all fixed-point), no floats in ic-sim, no C#, trait-abstracted (D041)
- **Dependencies:** D028 (conditions/multipliers — foundation), D041 (trait abstraction — system registration)
- **Public interfaces / types / commands:** See component table below
- **Affected docs:** `08-ROADMAP.md` § Phase 2, `11-OPENRA-FEATURES.md`, `12-MOD-MIGRATION.md` § Seven Built-In Systems
- **Keywords:** cross-game, mind control, carrier, spawner, teleport, shield, upgrade, delayed weapon, dual asset, reusable component, Phase 2

---

### The Seven Systems

#### 1. Mind Control

Controller entity takes ownership of target. Capacity-limited. On controller death, controlled units either revert or die (YAML-configurable).

```rust
pub struct MindController {
    pub capacity: u32,
    pub controlled: Vec<EntityId>,
    pub range: i32,
    pub link_actor: Option<ActorId>,  // visual link (e.g., ArcLaserZap)
}

pub struct MindControllable {
    pub controller: Option<EntityId>,
    pub on_controller_death: OnControllerDeath,  // Revert | Kill | Permanent
}
```

**Used by:** Yuri (RA2), Mastermind (YR), Scrin (C&C3), Combined Arms

#### 2. Carrier/Spawner

Master entity manages a pool of slave drones. Drones attack autonomously, return to master for rearm, respawn on timer.

```rust
pub struct CarrierMaster {
    pub max_slaves: u32,
    pub spawn_type: ActorId,
    pub respawn_delay: u32,     // ticks between respawns
    pub slaves: Vec<EntityId>,
    pub leash_range: i32,       // max distance from master
}

pub struct CarrierSlave {
    pub master: EntityId,
}
```

**Used by:** Aircraft Carrier (RA2), Kirov drones, Scrin Mothership, Helicarrier (CA)

#### 3. Teleport Network

Buildings form a network. Units entering one node exit at a designated primary exit. Network breaks if nodes are destroyed or captured.

```rust
pub struct TeleportNode {
    pub network_id: NetworkId,
    pub is_primary_exit: bool,
}

pub struct Teleportable {
    pub valid_networks: Vec<NetworkId>,
}
```

**Used by:** Chronosphere (RA2), Nod Temple teleport (TS), mod-defined networks

#### 4. Shield System

Absorbs damage before health. Recharges after delay. Can be depleted and disabled.

```rust
pub struct Shield {
    pub max_hp: i32,
    pub current_hp: i32,
    pub recharge_rate: i32,       // HP per tick
    pub recharge_delay: u32,      // ticks after damage before recharging
    pub absorb_percentage: i32,   // 100 = absorbs all damage before health
}
```

**Used by:** Scrin units (C&C3), Force Shield (RA2), modded shielded units (CA)

#### 5. Upgrade System

Per-unit or per-player tech upgrades unlocked via building research. Grants conditions that enable multipliers or new abilities.

```rust
pub struct Upgradeable {
    pub available_upgrades: Vec<UpgradeId>,
    pub applied: Vec<UpgradeId>,
}

pub struct UpgradeDef {
    pub id: UpgradeId,
    pub prerequisite: Option<ActorId>,  // building that must exist
    pub conditions_granted: Vec<ConditionId>,  // integrates with D028
    pub cost: i32,
    pub build_time: u32,
}
```

**Used by:** C&C Generals upgrade system, RA2 elite upgrades, TS Nod tech upgrades

#### 6. Delayed Weapons

Time-delayed effects attached to targets or terrain. Poison, radiation, timed explosives.

```rust
pub struct DelayedEffect {
    pub warheads: Vec<WarheadId>,
    pub ticks_remaining: u32,
    pub target: DelayedTarget,      // Entity(EntityId) | Ground(WorldPos)
    pub repeat: Option<u32>,        // repeat interval (0 = one-shot)
}
```

**Used by:** Radiation (RA2 desolator), Tiberium poison (TS), C4 charges, ion storm effects

#### 7. Dual Asset Rendering

Runtime-switchable asset quality per entity — classic sprites vs HD remastered assets. Presentation-only; sim state is identical regardless of rendering mode.

This component lives in `ic-game` (not `ic-sim`) since it is purely visual. Included in this list because it requires engine-level asset pipeline support, not mod-level work.

**Used by:** C&C Remastered Collection compatibility mode, any mod offering classic/HD toggle

### Phase Scope

| System | Phase 2 Target | Early Phase 3 Fallback |
|--------|:-:|:-:|
| Mind Control | Yes | — |
| Carrier/Spawner | Yes | — |
| Teleport Network | Yes | — |
| Shield System | Yes | — |
| Upgrade System | Yes | — |
| Delayed Weapons | Yes | — |
| Dual Asset Rendering | Yes | Acceptable slip |

D028 systems (conditions, multipliers, damage pipeline) are non-negotiable Phase 2 exit criteria. D029 systems are independently scoped — any that slip are early Phase 3 work, not blockers.

### Cross-Game Reuse Matrix

| System | RA1 | RA2/YR | TS | C&C3 | Mods (CA, RV) |
|--------|:---:|:------:|:--:|:----:|:--------------:|
| Mind Control | — | Yes | — | Yes | Yes |
| Carrier/Spawner | — | Yes | — | Yes | Yes |
| Teleport Network | — | Yes | Yes | — | Yes |
| Shield System | — | Yes | — | Yes | Yes |
| Upgrade System | — | Yes | Yes | Yes | Yes |
| Delayed Weapons | — | Yes | Yes | Yes | Yes |
| Dual Asset | — | — | — | — | Yes |

### Rationale

OpenRA mods that need these systems today must implement them as custom C# DLLs (e.g., Combined Arms loads 5 DLLs). IC replaces DLL stacking with first-party components that are deterministic, YAML-configurable, and available to all game modules without code dependencies. This is the concrete implementation of D026's mod composition strategy: layered mod dependencies instead of fragile DLL stacking.
