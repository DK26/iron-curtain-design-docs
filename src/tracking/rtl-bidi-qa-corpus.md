# RTL / BiDi QA Corpus (Chat, Markers, UI, Subtitles, Closed Captions)

> Canonical test-string appendix for RTL/BiDi/shaping/font-fallback/layout-direction validation across runtime UI, D059 communication, and D038 localization/subtitle/closed-caption tooling.
>
> This page is an **implementation/testing artifact**, not a gameplay feature design.

---

## Purpose

Use this corpus to validate that IC's RTL/BiDi support is correct **beyond glyph coverage**:

- text shaping (Arabic joins)
- bidirectional ordering (RTL + LTR + numerals + punctuation)
- wrap/truncation/clipping behavior
- font fallback behavior (theme primary font + fallback backbone)
- D059 sanitization split (legitimate RTL preserved, spoofing controls handled)
- replay/moderation parity for normalized chat and marker labels

This corpus supports the execution-overlay clusters:

- `M6.UX.RTL_BIDI_GAME_UI_BASELINE`
- `M7.UX.D059_RTL_CHAT_MARKER_TEXT_SAFETY`
- `M7.UX.D059_BEACONS_MARKERS_LABELS`
- `M9.SDK.RTL_BASIC_EDITOR_UI_LAYOUT`
- `M10.SDK.RTL_BIDI_LOCALIZATION_WORKBENCH_PREVIEW`
- `M11.PLAT.BROWSER_MOBILE_POLISH`

---

## How To Use This Corpus

### Runtime UI / D059 Chat & Markers (`M6` / `M7`)
- Render strings in:
  - chat log
  - chat input preview
  - ping label / tactical marker label
  - replay viewer communication timeline
  - moderation/review UI excerpts
- Validate:
  - same normalized bytes and visible result in all of the above
  - marker semantics remain icon/type-first (labels additive only)
  - no color-only dependence

### D038 Localization Workbench (`M10`)
- Load corpus entries as preview fixtures for:
  - briefing/debrief text
  - subtitles
  - closed captions (speaker labels, SFX captions)
  - radar comm captions
  - mission objective labels
  - D065 tutorial hints / anchor overlays
- Validate:
  - line wrap/truncation
  - clipping/baseline alignment across fallback fonts
  - layout-direction preview (`LTR` / `RTL`) behavior

### Platform Regression (`M11`)
- Re-run a subset of this corpus on:
  - Desktop
  - Browser
  - Steam Deck
  - Mobile (where applicable)
- Compare screenshots/log captures for layout drift.

---

## Test Categories

## A. Pure RTL (Chat / Labels / UI)

Use these to validate shaping and baseline RTL ordering without mixed-script complexity.

| ID | String | Language/Script | Primary Checks |
| --- | --- | --- | --- |
| `RTL-A1` | `هدف` | Arabic | Arabic shaping/joins; no clipping in marker labels |
| `RTL-A2` | `إمدادات` | Arabic | Combined forms/diacritics spacing; fallback glyph coverage |
| `RTL-H1` | `גשר` | Hebrew | Correct RTL order; marker-label width handling |
| `RTL-H2` | `חילוץ` | Hebrew | Baseline alignment + wrap in narrow UI labels |

---

## B. Mixed RTL + LTR + Numerals (High-Value)

These are the most important real-world communication cases for D059 and D070.

| ID | String | Intended Context | Primary Checks |
| --- | --- | --- | --- |
| `MIX-1` | `LZ-ב` | Marker label | Mixed-script token order, punctuation placement |
| `MIX-2` | `CAS 2 هدف` | Team chat / marker note | Numeral placement + spacing under BiDi |
| `MIX-3` | `גשר A-2` | Objective / marker | Latin suffix + numerals remain readable |
| `MIX-4` | `Bravo 3 חילוץ` | Chat / quick note | LTR word + numeral + RTL tail ordering |
| `MIX-5` | `יעד: Power Plant 2` | Objective text / subtitle | RTL punctuation + LTR noun phrase |
| `MIX-6` | `טניה: Move now!` | Closed caption (speaker label) | RTL speaker label + LTR dialogue text ordering |

---

## C. Punctuation / Wrap / Truncation Stress

Use these to catch line-wrap and clipping bugs that a simple glyph test misses.

| ID | String | Context | Primary Checks |
| --- | --- | --- | --- |
| `WRAP-1` | `מטרה: השמידו את הגשר הצפוני לפני הגעת התגבורת` | Objective panel | Multi-word wrap in RTL layout; punctuation placement |
| `WRAP-2` | `هدف المرحلة: تعطيل الدفاعات ثم التحرك إلى نقطة الاستخراج` | Briefing/subtitle | Arabic wrap + shaping under multi-line width |
| `TRUNC-1` | `LZ-ב צפון-מערב` | Marker label | Ellipsis/truncation in bounded marker UI; no clipped glyph tails |
| `TRUNC-2` | `CAS יעד-2 עכשיו` | Small HUD callout | Short-width truncation preserves intent/icon semantics |
| `WRAP-3` | `‏[انفجار بعيد] تحركوا إلى نقطة الإخلاء فوراً` | Closed caption (SFX + speech) | Mixed caption prefixes/brackets + Arabic wrap/shaping |

---

## D. D059 Marker Label Bounds (Byte + Rendered Width)

These are tactical labels that should stay short. They validate D059's dual bounds (normalized bytes + rendered width).

| ID | String | Expected Result Class | Notes |
| --- | --- | --- | --- |
| `LBL-1` | `AA` | Accept | Baseline ASCII tactical label |
| `LBL-2` | `גשר` | Accept | Pure RTL short label |
| `LBL-3` | `LZ-ב` | Accept | Mixed-script short label |
| `LBL-4` | `CAS 2` | Accept | LTR+numerals tactical label |
| `LBL-5` | `יעד-חילוץ-צפון` | Truncate or reject per width rule | Validate deterministic width-based handling |
| `LBL-6` | `هدف-استخراج-الشمال` | Truncate or reject per width rule | Arabic shaping + width bound behavior |

**Rule reminder:** Behavior (accept / truncate / reject) may vary by UI surface policy, but it must be **documented, deterministic, and replay-safe**.

---

## E. Font Fallback / Coverage Validation (Theme Primary + Fallback Backbone)

Use these when the active theme primary font is likely missing Arabic/Hebrew glyphs.

| ID | String | Primary Checks |
| --- | --- | --- |
| `FB-1` | `Mission: חילוץ` | Latin primary + Hebrew fallback glyph run selection |
| `FB-2` | `CAS → هدف` | Latin + symbol + Arabic fallback; spacing and baseline alignment |
| `FB-3` | `יעד 2 / LZ-B` | Mixed-script + numerals + punctuation across fallback runs |
| `FB-4` | `توجيهات الفريق` | Pure Arabic fallback shaping and clipping |

**Must validate:**
- no tofu/missing-glyph boxes in supported locale/script path
- no clipped ascenders/descenders after fallback
- no line-height jumps that break HUD/chat readability

---

## F. D059 Sanitization Regression Vectors (Escaped / Visible Form)

These are **sanitization harness inputs**. Represent dangerous characters in escaped form in tests; do not rely on visually invisible raw literals in docs.

### Goals
- preserve legitimate RTL content
- block or strip spoofing/invisible abuse per D059 policy
- keep normalization deterministic and replay-safe

| ID | Input (escaped notation) | Example Intent | Expected Validation Focus |
| --- | --- | --- | --- |
| `SAN-1` | `\"ABC\\u202E123\"` | BiDi override spoof attempt | Dangerous control handled (strip/reject/warn per policy); visible result deterministic |
| `SAN-2` | `\"LZ\\u200B-ב\"` | Zero-width insertion abuse | Invisible-char abuse handling without breaking visible text semantics |
| `SAN-3` | `\"גשר\\u2066A\\u2069\"` | Directionality isolate/control experiment | Policy-consistent handling + replay parity |
| `SAN-4` | `\"هدف\\u034F\"` | Combining/invisible abuse | Combining-abuse clamp behavior deterministic |

**Policy note:** This corpus does not redefine the allowed/disallowed Unicode policy. D059 remains canonical. These vectors exist to prevent regressions and ensure moderation/replay tools show the same normalized text users saw in-match.

---

## G. Replay / Moderation Parity Checks

For a selected subset (`MIX-2`, `LBL-3`, `SAN-1`, `SAN-2`):

1. Submit via chat or marker label in a live/local test.
2. Capture:
   - chat log display
   - marker label display
   - replay communication timeline
   - moderation/review queue snippet (if available in test harness)
3. Verify:
   - normalized text bytes are identical across surfaces
   - visible result is consistent (modulo intentional styling differences)
   - no hidden characters reappear in replay/review tooling

---

## H. Layout Direction Preview Fixtures (D038 / D065)

Use these strings to verify `LTR` vs `RTL` layout preview without changing system locale:

| ID | String | Surface | Primary Checks |
| --- | --- | --- | --- |
| `DIR-1` | `התחל משימה` | Button / action row | Alignment, padding, icon mirroring policy |
| `DIR-2` | `هدف المرحلة` | Objective card | Card title alignment in RTL layout profile |
| `DIR-3` | `Press V / לחץ V` | D065 tutorial hint | Mixed-script instructional prompt + icon spacing |
| `DIR-4` | `CAS Target / هدف CAS` | D070 typed support marker tooltip | Tooltip wrap + semantic icon retention |

---

## I. Closed Caption (CC) Specific Fixtures

Use these to validate CC formatting details that differ from plain subtitles (speaker labels, SFX cues, bracketed annotations, stacked captions).

| ID | String | Surface | Primary Checks |
| --- | --- | --- | --- |
| `CC-1` | `טניה: אני בפנים.` | Cutscene/dialogue closed caption | RTL speaker label + RTL dialogue shaping/order |
| `CC-2` | `Tanya: אני בפנים.` | Cutscene/dialogue closed caption | LTR speaker label + RTL dialogue ordering |
| `CC-3` | `[אזעקה] כוחות אויב מתקרבים` | SFX + speech caption | Bracketed SFX cue placement and wrap in RTL |
| `CC-4` | `[انفجار] Tanya, move!` | SFX + mixed-script dialogue | Arabic SFX cue + LTR speaker/dialogue ordering |
| `CC-5` | `דיווח מכ״ם: CAS 2 מוכן` | Radar comm caption | Acronyms/numerals inside RTL caption remain readable |

**CC-specific checks:**
- Speaker labels and SFX annotations must remain readable under BiDi and truncation rules.
- Caption line breaks must preserve meaning when labels/SFX prefixes are present.
- If the UI uses separate styling for speaker names/SFX cues, styling must not break shaping or reorder text incorrectly.

---

## Recommended Baseline Test Set (Fast Smoke)

If time is limited, run these first:

- `RTL-A1`
- `RTL-H1`
- `MIX-2`
- `LBL-3`
- `FB-2`
- `SAN-1`
- `DIR-3`
- `CC-2`

This set catches the most common false positives:
- "glyphs render but BiDi is wrong"
- "chat works but markers break"
- "fallback renders but clips"
- "sanitization blocks legitimate RTL"
- "subtitle works but closed-caption labels/SFX prefixes reorder incorrectly"

---

## Maintenance Rules

- Add new corpus strings when a real bug/regression is found.
- Prefer **stable IDs** over renaming existing cases (keeps test history diff-friendly).
- If a string is changed, note why in the linked test/bug/ticket.
- Keep this page implementation-oriented; policy changes still belong in:
  - `src/02-ARCHITECTURE.md`
  - `src/decisions/09g-interaction.md`
  - `src/decisions/09f-tools.md`
