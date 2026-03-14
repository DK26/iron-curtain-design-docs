### Workshop-Distributed Editor Plugins

Garry's Mod's most powerful pattern: community-created tools appear alongside built-in tools in the same menu. The community doesn't just create content — they **extend the creation tools themselves.** Wire Mod and Expression 2 are the canonical examples: community-built systems that became essential editor infrastructure, indistinguishable from first-party tools.

IC supports this explicitly. Workshop-published packages can contain:

| Plugin Type             | What It Adds                                                            | Example                                                     |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Custom modules**      | New entries in the Modules panel (YAML definition + Lua implementation) | "Convoy System" module — defines waypoints + spawn + escort |
| **Custom triggers**     | New trigger condition/action types                                      | "Music trigger" — plays specific track on activation        |
| **Compositions**        | Pre-built reusable entity groups (see Compositions section)             | "Tournament 1v1 Start" — balanced spawn with resources      |
| **Game mode templates** | Complete game mode setups (see Game Mode Templates section)             | "MOBA Lanes" — 3-lane auto-spawner with towers and heroes   |
| **Editor tools**        | New editing tools and panels (Lua-based UI extensions, Phase 7)         | "Formation Arranger" — visual grid formation editor tool    |
| **Terrain brushes**     | Custom terrain painting presets                                         | "River Painter" — places water + bank tiles + bridge snaps  |

All plugin types use the tiered modding system (invariant #3): YAML for data definitions, Lua for logic, WASM for complex tools. Plugins are sandboxed — an editor plugin cannot access the filesystem, network, or sim internals beyond the editor's public API. They install via Workshop like any other resource and appear in the editor's palettes automatically.

This aligns with philosophy principle #19 ("Build for surprise — expose primitives, not just parameterized behaviors"): the module/trigger/composition system is powerful enough that community extensions can create things the engine developers never imagined.

**Phase:** Custom modules and compositions are publishable from Phase 6a (they use the existing YAML + Lua format). Custom editor tools (Lua-based UI extensions) are a Phase 7 capability that depends on the editor's Lua plugin API.

### Editor Onboarding for Veterans

The IC editor's concepts — triggers, waypoints, entities, layers — aren't new. They're the same ideas that OFP, AoE2, StarCraft, and WC3 editors have used for decades. But each editor uses different names, different hotkeys, and different workflows. A 20-year AoE2 scenario editor veteran has deep muscle memory that IC shouldn't fight — it should channel.

**"Coming From" profile (first-launch):**

When the editor opens for the first time, a non-blocking welcome panel asks: "Which editor are you most familiar with?" Options:

| Profile             | Sets Default Keybindings | Sets Terminology Hints | Sets Tutorial Path                       |
| ------------------- | ------------------------ | ---------------------- | ---------------------------------------- |
| **New to editing**  | IC Default               | IC terms only          | Full guided tour, start with Simple mode |
| **OFP / Eden**      | F1–F7 mode switching     | OFP equivalents shown  | Skip basics, focus on RTS differences    |
| **AoE2**            | AoE2 trigger workflow    | AoE2 equivalents shown | Skip triggers, focus on Lua + modules    |
| **StarCraft / WC3** | WC3 trigger shortcuts    | Location→Region, etc.  | Skip locations, focus on compositions    |
| **Other / Skip**    | IC Default               | No hints               | Condensed overview                       |

This is a **one-time suggestion, not a lock-in.** Profile can be changed anytime in settings. All it does is set initial keybindings and toggle contextual hints.

**Customizable keybinding presets:**

Full key remapping with shipped presets:

```
IC Default   — Tab cycles modes, 1-9 entity selection, Space preview
OFP Classic  — F1-F7 modes, Enter properties, Space preview
Eden Modern  — Ctrl+1-7 modes, double-click properties, P preview
AoE2 Style   — T triggers, U units, R resources, Ctrl+C copy trigger
WC3 Style    — Ctrl+T trigger editor, Ctrl+B triggers browser
```

Not just hotkeys — mode switching behavior and right-click context menus adapt to the profile. OFP veterans expect right-click on empty ground to deselect; AoE2 veterans expect right-click to open a context menu.

**Terminology Rosetta Stone:**

A toggleable panel (or contextual tooltips) that maps IC terms to familiar ones:

| IC Term                 | OFP / Eden              | AoE2                         | StarCraft / WC3         |
| ----------------------- | ----------------------- | ---------------------------- | ----------------------- |
| Region                  | Trigger (area-only)     | Trigger Area                 | Location                |
| Module                  | Module                  | Looping Trigger Pattern      | GUI Trigger Template    |
| Composition             | Composition             | (Copy-paste group)           | Template                |
| Variables Panel         | (setVariable in SQF)    | (Invisible unit on map edge) | Deaths counter / Switch |
| Inline Script           | Init field (SQF)        | —                            | Custom Script           |
| Connection              | Synchronize             | —                            | —                       |
| Layer                   | Layer                   | —                            | —                       |
| Probability of Presence | Probability of Presence | —                            | —                       |
| Named Character         | Playable unit           | Named hero (scenario)        | Named hero              |

Displayed as **tooltips on hover** — when an AoE2 veteran hovers over "Region" in the UI, a tiny tooltip says "AoE2: Trigger Area." Not blocking, not patronizing, just a quick orientation aid. Tooltips disappear after the first few uses (configurable).

**Interactive migration cheat sheets:**

Context-sensitive help that recognizes familiar patterns:

- Designer opens Variables Panel → tip: "In AoE2, you might have used invisible units placed off-screen as variables. IC has native variables — no workarounds needed."
- Designer creates first trigger → tip: "In OFP, triggers were areas on the map. IC triggers work the same way, but you can also use Regions for reusable areas across multiple triggers."
- Designer writes first Lua line → tip: "Coming from SQF? Here's a quick Lua comparison: `_myVar = 5` → `local myVar = 5`. `hint \"hello\"` → `Game.message(\"hello\")`. Full cheat sheet: Help → SQF to Lua."

These only appear once per concept. They're dismissable and disable-all with one toggle. They're not tutorials — they're translation aids.

**Scenario import (partial):**

Full import of complex scenarios from other engines is unrealistic — but partial import of the most tedious-to-recreate elements saves real time:

- **AoE2 trigger import** — parse AoE2 scenario trigger data, convert condition→effect pairs to IC triggers + modules. Not all triggers translate, but simple ones (timer, area detection, unit death) map cleanly.
- **StarCraft trigger import** — parse StarCraft triggers, convert locations to IC Regions, convert trigger conditions/actions to IC equivalents.
- **OFP mission.sqm import** — parse entity placements, trigger positions, and waypoint connections. SQF init scripts flag as "needs Lua conversion" but the spatial layout transfers.
- **OpenRA .oramap entities** — already supported by the asset pipeline (D025/D026). Editor imports the map and entity placement directly.

Import is always **best-effort** with clear reporting: "Imported 47 of 52 triggers. 5 triggers used features without IC equivalents — see import log." Better to import 90% and fix 10% than to recreate 100% from scratch.

**The 30-minute goal:** A veteran editor from ANY background should feel productive within 30 minutes. Not expert — productive. They recognize familiar concepts wearing new names, their muscle memory partially transfers via keybinding presets, and the migration cheat sheet fills the gaps. The learning curve is a gentle slope, not a cliff.

### SDK Live Tutorial (Interactive Guided Tours)

"Coming From" profiles and keybinding presets help veterans orient. But brand-new creators — the "New to editing" profile — need more than tooltips and reference docs. They need a hands-on walkthrough that builds confidence through doing. The SDK Live Tutorial is an interactive guided tour system that walks creators through their first scenario, asset import, or campaign with step-by-step instructions and validation.

**Design principles:**
- **Learn by doing** — every tour step asks the creator to perform an action, not just read text
- **Spotlight focus** — the surrounding UI dims while the relevant element is highlighted, reducing cognitive load
- **Validation before advancing** — the engine confirms the creator actually completed the step (painted terrain, placed a unit, etc.) before moving on
- **Resumable** — tours persist progress to SQLite; closing the SDK mid-tour resumes at the last completed step
- **Non-blocking** — tours can be skipped, paused, or dismissed at any point with no penalty

#### Tour Engine Architecture

```
TourDefinition (YAML)
    │
    ▼
TourStep ────► TourRenderer
(highlight,      (spotlight overlay,
 action,          callout bubble,
 validation)      progress bar,
                  skip/back/next)
    │
    ▼
TourHistory (SQLite)  ◄──  TourFilter (suppression)
```

The tour engine reuses the suppression and history pattern from D065's Layer 2 contextual hints, adapted for multi-step guided sequences in the editor context. The key difference: Layer 2 hints are single-shot contextual tips; tours are ordered multi-step sequences with validation gates.

#### Tour YAML Schema

```yaml
# sdk/tours/scenario-editor-basics.yaml
tour:
  id: scenario_editor_basics
  title: "Scenario Editor Basics"
  description: "Learn to create your first scenario in 10 minutes"
  target_tool: scenario_editor
  coming_from_profiles: [new_to_editing, all]
  estimated_minutes: 10
  prerequisite_tours: []              # optional: require another tour first

  steps:
    - id: welcome
      title: "Welcome to the Scenario Editor"
      text: "This is where you create missions. Let's build a simple skirmish map together."
      highlight_ui: null              # no element highlighted (intro screen)
      spotlight: false
      position: screen_center
      action: null                    # click Next to continue
      validation: null                # no validation needed

    - id: terrain_mode
      title: "Terrain Painting"
      text: "Click the Terrain tab to start painting your map."
      highlight_ui: "mode_panel.terrain"
      spotlight: true                 # dim everything except the highlighted element
      action:
        type: mode_switch
        target_mode: terrain
      validation:
        type: action_performed
        action: switch_to_terrain_mode

    - id: paint_terrain
      title: "Paint Some Terrain"
      text: "Select a terrain type from the palette and paint on the viewport. Try creating a small island with grass and water."
      highlight_ui: "terrain_palette"
      spotlight: false                # highlight but don't dim (user needs full viewport)
      action:
        type: paint
        min_cells: 20
      validation:
        type: cell_count
        min: 20

    - id: place_units
      title: "Place Units"
      text: "Switch to Entities mode and place some units on your map. Drag from the entity palette or double-click to place."
      highlight_ui: "mode_panel.entities"
      spotlight: true
      action:
        type: place_entity
        min_count: 3
      validation:
        type: entity_count
        min: 3

    - id: place_buildings
      title: "Place Buildings"
      text: "Place a Construction Yard and a few base buildings. These give each player a starting base."
      highlight_ui: "entity_palette.buildings"
      spotlight: false
      action:
        type: place_entity
        entity_category: building
        min_count: 2
      validation:
        type: entity_count
        category: building
        min: 2

    - id: assign_factions
      title: "Assign Factions"
      text: "Select a building, then look at the Properties panel. Change its Faction to assign it to a player. Make sure you have at least two factions."
      highlight_ui: "properties_panel.faction"
      spotlight: true
      action:
        type: set_attribute
        attribute: faction
      validation:
        type: attribute_set
        attribute: faction
        distinct_values_min: 2

    - id: preview
      title: "Preview Your Scenario"
      text: "Click Preview to see your scenario running! The editor will launch a quick simulation of your map."
      highlight_ui: "workflow_buttons.preview"
      spotlight: true
      action:
        type: click_button
        button: preview
      validation:
        type: preview_launched

    - id: complete
      title: "Tour Complete!"
      text: "You've created your first scenario! From here, explore triggers and modules to add mission logic. Press F1 on any element for detailed help."
      position: screen_center
      action: null
      validation: null
```

**Tour step fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique step identifier within the tour |
| `title` | string | Step heading shown in the callout bubble |
| `text` | string | Instructional text (kept short and action-oriented) |
| `highlight_ui` | string? | Logical UI element ID to highlight (uses `UiAnchorAlias` resolution) |
| `spotlight` | bool | If true, dim surrounding UI and spotlight the highlighted element |
| `position` | string? | Override callout position (`screen_center`, `near_element`, `bottom_bar`) |
| `action.type` | string | What the creator should do: `mode_switch`, `paint`, `place_entity`, `set_attribute`, `click_button`, `select_item`, `open_panel` |
| `validation.type` | string | How the engine confirms completion: `action_performed`, `cell_count`, `entity_count`, `attribute_set`, `preview_launched`, `file_saved`, `custom_lua` |

#### Tour Catalog

| Tour ID | Tool | Steps | Target Profile | Est. Time |
|---------|------|-------|---------------|-----------|
| `scenario_editor_basics` | Scenario Editor | 8 | new_to_editing | 10 min |
| `terrain_deep_dive` | Scenario Editor | 6 | new_to_editing | 8 min |
| `trigger_logic_101` | Scenario Editor | 7 | new_to_editing, aoe2 | 12 min |
| `module_system` | Scenario Editor | 5 | new_to_editing, ofp_eden | 8 min |
| `lua_scripting_intro` | Scenario Editor | 6 | new_to_editing | 15 min |
| `asset_studio_basics` | Asset Studio | 6 | new_to_editing | 8 min |
| `campaign_editor_basics` | Campaign Editor | 5 | new_to_editing | 10 min |
| `aoe2_migration` | Scenario Editor | 4 | aoe2 | 5 min |
| `ofp_migration` | Scenario Editor | 4 | ofp_eden | 5 min |
| `publish_workflow` | All tools | 5 | all | 8 min |

Migration tours (`aoe2_migration`, `ofp_migration`) are triggered automatically when the creator selects a "Coming From" profile on first SDK launch. They highlight IC equivalents for familiar concepts: "In AoE2 you use Triggers with Conditions and Effects. In IC, the same idea is split between Triggers (simple) and Modules (composable)."

#### Tour Entry Points

- **SDK Start Screen:** "New to the SDK? [Start Guided Tour]" — shown on first launch or if no tours have been completed
- **Tab bar:** Small tour icon (`?`) in the tool tab bar. Clicking it opens the relevant tour for that tool
- **Help menu:** `Help → Guided Tours` lists all available tours with completion status
- **"Coming From" auto-trigger:** Selecting a "Coming From" profile on first launch starts the corresponding migration tour
- **Console:** `/tour list`, `/tour start <id>`, `/tour reset`, `/tour resume`

#### Tour UX

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│           ┌────────── dimmed ──────────┐                         │
│           │                            │                         │
│           │    ┌──────────────┐        │                         │
│           │    │ ✦ SPOTLIGHT  │        │                         │
│           │    │  (Terrain    │        │                         │
│           │    │   tab)       │        │                         │
│           │    └──────────────┘        │                         │
│           │         ▼                  │                         │
│           │  ┌─────────────────────┐   │                         │
│           │  │ Step 2 of 8         │   │                         │
│           │  │                     │   │                         │
│           │  │ Terrain Painting    │   │                         │
│           │  │ Click the Terrain   │   │                         │
│           │  │ tab to start...     │   │                         │
│           │  │                     │   │                         │
│           │  │ [◄ Back] [Skip] [►] │   │                         │
│           │  └─────────────────────┘   │                         │
│           │                            │                         │
│           └────────────────────────────┘                         │
│                                                                  │
│  ═══════════════════════════════════════                          │
│  ●●○○○○○○  Scenario Editor Basics  [✕ Exit Tour]                 │
│  ═══════════════════════════════════════                          │
└──────────────────────────────────────────────────────────────────┘
```

- **Progress bar** at the bottom shows step dots and tour title
- **Callout bubble** appears near the highlighted element with title, text, and navigation buttons
- **Back/Skip/Next** buttons — Back replays the previous step, Skip advances without validation, Next advances after validation passes
- **Exit Tour** (`✕`) pauses the tour and saves progress; the tour can be resumed later from the tab bar icon or console

#### Tour History (SQLite)

```sql
-- In editor.db (separate from player.db — ic-editor is a separate binary)
CREATE TABLE sdk_tour_history (
    tour_id       TEXT NOT NULL,
    step_id       TEXT NOT NULL,
    completed     BOOLEAN NOT NULL DEFAULT FALSE,
    skipped       BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at  INTEGER,          -- Unix timestamp
    PRIMARY KEY (tour_id, step_id)
);
```

Tour completion unlocks a subtle "Tour Completed" badge in the SDK Start Screen's tour list. No forced gatekeeping — completing tours is encouraged, not required.

#### Tour Authoring by Modders

Modders can define tours for their editor extensions and total conversions using the same YAML schema. Tours are distributed via Workshop alongside the mod that defines them. The SDK discovers tour YAML files in the active mod's `sdk/tours/` directory and adds them to `Help → Guided Tours`.

This enables mod communities to ship onboarding for their custom editor modules, new terrain types, or unique trigger actions — the same way D065's `mod_specific` hints let gameplay mods teach their mechanics.

#### Relationship to D065

The SDK tour engine and D065's Layer 2 hint system share architectural DNA:

| Concept | D065 Layer 2 (Game Hints) | D038 Tours (SDK) |
|---------|--------------------------|-------------------|
| Definition format | YAML | YAML |
| Trigger evaluation | Game-state + UI-context | Editor UI events |
| Suppression/history | `hint_history` in `player.db` | `sdk_tour_history` in `editor.db` |
| Dismissal | Per-hint "Don't show again" | Per-tour "Exit Tour" + resume |
| Multi-step | No (single-shot tips) | Yes (ordered step sequences with validation) |
| Modder-extensible | Yes (YAML + Lua triggers) | Yes (YAML tours in mod `sdk/tours/`) |
| QoL toggle | Per-category in Settings | Tour prompts toggle in SDK Preferences |

The two systems are deliberately separate implementations in separate binaries (`ic-game` vs `ic-editor`) but follow the same design language so creators who've played the game recognize the interaction pattern.

### Embedded Authoring Manual & Context Help (D038 + D037 Knowledge Base Integration)

Powerful editors fail if users cannot discover what each flag, parameter, trigger action, module field, and script hook actually does. IC should ship an **embedded authoring manual** in the SDK, backed by the same D037 knowledge base content (no duplicate documentation system).

**Design goals:**
- **"What is possible?" discoverability** for advanced creators (OFP/ArmA-style reference depth)
- **Fast, contextual answers** without leaving the editor
- **Single source of truth** shared between web docs and SDK embedded help
- **Version-correct documentation** for the SDK version/project schema the creator is using

**Required SDK help surfaces:**
- **Global Documentation Browser** (`Help` / SDK Start Screen → `Documentation`)
  - searchable by term, alias, and old-engine vocabulary ("trigger area", "waypoint", "SQF equivalent", "OpenRA trait alias")
  - filters by domain (`Scenario Editor`, `Campaign Editor`, `Asset Studio`, `Lua`, `WASM`, `CLI`, `Export`)
- **Context Help (`F1`)**
  - opens the exact docs page/anchor for the selected field, module, trigger condition/action, command, or warning
- **Inline `?` tooltips / "What is this?"**
  - concise summary + constraints + defaults + "Open full docs"
- **Examples panel**
  - short snippets (YAML/Lua) and common usage patterns linked from the current feature

**Documentation coverage (authoring-focused):**
- every editor-exposed parameter/field: meaning, type, accepted values, default, range, side effects
- every trigger condition/action and module field
- every script command/API function (Lua, later WASM host calls)
- every CLI command/flag relevant to creator workflows (`ic mod`, `ic export`, validation, migration)
- export-safe / fidelity notes where a feature is IC-native or partially mappable (D066)
- deprecation/migration notes (`since`, `deprecated`, replacement)

**Generation/source model (same source as D037 knowledge base):**
- Reference pages are generated from schema + API metadata where possible
- Hand-written pages/cookbook entries provide rationale, recipes, and examples
- SDK embeds a versioned offline snapshot and can optionally open/update from the online docs
- SDK docs and web docs must not drift — they are different **views** of the same content set

**Editor metadata requirement (feeds docs + inline UX):**
- D038 module/trigger/field definitions should carry doc metadata (`summary`, `description`, constraints, examples, deprecation notes)
- Validation errors and warnings should link back to the same documentation anchors for fixes
- The same metadata should be available to future editor assistant features (D057) for grounded help

**UX guardrail:** Help must stay **non-blocking**. The editor should never force modal documentation before editing. Inline hints + F1 + searchable browser are the default pattern.

### Local Content Overlay & Dev Profile Run Mode (D020/D062 Integration)

Creators should be able to test local scenarios/mod content through the **real game runtime flow** without packaging or publishing on every iteration. The SDK should expose this as a first-class workflow rather than forcing a package/install loop.

**Principle: one runtime, two content-resolution contexts**
- The SDK does **not** launch a fake "editor-only runtime."
- `Play in Game` / `Run Local Content` launches the normal `ic-game` runtime path with a **local development profile / overlay** (D020 + D062).
- This keeps testing realistic (menus, loading, runtime init, D069 setup interactions where applicable) and avoids "works in preview, breaks in game" drift.

**Required workflow behavior:**
- **One-click local playtest from SDK** for the current scenario/campaign/mod context
- **Local overlay precedence** for the active project/session only (local files override installed content for that session)
- **Clear indicators** in the launched game and SDK session ("Local Content Overlay Active", profile name/source)
- **Optional hot-reload handoff** for YAML/Lua-friendly changes where supported (integrates with D020 `ic mod watch`)
- **No packaging/publish requirement** before local testing
- **No silent mutation** of installed Workshop packages or shared profiles

**Relation to existing D038 surfaces:**
- `Preview` remains the fastest in-editor loop
- `Test` / `Play in Game` uses the real runtime path with the local dev overlay
- `Validate` and `Publish` remain explicit downstream steps (Git-first and Publish Readiness rules unchanged)

**UX guardrail:** This workflow is a DX acceleration feature, not a new content source model. It must remain consistent with D062 profile/fingerprint boundaries and multiplayer compatibility rules (local dev overlays are local and non-canonical until packaged/published).

### Migration Workbench (SDK UI over `ic mod migrate`)

IC already commits to migration scripts and deprecation warnings at the CLI/API layer (see `04-MODDING.md` § "Mod API Stability & Compatibility"). The SDK adds a **Migration Workbench** as a visual wrapper over that same migration engine — not a second migration system.

**Phase 6a (read-only, low-friction):**
- **Upgrade Project** action on the SDK start screen and project menu
- **Deprecation dashboard** aggregating warnings from `ic mod check` / schema deprecations / editor file format deprecations
- **Migration preview** showing what `ic mod migrate` would change (read-only diff/report)
- **Report export** for code review or team handoff

**Phase 6b (apply mode):**
- Apply migration from the SDK using the same backend as the CLI
- Automatic rollback snapshot before apply
- Prompt to run `Validate` after migration
- Prompt to re-check export compatibility (OpenRA/RA1) if export-safe mode is enabled

The default SDK flow remains unchanged for casual creators. If a project opens cleanly, the Migration Workbench stays out of the way.

### Controller & Steam Deck Support

Steam Deck is a target platform (Invariant #10), so the editor must be usable without mouse+keyboard — but it doesn't need to be *equally* powerful. The approach: full functionality on mouse+keyboard, comfortable core workflows on controller.

- **Controller input mapping:** Left stick for cursor movement (with adjustable acceleration), right stick for camera pan/zoom. D-pad cycles editing modes. Face buttons: place (A), delete (B), properties panel (X), context menu (Y). Triggers: undo (LT), redo (RT). Bumpers: cycle selected entity type
- **Radial menus** — controller-optimized selection wheels for entity types, trigger types, and module categories (replacing mouse-dependent dropdowns)
- **Snap-to-grid** — always active on controller (optional on mouse) to compensate for lower cursor precision
- **Touch input (Steam Deck / mobile):** Tap to place, pinch to zoom, two-finger drag to pan. Long press for properties panel. Touch works as a complement to controller, not a replacement for mouse
- **Scope:** Core editing (terrain, entity placement, triggers, waypoints, modules, preview) is controller-compatible at launch. Advanced features (inline Lua editing, campaign graph wiring, dialogue tree authoring) require keyboard and are flagged in the UI: "Connect a keyboard for this feature." This is the same trade-off Eden Editor made — and Steam Deck has a built-in keyboard for occasional text entry

**Phase:** Controller input for the editor ships with Phase 6a. Touch input is Phase 7.

### Accessibility

The editor's "accessibility through layered complexity" principle applies to disability access, not just skill tiers. These features ensure the editor is usable by the widest possible audience.

**Visual accessibility:**
- **Colorblind modes** — all color-coded elements (trigger folders, layer colors, region colors, connection lines, complexity meter) use a palette designed for deuteranopia, protanopia, and tritanopia. In addition to color, elements use distinct **shapes and patterns** (dashed vs solid lines, different node shapes) so color is never the only differentiator
- **High contrast mode** — editor UI switches to high-contrast theme with stronger borders and larger text. Toggle in editor settings
- **Scalable UI** — all editor panels respect the game's global UI scale setting (50%–200%). Editor-specific elements (attribute labels, trigger text, node labels) scale independently if needed
- **Zoom and magnification** — the isometric viewport supports arbitrary zoom levels. Combined with UI scaling, users with low vision can work at comfortable magnification

**Motor accessibility:**
- **Full keyboard navigation** — every editor operation is reachable via keyboard. Tab cycles panels, arrow keys navigate within panels, Enter confirms, Escape cancels. No operation requires mouse-only gestures
- **Adjustable click timing** — double-click speed and drag thresholds are configurable for users with reduced dexterity
- **Sticky modes** — editing modes (terrain, entity, trigger) stay active until explicitly switched, rather than requiring held modifier keys

**Cognitive accessibility:**
- **Simple/Advanced mode** (already designed) is the primary cognitive accessibility feature — it reduces the number of visible options from 30+ to ~10
- **Consistent layout** — panels don't rearrange based on context. The attributes panel is always on the right, the mode selector always on the left. Predictable layout reduces cognitive load
- **Tooltips with examples** — every field in the attributes panel has a tooltip with a concrete example, not just a description. "Probability of Presence: 75" → tooltip: "75% chance this unit exists when the mission starts. Example: set to 50 for a coin-flip ambush."

**Phase:** Colorblind modes, UI scaling, and keyboard navigation ship with Phase 6a. High contrast mode and motor accessibility refinements ship in Phase 6b–7.

> **Note:** The accessibility features above cover the **editor** UI. **Game-level accessibility** — colorblind faction colors, minimap palettes, resource differentiation, screen reader support for menus, subtitle options for EVA/briefings, and remappable controls — is a separate concern that applies to `ic-render` and `ic-ui`, not `ic-editor`. Game accessibility ships in Phase 7 (see `08-ROADMAP.md`).

### Export Pipeline Integration (D066)

IC scenarios and campaigns can be exported to other Red Alert implementations. The full export architecture is defined in D066 (Cross-Engine Export & Editor Extensibility, in `src/decisions/09c-modding.md`). This section summarizes the editor integration points.

#### Export Targets

| Target | Output Format | Coverage |
|--------|--------------|----------|
| **IC Native** | `.icscn` / `.iccampaign` (YAML) | Full fidelity (default) |
| **OpenRA** | `.oramap` ZIP (map.yaml + map.bin + lua/) + MiniYAML rules + mod.yaml | High fidelity for standard RTS features; IC-specific features degrade with warnings |
| **Original Red Alert** | `rules.ini` + `.bin` (terrain) + `.mpr` (mission) + `.shp`/`.pal`/`.aud`/`.mix` | Moderate fidelity; complex triggers downcompile via pattern matching |

Export is intentionally **lossy** — IC-specific features (sub-scenario portals, weather system, veterancy, conditions/multipliers, advanced Lua triggers) are stripped with structured fidelity warnings. The philosophy: honest about limitations, never silently drops content.

#### Export-Safe Authoring Mode

When a creator selects an export target in the editor toolbar:

- **Feature gating** — IC-only features are grayed out or hidden (same data model, reduced UI surface)
- **Live fidelity indicators** — traffic-light badges (green/yellow/red) on each entity, trigger, and module:
  - Green: exports cleanly
  - Yellow: exports with degradation (tooltip explains what changes)
  - Red: cannot export (feature has no equivalent in the target)
- **Export-safe trigger templates** — pre-built trigger patterns guaranteed to downcompile cleanly to the target format. Available in the trigger palette when export mode is active

#### Trigger Downcompilation (Lua → Target Triggers)

D066 uses **pattern-based downcompilation** (not general transpilation) for converting IC Lua triggers to target formats:

| IC Lua Pattern | RA1 / OpenRA Equivalent |
|---|---|
| `Trigger.AfterDelay(ticks, fn)` | Timed trigger |
| `Trigger.OnEnteredFootprint(cells, fn)` | Cell trigger |
| `Trigger.OnKilled(actor, fn)` | Destroyed trigger |
| `Actor.Create(type, owner, pos)` | Teamtype + reinforcement |
| `actor:Attack(target)` | Teamtype attack waypoint |
| `Media.PlaySpeech(name)` | EVA speech action |
| `Mission.Complete("victory")` | Win trigger |
| `Mission.Complete("defeat")` | Lose trigger |

Unrecognized Lua patterns → fidelity warning with the code highlighted. The creator can simplify the logic or accept the limitation.

#### Editor Export Workflow

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐    ┌──────────┐
│ Select       │───►│ Validate with     │───►│ Export       │───►│ Output   │
│ Export Target│    │ target constraints │    │ Preview      │    │ files    │
└─────────────┘    └──────────────────┘    │ (fidelity   │    └──────────┘
                                           │  report)     │
                                           └─────────────┘
```

- **Validate** checks the scenario against the export target's constraints (map size limits, trigger compatibility, supported unit types)
- **Export Preview** shows the fidelity report — what exports cleanly, what degrades, what is stripped
- **Export** writes the output files to a directory

#### CLI Export

```bash
ic export --target openra mission.yaml -o ./output/
ic export --target ra1 campaign.yaml -o ./output/ --fidelity-report report.json
ic export --target openra --dry-run mission.yaml    # fidelity check only
ic export --target ra1,openra,ic maps/ -o ./export/  # batch export to multiple targets
```

#### Extensible Export Targets

D066's `ExportTarget` trait is a pluggable interface — not hardcoded for RA1/OpenRA. Community contributors can add export targets (Tiberian Sun, RA2, Remastered, etc.) via WASM (Tier 3) editor plugins distributed through Workshop. The pattern: the IC scenario editor becomes a **universal C&C mission authoring tool** that can target any engine in the ecosystem.

### Alternatives Considered

1. **In-game editor (original design, revised by D040):** The original D038 design embedded the editor inside the game binary. Revised to SDK-separate architecture — players shouldn't see creator tools. The SDK still reuses the same Bevy rendering and sim crates, so there's no loss of live preview capability. See D040 § SDK Architecture for the full rationale.
2. **Text-only editing (YAML + Lua):** Already supported for power users and LLM generation. The visual editor is the accessibility layer on top of the same data format.
3. **Node-based visual scripting (like Unreal Blueprints):** Too complex for the casual audience. Modules + triggers cover the sweet spot. Advanced users write Lua directly. A node editor is a potential Phase 7+ community contribution.
4. **LLM as editor assistant (structured tool-calling):** Not an alternative — a complementary layer. See D016 § "LLM-Callable Editor Tool Bindings" for the Phase 7 design that exposes editor operations as LLM-invokable tools. The editor command registry (Phase 6a) should be designed with this future integration in mind.

**Phase:** Core scenario editor (terrain + entities + triggers + waypoints + modules + compositions + preview + autosave + controller input + accessibility) ships in **Phase 6a** alongside the modding SDK and full Workshop. Phase 6a also adds the low-friction **Validate & Playtest** toolbar flow (`Preview` / `Test` / `Validate` / `Publish`), Quick/Publish validation presets, non-blocking validation execution with status badges, a Publish Readiness screen, Git-first collaboration foundations (stable IDs + canonical serialization + read-only Git status + semantic diff helper), Advanced-mode **Profile Playtest**, and the read-only Migration Workbench preview. **Phase 6b** ships campaign editor maturity features (graph/state/dashboard/intermissions/dialogue/named characters), game mode templates, multiplayer/co-op scenario tools, Game Master mode, advanced validation presets/batch validation, semantic merge helper + optional conflict resolver panel, Migration Workbench apply mode with rollback, and the Advanced-only Localization & Subtitle Workbench. Editor onboarding ("Coming From" profiles, keybinding presets, migration cheat sheets, partial import) and touch input ship in **Phase 7**. The campaign editor's graph, state dashboard, and intermission screens build on D021's campaign system (Phase 4) — the sim-side campaign engine must exist before the visual editor can drive it.

---

---

