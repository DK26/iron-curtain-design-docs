## Maintenance Rules (How to update this page)

1. **Do not replace `src/08-ROADMAP.md`.** Update roadmap timing/deliverables there; update this page only for execution overlay, dependency, and status mapping.
2. **When a new decision is added to `src/09-DECISIONS.md`, add a row here in the same change set.** Default to `Design Status = Decisioned`, `Code Status = NotStarted`, `Validation = SpecReview` until proven otherwise.
3. **When a new feature is added (even without a new `Dxxx`), update the execution overlay in the same change set.** Add/update a feature-cluster entry in `tracking/milestone-dependency-map.md` with milestone placement and dependencies; then reflect the impact here if milestone snapshot/coverage/risk changes.
4. **Do not append features "for later sorting."** Place new work in the correct milestone and sequence position immediately based on dependencies and project priorities.
5. **When a decision is revised across multiple docs, re-check its `Design Status`.** Upgrade to `Integrated` only when cross-doc propagation is complete; use `Audited` for explicit contradiction/dependency audits.
6. **Do not use percentages by default.** Use evidence-linked statuses instead.
7. **Do not mark code progress without evidence.** If `Code Status != NotStarted`, add evidence links (implementation repo path, test result, demo notes, etc.).
8. **After editing `src/08-ROADMAP.md`, `src/17-PLAYER-FLOW.md`, `src/11-OPENRA-FEATURES.md`, or introducing a major feature proposal, revisit `tracking/milestone-dependency-map.md`.** These are the main inputs to feature-cluster coverage and milestone ordering.
9. **If new non-indexed `D0xx` references appear, normalize the decision index in the same planning pass.** The tracker is Dxxx-index keyed by design.
10. **Use this page for "where are we / what next?"; use the dependency map for "what blocks what?"** Do not overload one page with both levels of detail.
11. **If a research/source study changes implementation emphasis or risk posture, link it here or in the dependency map mappings** so the insight affects execution planning and not just historical research notes.
12. **If canonical docs add or revise future/deferred wording, classify and resolve it in the same change set.** Update `tracking/future-language-audit.md`, and map accepted work into the overlay (or mark proposal-only / `Pxxx`) before considering the wording complete.
13. **If a separate implementation repo is created, bootstrap it with aligned navigation/governance docs before treating it as design-aligned.** Use `tracking/external-project-agents-template.md` for the repo `AGENTS.md` and `tracking/source-code-index-template.md` for `CODE-INDEX.md`; follow `tracking/external-code-project-bootstrap.md`.

### New Feature Intake Checklist (Execution Overlay)

Before a feature is treated as "planned" (beyond brainstorming), do all of the following:

1. **Classify priority** (`P-Core`, `P-Differentiator`, `P-Creator`, `P-Scale`, `P-Optional`).
2. **Assign primary milestone** (`M0–M11`) using dependency-first sequencing (not novelty/recency).
3. **Record dependency edges** in `tracking/milestone-dependency-map.md` (`hard`, `soft`, `validation`, `policy`, `integration`).
4. **Map canonical docs** (decision(s), roadmap phase, UX/security/community docs if affected). If the feature changes a player-facing screen or dialog, also add or update the relevant `player-flow/*.md` page and its `Feature Spec` / `Screen Spec` / `Scenario Spec` blocks per `tracking/feature-scenario-spec-template.md` when that surface is being defined or revised.
5. **Update tracker representation**:
   - Dxxx row (if decisioned), and/or
   - feature-cluster row (if non-decision feature/deliverable)
6. **Check milestone displacement risk** (does this delay a higher-priority critical-path milestone?).
7. **Mark optional/experimental status explicitly** so it does not silently creep into core milestones.
8. **Classify future/deferred wording** you add (`PlannedDeferral`, `NorthStarVision`, `VersioningEvolution`, or exempt context) and update `tracking/future-language-audit.md` for canonical-doc changes.
9. **If the feature affects implementation-repo routing or expected code layout, update the external bootstrap/template docs** (`tracking/external-code-project-bootstrap.md`, `tracking/external-project-agents-template.md`, `tracking/source-code-index-template.md`) in the same planning pass.

## Related Pages

- [`08-ROADMAP.md`](../08-ROADMAP.md) — canonical phase roadmap
- [`tracking/milestone-dependency-map.md`](../tracking/milestone-dependency-map.md) — detailed milestone DAG and feature cluster dependencies
- [`tracking/project-tracker-schema.md`](../tracking/project-tracker-schema.md) — optional automation companion (tracker field meanings + schema/YAML reference)
- [`tracking/feature-scenario-spec-template.md`](../tracking/feature-scenario-spec-template.md) — three-layer UI/spec format for player-facing screens and interaction contracts
- [`tracking/future-language-audit.md`](../tracking/future-language-audit.md) — canonical-doc future/deferred wording classification and remediation queue
- [`tracking/deferral-wording-patterns.md`](../tracking/deferral-wording-patterns.md) — replacement wording patterns for planned deferrals / North Star claims / proposal-only notes
- [`tracking/external-code-project-bootstrap.md`](../tracking/external-code-project-bootstrap.md) — bootstrap procedure for external implementation repos (design alignment + escalation workflow)
- [`tracking/external-project-agents-template.md`](../tracking/external-project-agents-template.md) — `AGENTS.md` template for external code repos that implement this design
- [`tracking/source-code-index-template.md`](../tracking/source-code-index-template.md) — `CODE-INDEX.md` template for human + LLM code navigation
