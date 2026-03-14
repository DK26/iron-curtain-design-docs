# 14 — Development Methodology

> How Iron Curtain moves from design docs to a playable game — the meta-process that governs everything from research through release.

## Purpose of This Chapter

The other design docs say **what** we're building ([01-VISION](01-VISION.md), [02-ARCHITECTURE](02-ARCHITECTURE.md)), **why** decisions were made ([09-DECISIONS](09-DECISIONS.md) and its sub-documents, [13-PHILOSOPHY](13-PHILOSOPHY.md)), and **when** things ship ([08-ROADMAP](08-ROADMAP.md)). This chapter says **how we get there** — the methodology that turns 13 design documents into a working engine.

**When to read this chapter:**
- You're starting work on a new phase and need to know the process
- You're an agent (human or AI) about to write code and need to understand the workflow
- You're planning which tasks to tackle next within a phase
- You need to understand how isolated development, integration, and community feedback fit together

**When NOT to read this chapter:**
- You need architecture specifics → [02-ARCHITECTURE.md](02-ARCHITECTURE.md)
- You need performance guidance → [10-PERFORMANCE.md](10-PERFORMANCE.md)
- You need the phase timeline → [08-ROADMAP.md](08-ROADMAP.md)
- You need coding rules for agents → see [Stage 6](#stage-6-coding-guidelines-for-agents) below, plus `AGENTS.md` § "Working With This Codebase"

---

## The Eight Stages

Development follows eight stages. They're roughly sequential, but later stages feed back into earlier ones — implementation teaches us things that update the design.

```
┌──────────────────────┐
│ 1. Research          │ ◀────────────────────────────────────────┐
│    & Document        │                                          │
└──────────┬───────────┘                                          │
           ▼                                                      │
┌──────────────────────┐                                          │
│ 2. Architectural     │                                          │
│    Blueprint         │                                          │
└──────────┬───────────┘                                          │
           ▼                                                      │
┌──────────────────────┐                                          │
│ 3. Delivery          │                                          │
│    Sequence (MVP)    │                                          │
└──────────┬───────────┘                                          │
           ▼                                                      │
┌──────────────────────┐                                          │
│ 4. Dependency        │                                          │
│    Analysis          │                                          │
└──────────┬───────────┘                                          │
           ▼                                                      │
┌──────────────────────┐                                          │
│ 5. Context-Bounded   │                                          │
│    Work Units        │                                          │
└──────────┬───────────┘                                   ┌──────┴──────┐
           ▼                                               │ 8. Design   │
┌──────────────────────┐                                   │ Evolution   │
│ 6. Coding Guidelines │                                   └──────┬──────┘
│    for Agents        │                                          ▲
└──────────┬───────────┘                                          │
           ▼                                                      │
┌──────────────────────┐                                          │
│ 7. Integration       │──────────────────────────────────────────┘
│    & Validation      │
└──────────────────────┘
```

---

## Stage 1: Research & Document

> Explore every idea. Study prior art. Write it down.

**What this produces:** Design documents (this book), research analyses, decision records.

**Process:**
- Study the original EA source code, OpenRA architecture, and other RTS engines (see `AGENTS.md` § "Reference Material")
- Identify community pain points from OpenRA's issue tracker, Reddit, Discord, modder feedback (see [01-VISION](01-VISION.md) § "Community Pain Points")
- For every significant design question, explore alternatives, pick one, document the rationale in the appropriate [decisions sub-document](09-DECISIONS.md)
- Capture lessons from the original C&C creators and other game development veterans (see [13-PHILOSOPHY](13-PHILOSOPHY.md) and `research/westwood-ea-development-philosophy.md`)
- Research is concurrent with other work in later stages — new questions arise during implementation
- Research is a **continuous discipline**, not a phase that ends. Every new prior art study can challenge assumptions, confirm patterns, or reveal gaps. The project's commit history shows active research throughout pre-development — not tapering early but intensifying as design maturity makes it easier to ask precise questions.

**Current status (February 2026):** The major architectural questions are answered across 14 design chapters, 76 indexed decisions, and 63 research analyses. Research continues as a parallel track — recent examples include AI implementation surveys across 7+ codebases, Stratagus/Stargus engine analysis, a transcript-backed RTS 2026 trend scan (`research/rts-2026-trend-scan.md`), a BAR/Recoil source-study (`research/bar-recoil-source-study.md`) used to refine creator-workflow and scripting-boundary implementation priorities, an open-source RTS communication/marker study (`research/open-source-rts-communication-markers-study.md`) used to harden D059 beacon/marker schema and `M7` communication UX priorities, an RTL/BiDi implementation study (`research/rtl-bidi-open-source-implementation-study.md`) used to harden localization directionality/font-fallback/shaping requirements across `M6`/`M7`/`M9`/`M10`, a Source SDK 2013 source study (`research/source-sdk-2013-source-study.md`) used to validate fixed-point determinism, safe parsing, capability tokens, typestate, and CI-from-day-one priorities, and a Generals/Zero Hour diagnostic tools study (`research/generals-zero-hour-diagnostic-tools-study.md`) used to refine the diagnostic overlay design with SAGE engine patterns (cushion metric, gross/net time, category-filtered world markers, tick-stepping). Each produces cross-references and actionable refinements. The shift is from *exploratory* research ("what should we build?") to *confirmatory* research ("does this prior art validate or challenge our approach?").

### Trend Scan Checklist (Videos, Listicles, Talks, Showcase Demos)

Use this checklist when the source is a **trend signal** (YouTube roundup, trailer breakdown, conference talk, showcase demo) rather than a primary technical source. The goal is to extract inspiration **without importing hype or scope creep**.

**1. Classify the source (signal quality)**
- Is it primary evidence (source code/docs/interview with concrete implementation details) or secondary commentary?
- What is it good for: player excitement signals, UX expectations, mode packaging expectations, aesthetic direction?
- What is it *not* good for: implementation claims, performance claims, netcode architecture claims?

**2. Extract recurring themes, not one-off hype moments**
- What patterns recur across multiple titles in the scan (campaign depth, co-op survival, hero systems, terrain spectacle, etc.)?
- Which themes are framed positively *and* which are repeatedly described as risky (scope creep, genre mashups, unfocused design)?

**3. Map each theme to IC using Fit / Risk / IC Action**
- `Fit`: high / medium / low with IC's invariants and current roadmap
- `Risk`: scope, UX complexity, perf/hardware impact, determinism impact, export-fidelity impact, community mismatch
- `IC Action`: core feature, optional module/template, experimental toggle, "not now", or "not planned"

**4. Apply philosophy gates before proposing changes**
- Does this solve a real community pain point or improve player/creator experience? ([13-PHILOSOPHY](13-PHILOSOPHY.md) — community first)
- Is it an optional layer or does it complicate the core flow?
- If it's experimental, is it explicitly labeled and reversible (preset/toggle/template) rather than becoming accidental default identity?

**5. Apply architecture/invariant gates**
- Does it preserve deterministic sim, crate boundaries, and existing trait seams?
- Does it require a parallel system where an existing system can be extended instead?
- Does it create platform obstacles (mobile, low-end hardware, browser, Deck)?

**6. Decide the right destination for the idea**
- `decision docs` (normative policy)
- `research note` (evidence only / inspiration filtering)
- `roadmap` (future consideration)
- `player flow` or `tools` docs (UI mock / optional template examples)

**7. Record limitations explicitly**
- If the source is a listicle/trailer, state that it is **trend signal only**
- Separate "interesting market signal" from "validated design direction"
- Note what still requires primary-source research or playtesting

**8. Propagate only what is justified**
- If the trend scan only confirms existing direction, update research/methodology references and stop
- If it creates a real design refinement, propagate across affected docs using Stage 5 discipline

**Output artifact (recommended):**
- A `research/*.md` note with:
  - source + retrieval method
  - scope and limitations
  - recurring signals
  - `Fit / Risk / IC Action` matrix
  - cross-references to affected IC docs

**Exit criteria:**
- Every major subsystem has a design doc section with component definitions, Rust struct signatures, and YAML examples
- Every significant alternative has been considered and the choice is documented in the appropriate [decisions sub-document](09-DECISIONS.md)
- The gap analysis against OpenRA ([11-OPENRA-FEATURES](11-OPENRA-FEATURES.md)) covers all ~700 traits with IC equivalents or explicit "not planned" decisions
- Community context is documented: who we're building for, what they actually want, what makes them switch (see [01-VISION](01-VISION.md) § "What Makes People Actually Switch")

---

## Stage 2: Architectural Blueprint

> Map the complete project — every crate, every trait, every data flow.

**What this produces:** The system map. What connects to what, where boundaries live, which traits abstract which concerns.

**Process:**
- Define crate boundaries with precision: which crate owns which types, which crate never imports from which other crate (see [02-ARCHITECTURE](02-ARCHITECTURE.md) § crate structure)
- Map every trait interface: `NetworkModel`, `Pathfinder`, `SpatialIndex`, `FogProvider`, `DamageResolver`, `AiStrategy`, `OrderValidator`, `RankingProvider`, `Renderable`, `InputSource`, `OrderCodec`, `GameModule`, etc. (see D041 in [decisions/09d-gameplay.md](decisions/09d-gameplay.md))
- Define the simulation system pipeline — fixed order, documented dependencies between systems (see [02-ARCHITECTURE](02-ARCHITECTURE.md) § "System Pipeline")
- Map data flow: `PlayerOrder` → `ic-protocol` → `NetworkModel` → `TickOrders` → `Simulation::apply_tick()` → state hash → snapshot
- Identify every point where a game module plugs in (see D018 `GameModule` trait)

**The blueprint is NOT code.** It's the map that makes code possible. When two developers (or agents) work on different crates, the blueprint tells them exactly what the interface between their work looks like — before either writes a line.

**Relationship to Stage 1:** Stage 1 produces the ideas and decisions. Stage 2 organizes them into a coherent technical map. Stage 1 asks "should pathfinding be trait-abstracted?" Stage 2 says "the `Pathfinder` trait lives in `ic-sim`, `IcPathfinder` (multi-layer hybrid) is the RA1 `GameModule` implementation, the engine core calls `pathfinder.request_path()` and never algorithm-specific functions directly."

**Exit criteria:**
- Every crate's public API surface is sketched (trait signatures, key structs, module structure)
- Every cross-crate dependency is documented and justified
- The `GameModule` trait is complete — it captures everything that varies between game modules
- A developer can look at the blueprint and know exactly where a new feature belongs — which crate, which system in the pipeline, which trait it implements or extends

---

## Stage 3: Delivery Sequence (MVP Releases)

> Plan releases so there's something playable at every milestone. The community sees progress, not promises.

**What this produces:** A release plan where each cycle ships a playable prototype that improves on the last.

**The MVP principle:** Every release cycle produces something a community member can download, run, and react to. Not "the pathfinding crate compiles" — "you can load a map and watch units move." Not "the lobby protocol is defined" — "you can play a game against someone over the internet." Each release is a superset of the previous one.

**Process:**
- Start from the roadmap phases ([08-ROADMAP](08-ROADMAP.md)) — these define the major capability milestones
- Within each phase, identify the smallest slice that produces a visible, testable result
- Prioritize features that make the game *feel real* early — rendering a map with units matters more than optimizing the spatial hash
- Front-load the hardest unknowns: deterministic simulation, networking, format compatibility. If these are wrong, we want to know at month 6, not month 24
- Every release gets a community feedback window before the next cycle begins

**Release sequence (maps to roadmap phases):**

| Release      | What's Playable                 | Community Can...                                                                         |
| ------------ | ------------------------------- | ---------------------------------------------------------------------------------------- |
| **Phase 0**  | CLI tools, format inspection    | Verify their .mix/.shp/.pal files load correctly, file bug reports for format edge cases |
| **Phase 1**  | Visual map viewer               | See their OpenRA maps rendered by the IC engine, compare visual fidelity                 |
| **Phase 2**  | Headless sim + replay viewer    | Watch a pre-recorded game play back, verify unit behavior looks right                    |
| **Phase 3**  | First playable skirmish (vs AI) | Actually *play* — sidebar, build queue, units, combat. This is the big one.              |
| **Phase 4**  | Campaign missions, scripting    | Play through RA campaign missions, create Lua-scripted scenarios                         |
| **Phase 5**  | Online multiplayer              | Play against other people. This is where retention starts.                               |
| **Phase 6a** | Mod tools + scenario editor     | Create and publish mods. The community starts building.                                  |
| **Phase 6b** | Campaign editor, game modes     | Create campaigns, custom game modes, co-op scenarios                                     |
| **Phase 7**  | LLM features, ecosystem         | Generate missions, full visual modding pipeline, polish                                  |

**The Phase 3 moment is critical.** That's when the project goes from "interesting tech demo" to "thing I want to play." Everything before Phase 3 builds toward that moment. Everything after Phase 3 builds on the trust it creates.

**Exit criteria:**
- Each phase has a concrete "what the player sees" description (not just a feature list)
- Dependencies between phases are explicit — no phase starts until its predecessors' exit criteria are met
- The community has a clear picture of what's coming and when

---

## Stage 4: Dependency Analysis

> What blocks what? What can run in parallel? What's the critical path?

**What this produces:** A dependency graph that tells you which work must happen in which order, and which work can happen simultaneously.

**Why this matters:** A 36-month project with 11 crates has hundreds of potential tasks. Without dependency analysis, you either serialize everything (slow) or parallelize carelessly (integration nightmares). The dependency graph is the tool that finds the sweet spot.

**Process:**
- For each deliverable in each phase, identify:
  - **Hard dependencies:** What must exist before this can start? (e.g., `ic-sim` must exist before `ic-net` can test against it)
  - **Soft dependencies:** What would be nice to have but isn't blocking? (e.g., the scenario editor is easier to build if the renderer exists, but the editor's data model can be designed independently)
  - **Test dependencies:** What does this need to be *tested*? (e.g., the `Pathfinder` trait can be defined without a map, but testing it requires at least a stub map)
- Identify the **critical path** — the longest chain of hard dependencies that determines minimum project duration
- Identify **parallel tracks** — work that has no dependency on each other and can proceed simultaneously

**Example dependency chains:**

```
Critical path (sim-first):
  ra-formats → ic-sim (needs parsed rules) → ic-net (needs sim to test against)
                                            → ic-render (needs sim state to draw)
                                            → ic-ai (needs sim to run AI against)

Parallel tracks (can proceed alongside sim work):
  ic-ui (chrome layout, widget system — stubbed data)
  ic-editor (editor framework, UI — stubbed scenario data)
  ic-audio (format loading, playback — independent)
  research (ongoing — netcode analysis, community feedback)
```

**Key insight:** The simulation (`ic-sim`) is on almost every critical path. Getting it right early — and getting it testable in isolation — is the single most important scheduling decision.

### Execution Overlay Tracker (Design vs Code Status)

To keep long-horizon planning actionable, IC maintains a **milestone/dependency overlay** and **project tracker** alongside the canonical roadmap:

- [`18-PROJECT-TRACKER.md`](18-PROJECT-TRACKER.md) — execution milestone snapshot + Dxxx-granular status tracking
- [`tracking/milestone-dependency-map.md`](tracking/milestone-dependency-map.md) — detailed DAG and feature-cluster dependencies

This overlay does **not** replace [`08-ROADMAP.md`](08-ROADMAP.md). The roadmap stays canonical for phase timing and major deliverables; the tracker exists to answer “what blocks what?” and “what should we build next?”

The tracker uses a **split status model**:

- **Design Status** (spec maturity/integration/audit state)
- **Code Status** (implementation progress)

This avoids the common pre-implementation failure mode where a richly designed feature is mistakenly reported as “implemented.” Code status changes require evidence links (repo paths, tests, demos, ops notes), while design status can advance through documentation integration and audit work.

**Tracker integration gate (mandatory for new features):**
- A feature is not “integrated into the plan” just because it appears in a decision doc or player-flow mock.
- In the same planning pass, it must be mapped into the execution overlay with:
  - milestone position (`M0–M11`)
  - priority class (`P-Core` / `P-Differentiator` / `P-Creator` / `P-Scale` / `P-Optional`)
  - dependency edges (`hard`, `soft`, `validation`, `policy`, `integration`) where relevant
  - tracker representation (Dxxx row and/or feature cluster entry)
- If this mapping is missing, the feature remains an idea/proposal, not scheduled work.

**External implementation repo bootstrap gate (mandatory before code execution starts in a new repo):**
- If implementation work moves into a separate source-code repository, bootstrap it with:
  - a local `AGENTS.md` aligned to the canonical design docs (`src/tracking/external-project-agents-template.md`)
  - a code navigation index (`CODE-INDEX.md`) aligned to milestone/`G*` work (`src/tracking/source-code-index-template.md`)
- Do not treat the external repo as design-aligned until it has:
  - canonical design-doc links/version pin
  - no-silent-divergence rules
  - design-gap escalation workflow
  - code ownership/boundary navigation map
- Use `src/tracking/external-code-project-bootstrap.md` as the setup procedure and checklist.

**Future/deferral language gate (mandatory for canonical docs):**
- Future-facing design statements must be classified as one of: `PlannedDeferral`, `NorthStarVision`, `VersioningEvolution`, or an explicitly non-planning context (narrative example, historical quote, legal phrase).
- Ambiguous future wording ("could add later", "future convenience", "deferred" without placement/reason) is not acceptable in canonical docs.
- If a future-facing item is accepted work, map it in the execution overlay in the same planning pass (`18-PROJECT-TRACKER.md` + `tracking/milestone-dependency-map.md`).
- If the item cannot yet be placed, convert it into either:
  - a **proposal-only** note (not scheduled), or
  - a **Pending Decision (`Pxxx`)** with the missing decision clearly stated.
- Use `src/tracking/future-language-audit.md` for repo-wide audit/remediation tracking and `src/tracking/deferral-wording-patterns.md` for replacement wording examples.
- Quick audit inventory command (canonical docs): `rg -n "\\bfuture\\b|\\blater\\b|\\bdefer(?:red)?\\b|\\beventually\\b|\\bTBD\\b|\\bnice-to-have\\b" src README.md AGENTS.md --glob '!research/**'`

**Testing strategy gate (mandatory for all implementation milestones):**
- Every design feature must map to at least one automated test in `src/tracking/testing-strategy.md`.
- CI pipeline tiers (PR gate, post-merge, nightly, weekly) define when each test category runs.
- New features must specify which test tier covers them and what the exit criteria are.
- Performance benchmarks, fuzz targets, and anti-cheat calibration datasets are defined in the testing strategy and must be updated when new attack surfaces or performance-sensitive code paths are added.

**Exit criteria:**
- Every task has its dependencies identified (hard, soft, test)
- The critical path is documented
- Parallel tracks are identified — work that can proceed without waiting
- No task is scheduled before its hard dependencies are met

---

## Stage 5: Context-Bounded Work Units

> Decompose work into tasks that can be completed in isolation — without polluting an agent's context window.

**What this produces:** Precise, self-contained task definitions that a developer (human or AI agent) can pick up and complete without needing the entire project in their head.

**Why this matters for agentic development:** An AI agent has a finite context window. If completing a task requires understanding 14 design docs, 11 crates, and 42 decisions simultaneously, the agent will produce worse results — it's working at the edge of its capacity. If the task is scoped so the agent needs exactly one design doc section, one crate's public API, and one or two decisions, the agent produces precise, correct work.

This isn't just an AI constraint — it's a software engineering principle. Fred Brooks called it "information hiding." The less an implementer needs to know about the rest of the system, the better their work on their piece will be.

**Process:**

1. **Define the context boundary.** For each task, list exactly what the implementer needs to know:
   - Which crate(s) are touched
   - Which trait interfaces are involved
   - Which design doc sections are relevant
   - What the inputs and outputs look like
   - What "done" means (test criteria)

2. **Minimize cross-crate work.** A good work unit touches one crate. If a task requires changes to two crates, split it: define the trait interface first (one task), then implement it (another task). The trait definition is the handshake between the two.

3. **Stub at the boundaries.** Each work unit should be testable with stubs/mocks at its boundary. The `Pathfinder` implementation doesn't need a real renderer — it needs a test map and an assertion about the path it produces. The `NetworkModel` implementation doesn't need a real sim — it needs a test order stream and assertions about delivery timing.

4. **Write task specifications.** Each work unit gets a spec:
   ```
   Task: Implement IcPathfinder (Pathfinder trait for RA1)
   Crate: ic-sim
   Reads: 02-ARCHITECTURE.md § "Pathfinding", 10-PERFORMANCE.md § "Multi-Layer Hybrid", research/pathfinding-ic-default-design.md
   Trait: Pathfinder (defined in ic-sim)
   Inputs: map grid, start position, goal position
   Outputs: Vec<WorldPos> path, or PathError
   Test: pathfinding_tests.rs — 12 test cases (open field, wall, chokepoint, unreachable, ...)
   Does NOT touch: ic-render, ic-net, ic-ui, ic-editor
   ```

5. **Order by dependency.** Trait definitions before implementations. Shared types (`ic-protocol`) before consumers (`ic-sim`, `ic-net`). Foundation crates before application crates.

**Example decomposition for Phase 2 (Simulation):**

| #   | Work Unit                                             | Crate         | Context Needed                                                 | Depends On             |
| --- | ----------------------------------------------------- | ------------- | -------------------------------------------------------------- | ---------------------- |
| 1   | Define `PlayerOrder` enum + serialization             | `ic-protocol` | 02-ARCHITECTURE § orders, 05-FORMATS § order types             | Phase 0 (format types) |
| 2   | Define `Pathfinder` trait                             | `ic-sim`      | 02-ARCHITECTURE § pathfinding, D013, D041                      | —                      |
| 3   | Define `SpatialIndex` trait                           | `ic-sim`      | 02-ARCHITECTURE § spatial queries, D041                        | —                      |
| 4   | Implement `SpatialHash` (SpatialIndex for RA1)        | `ic-sim`      | 10-PERFORMANCE § spatial hash                                  | #3                     |
| 5   | Implement `IcPathfinder` (Pathfinder for RA1)         | `ic-sim`      | 10-PERFORMANCE § pathfinding, pathfinding-ic-default-design.md | #2, #4                 |
| 6   | Define sim system pipeline (apply_orders through fog) | `ic-sim`      | 02-ARCHITECTURE § system pipeline                              | #1                     |
| 7   | Implement movement system                             | `ic-sim`      | 02-ARCHITECTURE § movement, RA1 movement rules                 | #5, #6                 |
| 8   | Implement combat system                               | `ic-sim`      | 02-ARCHITECTURE § combat, `DamageResolver` trait (D041)        | #4, #6                 |
| 9   | Implement harvesting system                           | `ic-sim`      | 02-ARCHITECTURE § harvesting                                   | #5, #6                 |
| 10  | Implement `LocalNetwork`                              | `ic-net`      | 03-NETCODE § LocalNetwork                                      | #1                     |
| 11  | Implement `ReplayPlayback`                            | `ic-net`      | 03-NETCODE § ReplayPlayback                                    | #1                     |
| 12  | State hashing + snapshot system                       | `ic-sim`      | 02-ARCHITECTURE § snapshots, D010                              | #6                     |

Work units 2, 3, and 10 have no dependencies on each other — they can proceed in parallel. Work unit 7 depends on 5 and 6 — it cannot start until both are done. This is the scheduling discipline that prevents chaos.

### Documentation Work Units

The context-bounded discipline applies equally to design work — not just code. During the design phase, work units are research and documentation tasks that follow the same principles: bounded context, clear inputs/outputs, explicit dependencies.

**Example decomposition for a research integration task:**

| #   | Work Unit                                      | Scope                              | Context Needed                                 | Depends On |
| --- | ---------------------------------------------- | ---------------------------------- | ---------------------------------------------- | ---------- |
| 1   | Research Stratagus/Stargus engine architecture | `research/`                        | GitHub repos, AGENTS.md § Reference Material   | —          |
| 2   | Create research document with findings         | `research/`                        | Notes from #1                                  | #1         |
| 3   | Extract lessons applicable to IC AI system     | `decisions/09d/D043-ai-presets.md` | Research doc from #2, D043 section             | #2         |
| 4   | Update modding docs with Lua AI primitives     | `src/04-MODDING.md`                | Research doc from #2, existing Lua API section | #2         |
| 5   | Update security docs with Lua stdlib policy    | `src/06-SECURITY.md`               | Research doc from #2, existing sandbox section | #2         |
| 6   | Update AGENTS.md reference material            | `AGENTS.md`                        | Research doc from #2                           | #2         |

Work units 3–6 are independent of each other (can proceed in parallel) but all depend on #2. This is the same dependency logic as code work units — applied to documentation.

**The key discipline:** A documentation work unit that touches more than 2-3 files is probably too broad. "Update all design docs with Stratagus findings" is not a good work unit. "Update D043 cross-references with Stratagus evidence" is.

### Cross-Cutting Propagation

Some changes are inherently cross-cutting — a new decision like D034 (SQLite storage) or D041 (trait-abstracted subsystems) affects architecture, roadmap, modding, security, and other docs. When this happens:

1. **Identify all affected documents first.** Before editing anything, search for every reference to the topic across all docs. Use the decision ID, related keywords, and affected crate names.
2. **Make a checklist.** List every file that needs updating and what specifically changes in each.
3. **Update in one pass.** Don't edit three files today and discover two more tomorrow. The checklist prevents this.
4. **Verify cross-references.** After all edits, confirm that every cross-reference between docs is consistent — section names match, decision IDs are correct, phase numbers align.

The project's commit history shows this pattern repeatedly: a single concept (LLM integration, SQLite storage, platform-agnostic design) propagated across 5–8 files in one commit. The discipline is in the completeness of the propagation, not in the scope of the change.

**Exit criteria:**
- Every deliverable in the current phase is decomposed into work units
- Each work unit has a context boundary spec (crate/scope, reads, inputs, outputs, verification)
- No work unit requires more than 2-3 design doc sections to understand
- Dependencies between work units are explicit
- Cross-cutting changes have a propagation checklist before any edits begin

---

## Stage 6: Coding Guidelines for Agents

> Rules for how code gets written — whether the writer is a human or an AI agent.

**What this produces:** A set of constraints that ensure consistent, correct, reviewable code regardless of who writes it.

The full agent rules live in `AGENTS.md` § "Working With This Codebase." This section covers the principles; `AGENTS.md` has the specifics.

### General Rules

1. **Read `AGENTS.md` first.** Always. It's the single source of truth for architectural invariants, crate boundaries, settled decisions, and prohibited actions.

2. **Respect crate boundaries.** `ic-sim` never imports from `ic-net`. The `ic-net` **library crate** (`RelayCore`, `NetworkModel` trait) never imports from `ic-sim`. They share only `ic-protocol`. `ic-server` is a top-level binary that may depend on both (D074). `ic-game` never imports from `ic-editor`. If your change requires a cross-boundary library import, the design is wrong — add a trait to the shared boundary instead.

3. **No floats in `ic-sim`.** Fixed-point only (`i32`/`i64`). This is invariant #1. If you need fractional math in the simulation, use the fixed-point scale (P002).

4. **Every public type in `ic-sim` derives `Serialize, Deserialize`.** Snapshots and replays depend on this.

5. **System execution order is fixed and documented.** Adding a new system to the pipeline requires deciding where in the order it runs *and* documenting why it goes there. See [02-ARCHITECTURE](02-ARCHITECTURE.md) § "System Pipeline."

6. **Tests before integration.** Every work unit ships with tests that verify it in isolation. Integration happens in Stage 7, not during implementation.

7. **Idiomatic Rust.** `clippy` and `rustfmt` clean. Zero-allocation patterns in hot paths. `Vec::clear()` over `Vec::new()`. See [10-PERFORMANCE](10-PERFORMANCE.md) § efficiency pyramid.

8. **Data belongs in YAML, not code.** If a modder would want to change it, it's a data value, not a constant. Weapon damage, unit speed, build time, cost — all YAML. See principle #4 in [13-PHILOSOPHY](13-PHILOSOPHY.md).

### Agent-Specific Rules

9. **Never commit or push.** Agents edit files; the maintainer reviews, commits, and pushes. A commit is a human decision.

10. **Never run `mdbook build` or `mdbook serve`.** The book is built manually when the maintainer decides.

11. **Verify claims before stating them.** Don't say "OpenRA stutters at 300 units" unless you've benchmarked it. Don't say "Phase 2 is complete" unless every exit criterion is met. See `AGENTS.md` § "Mistakes to Never Repeat."

12. **Use future tense for unbuilt features.** Nothing is implemented until it is. "The engine will load .mix files" — not "the engine loads .mix files."

13. **When a change touches multiple files, update all of them in one pass.** `AGENTS.md`, `SUMMARY.md`, `00-INDEX.md`, design docs, roadmap — whatever references the thing you're changing. Don't leave stale cross-references.

14. **One work unit at a time.** Complete the current task, verify it, then move to the next. Don't start three work units and leave all of them half-done.

---


---

## Sub-Pages

| Section                                 | Topic                                                                                                                                                                      | File                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Integration, Evolution & Research Rigor | Stages 7-8 (Integration/Validation, Design Evolution), stage-to-phase mapping, research-design-refine cycle, methodology principles, research rigor and AI-assisted design | [research-rigor.md](methodology/research-rigor.md) |
