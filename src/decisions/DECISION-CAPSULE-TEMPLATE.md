# Decision Capsule Template (LLM / RAG Friendly)

Use this template near the top of a decision (or in a standalone decision file) to create a **cheap, high-signal summary** for humans and agentic retrieval systems.

**Placement (recommended):**

- Immediately after the `## D0xx: ...` heading
- After any `Revision note` line (if present)
- Before long rationale/examples/tables

This does not replace the full decision. It improves:

- retrieval precision
- token efficiency
- review speed
- conflict detection across docs

---

## Template

```md
### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted | Revised | Draft | Superseded
- **Phase:** Phase X (or "multi-phase"; note first ship phase)
- **Execution overlay mapping:** Primary milestone (`M#`), priority (`P-*`), key dependency notes (optional but recommended)
- **Deferred features / extensions:** (explicitly list and classify deferred follow-ons; use `none` if not applicable)
- **Deferral trigger:** (what evidence/milestone/dependency causes a deferred item to move forward)
- **Canonical for:** (what this decision is the primary source for)
- **Scope:** (crates/systems/docs affected)
- **Decision:** (1-3 sentence normative summary; include defaults)
- **Why:** (top reasons only; 3-5 bullets max)
- **Non-goals:** (what this decision explicitly does NOT do)
- **Out of current scope:** (what may be desirable but is intentionally not in this phase/milestone)
- **Invariants preserved:** (list relevant invariants/trait boundaries)
- **Defaults / UX behavior:** (player-facing defaults, optionality, gating)
- **Compatibility / Export impact:** (if applicable)
- **Security / Trust impact:** (if applicable)
- **Performance impact:** (if applicable)
- **Public interfaces / types / commands:** (only the key names)
- **Affected docs:** (paths that must remain aligned)
- **Revision note summary:** (if revised; what changed and why)
- **Keywords:** (retrieval terms / synonyms / common query phrases)
```

---

## Writing Rules (Keep It Useful)

- Write **normatively**, not narratively (`must`, `default`, `does not`)
- Keep it **short** (usually 10–16 bullets)
- Include **the default behavior** and **the main exception(s)**
- Include **non-goals** to prevent over-interpretation
- Include **execution overlay mapping** (or explicitly mark "TBD") so new decisions are easier to place in implementation order
- If using words like `future`, `later`, or `deferred`, classify them explicitly (planned deferral / north-star / versioning) and include the deferral trigger
- Use stable identifiers (`D068`, `NetworkModel`, `VirtualNamespace`, `Publish Readiness`)
- Avoid duplicating long examples or alternatives already in the body

If the decision is revised, keep the detailed revision note in the main decision body and summarize it here in one bullet.

---

## Minimal Example

```md
### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-22)
- **Phase:** Phase 6a (foundation), Phase 6b (advanced)
- **Canonical for:** SDK `Validate & Playtest` workflow and Git-first collaboration support
- **Scope:** `ic-editor`, `ic` CLI, `17-PLAYER-FLOW.md`, `04-MODDING.md`
- **Decision:** SDK uses `Preview / Test / Validate / Publish` as the primary flow. Git remains the only VCS; IC adds Git-friendly serialization and optional semantic helpers.
- **Why:** Low-friction UX, community familiarity, no parallel systems, better CI/automation support.
- **Non-goals:** Built-in commit/rebase UI, mandatory validation before preview/test.
- **Invariants preserved:** Sim/net boundary unchanged; SDK remains separate from game binary.
- **Defaults / UX behavior:** Validate is async and optional before preview/test; Publish runs Publish Readiness checks.
- **Public interfaces / types / commands:** `ic git setup`, `ic content diff`, `ValidationPreset`, `ValidationResult`
- **Affected docs:** `09f-tools.md`, `04-MODDING.md`, `17-PLAYER-FLOW.md`
- **Revision note summary:** Reframed earlier "Test Lab" into layered Validate & Playtest; moved advanced tooling to Advanced mode / CLI.
- **Keywords:** sdk validate, publish readiness, git-first, semantic diff, low-friction editor
```

---

## Adoption Plan (Incremental)

Apply this template first to the largest, most frequently queried decisions:

- `D038` (`src/decisions/09f-tools.md`)
- `D040` (`src/decisions/09f-tools.md`)
- `D052` (`src/decisions/09b-networking.md`)
- `D059` (`src/decisions/09g-interaction.md`)
- `D065` (`src/decisions/09g-interaction.md`)
- `D068` (`src/decisions/09c-modding.md`)

This gives the biggest RAG/token-efficiency gains before any file-splitting refactor.
