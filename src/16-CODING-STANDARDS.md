# 16 — Coding Standards

## Purpose of This Chapter

This chapter defines **how Iron Curtain code is written** — the style, structure, commenting practices, and testing philosophy that every contributor follows. The goal is a codebase that a person just learning Rust can navigate comfortably, where bugs are easy to find, and where any file can be read in isolation without needing the full project context.

The rules here complement the architectural invariants in `AGENTS.md`, the performance philosophy in [10-PERFORMANCE](10-PERFORMANCE.md), the development methodology in [14-METHODOLOGY](14-METHODOLOGY.md), and the design principles in [13-PHILOSOPHY](13-PHILOSOPHY.md). Those documents say *what* to build and *why*. This document says *how to write it*.

---

## Core Philosophy: Boring Code

Iron Curtain's codebase will be large — hundreds of thousands of lines across 11+ crates. The code must be boring. Predictable. Unsurprising. A developer (or an LLM) should be able to open any file, read it top to bottom, and understand what it does without jumping to ten other files.

**What "boring" means in practice:**

- **No clever tricks.** If there's a straightforward way and a clever way to do the same thing, choose the straightforward way. Clever code is write-once, debug-forever.
- **No magic.** Every behavior should be traceable by reading the code linearly. No action-at-a-distance through hidden trait implementations, no implicit conversions that change semantics, no macros that generate invisible code paths a reader can't follow.
- **Consistent patterns everywhere.** Once you've read one system, you know how all systems look. Once you've read one component file, you know how all component files are structured. Repetition is a feature — it means a contributor doesn't need to learn new patterns per-file.
- **Explicit over implicit.** Name things for what they are. Convert types with named functions, not `From`/`Into` chains that obscure what's happening. Use full words in identifiers — `damage_multiplier`, not `dmg_mult`.

> *"Debugging is twice as hard as writing the code in the first place. Therefore, if you write the code as cleverly as possible, you are, by definition, not smart enough to debug it."*
>
> — Brian Kernighan

---

## File Structure Convention

Every `.rs` file follows the same top-to-bottom order. A contributor opening any file knows exactly where to look for what.

```rust
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025–present Iron Curtain contributors

//! # Module Name — One-Line Purpose
//!
//! Longer description: what this module does, where it fits in the
//! architecture, and what crate/system depends on it.
//!
//! ## Architecture Context
//!
//! This module is part of `ic-sim` and runs during the `combat_system()`
//! step of the fixed-update pipeline. It reads `Armament` components and
//! writes `DamageEvent`s that the `cleanup_system()` processes next tick.
//!
//! See: 02-ARCHITECTURE.md § "ECS Design" → "System Pipeline"
//!
//! ## Algorithm Overview
//!
//! [Brief description of the core algorithm, with external references
//!  if applicable — e.g., "Uses JPS (Jump Point Search) as described
//!  in Harabor & Grastien 2011: https://example.com/jps-paper"]

// ── Imports ──────────────────────────────────────────────────────
// Grouped: std → external crates → workspace crates → local modules
use std::collections::HashMap;

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use ic_protocol::PlayerOrder;

use crate::components::health::Health;
use crate::math::fixed::Fixed;

// ── Constants ────────────────────────────────────────────────────
// Named constants with doc comments explaining the value choice.

/// Maximum number of projectiles any single weapon can fire per tick.
/// Chosen to prevent degenerate cases in modded weapons from stalling
/// the simulation. If a mod needs more, this is the value to raise.
const MAX_PROJECTILES_PER_TICK: u32 = 64;

// ── Types ────────────────────────────────────────────────────────
// Structs, enums, type aliases. Each with full doc comments.

// ── Implementation Blocks ────────────────────────────────────────
// impl blocks for the types above. Methods grouped logically:
// constructors first, then queries, then mutations.

// ── Systems / Free Functions ─────────────────────────────────────
// ECS systems or standalone functions. Each with a doc comment
// explaining what it does, when it runs, and what it reads/writes.

// ── Tests ────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    // ...
}
```

**Why this order matters:** A contributor scanning a new file reads the module doc first (what is this?), then the imports (what does it depend on?), then constants (what are the magic numbers?), then types (what data does it hold?), then logic (what does it do?), then tests (how do I verify it?). This is the natural order for understanding code, and every file uses it.

---

## Commenting Philosophy: Write for the Reader Who Lacks Context

The codebase will be read by people who don't hold the full project context: new contributors, occasional volunteers, future maintainers years from now, and LLMs analyzing isolated code sections. Every comment should be written for that audience.

### The Three Levels of Comments

**Level 1 — Module docs (`//!`):** Explain the *big picture*. What does this module do? Where does it fit in the architecture? What system calls it? What data flows in and out? Include a section header like `## Architecture Context` that explicitly names the crate, the system pipeline step, and which other modules are upstream/downstream.

```rust
//! # Harvesting System
//!
//! Manages the ore collection and delivery cycle for harvester units.
//! This is the economic backbone of every RA match — if this breaks,
//! nobody can build anything.
//!
//! ## Architecture Context
//!
//! - **Crate:** `ic-sim`
//! - **Pipeline step:** Runs after `movement_system()`, before `production_system()`
//! - **Reads:** `Harvester`, `Mobile`, `ResourceField`, `ResourceStorage`
//! - **Writes:** `ResourceStorage` (credits), `Harvester` (cargo state)
//! - **Depends on:** Pathfinder trait (for return-to-refinery routing)
//!
//! ## How Harvesting Works
//!
//! 1. Harvester moves to an ore field (handled by `movement_system()`)
//! 2. Each tick at the field, harvester loads ore (rate from YAML rules)
//! 3. When full (or field exhausted), harvester pathfinds to nearest refinery
//! 4. At refinery, cargo converts to player credits over several ticks
//! 5. Cycle repeats until the harvester is destroyed or given a new order
//!
//! This matches original Red Alert behavior. OpenRA uses the same cycle
//! but adds a "find alternate refinery" fallback that we also implement.
//!
//! See: Original RA source — HARVEST.CPP, HarvestClass::AI()
//! See: OpenRA — Harvester.cs, FindAndDeliverResources activity
```

**Level 2 — Function/method docs (`///`):** Explain *what* and *why*. What does this function do? Why does it exist? What are the edge cases? What happens on failure? Don't just restate the type signature — explain the intent.

```rust
/// Calculates how many credits a harvester should extract this tick.
///
/// The extraction rate comes from the unit's YAML definition (`harvest_rate`),
/// modified by veterancy bonuses (D028 condition system). The actual amount
/// extracted may be less than the rate if:
/// - The ore field has fewer resources remaining than the rate
/// - The harvester's cargo is almost full (partial load)
///
/// Returns 0 if the harvester is not adjacent to an ore field.
///
/// # Why fixed-point
/// Credits are `i32` (fixed-point), not `f32`. The sim is deterministic —
/// floating-point would cause desync across platforms. See AGENTS.md
/// invariant #1.
fn calculate_extraction(
    harvester: &Harvester,
    field: &ResourceField,
    veterancy: Option<&Veterancy>,
) -> i32 {
    // ...
}
```

**Level 3 — Inline comments (`//`):** Explain *how* and *why this particular approach*. Use inline comments for non-obvious logic, algorithm steps, workarounds, and "why not the obvious approach" explanations.

```rust
// Walk the ore field tiles in a spiral pattern outward from the harvester's
// position. This mimics original RA behavior — harvesters don't teleport to
// the richest tile, they work outward from where they are. The spiral also
// means two harvesters on opposite sides of a field naturally share instead
// of fighting over the same tile.
//
// See: Original RA source — CELL.CPP, CellClass::Ore_Adjust()
// See: https://www.youtube.com/watch?v=example (RA harvester AI analysis)
for (dx, dy) in spiral_offsets(max_radius) {
    let cell = harvester_cell.offset(dx, dy);
    if let Some(ore) = field.ore_at(cell) {
        if ore.amount > 0 {
            return Some(cell);
        }
    }
}
```

### What to Comment

- **Algorithm choice:** "We use JPS instead of A* here because..." or "This is a simple linear scan because the array is always < 50 elements."
- **Non-obvious "why":** "We check `is_alive()` before firing because dead units still exist in the ECS for one tick (cleanup runs after combat)."
- **External references:** Link to the original RA source function, the OpenRA equivalent, research papers, or explanatory videos. These links are invaluable for future contributors trying to understand intent.
- **Workarounds and known limitations:** "TODO(phase-3): This linear search should become a spatial query once SpatialIndex is implemented." Mark temporary code clearly.
- **Edge cases:** "A harvester can arrive at a refinery that was sold between the pathfind and the arrival. In that case, we re-route to the next closest refinery."
- **Performance justification:** "Using `Vec::retain()` here instead of `HashSet::remove()` because the typical array size is 4–8 (weapon slots per unit). Linear scan is faster than hash overhead at this size."

### What NOT to Comment

- **The obvious:** Don't write `// increment counter` above `counter += 1`. The code already says that.
- **Restating the type signature:** Don't write `/// Takes a Health and returns a bool` above `fn is_alive(health: &Health) -> bool`. Explain *what* "alive" means instead.
- **Apologetic commentary:** Don't write `// sorry this is ugly`. Fix it or file an issue.

### External Reference Links in Comments

Comments may link to external resources when they help a reader understand the code:

```rust
// JPS (Jump Point Search) optimization for uniform-cost grid pathfinding.
// Skips intermediate nodes that A* would expand, reducing open-list size
// by 10-30x on typical RA maps.
//
// Paper: Harabor & Grastien (2011) — "Online Graph Pruning for Pathfinding
//        on Grid Maps" — https://example.com/jps-paper
// Video: "A* vs JPS Explained" — https://youtube.com/watch?v=example
// Original RA: Used simple A* (ASTAR.CPP). JPS is our improvement.
// OpenRA: Also uses A* with heuristic — OpenRA/Pathfinding/PathSearch.cs
```

**Acceptable link targets:** Academic papers, official documentation, Wikipedia for well-known algorithms, YouTube explainers, official EA GPL source code on GitHub, OpenRA source code on GitHub. Links should be stable (DOI for papers when available, GitHub permalink with commit hash for source code).

---

## Naming Conventions

### Clarity Over Brevity

```rust
// ✅ Good — full words, self-describing
damage_multiplier: Fixed,
harvester_cargo_capacity: i32,
projectile_speed: Fixed,
is_cloaked: bool,

// ❌ Bad — abbreviations require context the reader may not have
dmg_mult: Fixed,
hvst_cap: i32,
proj_spd: Fixed,
clk: bool,
```

### Consistent Naming Patterns

| What                 | Convention                     | Example                                       |
| -------------------- | ------------------------------ | --------------------------------------------- |
| Components (structs) | `PascalCase` noun              | `Health`, `Armament`, `ResourceStorage`       |
| Systems (functions)  | `snake_case` verb              | `movement_system()`, `combat_system()`        |
| Boolean fields       | `is_` / `has_` / `can_` prefix | `is_cloaked`, `has_ammo`, `can_attack`        |
| Constants            | `SCREAMING_SNAKE`              | `MAX_PROJECTILES_PER_TICK`                    |
| Modules              | `snake_case` noun              | `health.rs`, `combat.rs`, `harvesting.rs`     |
| Traits               | `PascalCase` noun/adjective    | `Pathfinder`, `SpatialIndex`, `Snapshottable` |
| Enum variants        | `PascalCase`                   | `DamageState::Critical`, `Facing::North`      |
| Type aliases         | `PascalCase`                   | `PlayerId`, `TickCount`, `CellCoord`          |
| Error types          | `PascalCase` + `Error` suffix  | `ParseError`, `OrderValidationError`          |

### Naming for Familiarity

Where possible, use names that are already familiar to the C&C community:

| IC Name           | Original RA Equivalent | OpenRA Equivalent       | Notes                                       |
| ----------------- | ---------------------- | ----------------------- | ------------------------------------------- |
| `Health`          | `STRENGTH` field       | `Health` trait          | Same concept across all three               |
| `Armament`        | weapon slot logic      | `Armament` trait        | Matched to OpenRA vocabulary                |
| `Harvester`       | `HarvestClass`         | `Harvester` trait       | Universal C&C concept                       |
| `Locomotor`       | movement type enum     | `Locomotor` trait       | D027 — canonical enum compatibility         |
| `Veterancy`       | veterancy system       | `GainsExperience` trait | IC uses the community-standard name         |
| `ProductionQueue` | factory queue logic    | `ProductionQueue` trait | Same name, same concept                     |
| `Superweapon`     | special weapon logic   | `NukePower` etc.        | IC generalizes into a single component type |

See D023 (OpenRA vocabulary compatibility) and D027 (canonical enum names) for the full mapping.

---

## Error Handling: Errors as Diagnostic Tools

Errors in Iron Curtain are not afterthoughts — they are **first-class diagnostic tools** designed to be read by three audiences: a human developer staring at a terminal, an LLM agent analyzing a log file, and a player reading an error dialog. Every error message should give any of these readers enough information to understand *what* failed, *where* it failed, *why* it failed, and *what to do about it* — without needing access to the source code or surrounding context.

The bar is this: **an LLM reading a single error message should be able to pinpoint the root cause and suggest a fix.** If the error message doesn't contain enough information for that, it's a bad error message.

### The Five Requirements for Every Error

Every error in the codebase — whether it's a `Result::Err`, a log message, or a user-facing dialog — must satisfy these five requirements:

1. **What failed.** Name the operation that didn't succeed. Not "error" or "invalid input" — say "Failed to parse SHP sprite file" or "Order validation rejected build command."

2. **Where it failed.** Include the location in data space: file path, player ID, unit entity ID, tick number, YAML rule name, map cell coordinates — whatever identifies the specific instance. A developer should never need to ask "which one?"

3. **Why it failed.** State the specific condition that was violated. Not "invalid data" — say "expected 768 bytes for palette, got 512" or "player 3 ordered construction of 'advanced_power_plant' but lacks prerequisite 'war_factory'."

4. **What was expected vs. what was found.** Wherever possible, include both sides of a failed check. "Expected file count: 47, actual data for: 31 files." "Required prerequisite: war_factory, player has: barracks, power_plant." This lets the reader immediately see the gap.

5. **What to do about it.** When the fix is knowable, say so. "Check that the .mix file is not truncated." "Ensure the mod's rules.yaml lists war_factory in the prerequisites chain." "This usually means the game installation is incomplete — reinstall or point IC_CONTENT_DIR to a valid RA install." Not every error has an obvious fix, but many do — and including the fix saves hours of debugging.

### No Silent Failures

```rust
// ✅ Good — the error is visible, specific, and the caller decides what to do
fn load_palette(path: &VirtualPath) -> Result<Palette, PaletteError> {
    let data = asset_store.read(path)
        .map_err(|e| PaletteError::IoError { path: path.clone(), source: e })?;

    if data.len() != 768 {
        return Err(PaletteError::InvalidSize {
            path: path.clone(),
            expected: 768,
            actual: data.len(),
        });
    }

    Ok(Palette::from_raw_bytes(&data))
}

// ❌ Bad — failures are invisible, bugs will be impossible to find
fn load_palette(path: &VirtualPath) -> Palette {
    let data = asset_store.read(path).unwrap(); // panics with no context
    Palette::from_raw_bytes(&data)              // silently wrong if len != 768
}
```

### Error Messages Are Complete Sentences

Every `#[error("...")]` string and every `tracing::error!()` message should be a complete, self-contained diagnostic. The message must make sense when read in isolation — ripped from a log file with no surrounding context.

```rust
// ✅ Good — an LLM reading this in a log file knows exactly what happened
#[error(
    "MIX archive '{path}' header declares {declared} files, \
     but the archive data only contains space for {actual} files. \
     The archive may be truncated or corrupted. \
     Try re-extracting the .mix file from the original game installation."
)]
FileCountMismatch {
    path: PathBuf,
    declared: u16,
    actual: u16,
},

// ❌ Bad — requires context that the reader doesn't have
#[error("file count mismatch")]
FileCountMismatch,

// ❌ Bad — has numbers but no explanation of what they mean
#[error("mismatch: {0} vs {1}")]
FileCountMismatch(u16, u16),
```

### Error Types Are Specific and Richly Contextual

Each crate defines its own error types. Every variant carries **structured fields** with enough data to reconstruct the problem scenario without a debugger, a stack trace, or access to the machine where the error occurred.

```rust
/// Errors from parsing .mix archive files.
///
/// ## Design Philosophy
///
/// Every variant includes the source file path so that error messages
/// are immediately actionable — "what file caused this?" is always
/// answered. The `#[error]` messages are written as complete diagnostic
/// paragraphs: they state the problem, show expected vs. actual values,
/// and suggest a remediation when possible.
///
/// These messages are intentionally verbose. A log line like:
///   "MIX archive 'MAIN.MIX' header declares 47 files, but the archive
///    data only contains space for 31 files."
/// is immediately understood by a human, an LLM, or an automated
/// monitoring tool — no additional context needed.
#[derive(Debug, thiserror::Error)]
pub enum MixParseError {
    #[error(
        "Failed to read MIX archive at '{path}': {source}. \
         Verify the file exists and is not locked by another process."
    )]
    IoError {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error(
        "MIX archive '{path}' header declares {declared} files, \
         but the archive data only contains space for {actual} files. \
         The archive may be truncated or corrupted. \
         Try re-extracting from the original game installation."
    )]
    FileCountMismatch {
        path: PathBuf,
        declared: u16,
        actual: u16,
    },

    #[error(
        "CRC collision in MIX archive '{path}': filenames '{name_a}' and \
         '{name_b}' both hash to CRC {crc:#010x}. This is extremely rare \
         in vanilla RA archives — if this is a modded .mix file, one of \
         the filenames may need to be changed to avoid the collision."
    )]
    CrcCollision {
        path: PathBuf,
        name_a: String,
        name_b: String,
        crc: u32,
    },
}
```

### Error Context Propagation: The Chain Must Be Unbroken

When an error crosses module or crate boundaries, **wrap it with additional context at each layer** rather than discarding it. The final error message should tell the full story from the user's action down to the root cause.

```rust
/// Errors when loading a game module's rule definitions.
#[derive(Debug, thiserror::Error)]
pub enum RuleLoadError {
    #[error(
        "Failed to load rules for game module '{module_name}' \
         from file '{path}': {source}"
    )]
    YamlParseError {
        module_name: String,
        path: PathBuf,
        #[source]
        source: serde_yaml::Error,
    },

    #[error(
        "Unit definition '{unit_name}' in '{path}' references unknown \
         weapon '{weapon_name}'. Available weapons in this module: \
         [{available}]. Check spelling or ensure the weapon is defined \
         in the module's weapons/ directory."
    )]
    UnknownWeaponReference {
        unit_name: String,
        path: PathBuf,
        weapon_name: String,
        /// Comma-separated list of weapon names the module actually defines.
        available: String,
    },

    #[error(
        "Circular inheritance detected in '{path}': {chain}. \
         YAML inheritance (the 'inherits:' field) must form a DAG — \
         A inherits B inherits C is fine, but A inherits B inherits A \
         is a cycle. Break the cycle by removing one 'inherits:' link."
    )]
    CircularInheritance {
        path: PathBuf,
        /// Human-readable chain like "heavy_tank → medium_tank → heavy_tank"
        chain: String,
    },
}
```

**The chain in practice:** When a user launches a game and a mod rule fails to load, the error they see (and the error in the log file) reads like a story:

```
ERROR: Failed to start game with mod 'combined_arms':
  → Failed to load rules for game module 'combined_arms' from file
    'mods/combined_arms/rules/units/vehicles.yaml':
    → Unit definition 'mammoth_tank_mk2' references unknown weapon
      'double_rail_gun'. Available weapons in this module:
      [rail_gun, plasma_cannon, tesla_bolt, prism_beam].
      Check spelling or ensure the weapon is defined in the module's
      weapons/ directory.
```

An LLM reading this log extract — with zero other context — can immediately say: "The mod `combined_arms` has a unit called `mammoth_tank_mk2` that references a weapon `double_rail_gun` which doesn't exist. The available weapons are `rail_gun`, `plasma_cannon`, `tesla_bolt`, `prism_beam`. The fix is either to rename the reference to one of the available weapons (probably `rail_gun` if it should be a railgun), or to create a new weapon definition called `double_rail_gun`." That's the bar.

### Error Design Patterns

**Pattern 1 — Expected vs. Actual:** For validation errors, always include both what was expected and what was found.

```rust
#[error(
    "Palette file '{path}' has {actual} bytes, expected exactly 768 bytes \
     (256 colors × 3 bytes per RGB triplet). The file may be truncated \
     or in an unsupported format."
)]
InvalidPaletteSize {
    path: PathBuf,
    expected: usize,  // always 768, but the field documents the contract
    actual: usize,
},
```

**Pattern 2 — "Available Options" Lists:** When a lookup fails, show what *was* available. This turns "not found" into an immediately fixable typo.

```rust
#[error(
    "No content source found for game '{game_id}'. \
     Searched: {searched_locations}. \
     IC needs Red Alert game files to run. Install RA from Steam, GOG, \
     or the freeware release, or set IC_CONTENT_DIR to point to your \
     RA installation directory."
)]
NoContentSource {
    game_id: String,
    /// Human-readable list like "Steam (AppId 2229870), GOG, Origin registry, ~/.openra/Content/ra/"
    searched_locations: String,
},
```

**Pattern 3 — Tick and Entity Context for Sim Errors:** Errors in `ic-sim` must include the simulation tick and the entity involved, so replay-based debugging can jump directly to the problem.

```rust
#[error(
    "Order validation failed at tick {tick}: player {player_id} ordered \
     unit {entity:?} to attack entity {target:?}, but the target is \
     not attackable (it has no Health component). This can happen if \
     the target was destroyed between the order being issued and \
     the order being validated."
)]
InvalidAttackTarget {
    tick: u32,
    player_id: PlayerId,
    entity: Entity,
    target: Entity,
},
```

**Pattern 4 — YAML Source Location:** For rule-loading errors, include the YAML file path and, when the YAML parser provides it, the line and column number. Modders should be able to open the file and jump directly to the problem.

```rust
#[error(
    "Invalid value for field 'cost' in unit '{unit_name}' at \
     {path}:{line}:{column}: expected a positive integer, got '{raw_value}'. \
     Unit costs must be non-negative integers (e.g., cost: 800)."
)]
InvalidFieldValue {
    unit_name: String,
    path: PathBuf,
    line: usize,
    column: usize,
    raw_value: String,
},
```

**Pattern 5 — Suggestion-Bearing Errors for Common Mistakes:** When the error matches a known common mistake, include a targeted suggestion.

```rust
#[error(
    "Unknown armor type '{given}' in unit '{unit_name}' at '{path}'. \
     Valid armor types: [{valid_types}]. \
     Note: 'Heavy' and 'heavy' are different — armor types are case-sensitive. \
     Did you mean '{suggestion}'?"
)]
UnknownArmorType {
    given: String,
    unit_name: String,
    path: PathBuf,
    valid_types: String,
    /// Closest match by edit distance, if one is close enough.
    suggestion: String,
},
```

### `unwrap()` and `expect()` Policy

- **In the sim (`ic-sim`):** No `unwrap()`. No `expect()`. Every fallible operation returns `Result` or `Option` handled explicitly. The sim is the core of the engine — a panic in the sim kills every player's game.
- **In test code:** `unwrap()` is fine — test failures should panic with a clear message.
- **In setup/initialization code (game startup):** `expect("reason")` is acceptable for conditions that genuinely indicate a broken installation (missing required game files, invalid config). The reason string must explain what went wrong in plain English: `expect("config.toml must exist in the install directory")`.
- **Everywhere else:** Prefer `?` propagation with contextual error types. If `unwrap()` is truly the right choice (impossible `None` proven by invariant), add a comment explaining why.

### Error Testing

Errors are first-class behavior — they must be tested just like success paths:

```rust
#[test]
fn truncated_mix_reports_file_count_mismatch() {
    // Create a MIX header that claims 47 files but provide data for only 31.
    let truncated = build_truncated_mix(declared: 47, actual_data_for: 31);

    let err = parse_mix(&truncated).unwrap_err();

    // Verify the error variant carries the right context.
    match err {
        MixParseError::FileCountMismatch { declared, actual, .. } => {
            assert_eq!(declared, 47);
            assert_eq!(actual, 31);
        }
        other => panic!("Expected FileCountMismatch, got: {other}"),
    }

    // Verify the Display message is human/LLM-readable.
    let msg = err.to_string();
    assert!(msg.contains("47"), "Error message should show declared count");
    assert!(msg.contains("31"), "Error message should show actual count");
    assert!(msg.contains("truncated"), "Error message should suggest cause");
}

#[test]
fn unknown_weapon_lists_available_options() {
    let rules = load_test_rules_with_bad_weapon_ref("double_rail_gun");

    let err = validate_rules(&rules).unwrap_err();
    let msg = err.to_string();

    // An LLM reading just this message should be able to suggest the fix.
    assert!(msg.contains("double_rail_gun"), "Should name the bad reference");
    assert!(msg.contains("rail_gun"), "Should list available weapons");
    assert!(msg.contains("Check spelling"), "Should suggest a fix");
}
```

**Why test error messages:** If an error message regresses (loses context, becomes vague), it becomes harder for humans and LLMs to diagnose problems. Testing the message content catches these regressions. This is not testing implementation details — it's testing the diagnostic contract the error provides to its readers.

---


---

## Sub-Pages

| Section | Topic | File |
| --- | --- | --- |
| Quality & Review | Function/module size limits, isolation/context independence, testing philosophy, code patterns (ECS/component/error), logging/diagnostics, type-safety standards, unsafe code policy, dependency policy, commit/review standards, code promise | [quality-review.md](coding-standards/quality-review.md) |
