# Milestone Dependency Map (Execution Overlay)

Keywords: milestone dag, dependency graph, critical path, feature clusters, roadmap overlay, implementation order, hard dependency, soft dependency

> This page is the **detailed dependency companion** to [`../18-PROJECT-TRACKER.md`](../18-PROJECT-TRACKER.md). It does not replace [`../08-ROADMAP.md`](../08-ROADMAP.md); it translates roadmap phases and accepted decisions into an implementation-oriented milestone DAG and feature-cluster dependency map.

## Purpose

Use this page to answer:

- What blocks what?
- What can run in parallel?
- Which milestone exits require which feature clusters?
- Which policy/legal gates block validation even if code exists?
- Where do `Dxxx` decisions land in implementation order?

## Dependency Edge Kinds (Canonical)

| Edge Kind               | Meaning                                                                     | Example                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `hard_depends_on`       | Cannot start meaningfully before predecessor exists                         | `M2` depends on `M1` (sim needs parsed rules + assets/render slice confidence)                                                |
| `soft_depends_on`       | Strongly preferred order; can parallelize with stubs                        | `M8` creator foundations benefit from `M3`, but can start after `M2`                                                          |
| `validation_depends_on` | Can prototype earlier, but cannot validate/exit without predecessor         | `M7` anti-cheat moderation UX can prototype before full signed replay chain, but validation depends on D052/D007 evidence     |
| `enables_parallel_work` | Unlocks a new independent lane                                              | `M2` enables `M8` creator foundation lane                                                                                     |
| `policy_gate`           | Legal/governance/security prerequisite                                      | DMCA agent registration before validating full Workshop upload ops                                                            |
| `integration_gate`      | Feature exists but must integrate with another system before milestone exit | D069 setup wizard + D068 selective install + D049 package verification before “ready” maintenance flow is considered complete |

## Milestone DAG Summary (Canonical Shape)

```text
M0 -> M1 -> M2 -> M3
               ├-> M4 (minimal online slice)
               ├-> M8 (creator foundation lane)
               └-> M5 -> M6

M4 + M6 -> M7
M7 + M8 -> M9
M9 -> M10
M7 + M10 -> M11
```

## Milestone Nodes (M0–M11)

| Milestone | Objective                                                 | Maps to Roadmap                   | `hard_depends_on` | `soft_depends_on` | Unlocks / Enables         |
| --------- | --------------------------------------------------------- | --------------------------------- | ----------------- | ----------------- | ------------------------- |
| `M0`      | Tracker + execution overlay baseline                      | Pre-phase docs/process            | —                 | —                 | `M1` planning clarity     |
| `M1`      | Resource/format fidelity + rendering slice                | Phase 0 + Phase 1                 | `M0`              | —                 | `M2`                      |
| `M2`      | Deterministic sim + replayable combat slice               | Phase 2                           | `M1`              | —                 | `M3`, `M4`, `M5`, `M8`    |
| `M3`      | Local playable skirmish                                   | Phase 3 + Phase 4 prep            | `M2`              | —                 | `M4`, `M5`, `M6`          |
| `M4`      | Minimal online skirmish (no tracker/ranked)               | Phase 5 subset                    | `M3`              | `M5` (parallel)   | `M7`                      |
| `M5`      | Campaign runtime vertical slice                           | Phase 4 subset                    | `M3`              | `M4` (parallel)   | `M6`                      |
| `M6`      | Full campaigns + SP maturity                              | Phase 4 full                      | `M5`              | `M4`              | `M7`                      |
| `M7`      | Multiplayer productization                                | Phase 5 full                      | `M4`, `M6`        | —                 | `M9`, `M11`               |
| `M8`      | Creator foundation (CLI + minimal Workshop)               | Phase 4–5 overlay + 6a foundation | `M2`              | `M3`, `M4`        | `M9`                      |
| `M9`      | Scenario editor core + full Workshop + OpenRA export core | Phase 6a                          | `M7`, `M8`        | —                 | `M10`                     |
| `M10`     | Campaign editor + modes + RA1 export + ext.               | Phase 6b                          | `M9`              | —                 | `M11`                     |
| `M11`     | Ecosystem polish + optional AI/LLM + platform breadth     | Phase 7                           | `M7`, `M10`       | —                 | Ongoing product evolution |

## Critical Path Table (Recommended Baseline)

| Order | Milestone | Why It Is On the Critical Path                                                                                             |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | `M1`      | Without format/resource fidelity and rendering confidence, sim correctness and game-feel validation are blind              |
| 2     | `M2`      | Deterministic simulation is the core dependency for skirmish, campaign, and multiplayer                                    |
| 3     | `M3`      | First playable local loop is the gateway to meaningful online and campaign runtime validation                              |
| 4     | `M4`      | Minimal online slice proves the netcode architecture in real conditions before productization                              |
| 5     | `M5`      | Campaign runtime slice de-risks the continuous flow/campaign graph stack                                                   |
| 6     | `M6`      | Full campaign completeness is a differentiator and prerequisite for final multiplayer-vs-campaign prioritization decisions |
| 7     | `M7`      | Ranked/trust/browser/spectator/community infra depend on both mature runtime and online vertical slice learnings           |
| 8     | `M8`      | Creator foundation can parallelize, but `M9` cannot exit without it                                                        |
| 9     | `M9`      | Scenario editor + full Workshop + export core unlock the authoring platform promise                                        |
| 10    | `M10`     | Campaign editor and advanced templates mature the content platform                                                         |
| 11    | `M11`     | Optional AI/LLM and platform polish should build on stabilized gameplay/multiplayer/editor foundations                     |

## Parallel Lanes (Planned)

| Lane                                 | Start After | Primary Scope    | Why Parallelizable                                                                                                                       |
| ------------------------------------ | ----------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Lane A: Runtime Core`               | `M1`        | `M2 -> M3 -> M4` | Core engine and minimal netcode slice                                                                                                    |
| `Lane B: Campaign Runtime`           | `M3`        | `M5 -> M6`       | Reuses sim/game chrome while net productization proceeds                                                                                 |
| `Lane C: Creator Foundation`         | `M2`        | `M8`             | CLI/minimal Workshop/profile foundations can advance without full visual editor                                                          |
| `Lane C₂: P2P Engine`                | `M2`        | `M8 → M9`        | `p2p-distribute` standalone crate (D076 Tier 3); core engine through NAT/uTP needed for M8 Workshop delivery; full CAS/federation for M9 |
| `Lane D: Multiplayer Productization` | `M4 + M6`   | `M7`             | Needs runtime and net slice maturity plus content/gameplay maturity                                                                      |
| `Lane E: Authoring Platform`         | `M7 + M8`   | `M9 -> M10`      | Depends on productized runtime/networking and creator infra                                                                              |
| `Lane F: Optional AI/Polish`         | `M7 + M10`  | `M11`            | Optional systems should not steal bandwidth from core delivery                                                                           |


---

## Sub-Pages

| Section | Topic | File |
| --- | --- | --- |
| Execution Ladders | Granular foundational execution ladder A-G (RA first mission loop through completion) | [execution-ladders.md](milestone-deps/execution-ladders.md) |
| Clusters M0-M1 | Feature cluster dependency matrix: M0 (Tracker/Overlay) + M1 (Resource/Render Fidelity) | [clusters-m0-m1.md](milestone-deps/clusters-m0-m1.md) |
| Clusters M2-M4 | Feature cluster dependency matrix: M2 (Deterministic Sim) + M3 (Local Skirmish) + M4 (Minimal Online) | [clusters-m2-m4.md](milestone-deps/clusters-m2-m4.md) |
| Clusters M5-M6 | Feature cluster dependency matrix: M5 (Campaign Runtime) + M6 (Full Campaigns) | [clusters-m5-m6.md](milestone-deps/clusters-m5-m6.md) |
| Clusters M7 + Addenda | Feature cluster dependency matrix: M7 (MP Productization) + cross-milestone addenda | [clusters-m7-addenda.md](milestone-deps/clusters-m7-addenda.md) |
| Clusters M8 | Feature cluster dependency matrix: M8 (Creator Foundation) | [clusters-m8.md](milestone-deps/clusters-m8.md) |
| Clusters M9 | Feature cluster dependency matrix: M9 (Scenario Editor + Full Workshop) | [clusters-m9.md](milestone-deps/clusters-m9.md) |
| Clusters M10-M11 | Feature cluster dependency matrix: M10 (Campaign Editor + Modes) + M11 (Ecosystem Polish) | [clusters-m10-m11.md](milestone-deps/clusters-m10-m11.md) |
| Gates and Mappings | UX surface gate clusters, policy/external gates, external source study mappings, mapping rules, feature intake | [gates-and-mappings.md](milestone-deps/gates-and-mappings.md) |
