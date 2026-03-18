# Feature, Screen & Scenario Spec Template (LLM-Proof Design Language)

Keywords: feature spec, screen spec, scenario spec, LLM-proof, widget tree, guard condition, non-goals, anti-hallucination, testable contract, Given/When/Then

> This template defines a **three-layer specification language** for describing features, GUI screens, and interaction scenarios in Iron Curtain design docs. Its purpose is to make feature descriptions **unambiguous enough that an agentic LLM has one correct interpretation** of every element.

> For the human-facing player flow, see [`17-PLAYER-FLOW.md`](../17-PLAYER-FLOW.md). For implementation tickets, see [`implementation-ticket-template.md`](implementation-ticket-template.md). For decision capsules, see [`../decisions/DECISION-CAPSULE-TEMPLATE.md`](../decisions/DECISION-CAPSULE-TEMPLATE.md).

## When To Use This Template

**Use when describing:**
- A new UI screen, panel, overlay, or dialog
- A new feature with conditional visibility, guards, or multi-state behavior
- An interaction flow with branching paths
- Any UX behavior where "what it does NOT do" matters as much as what it does

**Do not use for:**
- Pure architecture / crate-level design (use `02-ARCHITECTURE.md` patterns)
- Decision rationale (use decision capsules)
- Implementation work packages (use the ticket template)
- Research notes (use `research/*.md`)

## The Three Layers

| Layer | Name | Purpose | Format |
|-------|------|---------|--------|
| **1** | Feature Spec | *What* the feature does, its guards, behavior, and anti-hallucination non-goals | YAML block |
| **2** | Screen Spec | *How* the screen looks — typed widget tree alongside ASCII wireframes | YAML block |
| **3** | Scenario Spec | *How interactions play out* — testable Given/When/Then contracts | YAML block |

Every screen/feature page should include **all three layers**. The ASCII wireframe (existing IC convention) remains for human readability; the YAML specs are the LLM's source of truth.

---

## Layer 1 — Feature Spec

Place this as a YAML code block near the top of the feature's documentation section. One Feature Spec per distinct feature or interaction unit.

### Schema

```yaml
feature:
  # Required fields
  id: string            # Unique ID: F-{SCREEN}-{FEATURE}, e.g. F-MAIN-MENU-CONTINUE
  title: string         # Human-readable name
  decision_refs: [Dxxx] # Related design decisions
  milestone: Mx         # Execution overlay milestone
  priority: P-*         # P-Core | P-Differentiator | P-Creator | P-Scale | P-Optional
  
  # Context
  state_machine_context: string  # Application state: InMenus | Loading | InGame | InReplay | GameEnded
  entry_point: string            # How the user reaches this feature
  platforms: [string]            # Desktop | Tablet | Phone | Deck | TV | Browser
  
  # Visibility & enablement
  guards:                        # When is this visible/enabled?
    - condition: string          # Boolean expression using game state
      effect: string             # visible_and_enabled | visible_but_disabled | hidden
      
  # Behavior (what it does)
  behavior:
    {state_name}: string         # One entry per behavioral branch
    
  # Anti-hallucination anchors (what it does NOT do)
  non_goals:
    - string                     # Explicit statements of excluded behavior
```

### Field Guide

**`id`** — Use the pattern `F-{SCREEN}-{FEATURE}`. Screen portion matches `SCR-*` IDs from Layer 2. Examples: `F-MAIN-MENU-CONTINUE`, `F-SETTINGS-PERF-PROFILE`, `F-LOBBY-READY-CHECK`.

**`guards`** — Define every condition that affects visibility or enablement. Use readable boolean expressions referencing game state variables. An LLM reading this should know *exactly* when the feature appears.

| `effect` value | Meaning |
|----------------|---------|
| `visible_and_enabled` | Rendered and interactive |
| `visible_but_disabled` | Rendered but greyed out / non-interactive (with tooltip explaining why) |
| `hidden` | Not rendered at all |

**`behavior`** — One entry per behavioral branch. Key names should be descriptive state/condition names. This replaces prose like "if X then it does Y, otherwise Z" with an explicit map.

**`non_goals`** — **The single most powerful section.** LLMs fill specification gaps with plausible-sounding features. Every `non_goals` entry eliminates a class of hallucinated implementation. Write these aggressively — anything the feature *could plausibly do but shouldn't* belongs here.

Good non-goals:
- "Does not auto-select a branch for the player"
- "Does not show a confirmation dialog (Principle: respect the player's intent)"
- "Does not affect simulation, balance, or ranked eligibility"

Bad non-goals (too vague):
- "Does not do bad things"
- "Does not break the game"

### Example (Main Menu — Continue Campaign)

```yaml
feature:
  id: F-MAIN-MENU-CONTINUE
  title: "Continue Campaign (Main Menu)"
  decision_refs: [D021, D033, D069]
  milestone: M4
  priority: P-Core
  state_machine_context: InMenus
  entry_point: "Main Menu → Continue Campaign button"
  platforms: [Desktop, Tablet, Phone, Deck, TV, Browser]
  
  guards:
    - condition: "campaign_save_exists == true"
      effect: visible_and_enabled
    - condition: "campaign_save_exists == false"
      effect: hidden
  
  behavior:
    single_next_mission: "Launches directly into the next mission (briefing → loading → InGame)"
    multiple_available_or_pending_branch: "Opens campaign map at current progression point for player selection"
  
  non_goals:
    - "Does not start a new campaign (that's Campaign → New)"
    - "Does not provide difficulty selection (set during campaign creation)"
    - "Does not auto-select a branch when multiple paths are available"
    - "Does not show a 'no save found' error — button is simply hidden"
```

---

## Layer 2 — Screen Spec

Place this alongside (not replacing) the ASCII wireframe for each screen. One Screen Spec per distinct screen or panel.

### Schema

```yaml
screen:
  # Identity
  id: string                   # Unique ID: SCR-{NAME}, e.g. SCR-MAIN-MENU
  title: string                # Human-readable screen name
  context: string              # Application state machine context
  
  # Layout
  layout: string               # Layout strategy name
  platform_variants:           # Per-platform layout overrides
    {Platform}: string
    
  # Background (if applicable)
  background:
    type: static | conditional
    # For static:
    source: string
    # For conditional:
    options:
      - id: string
        condition: string
        source: string
    fallback: string           # ID of the fallback option
    
  # Widget tree
  widgets:
    - id: string               # Unique widget ID (used in Scenario Specs)
      type: string             # Widget type (see Widget Types below)
      label: string            # Display text (may contain {template_vars})
      guard: string | null     # Visibility condition (null = always visible)
      guard_effect: string     # hidden | disabled (default: hidden)
      action:
        type: string           # navigate | quit_to_desktop | open_url | set_flag | submit | toggle | ...
        target: string         # Target screen ID, URL, etc.
      confirm_dialog: bool     # Whether action requires confirmation (default: false)
      position: int            # Visual order in parent container
      tooltip: string          # Hover/long-press text
      
  # Footer / chrome elements
  footer:
    - id: string
      type: Label | Link
      content: string
      position: string         # bottom_left | bottom_center | bottom_right
      
  # Contextual overlays (badges, hints, tickers)
  contextual_elements:
    - id: string
      type: string
      guard: string
      content: string
      appears: once | always | {condition}
      dismiss_action: object
```

### Widget Types

Use these standard type names for consistency across all screen specs:

| Type | Description | Common Properties |
|------|-------------|-------------------|
| `MenuButton` | Primary navigation button in a menu list | `label`, `action`, `guard`, `position` |
| `IconButton` | Small button with icon, optional label | `icon`, `label`, `action`, `tooltip` |
| `Toggle` | On/off switch | `label`, `value_binding`, `guard` |
| `Dropdown` | Select from a list of options | `label`, `options`, `value_binding`, `guard` |
| `Slider` | Numeric range selector | `label`, `min`, `max`, `step`, `value_binding` |
| `TextInput` | Single-line text entry | `label`, `placeholder`, `value_binding`, `validation` |
| `Label` | Non-interactive display text | `content`, `position` |
| `Badge` | Small indicator attached to another element | `content`, `guard`, `attach_to` |
| `CalloutHint` | Dismissible contextual tip (D065) | `content`, `guard`, `appears`, `dismiss_action` |
| `NewsTicker` | Scrolling announcement strip | `source`, `guard` |
| `ProgressBar` | Visual progress indicator | `value_binding`, `label` |
| `TabBar` | Horizontal tab navigation | `tabs: [{id, label, target_panel}]` |
| `Panel` | Container for grouped widgets | `children`, `layout` |
| `Table` | Structured data display | `columns`, `data_source`, `row_action` |
| `Card` | Self-contained content block | `title`, `content`, `actions`, `guard` |
| `Wireframe` | Placeholder for complex custom rendering | `description`, `rendering_notes` |

### Conditional Navigation

When a button's target depends on state, use inline conditionals:

```yaml
action:
  type: navigate
  target:
    conditional:
      - condition: "next_missions.count == 1 && !pending_branch"
        target: SCR-BRIEFING
      - condition: "next_missions.count > 1 || pending_branch"
        target: SCR-CAMPAIGN-MAP
```

### Example (Main Menu — abbreviated)

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
        condition: "user_pref == highlights && highlight_library.count > 0"
        source: "highlight_library.random()"
      - id: campaign_scene
        condition: "user_pref == campaign_scene && active_campaign != null"
        source: "campaign.menu_scenes[campaign_state]"
    fallback: shellmap

  widgets:
    - id: btn-continue-campaign
      type: MenuButton
      label: "► Continue Campaign"
      guard: "campaign_save_exists"
      guard_effect: hidden
      action:
        type: navigate
        target:
          conditional:
            - condition: "next_missions.count == 1 && !pending_branch"
              target: SCR-BRIEFING
            - condition: "next_missions.count > 1 || pending_branch"
              target: SCR-CAMPAIGN-MAP
      position: 1

    - id: btn-campaign
      type: MenuButton
      label: "► Campaign"
      guard: null
      action: { type: navigate, target: SCR-CAMPAIGN-SELECT }
      position: 2

    - id: btn-skirmish
      type: MenuButton
      label: "► Skirmish"
      guard: null
      action: { type: navigate, target: SCR-SKIRMISH-SETUP }
      position: 3

    - id: btn-multiplayer
      type: MenuButton
      label: "► Multiplayer"
      guard: null
      action: { type: navigate, target: SCR-MULTIPLAYER-HUB }
      position: 4

    - id: btn-replays
      type: MenuButton
      label: "► Replays"
      guard: null
      action: { type: navigate, target: SCR-REPLAY-BROWSER }
      position: 5

    - id: btn-workshop
      type: MenuButton
      label: "► Workshop"
      guard: null
      action: { type: navigate, target: SCR-WORKSHOP-BROWSER }
      position: 6

    - id: btn-settings
      type: MenuButton
      label: "► Settings"
      guard: null
      action: { type: navigate, target: SCR-SETTINGS }
      position: 7

    - id: btn-profile
      type: MenuButton
      label: "► Profile"
      guard: null
      action: { type: navigate, target: SCR-PROFILE }
      position: 8

    - id: btn-encyclopedia
      type: MenuButton
      label: "► Encyclopedia"
      guard: null
      action: { type: navigate, target: SCR-ENCYCLOPEDIA }
      position: 9

    - id: btn-credits
      type: MenuButton
      label: "► Credits"
      guard: null
      action: { type: navigate, target: SCR-CREDITS }
      position: 10

    - id: btn-quit
      type: MenuButton
      label: "► Quit"
      guard: null
      action: { type: quit_to_desktop }
      confirm_dialog: false
      position: 11

  footer:
    - id: lbl-version
      type: Label
      content: "Iron Curtain v{engine_version}"
      position: bottom_left
    - id: lbl-community
      type: Link
      content: "community.ironcurtain.dev"
      position: bottom_center
      action: { type: open_url, url: "https://community.ironcurtain.dev" }
    - id: lbl-mod-version
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
      guard: "theme == Modern"
      content: "tracking_server.announcements"
      appears: always
    - id: hint-tutorial
      type: CalloutHint
      guard: "is_new_player && !tutorial_hint_dismissed"
      content: "New? Try the tutorial → Commander School"
      appears: once
      dismiss_action: { type: set_flag, flag: tutorial_hint_dismissed }
```

---

## Layer 3 — Scenario Spec

Scenarios are **testable interaction contracts** in Given/When/Then format. They describe every meaningful interaction path through a feature or screen. An LLM implementing the feature should be able to use scenarios as acceptance criteria.

### Schema

```yaml
scenarios:
  - id: string                 # Unique ID: SCEN-{SCREEN}-{DESCRIPTION}
    title: string              # Human-readable scenario name
    feature_ref: string        # F-* ID from Layer 1
    screen_ref: string         # SCR-* ID from Layer 2
    
    given:                     # Preconditions (game state)
      - string
    when:                      # User actions
      - action: string         # click | hover | press_key | drag | long_press | swipe | ...
        target: string         # Widget ID from Layer 2 (btn-*, lbl-*, etc.)
        value: string          # Optional: input value, key name, etc.
    then:                      # Expected outcomes
      - string                 # State changes, visual changes, navigation
      # Or structured:
      - navigate_to: string    # SCR-* target
      - state_change: string   # State mutation description
      - visual: string         # Visual feedback description
    
    # Optional: explicitly excluded behaviors for this scenario
    never:
      - string                 # Things that must NOT happen in this scenario
```

### Scenario Coverage Guidelines

For each feature, write scenarios covering:

1. **Happy path** — the default, most common interaction
2. **Guard-false path** — what happens when a guard condition is not met
3. **Each behavioral branch** — one scenario per entry in `behavior:` from Layer 1
4. **Edge cases** — empty states, first-time use, error recovery
5. **Platform-specific paths** — if the interaction differs on Phone/TV/Deck

The `never` field is optional but powerful for critical scenarios where wrong behavior would be dangerous (e.g., "never auto-starts a ranked match without ready-check").

### Example (Main Menu — Continue Campaign scenarios)

```yaml
scenarios:
  - id: SCEN-MAIN-MENU-CONTINUE-SINGLE
    title: "Continue Campaign — single next mission"
    feature_ref: F-MAIN-MENU-CONTINUE
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has an active campaign save"
      - "Campaign state has exactly one available next mission"
      - "No urgent pending branch decision exists"
    when:
      - action: click
        target: btn-continue-campaign
    then:
      - navigate_to: SCR-BRIEFING
      - "Briefing loads for the single available next mission"
      - "No campaign map is shown"
    never:
      - "Campaign map is not displayed when only one mission is available"
      - "Player is not asked to choose a mission"

  - id: SCEN-MAIN-MENU-CONTINUE-BRANCH
    title: "Continue Campaign — multiple paths available"
    feature_ref: F-MAIN-MENU-CONTINUE
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has an active campaign save"
      - "Campaign state has multiple available missions OR an urgent pending branch"
    when:
      - action: click
        target: btn-continue-campaign
    then:
      - navigate_to: SCR-CAMPAIGN-MAP
      - "Campaign map opens at current progression point"
      - "Available mission nodes are highlighted for selection"
    never:
      - "A mission is not auto-selected for the player"
      - "The game does not launch directly into any mission"

  - id: SCEN-MAIN-MENU-NO-CAMPAIGN-SAVE
    title: "Continue Campaign button hidden without save"
    feature_ref: F-MAIN-MENU-CONTINUE
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player has no active campaign save"
    then:
      - "btn-continue-campaign is not rendered"
      - "First visible button in the menu is btn-campaign (position 2)"
    never:
      - "Continue Campaign button is not shown greyed out"
      - "No error message or empty state is displayed for missing saves"

  - id: SCEN-MAIN-MENU-QUIT
    title: "Quit exits immediately without confirmation"
    feature_ref: F-MAIN-MENU-QUIT
    screen_ref: SCR-MAIN-MENU
    given:
      - "Player is on the main menu"
    when:
      - action: click
        target: btn-quit
    then:
      - "Application exits to desktop immediately"
    never:
      - "No 'Are you sure?' confirmation dialog is shown"
      - "No save prompt appears (campaign auto-saves at safe points, not on quit)"
```

### Example (No-Dead-End Guidance Panel)

This pattern applies to any button whose feature requires a prerequisite that may not be met (UX Principle 3):

```yaml
feature:
  id: F-CAMPAIGN-GENERATIVE
  title: "Generative Campaign (New)"
  decision_refs: [D016, D047]
  milestone: M10
  priority: P-Optional
  state_machine_context: InMenus
  entry_point: "Main Menu → Campaign → Generative Campaign"
  platforms: [Desktop, Tablet, Phone, Deck, TV, Browser]

  guards:
    - condition: "llm_provider_configured == true"
      effect: visible_and_enabled
    - condition: "llm_provider_configured == false"
      effect: visible_and_enabled  # NOT greyed out — opens guidance panel

  behavior:
    llm_ready: "Opens generative campaign setup screen"
    llm_not_configured: "Opens guidance panel with configuration links"

  non_goals:
    - "Button is never greyed out or hidden — always clickable (Principle 3)"
    - "Does not silently fail if no LLM is configured"
    - "Does not auto-configure an LLM provider"
    - "Guidance panel does not use upsell language"

scenarios:
  - id: SCEN-GENERATIVE-CAMPAIGN-READY
    title: "Generative Campaign with LLM configured"
    feature_ref: F-CAMPAIGN-GENERATIVE
    screen_ref: SCR-CAMPAIGN-SELECT
    given:
      - "Player has at least one LLM provider configured"
    when:
      - action: click
        target: btn-generative-campaign
    then:
      - navigate_to: SCR-GENERATIVE-SETUP
      - "Setup screen shows prompt input, campaign options"

  - id: SCEN-GENERATIVE-CAMPAIGN-NO-LLM
    title: "Generative Campaign without LLM — guidance panel"
    feature_ref: F-CAMPAIGN-GENERATIVE
    screen_ref: SCR-CAMPAIGN-SELECT
    given:
      - "Player has no LLM provider configured"
    when:
      - action: click
        target: btn-generative-campaign
    then:
      - "Guidance panel appears explaining what's needed"
      - "Panel includes [Enable Built-in AI →] button"
      - "Panel includes [Connect Provider →] button"
      - "Panel includes [Browse Workshop →] link for community configs"
    never:
      - "Button is not greyed out"
      - "No error toast or modal error dialog appears"
      - "No 'you need to upgrade' or upsell language is used"
```

---

## Integration With Existing IC Docs

### Relationship to Existing Formats

| IC Convention | Spec Layer | Relationship |
|---------------|-----------|--------------|
| ASCII wireframe | Layer 2 | **Kept.** Wireframe stays for human readability. Widget tree YAML is the canonical machine-parseable source |
| Button description table | Layer 2 | **Replaced** by `widgets:` entries with typed fields |
| Decision capsule | — | **Complementary.** Capsules define *policy*; specs define *visible behavior* |
| Navigation map | Layer 3 | **Complementary.** Navigation map shows the tree; scenarios show the *interaction contracts* at each node |
| Implementation ticket template | — | **Downstream.** Tickets reference Feature and Scenario IDs for traceability |

### Where Specs Live

Specs are embedded as YAML code blocks in the existing `player-flow/*.md` files. They live alongside the prose and wireframes, not in separate files. This keeps all information about a screen in one place.

**Recommended page structure:**

```markdown
## Screen Name

### Layout

(ASCII wireframe — preserved for human readability)

### Feature Spec

(Layer 1 YAML block)

### Screen Spec

(Layer 2 YAML block)

### Scenarios

(Layer 3 YAML blocks)

### Design Rules / Cross-References

(Prose — preserved for context, rationale, edge cases)
```

### Non-Goals — Granularity Guidelines

Write non-goals at the **feature level** (Layer 1), not per-widget. For complex screens, group non-goals by feature area:

- **Feature-level non-goals** (always): "Does not start a new campaign", "Does not affect ranked eligibility"
- **Interaction-level non-goals** (in scenarios, `never:` field): "Does not show confirmation dialog", "Does not auto-select"
- **Screen-level non-goals** (only if the entire screen has easily confused scope): "This screen does not handle mod installation — that's SCR-WORKSHOP"

Avoid per-widget non-goals like "btn-quit does not save the game" — that belongs in the scenario's `never:` field instead.

### Incremental Adoption

This template is designed for incremental adoption:

1. **New features** — use all three layers from day one
2. **Existing pages** — add specs during the next edit pass for that page
3. **Pilot** — start with `main-menu.md` as the reference conversion

No existing page needs to be rewritten. When editing a page for any reason, add specs for the section being edited.

---

## Anti-Hallucination Checklist

When reviewing a spec (or writing one), verify:

- [ ] Every guard condition is explicit — no implicit "obviously visible" assumptions
- [ ] Every behavioral branch in Layer 1 has at least one scenario in Layer 3
- [ ] Every conditional navigation uses the structured `conditional:` format, not prose
- [ ] Non-goals cover the most likely LLM misinterpretations (confirmation dialogs, auto-selection, hidden vs. disabled)
- [ ] Widget IDs are unique across the entire screen spec
- [ ] Platform variants are noted where they diverge from Desktop default
- [ ] The `never:` field in critical scenarios catches dangerous false-positive behaviors
- [ ] Guard effects are explicit: `hidden` vs. `disabled` (never ambiguous "unavailable")
