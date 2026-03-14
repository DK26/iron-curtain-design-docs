## D066: Cross-Engine Export & Editor Extensibility

**Decision:** The IC SDK (scenario editor + asset studio) can export complete content packages — missions, campaigns, cutscenes, music, audio, textures, animations, unit definitions — to original Red Alert and OpenRA formats. The SDK is itself extensible via the same tiered modding system (YAML → Lua → WASM) that powers the game, making it a fully moddable content creation platform.

**Context:** IC already imports from Red Alert and OpenRA (D025, D026, ra-formats). The Asset Studio (D040) converts between individual asset formats bidirectionally (.shp↔.png, .aud↔.wav, .vqa↔.mp4). But there is no holistic export pipeline — no way to author a complete mission in IC's superior tooling and then produce a package that loads in original Red Alert or OpenRA. This is the "content authoring platform" step: IC becomes the tool that the C&C community uses to create content for *any* C&C engine, not just IC itself. This posture — creating value for the broader community regardless of which engine they play on — is core to the project's philosophy (see `13-PHILOSOPHY.md` Principle #6: "Build with the community, not just for them").

Equally important: the editor itself must be extensible. If IC is a modding platform, then the tools that create mods must also be moddable. A community member building a RA2 game module needs custom editor panels for voxel placement. A total conversion might need a custom terrain brush. Editor extensions follow the same tiered model that game mods use.

### Export Targets

#### Target 1: Original Red Alert (DOS/Win95 format)

Export produces files loadable by the original Red Alert engine (including CnCNet-patched versions):

| Content Type      | IC Source                          | Export Format                                         | Notes                                                                                                                                                                                     |
| ----------------- | ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maps**          | IC scenario (.yaml)                | `ra.ini` (map section) + `.bin` (terrain binary)      | Map dimensions, terrain tiles, overlay (ore/gems), waypoints, cell triggers. Limited to 128×128 grid, no IC-specific features (triggers export as best-effort match to RA trigger system) |
| **Unit rules**    | IC YAML unit definitions           | `rules.ini` sections                                  | Cost, speed, armor, weapons, prerequisites. IC-only features (conditions, multipliers) stripped with warnings. Balance values remapped to RA's integer scales                             |
| **Missions**      | IC scenario + Lua triggers         | `.mpr` mission file + `trigger`/`teamtype` ini blocks | Lua trigger logic is *downcompiled* to RA's trigger/teamtype/action system where possible. Complex Lua with no RA equivalent generates a warning report                                   |
| **Sprites**       | .png / sprite sheets               | .shp + .pal (256-color palette-indexed)               | Auto-quantization to target palette. Frame count/facing validation against RA expectations (8/16/32 facings)                                                                              |
| **Audio**         | .wav / .ogg                        | .aud (IMA ADPCM)                                      | Sample rate conversion to RA-compatible rates. Mono downmix if stereo.                                                                                                                    |
| **Cutscenes**     | .mp4 / .webm                       | .vqa (VQ compressed)                                  | Resolution downscale to 320×200 or 640×400. Palette quantization. Audio track interleaved as Westwood ADPCM                                                                               |
| **Music**         | .ogg / .wav                        | .aud (music format)                                   | Full-length music tracks encoded as Westwood AUD. Alternative: export as standard .wav alongside custom `theme.ini`                                                                       |
| **String tables** | IC YAML localization               | `.eng` / `.ger` / etc. string files                   | IC string keys mapped to RA string table offsets                                                                                                                                          |
| **Archives**      | Loose files (from export pipeline) | .mix (optional packing)                               | All exported files optionally bundled into a .mix for distribution. CRC hash table generated per ra-formats § MIX                                                                         |

**Fidelity model:** Export is *lossy by design*. IC supports features RA doesn't (conditions, multipliers, 3D positions, complex Lua triggers, unlimited map sizes, advanced mission-phase tooling like segment unlock wrappers and sub-scenario portals, and IC-native asymmetric role orchestration such as D070 Commander/Field Ops support-request flows and role HUD/objective-channel semantics). The exporter produces the closest RA-compatible equivalent and generates a **fidelity report** — a structured log of every feature that was downgraded, stripped, or approximated. The creator sees: "3 triggers could not be exported (RA has no equivalent for `on_condition_change`). 2 unit abilities were removed (mind control requires engine support). Map was cropped from 200×200 to 128×128. Sub-scenario portal `lab_interior` exported as a separate mission stub with manual campaign wiring required. D070 support request queue and role HUD presets are IC-native and were stripped." This is the same philosophy as exporting a Photoshop file to JPEG — you know what you'll lose before you commit.

#### Target 2: OpenRA (.oramod / .oramap)

Export produces content loadable by the current OpenRA release:

| Content Type      | IC Source                       | Export Format                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maps**          | IC scenario (.yaml)             | `.oramap` (ZIP: map.yaml + map.bin + lua/)               | Full map geometry, actor placement, player definitions, Lua scripts. IC map features beyond OpenRA's support generate warnings                                                                                                                                                                                                                                                                       |
| **Mod rules**     | IC YAML unit/weapon definitions | MiniYAML rule files (tab-indented, `^`/`@` syntax)       | IC YAML → MiniYAML via D025 reverse converter. IC trait names mapped back to OpenRA trait names via D023 alias table (bidirectional). IC-only traits stripped with warnings                                                                                                                                                                                                                          |
| **Campaigns**     | IC campaign graph (D021)        | OpenRA campaign manifest + sequential mission `.oramaps` | IC's branching campaign graph is linearized (longest path or user-selected branch). Persistent state (roster carry-over, hero progression/skills, hero inventory/loadouts) is stripped or flattened into flags/stubs — OpenRA campaigns are stateless. IC sub-scenario portals are flattened into separate scenarios/steps when exportable; parent↔child outcome handoff may require manual rewrite. |
| **Lua scripts**   | IC Lua (D024 superset)          | OpenRA-compatible Lua (D024 base API)                    | IC-only Lua API extensions stripped. The exporter validates that remaining Lua uses only OpenRA's 16 globals + standard library                                                                                                                                                                                                                                                                      |
| **Sprites**       | .png / sprite sheets            | .png (OpenRA native) or .shp                             | OpenRA loads PNG natively — often no conversion needed. .shp export available for mods targeting the classic sprite pipeline                                                                                                                                                                                                                                                                         |
| **Audio**         | .wav / .ogg                     | .wav / .ogg (OpenRA native) or .aud                      | OpenRA loads modern formats natively. .aud export for backwards-compatible mods                                                                                                                                                                                                                                                                                                                      |
| **UI themes**     | IC theme YAML + sprite sheets   | OpenRA chrome YAML + sprite sheets                       | IC theme properties (D032) mapped to OpenRA's chrome system. IC-only theme features stripped                                                                                                                                                                                                                                                                                                         |
| **String tables** | IC YAML localization            | OpenRA `.ftl` (Fluent) localization files                | IC string keys mapped to OpenRA Fluent message IDs                                                                                                                                                                                                                                                                                                                                                   |
| **Mod manifest**  | IC mod.toml                     | OpenRA `mod.yaml` (D026 reverse)                         | IC mod manifest → OpenRA mod manifest. Dependency declarations, sprite sequences, rule file lists, chrome layout references                                                                                                                                                                                                                                                                          |

**OpenRA version targeting:** OpenRA's modding API changes between releases. The exporter targets a configurable OpenRA version (default: latest stable). A `target_openra_version` field in the export config selects which trait names, Lua API surface, and manifest schema to use. The D023 alias table is version-aware — it knows which OpenRA release introduced or deprecated each trait name.

#### Target 3: IC Native (Default)

Normal IC mod/map export is already covered by existing design (D030 Workshop, D062 profiles). Included here for completeness — the export pipeline is a unified system with format-specific backends, not three separate tools.

### Export Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     IC SDK Export Pipeline                        │
│                                                                  │
│  ┌─────────────┐                                                 │
│  │ IC Scenario  │──┐                                             │
│  │ + Assets     │  │    ┌──────────────────┐                     │
│  └─────────────┘  ├──→│  ExportPlanner    │                     │
│  ┌─────────────┐  │    │                  │                     │
│  │ Export       │──┘    │ • Inventory all  │    ┌─────────────┐  │
│  │ Config YAML  │       │   content        │    │  Fidelity   │  │
│  │              │       │ • Detect feature │──→│  Report     │  │
│  │ target: ra1  │       │   gaps per target│    │  (warnings) │  │
│  │ version: 3.03│       │ • Plan transforms│    └─────────────┘  │
│  └─────────────┘       └──────┬───────────┘                     │
│                               │                                  │
│             ┌─────────────────┼─────────────────┐               │
│             ▼                 ▼                  ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ RaExporter   │  │ OraExporter  │  │ IcExporter   │          │
│  │              │  │              │  │              │          │
│  │ rules.ini    │  │ MiniYAML     │  │ IC YAML      │          │
│  │ .shp/.pal    │  │ .oramap      │  │ .png/.ogg    │          │
│  │ .aud/.vqa    │  │ .png/.ogg    │  │ Workshop     │          │
│  │ .mix         │  │ mod.yaml     │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                  │
│         ▼                 ▼                  ▼                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │              Output Directory / Archive           │           │
│  └─────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**`ExportTarget` trait:**

```rust
/// Backend for exporting IC content to a specific target engine/format.
/// Implementable via WASM for community-contributed export targets.
pub trait ExportTarget: Send + Sync {
    /// Human-readable name: "Original Red Alert", "OpenRA (release-20240315)", etc.
    fn name(&self) -> &str;

    /// Which IC content types this target supports.
    fn supported_content(&self) -> &[ContentCategory];

    /// Analyze the scenario and produce a fidelity report
    /// listing what will be downgraded or lost.
    fn plan_export(
        &self,
        scenario: &ExportableScenario,
        config: &ExportConfig,
    ) -> ExportPlan;

    /// Execute the export, writing files to the output sink.
    fn execute(
        &self,
        plan: &ExportPlan,
        scenario: &ExportableScenario,
        output: &mut dyn OutputSink,
    ) -> Result<ExportResult, ExportError>;
}

pub enum ContentCategory {
    Map,
    UnitRules,
    WeaponRules,
    Mission,        // scenario with triggers/scripting
    Campaign,       // multi-mission with graph/state
    Sprites,
    Audio,
    Music,
    Cutscenes,
    UiTheme,
    StringTable,
    ModManifest,
    Archive,        // .mix, .oramod ZIP, etc.
}
```

**Key design choice:** `ExportTarget` is a trait, not a hardcoded set of if/else branches. The built-in exporters (RA1, OpenRA, IC) ship with the SDK. Community members can add export targets for other engines — Tiberian Sun modding tools, Remastered Collection, or even non-C&C engines like Stratagus — via WASM modules (Tier 3 modding). This makes the export pipeline itself extensible without engine changes.

### Trigger Downcompilation (Lua → RA/OpenRA triggers)

The hardest export problem. IC missions use Lua (D024) for scripting — a Turing-complete language. RA1 has a fixed trigger/teamtype/action system (~40 events, ~80 actions). OpenRA extends this with Lua but has a smaller standard library than IC.

**Approach: pattern-based downcompilation, not general transpilation.**

The exporter maintains a library of **recognized Lua patterns** that map to RA1 trigger equivalents:

| IC Lua Pattern                          | RA1 Trigger Equivalent                     |
| --------------------------------------- | ------------------------------------------ |
| `Trigger.AfterDelay(ticks, fn)`         | Timed trigger (countdown)                  |
| `Trigger.OnEnteredFootprint(cells, fn)` | Cell trigger (entered by)                  |
| `Trigger.OnKilled(actor, fn)`           | Destroyed trigger (specific unit/building) |
| `Trigger.OnAllKilled(actors, fn)`       | All destroyed trigger                      |
| `Actor.Create(type, owner, pos)`        | Teamtype + reinforcement action            |
| `actor:Attack(target)`                  | Teamtype attack waypoint action            |
| `actor:Move(pos)`                       | Teamtype move to waypoint action           |
| `Media.PlaySpeech(name)`                | EVA speech action                          |
| `UserInterface.SetMissionText(text)`    | Mission text display action                |

Lua that doesn't match any known pattern → **warning in fidelity report** with the unmatched code highlighted. The creator can then simplify their Lua for RA1 export or accept the limitation. For OpenRA export, more patterns survive (OpenRA supports Lua natively), but IC-only API extensions are still flagged.

**This is intentionally NOT a general Lua-to-trigger compiler.** A general compiler would be fragile and produce trigger spaghetti. Pattern matching is predictable: the creator knows exactly which patterns export cleanly, and the SDK can provide "export-safe" template triggers in the scenario editor that are guaranteed to downcompile.

### Editor Extensibility

The IC SDK is a modding platform, not just a tool. The editor itself is extensible via the same three-tier system:

#### Tier 1: YAML (Editor Data Extensions)

Custom editor panels, entity palettes, and property inspectors defined via YAML:

```yaml
# extensions/ra2_editor/editor_extension.yaml
editor_extension:
  name: "RA2 Editor Tools"
  version: "1.0.0"
  api_version: "1.0"              # editor plugin API version (stable surface)
  min_sdk_version: "0.6.0"
  tested_sdk_versions: ["0.6.x"]
  capabilities:                   # declarative, deny-by-default
    - editor.panels
    - editor.palette_categories
    - editor.terrain_brushes

  # Custom entity palette categories
  palette_categories:
    - name: "Voxel Units"
      icon: voxel_unit_icon
      filter:
        has_component: VoxelModel
    - name: "Tech Buildings"
      icon: tech_building_icon
      filter:
        tag: tech_building

  # Custom property panels for entity types
  property_panels:
    - entity_filter: { has_component: VoxelModel }
      panel:
        title: "Voxel Properties"
        fields:
          - { key: "voxel.turret_offset", type: vec3, label: "Turret Offset" }
          - { key: "voxel.shadow_index", type: int, label: "Shadow Index" }
          - { key: "voxel.remap_color", type: palette_range, label: "Faction Color Range" }

  # Custom terrain brush presets
  terrain_brushes:
    - name: "Urban Road"
      tiles: [road_h, road_v, road_corner_ne, road_corner_nw, road_t, road_cross]
      auto_connect: true
    - name: "Tiberium Field"
      tiles: [tib_01, tib_02, tib_03, tib_spread]
      scatter: { density: 0.7, randomize_variant: true }

  # Custom export target configuration
  export_targets:
    - name: "Yuri's Revenge"
      exporter_wasm: "ra2_exporter.wasm"  # Tier 3 WASM exporter
      config_schema: "ra2_export_config.yaml"
```

#### Tier 2: Lua (Editor Scripting)

Editor automation, custom validators, batch operations:

```lua
-- extensions/quality_check/editor_scripts/validate_mission.lua

-- Register a custom validation that runs before export
Editor.RegisterValidator("balance_check", function(scenario)
    local issues = {}

    -- Check that both sides have a base
    for _, player in ipairs(scenario:GetPlayers()) do
        local has_mcv = false
        for _, actor in ipairs(scenario:GetActors(player)) do
            if actor:HasComponent("BaseBuilding") then
                has_mcv = true
                break
            end
        end
        if not has_mcv and player:IsPlayable() then
            table.insert(issues, {
                severity = "warning",
                message = player:GetName() .. " has no base-building unit",
                actor = nil,
                fix = "Add an MCV or Construction Yard"
            })
        end
    end

    return issues
end)

-- Register a batch operation available from the editor's command palette
Editor.RegisterCommand("distribute_ore", {
    label = "Distribute Ore Fields",
    description = "Auto-place balanced ore around each player start",
    execute = function(scenario, params)
        for _, start_pos in ipairs(scenario:GetPlayerStarts()) do
            -- Place ore in a ring around each start position
            local radius = params.radius or 8
            for dx = -radius, radius do
                for dy = -radius, radius do
                    local dist = math.sqrt(dx*dx + dy*dy)
                    if dist >= radius * 0.5 and dist <= radius then
                        local cell = start_pos:Offset(dx, dy)
                        if scenario:GetTerrain(cell):IsPassable() then
                            scenario:SetOverlay(cell, "ore", math.random(1, 3))
                        end
                    end
                end
            end
        end
    end
})
```

#### Tier 3: WASM (Editor Plugins)

Full editor plugins for custom panels, renderers, format support, and export targets:

```rust
// A WASM plugin that adds a custom export target for Tiberian Sun
#[wasm_export]
fn register_editor_plugin(host: &mut EditorHost) {
    // Register a custom export target
    host.register_export_target(TiberianSunExporter::new());

    // Register a custom asset viewer for .vxl files
    host.register_asset_viewer("vxl", VoxelViewer::new());

    // Register a custom terrain tool
    host.register_terrain_tool(TiberiumGrowthPainter::new());

    // Register a custom entity component editor
    host.register_component_editor("SubterraneanUnit", SubUnitEditor::new());
}
```

**Editor extension distribution:** Editor extensions are Workshop packages (D030) with `type: editor_extension` in their manifest. They install into the SDK's extension directory and activate on SDK restart. Extensions declared in a mod profile (D062) auto-activate when that profile is active — a RA2 game module profile automatically loads RA2 editor extensions.

**Plugin manifest compatibility & capabilities (Phase 6b):**
- **API version contract** — extensions declare an editor plugin API version (`api_version`) separate from engine internals. The SDK checks compatibility before load and disables incompatible extensions with a clear reason ("built for plugin API 0.x, this SDK provides 1.x").
- **Capability manifest (deny-by-default)** — extensions must declare requested editor capabilities (`editor.panels`, `editor.asset_viewers`, `editor.export_targets`, etc.). Undeclared capability usage is rejected.
- **Install-time permission review** — the SDK shows the requested capabilities when installing/updating an extension. This is the only prompting point; normal editing sessions are not interrupted.
- **No VCS/process control capabilities by default** — editor plugins do not get commit/rebase/shell execution powers. Git integration remains an explicit user workflow outside plugins unless a separately approved deferred capability is designed and placed in the execution overlay.
- **Version/provenance metadata** — manifests may include signature/provenance information for Workshop trust badges; absence warns but does not prevent local development installs.

### Export-Safe Authoring Mode

The scenario editor offers an **export-safe mode** that constrains the authoring environment to features compatible with a chosen export target:

- **Select target:** "I'm building this mission for OpenRA" (or RA1, or IC)
- **Feature gating:** The editor grays out or hides features the target doesn't support. If targeting RA1: no mind control triggers, no unlimited map size, no branching campaigns, no IC-native sub-scenario portals, no IC hero progression toolkit intermissions/skill progression, and no D070 asymmetric Commander/Field Ops role orchestration (role HUD presets, support request queues, objective-channel semantics beyond plain trigger/objective export). If targeting OpenRA: no IC-only Lua APIs; advanced `Map Segment Unlock` wrappers show yellow/red fidelity when they depend on IC-only phase orchestration beyond OpenRA-equivalent reveal/reinforcement scripting, hero progression/skill-tree tooling shows fidelity warnings because OpenRA campaigns are stateless, and D070 asymmetric role/support UX is treated as IC-native with strip/flatten warnings.
- **Live fidelity indicator:** A traffic-light badge on each entity/trigger: green = exports perfectly, yellow = exports with approximation, red = will be stripped. The creator sees export fidelity as they build, not after.
- **Export-safe trigger templates:** Pre-built trigger patterns guaranteed to downcompile cleanly to the target. "Timer → Reinforcement" template uses only Lua patterns with known RA1 equivalents.
- **Dual preview:** Side-by-side preview showing "IC rendering" and "approximate target rendering" (e.g., palette-quantized sprites to simulate how it will look in original RA1).

This mode doesn't prevent using IC-only features — it informs the creator of consequences in real time. A creator building primarily for IC can still glance at the OpenRA fidelity indicator to know how much work a port would take.

### CLI Export

Export is available from the command line for batch processing and CI integration:

```bash
# Export a single mission to OpenRA format
ic export --target openra --version release-20240315 mission.yaml -o ./openra-output/

# Export an entire campaign to RA1 format
ic export --target ra1 campaign.yaml -o ./ra1-output/ --fidelity-report report.json

# Export all sprites in a mod to .shp+.pal for RA1 compatibility
ic export --target ra1 --content sprites mod.toml -o ./sprites-output/

# Validate export without writing files (dry run)
ic export --target openra --dry-run mission.yaml

# Stronger export verification (checks exportability + target-facing validation rules)
ic export --target openra --verify mission.yaml

# Batch export: every map in a directory to all targets
ic export --target ra1,openra,ic maps/ -o ./export/
```

**SDK integration:** The Scenario/Campaign editor's `Validate` and `Publish Readiness` flows call the same export planner/verifier used by `ic export --dry-run` / `--verify`. There is one export validation implementation surfaced through both CLI and GUI.

### What This Enables

1. **IC as the C&C community's content creation hub.** Build in IC's superior editor, export to whatever engine your audience plays. A mission maker who targets both IC and OpenRA doesn't maintain two copies — they maintain one IC project and export.

2. **Gradual migration path.** An OpenRA modder starts using IC's editor for map creation (exporting .oramaps), discovers the asset tools, starts authoring rules in IC YAML (exporting MiniYAML), and eventually their entire workflow is in IC — even if their audience still plays OpenRA. When their audience migrates to IC, the mod is already native.

3. **Editor as a platform.** Workshop-distributed editor extensions mean the SDK improves with the community. Someone builds a RA2 voxel placement tool → everyone benefits. Someone builds a Tiberian Sun export target → the TS modding community gains a modern editor. Someone builds a mission quality validator → all mission makers benefit.

4. **Preservation.** Creating new content for the original 1996 Red Alert — missions, campaigns, even total conversions — using modern tools. The export pipeline keeps the original game alive as a playable target.

### Alternatives Considered

1. **Export only to IC native format** — Rejected. Misses the platform opportunity. The C&C community spans multiple engines. Being useful to creators regardless of their target engine is how IC earns adoption.

2. **General transpilation (Lua → any trigger system)** — Rejected. A general Lua transpiler would be fragile, produce unreadable output, and give false confidence. Pattern-based downcompilation is honest about its limitations.

3. **Editor extensions via C# (OpenRA compatibility)** — Rejected. IC doesn't use C# anywhere. WASM is the Tier 3 extension mechanism — Rust, C, AssemblyScript, or any WASM-targeting language. No C# runtime dependency.

4. **Separate export tools (not integrated in SDK)** — Rejected. Export is part of the creation workflow, not a post-processing step. The export-safe authoring mode only works if the editor knows the target while you're building.

5. **Bit-perfect re-creation of target engine behavior** — Not a goal. Export produces valid content for the target engine, but doesn't guarantee identical gameplay to what IC simulates (D011 — cross-engine compatibility is community-layer, not sim-layer). RA1 and OpenRA will simulate the exported content with their own engines.

### Integration with Existing Decisions

- **D023 (OpenRA Vocabulary Compatibility):** The alias table is now bidirectional — used for import (OpenRA → IC) AND export (IC → OpenRA). The exporter reverses D023's trait name mapping.
- **D024 (Lua API):** Export validates Lua against the target's API surface. IC-only extensions are flagged; OpenRA's 16 globals are the safe subset.
- **D025 (Runtime MiniYAML Loading):** The MiniYAML converter is now bidirectional: load at runtime (MiniYAML → IC YAML) and export (IC YAML → MiniYAML).
- **D026 (Mod Manifest Compatibility):** `mod.yaml` parsing is now bidirectional — import OpenRA manifests AND generate them on export.
- **D030 (Workshop):** Editor extensions are Workshop packages. Export presets/profiles are shareable via Workshop.
- **D038 (Scenario Editor):** The scenario editor gains export-safe mode, fidelity indicators, export-safe trigger templates, and Validate/Publish Readiness integration that surfaces target compatibility before publish. Export is a first-class editor action, not a separate tool.
- **D070 (Asymmetric Commander & Field Ops Co-op):** D070 scenarios/templates are expected to be IC-native. Exporters may downcompile fragments (maps, units, simple triggers), but role orchestration, request/response HUD flows, and asymmetric role permissions require fidelity warnings and usually manual redesign.
- **D040 (Asset Studio):** Asset conversion (D040's Cross-Game Asset Bridge) is the per-file foundation. D066 orchestrates whole-project export using D040's converters.
- **D062 (Mod Profiles):** A mod profile can embed export target preference. "RA1 Compatible" profile constrains features to RA1-exportable subset.
- **ra-formats write support:** D066 is the primary consumer of ra-formats write support (Phase 6a). The exporter calls into ra-formats encoders for .shp, .pal, .aud, .vqa, .mix generation.

### Phase

- **Phase 6a:** Core export pipeline ships alongside the scenario editor and asset studio. Built-in export targets: IC native (trivial), OpenRA (`.oramap` + MiniYAML rules). Export-safe authoring mode in scenario editor. `ic export` CLI.
- **Phase 6b:** RA1 export target (requires .ini generation, trigger downcompilation, .mix packing). Campaign export (linearization for stateless targets). Editor extensibility API (YAML + Lua tiers). Editor extension Workshop distribution plus plugin capability manifests / compatibility checks / install-time permission review.
- **Phase 7:** WASM editor plugins (Tier 3 extensibility). Community-contributed export targets (TS, RA2, Remastered). Agentic export assistance (LLM suggests how to simplify IC-only features for target compatibility).
