## D036: Achievement System

**Decision:** IC includes a **per-game-module achievement system** with built-in and mod-defined achievements, stored locally in SQLite (D034), with optional Workshop sync for community-created achievement packs.

**Rationale:**
- Achievements provide progression and engagement outside competitive ranking — important for casual players who are the majority of the C&C community
- Modern RTS players expect achievement systems (Remastered, SC2, AoE4 all have them)
- Mod-defined achievements drive Workshop adoption: a total conversion mod can define its own achievement set, incentivizing players to explore community content
- SQLite storage (D034) already handles all persistent client state — achievements are another table

**Key Design Elements:**

### Achievement Categories

| Category        | Examples                                                                      | Scope                         |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| **Campaign**    | "Complete Allied Campaign on Hard", "Zero casualties in mission 3"            | Per-game-module, per-campaign |
| **Skirmish**    | "Win with only infantry", "Defeat 3 brutal AIs simultaneously"                | Per-game-module               |
| **Multiplayer** | "Win 10 ranked matches", "Achieve 200 APM in a match"                         | Per-game-module, per-mode     |
| **Exploration** | "Play every official map", "Try all factions"                                 | Per-game-module               |
| **Community**   | "Install 5 Workshop mods", "Rate 10 Workshop resources", "Publish a resource" | Cross-module                  |
| **Mod-defined** | Defined by mod authors in YAML, registered via Workshop                       | Per-mod                       |

### Storage Schema (D034)

```sql
CREATE TABLE achievements (
    id              TEXT PRIMARY KEY,     -- "ra1.campaign.allied_hard_complete"
    game_module     TEXT NOT NULL,        -- "ra1", "td", "ra2"
    category        TEXT NOT NULL,        -- "campaign", "skirmish", "multiplayer", "community"
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    icon            TEXT,                 -- path to achievement icon asset
    hidden          BOOLEAN DEFAULT 0,    -- hidden until unlocked (surprise achievements)
    source          TEXT NOT NULL         -- "builtin" or workshop resource ID
);

CREATE TABLE achievement_progress (
    achievement_id  TEXT REFERENCES achievements(id),
    unlocked_at     TEXT,                 -- ISO 8601 timestamp, NULL if locked
    progress        INTEGER DEFAULT 0,    -- for multi-step achievements (e.g., "win 10 matches": progress=7)
    target          INTEGER DEFAULT 1,    -- total required for unlock
    PRIMARY KEY (achievement_id)
);
```

### Mod-Defined Achievements

Mod authors define achievements in their `mod.yaml`, which register when the mod is installed:

```yaml
# mod.yaml (achievement definition in a mod)
achievements:
  - id: "my_mod.survive_the_storm"
    title: "Eye of the Storm"
    description: "Survive a blizzard event without losing any buildings"
    category: skirmish
    icon: "assets/achievements/storm.png"
    hidden: false
    trigger: "lua"                     # unlock logic in Lua script
  - id: "my_mod.build_all_units"
    title: "Full Arsenal"
    description: "Build every unit type in a single match"
    category: skirmish
    icon: "assets/achievements/arsenal.png"
    trigger: "lua"
```

Lua scripts call `Achievement.unlock("my_mod.survive_the_storm")` when conditions are met. The achievement API is part of the Lua globals (alongside `Actor`, `Trigger`, `Map`, etc.).

### Design Constraints

- **No multiplayer achievements that incentivize griefing.** "Kill 100 allied units" → no. "Win 10 team games" → yes.
- **Campaign achievements are deterministic** — same inputs, same achievement unlock. Replays can verify achievement legitimacy.
- **Achievement packs are Workshop resources** — community can create themed achievement collections (e.g., "Speedrun Challenges", "Pacifist Run").
- **Mod achievements are sandboxed to their mod.** Uninstalling a mod hides its achievements (progress preserved, shown as "mod not installed").
- **Steam achievements sync** (Steam builds only) — built-in achievements map to Steam achievement API. Mod-defined achievements are IC-only.

**Alternatives considered:**
- Steam achievements only (excludes non-Steam players, can't support mod-defined achievements)
- No achievement system (misses engagement opportunity, feels incomplete vs modern RTS competitors)
- Blockchain-verified achievements (needless complexity, community hostility toward crypto/blockchain in games)

**Phase:** Phase 3 (built-in achievement infrastructure + campaign achievements), Phase 6b (mod-defined achievements via Workshop).

---

---
