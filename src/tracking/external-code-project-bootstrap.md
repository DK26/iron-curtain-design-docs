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

## Ready-to-Copy Filled-In Versions

For the **IC engine/game repository** (primary Rust codebase), pre-filled versions of both templates are available — all placeholders replaced with IC-specific details:

- **`tracking/ic-engine-agents.md`** — filled-in `AGENTS.md` with architectural invariants, crate workspace, build commands, milestone targets, and LLM/agent rules
- **`tracking/ic-engine-code-index.md`** — filled-in `CODE-INDEX.md` with task routing table, all 13 crate subsystem entries, cross-cutting boundaries, and evidence paths

**For the engine repo (iron-curtain):** Copy the pre-filled `tracking/ic-engine-agents.md` and `tracking/ic-engine-code-index.md` into the new engine repo, and use the GitHub template repository (`iron-curtain/ic-template`, described below) as your baseline.

**For non-engine repos (relay server, tools, prototypes):** Use the **generic templates** (`tracking/external-project-agents-template.md` and `tracking/source-code-index-template.md`) and fill in the placeholders with your repo's structure.

## GitHub Template Repository (`iron-curtain/ic-template`)

The **GitHub template repository** is the concrete, instantiable deliverable for **engine repos** — a real repo on GitHub marked as a [template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository) that a new engine implementation repo is created from via "Use this template." It is NOT a universal template for all IC repos.

### Why a template repo, not just docs

- **One click to correct structure.** A contributor creating a new engine repo gets `AGENTS.md`, `CODE-INDEX.md`, CI workflows, `deny.toml`, SPDX headers, and Cargo workspace scaffold — all wired and passing — without manually copying from markdown docs.
- **Design authority is baked in.** The template `AGENTS.md` references `iron-curtain-design-docs` as the canonical source of truth for all architectural invariants, decisions, and milestone ordering. Every engine repo inherits this linkage from birth.
- **CI enforces discipline from first commit.** The template ships with GitHub Actions workflows for clippy, rustfmt, `cargo deny check licenses`, DCO signed-off-by verification, and a design-doc revision pin check; all passing on first push after creation.
- **Agent/LLM alignment from day one.** `.github/copilot-instructions.md` in the template points agents to the local `AGENTS.md`, which chains to the design-docs repo. Any AI agent working in an engine repo is immediately design-aware.

### Template Contents (Engine Repo Only)

The `iron-curtain/ic-template` is **engine-specific**. Do not use it for relay/tool/prototype repos.

```text
ic-template/                          # GitHub template repository (engine-specific)
├── .github/
│   ├── copilot-instructions.md       # → points to AGENTS.md
│   └── workflows/
│       ├── ci.yml                    # clippy + fmt + test + cargo deny
│       └── dco.yml                   # signed-off-by check
├── AGENTS.md                         # from tracking/ic-engine-agents.md (ENGINE INVARIANTS)
├── CODE-INDEX.md                     # from tracking/ic-engine-code-index.md
├── CONTRIBUTING.md                   # DCO, PR template, design-change escalation
├── Cargo.toml                        # workspace scaffold (crate stubs for ic-sim, ic-net, ic-render, etc.)
├── deny.toml                         # GPL-permit config (IC engine is GPL v3)
├── rustfmt.toml                      # project formatting rules
├── clippy.toml                       # disallowed_types, project lints
├── docs/
│   ├── implementation-notes/         # local impl notes (not design authority)
│   └── design-gap-requests/          # pending escalations to design-docs repo
└── crates/                           # stub crates matching AGENTS.md structure
    ├── ic-sim/
    ├── ic-net/
    ├── ic-protocol/
    └── ...                           # remaining crate stubs
```

### Relationship to this design-docs repo

The design-docs repo (`iron-curtain-design-docs`) is the **single source of truth** for all design decisions, architectural invariants, and milestone planning. The template repo is an *implementation scaffold for the engine* — it encodes the structure and rules from the design docs into a live, CI-verified starting point. The template repo's `AGENTS.md` pins a specific design-doc revision and includes the no-silent-divergence rule: if implementation reveals a design gap, the gap is escalated to the design-docs repo, not resolved locally.

**For non-engine repos:** Use `tracking/external-project-agents-template.md` and `tracking/source-code-index-template.md` as the basis for your repo's `AGENTS.md` and `CODE-INDEX.md`. Fill in repo-specific context (your crate structure, your decisions, your milestones). The relationship principle remains the same: the design-docs repo is canonical for engine-wide invariants; your implementation repo documents your own feature and dependency topology.

### Maintenance

When the design docs evolve (new decisions, crate renames, milestone changes), the template repo is updated in the same planning pass. The template's `AGENTS.md` revision pin is bumped. Repos already instantiated from the template update their own `AGENTS.md` revision pin as part of their regular sync cycle.

### Phase

Phase 0 deliverable. The template repo is published alongside the standalone crate repos (`M0.OPS.STANDALONE_CRATE_REPOS`) — both are infrastructure that must exist before the first line of engine code.

## Acceptance Criteria (Bootstrap Complete)

A new external code repo is considered design-aligned only when:

- `AGENTS.md` exists and points to canonical design docs
- `CODE-INDEX.md` exists and covers the major code areas
- the repo declares which `M#`/`G*` it is implementing
- a design-change escalation path is documented
- no silent divergence policy is explicit

The GitHub template repository (`iron-curtain/ic-template`) is considered complete when:

- a new engine repo created via "Use this template" has passing CI on first push
- the template `AGENTS.md` pins a design-doc revision and references the design-docs repo as canonical authority
- `cargo deny check licenses` **permits** GPL dependencies in the template scaffold (IC engine is GPL v3)
- non-engine repos follow the appropriate generic template and fill in repo-specific placeholders
- `.github/copilot-instructions.md` chains to `AGENTS.md` for agent alignment

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

