# External Project `AGENTS.md` Template (Design-Aligned Implementation Repo)

Use this page to create an `AGENTS.md` file in an external implementation repo that depends on the Iron Curtain design docs.

This template is intentionally strict: it is designed to reduce design drift and make LLM-assisted implementation safer.

## Usage

1. Copy the template below into the external repo as `AGENTS.md`.
2. Fill in the placeholders (`<...>`).
3. Keep the design-doc links/version pin current.
4. Update in the same change set when milestone targets or code layout change.

## Template (copy into external repo root as `AGENTS.md`)

```md
# AGENTS.md — <PROJECT NAME>

> Local implementation rules for this code repository.
> Canonical design authority lives in the Iron Curtain design-doc repository.

## Canonical Design Authority (Do Not Override Locally)

This repository implements the Iron Curtain design. The canonical design sources are:

- Design docs repo: `<design-doc repo URL/path>`
- Design-doc baseline revision (pin this): `<tag|commit|date>`

Primary canonical planning and design references:

- `src/18-PROJECT-TRACKER.md` — execution overlay, milestone ordering, "what next?"
- `src/tracking/milestone-dependency-map.md` — dependency DAG and feature-cluster ordering
- `src/09-DECISIONS.md` — decision index (`Dxxx`)
- `src/02-ARCHITECTURE.md` / `src/03-NETCODE.md` / `src/04-MODDING.md` / `src/17-PLAYER-FLOW.md` (as applicable)
- `src/LLM-INDEX.md` — retrieval routing for humans/LLMs

## Non-Negotiable Rule: No Silent Design Divergence

If implementation reveals a missing detail, contradiction, or infeasible design path:

- do **not** silently invent a new canonical behavior
- open a design-gap/design-change request
- mark local work as one of:
  - `implementation placeholder`
  - `proposal-only`
  - `blocked on Pxxx`

If a design change is accepted, update the design-doc repo (or link to the accepted issue/PR) before treating it as settled.

## Implementation Overlay Discipline (Required)

Every feature implemented in this repo must reference the execution overlay.

Required in implementation issues/PRs:

- `Milestone:` `M0–M11`
- `Execution Step:` `G*`
- `Priority:` `P-*`
- `Dependencies:` relevant `Dxxx`, cluster IDs, `Pxxx` blockers

Do not implement features out of sequence unless the dependency map says they can run in parallel.

## Source Code Navigation Index (Required)

This repo must maintain a code navigation file for humans and LLMs:

- `CODE-INDEX.md` (recommended filename)

It should document:

- directory/crate ownership
- public interfaces / trait seams
- hot paths / perf-sensitive areas
- test entry points
- related `Dxxx` decisions and `G*` steps
- "start here for X" routing notes

If the code layout changes, update `CODE-INDEX.md` in the same change set.

## Design Change Escalation Workflow

When you need a design change:

1. Open an issue/PR in the design-doc repo (or designated design tracker)
2. Include:
   - target `M#` / `G*`
   - affected code paths
   - affected canonical docs / `Dxxx`
   - why the current design is insufficient
   - proposed options and tradeoffs
3. Link the request in the implementation PR/issue
4. Keep local workaround scope narrow until the design is resolved

## Local Repo-Specific Rules (Fill These In)

- Build/test commands: `<commands>`
- Formatting/lint commands: `<commands>`
- CI expectations: `<summary>`
- Perf profiling workflow (if any): `<summary>`
- Security constraints (if any): `<summary>`

## LLM / Agent Use Rules (Recommended)

- Read `CODE-INDEX.md` before broad codebase exploration
- Prefer targeted file reads over repo-wide scans once the index points to likely files
- Use canonical design docs for behavior decisions; use local code/docs for implementation specifics
- If docs and code conflict, treat this as a design-gap or stale-code-index problem and report it

## Evidence Rule (Implementation Progress Claims)

Do not claim a feature is complete without evidence:

- tests
- replay/demo capture
- logs/profiles
- CI output
- manual verification notes (if no automation exists yet)

## Current Implementation Target (Update Regularly)

- Active milestone: `<M#>`
- Active `G*` steps: `<G# ...>`
- Current blockers (`Pxxx`, external): `<...>`
- Parallel work lanes allowed: `<...>`
```

## Notes

- This template is intentionally general so it works for engine repos, tools repos, relay/server repos, or prototypes.
- The external repo may add local rules, but it should not weaken the "no silent divergence" or overlay-mapping rules.

## Execution Overlay Mapping

- **Milestone:** `M0`
- **Priority:** `P-Core`
- **Feature Cluster:** `M0.OPS.EXTERNAL_CODE_REPO_BOOTSTRAP_AND_NAVIGATION_TEMPLATES`
- **Depends on:** `M0.CORE.TRACKER_FOUNDATION`, `M0.CORE.DEP_GRAPH_SCHEMA`

