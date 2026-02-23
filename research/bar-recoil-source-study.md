# Beyond All Reason (BAR) / Recoil — Source Study (Confirmatory Research)

> **Purpose:** Extract implementation-process and tooling lessons from BAR/Recoil source/docs that can improve Iron Curtain's execution plan without importing engine assumptions that conflict with IC invariants.
>
> **Date:** 2026-02-23
> **Status:** Confirmatory research (source code/docs study feeding implementation workflow and creator-tooling prioritization)

---

## Scope

This note answers one narrow question:

1. What lessons from **BAR + Recoil/Spring-era tooling/docs patterns** are worth adopting in IC's implementation plan and creator ecosystem?

This is **not**:
- a recommendation to copy Spring/Recoil engine architecture
- a compatibility target for IC
- a claim that BAR's gameplay/networking stack should replace IC decisions

IC's architectural invariants (pure deterministic sim, pluggable net trait, Bevy framework, tiered modding, game-agnostic core) remain unchanged.

---

## Source Quality and Limits

- **BAR repository/docs** are strong primary sources for:
  - repo structure and boundary conventions
  - developer workflow ergonomics
  - content/script organization patterns
  - contributor onboarding docs
- **Recoil docs** are strong primary sources for:
  - widget/gadget extension taxonomy
  - synced/unsynced scripting model terminology
- These sources are **not** authoritative for:
  - IC's deterministic sim/net architecture
  - Bevy-specific UI/rendering implementation choices
  - IC anti-cheat/ranked guarantees

---

## Sources Reviewed

### Primary Sources

- BAR repo README (scope, dev quick-start, local `.sdd` dev workflow)
  - <https://github.com/beyond-all-reason/Beyond-All-Reason>
- BAR lobby development setup docs
  - <https://beyond-all-reason.github.io/bar-lobby/development/set_up>
- BAR infrastructure docs (system overview entry point)
  - <https://beyond-all-reason.github.io/infrastructure/>
- Recoil docs: widgets and gadgets (addon taxonomy, synced vs unsynced distinction)
  - <https://recoilengine.org/docs/guides/getting-started/widgets-and-gadgets/>
- Recoil docs: synced and unsynced code
  - <https://recoilengine.org/docs/guides/getting-started/synced-and-unsynced-code/>
- Recoil netcode overview (lockstep/buffering/desync constraints)
  - <https://recoilengine.org/articles/netcode-overview/>
- Recoil changelog archive (pathing/path query API evolution and regressions)
  - <https://recoilengine.org/changelogs/archive/>
- BAR lobby releases (protocol transition / Tachyon rollout signals)
  - <https://github.com/beyond-all-reason/bar-lobby/releases>
- BAR moderation policy note (mute/suspension protocol-coupling lesson)
  - <https://www.beyondallreason.info/microblogs/28>

### Why these sources were chosen

They directly cover the topics most relevant to IC's current milestone planning:
- creator iteration workflow (`M8`, `M9`)
- scripting authority boundaries (`M5`, `M7`, `M9`)
- extension taxonomy and discoverability (`M9`, `M10`)
- operator/contributor docs structure (`M7`, `M9`, `M11`)
- lockstep/buffering tradeoffs, protocol migration hygiene, moderation capability granularity, and pathfinding API/tuning regression patterns (`M2`, `M4`, `M7`)

---

## High-Value Lessons for IC (Fit / Risk / IC Action)

## 1. Clear boundary docs: game content vs engine vs lobby/infra

**Observed in BAR:** BAR's repo/docs make it explicit that the main repo is game content/logic and that engine and lobby are separate concerns.

**Fit with IC:** **High**
- Reinforces IC's crate boundaries and separate binaries (`ic-game` vs `ic-editor`)
- Supports contributor onboarding and avoids "wrong repo/file" churn

**Risk if ignored:**
- Contributors conflate engine, game module, SDK, and community-service layers
- Cross-cutting changes become slower and harder to review

**IC action (accepted):**
- Continue strengthening system-overview docs and boundary-oriented onboarding
- Keep milestone overlay references explicit when a feature spans game/runtime/community/docs layers

**Implementation overlay mapping (existing clusters):**
- `M7.NET.D052_SIGNED_CREDS_RESULTS`
- `M9.COM.D049_FULL_WORKSHOP_CAS`
- `M11.COM.ECOSYSTEM_POLISH_GOVERNANCE`

---

## 2. Fast local creator iteration through a real game path (dev overlay mode)

**Observed in BAR:** The `.sdd` + `devmode.txt` workflow is a practical pattern for testing local content through normal game UX rather than a separate toy runner.

**Fit with IC:** **High**
- Aligns with D020 CLI + D069 setup/maintenance + D038 SDK goals
- Helps IC avoid packaging friction for creators in `M8` and `M9`

**Risk if ignored:**
- Creator loop becomes "edit -> package -> install -> test" every iteration
- Early creator adoption suffers even if SDK is powerful

**IC action (accepted):**
- Prioritize a local content overlay/dev profile workflow in `M8` CLI + `M9` SDK integration
- Ensure "run local content through real game flow" remains a first-class path

**Implementation overlay mapping (existing clusters):**
- `M8.SDK.CLI_FOUNDATION`
- `M8.COM.MINIMAL_WORKSHOP` (local vs published testing boundaries)
- `M9.SDK.D038_SCENARIO_EDITOR_CORE`

---

## 3. Explicit authoritative vs client-local scripting/API boundaries

**Observed in Recoil docs:** Synced vs unsynced code is taught as a core mental model, not an implementation detail.

**Fit with IC:** **High**
- Strongly aligned with IC invariants (pure deterministic sim, no net awareness in sim)
- Maps cleanly to IC's Lua/WASM tiers and security/trust posture

**Risk if ignored:**
- Scripting docs blur what affects simulation vs local UI/UX only
- Modders accidentally build features that conflict with determinism or competitive integrity

**IC action (accepted):**
- Make scripting/API docs, SDK context help, and examples explicitly label:
  - `simulation-authoritative`
  - `client-local / UI-only`
  - `server/host policy-gated`
- Keep this visible in the authoring manual and embedded docs

**Implementation overlay mapping (existing clusters):**
- `M5.SP.LUA_MISSION_RUNTIME`
- `M8.SDK.AUTHORING_REFERENCE_FOUNDATION`
- `M9.SDK.EMBEDDED_AUTHORING_MANUAL`
- `M7.SEC.BEHAVIORAL_ANALYSIS_REPORTING` (trust messaging / evidence boundaries)

---

## 4. Extension taxonomy: gameplay-authoritative vs user-togglable UI addons

**Observed in Recoil docs:** Widget/gadget categorization helps users and modders understand which addons are UI-side vs rules-affecting.

**Fit with IC:** **Medium to High**
- IC should not clone the Spring model, but the taxonomy pattern is useful
- Especially relevant for future SDK plugins, UI overlays, and QoL tooling

**Risk if ignored:**
- Competitive integrity confusion ("is this allowed?" "does this change gameplay?")
- UI/plugin ecosystem grows without a clear policy vocabulary

**IC action (accepted):**
- Preserve and document a clear extension taxonomy for:
  - authoritative gameplay extensions (Lua/WASM, policy-gated)
  - local UI/QoL extensions (profile/local, not gameplay fingerprint)
- Reuse D059/D065/D049 trust and labeling surfaces for discoverability

**Implementation overlay mapping (existing clusters):**
- `M9.COM.D049_FULL_WORKSHOP_CAS`
- `M10.MOD.D066_RA1_EXPORT_EXTENSIBILITY`
- `M10.SDK.LOCALIZATION_PLUGIN_HARDENING`

---

## 5. Deep, searchable docs/manuals are part of product quality, not garnish

**Observed in BAR/Recoil ecosystem:** Substantial contributor docs and extension docs reduce friction and preserve project continuity.

**Fit with IC:** **High**
- Directly supports IC's newly formalized D037/D038 authoring manual and embedded docs work
- Strong fit for long-term community platform ambitions

**Risk if ignored:**
- Creator support burden rises
- SDK feels powerful but opaque
- Feature discoverability degrades into "community lore"

**IC action (accepted):**
- Keep one-source authoring reference + SDK embedded manual strategy
- Prioritize doc generation and context help as milestoneed creator features (already mapped)

**Implementation overlay mapping (existing clusters):**
- `M8.SDK.AUTHORING_REFERENCE_FOUNDATION`
- `M9.SDK.EMBEDDED_AUTHORING_MANUAL`

---

## 6. Content/script folder conventions matter at RTS scale

**Observed in BAR repo:** Clear domain folders (rules/UI/singleplayer/tools/language etc.) improve maintainability and contributor navigation.

**Fit with IC:** **High**
- Supports D020 mod SDK + D021 campaign docs + D049 packaging clarity
- Helpful for future generated docs/manual indexing

**Risk if ignored:**
- Inconsistent community package layouts
- Harder validation/migration/doc indexing

**IC action (accepted):**
- Keep enforcing canonical layouts and metadata requirements in D020/D049/D021 docs and tooling
- Ensure the authoring manual indexes by both feature type and on-disk path conventions

**Implementation overlay mapping (existing clusters):**
- `M8.SDK.CLI_FOUNDATION`
- `M8.SDK.AUTHORING_REFERENCE_FOUNDATION`
- `M9.COM.D049_FULL_WORKSHOP_CAS`

---

## Focused Follow-Up: Netcode, Comms, and Pathfinding Lessons

This follow-up section captures lessons specifically relevant to the user's question about BAR/Recoil networking, voice/comms, and pathfinding logic.

## 7. Lockstep tradeoff realism (buffering/jitter/desync pain is real)

**Observed in Recoil netcode overview:** Classic lockstep networking keeps bandwidth low and sync deterministic, but buffering, lag smoothing, and desync diagnosis are recurring pain points. Rejoin/save behavior is also harder than it looks.

**Fit with IC:** **High (confirmatory)**
- Confirms IC's lockstep baseline and deterministic sim direction
- Reinforces the value of IC's stronger choices (relay default, sub-tick ordering, snapshots, signed replay diagnostics)

**Risk if ignored:**
- Network buffering behavior becomes opaque to players/admins ("input lag" without explanation)
- Rejoin/snapshot correctness gets under-prioritized because "lockstep is already decided"

**IC action (accepted):**
- Keep netcode buffering/jitter behavior visible in diagnostics/UX (player/admin/replay-friendly terms)
- Continue treating snapshot/rejoin/desync evidence tooling as a differentiator, not late polish
- Keep trust messaging bounded (relay protections help, but do not imply perfect anti-cheat)

**Implementation overlay mapping (existing clusters):**
- `M4.NET.RELAY_TIME_AUTHORITY_AND_VALIDATION`
- `M4.UX.MINIMAL_ONLINE_CONNECT_FLOW`
- `M7.SEC.BEHAVIORAL_ANALYSIS_REPORTING`
- `M7.NET.SPECTATOR_TOURNAMENT`

---

## 8. Protocol migration hygiene (experimental vs certified paths)

**Observed in BAR lobby releases:** Protocol transitions/rollouts (e.g., Tachyon work) benefit from explicit versioning, staged rollout behavior, and clear user-facing distinctions between paths.

**Fit with IC:** **High**
- Strongly aligned with D006 pluggable networking and IC's trust-label model for cross-engine / experimental modes

**Risk if ignored:**
- Experimental protocol paths appear equivalent to certified ones
- User confusion and support burden during netcode/bridge evolution

**IC action (accepted):**
- Keep capability/protocol/trust labeling explicit in lobby/browser UX
- Treat experimental protocol paths as first-class but clearly scoped (no silent promotion to ranked/certified)

**Implementation overlay mapping (existing clusters):**
- `M7.NET.TRACKING_BROWSER_DISCOVERY`
- `M7.NET.CROSS_ENGINE_BRIDGE_AND_TRUST`
- `M7.NET.D052_SIGNED_CREDS_RESULTS`

---

## 9. Moderation capability granularity (avoid protocol-coupled side effects)

**Observed in BAR moderation note:** A coarse "mute" implementation tied to protocol capabilities can unintentionally break unrelated gameplay/lobby actions (e.g., votes), forcing heavier sanctions than intended.

**Fit with IC:** **High**
- Validates IC's split between `Mute`, `Block`, `Avoid`, `Report`, and community review/moderation
- Supports D059/D052/D055 capability-scoped moderation design

**Risk if ignored:**
- Moderation actions produce hidden gameplay/lobby side effects
- 1v1/team integrity breaks because a "chat" sanction also disables essential non-chat interactions

**IC action (accepted):**
- Keep moderation controls capability-scoped (chat / voice / pings / votes / invites / etc.)
- Test moderation actions against role-critical flows so sanctions do not accidentally remove unrelated capabilities
- Prefer explicit suspension/restriction labels over overloaded "mute" semantics

**Implementation overlay mapping (existing clusters):**
- `M7.UX.REPORT_BLOCK_AVOID_REVIEW`
- `M7.NET.RANKED_MATCHMAKING`
- `M11.COM.ECOSYSTEM_POLISH_GOVERNANCE`

---

## 10. Pathfinding API/tuning humility (bounded script-facing queries + conformance focus)

**Observed in Recoil changelog history:** Pathfinding behavior and path-query APIs evolve over time, and regressions/tuning churn are common even in mature RTS engines.

**Fit with IC:** **Medium to High**
- Confirms IC's recent conformance-test and deterministic ordering work
- Suggests value in a future bounded path-estimate API for scripting/tooling/debugging

**Risk if ignored:**
- Pathfinding regressions become "normal" and under-instrumented
- Script/tooling requests pressure the engine into unsafe or expensive path query exposure

**IC action (accepted):**
- Keep pathfinding conformance/regression discipline as a first-class requirement (`D013`/`D045`)
- If adding script-facing path queries later, expose **bounded estimates** with explicit authority/perf semantics (not unrestricted hot-path calls)
- Document path-query APIs with the same authority-scope labeling used for other scripting APIs

**Implementation overlay mapping (existing clusters):**
- `M2.CORE.PATH_SPATIAL`
- `M5.SP.LUA_MISSION_RUNTIME`
- `M8.SDK.AUTHORING_REFERENCE_FOUNDATION`

---

## What IC Should Not Copy from BAR/Recoil

- **Engine architecture assumptions** (Spring/Recoil-specific runtime/script execution patterns)
- **UI/render stack specifics** (IC is Bevy-based and should keep a Bevy-native path)
- **Any blurring of sim-authoritative and client-local behavior** that weakens IC determinism or trust guarantees

IC should adapt the **workflow and documentation patterns**, not the engine core model.

---

## Accepted IC Actions (Condensed)

These are refinements to execution emphasis and documentation taxonomy, not new core features:

1. Strengthen local creator dev-loop workflow in `M8`/`M9` (run local content through real game flow).
2. Make authoritative-vs-local script/API boundaries explicit in generated docs + SDK context help.
3. Preserve a clear extension taxonomy for gameplay-authoritative vs local UI/QoL extensions.
4. Continue treating docs/manual discoverability as a milestoneed creator feature, not post-launch polish.
5. Keep netcode buffering/jitter/rejoin diagnostics visible and trust messaging bounded (do not hide lockstep pain behind vague labels).
6. Keep protocol/capability/trust labels explicit during network/bridge path evolution.
7. Keep moderation actions capability-scoped so "mute" or restrictions do not accidentally break unrelated match/lobby flows.
8. Treat pathfinding API exposure as a bounded, documented, conformance-tested surface rather than an ad hoc scripting convenience.

All eight are already compatible with accepted decisions (`D020`, `D037`, `D038`, `D049`, `D052`, `D055`, `D059`, `D060`, `D065`, `D066`, `D013`, `D045`) and are mapped to existing clusters in the execution overlay.

---

## Recommended Follow-Up (Optional, Later)

- Add an explicit D020/D038 note for a **local content overlay / dev profile run mode** if implementation planning needs more specificity than the current cluster mapping.
- Add a D037 authoring-manual metadata field for `authority_scope` (`sim`, `client`, `server-policy`) if not already covered by the current docs metadata schema.
