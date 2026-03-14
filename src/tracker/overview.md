# 18 — Project Tracker & Implementation Planning Overlay

Keywords: milestone overlay, dependency map, progress tracker, design status, implementation status, Dxxx tracker, feature clusters, critical path

> This page is a **project-tracking overlay** on top of the canonical roadmap in [`src/08-ROADMAP.md`](../08-ROADMAP.md). It does **not** replace the roadmap. It exists to make implementation order, dependencies, and design-vs-code progress visible in one place.

**Canonical tracker note:** The **Markdown tracker pages** — this page and [`tracking/milestone-dependency-map.md`](../tracking/milestone-dependency-map.md) — are the canonical implementation-planning artifacts. Any schema/YAML content is optional automation support only and must not replace these human-facing planning pages.

**Feature intake gate (normative):** A newly added feature (mode, UI flow, tooling capability, platform adaptation, community feature, etc.) is **not considered integrated into the project plan** until it is placed in the execution overlay with:
- a primary milestone (`M0–M11`)
- a priority class (`P-Core` / `P-Differentiator` / `P-Creator` / `P-Scale` / `P-Optional`)
- dependency placement (hard/soft/validation/policy/integration as applicable)
- tracker representation (Dxxx row and/or feature-cluster mapping)

## Purpose and Scope

- Keep `src/08-ROADMAP.md` as the canonical phase timeline and deliverables.
- Add an implementation-oriented milestone/dependency overlay (`M0`–`M11`).
- Track progress at **Dxxx granularity** (one row per decision in `src/09-DECISIONS.md`).
- Separate **Design Status** from **Code Status** so this design-doc repo can stay honest and useful before implementation exists.
- Provide a stable handoff surface for future engineering planning, delegation, and recovery after pauses.

## How to Read This Tracker

1. Read the **Milestone Snapshot** to see where the project stands at a glance.
2. Read **Recommended Next Milestone Path** to see the currently preferred execution order.
3. Use the **Decision Tracker** to map any `Dxxx` to the milestone(s) it primarily unlocks.
4. Use [`tracking/milestone-dependency-map.md`](../tracking/milestone-dependency-map.md) for the detailed DAG, feature clusters, and dependency edges.
5. Use [`tracking/netcode-research-alignment-audit-2026-02-27.md`](../tracking/netcode-research-alignment-audit-2026-02-27.md) for the recorded netcode policy-vs-research reasoning trail and drift log.

## Status Legend (Design vs Code)

### Design Status (spec maturity)

| Status       | Meaning                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `NotMapped`  | Not yet mapped into this tracker overlay                                                               |
| `Mentioned`  | Mentioned in roadmap/docs but not anchored to a canonical decision or cross-doc mapping                |
| `Decisioned` | Has a canonical decision (or equivalent spec section) but limited cross-doc integration mapping        |
| `Integrated` | Cross-referenced across relevant docs (architecture/UX/security/modding/etc.)                          |
| `Audited`    | Reviewed for contradictions and dependency placement (tracker baseline audit or targeted design audit) |

### Code Status (implementation maturity)

| Status            | Meaning                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `NotStarted`      | No implementation evidence linked                                      |
| `Prototype`       | Isolated proof-of-concept exists                                       |
| `InProgress`      | Active implementation underway                                         |
| `VerticalSlice`   | End-to-end slice works for a narrow path                               |
| `FeatureComplete` | Intended scope implemented                                             |
| `Validated`       | Feature complete + validated by tests/playtests/ops checks as relevant |

### Validation Status (evidence classification)

| Status           | Meaning                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `None`           | No validation evidence recorded yet                                       |
| `SpecReview`     | Design-doc review / consistency audit only (common in this repo baseline) |
| `AutomatedTests` | Test evidence exists                                                      |
| `Playtest`       | Human playtesting evidence exists                                         |
| `OpsValidated`   | Service/operations validation evidence exists                             |
| `Shipped`        | Released and accepted in a public build                                   |

**Evidence rule:** Any row with `Code Status != NotStarted` must include evidence links (repo path, CI log, demo notes, test report, etc.). In this design-doc repository baseline, most code statuses are expected to remain `NotStarted`.

## Milestone Snapshot (M0–M11)

| Milestone | Objective                                                        | Roadmap Mapping                   | Design Status | Code Status       | Validation   | Current Read                                                                                                                     |
| --------- | ---------------------------------------------------------------- | --------------------------------- | ------------- | ----------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `M0`      | Design Baseline & Execution Tracker Setup                        | pre-Phase overlay                 | `Audited`     | `FeatureComplete` | `SpecReview` | Tracker pages and overlay are the deliverable. Evidence: `src/18-PROJECT-TRACKER.md`, `src/tracking/*.md`.                       |
| `M1`      | Resource & Format Fidelity + Visual Rendering Slice              | Phase 0 + Phase 1                 | `Integrated`  | `NotStarted`      | `SpecReview` | Depends on M0 only; strongest first engineering target.                                                                          |
| `M2`      | Deterministic Simulation Core + Replayable Combat Slice          | Phase 2                           | `Integrated`  | `NotStarted`      | `SpecReview` | Critical path milestone; depends on M1.                                                                                          |
| `M3`      | Local Playable Skirmish (Single Machine, Dummy AI)               | Phase 3 + Phase 4 prep            | `Integrated`  | `NotStarted`      | `SpecReview` | First playable local game slice.                                                                                                 |
| `M4`      | Minimal Online Skirmish (No External Tracker)                    | Phase 5 subset (vertical slice)   | `Integrated`  | `NotStarted`      | `SpecReview` | Minimal online slice intentionally excludes tracking/ranked.                                                                     |
| `M5`      | Campaign Runtime Vertical Slice                                  | Phase 4 subset                    | `Decisioned`  | `NotStarted`      | `SpecReview` | Campaign runtime vertical slice can parallelize with M4 after M3.                                                                |
| `M6`      | Full Single-Player Campaigns + Single-Player Maturity            | Phase 4 full                      | `Decisioned`  | `NotStarted`      | `SpecReview` | Campaign-complete differentiator milestone. Status reflects weakest critical-path decisions (D042, D043, D036 are `Decisioned`). |
| `M7`      | Multiplayer Productization (Browser, Ranked, Spectator, Trust)   | Phase 5 full                      | `Integrated`  | `NotStarted`      | `SpecReview` | Multiplayer productization, trust, ranked, moderation.                                                                           |
| `M8`      | Creator Foundation (CLI + Minimal Workshop + Early Mod Workflow) | Phase 4–5 overlay + 6a foundation | `Integrated`  | `NotStarted`      | `SpecReview` | Creator foundation lane can start after M2 if resourced.                                                                         |
| `M9`      | Full SDK Scenario Editor + Full Workshop + OpenRA Export Core    | Phase 6a                          | `Integrated`  | `NotStarted`      | `SpecReview` | Scenario editor + full workshop + export core.                                                                                   |
| `M10`     | Campaign Editor + Game Modes + RA1 Export + Editor Extensibility | Phase 6b                          | `Integrated`  | `NotStarted`      | `SpecReview` | Campaign editor + advanced game modes + RA1 export.                                                                              |
| `M11`     | Ecosystem Polish, Optional AI/LLM, Platform Expansion            | Phase 7                           | `Decisioned`  | `NotStarted`      | `SpecReview` | Optional/experimental/polish heavy phase.                                                                                        |

## Recommended Next Milestone Path

**Recommended path now:** `M0 (complete tracker overlay) -> M1 -> M2 -> M3 -> parallelize M4 and M5 -> M6 -> M7 -> M8/M9 -> M10 -> M11`

**Rationale:**
- `M1` and `M2` are the shortest path to proving the engine core and de-risking the largest unknowns (format compatibility + deterministic sim).
- `M3` creates the first local playable Red Alert-feeling slice (community-visible progress).
- `M4` satisfies the early online milestone using the finalized netcode architecture without waiting for full tracking/ranked infrastructure.
- `M5`/`M6` preserve the project's single-player/campaign differentiator instead of deferring campaign completeness behind multiplayer productization.
- `M8` (creator foundation) can begin after `M2` on a parallel lane, but full visual SDK/editor (`M9+`) should wait for stable runtime semantics and content schemas.

**Granular execution order for the first playable slice (recommended):**
- `G1-G3` (`M1`): RA assets parse -> Bevy map/sprite render -> unit animation playback
- `G4-G5` (`M2` seam prep): cursor/hit-test -> selection baseline
- `G6-G10` (`M2` core): deterministic sim -> path/move -> shoot/hit/death
- `G11-G15` (`M3` mission loop): win/loss evaluators -> mission end UI -> EVA/VO -> replay/exit -> feel pass
- `G16` (`M3` milestone exit): widen into local skirmish loop + narrow `D043` basic AI subset

Canonical detailed ladder and dependency edges:
- `src/tracking/milestone-dependency-map.md` → `Granular Foundational Execution Ladder (RA First Mission Loop -> Project Completion)`

## Current Active Track (If Implementation Starts Now)

This section is the **immediate execution recommendation** for an implementer starting from this design-doc baseline. It is intentionally narrower than the full roadmap and should be updated whenever the active focus changes.

### Active Track A — First Playable Mission Loop Foundation (`M1 -> M3`)

**Primary objective:** reach `G16` (local skirmish milestone exit) through the documented `G1-G16` ladder with minimal scope drift.

**Start now (parallel where safe):**

1. ~~**`P002` fixed-point scale decision closure**~~ **RESOLVED:** Scale factor = 1024 (see `research/fixed-point-math-design.md`)
2. **`G1` RA asset parsing baseline** (`.mix`, `.shp`, `.pal`)
3. **`G2` Bevy map/sprite render slice**
4. **`G3` unit animation playback**

**Then continue in strict sequence (once prerequisites are met):**

1. `G4` cursor/hit-test
2. `G5` selection baseline
3. `G6-G10` deterministic sim + movement/path + combat/death (after `P002`)
4. `G11-G15` mission-end evaluators/UI/EVA+VO/feel pass (~~`P003`~~ ✓ resolved — Kira via `bevy_kira_audio`; see `research/audio-library-music-integration-design.md`)
5. `G16` widen to local skirmish + frozen `D043` basic AI subset

### Active Track A Closure Criteria (Before Switching Primary Focus)

- `M3.SP.SKIRMISH_LOCAL_LOOP` validated (local playable skirmish)
- `G1-G16` evidence artifacts collected and linked
- ~~`P002` resolved and reflected in implementation assumptions~~ ✓ DONE (1024, `research/fixed-point-math-design.md`)
- ~~`P003` resolved before finalizing `G13/G15`~~ ✓ DONE (Kira, `research/audio-library-music-integration-design.md`)
- `D043` `M3` basic AI subset frozen/documented

### Secondary Parallel Track (Allowed, Low-Risk)

These can progress without derailing Active Track A **if resourcing allows**:

- `M8` prep work for `G21.1` design-to-ticket breakdown (CLI/local-overlay workflow planning only)
- ~~`P003` audio library evaluation spikes~~ ✓ RESOLVED (no longer blocking `G13`)
- test harness scaffolding for deterministic replay/hash proof artifacts (`G6/G9/G10`)

### Do Not Pull Forward (Common Failure Modes)

- Full `M7` multiplayer productization features during `M4` slice work (browser/ranked/tracker)
- Full `M6` AI sophistication while implementing `G16` (`M3` basic AI subset only)
- Full visual SDK/editor (`M9+`) before `M8` foundations and runtime/network stabilization
