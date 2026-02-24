## D028: Conditions & Multiplier System

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 2 (exit criterion — condition system and multiplier stack must be fully operational)
- **Execution overlay mapping:** `M2.SIM.COMBAT_PIPELINE` (P-Core); `condition_system()` at tick step 14, multiplier resolution embedded in every stat-reading system
- **Deferred features / extensions:** Conditional modifiers in YAML (Tier 1.5, available Phase 2 but full filter vocabulary grows through Phase 4)
- **Canonical for:** Condition grant/revoke system, multiplier stack evaluation, `StatModifiers` component, conditional modifiers in YAML
- **Scope:** `ic-sim` (systems/conditions.rs, components), `04-MODDING.md` § Conditional Modifiers
- **Decision:** IC uses a ref-counted named-condition system (`Conditions` component) plus a per-entity modifier stack (`StatModifiers` component). Conditions are granted and revoked by dedicated systems (movement, damage state, deploy, veterancy, terrain, etc.). Every numeric stat resolves through the modifier stack: bonuses additive first, multipliers multiplicative second. All arithmetic is fixed-point — no floats in ic-sim.
- **Why:**
  - Conditions are OpenRA's **#1 modding primitive** — 34 `GrantCondition*` traits create dynamic behavior purely in YAML
  - Multiplier stacking (veterancy, terrain, crates, conditions) is the core damage/speed/range tuning mechanism
  - Fixed-point modifier arithmetic preserves deterministic sim (Invariant #1)
  - YAML-declarative conditions let 80% of gameplay customization stay in Tier 1 (no Lua required)
- **Non-goals:** Exposing condition internals to Lua directly (Lua reads condition state but does not bypass the grant/revoke system). Floating-point multipliers.
- **Invariants preserved:** Deterministic sim (fixed-point only), no floats in ic-sim, condition evaluation order is deterministic per tick
- **Public interfaces / types / commands:** `Conditions`, `ConditionId`, `StatModifiers`, `ConditionalModifier`, `ModifierEffect`, `condition_system()`
- **Affected docs:** `02-ARCHITECTURE.md` § System Pipeline (step 14), `04-MODDING.md` § Conditional Modifiers, `11-OPENRA-FEATURES.md` §2–3
- **Keywords:** condition, grant, revoke, multiplier, modifier stack, damage multiplier, speed multiplier, veterancy, StatModifiers, ConditionId, fixed-point

---

### Condition System

Conditions are named boolean flags on entities. They are ref-counted — multiple sources can grant the same condition, and the condition remains active until all sources revoke it.

**Rust sketch:**

```rust
/// Per-entity condition state. Ref-counted so multiple sources can grant the same condition.
pub struct Conditions {
    active: HashMap<ConditionId, u32>,  // name → grant count
}

impl Conditions {
    pub fn grant(&mut self, id: ConditionId) { *self.active.entry(id).or_insert(0) += 1; }
    pub fn revoke(&mut self, id: ConditionId) { /* decrement, remove at 0 */ }
    pub fn is_active(&self, id: &ConditionId) -> bool { self.active.get(id).copied().unwrap_or(0) > 0 }
}
```

**Condition sources** (each a separate system or component hook):

| Source | Grants When | Example |
|--------|-------------|---------|
| `on_movement` | Entity is moving | `moving` |
| `on_damage_state` | Health crosses threshold | `damaged`, `critical` |
| `on_deploy` | Entity deploys/undeploys | `deployed` |
| `on_veterancy` | XP level reached | `veteran`, `elite`, `heroic` |
| `on_terrain` | Entity occupies terrain type | `on_road`, `on_snow` |
| `on_attack` | Entity fires weapon | `firing` |
| `on_idle` | Entity has no orders | `idle` |

**Condition consumers:** Any component field can declare `requires:` or `disabled_by:` conditions in YAML. The runtime checks `conditions.is_active()` before the component's system processes that entity.

**YAML (IC-native):**

```yaml
rifle_infantry:
    conditions:
        moving:
            granted_by: [on_movement]
        deployed:
            granted_by: [on_deploy]
        elite:
            granted_by: [on_veterancy, { level: 3 }]
    cloak:
        disabled_by: moving
    damage_multiplier:
        requires: deployed
        modifier: 1.5    # fixed-point: 150%
```

OpenRA trait names accepted as aliases (D023) — `GrantConditionOnMovement` works in IC YAML.

### Multiplier Stack

Every numeric stat (speed, damage, range, reload, build time, cost, sight range) resolves through a per-entity modifier stack.

**Rust sketch:**

```rust
/// Per-entity modifier stack.
pub struct StatModifiers {
    pub entries: Vec<(StatId, ModifierEffect, Option<ConditionId>)>,
}

pub enum ModifierEffect {
    Bonus(FixedPoint),    // additive: +2 speed, +50 damage
    Multiply(FixedPoint), // multiplicative: ×1.25 firepower
}
```

**Evaluation order:** For a given stat, collect all active modifiers (condition check passes), then:
1. Start with base value
2. Sum all `Bonus` entries (additive phase)
3. Multiply by each `Multiply` entry in declaration order (multiplicative phase)

Within each phase, modifiers apply in YAML declaration order. This is deterministic and matches D019's balance preset expectations.

**Multiplier sources** (OpenRA-compatible names):

| Multiplier | Affects | Typical Sources |
|------------|---------|-----------------|
| `DamageMultiplier` | Incoming damage | Veterancy, prone stance, armor crates |
| `FirepowerMultiplier` | Outgoing damage | Veterancy, elite status |
| `SpeedMultiplier` | Movement speed | Terrain, roads, crates |
| `RangeMultiplier` | Weapon range | Veterancy, deploy mode |
| `ReloadDelayMultiplier` | Weapon reload | Veterancy, heroic status |
| `ProductionCostMultiplier` | Build cost | Player handicap, tech level |
| `ProductionTimeMultiplier` | Build time | Multiple factories bonus |
| `RevealsShroudMultiplier` | Sight range | Veterancy, crates |

### Conditional Modifiers (Tier 1.5)

Beyond the component-level multiplier stack, IC supports **conditional modifiers** — declarative rules in YAML that adjust stats based on runtime conditions. This is more powerful than static data but still pure YAML (no Lua required).

```yaml
heavy_tank:
  mobile:
    speed: 4
    modifiers:
      - stat: speed
        bonus: +2
        conditions: [on_road]
      - stat: speed
        multiply: 0.5
        conditions: [on_snow]
  combat:
    modifiers:
      - stat: damage
        multiply: 1.25
        conditions: [veterancy >= 1]
      - stat: range
        bonus: +1
        conditions: [deployed]
```

**Filter types:**

| Filter | Examples | Resolves Against |
|--------|----------|------------------|
| **state** | `deployed`, `moving`, `idle` | Entity condition bitset |
| **terrain** | `on_road`, `on_snow`, `on_water` | Cell terrain type |
| **attribute** | `vs [armored]`, `vs [infantry]` | Target attribute tags |
| **veterancy** | `veterancy >= 1`, `veterancy == 3` | Entity veterancy level |
| **proximity** | `near_ally_repair`, `near_enemy` | Spatial query (cached) |
| **global** | `superweapon_active`, `low_power` | Player-level game state |

### Integration with Damage Pipeline

The full weapon → impact chain uses both systems:

```
Armament fires → Projectile → impact → Warhead(s)
  → Versus table lookup (ArmorType × WarheadType → base multiplier)
  → DamageMultiplier conditions (veterancy, prone, crate bonuses)
  → Final damage applied to Health
```

`condition_system()` runs at tick step 14 in the system pipeline. It evaluates all grant/revoke rules and updates every entity's `Conditions` component. Other systems (combat, movement, production) read conditions and resolve stats through the modifier stack on their own tick steps.

### Alternatives Considered

| Alternative | Verdict | Reason |
|-------------|---------|--------|
| Hardcoded multiplier tables | Rejected | Not moddable; breaks Tier 1 YAML-only modding promise |
| Lua-based stat resolution | Rejected | Conditions are too frequent (every tick, every entity) for Lua overhead; YAML declarative approach is faster and simpler |
| Float-based multipliers | Rejected | Violates Invariant #1 (deterministic sim requires fixed-point) |
| Unordered modifier evaluation | Rejected | Non-deterministic; would break replays across platforms |
