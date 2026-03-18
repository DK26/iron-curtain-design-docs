## Main Menu

The main menu is the hub. Everything is reachable from here. The shellmap plays behind a semi-transparent overlay panel.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    [ IRON CURTAIN ]                               │
│                    Red Alert                                     │
│                                                                  │
│              ┌─────────────────────────┐                         │
│              │  ► Continue Campaign     │ (if save exists)       │
│              │  ► Campaign              │                         │
│              │  ► Skirmish              │                         │
│              │  ► Multiplayer           │                         │
│              │                          │                         │
│              │  ► Replays               │                         │
│              │  ► Workshop              │                         │
│              │  ► Settings              │                         │
│              │                          │                         │
│              │  ► Profile               │ (bottom group)         │
│              │  ► Encyclopedia          │                         │
│              │  ► Credits               │                         │
│              │  ► Quit                  │                         │
│              └─────────────────────────┘                         │
│                                                                  │
│  [shellmap: live AI battle playing in background]                │
│                                                                  │
│  Iron Curtain v0.1.0        community.ironcurtain.dev    RA 1.0 │
└──────────────────────────────────────────────────────────────────┘
```

### Feature Spec

```yaml
feature:
  id: F-MAIN-MENU-CONTINUE
  title: "Continue Campaign (Main Menu)"
  decision_refs: [D021, D033]
  milestone: M4
  priority: P-Core
  state_machine_context: InMenus
  entry_point: "Main Menu -> Continue Campaign button"
  platforms: [Desktop, Tablet, Phone, Deck, TV, Browser]

  guards:
    - condition: "campaign_save_exists == true"
      effect: visible_and_enabled
    - condition: "campaign_save_exists == false"
      effect: hidden

  behavior:
    single_next_mission: "Launches directly into the next mission briefing when exactly one authored next mission is available and no urgent branch decision is pending"
    branching_or_pending_choice: "Opens the campaign graph or intermission at the current progression point when multiple missions are available or an urgent pending branch exists"

  non_goals:
    - "Does not start a new campaign"
    - "Does not auto-select a branch for the player"
    - "Does not show a disabled placeholder or error dialog when no campaign save exists; the button is hidden"
    - "Does not replace the Campaign screen, which remains the entry point for new campaigns and save-slot selection"
```

```yaml
feature:
  id: F-MAIN-MENU-QUIT
  title: "Quit to Desktop (Main Menu)"
  decision_refs: []
  milestone: M3
  priority: P-Core
  state_machine_context: InMenus
  entry_point: "Main Menu -> Quit button"
  platforms: [Desktop, Deck, Browser]

  guards:
    - condition: "platform.supports_quit == true"
      effect: visible_and_enabled
    - condition: "platform.supports_quit == false"
      effect: hidden  # Mobile/TV apps have no quit button; OS manages lifecycle

  behavior:
    quit: "Exits immediately to the desktop without any confirmation dialog"

  non_goals:
    - "Does not show an 'Are you sure?' confirmation dialog — respects the player's intent"
    - "Does not trigger a save prompt — campaign state auto-saves at safe points, never on quit"
    - "Does not minimize or background the application — it exits"
    - "Does not vary behavior based on whether a campaign is in progress"
```

```yaml
feature:
  id: F-MAIN-MENU-BACKGROUND
  title: "Configurable Main Menu Background"
  decision_refs: [D077, D032]
  milestone: M3
  priority: P-Differentiator
  state_machine_context: InMenus
  entry_point: "Automatic — displays when entering Main Menu"
  platforms: [Desktop, Tablet, Phone, Deck, TV, Browser]

  guards:
    - condition: "always"
      effect: visible_and_enabled

  behavior:
    shellmap: "Live AI battle behind the menu (default for Remastered/Modern themes)"
    static: "Static title image (default for Classic theme)"
    highlights: "Cycles clips from the player's personal highlight library (D077)"
    campaign_scene: "Shows a campaign-progress scene matching the player's current campaign state"

  # Selection priority (highest wins):
  #   1. Player's explicit background_pref in Settings -> Video
  #   2. Campaign scene if background_pref == campaign_scene AND active_campaign != null
  #   3. Highlights if background_pref == highlights AND highlight_library.count > 0
  #   4. Theme default: shellmap (Remastered/Modern) or static image (Classic)
  #   5. Fallback: shellmap AI battle (always available)
  #
  # Playback note: highlight and campaign-scene backgrounds re-simulate from the
  # nearest keyframe at reduced priority behind the menu UI. They do not block
  # menu interaction or consume foreground CPU budget.

  non_goals:
    - "Does not auto-play audio from highlights/campaign scenes at full volume — plays at reduced volume behind menu music"
    - "Does not block menu input while background loads or re-simulates"
    - "Does not force campaign scenes — player's explicit background_pref always takes precedence"
    - "Does not download highlight packs automatically — Workshop highlight packs are manually installed (D077)"
    - "Does not degrade menu performance — shellmap has a ~5% CPU budget and auto-disables on low-end hardware"
```

### Screen Spec

```yaml
screen:
  id: SCR-MAIN-MENU
  title: "Main Menu"
  context: InMenus
  layout: center_panel_over_background
  platform_variants:
    Phone: bottom_sheet_drawer
    TV: large_text_d_pad_grid

  background:
    type: conditional
    options:
      - id: shellmap
        condition: "theme in [Remastered, Modern]"
        source: "shellmap_ai_battle"
      - id: static
        condition: "theme == Classic"
        source: "theme_title_image"
      - id: highlights
        condition: "background_pref == highlights && highlight_library.count > 0"
        source: "highlight_library.random()"
      - id: campaign_scene
        condition: "background_pref == campaign_scene && active_campaign != null"
        source: "campaign.menu_scenes[campaign_state]"
    fallback: shellmap

  widgets:
    - id: btn-continue-campaign
      type: MenuButton
      label: "Continue Campaign"
      guard: "campaign_save_exists"
      guard_effect: hidden
      action:
        type: navigate
        target:
          conditional:
            - condition: "next_missions.count == 1 && !pending_branch"
              target: SCR-MISSION-BRIEFING
            - condition: "next_missions.count > 1 || pending_branch"
              target: SCR-CAMPAIGN-GRAPH
      position: 1
      tooltip: "Resume the current campaign at its authored progression point"

    - id: btn-campaign
      type: MenuButton
      label: "Campaign"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-CAMPAIGN-SELECTION
      position: 2

    - id: btn-skirmish
      type: MenuButton
      label: "Skirmish"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-SKIRMISH-SETUP
      position: 3

    - id: btn-multiplayer
      type: MenuButton
      label: "Multiplayer"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-MULTIPLAYER-HUB
      position: 4

    - id: btn-replays
      type: MenuButton
      label: "Replays"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-REPLAY-BROWSER
      position: 5

    - id: btn-workshop
      type: MenuButton
      label: "Workshop"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-WORKSHOP-BROWSER
      position: 6

    - id: btn-settings
      type: MenuButton
      label: "Settings"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-SETTINGS
      position: 7

    - id: btn-profile
      type: MenuButton
      label: "Profile"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-PLAYER-PROFILE
      position: 8

    - id: btn-encyclopedia
      type: MenuButton
      label: "Encyclopedia"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-ENCYCLOPEDIA
      position: 9

    - id: btn-credits
      type: MenuButton
      label: "Credits"
      guard: null
      guard_effect: hidden
      action:
        type: navigate
        target: SCR-CREDITS
      position: 10

    - id: btn-quit
      type: MenuButton
      label: "Quit"
      guard: "platform.supports_quit"
      guard_effect: hidden
      action:
        type: quit_to_desktop
      confirm_dialog: false
      position: 11
      tooltip: "Exit immediately to desktop"

  footer:
    - id: lbl-engine-version
      type: Label
      content: "Iron Curtain v{engine_version}"
      position: bottom_left
    - id: lnk-community
      type: Link
      content: "community.ironcurtain.dev"
      position: bottom_center
      action:
        type: open_url
        target: "https://community.ironcurtain.dev"
    - id: lbl-module-version
      type: Label
      content: "{game_module_name} {game_module_version}"
      position: bottom_right

  contextual_elements:
    - id: badge-mod-profile
      type: Badge
      guard: "active_mod_profile != default"
      content: "{active_mod_profile.name}"
      appears: always
    - id: ticker-news
      type: NewsTicker
      guard: "theme == Modern && tracking_server_announcements_enabled"
      source: "tracking_server.announcements"
      appears: always
    - id: hint-tutorial
      type: CalloutHint
      guard: "is_new_player && !tutorial_hint_dismissed"
      content: "New? Try the tutorial -> Commander School"
      appears: once
      dismiss_action:
        type: set_flag
        target: tutorial_hint_dismissed
```

### Scenarios

```yaml
scenarios:
  - id: SCEN-MAIN-MENU-CONTINUE-SINGLE
    title: "Continue Campaign with a single next mission"
    feature_ref: F-MAIN-MENU-CONTINUE
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has an active campaign save"
      - "Campaign state exposes exactly one authored next mission"
      - "No urgent pending branch decision exists"
    when:
      - action: click
        target: btn-continue-campaign
    then:
      - navigate_to: SCR-MISSION-BRIEFING
      - "The next mission briefing opens immediately"
    never:
      - "Campaign selection is shown first"
      - "A branch is auto-selected or re-authored"

  - id: SCEN-MAIN-MENU-CONTINUE-BRANCH
    title: "Continue Campaign with multiple missions or a pending branch"
    feature_ref: F-MAIN-MENU-CONTINUE
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has an active campaign save"
      - "Campaign state has multiple available missions or an urgent pending branch"
    when:
      - action: click
        target: btn-continue-campaign
    then:
      - navigate_to: SCR-CAMPAIGN-GRAPH
      - "The campaign graph or intermission opens at the current progression point"
      - "The player chooses the next branch from authored options"
    never:
      - "The game silently chooses a branch"
      - "A random next mission is launched"

  - id: SCEN-MAIN-MENU-CONTINUE-HIDDEN
    title: "Continue Campaign is hidden when no campaign save exists"
    feature_ref: F-MAIN-MENU-CONTINUE
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has no active campaign save"
    then:
      - "btn-continue-campaign is not rendered"
      - "btn-campaign is the first visible menu button"
    never:
      - "A disabled Continue Campaign placeholder is shown"
      - "An error toast or dead-end modal is shown on menu load"

  - id: SCEN-MAIN-MENU-QUIT
    title: "Quit exits immediately without confirmation"
    feature_ref: F-MAIN-MENU-QUIT
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player is on the main menu"
      - "Platform supports quit (Desktop, Deck, Browser)"
    when:
      - action: click
        target: btn-quit
    then:
      - "Application exits to desktop immediately"
    never:
      - "A confirmation dialog is shown"
      - "A save prompt appears"
      - "The application minimizes instead of exiting"

  - id: SCEN-MAIN-MENU-QUIT-MOBILE
    title: "Quit button is hidden on platforms without quit"
    feature_ref: F-MAIN-MENU-QUIT
    screen_ref: SCR-MAIN-MENU
    given:
      - "Platform does not support quit (Phone, TV)"
    then:
      - "btn-quit is not rendered"
      - "btn-credits is the last visible menu button"

  - id: SCEN-MAIN-MENU-BG-SHELLMAP
    title: "Default background is a live shellmap"
    feature_ref: F-MAIN-MENU-BACKGROUND
    screen_ref: SCR-MAIN-MENU
    given:
      - "Theme is Remastered or Modern"
      - "Player has not changed background_pref in Settings"
    then:
      - "A live AI battle (shellmap) plays behind the menu overlay"
      - "Shellmap uses the game module's shellmap map and scripts"
    never:
      - "Shellmap blocks menu interaction"
      - "Shellmap uses more than ~5% CPU budget"

  - id: SCEN-MAIN-MENU-BG-CAMPAIGN-SCENE
    title: "Campaign-progress scene shows when selected and active"
    feature_ref: F-MAIN-MENU-BACKGROUND
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has set background_pref to campaign_scene in Settings"
      - "Player has an active campaign with menu_scenes defined"
    then:
      - "Background shows the scene matching the current CampaignState from the campaign's menu_scenes table"
      - "Scene re-simulates from nearest keyframe at reduced priority"
    never:
      - "Campaign scene plays at full audio volume — reduced volume behind menu music"
      - "Scene blocks menu input during re-simulation"

  - id: SCEN-MAIN-MENU-BG-FALLBACK
    title: "Background falls back to shellmap when selected option is unavailable"
    feature_ref: F-MAIN-MENU-BACKGROUND
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has set background_pref to highlights but highlight_library is empty"
    then:
      - "Background falls back to shellmap AI battle"
    never:
      - "A black screen or missing-asset placeholder is shown"
      - "An error dialog appears"
```

### Contextual Elements

> The canonical definitions for contextual elements are in the Screen Spec above (`contextual_elements:` block). The prose below provides human-readable rationale.

- **Version info** — Bottom-left: engine version; bottom-right: game module version. Provides at-a-glance version identification for bug reports
- **Community link** — Bottom-center: clickable link to community site/Discord
- **Mod indicator** — If a non-default mod profile is active, a small indicator badge shows which profile (e.g., "Combined Arms v2.1")
- **News ticker** (optional, Modern theme) — Community announcements from the configured tracking server(s)
- **Tutorial hint** — For new players: a non-intrusive callout near Campaign or Skirmish saying "New? Try the tutorial → Commander School" (D065, dismissible, appears once)
- **Background selection** — Configurable via Settings → Video. See Feature Spec `F-MAIN-MENU-BACKGROUND` above for the formal selection priority, fallback order, and performance constraints. Options, prior art, and campaign-scene authoring details follow below

#### Campaign-Progress Menu Background

When the player has an active campaign, the main menu background can reflect where they are in the story — changing as they progress through missions. This is an [Evolving Title Screen](https://tvtropes.org/pmwiki/pmwiki.php/Main/EvolvingTitleScreen) pattern used by Half-Life 2, Halo: Reach, Spec Ops: The Line, Portal 2, The Last of Us Part II, Warcraft III, Lies of P, and others.

**How it works:** Campaign authors define a `menu_scenes` table in their campaign YAML (see `modding/campaigns.md` § Campaign Menu Scenes). Each entry maps a campaign progress point (mission ID, flag state, or completion percentage) to a menu scene. The scene can be:

- **A shellmap scenario** — a live, lightweight in-game scene (a few AI units fighting, a base under construction, an air patrol) rendered behind the menu. Uses the existing shellmap infrastructure with campaign-specific map/units/scripts
- **A video loop** — a pre-rendered or recorded `.webm` video playing in a loop (aircraft flying in formation at night, a war room briefing, a battlefield aftermath). Audio plays at reduced volume behind menu music
- **A static image** — campaign-specific artwork or screenshot for the current act/chapter

**Scene selection priority:**
1. If the player has manually configured a different background style (static image, shellmap AI, highlights), that takes precedence — campaign scenes are opt-in, not forced
2. If "Campaign Scene" is selected (or is the campaign's default), the engine matches the player's current `CampaignState` against the `menu_scenes` table and picks the matching scene
3. If no campaign is active or no scene matches, falls back to the theme's default (shellmap AI or static image)

**Prior art:**

| Game | How It Works | What IC Can Learn |
|------|-------------|-------------------|
| **Half-Life 2** | Menu shows an area from the most recent chapter. Each chapter has a different background scene | Direct model — IC maps campaign progress to scenes |
| **Halo: Reach** | Menu artwork changes based on which campaign mission was last played. Uses concept art pieces | Supports both live scenes AND static art per mission |
| **Spec Ops: The Line** | Menu tableau evolves across the story — soldier sleeping → recon → combat → fire → destruction. Day turns to night. The menu IS a scene happening alongside the story | The menu scene can tell its own micro-story that parallels the campaign |
| **Warcraft III** | Each campaign (Human, Undead, Orc, Night Elf) has its own menu background and music | Per-campaign theming, not just per-mission |
| **Portal 2** | Menu shows a location from the current chapter — acts as a bookmark | Reinforces where the player left off |
| **The Last of Us Part II** | Menu evolves from calm boat scene → locked-down darkness → bright sunrise after completion | Emotional arc in the menu itself |
| **Lies of P** | Title screen shifts through different locations as the player reaches new chapters | Location-based scene changes |
| **Call of Duty** (classic) | Menu weapons change per campaign faction (Thompson for US, Lee-Enfield for UK, Mosin-Nagant for USSR) | Even small thematic details (faction-specific props) add immersion |
