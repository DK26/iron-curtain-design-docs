## Stage 7: Integration & Validation

> How isolated pieces come together. Where bugs live. Where the community weighs in.

**What this produces:** A working, tested system from individually-developed components — plus community validation that we're building the right thing.

**The integration problem:** Stages 4–6 optimize for isolation. That's correct for development quality, but isolation creates a risk: the pieces might not fit together. Stage 7 is where we find out.

**Process:**

### Technical Integration

1. **Interface verification.** Before integrating two components, verify that the trait interface between them matches expectations. The `Pathfinder` trait that `ic-sim` calls must match the `IcPathfinder` that implements it — not just in type signature, but in behavioral contract (does it handle unreachable goals? does it respect terrain cost? does the multi-layer system degrade gracefully?).

2. **Integration tests.** These are different from unit tests. Unit tests verify a component in isolation. Integration tests verify that two or more components work together correctly:
   - Sim + LocalNetwork: orders go in, state comes out, hashes match
   - Sim + ReplayPlayback: replay file produces identical state sequence
   - Sim + ForeignReplayPlayback (D056): foreign replays complete without panics; order rejection rate and divergence tick tracked for regression
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

2. **Update the design doc in the same pass as the code change.** If you change how the damage pipeline works, update [02-ARCHITECTURE](02-ARCHITECTURE.md) § damage pipeline, [decisions/09c-modding.md](decisions/09c-modding.md) § D028, and `AGENTS.md`. Don't leave stale documentation for the next person to discover.

3. **Log design changes in the decisions sub-documents.** If a decision changes, don't silently edit it — find the decision in the appropriate sub-file via [09-DECISIONS.md](09-DECISIONS.md) and add a note: "Revised from X to Y because implementation revealed Z." The decision log is a history, not just a current snapshot.

4. **If implementation diverges from the original design, track it with full rationale — and open an issue.** The implementation repo must locally document why it chose to diverge (in code comments, a design-gap tracking file, or both), and post a design-change issue in the design-doc repo with the complete rationale and proposed changes. See `src/tracking/external-code-project-bootstrap.md` § Design Change Escalation Workflow for the full process.

5. **Community feedback triggers design review.** If the community consistently reports that a design choice doesn't work in practice, that's data. Evaluate it against the philosophy principles, and if the design is wrong, update it. See [13-PHILOSOPHY](13-PHILOSOPHY.md) principle #2: "Fun beats documentation — if it's in the doc but plays poorly, cut it."

6. **Never silently promise something the code can't deliver.** If a design doc describes a feature that hasn't been built yet, it must use future tense. If a feature was cut or descoped, the doc must say so explicitly. Silence implies completeness — and that makes silence a lie.

**What triggers design evolution:**
- Implementation reveals a better approach than what was planned
- Performance profiling shows an algorithm choice doesn't meet targets
- Community feedback identifies a pain point the design didn't anticipate
- A new decision (D043, D044, ...) changes assumptions that earlier decisions relied on
- A pending decision (P002, P003, ...) gets resolved and affects other sections
- **Research integration** — a new prior art analysis reveals cross-project evidence that strengthens, challenges, or refines existing decisions (e.g., Stratagus analysis confirming D043's manager hierarchy across a 7th independent codebase, or revealing a Lua stdlib security pattern applicable to D005's sandbox)

**Exit criteria:** There is no exit. Design evolution is continuous. The docs are accurate on every commit.

---

## How the Stages Map to Roadmap Phases

The eight stages aren't "do Stage 1, then Stage 2, then never touch Stage 1 again." They repeat at different scales:

| Roadmap Phase            | Primary Stages Active    | What's Happening                                                                                                       |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Pre-development (now)    | 1, 2, 3, 8               | Research, blueprint, delivery planning — design evolution already active as research findings refine earlier decisions |
| Phase 0 start            | 1, 4, 5, 6               | Dependency analysis, work unit decomposition, coding rules — targeted research continues                               |
| Phase 0 development      | 5, 6, 7, 8               | Work units executed, integrated, first community release (format tools)                                                |
| Phase 1–2 development    | 5, 6, 7, 8, (1 targeted) | Core engine work, continuous integration, design docs evolve, research on specific unknowns                            |
| Phase 3 (first playable) | 5, 6, 7, 8, (1 targeted) | The big community moment — heavy feedback, heavy design evolution                                                      |
| Phase 4+                 | 5, 6, 7, 8, (1 targeted) | Ongoing development cycle with targeted research on new subsystems                                                     |

Stage 1 (research) never fully stops. The project's pre-development history demonstrates this: even after major architectural questions were answered, ongoing research (AI implementation surveys across 7 codebases, Stratagus engine analysis, Westwood development philosophy compilation) continued to produce actionable refinements to existing decisions. The shift is from breadth ("what should we build?") to depth ("does this prior art validate our approach?"). Stage 8 (design evolution) is active from the very first research cycle — not only after implementation begins.

---

## The Research-Design-Refine Cycle

> The repeatable micro-workflow that operates within the stages. This is the actual working pattern — observed across 80+ commits of pre-development work on this project and applicable to any design-heavy endeavor.

The eight stages above describe the macro structure — the project-level phases. But within those stages, the dominant working pattern is a smaller, repeatable cycle:

```
┌─────────────────────────┐
│ 1. Identify a question  │ "What can we learn from Stratagus's AI system?"
└──────────┬──────────────┘ "How should Lua sandboxing work?"
           ▼                "What does the security model for Workshop look like?"
┌─────────────────────────┐
│ 2. Research prior art   │  Read source code, docs, papers. Compare 3-7 projects.
└──────────┬──────────────┘  Take structured notes.
           ▼
┌─────────────────────────┐
│ 3. Document findings    │  Write a research document (research/*.md).
└──────────┬──────────────┘  Structured: overview, analysis, lessons, sources.
           ▼
┌─────────────────────────┐
│ 4. Extract decisions    │  "This confirms our manager hierarchy."
└──────────┬──────────────┘  "This adds a new precedent for stdlib policy."
           ▼                 "This reveals a gap we haven't addressed."
┌─────────────────────────┐
│ 5. Propagate across     │  Update AGENTS.md, decisions/*, architecture,
│    design docs          │  roadmap, modding, security — every affected doc.
└──────────┬──────────────┘  Use cross-cutting propagation discipline (Stage 5).
           ▼
┌─────────────────────────┐
│ 6. Review and refine    │  Re-read in context. Fix inconsistencies.
└─────────────────────────┘  Verify cross-references. Improve clarity.
   │
   └──▶ (New questions arise → back to step 1)
```

**This cycle maps to the stages:** Step 1-3 is Stage 1 (Research). Step 4 is Stage 2 (Blueprint refinement). Step 5 is Stage 8 (Design Evolution). Step 6 is quality discipline. The cycle is Stages 1→2→8 in miniature, repeated per topic.

**Observed cadence:** In this project's pre-development phase, the cycle typically completes in 1-3 work sessions. The research step is the longest; propagation is mechanical but must be thorough. A single cycle often spawns 1-2 new questions that start their own cycles.

**Why this matters for future projects:** This cycle is project-agnostic. Any design-heavy project — not just Iron Curtain — benefits from the discipline of:
- Researching before designing (don't reinvent what others have solved)
- Documenting research separately from decisions (research is evidence; decisions are conclusions)
- Propagating decisions systematically (a decision that only updates one file is a consistency bug waiting to happen)
- Treating refinement as a first-class work type (not "cleanup" — it's how design quality improves)

**Anti-patterns to avoid:**
- **Research without documentation.** If findings aren't written down, they're lost when context resets. The research document is the artifact.
- **Documentation without propagation.** A new finding that only updates the research file but not the design docs creates drift. The propagation step is non-optional.
- **Propagation without verification.** Updating 6 files but missing the 7th creates an inconsistency. The checklist discipline (Stage 5 § Cross-Cutting Propagation) prevents this.
- **Skipping the refinement step.** First-draft design text is hypothesis. Re-reading in context after propagation often reveals awkward phrasing, missing cross-references, or logical gaps.

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

8. **Research is a continuous discipline, not a phase** (observed pattern). The project's commit history shows research intensifying — not tapering — as design maturity enables more precise questions. New prior art analysis is never "too late" if it produces actionable refinements. Budget time for research throughout the project, not just at the start.

---

## Research Rigor & AI-Assisted Design

> This project uses LLM agents as research assistants and writing tools within a human-directed methodology. This section documents the actual process — because "AI-assisted" is frequently misunderstood as "AI-generated," and the difference matters.

### The Misconception

When people hear "built with AI assistance," they often imagine: someone typed a few prompts, an LLM produced some text, and that text was shipped as-is. If that were the process, the result would be shallow, inconsistent, and full of hallucinated claims. It would read like marketing copy, not engineering documentation.

That is not what happened here.

### What Actually Happened

Every design decision in this project followed a deliberate, multi-step process:

1. **The human identifies the question.** Not the LLM. The questions come from domain expertise, community knowledge, and architectural reasoning. "How should the Workshop handle P2P distribution?" is a question born from years of experience with modding communities, not a prompt template.

2. **Prior art is studied at the source code level.** Not summarized from blog posts. When this project says "Generals uses adaptive run-ahead," that claim was verified by reading the actual `FrameReadiness` enum in EA's GPL-licensed C++ source. When it says "IPFS has a 9-year-unresolved bandwidth limiting issue," the actual GitHub issue (#3065) was read, along with its 73 reactions and 67 comments. When it says "Minetest uses a LagPool for rate control," the Minetest source was examined.

3. **Findings are documented in structured research documents.** Each research analysis follows a consistent format: overview, architecture analysis, lessons applicable to IC, comparison with IC's approach, and source citations. These aren't LLM summaries — they're analytical documents where every claim traces to a specific codebase, issue, or commit.

4. **Decisions are extracted with alternatives and rationale.** Each of the 50 decisions in the decision log (D001–D050) records what was chosen, what alternatives were considered, and why. Many decisions evolved through multiple revision cycles as new research challenged initial assumptions.

5. **Findings are propagated across all affected documents.** A single research finding (e.g., "Stratagus confirms the manager hierarchy pattern for AI") doesn't just update one file — it's traced through every document that references the topic: architecture, decisions, roadmap, modding, security, methodology. The cross-cutting propagation discipline documented in Stage 5 of this chapter isn't theoretical — it's how every research integration actually works.

6. **The human reviews, verifies, and commits.** The maintainer reads every change, verifies factual claims, checks cross-references, and decides what ships. The LLM agent never commits — it proposes, the human approves. A commit is a human judgment that the content is correct.

### The Evidence: By the Numbers

The body of work speaks for itself:

| Metric                                            | Count                                                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design chapters                                   | 14 (Vision, Architecture, Netcode, Modding, Formats, Security, Cross-Engine, Roadmap, Decisions, Performance, OpenRA Features, Mod Migration, Philosophy, Methodology) |
| Standalone research documents                     | 19 (netcode analyses, AI surveys, pathfinding studies, security research, development philosophy, Workshop/P2P analysis)                                               |
| Total lines of structured documentation           | ~35,000                                                                                                                                                                |
| Recorded design decisions (D001–D050)             | 50                                                                                                                                                                     |
| Pending decisions with analysis                   | 6 (P001–P007, two resolved)                                                                                                                                            |
| Git commits (design iteration)                    | 100+                                                                                                                                                                   |
| Open-source codebases studied at source level     | 8+ (EA Red Alert, EA Remastered, EA Generals, EA Tiberian Dawn, OpenRA, OpenRA Mod SDK, Stratagus/Stargus, Chrono Divide)                                              |
| Additional projects studied for specific patterns | 12+ (Spring Engine, 0 A.D., MicroRTS, Veloren, Hypersomnia, OpenBW, DDNet, OpenTTD, Minetest, Lichess, Quake 3, Warzone 2100)                                          |
| Workshop/P2P platforms analyzed                   | 13+ (npm, Cargo, NuGet, PyPI, Nexus Mods, CurseForge, mod.io, Steam Workshop, ModDB, GameBanana, Uber Kraken, Dragonfly, IPFS)                                         |
| OpenRA traits mapped in gap analysis              | ~700                                                                                                                                                                   |
| Original creator quotes compiled and sourced      | 50+ (from Bostic, Sperry, Castle, Klepacki, Long, Legg, and other Westwood/EA veterans)                                                                                |
| Cross-system pattern analyses                     | 3 (netcode ↔ Workshop cross-pollination, AI extensibility across 7 codebases, pathfinding survey across 6 engines)                                                     |

This corpus wasn't generated in a single session. It was built iteratively over 100+ commits, with each commit refining, cross-referencing, and sometimes revising previous work. The decision log shows decisions that evolved through multiple revisions — D002 (Bevy) was originally "No Bevy" before research changed the conclusion. D043 (AI presets) grew from a simple paragraph to a multi-page design as each new codebase study (Spring Engine, 0 A.D., MicroRTS, Stratagus) added validated evidence.

### How the Human-Agent Relationship Works

The roles are distinct:

**The human (maintainer/architect) does:**
- Identifies which questions matter and in what order
- Decides which codebases and prior art to study
- Evaluates whether findings are accurate and relevant
- Makes every architectural decision — the LLM never decides
- Reviews all text for factual accuracy, tone, and consistency
- Commits changes only after verification
- Directs the overall vision and priorities
- Catches when the LLM is wrong, imprecise, or overconfident

**The LLM agent does:**
- Reads source code and documentation at scale (an LLM can process a 10,000-line codebase faster than a human)
- Searches for patterns across multiple codebases simultaneously
- Drafts structured analysis documents following established formats
- Propagates changes across multiple files (mechanical but error-prone if done manually)
- Maintains consistent cross-references across 35,000+ lines of documentation
- Produces initial drafts that the human refines

**What the LLM does NOT do:**
- Make architectural decisions
- Decide what to research next
- Ship anything without human review
- Determine project direction or priorities
- Evaluate whether a design is "good enough"
- Commit to the repository

The relationship is closer to an architect working with a highly capable research assistant than to someone using a text generator. The assistant can read faster, search broader, and draft more consistently — but the architect decides what to build, evaluates the research, and signs off on every deliverable.

### Why This Matters

Three reasons:

1. **Quality.** An LLM generating text without structured methodology produces plausible-sounding but shallow output. The same LLM operating within a rigorous process — where every claim is verified against source code, every decision has documented alternatives, and every cross-reference is maintained — produces documentation that matches or exceeds what a single human could produce in the same timeframe. The methodology is the quality control, not the model.

2. **Accountability.** Every claim in these design documents can be traced: which research document supports it, which source code was examined, which decision records the rationale. If a claim is wrong, the trail shows where the error entered. If a decision was revised, the log shows when and why. This auditability is a property of the process, not the tool.

3. **Reproducibility.** The Research-Design-Refine cycle documented in this chapter is a repeatable methodology. Another project could follow the same process — with or without an LLM — and produce similarly rigorous results. The LLM accelerates the process; it doesn't define it. The methodology works without AI assistance — it just takes longer.

### What We've Learned About AI-Assisted Design

Having used this methodology across 100+ iterations, some observations:

- **The constraining documents matter more than the prompts.** `AGENTS.md`, the architectural invariants, the crate boundaries, the "Mistakes to Never Repeat" list — these constrain what the LLM can produce. As the constraint set grows, the LLM's output quality improves because there are fewer ways to be wrong. This is the compounding effect described in the Foreword.

- **Research compounds.** Each research document makes subsequent research more productive. When studying Stratagus's AI system, having already analyzed Spring Engine, 0 A.D., and MicroRTS meant the agent could immediately compare findings against three prior analyses. By the time the Workshop P2P research was done (Kraken → Dragonfly → IPFS, three deep-dives in sequence), the pattern recognition was sharp enough to identify cross-pollination with the netcode design — a connection that wouldn't have been visible without the accumulated context.

- **The human's domain expertise is irreplaceable.** The LLM doesn't know that C&C LAN parties still happen. It doesn't know that the OFP mission editor was the most empowering creative tool of its era. It doesn't know that the feeling of tank treads crushing infantry is what makes Red Alert *Red Alert*. These intuitions direct the research and shape the decisions. The LLM is a tool; the vision is human.

- **Verification is non-negotiable.** The "Mistakes to Never Repeat" section in `AGENTS.md` exists because the LLM got things wrong — sometimes confidently. It claimed "design documents are complete" when they weren't. It used present tense for unbuilt features. It stated unverified performance numbers as fact. Each mistake was caught during review, corrected, and added to the constraint set so it wouldn't recur. The methodology assumes the LLM will make errors and builds in verification at every step.
