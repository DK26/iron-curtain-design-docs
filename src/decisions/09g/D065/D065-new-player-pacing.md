### Layer 3 — New Player Pipeline

The first-launch flow (see `17-PLAYER-FLOW.md`) includes a self-identification step:

```
Theme Selection (D032) → Self-Identification → Controls Walkthrough (optional) → Tutorial Offer → Main Menu
```

#### Self-Identification Gate

```
┌──────────────────────────────────────────────────┐
│  WELCOME, COMMANDER                              │
│                                                  │
│  How familiar are you with real-time strategy?   │
│                                                  │
│  ► New to RTS games                              │
│  ► Played some RTS games before                  │
│  ► Red Alert veteran                             │
│  ► OpenRA / Remastered player                    │
│  ► Skip — just let me play                       │
│                                                  │
└──────────────────────────────────────────────────┘
```

This sets the `experience_profile` used by all five layers. The profile is stored in `player.db` (D034) and changeable in `Settings → QoL → Experience Profile`.

| Selection           | Experience Profile | Default Hints      | Tutorial Offer                                   |
| ------------------- | ------------------ | ------------------ | ------------------------------------------------ |
| New to RTS          | `new_to_rts`       | All on             | "Would you like to start with Commander School?" |
| Played some RTS     | `rts_player`       | Economy + Controls | "Commander School available in Campaigns"        |
| Red Alert veteran   | `ra_veteran`       | Economy only       | Badge on campaign menu                           |
| OpenRA / Remastered | `openra_player`    | Mod-specific only  | Badge on campaign menu                           |
| Skip                | `skip`             | All off            | No offer                                         |

#### Controls Walkthrough (Phase 3, Skippable)

A short controls walkthrough is offered immediately after self-identification. It is **platform-specific in presentation** and **shared in intent**:

- **Desktop:** mouse/keyboard prompts ("Right-click to move", `Ctrl+F5` to save camera bookmark)
- **Tablet:** touch prompts with sidebar + on-screen hotbar highlights
- **Phone:** touch prompts with build drawer, command rail, minimap cluster, and bookmark dock highlights

The walkthrough teaches only control fundamentals (camera pan/zoom, selection, context commands, control groups, minimap/radar, camera bookmarks, and build UI basics) and ends with three options:
- `Start Commander School`
- `Practice Sandbox`
- `Skip to Game`

This keeps D065's early experience friendly on touch devices without duplicating Commander School missions.

#### Canonical Input Action Model and Official Binding Profiles

To keep desktop, touch, Steam Deck, TV/gamepad, tutorials, and accessibility remaps aligned, D065 defines a **single semantic input action catalog**. The game binds physical inputs to semantic actions; tutorial prompts, the Controls Quick Reference, and the Controls-Changed Walkthrough all render from the same catalog.

**Design rule:** IC does not define "the keyboard layout" as raw keys first. It defines **actions** first, then ships official binding profiles per device/input class.

**Semantic action categories (canonical):**
- **Camera** — pan, zoom, center-on-selection, cycle alerts, save/jump camera bookmark, minimap jump/scrub
- **Selection & Orders** — select, add/remove selection, box select, deselect, context command, attack-move, guard, stop, force action, deploy, stance/ability shortcuts
- **Production & Build** — open/close build UI, category navigation, queue/cancel, structure placement confirm/cancel/rotate (module-specific), repair/sell/context build actions
- **Control Groups** — select group, assign group, add-to-group, center group
- **Communication & Coordination** — open chat, channel shortcuts, whisper, push-to-talk, ping wheel, chat wheel, minimap draw, tactical markers, callvote, and role-aware support request/response actions for asymmetric modes (D070)
- **UI / System** — pause/menu, scoreboard, controls quick reference, console (where supported), screenshot, replay controls, observer panels

**Official profile families (shipped defaults):**
- `Classic RA (KBM)` — preserves classic RTS muscle memory where practical
- `OpenRA (KBM)` — optimized for OpenRA veterans (matching common command expectations)
- `Modern RTS (KBM)` — IC default desktop profile tuned for discoverability and D065 onboarding
- `Gamepad Default` — cursor/radial hybrid for TV/console-style play
- `Steam Deck Default` — Deck-specific variant (touchpads/optional gyro/OSK-aware), not just generic gamepad
- `Touch Phone` and `Touch Tablet` — gesture + HUD layout profiles (defined by D059/D065 mobile control rules; not "key" maps, but still part of the same action catalog)

**D070 role actions:** Asymmetric mode actions (e.g., `support_request_cas`, `support_request_recon`, `support_response_approve`, `support_response_eta`) are additional semantic actions layered onto the same catalog and surfaced only when the active scenario/mode assigns a role that uses them.

**Binding profile behavior:**
- Profiles are versioned. A local profile stores either a stock profile ID or a **diff** from a stock profile (`Custom`).
- Rebinding UI edits semantic actions, never hardcodes UI-widget-local shortcuts.
- A single action may have multiple bindings (e.g., keyboard key + mouse button chord, or gamepad button + radial fallback).
- Platform-incompatible actions are hidden or remapped with a visible alternative (no dead-end actions on controller/touch).
- Tutorial prompts and quick reference entries resolve against the **active profile + current `InputCapabilities` + `ScreenClass`**.

**Official baseline defaults (high-level, normative examples):**

| Action | Desktop KBM default (Modern RTS) | Steam Deck / Gamepad default | Touch default |
| ------ | -------------------------------- | ---------------------------- | ------------- |
| Select / context command | Left-click / Right-click | Cursor confirm button (`A`/`Cross`) | Tap |
| Box select | Left-drag | Hold modifier + cursor drag / touchpad drag | Hold + drag |
| Attack-Move | `A` then target | Command radial → Attack-Move | Command rail `Attack-Move` (optional) |
| Guard | `Q` then target/self | Command radial → Guard | Command rail `Guard` (optional) |
| Stop | `S` | Face button / radial shortcut | Visible button in command rail/overflow |
| Deploy | `D` | Context action / radial | Context tap or rail button |
| Control groups | `1–0`, `Ctrl+1–0` | D-pad pages / radial groups (profile-defined) | Bottom control-group bar chips |
| Camera bookmarks | `F5–F8`, `Ctrl+F5–F8` | D-pad/overlay quick slots (profile-defined) | Bookmark dock near minimap (tap/long-press) |
| Open chat | `Enter` | Menu shortcut + OSK | Chat button + OS keyboard |
| Controls Quick Reference | `F1` | Pause → Controls (optionally bound) | Pause → Controls |

**Controller / Deck interaction model requirements (official profiles):**
- Controller profiles must provide a visible, discoverable path to all high-frequency orders (context command + command radial + pause/quick reference fallback)
- Steam Deck profile may use touchpad cursor and optional gyro precision, but every action must remain usable with gamepad-only input
- Text-heavy actions (chat, console where allowed) may invoke OSK; gameplay-critical actions may not depend on text entry
- Communication actions (PTT, ping wheel, chat wheel) must remain reachable without leaving combat camera control for more than one gesture/button chord

**Accessibility requirements for all profiles:**
- Full rebinding across keyboard, mouse, gamepad, and Deck controls
- Hold/toggle alternatives (e.g., PTT, radial hold vs tap-toggle, sticky modifiers)
- Adjustable repeat rates, deadzones, stick curves, cursor acceleration, and gyro sensitivity (where supported)
- One-handed / reduced-dexterity viable alternatives for high-frequency commands (via remaps, radials, or quick bars)
- Controls Quick Reference always reflects the player's current bindings and accessibility overrides, not only stock defaults

**Competitive integrity note:** Binding/remap freedom is supported, but multi-action automation/macros remain governed by D033 competitive equalization policy. Official profiles define discoverable defaults, not privileged input capabilities.

#### Official Default Binding Matrix (v1, Normative Baseline)

The tables below define the **normative baseline defaults** for:
- `Modern RTS (KBM)`
- `Gamepad Default`
- `Steam Deck Default` (Deck-specific overrides and additions)

`Classic RA (KBM)` and `OpenRA (KBM)` are compatibility-oriented profiles layered on the same semantic action catalog. They may differ in key placement, but must expose the same actions and remain fully documented in the Controls Quick Reference.

**Controller naming convention (generic):**
- `Confirm` = primary face button (`A` / `Cross`)
- `Cancel` = secondary face button (`B` / `Circle`)
- `Cmd Radial` = default **hold** command radial button (profile-defined; `Y` / `Triangle` by default)
- `Menu` / `View` = start/select-equivalent buttons

**Steam Deck defaults:** Deck inherits `Gamepad Default` semantics but prefers **right trackpad cursor** and optional **gyro precision** for fine targeting. All actions remain usable without gyro.

##### Camera & Navigation

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Camera pan | Mouse to screen edge / Middle-mouse drag | Left stick | Left stick | Edge-scroll can be disabled; drag-pan remains |
| Camera zoom in | Mouse wheel up | `RB` (tap) or zoom radial | `RB` (tap) / two-finger trackpad pinch emulation optional | Profile may swap with category cycling if player prefers |
| Camera zoom out | Mouse wheel down | `LB` (tap) or zoom radial | `LB` (tap) / two-finger trackpad pinch emulation optional | Same binding family as zoom in |
| Center on selection | `C` | `R3` click | `R3` click / `L4` (alt binding) | Mode-safe in gameplay and observer views |
| Cycle recent alert | `Space` | `D-pad Down` | `D-pad Down` | In replay mode, `Space` is reserved for replay pause/play |
| Jump bookmark slot 1–4 | `F5–F8` | `D-pad Left/Right` page + quick slot overlay confirm | Bookmark dock overlay via `R5`, then face/d-pad select | Quick slots map to D065 bookmark system |
| Save bookmark slot 1–4 | `Ctrl+F5–F8` | Hold bookmark overlay + `Confirm` on slot | Hold bookmark overlay (`R5`) + slot click/confirm | Matches desktop/touch semantics |
| Open minimap focus / camera jump mode | Mouse click minimap | `View` + left stick (minimap focus mode) | Left trackpad minimap focus (default) / `View`+stick fallback | No hidden-only path; visible in quick reference |

##### Selection & Orders

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Select / Context command | Left-click select / Right-click context | Cursor + `Confirm` | Trackpad cursor + `R2` (`Confirm`) | Same semantic action, resolved by context |
| Add/remove selection modifier | `Shift` + click/drag | `LT` modifier while selecting | `L2` modifier while selecting | Also used for queue modifier in production UI |
| Box select | Left-drag | Hold selection modifier + cursor drag | Hold `L2` + trackpad drag (or stick drag) | Touch remains hold+drag (D059/D065 mobile) |
| Deselect | `Esc` / click empty UI space | `Cancel` | `B` / `Cancel` | `Cancel` also exits modal targeting |
| Attack-Move | `A`, then target | `Cmd Radial` → Attack-Move | `R1` radial → Attack-Move | High-frequency, surfaced in radial + quick ref |
| Guard | `Q`, then target/self | `Cmd Radial` → Guard | `R1` radial → Guard | `Q` avoids conflict with `Hold G` ping wheel |
| Stop | `S` | `X` (tap) | `X` (tap) / `R4` (alt) | Immediate command, no target required |
| Force Action / Force Fire | `F`, then target | `Cmd Radial` → Force Action | `R1` radial → Force Action | Name varies by module; semantic action remains |
| Deploy / Toggle deploy state | `D` | `Y` (tap, context-sensitive) or radial | `Y` / radial | Falls back to context action if deployable selected |
| Scatter / emergency disperse | `X` | `Cmd Radial` → Scatter | `R1` radial → Scatter | Optional per module/profile; present if module supports |
| Cycle selected-unit subtype | `Ctrl+Tab` | `D-pad Right` (selection mode) | `D-pad Right` (selection mode) | If selection contains mixed types |

##### Production, Build, and Control Groups

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Open/close production panel focus | `B` (focus build UI) / click sidebar | `D-pad Left` (tap) | `D-pad Left` (tap) | Does not pause; focus shifts to production UI |
| Cycle production categories | `Q/E` (while build UI focused) | `LB/RB` | `LB/RB` | Contextual to production focus mode |
| Queue selected item | `Enter` / left-click on item | `Confirm` | `R2` / trackpad click | Works in production focus mode |
| Queue 5 / repeat modifier | `Shift` + queue | `LT` + queue | `L2` + queue | Uses same modifier family as selection add |
| Cancel queue item | Right-click queue slot | `Cancel` on queue slot | `B` on queue slot | Contextual in queue UI |
| Set rally point / waypoint | `R`, then target | `Cmd Radial` → Rally/Waypoint | `R1` radial → Rally/Waypoint | Module-specific labeling |
| Building placement confirm | Left-click | `Confirm` | `R2` / trackpad click | Ghost preview remains visible |
| Building placement cancel | `Esc` / Right-click | `Cancel` | `B` | Consistent across modes |
| Building placement rotate (if supported) | `R` | `Y` (placement mode) | `Y` (placement mode) | Context-sensitive; only shown if module supports rotation |
| Select control group 1–0 | `1–0` | Control-group overlay + slot select (`D-pad Up` opens) | Bottom/back-button overlay (`L4`) + slot select | Touch uses bottom control-group bar chips |
| Assign control group 1–0 | `Ctrl+1–0` | Overlay + hold slot | Overlay + hold slot | Assignment is explicit to avoid accidental overwrite |
| Center camera on control group | Double-tap `1–0` | Overlay + reselect active slot | Overlay + reselect active slot | Mirrors desktop double-tap behavior |

##### Communication & Coordination (D059)

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Open chat input | `Enter` | `View` (hold) → chat input / OSK | `View` (hold) or keyboard shortcut + OSK | D058/D059 command browser remains available where supported |
| Team chat shortcut | `/team` prefix or channel toggle in chat UI | Chat panel channel tab | Chat panel channel tab | Semantic action resolves to channel switch |
| All-chat shortcut | `/all` prefix or channel toggle in chat UI | Chat panel channel tab | Chat panel channel tab | D058 `/s` remains one-shot send |
| Whisper | `/w <player>` or player context menu | Player card → Whisper | Player card → Whisper | Visible UI path required |
| Push-to-talk (PTT) | `CapsLock` (default, rebindable) | `LB` (hold) | `L1` (hold) | VAD optional, PTT default per D059 |
| Ping wheel | `Hold G` + mouse direction | `R3` (hold) + right stick | `R3` hold + stick or right trackpad radial | Matches D059 controller guidance |
| Quick ping | `G` tap | `D-pad Up` tap | `D-pad Up` tap | Tap vs hold disambiguation for ping wheel |
| Chat wheel | `Hold V` + mouse direction | `D-pad Right` hold | `D-pad Right` hold | Quick-reference shows phrase preview by profile |
| Minimap draw | `Alt` + minimap drag | Minimap focus mode + `RT` draw | Touch minimap draw or minimap focus mode + `R2` | Deck prefers touch minimap when available |
| Callvote menu / command | `/callvote` or Pause → Vote | Pause → Vote | Pause → Vote | Console command remains equivalent where exposed |
| Mute/unmute player | Scoreboard/context menu (`Tab`) | Scoreboard/context menu | Scoreboard/context menu | No hidden shortcut required |

##### UI / System / Replay / Spectator

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Pause / Escape menu | `Esc` | `Menu` | `Menu` | In multiplayer opens escape menu, not sim pause |
| Scoreboard / player list | `Tab` | `View` (tap) | `View` (tap) | Supports mute/report/context actions |
| Controls Quick Reference | `F1` | Pause → Controls (bindable shortcut optional) | `L5` (hold) optional + Pause → Controls | Always reachable from pause/settings |
| Developer console (where supported) | `~` | Pause → Command Browser (GUI) | Pause → Command Browser (GUI) | No tilde requirement on non-keyboard platforms |
| Screenshot | `F12` | Pause → Photo/Share submenu (platform API) | `Steam`+`R1` (OS default) / in-game photo action | Platform-specific capture APIs may override |
| Replay pause/play (replay mode) | `Space` | `Confirm` | `R2` / `Confirm` | Mode-specific; does not conflict with live match `Space` alert cycle |
| Replay seek step ± | `,` / `.` | `LB/RB` (replay mode) | `LB/RB` (replay mode) | Profile may remap to triggers |
| Observer panel toggle | `O` | `Y` (observer mode) | `Y` (observer mode) | Only visible in spectator/caster contexts |

#### Workshop-Shareable Configuration Profiles (Optional)

Players can share **configuration profiles** via the Workshop as an optional, non-gameplay resource type. This includes:
- control bindings / input profiles (KBM, gamepad, Deck, touch layout preferences)
- accessibility presets (target size, hold/toggle behavior, deadzones, high-contrast HUD toggles)
- HUD/layout preference bundles (where layout profiles permit customization)
- camera/QoL preference bundles (non-authoritative client settings)

**Hard boundaries (safety / trust):**
- No secrets or credentials (API keys, tokens, account auth data) — those remain D047-only local secrets
- No absolute file paths, device serials, hardware IDs, or OS-specific personal data
- No executable scripts/macros bundled in config profiles
- No automatic application on install; imports always show a **scope + diff preview** before apply

**Compatibility metadata (required for controls-focused profiles):**
- semantic action catalog version
- target input class (`desktop_kbm`, `gamepad`, `deck`, `touch_phone`, `touch_tablet`)
- optional `ScreenClass` / layout profile compatibility hints
- notes for features required by the profile (e.g., gyro, rear buttons, command rail enabled)

**UX behavior:**
- Controls screen supports `Import`, `Export`, and `Share on Workshop`
- Workshop pages show the target device/profile class and a human-readable action summary (e.g., "Deck profile: right-trackpad cursor + gyro precision + PTT on L1")
- Applying a profile can be partial (controls-only, touch-only, accessibility-only) to avoid clobbering unrelated preferences

This follows the same philosophy as the Controls Quick Reference and D065 prompt system: shared semantics, device-specific presentation, and no hidden behavior.

#### Controls Quick Reference (Always Available, Non-Blocking)

D065 also provides a persistent **Controls Quick Reference** overlay/menu entry so advanced actions are never hidden behind memory or community lore.

**Rules:**
- Always available from gameplay (desktop, controller/Deck, and touch), pause menu, and settings
- Device-specific presentation, shared semantic content (same action catalog, different prompts/icons)
- Includes core actions + advanced/high-friction actions (camera bookmarks, command rail overrides, build drawer/sidebar interactions, chat/ping wheels)
- Dismissable, searchable, and safe to open/close without disrupting the current mode
- Can be pinned in reduced form during early sessions (optional setting), then auto-unpins as the player demonstrates mastery

This is a **reference aid**, not a tutorial gate. It never blocks gameplay and does not require completion.

#### Asymmetric Co-op Role Onboarding (D070 Extension)

When a player enters a D070 `Commander & Field Ops` scenario for the first time, D065 can offer a short, skippable **role onboarding** overlay before match start (or as a replayable help entry from pause/settings).

**What it teaches (v1):**
- the assigned role (`Commander` vs `Field Ops`)
- role-specific HUD regions and priorities
- request/response coordination loop (request support ↔ approve/deny/ETA)
- objective channel semantics (`Strategic`, `Field`, `Joint`)
- where to find the role-specific Controls Quick Reference page

**Rules:**
- skippable and replayable
- concept-first, not mission-specific scripting
- uses the same D065 semantic action prompt model (no separate input prompt system)
- profile/device aware (`KBM`, controller/Deck, touch) where the scenario/platform supports the role

#### Controls-Changed Walkthrough (One-Time After Input UX Changes)

When a game update changes control defaults, official input profile mappings, touch gesture behavior, command-rail mappings, or HUD placements in a way that affects muscle memory, D065 can show a short **What's Changed in Controls** walkthrough on next launch.

**Behavior:**
- Triggered by a local controls-layout/version mismatch (e.g., input profile schema version or layout profile revision)
- One-time prompt per affected profile/device; skippable and replayable later from Settings
- Focuses only on changed interactions (not a full tutorial replay)
- Prioritizes touch-platform changes (where discoverability regressions are most likely), but desktop can use it too
- Links to the Controls Quick Reference and Commander School for deeper refreshers

**Philosophy fit:** This preserves discoverability and reduces frustration without forcing players through onboarding again. It is a reversible UI aid, not a simulation change.

#### Skill Assessment (Phase 4)

After Commander School Mission 01 (or as a standalone 2-minute exercise accessible from `Settings → QoL → Recalibrate`), the engine estimates the player's baseline skill:

```
┌──────────────────────────────────────────────────┐
│  SKILL CALIBRATION (2 minutes)                   │
│                                                  │
│  Complete these exercises:                       │
│  ✓  Select and move units to waypoints           │
│  ✓  Select specific units from a mixed group     │
│  ►  Camera: pan to each flashing area            │
│  ►  Optional: save/jump a camera bookmark        │
│     Timed combat: destroy targets in order       │
│                                                  │
│  [Skip Assessment]                               │
└──────────────────────────────────────────────────┘
```

Measures:
- **Selection speed** — time to select correct units from a mixed group
- **Camera fluency** — time to pan to each target area
- **Camera bookmark fluency (optional)** — time to save and jump to a bookmarked location (measured only on platforms where bookmarks are surfaced in the exercise)
- **Combat efficiency** — accuracy of focused fire on marked targets
- **APM estimate** — actions per minute during the exercises

Results stored in SQLite:

```sql
-- In player.db
CREATE TABLE player_skill_estimate (
    player_id        TEXT PRIMARY KEY,
    selection_speed  INTEGER,    -- percentile (0–100)
    camera_fluency   INTEGER,
    bookmark_fluency INTEGER,    -- nullable/0 if exercise omitted
    combat_efficiency INTEGER,
    apm_estimate     INTEGER,    -- raw APM
    input_class      TEXT,       -- 'desktop', 'touch_phone', 'touch_tablet', 'deck'
    screen_class     TEXT,       -- 'Phone', 'Tablet', 'Desktop', 'TV'
    assessed_at      INTEGER,    -- Unix timestamp
    assessment_type  TEXT        -- 'tutorial_01' or 'standalone'
);
```

Percentiles are normalized **within input class** (desktop vs touch phone vs touch tablet vs deck) so touch players are not under-rated against mouse/keyboard baselines.

The skill estimate feeds Layers 2 and 4: hint frequency scales with skill (fewer hints for skilled players), the first skirmish AI difficulty recommendation uses the estimate, and touch tempo guidance can widen/narrow its recommended speed band based on demonstrated comfort.

### Layer 4 — Adaptive Pacing Engine

A background system (no direct UI — it shapes the other layers) that continuously estimates player mastery and adjusts the learning experience.

#### Inputs

- `hint_history` — which hints have been shown, dismissed, or mastered
- `player_skill_estimate` — from the skill assessment
- `gameplay_events` (D031) — actual in-game actions (build orders, APM, unit losses, idle time)
- `experience_profile` — self-identified experience level
- `input_capabilities` / `screen_class` — touch vs mouse/keyboard and phone/tablet layout context
- optional touch friction signals — misclick proxies, selection retries, camera thrash, pause frequency (single-player)

#### Outputs

- **Hint frequency multiplier** — scales the cooldown on all hints. A player demonstrating mastery gets longer cooldowns (fewer hints). A struggling player gets shorter cooldowns (more hints).
- **Difficulty recommendation** — suggested AI difficulty for the next skirmish. Displayed as a tooltip in the lobby AI picker: "Based on your recent games, Normal difficulty is recommended."
- **Feature discovery pacing** — controls how quickly progressive discovery notifications appear (Layer 5 below).
- **Touch tutorial prompt density** — controls how much on-screen guidance is shown for touch platforms (e.g., keep command-rail hints visible slightly longer for new phone players).
- **Recommended tempo band (advisory)** — preferred speed range for the current device/input/skill context. Used by UI warnings only; never changes sim state on its own.
- **Camera bookmark suggestion eligibility** — enables/disables "save camera location" hints based on camera fluency and map scale.
- **Tutorial EVA activation** — in the Allied/Soviet campaigns (not Commander School), first encounters with new unit types or buildings trigger a brief EVA line if the player hasn't completed the relevant Commander School mission. "Construction complete. This is a Radar Dome — it reveals the minimap." Only triggers once per entity type per campaign playthrough.

#### Pacing Algorithm

```
skill_estimate = weighted_average(
    0.3 × selection_speed_percentile,
    0.2 × camera_fluency_percentile,
    0.2 × combat_efficiency_percentile,
    0.15 × recent_apm_trend,           -- from gameplay_events
    0.15 × hint_mastery_rate            -- % of hints mastered vs shown
)

hint_frequency_multiplier = clamp(
    2.0 - (skill_estimate / 50.0),      -- range: 0.0 (no hints) to 2.0 (double frequency)
    min = 0.2,
    max = 2.0
)

recommended_difficulty = match skill_estimate {
    0..25   => "Easy",
    25..50  => "Normal",
    50..75  => "Hard",
    75..100 => "Brutal",
}
```

#### Mobile Tempo Advisor (Client-Only, Advisory)

The adaptive pacing engine also powers a **Tempo Advisor** for touch-first play. This system is intentionally non-invasive:

- **Single-player:** any speed allowed; warnings shown outside the recommended band; one-tap "Return to Recommended"
- **Casual multiplayer (host-controlled):** lobby shows a warning if the selected speed is outside the recommended band for participating touch players
- **Ranked multiplayer:** informational only; speed remains server/queue enforced (D055/D064, see `09b-networking.md`)

Initial default bands (experimental; tune from playtests):

| Context | Recommended Band | Default |
| ------- | ---------------- | ------- |
| Phone (new/average touch) | `slowest`-`normal` | `slower` |
| Phone (high skill estimate + tutorial complete) | `slower`-`faster` | `normal` |
| Tablet | `slower`-`faster` | `normal` |
| Desktop / Deck | unchanged | `normal` |

Commander School on phone/tablet starts at `slower` by default, but players may override it.

The advisor emits local-only analytics events (D031-compatible) such as `mobile_tempo.warning_shown` and `mobile_tempo.warning_dismissed` to validate whether recommendations reduce overload without reducing agency.

This is deterministic and entirely local — no LLM, no network, no privacy concerns. The pacing engine exists in `ic-ui` (not `ic-sim`) because it affects presentation, not simulation.

#### Implementation-Facing Interfaces (Client/UI Layer, No Sim Impact)

These types live in `ic-ui` / `ic-game` client codepaths (not `ic-sim`) and formalize camera bookmarks, semantic prompt resolution, and tempo advice:

```rust
pub struct CameraBookmarkSlot {
    pub slot: u8,                    // 1..=9
    pub label: Option<String>,       // local-only label
    pub world_pos: WorldPos,
    pub zoom_level: Option<FixedPoint>, // optional client camera zoom
}

pub struct CameraBookmarkState {
    pub slots: [Option<CameraBookmarkSlot>; 9],
    pub quick_slots: [u8; 4],        // defaults: [1, 2, 3, 4]
}

pub enum CameraBookmarkIntent {
    Save { slot: u8 },
    Jump { slot: u8 },
    Clear { slot: u8 },
    Rename { slot: u8, label: String },
}

pub enum InputPromptAction {
    Select,
    BoxSelect,
    MoveCommand,
    AttackCommand,
    AttackMoveCommand,
    OpenBuildUi,
    QueueProduction,
    UseMinimap,
    SaveCameraBookmark,
    JumpCameraBookmark,
}

pub struct TutorialPromptContext {
    pub input_capabilities: InputCapabilities,
    pub screen_class: ScreenClass,
    pub advanced_mode: bool,
}

pub struct ResolvedInputPrompt {
    pub text: String,             // localized, device-specific wording
    pub icon_tokens: Vec<String>, // e.g. "tap", "f5", "ctrl+f5"
}

pub struct UiAnchorAlias(pub String); // e.g. "primary_build_ui", "minimap_cluster"

pub enum TempoSpeedLevel {
    Slowest,
    Slower,
    Normal,
    Faster,
    Fastest,
}

pub struct TempoComfortBand {
    pub recommended_min: TempoSpeedLevel,
    pub recommended_max: TempoSpeedLevel,
    pub default_speed: TempoSpeedLevel,
    pub warn_above: Option<TempoSpeedLevel>,
    pub warn_below: Option<TempoSpeedLevel>,
}

pub enum InputSourceKind {
    MouseKeyboard,
    TouchPhone,
    TouchTablet,
    Controller,
}

pub struct TempoAdvisorContext {
    pub screen_class: ScreenClass,
    pub has_touch: bool,
    pub primary_input: InputSourceKind, // advisory classification only
    pub skill_estimate: Option<PlayerSkillEstimate>,
    pub mode: MatchMode,            // SP / casual MP / ranked
}

pub enum TempoWarning {
    AboveRecommendedBand,
    BelowRecommendedBand,
    TouchOverloadRisk,
}

pub struct TempoRecommendation {
    pub band: TempoComfortBand,
    pub warnings: Vec<TempoWarning>,
    pub rationale: Vec<String>,     // short UI strings
}
```

The touch/mobile control layer maps these UI intents to normal `PlayerOrder`s through the existing `InputSource` pipeline. Bookmarks and tempo advice remain local UI state; they never enter the deterministic simulation.

