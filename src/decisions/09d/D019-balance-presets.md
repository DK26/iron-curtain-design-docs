## D019: Switchable Balance Presets

**Decision:** Ship five balance presets as first-class YAML rule sets: Classic (EA source values, default), OpenRA (competitive rebalance), Remastered (Petroglyph's 2020 tweaks), IC Default (spectacle + competitive viability, patched per-season), and Custom (modder-created via Workshop). Selectable per-game in lobby.

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
| Engine version pin | `ENGINE_VERSION` in `mod.config`                   | `engine.version` in `mod.toml` with semver       |
| Engine management  | `fetch-engine.sh` downloads + compiles from source | Engine ships as binary crate, auto-resolved      |
| Build/run          | `Makefile` + shell scripts (requires Python, .NET) | `ic` CLI — single Rust binary, zero dependencies |
| Mod manifest       | `mod.yaml` in MiniYAML                             | `mod.toml` with typed serde schema (D067)        |
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
ic mod convert             # batch-convert mod assets between legacy/modern formats (D020 § Conversion Command Boundary)
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

> **CLI design principle (from Fossilize):** Each subcommand does one focused thing well — validate, convert, inspect, verify. Valve's Fossilize toolchain (`fossilize-replay`, `fossilize-merge`, `fossilize-convert`, `fossilize-list`) demonstrates that a family of small, composable CLI tools is more useful than a monolithic Swiss Army knife. The `ic` CLI follows this pattern: `ic mod check` validates, `ic mod convert` batch-converts mod assets between legacy and modern formats (`.shp` → PNG, `.aud` → OGG — see D020 § Conversion Command Boundary), `ic replay parse` extracts data, `ic replay inspect` summarizes. Single-file text conversion (MiniYAML → YAML) is a separate tool: `cnc-formats convert` (game-agnostic, schema-neutral — see D076). Each subcommand is independently useful and composable via shell pipelines. See `research/valve-github-analysis.md` § 3.3 and § 6.2.

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
2. **Bi-directional:** The alias registry is used during YAML parsing (OpenRA names accepted, resolved to IC-native names at load time by `ra-formats`). `cnc-formats convert --from miniyaml --to yaml` performs schema-neutral MiniYAML→YAML structural conversion only — alias resolution is a separate `ra-formats` concern. Both OpenRA and IC-native representations are valid input.
3. **Deprecation warnings:** When an OpenRA alias is used, the parser emits a warning: `"Armament" is accepted but deprecated; prefer "combat"`. Warnings can be suppressed per-mod via `mod.toml` setting.
4. **No runtime cost:** Aliases resolve during YAML deserialization (load time only). The ECS never sees alias names — only canonical IC component types.

**Rationale:**
- Reduces the YAML migration from "convert everything" to "drop in and play, clean up later"
- Respects invariant #8 ("the community's existing work is sacred") at the data vocabulary layer, not just binary formats
- Zero runtime cost — purely a deserialization convenience
- Runtime alias resolution means dropped-in OpenRA mods work immediately — no manual renaming or pre-conversion step required
- Modders can learn IC-native names gradually as they edit files

**Alternatives considered:**
- IC-native names only (rejected — unnecessary migration barrier for thousands of existing mod files)
- Adopt OpenRA's names wholesale (rejected — some OpenRA names are poorly chosen or C#-specific; IC benefits from cleaner naming)
- Converter handles everything (rejected — modders still need to re-learn names for new content; aliases let them use familiar names forever)

**Phase:** Phase 0 (alias registry built alongside `ra-formats` YAML parser). Phase 6a (deprecation warnings configurable in `mod.toml`).

---


---

## Sub-Pages

| Section               | Topic                                                                                                                                                                                                   | File                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Lua API & Integration | D024 Lua API superset of OpenRA, D023 OpenRA vocabulary compatibility, D027 canonical enum compat, D028 condition/multiplier systems, D029 cross-game component library, rationale, alternatives, phase | [D019-lua-api-integration.md](D019/D019-lua-api-integration.md) |
