## UI Theme System (D032)

The UI is split into two orthogonal concerns:

- **Layout profiles** — *where* things go. Driven by `ScreenClass` (Phone, Tablet, Desktop, TV). Handles sidebar vs bottom bar, touch target sizes, minimap placement, mobile minimap clusters (alerts + camera bookmark dock), and semantic UI anchor resolution (e.g., `primary_build_ui` maps to sidebar on desktop/tablet and build drawer on phone). One per screen class.
- **Themes** — *how* things look. Driven by player preference. Handles colors, chrome sprites, fonts, animations, menu backgrounds. Switchable at any time.

This split is also what enables cross-device tutorial prompts without duplicating tutorial content: D065 references semantic actions and UI aliases, and `ic-ui` resolves them through the active layout profile chosen from `InputCapabilities`.

### Localization Directionality & RTL/BiDi Layout Contract

Localization support is not just "font coverage." IC must correctly support **bidirectional (BiDi) text**, **RTL scripts** (Arabic/Hebrew), and locale-aware UI layout behavior anywhere translatable text appears (menus, HUD labels, subtitles, dialogue, campaign UI, editor docs/help, and communication labels).

```rust
pub enum UiLayoutDirection {
    Ltr,
    Rtl,
}

pub enum DirectionalUiAssetPolicy {
    MirrorInRtl,
    FixedOrientation,
}
```

**Architectural rules (normative):**

- **Text rendering supports shaping + BiDi.** The shared UI text renderer must correctly handle Arabic shaping, Hebrew/Arabic punctuation behavior, and mixed-script strings (`RTL + LTR + numbers`) for UI, subtitles/closed captions, and communication labels.
- **Font support is script-aware, not just "Unicode-capable."** `ThemeFonts` captures the preferred visual style per role (menu/body/HUD/mono), while the renderer resolves locale/script-aware fallback chains so missing glyphs do not silently break localized or RTL UI.
- **Layout direction is locale-driven by default.** UI layout profiles resolve anchors/alignments from the active locale (`LTR`/`RTL`) and may expose a **QA/testing override** (`Auto`, `LTR`, `RTL`) without changing the locale itself.
- **Mirroring is selective, not global.** Menu/settings/profile/chat panels and many list/detail layouts usually mirror in RTL, but battlefield/world-space semantics (map orientation, minimap world mapping, world coordinates, faction symbols where direction carries meaning) are **not** blindly mirrored.
- **Directional assets declare policy.** Icons/arrows/ornaments that can flip for readability must declare `MirrorInRtl`; assets with gameplay or symbolic orientation must declare `FixedOrientation`.
- **Avoid baked text in images.** UI chrome/images should not contain baked translatable text where possible. If unavoidable, localized variants are required and must be selected through the same asset/theme pipeline.
- **Communication display reuses the same renderer, with D059 safety filtering.** Legitimate RTL/LTR message/label display is preserved; anti-spoof filtering (dangerous BiDi controls, abusive invisible chars) is handled at the D059 input/sanitization layer before order injection.
- **Shaping, BiDi resolution, and fallback are separate responsibilities under one shared contract.** The implementation may use separate components for shaping, BiDi resolution, and font fallback, but `ic-ui` owns the canonical behavior and tests so runtime/editor/chat surfaces remain consistent.
- **Localization QA validates layout with fallback fonts.** Mixed-script strings, subtitles, and marker labels must be tested for wrap, truncation, clipping, and baseline alignment across fallback fonts (not just glyph existence), with D038 localization tooling surfacing these checks before publish.

This contract keeps `ic-ui` platform-agnostic and ensures localization correctness is implemented once in shared rendering/layout code rather than patched per screen or per platform.

### Smart Font Fallback & Text Shaping Strategy (Localization)

RTL and broad localization support require a **font-system strategy**, not a single "full Unicode" font choice.

**Requirements (normative):**

- **Theme fonts define style intent; runtime resolves fallback chains.** Themes choose the preferred look (`Inter`, `JetBrains Mono`, etc.) while `ic-ui` resolves locale/script-aware fallback fonts for glyph coverage and shaping compatibility.
- **Fallback chains are role-aware.** Menu/body/HUD/monospace roles may use different fallback stacks; monospaced surfaces must not silently fall back to proportional fonts unless explicitly allowed by the UI surface policy.
- **Fallback behavior is deterministic at layout time.** The same normalized text + locale/layout-direction inputs should produce the same line breaks/glyph runs across supported platforms, except for explicitly documented platform-stack differences that are regression-tested in `M11.PLAT.BROWSER_MOBILE_POLISH`.
- **Directionality testing includes font fallback.** QA/testing direction overrides (`Auto`, `LTR`, `RTL`) must exercise the active fallback stack so clipping, punctuation placement, and spacing regressions are caught before release.
- **Open-source text-stack lessons are implementation guidance, not architecture lock-in.** IC may learn from HarfBuzz/FriBidi/Pango/Godot/Qt patterns, but the canonical behavior remains defined by this contract and D038 localization preview tooling.

### Theme Architecture

Themes are **YAML + sprite sheets** — Tier 1 mods, no code required.

```rust
pub struct UiTheme {
    pub name: String,
    pub chrome: ChromeAssets,    // 9-slice panels, button states, scrollbar sprites
    pub colors: ThemeColors,     // primary, secondary, text, highlights
    pub fonts: ThemeFonts,       // menu, body, HUD
    pub main_menu: MainMenuConfig,  // background image or shellmap, music, button layout
    pub ingame: IngameConfig,    // sidebar style, minimap border, build queue chrome
    pub lobby: LobbyConfig,     // panel styling, slot layout
}
```

### Built-in Themes

| Theme      | Aesthetic                                                                      | Inspired By                  |
| ---------- | ------------------------------------------------------------------------------ | ---------------------------- |
| Classic    | Military minimalism — bare buttons, static title screen, Soviet palette        | Original RA1 (1996)          |
| Remastered | Clean modern military — HD panels, sleek chrome, reverent refinement           | Remastered Collection (2020) |
| Modern     | Full Bevy UI — dynamic panels, animated transitions, modern game launcher feel | IC's own design              |

All art assets are **original creations** — no assets copied from EA or OpenRA. These themes capture aesthetic philosophy, not specific artwork.

### Shellmap System

Main menu backgrounds can be **live battles** — a real game map with scripted AI running behind the menu UI:
- Per-theme configuration: Classic uses a static image (faithful to 1996), Remastered/Modern use shellmaps
- Maps tagged `visibility: shellmap` are eligible — random selection on each launch
- Shellmaps define camera paths (pan, orbit, or fixed)
- Mods automatically get their own shellmaps

### Per-Game-Module Defaults

Each `GameModule` provides a `default_theme()` — RA1 defaults to Classic, future modules default to whatever fits their aesthetic. Players override in settings. This pairs naturally with D019 (switchable balance presets): Classic balance + Classic theme = feels like 1996.

### Community Themes

- Publishable to workshop (D030) as standalone resources
- Stack with gameplay mods — a WWII total conversion ships its own olive-drab theme
- An "OpenRA-inspired" community theme is a natural contribution

See `decisions/09c-modding.md` § D032 for full rationale, YAML schema, and legal notes on asset sourcing.
