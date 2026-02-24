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

1. **Decision docs (`src/decisions/09*/D0XX-*.md`)** — normative design choices, tradeoffs, accepted defaults. Each decision is now a standalone file (e.g., `src/decisions/09b/D052-community-servers.md`). The parent `09b-networking.md` etc. are lightweight index pages.
2. **Core architecture / netcode / modding / security / performance chapters** (`02`–`06`, `10`) — system-level design details and implementation constraints
3. **Player Flow (`17-PLAYER-FLOW.md`)** — UX flows, screen layouts, examples, mock UI
4. **Roadmap (`08-ROADMAP.md`)** — phase timing and sequencing (not normative runtime behavior)
5. **Research docs (`research/*.md`)** — prior art, evidence, input to decisions (not final policy by themselves)

If conflict exists between a decision doc and a non-decision doc, prefer the decision doc and call out the inconsistency.

---

## Doc Roles (RAG Routing)

| Doc Class | Primary Role | Use For | Avoid As Sole Source For |
| --- | --- | --- | --- |
| `src/decisions/09*/D0XX-*.md` | Normative decisions (one file per decision) | "What did we decide?", constraints, defaults, alternatives | Concrete UI layout examples unless the decision itself defines them |
| `src/decisions/09b-networking.md` etc. | Decision index pages (routing only) | "Which decisions exist in this category?" — cheap first-pass routing | Full decision content (load the individual `D0XX-*.md` file instead) |
| `src/02-ARCHITECTURE.md` + `src/architecture/*.md` | Cross-cutting architecture (split by subsystem) | crate boundaries, invariants, trait seams, platform abstraction | Feature-specific UX policy |
| `src/03-NETCODE.md` | Netcode architecture & behavior | protocol flow, relay behavior, reconnection, desync/debugging | Product prioritization/phasing |
| `src/04-MODDING.md` | Creator/runtime modding system | CLI, DX workflows, mod packaging, campaign/export concepts | Canonical acceptance of a disputed feature (check decisions) |
| `src/06-SECURITY.md` | Threat model & trust boundaries | ranked trust, attack surfaces, operational constraints | UI/UX behavior unless security-gating is the point |
| `src/10-PERFORMANCE.md` | Perf philosophy & budgets | targets, hot-path rules, compatibility tiers | Final UX/publishing behavior |
| `src/17-PLAYER-FLOW.md` + `src/player-flow/*.md` | UX navigation & mock screens (split by screen) | menus, flows, settings surfaces, example panels | Core architecture invariants |
| `src/18-PROJECT-TRACKER.md` + `src/tracking/*.md` | Execution planning overlay | implementation order, dependency DAG, milestone status, “what next?”, ticket breakdown templates | Canonical runtime behavior or roadmap timing (use decisions/architecture + `08-ROADMAP.md`) |
| `src/08-ROADMAP.md` | Phasing | "when", not "what" | Current runtime behavior/spec guarantees |

---

## Topic-to-Canonical Source Map

| Topic | Primary Source(s) | Secondary Source(s) | Notes |
| --- | --- | --- | --- |
| Engine invariants / crate boundaries | `src/02-ARCHITECTURE.md`, `src/decisions/09a-foundation.md` | `AGENTS.md` | `AGENTS.md` is operational guidance for agents; design docs remain canonical for public spec wording |
| Netcode model / relay / sub-tick / reconnection | `src/03-NETCODE.md`, `src/decisions/09b/D052-community-servers.md`, `src/decisions/09b/D006-pluggable-net.md`, `src/decisions/09b/D008-sub-tick.md` | `src/06-SECURITY.md` | Use `06-SECURITY.md` to resolve ranked/trust/security policy questions. Index page: `09b-networking.md` |
| Modding tiers (YAML/Lua/WASM) / export / compatibility | `src/04-MODDING.md`, `src/decisions/09c-modding.md`, `src/decisions/09c/D023–D027` | `src/07-CROSS-ENGINE.md` | `09c` is canonical for accepted decisions; D023–D027 cover OpenRA compat (vocabulary aliases, Lua API, MiniYAML, mod manifest, enums) |
| Workshop / packages / CAS / profiles / selective install | `src/decisions/09e/D049-workshop-assets.md`, `src/decisions/09e/D030-workshop-registry.md`, `src/decisions/09c-modding.md` | `src/player-flow/workshop.md` | D068 (selective install) is in `09c`; D049 CAS in `09e/D049-workshop-assets.md` |
| Scenario editor / asset studio / SDK UX | `src/decisions/09f/D020-mod-sdk.md`, `src/decisions/09f/D038-scenario-editor.md`, `src/decisions/09f/D040-asset-studio.md` | `src/player-flow/sdk.md`, `src/04-MODDING.md` | D020 covers SDK architecture and creative workflow; D038/D040 are normative for individual editors; player-flow has mock screens |
| In-game controls / mobile UX / chat / voice / tutorial | `src/decisions/09g/D058-command-console.md`, `src/decisions/09g/D059-communication.md`, `src/decisions/09g/D065-tutorial.md` | `src/player-flow/in-game.md`, `src/02-ARCHITECTURE.md`, `research/open-source-rts-communication-markers-study.md`, `research/rtl-bidi-open-source-implementation-study.md` | Player-flow shows surfaces; `09g/D058-D065` define interaction rules; use the research notes for prior-art communication/beacon/marker UX and RTL/BiDi implementation rationale only |
| Localization / RTL / BiDi / font fallback | `src/02-ARCHITECTURE.md`, `src/decisions/09f/D038-scenario-editor.md`, `src/decisions/09g/D059-communication.md` | `src/player-flow/settings.md`, `src/tracking/rtl-bidi-qa-corpus.md`, `research/rtl-bidi-open-source-implementation-study.md` | Use architecture for shared text/layout contracts, `09f/D038` for authoring preview/validation, `09g/D059` for chat/marker safety split, the QA corpus for concrete test strings, and the research note for implementation-pattern rationale |
| Campaign structure / persistent state / cutscene flow | `src/modding/campaigns.md`, `src/decisions/09d/D021-branching-campaigns.md`, `src/decisions/09f/D016-llm-missions.md` | `src/04-MODDING.md`, `src/player-flow/single-player.md` | `modding/campaigns.md` is the detailed spec; D021 is the decision capsule; use player-flow for player-facing transition examples |
| Weather system / terrain surface effects | `src/decisions/09d/D022-dynamic-weather.md` | `src/04-MODDING.md` (§ Dynamic Weather), `src/architecture/gameplay-systems.md` | D022 is the decision capsule; 04-MODDING.md has full YAML examples and rendering strategies |
| Conditions / multipliers / damage pipeline | `src/decisions/09d/D028-conditions-multipliers.md` | `src/11-OPENRA-FEATURES.md` (§2–3), `src/architecture/gameplay-systems.md`, `src/04-MODDING.md` (§ Conditional Modifiers) | D028 covers condition system, multiplier stack, and conditional modifiers (Tier 1.5) |
| Cross-game components (mind control, carriers, shields, etc.) | `src/decisions/09d/D029-cross-game-components.md` | `src/12-MOD-MIGRATION.md` (§ Seven Built-In Systems), `src/08-ROADMAP.md` (Phase 2) | D029 defines the 7 first-party systems; mod-migration has case-study validation |
| Performance budgets / low-end hardware support | `src/10-PERFORMANCE.md`, `src/decisions/09a-foundation.md` | `src/02-ARCHITECTURE.md` | `10` is canonical for targets and compatibility tiers |
| Diagnostic overlay / net_graph / real-time observability / `/diag` | `src/10-PERFORMANCE.md` (§ Diagnostic Overlay & Real-Time Observability), `src/decisions/09g/D058-command-console.md` (D058 `/diag` commands) | `src/decisions/09e/D031-observability.md` (D031 telemetry data sources), `research/source-sdk-2013-source-study.md`, `research/generals-zero-hour-diagnostic-tools-study.md` | `10-PERFORMANCE.md` defines overlay levels, panels, and phasing; D058 defines console commands and cvars; D031 defines the telemetry data that feeds the overlay; Generals study refines cushion metric, gross/net time, world markers |
| Philosophy / methodology / design process | `src/13-PHILOSOPHY.md`, `src/14-METHODOLOGY.md` | `research/*.md` (e.g., `research/mobile-rts-ux-onboarding-community-platform-analysis.md`, `research/rts-2026-trend-scan.md`, `research/bar-recoil-source-study.md`, `research/bar-comprehensive-architecture-study.md`, `research/open-source-rts-communication-markers-study.md`, `research/rtl-bidi-open-source-implementation-study.md`, `research/source-sdk-2013-source-study.md`) | Use for "is this aligned?" reviews, source-study takeaways, and inspiration filtering. BAR comprehensive study covers engine/game split, synced/unsynced boundary, widget ecosystem, replay privacy, rating edge cases, and community infrastructure |
| Implementation planning / milestone dependencies / project standing | `src/18-PROJECT-TRACKER.md`, `src/tracking/milestone-dependency-map.md` | `src/08-ROADMAP.md`, `src/09-DECISIONS.md`, `src/17-PLAYER-FLOW.md` | Tracker is an execution overlay: use it for ordering/status; roadmap remains canonical for phase timing |
| Ticket breakdown / work-package template for `G*` steps | `src/tracking/implementation-ticket-template.md` | `src/18-PROJECT-TRACKER.md`, `src/tracking/milestone-dependency-map.md` | Use for implementation handoff/work packages after features are mapped into the overlay |
| Bootstrapping an external implementation repo to follow IC design docs | `src/tracking/external-code-project-bootstrap.md`, `src/tracking/external-project-agents-template.md` | `src/tracking/source-code-index-template.md`, `src/18-PROJECT-TRACKER.md`, `AGENTS.md` | Use when starting a separate code repo; includes no-silent-divergence and design-gap escalation workflow |
| Source code navigation index (`CODE-INDEX.md`) template for humans + LLMs | `src/tracking/source-code-index-template.md` | `src/tracking/external-code-project-bootstrap.md`, `src/tracking/implementation-ticket-template.md` | Use to create/maintain a codebase map with ownership, hot paths, boundaries, and task routing |
| Testing strategy, CI/CD pipeline, automated verification | `src/tracking/testing-strategy.md` | `src/06-SECURITY.md`, `src/10-PERFORMANCE.md`, `src/16-CODING-STANDARDS.md` | Use for "how is X tested?", CI gate definitions, fuzz targets, performance benchmarks, release criteria |
| Type-safety invariants, newtype policy, deterministic collections | `src/architecture/type-safety.md`, `src/16-CODING-STANDARDS.md` (§ Type-Safety Coding Standards) | `src/06-SECURITY.md` | Use for "what types enforce X?", clippy config, code review checklists for type safety |
| Future/deferral wording audit / "is this planned or vague?" | `src/tracking/future-language-audit.md`, `src/tracking/deferral-wording-patterns.md` | `src/18-PROJECT-TRACKER.md`, `src/14-METHODOLOGY.md`, `AGENTS.md` | Use for classifying future-facing wording and converting vague prose into planned deferrals / North Star claims |

---

## Retrieval Rules (Token-Efficient Defaults)

### Chunking Strategy

- Decision files are now one-per-decision — chunk at `###`/`####` level within each file
- Architecture and player-flow files are now one-per-subsystem/screen — chunk at `###`/`####` level within each file
- Include heading path metadata, e.g.:
  - `decisions/09g/D065-tutorial.md > Layer 3 > Controls Walkthrough`
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
- Prefer `src/tracking/external-code-project-bootstrap.md`, `src/tracking/external-project-agents-template.md`, and `src/tracking/source-code-index-template.md` when the user asks how to start a separate code repo that should follow these design docs
- Prefer `src/tracking/future-language-audit.md` + `src/tracking/deferral-wording-patterns.md` for reviews of vague future wording, deferral placement, and North Star claim formatting
- Prefer `src/tracking/testing-strategy.md` for CI/CD pipeline definitions, test tier assignments, fuzz targets, performance benchmarks, and release criteria
- Prefer `src/architecture/type-safety.md` + `src/16-CODING-STANDARDS.md` § Type-Safety Coding Standards for newtype policy, deterministic collection bans, typestate patterns, and clippy configuration
- Prefer `src/player-flow/*.md` (individual screen files) for UI layout / screen wording questions — use the index in `17-PLAYER-FLOW.md` to route to the right file
- Prefer `08-ROADMAP.md` only for "when / phase" questions
- Prefer research docs only when the question is "why this prior art?" or "what did we learn from X?"

### Conflict Handling

If retrieved chunks disagree:

1. Prefer the newer **revision-noted** decision text
2. Prefer decision docs over non-decision docs
3. Prefer security/netcode docs for trust/authority behavior
4. State the conflict explicitly and cite both locations

---

## High-Cost Docs — Resolved

All previously identified high-cost files have been split into individually addressable units:

| Original File | Now Split Into | Index Page |
| --- | --- | --- |
| `src/decisions/09f-tools.md` | `src/decisions/09f/D016-*.md` … `D057-*.md` (6 files) | `09f-tools.md` (routing table only) |
| `src/decisions/09g-interaction.md` | `src/decisions/09g/D058-*.md` … `D069-*.md` (4 files) | `09g-interaction.md` (routing table only) |
| `src/decisions/09b-networking.md` | `src/decisions/09b/D006-*.md` … `D060-*.md` (8 files) | `09b-networking.md` (routing table only) |
| `src/decisions/09e-community.md` | `src/decisions/09e/D030-*.md` … `D061-*.md` (10 files) | `09e-community.md` (routing table only) |
| `src/decisions/09d-gameplay.md` | `src/decisions/09d/D013-*.md` … `D070-*.md` (11 files) | `09d-gameplay.md` (routing table only) |
| `src/02-ARCHITECTURE.md` | `src/architecture/*.md` (13 subsystem files) | `02-ARCHITECTURE.md` (core invariants + routing table) |
| `src/17-PLAYER-FLOW.md` | `src/player-flow/*.md` (16 screen files) | `17-PLAYER-FLOW.md` (UX principles + state machine + routing table) |

**Retrieval pattern:** Read the index page (~500–800 tokens) to identify which sub-file to load, then load only that sub-file (~2k–12k tokens). Never load the full original content unless doing a cross-cutting audit.

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
