# 18 — Project Tracker & Implementation Planning Overlay

Keywords: milestone overlay, dependency map, progress tracker, design status, implementation status, Dxxx tracker, feature clusters, critical path

> This page is a **project-tracking overlay** on top of the canonical roadmap in [`src/08-ROADMAP.md`](08-ROADMAP.md). It does **not** replace the roadmap. It exists to make implementation order, dependencies, and design-vs-code progress visible in one place.

**Canonical tracker note:** The **Markdown tracker pages** — this page and [`tracking/milestone-dependency-map.md`](tracking/milestone-dependency-map.md) — are the canonical implementation-planning artifacts. Any schema/YAML content is optional automation support only and must not replace these human-facing planning pages.

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
4. Use [`tracking/milestone-dependency-map.md`](tracking/milestone-dependency-map.md) for the detailed DAG, feature clusters, and dependency edges.
5. Use [`tracking/netcode-research-alignment-audit-2026-02-27.md`](tracking/netcode-research-alignment-audit-2026-02-27.md) for the recorded netcode policy-vs-research reasoning trail and drift log.

## Status Legend (Design vs Code)

### Design Status (spec maturity)

| Status | Meaning |
| --- | --- |
| `NotMapped` | Not yet mapped into this tracker overlay |
| `Mentioned` | Mentioned in roadmap/docs but not anchored to a canonical decision or cross-doc mapping |
| `Decisioned` | Has a canonical decision (or equivalent spec section) but limited cross-doc integration mapping |
| `Integrated` | Cross-referenced across relevant docs (architecture/UX/security/modding/etc.) |
| `Audited` | Reviewed for contradictions and dependency placement (tracker baseline audit or targeted design audit) |

### Code Status (implementation maturity)

| Status | Meaning |
| --- | --- |
| `NotStarted` | No implementation evidence linked |
| `Prototype` | Isolated proof-of-concept exists |
| `InProgress` | Active implementation underway |
| `VerticalSlice` | End-to-end slice works for a narrow path |
| `FeatureComplete` | Intended scope implemented |
| `Validated` | Feature complete + validated by tests/playtests/ops checks as relevant |

### Validation Status (evidence classification)

| Status | Meaning |
| --- | --- |
| `None` | No validation evidence recorded yet |
| `SpecReview` | Design-doc review / consistency audit only (common in this repo baseline) |
| `AutomatedTests` | Test evidence exists |
| `Playtest` | Human playtesting evidence exists |
| `OpsValidated` | Service/operations validation evidence exists |
| `Shipped` | Released and accepted in a public build |

**Evidence rule:** Any row with `Code Status != NotStarted` must include evidence links (repo path, CI log, demo notes, test report, etc.). In this design-doc repository baseline, most code statuses are expected to remain `NotStarted`.

## Milestone Snapshot (M0–M11)

| Milestone | Objective | Roadmap Mapping | Design Status | Code Status | Validation | Current Read |
| --- | --- | --- | --- | --- | --- | --- |
| `M0` | Design Baseline & Execution Tracker Setup | pre-Phase overlay | `Audited` | `FeatureComplete` | `SpecReview` | Tracker pages and overlay are the deliverable. Evidence: `src/18-PROJECT-TRACKER.md`, `src/tracking/*.md`. |
| `M1` | Resource & Format Fidelity + Visual Rendering Slice | Phase 0 + Phase 1 | `Integrated` | `NotStarted` | `SpecReview` | Depends on M0 only; strongest first engineering target. |
| `M2` | Deterministic Simulation Core + Replayable Combat Slice | Phase 2 | `Integrated` | `NotStarted` | `SpecReview` | Critical path milestone; depends on M1. |
| `M3` | Local Playable Skirmish (Single Machine, Dummy AI) | Phase 3 + Phase 4 prep | `Integrated` | `NotStarted` | `SpecReview` | First playable local game slice. |
| `M4` | Minimal Online Skirmish (No External Tracker) | Phase 5 subset (vertical slice) | `Integrated` | `NotStarted` | `SpecReview` | Minimal online slice intentionally excludes tracking/ranked. |
| `M5` | Campaign Runtime Vertical Slice | Phase 4 subset | `Decisioned` | `NotStarted` | `SpecReview` | Campaign runtime vertical slice can parallelize with M4 after M3. |
| `M6` | Full Single-Player Campaigns + Single-Player Maturity | Phase 4 full | `Decisioned` | `NotStarted` | `SpecReview` | Campaign-complete differentiator milestone. Status reflects weakest critical-path decisions (D042, D043, D036 are `Decisioned`). |
| `M7` | Multiplayer Productization (Browser, Ranked, Spectator, Trust) | Phase 5 full | `Integrated` | `NotStarted` | `SpecReview` | Multiplayer productization, trust, ranked, moderation. |
| `M8` | Creator Foundation (CLI + Minimal Workshop + Early Mod Workflow) | Phase 4–5 overlay + 6a foundation | `Integrated` | `NotStarted` | `SpecReview` | Creator foundation lane can start after M2 if resourced. |
| `M9` | Full SDK Scenario Editor + Full Workshop + OpenRA Export Core | Phase 6a | `Integrated` | `NotStarted` | `SpecReview` | Scenario editor + full workshop + export core. |
| `M10` | Campaign Editor + Game Modes + RA1 Export + Editor Extensibility | Phase 6b | `Integrated` | `NotStarted` | `SpecReview` | Campaign editor + advanced game modes + RA1 export. |
| `M11` | Ecosystem Polish, Optional AI/LLM, Platform Expansion | Phase 7 | `Decisioned` | `NotStarted` | `SpecReview` | Optional/experimental/polish heavy phase. |

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

## M1-M4 How-Completeness Audit (Baseline)

This subsection answers a narrower question than the full tracker: **do we have enough implementation-grade "how" to start the `M1 -> M4` execution chain in the correct order?**

**Baseline answer:** **Yes, with explicit closure items**. The `M1-M4` chain is sufficiently specified to begin implementation, but a few blockers and scope locks must be resolved or frozen before/while starting the affected milestones.

### Milestone-Scoped Readiness Summary

- **`M1` (Resource + Rendering Slice):** implementation-ready enough to start. Main risks are fidelity breadth and file-format quirks, not missing architecture.
- **`M2` (Deterministic Sim Core):** implementation-ready. P002 (fixed-point scale=1024) is resolved — see `research/fixed-point-math-design.md`.
- **`M3` (Local Skirmish):** mostly specified; ~~`P003`~~ ✓ resolved (Kira). Remaining dependency: a narrow, explicit `D043` AI baseline subset.
- **`M4` (Minimal Online Slice):** architecture and fairness path are well specified (`D007/D008/D012/D060` audited), but reconnect remains intentionally "support-or-explicit-defer."

### M1-M4 Closure Checklist (Before / During Implementation)

1. ~~**Resolve `P002` fixed-point scale before `M2` implementation starts.**~~ ✓ **RESOLVED:** 1024 scale factor (see `research/fixed-point-math-design.md`). Affected decisions: D009, D013, D015, D045.

2. **Freeze an explicit `M3` AI baseline subset (from `D043`) for local skirmish.**
   - `M3.SP.SKIRMISH_LOCAL_LOOP` depends on `D043`, but `D043`'s primary milestone is `M6`.
   - The `M3` slice should define a narrow "dummy/basic AI" contract and defer broader AI preset sophistication to `M6`.

3. ~~**Resolve `P003` audio library + music integration before Phase 3 skirmish polish/feel work.**~~ ✓ **RESOLVED:** Kira via `bevy_kira_audio` (see `research/audio-library-music-integration-design.md`). Four-bus mixer, dynamic music FSM, EVA priority queue. `M3.CORE.AUDIO_EVA_MUSIC` gate is unblocked.

4. **Choose and document the `M4` reconnect stance early (baseline support vs explicit defer).**
   - `M4.NET.RECONNECT_BASELINE` intentionally allows "implement or explicitly defer."
   - Either outcome is acceptable for the slice, but it must be explicit to avoid ambiguity during validation and player-facing messaging.

5. **Keep `M3`/`M4` subset boundaries explicit for imported higher-milestone decisions.**
   - `M3` skirmish usability references pieces of `D059`/`D060`; implement only the local skirmish usability subset, not full comms/ranked/trust surfaces.
   - `M4` online UX must not imply full tracking/ranked/browser availability.

### Evidence Basis (Current Tracker State)

- `M1` primary decisions: `5 Integrated`, `4 Decisioned`
- `M2` primary decisions: `9 Integrated`, `2 Audited`, `3 Decisioned`
- `M3` primary decisions: `3 Integrated`, `2 Decisioned`
- `M4` primary decisions: `4 Audited`

This supports starting the `M1 -> M4` chain now. `P002` is resolved (1024); `P003` is resolved (Kira); remaining checkpoint is the `M3`/`M4` scope locks above.

## Foundational Build Sequence (RA Mission Loop, Implementation Order)

This is the **implementation-order view** of the early milestones based on the granular ladder in the dependency map. It answers the practical question: *what do we build first so we can play one complete mission loop with correct win/loss flow and presentation?*

### Phase 1: Render and Recognize RA on Screen (`M1`)

1. Parse core RA assets (`.mix`, `.shp`, `.pal`) and enumerate them from a real RA install.
2. Render a real RA map scene in Bevy (palette-correct sprites, camera, basic fog/shroud handling).
3. Play unit sprite sequences (idle/move/fire/death) so the battlefield is not static.

### Phase 2: Make Units Interactive and Deterministic (`M2`)

1. Add cursor + hover hit-test primitives (cells/entities).
2. Add unit selection (single select, minimum multi-select/box select).
3. Implement deterministic sim tick + order application skeleton (P002 resolved: scale=1024, see `research/fixed-point-math-design.md`).
4. Integrate pathfinding + spatial queries so move orders produce actual movement.
5. Sync render presentation to sim state (movement/facing/animation transitions).
6. Implement combat baseline (targeting + hit/damage resolution).
7. Implement death/destruction state transitions and cleanup.

### Phase 3: Close the First Mission Loop (`M3`)

1. Implement authoritative mission-end evaluators:
   - victory when all enemies are eliminated
   - failure when all player units are dead
2. Implement mission-end UI shell:
   - `Mission Accomplished`
   - `Mission Failed`
3. Integrate EVA/VO mission-end audio (**after `P003` audio library/music integration is resolved**).
4. Implement replay/restart/exit flow for the mission result screen.
5. Run a "feel" pass (selection/cursor/audio/result pacing) until the slice is recognizably RA-like.
6. Expand from fixed mission slice to local skirmish (`M3` exit), using a **narrow documented `D043` basic AI subset**.

### After the First Mission Loop: Logical Next Steps (Through Completion)

1. `M4`: minimal online skirmish slice (relay/direct connect, no tracker/ranked).
2. `M5`: campaign runtime vertical slice (briefing -> mission -> debrief -> next).
3. `M6`: full single-player campaigns + SP maturity.
4. `M7`: multiplayer productization (browser, ranked, spectator, trust, reports/moderation).
5. `M8`: creator foundation lane (CLI + minimal Workshop + profiles), in parallel once `M2` is stable/resourced.
6. `M9`: scenario editor core + full Workshop + OpenRA export core.
7. `M10`: campaign editor + advanced game modes + RA1 export + editor extensibility.
8. `M11`: ecosystem polish, optional AI/LLM, platform expansion, advanced community governance.

### Multiplayer Build Sequence (Detailed, `M4–M7`)

1. `M4` minimal host/join path using the finalized netcode architecture (`NetworkModel` seam intact).
2. `M4` relay time authority + sub-tick normalization/clamping + sim-side order validation.
3. `M4` full minimal online match loop (play a match online end-to-end, result, disconnect cleanly).
4. `M4` reconnect baseline decision and implementation **or** explicit defer contract (must be documented and reflected in UX).
5. `M7` browser/tracking discovery + trust labels + lobby listings.
6. `M7` signed credentials/results and community-server trust path (`D052`) (~~`P004`~~ ✓ resolved — see `research/lobby-matchmaking-wire-protocol-design.md`).
7. `M7` ranked queue/tiers/seasons (`D055`) + queue degradation/health rules.
8. `M7` report/block/avoid + moderation evidence attachment + optional review pipeline baseline.
9. `M7` spectator/tournament basics + signed replay/evidence workflow.

### Creator Platform Build Sequence (Detailed, `M8–M11`)

1. `M8` `ic` CLI foundation + local content overlay/dev-profile run path (real runtime iteration, no packaging required).
2. `M8` minimal Workshop delivery baseline (`publish/install` loop).
3. `M8` mod profiles + virtual namespace + selective install hooks (`D062/D068`).
4. `M8` authoring reference foundation (generated YAML/Lua/CLI docs, one-source knowledge-base path).
5. `M9` Scenario Editor core (`D038`) + validate/test/publish loop + resource manager basics.
6. `M9` Asset Studio baseline (`D040`) + import/conversion + provenance plumbing.
7. `M9` full Workshop/CAS + moderation tooling + OpenRA export core (`D049/D066`).
8. `M9` SDK embedded authoring manual + context help (`F1`, `?`) from the generated docs source.
9. `M10` Campaign Editor + intermissions/dialogue/named characters + campaign test tools.
10. `M10` game mode templates + D070 family toolkit (Commander & SpecOps, commander-avatar variants, experimental survival).
11. `M10` RA1 export + plugin/extensibility hardening + localization/subtitle tooling.
12. `M11` governance/reputation polish + creator feedback recognition maturity + optional contributor cosmetic rewards.
13. `M11` optional BYOLLM stack (`D016/D047/D057`) and editor assistant surfaces.
14. `M11` optional visual/render-mode expansion (`D048`) + browser/mobile/Deck polish.

### Dependency Cross-Checks (Early Implementation)

- ~~`P002` must be resolved before serious `M2` sim/path/combat implementation.~~ ✓ RESOLVED (1024).
- ~~`P003` must be resolved before mission-end VO/EVA/audio polish in `M3`.~~ ✓ RESOLVED (Kira).
- ~~`P004` is **not** a blocker for the `M4` minimal online slice, but is a blocker for `M7` multiplayer productization.~~ ✓ RESOLVED (lobby/matchmaking wire protocol).
- `M4` online slice must remain architecture-faithful but feature-minimal (no tracker/ranked/browser assumptions).
- `M8` creator foundations can parallelize after `M2`, but full visual SDK/editor work (`M9+`) should wait for runtime/network product foundations and stable content schemas.
- `M11` remains optional/polish-heavy and must not displace unfinished `M7–M10` exit criteria unless a new decision/overlay remap explicitly changes that.

## M1-M3 Developer Task Checklist (`G1-G16`)

Use this as the implementation handoff checklist for the **first playable Red Alert mission loop**. It is intentionally more concrete than the milestone prose and should be used to structure early engineering tickets/work packages.

### Phase 1 Checklist (`M1`: Render and Recognize RA)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G1` | Implement core RA asset parsing in `ra-formats` for `.mix`, `.shp`, `.pal` + real-install asset enumeration | Parser corpus tests + sample asset enumeration output | Include malformed/corrupt fixture expectations and error behavior |
| `G2` | Implement Bevy map/sprite render slice (palette-correct draw, camera controls, static scene) | Known-map visual capture + regression screenshot set | Palette correctness should be checked against a reference image set |
| `G3` | Implement unit sprite sequence playback (idle/move/fire/death) | Short capture (GIF/video) + sequence timing sanity checks | Keep sequence lookup conventions compatible with later variant skins/icons |

#### `G1.x` Substeps (Owned-Source Import/Extract Foundations for `M3` Setup Wizard Handoff)

| Substep | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G1.1` | Source-adapter probe contract + source-manifest snapshot schema (Steam/GOG/EA/manual/Remastered normalized output) | Probe fixture snapshots + schema examples | Must match D069 setup wizard expectations and support D068 mixed-source planning |
| `G1.2` | `.mix` extraction primitives for importer staging (enumerate/validate/extract without source mutation) | `.mix` extraction corpus tests + corrupt-entry handling checks | Originals remain read-only; extraction outputs feed IC-managed storage pipeline |
| `G1.3` | `.shp/.pal` importer-ready validation and parser-to-render handoff metadata | Validation fixture tests + parser->render handoff smoke tests | This bridges `G1` format work and `G2/G3` render/animation slices |
| `G1.4` | `.aud/.vqa` header/chunk integrity validation and importer result diagnostics | Media validation tests + importer diagnostic output samples | Playback can remain later; importer correctness and failure messages are the goal here |
| `G1.5` | Importer artifact outputs (source manifest snapshot, per-item results, provenance, retry/re-scan metadata) | Artifact sample set + provenance metadata checks | Align artifacts with `05-FORMATS` owned-source pipeline and D069 repair/maintenance flows |
| `G1.6` | Remastered Collection source adapter probe + normalized importer handoff (out-of-the-box import path) | D069 setup import demo using a Remastered install | Explicitly verify no manual conversion and no source-install mutation |

### Phase 2 Checklist (`M2`: Interactivity + Deterministic Core)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G4` | Cursor + hover hit-test primitives for cells/entities in gameplay scene | Manual demo clip + hit-test unit tests (cell/entity under cursor) | Cursor semantics should remain compatible with D059/D065 input profile layering |
| `G5` | Selection baseline (single select + minimum multi-select/box select + selection markers) | Manual test checklist + screenshot/video for each selection mode | Use sim-derived selection state; avoid render-only authority |
| `G6` | Deterministic sim tick loop + basic order application (`move`, `stop`, state transitions) | Determinism test (`same inputs -> same hash`) + local replay pass | P002 resolved (1024). Use `Fixed(i32)` types from `research/fixed-point-math-design.md` |
| `G7` | Integrate `Pathfinder` + `SpatialIndex` into movement order execution | Conformance tests (`PathfinderConformanceTest`, `SpatialIndexConformanceTest`) + in-game movement demo | P002 resolved; preserve deterministic spatial-query ordering |
| `G8` | Render/sim sync for movement/facing/animation transitions | Visual movement correctness capture + replay-repeat visual spot check | Prevent sim/render state drift during motion |
| `G9` | Combat baseline (targeting + hit/damage resolution or narrow direct-fire first slice) | Deterministic combat replay test + combat demo clip | Prefer narrow deterministic slice over broad weapon feature scope |
| `G10` | Death/destruction transitions (death state, animation, cleanup/removal) | Deterministic combat replay with death assertions + cleanup checks | Removal timing must remain sim-authoritative |

### Phase 3 Checklist (`M3`: First Complete Mission Loop)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G11` | Sim-authoritative mission-end evaluators (`all enemies dead`, `all player units dead`) | Unit/integration tests for victory/failure triggers + replay-result consistency test | Implement result logic in sim state, not UI heuristics |
| `G12` | Mission-end UI shell (`Mission Accomplished` / `Mission Failed`) + flow pause/transition | Manual UX walkthrough capture + state-transition assertions | UI consumes authoritative result from `G11` |
| `G13` | EVA/VO integration for mission-end outcomes | Audio event trace/log + manual verification clip for both result states | ~~`P003`~~ ✓ resolved; depends on `M3.CORE.AUDIO_EVA_MUSIC` baseline |
| `G14` | Restart/exit flow from mission results (replay mission / return to menu) | Manual loop test (`start -> end -> replay`, `start -> end -> exit`) | This closes the first full mission loop |
| `G15` | “Feels like RA” pass (cursor feedback, selection readability, audio timing, result pacing) | Internal playtest notes + short sign-off checklist | Keep scope to first mission loop polish, not full skirmish parity |
| `G16` | Widen from fixed mission slice to local skirmish + narrow `D043` basic AI subset | `M3.SP.SKIRMISH_LOCAL_LOOP` validation run + explicit AI subset scope note | Freeze `M3` AI subset before implementation to avoid `M6` scope creep |

### Required Closure Gates Before Marking `M3` Exit

- ~~`P002` fixed-point scale resolved and reflected in sim/path/combat assumptions (`G6-G10`)~~ ✓ DONE
- ~~`P003` audio library/music integration resolved before finalizing `G13/G15`~~ ✓ DONE (Kira)
- `D043` **M3 basic AI subset** explicitly frozen (scope boundary vs `M6`)
- End-to-end mission loop validated:
  - start mission
  - play mission
  - trigger victory and failure
  - show correct UI + VO
  - replay/exit correctly

### Suggested Evidence Pack for the First Public “Playable” Update

When `G16` is complete, the first public progress update should ideally include:

- one short local skirmish gameplay clip
- one mission-loop clip showing win/fail result screens + EVA/VO
- one deterministic replay/hash proof note (engineering credibility)
- one short note documenting the frozen `M3` AI subset and deferred `M6` AI scope
- one tracker update setting relevant `M1/M2/M3` cluster `Code Status` values with evidence links

For ticket breakdown format, use:
- `src/tracking/implementation-ticket-template.md`

## M5-M6 Developer Task Checklist (Campaign Runtime -> Full Campaign Completion, `G18.1-G19.6`)

Use this checklist to move from “local skirmish exists” to “campaign-first differentiator delivered.”

### Phase 4 / `M5` Checklist (Campaign Runtime Vertical Slice)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G18.1` | Lua mission runtime baseline (`D004`) with deterministic sandbox boundaries and mission lifecycle hooks | Mission script runtime smoke tests + deterministic replay pass on scripted mission events | Keep API scope explicit and aligned with D024/D020 docs |
| `G18.2` | Campaign graph runtime + persistent campaign state save/load (`D021`) | Save/load tests across mission transition + campaign-state roundtrip tests | Campaign state persistence must be independent of UI flow assumptions |
| `G18.3` | Briefing -> mission -> debrief -> next flow (`D065` UX layer on `D021`) | Manual walkthrough capture + scripted regression path for one campaign chain | UX should consume campaign runtime state, not duplicate it |
| `G18.4` | Failure/continue/retry behavior + campaign save/load correctness for the vertical slice | Failure-path regression tests + manual retry/resume loop test | `M5` exit requires both success and failure paths to be coherent |

### Phase 4 / `M6` Checklist (Full Campaigns + SP Maturity)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G19.1` | Scale campaign runtime to full shipped mission set (scripts/objectives/transitions/outcomes) | Campaign mission coverage matrix + per-mission load/run smoke tests | Track missing/unsupported mission behaviors explicitly; no silent omissions |
| `G19.2` | Branching persistence, roster carryover, named-character/hero-state carryover correctness | Multi-mission branch/carryover test suite + state inspection snapshots | Includes D021 hero/named-character state correctness where used |
| `G19.3` | Video cutscenes (FMV) + rendered cutscene baseline (`Cinematic Sequence` world/fullscreen) + OFP-style trigger-camera scene property-sheet baseline + fallback-safe campaign behavior (`D068`) | Manual video/no-video/rendered/no-optional-media campaign path tests + fallback validation checklist + at least one no-Lua trigger-authored camera scene proof capture | Campaign must remain playable without optional media packs or optional visual/render-mode packs; trigger-camera scenes must declare audience scope and fallback presentation |
| `G19.4` | Skirmish AI baseline maturity + campaign/tutorial script support (`D043/D042`) | AI behavior baseline playtests + scripted mission support validation | Avoid overfitting to campaign scripts at expense of skirmish baseline |
| `G19.5` | D065 onboarding baseline for SP (Commander School, progressive hints, controls walkthrough integration) | Onboarding flow walkthroughs (KBM/controller/touch where supported) + prompt correctness checks | Prompt drift across input profiles is a known risk; test profile-aware prompts |
| `G19.6` | Full RA campaign validation (Allied + Soviet): save/load, media fallback, progression correctness | Campaign completion matrix + defect list closure + representative gameplay captures | `M6` exit is content-complete and behavior-correct, not just “most missions run” |

### Required Closure Gates Before Marking `M6` Exit

- All shipped campaign missions can be started and completed in campaign flow (Allied + Soviet)
- Save/load works mid-campaign and across campaign transitions
- Branching/carryover state correctness validated on representative branch paths
- Optional media missing-path remains playable (fallback-safe)
- D065 SP onboarding baseline is enabled and prompt-profile correct for supported input modes

## M4-M7 Developer Task Checklist (Minimal Online Slice -> Multiplayer Productization, `G17.1-G20.5`)

Use this checklist to keep the multiplayer path architecture-faithful and staged: **minimal online first, productization second**.

### `M4` Checklist (Minimal Online Slice)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G17.1` | Minimal host/join path (`direct connect` or `join code`) on final `NetworkModel` architecture | Two-client connect test (same LAN + remote path where possible) | Do not pull in tracker/browser/ranked assumptions |
| `G17.2` | Relay time authority + sub-tick normalization/clamping + sim-side validation path | Timing/fairness test logs + deterministic reject consistency checks | Keep trust claims bounded to `M4` slice guarantees |
| `G17.3` | Full minimal online match loop (play -> result -> disconnect) | Multiplayer demo capture + replay/hash consistency note | Proves `M4` architecture in live conditions |
| `G17.4` | Reconnect baseline implementation **or** explicit defer contract + UX wording | Reconnect test evidence or documented defer contract with UX mock proof | Either path is valid; ambiguity is not |

### `M7` Checklist (Multiplayer Productization)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G20.1` | Tracking/browser discovery + trust labels + lobby listings | Browser/lobby walkthrough captures + trust-label correctness checklist | Trust labels must match actual guarantees (D011/D052/07-CROSS-ENGINE) |
| `G20.2` | Signed credentials/results + community-server trust path (`D052`) | Credential/result signing tests + server trust path validation | ~~`P004`~~ ✓ resolved; see `research/lobby-matchmaking-wire-protocol-design.md` |
| `G20.3` | Ranked queue + tiers/seasons + queue health/degradation rules (`D055`) | Ranked queue test plan + queue fallback/degradation scenarios | Avoid-list guarantees and queue-health messaging must be explicit |
| `G20.4` | Report/block/avoid UX + moderation evidence attachment + optional review baseline | Report workflow demo + evidence attachment audit + sanctions capability-matrix tests | Keep moderation capabilities granular; avoid coupling failures |
| `G20.5` | Spectator/tournament basics + signed replay/evidence workflow | Spectator match capture + replay evidence verification + tournament-path checklist | `M7` exit requires browser/ranked/trust/moderation/spectator coherence |

### Required Closure Gates Before Marking `M7` Exit

- ~~`P004` resolved and reflected in multiplayer/lobby integration details~~ ✓ DONE (see `research/lobby-matchmaking-wire-protocol-design.md`)
- Trust labels verified against actual host modes and guarantees
- Ranked, report/avoid, and moderation flows are distinct and understandable
- Signed replay/evidence workflow exists for moderation/tournament review paths

## M8-M11 Developer Task Checklist (Creator Platform -> Full Authoring Platform -> Optional Polish, `G21.1-G24.3`)

Use this checklist to keep the creator ecosystem and optional/polish work sequenced correctly after runtime/network foundations.

### `M8` Checklist (Creator Foundation)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G21.1` | `ic` CLI foundation + local content overlay/dev-profile run path | CLI command demos + local-overlay run proof via real game runtime | Must preserve D062 fingerprint/profile boundaries and explicit local-overlay labeling |
| `G21.2` | Minimal Workshop delivery baseline (`publish/install`) | Publish/install smoke tests + package verification basics | Keep scope minimal; full federation/CAS belongs to `M9` |
| `G21.3` | Mod profiles + virtual namespace + selective install hooks (`D062/D068`) | Profile activation/fingerprint tests + install-preset behavior checks | Fingerprint boundaries (gameplay/presentation/player-config) must remain explicit |
| `G21.4` | Authoring reference foundation (generated YAML/Lua/CLI docs, one-source pipeline) | Generated docs artifact + versioning metadata + search/index smoke test | This is the foundation for the embedded SDK manual (`M9`) |

#### `G21.x` Substeps (Owned-Source Import Tooling / Diagnostics / Docs)

| Substep | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G21.1a` | CLI import-plan inspection for owned-source imports (probe output, source selection, mode preview) | `ic` CLI demo showing import-plan preview for owned source(s) | Must reflect D069 import modes and D068 install-plan integration without executing import |
| `G21.2a` | Owned-source import verify/retry diagnostics (distinct from Workshop package verify) | Diagnostic output samples + failure/retry smoke tests | Keep source-probe/import/extract/index failures distinguishable and actionable |
| `G21.3a` | Repair/re-scan/re-extract tooling for owned-source imports (maintenance parity with D069) | Maintenance CLI demo for moved source path / stale index recovery | Must preserve source-install immutability and provenance history |
| `G21.4a` | Generated docs for import modes + format-by-format importer behavior (from `05-FORMATS`) | Generated doc page artifact + search hits for importer/extractor reference topics | One-source docs pipeline only; this feeds SDK embedded help in `M9` |

### `M9` Checklist (Scenario Editor Core + Workshop + OpenRA Export Core)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G22.1` | Scenario Editor core (`D038`) + validate/test/publish loop + resource manager basics | End-to-end authoring demo (`edit -> validate -> test -> publish`) | Keep simple/advanced mode split intact |
| `G22.2` | Asset Studio baseline (`D040`) + import/conversion + provenance plumbing | Asset import/edit/publish-readiness demo + provenance metadata checks | Provenance UI should not block basic authoring flow in simple mode |
| `G22.3` | Full Workshop/CAS + moderation tooling + OpenRA export core (`D049/D066`) | Full publish/install/autodownload/CAS flow tests + `ic export --target openra` checks | Export-safe warnings/fidelity reports must be explicit and accurate |
| `G22.4` | SDK embedded authoring manual + context help (`F1`, `?`) | SDK docs browser/context-help demo + offline snapshot proof | Must consume one-source docs pipeline from `G21.4`, not a parallel manual |

### `M10` Checklist (Campaign Editor + Modes + RA1 Export + Extensibility)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G23.1` | Campaign Editor + intermissions/dialogue/named characters + campaign test tools | Campaign authoring demo + campaign test/preview workflow evidence | Includes hero/named-character authoring UX and state inspection |
| `G23.2` | Game mode templates + D070 family toolkit (Commander & SpecOps, commander-avatar variants, experimental survival) | Authoring + playtest demos for at least one D070 scenario and one experimental template | Keep experimental labels and PvE-first constraints explicit |
| `G23.3` | RA1 export + plugin/extensibility hardening + localization/subtitle tooling | RA1 export validation + plugin capability/version checks + localization workflow demo | Maintain simple/advanced authoring UX split while adding power features |

### `M11` Checklist (Ecosystem Polish + Optional Systems)

| Step | Work Package (Implementation Bundle) | Suggested Verification / Proof Artifact | Completion Notes |
| --- | --- | --- | --- |
| `G24.1` | Governance/reputation polish + creator feedback recognition maturity + optional contributor cosmetic rewards | Abuse/audit test plan + profile/reward UX walkthrough | No gameplay/ranked effects; profile-only rewards remain enforced |
| `G24.2` | Optional BYOLLM stack (`D016/D047/D057`) + local/cloud prompt strategy + editor assistant surfaces | BYOLLM provider matrix tests + prompt-strategy probe/eval demos | Must remain fully optional and fallback-safe |
| `G24.3` | Optional visual/render-mode expansion (`D048`) + browser/mobile/Deck polish | Cross-platform visual/perf captures + low-end baseline validation | Preserve “no dedicated gaming GPU required” path while adding optional visual modes |

### Required Closure Gates Before Marking `M9`, `M10`, and `M11` Exits

- **`M9`**:
  - scenario editor core + asset studio + full Workshop/CAS + OpenRA export core all work together
  - embedded authoring manual/context help uses the one-source docs pipeline
- **`M10`**:
  - campaign editor + advanced mode templates + RA1 export/extensibility/localization surfaces are validated and usable
  - experimental modes remain clearly labeled and do not displace core template validation
- **`M11`**:
  - optional systems (`BYOLLM`, render-mode/platform polish, contributor reward points if enabled) remain optional and do not break lower-milestone guarantees
  - any promoted optional system has explicit overlay remapping and updated trust/fairness claims where relevant

## Decision Tracker (All Dxxx from `src/09-DECISIONS.md`)

This table tracks **every decision row currently indexed in [`src/09-DECISIONS.md`](09-DECISIONS.md)** (70 rows after index normalization). Legacy decisions `D063`/`D064` are indexed and tracked here with canonical references carried forward in D067 integration notes in `src/decisions/09a-foundation.md`.

| Decision | Title | Domain | Canonical Source | Milestone (Primary) | Milestone (Secondary/Prereqs) | Priority | Design Status | Code Status | Validation | Key Dependencies | Blocking Pending Decisions | Notes / Risks | Evidence Links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `D001` | Language — Rust | Foundation | `src/decisions/09a-foundation.md` | `M1` | M0 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D002` | Framework — Bevy | Foundation | `src/decisions/09a-foundation.md` | `M1` | M0 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D003` | Data Format — Real YAML, Not MiniYAML | Foundation | `src/decisions/09a-foundation.md` | `M1` | M0 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D004` | Modding — Lua (Not Python) for Scripting | Modding | `src/decisions/09c-modding.md` | `M5` | M8, M9 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D005` | Modding — WASM for Power Users (Tier 3) | Modding | `src/decisions/09c-modding.md` | `M8` | M9, M11 | `P-Creator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D006` | Networking — Pluggable via Trait | Networking | `src/decisions/09b/D006-pluggable-net.md` | `M2` | M4 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D009, D010, D041; `M2.CORE.SIM_FIXED_POINT_AND_ORDERS` | — | — | — |
| `D007` | Networking — Relay Server as Default | Networking | `src/decisions/09b/D007-relay-default.md` | `M4` | M7 | `P-Core` | `Audited` | `NotStarted` | `SpecReview` | D006, D008, D012, D060; `M4.NET.MINIMAL_LOCKSTEP_ONLINE` | — | — | — |
| `D008` | Sub-Tick Timestamps on Orders | Networking | `src/decisions/09b/D008-sub-tick.md` | `M4` | M7 | `P-Core` | `Audited` | `NotStarted` | `SpecReview` | D006, D007, D012; relay timestamp normalization path | — | — | — |
| `D009` | Simulation — Fixed-Point Math, No Floats | Foundation | `src/decisions/09a-foundation.md` | `M2` | M0 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | P002 | — | — |
| `D010` | Simulation — Snapshottable State | Foundation | `src/decisions/09a-foundation.md` | `M2` | M0 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D011` | Cross-Engine Play — Community Layer, Not Sim Layer | Networking | `src/decisions/09b/D011-cross-engine.md` | `M7` | M11 | `P-Differentiator` | `Audited` | `NotStarted` | `SpecReview` | D007, D052, `src/07-CROSS-ENGINE.md` trust matrix, D056 | — | Cross-engine live play trust is level-specific; no native IC anti-cheat guarantees for foreign clients by default. | — |
| `D012` | Security — Validate Orders in Sim | Networking | `src/decisions/09b/D012-order-validation.md` | `M4` | M7 | `P-Core` | `Audited` | `NotStarted` | `SpecReview` | D009, D010, D006; sim order validation pipeline | — | — | — |
| `D013` | Pathfinding — Trait-Abstracted, Multi-Layer Hybrid | Gameplay | `src/decisions/09d/D013-pathfinding.md` | `M2` | M3 | `P-Core` | `Audited` | `NotStarted` | `SpecReview` | D009, D015, D041; `M2.CORE.PATHFINDING_SPATIAL` | P002 | — | — |
| `D014` | Templating — Tera in Phase 6a (Nice-to-Have) | Modding | `src/decisions/09c-modding.md` | `M9` | M11 | `P-Creator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D015` | Performance — Efficiency-First, Not Thread-First | Foundation | `src/decisions/09a-foundation.md` | `M2` | M0 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | P002 | — | — |
| `D016` | LLM-Generated Missions and Campaigns | Tools | `src/decisions/09f/D016-llm-missions.md` | `M11` | M9 | `P-Optional` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | Optional/BYOLLM; never blocks core engine playability or modding workflows. | — |
| `D017` | Bevy Rendering Pipeline | Foundation | `src/decisions/09a-foundation.md` | `M1` | M11 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D018` | Multi-Game Extensibility (Game Modules) | Foundation | `src/decisions/09a-foundation.md` | `M2` | M9, M10 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D039, D041, D013; game module registration and subsystem seams | — | — | — |
| `D019` | Switchable Balance Presets | Gameplay | `src/decisions/09d/D019-balance-presets.md` | `M3` | M7 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D020` | Mod SDK & Creative Toolchain | Gameplay (Tools by function) | `src/decisions/09d-gameplay.md` | `M8` | M9, M10 | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | D038, D040, D049, D068, D069; CLI + separate SDK app foundation | — | Domain is "Tools" by function but canonical decision lives in `09d-gameplay.md` for historical reasons; detailed workflows extend into `04-MODDING.md` and D038/D040, including the local content overlay/dev-profile iteration path. | — |
| `D021` | Branching Campaign System with Persistent State | Gameplay | `src/decisions/09d-gameplay.md` | `M5` | M6, M10 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D004, D010, D038, D065; `src/modding/campaigns.md` runtime/schema details | — | Campaign runtime slice (`M5`) is the first proof point; full campaign completeness lands in `M6`. `src/modding/campaigns.md` also carries the canonical named-character presentation override schema used by D038 hero/campaign authoring (presentation-only convenience layer). | — |
| `D022` | Dynamic Weather with Terrain Surface Effects | Gameplay | `src/decisions/09d-gameplay.md` | `M6` | M3, M10 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D010, D015, D022 weather systems in `02-ARCHITECTURE.md`, D024 (Lua control) | — | Decision is intentionally split across sim-side determinism and render-side quality tiers. | — |
| `D023` | OpenRA Vocabulary Compatibility Layer | Modding | `src/decisions/09d-gameplay.md` | `M1` | M8, M9 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D003, D025, D026, D066; `M1.CORE.OPENRA_DATA_COMPAT` | — | Core compatibility/familiarity enabler; alias table also feeds export workflows later. | — |
| `D024` | Lua API Superset of OpenRA | Modding | `src/decisions/09d-gameplay.md` | `M5` | M6, M8, M9 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D004, D021, D059, D066; mission scripting compatibility | — | Key migration promise for campaign/scripted content; export-safe validation uses OpenRA-safe subset. | — |
| `D025` | Runtime MiniYAML Loading | Modding | `src/decisions/09d-gameplay.md` | `M1` | M8, M9 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D003, D023, D026, D066; runtime compatibility loader | — | Canonical content stays YAML (D003); MiniYAML remains accepted compatibility input only. | — |
| `D026` | OpenRA Mod Manifest Compatibility | Modding | `src/decisions/09d-gameplay.md` | `M1` | M8, M9 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D023, D024, D025, D020; zero-friction OpenRA mod import path | — | Import is part of early compatibility story; full conversion/publish workflows mature in creator milestones. | — |
| `D027` | Canonical Enum Compatibility with OpenRA | Gameplay | `src/decisions/09d-gameplay.md` | `M2` | M1, M9 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D023, D028, D029; sim enums + parser aliasing | — | Keeps versus tables/locomotor and other balance-critical data copy-paste compatible. | — |
| `D028` | Condition and Multiplier Systems as Phase 2 Requirements | Gameplay | `src/decisions/09d-gameplay.md` | `M2` | M3, M6 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D009, D013, D015, D027, D041; `M2.CORE.GAP_P0_GAMEPLAY_SYSTEMS` | P002 | Hard Phase 2 gate for modding expressiveness and combat fidelity. | — |
| `D029` | Cross-Game Component Library (Phase 2 Targets) | Gameplay | `src/decisions/09d-gameplay.md` | `M2` | M3, M6, M10 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | D028, D041, D048; Phase 2 targets with some early-Phase-3 spillover allowed | — | D028 remains the strict Phase 2 exit gate; D029 systems are high-priority targets with phased fallback. | — |
| `D030` | Workshop Resource Registry & Dependency System | Community | `src/decisions/09e/D030-workshop-registry.md` | `M8` | — | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | D049, D034, D052 (later server integration), D068 | — | — | — |
| `D031` | Observability & Telemetry (OTEL) | Community | `src/decisions/09e/D031-observability.md` | `M2` | M7, M11 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D032` | Switchable UI Themes | Modding | `src/decisions/09c-modding.md` | `M3` | M6 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | Audio theme variants (menu music/click sounds per theme) can now use Kira (~~P003~~ ✓ resolved); core visual theme switching is independent. | — |
| `D033` | Toggleable QoL & Gameplay Behavior Presets | Gameplay | `src/decisions/09d/D033-qol-presets.md` | `M3` | M6 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D034` | SQLite as Embedded Storage | Community | `src/decisions/09e/D034-sqlite.md` | `M2` | M7, M9 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D035` | Creator Recognition & Attribution | Community | `src/decisions/09e/D035-creator-attribution.md` | `M9` | M11 | `P-Scale` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D036` | Achievement System | Community | `src/decisions/09e/D036-achievements.md` | `M6` | M10 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D037` | Community Governance & Platform Stewardship | Community | `src/decisions/09e/D037-governance.md` | `M0` | M7, M11 | `P-Scale` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D038` | Scenario Editor (OFP/Eden-Inspired, SDK) | Tools | `src/decisions/09f/D038-scenario-editor.md` | `M9` | M10 | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | D020 (CLI/SDK), D040, D049, D059, D065, D066, D069 | — | Large multi-topic decision; milestone split between Scenario Editor core (M9) and Campaign/Game Modes (M10). M10 also carries the character presentation override convenience layer (unique hero/operative voice/icon/skin/marker variants) via `M10.SDK.D038_CHARACTER_PRESENTATION_OVERRIDES`. Cutscene support is explicitly split into **video cutscenes** (`Video Playback`) and **rendered cutscenes** (`Cinematic Sequence`): M6 baseline uses FMV + rendered world/fullscreen sequences, while `M10.UX.D038_RENDERED_CUTSCENE_DISPLAY_TARGETS` adds rendered `radar_comm` / `picture_in_picture` capture-target authoring/validation and `M11.VISUAL.D048_AND_RENDER_MOD_INFRA` covers advanced render-mode policy (`prefer/require 2D/3D`) polish. OFP-style trigger-driven camera scenes are also split: `M6.UX.D038_TRIGGER_CAMERA_SCENES_BASELINE` covers property-sheet trigger + shot-preset authoring over normal trigger + `Cinematic Sequence` data, and `M10.SDK.D038_CAMERA_TRIGGER_AUTHORING_ADVANCED` adds shot graphs/splines/trigger-context preview. RTL/BiDi support is split into `M9.SDK.RTL_BASIC_EDITOR_UI_LAYOUT` (baseline editor chrome/text correctness) and `M10.SDK.RTL_BIDI_LOCALIZATION_WORKBENCH_PREVIEW` (authoring-grade localization preview/validation). | — |
| `D039` | Engine Scope — General-Purpose Classic RTS | Foundation | `src/decisions/09a-foundation.md` | `M1` | M11 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D040` | Asset Studio | Tools | `src/decisions/09f/D040-asset-studio.md` | `M9` | M10 | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | D038, D049, D068; Asset Studio + publish readiness/provenance | — | Advanced/provenance/editor AI integrations are phased; baseline asset editing is M9. | — |
| `D041` | Trait-Abstracted Subsystem Strategy | Gameplay | `src/decisions/09d/D041-trait-abstraction.md` | `M2` | M9 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D042` | Player Behavioral Profiles & Training | Gameplay | `src/decisions/09d/D042-behavioral-profiles.md` | `M6` | M7, M11 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D043` | AI Behavior Presets | Gameplay | `src/decisions/09d/D043-ai-presets.md` | `M6` | M3, M7 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D044` | LLM-Enhanced AI | Gameplay | `src/decisions/09d/D044-llm-ai.md` | `M11` | — | `P-Optional` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D045` | Pathfinding Behavior Presets | Gameplay | `src/decisions/09d/D045-pathfinding-presets.md` | `M2` | M3 | `P-Core` | `Audited` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | P002 | — | — |
| `D046` | Community Platform — Premium Content | Community | `src/decisions/09e/D046-community-platform.md` | `M11` | — | `P-Scale` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | Community monetization/premium policy intentionally gated late after core community trust and moderation systems. | — |
| `D047` | LLM Configuration Manager | Tools | `src/decisions/09f/D047-llm-config.md` | `M11` | M9 | `P-Optional` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D048` | Switchable Render Modes | Gameplay | `src/decisions/09d/D048-render-modes.md` | `M11` | M3 | `P-Optional` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D049` | Workshop Asset Formats & P2P Distribution | Community | `src/decisions/09e/D049-workshop-assets.md` | `M9` | M8, M7 | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | D030, D034, D068; Workshop transport/CAS and package verification | — | D049 now explicitly separates hash/signature roles (SHA-256 canonical package/manifest digests, optional BLAKE3 internal CAS/chunk acceleration, Ed25519 signed metadata) and phases Workshop ops/admin tooling (`M8` minimal operator panel -> `M9` full admin panel). Freeware/legacy C&C mirror hosting remains policy-gated under D037. Workshop resources explicitly include both **video cutscenes** and **rendered cutscene sequence bundles** (D038 `Cinematic Sequence` content + dependencies) with fallback-safe packaging expectations, plus media language capability metadata/trust labels (`Audio`/`Subs`/`CC`, coverage, translation source) so clients can choose predictable cutscene fallback paths and admins can review mislabeled machine translations. | — |
| `D050` | Workshop as Cross-Project Reusable Library | Modding | `src/decisions/09c-modding.md` | `M9` | M8 | `P-Creator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D051` | Engine License — GPL v3 with Modding Exception | Modding | `src/decisions/09c-modding.md` | `M0` | — | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D052` | Community Servers with Portable Signed Credentials | Networking | `src/decisions/09b/D052-community-servers.md` | `M7` | M4 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D007, D055, D061, D031; signed credentials and community servers | ~~P004~~ ✓ | Community review / moderation pipeline is optional capability layered on top of signed credential infrastructure. | — |
| `D053` | Player Profile System | Community | `src/decisions/09e/D053-player-profile.md` | `M7` | M6 | `P-Scale` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D054` | Extended Switchability | Gameplay | `src/decisions/09d/D054-extended-switchability.md` | `M7` | M11 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D055` | Ranked Tiers, Seasons & Matchmaking Queue | Networking | `src/decisions/09b/D055-ranked-matchmaking.md` | `M7` | M11 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D052, D053, D059, D060; ranked queue and policy enforcement | ~~P004~~ ✓ | — | — |
| `D056` | Foreign Replay Import | Tools | `src/decisions/09f/D056-replay-import.md` | `M7` | M9 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | Foreign replay import improves analysis and cross-engine onboarding but is not a blocker for minimal online slice. | — |
| `D057` | LLM Skill Library | Tools | `src/decisions/09f/D057-llm-skill-library.md` | `M11` | M9 | `P-Optional` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D058` | In-Game Command Console | Interaction | `src/decisions/09g/D058-command-console.md` | `M3` | M7, M9 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D059` | In-Game Communication (Chat, Voice, Pings) | Interaction | `src/decisions/09g/D059-communication.md` | `M7` | M10 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D058, D052, D055, D065; role-aware comms and moderation UX | ~~P004~~ ✓ | Includes explicit colored beacon/ping + tactical marker presentation rules (optional short labels, visibility scope, replay-safe metadata, anti-spam/accessibility constraints) for multiplayer readability and D070 reuse, plus a documented RTL/BiDi support split: legitimate Arabic/Hebrew chat/marker labels render correctly while anti-spoof/control-char sanitization remains relay-/moderation-safe. | — |
| `D060` | Netcode Parameter Philosophy | Networking | `src/decisions/09b/D060-netcode-params.md` | `M4` | M7 | `P-Core` | `Audited` | `NotStarted` | `SpecReview` | D007, D008, D012; relay policy and parameter automation constraints | ~~P004~~ ✓ | Must stay aligned with `03-NETCODE.md` and `06-SECURITY.md` trust authority policy. | — |
| `D065` | Tutorial & New Player Experience | Interaction | `src/decisions/09g/D065-tutorial.md` | `M6` | M3, M7 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D033, D058, D059, D069; onboarding, prompts, quick reference | — | D065 prompt rendering and UI-anchor overlays must remain locale-aware (including RTL/BiDi text rendering and mirrored UI anchors where applicable) and stay aligned with the shared `ic-ui` layout-direction contract. | — |
| `D069` | Installation & First-Run Setup Wizard | Interaction | `src/decisions/09g/D069-install-wizard.md` | `M3` | M8 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | D061, D068, D030, D033, D034, D049, D065; first-run/maintenance wizard | — | `M3` is spec-acceptance/design-integration milestone; implementation delivery targets Phase 4-5. D069 now explicitly includes out-of-the-box owned-install import/extract (including Steam Remastered) into IC-managed storage, with source installs treated as read-only. Offline-first and no-dead-end setup rules must remain intact across platform variants. | — |
| `D070` | Asymmetric Co-op Mode — Commander & Field Ops | Gameplay | `src/decisions/09d/D070-asymmetric-coop.md` | `M10` | M11 | `P-Differentiator` | `Integrated` | `NotStarted` | `SpecReview` | D038, D059, D065, D021 (campaign runtime), D066 (export warnings) | — | IC-native template/toolkit with PvE-first scope; export compatibility intentionally limited in v1. Includes optional prototype-first pacing layer (`Operational Momentum` / "one more phase") and adjacent experimental variants. | — |
| `D061` | Player Data Backup & Portability | Community | `src/decisions/09e/D061-data-backup.md` | `M1` | M3, M7 | `P-Core` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D062` | Mod Profiles & Virtual Asset Namespace | Modding | `src/decisions/09c-modding.md` | `M8` | M9, M7 | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D063` | Compression Configuration (Carried Forward in D067) | Foundation | `src/decisions/09a-foundation.md` | `M7` | M8, M9 | `P-Scale` | `Integrated` | `NotStarted` | `SpecReview` | D067, D049, D030; server/workshop transfer and storage tuning | — | Legacy decision is carried forward through D067 config split + `15-SERVER-GUIDE.md`; no standalone D063 section currently exists. | — |
| `D064` | Server Configuration System (Carried Forward in D067) | Foundation | `src/decisions/09a-foundation.md` | `M7` | M4, M11 | `P-Scale` | `Integrated` | `NotStarted` | `SpecReview` | D067, D007, D052, D055; server config/cvar registry and deployment profiles | — | Legacy decision is carried forward through D067 integration notes and `15-SERVER-GUIDE.md`; keep server-guide references aligned. | — |
| `D066` | Cross-Engine Export & Editor Extensibility | Modding | `src/decisions/09c-modding.md` | `M9` | M10 | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | D023/D025/D026 (compat layer refs), D038, D040, D049 | — | Export fidelity is IC-native-first; target-specific warnings/gating are expected and intentional. | — |
| `D067` | Configuration Format Split — TOML vs YAML | Foundation | `src/decisions/09a-foundation.md` | `M2` | M7 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | See `tracking/milestone-dependency-map.md` for milestone and feature-cluster dependency edges. | — | — | — |
| `D068` | Selective Installation & Content Footprints | Modding | `src/decisions/09c-modding.md` | `M8` | M3, M9 | `P-Creator` | `Integrated` | `NotStarted` | `SpecReview` | D030, D049, D061, D069; install profiles and content footprints | — | D068 now explicitly covers mixed install plans across owned proprietary imports (including Remastered via D069), open sources, and Workshop packages; local proprietary imports do not imply redistribution rights. It also defines player-selectable voice-over variant packs/preferences (language/style, per category such as EVA/unit/dialogue/cutscene dubs), media language capability-aware fallback chains (audio/subtitles/CC), and an optional `M11` machine-translated subtitle/CC fallback path (opt-in, labeled, trust-tagged). Player-config packages are explicitly outside gameplay/presentation compatibility fingerprints. | — |
| `D071` | External Tool API — IC Remote Protocol (ICRP) | Tools | `src/decisions/09f/D071-external-tool-api.md` | `M5` | M2, M3, M8, M9 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | D006, D010, D012, D058; external tool API and protocol | — | Multi-phase: Phase 2 (observer tier + HTTP), Phase 3 (WebSocket + auth + admin tier), Phase 5 (relay server API), Phase 6a (mod tier + MCP + LSP + Workshop tool packages). Enables community ecosystem tooling (overlays, coaching, tournament tools). | — |
| `D072` | Dedicated Server Management | Networking | `src/decisions/09b/D072-server-management.md` | `M5` | M2, M8, M9 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | D007, D064, D071; server management interfaces and ops | — | Multi-phase: Phase 2 (`/health` + logging), Phase 5 (full CLI + web dashboard + in-game admin + scaling), Phase 6a (self-update + advanced monitoring). Binary naming superseded by D074 (`ic-server`). | — |
| `D073` | LLM Exhibition Matches & Prompt-Coached Modes | Gameplay | `src/decisions/09d/D073-llm-exhibition-modes.md` | `M11` | — | `P-Optional` | `Decisioned` | `NotStarted` | `SpecReview` | D044, D010, D059; LLM exhibition and spectator modes | — | Phase 7 content. Never part of ranked matchmaking (D055). Custom/local exhibition + prompt-coached modes + replay metadata/overlay. Document's feature cluster tag reads `M7.LLM` but Phase 7 maps to M11 per roadmap overlay. | — |
| `D074` | Community Server — Unified Binary with Capability Flags | Networking | `src/decisions/09b/D074-community-server-bundle.md` | `M5` | M2, M3, M8, M9 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | D007, D030, D034, D049, D052, D055, D072; unified server binary and capability packaging | — | Multi-phase: Phase 2 (health + logging), Phase 4 (Workshop seeding), Phase 5 (full community server with all capabilities), Phase 6a (federation, self-update). Consolidates D007+D030+D049+D052+D072 packaging. Binary is `ic-server`. | — |
| `D075` | Remastered Collection Format Compatibility | Modding | `src/decisions/09c/D075-remastered-format-compat.md` | `M2` | M8, M9 | `P-Differentiator` | `Decisioned` | `NotStarted` | `SpecReview` | D040, D048; Remastered format parsers and Asset Studio wizard | — | Phase 2 (format parsers in `ra-formats`: MEG, TGA+META, DDS), Phase 6a (Asset Studio import wizard). CLI fallback `ic asset import-remastered` available Phase 2. No runtime Bink2 decoder — BK2→WebM at import time. | — |
| `D076` | Standalone MIT/Apache-Licensed Crate Extraction Strategy | Foundation | `src/decisions/09a/D076-standalone-crates.md` | `M0` | M1, M2, M5, M8, M9 | `P-Core` | `Decisioned` | `NotStarted` | `SpecReview` | D009, D050, D051; crate extraction licensing and repo strategy | — | Tier 1 crates (`cnc-formats`, `fixed-game-math`, `deterministic-rng`) are Phase 0 / M0–M1 deliverables — separate repos before any GPL code exists. Tier 2–3 extraction follows IC implementation timeline (M2 for `glicko2-rts`, M5 for `lockstep-relay`, M8–M9 for `workshop-core`/`lua-sandbox`/`p2p-distribute`). `ra-formats` stays GPL (wraps `cnc-formats` + EA-derived code). | — |

## Feature Cluster Coverage Summary

| Source | Coverage Goal | Baseline Coverage in This Overlay | Notes |
| --- | --- | --- | --- |
| `src/09-DECISIONS.md` | Every indexed `Dxxx` row mapped to milestone(s) and statuses | `76/76` decision rows mapped | Tracker is keyed to the decision index; legacy D063/D064 are indexed via D067 carry-forward notes in Foundation. |
| `src/08-ROADMAP.md` | All phases covered by overlay milestones | `Phase 0`–`Phase 7` mapped into `M1`–`M11` (plus `M0` tracker bootstrap) | Roadmap remains canonical; overlay adds dependency/execution view. |
| `src/11-OPENRA-FEATURES.md` | Gameplay priority triage (`P0`–`P3`) reflected in ordering | `P0`→`M2`, `P1/P2`→`M3`, `P3`→`M6+`/deferred clusters | Priority tables used as canonical sub-priority for gameplay familiarity implementation. |
| `src/17-PLAYER-FLOW.md` | Milestone-gating UX surfaces represented | Setup, main menu/skirmish, lobby/MP, campaign flow, moderation/review, SDK entry flows mapped | Prevents backend-only milestone definitions; includes post-play feedback prompt + creator-feedback inbox/helpful-recognition surfaces and SDK authoring-manual/context-help surfaces mapped via `M7`/`M10` and `M9` creator-doc clusters. |
| `src/07-CROSS-ENGINE.md` | Trust/host mode packaging reflected in planning | Mapped into multiplayer packaging and policy clusters (`M7`, `M11`) | Keeps anti-cheat/trust claims level-specific. |
| External implementation repos | Design-aligned bootstrap + navigation requirements captured as `M0` process feature | `M0.OPS.EXTERNAL_CODE_REPO_BOOTSTRAP_AND_NAVIGATION_TEMPLATES` mapped with templates and maintenance rules | Prevents external code repos and agent workflows from drifting away from the overlay and canonical decisions. |

## Dependency Risk Watchlist

### Future / Deferral Language Audit Status (M0 Process Hardening)

- **Scope:** canonical docs (`src/**/*.md`) + `README.md` + `AGENTS.md`
- **Baseline inventory:** `292` hits for `future/later/deferred/eventually/TBD/nice-to-have` (see `tracking/future-language-audit.md`)
- **Policy:** ambiguous future planning language is not allowed; all future-facing commitments must be classified and, if accepted, placed in the execution overlay
- **Execution overlay cluster:** `M0.OPS.FUTURE_DEFERRAL_DISCIPLINE_AND_AUDIT`
- **Working mode:** classify -> exempt or rewrite -> map planned deferrals -> track unresolved items until closed

| Risk | Why It Matters | Affected Milestones | Mitigation / Tracker Rule |
| --- | --- | --- | --- |
| Decision index drift (`src/09-DECISIONS.md` vs referenced `D0xx` elsewhere) | The tracker is Dxxx-index keyed; future non-indexed decisions can become invisible | `M1`–`M11` (cross-cutting) | Add index rows in the same change as new `Dxxx` references and update tracker row count/coverage summary immediately. |
| ~~`P002` fixed-point scale~~ | ~~Blocks final numeric tuning~~ **RESOLVED** (1024, see `research/fixed-point-math-design.md`) | `M2`, `M3` | Resolved. Affected D rows (D009, D013, D015, D028, D045) can proceed. |
| ~~`P003` audio library + music integration design~~ | ~~Blocks final audio/music implementation choices~~ **RESOLVED** (Kira via `bevy_kira_audio`, see `research/audio-library-music-integration-design.md`) | `M3`, `M6` | Resolved. `M3` audio cluster gate is unblocked. |
| ~~`P004` lobby/matchmaking wire details~~ | ~~Multiplayer productization details can churn if not locked~~ **RESOLVED** (see `research/lobby-matchmaking-wire-protocol-design.md`) | `M4`, `M7` | Resolved. D052/D055/D059/D060 integration details are specified. |
| Legal/ops gates for community infrastructure (entity + DMCA agent) | Workshop/ranked/community infra risk if omitted | `M7`, `M9` | Treat as `policy_gate` nodes in dependency map; do not mark affected milestones validated without them. |
| Scope pressure from advanced modes and optional AI (D070, survival variant, D016/D047/D057) | Can steal bandwidth from core runtime/campaign/multiplayer milestones | `M7`–`M11` | Keep `P-Optional` and experimental features gated; no promotion to core milestones without playtest evidence. |
| Feedback-reward farming / positivity bias in creator review recognition | Can distort review quality and create social abuse incentives if rewards are treated as gameplay, popularity, or review volume | `M7`, `M10`, `M11` | Keep rewards profile-only, sampled prompts, creator helpful-mark auditability, and D037/D052 anti-collusion enforcement; emphasize "helpful/actionable" over positive sentiment; see `M7.UX.POST_PLAY_FEEDBACK_PROMPTS` + `M10.COM.CREATOR_FEEDBACK_HELPFUL_RECOGNITION`. |
| Community-contribution points inflation / redemption abuse (if enabled) | Optional redeemable points can become farmed, confusing, or mistaken for a gameplay currency without strict guardrails | `M11` | Keep points non-tradable/non-cashable/non-gameplay, cap accrual, audit grants/redemptions, support revocation/refund, and use clear "profile/cosmetic-only" labeling via `M11.COM.CONTRIBUTOR_POINTS_COSMETIC_REWARDS`. |
| Authoring manual drift (SDK embedded docs vs web docs vs CLI/API/schema reality) | Creators lose trust fast if field/flag/script docs are stale or contradictory | `M8`, `M9`, `M10` | Use one-source D037 knowledge-base content + generated references (`M8.SDK.AUTHORING_REFERENCE_FOUNDATION`) and SDK embedded snapshot/context help as a view (`M9.SDK.EMBEDDED_AUTHORING_MANUAL`), not a parallel manual. |
| Creator iteration friction (local content requires repeated packaging/install loops) | Strong tooling can still fail adoption if iteration cost is too high during `M8`/`M9` | `M8`, `M9` | Preserve a fast local content overlay/dev-profile workflow in CLI + SDK integration; see `research/bar-recoil-source-study.md` and mapped clusters in `tracking/milestone-dependency-map.md` (`M8.SDK.CLI_FOUNDATION`, `M9.SDK.D038_SCENARIO_EDITOR_CORE`). |
| Netcode diagnostics opacity (buffering/jitter/rejoin behavior hidden from users/admins) | Lockstep systems can feel unfair or "broken" if queueing/jitter tradeoffs are not visible and explained | `M4`, `M7` | Keep relay/buffering diagnostics and trust labels explicit; see BAR/Recoil source-study mappings for `M4.NET.RELAY_TIME_AUTHORITY_AND_VALIDATION`, `M7.SEC.BEHAVIORAL_ANALYSIS_REPORTING`, `M7.NET.SPECTATOR_TOURNAMENT`. |
| Cross-engine / 2D-vs-3D parity overclaiming in public messaging | The long-term vision is compelling, but blanket "fair cross-engine 2D vs 3D play" claims can exceed actual trust/certification guarantees and damage credibility | `M7`, `M11` | Treat mixed-client 2D-vs-3D play as a North Star tied to `M7.NET.CROSS_ENGINE_BRIDGE_AND_TRUST` + `M11.VISUAL.D048_AND_RENDER_MOD_INFRA`; always use host-mode trust labels and mode-specific fairness claims. |
| Ambiguous future/deferral language drift | Vague “future/later/deferred” wording can create unscheduled commitments and break dependency-first implementation planning | `M0`–`M11` (cross-cutting) | Enforce Future/Deferral Language Discipline (`AGENTS.md`, `14-METHODOLOGY.md`), maintain `tracking/future-language-audit.md`, and require same-change overlay mapping for accepted deferrals. |
| External implementation repo drift / weak code navigation | Separate code repos can drift from canonical decisions or become hard for humans/LLMs to navigate without aligned `AGENTS.md` and `CODE-INDEX.md` files | `M0`, then all implementation milestones | Use `M0.OPS.EXTERNAL_CODE_REPO_BOOTSTRAP_AND_NAVIGATION_TEMPLATES`, require external repo bootstrap artifacts before claiming design alignment, and update templates when subsystem boundaries or expected routing patterns change. |
| Moderation capability coupling (e.g., chat sanctions unintentionally breaking votes/pings) | Poorly scoped restrictions damage match integrity and create support friction, especially in competitive modes | `M7`, `M11` | Preserve capability-scoped moderation controls (`Mute`/`Block`/`Avoid`/`Report` split, granular restrictions) and test sanctions against critical lobby/match flows; see BAR moderation lesson mapping in dependency overlay. |
| Communication marker clutter / color-only beacon semantics | Pings/beacons/markers become noisy, inaccessible, or hard to review if appearance overrides outrun icon/type semantics and rate limits | `M7`, `M10`, `M11` | Keep D059 marker semantics icon/type-first, bound labels/colors/TTL/visibility via `M7.UX.D059_BEACONS_MARKERS_LABELS`, and preserve replay-safe metadata + non-color-only cues; see open-source comms-marker study mappings in the dependency overlay. |
| RTL support reduced to font coverage only | UI may render glyphs but still fail Arabic/Hebrew usability if BiDi/shaping/layout-direction rules, role-aware font fallback, and directional asset policies are not implemented/tested across runtime, comms, and SDK surfaces | `M6`, `M7`, `M9`, `M10`, `M11` | Track and validate the explicit RTL/BiDi clusters (`M6.UX.RTL_BIDI_GAME_UI_BASELINE`, `M7.UX.D059_RTL_CHAT_MARKER_TEXT_SAFETY`, `M9.SDK.RTL_BASIC_EDITOR_UI_LAYOUT`, `M10.SDK.RTL_BIDI_LOCALIZATION_WORKBENCH_PREVIEW`) and fold final platform consistency checks into `M11.PLAT.BROWSER_MOBILE_POLISH`; use `research/rtl-bidi-open-source-implementation-study.md` as the confirmatory baseline for shaping/BiDi/fallback/layout test emphasis. |
| Pathfinding API exposure drift (ad hoc script queries bypassing conformance/perf boundaries) | Convenience APIs can become hidden hot-path liabilities or deterministic hazards if not bounded/documented | `M2`, `M5`, `M8` | Keep `D013/D045` conformance-first discipline and only expose bounded, documented estimate/path-preview APIs with explicit authority/perf semantics. |
| Legacy/freeware C&C mirror rights ambiguity | “Freeware” wording can be misread as blanket Workshop redistribution permission, creating legal and trust risk | `M0`, `M8`, `M9` | Treat as explicit policy gate (`M0.OPS.FREEWARE_CONTENT_MIRROR_POLICY_GATE` / `PG.LEGAL.CNC_FREEWARE_MIRROR_RIGHTS_POLICY`), keep D069 owned-install import (incl. Remastered) as the default onboarding path, and require provenance/takedown policy before any mirror packages ship. |
| Workshop operator/admin tooling debt | Strong package/distribution design can still fail operationally if ingest, verify, quarantine, and rollback workflows remain shell-only | `M8`, `M9`, `M11` | Phase operator surfaces explicitly (`M8.OPS.WORKSHOP_OPERATOR_PANEL_MINIMAL` -> `M9.OPS.WORKSHOP_ADMIN_PANEL_FULL`) with RBAC and audit-log requirements tied to D049/D037 validation. |
| Media language metadata drift / unlabeled machine-translated captions | Players can select unsupported dubs/subtitles or misread quality/trust if Workshop packages omit accurate `Audio`/`Subs`/`CC` coverage and translation-source labels | `M6`, `M9`, `M11` | Validate D068 fallback chains against D049 language capability metadata (`M9.UX.D049_MEDIA_LANGUAGE_CAPABILITY_METADATA_FILTERS`), require trust/coverage labeling in Installed Content Manager and Workshop listings, and keep machine-translated subtitle/CC fallback opt-in/labeled via `M11.UX.D068_MACHINE_TRANSLATED_SUBTITLE_CC_FALLBACK`. |
| D070 pacing-layer overload (too many agenda lanes/timers or reward snowballing in "one more phase" missions) | Can make asymmetric missions feel noisy, grindy, or snowball-heavy instead of strategically compelling | `M10`, `M11` | Keep `M10.GAME.D070_OPERATIONAL_MOMENTUM` optional/prototype-first, cap foreground milestones, use bounded/timed rewards, and require playtest evidence before promoting as a recommended preset. |
| “Editor before runtime” temptation | High rework risk if visual editor semantics outrun runtime schemas/validation contracts | `M3`, `M8`, `M9` | Allow CLI/tooling early (`M8`), defer full D038 visual SDK/editor to `M9+`. |
| Testing infrastructure gap | No CI/CD pipeline spec until now; features could ship without automated verification, risking regression debt | `M0`–`M11` (cross-cutting) | Follow `src/tracking/testing-strategy.md` tier definitions; enforce PR gate from M0; add nightly fuzz/bench from M2; weekly full suite from M9. |
| Type-safety enforcement gap | Bare integer IDs, non-deterministic `HashSet`/`HashMap` in ic-sim, and missing typestate patterns can cause hard-to-find logic bugs | `M1`–`M4` (critical path) | Enforce `clippy::disallowed_types` from M1, newtype policy from first crate, typestate for all state machines; see `02-ARCHITECTURE.md` § Type-Safety Architectural Invariants. |
| Security audit findings (V46–V56) | 11 new vulnerabilities identified covering display name spoofing, key rotation, package signing, WASM isolation, anti-cheat calibration, and desync classification | `M3`–`M9` | Each vulnerability has explicit phase assignments in `06-SECURITY.md`; track as exit criteria for their respective phases. |
| Author package signing adoption | Workshop trust model depends on author-level Ed25519 signing (V49); without it, registry is single point of trust for package authenticity | `M8`, `M9` | Author signing is an M8 exit criterion; key pinning is M9; author key rotation uses V47 protocol. |

## Pending Decisions / External Gates

| Gate | Type | Needs Resolution By | Affects | Current Handling in Overlay |
| --- | --- | --- | --- | --- |
| ~~`P002` Fixed-point scale~~ | **Resolved** | — | D009, D013, D015, D045 | Resolved: 1024 scale factor. See `research/fixed-point-math-design.md`. |
| ~~`P003` Audio library + music integration~~ | **Resolved** | — | Audio/EVA/music implementation | Resolved: Kira via `bevy_kira_audio`. See `research/audio-library-music-integration-design.md`. |
| ~~`P004` Lobby/matchmaking wire details~~ | **Resolved** | — | D052/D055/D059/D060 integration details | Resolved: complete CBOR wire protocol. See `research/lobby-matchmaking-wire-protocol-design.md`. |
| Legal entity formation | External/policy gate | Before public server infra | Community servers, Workshop, ranked ops | Modeled as `policy_gate` for `M7`/`M9`; tracked in dependency map. |
| DMCA designated agent registration | External/policy gate | Before accepting user uploads | Workshop moderation/takedown process | Modeled as `policy_gate` for Workshop production-readiness. |
| Trademark registration (optional) | External/policy (optional) | Before broad commercialization/branding push | Community/platform polish (`M11`) | Not a blocker for core engine milestones; track as optional ops item. |

## Maintenance Rules (How to update this page)

1. **Do not replace `src/08-ROADMAP.md`.** Update roadmap timing/deliverables there; update this page only for execution overlay, dependency, and status mapping.
2. **When a new decision is added to `src/09-DECISIONS.md`, add a row here in the same change set.** Default to `Design Status = Decisioned`, `Code Status = NotStarted`, `Validation = SpecReview` until proven otherwise.
3. **When a new feature is added (even without a new `Dxxx`), update the execution overlay in the same change set.** Add/update a feature-cluster entry in `tracking/milestone-dependency-map.md` with milestone placement and dependencies; then reflect the impact here if milestone snapshot/coverage/risk changes.
4. **Do not append features “for later sorting.”** Place new work in the correct milestone and sequence position immediately based on dependencies and project priorities.
5. **When a decision is revised across multiple docs, re-check its `Design Status`.** Upgrade to `Integrated` only when cross-doc propagation is complete; use `Audited` for explicit contradiction/dependency audits.
6. **Do not use percentages by default.** Use evidence-linked statuses instead.
7. **Do not mark code progress without evidence.** If `Code Status != NotStarted`, add evidence links (implementation repo path, test result, demo notes, etc.).
8. **After editing `src/08-ROADMAP.md`, `src/17-PLAYER-FLOW.md`, `src/11-OPENRA-FEATURES.md`, or introducing a major feature proposal, revisit `tracking/milestone-dependency-map.md`.** These are the main inputs to feature-cluster coverage and milestone ordering.
9. **If new non-indexed `D0xx` references appear, normalize the decision index in the same planning pass.** The tracker is Dxxx-index keyed by design.
10. **Use this page for “where are we / what next?”; use the dependency map for “what blocks what?”** Do not overload one page with both levels of detail.
11. **If a research/source study changes implementation emphasis or risk posture, link it here or in the dependency map mappings** so the insight affects execution planning and not just historical research notes.
12. **If canonical docs add or revise future/deferred wording, classify and resolve it in the same change set.** Update `tracking/future-language-audit.md`, and map accepted work into the overlay (or mark proposal-only / `Pxxx`) before considering the wording complete.
13. **If a separate implementation repo is created, bootstrap it with aligned navigation/governance docs before treating it as design-aligned.** Use `tracking/external-project-agents-template.md` for the repo `AGENTS.md` and `tracking/source-code-index-template.md` for `CODE-INDEX.md`; follow `tracking/external-code-project-bootstrap.md`.

### New Feature Intake Checklist (Execution Overlay)

Before a feature is treated as "planned" (beyond brainstorming), do all of the following:

1. **Classify priority** (`P-Core`, `P-Differentiator`, `P-Creator`, `P-Scale`, `P-Optional`).
2. **Assign primary milestone** (`M0–M11`) using dependency-first sequencing (not novelty/recency).
3. **Record dependency edges** in `tracking/milestone-dependency-map.md` (`hard`, `soft`, `validation`, `policy`, `integration`).
4. **Map canonical docs** (decision(s), roadmap phase, UX/security/community docs if affected).
5. **Update tracker representation**:
   - Dxxx row (if decisioned), and/or
   - feature-cluster row (if non-decision feature/deliverable)
6. **Check milestone displacement risk** (does this delay a higher-priority critical-path milestone?).
7. **Mark optional/experimental status explicitly** so it does not silently creep into core milestones.
8. **Classify future/deferred wording** you add (`PlannedDeferral`, `NorthStarVision`, `VersioningEvolution`, or exempt context) and update `tracking/future-language-audit.md` for canonical-doc changes.
9. **If the feature affects implementation-repo routing or expected code layout, update the external bootstrap/template docs** (`tracking/external-code-project-bootstrap.md`, `tracking/external-project-agents-template.md`, `tracking/source-code-index-template.md`) in the same planning pass.

## Related Pages

- [`08-ROADMAP.md`](08-ROADMAP.md) — canonical phase roadmap
- [`tracking/milestone-dependency-map.md`](tracking/milestone-dependency-map.md) — detailed milestone DAG and feature cluster dependencies
- [`tracking/project-tracker-schema.md`](tracking/project-tracker-schema.md) — optional automation companion (tracker field meanings + schema/YAML reference)
- [`tracking/future-language-audit.md`](tracking/future-language-audit.md) — canonical-doc future/deferred wording classification and remediation queue
- [`tracking/deferral-wording-patterns.md`](tracking/deferral-wording-patterns.md) — replacement wording patterns for planned deferrals / North Star claims / proposal-only notes
- [`tracking/external-code-project-bootstrap.md`](tracking/external-code-project-bootstrap.md) — bootstrap procedure for external implementation repos (design alignment + escalation workflow)
- [`tracking/external-project-agents-template.md`](tracking/external-project-agents-template.md) — `AGENTS.md` template for external code repos that implement this design
- [`tracking/source-code-index-template.md`](tracking/source-code-index-template.md) — `CODE-INDEX.md` template for human + LLM code navigation
