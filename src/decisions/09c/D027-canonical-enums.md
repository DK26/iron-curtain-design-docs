## D027: Canonical Enum Compatibility with OpenRA

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 1 (enums ship with core sim)
- **Execution overlay mapping:** `M1.CORE.FORMAT_LOADING` (P-Core); enum definitions are part of format loading
- **Deferred features / extensions:** Game modules (RA2, TS) add game-specific enum variants; core enum types remain stable
- **Canonical for:** Enum naming policy for locomotion, armor, target types, damage states, and stances
- **Scope:** `ic-sim`, `ra-formats`, `04-MODDING.md`, `11-OPENRA-FEATURES.md`
- **Decision:** IC's canonical enum names for gameplay types match OpenRA's names exactly. Versus tables, weapon definitions, and unit YAML from OpenRA copy-paste into IC without translation.
- **Why:**
  - Zero migration friction for OpenRA mod content
  - Versus tables are the most-edited YAML in any mod — name mismatches would break every mod
  - Enum names are stable in OpenRA (unchanged for 10+ years)
  - Deterministic iteration order guaranteed by using `#[repr(u8)]` enums with known discriminants
- **Non-goals:** Matching OpenRA's internal C# enum implementation or numeric values. IC uses Rust `#[repr(u8)]` enums; only the string names must match.
- **Invariants preserved:** Deterministic sim (enum discriminants are fixed, not hash-derived). No floats.
- **Compatibility / Export impact:** OpenRA YAML loads without renaming any enum value
- **Public interfaces / types / commands:** `LocomotorType`, `ArmorType`, `TargetType`, `DamageState`, `UnitStance`
- **Affected docs:** `02-ARCHITECTURE.md` § Component Model, `04-MODDING.md`, `11-OPENRA-FEATURES.md`
- **Keywords:** enum, locomotor, armor type, versus table, OpenRA compatibility, canonical names, damage state, stance

---

### Canonical Enum Tables

**Locomotor types** (unit movement classification):

| Enum Value | Used By | Notes |
|------------|---------|-------|
| `Foot` | Infantry | Sub-cell positioning |
| `Wheeled` | Light vehicles | Road speed bonus |
| `Tracked` | Tanks, heavy vehicles | Crushes infantry |
| `Float` | Naval units | Water-only |
| `Fly` | Aircraft | Ignores terrain |

**Armor types** (damage reduction classification):

| Enum Value | Typical Units |
|------------|---------------|
| `None` | Infantry, unarmored |
| `Light` | Scouts, light vehicles |
| `Medium` | APCs, medium tanks |
| `Heavy` | Heavy tanks, Mammoth |
| `Wood` | Fences, barrels |
| `Concrete` | Buildings, walls |

**Target types** (weapon targeting filters): `Ground`, `Water`, `Air`, `Structure`, `Infantry`, `Vehicle`, `Tree`, `Wall`. Weapon YAML uses `valid_targets` and `invalid_targets` arrays of these values.

**Damage states** (health thresholds for visual/behavioral changes): `Undamaged`, `Light`, `Medium`, `Heavy`, `Critical`, `Dead`.

**Stances** (unit behavioral posture): `AttackAnything`, `Defend`, `ReturnFire`, `HoldFire`.

### Stability Policy

- Enum variant **names are permanent**. Once a name ships, it is never renamed or removed.
- New variants may be added to any enum type (e.g., `Hover` locomotor for TS/RA2 modules).
- Game modules register additional variants at startup. The core enums above are the RA1 baseline.
- Mods may define **custom enum extensions** via YAML for game-module-specific types (e.g., `SubTerranean` locomotor for TS). Custom variants use string identifiers and are registered at mod load time.

### Rationale

OpenRA's enum names have been stable for over a decade. The C&C modding community uses these names in thousands of YAML files across hundreds of mods. Adopting different names would create gratuitous incompatibility with zero benefit. IC matches the names exactly so that Versus tables, weapon definitions, and unit YAML copy-paste without translation.
