# Mod API Stability & Compatibility

The mod-facing API — YAML schema, Lua globals, WASM host functions — is a **stability surface** distinct from engine internals. Engine crates can refactor freely between releases; the mod API changes only with explicit versioning and migration support. This section documents how IC avoids the Minecraft anti-pattern (community fragmenting across incompatible versions) and follows the Factorio model (stable API, deprecation warnings, migration scripts).

**Lesson from Minecraft:** Forge and Fabric have no stable API contract. Every Minecraft update breaks most mods, fragmenting the community into version silos. Popular mods take months to update. Players are forced to choose between new game content and their mod setup. This is the single biggest friction in Minecraft modding.

**Lesson from Factorio:** Wube publishes a versioned mod API with explicit stability guarantees. Breaking changes are announced releases in advance, include migration scripts, and come with deprecation warnings that fire during `mod check`. Result: 5,000+ mods on the portal, most updated within days of a new game version.

**Lesson from Stardew Valley:** SMAPI (Stardew Modding API) acts as an adapter layer between the game and mods. When the game updates, SMAPI absorbs the breaking changes — mods written against SMAPI's stable surface continue to work even when Stardew's internals change. A single community-maintained compatibility layer protects thousands of mods.

**Lesson from ArmA/OFP:** Bohemia Interactive's SQF scripting language has remained backwards-compatible across 25+ years of releases (OFP → ArmA → ArmA 2 → ArmA 3). Scripts written for Operation Flashpoint in 2001 still execute in ArmA 3 (2013+). This extraordinary stability is a primary reason the ArmA modding community survived multiple engine generations — modders invest in learning an API only when they trust it won't be discarded. Conversely, ArmA's lack of a formal deprecation process meant obsolete commands accumulated indefinitely. IC applies both lessons: backwards compatibility within major versions (the ArmA principle) combined with explicit deprecation cycles (the Factorio principle) so the API stays clean without breaking existing work.

### Stability Tiers

| Surface                                                                                                            | Stability Guarantee         | Breaking Change Policy                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **YAML schema** (unit fields, weapon fields, structure fields)                                                     | Stable within major version | Fields can be added (non-breaking). Renaming or removing a field requires a deprecation cycle: old name works for 2 minor versions with a warning, then errors. |
| **Lua API globals** (D024, 16 OpenRA-compatible globals + IC extensions)                                           | Stable within major version | New globals can be added. Existing globals never change signature. Deprecated globals emit warnings for 2 minor versions.                                       |
| **WASM host functions** (host function namespaces: `ic_render_*`, `ic_pathfind_*`, `ic_ai_*`, `ic_format_*`, etc.) | Stable within major version | New host functions can be added. Existing function signatures never change. Deprecated functions continue to work with warnings.                                |
| **OpenRA aliases** (D023 vocabulary layer)                                                                         | Permanent                   | Aliases are never removed — they can only accumulate. An alias that worked in IC 0.3 works in IC 5.0.                                                           |
| **Engine internals** (Bevy systems, component layouts, crate APIs)                                                 | No guarantee                | Can change freely between any versions. Mods never depend on these directly.                                                                                    |

### Migration Support

When a breaking change is unavoidable (major version bump):

- **`ic mod migrate`** — CLI command that auto-updates mod YAML/Lua to the new schema. Handles field renames, deprecated API replacements, and schema restructuring. Inspired by `rustfix` and Factorio's migration scripts.
- **Deprecation warnings in `ic mod check`** — flag usage of deprecated fields, globals, or host functions before they become errors. Shows the replacement.
- **Changelog with migration guide** — every release that touches the mod API surface includes a "For Modders" section with before/after examples.
- **SDK Migration Workbench (D038 UI wrapper)** — the SDK exposes the same migration backend as a read-only preview/report flow in Phase 6a ("Upgrade Project"), then an apply mode with rollback snapshots in Phase 6b. The SDK does not fork migration logic; it shells into the same engine that powers `ic mod migrate`.

### Versioned Mod API (Independent of Engine Version)

The mod API version is declared separately from the engine version:

```toml
# mod.toml
[engine]
version = "^0.5.0"          # engine version (can change rapidly)
mod_api = "^1.0"            # mod API version (changes slowly)
```

A mod targeting `mod_api: "^1.0"` works on any engine version that supports mod API 1.x. The engine can ship 0.5.0 through 0.9.0 without breaking mod API 1.0 compatibility. This decoupling means engine development velocity doesn't fragment the mod ecosystem.

### Compatibility Adapter Layer

Internally, the engine maintains an adapter between the mod API surface and engine internals — structurally similar to Stardew's SMAPI:

```
  Mod code (YAML / Lua / WASM)
        │
        ▼
  ┌─────────────────────────┐
  │  Mod API Surface        │  ← versioned, stable
  │  (schema, globals, host │
  │   functions)            │
  ├─────────────────────────┤
  │  Compatibility Adapter  │  ← translates stable API → current internals
  │  (ic-script crate)      │
  ├─────────────────────────┤
  │  Engine Internals       │  ← free to change
  │  (Bevy ECS, systems)    │
  └─────────────────────────┘
```

When engine internals change, the adapter is updated — mods don't notice. This is the same pattern that makes OpenRA's trait aliases (D023) work: the public YAML surface is stable, the internal component routing can change.

**Phase:** Mod API versioning and `ic mod migrate` in Phase 4 (alongside Lua/WASM runtime). Compatibility adapter formalized in Phase 6a (when mod ecosystem is large enough to matter). Deprecation warnings from Phase 2 onward (YAML schema stability starts early). The SDK's Migration Workbench UI ships in Phase 6a as a preview/report wrapper and gains apply/rollback mode in Phase 6b.
