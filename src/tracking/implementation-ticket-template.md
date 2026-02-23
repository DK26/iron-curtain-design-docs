# Implementation Ticket Template (G-Step Aligned, Markdown-Canonical)

Keywords: implementation ticket template, work package template, milestone execution, G-step mapping, evidence artifact, dependency checklist

> This page is a **developer work-package template** for breaking milestone ladder steps (`G1`, `G2`, …) into implementable tickets. It is a companion to [`../18-PROJECT-TRACKER.md`](../18-PROJECT-TRACKER.md) and [`milestone-dependency-map.md`](milestone-dependency-map.md), not a replacement for either.

## Purpose

Use this template when turning a tracker step (for example `G7` or `G20.3`) into an implementation ticket or bundle of tickets.

Goals:

- keep work tied to the execution overlay (`M#`, `G#`, `P-*`)
- make blockers/dependencies explicit
- require proof artifacts/evidence, not vague “done”
- reduce scope creep by recording non-goals

## When To Use This Template

Use for:

- implementation ticket creation (`G*` work packages)
- milestone exit sub-checklists
- cross-repo work planning (engine repo, tools repo, server repo) where docs remain the canonical plan

Do not use for:

- new feature proposals that are not yet mapped into the overlay
- high-level design decisions (use `Dxxx` decisions + capsules instead)
- research notes (use `research/*.md`)

## Required Mapping Rule (Execution Overlay Discipline)

Every ticket created from this template must include:

- a **linked `G*` step** (or explicit `M#` cluster if no `G*` exists yet)
- a **milestone** (`M0–M11`)
- a **priority** (`P-Core`, `P-Differentiator`, `P-Creator`, `P-Scale`, `P-Optional`)
- dependency references (`G*`, `Dxxx`, `Pxxx`, cluster IDs)
- a verification/evidence plan

If the work is not mapped in the overlay yet, it is a **proposal** and should not be tracked as scheduled implementation work.

## Template (Copy/Paste)

```md
# [Ticket ID] [Short Implementation Title]

## Execution Overlay Mapping

- `Milestone:` `M#`
- `Primary Ladder Step:` `G#` (or `—` if not yet decomposed)
- `Priority:` `P-*`
- `Feature Cluster(s):` `M#.X.*`
- `Related Decisions:` `Dxxx`, `Dyyy`
- `Pending Decision Gates:` `Pxxx` (or `—`)

## Goal

One paragraph: what this ticket implements and what milestone progress it unlocks.

## In Scope

- ...
- ...
- ...

## Out of Scope (Non-Goals)

- ...
- ...

## Hard Dependencies

- `...`
- `...`

## Soft Dependencies / Coordination

- `...`
- `...`

## Implementation Notes / Constraints

- Determinism / authority boundary constraints (if applicable)
- Performance constraints (if applicable)
- UI/UX guardrails (if applicable)
- Compatibility/export/trust caveats (if applicable)

## Verification / Evidence Plan

- `Automated:` ...
- `Manual:` ...
- `Artifacts:` (video/screenshot/log/replay/hash/test report)

## Completion Criteria

- [ ] ...
- [ ] ...
- [ ] ...
- [ ] Evidence links added to tracker / milestone notes

## Evidence Links (fill when done)

- `...`
- `...`

## Risks / Follow-ups

- ...
- ...
```

## Example (Filled, `G7`)

```md
# T-M2-G7-01 Integrate Pathfinder and SpatialIndex into Move Orders

## Execution Overlay Mapping

- `Milestone:` `M2`
- `Primary Ladder Step:` `G7`
- `Priority:` `P-Core`
- `Feature Cluster(s):` `M2.CORE.PATH_SPATIAL`
- `Related Decisions:` `D013`, `D045`, `D015`, `D041`
- `Pending Decision Gates:` `P002`

## Goal

Wire the selected `Pathfinder` and `SpatialIndex` implementations into deterministic move-order execution so units can receive movement orders and follow valid paths around blockers in the simulation.

## In Scope

- movement-order -> path request integration in sim tick loop
- deterministic spatial query usage in move path planning
- path-following state transitions for units
- minimal obstacle/path blockage handling needed for the `M2` combat slice

## Out of Scope (Non-Goals)

- advanced pathfinding behavior presets tuning (full `D045` coverage)
- flocking/ORCA-lite polish beyond what is required for deterministic movement baseline
- campaign/script-facing path preview APIs

## Hard Dependencies

- `P002` fixed-point scale resolved
- `G6` deterministic sim tick + order application skeleton

## Soft Dependencies / Coordination

- `G8` render/sim sync for visible movement presentation
- `G9` combat baseline (movement positioning affects targeting)

## Implementation Notes / Constraints

- Preserve deterministic ordering for spatial queries (see architecture/pathfinding conformance rules)
- Avoid hidden allocation-heavy hot-path behavior where `_into` APIs exist
- Keep sim/net boundary clean (`ic-sim` must not import `ic-net`)

## Verification / Evidence Plan

- `Automated:` `PathfinderConformanceTest`, `SpatialIndexConformanceTest`, deterministic replay/hash test with move orders
- `Manual:` move units around blockers on a reference map and verify path behavior
- `Artifacts:` short movement demo clip + test report/log

## Completion Criteria

- [ ] Units can receive move orders and path around blockers deterministically
- [ ] Conformance suites pass for path/spatial behavior
- [ ] Replay/hash consistency proven on representative move-order sequence
- [ ] Evidence links added to tracker / milestone notes

## Evidence Links (fill when done)

- `tests/pathfinder_conformance_report.md`
- `artifacts/m2-g7-movement-demo.mp4`

## Risks / Follow-ups

- Tuning quality may still be poor even if determinism is correct (defer to `D045` preset tuning)
- Large-map performance profiling may reveal need for caching/budget adjustments
```

## Ticket ID Conventions (Recommended)

- `T-M1-G2-01` = first ticket for `G2` in milestone `M1`
- `T-M7-G20.3-02` = second ticket for `G20.3` ranked queue work
- `T-M10-D070-01` = fallback pattern if a `D070` sub-feature has not yet been decomposed into `G*`

## Updating the Tracker When Tickets Finish (Required)

When a ticket reaches done:

1. Add evidence links to the ticket itself.
2. Update relevant cluster / milestone `Code Status` and evidence links in `src/18-PROJECT-TRACKER.md` (when the cluster step meaningfully advances).
3. If implementation discovered a missing dependency or hidden blocker:
   - update `src/tracking/milestone-dependency-map.md`
   - update the risk watchlist in `src/18-PROJECT-TRACKER.md`
   - create/mark a `Pxxx` pending decision if needed

## Common Failure Modes (Avoid)

- Ticket title says “implement X” but does not name a `G*` step or milestone
- No non-goals, so the ticket silently expands into later-milestone work
- “Done” marked without evidence artifact
- Implementing a later-milestone feature because it was “nearby” in code
- Using tickets to create new planned features without overlay placement
