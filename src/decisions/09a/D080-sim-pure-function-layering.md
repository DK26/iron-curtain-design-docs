## D080: Simulation Pure-Function Layering — Minimal Client Portability

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 2 (coding discipline applied as `ic-sim` is written)
- **Execution overlay mapping:** Primary milestone `M2`, priority `P-Core`, first enforced at `M2.CORE.SIM_FIXED_POINT_AND_ORDERS` (applies to all downstream M2 sim clusters: `PATH_SPATIAL`, `GAP_P0_GAMEPLAY_SYSTEMS`, `SIM_API_DEFENSE_TESTS`)
- **Deferred features / extensions:** Actual minimal client implementation (planned deferral, Phase 7+ / post-launch; trigger: sim maturity + community demand)
- **Deferral trigger:** Sim API stable enough that a non-Bevy driver can be prototyped without churn
- **Canonical for:** `ic-sim` internal code organization; future non-Bevy client feasibility
- **Scope:** `ic-sim` (internal structure only — no new crates, no API changes to other crates)
- **Decision:** Every system in `ic-sim` must separate its algorithm from its Bevy scheduling wrapper. Simulation algorithms live in pure Rust functions with zero `bevy_ecs` imports. Thin Bevy system functions handle query iteration and component access, then call the pure functions. This is a coding discipline, not a crate split. **Limitation:** pure function discipline decouples *algorithms* from Bevy but not *types* — sim data types still derive `Component` (requiring `bevy_ecs` at compile time). Full compile-time decoupling requires a future crate split or feature-gated derives; D080 makes that split mechanical rather than architectural.
- **Why:**
  - Enables a future sub-16 MB RAM client that drives the same algorithms without Bevy's runtime overhead
  - Requires zero architectural changes today — it is how systems are written, not how crates are organized
  - Pure functions are independently unit-testable without Bevy test harness
  - Preserves D002 (Bevy is the framework) completely — Bevy remains the scheduler, ECS, and plugin system
  - If a crate split (`ic-sim-core`) ever makes sense, the pure functions are already factored out — mechanical extraction
- **Non-goals:**
  - Does NOT create a new crate or change the crate graph
  - Does NOT make Bevy optional for the primary game client (`ic-game`)
  - Does NOT re-litigate D002 — Bevy remains the framework
  - Does NOT promise a shipping minimal client on any timeline
  - Does NOT require `#![no_std]` in `ic-sim` (pure functions use standard Rust, just not `bevy_ecs`)
- **Out of current scope:** Minimal client implementation; renderer for minimal client; non-Bevy tick loop driver; compile-time type decoupling (`#[derive(Component)]` removal via feature flags or wrapper types — deferred to crate split if/when needed)
- **Invariants preserved:** Invariant #1 (sim purity/determinism), Invariant #4 (Bevy is the framework), D002, D015 (efficiency-first)
- **Defaults / UX behavior:** No player-facing impact. Internal coding discipline only.
- **Performance impact:** Positive — pure functions with explicit data-in/data-out are easier to profile, benchmark, and optimize than functions interleaved with ECS query mechanics
- **Public interfaces / types / commands:** None (internal structure only)
- **Affected docs:** `AGENTS.md` (decision table), `09-DECISIONS.md` (index), `09a-foundation.md` (routing table), `SUMMARY.md`, `tracker/decision-tracker-d061-d080.md`, `tracking/milestone-deps/clusters-m2-m4.md`
- **Keywords:** minimal client, pure function, sim layering, 16MB, non-Bevy driver, algorithm extraction, thin wrapper, portable sim

---

### Context

Iron Curtain targets Bevy as its framework (D002). The simulation crate `ic-sim` uses Bevy's `FixedUpdate` scheduling and ECS for deterministic tick processing. This is the correct architecture for the primary game client.

However, the project also values the heritage of the original Red Alert — a game that ran in 8–16 MB of RAM. A future constrained client (low-end hardware, embedded, browser-minimal, preservation builds) should be architecturally possible without forking the simulation logic.

The question is not "Bevy or no Bevy" — it is: **can `ic-sim`'s internals be structured so a non-Bevy driver could call the same algorithms?**

### Decision

**Every Bevy system in `ic-sim` is a thin wrapper around a pure function.**

The pure function:
- Takes data in, returns data out
- Imports nothing from `bevy_ecs` (or any other Bevy crate)
- Uses only IC types (`ic-protocol`, `ic-sim` internal types, `fixed-game-math`, standard library)
- Is independently unit-testable

The Bevy system wrapper:
- Runs ECS queries to gather component data
- Calls the pure function
- Applies the result back to ECS state

### Example

```rust
// ── Pure function (no Bevy imports) ──────────────────────────
use crate::types::{WeaponStats, ArmorStats, DamageResult};
use fixed_game_math::FixedPoint;

/// Resolve a single weapon-vs-armor damage interaction.
/// Deterministic: same inputs always produce same output.
pub fn resolve_combat(
    attacker: &WeaponStats,
    target: &ArmorStats,
    range: FixedPoint,
) -> DamageResult {
    // ... pure computation ...
}

// ── Bevy system wrapper (thin) ───────────────────────────────
use bevy_ecs::prelude::*;
use crate::combat::resolve_combat;

fn combat_system(
    attackers: Query<(&WeaponStats, &Target, &Position)>,
    targets: Query<(&ArmorStats, &Position)>,
    mut damage_events: EventWriter<DamageEvent>,
) {
    for (weapon, target_ref, attacker_pos) in &attackers {
        let Ok((armor, target_pos)) = targets.get(target_ref.entity) else {
            continue;
        };
        let range = attacker_pos.distance_to(target_pos);
        let result = resolve_combat(weapon, armor, range);
        damage_events.send(DamageEvent::from(result));
    }
}
```

A future minimal client calls `resolve_combat` directly with its own data layout. The algorithm is identical. Determinism is preserved.

### What this enables (future, not current scope)

A minimal client would:
- Import the pure sim algorithms (via a future `ic-sim-core` crate or feature-gated `ic-sim`)
- Call the pure functions directly with its own data structures
- Provide its own tick loop (no Bevy scheduler)
- Provide its own renderer (minimal 2D, terminal, headless)
- Share `ic-protocol` for replay/network compatibility

D080 is necessary but not sufficient for this. It ensures the algorithms are factored out and independently callable from day one, when the cost of this discipline is near zero. Full compile-time decoupling (eliminating the `bevy_ecs` transitive dependency from the minimal client's dependency tree) additionally requires a crate split or feature-gated derives — see [Known limitation](#known-limitation-type-entanglement). D080 makes that future step mechanical rather than architectural.

### Why not a separate crate now?

Extracting `ic-sim-core` today would:
- Create a crate boundary before the API surface is known
- Force premature decisions about what crosses the boundary
- Add maintenance overhead for a client that doesn't exist yet

D080 is strictly cheaper: write the functions cleanly, and the crate split becomes a mechanical `cargo new` + `mv` if it's ever needed. The seams emerge from real code rather than speculation.

### Why not bet on minimal Bevy instead?

Bevy with `MinimalPlugins` (no renderer, no asset system) has been measured at ~27 MiB on Linux in one report. That may shrink, or it may grow. Betting the 16 MB story on Bevy's memory profile means a regression in Bevy breaks the constraint. D080's approach decouples algorithms from the framework at the call site — the pure functions don't care what schedules them. Full compile-time decoupling (removing the `bevy_ecs` transitive dependency) additionally requires a crate split or feature-gated derives on data types; see [Known limitation](#known-limitation-type-entanglement) below.

### Alternatives considered

| Alternative | Verdict | Reason |
|---|---|---|
| Full Bevy commitment, no minimal client path | Rejected | Closes the door on constrained clients permanently |
| Separate `ic-sim-core` crate from day one | Rejected | Premature boundary; maintenance cost for a non-existent client |
| Minimal Bevy configuration (MinimalPlugins) | Not chosen as primary strategy | Depends on Bevy's memory profile, which IC doesn't control; D080 is complementary — a minimal Bevy client is still possible |
| Two separate engines (Bevy + custom) | Rejected | Duplicates sim truth; where engine projects die |

### Enforcement

This is a code review discipline, not a compile-time constraint. During Phase 2 development:

1. **Review rule:** Every `ic-sim` system PR must have the pure function separable from the Bevy wrapper. If a reviewer can't identify which function a minimal client would call, the PR needs restructuring.
2. **Test rule:** Pure functions get direct unit tests with constructed data. Bevy integration tests cover system wiring. Both must exist.
3. **Import rule:** Pure function modules must not `use bevy_ecs::*` or any Bevy crate. This is grep-verifiable: `grep -r "use bevy" src/sim/pure/` should return nothing.

### Known limitation: type entanglement

D080's pure function discipline decouples *algorithms* from Bevy but not *data types*. Sim types like `WeaponStats` and `ArmorStats` must `#[derive(Component)]` to participate in Bevy queries, which requires `bevy_ecs` at compile time. This means:

- The grep enforcement rule passes — pure function modules don't import `bevy_ecs`
- But the types those functions accept are defined with `#[derive(Component)]` elsewhere in `ic-sim`
- A minimal client importing `ic-sim` as-is would still compile `bevy_ecs` as a transitive dependency

**This is intentional for now.** Resolving type entanglement requires one of two approaches, neither of which should be chosen prematurely:

| Approach | Mechanism | Trade-off |
|---|---|---|
| Feature-gated derives | `#[cfg_attr(feature = "bevy", derive(Component))]` on sim data types | Clean; requires `ic-sim` to have a `bevy` feature flag that `ic-game` enables. Minimal client compiles `ic-sim` with the feature disabled. |
| Wrapper-type split | Sim types are plain structs. Bevy wrapper module defines newtype components: `struct WeaponStatsComponent(WeaponStats)` | No feature flags needed; extra boilerplate in the wrapper layer. |

**The decision to choose between these approaches is deferred to the point where a crate split or minimal client prototype is actually attempted.** By that time, the sim API surface will be known and the better choice will be obvious. D080 ensures the algorithmic seams exist so that either approach is a local refactor, not an architectural rewrite.

**What D080 gives you today:**
- Algorithms are independently testable, profilable, and reviewable
- The function-level seam is the hard part; type decoupling is mechanical once the seam exists
- A `cargo new ic-sim-core` + move pure modules + pick a type strategy is a bounded task, not a redesign

**What D080 does not give you today:**
- A `bevy_ecs`-free compilation of the sim
- A sub-16 MB client binary from `ic-sim` alone

### Relationship to other decisions

- **D002 (Bevy framework):** Fully preserved. Bevy remains the scheduler, ECS, plugin system, and primary runtime. D080 is about internal function organization within `ic-sim`, not about removing Bevy.
- **D010 (Snapshottable state):** Compatible. Snapshot serialization operates on ECS state in the Bevy client; a minimal client would snapshot its own equivalent structures.
- **D015 (Efficiency-first):** Reinforced. Pure functions with explicit data flow are easier to profile and optimize than functions coupled to ECS query mechanics.
- **D018 (Game modules):** Compatible. `GameModule` registration remains Bevy-native. The pure functions are below the module registration layer.
- **D076 (Crate extraction):** If `ic-sim-core` is ever extracted, it would follow D076's extraction strategy. D080 ensures the code is already structured for this.
