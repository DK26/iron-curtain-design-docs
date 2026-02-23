# Open-Source RTS Communication & Marker Systems — Source Study (Confirmatory Research)

> **Purpose:** Extract practical communication/coordination UX lessons (chat, voice-adjacent policy, pings/beacons/markers) from open-source RTS projects and engine docs, then map accepted takeaways into IC's D059/D065/D052 implementation overlay.
>
> **Date:** 2026-02-23
> **Status:** Confirmatory research (implementation emphasis + UX/schema hardening)

---

## Scope

This note answers a narrow question:

1. What can IC learn from open-source RTS/source-available ecosystems about **in-game chat, communication markers/beacons, and related network/moderation constraints**?

This is **not**:
- a recommendation to copy another engine architecture
- a claim that IC should clone another game's UX exactly
- a replacement for D059 (IC communication remains the canonical design)

---

## Source Quality and Limits

- **OpenRA docs/repo** are strong sources for:
  - beacon/radar ping compatibility expectations in C&C-style mission scripting
  - modding/API surface framing and user expectations around classic RTS coordination
- **Recoil/BAR docs** are strong sources for:
  - lockstep/networking tradeoff realism
  - moderation/comms policy pitfalls
  - synced vs unsynced (authoritative vs client-local) mental-model discipline
- **0 A.D. Doxygen/source docs** are useful here mainly as a **marker-rendering/readability precedent**
  - especially visual overlays, color-marked path/point rendering, and world-space marker clarity
- **C&C Generals Zero Hour source release** is a valuable source-available/open-source reference for classic C&C-era coordination feel and UX expectations (including beaconing/marker behavior), especially as a compatibility-era design benchmark alongside OpenRA

---

## Sources Reviewed

### Primary Sources

- OpenRA Lua docs index (modding/Lua API entry point)
  - <https://docs.openra.net/en/release/lua/>
- OpenRA repository (source and modding implementation context)
  - <https://github.com/OpenRA/OpenRA>
- C&C Generals Zero Hour source release (EA)
  - <https://github.com/electronicarts/CnC_Generals_Zero_Hour>
- Recoil netcode overview
  - <https://recoilengine.org/articles/netcode-overview/>
- Recoil widgets/gadgets docs (extension taxonomy + synced/unsynced framing)
  - <https://recoilengine.org/docs/guides/getting-started/widgets-and-gadgets/>
- BAR moderation policy note (mute/suspension capability-coupling lesson)
  - <https://www.beyondallreason.info/microblogs/28>
- 0 A.D. / pyrogenesis Doxygen (`CCmpVisualActor`, rally point marker rendering path)
  - <https://docs.wildfiregames.com/doxygen/pyrogenesis/dd/d5a/classCCmpVisualActor.html>

### Supporting Sources (already studied, reused here)

- `research/bar-recoil-source-study.md` (existing IC confirmatory source-study; netcode/comms/pathfinding lessons)

---

## Quick Comparison Matrix (Communication / Marker UX Fit)

This matrix is intentionally **capability-focused**, not a claim of feature parity. It is used to identify which ideas are worth adopting/adapting for IC's D059 communication system.

| Project / Ecosystem | In-game Text Chat | Built-in Voice | Pings / Beacons / Markers | Colored / Labeled Marker Expectations | Replay-Preserved Coordination Context | Moderation Capability Split Lessons | Best IC Takeaway |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **OpenRA** | Yes | Typically external voice (community tools) | Yes (beacon/radar ping ecosystem; mission/Lua expectations) | Strong expectation for clear beacons; IC should provide a richer superset with bounded styling | Mixed / depends on replay/event handling, but compatibility expectation is strong at the scripting level | Less useful than IC/BAR for moderation design details | Preserve OpenRA beacon/radar compatibility and make IC's superset explicit and replay-safe |
| **C&C Generals / Zero Hour** (EA source release) | Yes | External voice (historically) | Yes (iconic C&C beaconing feel) | Strong UX precedent for urgent, readable tactical markers/beacons; optional labels/colors fit player expectation | Historically limited compared to IC replay ambitions | Limited modern moderation lessons (era/protocol assumptions differ) | Use as a **behavior/feel** benchmark for beacon readability and urgency, not as a direct netcode/moderation template |
| **0 A.D.** | Yes | (varies / not the primary focus here) | Markers/visual overlays and rally-point/path visuals are useful precedents | Good precedent for visible world/minimap marker rendering clarity and color overlays | Not the primary lesson here | Not the primary lesson here | Borrow rendering/readability lessons for marker visibility and clutter control |
| **BAR / Recoil** | Yes | Community ecosystem often relies on external voice, but docs/policy lessons are strong | RTS coordination features exist; stronger lessons here are protocol/moderation boundaries than beacon UX specifics | Useful mainly as "don't let communication semantics drift into capability confusion" | Strong lessons via lockstep/replay/moderation/trust context | **High-value**: capability granularity (`mute`/sanction scoping) and protocol-migration trust labeling | Keep communication capability boundaries explicit and trust-labeled; avoid sanction side-effects |
| **IC (target design)** | **Yes (D059)** | **Yes (relay-forwarded, optional, channel-based)** | **Yes (pings, beacons, markers, chat wheel, minimap draw, D070 typed support markers)** | **Yes (explicit bounded style metadata: preset colors + optional short labels; icon/type semantics remain primary)** | **Yes (coordination events preserved in replay streams by design, subject to privacy/trust policy)** | **Yes (separate `Mute` / `Block` / `Avoid` / `Report` + community review pipeline design)** | Combine OpenRA/C&C readability expectations with IC's replay/trust/accessibility-first communication model |

**How to use this matrix:** treat OpenRA and Generals as **player-expectation anchors**, 0 A.D. as a **marker readability/rendering precedent**, and BAR/Recoil as a **network/moderation boundary cautionary source**. IC's D059 remains the canonical source for the actual integrated design.

---

## Generals Zero Hour Source Deep-Dive (Beacon / Chat Behavior Patterns)

This subsection captures **concrete implementation patterns** from the EA Generals Zero Hour source release (inspected locally from the EA repo, commit `0a05454`) so IC can borrow the useful UX ideas without inheriting engine-specific assumptions.

### A. Beacons are synchronized gameplay messages, not just UI decals

Observed in `GameLogicDispatch.cpp`:
- beacon placement/removal/text are handled as explicit game messages:
  - `MSG_PLACE_BEACON`
  - `MSG_REMOVE_BEACON`
  - `MSG_SET_BEACON_TEXT`
- beacon text updates are applied through the same command/message path used for other gameplay interactions

Why this matters for IC:
- This validates IC's current direction to treat pings/markers/beacons as **first-class coordination events** (replay-visible and policy-controlled), not merely client-side screen paint.

IC action (accepted, reinforced):
- Keep D059 beacon/marker events replay-preserved and policy-aware.
- Keep label metadata bounded and sanitized (already formalized in D059).

### B. Beacon readability is multi-channel: color + radar pulse + audio + EVA + text

Observed across `BeaconClientUpdate.cpp` and `GameLogicDispatch.cpp`:
- beacons use the controlling player's indicator color to pick/tint a beacon smoke particle style
- beacon client updates generate periodic radar pulses with configurable frequency/duration
- allied/observer-visible beacon placement triggers:
  - message text
  - placement audio
  - radar event
  - EVA alert (`BeaconDetected`) for allies
- beacon labels (caption text) can be attached and displayed on the beacon drawable

Why this matters for IC:
- This strongly confirms the IC D059 decision to make marker semantics **not color-only**.
- The "urgent beacon" feel comes from **stacked cues**, not just a colored ping icon.

IC action (accepted, refined):
- Keep D059 marker meaning anchored in type/icon/shape/audio.
- Treat color and optional label as bounded style metadata.
- Preserve role- and team-appropriate audio/alert hooks for high-urgency marker classes (e.g. D070 support markers).

### C. Visibility is scoped by relationship (allies/observers vs enemies)

Observed in `GameLogicDispatch.cpp`:
- allied players and observers get full beacon feedback (message/audio/radar/EVA)
- enemy players still get the beacon object path, but the beacon client update can be hidden for them (including stopping beacon visuals)

Why this matters for IC:
- This is a very strong precedent for IC's explicit `visibility_scope` / team/spectator marker policies.
- It also supports replay and moderation designs where marker existence and marker visibility are separate concerns.

IC action (accepted, reinforced):
- Keep D059 marker visibility scope explicit (`team`, `allies`, `spectator`, policy-controlled broader scopes).
- Record replay metadata so review tools know both the marker event and who was supposed to see it.

### D. Beacons have hard quantity limits and explicit failure feedback

Observed in `GameLogicDispatch.cpp`:
- per-player active beacon count is checked against `MaxBeaconsPerPlayer`
- placement failure emits UI message + failure audio (for the local player)

Why this matters for IC:
- Confirms that marker spam control should not rely only on cooldown timers or moderation after the fact.
- Hard caps + clear failure feedback are part of good UX under pressure.

IC action (accepted, refined):
- Keep D059 anti-spam/rate-limit rules explicit.
- Consider combining **rate limits + active marker caps** for persistent tactical markers/beacons in `M7`.

### E. Beacon labels are locally editable but sanitized

Observed across `ControlBarBeacon.cpp`, `GameLogicDispatch.cpp`, and `Drawable.cpp`:
- local control gating determines whether the beacon text edit UI is shown
- beacon text is sent via a message path and applied to the beacon drawable caption
- caption text is language-filtered/sanitized before rendering

Why this matters for IC:
- Confirms IC's optional marker labels need:
  - ownership/permission checks
  - sanitization
  - bounded length
- Also confirms value of contextual UI for editing marker labels (not command syntax only).

IC action (accepted, refined):
- Keep D059 labeled markers opt-in and sanitized.
- Preserve both visible UI editing paths and command/shortcut paths for marker labels.

### F. In-game chat channels are implemented as recipient masks, not UI-only categories

Observed in `InGameChat.cpp`, `Network.cpp`, and `ConnectionManager.cpp`:
- UI presents `Everyone / Allies / Players` chat scopes
- scope selection is translated into a recipient bitmask (`playerMask`)
- text is language-filtered before send
- chat send path includes an `executionFrame` and goes through the network command stream
- local UI preserves draft text across chat hide/show
- chat entry is suppressed in replay and certain modal/disconnect states

Why this matters for IC:
- This is a direct precedent for D059's distinction between:
  - UI labels/scopes
  - underlying visibility/recipient semantics
- It also reinforces the value of chat UX details that reduce friction (draft preservation, modal-state rules).

IC action (accepted, refined):
- Keep D059 chat/marker scopes backed by explicit visibility/recipient semantics (not only UI labels).
- Preserve draft text and non-disruptive hide/show behavior where possible.
- Keep replay/observer/state gating explicit in communication UI rules.

### G. What Generals source is useful for vs not useful for

Useful to borrow/adapt:
- beacon urgency/readability patterns (multi-channel cues)
- relationship-scoped visibility behavior
- marker cap + failure feedback UX
- recipient-mask chat scope semantics
- local edit UI + sanitized label handling

Not a direct template for IC:
- modern moderation/review capability split (BAR/Recoil + IC's D052/D037 are more useful here)
- IC relay/trust-label anti-cheat claims (different era/protocol assumptions)
- IC replay evidence/trust pipeline (IC already targets a richer system)

---

## High-Value Lessons (Fit / Risk / IC Action)

## 1. OpenRA beacon/radar compatibility is a real user expectation, not a niche modding edge case

**Observed signal:** OpenRA's Lua/modding ecosystem is a primary compatibility target for IC, and beacon/radar ping semantics are part of the expected mission-authoring toolbox (already reflected in D059's D024 compatibility layer).

**Fit with IC:** **High**
- IC already commits to OpenRA compatibility at the data/community layer (D011, D024, D025)
- D059 already defines `Beacon`/`Radar` compatibility mapping and IC supersets (`Ping`, `Marker`)

**Risk if ignored or under-specified:**
- "Beacon support" exists on paper, but marker appearance/labels/visibility/replay semantics are inconsistent across UI paths
- Mission authors and co-op players experience marker UX drift (Lua vs UI vs console vs replay)

**IC action (accepted):**
- Keep OpenRA beacon/radar compatibility as a first-class D059 requirement
- Explicitly define marker/beacon appearance metadata (label/color/visibility/TTL) and replay-safe behavior in D059 (now done)
- Treat styled markers as presentation metadata, not gameplay semantics (protects accessibility and compatibility boundaries)

**Implementation overlay mapping (existing/new clusters):**
- `M5.SP.LUA_MISSION_RUNTIME`
- `M7.UX.D059_BEACONS_MARKERS_LABELS`
- `M10.GAME.D070_TEMPLATE_TOOLKIT`

---

## 2. Marker semantics should be separate from marker appearance (shape/icon first, color second)

**Observed signal:** RTS marker readability benefits from multiple channels (icon/shape/animation + color accent + optional label), not color-only differentiation. 0 A.D.'s rally-point/path visualization code path reinforces the importance of visually legible overlays/lines/points in a top-down strategy context.

**Fit with IC:** **High**
- Matches D059 accessibility and anti-spam goals
- Fits D070 role-aware typed markers (`lz`, `cas_target`, `recon_sector`) where meaning must stay clear under pressure
- Fits IC's touch/controller parity constraints (shape/icon survives small-screen color ambiguity)

**Risk if ignored:**
- Color-only beacons fail colorblind accessibility and spectator clarity
- Labeled markers become clutter/noise without type/icon hierarchy
- Moderation and replay review lose semantic clarity ("what did this marker mean?")

**IC action (accepted):**
- Keep marker/ping type as the authoritative semantic meaning
- Allow only bounded style overrides (preset palette + short label) under D059 rules
- Preserve icon/shape/audio cues regardless of color accent
- Keep label length short and sanitized

**Implementation overlay mapping (existing/new clusters):**
- `M7.UX.D059_BEACONS_MARKERS_LABELS`
- `M10.GAME.D070_TEMPLATE_TOOLKIT`

---

## 3. Communication/moderation capability coupling causes avoidable UX failures

**Observed in BAR moderation note:** If protocol or moderation semantics are too blunt (e.g., a "mute" restriction affecting unrelated actions), users lose legitimate match functions and trust in moderation tooling.

**Fit with IC:** **High**
- IC already split `Mute` / `Block` / `Avoid` / `Report` / review pipeline
- D059 now carries pings, markers, minimap draw, chat, and voice in one communication umbrella, so capability scoping must stay explicit

**Risk if ignored:**
- Sanctions accidentally disable critical tactical coordination (pings/markers) or voting
- Competitive integrity and user trust degrade because moderation effects are unpredictable

**IC action (accepted):**
- Keep capability-scoped moderation and rate limits explicit for:
  - chat
  - voice
  - pings/beacons
  - minimap drawing
  - votes
- Test sanctions against critical match flows (especially ranked/team and D070 role coordination)

**Implementation overlay mapping (existing clusters):**
- `M7.UX.REPORT_BLOCK_AVOID_REVIEW`
- `M7.NET.RANKED_MATCHMAKING`
- `M11.COM.ECOSYSTEM_POLISH_GOVERNANCE`
- `M7.UX.D059_BEACONS_MARKERS_LABELS`

---

## 4. Replay-preserved coordination context is a multiplier for moderation, teaching, and co-op iteration

**Observed signal (OpenRA + Recoil/BAR context + IC direction):**
- Marker/beacon systems are most useful when they remain understandable after the match (replays, review, coaching, creator iteration)
- IC already treats pings/chat wheel/markers as deterministic coordination events in D059

**Fit with IC:** **High**
- Strongly aligned with D010 snapshots/replays and D052/D037 moderation evidence goals
- Particularly valuable for D070 role coordination debugging and "Ops Prologue" playtests

**Risk if ignored:**
- Replays show combat outcomes but lose team intent/context
- Creator and moderation workflows rely on guesswork instead of visible coordination history

**IC action (accepted):**
- Keep pings/markers/labels/style metadata replay-safe (subject to privacy/trust policy)
- Ensure replay/timeline UIs preserve enough semantic marker context for review
- Maintain non-color-only marker meaning for replay/spectator readability

**Implementation overlay mapping (existing/new clusters):**
- `M7.UX.D059_BEACONS_MARKERS_LABELS`
- `M7.SEC.BEHAVIORAL_ANALYSIS_REPORTING`
- `M7.NET.SPECTATOR_TOURNAMENT`
- `M10.GAME.D070_TEMPLATE_TOOLKIT`

---

## 5. Built-in voice is a product decision, but marker/ping quality reduces voice dependence (especially with strangers)

**Observed signal:** Open-source RTS ecosystems often rely on external voice. IC intentionally chose built-in voice (D059), but high-quality pings/beacons/markers still matter because they:
- reduce coordination load
- help cross-language teams
- help mobile/controller users
- provide replay-visible intent (voice may be stripped in ranked replay submissions)

**Fit with IC:** **High**
- Confirms D059's three-tier coordination model (text + voice + pings/markers)
- Supports D065 cross-device prompting and D070 role-aware coordination

**Risk if ignored:**
- Built-in voice becomes the only good coordination path
- Cross-language and accessibility value of D059 is undercut

**IC action (accepted):**
- Treat marker/ping/beacon polish as a first-class `M7` communication deliverable, not "voice is enough"
- Maintain feature parity and discoverability across KBM/controller/touch for marker placement and review

**Implementation overlay mapping (existing/new clusters):**
- `M7.UX.D059_BEACONS_MARKERS_LABELS`
- `M6.UX.D065_ONBOARDING_COMMANDER_SCHOOL`
- `M11.PLAT.BROWSER_MOBILE_POLISH`

---

## What Not to Copy

- **Do not** copy engine-specific scripting/runtime assumptions that blur IC's sim/UI authority boundaries
- **Do not** make marker color or free-text labels the authoritative semantics (type/icon must remain primary)
- **Do not** let moderation restrictions collapse communication capabilities into one blunt toggle
- **Do not** assume built-in voice reduces the need for strong non-verbal coordination UX

---

## Accepted IC Actions (Consolidated)

1. Keep OpenRA beacon/radar compatibility as a first-class communication compatibility requirement (D024 -> D059).
2. Treat marker semantics (type/icon/audio) as primary and style (color/label/TTL/visibility) as bounded presentation metadata.
3. Keep communication capability scoping explicit across moderation/sanctions (`Mute`/`Block`/`Avoid`/`Report` + ping/draw/vote/voice boundaries).
4. Preserve coordination context in replays for moderation, teaching, and D070 co-op iteration.
5. Treat beacon/marker UX polish as a first-class `M7` communication deliverable, not optional polish hidden behind built-in voice.
6. Keep chat/beacon scope semantics represented as explicit recipient/visibility metadata (not only UI categories), and preserve draft/state-aware chat UX behavior.
7. Combine rate limits with persistent-marker/beacon active caps and clear local failure feedback in D059 `M7` delivery.

---

## Overlay Mapping Note

Accepted takeaways from this note are mapped into:
- `src/tracking/milestone-dependency-map.md` (External Source Study Mappings)
- `src/18-PROJECT-TRACKER.md` risk/watchlist and milestone notes as needed

This note is evidence and implementation emphasis input, not a canonical replacement for D059/D052/D065.
