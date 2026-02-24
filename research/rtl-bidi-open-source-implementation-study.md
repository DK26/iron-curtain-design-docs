# RTL / BiDi Text, Font Fallback, and UI Directionality — Open-Source Implementation Study (Confirmatory Research)

> **Purpose:** Extract practical lessons from open-source engines/frameworks/libraries that handle RTL/BiDi text correctly, then map accepted takeaways into IC's localization, chat/marker communication, and SDK localization-preview milestones.
>
> **Date:** 2026-02-24
> **Status:** Confirmatory research (implementation emphasis + localization correctness hardening)

---

## Scope

This note answers a narrow question:

1. What implementation patterns should IC adopt for **RTL/BiDi text correctness**, **font fallback**, and **layout directionality** so localization is more than just "font supports Unicode"?

This is **not**:
- a decision to copy another UI stack or text renderer wholesale
- a replacement for IC's architecture contracts (`02-ARCHITECTURE.md`) or D059/D038 specs
- a performance benchmark between text layout libraries

---

## Source Quality and Limits

- **HarfBuzz / FriBidi / Pango** are high-value primary references for text shaping/BiDi responsibility boundaries.
- **Qt** and **Godot** docs are high-value implementation references for UI/layout direction behavior and developer-facing API expectations.
- These sources validate patterns and pitfalls; they do **not** determine IC's exact crate/library choices by themselves.

---

## Sources Reviewed

### Primary Sources

- HarfBuzz docs — "What HarfBuzz doesn't do" (scope boundaries)
  - <https://harfbuzz.github.io/what-harfbuzz-doesnt-do.html>
- FriBidi (Unicode Bidirectional Algorithm implementation)
  - <https://github.com/fribidi/fribidi>
- Pango docs (internationalized text layout/rendering)
  - <https://docs.gtk.org/Pango/>
- Qt docs — right-to-left rich text behavior
  - <https://doc.qt.io/qt-6/richtext-righttoleft.html>
- Qt docs — layout direction
  - <https://doc.qt.io/qt-6/layout.html#layout-direction>
- Godot docs — bidirectional text
  - <https://docs.godotengine.org/en/stable/tutorials/i18n/bidi_text.html>
- Godot `TextServer` docs (text shaping/layout facilities)
  - <https://docs.godotengine.org/en/stable/classes/class_textserver.html>

### Supporting Sources (already in IC research corpus)

- `research/open-source-rts-communication-markers-study.md` (D059 marker labels + anti-spoof sanitization context)
- `research/mobile-rts-ux-onboarding-community-platform-analysis.md` (localized UX discoverability / cross-device clarity context)

---

## Quick Comparison Matrix (RTL/BiDi Implementation Lessons)

| Project / Library | Primary Value for IC | What It Teaches Well | What Not to Copy Blindly | Best IC Takeaway |
| --- | --- | --- | --- | --- |
| **HarfBuzz** | Text shaping boundary discipline | Shaping is not BiDi/layout/fallback; responsibilities must be explicit | HarfBuzz alone does not solve chat/UI directionality policy | Separate shaping/BiDi/fallback responsibilities in IC docs and tests |
| **FriBidi** | BiDi algorithm implementation precedent | Correct RTL/LTR ordering and mixed-script handling need explicit BiDi processing | Low-level API usage is not itself a UI policy | Preserve legitimate RTL text while filtering spoofing controls in D059 |
| **Pango (GTK stack)** | Integrated text-layout reference | Internationalized layout, wrapping, shaping, and fallback concepts | IC is not adopting GTK/Pango as its UI stack | Validate wrap/clipping/baseline behavior, not just glyph coverage |
| **Qt** | UI directionality and layout semantics | Explicit `LTR`/`RTL` layout direction and mirroring expectations | Qt widget internals are not IC's UI architecture | Keep `layout_direction` a first-class UI concept, not a font setting |
| **Godot** | Game-engine practical RTL/BiDi guidance | Bidirectional text in a cross-platform game-engine context | IC uses Bevy and its own UI architecture | Treat RTL/BiDi as a game-engine concern across runtime + tools, not just menus |
| **IC (target design)** | Integrated RTS localization + comms + tooling | D059 chat/marker safety split, D038 localization preview, selective mirroring, replay-safe comm labels | — | Treat RTL/BiDi/font fallback/layout direction as one coordinated subsystem across `M6`/`M7`/`M9`/`M10` |

---

## High-Value Lessons (Fit / Risk / IC Action)

## 1. "Unicode font coverage" is necessary but not sufficient

**Observed signal:** Framework and engine docs consistently separate glyph availability from shaping/BiDi/layout behavior. A font can contain Arabic/Hebrew glyphs and still render broken text if shaping/BiDi processing is incomplete.

**Fit with IC:** **High**
- Directly supports `M6.UX.RTL_BIDI_GAME_UI_BASELINE`
- Reinforces the architecture contract and D038 localization workbench requirements

**Risk if ignored:**
- UI "supports Arabic/Hebrew" on paper but breaks joins, punctuation, wrapping, or mixed-script markers
- Teams assume a broad-coverage font family alone solves RTL correctness

**IC action (accepted):**
- Keep RTL/BiDi support defined as a **shaping + BiDi + layout-direction + fallback** contract in `02-ARCHITECTURE.md`, not a font checkbox.
- Track and test clipping/wrap/baseline issues in `M6`/`M9`/`M10`, not only glyph presence.

**Implementation overlay mapping:**
- `M6.UX.RTL_BIDI_GAME_UI_BASELINE`
- `M9.SDK.RTL_BASIC_EDITOR_UI_LAYOUT`
- `M10.SDK.RTL_BIDI_LOCALIZATION_WORKBENCH_PREVIEW`

---

## 2. Shaping, BiDi resolution, and font fallback should be separate responsibilities

**Observed signal:** HarfBuzz explicitly documents what it does *not* do; FriBidi/Pango/Qt/Godot docs show stacks that combine shaping, BiDi, and layout policy with different layers.

**Fit with IC:** **High**
- Matches IC's architecture style (clear subsystem boundaries and contracts)
- Helps avoid "magic text stack" assumptions leaking into D059 and D038

**Risk if ignored:**
- Hidden platform-specific behavior differences
- Incorrect blame and debugging (e.g., a BiDi bug misdiagnosed as a font bug)
- Inconsistent behavior between runtime and editor/help surfaces

**IC action (accepted):**
- Keep architectural wording explicit: shaping/BiDi/fallback are separate responsibilities under one shared `ic-ui` behavior contract.
- Require tests for mixed-script strings and fallback/clipping parity, not just nominal locale screenshots.

**Implementation overlay mapping:**
- `M6.UX.RTL_BIDI_GAME_UI_BASELINE`
- `M7.UX.D059_RTL_CHAT_MARKER_TEXT_SAFETY`
- `M9.SDK.RTL_BASIC_EDITOR_UI_LAYOUT`
- `M10.SDK.RTL_BIDI_LOCALIZATION_WORKBENCH_PREVIEW`

---

## 3. Layout direction is a UI-layout concern, not a text-font toggle

**Observed signal:** Qt and Godot expose layout direction behavior directly and treat mirroring rules as UI/layout behavior rather than as a property of individual strings.

**Fit with IC:** **High**
- IC already defines `UiLayoutDirection` and selective mirroring policy in `02-ARCHITECTURE.md`
- Supports D065 mirrored UI anchors and D038 preview tooling

**Risk if ignored:**
- Teams "fix" RTL by right-aligning text while leaving panel/order/icon layouts inconsistent
- Overly aggressive mirroring breaks gameplay semantics (minimap/world orientation, directional icons)

**IC action (accepted):**
- Preserve and test selective mirroring policy (`MirrorInRtl` vs `FixedOrientation`) across runtime + editor.
- Keep directionality overrides as QA/testing tools without decoupling from locale defaults.

**Implementation overlay mapping:**
- `M6.UX.RTL_BIDI_GAME_UI_BASELINE`
- `M9.SDK.RTL_BASIC_EDITOR_UI_LAYOUT`
- `M11.PLAT.BROWSER_MOBILE_POLISH`

---

## 4. D059 chat/marker safety must preserve legitimate RTL while blocking spoofing controls

**Observed signal:** BiDi-capable systems need explicit handling for dangerous control characters and invisible-char abuse. IC's communication-marker study already reinforced that anti-abuse must not destroy usability.

**Fit with IC:** **High**
- Directly applies to D059 chat and tactical marker labels
- Aligns with IC's input-side sanitization + display correctness + replay preservation split

**Risk if ignored:**
- Over-filtering: Arabic/Hebrew users cannot communicate correctly
- Under-filtering: impersonation/spoofing via bidi controls/invisible characters
- Replay/moderation tools see different text than players saw in-match

**IC action (accepted):**
- Keep sanitization input-side and display correctness renderer-side.
- Add explicit D059 RTL/BiDi test cases (chat, markers, mixed-script numerals, replay preservation, moderation parity).

**Implementation overlay mapping:**
- `M7.UX.D059_RTL_CHAT_MARKER_TEXT_SAFETY`
- `M7.UX.D059_BEACONS_MARKERS_LABELS`
- `M7.UX.REPORT_BLOCK_AVOID_REVIEW`

---

## 5. Authoring tooling must preview RTL/BiDi behavior before publish

**Observed signal:** Runtime support alone is not enough. Game creators and localizers need previews for wrap, truncation, subtitle timing, and directionality-sensitive assets/styles.

**Fit with IC:** **High**
- Matches D038 localization workbench and embedded authoring-manual/context-help direction
- Reduces post-release localization regressions

**Risk if ignored:**
- RTL issues surface only at runtime or after release
- Modders/workshop creators ship "localized" content with broken RTL layouts

**IC action (accepted):**
- Keep D038 localization/subtitle workbench RTL/BiDi preview/validation in `M10`.
- Include directional icon/image checks and mixed-script wrap/truncation tests in authoring validation output.

**Implementation overlay mapping:**
- `M10.SDK.RTL_BIDI_LOCALIZATION_WORKBENCH_PREVIEW`
- `M10.SDK.LOCALIZATION_PLUGIN_HARDENING`

---

## Accepted IC Actions (Summary)

1. Treat RTL support as a **shared text + layout + fallback + safety** subsystem, not a font checkbox.
2. Keep shaping/BiDi/fallback responsibilities explicit in architecture and implementation tests.
3. Maintain selective layout mirroring and per-asset mirror policy (`MirrorInRtl` / `FixedOrientation`).
4. Preserve legitimate RTL chat/marker text while sanitizing spoofing controls in D059.
5. Require RTL/BiDi preview and validation in D038 localization tooling.
6. Use broad-coverage fonts (e.g., Noto families) as **fallback backbones**, not necessarily primary theme fonts.

These actions are adopted and mapped into the execution overlay (see `src/tracking/milestone-dependency-map.md`).

---

## Overlay Mapping (Execution Planning Placement)

Accepted takeaways from this study map to:

- `M6.UX.RTL_BIDI_GAME_UI_BASELINE`
- `M7.UX.D059_RTL_CHAT_MARKER_TEXT_SAFETY`
- `M7.UX.D059_BEACONS_MARKERS_LABELS`
- `M9.SDK.RTL_BASIC_EDITOR_UI_LAYOUT`
- `M10.SDK.RTL_BIDI_LOCALIZATION_WORKBENCH_PREVIEW`
- `M10.SDK.LOCALIZATION_PLUGIN_HARDENING`
- `M11.PLAT.BROWSER_MOBILE_POLISH`

This note is **confirmatory research**. It refines implementation emphasis and test expectations; it does not replace the canonical decisions/specs.

