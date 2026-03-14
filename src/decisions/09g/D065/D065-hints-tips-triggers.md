#### Feature Smart Tips (`hints/feature-tips.yaml`)

Non-gameplay feature screens use the same Layer 2 hint pipeline with UI-context triggers. These tips explain what each feature does in simple, approachable language for users encountering it for the first time. All tips are dismissible, respect "don't show again," and share the `hint_history` SQLite table.

```yaml
# hints/feature-tips.yaml — ships with the game
# Feature Smart Tips for non-gameplay screens (Workshop, Settings, Profile, Main Menu)
hints:

  # ── Workshop ──────────────────────────────────────────────

  - id: workshop_first_visit
    title: "Welcome to the Workshop"
    text: "The Workshop is where the community shares maps, mods, campaigns, and more. Browse by category or search for something specific."
    category: feature_discovery
    icon: hint_workshop
    trigger:
      type: ui_screen_enter
      screen_id: "workshop_browser"
      first_time: true
    suppression:
      mastery_action: workshop_install_resource
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: medium
    position: screen_center

  - id: workshop_categories
    title: "Content Categories"
    text: "Categories filter content by type. 'Maps' are standalone battle arenas. 'Mods' change game rules or add units. 'Campaigns' are multi-mission story experiences."
    category: feature_discovery
    icon: hint_workshop
    trigger:
      type: ui_element_focus
      element_id: "workshop_categories"
      dwell_seconds: 3
    suppression:
      mastery_action: workshop_filter_category
      mastery_threshold: 2
      cooldown_seconds: 300
      max_shows: 1
    experience_profiles: [new_to_rts, rts_player]
    priority: low
    position: near_element
    anchor_element: "workshop_categories"

  - id: workshop_install
    title: "Installing Content"
    text: "Click [Install] to download this content. It will be ready to use next time you start a game. Dependencies are installed automatically."
    category: feature_discovery
    icon: hint_download
    trigger:
      type: ui_screen_idle
      screen_id: "workshop_detail_page"
      idle_seconds: 10
    suppression:
      mastery_action: workshop_install_resource
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [new_to_rts, rts_player]
    priority: medium
    position: near_element
    anchor_element: "install_button"

  - id: workshop_mod_profiles
    title: "Mod Profiles"
    text: "Mod profiles let you save different combinations of mods and switch between them with one click. 'IC Default' is vanilla with no mods."
    category: feature_discovery
    icon: hint_profiles
    trigger:
      type: ui_screen_enter
      screen_id: "mod_profile_manager"
      first_time: true
    suppression:
      mastery_action: mod_profile_switch
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: medium
    position: screen_center

  - id: workshop_fingerprint
    title: "Mod Fingerprint"
    text: "The fingerprint is a unique code that identifies your exact mod combination. Players with the same fingerprint can play together online."
    category: feature_discovery
    icon: hint_fingerprint
    trigger:
      type: ui_element_focus
      element_id: "mod_profile_fingerprint"
      dwell_seconds: 5
    suppression:
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "fingerprint_display"

  - id: workshop_dependencies
    title: "Dependencies"
    text: "Some content requires other content to work. Dependencies are installed automatically when you install something."
    category: feature_discovery
    icon: hint_dependency
    trigger:
      type: ui_element_focus
      element_id: "dependency_tree"
      dwell_seconds: 3
    suppression:
      max_shows: 1
    experience_profiles: [new_to_rts, rts_player]
    priority: low
    position: near_element
    anchor_element: "dependency_tree"

  - id: workshop_my_content
    title: "My Content"
    text: "My Content shows everything you've downloaded. You can pin items to keep them permanently, or let unused items expire to save disk space."
    category: feature_discovery
    icon: hint_storage
    trigger:
      type: ui_screen_enter
      screen_id: "workshop_my_content"
      first_time: true
    suppression:
      mastery_action: workshop_pin_resource
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: medium
    position: screen_center

  # ── Settings ──────────────────────────────────────────────

  - id: settings_experience_profile
    title: "Experience Profiles"
    text: "Experience profiles bundle settings for your skill level. 'New to RTS' shows more hints and easier defaults. You can change this anytime."
    category: feature_discovery
    icon: hint_profile
    trigger:
      type: ui_element_focus
      element_id: "experience_profile_selector"
      dwell_seconds: 5
    suppression:
      mastery_action: change_experience_profile
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [new_to_rts, rts_player]
    priority: medium
    position: near_element
    anchor_element: "experience_profile_selector"

  - id: settings_performance_profile
    title: "Performance Profiles"
    text: "The Performance Profile at the top adjusts many video settings at once. 'Recommended' is auto-detected for your hardware. Try it before tweaking individual settings."
    category: feature_discovery
    icon: hint_performance
    trigger:
      type: ui_screen_enter
      screen_id: "settings_video"
      first_time: true
    suppression:
      mastery_action: change_performance_profile
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "performance_profile_selector"

  - id: settings_controls_profiles
    title: "Input Profiles"
    text: "IC ships with input profiles for different play styles. If you're used to another RTS, try the matching profile."
    category: feature_discovery
    icon: hint_controls
    trigger:
      type: ui_screen_enter
      screen_id: "settings_controls"
      first_time: true
    suppression:
      mastery_action: change_input_profile
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [ra_veteran, openra_player, rts_player]
    priority: low
    position: near_element
    anchor_element: "input_profile_selector"

  - id: settings_qol_hints
    title: "Hint Preferences"
    text: "You can turn hint categories on or off here. If tips feel repetitive, disable a category instead of all hints."
    category: feature_discovery
    icon: hint_settings
    trigger:
      type: ui_element_focus
      element_id: "qol_hints_section"
      dwell_seconds: 3
    suppression:
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "qol_hints_section"

  # ── Player Profile ────────────────────────────────────────

  - id: profile_first_visit
    title: "Your Profile"
    text: "This is your profile. It tracks your stats, achievements, and match history. Other players can see your public profile in lobbies."
    category: feature_discovery
    icon: hint_profile
    trigger:
      type: ui_screen_enter
      screen_id: "player_profile"
      first_time: true
    suppression:
      max_shows: 1
    experience_profiles: [all]
    priority: medium
    position: screen_center

  - id: profile_achievements
    title: "Achievement Showcase"
    text: "Pin up to 6 achievements to your profile to show them off in lobbies and on your player card."
    category: feature_discovery
    icon: hint_achievement
    trigger:
      type: ui_screen_enter
      screen_id: "profile_achievements"
      first_time: true
    suppression:
      mastery_action: pin_achievement
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "pin_achievement_button"

  - id: profile_rating
    title: "Skill Rating"
    text: "Your rating reflects your competitive skill. Play ranked matches to calibrate it. Click the rating for detailed stats."
    category: feature_discovery
    icon: hint_ranked
    trigger:
      type: ui_element_focus
      element_id: "rating_display"
      dwell_seconds: 5
    suppression:
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "rating_display"

  - id: profile_campaign_progress
    title: "Campaign Progress"
    text: "Campaign progress is stored locally. Opt in to community benchmarks to see how your progress compares (spoiler-safe)."
    category: feature_discovery
    icon: hint_campaign
    trigger:
      type: ui_element_focus
      element_id: "campaign_progress_card"
      dwell_seconds: 3
    suppression:
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "campaign_progress_card"

  # ── Main Menu Discovery ───────────────────────────────────

  - id: menu_workshop_discovery
    title: "Community Workshop"
    text: "The Workshop has community content — maps, mods, and campaigns made by other players. Check it out!"
    category: feature_discovery
    icon: hint_workshop
    trigger:
      type: ui_feature_unused
      feature_id: "workshop"
      sessions_without_use: 5
    suppression:
      mastery_action: workshop_visit
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "main_menu_workshop"

  - id: menu_replays_discovery
    title: "Replay Viewer"
    text: "Your matches are saved as replays automatically. Watch them to learn from mistakes or relive great moments."
    category: feature_discovery
    icon: hint_replay
    trigger:
      type: ui_feature_unused
      feature_id: "replays"
      sessions_without_use: 3
    suppression:
      mastery_action: replay_view
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: low
    position: near_element
    anchor_element: "main_menu_replays"

  - id: menu_console_discovery
    title: "Command Console"
    text: "Press Enter and type / to access the command console. It has shortcuts for common actions."
    category: feature_discovery
    icon: hint_console
    trigger:
      type: ui_feature_unused
      feature_id: "console"
      sessions_without_use: 10
    suppression:
      mastery_action: console_open
      mastery_threshold: 1
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [rts_player, ra_veteran, openra_player]
    priority: low
    position: bottom_bar
```

#### Trigger Types (Extensible)

| Trigger Type          | Parameters                                         | Fires When                                                     |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `unit_idle`           | `unit_type`, `idle_duration_seconds`               | A unit of that type has been idle for N seconds                |
| `resource_threshold`  | `resource`, `condition`, `sustained_seconds`       | A resource exceeds/falls below a threshold for N seconds       |
| `unit_count`          | `condition`, `without_action`, `sustained_seconds` | Player has N units and hasn't performed the suggested action   |
| `time_without_action` | `action`, `time_minutes`, `min_game_time_minutes`  | N minutes pass without the player performing a specific action |
| `building_ready`      | `building_type`, `ability`, `first_time`           | A building completes construction (or its ability charges)     |
| `first_encounter`     | `entity_type`                                      | Player sees an enemy unit/building type for the first time     |
| `damage_taken`        | `damage_source_type`, `threshold_percent`          | Player units take significant damage from a specific type      |
| `area_enter`          | `area`, `unit_types`                               | Player units enter a named map region                          |
| `custom`              | `lua_condition`                                    | Lua expression evaluates to true (Tier 2 mods only)            |

**UI-context triggers** — these fire outside gameplay, on feature screens (Workshop, Settings, Player Profile, Main Menu, etc.):

| Trigger Type            | Parameters                                 | Fires When                                                           |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `ui_screen_enter`       | `screen_id`, `first_time`                  | Player navigates to a screen (optionally: first time only)           |
| `ui_element_focus`      | `element_id`, `dwell_seconds`              | Player hovers/dwells on a UI element for N seconds                   |
| `ui_action_attempt`     | `action_id`, `failed`                      | Player attempts a UI action (optionally: only when it fails)         |
| `ui_screen_idle`        | `screen_id`, `idle_seconds`                | Player has been on a screen for N seconds without meaningful input    |
| `ui_feature_unused`     | `feature_id`, `sessions_without_use`       | A feature has been available for N sessions but the player never used it |

UI-context triggers use the same hint pipeline (trigger → filter → render) and the same `hint_history` SQLite table. The only difference is evaluation context: game-state triggers run during simulation ticks, UI-context triggers run on screen navigation and idle timers.

**Position values for UI-context hints:**

In addition to the gameplay positions (`near_unit`, `near_building`, `screen_top`, `near_sidebar`), UI-context hints support:

| Position       | Behavior                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| `screen_center`| Centered overlay on the current screen (used for welcome/first-visit tips) |
| `near_element` | Anchored to a specific UI element via `anchor_element` field             |
| `bottom_bar`   | Non-intrusive bar at the bottom of the screen                            |

When `position: near_element` is used, the hint definition must include an `anchor_element` field specifying the logical UI element ID (e.g., `workshop_categories`, `install_button`, `experience_profile_selector`). The renderer resolves logical IDs to screen coordinates using the same `UiAnchorAlias` system as tutorial step highlights.

Modders define new triggers via Lua (Tier 2) or WASM (Tier 3). The `custom` trigger type is a Lua escape hatch for conditions that don't fit the built-in types.

#### Hint History (SQLite)

```sql
-- In player.db (D034)
CREATE TABLE hint_history (
    hint_id       TEXT NOT NULL,
    show_count    INTEGER NOT NULL DEFAULT 0,
    last_shown    INTEGER,          -- Unix timestamp
    dismissed     BOOLEAN NOT NULL DEFAULT FALSE,  -- "Don't show again"
    mastery_count INTEGER NOT NULL DEFAULT 0,      -- times the mastery_action was performed
    PRIMARY KEY (hint_id)
);
```

The hint system queries this table before showing each hint. `mastery_count >= mastery_threshold` suppresses the hint permanently. `dismissed = TRUE` suppresses it permanently. `last_shown + cooldown_seconds > now` suppresses it temporarily.

#### QoL Integration (D033)

Hints are individually toggleable per category in `Settings → QoL → Hints`:

| Setting            | Default (New to RTS) | Default (RA Vet) | Default (OpenRA) |
| ------------------ | -------------------- | ---------------- | ---------------- |
| Economy hints      | On                   | On               | Off              |
| Combat hints       | On                   | Off              | Off              |
| Controls hints     | On                   | On               | Off              |
| Strategy hints     | On                   | Off              | Off              |
| IC new features    | On                   | On               | On               |
| Mod-specific hints | On                   | On               | On               |
| Feature discovery  | On                   | On               | On               |
| Hint frequency     | Normal               | Reduced          | Minimal          |
| EVA voice on hints | On                   | Off              | Off              |

`/hints` console commands (D058): `/hints list`, `/hints enable <category>`, `/hints disable <category>`, `/hints reset`, `/hints suppress <id>`.

