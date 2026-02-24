## D023: OpenRA Vocabulary Compatibility Layer

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 0–1 (alias registry ships with format loading)
- **Execution overlay mapping:** `M0.CORE.FORMAT_FOUNDATION` (P-Core); alias registry is part of the YAML loading pipeline
- **Deferred features / extensions:** none
- **Canonical for:** OpenRA trait-name-to-IC-component alias resolution
- **Scope:** `ra-formats` crate (`alias.rs`), YAML loading pipeline
- **Decision:** OpenRA trait names are accepted as YAML aliases for IC-native component keys. Both `Armament:` (OpenRA) and `combat:` (IC) resolve to the same component. Aliases emit a deprecation warning (suppressible per-mod). The alias registry maps all ~130 OpenRA trait names.
- **Why:**
  - Zero migration friction — existing OpenRA YAML loads without renaming any key
  - OpenRA mods represent thousands of hours of community work; requiring renames wastes that effort
  - Deprecation warnings guide modders toward IC-native names without forcing immediate changes
  - Alias resolution happens once at load time — zero runtime cost
- **Non-goals:** Supporting OpenRA's C# trait *behavior* (only the YAML key names are aliased, not the runtime logic). IC components have their own implementation.
- **Out of current scope:** Automatic batch renaming tool (could be added to `ic mod import` later)
- **Invariants preserved:** Deterministic sim (alias resolution is load-time-only, produces identical component data). No C#.
- **Compatibility / Export impact:** OpenRA YAML loads unmodified. IC-native export always uses canonical IC names.
- **Public interfaces / types / commands:** `AliasRegistry`, `alias.rs` in `ra-formats`
- **Affected docs:** `02-ARCHITECTURE.md` § Component Model, `04-MODDING.md` § Vocabulary Aliases
- **Keywords:** vocabulary, alias, trait name, OpenRA compatibility, YAML alias, Armament, combat, component mapping

---

### Alias Resolution

Both forms are valid input:

```yaml
# OpenRA-style (accepted via alias)
rifle_infantry:
    Armament:
        Weapon: M1Carbine
    Valued:
        Cost: 100

# IC-native style (preferred for new content)
rifle_infantry:
    combat:
        weapon: m1_carbine
    buildable:
        cost: 100
```

When an alias is used, parsing succeeds with a deprecation warning: `"Armament" is accepted but deprecated; prefer "combat"`. Warnings can be suppressed per-mod via `suppress_alias_warnings: true` in the mod manifest.

### Sample Alias Table (excerpt)

| OpenRA Trait Name | IC Component Key | Notes |
|-------------------|------------------|-------|
| `Armament` | `combat` | Weapon attachment |
| `Valued` | `buildable` | Cost and build time |
| `Mobile` | `mobile` | Same name (no alias needed) |
| `Health` | `health` | Same name |
| `Building` | `building` | Same name |
| `Selectable` | `selectable` | Same name |
| `Aircraft` | `mobile` + `locomotor: fly` | Decomposed into standard mobile component |
| `Harvester` | `harvester` | Same name |
| `WithSpriteBody` | `sprite_body` | Rendering component |
| `RenderSprites` | `sprite_renderer` | Rendering component |

The full alias registry (~130 entries) lives in `ra-formats::alias` and is generated from the OpenRA trait catalog in `11-OPENRA-FEATURES.md`.

### Stability Guarantee

**Aliases are permanent.** Once an alias is registered, it is never removed. This ensures that OpenRA mods loaded today will still load in any future IC version. New aliases may be added as OpenRA evolves.

### Rationale

OpenRA's trait naming convention (`PascalCase`, often matching internal C# class names like `Armament`, `Valued`, `WithSpriteBody`) differs from IC's convention (`snake_case` component keys like `combat`, `buildable`, `sprite_body`). Rather than forcing modders to rename every key in every YAML file, IC accepts both forms and resolves aliases at load time. This is the same approach used by web frameworks (HTML attribute aliases), database ORMs (column name mapping), and configuration systems (environment variable aliases).
