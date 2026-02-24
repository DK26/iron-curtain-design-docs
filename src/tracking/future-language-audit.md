# Future / Deferral Language Audit (Canonical Docs)

Keywords: future wording audit, deferral discipline, planned deferral, north star claim, ambiguous future language, tracker mapping, proposal-only, pending decision

> This page is the **repo-wide audit record** for future/deferred wording in canonical docs. It exists to prevent vague prose from becoming unscheduled work.

## Purpose

- Classify future/deferred wording in canonical docs (`src/**/*.md`, `README.md`, `AGENTS.md`)
- Separate acceptable uses (`NorthStarVision`, narrative examples, legal phrases, etc.) from ambiguous planning language
- Track remediation work (rewrite, overlay mapping, or pending decision)
- Provide a repeatable audit workflow so the problem does not reappear

This page supports the cross-cutting process feature cluster:

- `M0.OPS.FUTURE_DEFERRAL_DISCIPLINE_AND_AUDIT` (`P-Core`)

## Scope

## Strict (canonical) scope

- `src/**/*.md`
- `README.md`
- `AGENTS.md`

## Lighter (research) scope

- `research/**/*.md`
- Research notes may use speculative language, but accepted takeaways must be mapped into the execution overlay if adopted.

## Out of scope

- Non-doc code files
- Legal/SPDX fixed phrases unless misused as project commitments
- Historical quotations unless presented as project commitments

## Policy Summary (What Is Allowed vs Not)

- The word `future` is **not banned**.
- **Ambiguous future intent is banned** in canonical planning/spec docs.
- Every accepted future-facing commitment in canonical docs must be classified and (if it implies work) placed in the execution overlay.

Accepted classes:

- `PlannedDeferral`
- `NorthStarVision`
- `VersioningEvolution`
- `NarrativeExample`
- `HistoricalQuote`
- `LegalTechnicalFixedPhrase`
- `ResearchSpeculation` (research docs only)

Forbidden class in canonical docs (after audit rewrite):

- `Ambiguous`

## Classification Model

| Class | Canonical Docs Allowed? | Requires Tracker Placement? | Notes |
| --- | --- | --- | --- |
| `PlannedDeferral` | Yes | Yes (or Dxxx row note) | Must include milestone, priority, deps, reason, scope boundary, trigger |
| `NorthStarVision` | Yes | Usually (milestone prereqs + caveats) | Must be clearly labeled non-promise, especially for multiplayer fairness claims |
| `VersioningEvolution` | Yes | Usually no new cluster | Must define current version + migration/version dispatch path |
| `NarrativeExample` | Yes | No | Story/example chronology only |
| `HistoricalQuote` | Yes | No | Quote context only |
| `LegalTechnicalFixedPhrase` | Yes | No | Example: `GPL-3.0-or-later` |
| `ResearchSpeculation` | In `research/` only | Only if adopted | Must not silently become canonical commitment |
| `Ambiguous` | No (target state) | N/A | Rewrite into a valid class or mark proposal-only / `Pxxx` |

## Status Values (Audit Workflow)

- `resolved` — rewritten/classified and, if needed, mapped into overlay
- `exempt` — valid non-planning usage (historical/narrative/legal/etc.)
- `needs rewrite` — ambiguous wording in canonical docs
- `needs tracker placement` — wording is specific enough to be accepted work, but overlay mapping is missing
- `needs pending decision` — commitment depends on unresolved policy/architecture choice and should become `Pxxx`

## Audit Method (Repeatable)

### Baseline grep scan (canonical docs)

```bash
rg -n "\bfuture\b|\blater\b|\bdefer(?:red)?\b|\beventually\b|\bTBD\b|\bnice-to-have\b" \
  src README.md AGENTS.md --glob '!research/**'
```

### Ambiguity-focused triage scan (canonical docs)

```bash
rg -n "future convenience|later maybe|could add later|might add later|\beventually\b|\bnice-to-have\b|\bTBD\b" \
  src README.md AGENTS.md --glob '!research/**'
```

### Notes

- Grep is an inventory tool, not the final classifier.
- `eventually`, `later`, and `future` frequently appear in valid historical or narrative contexts.
- Use line-level classification only where the wording implies project planning intent.

## Baseline Inventory (Canonical Docs)

### Baseline snapshot

- **Inventory count:** `292` hits (`future/later/deferred/eventually/TBD/nice-to-have`)
- **Source set:** canonical docs (`src/**/*.md`) + `README.md` + `AGENTS.md`
- **Purpose:** establish remediation scope for `M0.OPS.FUTURE_DEFERRAL_DISCIPLINE_AND_AUDIT`

This inventory is a moving count. It will change as docs grow and as ambiguous wording is rewritten.

### Highest-volume files (baseline triage priority)

| Count | File | Audit Priority | Why |
| --- | --- | --- | --- |
| 41 | `src/decisions/09d-gameplay.md` | `M5-M11` high | Many optional modes/extensions and phase-gated gameplay systems |
| 30 | `src/decisions/09f-tools.md` | `M8-M10` high | Tooling/SDK phasing, optional editor features, deferred integrations |
| 28 | `src/decisions/09e-community.md` | `M7-M11` high | Community/platform ops, governance, optional services |
| 21 | `src/decisions/09g-interaction.md` | `M3-M10` medium/high | Interaction/UX phasing, optional advanced UX |
| 16 | `src/03-NETCODE.md` | `M1-M7` high | Core architecture/trust claims require precise wording |
| 14 | `src/02-ARCHITECTURE.md` | `M1-M4` high | Core architecture and versioning/evolution wording |
| 12 | `src/tracking/milestone-dependency-map.md` | `M0` high | Planning overlay must be the cleanest wording |
| 12 | `src/18-PROJECT-TRACKER.md` | `M0` high | Tracker maintenance rules and audit status page |
| 10 | `src/17-PLAYER-FLOW.md` | `M3-M10` medium | Mixes mock UI narrative and planned features |
| 9 | `README.md` | `M0` high | Public-facing claims must use North Star labels and trust caveats |

## Audit Status (Current)

### Phase A — Policy lock

- `AGENTS.md`: **resolved** (Future / Deferral Language Discipline added)
- `src/14-METHODOLOGY.md`: **resolved** (classification + rewrite rules added)
- `src/18-PROJECT-TRACKER.md`: **resolved** (audit status + maintenance rules + intake checklist)
- `src/tracking/milestone-dependency-map.md`: **resolved** (cluster row + mapping rules + deferred-feature placement examples)
- `src/decisions/DECISION-CAPSULE-TEMPLATE.md`: **resolved** (deferral fields + wording rule)

### Phase B — Inventory & classification audit

- **Baseline inventory:** complete (canonical docs)
- **Per-hit full classification:** in progress (this page seeds the queue and examples)
- **Canonical first-pass focus:** `M0` docs, then `M1-M4` docs

### Phase C2 — `M1-M4` targeted rewrite/classification pass (baseline)

- **Status:** baseline complete for planning-intent wording; residual hits are classified as exempt/versioning/technical-semantics references and can be audited incrementally
- **Resolved in this pass:**
  - `src/05-FORMATS.md` ambiguous `nice-to-have` and versioning "future" wording rewritten as explicit `PlannedDeferral` / `VersioningEvolution`
  - `src/06-SECURITY.md` cross-engine bounds-hardening line rewritten as explicit `PlannedDeferral` tied to `M7`
- `src/03-NETCODE.md` bridge/alternative-netcode wording tightened to explicit deferred/optional scope with `M4` boundary and trust/certification caveats
- `src/02-ARCHITECTURE.md` example "future" wording tightened in fog/pathfinder/browser mitigation references (architectural headroom remains, ambiguity reduced)
- `src/17-PLAYER-FLOW.md` D070/D053 later-phase wording tied to explicit `M10`/`M11` phases
- **Residual C2 hits (classified, no rewrite needed by default):**
  - `src/17-PLAYER-FLOW.md` setup copy (`change later in Settings`) -> `NarrativeExample` / UI copy, not planning commitments
  - `src/17-PLAYER-FLOW.md` "later Westwood Online/CnCNet" -> `HistoricalQuote` / historical product chronology
  - `src/04-MODDING.md` OpenRA tier analysis `eventually needs code` wording -> `NarrativeExample` (observational product-analysis statement, not IC roadmap commitment)
  - `src/04-MODDING.md` "later in load order" -> technical semantics, not planning
  - `src/04-MODDING.md` "future alternative" Lua VM wording -> `VersioningEvolution` / architectural headroom (stable API boundary is the point)
  - `src/04-MODDING.md` pathfinding `deferred requests` wording -> technical runtime semantics, not planning
  - `src/03-NETCODE.md` "ticks into the future", "eventual heartbeat timeout", "later packets" -> temporal/network mechanics wording, not planning
  - `src/02-ARCHITECTURE.md` many "future/later" mentions in trait-capability tables/examples and 3D-title chronology -> architectural headroom examples / scope statements, not scheduled commitments
- **Still pending in C2 scope:** only newly discovered ambiguous planning statements if future edits add them; otherwise C2 can be treated as closed for the current baseline

### Planned deferral for the remaining rewrite pass (explicit)

- **Deferred to:** `M0` maintenance work under `M0.OPS.FUTURE_DEFERRAL_DISCIPLINE_AND_AUDIT`
- **Priority:** `P-Core`
- **Depends on:** tracker overlay (`src/18-PROJECT-TRACKER.md`), dependency map (`src/tracking/milestone-dependency-map.md`), this audit page, wording patterns page
- **Reason:** repo-wide rewrite is cross-cutting and should proceed in prioritized batches instead of ad hoc edits
- **Not in current scope:** rewriting every one of the `292` baseline hits in a single patch
- **Validation trigger:** canonical-doc batches (`M0`, then `M1-M4`, then `M5-M11`) audited with ambiguous hits rewritten or reclassified

### Phase C3 — `M5-M11` targeted rewrite/classification pass (baseline)

- **Status:** baseline complete for planning-intent wording; residual hits are classified as North Star, versioning evolution, narrative/historical examples, or technical/runtime semantics
- **Resolved in this pass (explicit rewrites):**
  - `src/decisions/09d/D042-behavioral-profiles.md` manual AI personality editor "future nice-to-have" -> explicit `M10-M11` planned optional deferral with dependencies and out-of-scope boundary
  - `src/decisions/09e/D031-observability.md` / `src/decisions/09e/D034-sqlite.md` optional OTEL and PostgreSQL scaling wording -> explicit `M7`/`M11` planned deferrals (`P-Scale`)
  - `src/decisions/09e/D035-creator-attribution.md` monetization schema/comments + creator program paid-tier wording -> explicit deferred optional `M11+` policy path
  - `src/decisions/09f/D016-llm-missions.md` generative media video/cutscene wording -> explicit deferred optional `M11` path
  - `src/decisions/09g/D058-command-console.md` RCON and voice-feature deferrals -> explicit `M7` / `M11` planned deferrals with scope boundaries
  - `src/07-CROSS-ENGINE.md` cross-engine correction/certification/host-mode wording -> explicit deferred `M7+`/`M11` certification decisions and North Star guardrails
  - `src/decisions/09b/D006-pluggable-net.md` / `src/decisions/09b/D011-cross-engine.md` / `src/decisions/09b/D055-ranked-matchmaking.md` "future/later" netcode/ranking wording -> explicit deferred milestone phrasing
  - `src/decisions/09c-modding.md` plugin capability wording -> explicit separately approved deferred capability path
  - `README.md` cross-engine interop and contributor reward wording -> explicit deferred milestone framing (`M7+`/`M11`) while preserving marketing readability
- **Residual C3 hits (classified, no rewrite needed by default):**
  - `README.md` author biography/history and README navigation prose (`later`, `eventually`) -> `HistoricalQuote` / `NarrativeExample`
  - `src/07-CROSS-ENGINE.md` replay drift wording (`desync eventually`) -> technical behavior (`NarrativeExample`)
  - `src/decisions/09c-modding.md` future genres/workshop consumer examples, load-order semantics, migration story examples, reversible UI copy -> `NarrativeExample` / `NorthStarVision` / `VersioningEvolution`
  - `src/decisions/09d-gameplay.md` architectural-headroom rationale, historical sequencing text, versioning examples, D070 narrative examples -> `NarrativeExample` / `VersioningEvolution` / `HistoricalQuote`
  - `src/decisions/09e-community.md` UI copy ("Remind me later"), lifecycle semantics, historical platform examples, and maintenance reminders -> `NarrativeExample` / `HistoricalQuote`
  - `src/decisions/09f-tools.md` narrative examples/story chronology, migration/version comments, historical references, and deterministic replay timing descriptions -> `NarrativeExample` / `VersioningEvolution`
  - `src/decisions/09g-interaction.md` competitive-integrity guidance for contributors, historical examples, platform table labels, UI reversibility copy -> `NarrativeExample` / `HistoricalQuote` / `VersioningEvolution`
- **Still pending in C3 scope:** only newly introduced ambiguous planning statements in future edits, plus individually reclassified edge cases discovered during later doc revisions

## Initial Classification Queue (Seed Batch)

This table records concrete examples to anchor the classification rules and prevent repeat ambiguity.

| Ref | Snippet (short) | Class | Status | Required Action |
| --- | --- | --- | --- | --- |
| `AGENTS.md:306` | banned phrase examples (`future convenience`, etc.) | `NarrativeExample` (policy example) | `exempt` | None |
| `src/14-METHODOLOGY.md:264` | "Ambiguous future wording..." | `NarrativeExample` (policy text) | `exempt` | None |
| `src/18-PROJECT-TRACKER.md:229` | baseline inventory mentions `future/...` tokens | `NarrativeExample` (audit inventory) | `exempt` | None |
| `README.md` long-term mixed-client 2D vs 3D claim | `NorthStarVision` | `resolved` | Keep non-promise wording + trust caveats + milestone prerequisites |
| `src/07-CROSS-ENGINE.md` visual-style parity vision | `NorthStarVision` | `resolved` | Keep host-mode trust labels + fairness scope explicit |
| `src/decisions/09d-gameplay.md:1589` | "future nice-to-have" (manual AI personality editor) | `PlannedDeferral` | `resolved` | Rewritten to explicit `M10-M11` optional deferral with D042/D038/D053 dependencies and D042 scope boundary |
| `src/08-ROADMAP.md:297` | "Tera templating ... (nice-to-have)" | `PlannedDeferral` (candidate) | `needs rewrite` | Add explicit phase/milestone/optionality wording (or cross-ref existing D014 phasing) |
| `src/05-FORMATS.md:909/956/1141` | versioning "future" codec/compression/signature wording | `VersioningEvolution` | `resolved` | Rewritten as reserved/versioned dispatch language with explicit current defaults |
| `src/05-FORMATS.md:1342` | `.mix` write support "Phase 6a (nice-to-have)" | `PlannedDeferral` | `resolved` | Rewritten as explicit `M9`/Phase 6a optional deferral + reason + scope boundary + trigger |
| `src/06-SECURITY.md:1349` | bounds hardening ships with cross-engine play "(future)" | `PlannedDeferral` | `resolved` | Rewritten as explicit `M7`/`M7.NET.CROSS_ENGINE_BRIDGE_AND_TRUST` deferral with `M4` boundary and trigger |
| `src/03-NETCODE.md:870/912/916/918/1038` | bridge/alternate netcode "future" wording in `M1-M4`-critical netcode doc | `PlannedDeferral` / `NorthStarVision` (bounded examples) | `resolved` | Rewritten to explicit deferred/optional scope, `M4` boundary, and trust/certification caveats |
| `src/03-NETCODE.md:5/875/922/916/968/1038` | top-level and bridge-netcode trait headroom "later" wording | `PlannedDeferral` | `resolved` | Rewritten to explicit deferred-milestone / separate-decision wording with `M4` boundary and tracker-placement requirement |
| `src/02-ARCHITECTURE.md:292/683/1528` | architectural "future" examples implying planned work | `NarrativeExample` / `PlannedDeferral` (hybrid) | `resolved` | Reworded to mark deferred/optional scope and reduce planning ambiguity while preserving trait-headroom examples |
| `src/17-PLAYER-FLOW.md:841/1611` | "future/later phase" UI/planning wording for D070 + contribution rewards | `PlannedDeferral` | `resolved` | Tied to explicit D070 expansion phrasing and `M10`/`M11` milestone references |
| `src/17-PLAYER-FLOW.md:127/137/140/150/269/277/322` | "change later in Settings" wizard copy | `NarrativeExample` (UI wording) | `exempt` | User-facing reversibility copy, not implementation-planning text |
| `src/17-PLAYER-FLOW.md:2263` | "later Westwood Online/CnCNet" in historical RA menu description | `HistoricalQuote` / `NarrativeExample` | `exempt` | Historical chronology reference |
| `src/04-MODDING.md:24` | OpenRA mod analysis "eventually needs code" | `NarrativeExample` (observational analysis) | `exempt` | Describes observed mod complexity patterns; not an IC roadmap commitment |
| `src/04-MODDING.md:397/529/1562` | "later in load order" / "future alternative" / "future generation" | `NarrativeExample` / `VersioningEvolution` | `exempt` | Technical semantics, VM headroom, and D057 generation context — not unplaced project commitments |
| `src/04-MODDING.md:890/1303` | `PathResult::Deferred` / deferred-request pathfinding wording | `NarrativeExample` (technical runtime behavior) | `exempt` | Deterministic pathfinding request semantics, not planning deferral language |
| `src/03-NETCODE.md:276/345/426/708/1042` | "future/later/eventually" in timing/mechanics explanations | `NarrativeExample` (technical behavior) | `exempt` | Describes packet/order timing and buffering semantics, not roadmap commitments |
| `src/02-ARCHITECTURE.md:563/668/874/1281/1768/1799/2156/2161/2163/2192/2227` | architectural headroom tables, historical timeline, scope chronology, and examples | `NarrativeExample` / `HistoricalQuote` / `VersioningEvolution` | `exempt` | Architectural examples and historical/scope context; no unscheduled feature commitment by themselves |
| `src/decisions/09e-community.md:768/1758/1799/1862-1868/2087` | OTEL and storage/monetization optionality ("nice-to-have", "future optimization", "future paid") | `PlannedDeferral` / `VersioningEvolution` | `resolved` | Rewritten to explicit `M7`/`M11` deferrals and deferred-schema/policy wording with launch-scope boundaries |
| `src/decisions/09f-tools.md:721/736/823/866` | AI media pipeline "eventually/future" video-cutscene generation | `PlannedDeferral` | `resolved` | Rewritten to explicit deferred optional `M11` media-layer path (D016/D047/D040 context retained) |
| `src/decisions/09g-interaction.md:1204/2954-2956/4517/4757/4773` | RCON/voice feature/install-platform "future/deferred" wording | `PlannedDeferral` | `resolved` | Rewritten to explicit `M7`/`M11` deferrals and deferred platform/shared-flow labels |
| `src/07-CROSS-ENGINE.md:114/132/139/187/323/384/592` | cross-engine certification/correction/vision "future/later" wording | `PlannedDeferral` / `NorthStarVision` | `resolved` | Rewritten to explicit `M7+`/`M11` certification-decision gating and deferred-milestone wording |
| `src/decisions/09b-networking.md:9/17/19/70/85/2264` | networking/ranking "future/later" capability and deferred ranking enhancement wording | `PlannedDeferral` | `resolved` | Rewritten to explicit deferred milestone / separate-decision language (`M7+`/`M11`) |
| `src/decisions/09c-modding.md:925` | editor plugin "future capability" wording | `PlannedDeferral` | `resolved` | Rewritten to separately approved deferred capability + execution-overlay placement wording |
| `README.md:27/37/90/149/213` | project-facing "later" module/interops/rewards wording | `NorthStarVision` / `PlannedDeferral` | `resolved` | Rewritten to explicit deferred milestone framing while preserving marketing readability |
| `README.md:71/246/248/321` | README prose/history "later/eventually" wording | `NarrativeExample` / `HistoricalQuote` | `exempt` | README structure note + author story + historical quote context; not project commitments |
| `src/07-CROSS-ENGINE.md:53` | replay drift "desync eventually" wording | `NarrativeExample` (technical behavior) | `exempt` | Describes expected replay divergence, not roadmap commitment |
| `src/decisions/09c-modding.md:204/303/309/450/970/1190/1257` | future-genre examples, load-order semantics, migration story, UI/CLI "later" copy | `NarrativeExample` / `NorthStarVision` / `VersioningEvolution` | `exempt` | Product examples, technical semantics, and user-copy reversibility — no unscheduled commitment by themselves |
| `src/decisions/09d-gameplay.md:16/17/341/532/554/877/881/1053/1059/1092/1340/1343/1588/1698/2323/2766/3091/3166-3167/3209/3217/3241/3334/3410/3429/3462-3463/3496/3568/3572/3574/3773/3775/3790/3818/3918/4196/4234/4236` | architectural headroom, versioning, D070 narrative examples, and explicit deferrals already scoped in-context | `NarrativeExample` / `VersioningEvolution` / `PlannedDeferral` | `exempt` | Broad set includes accepted architectural headroom language, explicit D070 optional/deferred scope, and historical/example wording; no hidden planning ambiguity after C3 baseline pass |
| `src/decisions/09e-community.md:279/338/401/628/2067/2193/2199/2280/2315/2634/2837/2904/2921/2926/3633/3657/3999/4022/4188/4193/4367` | UI reminders, lifecycle semantics, historical examples, platform table labels, and explicit optional/deferred backup/customization scope | `NarrativeExample` / `HistoricalQuote` / `VersioningEvolution` / `PlannedDeferral` | `exempt` | User-copy semantics, examples, and already explicit optional/deferred features; no additional rewrite needed for baseline C3 |
| `src/decisions/09f-tools.md:147/673/1235/1533/1580/1859/2052/2060/2074/2330/2377/2891/3390/3422/3679/3786/3807/4042/4056/4143/4226/4243/4388/5010/5120/5397` | narrative examples, versioning comments, explicit deferred scope, and technical timing wording | `NarrativeExample` / `VersioningEvolution` / `PlannedDeferral` | `exempt` | Includes story examples, migration/version comments, explicit D070/D016/D040 deferrals, and technical timing descriptions — baseline ambiguity resolved |
| `src/decisions/09g-interaction.md:629/649/700/759/1163-1164/1254/1662/1935/2468/2814/3846/4546/4670/4864` | contributor guidance, history examples, platform labels, and reversible UI copy | `NarrativeExample` / `HistoricalQuote` / `VersioningEvolution` | `exempt` | Competitive-integrity guidance and UX copy use "future/later" descriptively, not as unplaced commitments |

## Exempt Patterns (Allowed, Do Not "Fix" Into Planning)

| Pattern | Example | Class | Why Exempt |
| --- | --- | --- | --- |
| Historical quote / biography timeline | `README.md:246` ("eventually found Rust") | `HistoricalQuote` / `NarrativeExample` | Not a project plan statement |
| Historical quote in philosophy | `src/13-PHILOSOPHY.md:405` | `HistoricalQuote` | Quoted source context |
| Story/example chronology | "future missions" in campaign examples | `NarrativeExample` | Narrative, not implementation planning |
| Legal fixed phrase | `GPL-3.0-or-later` | `LegalTechnicalFixedPhrase` | Standard identifier, not planning language |

## Prioritized Rewrite Batches (Canonical Docs)

## Batch C1 — M0 planning docs (first)

- `AGENTS.md` — policy text complete; maintain as the strict gate
- `src/18-PROJECT-TRACKER.md` — policy + audit status complete; keep inventory current
- `src/tracking/milestone-dependency-map.md` — rules + examples complete; keep new clusters mapped
- `src/14-METHODOLOGY.md` — process rule complete; keep grep snippet current
- `src/09-DECISIONS.md` — scan for ambiguous deferral wording in summaries/index notes

## Batch C2 — M1-M4 milestone-critical docs

- `src/02-ARCHITECTURE.md`
- `src/03-NETCODE.md`
- `src/04-MODDING.md`
- `src/05-FORMATS.md`
- `src/06-SECURITY.md`
- `src/17-PLAYER-FLOW.md` (milestone-critical commitments only)

## Batch C3 — M5-M11 canonical docs

- `src/decisions/09b-networking.md`
- `src/decisions/09c-modding.md`
- `src/decisions/09d-gameplay.md`
- `src/decisions/09e-community.md`
- `src/decisions/09f-tools.md`
- `src/decisions/09g-interaction.md`
- `src/07-CROSS-ENGINE.md`
- `README.md` (North Star wording review, not feature deletion)

## Remediation Workflow (Per Hit)

1. **Classify** the reference (`PlannedDeferral`, `NorthStarVision`, etc.).
2. If `PlannedDeferral`, ensure wording includes:
   - milestone
   - priority
   - dependency placement (or direct cluster/Dxxx refs)
   - reason
   - out-of-scope boundary
   - validation trigger
3. If accepted work is implied, **map it in the execution overlay** (`18-PROJECT-TRACKER.md` and/or `tracking/milestone-dependency-map.md`) in the same change.
4. If it cannot be placed yet, rewrite as:
   - **proposal-only** (not scheduled), or
   - **Pending Decision (`Pxxx`)**
5. Update this audit page status (`resolved`, `exempt`, etc.) for the touched item/batch.

## Doc-Process Interface Sketches (Planning APIs)

These are planning-system interfaces for consistent audit records and wording review, not runtime code APIs.

### `FutureReferenceRecord`

```rust
pub enum FutureReferenceClass {
    PlannedDeferral,
    NorthStarVision,
    VersioningEvolution,
    NarrativeExample,
    HistoricalQuote,
    LegalTechnicalFixedPhrase,
    ResearchSpeculation,
    Ambiguous, // forbidden in canonical docs after audit
}

pub struct FutureReferenceRecord {
    pub file: String,
    pub line: u32,
    pub snippet: String,
    pub class: FutureReferenceClass,
    pub canonical_doc: bool,
    pub requires_rewrite: bool,
    pub milestone: Option<String>,   // M0..M11 for PlannedDeferral/NorthStar as applicable
    pub priority: Option<String>,    // P-Core ... P-Optional
    pub dependencies: Vec<String>,   // cluster IDs / Dxxx / Pxxx
    pub reason: Option<String>,
    pub non_goal_boundary: Option<String>,
    pub validation_trigger: Option<String>,
    pub tracker_refs: Vec<String>,
    pub status: String,              // resolved / exempt / needs_rewrite / needs_mapping / needs_P_decision
}
```

### `DeferralWordingRule`

```rust
pub struct DeferralWordingRule {
    pub banned_pattern: String,
    pub replacement_requirements: Vec<String>, // milestone, priority, deps, reason, trigger
    pub examples: Vec<String>,
}
```

### `NorthStarClaimRecord`

```rust
pub struct NorthStarClaimRecord {
    pub claim_id: String,
    pub statement: String,
    pub fairness_or_trust_scope: Option<String>,
    pub milestone_prereqs: Vec<String>,
    pub non_promise_label_required: bool,
    pub canonical_sources: Vec<String>,
}
```

## Maintenance Rules (Keep This Page Useful)

1. Update the baseline count only when re-running the same canonical-doc scan (document the command).
2. Do not treat grep hits as automatically wrong; classify before rewriting.
3. Keep **M0/M1-M4** batches current before spending time polishing low-risk narrative wording.
4. If a rewrite creates/changes planned work, update the execution overlay in the same change.
5. Use `src/tracking/deferral-wording-patterns.md` for consistent replacement wording instead of inventing one-off phrasing.

## Related Pages

- [`../18-PROJECT-TRACKER.md`](../18-PROJECT-TRACKER.md)
- [`milestone-dependency-map.md`](milestone-dependency-map.md)
- [`deferral-wording-patterns.md`](deferral-wording-patterns.md)
- [`../14-METHODOLOGY.md`](../14-METHODOLOGY.md)
