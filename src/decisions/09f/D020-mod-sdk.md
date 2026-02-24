## D020: Mod SDK & Creative Toolchain

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 6a (SDK ships as separate binary; individual tools phase in earlier — see tool phase table)
- **Execution overlay mapping:** `M6.MOD.SDK_BINARY` (P-Core); individual editors have their own milestones (D038, D040)
- **Deferred features / extensions:** Migration Workbench apply+rollback (Phase 6b), advanced campaign hero toolkit UI (Phase 6b), LLM-powered generation features (Phase 7)
- **Deferral trigger:** Respective milestone start
- **Canonical for:** IC SDK architecture, `ic-editor` crate, creative workflow (Preview → Test → Validate → Publish), tool boundaries between SDK and CLI
- **Scope:** `ic-editor` crate (separate Bevy application), `ic` CLI (validation, import, publish), `player-flow/sdk.md` (full UI specification)
- **Decision:** The IC SDK is a separate Bevy application (`ic-editor` crate) from the game (`ic-game`). It shares library crates but has its own binary. The SDK contains three main editors — Scenario Editor (D038), Asset Studio (D040), and Campaign Editor — plus project management (git-aware), validation, and Workshop publishing. The `ic` CLI handles headless operations (validation, import, export, publish) independently of the SDK GUI.
- **Why:**
  - Separate binary keeps the game runtime lean — modders install the SDK, players don't need it
  - Shared library crates (ic-sim, ra-formats, ic-render) mean the SDK renders identically to the game
  - Git-first workflow matches modern mod development (version control, branches, collaboration)
  - CLI + GUI separation enables CI/CD pipelines for mod projects (headless validation in CI)
- **Non-goals:** Embedding the SDK inside the game application. The SDK is a development tool, not a runtime feature. Also not a goal: replacing external editors (Blender, Photoshop) — the SDK handles C&C-specific formats and workflows.
- **Invariants preserved:** No C# (SDK is Rust + Bevy). Tiered modding preserved (SDK tools produce YAML/Lua/WASM content, not engine-internal formats).
- **Public interfaces / types / commands:** `ic-editor` binary, `ic mod validate`, `ic mod import`, `ic mod publish`, `ic mod run`
- **Affected docs:** `player-flow/sdk.md` (full UI specification), `04-MODDING.md` § SDK, `decisions/09f-tools.md`
- **Keywords:** SDK, mod SDK, ic-editor, scenario editor, asset studio, campaign editor, creative toolchain, git-first, validate, publish, Workshop

---

### Architecture

```
┌─────────────────────────────────────────────────┐
│               IC SDK (ic-editor)                │
│  Separate Bevy binary, shares library crates    │
├─────────────┬──────────────┬────────────────────┤
│  Scenario   │  Asset       │  Campaign          │
│  Editor     │  Studio      │  Editor            │
│  (D038)     │  (D040)      │  (node graph)      │
├─────────────┴──────────────┴────────────────────┤
│  Project Management: git-aware, recent files    │
│  Validation: Quick Validate, Publish Readiness  │
│  Documentation: embedded Authoring Reference    │
├─────────────────────────────────────────────────┤
│  Shared: ic-sim, ic-render, ra-formats,         │
│          ic-script, ic-protocol                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│               ic CLI (headless)                 │
│  ic mod validate | ic mod import | ic mod run   │
│  ic mod publish  | miniyaml2yaml               │
└─────────────────────────────────────────────────┘
```

The SDK and CLI are complementary:
- **SDK** — visual editing, real-time preview, interactive testing
- **CLI** — headless validation, CI/CD integration, batch operations, import/export

### Creative Workflow

The SDK toolbar follows a consistent flow:

```
Preview → Test → Validate → Publish
```

1. **Preview** — renders the scenario/campaign in the SDK viewport (same renderer as the game)
2. **Test** — launches the real game runtime with a local dev overlay profile (not an editor-only runtime)
3. **Validate** — runs structural, balance, and compatibility checks (async, cancelable)
4. **Publish** — Publish Readiness screen aggregates all warnings before Workshop upload

### Three Editors

**Scenario Editor (D038):** Isometric viewport with 8 editing modes (Terrain, Entities, Triggers, Waypoints, Modules, Regions, Scripts, Layers). Simple/Advanced toggle. Trigger-driven camera scenes. 30+ drag-and-drop modules. Context-sensitive help (`F1`). See D038 for full specification.

**Asset Studio (D040):** XCC Mixer replacement with visual editing. Supports SHP, PAL, AUD, VQA, MIX, TMP. Bidirectional conversion (SHP↔PNG, AUD↔WAV). Chrome/theme designer with 9-slice editor. See D040 for full specification.

**Campaign Editor:** Node-and-edge graph editor in a 2D Bevy viewport. Missions are nodes (linked to scenario files), outcomes are labeled edges. Supports branching campaigns (D021), hero progression, and validation. Advanced mode adds localization workbench and migration/export readiness checks.

### Tool Phase Schedule

| Tool | Phase | Notes |
|------|-------|-------|
| `ic` CLI (validate, import, run) | Phase 2 | Ships with core engine |
| `miniyaml2yaml` converter | Phase 0 | Part of format foundation (D025) |
| Scenario Editor (D038) | Phase 6a | Primary SDK editor |
| Asset Studio (D040) | Phase 6a | Format conversion + visual editing |
| Campaign Editor | Phase 6a | Graph editor for D021 campaigns |
| SDK binary (unified launcher) | Phase 6a | Bundles all editors |
| Migration Workbench | Phase 6b | Project upgrade tooling |
| LLM generation features | Phase 7 | D016, D047, D057 integration |

### Project Structure (Git-First)

The SDK assumes mod projects are git repositories. The SDK chrome shows branch name, dirty/clean state, and changed file count (read-only — the SDK does not perform git operations). This encourages version control from day one and enables collaboration workflows.

```
my-mod/
├── mod.toml              # IC-native manifest
├── rules/
│   ├── units.yaml
│   ├── buildings.yaml
│   └── weapons/
├── maps/
├── sequences/
├── audio/
├── scripts/              # Lua mission scripts
├── campaigns/            # Campaign graph YAML
└── .git/
```

### Alternatives Considered

| Alternative | Verdict | Reason |
|-------------|---------|--------|
| Embedded editor in game | Rejected | Bloats game binary; modders are a minority of players |
| Web-based editor | Rejected | Cannot share rendering code with game; offline-first is a requirement |
| CLI-only (no GUI) | Rejected | Visual editing is essential for map/scenario/campaign authoring; CLI is complementary, not sufficient |
| Separate tools (no unified SDK) | Rejected | Unified launcher with shared project context is more discoverable and consistent |
