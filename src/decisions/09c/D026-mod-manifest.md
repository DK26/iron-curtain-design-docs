## D026: OpenRA Mod Manifest Compatibility

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 0–1 (manifest parsing ships with format loading)
- **Execution overlay mapping:** `M0.CORE.FORMAT_FOUNDATION` (parser), `M1.CORE.FORMAT_LOADING` (full import)
- **Deferred features / extensions:** Advanced manifest features (custom `Rules` merge order, `TileSets` remapping) deferred to Phase 6a when full mod compat is the focus
- **Deferral trigger:** Phase 6a modding milestone
- **Canonical for:** OpenRA `mod.yaml` parsing, `ic mod import` workflow, mod composition strategy
- **Scope:** `ra-formats` crate, `ic` CLI
- **Decision:** IC parses OpenRA's `mod.yaml` manifest format directly. Mods can be run in-place or permanently imported. C# assembly references (`Assemblies:`) are flagged as warnings — units using unavailable traits get placeholder rendering.
- **Why:**
  - Existing OpenRA mods are the largest body of C&C mod content
  - Direct parsing means modders can test IC without rewriting their manifest
  - `ic mod import` provides a clean migration path for permanent adoption
  - Assembly warnings instead of hard failures allow partial mod loading (most content is YAML, not C#)
- **Non-goals:** Running OpenRA C# DLLs. IC does not embed a .NET runtime. Mod functionality provided by C# assemblies must be reimplemented in YAML/Lua/WASM.
- **Invariants preserved:** No C# anywhere (Invariant #3). Tiered modding (YAML → Lua → WASM).
- **Compatibility / Export impact:** OpenRA mods load directly; C#-dependent features degrade gracefully
- **Public interfaces / types / commands:** `ic mod run --openra-dir`, `ic mod import`, `mod_manifest.rs`
- **Affected docs:** `04-MODDING.md` § Mod Manifest Loading, `05-FORMATS.md`
- **Keywords:** mod.yaml, mod manifest, OpenRA mod, mod import, ic mod, DLL stacking, mod composition

---

### Manifest Schema Mapping

OpenRA's `mod.yaml` sections map to IC equivalents:

| OpenRA Section | IC Equivalent | Notes |
|----------------|---------------|-------|
| `Rules:` | `rules/` directory | YAML unit/weapon/structure definitions |
| `Sequences:` | `sequences/` directory | Sprite animation definitions |
| `Weapons:` | `rules/weapons/` | Weapon + warhead definitions |
| `Maps:` | `maps/` directory | Map files |
| `Voices:` | `audio/voices/` | Voice line definitions |
| `Music:` | `audio/music/` | Music track definitions |
| `Assemblies:` | **Warning** | C# DLLs flagged; units using unavailable traits get placeholder rendering |

### Import Workflow

```bash
# Run an OpenRA mod directly (auto-converts at load time)
ic mod run --openra-dir /path/to/openra-mod/

# Import for permanent migration (generates IC-native directory structure)
ic mod import /path/to/openra-mod/ --output ./my-ic-mod/
```

**`ic mod import` steps:**
1. Parse `mod.yaml` manifest
2. Convert MiniYAML files to standard YAML (D025)
3. Resolve vocabulary aliases (D023)
4. Map directory structure to IC layout
5. Flag C# assembly dependencies as `TODO` comments in generated YAML
6. Output a valid IC mod directory with `mod.toml` manifest

### Mod Composition Strategy

OpenRA mods compose by stacking C# DLL assemblies (e.g., Romanovs-Vengeance loads five DLLs simultaneously). This creates fragile version dependencies — a new OpenRA release can break all mods simultaneously.

IC replaces DLL stacking with:
- **Layered mod dependency system** with explicit, versioned dependencies (D030)
- **WASM modules** for new mechanics (D005) — sandboxed, version-independent
- **Cross-game component library** (D029) — first-party reusable systems (carrier/spawner, mind control, etc.) available without importing foreign game module code
