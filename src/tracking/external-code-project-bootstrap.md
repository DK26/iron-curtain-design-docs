# External Code Project Bootstrap (Design-Aligned Implementation Repo)

This chapter describes how to initialize a **separate source-code repository** (engine, tools, server, prototypes, etc.) so it stays aligned with the Iron Curtain design docs and can escalate design changes safely.

This is an **implementation-planning artifact** (`M0` process hardening), not a gameplay/system design chapter.

## Purpose

Use this when starting or onboarding an external code repo that implements the IC design (for example, a Rust codebase containing `ic-sim`, `ic-net`, `ic-ui`, etc.).

Goals:

- prevent silent design drift
- make LLM and human navigation fast (`AGENTS.md` + source code index)
- provide a clear path to request design changes when implementation reveals gaps
- keep milestone/priority/dependency sequencing consistent with the execution overlay

## Source-of-Truth Hierarchy (External Repo)

The external code repo should document and follow this hierarchy:

1. **This design-doc repo** (`iron-curtain-design-docs`) is the canonical source for accepted design decisions and execution ordering.
2. **External repo `AGENTS.md`** defines local implementation rules and points back to the canonical design docs.
3. **External repo source code index** is the canonical navigation map for that codebase (human + LLM).
4. **Local code comments / READMEs** are supporting detail, not authority for cross-cutting design changes.

## Bootstrap Checklist (Required)

Complete these in the same repo setup pass.

1. Add an external-project `AGENTS.md` using the template in `tracking/external-project-agents-template.md`.
2. Add a source code index page using the template in `tracking/source-code-index-template.md`.
3. Record which design-doc revision is being implemented (`tag`, commit hash, or dated baseline).
4. Link the external repo to the execution overlay:
   - `src/18-PROJECT-TRACKER.md`
   - `src/tracking/milestone-dependency-map.md`
5. Declare the initial implementation target:
   - milestone (`M#`)
   - `G*` step(s)
   - priority (`P-*`)
6. Document any known design gaps as:
   - proposal-only notes, or
   - pending decisions (`Pxxx`) in the design repo
7. Define the design-change escalation workflow (issue labels, required context, review path).

## Minimal Repo Bootstrap Layout (Recommended)

This is a suggested layout for implementation repos. Adapt names if needed, but keep the navigation concepts.

```text
your-ic-code-repo/
├── AGENTS.md                     # local implementation rules + design-doc linkage
├── README.md                     # repo purpose + quick start
├── CODE-INDEX.md                 # source code navigation index (human + LLM)
├── docs/
│   ├── implementation-notes/
│   └── design-gap-requests/
├── crates/ or packages/
│   ├── ic-sim/
│   ├── ic-net/
│   ├── ic-ui/
│   └── ...
└── tests/
```

## Required External Repo Files (and Why)

### `AGENTS.md` (required)

Purpose:

- encode local coding/build/test rules
- pin canonical design-doc references
- define "no silent divergence" behavior
- require design-change issue escalation when implementation conflicts with docs

Use the template:

- `tracking/external-project-agents-template.md`

### `CODE-INDEX.md` (required)

Purpose:

- give humans and LLMs a fast navigation map of the codebase
- document crate/file responsibilities and safe edit boundaries
- reduce context-window waste and wrong-file edits

Use the template:

- `tracking/source-code-index-template.md`

## Design Change Escalation Workflow (Required)

When implementation reveals a mismatch, missing detail, or contradiction in the design docs:

1. **Do not silently invent a new design.**
2. Open an issue (in the design-doc repo or the team’s design-tracking system) labeled as a design-change request.
3. Include:
   - current implementation target (`M#`, `G*`)
   - affected code paths/crates
   - affected `Dxxx` decisions and canonical doc paths
   - concrete conflict/missing "how"
   - proposed options and tradeoffs
   - impact on milestones/dependencies/priority
4. **Document the divergence rationale locally in the implementation repo.** The codebase that diverges must keep its own record of why — not just rely on an upstream issue. This includes:
   - a note in `docs/design-gap-requests/` or equivalent local tracking file
   - inline code comments at the divergence point referencing the issue and rationale
   - the full reasoning for why the original design was not followed
5. If work can proceed safely, implement a bounded temporary approach and label it:
   - `proposal-only`
   - `implementation placeholder`
   - `blocked on Pxxx`
6. Update the design-doc tracker/overlay in the same planning pass if the change is accepted.

## What Counts as a Design Gap (Examples)

Open a design-change request when:

- the docs specify *what* but not enough *how* for the target `G*` step
- two canonical docs disagree on behavior
- a new dependency/ordering constraint is discovered
- a feature requires a new policy/trust/legal decision (`Pxxx`)
- implementation experience shows a documented approach is not viable/perf-safe

Do **not** open a design-change request for:

- local refactors that preserve behavior/invariants
- code organization improvements internal to one repo/crate
- test harness additions that do not change accepted design behavior

## Milestone / `G*` Alignment (External Repo Rule)

External code work should be initiated by referencing the execution overlay, not ad-hoc feature lists.

Required in implementation PRs/issues (recommended fields):

- `Milestone:` `M#`
- `Execution Step:` `G#` / `G#.x`
- `Priority:` `P-*`
- `Dependencies:` `Dxxx`, cluster IDs, pending decisions (`Pxxx`)
- `Evidence planned:` tests/demo/replay/profile/ops notes

Primary references:

- `src/18-PROJECT-TRACKER.md`
- `src/tracking/milestone-dependency-map.md`
- `src/tracking/implementation-ticket-template.md`

## LLM-Friendly Navigation Requirements (External Repo)

To make an external implementation repo work well with agentic tools:

- Maintain `CODE-INDEX.md` as a living file (do not leave it stale)
- Mark generated files and do-not-edit outputs
- Identify hot paths / perf-sensitive code
- Document public interfaces and trait boundaries
- Link code areas to `Dxxx` and `G*` steps
- Add "start here for X" routing entries

This prevents agents from wasting tokens or editing the wrong files first.

## Suggested Issue Labels (Design/Implementation Coordination)

Recommended labels for cross-repo coordination:

- `design-gap`
- `design-contradiction`
- `needs-pending-decision`
- `milestone-sequencing`
- `docs-sync`
- `implementation-placeholder`
- `perf-risk`
- `security-policy-gate`

## Acceptance Criteria (Bootstrap Complete)

A new external code repo is considered design-aligned only when:

- `AGENTS.md` exists and points to canonical design docs
- `CODE-INDEX.md` exists and covers the major code areas
- the repo declares which `M#`/`G*` it is implementing
- a design-change escalation path is documented
- no silent divergence policy is explicit

## Execution Overlay Mapping

- **Milestone:** `M0`
- **Priority:** `P-Core` (process-critical implementation hygiene)
- **Feature Cluster:** `M0.OPS.EXTERNAL_CODE_REPO_BOOTSTRAP_AND_NAVIGATION_TEMPLATES`
- **Depends on (hard):**
  - `M0.CORE.TRACKER_FOUNDATION`
  - `M0.CORE.DEP_GRAPH_SCHEMA`
  - `M0.OPS.MAINTENANCE_RULES`
- **Depends on (soft):**
  - `M0.UX.TRACKER_DISCOVERABILITY`
  - `M0.OPS.FUTURE_DEFERRAL_DISCIPLINE_AND_AUDIT`

