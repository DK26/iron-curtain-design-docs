# Completeness Audit & Build Sequence

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
3. `M8` `p2p-distribute` standalone crate core engine + tracker client + config system + profiles (design milestones 1–3) — separate MIT/Apache-2.0 repo, no IC dependencies.
4. `M8` `p2p-distribute` peer discovery + NAT traversal + DHT + uTP + embedded tracker (design milestones 4–5, 7, 9 subset).
5. `M8` IC P2P integration baseline — `workshop-core` wraps `p2p-distribute`; `ic-server` Workshop capability wired; auto-download on lobby join via P2P.
6. `M8` mod profiles + virtual namespace + selective install hooks (`D062/D068`).
7. `M8` authoring reference foundation (generated YAML/Lua/CLI docs, one-source knowledge-base path).
8. `M9` Scenario Editor core (`D038`) + validate/test/publish loop + resource manager basics.
9. `M9` Asset Studio baseline (`D040`) + import/conversion + provenance plumbing.
10. `M9` full Workshop/CAS + moderation tooling + OpenRA export core (`D049/D066`).
11. `M9` `p2p-distribute` hardening — fuzzing, chaos tests, v2/hybrid support, storage perf, control surfaces, `crates.io` publish (design milestones 6, 8–10).
12. `M9` SDK embedded authoring manual + context help (`F1`, `?`) from the generated docs source.
13. `M10` Campaign Editor + intermissions/dialogue/named characters + campaign test tools.
14. `M10` game mode templates + D070 family toolkit (Commander & SpecOps, commander-avatar variants, experimental survival).
15. `M10` RA1 export + plugin/extensibility hardening + localization/subtitle tooling.
16. `M11` governance/reputation polish + creator feedback recognition maturity + optional contributor cosmetic rewards.
17. `M11` optional BYOLLM stack (`D016/D047/D057`) and editor assistant surfaces.
18. `M11` optional visual/render-mode expansion (`D048`) + browser/mobile/Deck polish.

### Dependency Cross-Checks (Early Implementation)

- ~~`P002` must be resolved before serious `M2` sim/path/combat implementation.~~ ✓ RESOLVED (1024).
- ~~`P003` must be resolved before mission-end VO/EVA/audio polish in `M3`.~~ ✓ RESOLVED (Kira).
- ~~`P004` is **not** a blocker for the `M4` minimal online slice, but is a blocker for `M7` multiplayer productization.~~ ✓ RESOLVED (lobby/matchmaking wire protocol).
- `M4` online slice must remain architecture-faithful but feature-minimal (no tracker/ranked/browser assumptions).
- `M8` creator foundations can parallelize after `M2`, but full visual SDK/editor work (`M9+`) should wait for runtime/network product foundations and stable content schemas.
- `M11` remains optional/polish-heavy and must not displace unfinished `M7–M10` exit criteria unless a new decision/overlay remap explicitly changes that.
