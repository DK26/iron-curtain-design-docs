## D033: Toggleable QoL & Gameplay Behavior Presets

**Decision:** Every UX and gameplay behavior improvement added by OpenRA or the Remastered Collection over vanilla Red Alert is individually toggleable. Built-in presets group these toggles into coherent experience profiles. Players can pick a preset and then customize any individual toggle. In multiplayer lobbies, sim-affecting toggles are shared settings; client-only toggles are per-player.

**The problem this solves:**

OpenRA and the Remastered Collection each introduced dozens of quality-of-life improvements over the original 1996 Red Alert. Many are genuinely excellent (attack-move, waypoint queuing, multi-queue production). But some players want the authentic vanilla experience. Others want the full OpenRA feature set. Others want the Remastered Collection's specific subset. And some want to cherry-pick: "Give me OpenRA's attack-move but not its build radius circles."

Currently, no Red Alert implementation lets you do this. OpenRA's QoL features are hardcoded. The Remastered Collection's are hardcoded. Vanilla's limitations are hardcoded. Every version forces you into one developer's opinion of what the game "should" feel like.

**Our approach:** Every QoL feature is a YAML-configurable toggle. Presets set all toggles at once. Individual toggles override the preset. The player owns their experience.

### QoL Feature Catalog

Every toggle is categorized as **sim-affecting** (changes game logic — must be identical for all players in multiplayer) or **client-only** (visual/UX — each player can set independently).

#### Production & Economy (Sim-Affecting)

| Toggle               | Vanilla | OpenRA            | Remastered   | IC Default        | Description                                            |
| -------------------- | ------- | ----------------- | ------------ | ----------------- | ------------------------------------------------------ |
| `multi_queue`        | ❌       | ✅                 | ✅            | ✅                 | Queue multiple units of the same type                  |
| `parallel_factories` | ❌       | ✅                 | ✅            | ✅                 | Multiple factories of same type produce simultaneously |
| `build_radius_rule`  | None    | ConYard+buildings | ConYard only | ConYard+buildings | Where you can place new buildings                      |
| `sell_buildings`     | Partial | ✅ Full            | ✅ Full       | ✅ Full            | Sell any own building for partial refund               |
| `repair_buildings`   | ✅       | ✅                 | ✅            | ✅                 | Repair buildings for credits                           |

#### Unit Commands (Sim-Affecting)

| Toggle              | Vanilla | OpenRA | Remastered | IC Default | Description                                              |
| ------------------- | ------- | ------ | ---------- | ---------- | -------------------------------------------------------- |
| `attack_move`       | ❌       | ✅      | ✅          | ✅          | Move to location, engaging enemies en route              |
| `waypoint_queue`    | ❌       | ✅      | ✅          | ✅          | Shift-click to queue movement waypoints                  |
| `guard_command`     | ❌       | ✅      | ❌          | ✅          | Guard a unit or position, engage nearby threats          |
| `scatter_command`   | ❌       | ✅      | ❌          | ✅          | Units scatter from current position                      |
| `force_fire_ground` | ❌       | ✅      | ✅          | ✅          | Force-fire on empty ground (area denial)                 |
| `force_move`        | ❌       | ✅      | ✅          | ✅          | Force move through crushable targets                     |
| `rally_points`      | ❌       | ✅      | ✅          | ✅          | Set rally point for production buildings                 |
| `stance_system`     | None    | Full   | Basic      | Full       | Unit stance: aggressive / defensive / hold / return fire |

#### UI & Visual Feedback (Client-Only)

| Toggle                 | Vanilla | OpenRA   | Remastered     | IC Default     | Description                                                                             |
| ---------------------- | ------- | -------- | -------------- | -------------- | --------------------------------------------------------------------------------------- |
| `health_bars`          | `never` | `always` | `on_selection` | `on_selection` | Unit health bar visibility: `never` / `on_selection` / `always` / `damaged_or_selected` |
| `range_circles`        | ❌       | ✅        | ❌              | ✅              | Show weapon range circle when selecting defense buildings                               |
| `build_radius_display` | ❌       | ✅        | ❌              | ✅              | Show buildable area around construction yard / buildings                                |
| `power_indicators`     | ❌       | ✅        | ✅              | ✅              | Visual indicator on buildings affected by low power                                     |
| `support_power_timer`  | ❌       | ✅        | ✅              | ✅              | Countdown timer bar for superweapons                                                    |
| `production_progress`  | ❌       | ✅        | ✅              | ✅              | Progress bar on sidebar build icons                                                     |
| `target_lines`         | ❌       | ✅        | ❌              | ✅              | Lines showing order targets (move, attack)                                              |
| `rally_point_display`  | ❌       | ✅        | ✅              | ✅              | Visual line from factory to rally point                                                 |

#### Selection & Input (Client-Only)

| Toggle                     | Vanilla | OpenRA    | Remastered | IC Default | Description                                              |
| -------------------------- | ------- | --------- | ---------- | ---------- | -------------------------------------------------------- |
| `double_click_select_type` | ❌       | ✅         | ✅          | ✅          | Double-click a unit to select all of that type on screen |
| `ctrl_click_select_type`   | ❌       | ✅         | ✅          | ✅          | Ctrl+click to add all of type to selection               |
| `tab_cycle_types`          | ❌       | ✅         | ❌          | ✅          | Tab through unit types in multi-type selection           |
| `control_group_limit`      | 10      | Unlimited | Unlimited  | Unlimited  | Max units per control group (0 = unlimited)              |
| `smart_select_priority`    | ❌       | ✅         | ❌          | ✅          | Prefer combat units over harvesters in box select        |

#### Gameplay Rules (Sim-Affecting, Lobby Setting)

| Toggle          | Vanilla | OpenRA         | Remastered | IC Default     | Description                                        |
| --------------- | ------- | -------------- | ---------- | -------------- | -------------------------------------------------- |
| `fog_of_war`    | ❌       | Optional       | ❌          | Optional       | Fog of war (explored but not visible = greyed out) |
| `shroud_regrow` | ❌       | Optional       | ❌          | ❌              | Explored shroud grows back after units leave       |
| `short_game`    | ❌       | Optional       | ❌          | Optional       | Destroying all production buildings = defeat       |
| `crate_system`  | Basic   | Enhanced       | Basic      | Enhanced       | Bonus crates type and behavior                     |
| `ore_regrowth`  | ✅       | ✅ Configurable | ✅          | ✅ Configurable | Ore regeneration rate                              |

### Experience Presets

Presets set all toggles at once. The player selects a preset, then overrides individual toggles if they want.

| Preset                     | Balance (D019) | Theme (D032) | QoL (D033)     | Feel                                      |
| -------------------------- | -------------- | ------------ | -------------- | ----------------------------------------- |
| **Vanilla RA**             | `classic`      | `classic`    | `vanilla`      | Authentic 1996 experience — warts and all |
| **OpenRA**                 | `openra`       | `modern`     | `openra`       | Full OpenRA experience                    |
| **Remastered**             | `remastered`   | `remastered` | `remastered`   | Remastered Collection feel                |
| **Iron Curtain** (default) | `classic`      | `modern`     | `iron_curtain` | Classic balance + best QoL from all eras  |
| **Custom**                 | any            | any          | any            | Player picks everything                   |

The "Iron Curtain" default cherry-picks: classic balance (units feel iconic), modern theme (polished UI), and the best QoL features from both OpenRA and Remastered (attack-move, multi-queue, health bars, range circles — everything that makes the game more playable without changing game feel).

### YAML Structure

```yaml
# presets/qol/iron_curtain.yaml
qol:
  name: "Iron Curtain"
  description: "Best quality-of-life features from all eras"

  production:
    multi_queue: true
    parallel_factories: true
    build_radius_rule: conyard_and_buildings
    sell_buildings: full
    repair_buildings: true

  commands:
    attack_move: true
    waypoint_queue: true
    guard_command: true
    scatter_command: true
    force_fire_ground: true
    force_move: true
    rally_points: true
    stance_system: full    # none | basic | full

  ui_feedback:
    health_bars: on_selection  # never | on_selection | always | damaged_or_selected
    range_circles: true
    build_radius_display: true
    power_indicators: true
    support_power_timer: true
    production_progress: true
    target_lines: true
    rally_point_display: true

  selection:
    double_click_select_type: true
    ctrl_click_select_type: true
    tab_cycle_types: true
    control_group_limit: 0    # 0 = unlimited
    smart_select_priority: true

  gameplay:
    fog_of_war: optional      # on | off | optional (lobby choice)
    shroud_regrow: false
    short_game: optional
    crate_system: enhanced    # none | basic | enhanced
    ore_regrowth: true
```

```yaml
# presets/qol/vanilla.yaml
qol:
  name: "Vanilla Red Alert"
  description: "Authentic 1996 experience"

  production:
    multi_queue: false
    parallel_factories: false
    build_radius_rule: none
    sell_buildings: partial
    repair_buildings: true

  commands:
    attack_move: false
    waypoint_queue: false
    guard_command: false
    scatter_command: false
    force_fire_ground: false
    force_move: false
    rally_points: false
    stance_system: none

  ui_feedback:
    health_bars: never
    range_circles: false
    build_radius_display: false
    power_indicators: false
    support_power_timer: false
    production_progress: false
    target_lines: false
    rally_point_display: false

  selection:
    double_click_select_type: false
    ctrl_click_select_type: false
    tab_cycle_types: false
    control_group_limit: 10
    smart_select_priority: false

  gameplay:
    fog_of_war: off
    shroud_regrow: false
    short_game: off
    crate_system: basic
    ore_regrowth: true
```

### Sim vs Client Split

Critical for multiplayer: some toggles change game rules, others are purely cosmetic.

**Sim-affecting toggles** (lobby settings — all players must agree):
- Everything in `production`, `commands`, and `gameplay` sections
- These are validated deterministically by the sim (invariant #1)
- Multiplayer lobby: host sets the QoL preset; displayed to all players before match start
- Mismatch = connection refused (enforced by sim hash, same as balance presets)

**Client-only toggles** (per-player preferences — each player sets their own):
- Everything in `ui_feedback` and `selection` sections
- One player can play with always-visible health bars while their opponent plays with none
- Stored in player settings, not in the lobby configuration
- No sim impact — purely visual/UX

**Client-only onboarding/touch comfort settings (D065 integration):**
- Tutorial hint frequency and category toggles (already in D065)
- First-run controls walkthrough prompts (show on first launch / replay walkthrough / suppress)
- Mobile handedness and touch interaction affordance visibility (e.g., command rail hints, bookmark dock labels)
- Mobile Tempo Advisor warnings and reminder suppression ("don't show again for this profile")

These settings are client-only for the same reason as subtitles or UI scale: they shape presentation and teaching pace, not the simulation. They may reference lobby state (e.g., selected game speed) to display warnings, but they never alter the synced match configuration by themselves.

### Interaction with Other Systems

**D019 (Balance Presets):** QoL presets and balance presets are independent axes. You can play with `classic` balance + `openra` QoL, or `openra` balance + `vanilla` QoL. The lobby UI shows both selections.

**D032 (UI Themes):** QoL and themes are also independent. The "Classic" theme changes chrome appearance; the "Vanilla" QoL preset changes gameplay behavior. They're separate settings that happen to compose well.

**D065 (Tutorial & New Player Experience):** The tutorial system uses D033 for per-player hint frequency, category toggles, controls walkthrough visibility, and touch comfort guidance. The same mission/tutorial content is shared across platforms; D033 preferences control how aggressively the UI teaches and warns, not what the simulation does.

**Experience Profiles:** The meta-layer above all of these. Selecting "Vanilla RA" experience profile sets D019=classic, D032=classic, D033=vanilla, D043=classic-ra, D045=classic-ra, D048=classic in one click. Selecting "Iron Curtain" sets D019=classic, D032=modern, D033=iron_curtain, D043=ic-default, D045=ic-default, D048=hd. After selecting a profile, any individual setting can still be overridden.

**Modding (Tier 1):** QoL presets are just YAML files in `presets/qol/`. Modders can create custom QoL presets — a total conversion mod ships its own preset tuned for its gameplay. The `mod.yaml` manifest can specify a default QoL preset.

### Rationale

- **Respect for all eras.** Each version of Red Alert — original, OpenRA, Remastered — has a community that loves it. Forcing one set of behaviors on everyone loses part of the audience.
- **Player agency.** "Good defaults with full customization" is the guiding principle. The IC default enables the best QoL features; purists can turn them off; power users can cherry-pick.
- **Zero engine complexity.** QoL toggles are just config flags read by systems that already exist. Attack-move is either registered as a command or not. Health bars are either rendered or not. No complex runtime switching — the config is read once at game start.
- **Multiplayer safety.** The sim/client split ensures determinism. Sim-affecting toggles are lobby settings (like game speed or starting cash). Client-only toggles are personal preferences (like enabling subtitles in any other game).
- **Natural extension of D019 + D032.** Balance, theme, and behavior are three independent axes of experience customization. Together they let a player fully configure what "Red Alert" feels like to them.

### UX Principle: No Dead-End Buttons

**Never grey out or disable a button without telling the player why and how to fix it.** A greyed-out button is a dead end — the player sees a feature exists, knows they can't use it, and has no idea what to do about it. This is a universal UX anti-pattern.

IC's rule: **every button is always clickable.** If a feature requires something the player hasn't configured, clicking the button opens an **inline guidance panel** that:

1. **Explains what's needed** — a short, plain-language sentence (not a generic "feature unavailable")
2. **Offers a direct link** to the relevant settings/configuration screen
3. **Returns the player** to where they were after configuration, so they can continue seamlessly

**Examples across the engine:**

| Button Clicked                    | Missing Prerequisite           | Guidance Panel Shows                                                                                                                                                        |
| --------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "New Generative Campaign"         | No LLM provider configured     | "Generative campaigns need an LLM provider to create missions. [Configure LLM Provider →] You can also browse pre-generated campaigns on the Workshop. [Browse Workshop →]" |
| "3D View" render mode             | 3D mod not installed           | "3D rendering requires a render mod that provides 3D models. [Browse Workshop for 3D mods →]"                                                                               |
| "HD" render mode                  | HD sprite pack not installed   | "HD mode requires an HD sprite resource pack. [Browse Workshop →] [Learn more about resource packs →]"                                                                      |
| "Generate Assets" in Asset Studio | No LLM provider configured     | "Asset generation uses an LLM to create sprites, palettes, and other resources. [Configure LLM Provider →]"                                                                 |
| "Publish to Workshop"             | No community server configured | "Publishing requires a community server account. [Set up community server →] [What is a community server? →]"                                                               |

This principle applies to **every UI surface** — game menus, SDK tools, lobby, settings, Workshop browser. No exceptions. The guidance panel is a lightweight overlay (not a modal dialog that blocks interaction), styled to match the active UI theme (D032), and dismissible with Escape or clicking outside.

**Why this matters:**
- Players discover features by clicking things. A greyed-out button teaches them "this doesn't work" and they may never try again. A guidance panel teaches them "this works if you do X" and gets them there in one click.
- Reduces support questions. Instead of "why is this button grey," the UI answers the question before it's asked.
- Respects player intelligence. The player clicked the button because they wanted the feature — help them get it, don't just say no.

**Alternatives considered:**
- Hardcode one set of behaviors (rejected — this is what every other implementation does; we can do better)
- Make QoL features mod-only (rejected — too important to bury behind modding; should be one click in settings, same as D019)
- Only offer presets without individual toggles (rejected — power users need granular control; presets are starting points, not cages)
- Bundle QoL into balance presets (rejected — "I want OpenRA's attack-move but classic unit values" is a legitimate preference; conflating balance with UX is a design mistake)

**Phase:** Phase 3 (alongside D032 UI themes and sidebar work). QoL toggles are implemented as system-level config flags — each system checks its toggle on initialization. Preset YAML files are authored during Phase 2 (simulation) as features are built.

---

---

---
