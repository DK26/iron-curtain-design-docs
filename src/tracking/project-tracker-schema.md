# Project Tracker Automation Companion (Optional Schema / YAML Reference)

Keywords: tracker automation companion, tracker schema, optional yaml reference, design status, code status, validation status, decision tracker row, milestone node, feature cluster node

This page documents the **field definitions and optional automation schema** for the project tracker overlay in [`../18-PROJECT-TRACKER.md`](../18-PROJECT-TRACKER.md) and the dependency map in [`milestone-dependency-map.md`](milestone-dependency-map.md).

**This page is not the canonical tracker.** The canonical implementation-planning artifacts are the Markdown pages:
- [`../18-PROJECT-TRACKER.md`](../18-PROJECT-TRACKER.md) — milestone snapshot + Dxxx tracker + risks
- [`milestone-dependency-map.md`](milestone-dependency-map.md) — milestone DAG + feature cluster dependency map

Use this page only to keep tracker fields/status values stable and to support future automation if needed.

## Why this automation companion exists

- Keeps the tracker field definitions stable as the docs evolve
- Makes future automation/script generation possible without locking us into it today
- Prevents silent status-field drift (`Decisioned` vs `Integrated`, etc.)
- Gives agents and humans a single reference for what each field means

## Scope and constraints (Markdown tracker is canonical)

This repository currently follows an agent rule that edits should be limited to **markdown files under `src/`**. Because of that, the optional machine-readable companion (e.g., `tracking/project-tracker.yaml`) is **documented here but not created in this baseline patch**.

The tracker is therefore **Markdown-first** for now, with a documented schema that can later be mirrored into YAML/JSON when implementation tracking moves into a code repo or the constraint is relaxed.

## Canonical Enums (Tracker Statuses)

### `DesignStatus`

| Value | Meaning |
| --- | --- |
| `NotMapped` | Feature/decision exists but is not yet represented in the tracker overlay |
| `Mentioned` | Mentioned in roadmap/docs but not yet tied to a canonical decision or integrated cross-doc mapping |
| `Decisioned` | Canonical decision/spec exists, but cross-doc integration or tracker audit is limited |
| `Integrated` | Cross-doc propagation is complete enough for planning (architecture + UX + security/modding links where relevant) |
| `Audited` | Explicit review performed for contradictions/dependency placement (e.g., netcode/pathfinding audit passes) |

### `CodeStatus`

| Value | Meaning |
| --- | --- |
| `NotStarted` | No implementation evidence linked |
| `Prototype` | Isolated proof-of-concept exists |
| `InProgress` | Active implementation underway |
| `VerticalSlice` | End-to-end narrow path works |
| `FeatureComplete` | Intended feature scope implemented |
| `Validated` | Feature complete and validated (tests/playtests/ops checks as appropriate) |

### `ValidationStatus`

| Value | Meaning |
| --- | --- |
| `None` | No validation evidence recorded |
| `SpecReview` | Design-doc/spec review only |
| `AutomatedTests` | Automated test evidence exists |
| `Playtest` | Human playtesting evidence exists |
| `OpsValidated` | Operations/service validation evidence exists |
| `Shipped` | Public release/ship evidence exists |

### `DependencyEdgeKind`

| Value | Meaning |
| --- | --- |
| `HardDependsOn` | Non-negotiable dependency |
| `SoftDependsOn` | Strong preference; stubs/parallel work possible |
| `ValidationDependsOn` | Needed to validate/ship, not necessarily to prototype |
| `EnablesParallelWork` | Unlocks a lane but is not a direct blocker |
| `PolicyGate` | Legal/governance/security prerequisite |
| `IntegrationGate` | Feature exists but milestone cannot exit until integration is complete |

## Tracker Record Shapes (Spec-Level)

### `DecisionTrackerRow` (Dxxx row in `18-PROJECT-TRACKER.md`)

```rust
pub struct DecisionTrackerRow {
    pub decision_id: String,                 // "D070"
    pub title: String,
    pub domain: String,                      // Foundation / Networking / ...
    pub canonical_source: String,            // src/decisions/09d-gameplay.md
    pub primary_milestone: String,           // "M10"
    pub secondary_milestones: Vec<String>,   // ["M11"]
    pub priority: String,                    // P-Core / P-Differentiator / P-Creator / P-Scale / P-Optional
    pub design_status: DesignStatus,
    pub code_status: CodeStatus,
    pub validation: ValidationStatus,
    pub dependencies: Vec<String>,           // Dxxx, cluster IDs, milestone IDs, or mixed refs
    pub blocking_pending_decisions: Vec<String>, // e.g. ["P004"]
    pub notes: Vec<String>,
    pub evidence_links: Vec<String>,         // required if code_status != NotStarted
}
```

### `MilestoneNode` (node in dependency map)

```rust
pub struct MilestoneNode {
    pub id: String,                          // "M4"
    pub name: String,
    pub objective: String,
    pub maps_to_roadmap_phases: Vec<String>, // ["Phase 5 (subset)"]
    pub hard_deps: Vec<String>,              // milestone IDs
    pub soft_deps: Vec<String>,              // milestone IDs
    pub unlocks: Vec<String>,                // milestone IDs
    pub exit_criteria_refs: Vec<String>,     // roadmap/player-flow refs
}
```

### `FeatureClusterNode` (row in dependency matrix)

```rust
pub struct FeatureClusterNode {
    pub id: String,                          // "M4.NET.MINIMAL_LOCKSTEP_ONLINE"
    pub name: String,
    pub milestone: String,                   // "M4"
    pub hard_deps: Vec<String>,              // milestone or cluster IDs
    pub soft_deps: Vec<String>,
    pub canonical_docs: Vec<String>,         // docs that define behavior and constraints
    pub decisions: Vec<String>,              // Dxxx refs (can include non-indexed D refs in notes)
    pub roadmap_phase: String,
    pub gap_priority: Option<String>,        // P0..P3 from 11-OPENRA-FEATURES when applicable
    pub exit_gate: String,
    pub parallelizable_with: Vec<String>,
    pub risk_notes: Vec<String>,
}
```

## Stable ID Conventions

### Milestones
- `M0`–`M11` (execution overlay milestones only)

### Feature cluster IDs
- `M{N}.CORE.*` — core runtime/foundation
- `M{N}.NET.*` — networking/multiplayer
- `M{N}.SP.*` — single-player/campaign
- `M{N}.SDK.*` — SDK/editor/tooling
- `M{N}.COM.*` — Workshop/community/platform services
- `M{N}.UX.*` — player-facing or SDK UX surfaces
- `M{N}.OPS.*` — operations/legal/policy gates
- `UXG.*` — cross-check UX gate clusters (used for milestone completeness checks)
- `PG.*` — pending/policy/legal gate nodes

## Evidence Link Rules (Normative)

1. `Code Status = NotStarted` may use `—` evidence links.
2. Any other `Code Status` must include at least one evidence link.
3. Evidence links should point to the **implementation repo or artifacts**, not just design docs.
4. `ValidationStatus` should reflect the strongest available evidence level, not the most optimistic one.
5. Do not infer progress from roadmap placement. Roadmap phase != implementation status.

## Update Workflow (Minimal Discipline)

### When to update `18-PROJECT-TRACKER.md`
- A new `Dxxx` is added to `src/09-DECISIONS.md`
- A decision is revised and its milestone mapping changes
- Implementation evidence appears (or is invalidated)
- A pending decision (`P002/P003/P004`) is resolved

### When to update `milestone-dependency-map.md`
- `src/08-ROADMAP.md` deliverables or exits change
- `src/11-OPENRA-FEATURES.md` priority table changes materially
- `src/17-PLAYER-FLOW.md` adds milestone-gating UX surfaces
- Cross-engine trust/host-mode policy changes (`src/07-CROSS-ENGINE.md`)

### When to upgrade `DesignStatus`
- `Decisioned -> Integrated`: after cross-doc propagation is complete (architecture + UX/security/modding references aligned where relevant)
- `Integrated -> Audited`: after explicit contradiction/dependency audit or focused review pass

## Optional Machine-Readable Companion (Deferred Baseline)

When allowed/needed, mirror the tracker into a machine-readable file (example path from the plan: `tracking/project-tracker.yaml`) with:

- `meta` (version, last_updated, source docs)
- `status_enums`
- `milestones[]`
- `feature_clusters[]`
- `decision_rows[]`
- `policy_gates[]`

Suggested generation model:
- Markdown remains human-first canonical for now
- YAML is generated from a source script or curated manually only if maintenance cost stays acceptable
- Do **not** maintain two divergent sources of truth

### YAML Adoption Notes (When/If Introduced)

- Prefer **one-way generation** (`markdown -> yaml`) over dual editing.
- If dual editing is ever allowed, define a single canonical source first and document it explicitly.
- Keep IDs stable (`M*`, cluster IDs, `Dxxx`, `PG.*`) so links and tooling do not break across revisions.

## Appendix — Embedded YAML Sample (Reference Only)

This sample is **illustrative** and intentionally minimal. It is not the source of truth. Use it as a template if/when a machine-readable tracker companion is introduced.

```yaml
meta:
  schema_version: 1
  tracker_overlay_version: 1
  generated_from:
    - src/18-PROJECT-TRACKER.md
    - src/tracking/milestone-dependency-map.md
    - src/09-DECISIONS.md
  notes:
    - "Markdown-first baseline; YAML companion is optional."
    - "Roadmap remains canonical for phase timing (src/08-ROADMAP.md)."

status_enums:
  design_status:
    - NotMapped
    - Mentioned
    - Decisioned
    - Integrated
    - Audited
  code_status:
    - NotStarted
    - Prototype
    - InProgress
    - VerticalSlice
    - FeatureComplete
    - Validated
  validation_status:
    - None
    - SpecReview
    - AutomatedTests
    - Playtest
    - OpsValidated
    - Shipped
  dependency_edge_kind:
    - HardDependsOn
    - SoftDependsOn
    - ValidationDependsOn
    - EnablesParallelWork
    - PolicyGate
    - IntegrationGate

milestones:
  - id: M1
    name: "Resource & Format Fidelity + Visual Rendering Slice"
    objective: "Bevy can load RA/OpenRA resources and render maps/sprites correctly"
    maps_to_roadmap_phases:
      - "Phase 0"
      - "Phase 1"
    hard_deps: [M0]
    soft_deps: []
    unlocks: [M2]
    design_status: Integrated
    code_status: NotStarted
    validation: SpecReview
    exit_criteria_refs:
      - "src/08-ROADMAP.md#phase-0-foundation--format-literacy-months-13"
      - "src/08-ROADMAP.md#phase-1-rendering-slice-months-36"

feature_clusters:
  - id: "M1.CORE.RA_FORMATS_PARSE"
    name: "ra-formats parsing (.mix/.shp/.pal/.aud/.vqa)"
    milestone: M1
    roadmap_phase: "Phase 0"
    hard_deps: [M0.CORE.TRACKER_FOUNDATION]
    soft_deps: []
    canonical_docs:
      - "src/08-ROADMAP.md"
      - "src/05-FORMATS.md"
    decisions: [D003, D039]
    gap_priority: null
    exit_gate: "Assets parse against known-good corpus"
    parallelizable_with:
      - "M1.CORE.OPENRA_DATA_COMPAT"
    risk_notes:
      - "Breadth of legacy file quirks"

decision_rows:
  - decision_id: D007
    title: "Networking — Relay Server as Default"
    domain: Networking
    canonical_source: "src/decisions/09b-networking.md"
    primary_milestone: M4
    secondary_milestones: [M7]
    priority: P-Core
    design_status: Audited
    code_status: NotStarted
    validation: SpecReview
    dependencies:
      - D006
      - D008
      - D012
      - D060
      - "M4.NET.MINIMAL_LOCKSTEP_ONLINE"
    blocking_pending_decisions: []
    notes:
      - "Relay is default multiplayer architecture; minimal online slice excludes tracker/ranked."
    evidence_links: []

policy_gates:
  - id: "PG.P004.LOBBY_WIRE_DETAILS"
    kind: PolicyGate
    blocks_validation_of: [M7]
    canonical_source: "src/09-DECISIONS.md"
    notes:
      - "Architecture is resolved; wire/product details still need a lock."
```

## Summary Guidance (Practical Use)

- Use `18-PROJECT-TRACKER.md` to answer: **what should be implemented next / what is the priority?**
- Use `tracking/milestone-dependency-map.md` to answer: **what depends on what / what can be parallelized?**
- Use this page only when you need to:
  - add/change tracker fields
  - validate status vocabulary consistency
  - prepare future automation
