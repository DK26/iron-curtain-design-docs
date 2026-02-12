# 14 — Development Methodology

> How Iron Curtain moves from design docs to a playable game — the meta-process that governs everything from research through release.

## Purpose of This Chapter

The other design docs say **what** we're building ([01-VISION](01-VISION.md), [02-ARCHITECTURE](02-ARCHITECTURE.md)), **why** decisions were made ([09-DECISIONS](09-DECISIONS.md), [13-PHILOSOPHY](13-PHILOSOPHY.md)), and **when** things ship ([08-ROADMAP](08-ROADMAP.md)). This chapter says **how we get there** — the methodology that turns 13 design documents into a working engine.

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
- For every significant design question, explore alternatives, pick one, document the rationale in [09-DECISIONS](09-DECISIONS.md)
- Capture lessons from the original C&C creators and other game development veterans (see [13-PHILOSOPHY](13-PHILOSOPHY.md) and `research/westwood-ea-development-philosophy.md`)
- Research is concurrent with other work in later stages — new questions arise during implementation

**Current status (February 2026):** Largely complete. 13 design chapters, 42 decisions, 11 research analyses. The major architectural questions are answered. Remaining research happens on-demand as implementation reveals new questions.

**Exit criteria:**
- Every major subsystem has a design doc section with component definitions, Rust struct signatures, and YAML examples
- Every significant alternative has been considered and the choice is documented in [09-DECISIONS](09-DECISIONS.md)
- The gap analysis against OpenRA ([11-OPENRA-FEATURES](11-OPENRA-FEATURES.md)) covers all ~700 traits with IC equivalents or explicit "not planned" decisions
- Community context is documented: who we're building for, what they actually want, what makes them switch (see [01-VISION](01-VISION.md) § "What Makes People Actually Switch")

---

## Stage 2: Architectural Blueprint

> Map the complete project — every crate, every trait, every data flow.

**What this produces:** The system map. What connects to what, where boundaries live, which traits abstract which concerns.

**Process:**
- Define crate boundaries with precision: which crate owns which types, which crate never imports from which other crate (see [02-ARCHITECTURE](02-ARCHITECTURE.md) § crate structure)
- Map every trait interface: `NetworkModel`, `Pathfinder`, `SpatialIndex`, `FogProvider`, `DamageResolver`, `AiStrategy`, `OrderValidator`, `RankingProvider`, `Renderable`, `InputSource`, `OrderCodec`, `GameModule`, etc. (see D041 in [09-DECISIONS](09-DECISIONS.md))
- Define the simulation system pipeline — fixed order, documented dependencies between systems (see [02-ARCHITECTURE](02-ARCHITECTURE.md) § "System Pipeline")
- Map data flow: `PlayerOrder` → `ic-protocol` → `NetworkModel` → `TickOrders` → `Simulation::apply_tick()` → state hash → snapshot
- Identify every point where a game module plugs in (see D018 `GameModule` trait)

**The blueprint is NOT code.** It's the map that makes code possible. When two developers (or agents) work on different crates, the blueprint tells them exactly what the interface between their work looks like — before either writes a line.

**Relationship to Stage 1:** Stage 1 produces the ideas and decisions. Stage 2 organizes them into a coherent technical map. Stage 1 asks "should pathfinding be trait-abstracted?" Stage 2 says "the `Pathfinder` trait lives in `ic-sim`, grid flowfields are the RA1 `GameModule` implementation, the engine core calls `pathfinder.find_path()` and never `grid_flowfield_find_path()` directly."

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
   Task: Implement GridFlowfield (Pathfinder trait for RA1)
   Crate: ic-sim
   Reads: 02-ARCHITECTURE.md § "Pathfinding", 10-PERFORMANCE.md § "Flowfields"
   Trait: Pathfinder (defined in ic-sim)
   Inputs: map grid, start position, goal position
   Outputs: Vec<WorldPos> path, or PathError
   Test: pathfinding_tests.rs — 12 test cases (open field, wall, chokepoint, unreachable, ...)
   Does NOT touch: ic-render, ic-net, ic-ui, ic-editor
   ```

5. **Order by dependency.** Trait definitions before implementations. Shared types (`ic-protocol`) before consumers (`ic-sim`, `ic-net`). Foundation crates before application crates.

**Example decomposition for Phase 2 (Simulation):**

| #   | Work Unit                                             | Crate         | Context Needed                                          | Depends On             |
| --- | ----------------------------------------------------- | ------------- | ------------------------------------------------------- | ---------------------- |
| 1   | Define `PlayerOrder` enum + serialization             | `ic-protocol` | 02-ARCHITECTURE § orders, 05-FORMATS § order types      | Phase 0 (format types) |
| 2   | Define `Pathfinder` trait                             | `ic-sim`      | 02-ARCHITECTURE § pathfinding, D013, D041               | —                      |
| 3   | Define `SpatialIndex` trait                           | `ic-sim`      | 02-ARCHITECTURE § spatial queries, D041                 | —                      |
| 4   | Implement `SpatialHash` (SpatialIndex for RA1)        | `ic-sim`      | 10-PERFORMANCE § spatial hash                           | #3                     |
| 5   | Implement `GridFlowfield` (Pathfinder for RA1)        | `ic-sim`      | 10-PERFORMANCE § flowfields                             | #2, #4                 |
| 6   | Define sim system pipeline (apply_orders through fog) | `ic-sim`      | 02-ARCHITECTURE § system pipeline                       | #1                     |
| 7   | Implement movement system                             | `ic-sim`      | 02-ARCHITECTURE § movement, RA1 movement rules          | #5, #6                 |
| 8   | Implement combat system                               | `ic-sim`      | 02-ARCHITECTURE § combat, `DamageResolver` trait (D041) | #4, #6                 |
| 9   | Implement harvesting system                           | `ic-sim`      | 02-ARCHITECTURE § harvesting                            | #5, #6                 |
| 10  | Implement `LocalNetwork`                              | `ic-net`      | 03-NETCODE § LocalNetwork                               | #1                     |
| 11  | Implement `ReplayPlayback`                            | `ic-net`      | 03-NETCODE § ReplayPlayback                             | #1                     |
| 12  | State hashing + snapshot system                       | `ic-sim`      | 02-ARCHITECTURE § snapshots, D010                       | #6                     |

Work units 2, 3, and 10 have no dependencies on each other — they can proceed in parallel. Work unit 7 depends on 5 and 6 — it cannot start until both are done. This is the scheduling discipline that prevents chaos.

**Exit criteria:**
- Every deliverable in the current phase is decomposed into work units
- Each work unit has a context boundary spec (crate, reads, trait, inputs, outputs, tests, does-not-touch)
- No work unit requires more than 2-3 design doc sections to understand
- Dependencies between work units are explicit

---

## Stage 6: Coding Guidelines for Agents

> Rules for how code gets written — whether the writer is a human or an AI agent.

**What this produces:** A set of constraints that ensure consistent, correct, reviewable code regardless of who writes it.

The full agent rules live in `AGENTS.md` § "Working With This Codebase." This section covers the principles; `AGENTS.md` has the specifics.

### General Rules

1. **Read `AGENTS.md` first.** Always. It's the single source of truth for architectural invariants, crate boundaries, settled decisions, and prohibited actions.

2. **Respect crate boundaries.** `ic-sim` never imports from `ic-net`. `ic-net` never imports from `ic-sim`. They share only `ic-protocol`. `ic-game` never imports from `ic-editor`. If your change requires a cross-boundary import, the design is wrong — add a trait to the shared boundary instead.

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

## Stage 7: Integration & Validation

> How isolated pieces come together. Where bugs live. Where the community weighs in.

**What this produces:** A working, tested system from individually-developed components — plus community validation that we're building the right thing.

**The integration problem:** Stages 4–6 optimize for isolation. That's correct for development quality, but isolation creates a risk: the pieces might not fit together. Stage 7 is where we find out.

**Process:**

### Technical Integration

1. **Interface verification.** Before integrating two components, verify that the trait interface between them matches expectations. The `Pathfinder` trait that `ic-sim` calls must match the `GridFlowfield` that implements it — not just in type signature, but in behavioral contract (does it handle unreachable goals? does it respect terrain cost?).

2. **Integration tests.** These are different from unit tests. Unit tests verify a component in isolation. Integration tests verify that two or more components work together correctly:
   - Sim + LocalNetwork: orders go in, state comes out, hashes match
   - Sim + ReplayPlayback: replay file produces identical state sequence
   - Sim + Renderer: state changes produce correct visual updates
   - Sim + AI: AI generates valid orders, sim accepts them

3. **Desync testing.** Run the same game on two instances with the same orders. Compare state hashes every tick. Any divergence is a determinism bug. This is the most critical integration test — it validates invariant #1.

4. **Performance integration.** Individual components may meet their performance targets in isolation but degrade when combined (cache thrashing, unexpected allocation, scheduling contention). Profile the integrated system, not just the parts.

### Community Validation

5. **Release the MVP.** At the end of each phase, ship what's playable (see Stage 3 release table). Make it easy to download and run.

6. **Collect feedback.** Not just "does it work?" but "does it feel right?" The community knows what RA should feel like. If unit movement feels wrong, pathfinding is wrong — regardless of what the unit tests say. See Philosophy principle #2: "Fun beats documentation."

7. **Triage feedback into three buckets:**
   - **Fix now:** Bugs, crashes, format compatibility failures. If someone's .mix file doesn't load, that blocks everything (invariant #8).
   - **Fix this phase:** Behavior that's wrong but not crashing. Unit speed feels off, build times are weird, UI is confusing.
   - **Defer:** Feature requests, nice-to-haves, things that belong in a later phase. Acknowledge them, log them, don't act on them yet.

8. **Update the roadmap.** Community feedback may reveal that our priorities are wrong. If everyone says "the sidebar is unusable" and we planned to polish it in Phase 6, pull it forward. The roadmap serves the game, not the other way around.

**Exit criteria (per phase):**
- All integration tests pass
- Desync test produces zero divergence over 10,000 ticks
- Performance meets the targets in [10-PERFORMANCE](10-PERFORMANCE.md) for the current phase's scope
- Community feedback is collected, triaged, and incorporated into the next phase's plan
- Known issues are documented — not hidden, not ignored

---

## Stage 8: Design Evolution

> The design docs are alive. Implementation teaches us things. Update accordingly.

**What this produces:** Design documents that stay accurate as the project evolves — not frozen artifacts from before we wrote any code.

**The problem:** A design doc written before implementation is a hypothesis. Implementation tests that hypothesis. Sometimes the hypothesis is wrong. When that happens, the design doc must change — not the code.

**Process:**

1. **When implementation contradicts the design, investigate.** Sometimes the implementation is wrong (bug). Sometimes the design is wrong (bad assumption). Sometimes both need adjustment. Don't reflexively change either one — understand *why* they disagree first.

2. **Update the design doc in the same pass as the code change.** If you change how the damage pipeline works, update [02-ARCHITECTURE](02-ARCHITECTURE.md) § damage pipeline, [09-DECISIONS](09-DECISIONS.md) § D028, and `AGENTS.md`. Don't leave stale documentation for the next person to discover.

3. **Log design changes in `09-DECISIONS.md`.** If a decision changes, don't silently edit it. Add a note: "Revised from X to Y because implementation revealed Z." The decision log is a history, not just a current snapshot.

4. **Community feedback triggers design review.** If the community consistently reports that a design choice doesn't work in practice, that's data. Evaluate it against the philosophy principles, and if the design is wrong, update it. See [13-PHILOSOPHY](13-PHILOSOPHY.md) principle #2: "Fun beats documentation — if it's in the doc but plays poorly, cut it."

5. **Never silently promise something the code can't deliver.** If a design doc describes a feature that hasn't been built yet, it must use future tense. If a feature was cut or descoped, the doc must say so explicitly. Silence implies completeness — and that makes silence a lie.

**What triggers design evolution:**
- Implementation reveals a better approach than what was planned
- Performance profiling shows an algorithm choice doesn't meet targets
- Community feedback identifies a pain point the design didn't anticipate
- A new decision (D043, D044, ...) changes assumptions that earlier decisions relied on
- A pending decision (P002, P003, ...) gets resolved and affects other sections

**Exit criteria:** There is no exit. Design evolution is continuous. The docs are accurate on every commit.

---

## How the Stages Map to Roadmap Phases

The eight stages aren't "do Stage 1, then Stage 2, then never touch Stage 1 again." They repeat at different scales:

| Roadmap Phase            | Primary Stages Active     | What's Happening                                                        |
| ------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| Pre-development (now)    | 1, 2, 3                   | Research, blueprint, delivery planning                                  |
| Phase 0 start            | 4, 5, 6                   | Dependency analysis, work unit decomposition, coding rules established  |
| Phase 0 development      | 5, 6, 7                   | Work units executed, integrated, first community release (format tools) |
| Phase 1–2 development    | 5, 6, 7, 8                | Core engine work, continuous integration, design docs evolve            |
| Phase 3 (first playable) | 5, 6, 7, 8                | The big community moment — heavy feedback, heavy design evolution       |
| Phase 4+                 | 5, 6, 7, 8, (1 on-demand) | Ongoing development cycle with occasional new research                  |

Stage 1 (research) never fully stops — new questions arise throughout development. But its intensity peaks before Phase 0 and tapers. Stage 8 (design evolution) intensifies as implementation progresses and community feedback accumulates.

---

## Principles Underlying the Methodology

These aren't new principles — they're existing project principles applied to the development process itself.

1. **The community sees progress, not promises** (Philosophy #0). Every release cycle produces something playable. We never go dark for 6 months.

2. **Separate concerns** (Architecture invariant #1, #2). Crate boundaries exist so that work on one subsystem doesn't require understanding every other subsystem. The methodology enforces this through context-bounded work units.

3. **Data-driven everything** (Philosophy #4). The task spec for a work unit is data — crate, trait, inputs, outputs, tests. It's not a vague description; it's a structured definition that can be validated.

4. **Fun beats documentation** (Philosophy #2). If community feedback says the design is wrong, update the design. The docs serve the game, not the other way around.

5. **Scope to what you have** (Philosophy #7). Each phase focuses. Don't spread work across too many subsystems at once. Complete one thing excellently before starting the next.

6. **Make temporary compromises explicit** (Philosophy #8). If a Phase 2 implementation is "good enough for now," label it. Use `// TODO(phase-N): description` comments. Don't let shortcuts become permanent without a conscious decision.

7. **Efficiency-first** (Architecture invariant #5, [10-PERFORMANCE](10-PERFORMANCE.md)). This applies to the development process too — better methodology, clearer task specs, cleaner boundaries before "throw more agents at it."
