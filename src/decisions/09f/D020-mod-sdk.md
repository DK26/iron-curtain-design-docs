## D020: Mod SDK & Creative Toolchain

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 6a (SDK ships as separate binary; individual tools phase in earlier â€” see tool phase table)
- **Execution overlay mapping:** `M6.MOD.SDK_BINARY` (P-Core); individual editors have their own milestones (D038, D040)
- **Deferred features / extensions:** Migration Workbench apply+rollback (Phase 6b), advanced campaign hero toolkit UI (Phase 6b), LLM-powered generation features (Phase 7)
- **Deferral trigger:** Respective milestone start
- **Canonical for:** IC SDK architecture, `ic-editor` crate, creative workflow (Preview â†’ Test â†’ Validate â†’ Publish), tool boundaries between SDK and CLI
- **Scope:** `ic-editor` crate (separate Bevy application), `ic` CLI (validation, import, publish), `player-flow/sdk.md` (full UI specification)
- **Decision:** The IC SDK is a separate Bevy application (`ic-editor` crate) from the game (`ic-game`). It shares library crates but has its own binary. The SDK contains three main editors â€” Scenario Editor (D038), Asset Studio (D040), and Campaign Editor â€” plus project management (git-aware), validation, and Workshop publishing. The `ic` CLI handles headless operations (validation, import, export, publish) independently of the SDK GUI.
- **Why:**
  - Separate binary keeps the game runtime lean â€” modders install the SDK, players don't need it
  - Shared library crates (ic-sim, ra-formats, ic-render) mean the SDK renders identically to the game
  - Git-first workflow matches modern mod development (version control, branches, collaboration)
  - CLI + GUI separation enables CI/CD pipelines for mod projects (headless validation in CI)
- **Non-goals:** Embedding the SDK inside the game application. The SDK is a development tool, not a runtime feature. Also not a goal: replacing external editors (Blender, Photoshop) â€” the SDK handles C&C-specific formats and workflows.
- **Invariants preserved:** No C# (SDK is Rust + Bevy). Tiered modding preserved (SDK tools produce YAML/Lua/WASM content, not engine-internal formats).
- **Public interfaces / types / commands:** `ic-editor` binary, `ic mod validate`, `ic mod import`, `ic mod publish`, `ic mod run`
- **Affected docs:** `player-flow/sdk.md` (full UI specification), `04-MODDING.md` Â§ SDK, `decisions/09f-tools.md`
- **Keywords:** SDK, mod SDK, ic-editor, scenario editor, asset studio, campaign editor, creative toolchain, git-first, validate, publish, Workshop

---

### Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚               IC SDK (ic-editor)                â”‚
â”‚  Separate Bevy binary, shares library crates    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Scenario   â”‚  Asset       â”‚  Campaign          â”‚
â”‚  Editor     â”‚  Studio      â”‚  Editor            â”‚
â”‚  (D038)     â”‚  (D040)      â”‚  (node graph)      â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Project Management: git-aware, recent files    â”‚
â”‚  Validation: Quick Validate, Publish Readiness  â”‚
â”‚  Documentation: embedded Authoring Reference    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Shared: ic-sim, ic-render, ra-formats,         â”‚
â”‚          ic-script, ic-protocol                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚               ic CLI (headless)                 â”‚
â”‚  ic mod validate | ic mod import | ic mod run   â”‚
â”‚  ic mod publish  | cnc-formats (validate/inspect/convert) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

The SDK and CLI are complementary:
- **SDK** â€” visual editing, real-time preview, interactive testing
- **CLI** â€” headless validation, CI/CD integration, batch operations, import/export

### Creative Workflow

The SDK toolbar follows a consistent flow:

```
Preview â†’ Test â†’ Validate â†’ Publish
```

1. **Preview** â€” renders the scenario/campaign in the SDK viewport (same renderer as the game)
2. **Test** â€” launches the real game runtime with a local dev overlay profile (not an editor-only runtime)
3. **Validate** â€” runs structural, balance, and compatibility checks (async, cancelable)
4. **Publish** â€” Publish Readiness screen aggregates all warnings before Workshop upload

### Three Editors

**Scenario Editor (D038):** Isometric viewport with 8 editing modes (Terrain, Entities, Triggers, Waypoints, Modules, Regions, Scripts, Layers). Simple/Advanced toggle. Trigger-driven camera scenes. 30+ drag-and-drop modules. Context-sensitive help (`F1`). See D038 for full specification.

**Asset Studio (D040):** XCC Mixer replacement with visual editing. Supports SHP, PAL, AUD, VQA, MIX, TMP. Bidirectional conversion (SHPâ†”PNG, AUDâ†”WAV). Chrome/theme designer with 9-slice editor. See D040 for full specification.

**Campaign Editor:** Node-and-edge graph editor in a 2D Bevy viewport. Missions are nodes (linked to scenario files), outcomes are labeled edges. Supports branching campaigns (D021), hero progression, and validation. Advanced mode adds localization workbench and migration/export readiness checks.

### Conversion Command Boundary

Two separate tools handle format conversion at different levels:

| Tool                  | Scope                                | Granularity                                                             | Crate                                  | License        |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------- | -------------- |
| `cnc-formats convert` | Single-file format conversion        | `--format miniyaml --to yaml`, `--to png`, `--to wav`, etc. on one file | `cnc-formats`                          | MIT/Apache-2.0 |
| `ic mod convert`      | Mod-directory batch asset conversion | `--to-modern` / `--to-classic` across all files in a mod                | `ic-game` (uses `ra-formats` encoders) | GPL v3         |

**`cnc-formats convert`** is game-agnostic and schema-neutral. It converts individual files between C&C formats and common formats: MiniYAML â†’ YAML (text, behind `miniyaml` feature), SHP â†” PNG/GIF, AUD â†” WAV, VQA â†” AVI, WSA â†” PNG/GIF, TMP â†’ PNG, PAL â†’ PNG, FNT â†’ PNG (binary, behind `convert` feature), MID â†’ WAV/AUD (behind `midi` feature). It knows nothing about mod directories or game-specific semantics.

**`ic mod convert`** is game-aware and operates on entire mod directories. It converts between legacy C&C asset formats (`.shp`, `.aud`, `.vqa`) and modern Bevy-native formats (PNG, OGG, WebM) using `ra-formats` encoders/decoders. It understands mod structure (`mod.toml`, directory conventions) and can batch-process all assets in a mod. The Asset Studio (D040) provides the same conversions via GUI.

They differ in scope: `cnc-formats convert` handles single-file conversions; `ic mod convert` handles mod-directory batch operations with game-aware defaults (e.g. choosing OGG bitrate based on asset type).

### Tool Phase Schedule

| Tool                                           | Phase    | Notes                                                                                                   |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `ic` CLI (validate, import, convert, run)      | Phase 2  | Ships with core engine; `ic mod convert` = mod-directory batch asset conversion                         |
| `cnc-formats` CLI (validate, inspect, convert) | Phase 0  | Format validation + inspection + single-file format conversion (text + binary, feature-gated; see D076) |
| `cnc-formats` CLI (extract, list)              | Phase 1  | `.mix` archive decomposition and inventory                                                              |
| `cnc-formats` CLI (check, diff, fingerprint)   | Phase 2  | Deep integrity, structural comparison, canonical hashing                                                |
| `cnc-formats` CLI (pack)                       | Phase 6a | `.mix` archive creation (inverse of extract)                                                            |
| Scenario Editor (D038)                         | Phase 6a | Primary SDK editor                                                                                      |
| Asset Studio (D040)                            | Phase 6a | Format conversion + visual editing                                                                      |
| Campaign Editor                                | Phase 6a | Graph editor for D021 campaigns                                                                         |
| SDK binary (unified launcher)                  | Phase 6a | Bundles all editors                                                                                     |
| Migration Workbench                            | Phase 6b | Project upgrade tooling                                                                                 |
| LLM generation features                        | Phase 7  | D016, D047, D057 integration                                                                            |

### Project Structure (Git-First)

The SDK assumes mod projects are git repositories. The SDK chrome shows branch name, dirty/clean state, and changed file count (read-only â€” the SDK does not perform git operations). This encourages version control from day one and enables collaboration workflows.

```
my-mod/
â”œâ”€â”€ mod.toml              # IC-native manifest
â”œâ”€â”€ rules/
â”‚   â”œâ”€â”€ units.yaml
â”‚   â”œâ”€â”€ buildings.yaml
â”‚   â””â”€â”€ weapons/
â”œâ”€â”€ maps/
â”œâ”€â”€ sequences/
â”œâ”€â”€ audio/
â”œâ”€â”€ scripts/              # Lua mission scripts
â”œâ”€â”€ campaigns/            # Campaign graph YAML
â””â”€â”€ .git/
```

### Alternatives Considered

| Alternative                     | Verdict  | Reason                                                                                                |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| Embedded editor in game         | Rejected | Bloats game binary; modders are a minority of players                                                 |
| Web-based editor                | Rejected | Cannot share rendering code with game; offline-first is a requirement                                 |
| CLI-only (no GUI)               | Rejected | Visual editing is essential for map/scenario/campaign authoring; CLI is complementary, not sufficient |
| Separate tools (no unified SDK) | Rejected | Unified launcher with shared project context is more discoverable and consistent                      |
