# Replay Highlights & Play-of-the-Game — Design Specification

> **Status:** Design study
> **Date:** 2026-03-14
> **Resolves:** No automatic highlight detection in replay system; no POTG-style feature for RTS; main menu background limited to shellmap AI battles
> **Cross-references:** D010 (snapshottable sim), D031 (telemetry/analytics events), D032 (UI themes/shellmap), D033 (QoL toggles), D056 (foreign replay import), D058 (console commands), D059 (pings/markers), D065 (tutorial — annotated replay mode)
> **Format references:** `src/formats/save-replay-formats.md` (`.icrep` format), `src/formats/replay-keyframes-analysis.md` (15 analysis event types)
> **Player flow references:** `src/player-flow/replays.md` (replay browser/viewer), `src/player-flow/post-game.md` (post-game screen), `src/player-flow/main-menu.md` (main menu/shellmap)

---

## 0. Executive Summary

Iron Curtain's replay system already records a rich Analysis Event Stream (15 event types: `UnitDestroyed`, `PlayerStatSnapshot`, `CameraPositionSample`, etc.) alongside the deterministic order stream and keyframe snapshots. The replay viewer has six camera modes, eight observer overlays, timeline event markers, and a bookmark system. The post-game screen calculates 18 MVP award types from match statistics. **None of this infrastructure is currently used for automatic highlight detection or highlight playback.**

This document designs a **Replay Highlights system** that:

1. **Detects "interesting moments"** automatically from the Analysis Event Stream using a multi-criteria scoring pipeline (engagement density, momentum swings, statistical anomaly, rarity bonuses)
2. **Generates a Play-of-the-Game (POTG) moment** — the single best moment per match, shown on the post-game screen
3. **Builds a per-player highlight reel** stored locally — the top 5 moments from each match, accumulated over the player's career
4. **Plays highlights as main menu background** — an alternative to shellmap AI battles, cycling through the player's personal highlight reel (or community/tournament highlights)
5. **Supports community highlight sharing** — Workshop-distributed highlight packs from tournaments, streamers, and community curators

### Prior Art Survey

| Game                  | Highlight System                                                  | Scoring                                                                           | Camera                                       | RTS?           |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- | -------------- |
| **CS:GO/CS2**         | "Your Best" / "Your Lowlights" post-match                         | Kill clusters, multi-kills, clutch rounds, weapon bonuses                         | Killer POV, slow-mo on final kill            | No (FPS)       |
| **Overwatch**         | Play of the Game (POTG), top 5 auto-saved                         | Multi-dimensional: engagement cluster, efficiency, momentum swing, role weighting | Third-person dramatic angles, slow-mo        | No (FPS)       |
| **Dota 2**            | Post-game moment replays                                          | Multikill, killing spree, buyback clutch, rampage                                 | Isometric observer locked to action hot zone | Partial (MOBA) |
| **StarCraft 2**       | None (manual scrub) — Blizzard attempted in 2016, never shipped | —                                                                               | Observer AI for caster broadcasts            | Yes            |
| **Age of Empires 4**  | Timeline event markers (tech advance, production spike)           | Scripted detection, not scored                                                    | Standard replay camera                       | Yes            |
| **Company of Heroes** | Engagement heat map, theater mode                                 | Casualty count default sorting                                                    | Replay camera with bookmarks                 | Yes            |
| **C&C Remastered**    | None — community-requested feature                              | Community tool: largest engagement, building streaks, superweapons                | Standard replay camera                       | Yes            |
| **OpenRA**            | None — repeatedly requested (GitHub issues)                     | —                                                                               | Single observer POV per frame                | Yes            |

**Key insight:** No shipping RTS has automatic highlight detection. SC2 attempted it and abandoned it (ambiguity in "best moment" varies by skill level and game context). IC's rich Analysis Event Stream, existing post-game MVP infrastructure, and replay keyframe system position it uniquely to be the first RTS to ship this feature.

**Key challenge:** RTS highlights are fundamentally different from FPS highlights. An FPS highlight is a 5–15 second clip of aim precision. An RTS highlight is a 20–45 second narrative of army positioning, engagement, and outcome — closer to a sports highlight than a twitch clip. The detection and camera systems must account for this.

---

## 1. Highlight Detection Pipeline

### 1.1 Input: Analysis Event Stream

The `.icrep` Analysis Event Stream (flag `HAS_EVENTS`) already records these 15 event types per match:

| Event                   | Highlight Relevance | Why                                                                  |
| ----------------------- | ------------------- | -------------------------------------------------------------------- |
| `UnitDestroyed`         | **Critical**        | Kill clusters, army wipes, engagement scoring                        |
| `UnitCreated`           | Low                 | Context for army composition (not inherently exciting)               |
| `ConstructionStarted`   | Low                 | Build order context                                                  |
| `ConstructionCompleted` | Medium              | Tech milestones, expansion timing                                    |
| `UnitPositionSample`    | **High**            | Engagement spatial clustering, army movements                        |
| `PlayerStatSnapshot`    | **Critical**        | Momentum detection (periodic economy/army/tech snapshots)            |
| `ResourceCollected`     | Medium              | Economy swing detection                                              |
| `UpgradeCompleted`      | Medium              | Tech rush / game-changing upgrade moments                            |
| `CameraPositionSample`  | **High**            | Where the player was looking during the moment (camera AI reference) |
| `SelectionChanged`      | Low                 | Micro-management intensity signal                                    |
| `ControlGroupAction`    | Low                 | APM context                                                          |
| `VoteEvent`             | Low                 | Democratic moments (pause votes, surrender near-misses)              |

**Additional events needed** (new, recorded into the Analysis Event Stream):

| New Event           | Fields                                                                                                             | Why                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `EngagementStarted` | `tick`, `center_pos`, `player_units[]`, `enemy_units[]`, `total_value_friendly`, `total_value_enemy`               | Marks the start of a combat engagement (units entering weapon range). Required for engagement windowing. |
| `EngagementEnded`   | `tick`, `center_pos`, `friendly_losses`, `enemy_losses`, `friendly_survivors`, `enemy_survivors`, `duration_ticks` | Marks engagement resolution. Required for engagement scoring.                                            |
| `SuperweaponFired`  | `tick`, `weapon_type`, `target_pos`, `player`, `units_hit`, `buildings_hit`                                        | Superweapons are inherently highlight-worthy. Currently not a distinct event.                            |
| `BaseDestroyed`     | `tick`, `player`, `pos`, `buildings_lost[]`                                                                        | Primary base or expansion wiped — game-defining moment.                                                |
| `ArmyWipe`          | `tick`, `player`, `units_lost`, `total_value_lost`, `percentage_of_army`                                           | >70% of a player's army destroyed in one engagement.                                                     |
| `ComebackMoment`    | `tick`, `player`, `deficit_before`, `advantage_after`, `swing_value`                                               | Player goes from losing position to winning position. Detected by comparing `PlayerStatSnapshot` deltas. |

### 1.2 Scoring Algorithm

Highlight detection runs **post-match** (not real-time) over the recorded Analysis Event Stream. It uses a sliding window with four independent scoring dimensions:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Highlight Scoring Pipeline                     │
│                                                                  │
│  Analysis Event Stream                                           │
│        │                                                         │
│        ▼                                                         │
│  ┌──────────────┐                                                │
│  │   Window      │  Slide 5-tick steps across match timeline     │
│  │   Generator   │  Window size: configurable (default 30s)      │
│  └──────┬───────┘                                                │
│         │                                                         │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────────────┐        │
│  │  Four Scoring Dimensions (computed per window)        │        │
│  │                                                       │        │
│  │  1. Engagement Score    — kill density, army losses   │        │
│  │  2. Momentum Score      — economic/military swing     │        │
│  │  3. Anomaly Score       — statistical outlier (z >2σ) │        │
│  │  4. Rarity Score        — event type novelty bonus    │        │
│  └──────────────────┬───────────────────────────────────┘        │
│                     │                                             │
│                     ▼                                             │
│  ┌──────────────────────────────────┐                            │
│  │  Composite Score (weighted sum)   │                            │
│  │                                   │                            │
│  │  0.35 × Engagement                │                            │
│  │  0.25 × Momentum                  │                            │
│  │  0.20 × Anomaly                   │                            │
│  │  0.20 × Rarity                    │                            │
│  └──────────────┬───────────────────┘                            │
│                 │                                                  │
│                 ▼                                                  │
│  ┌──────────────────────────────┐                                │
│  │  Non-Maximum Suppression     │  Merge overlapping windows     │
│  │  (keep peak, discard <15s    │  into single highlight moment  │
│  │   neighbors)                 │                                 │
│  └──────────────┬──────────────┘                                 │
│                 │                                                  │
│                 ▼                                                  │
│  ┌──────────────────────────────┐                                │
│  │  Top-N Selection             │  POTG = top 1                  │
│  │  (N=5 for highlight reel,    │  Reel = top 5                  │
│  │   N=1 for POTG)              │  Ensure category variety       │
│  └──────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Scoring Dimension Details

**Dimension 1 — Engagement Score (0.35 weight)**

Measures combat intensity within the window.

```
engagement_score = Σ (unit_value[destroyed_unit] × context_multiplier) / window_duration_sec

context_multiplier for each kill:
  base:                1.0
  kill part of cluster: 1.0 + (cluster_size - 1) × 0.3   (3 kills → 1.6x)
  building destroyed:   1.5× (economic significance)
  harvester killed:     1.3× (economic disruption)
  tech structure:       2.0× (strategic significance)
  superweapon:          5.0× (rarity)
```

The kill cluster detection uses a 3-second sliding sub-window: any kills within 3 seconds of each other are part of the same cluster.

**Dimension 2 — Momentum Score (0.25 weight)**

Measures the magnitude of a swing in game state during the window. Uses `PlayerStatSnapshot` events (every 60 seconds) interpolated to the window boundaries.

```
momentum_score = max(
  |army_value_delta| / avg_army_value,
  |economic_rate_delta| / avg_economic_rate,
  |territory_delta| / total_territory
)

# Higher when: player goes from losing to winning (comeback)
# or dominant player suddenly loses advantage (upset)

direction_bonus:
  comeback (deficit → advantage):    1.5×
  collapse (advantage → deficit):    1.2×
  neutral swing:                     1.0×
```

**Dimension 3 — Anomaly Score (0.20 weight)**

Measures how statistically unusual this window is relative to the match baseline. Computes z-scores against match-wide averages.

```
match_baselines:
  avg_kills_per_window:  mean of kills across all windows
  avg_building_deaths:   mean of building losses per window
  avg_economy_delta:     mean of resource swing per window
  avg_unit_production:   mean of units built per window

anomaly_score = max(
  z_score(kills_this_window,    avg_kills_per_window),
  z_score(buildings_this_window, avg_building_deaths),
  z_score(economy_this_window,   avg_economy_delta)
)

# Flagged as anomaly if z > 2.0 (95th percentile)
# Normalized: min(anomaly_raw / 4.0, 1.0)  — cap at z=4
```

**Dimension 4 — Rarity Score (0.20 weight)**

Flat bonuses for event types that are inherently exciting regardless of quantity.

| Event                             | Rarity Bonus | Rationale                                                   |
| --------------------------------- | ------------ | ----------------------------------------------------------- |
| `SuperweaponFired`                | 0.9          | Once-per-match spectacle (Iron Curtain, Nuke, Chronosphere) |
| `ArmyWipe` (>70% lost)            | 0.8          | Decisive, dramatic                                          |
| `BaseDestroyed`                   | 0.85         | Game-changing elimination                                   |
| `ComebackMoment`                  | 0.75         | Narrative tension (was losing, now winning)                 |
| Multi-tech upgrade (2+ in window) | 0.4          | Tech rush                                                   |
| First combat of match             | 0.3          | Opening engagement (match narrative start)                  |
| Match-ending kill                 | 0.6          | Final blow (narrative closure)                              |

Rarity score = max of all rarity bonuses present in the window.

### 1.4 Anti-Cheese Filters

**Exclude low-quality moments:**

| Filter                | Rule                                                                | Rationale                                  |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Early game            | Skip first 2 minutes unless 5+ kills or building destroyed          | Scout-on-scout fights are not exciting     |
| Worker-only kills     | Require ≥1 non-worker unit kill in window                         | Harvester snipes alone are routine         |
| Idle engagement       | Window must have ≥2 distinct players involved                     | Self-damage/friendly fire not a highlight  |
| Match duration        | Match must be >3 minutes                                            | Instant-forfeit matches have no highlights |
| Duplicate suppression | If top 5 all from same 2-minute span, spread selection across match | Variety in the reel                        |

### 1.5 Category Variety in Top-N Selection

When selecting the top 5 for a highlight reel, enforce category diversity:

```
highlight_categories:
  engagement:  dominated by Engagement score (dimension 1)
  momentum:    dominated by Momentum score (dimension 2)
  anomaly:     dominated by Anomaly score (dimension 3)
  spectacle:   dominated by Rarity score (dimension 4)
  narrative:   match-ending or match-opening moment

selection_algorithm:
  1. POTG = absolute highest composite score (any category)
  2. For remaining 4 slots:
     a. Pick highest-scoring moment from each uncovered category
     b. If fewer than 4 categories represented, fill with next-highest overall
     c. Ensure no two moments overlap (>50% window overlap → drop lower)
```

---

## 2. Play-of-the-Game (POTG)

### 2.1 Post-Game Integration

After a match ends, the highlight detection pipeline runs on the Analysis Event Stream (typically <500ms for a 30-minute match). The POTG moment is the highest composite score.

**Post-game screen addition** (extends the existing layout from `src/player-flow/post-game.md`):

```
┌──────────────────────────────────────┐
│  Match Complete — [Faction]          │
├──────────────────────────────────────┤
│                                      │
│  ▶ PLAY OF THE GAME                  │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │  [Auto-camera replay of the    │  │
│  │   POTG moment, ~20-45 sec,    │  │
│  │   playing in a viewport]      │  │
│  │                                │  │
│  │  Category: "Decisive Assault"  │  │
│  │  Player: [name] | Tick 14,320 │  │
│  └────────────────────────────────┘  │
│  [Skip] [Save Clip] [Watch Full]     │
│                                      │
│  MVP AWARDS (center highlight)       │
│  ...existing layout...               │
```

**POTG is skippable** — pressing Escape or clicking Skip jumps to the existing MVP/stats screen. Players who just want the numbers are not forced to watch.

**POTG viewport:** Renders the replay segment in a bounded viewport (~60% of screen width) with the Directed Camera mode auto-following the action. Plays at 1× speed by default, with the option to switch to 1.5× or 2× via a small speed control.

### 2.2 POTG Category Labels

Each POTG receives a human-readable category label based on which scoring dimension dominated:

| Dominant Dimension    | Labels (random selection from pool)                                                |
| --------------------- | ---------------------------------------------------------------------------------- |
| Engagement            | "Decisive Assault", "Crushing Blow", "Total Annihilation", "Battlefield Dominance" |
| Momentum              | "Against All Odds", "Turning Point", "The Comeback", "Reversal of Fortune"         |
| Anomaly               | "Unprecedented Strike", "Once in a Lifetime", "Statistical Impossibility"          |
| Rarity (superweapon)  | "Superweapon Unleashed", "Nuclear Option", "Iron Curtain Activated"                |
| Rarity (army wipe)    | "Total Wipeout", "No Survivors", "Complete Elimination"                            |
| Narrative (match end) | "The Final Push", "Finishing Blow", "Victory Sealed"                               |

Labels are YAML-defined (moddable via D032 theme system or Lua), and the game module provides the label pool. The RA1 game module provides Cold War–themed labels; TD would provide GDI/Nod-themed variants.

### 2.3 Multiplayer POTG

In multiplayer matches, POTG selection considers all players:

- The highest composite score across all players wins POTG
- The POTG labels which player's perspective it represents
- All players in the match see the same POTG (deterministic: same Analysis Event Stream → same scoring → same result)
- **Team games:** Bonus for moments involving coordinated team actions (ally assists in the same engagement window)

---

## 3. Highlight Camera AI

### 3.1 Why a Dedicated Camera

The replay viewer already has a **Directed Camera** mode (camera mode 4) that auto-follows action. The highlight camera extends this with cinematic behaviors tuned for short, self-contained clips.

### 3.2 Camera Behavior During Highlight Playback

```
Highlight camera sequence for a 30-second moment:

0. PRE-ROLL (3 seconds before window_start):
   - Establish shot: zoom out to show both armies approaching
   - Pan smoothly to center_of_mass(all_units_in_engagement)
   - Camera height: elevated (show strategic context)

1. ENGAGEMENT (window duration):
   - Track: follow center_of_mass(active_combat_units), weighted
     toward the POTG player's units
   - Zoom: adaptive based on engagement spread
     - Spread < 10 cells: zoom in tight (unit-level detail)
     - Spread 10-30 cells: medium zoom (tactical view)
     - Spread > 30 cells: zoom out (strategic overview)
   - Speed: 1× normal (preserving real-time pacing)

2. CLIMAX (peak moment — highest instantaneous score within window):
   - Brief slow-motion: 0.5× for 2 seconds around the peak kill cluster
   - Camera snap-zoom toward the kill location
   - Resume 1× after slow-mo window

3. RESOLUTION (last 3 seconds of window):
   - Zoom out slightly to show aftermath (surviving units, wreckage)
   - Hold position (let the result breathe)

4. POST-ROLL (2 seconds after window_end):
   - Fade to black or transition back to post-game screen
```

### 3.3 Camera Path Generation

The camera path is computed from the Analysis Event Stream — no re-simulation required.

```
Inputs:
  engagement_events:  UnitDestroyed[], EngagementStarted/Ended
  position_samples:   UnitPositionSample[] (delta-encoded, combat units only)
  camera_samples:     CameraPositionSample[] (2 Hz — where the player was looking)

Camera target per frame:
  target_pos = weighted_center_of_mass(
    active_units,
    weight = unit_value × (1.0 + is_about_to_die × 0.5)
  )

  # Bias toward the POTG player's perspective
  bias_pos = lerp(target_pos, potg_player_camera_pos, 0.3)

Camera height:
  height = base_height × (1.0 + engagement_spread / 50.0)
  # Clamped to [min_zoom, max_zoom] from game settings

Camera transition:
  # Smooth interpolation to avoid jarring snaps
  camera_pos = lerp(prev_camera_pos, bias_pos, smoothing_factor=0.08)
```

### 3.4 Player Camera Reference

The `CameraPositionSample` events (recorded at 2 Hz during the match) capture where the player was actually looking during the moment. The highlight camera uses this as a hint — biasing toward the player's attention but not strictly following it (the player may have been looking elsewhere during a surprise attack, and the highlight should show the attack itself).

---

## 4. Highlight Reel & Storage

### 4.1 Per-Player Highlight Library

Highlights are stored as **references** into replay files, not as extracted video clips. This keeps storage minimal:

```
Highlight entry (stored in local SQLite — profile.db):
  - highlight_id:     UUID
  - replay_path:      relative path to .icrep file
  - replay_id:        string (from .icrep metadata)
  - window_start:     tick number
  - window_end:       tick number
  - composite_score:  f32 (for sorting)
  - category:         enum (engagement/momentum/anomaly/spectacle/narrative)
  - label:            string ("Decisive Assault")
  - is_potg:          bool
  - player_key:       blob (which player's perspective)
  - map_name:         string
  - match_date:       timestamp
  - game_module:      string ("ra1", "td")
  - camera_path:      blob (serialized camera keyframes for playback)
  - thumbnail_tick:   tick (the peak moment tick, for generating a static thumbnail)
  - created_at:       timestamp
```

### 4.2 SQLite Schema

```sql
CREATE TABLE highlights (
    highlight_id    TEXT PRIMARY KEY,      -- UUID
    replay_id       TEXT NOT NULL,         -- .icrep replay_id
    replay_path     TEXT NOT NULL,         -- relative path to .icrep
    window_start    INTEGER NOT NULL,      -- tick
    window_end      INTEGER NOT NULL,      -- tick
    composite_score REAL NOT NULL,         -- for sorting
    category        TEXT NOT NULL,         -- engagement/momentum/anomaly/spectacle/narrative
    label           TEXT NOT NULL,         -- "Decisive Assault"
    is_potg         INTEGER NOT NULL DEFAULT 0,  -- boolean
    player_key      BLOB,                 -- Ed25519 public key (whose perspective)
    map_name        TEXT,
    match_date      INTEGER NOT NULL,     -- Unix timestamp
    game_module     TEXT NOT NULL,         -- "ra1", "td"
    camera_path     BLOB,                 -- serialized camera keyframes
    thumbnail_tick  INTEGER,              -- peak moment tick for static preview
    created_at      INTEGER NOT NULL,     -- Unix timestamp
    FOREIGN KEY (replay_id) REFERENCES replays(replay_id)
);

CREATE INDEX idx_highlights_score ON highlights(composite_score DESC);
CREATE INDEX idx_highlights_date ON highlights(match_date DESC);
CREATE INDEX idx_highlights_category ON highlights(category);
CREATE INDEX idx_highlights_module ON highlights(game_module);
```

### 4.3 Storage Budget

- Each highlight entry: ~200–500 bytes (mostly the camera_path blob)
- 5 highlights per match × 1,000 matches = 5,000 entries ≈ 1–2.5 MB in SQLite
- The actual replay data stays in `.icrep` files (not duplicated)
- If the referenced `.icrep` is deleted, the highlight becomes unplayable (orphan cleanup on next browse)

### 4.4 Highlight Reel Playback

The highlight reel is a sequence of moments played back-to-back with transitions:

```
Reel playback (5 moments):
  1. Fade in from black
  2. Play highlight 1 (20-45 sec) with camera AI
  3. Crossfade transition (0.5 sec)
  4. Play highlight 2
  5. Crossfade
  6. Play highlight 3
  ...
  10. Play highlight 5
  11. Fade to black, loop or return to menu

Total reel duration: ~2–4 minutes (varies by moment length)
```

---

## 5. Main Menu Highlight Background

### 5.1 Background Mode Selection

The main menu currently supports two background modes (from `src/player-flow/main-menu.md` and D032):

1. **Static background image** (Classic theme)
2. **Live shellmap AI battle** (Remastered/Modern themes)

This adds a third:

3. **Personal highlight reel** (player's top moments cycling behind the menu)

And a fourth for discoverability and community engagement:

4. **Community/tournament highlights** (curated highlight packs from the Workshop)

**Selection in Settings → Display → Main Menu Background:**

```yaml
main_menu_background:
  options:
    - static_image          # Classic theme default
    - shellmap_ai           # Remastered/Modern theme default
    - personal_highlights   # Player's own highlight reel
    - community_highlights  # Workshop-distributed highlight packs
  default: shellmap_ai      # Determined by active theme
```

### 5.2 Personal Highlight Background

When the player selects "Personal Highlights" as their menu background:

1. System queries the `highlights` table, ordered by `composite_score DESC`
2. Filters to current game module (e.g., RA1 highlights only if RA1 is active)
3. Validates that referenced `.icrep` files still exist on disk
4. Selects top 10–20 moments as a playlist
5. Plays them in shuffled order with crossfade transitions
6. Camera follows the pre-computed highlight camera path
7. Audio: match sound effects play (muted to ~30% volume, under menu music)
8. **Fog of war disabled** — always shows full vision for visual appeal

**Fallback:** If the player has fewer than 3 valid highlights (new player, replays deleted), fall back to shellmap AI battle automatically.

**Performance:** Highlight playback is replay re-simulation — it uses the same code path as the replay viewer but renders into the menu background viewport. The sim re-simulates from the nearest keyframe (worst case: 300 ticks ≈ 20 seconds of sim, <100ms re-simulation time on target hardware). Since the menu is not performance-critical, this runs at reduced priority.

### 5.3 First-Time Experience

New players have no highlights. The progression:

| State             | Menu Background                                               | When                      |
| ----------------- | ------------------------------------------------------------- | ------------------------- |
| First launch      | Static image or shellmap AI (theme default)                   | Before any match          |
| After first match | Start offering "personal highlights" if POTG was detected     | After 1 completed match   |
| After 5+ matches  | "Personal Highlights" becomes a selectable option in settings | Build enough reel content |
| After 20+ matches | Option to auto-enable personal highlights as default          | Subtle prompt in settings |

**No forced popup.** The option appears in settings; the player discovers it naturally or via tooltip ("Your best moments can play behind the main menu — check Settings → Display").

### 5.4 Community & Tournament Highlights

**Workshop highlight packs:** Curators (tournament organizers, streamers, community members) can create and distribute highlight packs through the Workshop (D030).

A highlight pack is a Workshop resource containing:

```yaml
# highlight-pack.yaml
name: "ICA Season 3 Grand Finals"
description: "Best moments from the Iron Curtain Alliance Season 3 championship"
curator: "ICA Tournament Org"
game_module: "ra1"
highlights:
  - replay_file: "replays/grand-final-g3.icrep"
    window_start: 14320
    window_end: 15120
    label: "Nuclear Strike on Allied Base"
    category: spectacle
    camera_path: "cameras/grand-final-g3-nuke.bin"
  - replay_file: "replays/semifinal-g1.icrep"
    window_start: 8700
    window_end: 9500
    label: "Comeback from 3-Base Deficit"
    category: momentum
    camera_path: "cameras/semifinal-g1-comeback.bin"
  # ... more moments
```

The pack includes the referenced `.icrep` files (or portions thereof — the keyframe nearest to the highlight window plus the subsequent ticks, not the entire replay). This keeps pack sizes small (typically 2–10 MB for a pack of 10–20 moments).

**Discovery:** Community highlight packs appear in the Workshop browser under a "Highlights" category. Popular packs surface in the "Featured" section. Players can subscribe to packs, and they automatically become available as menu background options.

### 5.5 "Best Of" Rotating Featured Highlights

A lightweight, opt-in feature for community engagement:

- Community servers (D052) can maintain a "featured highlights" feed via Content Channels (D049)
- The feed is a curated list of highlight references (replay + window) updated periodically
- Players who opt in see a rotating selection from the community's best moments on their menu
- **No automatic upload** — highlights are nominated by community curators, not scraped

---

## 6. RTS-Specific Highlight Design Challenges

### 6.1 "What Makes an RTS Moment Interesting?"

The fundamental problem SC2's team encountered: RTS "best moments" are subjective and skill-dependent. A bronze player's highlight (built 5 tanks) is a pro player's routine operation.

**IC's solution: multi-axis scoring with per-match baselines.**

The z-score anomaly detection (Dimension 3) computes baselines **per-match**, not globally. A moment is highlighted because it's unusual *for this match* — not because it exceeds some absolute threshold. This means:

- In a 10-minute rush game, a 15-unit battle is the highlight
- In a 45-minute macro game, a 15-unit battle is routine — the 200-unit engagement is the highlight
- A new player's first successful tank rush scores as highly (relative to their match) as a pro's micro-intensive engagement

### 6.2 Time Window: RTS vs FPS

FPS highlights are 5–15 seconds. RTS engagements unfold over 20–60 seconds (army moves in, battle starts, resolution, aftermath). The highlight window must be longer.

**Adaptive window sizing:**

```
base_window = 30 seconds (600 ticks at 20 tps)

adjustments:
  if engagement.duration > 20s:
    window = engagement.duration + 10s (pre-roll + post-roll)
  if superweapon involved:
    window = max(window, 25s)  (ensure the buildup is visible)
  if army_wipe:
    window = max(window, 20s)  (show the full annihilation)

clamp: window ∈ [15s, 60s]
  min 15s: enough to show a quick raid
  max 60s: longer than 60s loses focus (split into two moments)
```

### 6.3 Camera Challenge: Isometric vs First-Person

FPS highlights show the player's POV — inherently cinematic (crosshair on enemies). RTS highlights are isometric/top-down — potentially boring (minimap blobs moving into each other).

**Making RTS highlights cinematic:**

1. **Zoom in tighter than normal gameplay** — during highlights, zoom to unit-level to show explosions, projectiles, and unit animations. Players normally play zoomed out; the highlight camera zooms in to make the action visually impactful.

2. **Slow-motion on peak moments** — a 2-second 0.5× slowdown during the highest-scoring instant within the window (the biggest kill cluster, the superweapon impact, the final unit dying). This is the RTS equivalent of CS:GO's slow-mo final kill.

3. **Follow the action, not the player's camera** — the player may have been looking at their base during a surprise attack on their army. The highlight camera follows the *action*, biased toward the player's camera position but not locked to it.

4. **Strategic zoom-out for context** — before the engagement, briefly zoom out to show both armies' positions and the terrain. This gives the viewer spatial context (where is this happening on the map?) before zooming in for the action.

### 6.4 Highlight Types Unique to RTS

Beyond FPS-style kill clusters, RTS games have highlight-worthy moments that don't exist in other genres:

| RTS Highlight Type | Description                                                                                  | Detection Signal                                                             |
| ------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **The Nuke**       | Superweapon detonation wipes out an entire base                                              | `SuperweaponFired` + high `buildings_hit`                                    |
| **Economy Raid**   | Fast units sneak past defense and destroy harvesters/refineries                              | `UnitDestroyed` where targets are economic units, attacker from behind lines |
| **Tech Rush**      | Player researches game-changing tech significantly earlier than opponent                     | `UpgradeCompleted` where time < expected_time_for_tech × 0.7                |
| **Base Race**      | Both players attacking each other's bases simultaneously, each ignoring defense              | Concurrent `ConstructionCompleted` (destroyed) events on both sides          |
| **Comeback**       | Player recovers from <30% army value to win the engagement                                   | `ComebackMoment` event with high `swing_value`                               |
| **Multi-Front**    | Player manages simultaneous attacks on 3+ fronts                                             | Engagement events at 3+ spatially distinct locations within same window      |
| **Last Stand**     | Small force holds a chokepoint against overwhelming numbers (and wins or dies spectacularly) | Army value ratio >3:1 unfavorable + `EngagementEnded` at a map chokepoint    |
| **Macro Glory**    | Player's economy snowball becomes visually overwhelming (factory floor pumping out tanks)    | Production rate anomaly (>3σ above match baseline)                          |

### 6.5 Perspective: Whose Highlight Is It?

In 1v1, the POTG belongs to the player whose actions created the moment (the attacker in an engagement win, the defender in a successful hold). In team games:

```
perspective_selection:
  1. Player who dealt the most damage in the engagement window
  2. Tiebreaker: player whose army value swing was largest
  3. Team bonus: if 2+ teammates contributed >20% each, label as "Team Play"
  4. Camera follows the primary player but shows allied contributions
```

---

## 7. Modding & Extensibility

### 7.1 YAML-Configurable Scoring

The highlight scoring weights and thresholds are YAML-defined per game module:

```yaml
# ra1/highlight-config.yaml
highlight_scoring:
  weights:
    engagement: 0.35
    momentum: 0.25
    anomaly: 0.20
    rarity: 0.20

  engagement:
    kill_cluster_window_sec: 3
    building_multiplier: 1.5
    harvester_multiplier: 1.3
    tech_structure_multiplier: 2.0
    superweapon_multiplier: 5.0

  momentum:
    window_sec: 45
    comeback_bonus: 1.5
    collapse_bonus: 1.2

  anomaly:
    z_threshold: 2.0
    cap: 4.0

  rarity_bonuses:
    superweapon_fired: 0.9
    army_wipe: 0.8
    base_destroyed: 0.85
    comeback_moment: 0.75
    first_combat: 0.3
    match_ending_kill: 0.6

  anti_cheese:
    min_match_duration_sec: 180
    early_game_skip_sec: 120
    early_game_skip_override_kills: 5
    require_non_worker_kill: true

  camera:
    pre_roll_sec: 3
    post_roll_sec: 2
    slow_mo_speed: 0.5
    slow_mo_duration_sec: 2
    min_zoom_cells: 10
    max_zoom_cells: 50

  labels:
    engagement: ["Decisive Assault", "Crushing Blow", "Total Annihilation"]
    momentum: ["Against All Odds", "Turning Point", "The Comeback"]
    # ... per-category label pools
```

### 7.2 Lua API Extension

Modders can register custom highlight detectors via Lua (D004 scripting tier):

```lua
-- Custom highlight detector: Chronosphere teleport into enemy base
Highlights.RegisterDetector("chronosphere_strike", {
    priority = 0.85,  -- rarity score if triggered
    category = "spectacle",
    labels = {"Chrono Assault", "Time Warp Strike"},

    detect = function(window)
        local chrono_events = window:events_of_type("SuperweaponFired")
        for _, event in ipairs(chrono_events) do
            if event.weapon_type == "Chronosphere" then
                local units_teleported = event.units_hit
                if units_teleported >= 3 then
                    return {
                        score = 0.85 + (units_teleported * 0.02),
                        focus_pos = event.target_pos,
                        label_index = 1
                    }
                end
            end
        end
        return nil  -- no highlight detected
    end
})
```

### 7.3 WASM Custom Scoring

For total conversion mods (D005 WASM tier), the entire scoring pipeline can be replaced:

```rust
// WASM module implements HighlightScorer trait
pub trait HighlightScorer {
    fn score_window(&self, events: &[AnalysisEvent], window: TimeWindow) -> Option<HighlightCandidate>;
    fn category_labels(&self) -> &[CategoryLabels];
}
```

---

## 8. Console Commands

Extends D058 command console:

```
/highlight list [--top N] [--category CAT] [--game-module MOD]
    List personal highlights, sorted by score

/highlight play <highlight_id>
    Jump to replay viewer at the highlight moment with camera AI

/highlight delete <highlight_id>
    Remove a highlight from the library (does not delete the replay)

/highlight reanalyze <replay_path>
    Re-run highlight detection on a replay (e.g., after scoring config changes)

/highlight export <highlight_id> [--format webm|gif]
    Export a highlight moment as a video file (Phase 7, requires render-to-file)

/highlight menu-preview
    Preview what the main menu highlight background looks like with current library
```

---

## 9. Implementation Plan

### 9.1 Component Breakdown

| Component                           | Crate                         | Lines (est.) | Phase                      |
| ----------------------------------- | ----------------------------- | ------------ | -------------------------- |
| New Analysis Event types (6 events) | `ic-sim` (event recording)    | ~150         | Phase 2 (simulation)       |
| Highlight scoring pipeline          | `ic-game` or dedicated module | ~500         | Phase 3 (post-game chrome) |
| POTG post-game viewport             | `ic-ui`                       | ~250         | Phase 3                    |
| Highlight camera AI                 | `ic-render` (camera system)   | ~350         | Phase 3                    |
| SQLite highlight storage            | `ic-game` (profile database)  | ~150         | Phase 3                    |
| Main menu highlight background      | `ic-ui` + `ic-render`         | ~300         | Phase 3                    |
| Workshop highlight packs            | Workshop infra (D030/D049)    | ~200         | Phase 6a                   |
| Lua highlight detector API          | `ic-script`                   | ~200         | Phase 6a                   |
| WASM HighlightScorer trait          | `ic-script`                   | ~100         | Phase 6a                   |
| Video export (`/highlight export`)  | `ic-render` (render-to-file)  | ~400         | Phase 7                    |
| **Total**                           |                               | **~2,600**   |                            |

### 9.2 Phasing

**Phase 2 (Simulation) — Foundation:**
- Add 6 new Analysis Event types to the event stream
- Engagement detection system (identifies when units enter/exit combat)
- Events are recorded into `.icrep` Analysis Event Stream

**Phase 3 (Game Chrome) — Core Feature:**
- Highlight scoring pipeline (all 4 dimensions)
- POTG detection and post-game viewport display
- Highlight camera AI (zoom behavior, slow-mo, path generation)
- SQLite highlight library (per-player storage)
- Main menu "Personal Highlights" background option
- Highlight entry in replay viewer timeline (markers at highlight window positions)
- Console commands (`/highlight list`, `/highlight play`, etc.)

**Phase 5 (Multiplayer) — Social:**
- Multiplayer POTG (all players see same POTG)
- Community server highlight feeds (Content Channel integration)

**Phase 6a (Modding) — Extensibility:**
- YAML-configurable scoring weights per game module
- Lua highlight detector API
- WASM HighlightScorer trait
- Workshop highlight packs (tournament/community curated)

**Phase 7 (Polish) — Enrichment:**
- Video export (render highlight to WebM/GIF file)
- LLM-generated highlight commentary (optional, uses D044 LLM infrastructure — "The Allied forces launched a devastating Chronosphere assault, teleporting 5 heavy tanks directly into the Soviet power grid...")
- Foreign replay highlight detection (D056 — run highlight scoring on imported OpenRA/Remastered replays)

### 9.3 Dependencies

```
Phase 2 prerequisites:
  - ic-sim event recording system (existing)
  - .icrep Analysis Event Stream format (existing)

Phase 3 prerequisites:
  - Replay viewer with camera modes (existing design)
  - Post-game screen (existing design)
  - Main menu shellmap infrastructure (existing design)
  - SQLite profile database (D034)

Phase 6a prerequisites:
  - Lua scripting runtime (D004)
  - WASM mod runtime (D005)
  - Workshop infrastructure (D030/D049)
```

---

## 10. Comparison: Shellmap vs Personal Highlights vs Community Highlights

| Aspect                    | Shellmap AI Battle                                 | Personal Highlights                          | Community Highlights                            |
| ------------------------- | -------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| **Content**               | Pre-designed scenario, AI plays both sides         | Player's own best moments                    | Curated tournament/community moments            |
| **Novelty**               | Same battle every launch (deterministic from seed) | Always different — grows with play history | Updated by community curators                   |
| **Personal connection**   | None — generic visuals                           | High — "that's MY comeback"                | Medium — aspirational ("pros play like this") |
| **New player experience** | Works immediately                                  | Requires 1+ completed matches                | Requires Workshop pack download                 |
| **Performance**           | Runs real-time AI + sim                            | Replay re-sim from keyframe                  | Same as personal                                |
| **Storage**               | Map included in game data                          | References player's `.icrep` files           | Workshop pack download (2–10 MB)              |
| **Moddable**              | Theme YAML (`shellmap:` section)                   | Scoring config YAML + Lua detectors          | Curator-created highlight packs                 |

---

## 11. Open Questions

1. **Highlight generation timing.** Should highlights be detected immediately post-match (blocking the post-game screen for ~500ms) or computed asynchronously (POTG appears a few seconds later, stats appear immediately)? Async is better UX but requires a loading state for the POTG viewport.

2. **Foreign replay highlights.** D056 imports OpenRA and Remastered replays. Can we run highlight detection on foreign replays? The Analysis Event Stream may not be present — we'd need to re-simulate the foreign replay to generate events, then score. This is Phase 7 work and depends on the foreign replay compatibility level.

3. **Highlight sharing format.** Should shared highlights be standalone files (`.ichighlight` — containing the replay segment + camera path + metadata) or references into full replay files? Standalone is more portable but duplicates data; references are compact but require the full replay.

4. **Community highlight curation.** Who decides which highlights go into community packs? Tournament organizers curate their own. But for general "best of the week" — is this community-voted, curator-selected, or algorithmically determined from uploaded highlights? All three are viable; the infrastructure supports any approach via the Workshop model.

5. **LLM commentary.** Phase 7 proposes LLM-generated commentary for highlights. Should this be text overlays, EVA-style voice synthesis, or both? Text is simpler and more achievable; voice synthesis is ambitious but fits the C&C EVA tradition.
