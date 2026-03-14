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

**Decision:** Support loading MiniYAML directly at runtime as a fallback format in `ra-formats`. When the engine encounters tab-indented files with `^` inheritance or `@` suffixes, it auto-converts in memory using `cnc-formats`'s clean-room MiniYAML parser (D076, MIT/Apache-2.0). The `cnc-formats convert` CLI subcommand still exists for permanent on-disk migration, but is no longer a prerequisite for loading mods.

**Revision of D003:** D003 ("Real YAML, not MiniYAML") remains the canonical format. All IC-native content uses standard YAML. D025 adds a compatibility loader — it does not change what IC produces, only what it accepts.

**Key design points:**

1. **Format detection:** `ra-formats` checks the first few lines of each file. Tab-indented content with no YAML indicators triggers the MiniYAML path, which calls `cnc-formats::miniyaml::parse()`.
2. **In-memory conversion:** MiniYAML is parsed to an intermediate tree, then resolved to standard YAML structs. `cnc-formats convert --format miniyaml --to yaml` performs only the structural MiniYAML→YAML conversion (schema-neutral, standalone crate — D076). The runtime path in `ra-formats` goes further: it also applies alias resolution (D023).
3. **Combined with D023:** OpenRA trait name aliases (D023) apply after MiniYAML parsing — so the full runtime chain is: MiniYAML → intermediate tree (via `cnc-formats`) → alias resolution (via `ra-formats`) → typed Rust structs.
4. **Performance:** Conversion adds ~10-50ms per mod at load time (one-time cost). Cached after first load.
5. **Warning output:** Console logs `"Loaded MiniYAML file rules.yaml — consider converting to standard YAML with 'cnc-formats convert --format miniyaml --to yaml rules.yaml'".

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

**Phase:** Phase 0 (MiniYAML parser already needed for the `cnc-formats` CLI; making it a runtime loader is minimal additional work).

---

### D026 — OpenRA Mod Manifest Compatibility

**Decision:** `ra-formats` can parse OpenRA's `mod.yaml` manifest format and auto-map it to IC's mod structure at load time. Combined with D023 (aliases), D024 (Lua API), and D025 (MiniYAML loading), this means a modder can point IC at an existing OpenRA mod directory and it loads — no restructuring needed.

**Key design points:**

1. **Manifest parsing:** OpenRA's `mod.yaml` declares `Packages`, `Rules`, `Sequences`, `Cursors`, `Chrome`, `Assemblies`, `ChromeLayout`, `Weapons`, `Voices`, `Notifications`, `Music`, `Translations`, `MapFolders`, `SoundFormats`, `SpriteFormats`. IC maps each section to its equivalent concept.
2. **Directory convention mapping:** OpenRA mods use `rules/`, `maps/`, `sequences/` etc. IC maps these to its own layout at load time without copying files.
3. **Unsupported sections flagged:** `Assemblies` (C# DLLs) cannot load — these are flagged as warnings listing which custom traits are unavailable and what WASM alternatives exist.
4. **Partial loading:** A mod with unsupported C# traits still loads — units using those traits get a visual placeholder and a "missing trait" debug overlay. The mod is playable with reduced functionality.
5. **`ic mod import`:** CLI command that reads an OpenRA mod directory and generates an IC-native `mod.toml` with proper structure, converting files to standard YAML and flagging C# dependencies for WASM migration.

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
   - `Conditions` component: `BTreeMap<ConditionId, u32>` (ref-counted named conditions per entity; `BTreeMap` per ic-sim deterministic collection policy)
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
