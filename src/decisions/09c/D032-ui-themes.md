## D032: Switchable UI Themes (Main Menu, Chrome, Lobby)

**Decision:** Ship a YAML-driven UI theme system with multiple built-in presets. Players pick their preferred visual style for the main menu, in-game chrome (sidebar, minimap, build queue), and lobby. Mods and community can create and publish custom themes.

**Motivation:**

The Remastered Collection nailed its main menu — it respects the original Red Alert's military aesthetic while modernizing the presentation. OpenRA went a completely different direction: functional, data-driven, but with a generic feel that doesn't evoke the same nostalgia. Both approaches have merit for different audiences. Rather than pick one style, let the player choose.

This also mirrors D019 (switchable balance presets) and D048 (switchable render modes). Just as players choose between Classic, OpenRA, and Remastered balance rules in the lobby, and toggle between classic and HD graphics with F1, they should be able to choose their UI chrome the same way. All three compose into experience profiles.

**Built-in themes (original art, not copied assets):**

| Theme      | Inspired By                  | Aesthetic                                                                                                                               | Default For      |
| ---------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Classic    | Original RA1 (1996)          | Military minimalism — bare buttons over a static title screen, Soviet-era propaganda palette, utilitarian layout, Hell March on startup | RA1 game module  |
| Remastered | Remastered Collection (2020) | Clean modern military — HD polish, sleek panels, reverent to the original but refined, jukebox integration                              | —                |
| Modern     | Iron Curtain's own design    | Full Bevy UI capabilities — dynamic panels, animated transitions, modern game launcher feel                                             | New game modules |

**Important legal note:** All theme art assets are **original creations** inspired by these design languages — no assets are copied from EA's Remastered Collection (those are proprietary) or from OpenRA. The themes capture the *aesthetic philosophy* (palette, layout structure, design mood) but use entirely IC-created sprite sheets, fonts, and layouts. This is standard "inspired by" in game development — layout and color choices are not copyrightable, only specific artistic expression is.

**Theme structure (YAML-defined):**

```yaml
# themes/classic.yaml
theme:
  name: Classic
  description: "Inspired by the original Red Alert — military minimalism"

  # Chrome sprite sheet — 9-slice panels, button states, scrollbars
  chrome:
    sprite_sheet: themes/classic/chrome.png
    panel: { top_left: [0, 0, 8, 8], ... }  # 9-slice regions
    button:
      normal: [0, 32, 118, 9]
      hover: [0, 41, 118, 9]
      pressed: [0, 50, 118, 9]
      disabled: [0, 59, 118, 9]

  # Color palette
  colors:
    primary: "#c62828"       # Soviet red
    secondary: "#1a1a2e"     # Dark navy
    text: "#e0e0e0"
    text_highlight: "#ffd600"
    panel_bg: "#0d0d1a"
    panel_border: "#4a4a5a"

  # Typography
  fonts:
    menu: { family: "military-stencil", size: 14 }
    body: { family: "default", size: 12 }
    hud: { family: "monospace", size: 11 }

  # Main menu layout
  main_menu:
    background: themes/classic/title.png     # static image
    shellmap: null                            # no live battle (faithfully minimal)
    music: THEME_INTRO                       # Hell March intro
    button_layout: vertical_center           # stacked buttons, centered
    show_version: true

  # In-game chrome
  ingame:
    sidebar: right                           # classic RA sidebar position
    minimap: top_right
    build_queue: sidebar_tabs
    resource_bar: top_center

  # Lobby
  lobby:
    style: compact                           # minimal chrome, functional
```

**Shellmap system (live menu backgrounds):**

Like OpenRA's signature feature — a real game map with scripted AI battles running behind the main menu. But better:

- **Per-theme shellmaps.** Each theme can specify its own shellmap, or none (Classic theme faithfully uses a static image).
- **Multiple shellmaps with random selection.** The Remastered and Modern themes can ship with several shellmaps — a random one plays each launch.
- **Shellmaps are regular maps** tagged with `visibility: shellmap` in YAML. The engine loads them with a scripted AI that stages dramatic battles. Mods automatically get their own shellmaps.
- **Orbiting/panning camera.** Shellmaps can define camera paths — slow pan across a battlefield, orbiting around a base, or fixed view.

**Shellmap AI design:** Shellmaps use a dedicated AI profile (`shellmap_ai` in `ic-ai`) optimized for visual drama, not competitive play:

```yaml
# ai/shellmap.yaml
shellmap_ai:
  personality:
    name: "Shellmap Director"
    aggression: 40               # builds up before attacking
    attack_threshold: 5000       # large armies before engaging
    micro_level: basic
    tech_preference: balanced    # diverse unit mix for visual variety
    dramatic_mode: true          # avoids cheese, prefers spectacle
    max_tick_budget_us: 2000     # 2ms max — shellmap is background
    unit_variety_bonus: 0.5      # AI prefers building different unit types
    no_early_rush: true          # let both sides build up
```

The `dramatic_mode` flag tells the AI to prioritize visually interesting behavior: large mixed-army clashes over efficient rush strategies, diverse unit compositions over optimal builds, and sustained back-and-forth engagements over quick victories. The AI's tick budget is capped at 2ms to avoid impacting menu UI responsiveness. Shellmap AI is the same `ic-ai` system used for skirmish — just a different personality profile.

**Per-game-module default themes:**

Each game module registers its own default theme that matches its aesthetic:
- **RA1 module:** Classic theme (red/black Soviet palette)
- **TD module:** GDI theme (green/black Nod palette) — community or first-party
- **RA2 module:** Remastered-style with RA2 color palette — community or first-party

The game module provides a `default_theme()` in its `GameModule` trait implementation. Players override this in settings.

**Integration with existing UI architecture:**

The theme system layers on top of `ic-ui`'s existing responsive layout profiles (D002, `02-ARCHITECTURE.md`):
- **Layout profiles** handle *where* UI elements go (sidebar vs bottom bar, phone vs desktop) — driven by `ScreenClass`
- **Themes** handle *how* UI elements look (colors, chrome sprites, fonts, animations) — driven by player preference
- Orthogonal concerns. A player on mobile gets the Phone layout profile + their chosen theme. A player on desktop gets the Desktop layout profile + their chosen theme.

**Community themes:**

- Themes are Tier 1 mods (YAML + sprite sheets) — no code required
- Publishable to the workshop (D030) as a standalone resource
- Players subscribe to themes independently of gameplay mods — themes and gameplay mods stack
- An "OpenRA-inspired" theme would be a natural community contribution
- Total conversion mod developers create matching themes for their mods

**What this enables:**
1. **Day-one nostalgia choice.** First launch asks: do you want Classic, Remastered, or Modern? Sets the mood immediately.
2. **Mod-matched chrome.** A WWII mod ships its own olive-drab theme. A sci-fi mod ships neon blue chrome. The theme changes with the mod.
3. **Cross-view consistency with D019.** Classic balance + Classic theme = feels like 1996. Remastered balance + Remastered theme = feels like 2020. Players configure the full experience.
4. **Live backgrounds without code.** Shellmaps are regular maps — anyone can create one with the map editor.

**Alternatives considered:**
- Hardcoded single theme (OpenRA approach) — forces one aesthetic on everyone; misses the emotional connection different players have to different eras of C&C
- Copy Remastered Collection assets — illegal; proprietary EA art
- CSS-style theming (web-engine approach) — overengineered for a game; YAML is simpler and Bevy-native
- Theme as a full WASM mod — overkill; theming is data, not behavior; Tier 1 YAML is sufficient

**Phase:** Phase 3 (Game Chrome). Theme system is part of the `ic-ui` crate. Built-in themes ship with the engine. Community themes available in Phase 6a (Workshop).
