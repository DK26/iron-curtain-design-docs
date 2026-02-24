## D019: Switchable Balance Presets (Classic RA vs OpenRA)

**Decision:** Ship multiple balance presets as first-class YAML rule sets. Default to classic Red Alert values from the EA source code. OpenRA balance available as an alternative preset. Selectable per-game in lobby.

**Rationale:**
- Original Red Alert's balance makes units feel **powerful and iconic** — Tanya, MiGs, Tesla Coils, V2 rockets are devastating. This is what made the game memorable.
- OpenRA rebalances toward competitive fairness, which can dilute the personality of iconic units. Valid for tournaments, wrong as a default.
- The community is split on this. Rather than picking a side, expose it as a choice.
- Presets are just alternate YAML files loaded at game start — zero engine complexity. The modding system already supports this via inheritance and overrides.
- The Remastered Collection made its own subtle balance tweaks — worth capturing as a third preset.

**Implementation:**
- `rules/presets/classic/` — unit/weapon/structure values from EA source code (default)
- `rules/presets/openra/` — values matching OpenRA's current balance
- `rules/presets/remastered/` — values matching the Remastered Collection
- Preset selection exposed in lobby UI and stored in game settings
- Presets use YAML inheritance: only override fields that differ from `classic`
- Multiplayer: all players must use the same preset (enforced by lobby, validated by sim)
- Custom presets: modders can create new presets as additional YAML directories

**What this is NOT:**
- Not a "difficulty setting" — both presets play at normal difficulty
- Not a mod — it's a first-class game option, no workshop download required
- Not just multiplayer — applies to skirmish and campaign too

**Alternatives considered:**
- Only ship classic values (rejected — alienates OpenRA competitive community)
- Only ship OpenRA values (rejected — loses the original game's personality)
- Let mods handle it (rejected — too important to bury in the modding system; should be one click in settings)

**Phase:** Phase 2 (balance values extracted during simulation implementation).

### Balance Philosophy — Lessons from the Most Balanced and Fun RTS Games

D019 defines the *mechanism* (switchable YAML presets). This section defines the *philosophy* — what makes faction balance good, drawn from studying the games that got it right over decades of competitive play. These principles guide the creation of the "IC Default" balance preset and inform modders creating their own.

**Source games studied:** StarCraft: Brood War (25+ years competitive, 3 radically asymmetric races), StarCraft II (Blizzard's most systematically balanced RTS), Age of Empires II (40+ civilizations remarkably balanced over 25 years), Warcraft III (4 factions with hero mechanics), Company of Heroes (asymmetric doctrines), original Red Alert, and the Red Alert Remastered Collection. Where claims are specific, they reflect publicly documented game design decisions, developer commentary, or decade-scale competitive data.

#### Principle 1: Asymmetry Creates Identity

The most beloved RTS factions — SC:BW's Zerg/Protoss/Terran, AoE2's diverse civilizations, RA's Allies/Soviet — are memorable because they *feel different to play*, not because they have slightly different stat numbers. Asymmetry is the source of faction identity. Homogenizing factions for balance kills the reason factions exist.

**Red Alert's original asymmetry:** Allies favor technology, range, precision, and flexibility (GPS, Cruisers, longbow helicopters, Tanya as surgical strike). Soviets favor mass, raw power, armor, and area destruction (Mammoth tanks, V2 rockets, Tesla coils, Iron Curtain). Both factions can win — but they win differently. An Allied player who tries to play like a Soviet player (massing heavy armor) will lose. The asymmetry forces different strategies and creates varied, interesting matches.

**The lesson IC applies:** Balance presets may adjust unit costs, health, and damage — but they must never collapse faction asymmetry. A "balanced" Tanya is still a fragile commando who kills infantry instantly and demolishes buildings, not a generic elite unit. A "balanced" Mammoth Tank is still the most expensive, slowest, toughest unit on the field, not a slightly upgunned medium tank. If a balance change makes a unit feel generic, the change is wrong.

#### Principle 2: Counter Triangles, Not Raw Power

Good balance comes from every unit having a purpose and a vulnerability — not from every unit being equally strong. SC:BW's Zergling → Marine → Lurker → Zealot chains, AoE2's cavalry → archers → spearmen → cavalry triangle, and RA's own infantry → tank → rocket soldier → infantry loops create dynamic gameplay where army composition matters more than total resource investment.

**The lesson IC applies:** When defining units for any balance preset, maintain clear counter relationships. Every unit must have:
- At least one unit type it is **strong against** (justifies building it)
- At least one unit type it is **weak against** (prevents it from being the only answer)
- A **role** that can't be fully replaced by another unit of the same faction

The `llm:` metadata block in YAML unit definitions (see `04-MODDING.md`) already enforces this: `counters`, `countered_by`, and `role` fields are required for every unit. Balance presets adjust *how strong* these relationships are, not *whether they exist*.

#### Principle 3: Spectacle Over Spreadsheet

Red Alert's original balance is "unfair" by competitive standards — Tesla Coils delete infantry, Tanya solo-kills buildings, a pack of MiGs erases a Mammoth Tank. But this is what makes the game *fun*. Units feel powerful and dramatic. SC:BW has the same quality — a full Reaver drop annihilates a mineral line, Storm kills an entire Zergling army, a Nuke ends a stalemate. These moments create stories.

**The lesson IC applies:** The "Classic" preset preserves these high-damage, high-spectacle interactions — units feel as powerful as players remember. The "OpenRA" preset tones them down for competitive fairness. The "IC Default" preset aims for a middle ground: powerful enough to create memorable moments, constrained enough that counter-play is viable. Whether the Cruiser's shells one-shot a barracks or two-shot it is a balance value; whether the Cruiser *feels devastating to deploy* is a design requirement that no preset should violate.

#### Principle 4: Maps Are Part of Balance

SC:BW's competitive scene discovered this over 25 years: faction balance is inseparable from map design. A map with wide open spaces favors ranged factions; a map with tight choke points favors splash damage; a map with multiple expansions favors economic factions. AoE2's tournament map pool is curated as carefully as the balance patches.

**The lesson IC applies:** Balance presets should be designed and tested against a representative map pool, not a single map. The competitive committee (D037) curates both the balance preset and the ranked map pool together — because changing one without considering the other produces false conclusions about faction strength. Replay data (faction win rates per map) informs both map rotation and balance adjustments.

#### Principle 5: Balance Through Addition, Not Subtraction

AoE2's approach to 40+ civilizations is instructive: every civilization has the same shared tech tree, with specific technologies *removed* and one unique unit *added*. The Britons lose key cavalry upgrades but get Longbowmen with exceptional range. The Goths lose stone wall technology but get cheap, fast-training infantry. Identity comes from what you're missing and what you uniquely possess — not from having a completely different tech tree.

**The lesson IC applies for modders:** When creating new factions or subfactions (RA2's country bonuses, community mods), the recommended pattern is:
1. Start from the base faction tech tree (Allied or Soviet)
2. Remove a small number of specific capabilities (units, upgrades, or technologies)
3. Add one or two unique capabilities that create a distinctive playstyle
4. The unique capabilities should address a gap created by the removals, but not perfectly — the faction should have a real weakness

This pattern is achievable purely in YAML (Tier 1 modding) through inheritance: the subfaction definition inherits the faction base and overrides `prerequisites` to gate or remove units, then defines new units.

#### Principle 6: Patch Sparingly, Observe Patiently

SC:BW received minimal balance patches after 1999 — and it's the most balanced RTS ever made. The meta evolved through player innovation, not developer intervention. AoE2: Definitive Edition patches more frequently but exercises restraint — small numerical changes (±5%), never removing or redesigning units. In contrast, games that patch aggressively based on short-term win rate data (the "nerf/buff treadmill") chase balance without ever achieving it, and players never develop deep mastery because the ground keeps shifting.

**The lesson IC applies:** The "Classic" preset is conservative — values come from the EA source code and don't change. The "OpenRA" preset tracks OpenRA's competitive balance decisions. The "IC Default" preset follows its own balance philosophy:
- **Observe before acting.** Collect ranked replay data for a full season (D055, 3 months) before making balance changes. Short-term spikes in a faction's win rate may self-correct as players adapt.
- **Adjust values, not mechanics.** A balance pass changes numbers (cost, health, damage, build time, range) — never adds or removes units, never changes core mechanics. Mechanical changes are saved for major version releases.
- **Absolute changes, small increments.** ±5-10% per pass, never doubling or halving a value. Multiple small passes converge on balance better than dramatic swings.
- **Separate pools by rating.** A faction that dominates at beginner level may be fine at expert level (and vice versa). Faction win rates should be analyzed per rating bracket before making changes.

#### Principle 7: Fun Is Not Win Rate

A 50% win rate doesn't mean a faction is fun. A faction can have a perfect statistical balance while being miserable to play — if its optimal strategy is boring, if its units don't feel impactful, or if its matchups produce repetitive games. Conversely, a faction can have a slight statistical disadvantage and still be the community's favorite (SC:BW Zerg for years; AoE2 Celts; RA2 Korea).

**The lesson IC applies:** Balance telemetry (D031) tracks not just win rates but also:
- **Pick rates** — are players choosing to play this faction? Low pick rate with high win rate suggests the faction is strong but unpleasant.
- **Game length distribution** — factions that consistently produce very short or very long games may indicate degenerate strategies.
- **Unit production diversity** — if a faction's optimal strategy only uses 3 of its 15 units, the other 12 are effectively dead content.
- **Comeback frequency** — healthy balance allows comebacks; if a faction that falls behind never recovers, the matchup may need attention.

These metrics feed into balance discussions (D037 competitive committee) alongside pure win rate data.

#### Summary: IC's Balance Stance

| Preset         | Philosophy                                                                                                                    | Stability                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Classic**    | Faithful RA values from EA source code. Spectacle over fairness. The game as Westwood made it.                                | Frozen — never changes.                                 |
| **OpenRA**     | Community-driven competitive balance. Tracks OpenRA's active balance decisions.                                               | Updated when OpenRA ships balance patches.              |
| **Remastered** | Petroglyph's subtle tweaks for the 2020 release.                                                                              | Frozen — captures the Remastered Collection as shipped. |
| **IC Default** | Spectacle + competitive viability. Asymmetry preserved. Counter triangles enforced. Patched sparingly based on seasonal data. | Updated once per season (D055), small increments only.  |
| **Custom**     | Modder-created presets via Workshop. Community experiments, tournament rules, "what if" scenarios.                            | Modder-controlled.                                      |

---

### D020 — Mod SDK & Creative Toolchain

**Decision:** Ship a Mod SDK comprising two components: (1) the `ic` CLI tool for headless mod workflow (init, check, test, build, publish), and (2) the **IC SDK application** — a visual creative toolchain with the scenario editor (D038), asset studio (D040), campaign editor, and Game Master mode. The SDK is a separate application from the game — players never see it (see D040 § SDK Architecture).

**Context:** The OpenRA Mod SDK is a template repository modders fork. It bundles shell scripts (`fetch-engine.sh`, `launch-game.sh`, `utility.sh`), a `Makefile`/`make.cmd` build system, and a `packaging/` directory with per-platform installer scripts. The approach works — it's the standard way to create OpenRA mods. But it has significant friction: requires .NET SDK, custom C# DLLs for anything beyond data changes, MiniYAML with no validation tooling, GPL contamination on mod code, and no distribution system beyond manual file sharing.

**What we adapt:**

| Concept            | OpenRA SDK                                         | Iron Curtain                                     |
| ------------------ | -------------------------------------------------- | ------------------------------------------------ |
| Starting point     | Fork a template repo                               | `ic mod init [template]` via `cargo-generate`    |
| Engine version pin | `ENGINE_VERSION` in `mod.config`                   | `engine.version` in `mod.yaml` with semver       |
| Engine management  | `fetch-engine.sh` downloads + compiles from source | Engine ships as binary crate, auto-resolved      |
| Build/run          | `Makefile` + shell scripts (requires Python, .NET) | `ic` CLI — single Rust binary, zero dependencies |
| Mod manifest       | `mod.yaml` in MiniYAML                             | `mod.yaml` in real YAML with typed serde schema  |
| Validation         | `utility.sh --check-yaml`                          | `ic mod check` — YAML + Lua + WASM validation    |
| Packaging          | `packaging/` shell scripts → .exe/.app/.AppImage   | `ic mod package` + workshop publish              |
| Dedicated server   | `launch-dedicated.sh`                              | `ic mod server`                                  |
| Directory layout   | Convention-based (chrome/, rules/, maps/, etc.)    | Adapted for three-tier model                     |
| IDE support        | `.vscode/` in repo                                 | VS Code extension with YAML schema + Lua LSP     |

**What we don't adapt (pain points we solve differently):**
- C# DLLs for custom traits → our Lua + WASM tiers are strictly better (no compilation, sandboxed, polyglot)
- GPL license contamination → WASM sandbox means mod code is isolated; engine license doesn't infect mods
- MiniYAML → real YAML with `serde_yaml`, JSON Schema, standard linters
- No hot-reload → Lua and YAML hot-reload during `ic mod watch`
- No workshop → built-in workshop with `ic mod publish`

**The `ic` CLI tool:**
A single Rust binary replacing OpenRA's shell scripts + Makefile + Python dependencies:

```
ic mod init [template]     # scaffold from template
ic mod check               # validate all mod content
ic mod test                # headless smoke test
ic mod run                 # launch game with mod
ic mod server              # dedicated server
ic mod package             # build distributables
ic mod publish             # workshop upload
ic mod watch               # hot-reload dev mode
ic mod lint                # convention + llm: metadata checks
ic mod update-engine       # bump engine version
ic sdk                     # launch the visual SDK application (scenario editor, asset studio, campaign editor)
ic sdk open [project]      # launch SDK with a specific mod/scenario
ic replay parse [file]     # extract replay data to structured output (JSON/CSV) — enables community stats sites,
                           #   tournament analysis, anti-cheat review (inspired by Valve's csgo-demoinfo)
ic replay inspect [file]   # summary view: players, map, duration, outcome, desync status
ic replay verify [file]    # verify relay signature chain + integrity (see 06-SECURITY.md)
```

> **CLI design principle (from Fossilize):** Each subcommand does one focused thing well — validate, convert, inspect, verify. Valve's Fossilize toolchain (`fossilize-replay`, `fossilize-merge`, `fossilize-convert`, `fossilize-list`) demonstrates that a family of small, composable CLI tools is more useful than a monolithic Swiss Army knife. The `ic` CLI follows this pattern: `ic mod check` validates, `ic mod convert` converts formats, `ic replay parse` extracts data, `ic replay inspect` summarizes. Each subcommand is independently useful and composable via shell pipelines. See `research/valve-github-analysis.md` § 3.3 and § 6.2.

**Mod templates (built-in):**
- `data-mod` — YAML-only balance/cosmetic mods
- `scripted-mod` — missions and custom game modes (YAML + Lua)
- `total-conversion` — full layout with WASM scaffolding
- `map-pack` — map collections
- `asset-pack` — sprites, sounds, video packs

**Rationale:**
- OpenRA's SDK validates the template-project approach — modders want a turnkey starting point
- Engine version pinning is essential — mods break when engine updates; semver solves this cleanly
- A CLI tool is more portable, discoverable, and maintainable than shell scripts + Makefiles
- Workshop integration from the CLI closes the "last mile" — OpenRA modders must manually distribute their work
- The three-tier modding system means most modders never compile anything — `ic mod init data-mod` gives you a working mod instantly

**Alternatives considered:**
- Shell scripts like OpenRA (rejected — cross-platform pain, Python/shell dependencies, fragile)
- Cargo workspace (rejected — mods aren't Rust crates; YAML/Lua mods have nothing to compile)
- In-engine mod editor only (rejected — power users want filesystem access and version control)
- No SDK, just documentation (rejected — OpenRA proves that a template project dramatically lowers the barrier)

**Phase:** Phase 6a (Core Modding + Scenario Editor). CLI prototype in Phase 4 (for Lua scripting development).

---

### D021 — Branching Campaign System with Persistent State

**Decision:** Campaigns are directed graphs of missions with named outcomes, branching paths, persistent unit rosters, and continuous flow — not linear sequences with binary win/lose. Failure doesn't end the campaign; it branches to a different path. Unit state, equipment, and story flags persist across missions.

**Context:** OpenRA's campaigns are disconnected — each mission is standalone, you exit to menu after completion, there's no sense of flow or consequence. The original Red Alert had linear progression with FMV briefings but no branching or state persistence. Games like Operation Flashpoint: Cold War Crisis showed that branching outcomes create dramatically more engaging campaigns, and OFP: Resistance proved that persistent unit rosters (surviving soldiers, captured equipment, accumulated experience) create deep emotional investment.

**Key design points:**

1. **Campaign graph:** Missions are nodes in a directed graph. Each mission has named outcomes (not just win/lose). Each outcome maps to a next-mission node, forming branches and convergences. The graph is defined in YAML and validated at load time.

2. **Named outcomes:** Lua scripts signal completion with a named key: `Campaign.complete("victory_bridge_intact")`. The campaign YAML maps each outcome to the next mission. This enables rich branching: "Won cleanly" → easy path, "Won with heavy losses" → harder path, "Failed" → fallback mission.

3. **Failure continues the game:** A `defeat` outcome is just another edge in the graph. The campaign designer decides what happens: retry with fewer resources, branch to a retreating mission, skip ahead with consequences, or even "no game over" campaigns where the story always continues.

4. **Persistent unit roster (OFP: Resistance model):**
   - Surviving units carry forward between missions (configurable per transition)
   - Units accumulate veterancy across missions — a veteran tank from mission 1 stays veteran in mission 5
   - Dead units are gone permanently — losing veterans hurts
   - Captured enemy equipment joins a persistent equipment pool
   - Five carryover modes: `none`, `surviving`, `extracted` (only units in evac zone), `selected` (Lua picks), `custom` (full Lua control)

5. **Story flags:** Arbitrary key-value state writable from Lua, readable in subsequent missions. Enables conditional content: "If the radar was captured in mission 2, it provides intel in mission 4."

6. **Campaign state is serializable:** Fits D010 (snapshottable sim state). Save games capture full campaign progress including roster, flags, and path taken. Replays can replay entire campaign runs.

7. **Continuous flow:** Briefing → mission → debrief → next mission. No exit to menu between levels unless the player explicitly quits.

8. **Campaign mission transitions:** When the sim ends and the next mission's assets need to load, the player never sees a blank screen or a generic loading bar. The transition sequence is: sim ends → debrief intermission displays (already loaded, zero wait) → background asset loading begins for the next mission → briefing intermission displays (runs concurrently with loading) → when loading completes and the player clicks "Begin Mission," gameplay starts instantly. If the player clicks before loading finishes, a non-intrusive progress indicator appears at the bottom of the briefing screen ("Preparing battlefield... 87%") — the briefing remains interactive, the player can re-read text or review the roster while waiting. For missions with cinematic intros (Video Playback module), the video plays while assets load in the background — by the time the cutscene ends, the mission is ready. This means campaign transitions feel like *narrative beats*, not technical interruptions. The only time a traditional loading screen appears is on first mission launch (cold start) or when asset size vastly exceeds available memory — and even then, the loading screen is themed to the campaign (campaign-defined background image, faction logo, loading tip text from `loading_tips.yaml`).

9. **Credits sequence:** The final campaign node can chain to a Credits intermission (see D038 § Intermission Screens). A credits sequence is defined per campaign — the RA1 game module ships with credits matching the original game's style (scrolling text over a background, Hell March playing). Modders define their own credits via the Credits intermission template or a `credits.yaml` file. Credits are skippable (press Escape or click) but play by default — respecting the work of everyone who contributed to the campaign.

10. **Narrative identity (Principle #20).** Briefings, debriefs, character dialogue, and mission framing follow the C&C narrative pillars: earnest commitment to the world, larger-than-life characters, quotable lines, and escalating stakes. Even procedurally generated campaigns (D016) are governed by the "C&C Classic" narrative DNA rules. See [13-PHILOSOPHY.md](13-PHILOSOPHY.md) § Principle 20 and D016 § "C&C Classic — Narrative DNA."

**Rationale:**
- OpenRA's disconnected missions are its single biggest single-player UX failure — universally cited in community feedback
- OFP proved persistent rosters create investment: players restart missions to save a veteran soldier
- Branching eliminates the frustration of replaying the same mission on failure — the campaign adapts
- YAML graph definition is accessible to modders (Tier 1) and LLM-generable
- Lua campaign API enables complex state logic while staying sandboxed
- The same system works for hand-crafted campaigns, modded campaigns, and LLM-generated campaigns

**Alternatives considered:**
- Linear mission sequence like RA1 (rejected — primitive, no replayability, failure is frustrating)
- Disconnected missions like OpenRA (rejected — the specific problem we're solving)
- Full open-world (rejected — scope too large, not appropriate for RTS)
- Only branching on win/lose (rejected — named outcomes are trivially more expressive with no added complexity)
- No unit persistence (rejected — OFP: Resistance proves this is the feature that creates campaign investment)

**Phase:** Phase 4 (AI & Single Player). Campaign graph engine and Lua Campaign API are core Phase 4 deliverables. The visual Campaign Editor in D038 (Phase 6b) builds on this system — D021 provides the sim-side engine, D038 provides the visual authoring tools.

---

### D022 — Dynamic Weather with Terrain Surface Effects

**Decision:** Weather transitions dynamically during gameplay via a deterministic state machine, and terrain textures visually respond to weather — snow accumulates on the ground, rain darkens/wets surfaces, sunshine dries them out. Terrain surface state optionally affects gameplay (movement penalties on snow/ice/mud).

**Context:** The base weather system (static per-mission, GPU particles + sim modifiers) provides atmosphere but doesn't evolve. Real-world weather changes. A mission that starts sunny and ends in a blizzard is vastly more dramatic — and strategically different — than one where weather is set-and-forget.

**Key design points:**

1. **Weather state machine (sim-side):** `WeatherState` resource tracks current type, intensity (fixed-point `0..1024`), and transition progress. Three schedule modes: `cycle` (deterministic round-robin), `random` (seeded from match, deterministic), `scripted` (Lua-driven only). State machine graph and transition weights defined in map YAML.

2. **Terrain surface state (sim-side):** `TerrainSurfaceGrid` — a per-cell grid of `SurfaceCondition { snow_depth, wetness }`. Updated every tick by `weather_surface_system`. Fully deterministic, derives `Serialize, Deserialize` for snapshots. When `sim_effects: true`, surface state modifies movement: deep snow slows infantry/vehicles, ice makes water passable, mud bogs wheeled units.

3. **Terrain texture effects (render-side):** Three quality tiers — palette tinting (free, no assets needed), overlay sprites (moderate, one extra pass), shader blending (GPU blend between base + weather variant textures). Selectable via `RenderSettings`. Accumulation is gradual and spatially non-uniform (snow appears on edges/roofs first, puddles in low cells first).

4. **Composes with day/night and seasons:** Overcast days are darker, rain at night is near-black with lightning flashes. Map `temperature.base` controls whether precipitation is rain or snow. Arctic/desert/tropical maps set different defaults.

5. **Fully moddable:** YAML defines schedules and surface rates (Tier 1). Lua triggers transitions and queries surface state (Tier 2). WASM adds custom weather types like ion storms (Tier 3).

**Rationale:**
- No other C&C engine has dynamic weather that affects terrain visuals — unique differentiator
- Deterministic state machine preserves lockstep (same seed = same weather progression on all clients)
- Sim/render split respected: surface state is sim (deterministic), visual blending is render (cosmetic)
- Palette tinting tier ensures even low-end devices and WASM can show weather effects
- Gameplay effects are optional per-map — purely cosmetic weather is valid
- Surface state fits the snapshot system (D010) for save games and replays
- Weather schedules are LLM-generable — "generate a mission where weather gets progressively worse"

**Performance:**
- Palette tinting: zero extra draw calls, negligible GPU cost
- Surface state grid: ~2 bytes per cell (compact fixed-point) — a 128×128 map is 32KB
- `weather_surface_system` is O(cells) but amortized via spatial quadrant rotation: the map is partitioned into 4 quadrants and one quadrant is updated per tick, achieving 4× throughput with constant 1-tick latency. This is a sim-only strategy — it does not depend on camera position (the sim has no camera awareness).
- Follows efficiency pyramid: algorithmic (grid lookup) → cache-friendly (contiguous array) → amortized

**Alternatives considered:**
- Static weather only (rejected — misses dramatic potential, no terrain response)
- Client-side random weather (rejected — breaks deterministic sim, desync risk)
- Full volumetric weather simulation (rejected — overkill, performance cost, not needed for isometric RTS)
- Always-on sim effects (rejected — weather-as-decoration is valid for casual/modded games)

**Phase:** Phase 3 (visual effects) for render-side; Phase 2 (sim implementation) for weather state machine and surface grid.

---

### D023 — OpenRA Vocabulary Compatibility Layer

**Decision:** Accept OpenRA trait names and YAML keys as aliases in our YAML parser. Both OpenRA-style names (e.g., `Armament`, `Valued`, `Buildable`) and IC-native names (e.g., `combat`, `buildable.cost`) resolve to the same ECS components. Unconverted OpenRA YAML loads with a deprecation warning.

**Context:** The biggest migration barrier for the 80% YAML tier isn't missing features — it's naming divergence. Every renamed concept multiplies across thousands of mod files. OpenRA modders have years of muscle memory with trait names and YAML keys. Forcing renames creates friction that discourages adoption.

**Key design points:**

1. **Alias registry:** `ra-formats` maintains a compile-time map of OpenRA trait names to IC component names. `Armament` → `combat`, `Valued` → `buildable.cost`, `AttackOmni` → `combat.mode: omni`, etc.
2. **Bi-directional:** The alias registry is used during YAML parsing (OpenRA names accepted) and by the `miniyaml2yaml` converter (produces IC-native names). Both representations are valid.
3. **Deprecation warnings:** When an OpenRA alias is used, the parser emits a warning: `"Armament" is accepted but deprecated; prefer "combat"`. Warnings can be suppressed per-mod via `mod.yaml` setting.
4. **No runtime cost:** Aliases resolve during YAML deserialization (load time only). The ECS never sees alias names — only canonical IC component types.

**Rationale:**
- Reduces the YAML migration from "convert everything" to "drop in and play, clean up later"
- Respects invariant #8 ("the community's existing work is sacred") at the data vocabulary layer, not just binary formats
- Zero runtime cost — purely a deserialization convenience
- Makes `miniyaml2yaml` output immediately usable even without manual cleanup
- Modders can learn IC-native names gradually as they edit files

**Alternatives considered:**
- IC-native names only (rejected — unnecessary migration barrier for thousands of existing mod files)
- Adopt OpenRA's names wholesale (rejected — some OpenRA names are poorly chosen or C#-specific; IC benefits from cleaner naming)
- Converter handles everything (rejected — modders still need to re-learn names for new content; aliases let them use familiar names forever)

**Phase:** Phase 0 (alias registry built alongside `ra-formats` YAML parser). Phase 6a (deprecation warnings configurable in `mod.yaml`).

---

### D024 — Lua API Superset of OpenRA

**Decision:** Iron Curtain's Lua scripting API is a strict superset of OpenRA's 16 global objects. Same function names, same parameter signatures, same return types. OpenRA Lua missions run unmodified. IC then extends with additional functionality.

**Context:** OpenRA has a mature Lua API used in hundreds of campaign missions across all C&C game mods. Combined Arms alone has 34 Lua-scripted missions. The mod migration doc (12-MOD-MIGRATION.md) identified "API compatibility shim" as a migration requirement — this decision elevates it from "nice to have" to "hard requirement."

**OpenRA's 16 globals (all must work identically in IC):**

| Global           | Purpose                            |
| ---------------- | ---------------------------------- |
| `Actor`          | Create, query, manipulate actors   |
| `Map`            | Terrain, bounds, spatial queries   |
| `Trigger`        | Event hooks (OnKilled, AfterDelay) |
| `Media`          | Audio, video, text display         |
| `Player`         | Player state, resources, diplomacy |
| `Reinforcements` | Spawn units at edges/drops         |
| `Camera`         | Pan, position, shake               |
| `DateTime`       | Game time queries                  |
| `Objectives`     | Mission objective management       |
| `Lighting`       | Global lighting control            |
| `UserInterface`  | UI text, notifications             |
| `Utils`          | Math, random, table utilities      |
| `Beacon`         | Map beacon management              |
| `Radar`          | Radar ping control                 |
| `HSLColor`       | Color construction                 |
| `WDist`          | Distance unit conversion           |

**IC extensions (additions, not replacements):**

| Global      | Purpose                              |
| ----------- | ------------------------------------ |
| `Campaign`  | Branching campaign state (D021)      |
| `Weather`   | Dynamic weather control (D022)       |
| `Layer`     | Runtime layer activation/deaction    |
| `Region`    | Named region queries                 |
| `Var`       | Mission/campaign variable access     |
| `Workshop`  | Mod metadata queries                 |
| `LLM`       | LLM integration hooks (Phase 7)      |
| `Commands`  | Command registration for mods (D058) |
| `Ping`      | Typed tactical pings (D059)          |
| `ChatWheel` | Auto-translated phrase system (D059) |
| `Marker`    | Persistent tactical markers (D059)   |
| `Chat`      | Programmatic chat messages (D059)    |

**Actor properties also match:** Each actor reference exposes properties matching OpenRA's property groups (`.Health`, `.Location`, `.Owner`, `.Move()`, `.Attack()`, `.Stop()`, `.Guard()`, `.Deploy()`, etc.) with identical semantics.

**Rationale:**
- CA's 34 missions + hundreds of community missions work on day one — no porting effort
- Reduces Lua migration from "moderate effort" to "zero effort" for standard missions
- IC's extensions are additive — no conflicts, no breaking changes
- Modders who know OpenRA Lua immediately know IC Lua
- Future OpenRA missions created by the community are automatically IC-compatible

**Alternatives considered:**
- Design our own API, provide shim (rejected — shim is always leaky, creates two mental models)
- Partial compatibility (rejected — partial breaks are worse than full breaks; either missions work or they don't)
- No Lua compatibility (rejected — throws away hundreds of community missions for no gain)

**Phase:** Phase 4 (Lua scripting implementation). API surface documented during Phase 2 planning.

---

### D025 — Runtime MiniYAML Loading

**Decision:** Support loading MiniYAML directly at runtime as a fallback format in `ra-formats`. When the engine encounters tab-indented files with `^` inheritance or `@` suffixes, it auto-converts in memory. The `miniyaml2yaml` CLI converter still exists for permanent migration, but is no longer a prerequisite for loading mods.

**Revision of D003:** D003 ("Real YAML, not MiniYAML") remains the canonical format. All IC-native content uses standard YAML. D025 adds a compatibility loader — it does not change what IC produces, only what it accepts.

**Key design points:**

1. **Format detection:** `ra-formats` checks the first few lines of each file. Tab-indented content with no YAML indicators triggers the MiniYAML parser path.
2. **In-memory conversion:** MiniYAML is parsed to an intermediate tree, then resolved to standard YAML structs. The result is identical to what `miniyaml2yaml` would produce.
3. **Combined with D023:** OpenRA trait name aliases (D023) apply after MiniYAML parsing — so the full chain is: MiniYAML → intermediate tree → alias resolution → typed Rust structs.
4. **Performance:** Conversion adds ~10-50ms per mod at load time (one-time cost). Cached after first load.
5. **Warning output:** Console logs `"Loaded MiniYAML file rules.yaml — consider converting to standard YAML with 'ic mod convert'"`.

**Rationale:**
- Turns "migrate then play" into "play immediately, migrate when ready"
- Existing OpenRA mods become testable on IC within minutes, not hours
- Respects invariant #8 — the community's existing work is sacred, including their file formats
- The converter CLI still exists for modders who want clean IC-native files
- No performance impact after initial load (conversion result is cached)

**Alternatives considered:**
- Require pre-conversion (original plan — rejected as unnecessary friction; the converter runs in memory just as well as on disk)
- Support MiniYAML as a first-class format permanently (rejected — standard YAML is strictly better for tooling, validation, and editor support)
- Only support converted files (rejected — blocks quick experimentation and casual mod testing)

**Phase:** Phase 0 (MiniYAML parser already needed for `miniyaml2yaml`; making it a runtime loader is minimal additional work).

---

### D026 — OpenRA Mod Manifest Compatibility

**Decision:** `ra-formats` can parse OpenRA's `mod.yaml` manifest format and auto-map it to IC's mod structure at load time. Combined with D023 (aliases), D024 (Lua API), and D025 (MiniYAML loading), this means a modder can point IC at an existing OpenRA mod directory and it loads — no restructuring needed.

**Key design points:**

1. **Manifest parsing:** OpenRA's `mod.yaml` declares `Packages`, `Rules`, `Sequences`, `Cursors`, `Chrome`, `Assemblies`, `ChromeLayout`, `Weapons`, `Voices`, `Notifications`, `Music`, `Translations`, `MapFolders`, `SoundFormats`, `SpriteFormats`. IC maps each section to its equivalent concept.
2. **Directory convention mapping:** OpenRA mods use `rules/`, `maps/`, `sequences/` etc. IC maps these to its own layout at load time without copying files.
3. **Unsupported sections flagged:** `Assemblies` (C# DLLs) cannot load — these are flagged as warnings listing which custom traits are unavailable and what WASM alternatives exist.
4. **Partial loading:** A mod with unsupported C# traits still loads — units using those traits get a visual placeholder and a "missing trait" debug overlay. The mod is playable with reduced functionality.
5. **`ic mod import`:** CLI command that reads an OpenRA mod directory and generates an IC-native `mod.yaml` with proper structure, converting files to standard YAML and flagging C# dependencies for WASM migration.

**Rationale:**
- Combined with D023/D024/D025, this completes the "zero-friction import" pipeline
- Modders can evaluate IC as a target without committing to migration
- Partial loading means even mods with C# dependencies are partially testable
- The `ic mod import` command provides a clean migration path when the modder is ready
- Validates our claim that "the community's existing work is sacred"

**Alternatives considered:**
- Require manual mod restructuring (rejected — unnecessary friction, blocks adoption)
- Only support IC mod format (rejected — makes evaluation impossible without migration effort)
- Full C# trait loading via .NET interop (rejected — violates D001/D002, reintroduces the problems Rust solves)

**Phase:** Phase 0 (manifest parsing) + Phase 6a (full `ic mod import` workflow).

---

### D027 — Canonical Enum Compatibility with OpenRA

**Decision:** Use OpenRA's canonical enum names for locomotor types, armor types, target types, damage states, and other enumerated values — or accept both OpenRA and IC-native names via the alias system (D023).

**Specific enums aligned:**

| Enum Type    | OpenRA Names                                                | IC Accepts       |
| ------------ | ----------------------------------------------------------- | ---------------- |
| Locomotor    | `Foot`, `Wheeled`, `Tracked`, `Float`, `Fly`                | Same (canonical) |
| Armor        | `None`, `Light`, `Medium`, `Heavy`, `Wood`, `Concrete`      | Same (canonical) |
| Target Type  | `Ground`, `Air`, `Water`, `Underground`                     | Same (canonical) |
| Damage State | `Undamaged`, `Light`, `Medium`, `Heavy`, `Critical`, `Dead` | Same (canonical) |
| Stance       | `AttackAnything`, `Defend`, `ReturnFire`, `HoldFire`        | Same (canonical) |
| UnitType     | `Building`, `Infantry`, `Vehicle`, `Aircraft`, `Ship`       | Same (canonical) |

**Why this matters:** The `Versus` damage table — which modders spend 80% of their balance time tuning — uses armor type names as keys. Locomotor types determine pathfinding behavior. Target types control weapon targeting. If these don't match, every single weapon definition, armor table, and locomotor reference needs translation. By matching names, these definitions copy-paste directly.

**Rationale:**
- Eliminates an entire category of conversion mapping
- Versus tables, weapon definitions, locomotor configs — all transfer without renaming
- OpenRA's names are reasonable and well-known in the community
- No technical reason to rename these — they describe the same concepts
- Where IC needs additional values (e.g., `Hover`, `Amphibious`), they extend the enum without conflicting

**Phase:** Phase 2 (when enum types are formally defined in `ic-sim`).

---

### D028 — Condition and Multiplier Systems as Phase 2 Requirements

**Decision:** The condition system and multiplier system identified as P0 critical gaps in `11-OPENRA-FEATURES.md` are promoted to hard Phase 2 exit criteria. Phase 2 cannot ship without both systems implemented and tested.

**What this adds to Phase 2:**

1. **Condition system:**
   - `Conditions` component: `HashMap<ConditionId, u32>` (ref-counted named conditions per entity)
   - Condition sources: `GrantConditionOnMovement`, `GrantConditionOnDamageState`, `GrantConditionOnDeploy`, `GrantConditionOnAttack`, `GrantConditionOnTerrain`, `GrantConditionOnVeterancy` — exposed in YAML
   - Condition consumers: any component field can declare `requires:` or `disabled_by:` conditions
   - Runtime: systems check `conditions.is_active("deployed")` via fast bitset or hash lookup

2. **Multiplier system:**
   - `StatModifiers` component: per-entity stack of `(source, stat, modifier_value, condition)`
   - Every numeric stat (speed, damage, range, reload, build time, build cost, sight range, etc.) resolves through the modifier stack
   - Modifiers from: veterancy, terrain, crates, conditions, player handicaps
   - Fixed-point multiplication (no floats)
   - YAML-configurable: modders add multipliers without code

3. **Full damage pipeline:**
   - Armament → Projectile entity → travel → impact → Warhead(s) → armor-versus-weapon table → DamageMultiplier resolution → Health reduction
   - Composable warheads: each weapon can trigger multiple warheads (damage + condition + terrain effect)

**Rationale:**
- Without conditions, 80% of OpenRA YAML mods cannot express their behavior at all — conditions are the fundamental modding primitive
- Without multipliers, veterancy/crates/terrain bonuses don't work — critical gameplay systems are broken
- Without the full damage pipeline, weapons are simplistic and balance modding is impossible
- These three systems are the foundation that P1–P3 features build on (stealth, veterancy, transport, support powers all use conditions and multipliers)
- Promoting from "identified gap" to "exit criteria" ensures they're not deferred

**Prior art — Unciv's "Uniques" system:** The open-source Civilization V reimplementation [Unciv](https://github.com/yairm210/Unciv) independently arrived at a declarative conditional modifier DSL called **Uniques**. Every game effect — stat bonuses, abilities, terrain modifiers, era scaling — is expressed as a structured text string with `[parameters]` and `<conditions>`:

```
"[+15]% Strength <when attacking> <vs [Armored] units>"
"[+1] Movement <for [Mounted] units>"
"[+20]% Production <when constructing [Military] units> <during [Golden Age]>"
```

Key lessons for IC:
- **Declarative composition eliminates code.** Unciv's ~600 unique types cover virtually all Civ V mechanics without per-mechanic code. Modders combine parameters and conditions freely — the engine resolves the modifier stack.
- **Typed filters replace magic strings.** Unciv defines filter types (unit type, terrain, building, tech, era, resource) with formal matching rules. IC's attribute tags and condition system should adopt similarly typed filter categories.
- **Conditional stacking is the modding primitive.** The pattern `effect [magnitude] <condition₁> <condition₂>` maps directly to IC's `StatModifiers` component — each unique becomes a `(source, stat, modifier_value, condition)` tuple. D028's condition system is the right foundation; the Unciv pattern validates extending it with a YAML surface syntax (see `04-MODDING.md` § "Conditional Modifiers").
- **GitHub-as-Workshop works at scale.** Unciv's mod ecosystem (~400 mods) runs on plain GitHub repos with JSON rulesets. This validates IC's Workshop design (federated registry with Git-compatible distribution) and suggests that low-friction plain-data mods drive adoption more than scripting power.

**Phase:** Phase 2 (hard exit criteria — no Phase 3 starts without these).

---

### D029 — Cross-Game Component Library (Phase 2 Targets)

**Decision:** The seven first-party component systems identified in `12-MOD-MIGRATION.md` (from Combined Arms and Remastered case studies) are Phase 2 targets. They are high priority and independently scoped — any that don't land by Phase 2 exit are early Phase 3 work, not deferred indefinitely. (The D028 systems — conditions, multipliers, damage pipeline — are the hard Phase 2 gate; see `08-ROADMAP.md` § Phase 2 exit criteria.)

**The seven systems:**

| System                   | Needed For                                  | Phase 2 Scope                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mind Control**         | CA (Yuri), RA2 game module, Scrin           | Controller/controllable components, capacity limits, override                                                                                                                                                                                                    |
| **Carrier/Spawner**      | CA, RA2 (Aircraft Carrier, Kirov drones)    | Master/slave with respawn, recall, autonomous attack                                                                                                                                                                                                             |
| **Teleport Networks**    | CA, Nod tunnels (TD/TS), Chronosphere       | Multi-node network with primary exit designation                                                                                                                                                                                                                 |
| **Shield System**        | CA, RA2 force shields, Scrin                | Absorb-before-health, recharge timer, depletion                                                                                                                                                                                                                  |
| **Upgrade System**       | CA, C&C3 game module                        | Per-unit tech research via building, condition grants                                                                                                                                                                                                            |
| **Delayed Weapons**      | CA (radiation, poison), RA2 (terror drones) | Timer-attached effects on targets                                                                                                                                                                                                                                |
| **Dual Asset Rendering** | Remastered recreation, HD mod packs         | Superseded by the Resource Pack system (`04-MODDING.md` § "Resource Packs") which generalizes this to N asset tiers, not just two. Phase 2 scope: `ic-render` supports runtime-switchable asset source per entity; Resource Pack manifests resolve at load time. |

**Evidence from OpenRA mod ecosystem:** Analysis of six major OpenRA community mods (see `research/openra-mod-architecture-analysis.md` and `research/openra-ra2-mod-architecture.md`) validates and extends this list. Cross-game component reuse is the most consistent pattern across mods — the same mechanics appear independently in 3–5 mods each:

| Component          | Mods Using It           | Notes                                                                                                 |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Mind Control       | RA2, Romanovs-Vengeance | MindController/MindControllable with capacity limits, DiscardOldest policy, ArcLaserZap visual        |
| Carrier/Spawner    | RA2, OpenHV, OpenSA     | BaseSpawnerParent→CarrierParent hierarchy; OpenHV uses for drone carriers; OpenSA for colony spawning |
| Infection          | RA2, Romanovs-Vengeance | InfectableInfo with damage/kill triggers                                                              |
| Disguise/Mirage    | RA2, Romanovs-Vengeance | MirageInfo with configurable reveal triggers (attack, damage, deploy, unload, infiltrate, heal)       |
| Temporal Weapons   | RA2, Romanovs-Vengeance | ChronoVortexInfo with return-to-start mechanics                                                       |
| Radiation          | RA2                     | World-level TintedCellsLayer with sparse storage and logarithmic decay                                |
| Hacking            | OpenHV                  | HackerInfo with delay, condition grant on target                                                      |
| Periodic Discharge | OpenHV                  | PeriodicDischargeInfo with damage/effects on timer                                                    |
| Colony Capture     | OpenSA                  | ColonyBit with conversion mechanics                                                                   |

This validates that IC's seven systems are necessary but reveals two additional patterns that appear cross-game: **infection** (delayed damage/conversion — distinct from "delayed weapons" in that the infected unit carries the effect) and **disguise/mirage** (appearance substitution with configurable reveal triggers). These are candidates for promotion from WASM-only to first-party components.

**Rationale:**
- These aren't CA-specific — they're needed for RA2 (the likely second game module). Building them in Phase 2 means they're available when RA2 development starts.
- CA can migrate to IC the moment the engine is playable, rather than waiting for Phase 6a
- Without these as built-in components, CA modders would need to write WASM for basic mechanics like mind control — unacceptable for adoption
- The seven systems cover ~60% of CA's custom C# code — collapsing the WASM tier from ~15% to ~5% of migration effort
- Each system is independently useful and well-scoped (2-5 days engineering each)

**Impact on migration estimates:**

| Migration Tier | Before D029 | After D029 |
| -------------- | ----------- | ---------- |
| Tier 1 (YAML)  | ~40%        | ~45%       |
| Built-in       | ~30%        | ~40%       |
| Tier 2 (Lua)   | ~15%        | ~10%       |
| Tier 3 (WASM)  | ~15%        | ~5%        |

**Phase:** Phase 2 (sim-side components and dual asset rendering in `ic-render`).

---

---
