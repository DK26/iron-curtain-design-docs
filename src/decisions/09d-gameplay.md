# Decision Log — Gameplay & AI

Pathfinding, balance presets, QoL toggles, AI systems, render modes, and trait-abstracted subsystems.

---

## D013: Pathfinding — Trait-Abstracted, Multi-Layer Hybrid First

**Decision:** Pathfinding and spatial queries are abstracted behind traits (`Pathfinder`, `SpatialIndex`) in the engine core. The RA1 game module implements them with a multi-layer hybrid pathfinder and spatial hash. The engine core never calls algorithm-specific functions directly.

**Rationale:**
- OpenRA uses hierarchical A* which struggles with large unit groups and lacks local avoidance
- A multi-layer approach (hierarchical sectors + JPS/flowfield tiles + local avoidance) handles both small and mass movement well
- Grid-based implementations are the right choice for the isometric C&C family
- But pathfinding is a *game module concern*, not an engine-core assumption
- Abstracting behind a trait costs near-zero now (one trait, one impl) and prevents a rewrite if a future game module needs navmesh or any other spatial model
- Same philosophy as `NetworkModel` (build `LocalNetwork` first, but the seam exists), `WorldPos.z` (costs one `i32`, saves RA2 rewrite), and `InputSource` (build mouse/keyboard first, touch slots in later)

**Concrete design:**
- `Pathfinder` trait: `request_path()`, `get_path()`, `is_passable()`, `invalidate_area()`, `path_distance()`, `batch_distances_into()` (+ convenience `batch_distances()` wrapper for non-hot paths)
- `SpatialIndex` trait: `query_range_into()`, `update_position()`, `remove()`
- RA1 module registers `IcPathfinder` (primary) + `GridSpatialHash`; D045 adds `RemastersPathfinder` and `OpenRaPathfinder` as additional `Pathfinder` implementations for movement feel presets
- All sim systems call the traits, never grid-specific data structures
- See `02-ARCHITECTURE.md` § "Pathfinding & Spatial Queries" for trait definitions

**Modder-selectable and modder-provided:** The `Pathfinder` trait is open — not locked to first-party implementations. Modders can:
1. **Select** any registered `Pathfinder` for their mod (e.g., a total conversion picks `IcPathfinder` for its smooth movement, or `RemastersPathfinder` for its retro feel)
2. **Provide** their own `Pathfinder` implementation via a Tier 3 WASM module and distribute it through the Workshop (D030)
3. **Use someone else's** community-created pathfinder — just declare it as a dependency in the mod manifest

This follows the same pattern as render modes (D048): the engine ships built-in implementations, mods can add more, and players/modders pick what they want. A Generals-clone mod ships a `LayeredGridPathfinder`; a tower defense mod ships a waypoint pathfinder; a naval mod ships something flow-based. The trait doesn't care — `request_path()` returns waypoints regardless of how they were computed.

**Performance:** the architectural seam is **near-zero cost**. Pathfinding/spatial cost is dominated by algorithm choice, cache behavior, and allocations — not dispatch overhead. Hot-path APIs use caller-owned scratch buffers (`*_into` pattern). Dispatch strategy (static vs dynamic) is chosen per-subsystem by profiling, not by dogma.

**What we build first:** `IcPathfinder` and `GridSpatialHash`. The traits exist from day one. `RemastersPathfinder` and `OpenRaPathfinder` are Phase 2 deliverables (D045) — ported from their respective GPL codebases. Community pathfinders can be published to the Workshop from Phase 6a.

---

---

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
- `weather_surface_system` is O(cells) but amortized via spatial quadrant rotation: the map is partitioned into 4 quadrants and one quadrant is updated per tick, achieving 4× throughput with constant 1-tick latency. This is a sim-only strategy — it does not depend on camera position (the sim has no camera awareness).
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

## D041: Trait-Abstracted Subsystem Strategy — Beyond Networking and Pathfinding

**Decision:** Extend the `NetworkModel`/`Pathfinder`/`SpatialIndex` trait-abstraction pattern to five additional engine subsystems that carry meaningful risk of regret if hardcoded: **AI strategy, fog of war, damage resolution, ranking/matchmaking, and order validation**. Each gets a formal trait in the engine, a default implementation in the RA1 game module, and the same "costs near-zero now, prevents rewrites later" guarantee.

**Context:** The engine already trait-abstracts 14 subsystems (see inventory below, including Transport added by D054). These were designed individually — some as architectural invariants (D006 networking, D013 pathfinding), others as consequences of multi-game extensibility (D018 `GameModule`, `Renderable`, `FormatRegistry`). But several critical *algorithm-level* concerns remain hardcoded in RA1's system implementations. For data-driven concerns (weather, campaigns, achievements, themes), YAML+Lua modding provides sufficient flexibility — no trait needed. For *algorithmic* concerns, the resolution logic itself is what varies between game types and modding ambitions.

**The principle:** Abstract the *algorithm*, not the *data*. If a modder can change behavior through YAML values or Lua scripts, a trait is unnecessary overhead. If changing behavior requires replacing the *logic* — the decision-making process, the computation pipeline, the scoring formula — that's where a trait prevents a future rewrite.

### Inventory: Already Trait-Abstracted (14)

| Trait                             | Crate                              | Decision  | Phase  |
| --------------------------------- | ---------------------------------- | --------- | ------ |
| `NetworkModel`                    | ic-net                             | D006      | 2      |
| `Pathfinder`                      | ic-sim (trait), game module (impl) | D013      | 2      |
| `SpatialIndex`                    | ic-sim (trait), game module (impl) | D013      | 2      |
| `InputSource`                     | ic-game                            | D018      | 2      |
| `ScreenToWorld`                   | ic-render                          | D018      | 1      |
| `Renderable` / `RenderPlugin`     | ic-render                          | D017/D018 | 1      |
| `GameModule`                      | ic-game                            | D018      | 2      |
| `OrderCodec`                      | ic-protocol                        | D007      | 5      |
| `TrackingServer`                  | ic-net                             | D007      | 5      |
| `LlmProvider`                     | ic-llm                             | D016      | 7      |
| `FormatRegistry` / `FormatLoader` | ra-formats                         | D018      | 0      |
| `SimReconciler`                   | ic-net                             | D011      | Future |
| `CommunityBridge`                 | ic-net                             | D011      | Future |
| `Transport`                       | ic-net                             | D054      | 5      |

### New Trait Abstractions (5)

#### 1. `AiStrategy` — Pluggable AI Decision-Making

**Problem:** `ic-ai` defines `AiPersonality` as a YAML-configurable parameter struct (aggression, tech preference, micro level) that tunes behavior within a fixed decision algorithm. This is great for balance knobs — but a modder who wants a fundamentally different AI approach (GOAP planner, Monte Carlo tree search, neural network, scripted state machine, or a tournament-specific meta-counter AI) cannot plug one in. They'd have to fork `ic-ai` or write a WASM mod that reimplements the entire AI from scratch.

**Solution:**

```rust
/// Game modules and mods implement this to provide AI opponents.
/// The default RA1 implementation uses AiPersonality-driven behavior trees.
/// Mods can provide alternatives: planning-based, neural, procedural, etc.
pub trait AiStrategy: Send + Sync {
    /// Called once per AI player per tick. Reads visible game state, emits orders.
    fn decide(
        &mut self,
        player: PlayerId,
        view: &FogFilteredView,  // only what this player can see
        tick: u64,
    ) -> Vec<PlayerOrder>;

    /// Human-readable name for lobby display.
    fn name(&self) -> &str;

    /// Difficulty tier for matchmaking/UI categorization.
    fn difficulty(&self) -> AiDifficulty;

    /// Optional: per-tick compute budget hint (microseconds).
    fn tick_budget_hint(&self) -> Option<u64>;

    // --- Event callbacks (inspired by Spring Engine + BWAPI research) ---
    // Default implementations are no-ops. AIs override what they care about.
    // Events are pushed by the engine at the same pipeline point as decide(),
    // before the decide() call — so the AI can react within the same tick.

    /// Own unit finished construction/training.
    fn on_unit_created(&mut self, _unit: EntityId, _unit_type: &str) {}
    /// Own unit destroyed.
    fn on_unit_destroyed(&mut self, _unit: EntityId, _attacker: Option<EntityId>) {}
    /// Own unit has no orders (idle).
    fn on_unit_idle(&mut self, _unit: EntityId) {}
    /// Enemy unit enters line of sight.
    fn on_enemy_spotted(&mut self, _unit: EntityId, _unit_type: &str) {}
    /// Known enemy unit destroyed.
    fn on_enemy_destroyed(&mut self, _unit: EntityId) {}
    /// Own unit taking damage.
    fn on_under_attack(&mut self, _unit: EntityId, _attacker: EntityId) {}
    /// Own building completed.
    fn on_building_complete(&mut self, _building: EntityId) {}
    /// Research/upgrade completed.
    fn on_research_complete(&mut self, _tech: &str) {}

    // --- Parameter introspection (inspired by MicroRTS research) ---
    // Enables: automated parameter tuning, UI-driven difficulty sliders,
    // tournament parameter search, AI vs AI evaluation.

    /// Expose tunable parameters for external configuration.
    fn get_parameters(&self) -> Vec<ParameterSpec> { vec![] }
    /// Set a parameter value (called by engine from YAML config or UI).
    fn set_parameter(&mut self, _name: &str, _value: i32) {}

    // --- Engine difficulty scaling (inspired by 0 A.D. + AoE2 research) ---

    /// Whether this AI uses engine-level difficulty scaling (resource bonuses,
    /// reaction delays, etc.). Default: true. Sophisticated AIs that handle
    /// difficulty internally can return false to opt out.
    fn uses_engine_difficulty_scaling(&self) -> bool { true }
}

pub enum AiDifficulty { Sandbox, Easy, Normal, Hard, Brutal, Custom(String) }

pub struct ParameterSpec {
    pub name: String,
    pub description: String,
    pub min_value: i32,
    pub max_value: i32,
    pub default_value: i32,
    pub current_value: i32,
}
```

**Key design points:**
- `FogFilteredView` ensures AI honesty — no maphack by default. Campaign scripts can provide an omniscient view for specific AI players via conditions.
- `AiPersonality` becomes the configuration for the *default* `AiStrategy` implementation (`PersonalityDrivenAi`), not the only way to configure AI.
- **Event callbacks** (from Spring Engine/BWAPI research, see `research/rts-ai-extensibility-survey.md`) enable reactive AI without polling. Pure `decide()`-only AI works fine (events are optional), but event-aware AI can respond immediately to threats, idle units, and scouting information. Events fire before `decide()` in the same tick, so the AI can incorporate event data into its tick decision.
- **Parameter introspection** (from MicroRTS research) enables automated parameter tuning and UI-driven difficulty sliders. Every `AiStrategy` can expose its knobs — tournament systems use this for automated parameter search, the lobby UI uses it for "Advanced AI Settings" sliders.
- **Engine difficulty scaling opt-out** (from 0 A.D. + AoE2 research) lets sophisticated AIs handle difficulty internally. Simple AIs get engine-provided resource bonuses and reaction time delays; advanced AIs that model difficulty as behavioral parameters can opt out.
- AI strategies are selectable in the lobby: "IC Default (Normal)", "IC Default (Brutal)", "Workshop: Neural Net v2.1", etc.
- WASM Tier 3 mods can provide `AiStrategy` implementations — the trait is part of the stable mod API surface.
- Lua Tier 2 mods can script lightweight AI via the existing Lua API (trigger-based). `AiStrategy` trait is for full-replacement AI, not scripted behaviors.
- Adaptive difficulty (D034 integration) is implemented inside the default strategy, not in the trait — it's an implementation detail of `PersonalityDrivenAi`.
- Determinism: `decide()` and all event callbacks are called at a fixed point in the system pipeline. All clients run the same AI with the same state → same orders. Mod-provided AI is subject to the same determinism requirements as any sim code.

**Event accumulation — `AiEventLog`:**

The engine provides an `AiEventLog` utility struct to every `AiStrategy` instance. It accumulates fog-filtered events from the callbacks above into a structured, queryable log — the "inner game event log" that D044 (LLM-enhanced AI) consumes as its primary context source. Non-LLM AI can ignore the log entirely (zero cost if `to_narrative()` is never called); LLM-based AI uses it as the bridge between simulation events and natural-language prompts.

```rust
/// Accumulates fog-filtered game events into a structured log.
/// Provided by the engine to every AiStrategy instance. Events are pushed
/// into the log when callbacks fire — the AI gets both the callback
/// AND a persistent log entry.
pub struct AiEventLog {
    entries: CircularBuffer<AiEventEntry>,  // bounded, oldest entries evicted
    capacity: usize,                        // default: 1000 entries
}

pub struct AiEventEntry {
    pub tick: u64,
    pub event_type: AiEventType,
    pub description: String,  // human/LLM-readable summary
    pub entity: Option<EntityId>,
    pub related_entity: Option<EntityId>,
}

pub enum AiEventType {
    UnitCreated, UnitDestroyed, UnitIdle,
    EnemySpotted, EnemyDestroyed,
    UnderAttack, BuildingComplete, ResearchComplete,
    StrategicUpdate,  // injected by orchestrator AI when plan changes (D044)
}

impl AiEventLog {
    /// All events since a given tick (for periodic LLM consultations).
    pub fn since(&self, tick: u64) -> &[AiEventEntry] { /* ... */ }

    /// Natural-language narrative summary — suitable for LLM prompts.
    /// Produces chronological text: "Tick 450: Enemy tank spotted near our
    /// expansion. Tick 460: Our refinery under attack by 3 enemy units."
    pub fn to_narrative(&self, since_tick: u64) -> String { /* ... */ }

    /// Structured summary — counts by event type, key entities, threat level.
    pub fn summary(&self) -> EventSummary { /* ... */ }
}
```

Key properties of the event log:
- **Fog-filtered by construction.** All entries originate from the same callback pipeline that respects `FogFilteredView` — no event reveals information the AI shouldn't have. This is the architectural guarantee the user asked for: the "action story / context" the LLM reads is honest.
- **Bounded.** Circular buffer with configurable capacity (default 1000 entries). Oldest entries are evicted. No unbounded memory growth.
- **`to_narrative(since_tick)`** generates a chronological natural-language account of events since a given tick — this is the "inner game event log / action story / context" that D044's `LlmOrchestratorAi` sends to the LLM for strategic guidance.
- **`StrategicUpdate` event type.** D044's LLM orchestrator records its own plan changes into the log, creating a complete narrative that includes both game events and AI strategic decisions.
- **Useful beyond LLM.** Debug/spectator overlays for any AI ("what does this AI know?"), D042's behavioral profile building, and replay analysis all benefit from a structured event log.
- **Zero cost if unused.** The engine pushes entries regardless (they're cheap structs), but `to_narrative()` — the expensive serialization — is only called by consumers that need it.

**Modder-selectable and modder-provided:** The `AiStrategy` trait is open — not locked to first-party implementations. This follows the same pattern as `Pathfinder` (D013/D045) and render modes (D048):
1. **Select** any registered `AiStrategy` for a mod (e.g., a Generals total conversion uses a GOAP planner instead of behavior trees)
2. **Provide** a custom `AiStrategy` via a Tier 3 WASM module and distribute it through the Workshop (D030)
3. **Use someone else's** community-created AI — declare it as a dependency in the mod manifest

Unlike pathfinders (one axis: algorithm), AI has **two orthogonal axes**: which algorithm (`AiStrategy` impl) and how hard it plays (difficulty level). See D043 for the full two-axis difficulty system.

**What we build now:** Only `PersonalityDrivenAi` (the existing YAML-configurable behavior). The trait exists from Phase 4 (when AI ships); alternative implementations are future work by us or the community.

**Phase:** Phase 4 (AI & Single Player).

#### 2. `FogProvider` — Pluggable Fog of War Computation

**Problem:** `fog_system()` is system #21 in the RA1 pipeline. It computes visibility based on unit sight ranges — but the computation algorithm is baked into the system implementation. Different game modules need different fog models: radius-based (RA1), line-of-sight with elevation raycast (RA2/TS), hex-grid fog (non-C&C mods), or even no fog at all (sandbox modes). The future fog-authoritative `NetworkModel` needs server-side fog computation that fundamentally differs from client-side — the same `FogProvider` trait would serve both.

**Solution:**

```rust
/// Game modules implement this to define how visibility is computed.
/// The engine calls this from fog_system() — the system schedules the work,
/// the provider computes the result.
pub trait FogProvider: Send + Sync {
    /// Recompute visibility for a player. Called by fog_system() each tick
    /// (or staggered per 10-PERFORMANCE.md amortization rules).
    fn update_visibility(
        &mut self,
        player: PlayerId,
        sight_sources: &[(WorldPos, SimCoord)],  // (position, sight_range) pairs
        terrain: &TerrainData,
    );

    /// Is this position visible to this player right now?
    fn is_visible(&self, player: PlayerId, pos: WorldPos) -> bool;

    /// Is this position explored (ever seen) by this player?
    fn is_explored(&self, player: PlayerId, pos: WorldPos) -> bool;

    /// Bulk query: all entity IDs visible to this player (for AI, render culling).
    fn visible_entities(&self, player: PlayerId) -> &[EntityId];
}
```

**Key design points:**
- RA1 module registers `RadiusFogProvider` — simple circle-based visibility. Fast, cache-friendly, matches original RA behavior.
- RA2/TS module would register `ElevationFogProvider` — raycasts against terrain heightmap for line-of-sight.
- Non-C&C mods could implement hex fog, cone-of-vision, or always-visible. Sandbox/debug modes: `NoFogProvider` (everything visible).
- Fog-authoritative server (`FogAuthoritativeNetwork` from D006 future architectures) reuses the same `FogProvider` on the server side to determine which entities to send to each client.
- Performance: `fog_system()` drives the amortization schedule (stagger updates per `10-PERFORMANCE.md`). The provider does the math; the system decides when to call it.
- Shroud (unexplored terrain) vs. fog (explored but not currently visible) distinction is preserved in the trait via `is_visible()` vs. `is_explored()`.

**What we build now:** Only `RadiusFogProvider`. The trait exists from Phase 2; `ElevationFogProvider` ships when RA2/TS module development begins.

**Phase:** Phase 2 (built alongside `fog_system()` in the sim).

#### 3. `DamageResolver` — Pluggable Damage Pipeline Resolution

**Problem:** D028 defines the full damage pipeline: Armament → Projectile → Warhead → Versus table → multiplier stack → Health reduction. The *data* flowing through this pipeline is deeply moddable — warheads, versus tables, modifier stacks are all YAML-configurable. But the *resolution algorithm* — the order in which shields, armor, conditions, and multipliers are applied — is hardcoded in `projectile_system()`. A game module where shields absorb before armor checks, or where sub-object targeting distributes damage across components (Generals-style), or where damage types bypass armor entirely (TS ion storms) needs a different resolution order. These aren't data changes — they're algorithmic.

**Solution:**

```rust
/// Game modules implement this to define how damage is resolved after
/// a warhead makes contact. The default RA1 implementation applies the
/// standard Versus table + modifier stack pipeline.
pub trait DamageResolver: Send + Sync {
    /// Resolve final damage from a warhead impact on a target.
    /// Called by projectile_system() after hit detection.
    fn resolve_damage(
        &self,
        warhead: &WarheadDef,
        target: &DamageTarget,
        modifiers: &StatModifiers,
        distance_from_impact: SimCoord,
    ) -> DamageResult;
}

pub struct DamageTarget {
    pub entity: EntityId,
    pub armor_type: ArmorType,
    pub current_health: i32,
    pub shield: Option<ShieldState>,  // D029 shield system
    pub conditions: Conditions,
}

pub struct DamageResult {
    pub health_damage: i32,
    pub shield_damage: i32,
    pub conditions_applied: Vec<(ConditionId, u32)>,  // condition grants from warhead
    pub overkill: i32,  // excess damage (for death effects)
}
```

**Key design points:**
- The default `StandardDamageResolver` implements the RA1 pipeline from D028: Versus table lookup → distance falloff → multiplier stack → health reduction. This handles 95% of C&C damage scenarios.
- RA2 registers `ShieldFirstDamageResolver`: absorb shield → then armor → then health. Same trait, different algorithm.
- Generals-class modules could register `SubObjectDamageResolver`: distributes damage across multiple hit zones per unit.
- The trait boundary is *after hit detection* and *before health reduction*. Projectile flight, homing, and area-of-effect detection are shared infrastructure. Only the final damage-number calculation varies.
- Warhead-applied conditions (e.g., "irradiated" from D028's composable warhead design) flow through `DamageResult.conditions_applied` — the resolver decides which conditions apply based on its game's rules.
- WASM Tier 3 mods can provide custom resolvers for total conversions.

**What we build now:** Only `StandardDamageResolver`. The trait exists from Phase 2 (ships with D028). Shield-aware resolver ships when the D029 shield system lands.

**Phase:** Phase 2 (ships with D028 damage pipeline).

#### 4. `RankingProvider` — Pluggable Rating and Matchmaking

**Problem:** The competitive infrastructure (AGENTS.md) specifies Glicko-2 ratings, but the ranking algorithm is implemented directly in the relay/tracking server with no abstraction boundary. Tournament organizers and community servers may want Elo (simpler, well-understood), TrueSkill (better for team games), or custom rating systems (handicap-adjusted, seasonal decay variants, faction-specific ratings). Since tracking servers are community-hostable and federated (D030/D037), locking the rating algorithm to Glicko-2 limits what community operators can offer.

**Solution:**

```rust
/// Tracking servers implement this to provide rating calculations.
/// The default implementation uses Glicko-2.
pub trait RankingProvider: Send + Sync {
    /// Calculate updated ratings after a match result.
    fn update_ratings(
        &mut self,
        result: &CertifiedMatchResult,
        current_ratings: &[PlayerRating],
    ) -> Vec<PlayerRating>;

    /// Estimate match quality / fairness for proposed matchmaking.
    fn match_quality(&self, team_a: &[PlayerRating], team_b: &[PlayerRating]) -> MatchQuality;

    /// Rating display for UI (e.g., "1500 ± 200" for Glicko, "Silver II" for league).
    fn display_rating(&self, rating: &PlayerRating) -> String;

    /// Algorithm identifier for interop (ratings from different algorithms aren't comparable).
    fn algorithm_id(&self) -> &str;
}

pub struct PlayerRating {
    pub player_id: PlayerId,
    pub rating: i64,        // fixed-point, algorithm-specific
    pub deviation: i64,     // uncertainty (Glicko RD, TrueSkill σ)
    pub volatility: i64,    // Glicko-2 specific; other algorithms may ignore
    pub games_played: u32,
}

pub struct MatchQuality {
    pub fairness: i32,      // 0-1000 (fixed-point), higher = more balanced
    pub estimated_draw_probability: i32,  // 0-1000 (fixed-point)
}
```

**Key design points:**
- Default: `Glicko2Provider` — well-suited for 1v1 and small teams, proven in chess and competitive gaming. Validated by Valve's CS Regional Standings (see `research/valve-github-analysis.md` § Part 4), which uses Glicko with RD fixed at 75 for team competitive play.
- Community operators provide alternatives: `EloProvider` (simpler), `TrueSkillProvider` (better team rating), or custom implementations.
- `algorithm_id()` prevents mixing ratings from different algorithms — a Glicko-2 "1800" is not an Elo "1800".
- `CertifiedMatchResult` (from relay server, D007) is the input — no self-reported results.
- Ratings stored in SQLite (D034) on the tracking server.
- The official tracking server uses Glicko-2. Community tracking servers choose their own.
- Fixed-point ratings (matching sim math conventions) — no floating-point in the ranking pipeline.

**Information content weighting (from Valve CS Regional Standings):** The `match_quality()` method returns a `MatchQuality` struct that includes an `information_content` field (0–1000, fixed-point). This parameter scales how much a match affects rating changes — low-information matches (casual, heavily mismatched, very short duration) contribute less to rating updates, while high-information matches (ranked, well-matched, full-length) contribute more. This prevents rating inflation/deflation from low-quality matches. For IC, information content is derived from: (1) game mode (ranked vs. casual), (2) player count balance (1v1 is higher information than 3v1), (3) game duration (very short games may indicate disconnection, not skill), (4) map symmetry rating (if available). See `research/valve-github-analysis.md` § 4.2.

```rust
pub struct MatchQuality {
    pub fairness: i32,                // 0-1000 (fixed-point), higher = more balanced
    pub estimated_draw_probability: i32,  // 0-1000 (fixed-point)
    pub information_content: i32,     // 0-1000 (fixed-point), scales rating impact
}
```

**New player seeding (from Valve CS Regional Standings):** New players entering ranked play are seeded using a weighted combination of calibration performance and opponent quality — not placed at a flat default rating:

```rust
/// Seeding formula for new players completing calibration.
/// Inspired by Valve's CS seeding (bounty, opponent network, LAN factor).
/// IC adapts: no prize money, but the weighted-combination approach is sound.
pub struct SeedingResult {
    pub initial_rating: i64,       // Fixed-point, mapped into rating range
    pub initial_deviation: i64,    // Higher than settled players (fast convergence)
}

/// Inputs to the seeding formula:
/// - calibration_performance: win rate across calibration matches (0-1000)
/// - opponent_quality: average rating of calibration opponents (fixed-point)
/// - match_count: number of calibration matches played
/// The seed is mapped into the rating range (e.g., 800–1800 for Glicko-2).
```

This prevents the cold-start problem where a skilled player placed at 1500 stomps their way through dozens of mismatched games before reaching their true rating. Valve's system proved that even ~5–10 calibration matches with quality weighting produce a dramatically better initial placement.

**Ranking visibility thresholds (from Valve CS Regional Standings):**
- **Minimum 5 matches** to appear on leaderboards — prevents noise from one-game players.
- **Must have defeated at least 1 distinct opponent** — prevents collusion (two friends repeatedly playing each other to inflate ratings).
- **RD decay for inactivity:** `sqrt(rd² + C²*t)` where C=34.6, t=rating periods since last match. Inactive players' ratings become less certain, naturally widening their matchmaking range until they play again.

**Ranking model validation (from Valve CS Regional Standings):** The `Glicko2Provider` implementation logs **expected win probabilities alongside match results** from day one. This enables post-hoc model validation using the methodology Valve describes: (1) bin expected win rates into 5% buckets, (2) compare expected vs. observed win rates within each bucket, (3) compute Spearman's rank correlation (ρ). Valve achieved ρ = 0.98 — excellent. IC targets ρ ≥ 0.95 as a health threshold; below that triggers investigation of the rating model parameters. This data feeds into the OTEL telemetry pipeline (D031) and is visible on the Grafana dashboard for community server operators. See `research/valve-github-analysis.md` § 4.5.

**What we build now:** Only `Glicko2Provider`. The trait exists from Phase 5 (when competitive infrastructure ships). Alternative providers are community work.

**Phase:** Phase 5 (Multiplayer & Competitive).

#### 5. `OrderValidator` — Explicit Per-Module Order Validation

**Problem:** D012 mandates that every order is validated inside the sim before execution, deterministically. Currently, validation is implicit — it happens inside `apply_orders()`, which is part of the game module's system pipeline. This works because `GameModule::system_pipeline()` lets each module define its own `apply_orders()` implementation. But the validation contract is informal: nothing in the architecture *requires* a game module to validate orders, or specifies what validation means. A game module that forgets validation breaks the anti-cheat guarantee (D012) silently.

**Solution:** Add `order_validator()` to the `GameModule` trait, making validation an explicit, required contract:

```rust
/// Added to GameModule trait (D018):
pub trait GameModule: Send + Sync + 'static {
    // ... existing methods ...

    /// Provide the module's order validation logic.
    /// Called by the engine before apply_orders() — not by the module's own systems.
    /// The engine enforces that ALL orders pass validation before execution.
    fn order_validator(&self) -> Box<dyn OrderValidator>;
}

/// Game modules implement this to define legal orders.
/// The engine calls this for EVERY order, EVERY tick — the game module
/// cannot accidentally skip validation.
pub trait OrderValidator: Send + Sync {
    /// Validate an order against current game state.
    /// Returns Valid or Rejected with a reason for logging/anti-cheat.
    fn validate(
        &self,
        player: PlayerId,
        order: &PlayerOrder,
        state: &SimReadView,
    ) -> OrderValidity;
}

pub enum OrderValidity {
    Valid,
    Rejected(RejectionReason),
}

pub enum RejectionReason {
    NotOwner,
    InsufficientFunds,
    MissingPrerequisite,
    InvalidPlacement,
    CooldownActive,
    InvalidTarget,
    RateLimited,       // OrderBudget exceeded (D006 security)
    Custom(String),    // game-module-specific reasons
}
```

**Key design points:**
- The engine (not the game module) calls `validate()` before `apply_orders()`. This means a game module *cannot* skip validation — the architecture enforces D012's anti-cheat guarantee.
- `SimReadView` is a read-only view of sim state — the validator cannot mutate game state.
- `RejectionReason` includes standard reasons (shared across all game modules) plus `Custom` for game-specific rules.
- Repeated rejections from the same player are logged for anti-cheat pattern detection (existing D012 design, now formalized).
- The default RA1 implementation validates ownership, affordability, prerequisites, placement rules, and rate limits. RA2 would add superweapon authorization, garrison capacity checks, etc.
- This is the lowest-risk trait in the set — it formalizes what `apply_orders()` already does informally. The cost is moving validation from "inside the first system" to "explicit engine-level contract."

**What we build now:** RA1 `StandardOrderValidator`. The trait exists from Phase 2.

**Phase:** Phase 2 (ships with `apply_orders()`).

### Cost/Benefit Analysis

| Trait             | Cost Now                                  | Prevents Later                                                                                             |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AiStrategy`      | One trait + `PersonalityDrivenAi` wrapper | Community AI cannot plug in without forking ic-ai                                                          |
| `FogProvider`     | One trait + `RadiusFogProvider`           | RA2 elevation fog requires rewriting fog_system(); fog-authoritative server requires separate fog codebase |
| `DamageResolver`  | One trait + `StandardDamageResolver`      | Shield/sub-object games require rewriting projectile_system()                                              |
| `RankingProvider` | One trait + `Glicko2Provider`             | Community tracking servers stuck with one rating algorithm                                                 |
| `OrderValidator`  | One trait + explicit validate() call      | Game modules can silently skip validation; anti-cheat guarantee is informal                                |

All five follow the established pattern: **one trait definition + one default implementation with near-zero architectural cost**. Dispatch strategy is subsystem-dependent (profiling decides, not dogma). The architectural cost is 5 trait definitions (~50 lines total) and 5 wrapper implementations (~200 lines total). The benefit is that none of these subsystems becomes a rewrite-required bottleneck when game modules, mods, or community servers need different behavior.

### What Does NOT Need a Trait

These subsystems are already sufficiently modular through data-driven design (YAML/Lua/WASM):

| Subsystem              | Why No Trait Needed                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Weather (D022)         | State machine defined in YAML, transitions driven by Lua. Algorithm is trivial; data is everything.         |
| Campaign (D021)        | Graph structure in YAML, logic in Lua. The campaign engine runs any graph; no algorithmic variation needed. |
| Achievements (D036)    | Definitions in YAML, triggers in Lua. Storage in SQLite. No algorithm to swap.                              |
| UI Themes (D032)       | Pure YAML + sprite sheets. No computation to abstract.                                                      |
| QoL Toggles (D033)     | YAML config flags. Each toggle is a sim-affecting or client-only boolean.                                   |
| Audio (P003)           | Bevy abstracts the audio backend. `ic-audio` is a Bevy plugin, not an algorithm.                            |
| Balance Presets (D019) | YAML rule sets. Switching preset = loading different YAML.                                                  |

The distinction: **traits abstract algorithms; YAML/Lua abstracts data and behavior parameters.** A damage *formula* is an algorithm (trait). A damage *value* is data (YAML). An AI *decision process* is an algorithm (trait). An AI *aggression level* is a parameter (YAML).

**Alternatives considered:**
- Trait-abstract everything (rejected — unnecessary overhead for data-driven systems; violates D015's "no speculative abstractions" principle from D018)
- Trait-abstract nothing new (rejected — the 5 identified systems carry real risk of regret; the `NetworkModel` pattern has proven its value; the cost is near-zero)
- Abstract only AI and fog (rejected — damage resolution and ranking carry comparable risk, and `OrderValidator` formalizes an existing implicit contract)

**Relationship to existing decisions:**
- Extends D006's philosophy ("pluggable via trait") to 5 new subsystems
- Extends D013's pattern ("trait-abstracted, default impl first") identically
- Extends D018's `GameModule` trait with `order_validator()`
- Supports D028 (damage pipeline) by abstracting the resolution step
- Supports D029 (shield system) by allowing shield-first damage resolution
- Supports future fog-authoritative server (D006 future architecture)
- Extended by D054 (Transport trait, SignatureScheme enum, SnapshotCodec version dispatch) — one additional trait and two version-dispatched mechanisms identified by architecture switchability audit

**Phase:** Trait definitions exist from the phase each subsystem ships (Phase 2–5). Alternative implementations are future work.

---

---

## D042: Player Behavioral Profiles & Training System — The Black Box

**Status:** Accepted
**Scope:** `ic-ai`, `ic-ui`, `ic-llm` (optional), `ic-sim` (read-only), D034 SQLite extension
**Phase:** Core profiles + quick training: Phase 4–5. LLM coaching loop: Phase 7.

### The Problem

Every gameplay session generates rich structured data (D031 `GameplayEvent` stream, D034 SQLite storage). Today this data feeds:
- Post-game stats and career analytics (`ic-ui`)
- Adaptive AI difficulty and counter-strategy (`ic-ai`, between-game queries)
- LLM personalization: coaching suggestions, post-match commentary, rivalry narratives (`ic-llm`, optional)
- Replay-to-scenario pipeline: extract one replay's behavior into AI modules (`ic-editor` + `ic-ai`, D038)

But three capabilities are missing:

1. **Aggregated player style profiles.** The replay-to-scenario pipeline extracts behavior from *one* replay. The adaptive AI mentions "per-player gameplay patterns" but only for difficulty tuning, not for creating a reusable AI opponent. There's no cross-game model that captures *how a specific player tends to play* — their preferred build orders, timing windows, unit composition habits, engagement style, faction tendencies — aggregated from all recorded games.

2. **Quick training mode.** Training against a human's style currently requires the full scenario editor pipeline (import replay → configure extraction → save → play). There's no "pick an opponent from your match history and play against their style on any map right now" flow.

3. **Iterative training loop with progress tracking.** Coaching suggestions exist as one-off readouts. There's no structured system for: play → get coached → play again with targeted AI → measure improvement → repeat. No weakness tracking over time.

### The Black Box Concept

Every match produces a *flight recorder* — a structured event log informative enough that an AI system (rule-based or LLM) can reconstruct:
- **What happened** — build timelines, army compositions, engagement sequences, resource curves
- **How the player plays** — timing patterns, aggression level, unit preferences, micro tendencies, strategic habits
- **Where the player struggles** — loss patterns, weaknesses by faction/map/timing, unit types with poor survival rates

The gameplay event stream (D031) already captures this data. D042 adds the systems that *interpret* it: profile building, profile-driven AI, and a training workflow that uses both.

### Player Style Profiles

A `PlayerStyleProfile` aggregates gameplay patterns across multiple games into a reusable behavioral model:

```rust
/// Aggregated behavioral model built from gameplay event history.
/// Drives StyleDrivenAi and training recommendations.
pub struct PlayerStyleProfile {
    pub player_id: HashedPlayerId,
    pub games_analyzed: u32,
    pub last_updated: Timestamp,

    // Strategic tendencies (averages across games)
    pub preferred_factions: Vec<(String, f32)>,         // faction → usage rate
    pub avg_expansion_timing: FixedPoint,               // ticks until first expansion
    pub avg_first_attack_timing: FixedPoint,            // ticks until first offensive
    pub build_order_templates: Vec<BuildOrderTemplate>, // most common opening sequences
    pub unit_composition_profile: UnitCompositionProfile, // preferred unit mix by game phase
    pub aggression_index: FixedPoint,                   // 0.0 = turtle, 1.0 = all-in rusher
    pub tech_priority: TechPriority,                    // rush / balanced / fast-tech
    pub resource_efficiency: FixedPoint,                // avg resource utilization rate
    pub micro_intensity: FixedPoint,                    // orders-per-unit-per-minute

    // Engagement patterns
    pub preferred_attack_directions: Vec<MapQuadrant>,  // where they tend to attack from
    pub retreat_threshold: FixedPoint,                  // health % at which units disengage
    pub multi_prong_frequency: FixedPoint,              // how often they split forces

    // Weakness indicators (for training)
    pub loss_patterns: Vec<LossPattern>,                // recurring causes of defeat
    pub weak_matchups: Vec<(String, FixedPoint)>,       // faction/strategy → loss rate
    pub underused_counters: Vec<String>,                // unit types available but rarely built
}
```

**How profiles are built:**
- `ic-ai` runs aggregation queries against the SQLite `gameplay_events` and `match_players` tables at profile-build time (not during matches)
- Profile building is triggered after each completed match and cached in a new `player_profiles` SQLite table
- For the local player: full data from all local games
- For opponents: data reconstructed from matches where you were a participant — you can only model players you've actually played against, using the events visible in those shared sessions

**Privacy:** Opponent profiles are built entirely from your local replay data. No data is fetched from other players' machines. You see their behavior *from your games with them*, not from their solo play. No profile data is exported or shared unless the player explicitly opts in.

#### SQLite Extension (D034)

```sql
-- Player style profiles (D042 — cached aggregated behavior models)
CREATE TABLE player_profiles (
    id              INTEGER PRIMARY KEY,
    player_id_hash  TEXT NOT NULL UNIQUE,  -- hashed player identifier
    display_name    TEXT,                  -- last known display name
    games_analyzed  INTEGER NOT NULL,
    last_updated    TEXT NOT NULL,
    profile_json    TEXT NOT NULL,         -- serialized PlayerStyleProfile
    is_local        INTEGER NOT NULL DEFAULT 0  -- 1 for the local player's own profile
);

-- Training session tracking (D042 — iterative improvement measurement)
CREATE TABLE training_sessions (
    id              INTEGER PRIMARY KEY,
    started_at      TEXT NOT NULL,
    target_weakness TEXT NOT NULL,         -- what weakness this session targets
    opponent_profile TEXT,                 -- player_id_hash of the style being trained against
    map_name        TEXT NOT NULL,
    result          TEXT,                  -- 'victory', 'defeat', null if incomplete
    duration_ticks  INTEGER,
    weakness_score_before REAL,            -- measured weakness metric before session
    weakness_score_after  REAL,            -- measured weakness metric after session
    notes_json      TEXT                   -- LLM-generated or rule-based coaching notes
);
```

### Style-Driven AI

A new `AiStrategy` implementation (extends D041) that reads a `PlayerStyleProfile` and approximates that player's behavior:

```rust
/// AI strategy that mimics a specific player's style from their profile.
pub struct StyleDrivenAi {
    profile: PlayerStyleProfile,
    variance: FixedPoint,  // 0.0 = exact reproduction, 1.0 = loose approximation
    difficulty_scale: FixedPoint,  // adjusts execution speed/accuracy
}

impl AiStrategy for StyleDrivenAi {
    fn name(&self) -> &str { "style_driven" }

    fn decide(&self, world: &World, player: PlayerId, budget: &mut TickBudget) -> Vec<PlayerOrder> {
        // 1. Check game phase (opening / mid / late) from tick count + base count
        // 2. Select build order template from profile.build_order_templates
        //    (with variance: slight timing jitter, occasional substitution)
        // 3. Match unit composition targets from profile.unit_composition_profile
        // 4. Engagement decisions use profile.aggression_index and retreat_threshold
        // 5. Attack timing follows profile.avg_first_attack_timing (± variance)
        // 6. Multi-prong attacks at profile.multi_prong_frequency rate
        todo!()
    }

    fn difficulty(&self) -> AiDifficulty { AiDifficulty::Custom }
    fn tick_budget_hint(&self) -> Duration { Duration::from_micros(200) }
}
```

**Relationship to existing `ReplayBehaviorExtractor` (D038):** The extractor converts one replay into scripted AI waypoints/triggers (deterministic, frame-level). `StyleDrivenAi` is different — it reads an aggregated *profile* and makes real-time decisions based on tendencies, not a fixed script. The extractor says "at tick 300, build a Barracks at (120, 45)." `StyleDrivenAi` says "this player tends to build a Barracks within the first 250–350 ticks, usually near their War Factory" — then adapts to the actual game state. Both are useful:

| System                           | Input                           | Output                                          | Fidelity                                    | Replayability                                                         |
| -------------------------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `ReplayBehaviorExtractor` (D038) | One replay file                 | Scripted AI modules (waypoints, timed triggers) | High — frame-level reproduction of one game | Low — same script every time (mitigated by Probability of Presence)   |
| `StyleDrivenAi` (D042)           | Aggregated `PlayerStyleProfile` | Real-time AI decisions based on tendencies      | Medium — captures style, not exact moves    | High — different every game because it reacts to the actual situation |

### Quick Training Mode

A streamlined UI flow that bypasses the scenario editor entirely:

**"Train Against" flow:**
1. Open match history or player profile screen
2. Click "Train Against \[Player Name\]" on any opponent you've encountered
3. Pick a map (or let the system choose one matching your weak matchups)
4. The engine generates a temporary scenario: your starting position + `StyleDrivenAi` loaded with that opponent's profile
5. Play immediately — no editor, no saving, no publishing

**"Challenge My Weakness" flow:**
1. Open training menu (accessible from main menu)
2. System shows your weakness summary: "You lose 68% of games against Allied air rushes" / "Your expansion timing is slow (6:30 vs. 4:15 average)"
3. Click a weakness → system auto-generates a training scenario:
   - Selects a map that exposes the weakness (e.g., map with air-favorable terrain)
   - Configures AI to exploit that specific weakness (aggressive air build)
   - Sets appropriate difficulty (slightly above your current level)
4. Play → post-match summary highlights whether the weakness improved

**Implementation:**
- `ic-ui` provides the training screens (match history integration, weakness display, map picker)
- `ic-ai` provides `StyleDrivenAi` + weakness analysis queries + temporary scenario generation
- No `ic-editor` dependency — training scenarios are generated programmatically and never saved to disk (unless the player explicitly exports them)
- The temporary scenario uses the same sim infrastructure as any skirmish — `LocalNetwork` (D006), standard map loading, standard game loop

### Iterative Training Loop

Training isn't one session — it's a cycle with tracked progress:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Analyze        │────▶│  Train           │────▶│  Review         │
│  (identify      │     │  (play targeted  │     │  (measure       │
│  weaknesses)    │     │  session)        │     │  improvement)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        ▲                                                │
        └────────────────────────────────────────────────┘
                         next cycle
```

**Without LLM (always available):**
- Weakness identification: rule-based analysis of `gameplay_events` aggregates — loss rate by faction/map/timing window, unit survival rates, resource efficiency compared to wins
- Training scenario generation: map + AI configuration targeting the weakness
- Progress tracking: `training_sessions` table records before/after weakness scores per area
- Post-session summary: structured stats comparison ("Your anti-air unit production increased from 2.1 to 4.3 per game. Survival rate against air improved 12%.")

**With LLM (optional, BYOLLM — D016):**
- Natural language training plans: "Week 1: Focus on expansion timing. Session 1: Practice fast expansion against passive AI. Session 2: Defend early rush while expanding. Session 3: Full game with aggressive opponent."
- Post-session coaching: "You expanded at 4:45 this time — 90 seconds faster than your average. But you over-invested in base defense, delaying your tank push by 2 minutes. Next session, try lighter defenses."
- Contextual tips during weakness review: "PlayerX always opens with two Barracks into Ranger rush. Build a Pillbox at your choke point before your second Refinery."
- LLM reads `training_sessions` history to track multi-session arcs: "Over 5 sessions, your anti-air response time improved from 45s to 18s. Let's move on to defending naval harassment."

### What This Is NOT

- **Not machine learning during gameplay.** All profile building and analysis happens between sessions, reading SQLite. The sim remains deterministic (invariant #1).
- **Not a replay bot.** `StyleDrivenAi` makes real-time strategic decisions informed by tendencies, not a frame-by-frame replay script. It adapts to the actual game state.
- **Not surveillance.** Opponent profiles are built from your local data only. You cannot fetch another player's solo games, ranked history, or private matches. You model what you've seen firsthand.
- **Not required.** The training system is entirely optional. Players can ignore it and play skirmish/multiplayer normally. No game mode requires a profile to exist.

### Crate Boundaries

| Component                                                 | Crate             | Reason                                                   |
| --------------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| `PlayerStyleProfile` struct                               | `ic-ai`           | Behavioral model — part of AI system                     |
| `StyleDrivenAi` (AiStrategy impl)                         | `ic-ai`           | AI decision-making logic                                 |
| Profile aggregation queries                               | `ic-ai`           | Reads SQLite `gameplay_events` + `match_players`         |
| Training UI (match history, weakness display, map picker) | `ic-ui`           | Player-facing screens                                    |
| Temporary scenario generation                             | `ic-ai`           | Programmatic scenario setup without `ic-editor`          |
| Training session recording                                | `ic-ui` + `ic-ai` | Writes `training_sessions` to SQLite after each session  |
| LLM coaching + training plans                             | `ic-llm`          | Optional — reads `training_sessions` + `player_profiles` |
| SQLite schema (`player_profiles`, `training_sessions`)    | `ic-game`         | Schema migration on startup, like all D034 tables        |

`ic-editor` is NOT involved in quick training mode. The scenario editor's replay-to-scenario pipeline (D038) remains separate — it's for creating publishable community content, not ephemeral training matches.

### Consumers of Player Data (D034 Extension)

Two new rows for the D034 consumer table:

| Consumer                  | Crate             | What it reads                                             | What it produces                                                                    | Required?                    |
| ------------------------- | ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| **Player style profiles** | `ic-ai`           | `gameplay_events`, `match_players`, `matches`             | `player_profiles` table — aggregated behavioral models for local player + opponents | Always on (profile building) |
| **Training system**       | `ic-ai` + `ic-ui` | `player_profiles`, `training_sessions`, `gameplay_events` | Quick training scenarios, weakness analysis, progress tracking                      | Always on (training UI)      |

### Relationship to Existing Decisions

- **D031 (telemetry):** Gameplay events are the raw data. D042 adds interpretation — the `GameplayEvent` stream is the black box recorder; the profile builder is the flight data analyst.
- **D034 (SQLite):** Two new tables (`player_profiles`, `training_sessions`). Same patterns: schema migration, read-only consumers, local-first.
- **D038 (replay-to-scenario):** Complementary, not overlapping. D038 extracts one replay into a publishable scenario. D042 aggregates many games into a live AI personality. D038 produces scripts; D042 produces strategies.
- **D041 (trait abstraction):** `StyleDrivenAi` implements the `AiStrategy` trait. Same plug-in pattern — the engine doesn't know it's running a profile-driven AI vs. a scripted one.
- **D016 (BYOLLM):** LLM coaching is optional. Without it, the rule-based weakness identification and structured summary system works standalone.
- **D010 (snapshots):** Training sessions use standard sim snapshots for save/restore. No special infrastructure needed.

### Alternatives Considered

| Alternative                                              | Why Not                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ML model trained on replays (neural-net opponent)        | Too complex, non-deterministic, opaque behavior, requires GPU inference during gameplay. Profile-driven rule selection is transparent and runs in microseconds.                                                |
| Server-side profile building                             | Conflicts with local-first principle. Opponent profiles come from your replays, not a central database. Server could aggregate opt-in community profiles in the future, but the base system is entirely local. |
| Manual profile creation ("custom AI personality editor") | Useful but separate. D042 is about automated profile extraction. A manual personality editor is a planned optional extension deferred to `M10-M11` (`P-Creator`/`P-Optional`) after D042 extraction + D038/D053 profile tooling foundations; it reads/writes the same `PlayerStyleProfile` and is not part of D042 Phase 4–5 exit criteria. |
| Integrate training into scenario editor only             | Too much friction for casual training. The editor is for content creation; training is a play mode. Different UX goals.                                                                                        |

**Phase:** Profile building infrastructure ships in **Phase 4** (available for single-player training against AI tendencies). Opponent profile building and "Train Against" flow ship in **Phase 5** (requires multiplayer match data). LLM coaching loop ships in **Phase 7** (optional BYOLLM). The `training_sessions` table and progress tracking ship alongside the training UI in Phase 4–5.

---

---

## D043: AI Behavior Presets — Classic, OpenRA, and IC Default

**Status:** Accepted
**Scope:** `ic-ai`, `ic-sim` (read-only), game module configuration
**Phase:** Phase 4 (ships with AI & Single Player)

### The Problem

D019 gives players switchable *balance* presets (Classic RA vs. OpenRA vs. Remastered values). D041 provides the `AiStrategy` trait for pluggable AI algorithms. But neither addresses a parallel concern: AI *behavioral* style. Original Red Alert AI, OpenRA AI, and a research-informed IC AI all make fundamentally different decisions given the same balance values. A player who selects "Classic RA" balance expects an AI that *plays like Classic RA* — predictable build orders, minimal micro, base-walk expansion, no focus-fire — not an advanced AI that happens to use 1996 damage tables.

### Decision

Ship **AI behavior presets** as first-class configurations alongside balance presets (D019). Each preset defines how the AI plays — its decision-making style, micro level, strategic patterns, and quirks — independent of which balance values or pathfinding behavior are active.

### Built-In Presets

| Preset         | Behavior Description                                                                                                                                                   | Source                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Classic RA** | Mimics original RA AI quirks: predictable build queues, base-walk expansion, minimal unit micro, no focus-fire, doesn't scout, doesn't adapt to player strategy        | EA Red Alert source code analysis       |
| **OpenRA**     | Matches OpenRA skirmish AI: better micro, uses attack-move, scouts, adapts build to counter player's army composition, respects fog of war properly                    | OpenRA AI implementation analysis       |
| **IC Default** | Research-informed enhanced AI: flowfield-aware group tactics, proper formation movement, multi-prong attacks, economic harassment, tech-switching, adaptive aggression | Open-source RTS AI research (see below) |

### IC Default AI — Research Foundation

The IC Default preset draws from published research and open-source implementations across the RTS genre:

- **0 A.D.** — economic AI with resource balancing heuristics, expansion timing models
- **Spring Engine (BAR/Zero-K)** — group micro, terrain-aware positioning, retreat mechanics, formation movement
- **Wargus (Stratagus)** — Warcraft II AI with build-order scripting and adaptive counter-play
- **OpenRA** — the strongest open-source C&C AI; baseline for improvement
- **MicroRTS / AIIDE competitions** — academic RTS AI research: MCTS-based planning, influence maps, potential fields for tactical positioning
- **StarCraft: Brood War AI competitions (SSCAIT, AIIDE)** — decades of research on build-order optimization, scouting, harassment timing

The IC Default AI is not a simple difficulty bump — it's a qualitatively different decision process. Where Classic RA groups all units and attack-moves to the enemy base, IC Default maintains map control, denies expansions, and probes for weaknesses before committing.

### IC Default AI — Implementation Architecture

Based on cross-project analysis of EA Red Alert, EA Generals/Zero Hour, OpenRA, 0 A.D. Petra, Spring Engine, MicroRTS, and Stratagus (see `research/rts-ai-implementation-survey.md` and `research/stratagus-stargus-opencraft-analysis.md`), `PersonalityDrivenAi` uses a **priority-based manager hierarchy** — the dominant pattern across all surveyed RTS AI implementations (independently confirmed in 7 codebases):

```
PersonalityDrivenAi → AiStrategy trait impl
├── EconomyManager
│   ├── HarvesterController     (nearest-resource assignment, danger avoidance)
│   ├── PowerMonitor            (urgency-based power plant construction)
│   └── ExpansionPlanner        (economic triggers for new base timing)
├── ProductionManager
│   ├── UnitCompositionTarget   (share-based, self-correcting — from OpenRA)
│   ├── BuildOrderEvaluator     (priority queue with urgency — from Petra)
│   └── StructurePlanner        (influence-map placement — from 0 A.D.)
├── MilitaryManager
│   ├── AttackPlanner           (composition thresholds + timing — from Petra)
│   ├── DefenseResponder        (event-driven reactive defense — from OpenRA)
│   └── SquadManager            (unit grouping, assignment, retreat)
└── AiState (shared)
    ├── ThreatMap               (influence map: enemy unit positions + DPS)
    ├── ResourceMap             (known resource node locations and status)
    ├── ScoutingMemory          (last-seen timestamps for enemy buildings)
    └── StrategyClassification  (Phase 5+: opponent archetype tracking)
```

Each manager runs on its own tick-gated schedule (see Performance Budget below). Managers communicate through shared `AiState`, not direct calls — the same pattern used by 0 A.D. Petra and OpenRA's modular bot architecture.

#### Key Techniques (Phase 4)

These six techniques form the Phase 4 implementation. Each is proven across multiple surveyed projects:

1. **Priority-based resource allocation** (from Petra's `QueueManager`) — single most impactful pattern. Build requests go into a priority queue ordered by urgency. Power plant at 90% capacity is urgent; third barracks is not. Prevents the "AI has 50k credits and no power" failure mode seen in EA Red Alert.

2. **Share-based unit composition** (from OpenRA's `UnitBuilderBotModule`) — production targets expressed as ratios (e.g., infantry 40%, vehicles 50%, air 10%). Each production cycle builds whatever unit type is furthest below its target share. Self-correcting: losing tanks naturally shifts production toward tanks. Personality parameters (D043 YAML config) tune the ratios per preset.

3. **Influence map for building placement** (from 0 A.D. Petra) — a grid overlay scoring each cell by proximity to resources, distance from known threats, and connectivity to existing base. Dramatically better base layouts than EA RA's random placement. The influence map is a fixed-size array in `AiScratch`, cleared and rebuilt on the building-placement schedule.

4. **Tick-gated evaluation** (from Generals/Petra/MicroRTS) — expensive decisions run infrequently, cheap ones run often. Defense response is near-instant (every tick, event-driven). Strategic reassessment is every 60 ticks (~2 seconds). This pattern appears in *every* surveyed project that handles 200+ units. See Performance Budget table below.

5. **Fuzzy engagement logic** (from OpenRA's `AttackOrFleeFuzzy`) — combat decisions use fuzzy membership functions over health ratio, relative DPS, and nearby ally strength, producing a continuous attack↔retreat score rather than a binary threshold. This avoids the "oscillating dance" where units alternate between attacking and fleeing at a hard HP boundary.

6. **Computation budget cap** (from MicroRTS) — `AiStrategy::tick_budget_hint()` (D041) returns a microsecond budget. The AI *must* return within this budget, even if evaluation is incomplete — partial results are better than frame stalls. The manager hierarchy makes this natural: if the budget is exhausted after `EconomyManager` and `ProductionManager`, `MilitaryManager` runs its cached plan from last evaluation.

#### Evaluation and Threat Assessment

The evaluation function is the foundation of all AI decision-making. A bad evaluation function makes every other component worse (MicroRTS research). Iron Curtain uses **Lanchester-inspired threat scoring**:

```
threat(army) = Σ(unit_dps × unit_hp) × count^0.7
```

This captures Lanchester's Square Law — military power scales superlinearly with unit count. Two tanks aren't twice as effective as one; they're ~1.6× as effective (at exponent 0.7, conservative vs. full Lanchester exponent of 2.0). The exponent is a YAML-tunable personality parameter, allowing presets to value army mass differently.

For evaluating damage taken against our own units:

```
value(unit) = unit_cost × sqrt(hp / max_hp) × 40
```

The `sqrt(hp/maxHP)` gives diminishing returns for overkill — killing a 10% HP unit is worth less than the same cost in fresh units. This is the MicroRTS `SimpleSqrtEvaluationFunction` pattern, validated across years of AI competition.

Both formulas use fixed-point arithmetic (integer math only, consistent with sim determinism).

#### Phase 5+ Enhancements

These techniques are explicitly deferred — the Phase 4 AI ships without them:

- **Strategy classification and adaptation:** Track opponent behavior patterns (build timing, unit composition, attack frequency). Classify into archetypes: "rush", "turtle", "boom", "all-in". Select counter-strategy from personality parameters. This is the MicroRTS Stratified Strategy Selection (SCV) pattern applied at RTS scale.
- **Active scouting system:** No surveyed project scouts well — opportunity to lead. Periodically send cheap units to explore unknown areas. Maintain "last seen" timestamps for enemy building locations in `AiState::ScoutingMemory`. Higher urgency when opponent is quiet (they're probably teching up).
- **Multi-pronged attacks:** Graduate from Petra/OpenRA's single-army-blob pattern. Split forces based on attack plan (main force + flanking/harassment force). Coordinate timing via shared countdown in `AiState`. The `AiEventLog` (D041) enables coordination visibility between sub-plans.
- **Advanced micro:** Kiting, focus-fire priority targeting, ability usage. Kept out of Phase 4 to avoid the "chasing optimal AI" anti-pattern.

#### What to Explicitly Not Do

Five anti-patterns identified from surveyed implementations (full analysis in `research/rts-ai-implementation-survey.md` §9):

1. **Don't implement MCTS/minimax for strategic decisions.** The search space is too large for 500+ unit games. MicroRTS research confirms: portfolio/script search beats raw MCTS at RTS scale. Reserve tree search for micro-scale decisions only (if at all).
2. **Don't use behavior trees for the strategic AI.** Every surveyed RTS uses priority cascades or manager hierarchies, not BTs. BTs add complexity without proven benefit at RTS strategic scale.
3. **Don't chase "optimal" AI at launch.** RA shipped with terrible AI and sold 10 million copies. The Remastered Collection shipped with the same terrible AI. Get a good-enough AI working, then iterate. Phase 4 target: "better than EA RA, comparable to OpenRA."
4. **Don't hardcode strategies.** Use YAML configuration (the personality model above) so modders and the difficulty system can tune behavior without code changes.
5. **Don't skip evaluation function design.** A bad evaluation function makes every other AI component worse. Invest time in getting threat assessment right (Lanchester scoring above) — it's the foundation everything else builds on.

#### AI Performance Budget

Based on the efficiency pyramid (D015) and surveyed projects' performance characteristics (see also `10-PERFORMANCE.md`):

| AI Component                   | Frequency             | Target Time | Approach                   |
| ------------------------------ | --------------------- | ----------- | -------------------------- |
| Harvester assignment           | Every 4 ticks         | < 0.1ms     | Nearest-resource lookup    |
| Defense response               | Every tick (reactive) | < 0.1ms     | Event-driven, not polling  |
| Unit production                | Every 8 ticks         | < 0.2ms     | Priority queue evaluation  |
| Building placement             | On demand             | < 1.0ms     | Influence map lookup       |
| Attack planning                | Every 30 ticks        | < 2.0ms     | Composition check + timing |
| Strategic reassessment         | Every 60 ticks        | < 5.0ms     | Full state evaluation      |
| **Total per tick (amortized)** |                       | **< 0.5ms** | **Budget for 500 units**   |

All AI working memory (influence maps, squad rosters, composition tallies, priority queues) is pre-allocated in `AiScratch` — analogous to `TickScratch` (Layer 5 of the efficiency pyramid). Zero per-tick heap allocation. Influence maps are fixed-size arrays, cleared and rebuilt on their evaluation schedule.

### Configuration Model

AI presets are YAML-driven, paralleling balance presets:

```yaml
# ai/presets/classic-ra.yaml
ai_preset:
  name: "Classic Red Alert"
  description: "Faithful recreation of original RA AI behavior"
  strategy: personality-driven     # AiStrategy implementation to use
  personality:
    aggression: 0.6
    tech_priority: rush
    micro_level: none              # no individual unit control
    scout_frequency: never
    build_order: scripted          # fixed build queues per faction
    expansion_style: base_walk     # builds structures adjacent to existing base
    focus_fire: false
    retreat_behavior: never        # units fight to the death
    adaptation: none               # doesn't change strategy based on opponent
    group_tactics: blob            # all units in one control group

# ai/presets/ic-default.yaml
ai_preset:
  name: "IC Default"
  description: "Research-informed AI with modern RTS intelligence"
  strategy: personality-driven
  personality:
    aggression: 0.5
    tech_priority: balanced
    micro_level: moderate          # focus-fire, kiting ranged units, retreat wounded
    scout_frequency: periodic      # sends scouts every 60-90 seconds
    build_order: adaptive          # adjusts build based on scouting information
    expansion_style: strategic     # expands to control resource nodes
    focus_fire: true
    retreat_behavior: wounded      # retreats units below 30% HP
    adaptation: reactive           # counters observed army composition
    group_tactics: multi_prong     # splits forces for flanking/harassment
    influence_maps: true           # uses influence maps for threat assessment
    harassment: true               # sends small squads to attack economy
```

### Relationship to Existing Decisions

- **D019 (balance presets):** Orthogonal. Balance defines *what units can do*; AI presets define *how the AI uses them*. A player can combine any balance preset with any AI preset. "Classic RA balance + IC Default AI" is valid and interesting.
- **D041 (`AiStrategy` trait):** AI presets are configurations for the default `PersonalityDrivenAi` strategy. The trait allows entirely different AI algorithms (neural net, GOAP planner); presets are parameter sets within one algorithm. Both coexist — presets for built-in AI, traits for custom AI.
- **D042 (`StyleDrivenAi`):** Player behavioral profiles are a fourth source of AI behavior (alongside Classic/OpenRA/IC Default presets). No conflict — `StyleDrivenAi` implements `AiStrategy` independently of presets.
- **D033 (QoL toggles / experience profiles):** AI preset selection integrates naturally into experience profiles. The "Classic Red Alert" experience profile bundles classic balance + classic AI + classic theme.

### Experience Profile Integration

```yaml
profiles:
  classic-ra:
    balance: classic
    ai_preset: classic-ra          # D043 — original RA AI behavior
    pathfinding: classic-ra        # D045 — original RA movement feel
    render_mode: classic           # D048 — original sprite rendering
    theme: classic
    qol: vanilla

  openra-ra:
    balance: openra
    ai_preset: openra
    pathfinding: openra            # D045 — OpenRA movement feel
    render_mode: classic           # D048
    theme: modern
    qol: openra

  iron-curtain-ra:
    balance: classic
    ai_preset: ic-default          # D043 — enhanced AI
    pathfinding: ic-default        # D045 — modern flowfield movement
    render_mode: hd                # D048 — high-definition sprites
    theme: modern
    qol: iron_curtain
```

### Lobby Integration

AI preset is selectable per AI player slot in the lobby, independent of game-wide balance preset:

```
Player 1: [Human]           Faction: Soviet
Player 2: [AI] IC Default (Hard)    Faction: Allied
Player 3: [AI] Classic RA (Normal)  Faction: Allied
Player 4: [AI] OpenRA (Brutal)      Faction: Soviet

Balance Preset: Classic RA
```

This allows mixed AI playstyles in the same game – useful for testing, fun for variety, and educational for understanding how different AI approaches handle the same scenario.

### Community AI Presets

Modders can create custom AI presets as Workshop resources (D030):

- YAML preset files defining `personality` parameters for `PersonalityDrivenAi`
- Full `AiStrategy` implementations via WASM Tier 3 mods (D041)
- AI tournament brackets: community members compete by submitting AI presets, tournament server runs automated matches

### Engine-Level Difficulty System

Inspired by 0 A.D.'s two-axis difficulty (engine cheats + behavioral parameters) and AoE2's strategic number scaling with opt-out (see `research/rts-ai-extensibility-survey.md`), Iron Curtain separates difficulty into two independent layers:

**Layer 1 — Engine scaling (applies to ALL AI players by default):**

The engine provides resource, build-time, and reaction-time multipliers that scale an AI's raw capability independent of how smart its decisions are. This ensures that even a simple YAML-configured AI can be made harder or easier without touching its behavioral parameters.

```yaml
# difficulties/built-in.yaml
difficulties:
  sandbox:
    name: "Sandbox"
    description: "AI barely acts — for learning the interface"
    engine_scaling:
      resource_gather_rate: 0.5     # AI gathers half speed (fixed-point: 512/1024)
      build_time_multiplier: 1.5    # AI builds 50% slower
      reaction_delay_ticks: 30      # AI waits 30 ticks (~1s) before acting on events
      vision_range_multiplier: 0.8  # AI sees 20% less
    personality_overrides:
      aggression: 0.1
      adaptation: none

  easy:
    name: "Easy"
    engine_scaling:
      resource_gather_rate: 0.8
      build_time_multiplier: 1.2
      reaction_delay_ticks: 8
      vision_range_multiplier: 1.0

  normal:
    name: "Normal"
    engine_scaling:
      resource_gather_rate: 1.0     # No modification
      build_time_multiplier: 1.0
      reaction_delay_ticks: 0
      vision_range_multiplier: 1.0

  hard:
    name: "Hard"
    engine_scaling:
      resource_gather_rate: 1.0     # No economic bonus
      build_time_multiplier: 1.0
      reaction_delay_ticks: 0
      vision_range_multiplier: 1.0
    # Hard is purely behavioral — the AI makes smarter decisions, not cheaper ones
    personality_overrides:
      micro_level: moderate
      adaptation: reactive

  brutal:
    name: "Brutal"
    engine_scaling:
      resource_gather_rate: 1.3     # AI gets 30% bonus
      build_time_multiplier: 0.8    # AI builds 20% faster
      reaction_delay_ticks: 0
      vision_range_multiplier: 1.2  # AI sees 20% further
    personality_overrides:
      aggression: 0.8
      micro_level: extreme
      adaptation: full
```

**Layer 2 — Implementation-level difficulty (per-`AiStrategy` impl):**

Each `AiStrategy` implementation interprets difficulty through its own behavioral parameters. `PersonalityDrivenAi` uses the `personality:` YAML config (aggression, micro level, adaptation). A neural-net AI might have a "skill cap" parameter. A GOAP planner might limit search depth. The `get_parameters()` method (from MicroRTS research) exposes these as introspectable knobs.

**Engine scaling opt-out** (from AoE2's `sn-do-not-scale-for-difficulty-level`): Sophisticated AI implementations that model difficulty internally can opt out of engine scaling by returning `false` from `uses_engine_difficulty_scaling()`. This prevents double-scaling — an advanced AI that already weakens its play at Easy difficulty shouldn't also get the engine's gather-rate penalty on top.

**Modder-addable difficulty levels:** Difficulty levels are YAML files, not hardcoded enums. Community modders can define new difficulties via Workshop (D030) — no code required (Tier 1):

```yaml
# workshop: community/nightmare-difficulty/difficulty.yaml
difficulty:
  name: "Nightmare"
  description: "Economy bonuses + perfect micro — for masochists"
  engine_scaling:
    resource_gather_rate: 2.0
    build_time_multiplier: 0.5
    reaction_delay_ticks: 0
    vision_range_multiplier: 1.5
  personality_overrides:
    aggression: 0.95
    micro_level: extreme
    adaptation: full
    harassment: true
    group_tactics: multi_prong
```

Once installed, "Nightmare" appears alongside built-in difficulties in the lobby dropdown. Any `AiStrategy` implementation (first-party or community) can be paired with any difficulty level — they compose independently.

### Mod-Selectable and Mod-Provided AI

The three built-in behavior presets (Classic RA, OpenRA, IC Default) are configurations for `PersonalityDrivenAi`. They are not the only `AiStrategy` implementations. The trait (D041) is explicitly open to community implementations — following the same pattern as `Pathfinder` (D013/D045) and render modes (D048).

**Two-axis lobby selection:**

In the lobby, each AI player slot has two independent selections:

1. **AI implementation** — which `AiStrategy` algorithm
2. **Difficulty level** — which engine scaling + personality config

```
Player 2: [AI] IC Default / Hard        Faction: Allied
Player 3: [AI] Classic RA / Normal      Faction: Allied
Player 4: [AI] Workshop: GOAP Planner / Brutal   Faction: Soviet
Player 5: [AI] Workshop: Neural Net v2 / Nightmare   Faction: Soviet

Balance Preset: Classic RA
```

This is different from pathfinders (one axis: which algorithm). AI has two orthogonal axes because *how smart the AI plays* and *what advantages it gets* are independent concerns. A "Brutal Classic RA" AI should play with original 1996 patterns but get economic bonuses and instant reactions; an "Easy IC Default" AI should use modern tactics but gather slowly and react late.

**Modder as consumer — selecting an AI:**

A mod's YAML manifest can declare which `AiStrategy` implementations it ships with or requires:

```yaml
# mod.yaml — total conversion with custom AI
mod:
  name: "Zero Hour Remake"
  ai_strategies:
    - goap-planner              # Requires this community AI
    - personality-driven        # Also supports the built-in default
  default_ai: goap-planner
  depends:
    - community/goap-planner-ai@^2.0
```

If the mod doesn't specify `ai_strategies`, all registered AI implementations are available.

**Modder as author — providing an AI:**

A Tier 3 WASM mod can implement the `AiStrategy` trait and register it:

```rust
// WASM mod: GOAP (Goal-Oriented Action Planning) AI
impl AiStrategy for GoapPlannerAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // 1. Update world model from FogFilteredView
        // 2. Evaluate goal priorities (expand? attack? defend? tech?)
        // 3. GOAP search: find action sequence to achieve highest-priority goal
        // 4. Emit orders for first action in plan
        // ...
    }

    fn name(&self) -> &str { "GOAP Planner" }
    fn difficulty(&self) -> AiDifficulty { AiDifficulty::Custom("adaptive".into()) }

    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        // Re-prioritize goals: if enemy spotted near base, defend goal priority increases
        self.goal_priorities.defend += self.threat_weight(unit_type);
    }

    fn on_under_attack(&mut self, _unit: EntityId, _attacker: EntityId) {
        // Emergency re-plan: abort current plan, switch to defense
        self.force_replan = true;
    }

    fn get_parameters(&self) -> Vec<ParameterSpec> {
        vec![
            ParameterSpec { name: "plan_depth".into(), min_value: 1, max_value: 10, default_value: 5, .. },
            ParameterSpec { name: "replan_interval".into(), min_value: 10, max_value: 120, default_value: 30, .. },
            ParameterSpec { name: "aggression_weight".into(), min_value: 0, max_value: 100, default_value: 50, .. },
        ]
    }

    fn uses_engine_difficulty_scaling(&self) -> bool { false } // handles difficulty internally
}
```

The mod registers its AI in its manifest:

```yaml
# goap_planner/mod.yaml
mod:
  name: "GOAP Planner AI"
  type: ai_strategy
  ai_strategy_id: goap-planner
  display_name: "GOAP Planner"
  description: "Goal-oriented action planning AI — plans multi-step strategies"
  wasm_module: goap_planner.wasm
  capabilities:
    read_visible_state: true
    issue_orders: true
  config:
    plan_depth: 5
    replan_interval_ticks: 30
```

**Workshop distribution:** Community AI implementations are Workshop resources (D030). They can be rated, reviewed, and depended upon — same as pathfinder mods. The Workshop can host AI tournament leaderboards: automated matches between community AI submissions, ranked by Elo/TrueSkill (inspired by BWAPI's SSCAIT and AoE2's AI ladder communities, see `research/rts-ai-extensibility-survey.md`).

**Multiplayer implications:** AI selection is NOT sim-affecting in the same way pathfinding is. In a human-vs-AI game, each AI player can run a different `AiStrategy` — they're independent agents. In AI-vs-AI tournaments, all AI players can be different. The engine doesn't need to validate that all clients have the same AI WASM module (unlike pathfinding). However, for determinism, the AI's `decide()` output must be identical on all clients — so the WASM binary hash IS validated per AI player slot.

### Relationship to Existing Decisions

- **D019 (balance presets):** Orthogonal. Balance defines *what units can do*; AI presets define *how the AI uses them*. A player can combine any balance preset with any AI preset. "Classic RA balance + IC Default AI" is valid and interesting.
- **D041 (`AiStrategy` trait):** AI behavior presets are configurations for the default `PersonalityDrivenAi` strategy. The trait allows entirely different AI algorithms (neural net, GOAP planner); presets are parameter sets within one algorithm. Both coexist — presets for built-in AI, traits for custom AI. The trait now includes event callbacks, parameter introspection, and engine scaling opt-out based on cross-project research.
- **D042 (`StyleDrivenAi`):** Player behavioral profiles are a fourth source of AI behavior (alongside Classic/OpenRA/IC Default presets). No conflict — `StyleDrivenAi` implements `AiStrategy` independently of presets.
- **D033 (QoL toggles / experience profiles):** AI preset selection integrates naturally into experience profiles. The "Classic Red Alert" experience profile bundles classic balance + classic AI + classic theme.
- **D045 (pathfinding presets):** Same modder-selectable pattern. Mods select or provide pathfinders; mods select or provide AI implementations. Both distribute via Workshop; both compose with experience profiles. Key difference: pathfinding is one axis (algorithm), AI is two axes (algorithm + difficulty).
- **D048 (render modes):** Same modder-selectable pattern. The trait-per-subsystem architecture means every pluggable system follows the same model: engine ships built-in implementations, mods can add more, players/modders pick what they want.

### Alternatives Considered

- AI difficulty only, no style presets (rejected — difficulty is orthogonal to style; a "Hard Classic RA" AI should be hard but still play like original RA, not like a modern AI turned up)
- One "best" AI only (rejected — the community is split like they are on balance; offer choice)
- Lua-only AI scripting (rejected — too slow for tick-level decisions; Lua is for mission triggers, WASM for full AI replacement)
- Difficulty as a fixed enum only (rejected — modders should be able to define new difficulty levels via YAML without code changes; AoE2's 20+ years of community AI prove that a large parameter space outlasts a restrictive one)
- No engine-level difficulty scaling (rejected — delegating difficulty entirely to AI implementations produces inconsistent experiences across different AIs; 0 A.D. and AoE2 both provide engine scaling with opt-out, proving this is the right separation of concerns)
- No event callbacks on `AiStrategy` (rejected — polling-only AI misses reactive opportunities; Spring Engine and BWAPI both use event + tick hybrid, which is the proven model)

---

---

## D044: LLM-Enhanced AI — Orchestrator and Experimental LLM Player

**Status:** Accepted
**Scope:** `ic-llm`, `ic-ai`, `ic-sim` (read-only)
**Phase:** LLM Orchestrator: Phase 7. LLM Player: Experimental, no scheduled phase.

### The Problem

D016 provides LLM integration for mission generation. D042 provides LLM coaching between games. But neither addresses LLM involvement *during* gameplay — using an LLM to influence or directly control AI decisions in real-time. Two distinct use cases exist:

1. **Enhancing existing AI** — an LLM advisor that reads game state and nudges a conventional AI toward better strategic decisions, without replacing the tick-level execution
2. **Full LLM control** — an experimental mode where an LLM makes every decision, exploring whether modern language models can play RTS games competently

### Decision

Define two new `AiStrategy` implementations (D041) for LLM-integrated gameplay:

### 1. LLM Orchestrator (`LlmOrchestratorAi`)

Wraps any existing `AiStrategy` implementation (D041) and periodically consults an LLM for high-level strategic guidance. The inner AI handles tick-level execution; the LLM provides strategic direction.

```rust
/// Wraps an existing AiStrategy with LLM strategic oversight.
/// The inner AI makes tick-level decisions; the LLM provides
/// periodic strategic guidance that the inner AI incorporates.
pub struct LlmOrchestratorAi {
    inner: Box<dyn AiStrategy>,         // the AI that actually issues orders
    provider: Box<dyn LlmProvider>,     // D016 BYOLLM
    consultation_interval: u64,         // ticks between LLM consultations
    last_consultation: u64,
    current_plan: Option<StrategicPlan>,
    event_log: AiEventLog,              // D041 — fog-filtered event accumulator
}
```

**How it works:**

```
Every N ticks (configurable, default ~300 = ~10 seconds at 30 tick/s):
  1. Serialize visible game state into a structured prompt:
     - Own base layout, army composition, resource levels
     - Known enemy positions, army composition estimate
     - Current strategic plan (if any)
     - event_log.to_narrative(last_consultation) — fog-filtered event chronicle
  2. Send prompt to LlmProvider (D016)
  3. LLM returns a StrategicPlan:
     - Priority targets (e.g., "attack enemy expansion at north")
     - Build focus (e.g., "switch to anti-air production")
     - Economic guidance (e.g., "expand to second ore field")
     - Risk assessment (e.g., "enemy likely to push soon, fortify choke")
  4. Translate StrategicPlan into inner AI parameter adjustments via set_parameter()
     (e.g., "switch to anti-air" → set_parameter("tech_priority_aa", 80))
  5. Record plan change as StrategicUpdate event in event_log
  6. Inner AI incorporates guidance into its normal tick-level decisions

Between consultations:
  - Inner AI runs normally, using the last parameter adjustments as guidance
  - Tick-level micro, build queue management, unit control all handled by inner AI
  - No LLM latency in the hot path
  - Events continue accumulating in event_log for the next consultation
```

**Event log as LLM context (D041 integration):**

The `AiEventLog` (defined in D041) is the bridge between simulation events and LLM understanding. The orchestrator accumulates fog-filtered events from the D041 callback pipeline — `on_enemy_spotted`, `on_under_attack`, `on_unit_destroyed`, etc. — and serializes them into a natural-language narrative via `to_narrative(since_tick)`. This narrative is the "inner game event log / action story / context" the LLM reads to understand what happened since its last consultation.

The event log is **fog-filtered by construction** — all events originate from the same fog-filtered callback pipeline that respects `FogFilteredView`. The LLM never receives information about actions behind fog of war, only events the AI player is supposed to be aware of. This is an architectural guarantee, not a filtering step that could be bypassed.

**Event callback forwarding:**

The orchestrator implements all D041 event callbacks by forwarding to both the inner AI and the event log:

```rust
impl AiStrategy for LlmOrchestratorAi {
    fn decide(&mut self, player: PlayerId, view: &FogFilteredView, tick: u64) -> Vec<PlayerOrder> {
        // Check if it's time for an LLM consultation
        if tick - self.last_consultation >= self.consultation_interval {
            self.consult_llm(player, view, tick);
        }
        // Delegate tick-level decisions to the inner AI
        self.inner.decide(player, view, tick)
    }

    fn on_enemy_spotted(&mut self, unit: EntityId, unit_type: &str) {
        self.event_log.push(AiEventEntry {
            tick: self.current_tick,
            event_type: AiEventType::EnemySpotted,
            description: format!("Enemy {} spotted", unit_type),
            entity: Some(unit),
            related_entity: None,
        });
        self.inner.on_enemy_spotted(unit, unit_type);  // forward to inner AI
    }

    fn on_under_attack(&mut self, unit: EntityId, attacker: EntityId) {
        self.event_log.push(/* ... */);
        self.inner.on_under_attack(unit, attacker);
    }

    // ... all other callbacks follow the same pattern:
    // 1. Record in event_log  2. Forward to inner AI

    fn name(&self) -> &str { "LLM Orchestrator" }
    fn difficulty(&self) -> AiDifficulty { self.inner.difficulty() }
    fn tick_budget_hint(&self) -> Option<u64> { self.inner.tick_budget_hint() }

    // Delegate parameter introspection — expose orchestrator params + inner AI params
    fn get_parameters(&self) -> Vec<ParameterSpec> {
        let mut params = vec![
            ParameterSpec {
                name: "consultation_interval".into(),
                description: "Ticks between LLM consultations".into(),
                min_value: 30, max_value: 3000,
                default_value: 300, current_value: self.consultation_interval as i32,
            },
        ];
        // Include inner AI's parameters (prefixed for clarity)
        params.extend(self.inner.get_parameters());
        params
    }

    fn set_parameter(&mut self, name: &str, value: i32) {
        match name {
            "consultation_interval" => self.consultation_interval = value as u64,
            _ => self.inner.set_parameter(name, value),  // delegate to inner AI
        }
    }

    // Delegate engine scaling to inner AI — the orchestrator adds LLM guidance,
    // difficulty scaling applies to the underlying AI that executes orders
    fn uses_engine_difficulty_scaling(&self) -> bool {
        self.inner.uses_engine_difficulty_scaling()
    }
}
```

**How StrategicPlan reaches the inner AI:**

The orchestrator translates `StrategicPlan` fields into `set_parameter()` calls on the inner AI (D041). For example:
- "Switch to anti-air production" → `set_parameter("tech_priority_aa", 80)`
- "Be more aggressive" → `set_parameter("aggression", 75)`
- "Expand to second ore field" → `set_parameter("expansion_priority", 90)`

This uses D041's existing parameter introspection infrastructure — no new trait methods needed. The inner AI's `get_parameters()` exposes its tunable knobs; the LLM's strategic output maps to those knobs. An inner AI that doesn't expose relevant parameters simply ignores guidance it can't act on — the orchestrator degrades gracefully.

**Key design points:**
- **No latency impact on gameplay.** LLM consultation is async — fires off a request, continues with the previous plan until the response arrives. If the LLM is slow (or unavailable), the inner AI plays normally.
- **BYOLLM (D016).** Same provider system — users configure their own model. Local models (Ollama) give lowest latency; cloud APIs work but add ~1-3s round-trip per consultation.
- **Determinism maintained.** In multiplayer, the LLM runs on exactly one machine (the AI slot owner's client). The resulting `StrategicPlan` is submitted as an order through the `NetworkModel` — the same path as human player orders. Other clients never run the LLM; they receive and apply the same plan at the same deterministic tick boundary. In singleplayer, determinism is trivially preserved (orders are recorded in the replay, not LLM calls).
- **Inner AI is any `AiStrategy`.** Orchestrator wraps IC Default, Classic RA, a community WASM AI (D043), or even a `StyleDrivenAi` (D042). The LLM adds strategic thinking on top of whatever execution style is underneath. Because the orchestrator communicates through the generic `AiStrategy` trait (event callbacks + `set_parameter()`), it works with any implementation — including community-provided WASM AI mods.
- **Two-axis difficulty compatibility (D043).** The orchestrator delegates `difficulty()` and `uses_engine_difficulty_scaling()` to the inner AI. Engine-level difficulty scaling (resource bonuses, reaction delays) applies to the inner AI's execution; the LLM consultation frequency and depth are separate parameters exposed via `get_parameters()`. In the lobby, players select the inner AI + difficulty normally, then optionally enable LLM orchestration on top.
- **Observable.** The current `StrategicPlan` and the event log narrative are displayed in a debug overlay (developer/spectator mode), letting players see the LLM's "thinking" and the events that informed it.
- **Prompt engineering is in YAML.** Prompt templates are mod-data, not hardcoded. Modders can customize LLM prompts for different game modules or scenarios.

```yaml
# llm/prompts/orchestrator.yaml
orchestrator:
  system_prompt: |
    You are a strategic advisor for a Red Alert AI player.
    Analyze the game state and provide high-level strategic guidance.
    Do NOT issue specific unit orders — your AI subordinate handles execution.
    Focus on: what to build, where to expand, when to attack, what threats to prepare for.
  response_format:
    type: structured
    schema: StrategicPlan
  consultation_interval_ticks: 300
  max_tokens: 500
```

### 2. LLM Player (`LlmPlayerAi`) — Experimental

A fully LLM-driven player where the language model makes every decision. No inner AI — the LLM receives game state and emits player orders directly. This is the "LLM makes every small decision" path — the architecture supports it through the same `AiStrategy` trait and `AiEventLog` infrastructure as the orchestrator.

```rust
/// Experimental: LLM makes all decisions directly.
/// Every N ticks, the LLM receives game state and returns orders.
/// Performance and quality depend entirely on the LLM model and latency.
pub struct LlmPlayerAi {
    provider: Box<dyn LlmProvider>,
    decision_interval: u64,           // ticks between LLM decisions
    pending_orders: Vec<PlayerOrder>, // buffered orders from last LLM response
    order_cursor: usize,              // index into pending_orders for drip-feeding
    event_log: AiEventLog,            // D041 — fog-filtered event accumulator
}
```

**How it works:**
- Every N ticks, serialize `FogFilteredView` + `event_log.to_narrative(last_decision_tick)` → send to LLM → receive a batch of `PlayerOrder` values
- The event log narrative gives the LLM a chronological understanding of what happened — "what has been going on in this game" — rather than just a snapshot of current state
- Between decisions, drip-feed buffered orders to the sim (one or few per tick)
- If the LLM response is slow, the player idles (no orders until response arrives)
- Event callbacks continue accumulating into the event log between LLM decisions, building a richer narrative for the next consultation

**Why the event log matters for full LLM control:**

The LLM Player receives `FogFilteredView` (current game state) AND `AiEventLog` (recent game history). Together these give the LLM:
- **Spatial awareness** — what's where right now (from `FogFilteredView`)
- **Temporal awareness** — what happened recently (from the event log narrative)
- **Causal understanding** — "I was attacked from the north, my refinery was destroyed, I spotted 3 enemy tanks" forms a coherent story the LLM can reason about

Without the event log, the LLM would see only a static snapshot every N ticks, with no continuity between decisions. The log bridges decisions into a narrative that LLMs are natively good at processing.

**Why this is experimental:**
- **Latency.** Even local LLMs take 100-500ms per response. A 30 tick/s sim expects decisions every 33ms. The LLM Player will always be slower than a conventional AI.
- **Quality ceiling.** Current LLMs struggle with spatial reasoning and precise micro. The LLM Player will likely lose to even Easy conventional AI in direct combat efficiency.
- **Cost.** Cloud LLMs charge per token. A full game might generate thousands of consultations. Local models are free but slower.
- **The value is educational and entertaining**, not competitive. Watching an LLM try to play Red Alert — making mistakes, forming unexpected strategies, explaining its reasoning — is intrinsically interesting. Community streaming of "GPT vs. Claude playing Red Alert" is a content opportunity.

**Design constraints:**
- **Never the default.** LLM Player is clearly labeled "Experimental" in the lobby.
- **Not allowed in ranked.** LLM AI modes are excluded from competitive matchmaking.
- **Observable.** The LLM's reasoning text and event log narrative are capturable as a spectator overlay, enabling commentary-style viewing.
- **Same BYOLLM infrastructure.** Uses `LlmProvider` trait (D016), same configuration, same provider options.
- **Two-axis difficulty compatibility (D043).** Engine-level difficulty scaling (resource bonuses, reaction delays) applies normally — `uses_engine_difficulty_scaling()` returns `true`. The LLM's "skill" is inherent in the model's capability and prompt engineering, not in engine parameters. `get_parameters()` exposes LLM-specific knobs: decision interval, max tokens, model selection, prompt template — but the LLM's quality is ultimately model-dependent, not engine-controlled. This is an honest design: we don't pretend to make the LLM "harder" or "easier" through engine scaling, but we do let the engine give it economic advantages or handicaps.
- **Determinism:** The LLM runs on one machine (the AI slot owner's client) and submits orders through the `NetworkModel`, just like human input. All clients apply the same orders at the same deterministic tick boundaries. The LLM itself is non-deterministic (different responses per run), but that non-determinism is resolved before orders enter the sim — the sim only sees deterministic order streams. Replays record orders (not LLM calls), so replay playback is fully deterministic.

### Relationship to D041/D043 — Integration Summary

The LLM AI modes build entirely on the `AiStrategy` trait (D041) and the two-axis difficulty system (D043):

| Concern                             | Orchestrator                                                                                   | LLM Player                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Implements `AiStrategy`?            | Yes — wraps an inner `AiStrategy`                                                              | Yes — direct implementation                                 |
| Uses `AiEventLog`?                  | Yes — accumulates events for LLM prompts, forwards callbacks to inner AI                       | Yes — accumulates events for LLM self-context               |
| `FogFilteredView`?                  | Yes — serialized into LLM prompt alongside event narrative                                     | Yes — serialized into LLM prompt                            |
| Event callbacks?                    | Forwards to inner AI + records in event log                                                    | Records in event log for next LLM consultation              |
| `set_parameter()`?                  | Exposes orchestrator params + delegates to inner AI; translates LLM plans to param adjustments | Exposes LLM-specific params (decision_interval, max_tokens) |
| `get_parameters()`?                 | Returns orchestrator params + inner AI's params                                                | Returns LLM Player params                                   |
| `uses_engine_difficulty_scaling()`? | Delegates to inner AI                                                                          | Returns `true` (engine bonuses/handicaps apply)             |
| `difficulty()`?                     | Delegates to inner AI                                                                          | Returns selected difficulty (user picks in lobby)           |
| Two-axis difficulty?                | Inner AI axis applies to execution; orchestrator params are separate                           | Engine scaling applies; LLM quality is model-dependent      |

The critical architectural property: **neither LLM AI mode introduces any new trait methods, crate dependencies, or sim-layer concepts.** They compose entirely from existing infrastructure — `AiStrategy`, `AiEventLog`, `FogFilteredView`, `set_parameter()`, `LlmProvider`. This means the LLM AI path doesn't constrain or complicate the non-LLM AI path. A modder who never uses LLM features is completely unaffected.

### Future Path: Full LLM Control at Scale

The current `LlmPlayerAi` is limited by latency (LLM responses take 100-500ms vs. 33ms sim ticks) and spatial reasoning capability. As LLM inference speeds improve and models gain better spatial/numerical reasoning, the same architecture scales:
- Faster models → lower `decision_interval` → more responsive LLM play
- Better spatial reasoning → LLM can handle micro, not just strategy
- Multimodal models → render a minimap image as additional LLM context alongside the event narrative
- The `AiStrategy` trait, `AiEventLog`, and `FogFilteredView` infrastructure are all model-agnostic — they serve whatever LLM capability exists at runtime

The architecture is deliberately designed not to stand in the way of full LLM control becoming practical. Every piece needed for "LLM makes every small decision" already exists in the trait design — the only bottleneck is LLM speed and quality, which are external constraints that improve over time.

### Crate Boundaries

| Component                     | Crate    | Reason                                                         |
| ----------------------------- | -------- | -------------------------------------------------------------- |
| `LlmOrchestratorAi` struct    | `ic-ai`  | AI strategy implementation                                     |
| `LlmPlayerAi` struct          | `ic-ai`  | AI strategy implementation                                     |
| `StrategicPlan` type          | `ic-ai`  | AI-internal data structure                                     |
| `AiEventLog` struct           | `ic-ai`  | Engine-provided event accumulator (D041 design, `ic-ai` impl)  |
| `LlmProvider` trait           | `ic-llm` | Existing D016 infrastructure                                   |
| Prompt templates (YAML)       | mod data | Game-module-specific, moddable                                 |
| Game state serializer for LLM | `ic-ai`  | Reads sim state (read-only), formats for LLM prompts           |
| Debug overlay (plan viewer)   | `ic-ui`  | Spectator/dev UI for observing LLM reasoning + event narrative |

### Alternatives Considered

- LLM replaces inner AI entirely in orchestrator mode (rejected — latency makes tick-level LLM control impractical; hybrid is better)
- LLM operates between games only (rejected — D042 already covers between-game coaching; real-time guidance is the new capability)
- No LLM Player mode (rejected — the experimental mode has minimal implementation cost and high community interest/entertainment value)
- LLM in the sim crate (rejected — violates BYOLLM optionality; `ic-ai` imports `ic-llm` optionally, `ic-sim` never imports either)
- New trait method `set_strategic_guidance()` for LLM → inner AI communication (rejected — `set_parameter()` already provides the mechanism; adding an LLM-specific method to the generic `AiStrategy` trait would couple the trait to an optional feature)
- Custom event log per AI instead of engine-provided `AiEventLog` (rejected — the log benefits all AI implementations for debugging/observation, not just LLM; making it engine infrastructure avoids redundant implementations)

### Relationship to Existing Decisions

- **D016 (BYOLLM):** Same provider infrastructure. Both LLM AI modes use `LlmProvider` trait for model access.
- **D041 (`AiStrategy` trait):** Both modes implement `AiStrategy`. The orchestrator wraps any `AiStrategy` via the generic trait. Both use `AiEventLog` (D041) for fog-filtered event accumulation. The orchestrator communicates with the inner AI through `set_parameter()` and event callback forwarding — all D041 infrastructure.
- **D042 (`StyleDrivenAi`):** The orchestrator can wrap `StyleDrivenAi` — LLM strategic guidance on top of a mimicked player's style. The `AiEventLog` serves both D042 (profile building reads events) and D044 (LLM reads events).
- **D043 (AI presets + two-axis difficulty):** LLM AI integrates with the two-axis difficulty system. Orchestrator delegates difficulty to inner AI; LLM Player accepts engine scaling. Users select inner AI + difficulty in the lobby, then optionally enable LLM orchestration.
- **D031 (telemetry):** The `GameplayEvent` stream (D031) feeds the fog-filtered callback pipeline that populates `AiEventLog`. D031 is the raw data source; D041 callbacks are the filtered AI-facing interface; `AiEventLog` is the accumulated narrative.
- **D034 (SQLite):** LLM consultation history (prompts sent, plans received, execution outcomes) stored in SQLite for debugging and quality analysis. No new tables required — uses the existing `gameplay_events` schema with LLM-specific event types.
- **D057 (Skill Library):** The orchestrator is the primary producer and consumer of AI strategy skills. Proven `StrategicPlan` outputs are stored in the skill library; future consultations retrieve relevant skills as few-shot prompt context. See D057 for the full verification→storage→retrieval loop.

---

---

## D045: Pathfinding Behavior Presets — Movement Feel

**Status:** Accepted
**Scope:** `ic-sim`, game module configuration
**Phase:** Phase 2 (ships with simulation)

### The Problem

D013 provides the `Pathfinder` trait for pluggable pathfinding *algorithms* (multi-layer hybrid vs. navmesh). D019 provides switchable *balance* values. But movement *feel* — how units navigate, group, avoid each other, and handle congestion — varies dramatically between Classic RA, OpenRA, and what modern pathfinding research enables. This is partially balance (unit speed values) but mostly *behavioral*: how the pathfinder handles collisions, how units merge into formations, how traffic jams resolve, and how responsive movement commands feel.

### Decision

Ship **pathfinding behavior presets** as separate `Pathfinder` trait implementations (D013), each sourced from the codebase it claims to reproduce. Presets are selectable alongside balance presets (D019) and AI presets (D043), bundled into experience profiles, and presented through progressive disclosure so casual players never see the word "pathfinding."

### Built-In Presets

| Preset         | Movement Feel                                                                                                                                                                 | Source                                             | `Pathfinder` Implementation |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| **Classic RA** | Unit-level A*-like pathing, units block each other, congestion causes jams, no formation movement, units take wide detours around obstacles                                   | EA Remastered Collection source code (GPL v3)      | `RemastersPathfinder`       |
| **OpenRA**     | Improved cell-based pathing, basic crush/push logic, units attempt to flow around blockages, locomotor-based speed modifiers, no formal formations                            | OpenRA pathfinding implementation (GPL v3)         | `OpenRaPathfinder`          |
| **IC Default** | Multi-layer hybrid: hierarchical sectors for routing, JPS for small groups, flow field tiles for mass movement, ORCA-lite local avoidance, formation-aware group coordination | Open-source RTS research + IC original (see below) | `IcPathfinder`              |

Each preset is a **distinct `Pathfinder` trait implementation**, not a parameterized variant of one algorithm. The Remastered pathfinder and OpenRA pathfinder use fundamentally different algorithms and produce fundamentally different movement behavior — parameterizing one to emulate the other would be an approximation at best and a lie at worst. The `Pathfinder` trait (D013) was designed for exactly this: slot in different implementations without touching sim code.

**Why "IcPathfinder," not "IcFlowfieldPathfinder"?** Research revealed that no shipped RTS engine uses pure flowfields (except SupCom2/PA by the same team). Spring Engine tried flow maps and abandoned them. Independent developers (jdxdev) documented the same "ant line" failure with 100+ units. IC's default pathfinder is a multi-layer hybrid — flowfield tiles are one layer activated for large groups, not the system's identity. See `research/pathfinding-ic-default-design.md` for full architecture.

**Why Remastered, not original RA source?** The Remastered Collection engine DLLs (GPL v3) contain the same pathfinding logic as original RA but with bug fixes and modernized C++ that's easier to port to Rust. The original RA source is also GPL and available for cross-reference. Both produce the same movement feel — the Remastered version is simply a cleaner starting point.

### IC Default Pathfinding — Research Foundation

The IC Default preset (`IcPathfinder`) is a five-layer hybrid architecture synthesizing pathfinding approaches from across the open-source RTS ecosystem and academic research. Full design: `research/pathfinding-ic-default-design.md`.

**Layer 1 — Cost Field & Passability:** Per-cell movement cost (u8, 1–255) per locomotor type, inspired by EA Remastered terrain cost tables and 0 A.D.'s passability classes.

**Layer 2 — Hierarchical Sector Graph:** Map divided into 32×32-cell sectors with portal connections between them. Flood-fill domain IDs for O(1) reachability checks. Inspired by OpenRA's hierarchical abstraction and HPA* research.

**Layer 3 — Adaptive Detailed Pathfinding:** JPS (Jump Point Search) for small groups (<8 units) — 10–100× faster than A* on uniform-cost grids. Flow field tiles for mass movement (≥8 units sharing a destination). Weighted A* fallback for non-uniform terrain. LRU flow field cache. Inspired by 0 A.D.'s JPS, SupCom2's flow field tiles, Game AI Pro 2's JPS+ precomputed tables.

**Layer 4 — ORCA-lite Local Avoidance:** Fixed-point deterministic collision avoidance based on RVO2/ORCA (Reciprocal Velocity Obstacles). Commitment locking prevents hallway dance. Cooperative side selection ("mind reading") from HowToRTS research.

**Layer 5 — Group Coordination:** Formation offset assignment, synchronized arrival, chokepoint compression. Inspired by jdxdev's boids-for-RTS formation offsets and Spring Engine's group movement.

**Source engines studied:**
- **EA Remastered Collection** (GPL v3) — obstacle-tracing, terrain cost tables, integer math
- **OpenRA** (GPL v3) — hierarchical A*, custom search graph with 10×10 abstraction
- **Spring Engine** (GPL v2) — QTPFS quadtree, flow-map attempt (abandoned), unit push/slide
- **0 A.D.** (GPL v2/MIT) — JPS long-range + vertex short-range, clearance-based sizing, fixed-point `CFixed_15_16`
- **Warzone 2100** (GPL v2) — A* with LRU context caching, gateway optimization
- **SupCom2/PA** — flow field tiles (only shipped flowfield RTS)
- **Academic** — RVO2/ORCA (UNC), HPA*, continuum crowds (Treuille et al.), JPS+ (Game AI Pro 2)

### Configuration Model

Each `Pathfinder` implementation exposes its own tunable parameters via YAML. Parameters differ between implementations because they control fundamentally different algorithms — there is no shared "pathfinding config" struct that applies to all three.

```yaml
# pathfinding/remastered.yaml — RemastersPathfinder tunables
remastered_pathfinder:
  name: "Classic Red Alert"
  description: "Movement feel matching the original game"
  # These are behavioral overrides on the Remastered pathfinder.
  # Defaults reproduce original behavior exactly.
  harvester_stuck_fix: false         # true = apply minor QoL fix for harvesters stuck on each other
  bridge_queue_behavior: original    # original | relaxed (slightly wider queue threshold)
  infantry_scatter_pattern: original # original | smoothed (less jagged scatter on damage)

# pathfinding/openra.yaml — OpenRaPathfinder tunables
openra_pathfinder:
  name: "OpenRA"
  description: "Movement feel matching OpenRA's pathfinding"
  locomotor_speed_modifiers: true    # per-terrain speed multipliers (OpenRA feature)
  crush_logic: true                  # vehicles can crush infantry
  blockage_flow: true                # units attempt to flow around blocking units

# pathfinding/ic-default.yaml — IcPathfinder tunables
ic_pathfinder:
  name: "IC Default"
  description: "Multi-layer hybrid: JPS + flow field tiles + ORCA-lite avoidance"

  # Layer 2 — Hierarchical sectors
  sector_size: 32                    # cells per sector side
  portal_max_width: 8                # max portal opening (cells)

  # Layer 3 — Adaptive pathfinding
  flowfield_group_threshold: 8       # units sharing dest before flowfield activates
  flowfield_cache_size: 64           # LRU cache entries for flow field tiles
  jps_enabled: true                  # JPS for small groups on uniform terrain
  repath_frequency: adaptive         # low | medium | high | adaptive

  # Layer 4 — Local avoidance (ORCA-lite)
  avoidance_radius_multiplier: 1.2   # multiplier on unit collision radius
  commitment_frames: 4               # frames locked into avoidance direction
  cooperative_avoidance: true        # "mind reading" side selection

  # Layer 5 — Group coordination
  formation_movement: true           # groups move in formation
  synchronized_arrival: true         # units slow down to arrive together
  chokepoint_compression: true       # formation compresses at narrow passages

  # General
  path_smoothing: funnel             # none | funnel | spline
  influence_avoidance: true          # avoid areas with high enemy threat
```

Power users can override any parameter in the lobby's advanced settings or in mod YAML. Casual players never see these — they pick an experience profile and the correct implementation + parameters are selected automatically.

### Sim-Affecting Nature

Pathfinding presets are **sim-affecting** — they change how the deterministic simulation resolves movement. Like balance presets (D019):

- All players in a multiplayer game must use the same pathfinding preset (enforced by lobby, validated by sim)
- Preset selection is part of the game configuration hash for desync detection
- Replays record the active pathfinding preset

### Experience Profile Integration

```yaml
profiles:
  classic-ra:
    balance: classic
    ai_preset: classic-ra
    pathfinding: classic-ra          # NEW — movement feel
    theme: classic
    qol: vanilla

  openra-ra:
    balance: openra
    ai_preset: openra
    pathfinding: openra              # NEW — OpenRA movement feel
    theme: modern
    qol: openra

  iron-curtain-ra:
    balance: classic
    ai_preset: ic-default
    pathfinding: ic-default          # NEW — modern movement
    theme: modern
    qol: iron_curtain
```

### User-Facing UX — Progressive Disclosure

Pathfinding selection follows the same progressive disclosure pyramid as the rest of the experience profile system. A casual player should never encounter the word "pathfinding."

**Level 1 — One dropdown (casual player):** The lobby's experience profile selector offers "Classic RA," "OpenRA," or "Iron Curtain." Picking one sets balance, theme, QoL, AI, movement feel, AND render mode. The pathfinder and render mode selections are invisible — they're bundled. A player who picks "Classic RA" gets Remastered pathfinding and classic pixel art because that's what Classic RA *is*.

**Level 2 — Per-axis override (intermediate player):** An "Advanced" toggle in the lobby expands the experience profile into its 6 independent axes. The movement axis is labeled by feel, not algorithm: "Movement: Classic / OpenRA / Modern" — not "`RemastersPathfinder` / `OpenRaPathfinder` / `IcPathfinder`." The render mode axis shows "Graphics: Classic / HD / 3D" (D048). The player can mix "OpenRA balance + Classic movement + HD graphics" if they want.

**Level 3 — Parameter tuning (power user / modder):** A gear icon next to the movement axis opens implementation-specific parameters (see Configuration Model above). This is where harvester stuck fixes, pressure diffusion strength, and formation toggles live.

### Scenario-Required Pathfinding

Scenarios and campaign missions can specify a **required** or **recommended** pathfinding preset in their YAML metadata:

```yaml
scenario:
  name: "Bridge Assault"
  pathfinding:
    required: classic-ra    # this mission depends on chokepoint blocking behavior
    reason: "Mission balance depends on single-file bridge queuing"
```

When the lobby loads this scenario, it auto-selects the required pathfinder and shows the player why: "This scenario requires Classic movement (mission balance depends on chokepoint behavior)." The player cannot override a `required` setting. A `recommended` setting auto-selects but allows override with a warning.

This preserves original campaign missions. A mission designed around units jamming at a bridge works correctly because it ships with `required: classic-ra`. A modern community scenario can ship with `required: ic-default` to ensure smooth flowfield behavior.

### Mod-Selectable and Mod-Provided Pathfinders

The three built-in presets are the **first-party** `Pathfinder` implementations. They are not the only ones. The `Pathfinder` trait (D013) is explicitly open to community implementations.

**Modder as consumer — selecting a pathfinder:**

A mod's YAML manifest can declare which pathfinder it uses. The modder picks from any available implementation — first-party or community:

```yaml
# mod.yaml — total conversion mod that uses IC's modern pathfinding
mod:
  name: "Desert Strike"
  pathfinder: ic-default            # Use IC's multi-layer hybrid
  # Or: remastered, openra, layered-grid-generals, community/navmesh-pro, etc.
```

If the mod doesn't specify a pathfinder, it inherits whatever the player's experience profile selects. When specified, it overrides the experience profile's pathfinding axis — the same way `scenario.pathfinding.required` works (see "Scenario-Required Pathfinding" above), but at the mod level.

**Modder as author — providing a pathfinder:**

A Tier 3 WASM mod can implement the `Pathfinder` trait and register it as a new option:

**Host ABI note:** The Rust trait-style example below is **conceptual**. A WASM pathfinder does not share a native Rust trait object directly with the engine. In implementation, the engine exposes a stable host ABI and adapts the WASM exports to the `Pathfinder` trait on the host side.

```rust
// WASM mod: custom pathfinder (e.g., Generals-style layered grid)
impl Pathfinder for LayeredGridPathfinder {
    fn request_path(&mut self, origin: WorldPos, dest: WorldPos, locomotor: LocomotorType) -> PathId {
        // Surface bitmask check, zone reachability, A* with bridge layers
        // ...
    }
    fn get_path(&self, id: PathId) -> Option<&[WorldPos]> { /* ... */ }
    fn is_passable(&self, pos: WorldPos, locomotor: LocomotorType) -> bool { /* ... */ }
    fn invalidate_area(&mut self, center: WorldPos, radius: SimCoord) { /* ... */ }
}
```

The mod registers its pathfinder in its manifest with a YAML config block (like the built-in presets):

```yaml
# mod.yaml — community pathfinder distributed via Workshop
mod:
  name: "Generals Pathfinder"
  type: pathfinder                   # declares this mod provides a Pathfinder impl
  pathfinder_id: layered-grid-generals
  display_name: "Generals (Layered Grid)"
  description: "Grid pathfinding with bridge layers and surface bitmasks, inspired by C&C Generals"
  wasm_module: generals_pathfinder.wasm
  config:
    zone_block_size: 10
    bridge_clearance: 10.0
    surface_types: [ground, water, cliff, air, rubble]
```

Once installed, the community pathfinder appears alongside first-party presets in the lobby's Level 2 per-axis override ("Movement: Classic / OpenRA / Modern / Generals") and is selectable by other mods via `pathfinder: layered-grid-generals`.

**Workshop distribution:** Community pathfinders are Workshop resources (D030) like any other mod. They can be rated, reviewed, and depended upon. A total conversion mod declares `depends: community/generals-pathfinder@^1.0` and the engine auto-downloads it on lobby join (same as CS:GO-style auto-download).

**Sim-affecting implications:** Because pathfinding is deterministic and sim-affecting, all players in a multiplayer game must use the same pathfinder. A community pathfinder is synced like a first-party preset — the lobby validates that all clients have the same pathfinder WASM module (by SHA-256 hash), same config, same version.

### WASM Pathfinder Policy (Determinism, Performance, Ranked)

Community pathfinders are allowed, but they are not a free-for-all in every mode:

- **Single-player / skirmish / custom lobbies:** allowed by default (subject to normal WASM sandbox rules)
- **Ranked queues / competitive ladders:** disallowed by default unless a queue/community explicitly certifies and whitelists the pathfinder (hash + version + config schema)
- **Determinism contract:** no wall-clock time, no nondeterministic RNG, no filesystem/network I/O, no host APIs that expose machine-specific timing/order
- **Performance contract:** pathfinder modules must declare budget expectations and pass deterministic conformance + performance checks (`ic mod test`, `ic mod perf-test`) on the baseline hardware tier before certification
- **Failure policy:** if a pathfinder module fails validation/loading/perf certification for a ranked queue, the lobby rejects the configuration before match start (never mid-match fail-open)

This preserves D013's openness for experimentation while protecting ranked integrity, baseline hardware support, and deterministic simulation guarantees.

### Relationship to Existing Decisions

- **D013 (`Pathfinder` trait):** Each preset is a separate `Pathfinder` trait implementation. `RemastersPathfinder`, `OpenRaPathfinder`, and `IcPathfinder` are all registered by the RA1 game module. Community mods add more via WASM. The trait boundary serves triple duty: it separates algorithmic families (grid vs. navmesh), behavioral families (Classic vs. Modern), AND first-party from community-provided implementations.
- **D018 (`GameModule` trait):** The RA1 game module ships all three first-party pathfinder implementations. Community pathfinders are registered by the mod loader alongside them. The lobby's experience profile selection determines which one is active — `fn pathfinder()` returns whichever `Box<dyn Pathfinder>` was selected, whether first-party or community.
- **D019 (balance presets):** Parallel concept. Balance = what units can do. Pathfinding = how they get there. Both are sim-affecting, synced in multiplayer, and open to community alternatives.
- **D043 (AI presets):** Orthogonal. AI decides where to send units; pathfinding decides how they move. An AI preset + pathfinding preset combination determines overall movement behavior. Both are modder-selectable.
- **D033 (QoL toggles):** Some implementation-specific parameters (harvester stuck fix, infantry scatter smoothing) could be classified as QoL. Presets bundle them for consistency; individual toggles in advanced settings allow fine-tuning.
- **D048 (render modes):** Same modder-selectable pattern. Mods select or provide render modes; mods select or provide pathfinders. The trait-per-subsystem architecture means every pluggable system follows the same model.

### Alternatives Considered

- **One "best" pathfinding only** (rejected — Classic RA movement feel is part of the nostalgia and is critical for original scenario compatibility; forcing modern pathing on purists would alienate them AND break existing missions)
- **Pathfinding differences handled by balance presets** (rejected — movement behavior is fundamentally different from numeric values; a separate axis deserves separate selection)
- **One parameterized implementation that emulates all three** (rejected — Remastered pathfinding and IC flowfield pathfinding are fundamentally different algorithms with different data structures and different computational models; parameterizing one to approximate the other produces a neither-fish-nor-fowl result that reproduces neither accurately; separate implementations are honest and maintainable)
- **Only IC Default pathfinding, with "classic mode" as a cosmetic approximation** (rejected — scenario compatibility requires *actual* reproduction of original movement behavior, not an approximation; bridge missions, chokepoint defense, harvester timing all depend on specific pathfinding quirks)

---

---

## D048: Switchable Render Modes — Classic, HD, and 3D in One Game

**Status:** Accepted
**Scope:** `ic-render`, `ic-game`, `ic-ui`
**Phase:** Phase 2 (render mode infrastructure), Phase 3 (toggle UI), Phase 6a (3D mode mod support)

### The Problem

The C&C Remastered Collection's most iconic UX feature is pressing F1 to instantly toggle between classic 320×200 sprites and hand-painted HD art — mid-game, no loading screen. This isn't just swapping sprites. It's switching the *entire visual presentation*: sprite resolution, palette handling, terrain tiles, shadow rendering, UI chrome, and scaling behavior. The engine already has pieces to support this (resource packs in `04-MODDING.md`, dual asset rendering in D029, `Renderable` trait, `ScreenToWorld` trait, 3D render mods in `02-ARCHITECTURE.md`), but they exist as independent systems with no unified mechanism for "switch everything at once." Furthermore, the current design treats 3D rendering exclusively as a Tier 3 WASM mod that **replaces** the default renderer — there's no concept of a game or mod that ships *both* 2D and 3D views and lets the player toggle between them.

### Decision

Introduce **render modes** as a first-class engine concept. A render mode bundles a rendering backend, camera system, resource pack selection, and visual configuration into a named, instantly-switchable unit. Game modules and mods can register multiple render modes; the player toggles between them with a keybind or settings menu.

### What a Render Mode Is

A render mode composes four concerns that must change together:

| Concern            | What Changes                                                     | Trait / System                        |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------- |
| **Render backend** | Sprite renderer vs. mesh renderer vs. voxel renderer             | `Renderable` impl                     |
| **Camera**         | Isometric orthographic vs. free 3D perspective; zoom range       | `ScreenToWorld` impl + `CameraConfig` |
| **Resource packs** | Which asset set to use (classic `.shp`, HD sprites, GLTF models) | Resource pack selection               |
| **Visual config**  | Scaling mode, palette handling, shadow style, post-FX preset     | `RenderSettings` subset               |

A render mode is NOT a game module. The simulation, pathfinding, networking, balance, and game rules are completely unchanged between modes. Two players in the same multiplayer game can use different render modes — the sim is view-agnostic (this is already an established architectural property).

### Render Mode Registration

Game modules register their supported render modes via the `GameModule` trait:

```rust
pub struct RenderMode {
    pub id: String,                        // "classic", "hd", "3d"
    pub display_name: String,              // "Classic (320×200)", "HD Sprites", "3D View"
    pub render_backend: RenderBackendId,   // Which Renderable impl to use
    pub camera: CameraMode,                // Isometric, Perspective, FreeRotate
    pub camera_config: CameraConfig,       // Zoom range, pan speed (see 02-ARCHITECTURE.md § Camera)
    pub resource_pack_overrides: Vec<ResourcePackRef>, // Per-category pack selections
    pub visual_config: VisualConfig,       // Scaling, palette, shadow, post-FX
    pub keybind: Option<KeyCode>,          // Optional dedicated toggle key
}

pub struct CameraConfig {
    pub zoom_min: f32,                     // minimum zoom (0.5 = zoomed way out)
    pub zoom_max: f32,                     // maximum zoom (4.0 = close-up)
    pub zoom_default: f32,                 // starting zoom level (1.0)
    pub integer_snap: bool,                // snap to integer scale for pixel art (Classic mode)
}

pub struct VisualConfig {
    pub scaling: ScalingMode,              // IntegerNearest, Bilinear, Native
    pub palette_mode: PaletteMode,         // IndexedPalette, DirectColor
    pub shadow_style: ShadowStyle,         // SpriteShadow, ProjectedShadow, None
    pub post_fx: PostFxPreset,             // None, Classic, Enhanced
}
```

The RA1 game module would register:

```yaml
render_modes:
  classic:
    display_name: "Classic"
    render_backend: sprite
    camera: isometric
    camera_config:
      zoom_min: 0.5
      zoom_max: 3.0
      zoom_default: 1.0
      integer_snap: true           # snap OrthographicProjection.scale to integer multiples
    resource_packs:
      sprites: classic-shp
      terrain: classic-tiles
    visual_config:
      scaling: integer_nearest
      palette_mode: indexed
      shadow_style: sprite_shadow
      post_fx: none
    description: "Original 320×200 pixel art, integer-scaled"

  hd:
    display_name: "HD"
    render_backend: sprite
    camera: isometric
    camera_config:
      zoom_min: 0.5
      zoom_max: 4.0
      zoom_default: 1.0
      integer_snap: false          # smooth zoom at all levels
    resource_packs:
      sprites: hd-sprites         # Requires HD sprite resource pack
      terrain: hd-terrain
    visual_config:
      scaling: native
      palette_mode: direct_color
      shadow_style: sprite_shadow
      post_fx: enhanced
    description: "High-definition sprites at native resolution"
```

A 3D render mod adds a third mode:

```yaml
# 3d_mod/render_modes.yaml (extends base game module)
render_modes:
  3d:
    display_name: "3D View"
    render_backend: mesh            # Provided by the WASM mod
    camera: free_rotate
    camera_config:
      zoom_min: 0.25               # 3D allows wider zoom range
      zoom_max: 6.0
      zoom_default: 1.0
      integer_snap: false
    resource_packs:
      sprites: 3d-models           # GLTF meshes mapped to unit types
      terrain: 3d-terrain
    visual_config:
      scaling: native
      palette_mode: direct_color
      shadow_style: projected_shadow
      post_fx: enhanced
    description: "Full 3D rendering with free camera"
    requires_mod: "3d-ra"          # Only available when this mod is loaded
```

### Toggle Mechanism

**Default keybind:** F1 cycles through available render modes (matching the Remastered Collection). A game with only `classic` and `hd` modes: F1 toggles between them. A game with three modes: F1 cycles classic → hd → 3d → classic. The cycle order matches the `render_modes` declaration order.

**Settings UI:**

```
Settings → Graphics → Render Mode
┌───────────────────────────────────────────────┐
│ Active Render Mode:  [HD ▾]                   │
│                                               │
│ Toggle Key: [F1]                              │
│ Cycle Order: Classic → HD → 3D                │
│                                               │
│ Available Modes:                              │
│ ● Classic — Original pixel art, integer-scaled│
│ ● HD — High-definition sprites (requires      │
│         HD sprite pack)                       │
│ ● 3D View — Full 3D (requires 3D RA mod)     │
│              [Browse Workshop →]              │
└───────────────────────────────────────────────┘
```

Modes whose required resource packs or mods aren't installed remain clickable — selecting one opens a guidance panel explaining what's needed and linking directly to Workshop or settings (see D033 § "UX Principle: No Dead-End Buttons"). No greyed-out entries.

### How the Switch Works (Runtime)

The toggle is instant — no loading screen, no fade-to-black for same-backend switches:

1. **Same render backend** (classic ↔ hd): Swap `Handle` references on all `Renderable` components. Both asset sets are loaded at startup (or on first toggle). Bevy's asset system makes this a single-frame operation — exactly like the Remastered Collection's F1.

2. **Different render backend** (2D ↔ 3D): Swap the active `Renderable` implementation and camera. This is heavier — the first switch loads the 3D asset set (brief loading indicator). Subsequent switches are instant because both backends stay resident. Camera interpolates smoothly between isometric and perspective over ~0.3 seconds.

3. **Multiplayer**: Render mode is a client-only setting. The sim doesn't know or care. No sync, no lobby lock. One player on Classic, one on HD, one on 3D — all in the same game. This already works architecturally; D048 just formalizes it.

4. **Replays**: Render mode is switchable during replay playback. Watch a classic-era replay in 3D, or vice versa.

### Cross-View Multiplayer

This deserves emphasis because it's a feature no shipped C&C game has offered: **players using different visual presentations in the same multiplayer match.** The sim/render split (Invariant #1, #9) makes this free. A competitive player who prefers classic pixel clarity plays against someone using 3D — same rules, same sim, same balance, different eyes.

Cross-view also means **cross-view spectating**: an observer can watch a tournament match in 3D while the players compete in classic 2D. This creates unique content creation and broadcasting opportunities.

### Information Equivalence Across Render Modes

Cross-view multiplayer is competitively safe because all render modes display **identical game-state information:**

- **Fog of war:** Visibility is computed by `FogProvider` in the sim. Every render mode receives the same `VisibilityGrid` — no mode can reveal fogged units or terrain that another mode hides.
- **Unit visibility:** Cloaked, burrowed, and disguised units are shown/hidden based on sim-side detection state (`DetectCloaked`, `IgnoresDisguise`). The render mode determines *how* a shimmer or disguise looks, not *whether* the player sees it.
- **Health bars, status indicators, minimap:** All driven by sim state. A unit at 50% health shows 50% health in every render mode. Minimap icons are derived from the same entity positions regardless of visual presentation.
- **Selection and targeting:** Click hitboxes are defined per render mode via `ScreenToWorld`, but the available actions and information (tooltip, stats panel) are identical.

If a future render mode creates an information asymmetry (e.g., 3D terrain occlusion that hides units behind buildings when the 2D mode shows them), the mode must equalize information display — either by adding a visibility indicator or by using the sim's visibility grid as the authority for what's shown. **The principle: render modes change how the game looks, never what the player knows.**

### Relationship to Existing Systems

| System                   | Before D048                                          | After D048                                                                                           |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Resource Packs**       | Per-category asset selection in Settings             | Resource packs become a *component* of render modes; the mode auto-selects the right packs           |
| **D029 Dual Asset**      | Dual asset handles per entity                        | Generalized to N render modes, not just two. D029's mechanism is how same-backend switches work      |
| **3D Render Mods**       | Tier 3 WASM mod that *replaces* the default renderer | Tier 3 WASM mod that *adds* a render mode alongside the default — toggleable, not a replacement      |
| **D032 UI Themes**       | Switchable UI chrome                                 | UI theme can optionally be paired with a render mode (classic mode + classic chrome)                 |
| **Render Quality Tiers** | Hardware-adaptive Baseline → Ultra                   | Tiers apply *within* a render mode. Classic mode on Tier 0 hardware; 3D mode requires Tier 2 minimum |
| **Experience Profiles**  | Balance + theme + QoL + AI + pathfinding             | Now also include a default render mode                                                               |

### What Mod Authors Need to Do

**For a sprite HD pack** (most common case): Nothing new. Publish a resource pack with HD sprites. The game module's `hd` render mode references it. The player installs it and F1 toggles.

**For a 3D rendering mod** (Tier 3): Ship a WASM mod that provides a `Renderable` impl (mesh renderer) and a `ScreenToWorld` impl (3D camera). Declare a render mode in YAML that references these implementations and the 3D asset resource packs. The engine registers the mode alongside the built-in modes — F1 now cycles through all three.

**For a complete 3D game module** (e.g., Generals clone): The game module can register only 3D render modes — no classic 2D at all. Or it can ship both. The architecture supports any combination.

### Minimum Viable Scope

Phase 2 delivers the infrastructure — render mode registration, asset handle swapping, the `RenderMode` struct. The HD/SD toggle (classic ↔ hd) works. Phase 3 adds the settings UI and keybind. Phase 6a supports mod-provided render modes (3D). The architecture supports all of this from day one; the phases gate what's *tested and polished.*

### Alternatives Considered

1. **Resource packs only, no render mode concept** — Rejected. Switching from 2D to 3D requires changing the render backend and camera, not just assets. Resource packs can't do that.
2. **3D as a separate game module** — Rejected. A "3D RA1" game module would duplicate all the rules, balance, and systems from the base RA1 module. The whole point is that the sim is unchanged.
3. **No 2D↔3D toggle; 3D replaces 2D permanently when mod is active** — Rejected. The Remastered Collection proved that *toggling* is the feature, not just having two visual options. Players love comparing. Content creators use it for dramatic effect. It's also a safety net — if the 3D mod has rendering bugs, you can toggle back.

### Lessons from the Remastered Collection

The Remastered Collection's F1 toggle is the gold-standard reference for this feature. Its architecture — recovered from the GPL source (`DLLInterface.cpp`) and our analysis (`research/remastered-collection-netcode-analysis.md` § 9) — reveals how Petroglyph achieved instant switching, and where IC can improve:

**How the Remastered toggle works internally:**

The Remastered Collection runs **two rendering pipelines in parallel.** The original C++ engine still software-renders every frame to `GraphicBufferClass` RAM buffers (palette-based 8-bit blitting) — exactly as in 1995. Simultaneously, `DLL_Draw_Intercept` captures every draw call as structured metadata (`CNCObjectStruct`: position, type, shape index, frame, palette, cloak state, health, selection) and forwards it to the C# GlyphX client via `CNC_Get_Game_State()`. The GlyphX layer renders the same scene using HD art and GPU acceleration. When the player presses Tab (their toggle key), the C# layer simply switches which final framebuffer is composited to screen — the classic software buffer or the HD GPU buffer. Both are always up-to-date because both render every frame.

**Why dual-render works for Remastered but is wrong for IC:**

| Remastered approach                                      | IC approach                                     | Why different                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both pipelines render every frame                        | Only the active mode renders                    | The Remastered C++ engine is a sealed DLL — you can't stop it rendering. IC owns both pipelines and can skip work. Rendering both wastes GPU budget. |
| Classic renderer is software (CPU blit to RAM)           | Both modes are GPU-based (wgpu via Bevy)        | Classic-mode GPU sprites are cheap but not free. Dual GPU render passes halve available GPU budget for post-FX, particles, unit count.               |
| Switch is trivial: flip a "which buffer to present" flag | Switch swaps asset handles on live entities     | Remastered pays for dual-render continuously to make the flip trivial. IC pays nothing continuously and does a one-frame swap at toggle time.        |
| Two codebases: C++ (classic) and C# (HD)                 | One codebase: same Bevy systems, different data | IC's approach is fundamentally lighter — same draw call dispatch, different texture atlases.                                                         |

**Key insight IC adopts:** The Remastered Collection's critical architectural win is that **the sim is completely unaware of the render switch.** The C++ sim DLL (`CNC_Advance_Instance`) has no knowledge of which visual mode is active — it advances identically in both cases. IC inherits this principle via Invariant #1 (sim is pure). The sim never imports from `ic-render`. Render mode is a purely client-side concern.

**Key insight IC rejects:** Dual-rendering every frame is wasteful when you own both pipelines. The Remastered Collection pays this cost because the C++ DLL cannot be told "don't render this frame" — `DLL_Draw_Intercept` fires unconditionally. IC has no such constraint. Only the active render mode's systems should run.

### Bevy Implementation Strategy

The render mode switch is implementable entirely within Bevy's existing architecture — no custom render passes, no engine modifications. The key mechanisms are **`Visibility` component toggling**, **`Handle` swapping on `Sprite`/`Mesh` components**, and **Bevy's system set run conditions**.

#### Architecture: Two Approaches, One Hybrid

**Approach A: Entity-per-mode (rejected for same-backend switches)**

Spawn separate sprite entities for classic and HD, toggle `Visibility`. Simple but doubles entity count (500 units × 2 = 1000 sprite entities) and doubles `Transform` sync work. Only justified for cross-backend switches (2D entity + 3D entity) where the components are structurally different.

**Approach B: Handle-swap on shared entity (adopted for same-backend switches)**

Each renderable entity has one `Sprite` component. On toggle, swap its `Handle<Image>` (or `TextureAtlas` index) from the classic atlas to the HD atlas. One entity, one transform, one visibility check — the sprite batch simply references different texture data. This is what `D029 Dual Asset` already designed.

**Hybrid: same-backend swaps use handle-swap; cross-backend swaps use visibility-gated entity groups.**

#### Core ECS Components

```rust
/// Marker resource: the currently active render mode.
/// Changed via F1 keypress or settings UI.
/// Bevy change detection (Res<ActiveRenderMode>.is_changed()) triggers swap systems.
#[derive(Resource)]
pub struct ActiveRenderMode {
    pub current: RenderModeId,       // "classic", "hd", "3d"
    pub cycle: Vec<RenderModeId>,    // Ordered list for F1 cycling
    pub registry: HashMap<RenderModeId, RenderModeConfig>,
}

/// Per-entity component: maps this entity's render data for each available mode.
/// Populated at spawn time from the game module's YAML asset mappings.
#[derive(Component)]
pub struct RenderModeAssets {
    /// For same-backend modes (classic ↔ hd): alternative texture handles.
    /// Key = render mode id, Value = handle to that mode's texture atlas.
    pub sprite_handles: HashMap<RenderModeId, Handle<Image>>,
    /// For same-backend modes: alternative atlas layout indices.
    pub atlas_mappings: HashMap<RenderModeId, TextureAtlasLayout>,
    /// For cross-backend modes (2D ↔ 3D): entity IDs of the alternative representations.
    /// These entities exist but have Visibility::Hidden until their mode activates.
    pub cross_backend_entities: HashMap<RenderModeId, Entity>,
}

/// System set that only runs when a render mode switch just occurred.
/// Uses Bevy's run_if condition to avoid any per-frame cost when not switching.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct RenderModeSwitchSet;
```

#### The Toggle System (F1 Handler)

```rust
/// Runs every frame (cheap: one key check).
fn handle_render_mode_toggle(
    input: Res<ButtonInput<KeyCode>>,
    mut active: ResMut<ActiveRenderMode>,
) {
    if input.just_pressed(KeyCode::F1) {
        let idx = active.cycle.iter()
            .position(|id| *id == active.current)
            .unwrap_or(0);
        let next = (idx + 1) % active.cycle.len();
        active.current = active.cycle[next].clone();
        // Bevy change detection fires: active.is_changed() == true this frame.
        // All systems in RenderModeSwitchSet will run exactly once.
    }
}
```

#### Same-Backend Swap (Classic ↔ HD)

```rust
/// Runs ONLY when ActiveRenderMode changes (run_if condition).
/// Cost: iterates all renderable entities ONCE, swaps Handle + atlas.
/// For 500 units + 200 buildings + terrain = ~1000 entities: < 0.5ms.
fn swap_sprite_handles(
    active: Res<ActiveRenderMode>,
    mut query: Query<(&RenderModeAssets, &mut Sprite)>,
) {
    let mode = &active.current;
    for (assets, mut sprite) in &mut query {
        if let Some(handle) = assets.sprite_handles.get(mode) {
            sprite.image = handle.clone();
        }
        // Atlas layout swap happens similarly via TextureAtlas component
    }
}

/// Swap camera and visual settings when render mode changes.
/// Updates the GameCamera zoom range and the OrthographicProjection scaling mode.
/// Camera position is preserved across switches — only zoom behavior changes.
/// See 02-ARCHITECTURE.md § "Camera System" for the canonical GameCamera resource.
fn swap_visual_config(
    active: Res<ActiveRenderMode>,
    mut game_camera: ResMut<GameCamera>,
    mut camera_query: Query<&mut OrthographicProjection, With<GameCameraMarker>>,
) {
    let config = &active.registry[&active.current];

    // Update zoom range from the new render mode's camera config.
    game_camera.zoom_min = config.camera_config.zoom_min;
    game_camera.zoom_max = config.camera_config.zoom_max;
    // Clamp current zoom to new range (e.g., 3D mode allows wider range than Classic).
    game_camera.zoom_target = game_camera.zoom_target
        .clamp(game_camera.zoom_min, game_camera.zoom_max);

    for mut proj in &mut camera_query {
        proj.scaling_mode = match config.visual_config.scaling {
            ScalingMode::IntegerNearest => bevy::render::camera::ScalingMode::Fixed {
                width: 320.0, height: 200.0, // Classic RA viewport
            },
            ScalingMode::Native => bevy::render::camera::ScalingMode::AutoMin {
                min_width: 1280.0, min_height: 720.0,
            },
            // ...
        };
    }
}
```

#### Cross-Backend Swap (2D ↔ 3D)

```rust
/// For cross-backend switches: toggle Visibility on entity groups.
/// The 3D entities exist from the start but are Hidden.
/// Swap cost: iterate entities, flip Visibility enum. Still < 1ms.
fn swap_render_backends(
    active: Res<ActiveRenderMode>,
    mut query: Query<(&RenderModeAssets, &mut Visibility)>,
    mut cross_entities: Query<&mut Visibility, Without<RenderModeAssets>>,
) {
    let mode = &active.current;
    let config = &active.registry[mode];

    for (assets, mut vis) in &mut query {
        // If this entity's backend matches the active mode, show it.
        // Otherwise, hide it and show the cross-backend counterpart.
        if assets.sprite_handles.contains_key(mode) {
            *vis = Visibility::Inherited;
            // Hide cross-backend counterparts
            for (other_mode, &entity) in &assets.cross_backend_entities {
                if *other_mode != *mode {
                    if let Ok(mut other_vis) = cross_entities.get_mut(entity) {
                        *other_vis = Visibility::Hidden;
                    }
                }
            }
        } else if let Some(&entity) = assets.cross_backend_entities.get(mode) {
            *vis = Visibility::Hidden;
            if let Ok(mut other_vis) = cross_entities.get_mut(entity) {
                *other_vis = Visibility::Inherited;
            }
        }
    }
}
```

#### System Scheduling

```rust
impl Plugin for RenderModePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ActiveRenderMode>()
           // F1 handler runs every frame — trivially cheap (one key check).
           .add_systems(Update, handle_render_mode_toggle)
           // Swap systems run ONLY on the frame when ActiveRenderMode changes.
           .add_systems(Update, (
               swap_sprite_handles,
               swap_visual_config,
               swap_render_backends,
               swap_ui_theme,            // D032 theme pairing
               swap_post_fx_pipeline,    // Post-processing preset
               emit_render_mode_event,   // Telemetry: D031
           ).in_set(RenderModeSwitchSet)
            .run_if(resource_changed::<ActiveRenderMode>));
    }
}
```

#### Performance Characteristics

| Operation                        | Cost                                      | When It Runs         | Notes                                                                                                          |
| -------------------------------- | ----------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| F1 key check                     | ~0 (one `HashMap` lookup)                 | Every frame          | Bevy input system already processes keys; we just read                                                         |
| Same-backend swap (classic ↔ hd) | ~0.3–0.5 ms for 1000 entities             | Once on toggle       | Iterate entities, write `Handle<Image>`. No GPU work. Bevy batches texture changes automatically on next draw. |
| Cross-backend swap (2D ↔ 3D)     | ~0.5–1 ms for 1000 entity pairs           | Once on toggle       | Toggle `Visibility`. Hidden entities are culled by Bevy's visibility system — zero draw calls.                 |
| 3D asset first-load              | 50–500 ms (one-time)                      | First toggle to 3D   | GLTF meshes + textures loaded async by Bevy's asset server. Brief loading indicator. Cached thereafter.        |
| Steady-state (non-toggle frames) | **0 ms**                                  | Every frame          | `run_if(resource_changed)` gates all swap systems. Zero per-frame overhead.                                    |
| VRAM usage                       | Classic atlas (~8 MB) + HD atlas (~64 MB) | Resident when loaded | Both atlases stay in VRAM. Modern GPUs: trivial. Min-spec 512 MB VRAM: still <15%.                             |

**Key property: zero per-frame cost.** Bevy's `resource_changed` run condition means the swap systems literally do not execute unless the player presses F1. Between toggles, the renderer treats the active atlas as the only atlas — standard sprite batching, standard draw calls, no branching.

#### Asset Pre-Loading Strategy

The critical difference from the Remastered Collection: IC does NOT dual-render. Instead, it pre-loads both texture atlases into VRAM at match start (or lazily on first toggle):

```rust
/// Called during match loading. Pre-loads all registered render mode assets.
fn preload_render_mode_assets(
    active: Res<ActiveRenderMode>,
    asset_server: Res<AssetServer>,
    mut preload_handles: ResMut<RenderModePreloadHandles>,
) {
    for (mode_id, config) in &active.registry {
        for pack_ref in &config.resource_pack_overrides {
            // Bevy's asset server loads asynchronously.
            // We hold the Handle to keep the asset resident in memory.
            let handle = asset_server.load(pack_ref.atlas_path());
            preload_handles.retain.push(handle);
        }
    }
}
```

**Loading strategy by mode type:**

| Mode pair                   | Pre-load?             | Memory cost               | Rationale                                                                                  |
| --------------------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Classic ↔ HD (same backend) | Yes, at match start   | +64 MB VRAM for HD atlas  | Both are texture atlases. Pre-loading makes F1 instant.                                    |
| 2D ↔ 3D (cross backend)     | Lazy, on first toggle | +100–300 MB for 3D meshes | 3D assets are large. Don't penalize 2D-only players. Loading indicator on first 3D toggle. |
| Any ↔ Any (menu/lobby)      | Active mode only      | Minimal                   | No gameplay; loading time acceptable.                                                      |

#### Transform Synchronization (Cross-Backend Only)

When 2D and 3D entities coexist (one hidden), their `Transform` must stay in sync so the switch looks seamless. The sim writes to a `SimPosition` component (in world coordinates). Both the 2D sprite entity and the 3D mesh entity read from the same `SimPosition` and compute their own `Transform`:

```rust
/// Runs every frame for ALL visible renderable entities.
/// Converts SimPosition → entity Transform using the active camera model.
/// Hidden entities skip this (Bevy's visibility propagation prevents
/// transform updates on Hidden entities from triggering GPU uploads).
fn sync_render_transforms(
    active: Res<ActiveRenderMode>,
    mut query: Query<(&SimPosition, &mut Transform), With<Visibility>>,
) {
    let camera_model = &active.registry[&active.current].camera;
    for (sim_pos, mut transform) in &mut query {
        *transform = camera_model.world_to_render(sim_pos);
    }
}
```

Bevy's built-in visibility system already ensures that `Hidden` entities' transforms aren't uploaded to the GPU, so the 3D entity transforms are only computed when 3D mode is active.

#### Comparison: Remastered vs. IC Render Switch

| Aspect                    | Remastered Collection                                             | Iron Curtain                                      |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| **Architecture**          | Dual-render: both pipelines run every frame                       | Single-render: only active mode draws             |
| **Switch cost**           | ~0 (flip framebuffer pointer)                                     | ~0.5 ms (swap handles on ~1000 entities)          |
| **Steady-state cost**     | Full classic render every frame (~2-5ms CPU) even when showing HD | **0 ms** — inactive mode has zero cost            |
| **Why the trade-off**     | C++ DLL can't be told "don't render"                              | IC owns both pipelines, can skip work             |
| **Memory**                | Classic (RAM buffer) + HD (VRAM)                                  | Both atlases in VRAM (unified GPU memory)         |
| **Cross-backend (2D↔3D)** | Not supported                                                     | Supported via visibility-gated entity groups      |
| **Multiplayer**           | Both players must use same mode                                   | Cross-view: each player picks independently       |
| **Camera**                | Fixed isometric in both modes                                     | Camera model switches with render mode            |
| **UI chrome**             | Switches with graphics mode                                       | Independently switchable (D032) but can be paired |
| **Modder-extensible**     | No                                                                | YAML registration + WASM render backends          |

---

---

## D054: Extended Switchability — Transport, Cryptographic Signatures, and Snapshot Serialization

|                |                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                        |
| **Driver**     | Architecture switchability audit identified three subsystems that are currently hardcoded but carry meaningful risk of regret within 5–10 years |
| **Depends on** | D006 (NetworkModel), D010 (Snapshottable sim), D041 (Trait-abstracted subsystems), D052 (Community Servers & SCR)                               |

### Problem

The engine already trait-abstracts 23 subsystems (D041 inventory) and data-drives 7 more through YAML/Lua. But an architecture switchability audit identified three remaining subsystems where the *implementation* is hardcoded below an existing abstraction layer, creating risks that are cheap to mitigate now but expensive to fix later:

1. **Transport layer** — `NetworkModel` abstracts the logical protocol (lockstep vs. rollback) but not the transport beneath it. Raw UDP is hardcoded. WASM builds cannot use raw UDP sockets at all — browser multiplayer is blocked until this is abstracted. WebTransport and QUIC are maturing rapidly and may supersede raw UDP for game transport within the engine's lifetime.

2. **Cryptographic signature scheme** — Ed25519 is hardcoded in ~15 callsites across the codebase: SCR records (D052), replay signature chains, Workshop index signing, `CertifiedMatchResult`, key rotation records, and community identity. Ed25519 is excellent today (128-bit security, fast, compact), but NIST's post-quantum transition timeline (ML-DSA standardized 2024, recommended migration by ~2035) means the engine may need to swap signature algorithms without breaking every signed record in existence.

3. **Snapshot serialization codec** — `SimSnapshot` is serialized with bincode + LZ4, hardcoded in the save/load path. Bincode is not self-describing — schema changes (adding a field, reordering an enum) silently produce corrupt deserialization rather than a clean error. Cross-version save compatibility requires codec-version awareness that doesn't currently exist.

Each uses the right abstraction mechanism for its specific situation: **Transport** gets a trait (open-ended, third-party implementations expected, hot path where monomorphization matters), **SignatureScheme** gets an enum (closed set of 2–3 algorithms, runtime dispatch needed for mixed-version verification), and **SnapshotCodec** gets version-tagged dispatch (internal versioning, no pluggability needed). The total cost is ~80 lines of definitions. The benefit is that none of these becomes a rewrite-required bottleneck when reality changes.

### The Principle (from D041)

Abstract the *transport mechanism*, not the *data*. If the concern is "which bytes go over which wire" or "which algorithm signs these bytes" or "which codec serializes this struct" — that's a mechanism that can change independently of the logic above it. The logic (lockstep protocol, credential verification, snapshot semantics) stays identical regardless of which mechanism implements it.

### 1. `Transport` — Network Transport Abstraction

**Risk level: HIGH.** Browser multiplayer (Invariant #10: platform-agnostic) is blocked without this. WASM cannot open raw UDP sockets — it's a platform API limitation, not a library gap. Every browser RTS (Chrono Divide, OpenRA-web experiments) solves this by abstracting transport. We already abstract the protocol layer (`NetworkModel`); failing to abstract the transport layer below it is an inconsistency.

**Current state:** The connection establishment flow in `03-NETCODE.md` shows transport as a concern "below" `NetworkModel`:

```
Discovery → Connection establishment → NetworkModel constructed → Game loop
```

But connection establishment hardcodes UDP. A `Transport` trait makes this explicit.

**Trait definition:**

```rust
/// Abstracts a single bidirectional network channel beneath NetworkModel.
/// Each Transport instance represents ONE connection (to a relay, or to a
/// single peer in P2P). NetworkModel manages multiple Transport instances
/// for multi-peer P2P; relay mode uses a single Transport to the relay.
///
/// Lives in ic-net. NetworkModel implementations are generic over Transport.
///
/// Design: point-to-point, not connectionless. No endpoint parameter in
/// send/recv — the Transport IS the connection. For UDP, this maps to a
/// connected socket (UdpSocket::connect()). For WebSocket/QUIC, this is
/// the natural model. Multi-peer routing is NetworkModel's concern.
///
/// All transports expose datagram/message semantics. The protocol layer
/// (NetworkModel) always runs its own reliability and ordering — sequence
/// numbers, retransmission, frame resend (§ Frame Data Resilience). On
/// reliable transports (WebSocket), these mechanisms become no-ops at
/// runtime (retransmit timers never fire). This eliminates conditional
/// branches in NetworkModel and keeps a single code path and test matrix.
pub trait Transport: Send + Sync {
    /// Send a datagram/message to the connected peer. Non-blocking or
    /// returns WouldBlock. Data is a complete message (not a byte stream).
    fn send(&self, data: &[u8]) -> Result<(), TransportError>;

    /// Receive the next available message, if any. Non-blocking.
    /// Returns the number of bytes written to `buf`, or None if no
    /// message is available.
    fn recv(&self, buf: &mut [u8]) -> Result<Option<usize>, TransportError>;

    /// Maximum payload size for a single send() call.
    /// UdpTransport returns ~476 (MTU-safe). WebSocketTransport returns ~64KB.
    fn max_payload(&self) -> usize;

    /// Establish the connection to the target endpoint.
    fn connect(&mut self, target: &Endpoint) -> Result<(), TransportError>;

    /// Tear down the connection.
    fn disconnect(&mut self);
}
```

**Default implementations:**

| Implementation       | Backing                               | Platform         | Phase  | Notes                                                                                                                                                                                              |
| -------------------- | ------------------------------------- | ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UdpTransport`       | `std::net::UdpSocket`                 | Desktop, Server  | 5      | Default. Raw UDP, MTU-aware, same as current hardcoded behavior.                                                                                                                                   |
| `WebSocketTransport` | `tungstenite` / browser WebSocket API | WASM, Fallback   | 5      | Enables browser multiplayer. Reliable + ordered (NetworkModel's retransmit logic becomes a no-op — single code path, zero conditional branches). Higher latency than UDP but functional.           |
| `WebTransportImpl`   | WebTransport API                      | WASM (future)    | Future | Unreliable datagrams over QUIC. Best of both worlds — UDP-like semantics in the browser. Spec still maturing (W3C Working Draft).                                                                  |
| `QuicTransport`      | `quinn`                               | Desktop (future) | Future | Stream multiplexing, built-in encryption, 0-RTT reconnects. Candidate to replace raw UDP + custom reliability when QUIC ecosystem matures.                                                         |
| `MemoryTransport`    | `crossbeam` channel                   | Testing          | 2      | Zero-latency, zero-loss in-process transport. Already implied by `LocalNetwork` — this makes it explicit as a `Transport`. NetworkModel manages a `Vec<T>` of these for multi-peer test scenarios. |

**Relationship to `NetworkModel`:**

```rust
/// NetworkModel becomes generic over Transport.
/// Existing code that constructs LockstepNetwork or RelayLockstepNetwork
/// now specifies a Transport. For desktop builds, this is UdpTransport.
/// For WASM builds, this is WebSocketTransport.
///
/// Relay mode: single Transport to the relay server.
/// P2P mode: Vec<T> — one Transport per peer connection.
pub struct LockstepNetwork<T: Transport> {
    transport: T,       // relay mode: connection to relay
    // ... existing fields unchanged
}

pub struct P2PLockstepNetwork<T: Transport> {
    peers: Vec<T>,      // one connection per peer
    // ... existing fields unchanged
}

impl<T: Transport> NetworkModel for LockstepNetwork<T> {
    // All existing logic unchanged. send()/recv() calls go through
    // self.transport instead of directly calling UdpSocket methods.
    // Reliability layer (sequence numbers, retransmit, frame resend)
    // runs identically regardless of transport — on reliable transports,
    // retransmit timers simply never fire.
}
```

**What does NOT change:** The wire format (delta-compressed TLV), the `OrderCodec` trait, the `NetworkModel` trait API, connection discovery (join codes, tracking servers), or the relay server protocol. Transport is purely "how bytes move," not "what bytes mean."

**Why no `is_reliable()` method?** Adding reliability awareness to `Transport` would create conditional branches in `NetworkModel` — one code path for unreliable transports (full retransmit logic) and another for reliable ones (skip retransmit). This doubles the test matrix and creates subtle behavioral differences between deployment targets. Instead, `NetworkModel` always runs its full reliability layer. On reliable transports (WebSocket), retransmit timers never fire and the redundancy costs nothing at runtime. One code path, one test matrix, zero conditional complexity. This is the same approach used by ENet, Valve's GameNetworkingSockets, and most serious game networking libraries.

**Message lanes (from GNS):** `NetworkModel` multiplexes multiple logical streams (lanes) over a single `Transport` connection — each with independent priority and weight. Lanes are a protocol-layer concern, not a transport-layer concern: `Transport` provides raw byte delivery; `NetworkModel` handles lane scheduling, priority draining, and per-lane buffering. See `03-NETCODE.md` § Message Lanes for the lane definitions (`Orders`, `Control`, `Chat`, `Voice`, `Bulk`) and scheduling policy. The lane system ensures time-critical orders are never delayed by chat traffic, voice data, or bulk data — a pattern validated by GNS's configurable lane architecture (see `research/valve-github-analysis.md` § 1.4). The `Voice` lane (D059) carries relay-forwarded Opus VoIP frames as unreliable, best-effort traffic.

**Transport encryption (from GNS):** All multiplayer transports are encrypted with AES-256-GCM over an X25519 key exchange — the same cryptographic suite used by Valve's GameNetworkingSockets and DTLS 1.3. Encryption sits between `Transport` and `NetworkModel`, transparent to both layers. Each connection generates an ephemeral Curve25519 keypair for forward secrecy; the symmetric key is never reused across sessions. After key exchange, the handshake is signed with the player's Ed25519 identity key (D052) to bind the encrypted channel to a verified identity. The GCM nonce incorporates the packet sequence number, preventing replay attacks. See `03-NETCODE.md` § Transport Encryption for the full specification and `06-SECURITY.md` for the threat model. `MemoryTransport` (testing) and `LocalNetwork` (single-player) skip encryption.

**Pluggable signaling (from GNS):** Connection establishment is further decomposed into a `Signaling` trait — abstracting how peers exchange connection metadata (IP addresses, relay tokens, ICE candidates) before the `Transport` is established. This follows GNS's `ISteamNetworkingConnectionSignaling` pattern. Different deployment contexts use different signaling: relay-brokered, rendezvous + hole-punch, direct IP, or WebRTC for browser builds. Adding a new connection method (e.g., Steamworks P2P, Epic Online Services) requires only a new `Signaling` implementation — no changes to `Transport` or `NetworkModel`. See `03-NETCODE.md` § Pluggable Signaling for trait definition and implementations.

**Why not abstract this earlier (D006/D041)?** At D006 design time, browser multiplayer was a distant future target and raw UDP was the obvious choice. Invariant #10 (platform-agnostic) was added later, making the gap visible. D041 explicitly listed the transport layer in its inventory of *already-abstracted* concerns via `NetworkModel` — but `NetworkModel` abstracts the protocol, not the transport. This decision corrects that conflation.

### 2. `SignatureScheme` — Cryptographic Algorithm Abstraction

**Risk level: HIGH.** Ed25519 is hardcoded in ~15 callsites. NIST standardized ML-DSA (post-quantum signatures) in 2024 and recommends migration by ~2035. The engine's 10+ year lifespan means a signature algorithm swap is probable, not speculative. More immediately: different deployment contexts may want different algorithms (Ed448 for higher security margin, ML-DSA-65 for post-quantum compliance).

**Current state:** D052's SCR format deliberately has "No algorithm field. Always Ed25519." — this was the right call to prevent JWT's algorithm confusion vulnerability (CVE-2015-9235). But the solution isn't "hardcode one algorithm forever" — it's "the version field implies the algorithm, and the verifier looks up the algorithm from the version, never from attacker-controlled input."

**Why enum dispatch, not a trait?** The set of signature algorithms is small and closed — realistically 2–3 over the engine's entire lifetime (Ed25519 now, ML-DSA-65 later, possibly one more). This makes it fundamentally different from `Transport` (which is open-ended — anyone can write a new transport). A trait would introduce design tension: associated types (`PublicKey`, `SecretKey`, `Signature`) are not object-safe with `Clone`, meaning `dyn SignatureScheme` won't compile. But runtime dispatch is *required* — a player's credential file contains mixed-version SCRs (version 1 Ed25519 alongside future version 2 ML-DSA), and the verifier must handle both in the same loop. Workarounds exist (erase types to `Vec<u8>`, or drop `Clone`) but they sacrifice type safety that was the supposed benefit of the trait.

Enum dispatch resolves all of these tensions: exhaustive `match` with no default arm (compiler catches missing variants), `Clone`/`Copy` for free, zero vtable overhead, and idiomatic Rust for small closed sets. Adding a third algorithm someday means adding one enum variant — the compiler then flags every callsite that needs updating.

**Enum definition:**

```rust
/// Signature algorithm selection for all signed records.
/// Lives in ic-net (signing + verification are I/O concerns; ic-sim
/// never signs or verifies anything — Invariant #1).
///
/// NOT a trait. The algorithm set is small and closed (2–3 variants
/// over the engine's lifetime). Enum dispatch gives:
/// - Exhaustive match (compiler catches missing variants on addition)
/// - Clone/Copy for free
/// - Zero vtable overhead
/// - Runtime dispatch without object-safety headaches
///
/// Third-party signature algorithms are out of scope — cryptographic
/// agility is a security risk (see JWT CVE-2015-9235). The engine
/// controls which algorithms it trusts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignatureScheme {
    Ed25519,
    // MlDsa65,  // future: post-quantum (NIST FIPS 204)
}

impl SignatureScheme {
    /// Sign a message. Returns the signature bytes.
    pub fn sign(&self, sk: &[u8], msg: &[u8]) -> Vec<u8> {
        match self {
            Self::Ed25519 => ed25519_sign(sk, msg),
            // Self::MlDsa65 => ml_dsa_65_sign(sk, msg),
        }
    }

    /// Verify a signature against a public key and message.
    pub fn verify(&self, pk: &[u8], msg: &[u8], sig: &[u8]) -> bool {
        match self {
            Self::Ed25519 => ed25519_verify(pk, msg, sig),
            // Self::MlDsa65 => ml_dsa_65_verify(pk, msg, sig),
        }
    }

    /// Generate a new keypair. Returns (public_key, secret_key).
    pub fn generate_keypair(&self) -> (Vec<u8>, Vec<u8>) {
        match self {
            Self::Ed25519 => ed25519_generate_keypair(),
            // Self::MlDsa65 => ml_dsa_65_generate_keypair(),
        }
    }

    /// Public key size in bytes. Determines SCR binary format layout.
    pub fn public_key_len(&self) -> usize {
        match self {
            Self::Ed25519 => 32,
            // Self::MlDsa65 => 1952,
        }
    }

    /// Signature size in bytes. Determines SCR binary format layout.
    pub fn signature_len(&self) -> usize {
        match self {
            Self::Ed25519 => 64,
            // Self::MlDsa65 => 3309,
        }
    }
}
```

**Algorithm variants:**

| Variant   | Algorithm | Key Size   | Sig Size   | Phase  | Notes                                                                      |
| --------- | --------- | ---------- | ---------- | ------ | -------------------------------------------------------------------------- |
| `Ed25519` | Ed25519   | 32 bytes   | 64 bytes   | 5      | Default. Current behavior. 128-bit security. Fast, compact, battle-tested. |
| `MlDsa65` | ML-DSA-65 | 1952 bytes | 3309 bytes | Future | Post-quantum. NIST FIPS 204. Larger keys/sigs but quantum-resistant.       |

**Version-implies-algorithm (preserving D052's anti-confusion guarantee):**

D052's SCR format already has a `version` byte (currently `0x01`). The version-to-algorithm mapping is hardcoded in the *verifier*, never read from the record itself:

```rust
/// Version → SignatureScheme mapping.
/// This is the verifier's lookup table, NOT a field in the signed record.
/// Preserves D052's guarantee: no algorithm negotiation, no attacker-controlled
/// algorithm selection. The version byte is set by the issuer at signing time;
/// the verifier uses it to select the correct verification algorithm.
///
/// Returns Result, not panic — version bytes come from user-provided files
/// (credential stores, replays, save files) and must fail gracefully.
fn scheme_for_version(version: u8) -> Result<SignatureScheme, CredentialError> {
    match version {
        0x01 => Ok(SignatureScheme::Ed25519),
        // 0x02 => Ok(SignatureScheme::MlDsa65),
        _ => Err(CredentialError::UnknownVersion(version)),
    }
}
```

**What changes in the SCR binary format:** Nothing structurally. The `version` byte already exists. What changes is the *interpretation*:

- **Before (D052):** "Version is for format evolution. Algorithm is always Ed25519."
- **After (D054):** "Version implies both format layout AND algorithm. Version 1 = Ed25519 (32-byte keys, 64-byte sigs). Version 2 = ML-DSA-65 (1952-byte keys, 3309-byte sigs). The verifier dispatches on version, never on an attacker-controlled field."

The variable-length fields (`community_key`, `player_key`, `signature`) are already length-implied by `version` — version 1 readers know key=32, sig=64. Version 2 readers know key=1952, sig=3309. No length prefix needed because the version fully determines the layout.

**Backward compatibility:** A version 1 SCR issued by a community running Ed25519 remains valid forever. A community migrating to ML-DSA-65 issues version 2 SCRs. Both can coexist in a player's credential file. Version 1 SCRs don't expire or become invalid — they just can't be *newly issued* once the community upgrades.

**Affected callsites (all change from direct `ed25519_dalek` calls to `SignatureScheme` enum method calls):**

- SCR record signing/verification (D052 — community servers + client)
- Replay signature chain (`TickSignature` in `05-FORMATS.md`)
- Workshop index signing (D049 — CI signing pipeline)
- `CertifiedMatchResult` (D052 — relay server)
- Key rotation records (D052 — community servers)
- Player identity keypairs (D052/D053)

**Why not a `version` field in each signature?** Because that's exactly JWT's `alg` header vulnerability. The version lives in the *container* (SCR record header, replay file header, Workshop index header) — not in the signature itself. The container's version is written by the issuer and verified structurally (known offset, not parsed from attacker-controlled payload). This is the same defense D052 already uses; D054 just extends it to support future algorithms.

### 3. `SnapshotCodec` — Save/Replay Serialization Versioning

**Risk level: MEDIUM.** Bincode is fast and compact but not self-describing — if any field in `SimSnapshot` is added, removed, or reordered, deserialization silently produces garbage or panics. The save format header already has a `version: u16` field (`05-FORMATS.md`), but no code dispatches on it. Today, version is always 1 and the codec is always bincode + LZ4. This works until the first schema change — which is inevitable as the sim evolves through Phase 2–7.

**This is NOT a trait in `ic-sim`.** Snapshot serialization is I/O — it belongs in `ic-game` (save/load) and `ic-net` (snapshot transfer for late-join). The sim produces/consumes `SimSnapshot` as an in-memory struct. How that struct becomes bytes is the codec's concern.

**Codec dispatch (version → codec):**

```rust
/// Version-to-codec dispatch for SimSnapshot serialization.
/// Lives in ic-game (save/load path) and ic-net (snapshot transfer).
///
/// NOT a trait — there's no pluggability need here. Game modules don't
/// provide custom codecs. This is internal versioning, not extensibility.
/// A match statement is simpler, more explicit, and easier to audit than
/// a trait registry.
pub fn encode_snapshot(
    snapshot: &SimSnapshot,
    version: u16,
) -> Result<Vec<u8>, CodecError> {
    let serialized = match version {
        1 => bincode::serialize(snapshot)
            .map_err(|e| CodecError::Serialize(e.to_string()))?,
        2 => postcard::to_allocvec(snapshot)
            .map_err(|e| CodecError::Serialize(e.to_string()))?,
        _ => return Err(CodecError::UnknownVersion(version)),
    };
    Ok(lz4_flex::compress_prepend_size(&serialized))
}

pub fn decode_snapshot(
    data: &[u8],
    version: u16,
) -> Result<SimSnapshot, CodecError> {
    let decompressed = lz4_flex::decompress_size_prepended(data)
        .map_err(|e| CodecError::Decompress(e.to_string()))?;
    match version {
        1 => bincode::deserialize(&decompressed)
            .map_err(|e| CodecError::Deserialize(e.to_string())),
        2 => postcard::from_bytes(&decompressed)
            .map_err(|e| CodecError::Deserialize(e.to_string())),
        _ => Err(CodecError::UnknownVersion(version)),
    }
}

/// Errors from snapshot/replay codec operations. Surfaced in UI as
/// "incompatible save file" or "corrupted replay" — never a panic.
#[derive(Debug)]
pub enum CodecError {
    UnknownVersion(u16),
    Serialize(String),
    Deserialize(String),
    Decompress(String),
}
```

**Why postcard as the likely version 2?**

| Property          | bincode (v1)               | postcard (v2 candidate)                                                                                                                                     |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-describing   | No                         | Yes (with `postcard-schema`)                                                                                                                                |
| Varint integers   | No (fixed-width)           | Yes (smaller payloads)                                                                                                                                      |
| Schema evolution  | Field add = silent corrupt | Field append = `#[serde(default)]` compatible (same as bincode); structural mismatch = detected and rejected at load time (vs. bincode's silent corruption) |
| `#[serde]` compat | Yes                        | Yes                                                                                                                                                         |
| `no_std` support  | Limited                    | Full (embedded-friendly)                                                                                                                                    |
| Speed             | Very fast                  | Very fast (within 5%)                                                                                                                                       |
| WASM support      | Yes                        | Yes (designed for it)                                                                                                                                       |

The version 1 → 2 migration path: saves with version 1 headers decode via bincode. New saves write version 2 headers and encode via postcard. Old saves remain loadable forever. The `SimSnapshot` struct itself doesn't change — only the codec that serializes it.

**Migration strategy (from Factorio + DFU analysis):** Mojang's DataFixerUpper uses algebraic optics (profunctor-based type-safe transformations) for Minecraft save migration — academically elegant but massively over-engineered for practical use (see `research/mojang-wube-modding-analysis.md`). Factorio's two-tier migration system is the better model: (1) **Declarative renames** — a YAML mapping of `old_field_name → new_field_name` per category, applied automatically by version number, and (2) **Lua migration scripts** — for complex structural transformations that can't be expressed as simple renames. Scripts are ordered by version and applied sequentially. This avoids DFU's complexity while handling real-world schema evolution. Additionally, every IC YAML rule file should include a `format_version` field (e.g., `format_version: "1.0.0"`) — following the pattern used by both Minecraft Bedrock (`"format_version": "1.26.0"` in every JSON entity file) and Factorio (`"factorio_version": "2.0"` in `info.json`). This enables the migration system to detect and transform old formats without guessing.

**Why NOT a trait?** Unlike Transport and SignatureScheme, snapshot codecs have zero pluggability requirement. No game module, mod, or community server needs to provide a custom snapshot serializer. This is purely internal version dispatch — a `match` statement is the right abstraction, not a trait. D041's principle: "abstract the *algorithm*, not the *data*." Snapshot serialization is data marshaling with no algorithmic variation — the right tool is version-tagged dispatch, not trait polymorphism.

**Relationship to replay format:** The replay file format (`05-FORMATS.md`) also has a `version: u16` in its header. The same version-to-codec dispatch applies to replay tick frames (`ReplayTickFrame` serialization). Replay version 1 uses bincode + LZ4 block compression. A future version 2 could use postcard + LZ4. The replay header version and the save header version evolve independently — a replay viewer doesn't need to understand save files and vice versa.

### What Still Does NOT Need Abstraction

This audit explicitly confirmed that the following remain correctly un-abstracted (extending D041's "What Does NOT Need a Trait" table):

| Subsystem                  | Why No Abstraction Needed                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| YAML parser (`serde_yaml`) | Parser crate is a Cargo dependency swap — no trait needed, no code change beyond `Cargo.toml`.                                    |
| Lua runtime (`mlua`)       | Deeply integrated via `ic-script`. Switching Lua impls is a rewrite regardless of traits. The scripting *API* is the abstraction. |
| WASM runtime (`wasmtime`)  | Same — the WASM API is the abstraction, not the runtime binary.                                                                   |
| Compression (LZ4)          | Used in exactly two places (snapshot, replay). Swapping is a one-line change. No trait overhead justified.                        |
| Bevy                       | The engine framework. Abstracting Bevy is abstracting gravity. If Bevy is replaced, everything is rewritten.                      |
| State hash algorithm       | SHA-256 Merkle tree. Changing this requires coordinated protocol version bump across all clients — a trait wouldn't help.         |
| RNG (`DeterministicRng`)   | Already deterministic and internal to `ic-sim`. Swapping PRNG algorithms is a single-struct replacement. No polymorphism needed.  |

### Alternatives Considered

- **Abstract everything now** (rejected — violates D015's "no speculative abstractions"; the 7 items above don't carry meaningful regret risk)
- **Abstract nothing, handle it later** (rejected — Transport blocks WASM multiplayer *now*; SignatureScheme's 15 hardcoded callsites grow with every feature; SnapshotCodec's first schema change will force an emergency versioning retrofit)
- **Use `dyn` trait objects instead of generics for Transport** (rejected — `dyn Transport` adds vtable overhead on every `send()`/`recv()` in the hot network path; monomorphized generics are zero-cost. `Transport` is used in tight loops — static dispatch is correct here)
- **Make SignatureScheme a trait with associated types** (rejected — associated types are not object-safe with `Clone`, but runtime dispatch is required for mixed-version SCR verification. Erasing types to `Vec<u8>` sacrifices the type safety that was the supposed benefit. Enum dispatch gives exhaustive match, `Clone`/`Copy`, zero vtable, and compiler-enforced completeness when adding variants)
- **Make SignatureScheme a trait with `&[u8]` params (object-safe)** (rejected — works technically, but the algorithm set is small and closed. A trait implies open extensibility; the engine deliberately controls which algorithms it trusts. Enum is the idiomatic Rust pattern for closed dispatch)
- **Add algorithm negotiation to SCR** (rejected — this IS JWT's `alg` header. Version-implies-algorithm is strictly safer and already fits D052's format)
- **Use protobuf/flatbuffers for snapshot serialization** (rejected — adds external IDL dependency, `.proto` file maintenance, code generation step. Postcard gives schema stability within the `serde` ecosystem IC already uses)
- **Make SnapshotCodec a trait** (rejected — no pluggability requirement exists. A `match` statement is simpler and more auditable than a trait registry for internal version dispatch)
- **Add `is_reliable()` to Transport** (rejected — would create conditional branches in NetworkModel: one code path for unreliable transports with full retransmit, another for reliable transports that skips it. Doubles the test matrix. Instead, NetworkModel always runs its reliability layer; on reliable transports the retransmit timers simply never fire. Zero runtime cost, one code path)
- **Connectionless (endpoint-addressed) Transport API** (rejected — creates impedance mismatch: UDP is connectionless but WebSocket/QUIC are connection-oriented. Point-to-point model fits all transports naturally. For UDP, use connected sockets. Multi-peer routing is NetworkModel's concern, not Transport's)

### Relationship to Existing Decisions

- **D006 (NetworkModel):** `Transport` lives below `NetworkModel`. The connection establishment flow becomes: Discovery → Transport::connect() → NetworkModel constructed over Transport → Game loop. `NetworkModel` gains a `T: Transport` type parameter.
- **D010 (Snapshottable sim):** Snapshot encoding/decoding is the I/O layer around D010's `SimSnapshot`. D010 defines the struct; D054 defines how it becomes bytes.
- **D041 (Trait-abstracted subsystems):** `Transport` is added to D041's inventory table. `SignatureScheme` uses enum dispatch (not a trait) — it belongs in the "closed set" category alongside `SnapshotCodec`'s version dispatch. Both are version-tagged, exhaustive, and compiler-enforced. Neither needs the open extensibility that traits provide.
- **D052 (Community Servers & SCR):** The `version` byte in SCR format now implies the signature algorithm. D052's anti-algorithm-confusion guarantee is preserved — the defense shifts from "hardcode one algorithm" to "version determines algorithm, verifier never reads algorithm from attacker input."
- **Invariant #10 (Platform-agnostic):** `Transport` trait directly enables WASM multiplayer, the primary platform gap.

### Phase

- **Phase 2:** `MemoryTransport` for testing (already implied by `LocalNetwork`; making it explicit as a `Transport`). `SnapshotCodec` version dispatch (v1 = bincode + LZ4, matching current behavior).
- **Phase 5:** `UdpTransport`, `WebSocketTransport` (matching current hardcoded behavior — the trait boundary exists, the implementation is unchanged). `SignatureScheme::Ed25519` enum variant wired into all D052 SCR code, replacing direct `ed25519_dalek` calls.
- **Future:** `WebTransportImpl` (when spec stabilizes), `QuicTransport` (when ecosystem matures), `SignatureScheme::MlDsa65` variant (when post-quantum migration timeline firms up), `SnapshotCodec` v2 (postcard, when first `SimSnapshot` schema change occurs).

---

---

## D070: Asymmetric Co-op Mode — Commander & Field Ops (IC-Native Template Toolkit)

|                |                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                      |
| **Phase**      | Phase 6b design/tooling integration (template + authoring/UX spec), post-6b prototype/playtest validation, future expansion for campaign wrappers and PvP variants                                                                                                                        |
| **Depends on** | D006 (NetworkModel), D010 (snapshots), D012 (order validation), D021 (campaigns, later optional wrapper), D030/D049 (Workshop packaging), D038 (Scenario Editor templates + validation), D059 (communication), D065 (onboarding/controls), D066 (export fidelity warnings)             |
| **Driver**     | There is a compelling co-op pattern where one player runs macro/base-building and support powers while another (or several others) execute frontline/behind-enemy-lines objectives. IC already has most building blocks; formalizing this as an IC-native template/toolkit enables it cleanly. |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Prototype/spec first, built-in template/tooling after co-op playtest validation
- **Canonical for:** Asymmetric Commander + Field Ops co-op mode scope, role boundaries, request/support coordination model, v1 constraints, and phasing
- **Scope:** IC-native scenario/game-mode template + authoring toolkit + role HUD/communication requirements; not engine-core simulation specialization
- **Decision:** IC supports an optional **Commander & Field Ops** asymmetric co-op mode as a built-in IC-native template/toolkit with **PvE-first**, **shared battlefield first**, **match-based field progression first**, and **mostly split role control ownership**.
- **Why:** The mode fits IC's strengths (D038 scenarios, D059 communication, D065 onboarding, D021 campaign extensibility) and provides a high-creativity co-op mode without breaking engine invariants.
- **Non-goals:** New engine-core simulation mode, true concurrent nested sub-map runtime instances in v1, immediate ranked/competitive asymmetric PvP, mandatory hero-campaign persistence for v1.
- **Invariants preserved:** Same deterministic sim and `PlayerOrder` pipeline, same pluggable netcode/input boundaries, no game-specific engine-core assumptions. Role-scoped control boundaries are enforced by D012's order validation layer — orders targeting entities outside a player's assigned `ControlScopeRef` are rejected deterministically. All support request approvals, denials, and status transitions that affect sim state flow through the `PlayerOrder` pipeline; UI-only status hints (e.g., "pending" display) may be client-local. Request anti-spam cooldowns are sim-enforced (via D012 order validation rate checks) to prevent modified-client spam.
- **Defaults / UX behavior:** v1 is `1 Commander + 1 FieldOps` tuned, PvE-first, same-map with optional authored portal micro-ops, role-critical interactions always visible + shortcut-accessible.
- **Compatibility / Export impact:** IC-native feature set; D066 should warn/block RA1/OpenRA export for asymmetric role HUD/permission/support patterns beyond simple scripted approximations.
- **Public interfaces / types:** `AsymCoopModeConfig`, `AsymRoleSlot`, `RoleAwareObjective`, `SupportRequest`, `SupportRequestUpdate`, `MatchFieldProgressionConfig`, `PortalOpsPolicy`
- **Affected docs:** `src/decisions/09f-tools.md`, `src/decisions/09g-interaction.md`, `src/17-PLAYER-FLOW.md`, `src/decisions/09c-modding.md`, `src/decisions/09e-community.md`, `src/modding/campaigns.md`
- **Revision note summary:** None
- **Keywords:** asymmetric co-op, commander ops, field ops, support requests, role HUDs, joint objectives, portal micro-ops, PvE co-op template

### Problem

Classic RTS co-op usually means "two players play the same base-builder role." That works, but it misses a different style of co-op fantasy:

- one player commands the war effort (macro/base/production/support)
- another player runs a tactical squad (frontline or infiltration ops)
- both must coordinate timing, resources, and objectives to win

IC can support this without adding a new engine mode because the required pieces already exist or are planned:
- D038 scenario templates + modules + per-player objectives + co-op slots
- D059 pings/chat/voice/markers
- D065 role-aware onboarding and quick reference
- D038 `Map Segment Unlock` and `Sub-Scenario Portal` for multi-phase and infiltration flow
- D021 campaign state for future persistent variants

The missing piece is a **canonical design contract** so these scenarios are consistent, testable, and discoverable.

### Decision

Define a built-in IC-native template family (working name):

- **Commander & Field Ops Co-op**

This is an IC-native **scenario/game-mode template + authoring toolkit**. It is **not** a new engine-core simulation mode.

#### Player-facing naming (D070 naming guidance)

- **Canonical/internal spec name:** `Commander & Field Ops` (used in D070 schemas/docs/tooling)
- **Player-facing recommended name:** `Commander & SpecOps`
- **Acceptable community aliases:** `Commando Skirmish`, `Joint Ops`, `Plus Commando` (Workshop tags / server names), but official UI should prefer one stable label for onboarding and matchmaking discoverability

**Why split naming:** "Field Ops" is a good systems label (broad enough for Tanya/Spy/Engineer squads, artillery detachments, VIP escorts, etc.). "SpecOps" is a clearer and more exciting player-facing fantasy.

#### D070 Player-Facing Naming Matrix (official names vs aliases)

Use one **stable official UI name** per mode for onboarding/discoverability, while still accepting community aliases in Workshop tags, server names, and discussions.

| Mode Family | Canonical / Internal Spec Name | Official Player-Facing Name (Recommended) | Acceptable Community Aliases | Notes |
| --- | --- | --- | --- | --- |
| Asymmetric co-op (D070 baseline) | `Commander & Field Ops` | `Commander & SpecOps` | `Commando Skirmish`, `Joint Ops`, `Plus Commando` | Keep one official UI label for lobby/browser/tutorial text |
| Commander-avatar assassination (D070-adjacent) | `Commander Avatar (Assassination)` | `Assassination Commander` | `Commander Hunt`, `Kill the Commander`, `TA-Style Assassination` | High-value battlefield commander; death policy must be shown clearly |
| Commander-avatar soft influence (D070-adjacent) | `Commander Avatar (Presence)` | `Commander Presence` | `Frontline Commander`, `Command Aura`, `Forward Command` | Prefer soft influence framing over hard control-radius wording |
| Commando survival variant (experimental) | `Last Commando Standing` | `Last Commando Standing` | `SpecOps Survival`, `Commando Survival` | Experimental/prototype label should remain visible in first-party UI while in test phase |

**Naming rule:** avoid leading first-party UI copy with generic trend labels (e.g., "battle royale"). Describe the mode in IC/RTS terms first, and let the underlying inspiration be implicit.

#### v1 Scope (Locked)

- **PvE-first**
- **Shared battlefield first** (same map)
- **Optional `Sub-Scenario Portal` micro-ops**
- **Match-based field progression** (session-local, no campaign persistence required)
- **Mostly split control ownership**
- **Flexible role slot schema**, but first-party missions are tuned for `1 Commander + 1 FieldOps`

### Core Loop (v1 PvE)

#### Commander role

- builds and expands base
- manages economy and production
- allocates strategic support (CAS, recon, reinforcements, extraction windows, etc.)
- responds to Field Ops requests
- advances strategic and joint objectives

#### Field Ops role

- controls an assigned squad / special task force
- executes tactical objectives (sabotage, rescue, infiltration, capture, scouting)
- requests support, reinforcements, or resources from Commander
- unlocks opportunities for Commander objectives (e.g., disable AA, open route, mark target)

**Victory design rule:** win conditions should be driven by **joint objective chains**, not only "destroy enemy base."

### SpecOps Task Catalog (v1 Authoring Taxonomy)

D070 scenarios should draw SpecOps objectives from a reusable task catalog so the mode feels consistent and the Commander can quickly infer the likely war-effort reward.

#### Recommended v1 task categories (SpecOps / Field Ops)

| Task Category | Example SpecOps Objectives | Typical War-Effort Reward (Commander/Team) |
| --- | --- | --- |
| **Economy / Logistics** | Raid depots, steal credits, hijack/capture harvesters, ambush supply convoys | Credits/requisition, enemy income delay, allied convoy bonus |
| **Power Grid** | Sabotage power plants, overload substations, capture power relays | Enemy low power, defense shutdowns, production slowdown |
| **Tech / Research** | Infiltrate labs, steal prototype plans, extract scientists/engineers | Unlock support ability, upgrade, intel, temporary tech access |
| **Expansion Enablement** | Clear mines/AA/turrets from a future base site, secure an LZ/construction zone | Safe second-base location, faster expansion timing, reduced setup cost |
| **Superweapon Denial** | Disable radar uplink, destroy charge relays, sabotage fuel/ammo systems, hack launch control | Delay charge, targeting disruption, temporary superweapon lockout |
| **Terrain / Route Control** | Destroy/repair bridges, open/close gates, collapse tunnels, activate lifts | Route denial, flank opening, timed attack corridor, defensive delay |
| **Infiltration / Sabotage** | Enter base, hack command post, plant charges, disrupt comms | Objective unlock, enemy debuffs, shroud/intel changes |
| **Rescue / Extraction** | Rescue VIPs/civilians/defectors, escort assets to extraction | Bonus funds, faction support, tech intel, campaign flags (via D021 persistent state) |
| **Recon / Target Designation** | Scout hidden batteries, laser-designate targets, mark convoy routes | Commander gets accurate CAS/artillery windows, map reveals |
| **Counter-SpecOps (proposal-only, post-v1 PvP variant)** | Defend your own power/tech sites from infiltrators | Prevent enemy bonuses, protect superweapon/expansion tempo |

#### Design rule: side missions must matter to the main war

A SpecOps task should usually produce one of these outcome types:
- **Economic shift** (credits, income delay, requisition)
- **Capability shift** (unlock/disable support, tech, production)
- **Map-state shift** (new route, segment unlock, expansion access)
- **Timing shift** (delay superweapon, accelerate attack window)
- **Intel shift** (vision, target quality, warning time)

Avoid side missions that are exciting but produce no meaningful war-effort consequence.

### Role Boundaries (Mostly Split Control)

#### Commander owns

- base structures
- production queues and strategic economy actions
- strategic support powers and budget allocation
- reinforcement routing/spawn authorization (as authored by the scenario)

#### Field Ops owns

- assigned squad units
- field abilities / local tactical actions
- objective interactions (hack, sabotage, rescue, extraction, capture)

#### Shared / explicit handoff only

- support requests
- reinforcement requests
- temporary unit attachment/detachment
- mission-scripted overrides (e.g., Commander triggers gate after Field Ops hack)

**Non-goal (v1):** broad shared control over all units.

### Casual Join-In / Role Fill Behavior (Player-Facing Co-op)

One of D070's core use cases is letting a player join a commander as a dedicated SpecOps leader because commandos are often too attention-intensive for a macro-focused RTS player to use well during normal skirmish.

#### v1 policy (casual/custom first)

- D070 scenarios/templates may expose open `FieldOps` role slots that a player can join before match start
- Casual/custom hosts may also allow **drop-in** to an unoccupied `FieldOps` slot mid-match (scenario/host policy)
- If no human fills the role, fallback is scenario-authored:
  - AI control
  - slot disabled + alternate objectives
  - simplified support-only role

**Non-goal (v1):** ranked/asymmetric queueing rules for mid-match role joins.

### Map and Mission Flow (v1)

#### Shared battlefield (default)

The primary play space is one battlefield with authored objective channels:

- **Strategic** (Commander-facing)
- **Field** (Field Ops-facing)
- **Joint** (coordination required)

Missions should use D038 `Map Segment Unlock` for phase transitions where appropriate.

#### Optional infiltration/interior micro-ops (D038 `Sub-Scenario Portal`)

`Sub-Scenario Portal` is the v1 way to support "enter structure / run commando micro-op" moments.

v1 contract:
- portal sequences are **authored optional micro-scenarios**
- **no true concurrent nested runtime instances** are required
- portal exits can trigger objective updates, reinforcements, debuffs, or segment unlocks
- commander may use an authored **Support Console** panel during portal ops, but this is optional content (not a mandatory runtime feature for all portals)

### Match-Based Field Progression (v1)

Field progression in v1 is **session-local**:

- squad templates / composition presets
- requisition upgrades
- limited field role upgrades (stealth/demo/medic/etc.)
- support unlocks earned during the match

This keeps onboarding and balance manageable for co-op skirmish scenarios.

**Later extension:** D021 campaign wrappers may layer persistent squad/hero progression on top (optional "Ops Campaign" style experiences).

### Coordination Layer (D059 Integration Requirement)

D070 depends on D059 providing role-aware coordination presets and request lifecycle UI.

Minimum v1 coordination surfaces:

- Field Ops request wheel / quick actions:
  - `Need Reinforcements`
  - `Need CAS`
  - `Need Recon`
  - `Need Extraction`
  - `Need Funds / Requisition`
  - `Objective Complete`
- Commander response shortcuts:
  - `Approved`
  - `Denied`
  - `On Cooldown`
  - `ETA`
  - `Marking LZ`
  - `Hold Position`
- Typed pings/markers for LZs, CAS targets, recon sectors, extraction points
- Request status lifecycle UI: pending / approved / queued / inbound / failed / cooldown

**Normative UX rule:** Every role-critical interaction must have both a shortcut path and a visible UI path.

### Commander/SpecOps Request Economy (v1)

The request/response loop must be strategic, not spammy. D070 therefore defines a **request economy** layered over D059's communication surfaces.

#### Core request-economy rules (v1)

- **Requests are free to ask, not free to execute.** Field Ops can request support quickly; Commander approval consumes real resources/cooldowns/budget if executed.
- **Commander actions are gated by authored support rules.** CAS/recon/reinforcements/extraction are constrained by cooldowns, budget, prerequisites, and availability windows.
- **Requests can be queued and denied with reasons.** "No" is valid and should be visible (`cooldown`, `insufficient funds`, `not unlocked`, `out of range`, `unsafe LZ`, etc.).
- **Request urgency is a hint, not a bypass.** Urgent requests rise in commander UI priority but do not skip gameplay costs.

#### Anti-spam / clarity guardrails

- duplicate request collapsing (same type + same target window)
- per-field-team request cooldowns for identical asks (configurable, short)
- commander-side quick responses (`On Cooldown`, `ETA`, `Hold`, `Denied`) to reduce chat noise
- request queue prioritization by urgency + objective channel (`Joint` > `Field` side tasks by default, configurable)

#### Reward split rule (v1)

When a SpecOps task succeeds, rewards should be **explicitly split** or categorized so both roles understand the outcome:
- team-wide reward (e.g., bridge destroyed, superweapon delayed)
- commander-side reward (credits, expansion access, support unlock)
- field-side reward (requisition points, temporary gear, squad upgrade unlock)

This keeps the mode from feeling like "Commander gets everything" or "SpecOps is a disconnected mini-game."

### Optional Pacing Layer: Operational Momentum ("One More Phase" Effect)

RTS does not have Civilization-style turns, but D070 scenarios can still create a similar **"one more turn" pull** by chaining near-term rewards into visible medium-term and long-term strategic payoffs. In IC terms, this is an optional pacing layer called **Operational Momentum** (internal shorthand: **"one more phase"**).

#### Core design goal

Create the feeling that:
- one more objective is almost complete,
- completing it unlocks a meaningful strategic advantage,
- and that advantage opens the next near-term opportunity.

This should feel like strategic momentum, not checklist grind.

#### Three-horizon pacing model (recommended)

D070 missions using Operational Momentum should expose progress at three time horizons:

- **Immediate (10-30s):** survive engagement, mark target, hack terminal, hold LZ, escort VIP to extraction point
- **Operational (1-3 min):** disable AA battery, secure relay, clear expansion site, escort convoy, steal codes
- **Strategic (5-15 min):** superweapon delay, command-network expansion, support unlock chain, route control, phase breakthrough

The "one more phase" effect emerges when these horizons are linked and visible.

#### War-Effort / Ops Agenda board (recommended UI concept)

D070 scenarios may define a visible **Operational Agenda** (aka **War-Effort Board**) that tracks 3-5 authored progress lanes, for example:

- `Economy`
- `Power`
- `Intel`
- `Command Network`
- `Superweapon Denial`

Each lane contains authored milestones with explicit rewards (for example: `Recon Sweep unlocked`, `AA disabled for 90s`, `Forward LZ unlocked`, `Enemy charge delayed +2:00`). The board should make the next meaningful payoff obvious without overwhelming the player.

#### Design rules (normative, v1)

- Operational Momentum is an **optional authored pacing layer**, not a requirement for every D070 mission.
- Rewards must be **war-effort meaningful** (economy/power/tech/map-state/timing/intel), not cosmetic score-only filler.
- The system must create **genuine interdependence**, not fake dependency (Commander and Field Ops should each influence at least one agenda lane in co-op variants).
- Objective chains should create "just one more operation" tension without removing clear stopping points.
- "Stay longer for one more objective" decisions are good; hidden mandatory chains are not.
- Avoid timer overload: only the most relevant near-term and next strategic milestone should be foregrounded at once.

#### Extraction-vs-stay risk/reward (optional D070 pattern)

Operational Momentum pairs especially well with authored **Extraction vs Stay Longer** decisions:

- extract now = secure current gains safely
- stay for one more objective/cache/relay = higher reward, higher risk

This is a strong source of replayable tension and should be surfaced explicitly in UI (`reward`, `risk`, `time pressure`) rather than left implicit.

#### Snowball / anti-fun guardrails

To avoid a runaway "winner wins harder forever" loop:

- prefer **bounded** tactical advantages and timed windows over permanent exponential buffs
- keep some comeback-capable objectives valuable for trailing teams/players
- ensure momentum rewards improve options, not instantly auto-win the match
- keep failure in one lane from hard-locking all future agenda progress unless explicitly authored as a high-stakes mission

#### D021 campaign wrapper synergy (optional later extension)

In `Ops Campaign` wrappers (D021), Operational Momentum can bridge mission-to-mission pacing:

- campaign flags track which strategic lanes were advanced (`intel_chain_progress`, `command_network_tier`, `superweapon_delays_applied`)
- the next mission reacts with altered objectives, support availability, route options, or enemy readiness

This preserves the "one more phase" feel across a mini-campaign without turning it into a full grand-strategy layer.

### Authoring Contract (D038 Integration Requirement)

The Scenario Editor (D038) should treat this as a **template + toolkit**, not a one-off scripted mode.

Required authoring surfaces (v1):

- role slot definitions (`Commander`, `FieldOps`, future `CounterOps`, `Observer`)
- ownership/control-scope authoring (who controls which units/structures)
- role-aware objective channels (`Strategic`, `Field`, `Joint`)
- support catalog + requisition rules
- optional **Operational Momentum / Agenda Board** lanes, milestones, reward hooks, and extraction-vs-stay prompts
- request/response simulation in Preview/Test
- portal micro-op integration (using existing D038 portal tooling)
- validation profile for asymmetric missions

#### v1 authoring validation rules (normative)

- both roles must have meaningful actions within the first ~90 seconds
- every request type used by objectives must map to at least one commander action path
- joint objectives must declare role contributions explicitly
- portal micro-ops require timeout/failure return behavior
- no progression-critical hidden chat syntax
- role HUDs must expose shared mission status and teammate state
- if Operational Momentum is enabled, each lane milestone must declare explicit rewards and role visibility
- warn on foreground HUD overload (too many concurrent timers/counters/agenda milestones)

### Public Interfaces / Type Sketches (Spec-Level)

These belong in gameplay/template/UI schema layers, not engine-core sim assumptions.

```rust
pub enum AsymRoleKind {
    Commander,
    FieldOps,
    CounterOps, // proposal-only: deferred asymmetric PvP / defense variants (post-v1, not scheduled)
    Observer,
}

pub struct AsymRoleSlot {
    pub slot_id: String,
    pub role: AsymRoleKind,
    pub min_players: u8,
    pub max_players: u8,
    pub control_scope: ControlScopeRef,
    pub ui_profile: String,  // e.g. "commander_hud", "field_ops_hud"
    pub comm_preset: String, // D059 role comm preset
}

pub struct AsymCoopModeConfig {
    pub id: String,
    pub version: u32,
    pub slots: Vec<AsymRoleSlot>,
    pub role_permissions: Vec<RolePermissionRule>,
    pub objective_channels: Vec<ObjectiveChannelConfig>,
    pub requisition_rules: RequisitionRules,
    pub support_catalog: Vec<SupportAbilityConfig>,
    pub field_progression: MatchFieldProgressionConfig,
    pub portal_ops_policy: PortalOpsPolicy,
    pub operational_momentum: OperationalMomentumConfig, // optional pacing layer ("one more phase")
}

pub enum SupportRequestKind {
    Reinforcements,
    Airstrike,
    CloseAirSupport,
    ReconSweep,
    Extraction,
    ResourceDrop,
    MedicalSupport,
    DemolitionSupport,
}

pub struct SupportRequest {
    pub request_id: u64,
    pub from_player: PlayerId,
    pub field_team_id: String,
    pub kind: SupportRequestKind,
    pub target: SupportTargetRef,
    pub urgency: RequestUrgency,
    pub note: Option<String>,
    pub created_at_tick: u32,
}

pub enum SupportRequestStatus {
    Pending,
    Approved,
    Denied,
    Queued,
    Inbound,
    Completed,
    Failed,
    CooldownBlocked,
}

pub struct SupportRequestUpdate {
    pub request_id: u64,
    pub status: SupportRequestStatus,
    pub responder: Option<PlayerId>,
    pub eta_ticks: Option<u32>,
    pub reason: Option<String>,
}

pub enum ObjectiveChannel {
    Strategic,
    Field,
    Joint,
    Hidden,
}

pub struct RoleAwareObjective {
    pub id: String,
    pub channel: ObjectiveChannel,
    pub visible_to_roles: Vec<AsymRoleKind>,
    pub completion_credit_roles: Vec<AsymRoleKind>,
    pub dependencies: Vec<String>,
    pub rewards: Vec<ObjectiveReward>,
}

pub struct MatchFieldProgressionConfig {
    pub enabled: bool,
    pub squad_templates: Vec<SquadTemplateId>,
    pub requisition_currency: String,
    pub upgrade_tiers: Vec<FieldUpgradeTier>,
    pub respawn_policy: FieldRespawnPolicy,
    pub session_only: bool, // true in v1
}

pub enum ParentBattleBehavior {
    Paused,         // parent sim pauses during portal micro-op (simplest, deterministic)
    ContinueAi,     // parent sim continues with AI auto-resolve (authored, deterministic)
}

pub enum PortalOpsPolicy {
    Disabled,
    OptionalMicroOps {
        max_duration_sec: u16,
        commander_support_console: bool,
        parent_sim_behavior: ParentBattleBehavior,
    },
    // True concurrent nested runtime instances intentionally deferred.
}

pub enum MomentumRewardCategory {
    Economy,
    Power,
    Intel,
    CommandNetwork,
    SuperweaponDelay,
    RouteControl,
    SupportUnlock,
    SquadUpgrade,
    TemporaryWindow,
}

pub struct MomentumMilestone {
    pub id: String,
    pub lane_id: String,
    pub visible_to_roles: Vec<AsymRoleKind>,
    pub progress_target: u32,
    pub reward_category: MomentumRewardCategory,
    pub reward_description: String,
    pub duration_sec: Option<u16>, // for temporary windows/buffs/delays
}

pub struct OperationalMomentumConfig {
    pub enabled: bool,
    pub lanes: Vec<String>, // e.g. economy/power/intel/command_network/superweapon_denial
    pub milestones: Vec<MomentumMilestone>,
    pub foreground_limit: u8,           // UI guardrail; recommended small (2-3)
    pub extraction_vs_stay_enabled: bool,
}
```

### Experimental D070-Adjacent Variant: Last Commando Standing (`SpecOps Survival`)

D070 also creates a natural experimental variant: a **SpecOps-focused survival / last-team-standing** mode where each player (or squad) fields a commando-led team and fights to survive while contesting neutral objectives.

This is **not** the D070 baseline and should not delay the Commander/Field Ops co-op path. It is a **prototype-first D070-adjacent template** that reuses D070 building blocks:
- Field Ops-style squad control and match-based progression concepts
- SpecOps Task Catalog categories (economy/power/tech/route/intel objectives)
- D038 phase/hazard scripting and `Map Segment Unlock`
- D059 communication/pings (and optional support requests if the scenario includes support powers)

#### Player-facing naming guidance (experimental)

- **Recommended player-facing names:** `Last Commando Standing`, `SpecOps Survival`
- Avoid marketing it as a generic "battle royale" mode in first-party UI; the fantasy should stay RTS/Red-Alert-first.

#### v1 experimental mode contract (prototype scope)

- Small-to-medium player counts (prototype scale, not mass BR scale)
- Each player/team starts with:
  - one elite commando / hero-like operative
  - a small support squad (author-configured)
- Objective: **last team standing**, with optional score/time variants for custom servers
- Neutral AI-guarded objectives and caches provide warfighting advantages
- Short rounds are preferred for early playtests (clarity > marathon runtime)

**Non-goals (v1 experiment):**
- 50-100 player scale
- deep loot-inventory simulation
- mandatory persistent between-match progression
- ranked/competitive queueing before fun/clarity is proven

#### Hazard contraction model (RA-flavored "shrinking zone")

Instead of a generic circle-only battle royale zone, D070 experimental survival variants should prefer authored IC/RA-themed hazard contraction patterns:

- radiation storm sectors
- artillery saturation zones
- chrono distortion / instability fields
- firestorm / gas spread
- power-grid blackout sectors affecting vision/support

Design rules:
- hazard phases must be deterministic and replay-safe (scripted or seed-derived)
- hazard warnings must be telegraphed before activation (map markers, timers, EVA text, visual preview)
- hazard contraction should pressure movement and conflict, not cause unavoidable instant deaths without warning
- custom maps may use non-circular contraction shapes if readability remains clear

#### Neutral objective catalog (survival variant)

Neutral objectives should reward tactical risk and create reasons to move, not just camp.

Recommended v1 objective clusters:
- **Supply cache / depot raid** -> requisition / credits / ammo/consumables (if the scenario uses consumables)
- **Power node / relay** -> temporary shielded safe zone, radar denial, or support recharge bonus
- **Tech uplink / command terminal** -> recon sweep, target intel, temporary support unlock
- **Bridge / route control** -> route denial/opening, forced pathing shifts, ambush windows
- **Extraction / medevac point** -> squad recovery, reinforcement call opportunity, revive token (scenario-defined)
- **VIP rescue / capture** -> bonus requisition/intel or temporary faction support perk
- **Superweapon relay sabotage** (optional high-tier event) -> removes/limits a late-phase map threat or grants timing relief

#### Reward economy (survival variant)

Rewards should be explicit and bounded to preserve tactical clarity:

- **Team requisition** (buy squad upgrades / reinforcements / support consumables)
- **Temporary support charges** (smoke, recon sweep, limited CAS, decoy drop)
- **Intel advantages** (brief reveal, hazard forecast, cache reveal)
- **Field upgrades** (speed/stealth/demo/medic tier improvements; match-only in v1)
- **Positioning advantages** (temporary route access, defended outpost, extraction window)

Guardrails:
- avoid snowball rewards that make early winners uncatchable
- prefer short-lived tactical advantages over permanent exponential scaling
- ensure at least some contested objectives remain valuable to trailing players

#### Prototype validation metrics (before promotion)

D070 experimental survival variants should remain Workshop/prototype-first until these are tested:

- median round length (target band defined per map size; avoid excessive early downtime)
- time-to-first meaningful encounter
- elimination downtime (spectator/redeploy policy effectiveness)
- objective contest rate (are players moving, or camping?)
- hazard-related deaths vs combat-related deaths (hazard should pressure, not dominate)
- perceived agency/fun ratings for eliminated and surviving players
- clarity of reward effects (players can explain what a captured objective changed)

If the prototype proves consistently fun and readable, it can be promoted to a first-class built-in template (still IC-native, not engine-core).

### D070-Adjacent Mode Family: Commander Avatar on Battlefield (`Assassination` / `Commander Presence`)

Another D070-adjacent direction that fits IC well is a **Commander Avatar** mode family inspired by Total Annihilation / Supreme Commander-style commander units: a high-value commander unit exists on the battlefield, and its position/survival materially affects the match.

This should be treated as an **optional IC-native mode/template family**, not a default replacement for classic RA skirmish.

#### Why this makes sense for IC

- It creates tactical meaning for commander positioning without requiring a new engine-core mode.
- It composes naturally with D070's role split (`Commander` + `SpecOps`) and support/request systems.
- It gives designers a place to use hero-like commander units without forcing hero gameplay into standard skirmish.
- It reuses existing IC building blocks: D038 templates, D059 communication/pings, D065 onboarding/Quick Reference, D021 campaign wrappers.

#### v1 recommendation: start with **Assassination Commander**, not hard control radius

Start with a simple, proven variant:

- each player has a **Commander Avatar** unit (or equivalent named commander entity)
- **commander death = defeat** (or authored "downed -> rescue timer" variant)
- commander may have special build/support/command powers depending on the scenario/module

This is easy to explain, easy to test, and creates immediate battlefield tension.

#### Command Presence (soft influence) — preferred over hard control denial

A more advanced variant is **Commander Presence**: the commander avatar's position provides tactical/strategic advantages, but does **not** hard-lock unit control outside a radius in v1.

Preferred v1/v2 presence effects (soft, readable, and less frustrating):
- support ability availability/quality (CAS/recon radius, reduced error, shorter ETA)
- local radar/command uplink strength
- field repair / reinforcement call-in eligibility
- morale / reload / response bonuses near the commander (scenario-defined)
- local build/deploy speed bonuses (especially for forward bases/outposts)

**Avoid in v1:** "you cannot control units outside commander range." Hard control denial often feels like input punishment and creates anti-fun edge cases in macro-heavy matches.

#### Command Network map-control layer (high-value extension)

A Commander Avatar mode becomes much richer when paired with **command network objectives**:
- comm towers / uplinks / radar nodes
- forward command posts
- jammers / signal disruptors
- bridges and routes that affect commander movement/support timing

This ties avatar positioning to map control and creates natural SpecOps tasks (sabotage, restore, hold, infiltrate).

#### Risk / counterplay guardrails (snipe-meta prevention)

Commander Avatar modes are fun when the commander matters, but they can devolve into pure "commander snipe" gameplay if not designed carefully.

Recommended guardrails:
- clear commander-threat warnings (D059 markers/EVA text)
- authored anti-snipe defenses / detectors / patrols / decoys
- optional `downed` or rescue-timer defeat policy in casual/co-op variants
- rewards for frontline commander presence (so hiding forever is suboptimal)
- multiple viable win paths (objective pressure + commander pressure), not snipe-only

#### D070 + Commander Avatar synergy (Commander & SpecOps)

This mode family composes especially well with D070:
- the Commander player has a battlefield avatar that matters
- the SpecOps player can escort, scout, or create openings for the Commander Avatar
- enemy SpecOps/counter-ops can threaten command networks and assassination windows

This turns "protect the commander" into a real co-op role interaction instead of background flavor.

#### D021 composition pattern: "Rescue the Commander" mini-campaign bootstrap

A strong campaign/mini-campaign pattern is:

1. **SpecOps rescue mission** (no base-building yet)
   - the commander is captured / isolated / missing
   - the player controls a commando/squad to infiltrate and rescue them
2. **Commander recovered** -> campaign flag unlocks command capability
   - e.g., `Campaign.set_flag("commander_recovered", true)`
3. **Follow-up mission(s)** unlock:
   - base construction / production menus
   - commander support powers
   - commander avatar presence mechanics
   - broader army coordination and reinforcement requests

This is a clean way to teach the player the mode in layers while making the commander feel narratively and mechanically important.

Design rule:
- if command/building is gated behind commander rescue, the mission UI must explain the restriction clearly and show the unlock when it happens (no hidden "why can't I build?" confusion).

#### D038 template/tooling expectation (authoring support)

D038 should support this family as template/preset combinations, not hardcoded logic:
- **Assassination Commander** preset (commander death policy + commander unit setup)
- **Commander Presence** preset (soft influence profiles and command-network objective hooks)
- optional **D070 Commander & SpecOps + Commander Avatar** combo preset
- validation for commander-death policy, commander spawn safety, and anti-snipe/readability warnings

#### Spec-Level Type Sketches (D070-adjacent)

```rust
pub enum CommanderAvatarMode {
    Disabled,
    Assassination,     // commander death = defeat (or authored downed policy)
    Presence,          // commander provides soft influence bonuses
    AssassinationPresence, // both
}

pub enum CommanderAvatarDeathPolicy {
    ImmediateDefeat,
    DownedRescueTimer { timeout_sec: u16 },
    TeamVoteSurrenderWindow { timeout_sec: u16 },
}

pub struct CommanderPresenceRule {
    pub effect_id: String,              // e.g. "cas_radius_bonus"
    pub radius_cells: u16,
    pub requires_command_network: bool,
    pub value_curve: PresenceValueCurve, // authored falloff/profile
}

pub struct CommanderAvatarConfig {
    pub mode: CommanderAvatarMode,
    pub commander_unit_tag: String,      // named unit / archetype ref
    pub death_policy: CommanderAvatarDeathPolicy,
    pub presence_rules: Vec<CommanderPresenceRule>,
    pub command_network_objectives: Vec<String>, // objective IDs / tags
}
```

### Failure Modes / Guardrails

Key risks that must be validated before promoting the mode:

- Commander becomes a "request clerk" instead of a strategic player
- Field Ops suffers downtime or loses agency
- Communication UI is too slow under pressure
- Resource/support gating creates deadlocks or unwinnable states
- Portal micro-ops cause role disengagement
- Commander Avatar variants collapse into snipe-only meta or punitive control denial

D070 therefore requires a prototype/playtest phase before claiming this as a polished built-in mode.

#### Recommended proving format: D070 mini-campaign vertical slice ("Ops Prologue")

The preferred way to validate D070 before promoting it as a polished built-in mode is a short **mini-campaign vertical slice** rather than only sandbox/skirmish test maps.

Why a mini-campaign is preferred:
- teaches the mode in layers (SpecOps first -> Commander return -> joint coordination)
- validates D021 campaign transitions/flags with D070 gameplay
- produces better player-facing onboarding and playtest data than a single "all mechanics at once" scenario
- stress-tests D059 request UX and D065 role onboarding in realistic narrative pacing

Recommended proving arc (3-4 missions):
1. **Rescue the Commander** (SpecOps-focused, no base-building)
2. **Establish Forward Command** (Commander returns, limited support/building)
3. **Joint Operation** (full Commander + SpecOps loop)
4. *(Optional)* **Counterstrike / Defense** (counter-specops pressure, anti-snipe/readability checks)

This mini-campaign can be shipped internally first as a validation artifact (design/playtest vertical slice) and later adapted into a player-facing "Ops Prologue" if playtests confirm the mode is fun and readable.

### Test Cases (Design Acceptance)

1. `1 Commander + 1 FieldOps` mission gives both roles meaningful tasks within 90 seconds.
2. Field Ops request → commander approval/denial → status update loop is visible and understandable.
3. A shared-map mission phase unlock depends on Field Ops action and changes Commander strategy options.
4. Portal micro-op returns with explicit outcome effects and no undefined parent-state behavior.
5. Flexible slot schema supports `1 Commander + 2 FieldOps` configuration without breaking validation (even if not first-party tuned).
6. Role boundaries prevent accidental full shared control unless explicitly authored.
7. Field progression works without campaign persistence.
8. D065 role onboarding and Quick Reference can present role-specific instructions via semantic action prompts.
9. A D070 mission includes at least one SpecOps task that yields a meaningful war-effort reward (economy/power/tech/route/timing/intel), not just side-score.
10. Duplicate support requests are collapsed/communicated clearly so Commander UI remains usable under pressure.
11. Casual/custom drop-in to an open `FieldOps` role follows the authored fallback/join policy without breaking mission state.
12. A D070 scenario can define both commander-side and field-side rewards for a single SpecOps objective, and both are surfaced clearly in UI/debrief.
13. An Assassination/Commander Avatar variant telegraphs commander threat and defeat policy clearly (instant defeat vs downed/rescue timer).
14. A Commander Presence variant yields meaningful commander-positioning decisions without hard input-lock behavior in v1.
15. A "Rescue the Commander" mini-campaign bootstrap cleanly gates command/building features behind an explicit D021 flag and unlock message.
16. A D070 mini-campaign vertical slice (3-4 missions) demonstrates layered onboarding and produces better role-clarity/playtest evidence than a single all-in-one sandbox scenario.
17. A D070 mission using Operational Momentum shows at least one clear near-term milestone and one visible strategic payoff without creating HUD timer overload.
18. An extraction-vs-stay decision (if authored) surfaces explicit reward/risk/time-pressure cues and results in a legible war-effort consequence.

### Alternatives Considered

- **Hardcode a new engine-level asymmetric mode** (rejected — violates IC's engine/gameplay separation; this composes from existing systems)
- **Ship PvP asymmetric (2v2 commander+ops vs commander+ops) first** (rejected — too many balance and grief/friction variables before proving co-op fun)
- **Require campaign persistence/hero progression in v1** (rejected — increases complexity and onboarding cost; defer to D021 wrapper extension)
- **Treat SpecOps as "just a hero unit in normal skirmish"** (rejected — this is exactly the attention-overload problem D070 is meant to solve; the dedicated role and request economy are the point)
- **Start Commander Avatar variants with hard unit-control radius restrictions** (rejected for v1 — high frustration risk; start with soft presence bonuses and clear support gating)
- **Require true concurrent nested sub-map simulation for infiltration** (rejected for v1 — high complexity, low proof requirement; use D038 portals first)

### Relationship to Existing Decisions

- **D038 (Scenario Editor):** D070 is primarily realized as a built-in game-mode template + authoring toolkit with validation and preview support.
- **D038 Game Mode Templates:** TA-style commander avatar / assassination / command-presence variants should be delivered as optional presets/templates, not core skirmish rule changes.
- **D059 (Communication):** Role-aware requests, responses, and typed coordination markers are a D059 extension, not a separate communication system.
- **D065 (Tutorial / Controls / Quick Reference):** Commander and Field Ops role onboarding use the same semantic input action catalog and quick-reference infrastructure.
- **D021 (Branching Campaigns):** Campaign persistence is optional and deferred for "Ops Campaign" variants; v1 remains session-based progression.
- **D021 Campaign Patterns:** "Rescue the Commander" mini-campaign bootstraps are a recommended composition pattern for unlocking command/building capabilities and teaching layered mechanics.
- **D021 Hero Toolkit:** A future `Ops Campaign` variant may use D021's built-in hero toolkit for a custom SpecOps leader (e.g., Tanya-like or custom commando actor) with persistent skills between matches/missions. This is optional content-layer progression, not a D070 baseline requirement.
- **D021 Pacing Composition:** D070's optional Operational Momentum layer can feed D021 campaign flags/state to preserve "one more phase" pacing across an `Ops Campaign` mini-campaign arc.
- **D066 (Export):** D070 scenarios are IC-native and expected to have limited/no RA1/OpenRA export fidelity for role/HUD/request orchestration.
- **D030/D049 (Workshop):** D070 scenarios/templates publish as normal content packages. No special runtime/network privileges are granted by Workshop packaging.

### Phase

- **Prototype / validation first (post-6b planning):** paper specs + internal playtests for `1 Commander + 1 FieldOps`, ideally via a short D070 mini-campaign vertical slice ("Ops Prologue" style proving arc)
- **Optional pacing-layer validation:** Operational Momentum / "one more phase" should be proven in the same prototype phase before being treated as a recommended D070 preset pattern.
- **Built-in PvE template v1:** after role-clarity and communication UX are validated
- **Later expansions:** multiple field squads, D021 `Ops Campaign` wrappers (including optional persistent hero-style SpecOps leaders), and asymmetric PvP variants (`CounterOps`)
