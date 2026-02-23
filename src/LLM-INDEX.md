# LLM / RAG Retrieval Index

This page is a **retrieval-oriented map** of the design docs for agentic LLM use (RAG, assistants, copilots, review bots).

It is not a replacement for the main docs. It exists to improve:

- retrieval precision
- token efficiency
- canonical-source selection
- conflict resolution across overlapping chapters

---

## Purpose

The mdBook is written for humans first, but many questions (especially design reviews) are now answered by agents that retrieve chunks of documentation. This index defines:

- which documents are **canonical** for which topics
- which documents are **supporting / illustrative**
- how to chunk and rank content for lower token cost
- how to avoid mixing roadmap ideas with accepted decisions

---

## Canonical Source Priority (Use This Order)

When multiple docs mention the same topic, agents should prefer sources in this order unless the user specifically asks for roadmap or UX examples:

1. **Decision docs (`src/decisions/*.md`)** — normative design choices, tradeoffs, accepted defaults
2. **Core architecture / netcode / modding / security / performance chapters** (`02`–`06`, `10`) — system-level design details and implementation constraints
3. **Player Flow (`17-PLAYER-FLOW.md`)** — UX flows, screen layouts, examples, mock UI
4. **Roadmap (`08-ROADMAP.md`)** — phase timing and sequencing (not normative runtime behavior)
5. **Research docs (`research/*.md`)** — prior art, evidence, input to decisions (not final policy by themselves)

If conflict exists between a decision doc and a non-decision doc, prefer the decision doc and call out the inconsistency.

---

## Doc Roles (RAG Routing)

| Doc Class | Primary Role | Use For | Avoid As Sole Source For |
| --- | --- | --- | --- |
| `src/decisions/*.md` | Normative decisions | "What did we decide?", constraints, defaults, alternatives | Concrete UI layout examples unless the decision itself defines them |
| `src/02-ARCHITECTURE.md` | Cross-cutting architecture | crate boundaries, invariants, trait seams, platform abstraction | Feature-specific UX policy |
| `src/03-NETCODE.md` | Netcode architecture & behavior | protocol flow, relay behavior, reconnection, desync/debugging | Product prioritization/phasing |
| `src/04-MODDING.md` | Creator/runtime modding system | CLI, DX workflows, mod packaging, campaign/export concepts | Canonical acceptance of a disputed feature (check decisions) |
| `src/06-SECURITY.md` | Threat model & trust boundaries | ranked trust, attack surfaces, operational constraints | UI/UX behavior unless security-gating is the point |
| `src/10-PERFORMANCE.md` | Perf philosophy & budgets | targets, hot-path rules, compatibility tiers | Final UX/publishing behavior |
| `src/17-PLAYER-FLOW.md` | UX navigation & mock screens | menus, flows, settings surfaces, example panels | Core architecture invariants |
| `src/18-PROJECT-TRACKER.md` + `src/tracking/*.md` | Execution planning overlay | implementation order, dependency DAG, milestone status, “what next?”, ticket breakdown templates | Canonical runtime behavior or roadmap timing (use decisions/architecture + `08-ROADMAP.md`) |
| `src/08-ROADMAP.md` | Phasing | "when", not "what" | Current runtime behavior/spec guarantees |

---

## Topic-to-Canonical Source Map

| Topic | Primary Source(s) | Secondary Source(s) | Notes |
| --- | --- | --- | --- |
| Engine invariants / crate boundaries | `src/02-ARCHITECTURE.md`, `src/decisions/09a-foundation.md` | `AGENTS.md` | `AGENTS.md` is operational guidance for agents; design docs remain canonical for public spec wording |
| Netcode model / relay / sub-tick / reconnection | `src/03-NETCODE.md`, `src/decisions/09b-networking.md` | `src/06-SECURITY.md` | Use `06-SECURITY.md` to resolve ranked/trust/security policy questions |
| Modding tiers (YAML/Lua/WASM) / export / compatibility | `src/04-MODDING.md`, `src/decisions/09c-modding.md` | `src/07-CROSS-ENGINE.md` | `09c` is canonical for accepted decisions |
| Workshop / packages / CAS / profiles / selective install | `src/decisions/09e-community.md`, `src/decisions/09c-modding.md` | `src/17-PLAYER-FLOW.md` | D068 (selective install) is in `09c`; D049 CAS in `09e` |
| Scenario editor / asset studio / SDK UX | `src/decisions/09f-tools.md` | `src/17-PLAYER-FLOW.md`, `src/04-MODDING.md` | `17` has mock screens/examples; `09f` is normative |
| In-game controls / mobile UX / chat / voice / tutorial | `src/decisions/09g-interaction.md` | `src/17-PLAYER-FLOW.md`, `src/02-ARCHITECTURE.md`, `research/open-source-rts-communication-markers-study.md` | `17` shows surfaces; `09g` defines interaction rules; use the research note for prior-art communication/beacon/marker UX rationale only |
| Campaign structure / persistent state / cutscene flow | `src/modding/campaigns.md`, `src/decisions/09f-tools.md` | `src/04-MODDING.md`, `src/17-PLAYER-FLOW.md` | `modding/campaigns.md` is the detailed D021 runtime/schema spec; use `17` for player-facing transition examples |
| Performance budgets / low-end hardware support | `src/10-PERFORMANCE.md`, `src/decisions/09a-foundation.md` | `src/02-ARCHITECTURE.md` | `10` is canonical for targets and compatibility tiers |
| Philosophy / methodology / design process | `src/13-PHILOSOPHY.md`, `src/14-METHODOLOGY.md` | `research/*.md` (e.g., `research/mobile-rts-ux-onboarding-community-platform-analysis.md`, `research/rts-2026-trend-scan.md`, `research/bar-recoil-source-study.md`, `research/open-source-rts-communication-markers-study.md`) | Use for "is this aligned?" reviews, source-study takeaways, and inspiration filtering |
| Implementation planning / milestone dependencies / project standing | `src/18-PROJECT-TRACKER.md`, `src/tracking/milestone-dependency-map.md` | `src/08-ROADMAP.md`, `src/09-DECISIONS.md`, `src/17-PLAYER-FLOW.md` | Tracker is an execution overlay: use it for ordering/status; roadmap remains canonical for phase timing |
| Ticket breakdown / work-package template for `G*` steps | `src/tracking/implementation-ticket-template.md` | `src/18-PROJECT-TRACKER.md`, `src/tracking/milestone-dependency-map.md` | Use for implementation handoff/work packages after features are mapped into the overlay |
| Future/deferral wording audit / "is this planned or vague?" | `src/tracking/future-language-audit.md`, `src/tracking/deferral-wording-patterns.md` | `src/18-PROJECT-TRACKER.md`, `src/14-METHODOLOGY.md`, `AGENTS.md` | Use for classifying future-facing wording and converting vague prose into planned deferrals / North Star claims |

---

## Retrieval Rules (Token-Efficient Defaults)

### Chunking Strategy

- Chunk by **ATX headings** (`###` / `####`) rather than file-level or `##`-only blocks
- Include heading path metadata, e.g.:
  - `09g-interaction.md > D065 > Layer 3 > Controls Walkthrough`
- Include decision IDs detected in the chunk (e.g., `D065`, `D068`)
- Tag each chunk with doc class: `decision`, `architecture`, `ux-flow`, `roadmap`, `research`

### Chunk Size

- Preferred: **300–900 tokens**
- Allow larger chunks for code blocks/tables that lose meaning when split
- Overlap: **50–120 tokens**

### Ranking Heuristics

- Prefer decision docs for normative questions ("should", "must", "decided")
- Prefer `src/18-PROJECT-TRACKER.md` + `src/tracking/milestone-dependency-map.md` for “what next?”, dependency-order, and implementation sequencing questions
- Prefer `src/tracking/implementation-ticket-template.md` when the user asks for implementer task breakdowns or ticket-ready work packages tied to `G*` steps
- Prefer `src/tracking/future-language-audit.md` + `src/tracking/deferral-wording-patterns.md` for reviews of vague future wording, deferral placement, and North Star claim formatting
- Prefer `17-PLAYER-FLOW.md` for UI layout / screen wording questions
- Prefer `08-ROADMAP.md` only for "when / phase" questions
- Prefer research docs only when the question is "why this prior art?" or "what did we learn from X?"

### Conflict Handling

If retrieved chunks disagree:

1. Prefer the newer **revision-noted** decision text
2. Prefer decision docs over non-decision docs
3. Prefer security/netcode docs for trust/authority behavior
4. State the conflict explicitly and cite both locations

---

## High-Cost Docs (Split Priorities for Future Refactor)

These are accurate but expensive if chunking is coarse. Splitting them by decision (or sub-topic files) gives the biggest RAG win.

| Priority | File | Why It’s Expensive | Refactor Direction |
| --- | --- | --- | --- |
| 1 | `src/decisions/09f-tools.md` | `D016` and `D038` are very large multi-topic decisions | Split into one file per decision (`D016`, `D038`, `D040`, etc.) |
| 1 | `src/decisions/09g-interaction.md` | `D058`, `D059`, `D065` are each >1k lines | Split by decision; preserve shared interaction index page |
| 1 | `src/decisions/09b-networking.md` | `D052` is large and dense | Split `D052`, `D055`, `D060` into separate files |
| 2 | `src/decisions/09e-community.md` | Many 500–700 line decisions in one file | Split by decision; keep `09e` as overview |
| 2 | `src/decisions/09d-gameplay.md` | Multiple long decisions mixed with different concerns | Split by decision, especially `D019`, `D043`, `D048` |

---

## Decision Capsule Standard (Pointer)

For better RAG summaries and lower retrieval cost, add a short **Decision Capsule** near the top of each decision (or decision file).

Template:

- `src/decisions/DECISION-CAPSULE-TEMPLATE.md`

Capsules should summarize:

- decision
- status
- canonical scope
- defaults / non-goals
- affected docs
- revision note summary

This gives agents a cheap "first-pass answer" before pulling the full decision body.

---

## Practical Query Tips (for Agents and Humans)

- Include decision IDs when known (`D068 selective install`, `D065 tutorial`)
- Include doc role keywords (`decision`, `player flow`, `roadmap`) to improve ranking
- For behavior + UI questions, retrieve both:
  - decision doc chunk (normative)
  - `17-PLAYER-FLOW.md` chunk (surface/example)

Examples:

- `D068 cutscene variant packs AI Enhanced presentation fingerprint`
- `D065 controls walkthrough touch phone tablet semantic prompts`
- `D008 sub-tick timestamp normalization relay canonical order`
