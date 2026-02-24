# Source Code Index Template (Human + LLM Navigation)

This is a template for a **code repository navigation index** (recommended filename: `CODE-INDEX.md`).

Its purpose is to let:

- humans find the right code quickly
- LLMs route to the right files without wasting context
- implementers understand boundaries, hot paths, and risk before editing

Use this in external implementation repos that follow the Iron Curtain design docs.

## Why This Exists

Large RTS codebases become difficult to navigate long before they become feature-complete.

A good source code index:

- reduces wrong-file edits
- reduces context-window waste for agents
- makes architectural boundaries visible
- links code to design decisions (`Dxxx`) and execution steps (`G*`)

## Recommended Filename

- `CODE-INDEX.md` (preferred)

Alternative names are acceptable if the repo documents them in `AGENTS.md`.

## Template (copy and fill in)

```md
# CODE-INDEX.md — <PROJECT NAME>

> Source code navigation index for humans and LLMs.
> Canonical design authority: `<design-doc repo URL/path>` @ `<tag|commit|date>`

## How to Use This Index

- Start with the **Task Routing** section to find the right subsystem
- Read the **Subsystem Index** entry before editing any crate/package
- Follow the **Do Not Edit / Generated** notes
- Use the linked tests/profiles as proof paths for changes

## Current Scope / Build Target

- Active milestone(s): `<M#>`
- Active `G*` step(s): `<G# ...>`
- Current focus area(s): `<e.g., M1 renderer slice, G2/G3>`
- Known blockers (`Pxxx` / external): `<...>`

## Task Routing (Start Here For X)

| If you need to... | Start here | Then read | Avoid touching first |
| --- | --- | --- | --- |
| Implement deterministic sim behavior | `<path>` | `<path>`, tests | `<render/UI paths>` |
| Work on netcode / relay timing | `<path>` | `<path>`, protocol types | `<sim internals>` unless required |
| Add UI/HUD feature | `<path>` | `<path>`, UX mocks/docs | core sim/net paths |
| Add editor feature | `<path>` | `<path>`, design docs | game binary integration |
| Import/parse resource formats | `<path>` | `<path>`, format tests | UI/editor until parser stable |
| Fix pathfinding bug | `<path>` | conformance tests, map fixtures | unrelated gameplay systems |

## Repository Map (Top-Level)

| Path | Role | Notes |
| --- | --- | --- |
| `<path>` | `<crate/package/module>` | `<responsibility>` |
| `<path>` | `<tests>` | `<integration/unit fixtures>` |
| `<path>` | `<tools/scripts>` | `<generated/manual>` |

## Subsystem Index (Canonical Entries)

Repeat one block per major crate/package/subsystem.

### `<crate-or-package-name>`

- **Path:** `<path>`
- **Primary responsibility:** `<what this subsystem owns>`
- **Does not own:** `<explicit non-goals / boundaries>`
- **Public interfaces / trait seams:** `<traits/types/functions>`
- **Key files to read first:** `<path1>`, `<path2>`
- **Hot paths / perf-sensitive files:** `<paths>`
- **Generated files:** `<paths or "none">`
- **Tests / verification entry points:** `<tests, commands, fixtures>`
- **Related design decisions (`Dxxx`):** `<Dxxx...>`
- **Related execution steps (`G*`):** `<G#...>`
- **Common change risks:** `<determinism, allocs, thread safety, UX drift, etc.>`
- **Search hints:** `<keywords/symbols to grep>`
- **Last audit date (optional):** `<date>`

## Cross-Cutting Boundaries (Must Respect)

List the highest-value rules that prevent accidental architecture violations.

- `<example: sim package must not import network package>`
- `<example: UI package may not mutate authoritative sim state directly>`
- `<example: protocol types are shared boundary; do not duplicate wire structs>`

## Generated / Vendored / Third-Party Areas

| Path | Type | Edit policy |
| --- | --- | --- |
| `<path>` | Generated | Regenerate, do not hand-edit |
| `<path>` | Vendored | Patch only with explicit note |
| `<path>` | Build output fixture | Replace via script/test command |

## Implementation Evidence Paths

Where to attach proof when claiming progress:

- Unit tests: `<path/command>`
- Integration tests: `<path/command>`
- Replay/demo artifacts: `<path>`
- Perf profiles/flamegraphs: `<path>`
- Manual verification notes: `<path/docs>`

## Design Gap Escalation (When Code and Docs Disagree)

If implementation reveals a conflict with canonical design docs:

1. Record the code path and failing assumption
2. Link the affected `Dxxx` / canonical doc path
3. Open a design-gap/design-change issue
4. Mark local workaround as `implementation placeholder` or `blocked on Pxxx`

## Maintenance Rules

- Update this file in the same change set when:
  - code layout changes
  - ownership boundaries move
  - new major subsystem is added
  - active milestone/G* focus changes materially
- Keep "Task Routing" and "Subsystem Index" current; these are the highest-value sections for agents and new contributors.
```

## Example Subsystem Entries (IC-Aligned Sketch)

These are examples of the level of detail expected, using the planned crate layout from the design docs.

### `ic-sim` (example)

- **Path:** `crates/ic-sim/`
- **Primary responsibility:** deterministic simulation tick; authoritative game state evolution
- **Does not own:** network transport, renderer, editor UI
- **Public interfaces / trait seams:** `GameModule`, `Pathfinder`, `SpatialIndex`
- **Related design decisions (`Dxxx`):** D006, D009, D010, D012, D013, D018
- **Related execution steps (`G*`):** `G6`, `G7`, `G9`, `G10`
- **Common change risks:** determinism regressions, allocations in hot loops, hidden I/O

### `ic-net` (example)

- **Path:** `crates/ic-net/`
- **Primary responsibility:** `NetworkModel` implementations, relay client/server core, timing normalization
- **Does not own:** sim state mutation rules (validation lives in sim)
- **Related design decisions (`Dxxx`):** D006, D007, D008, D011, D052, D060
- **Related execution steps (`G*`):** `G17.*`, `G20.*`
- **Common change risks:** trust claim overreach, fairness drift, timestamp handling mismatches

## Execution Overlay Mapping

- **Milestone:** `M0`
- **Priority:** `P-Core`
- **Feature Cluster:** `M0.OPS.EXTERNAL_CODE_REPO_BOOTSTRAP_AND_NAVIGATION_TEMPLATES`
- **Depends on:** `M0.CORE.TRACKER_FOUNDATION`, `M0.CORE.DEP_GRAPH_SCHEMA`

