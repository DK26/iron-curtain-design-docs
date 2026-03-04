# Developer Task Checklists

## M1-M3 Developer Task Checklist (`G1-G16`)

Use this as the implementation handoff checklist for the **first playable Red Alert mission loop**. It is intentionally more concrete than the milestone prose and should be used to structure early engineering tickets/work packages.

### Phase 1 Checklist (`M1`: Render and Recognize RA)

| Step | Work Package (Implementation Bundle)                                                                        | Suggested Verification / Proof Artifact                   | Completion Notes                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `G1` | Implement core RA asset parsing in `ra-formats` for `.mix`, `.shp`, `.pal` + real-install asset enumeration | Parser corpus tests + sample asset enumeration output     | Include malformed/corrupt fixture expectations and error behavior          |
| `G2` | Implement Bevy map/sprite render slice (palette-correct draw, camera controls, static scene)                | Known-map visual capture + regression screenshot set      | Palette correctness should be checked against a reference image set        |
| `G3` | Implement unit sprite sequence playback (idle/move/fire/death)                                              | Short capture (GIF/video) + sequence timing sanity checks | Keep sequence lookup conventions compatible with later variant skins/icons |

#### `G1.x` Substeps (Owned-Source Import/Extract Foundations for `M3` Setup Wizard Handoff)

| Substep | Work Package (Implementation Bundle)                                                                               | Suggested Verification / Proof Artifact                        | Completion Notes                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `G1.1`  | Source-adapter probe contract + source-manifest snapshot schema (Steam/GOG/EA/manual/Remastered normalized output) | Probe fixture snapshots + schema examples                      | Must match D069 setup wizard expectations and support D068 mixed-source planning          |
| `G1.2`  | `.mix` extraction primitives for importer staging (enumerate/validate/extract without source mutation)             | `.mix` extraction corpus tests + corrupt-entry handling checks | Originals remain read-only; extraction outputs feed IC-managed storage pipeline           |
| `G1.3`  | `.shp/.pal` importer-ready validation and parser-to-render handoff metadata                                        | Validation fixture tests + parser->render handoff smoke tests  | This bridges `G1` format work and `G2/G3` render/animation slices                         |
| `G1.4`  | `.aud/.vqa` header/chunk integrity validation and importer result diagnostics                                      | Media validation tests + importer diagnostic output samples    | Playback can remain later; importer correctness and failure messages are the goal here    |
| `G1.5`  | Importer artifact outputs (source manifest snapshot, per-item results, provenance, retry/re-scan metadata)         | Artifact sample set + provenance metadata checks               | Align artifacts with `05-FORMATS` owned-source pipeline and D069 repair/maintenance flows |
| `G1.6`  | Remastered Collection source adapter probe + normalized importer handoff (out-of-the-box import path)              | D069 setup import demo using a Remastered install              | Explicitly verify no manual conversion and no source-install mutation                     |

### Phase 2 Checklist (`M2`: Interactivity + Deterministic Core)

| Step  | Work Package (Implementation Bundle)                                                      | Suggested Verification / Proof Artifact                                                                | Completion Notes                                                                        |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `G4`  | Cursor + hover hit-test primitives for cells/entities in gameplay scene                   | Manual demo clip + hit-test unit tests (cell/entity under cursor)                                      | Cursor semantics should remain compatible with D059/D065 input profile layering         |
| `G5`  | Selection baseline (single select + minimum multi-select/box select + selection markers)  | Manual test checklist + screenshot/video for each selection mode                                       | Use sim-derived selection state; avoid render-only authority                            |
| `G6`  | Deterministic sim tick loop + basic order application (`move`, `stop`, state transitions) | Determinism test (`same inputs -> same hash`) + local replay pass                                      | P002 resolved (1024). Use `Fixed(i32)` types from `research/fixed-point-math-design.md` |
| `G7`  | Integrate `Pathfinder` + `SpatialIndex` into movement order execution                     | Conformance tests (`PathfinderConformanceTest`, `SpatialIndexConformanceTest`) + in-game movement demo | P002 resolved; preserve deterministic spatial-query ordering                            |
| `G8`  | Render/sim sync for movement/facing/animation transitions                                 | Visual movement correctness capture + replay-repeat visual spot check                                  | Prevent sim/render state drift during motion                                            |
| `G9`  | Combat baseline (targeting + hit/damage resolution or narrow direct-fire first slice)     | Deterministic combat replay test + combat demo clip                                                    | Prefer narrow deterministic slice over broad weapon feature scope                       |
| `G10` | Death/destruction transitions (death state, animation, cleanup/removal)                   | Deterministic combat replay with death assertions + cleanup checks                                     | Removal timing must remain sim-authoritative                                            |

### Phase 3 Checklist (`M3`: First Complete Mission Loop)

| Step  | Work Package (Implementation Bundle)                                                       | Suggested Verification / Proof Artifact                                              | Completion Notes                                                      |
| ----- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `G11` | Sim-authoritative mission-end evaluators (`all enemies dead`, `all player units dead`)     | Unit/integration tests for victory/failure triggers + replay-result consistency test | Implement result logic in sim state, not UI heuristics                |
| `G12` | Mission-end UI shell (`Mission Accomplished` / `Mission Failed`) + flow pause/transition   | Manual UX walkthrough capture + state-transition assertions                          | UI consumes authoritative result from `G11`                           |
| `G13` | EVA/VO integration for mission-end outcomes                                                | Audio event trace/log + manual verification clip for both result states              | ~~`P003`~~ ✓ resolved; depends on `M3.CORE.AUDIO_EVA_MUSIC` baseline  |
| `G14` | Restart/exit flow from mission results (replay mission / return to menu)                   | Manual loop test (`start -> end -> replay`, `start -> end -> exit`)                  | This closes the first full mission loop                               |
| `G15` | "Feels like RA" pass (cursor feedback, selection readability, audio timing, result pacing) | Internal playtest notes + short sign-off checklist                                   | Keep scope to first mission loop polish, not full skirmish parity     |
| `G16` | Widen from fixed mission slice to local skirmish + narrow `D043` basic AI subset           | `M3.SP.SKIRMISH_LOCAL_LOOP` validation run + explicit AI subset scope note           | Freeze `M3` AI subset before implementation to avoid `M6` scope creep |

### Required Closure Gates Before Marking `M3` Exit

- ~~`P002` fixed-point scale resolved and reflected in sim/path/combat assumptions (`G6-G10`)~~ ✓ DONE
- ~~`P003` audio library/music integration resolved before finalizing `G13/G15`~~ ✓ DONE (Kira)
- `D043` **M3 basic AI subset** explicitly frozen (scope boundary vs `M6`)
- End-to-end mission loop validated:
  - start mission
  - play mission
  - trigger victory and failure
  - show correct UI + VO
  - replay/exit correctly

### Suggested Evidence Pack for the First Public "Playable" Update

When `G16` is complete, the first public progress update should ideally include:

- one short local skirmish gameplay clip
- one mission-loop clip showing win/fail result screens + EVA/VO
- one deterministic replay/hash proof note (engineering credibility)
- one short note documenting the frozen `M3` AI subset and deferred `M6` AI scope
- one tracker update setting relevant `M1/M2/M3` cluster `Code Status` values with evidence links

For ticket breakdown format, use:
- `src/tracking/implementation-ticket-template.md`

## M5-M6 Developer Task Checklist (Campaign Runtime -> Full Campaign Completion, `G18.1-G19.6`)

Use this checklist to move from "local skirmish exists" to "campaign-first differentiator delivered."

### Phase 4 / `M5` Checklist (Campaign Runtime Vertical Slice)

| Step    | Work Package (Implementation Bundle)                                                                    | Suggested Verification / Proof Artifact                                                   | Completion Notes                                                      |
| ------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `G18.1` | Lua mission runtime baseline (`D004`) with deterministic sandbox boundaries and mission lifecycle hooks | Mission script runtime smoke tests + deterministic replay pass on scripted mission events | Keep API scope explicit and aligned with D024/D020 docs               |
| `G18.2` | Campaign graph runtime + persistent campaign state save/load (`D021`)                                   | Save/load tests across mission transition + campaign-state roundtrip tests                | Campaign state persistence must be independent of UI flow assumptions |
| `G18.3` | Briefing -> mission -> debrief -> next flow (`D065` UX layer on `D021`)                                 | Manual walkthrough capture + scripted regression path for one campaign chain              | UX should consume campaign runtime state, not duplicate it            |
| `G18.4` | Failure/continue/retry behavior + campaign save/load correctness for the vertical slice                 | Failure-path regression tests + manual retry/resume loop test                             | `M5` exit requires both success and failure paths to be coherent      |

### Phase 4 / `M6` Checklist (Full Campaigns + SP Maturity)

| Step    | Work Package (Implementation Bundle)                                                                                                                                                           | Suggested Verification / Proof Artifact                                                                                                                                | Completion Notes                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G19.1` | Scale campaign runtime to full shipped mission set (scripts/objectives/transitions/outcomes)                                                                                                   | Campaign mission coverage matrix + per-mission load/run smoke tests                                                                                                    | Track missing/unsupported mission behaviors explicitly; no silent omissions                                                                                                  |
| `G19.2` | Branching persistence, roster carryover, named-character/hero-state carryover correctness                                                                                                      | Multi-mission branch/carryover test suite + state inspection snapshots                                                                                                 | Includes D021 hero/named-character state correctness where used                                                                                                              |
| `G19.3` | Video cutscenes (FMV) + rendered cutscene baseline (`Cinematic Sequence` world/fullscreen) + OFP-style trigger-camera scene property-sheet baseline + fallback-safe campaign behavior (`D068`) | Manual video/no-video/rendered/no-optional-media campaign path tests + fallback validation checklist + at least one no-Lua trigger-authored camera scene proof capture | Campaign must remain playable without optional media packs or optional visual/render-mode packs; trigger-camera scenes must declare audience scope and fallback presentation |
| `G19.4` | Skirmish AI baseline maturity + campaign/tutorial script support (`D043/D042`)                                                                                                                 | AI behavior baseline playtests + scripted mission support validation                                                                                                   | Avoid overfitting to campaign scripts at expense of skirmish baseline                                                                                                        |
| `G19.5` | D065 onboarding baseline for SP (Commander School, progressive hints, controls walkthrough integration)                                                                                        | Onboarding flow walkthroughs (KBM/controller/touch where supported) + prompt correctness checks                                                                        | Prompt drift across input profiles is a known risk; test profile-aware prompts                                                                                               |
| `G19.6` | Full RA campaign validation (Allied + Soviet): save/load, media fallback, progression correctness                                                                                              | Campaign completion matrix + defect list closure + representative gameplay captures                                                                                    | `M6` exit is content-complete and behavior-correct, not just "most missions run"                                                                                             |

### Required Closure Gates Before Marking `M6` Exit

- All shipped campaign missions can be started and completed in campaign flow (Allied + Soviet)
- Save/load works mid-campaign and across campaign transitions
- Branching/carryover state correctness validated on representative branch paths
- Optional media missing-path remains playable (fallback-safe)
- D065 SP onboarding baseline is enabled and prompt-profile correct for supported input modes

## M4-M7 Developer Task Checklist (Minimal Online Slice -> Multiplayer Productization, `G17.1-G20.5`)

Use this checklist to keep the multiplayer path architecture-faithful and staged: **minimal online first, productization second**.

### `M4` Checklist (Minimal Online Slice)

| Step    | Work Package (Implementation Bundle)                                                          | Suggested Verification / Proof Artifact                                 | Completion Notes                                   |
| ------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `G17.1` | Minimal host/join path (`direct connect` or `join code`) on final `NetworkModel` architecture | Two-client connect test (same LAN + remote path where possible)         | Do not pull in tracker/browser/ranked assumptions  |
| `G17.2` | Relay time authority + sub-tick normalization/clamping + sim-side validation path             | Timing/fairness test logs + deterministic reject consistency checks     | Keep trust claims bounded to `M4` slice guarantees |
| `G17.3` | Full minimal online match loop (play -> result -> disconnect)                                 | Multiplayer demo capture + replay/hash consistency note                 | Proves `M4` architecture in live conditions        |
| `G17.4` | Reconnect baseline implementation **or** explicit defer contract + UX wording                 | Reconnect test evidence or documented defer contract with UX mock proof | Either path is valid; ambiguity is not             |

### `M7` Checklist (Multiplayer Productization)

| Step    | Work Package (Implementation Bundle)                                              | Suggested Verification / Proof Artifact                                              | Completion Notes                                                                |
| ------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `G20.1` | Tracking/browser discovery + trust labels + lobby listings                        | Browser/lobby walkthrough captures + trust-label correctness checklist               | Trust labels must match actual guarantees (D011/D052/07-CROSS-ENGINE)           |
| `G20.2` | Signed credentials/results + community-server trust path (`D052`)                 | Credential/result signing tests + server trust path validation                       | ~~`P004`~~ ✓ resolved; see `research/lobby-matchmaking-wire-protocol-design.md` |
| `G20.3` | Ranked queue + tiers/seasons + queue health/degradation rules (`D055`)            | Ranked queue test plan + queue fallback/degradation scenarios                        | Avoid-list guarantees and queue-health messaging must be explicit               |
| `G20.4` | Report/block/avoid UX + moderation evidence attachment + optional review baseline | Report workflow demo + evidence attachment audit + sanctions capability-matrix tests | Keep moderation capabilities granular; avoid coupling failures                  |
| `G20.5` | Spectator/tournament basics + signed replay/evidence workflow                     | Spectator match capture + replay evidence verification + tournament-path checklist   | `M7` exit requires browser/ranked/trust/moderation/spectator coherence          |

### Required Closure Gates Before Marking `M7` Exit

- ~~`P004` resolved and reflected in multiplayer/lobby integration details~~ ✓ DONE (see `research/lobby-matchmaking-wire-protocol-design.md`)
- Trust labels verified against actual host modes and guarantees
- Ranked, report/avoid, and moderation flows are distinct and understandable
- Signed replay/evidence workflow exists for moderation/tournament review paths

## M8-M11 Developer Task Checklist (Creator Platform -> Full Authoring Platform -> Optional Polish, `G21.1-G24.3`)

Use this checklist to keep the creator ecosystem and optional/polish work sequenced correctly after runtime/network foundations.

### `M8` Checklist (Creator Foundation)

| Step    | Work Package (Implementation Bundle)                                              | Suggested Verification / Proof Artifact                                 | Completion Notes                                                                      |
| ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `G21.1` | `ic` CLI foundation + local content overlay/dev-profile run path                  | CLI command demos + local-overlay run proof via real game runtime       | Must preserve D062 fingerprint/profile boundaries and explicit local-overlay labeling |
| `G21.2` | Minimal Workshop delivery baseline (`publish/install`)                            | Publish/install smoke tests + package verification basics               | Keep scope minimal; full federation/CAS belongs to `M9`                               |
| `G21.3` | Mod profiles + virtual namespace + selective install hooks (`D062/D068`)          | Profile activation/fingerprint tests + install-preset behavior checks   | Fingerprint boundaries (gameplay/presentation/player-config) must remain explicit     |
| `G21.4` | Authoring reference foundation (generated YAML/Lua/CLI docs, one-source pipeline) | Generated docs artifact + versioning metadata + search/index smoke test | This is the foundation for the embedded SDK manual (`M9`)                             |

#### `G21.x` Substeps (Owned-Source Import Tooling / Diagnostics / Docs)

| Substep  | Work Package (Implementation Bundle)                                                               | Suggested Verification / Proof Artifact                                           | Completion Notes                                                                          |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `G21.1a` | CLI import-plan inspection for owned-source imports (probe output, source selection, mode preview) | `ic` CLI demo showing import-plan preview for owned source(s)                     | Must reflect D069 import modes and D068 install-plan integration without executing import |
| `G21.2a` | Owned-source import verify/retry diagnostics (distinct from Workshop package verify)               | Diagnostic output samples + failure/retry smoke tests                             | Keep source-probe/import/extract/index failures distinguishable and actionable            |
| `G21.3a` | Repair/re-scan/re-extract tooling for owned-source imports (maintenance parity with D069)          | Maintenance CLI demo for moved source path / stale index recovery                 | Must preserve source-install immutability and provenance history                          |
| `G21.4a` | Generated docs for import modes + format-by-format importer behavior (from `05-FORMATS`)           | Generated doc page artifact + search hits for importer/extractor reference topics | One-source docs pipeline only; this feeds SDK embedded help in `M9`                       |

#### `G21.x` Substeps (P2P Engine — `p2p-distribute` Standalone Crate)

| Substep | Work Package (Implementation Bundle)                                                                                                                              | Suggested Verification / Proof Artifact                                                      | Completion Notes                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `G21.5` | `p2p-distribute` core engine: bencode codec + BEP 3 wire protocol + piece picker + storage backend + choking algorithm + HTTP tracker                             | Single-seed→single-leech transfer of a multi-piece torrent; round-trip bencode fuzz passing  | Separate MIT/Apache-2.0 repo (D076 Tier 3); no IC or GPL dependencies. See `research/p2p-distribute-crate-design.md` milestones 1–3. |
| `G21.6` | `p2p-distribute` config system + profiles + peer discovery + NAT traversal: 10 knob groups, 4 built-in profiles, UDP tracker, PEX, DHT, UPnP/NAT-PMP, uTP, LSD    | Profile-switching demo (embedded→desktop→seedbox); DHT bootstrap + peer discovery smoke test | Design milestones 4–5, 7, 9 (subset). LAN discovery via LSD must work without internet.                                              |
| `G21.7` | `p2p-distribute` embedded tracker + IC integration baseline: HTTP announce/scrape with auth hook; `workshop-core` wraps P2P session; `ic-server` Workshop seeding | `ic-server --cap workshop` seeds a package; game client auto-downloads on lobby join via P2P | Depends on G21.2 (minimal Workshop baseline). Design milestones 6 + IC integration section.                                          |

### `M9` Checklist (Scenario Editor Core + Workshop + OpenRA Export Core)

| Step    | Work Package (Implementation Bundle)                                                 | Suggested Verification / Proof Artifact                                               | Completion Notes                                                          |
| ------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `G22.1` | Scenario Editor core (`D038`) + validate/test/publish loop + resource manager basics | End-to-end authoring demo (`edit -> validate -> test -> publish`)                     | Keep simple/advanced mode split intact                                    |
| `G22.2` | Asset Studio baseline (`D040`) + import/conversion + provenance plumbing             | Asset import/edit/publish-readiness demo + provenance metadata checks                 | Provenance UI should not block basic authoring flow in simple mode        |
| `G22.3` | Full Workshop/CAS + moderation tooling + OpenRA export core (`D049/D066`)            | Full publish/install/autodownload/CAS flow tests + `ic export --target openra` checks | Export-safe warnings/fidelity reports must be explicit and accurate       |
| `G22.4` | SDK embedded authoring manual + context help (`F1`, `?`)                             | SDK docs browser/context-help demo + offline snapshot proof                           | Must consume one-source docs pipeline from `G21.4`, not a parallel manual |

#### `G22.x` Substeps (P2P Hardening + Control Surfaces)

| Substep  | Work Package (Implementation Bundle)                                                                                                                                                    | Suggested Verification / Proof Artifact                                                          | Completion Notes                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `G22.3a` | `p2p-distribute` hardening + control surfaces: fuzz suite (bencode/wire/metadata), chaos tests, v2/hybrid BEP 52, storage perf, web API + JSON-RPC + CLI + metrics, `crates.io` publish | Fuzz corpus >1M iterations; chaos-test report (packet loss/reorder/delay); `crates.io` published | Design milestones 6, 8–10. Publishing to `crates.io` is exit criterion for standalone-crate promise. |

### `M10` Checklist (Campaign Editor + Modes + RA1 Export + Extensibility)

| Step    | Work Package (Implementation Bundle)                                                                              | Suggested Verification / Proof Artifact                                                 | Completion Notes                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `G23.1` | Campaign Editor + intermissions/dialogue/named characters + campaign test tools                                   | Campaign authoring demo + campaign test/preview workflow evidence                       | Includes hero/named-character authoring UX and state inspection         |
| `G23.2` | Game mode templates + D070 family toolkit (Commander & SpecOps, commander-avatar variants, experimental survival) | Authoring + playtest demos for at least one D070 scenario and one experimental template | Keep experimental labels and PvE-first constraints explicit             |
| `G23.3` | RA1 export + plugin/extensibility hardening + localization/subtitle tooling                                       | RA1 export validation + plugin capability/version checks + localization workflow demo   | Maintain simple/advanced authoring UX split while adding power features |

### `M11` Checklist (Ecosystem Polish + Optional Systems)

| Step    | Work Package (Implementation Bundle)                                                                         | Suggested Verification / Proof Artifact                           | Completion Notes                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `G24.1` | Governance/reputation polish + creator feedback recognition maturity + optional contributor cosmetic rewards | Abuse/audit test plan + profile/reward UX walkthrough             | No gameplay/ranked effects; profile-only rewards remain enforced                    |
| `G24.2` | Optional BYOLLM stack (`D016/D047/D057`) + local/cloud prompt strategy + editor assistant surfaces           | BYOLLM provider matrix tests + prompt-strategy probe/eval demos   | Must remain fully optional and fallback-safe                                        |
| `G24.3` | Optional visual/render-mode expansion (`D048`) + browser/mobile/Deck polish                                  | Cross-platform visual/perf captures + low-end baseline validation | Preserve "no dedicated gaming GPU required" path while adding optional visual modes |

### Required Closure Gates Before Marking `M9`, `M10`, and `M11` Exits

- **`M9`**:
  - scenario editor core + asset studio + full Workshop/CAS + OpenRA export core all work together
  - embedded authoring manual/context help uses the one-source docs pipeline
- **`M10`**:
  - campaign editor + advanced mode templates + RA1 export/extensibility/localization surfaces are validated and usable
  - experimental modes remain clearly labeled and do not displace core template validation
- **`M11`**:
  - optional systems (`BYOLLM`, render-mode/platform polish, contributor reward points if enabled) remain optional and do not break lower-milestone guarantees
  - any promoted optional system has explicit overlay remapping and updated trust/fairness claims where relevant
