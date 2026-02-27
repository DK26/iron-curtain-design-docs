# Netcode Research Alignment Audit (2026-02-27)

**Status:** Recorded  
**Type:** Spec-review evidence (design-doc validation, no runtime test evidence)  
**Scope:** Validate staged netcode-related decision docs against internal research corpus and document reasoning for future review.

## Purpose

Preserve a durable reasoning record for why current netcode decisions are accepted, where they are supported by research, and where drift remains between policy docs and research drafts.

This note is intentionally separate from `research/*`:

- `research/*` = collected evidence and analyses (immutable unless explicitly refreshed)
- `src/*` decision/policy docs = current normative project direction
- this audit = traceable bridge between the two

## Inputs Reviewed

### Normative policy/docs (staged)

- `src/03-NETCODE.md`
- `src/decisions/09b/D007-relay-default.md`
- `src/decisions/09b/D060-netcode-params.md`
- `src/15-SERVER-GUIDE.md`
- `src/decisions/09d/D054-extended-switchability.md`
- `src/06-SECURITY.md`
- `src/decisions/09b/D052-community-servers.md`

### Research evidence docs (read-only reference)

- `research/generals-zero-hour-netcode-analysis.md`
- `research/generals-zero-hour-diagnostic-tools-study.md`
- `research/veloren-hypersomnia-openbw-ddnet-netcode-analysis.md`
- `research/openttd-netcode-analysis.md`
- `research/valve-github-analysis.md`
- `research/open-source-game-netcode-survey.md`
- `research/relay-wire-protocol-design.md`

## Validation Method

1. **Topology/trust-boundary consistency check**
   - Verified relay-default language across D007, 03-NETCODE, D054, 06-SECURITY, and D052.
2. **Algorithmic consistency check**
   - Verified calibration + adaptation narrative alignment between 03-NETCODE and D060.
3. **Parameter math check**
   - Verified run-ahead envelopes implied by deadline envelopes at 30 tps using:
     - `tick_interval_ms = 1000 / 30 ≈ 33.33`
     - `run_ahead_ticks = ceil(tick_deadline_ms / tick_interval_ms)`
4. **Research corroboration check**
   - Matched staged policy claims against specific research findings.
5. **Drift check**
   - Explicitly identified where research draft constants differ from current policy constants.

## Key Reasoning and Findings

### A. Relay-default and fairness model are well-supported

- Current policy: relay-authoritative lockstep with sub-tick ordering for contested actions.
- Research support:
  - OpenTTD confirms server-authoritative frame-gating in deterministic lockstep is robust at scale.
  - Valve GNS analysis supports relay-first internet posture and message/lane-oriented transport model.
  - Generals analysis supports adaptive run-ahead using latency + cushion metrics.
  - DDNet analysis supports per-client timing feedback loops.

Verdict: **Aligned** at architecture level.

### B. Match-global fairness + per-player send assist is coherent

- Current policy explicitly keeps arbitration match-global and limits per-player logic to submit-timing assist.
- This is consistent with anti-abuse and anti-host-advantage goals and avoids per-player fairness exceptions.

Verdict: **Aligned** with project trust model.

### C. Parameter-level drift exists between policy docs and research drafts

Current policy envelopes (D060/server guide):

- Ranked: `90-140ms`, `3-5 ticks`
- Casual: `120-220ms`, `4-7 ticks`

Research draft (`research/relay-wire-protocol-design.md`) still contains older generic constants:

- `MIN_RUN_AHEAD = 2`
- deadline capped at `2x tick interval`
- constants table still reflects those values

Related survey note also still references `2-4 ticks` as calibration guidance.

Verdict: **Not fully aligned at constant level**.  
Impact: Implementers reading research drafts as implementation source could produce behavior that diverges from current policy.

### D. Accuracy hardening applied in normative docs

To reduce false certainty while keeping research immutable, wording in normative docs was adjusted from:

- "complete byte-level protocol is specified in research doc"

to:

- research doc is a detailed draft
- decision/policy docs are normative if drift exists

This lowers objective-data risk without editing research evidence artifacts.

## Mathematical Check Record (30 TPS)

`tick_interval_ms = 33.33`

- `ceil(90 / 33.33) = 3`
- `ceil(140 / 33.33) = 5`
- `ceil(120 / 33.33) = 4`
- `ceil(220 / 33.33) = 7`

This supports policy envelopes used in D060 and server guide.

## Reference Anchors (for quick re-audit)

- `src/decisions/09b/D060-netcode-params.md` (envelopes, defaults)
- `src/15-SERVER-GUIDE.md` (operator-facing envelope mapping)
- `src/03-NETCODE.md` (calibration/adaptation/audit trail narrative)
- `src/decisions/09b/D007-relay-default.md` (relay default trust boundary)
- `research/relay-wire-protocol-design.md` (older constant set still present)
- `research/open-source-game-netcode-survey.md` (0 A.D. calibration note)

## Governance Rule (Recorded)

For future reviews:

1. Do not silently edit `research/*` to match policy.
2. If policy changes, record drift in an audit note like this.
3. Refresh research docs only as an explicit research-update task.
4. Keep normative precedence explicit in decision docs where research drafts are referenced.

### E. ClientMetrics / PlayerMetrics field mismatch — resolved

The research doc (`research/relay-wire-protocol-design.md`) uses `PlayerMetrics` in `compute_run_ahead()` with fields including `jitter_us`. The architecture doc (`src/03-NETCODE.md`) defines `ClientMetrics` with different fields (`avg_latency_us`, `avg_fps`, `arrival_cushion`, `tick_processing_us`) and no `jitter_us`.

**Resolution (03-NETCODE.md § System Wiring):** `ClientMetrics` is the client-submitted report. `PlayerMetrics` is now canonically defined as the relay-side aggregate that merges `ClientMetrics` fields with relay-observed data (`jitter_us`, `late_count_window`, `ewma_late_rate_bps`). The research doc's usage is correct — `compute_run_ahead()` operates on the relay-side aggregate, not the raw client report.

Verdict: **Resolved.** No research doc edit needed — the naming distinction is intentional (client-submitted vs. relay-aggregated).

## Current Verdict (2026-02-27)

- **Architecture direction:** accepted, evidence-backed.
- **Fairness model:** accepted, coherent with trust boundary.
- **Constants/source-of-truth hygiene:** partially aligned; drift is known and now explicitly documented.
- **Integration proof:** added (03-NETCODE.md § System Wiring). All components shown wiring together end-to-end.

