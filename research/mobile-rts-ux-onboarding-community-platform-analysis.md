# Mobile RTS UX, Onboarding, and Community Platform Fit — Confirmatory Research

> **Purpose:** Confirm and refine IC's mobile RTS controls, cross-device onboarding, and mobile community-platform UX decisions (D059, D065, D020/D030-adjacent surfaces) using prior art from open-source strategy games and RTS references.
>
> **Date:** 2026-02-22
> **Status:** Confirmatory research (supports and refines existing design direction)

---

## Scope

This research focuses on four questions:

1. What mobile/touch UI/control patterns are proven for strategy games that map to IC's RTS goals?
2. How should onboarding/tutorial content adapt across desktop and touch without duplicating content?
3. What community-platform/mobile distribution friction should IC avoid?
4. Which features (camera bookmarks, tempo guidance) fit IC's philosophy and architecture without adding parallel systems?

This is **not** a full implementation spec. The implementation decisions live in:

- `src/decisions/09g-interaction.md` (D058/D059/D065)
- `src/17-PLAYER-FLOW.md`
- `src/02-ARCHITECTURE.md`
- `src/decisions/09b-networking.md`
- `src/decisions/09d-gameplay.md`

---

## Sources Reviewed

### Primary / Official

- Unciv GitHub repository and README (project scope, platform targets, roadmap): <https://github.com/yairm210/Unciv>
- Unciv project structure docs (shared core + thin platform modules): <https://yairm210.github.io/Unciv/Contributing/Project-structure/>
- Unciv UI development docs (UI workflow and tooling): <https://yairm210.github.io/Unciv/Contributing/UI-documentation/>
- Unciv UI skin docs (config-driven per-screen/per-element styling): <https://yairm210.github.io/Unciv/Modders/Creating-a-UI-skin/>
- Unciv mod management docs (in-app mod flows, Android notes, GitHub topic discovery): <https://yairm210.github.io/Unciv/Modders/Mod-management/>
- Mindustry repository (multi-platform structure, mobile + desktop support): <https://github.com/Anuken/Mindustry>

### Product / Reference Patterns

- C&C Generals / Zero Hour (camera bookmark navigation pattern; referenced conceptually)
- OpenRA (community RTS UX conventions and modern RTS command semantics; multiple existing IC research docs already cover code architecture)
- AoE2:DE / StarCraft II / Factorio (IC already uses these as UX references in player flow and decision docs)

### Community Signals / Criticism (Anecdotal, Used as Risk Indicators)

- Unciv Android modding friction issue (`#3114`): <https://github.com/yairm210/Unciv/issues/3114>
- Unciv mod install-from-URL / distribution UX issue (`#9132`): <https://github.com/yairm210/Unciv/issues/9132>
- Mindustry mobile control discussions (discoverability / gesture expectations): <https://www.reddit.com/r/Mindustry/comments/g4ea5l/how_do_you_control_units_on_mobile/> and <https://www.reddit.com/r/Mindustry/comments/1i00g0l/friendly_reminder_that_you_used_to_be_able_to/>

> Note: Reddit/community threads are treated as **qualitative signals**, not canonical truth.

---

## Findings (What Prior Art Validates)

## 1. Shared Core + Platform-Specific Presentation Is the Right Shape

Unciv and Mindustry both validate a strong shared-core approach with platform-specific shells/adapters.

**IC application:**
- Keep gameplay semantics and `PlayerOrder` generation invariant
- Adapt touch vs desktop at the `InputSource` + `ic-ui` layout layer
- Do not fork tutorial content or gameplay rules for mobile

This supports IC's existing `InputSource` / `InputCapabilities` / `ScreenClass` design and the new D065 cross-device tutorial prompt rendering.

## 2. Mobile Strategy UX Needs Visible Alternatives to Hidden Gestures

Community friction patterns repeatedly show the same problem: advanced gestures/features become discoverability debt on small screens.

**IC application:**
- Context tap as the default path
- Optional command rail for explicit overrides
- Camera bookmarks exposed as visible chips (not minimap gesture overload)
- Controls walkthrough + persistent quick-reference overlay for mobile

This directly informed D059/D065 revisions and the mobile HUD changes in `17-PLAYER-FLOW.md`.

## 3. Community Platform UX on Mobile Must Be In-App First

Unciv issue reports highlight mobile filesystem/path friction and non-primary distribution flows as recurring pain.

**IC application:**
- Workshop-first mobile install/update/enable flows
- No required manual file-path workflows on mobile for normal use
- Advanced import remains available but not the main path

This reinforces IC's "No Dead-End Buttons" and community-first platform design philosophy.

## 4. Cross-Device Onboarding Should Teach Concepts, Not Hardware Inputs

The strongest way to avoid duplicated tutorial content is to teach actions semantically and render device-specific instructions at the UI layer.

**IC application:**
- D065 tutorial prompts use semantic action tokens
- `highlight_ui` can target semantic aliases resolved by layout profile
- Same mission graph and completion logic for desktop and touch

This reduces maintenance cost and keeps onboarding consistent across platforms.

## 5. Camera Bookmarks Are a High-Value, Low-Risk QoL Feature

C&C Generals-style camera location bookmarks are a proven RTS navigation accelerator and map cleanly to IC's architecture because they are local camera state.

**IC application:**
- First-class bookmarks on desktop and touch
- Client-local only (no sim/net impact)
- Teach in controls tutorial and Commander School controls lesson

This aligns with "reduce cognitive load" and avoids adding a parallel system.

## 6. Mobile Tempo Comfort Is Real, but Hard Limits Would Conflict With IC Philosophy

Touch input can become overwhelming at high speeds, but hard caps would violate player agency and ranked/netcode boundaries.

**IC application:**
- Tempo Advisor as advisory only
- Any speed allowed in SP/casual where existing rules allow it
- Ranked speed authority unchanged (server/queue enforced)
- Playtest-tuned recommendation bands and warnings

This matches IC's toggle/experiment philosophy and the netcode decision that game speed is the one player-facing knob.

---

## What IC Should Explicitly Avoid (From Prior Art + Philosophy)

1. **Feature power hidden behind gesture folklore**
   - Every advanced touch feature needs a visible UI path.
2. **Mobile content workflows that require manual filesystem navigation**
   - Keep workshop/content management in-app first.
3. **Separate mobile tutorial campaign content**
   - Use one curriculum with semantic prompt rendering.
4. **Advisory systems that silently change simulation-affecting settings**
   - Tempo guidance must warn, not override.
5. **UI crowding near the battlefield center**
   - Keep HUD in thumb zones; use minimap cluster + command rail separation.

---

## IC Design Changes This Research Supports

Validated / refined:

- D058 camera bookmark formalization and `/speed` advisory clarification
- D059 mobile minimap + bookmark dock coexistence and touch precedence
- D065 cross-device curriculum, controls walkthrough, semantic prompt rendering, touch tempo advisor
- `17-PLAYER-FLOW.md` mobile HUD/bookmark/tempo tutorial UI surfaces
- `02-ARCHITECTURE.md` layout-profile semantic anchor resolution note

---

## Limits / Follow-Up

This research confirms direction but does **not** replace user testing. The mobile Tempo Advisor ranges and touch interaction thresholds must be validated in real play sessions with:

- RTS newcomers on phone
- RTS veterans on phone
- Tablet users
- Mixed-input multiplayer groups

Future follow-up research (implementation stage):
- Touch RTS accessibility options benchmarking (motor/vision accommodations)
- Mobile notification overload patterns in real-time strategy and action games
- Post-launch telemetry review methodology for touch control tuning

