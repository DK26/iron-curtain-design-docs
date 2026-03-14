## D077: Replay Highlights & Play-of-the-Game — Auto-Detection, POTG, and Main Menu Background

|                |                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                                                                         |
| **Phase**      | Phase 2 (new analysis events), Phase 3 (highlight detection + POTG + menu background), Phase 5 (multiplayer POTG), Phase 6a (Lua/WASM custom detectors + Workshop highlight packs), Phase 7 (video export + LLM commentary + foreign replay highlights)                                                                                          |
| **Depends on** | D010 (snapshottable state/replays), D031 (telemetry/analysis events), D032 (UI themes/shellmap), D033 (QoL toggles), D034 (SQLite storage), D049 (Workshop assets/CAS), D056 (foreign replay import), D058 (console commands), D059 (pings/markers)                                                                                              |
| **Driver**     | No RTS has automatic highlight detection — SC2 attempted it in 2016 and abandoned it. IC's rich Analysis Event Stream (15 event types growing to 21), existing post-game MVP infrastructure, and replay keyframe system position it to be the first RTS to ship this feature. Community request across OpenRA, C&C Remastered, and SC2 forums. |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 2 (events) → Phase 3 (core) → Phase 5 (multiplayer) → Phase 6a (modding) → Phase 7 (polish)
- **Canonical for:** Automatic replay highlight detection, Play-of-the-Game (POTG) on post-game screen, per-player highlight library, main menu highlight background, community/tournament highlight packs
- **Scope:** `ic-sim` (6 new analysis events), `ic-game`/`ic-ui` (scoring pipeline + POTG viewport + menu background), `ic-render` (highlight camera AI), `ic-script` (Lua/WASM custom detectors)
- **Decision:** IC detects "interesting moments" from the Analysis Event Stream using a four-dimension scoring pipeline (engagement density, momentum swing, z-score anomaly, rarity bonus), generates a POTG per match shown on the post-game screen, accumulates per-player highlights in SQLite, and offers personal/community highlights as a main menu background alternative to shellmap AI battles.
- **Why:** Replay highlights serve three goals: (1) post-game spectacle (POTG adds emotional punctuation after a match), (2) personal attachment (your best moments cycling on the menu), (3) community engagement (tournament/streamer highlight packs as shareable content). No competing RTS offers this.
- **Non-goals:** Real-time highlight detection during gameplay (always post-match), video rendering/export as a core feature (Phase 7 optional), replacing the shellmap as default menu background
- **Invariants preserved:** `ic-sim` remains pure (events are observation-only, no feedback into sim); scoring runs post-match on recorded data; all highlight data referencing replays (not extracted clips)
- **Keywords:** replay highlights, POTG, play of the game, highlight reel, main menu background, highlight camera, engagement scoring, momentum swing, anomaly detection, community highlights, tournament clips

### Problem

IC's replay system records a rich Analysis Event Stream (15 event types: `UnitDestroyed`, `PlayerStatSnapshot`, `CameraPositionSample`, etc.) alongside the deterministic order stream. The replay viewer has six camera modes, eight observer overlays, timeline event markers, and a bookmark system. The post-game screen calculates 18 MVP award types from match statistics.

**None of this infrastructure is currently used for automatic highlight detection or highlight playback.**

Players must manually scrub through replays to find interesting moments. The main menu's only dynamic background option is a shellmap AI battle — the same scripted battle every launch. Tournament organizers have no automated way to extract highlight reels. New players miss the emotional punctuation of a "Play of the Game" moment after each match.

### Prior Art

| Game                        | Highlight System                                       | RTS?    | Result                                                          |
| --------------------------- | ------------------------------------------------------ | ------- | --------------------------------------------------------------- |
| **CS:GO/CS2**               | "Your Best" multi-kill clips, server-side scoring      | No      | Industry gold standard for FPS                                  |
| **Overwatch**               | POTG with multi-dimensional scoring, role weighting    | No      | Iconic feature, copied widely                                   |
| **Dota 2**                  | Post-game multikill/rampage replays                    | Partial | Kill-count dominant, less nuanced                               |
| **StarCraft 2**             | None — Blizzard attempted 2016–2017, never shipped | Yes     | Abandoned — "best moment" ambiguity at different skill levels |
| **Age of Empires 4**        | Timeline event markers, no auto-detection              | Yes     | Markers only, no scoring or POTG                                |
| **OpenRA / C&C Remastered** | None — community-requested feature                   | Yes     | No implementation                                               |

**Key insight from SC2's failure:** They tried to define a universal "best moment" across skill brackets. IC solves this with **per-match baselines** — highlights are unusual *relative to this match* (z-score anomaly), not compared to a global database.

### Decision

#### 1. Six New Analysis Event Types

Extend the Analysis Event Stream (currently 15 types → 21) with engagement-level events that the highlight scoring pipeline needs:

| New Event           | Fields                                                                                                             | Detection Trigger                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `EngagementStarted` | `tick`, `center_pos`, `friendly_units[]`, `enemy_units[]`, `value_friendly`, `value_enemy`                         | Units from opposing players enter weapon range                                        |
| `EngagementEnded`   | `tick`, `center_pos`, `friendly_losses`, `enemy_losses`, `friendly_survivors`, `enemy_survivors`, `duration_ticks` | All combat ceases or one side retreats/dies                                           |
| `SuperweaponFired`  | `tick`, `weapon_type`, `target_pos`, `player`, `units_affected`, `buildings_affected`                              | Superweapon activation (Iron Curtain, Nuke, Chronosphere, etc.)                       |
| `BaseDestroyed`     | `tick`, `player`, `pos`, `buildings_lost[]`                                                                        | Primary base or expansion fully wiped                                                 |
| `ArmyWipe`          | `tick`, `player`, `units_lost`, `total_value_lost`, `percentage_of_army`                                           | >70% of a player's army destroyed in a single engagement                              |
| `ComebackMoment`    | `tick`, `player`, `deficit_before`, `advantage_after`, `swing_value`                                               | Player transitions from losing to winning position (from `PlayerStatSnapshot` deltas) |

These events are **observation-only** — they do not feed back into the simulation. They are recorded into the `.icrep` Analysis Event Stream during match recording.

#### 2. Four-Dimension Highlight Scoring Pipeline

Runs **post-match** over the recorded event stream (not real-time). Uses a sliding window (default 30 seconds, adaptive) with four independent scoring dimensions:

| Dimension      | Weight | What It Measures                                                                                                                                      |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engagement** | 0.35   | Kill density within window — unit value destroyed, kill clusters (3-second sub-window), building/tech/harvester multipliers                         |
| **Momentum**   | 0.25   | Economic/military swing magnitude — army value delta, economy rate delta, territory delta. Comeback bonus (1.5×), collapse bonus (1.2×)           |
| **Anomaly**    | 0.20   | Statistical outlier relative to match baselines — z-score against per-match averages for kills, building losses, economy swings. Flagged at z > 2.0 |
| **Rarity**     | 0.20   | Flat bonuses for inherently exciting events — superweapon (0.9), army wipe (0.8), base destroyed (0.85), comeback (0.75), match-ending kill (0.6)   |

**Composite score** = `0.35 × Engagement + 0.25 × Momentum + 0.20 × Anomaly + 0.20 × Rarity`

After scoring all windows, **non-maximum suppression** merges overlapping windows (keep peak, discard neighbors within 15 seconds). **Top-N selection** picks POTG (N=1) and highlight reel (N=5) with category diversity enforcement.

**Anti-cheese filters:** Skip first 2 minutes (unless 5+ kills), require non-worker kills, minimum 3-minute match duration, no self-damage-only windows.

#### 3. Play-of-the-Game (POTG)

After each match, the highest-scoring highlight moment is displayed as a **POTG viewport** on the post-game screen:

- Renders the replay segment (20–45 seconds) in a bounded viewport with the highlight camera AI
- Category label from YAML-moddable pool (e.g., "Decisive Assault", "Against All Odds", "Nuclear Option")
- **Skippable** — Escape or Skip button jumps to existing MVP/stats screen
- **Multiplayer:** All players see the same POTG (deterministic scoring from the same event stream)
- **Team games:** Bonus for coordinated team actions in the same engagement window

#### 4. Per-Player Highlight Library

Highlights are stored as **references into replay files** (not extracted video clips) in local SQLite (`profile.db`):

```sql
CREATE TABLE highlights (
    highlight_id    TEXT PRIMARY KEY,
    replay_id       TEXT NOT NULL,
    replay_path     TEXT NOT NULL,
    window_start    INTEGER NOT NULL,   -- tick
    window_end      INTEGER NOT NULL,   -- tick
    composite_score REAL NOT NULL,
    category        TEXT NOT NULL,
    label           TEXT NOT NULL,
    is_potg         INTEGER NOT NULL DEFAULT 0,
    player_key      BLOB,
    map_name        TEXT,
    match_date      INTEGER NOT NULL,
    game_module     TEXT NOT NULL,
    camera_path     BLOB,               -- serialized camera keyframes
    thumbnail_tick  INTEGER,
    created_at      INTEGER NOT NULL
);
```

5 highlights per match × 1,000 matches = ~1–2.5 MB in SQLite. Actual replay data stays in `.icrep` files.

#### 5. Main Menu Highlight Background

A new menu background option alongside static image and shellmap AI battle:

| Option                 | Source                                              | Default For              |
| ---------------------- | --------------------------------------------------- | ------------------------ |
| `static_image`         | Theme background image                              | Classic theme            |
| `shellmap_ai`          | Live AI battle (existing)                           | Remastered/Modern themes |
| `personal_highlights`  | Player's top moments cycling (D077)                 | None (opt-in)            |
| `community_highlights` | Workshop highlight packs from tournaments/streamers | None (opt-in)            |

**Fallback:** If player has fewer than 3 valid highlights, falls back to shellmap AI.

**Performance:** Replay re-simulation from nearest keyframe (worst case ~100ms). Runs at reduced priority behind menu UI.

#### 6. Highlight Camera AI

Extends the existing Directed Camera mode with cinematic behaviors tuned for short clips:

1. **Pre-roll** (3s): Establishing shot — zoom out to show both armies approaching
2. **Engagement**: Track center-of-mass of active combat units, zoom adaptive to engagement spread (tight <10 cells, medium 10–30, wide >30)
3. **Climax**: Brief 0.5× slow-motion for 2 seconds around peak kill cluster
4. **Resolution** (3s): Zoom out to show aftermath, hold position
5. **Post-roll** (2s): Fade transition

Camera target biased toward the POTG player's perspective (30% blend with `CameraPositionSample` data from the match).

#### 7. Community & Tournament Highlights

Workshop highlight packs (D030/D049) contain curated moment references + embedded replay segments:

```yaml
# highlight-pack.yaml
name: "ICA Season 3 Grand Finals"
curator: "ICA Tournament Org"
game_module: "ra1"
highlights:
  - replay_file: "replays/grand-final-g3.icrep"
    window_start: 14320
    window_end: 15120
    label: "Nuclear Strike on Allied Base"
    category: spectacle
    camera_path: "cameras/grand-final-g3-nuke.bin"
```

Packs include keyframe-trimmed replay segments (not full replays) — typically 2–10 MB for 10–20 moments.

### Scoring Configuration (YAML-Moddable)

All scoring weights, thresholds, multipliers, and labels are YAML-configurable per game module:

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
    superweapon_multiplier: 5.0
  rarity_bonuses:
    superweapon_fired: 0.9
    army_wipe: 0.8
    base_destroyed: 0.85
  labels:
    engagement: ["Decisive Assault", "Crushing Blow", "Total Annihilation"]
    momentum: ["Against All Odds", "Turning Point", "The Comeback"]
```

### Modding Extensibility

- **Lua detectors:** Modders register custom highlight detectors (e.g., "Chronosphere into enemy base") via `Highlights.RegisterDetector()`
- **WASM `HighlightScorer` trait:** Total conversion mods can replace the entire scoring pipeline
- **YAML labels:** Category label pools are moddable per game module and theme

### Console Commands (D058)

```
/highlight list [--top N] [--category CAT]
/highlight play <highlight_id>
/highlight delete <highlight_id>
/highlight reanalyze <replay_path>
/highlight export <highlight_id> [--format webm|gif]   (Phase 7)
/highlight menu-preview
```

### RTS-Specific Highlight Types

Beyond FPS-style kill clusters, RTS highlights include unique moment types:

| Type               | Description                                    | Primary Detection Signal                                |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------- |
| Army Wipe          | >70% of opponent's army destroyed              | `ArmyWipe` event                                        |
| Superweapon Strike | Nuke/Chronosphere/Iron Curtain detonation      | `SuperweaponFired` event                                |
| Economy Raid       | Fast units destroy harvesters behind lines     | `UnitDestroyed` on economic units, attacker from behind |
| Comeback           | Recovery from <30% army value to win           | `ComebackMoment` event                                  |
| Base Race          | Both players attacking bases, ignoring defense | Concurrent base destruction events                      |
| Tech Rush          | Game-changing tech earlier than expected       | `UpgradeCompleted` at <70% expected time                |
| Last Stand         | Small force holds chokepoint against >3:1 odds | Engagement with extreme value disparity                 |

### Adaptive Window Sizing

RTS engagements are longer than FPS clips. Window sizes adapt:

- Base window: 30 seconds (600 ticks at 20 tps)
- If engagement duration > 20s: expand to `engagement.duration + 10s`
- If superweapon involved: minimum 25s (show buildup)
- Clamp: 15s minimum, 60s maximum (longer splits into two moments)

### Implementation Estimate

| Component                       | Crate                 | Est. Lines | Phase    |
| ------------------------------- | --------------------- | ---------- | -------- |
| 6 new Analysis Event types      | `ic-sim`              | ~150       | Phase 2  |
| Highlight scoring pipeline      | `ic-game`             | ~500       | Phase 3  |
| POTG post-game viewport         | `ic-ui`               | ~250       | Phase 3  |
| Highlight camera AI             | `ic-render`           | ~350       | Phase 3  |
| SQLite highlight storage        | `ic-game`             | ~150       | Phase 3  |
| Main menu highlight background  | `ic-ui` + `ic-render` | ~300       | Phase 3  |
| Workshop highlight packs        | Workshop infra        | ~200       | Phase 6a |
| Lua/WASM highlight detector API | `ic-script`           | ~300       | Phase 6a |
| Video export                    | `ic-render`           | ~400       | Phase 7  |
| **Total**                       |                       | **~2,600** |          |

### Alternatives Considered

1. **Manual-only highlights (status quo in all RTS games):** Lowest effort. But misses the emotional POTG moment and the personal connection of "my highlights on my menu." Rejected — the infrastructure already exists.

2. **Kill-count-only scoring (Dota 2 model):** Simple but misses RTS-specific moments (comebacks, superweapons, economy raids). Kill-count dominant scoring would always favor the aggressor, missing defensive brilliance. Rejected.

3. **Global baseline scoring (SC2's attempted approach):** Compare against a global database of "typical moments per bracket." This was why SC2 abandoned the feature — too many edge cases, bracket estimation errors, and "one player's routine is another's highlight." Rejected in favor of per-match baselines (z-score anomaly against *this match*).

4. **Real-time highlight detection:** Compute highlights during the match for live spectator feeds. Higher complexity, performance risk in sim thread. Deferred — post-match scoring is sufficient for all current use cases. Live detection could be Phase 7+ for tournament broadcasts.

### Cross-References

- **Research doc:** `research/replay-highlights-potg-design.md` (full scoring algorithm details, camera path generation, storage budget analysis, prior art survey)
- **Replay format:** `formats/save-replay-formats.md` § Analysis Event Stream, `formats/replay-keyframes-analysis.md` § AnalysisEvent enum
- **Post-game screen:** `player-flow/post-game.md` § Play-of-the-Game section
- **Main menu:** `player-flow/main-menu.md` § Background selection
- **Replay viewer:** `player-flow/replays.md` § Event Markers
- **UI themes:** D032 (shellmap configuration, theme YAML)
- **Foreign replay import:** D056 (highlight detection on imported OpenRA/Remastered replays — Phase 7)
