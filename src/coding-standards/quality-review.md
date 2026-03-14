## Function and Module Size Limits

### Small Functions, Single Responsibility

**Target:** Most functions should be **under 40 lines** of logic (excluding doc comments and blank lines). A function over 60 lines is a code smell. A function over 100 lines must have a comment justifying its size.

```rust
// ✅ Good — small, focused, testable
fn apply_damage(health: &mut Health, damage: i32, armor: &Armor) -> DamageResult {
    let effective = calculate_effective_damage(damage, armor);
    health.current -= effective;

    if health.current <= 0 {
        DamageResult::Killed
    } else if health.current < health.max / 4 {
        DamageResult::Critical
    } else {
        DamageResult::Hit { effective }
    }
}

fn calculate_effective_damage(raw: i32, armor: &Armor) -> i32 {
    // Armor reduces damage by a percentage. The multiplier comes from
    // YAML rules (armor_type × warhead matrix). This is the same
    // versusArmor system as OpenRA's Warhead.Versus dictionary.
    let multiplier = armor.damage_modifier(); // e.g., Fixed(0.75) for 25% reduction
    raw.fixed_mul(multiplier)
}
```

### File Size Guideline

> **LLM/RAG rationale:** A 500-line Rust file ≈ 1,500–2,500 tokens. An LLM agent can load 3–5 related files within a single retrieval window and still have room to reason. An 1,800-line file ≈ 6,000 tokens — it crowds out everything else. These limits serve human readability *and* efficient RAG chunking. See `AGENTS.md` § Code Module Structure — LLM/RAG Efficiency.

**Hard rule:** Logic files must be **under 500 lines** (including comments and tests). Over 800 lines is a split trigger — the file almost certainly contains multiple concepts. Data definition files (struct-heavy YAML deserialization, exhaustive test suites) may exceed this; logic files may not. The `mod.rs` barrel file pattern keeps the public API clean while allowing internal splits:

```
components/
├── mod.rs           # pub use health::*; pub use combat::*; etc.
├── health.rs        # Health, Armor, DamageState — ~200 lines
├── combat.rs        # Armament, AmmoPool, Projectile — ~400 lines
└── economy.rs       # Harvester, ResourceStorage, OreField — ~350 lines
```

**Exception:** Some files are naturally large (YAML rule deserialization structs, comprehensive test suites). That's fine — the 500-line limit is for logic files, not data definition files.

---

## Isolation and Context Independence

### Every Module Tells Its Own Story

A developer reading `harvesting.rs` should not need to also read `movement.rs`, `production.rs`, and `combat.rs` to understand what's happening. Each module provides enough context through comments and doc strings to stand alone.

**Practical techniques:**

1. **Restate key facts in module docs.** Don't just say "see architecture doc." Say "This system runs after `movement_system()` and before `production_system()`. It reads `Harvester` and `ResourceField` components and writes to `ResourceStorage`."

2. **Explain cross-module interactions in comments.** If combat.rs fires a projectile that movement.rs needs to advance, explain this at both ends:
   ```rust
   // In combat.rs:
   // Spawning a Projectile entity here. The `movement_system()` will
   // advance it each tick using its `velocity` and `heading` components.
   // When it reaches the target (checked in `combat_system()` next tick),
   // we apply damage. See: systems/movement.rs § projectile handling.

   // In movement.rs:
   // Projectile entities are spawned by `combat_system()` with a velocity
   // and heading. We advance them here just like units, but projectiles
   // ignore terrain collision. The `combat_system()` checks for arrival
   // on the next tick. See: systems/combat.rs § projectile spawning.
   ```

3. **Name things so they're greppable.** If a concept spans multiple files, use the same term everywhere so `grep` finds all the pieces. If harvesters call it "cargo," the refinery should also call it "cargo" — not "payload" or "load."

### The "Dropped In" Test

Before merging any file, apply this test: *Could a developer who has never seen this codebase read this file — and only this file — and understand what it does, why it exists, and how to modify it?*

If the answer is no, add more context. Module docs, architecture context comments, cross-reference links — whatever it takes for the file to stand on its own.

> **LLM/RAG note:** This test is the code-module equivalent of the design-doc hub-and-sub-file pattern. When a RAG system retrieves a single file, the module doc comment serves as the routing header — it tells the agent what this file covers without reading the code body. A module that fails the "Dropped In" test also fails RAG retrieval: the agent loads the file, can't make sense of it in isolation, and wastes tokens loading siblings to build context.

---

## Testing Philosophy: Every Piece in Isolation

### Test Structure

Every module has tests in the same file, in a `#[cfg(test)] mod tests` block at the bottom. This keeps tests next to the code they verify — a reader sees the implementation and the tests together.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // ── Unit Tests ───────────────────────────────────────────────

    #[test]
    fn full_health_is_alive() {
        let health = Health { current: 100, max: 100 };
        assert!(health.is_alive());
    }

    #[test]
    fn zero_health_is_dead() {
        let health = Health { current: 0, max: 100 };
        assert!(!health.is_alive());
    }

    #[test]
    fn damage_reduces_health() {
        let mut health = Health { current: 100, max: 100 };
        let armor = Armor::new(ArmorType::Heavy);
        let result = apply_damage(&mut health, 30, &armor);
        assert!(health.current < 100);
        assert_eq!(result, DamageResult::Hit { effective: 22 }); // 30 * 0.75 heavy armor
    }

    #[test]
    fn lethal_damage_kills() {
        let mut health = Health { current: 10, max: 100 };
        let armor = Armor::new(ArmorType::None);
        let result = apply_damage(&mut health, 50, &armor);
        assert_eq!(result, DamageResult::Killed);
    }

    // ── Edge Cases ───────────────────────────────────────────────

    #[test]
    fn zero_damage_does_nothing() {
        let mut health = Health { current: 100, max: 100 };
        let armor = Armor::new(ArmorType::None);
        let result = apply_damage(&mut health, 0, &armor);
        assert_eq!(health.current, 100);
        assert_eq!(result, DamageResult::Hit { effective: 0 });
    }

    #[test]
    fn negative_damage_heals() {
        // Some mods use negative damage for healing weapons (medic, mechanic).
        // This must work correctly — it's not a bug, it's a feature.
        let mut health = Health { current: 50, max: 100 };
        let armor = Armor::new(ArmorType::None);
        apply_damage(&mut health, -20, &armor);
        assert_eq!(health.current, 70);
    }
}
```

### What Every Module Tests

| Test category         | What it verifies                                                      | Example                                                        |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Happy path**        | Normal operation with valid inputs                                    | Harvester collects ore, credits increase                       |
| **Edge cases**        | Boundary values, empty collections, zero/max values                   | Harvester at full cargo, ore field with 0 ore remaining        |
| **Error paths**       | Invalid inputs produce correct error types, not panics                | Loading a .mix with corrupted header returns `MixParseError`   |
| **Determinism**       | Same inputs always produce same outputs (critical for `ic-sim`)       | Run `combat_system()` twice with same state → identical result |
| **Round-trip**        | Serialize → deserialize produces identical data (snapshots, replays)  | `snapshot → bytes → restore → snapshot` equals original        |
| **Regression**        | Specific bugs that were fixed stay fixed                              | "Harvester infinite loop when refinery sold" — test case added |
| **Mod-edge behavior** | Reasonable behavior with unusual YAML values (0 cost, negative speed) | Unit with 0 HP spawns dead — is this handled?                  |

### Test Naming Convention

Test names describe **what is being tested and what the expected outcome is**, not what the test does:

```rust
// ✅ Good — reads like a specification
#[test] fn full_health_is_alive() { ... }
#[test] fn damage_exceeding_health_kills_unit() { ... }
#[test] fn harvester_returns_to_refinery_when_full() { ... }
#[test] fn corrupted_mix_header_returns_parse_error() { ... }

// ❌ Bad — describes the test mechanics, not the behavior
#[test] fn test_health() { ... }
#[test] fn test_damage() { ... }
#[test] fn test_harvester() { ... }
```

### Integration Tests vs. Unit Tests

- **Unit tests** (in `#[cfg(test)]` at the bottom of each file): Test one function, one component, one algorithm. No external dependencies. No file I/O. No Bevy `World` unless testing ECS-specific behavior. These run in milliseconds.

- **Integration tests** (in `tests/` directory): Test multiple systems working together. May use a Bevy `World` with multiple systems running. May load test fixtures from `tests/fixtures/`. These verify that the pieces fit together correctly.

- **Format tests** (in `tests/format/`): Test `ra-formats` parsers against synthetic fixtures. Round-trip tests (parse → write → parse → compare). These validate that IC reads the same formats that RA and OpenRA produce.

- **Regression tests**: When a bug is found and fixed, a test is added that reproduces the original bug. The test name references the issue: `#[test] fn issue_42_harvester_loop_on_sold_refinery()`. This test must never be deleted.

### Testability Drives Design

If something is hard to test, the design is wrong — not the testing strategy. The architecture already supports testability by design:

- **Pure sim with no I/O**: `ic-sim` systems are pure functions of `(state, orders) → new_state`. No network, no filesystem, no randomness (deterministic PRNG seeded by tick). This makes unit testing trivial — construct a state, call the system, check the output.
- **Trait abstractions**: The `Pathfinder`, `SpatialIndex`, `FogProvider`, and other pluggable traits (D041) can be replaced with simple mock implementations in tests. Testing combat doesn't require a real pathfinder.
- **`LocalNetwork` for testing**: The `NetworkModel` trait has a `LocalNetwork` implementation (D006) that runs entirely in-memory with no latency, no packet loss, no threading. Perfect for sim integration tests.
- **Snapshots for comparison**: Every sim state can be serialized (D010). Two test runs with the same inputs should produce byte-identical snapshots — if they don't, there's a determinism bug.

---

## Code Patterns: Standard Approaches

### The Standard ECS System Pattern

Every system in `ic-sim` follows the same structure:

```rust
/// Runs the harvesting cycle for all active harvesters.
///
/// ## Pipeline Position
///
/// Runs after `movement_system()` (harvesters need to arrive at fields/refineries
/// before we process them) and before `production_system()` (credits from
/// deliveries must be available for build queue processing this tick).
///
/// ## What This System Does (Per Tick)
///
/// 1. Harvesters at ore fields: extract ore, update cargo
/// 2. Harvesters at refineries: deliver cargo, add credits
/// 3. Harvesters with full cargo: re-route to nearest refinery
/// 4. Idle harvesters: find nearest ore field
///
/// ## Original RA Reference
///
/// This corresponds to `HARVEST.CPP` → `HarvestClass::AI()` in the original
/// RA source. The state machine (seek → harvest → deliver → repeat) is the
/// same. Our implementation splits it across ECS queries instead of a
/// per-object virtual method.
pub fn harvesting_system(
    mut harvesters: Query<(&mut Harvester, &Transform, &Owner)>,
    fields: Query<(&ResourceField, &Transform)>,
    mut refineries: Query<(&Refinery, &mut ResourceStorage, &Owner)>,
    pathfinder: Res<dyn Pathfinder>,
) {
    for (mut harvester, transform, owner) in harvesters.iter_mut() {
        match harvester.state {
            HarvestState::Seeking => {
                // Find the nearest ore field and request a path to it.
                // ...
            }
            HarvestState::Harvesting => {
                // Extract ore from the field under the harvester.
                // ...
            }
            HarvestState::Delivering => {
                // Deposit cargo at the refinery, converting to credits.
                // ...
            }
        }
    }
}
```

**Key points:** Every system has a `## Pipeline Position` comment. Every system has a `## What This System Does` summary. Every system references the original RA source or OpenRA equivalent when applicable. Readers can understand the system without reading any other file.

### The Standard Component Pattern

```rust
/// A unit that can collect ore from resource fields and deliver it to refineries.
///
/// This is the data side of the harvest cycle. The behavior lives in
/// `harvesting_system()` in `systems/harvesting.rs`.
///
/// ## YAML Mapping
///
/// ```yaml
/// harvester:
///   cargo_capacity: 20      # Maximum ore units this harvester can carry
///   harvest_rate: 3          # Ore units extracted per tick at a field
///   unload_rate: 2           # Ore units delivered per tick at a refinery
/// ```
///
/// ## Original RA Reference
///
/// Maps to `HarvestClass` in HARVEST.H. The `cargo_capacity` field corresponds
/// to RA's `MAXLOAD` constant (20 for the ore truck).
#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct Harvester {
    /// Current harvester state in the seek → harvest → deliver cycle.
    pub state: HarvestState,

    /// How many ore units the harvester is currently carrying.
    /// Range: 0..=cargo_capacity.
    pub cargo: i32,

    /// Maximum ore units this harvester can carry (from YAML rules).
    pub cargo_capacity: i32,

    /// Ore units extracted per tick when at a resource field (from YAML rules).
    pub harvest_rate: i32,

    /// Ore units delivered per tick when at a refinery (from YAML rules).
    pub unload_rate: i32,
}
```

**Key points:** Every component has a `## YAML Mapping` section showing the corresponding rule data. Every component has doc comments on *every field* — even if the name seems obvious. Every component references the original RA equivalent.

### The Standard Error Pattern

See the § Error Handling section above. Every crate defines specific error types with contextual information. No anonymous `Box<dyn Error>`. No bare `String` errors.

---

## Logging and Diagnostics

### Structured Logging with `tracing`

```rust
use tracing::{debug, info, warn, error, instrument};

/// Process an incoming player order.
///
/// Logs at different levels for different audiences:
/// - `error!` — something is wrong, needs investigation
/// - `warn!` — unexpected but handled, might indicate a problem
/// - `info!` — normal operation milestones (game started, player joined)
/// - `debug!` — detailed per-tick state (only visible with RUST_LOG=debug)
#[instrument(skip(sim_state), fields(player_id = %order.player_id, tick = %tick))]
pub fn process_order(order: &PlayerOrder, sim_state: &mut SimState, tick: u32) {
    // Orders from disconnected players are silently dropped — this is
    // expected during disconnect handling, not an error.
    if !sim_state.is_player_active(order.player_id) {
        warn!(
            player_id = %order.player_id,
            "Dropping order from inactive player — likely mid-disconnect"
        );
        return;
    }

    debug!(
        order_type = ?order.kind,
        "Processing order"
    );

    // ...
}
```

### Log Level Guidelines

| Level    | When to use                                                  | Example                                                   |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `error!` | Something is broken, data may be lost or corrupted           | MIX parse failure, snapshot deserialization failure       |
| `warn!`  | Unexpected but handled — may indicate a deeper issue         | Order from unknown player dropped, YAML field has default |
| `info!`  | Milestones and normal lifecycle events                       | Game started, player joined, save completed               |
| `debug!` | Detailed per-tick state for development                      | Order processed, pathfind completed, damage applied       |
| `trace!` | Extremely verbose — individual component reads, query counts | ECS query iteration count, cache hit/miss                 |

---

## Type-Safety Coding Standards

These rules complement the Type-Safety Architectural Invariants in 02-ARCHITECTURE.md. They define the concrete clippy configuration, review checklist items, and patterns that enforce type safety at the code level.

### clippy::disallowed_types Configuration

The following types are banned in specific crates via `clippy.toml`:

**`ic-sim` crate (deterministic simulation):**

```toml
# clippy.toml
disallowed-types = [
    { path = "std::collections::HashMap", reason = "Non-deterministic iteration order. Use BTreeMap or IndexMap." },
    { path = "std::collections::HashSet", reason = "Non-deterministic iteration order. Use BTreeSet or IndexSet." },
    { path = "std::time::Instant", reason = "Wall-clock time breaks determinism. Use SimTick." },
    { path = "std::time::SystemTime", reason = "Wall-clock time breaks determinism. Use SimTick." },
    { path = "rand::rngs::ThreadRng", reason = "Non-deterministic RNG. Use seeded SimRng." },
    { path = "String", reason = "Use CompactString or domain newtypes (PackageName, OutcomeName) for validated strings. Raw String allowed only in error messages and logging (#[allow] with justification)." },
]
```

**All crates (project-wide):**

```toml
disallowed-types = [
    { path = "std::path::PathBuf", reason = "Use StrictPath<PathBoundary> for untrusted paths. PathBuf is allowed only for build-time/tool code." },
]
```

Note: `PathBuf` is allowed in build scripts, CLI tools, and test harnesses. Game runtime code that handles user/mod/network-supplied paths must use `strict-path` types.

### Newtype Patterns: Code Review Checklist

When reviewing code, check:

- [ ] Are function parameters using newtypes for domain IDs? (`PlayerId`, not `u32`)
- [ ] Are newtype conversions explicit? (no blanket `From<u32>` — use `PlayerId::new(raw)` with validation)
- [ ] Does the newtype derive only the traits it needs? (e.g., `PlayerId` needs `Clone, Copy, Eq, Hash` but probably not `Add, Sub`)
- [ ] Are newtypes `#[repr(transparent)]` if they need to be zero-cost?
- [ ] Are sub-tick timestamps using `SubTickTimestamp`, never bare `u32`? (confusion with `SimTick` is a critical bug class)
- [ ] Are campaign/workshop/balance identifiers using their newtypes? (`MissionId`, `OutcomeName`, `PresetId`, `PublisherId`, `PackageName`, `PersonalityId`, `ThemeId`)
- [ ] Are version constraints parsed into `VersionConstraint` enum at ingestion, never stored or compared as strings?
- [ ] Is `WasmInstanceId` used consistently, never bare `u32` or `usize` index?
- [ ] Is `Fingerprint` constructed only via `Fingerprint::compute()`, never from raw `[u8; 32]`?
- [ ] **WASM boundary:** Do host-side structs (e.g., `AiUnitInfo`, `AiEventEntry`) use newtypes? WASM FFI signatures use primitives (ABI constraint), but any Rust struct exchanging data with the engine must use `UnitTag`, `SimTick`, etc. See `type-safety.md` § WASM ABI Boundary Policy.
- [ ] **Server-side floats:** Do `f64` fields in anti-cheat/scoring code have NaN guards? See `type-safety.md` § Finite Float Policy.

```rust
// ✅ Good newtype pattern
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct PlayerId(u32);

impl PlayerId {
    /// Create from raw value. Only called at network boundary deserialization.
    pub(crate) fn from_raw(raw: u32) -> Self { Self(raw) }
    pub fn as_raw(self) -> u32 { self.0 }
}

// ❌ Bad — leaky newtype that defeats the purpose
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PlayerId(pub u32);  // pub inner field = anyone can construct/destructure
impl From<u32> for PlayerId {  // blanket From = implicit conversion anywhere
    fn from(v: u32) -> Self { Self(v) }
}
```

### Capability Token Patterns: Mod API Review

When reviewing mod-facing APIs:

- [ ] Does the API require a capability token parameter?
- [ ] Is the token type unconstructible outside the host module? (private field or `_private: ()`)
- [ ] Are token lifetimes scoped correctly? (e.g., `FsReadCapability` should not outlive the mod's execution context)
- [ ] Is the capability granular enough? (one token per permission, not a god-token)

### Typestate Review Checklist

When reviewing state machine code:

- [ ] Are states represented as types, not enum variants?
- [ ] Do transition methods consume `self` and return the new state type?
- [ ] Are invalid transitions unrepresentable? (no `transition_to(state: SomeEnum)` method)
- [ ] Is the error path handled? (`-> Result<NextState, Error>` for fallible transitions)
- [ ] WASM lifecycle: can `execute()` be called on a `WasmTerminated` instance? (must be impossible)
- [ ] Workshop install: can `extract()` be called on `PkgDownloading`? (must pass through `PkgVerifying` first)
- [ ] Campaign mission: can `complete()` be called on `MissionLoading`? (must pass through `MissionActive`)
- [ ] Balance patch: can `apply()` be called on `PatchPending`? (must pass through `PatchValidated`)

### Bounded Collection Review

When reviewing collections in `ic-sim`:

- [ ] Does any `Vec` grow based on player input? If so, is it bounded?
- [ ] Are `push`/`insert` operations checked against capacity?
- [ ] Is the bound documented and justified? (e.g., "max 200 orders per tick per player — see V17")

### Verified Wrapper Review

When reviewing code that handles security-sensitive data (see `02-ARCHITECTURE.md` § "Verified Wrapper Policy"):

- [ ] Does the function accept `Verified<T>` rather than bare `T` for data that must be verified? (SCRs, manifest hashes, replay signatures, validated orders)
- [ ] Is `Verified::new_verified()` called ONLY inside actual verification logic? (not in convenience constructors or test helpers without `#[cfg(test)]`)
- [ ] Are there any code paths that bypass verification and construct `Verified<T>` directly? (the `_private` field should prevent this)
- [ ] Does the verification function check ALL required properties before wrapping in `Verified`?
- [ ] Are `Verified` values passed through without re-verification? (re-verification is wasted work; the type already proves it)

### StructurallyChecked Wrapper Review

When reviewing relay-side code that processes orders before broadcast (see `cross-engine/relay-security.md` § StructurallyChecked):

- [ ] Does the relay pipeline produce `StructurallyChecked<TimestampedOrder>` rather than bare `TimestampedOrder` for forwarded orders?
- [ ] Is `StructurallyChecked::new()` called ONLY inside the `ForeignOrderPipeline::process()` path (or equivalent structural validation)? (the `_private` field should prevent external construction)
- [ ] Is `StructurallyChecked<T>` NEVER confused with `Verified<T>`? (the relay does NOT run `ic-sim` — it cannot produce `Verified<T>`)
- [ ] Are rejected orders logged to `rejection_log` for behavioral scoring?

### Hash Type Review

When reviewing code that computes or compares hashes:

- [ ] Is the correct hash type used? (`SyncHash` for live per-tick desync comparison, `StateHash` for cold-path replay/snapshot verification)
- [ ] Are hash types never implicitly converted? (no `SyncHash` → `StateHash` or vice versa without explicit, documented truncation/expansion)
- [ ] Is `Fingerprint` constructed only via `Fingerprint::compute()`, never from raw bytes?

### Chat Scope Review

When reviewing chat message handling:

- [ ] Is the message type branded with the correct scope? (`ChatMessage<TeamScope>`, `ChatMessage<AllScope>`, `ChatMessage<WhisperScope>`)
- [ ] Are scope conversions (e.g., team → all) explicit and auditable? (no implicit `From` conversion)
- [ ] Does the routing logic accept only the correct branded type? (team handler takes `ChatMessage<TeamScope>`, not unbranded `ChatMessage`)

### Validated Construction Review

When reviewing types that use the validated construction pattern (see `02-ARCHITECTURE.md` § "Validated Construction Policy"):

- [ ] Is the type's inner field private? (prevents bypass via direct struct construction)
- [ ] Does the constructor validate ALL invariants before returning `Ok`?
- [ ] Is there a `_private: ()` field or equivalent to prevent external construction?
- [ ] Are mutation methods (if any) re-validating invariants after modification?
- [ ] Is `OrderBudget` constructed via `OrderBudget::new()`, never via struct literal?
- [ ] Is `CampaignGraph` constructed via `CampaignGraph::new()`, never via struct literal?
- [ ] Is `BalancePreset` checked for circular inheritance at construction time?
- [ ] Is `DependencyGraph` checked for cycles at construction time?

### Bounded Cvar Review

When reviewing console variable definitions (D058):

- [ ] Does every cvar with a documented valid range use `BoundedCvar<T>`, not bare `T`?
- [ ] Are `BoundedCvar` bounds correct? (`min <= default <= max`)
- [ ] Does `set()` clamp rather than reject? (matches the UX expectation of clamping to nearest valid value)

---

## Unsafe Code Policy

**Default: No `unsafe`.** The engine does not use `unsafe` Rust unless all of the following are true:

1. **Profiling proves a measurable bottleneck** in a release build — not a guess, not a microbenchmark, a real gameplay scenario.
2. **Safe alternatives have been tried and measured** — and the `unsafe` version is substantially faster (>20% improvement in the hot path).
3. **The `unsafe` block is minimal** — wrapping the smallest possible scope, with a `// SAFETY:` comment explaining the invariant that makes it sound.
4. **There is a safe fallback** that can be enabled via feature flag for debugging.

In practice, this means Phase 0–4 will have zero `unsafe` code. If SIMD or custom allocators are needed later (Phase 5+ performance tuning), they follow the rules above. The sim (ic-sim) should ideally never contain `unsafe` — determinism and correctness are more important than the last 5% of performance.

```rust
// ✅ Acceptable — justified, minimal, documented, has safe fallback
// SAFETY: `entities` is a `Vec<Entity>` that we just populated above.
// The index `i` is always in bounds because we iterate `0..entities.len()`.
// This avoids bounds-checking in a hot loop that processes 500+ entities per tick.
// Profile evidence: benchmarks/combat_500_units.rs shows 18% improvement.
// Safe fallback: `#[cfg(feature = "safe-indexing")]` uses checked indexing.
unsafe { *entities.get_unchecked(i) }
```

---

## Dependency Policy

### Minimal, Auditable Dependencies

Every external crate added to `Cargo.toml` must:

1. **Be GPL-3.0 compatible.** Verified by `cargo deny check licenses` in CI (see `deny.toml`).
2. **Be actively maintained** — or small/stable enough that maintenance isn't needed (e.g., `thiserror`).
3. **Not duplicate Bevy's functionality.** If Bevy already provides asset loading, don't add a second asset loader.
4. **Have a justification comment** in `Cargo.toml`:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }    # Serialization for snapshots, YAML rules, config
thiserror = "2"                                       # Ergonomic error type derivation
tracing = "0.1"                                       # Structured logging (matches Bevy's tracing)
```

### Workspace Dependencies

Shared dependency versions are pinned in the workspace `Cargo.toml` to prevent version drift between crates:

```toml
[workspace.dependencies]
bevy = "0.15"        # Pinned per development phase (AGENTS.md invariant #4)
serde = { version = "1", features = ["derive"] }
serde_yaml = "0.9"
```

---

## Commit and Code Review Standards

### What a Reviewable Change Looks Like

Since this is an open-source project with community contributors, every change should be reviewable by someone who hasn't seen it before:

1. **One logical change per commit.** Don't mix "add harvester component" with "fix pathfinding bug" in the same diff.
2. **Tests in the same commit as the code they test.** A reviewer should see the implementation and its tests together.
3. **Updated doc comments in the same commit.** If you change how `apply_damage()` works, update its doc comment in the same commit — not "I'll fix the docs later."
4. **No commented-out code.** Delete dead code. Git remembers everything. If you might need it later, it's in the history.
5. **No `TODO` without an issue reference.** `// TODO: optimize this` is useless. `// TODO(#42): replace linear scan with spatial query` is actionable.

### Code Review Checklist

Reviewers check these items for every submitted change:

- ☐ Does the module doc explain what this is and where it fits?
- ☐ Can I understand this file without reading other files?
- ☐ Are all public types and functions documented?
- ☐ Do test names describe the expected behavior?
- ☐ Are edge cases tested (zero, max, empty, invalid)?
- ☐ Is there a determinism test if this touches `ic-sim`?
- ☐ Does it compile with `cargo clippy -- -D warnings`?
- ☐ Does `cargo fmt --check` pass?
- ☐ Are new dependencies justified and GPL-compatible?
- ☐ Does the SPDX header exist on new files?

---

## Summary: The Iron Curtain Code Promise

1. **Boring and predictable.** Every file follows the same structure. Patterns are consistent. No surprises.
2. **Commented for the reader who lacks context.** Module docs explain architecture context. Function docs explain intent. Inline comments explain non-obvious decisions. External links provide deeper understanding.
3. **Testable in isolation.** Every component, every system, every parser can be tested independently. The architecture is designed for this — pure sim, trait abstractions, mock-friendly interfaces.
4. **Familiar to the community.** Component names match OpenRA vocabulary. Code references original RA source. The organization mirrors what C&C developers expect.
5. **Newbie-friendly.** Full words in names. Small functions. Explicit error handling. No `unsafe` without justification. No clever tricks. A person learning Rust can read this codebase and learn good habits.
6. **Large-codebase ready.** Files stand alone. Modules tell their own story. Grep finds everything. The "dropped in" test passes for every file.
