# Mod SDK & Developer Experience

*Inspired by studying the [OpenRA Mod SDK](https://github.com/OpenRA/OpenRAModSDK) — see D020.*

### Lessons from the OpenRA Mod SDK

The OpenRA Mod SDK is a template repository that modders fork. It includes:

| OpenRA SDK Feature                       | What's Good                                               | Our Improvement                                              |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Fork-the-repo template                   | Zero-config starting point                                | `cargo-generate` template — same UX, better tooling          |
| `mod.config` (engine version pin)        | Reproducible builds                                       | `mod.toml` manifest with typed schema + semver               |
| `fetch-engine.sh` (auto-download engine) | Modders never touch engine source                         | Engine ships as a binary crate, not compiled from source     |
| `Makefile` / `make.cmd`                  | Cross-platform build                                      | `ic` CLI tool — Rust binary, works everywhere                |
| `packaging/` (Win/Mac/Linux installers)  | Full distribution pipeline                                | Workshop publish + `cargo-dist` for standalone               |
| `utility.sh --check-yaml`                | Catches YAML errors                                       | `ic mod check` — validates YAML, Lua syntax, WASM integrity  |
| `launch-dedicated.sh`                    | Dedicated server for mods                                 | `ic mod server` — first-class CLI command                    |
| `mod.yaml` manifest                      | Single entry point for mod composition                    | Real TOML manifest with typed `serde` deserialization (D067) |
| Standardized directory layout            | Convention-based — chrome/, rules/, maps/                 | Adapted for our three-tier model                             |
| `.vscode/` included                      | IDE support out of the box                                | Full VS Code extension with YAML schema + Lua LSP            |
| C# DLL for custom traits                 | **Pain point:** requires .NET toolchain, IDE, compilation | Our YAML/Lua/WASM tiers eliminate this entirely              |
| GPL license on mod code                  | **Pain point:** all mod code must be GPL-compatible       | WASM sandbox + permissive engine license = modder's choice   |
| MiniYAML format                          | **Pain point:** no tooling, no validation                 | Real YAML with JSON Schema, serde, linting                   |
| No workshop/distribution                 | **Pain point:** manual file sharing, forum posts          | Built-in workshop with `ic mod publish`                      |
| No hot-reload                            | **Pain point:** recompile engine+mod for every change     | Lua + YAML hot-reload during development                     |

### The `ic` CLI Tool

A single Rust binary that replaces OpenRA's grab-bag of shell scripts:

```
ic mod init [template]     # scaffold a new mod from a template
ic mod check               # validate YAML rules, Lua syntax, WASM module integrity
ic mod test                # run mod in headless test harness (smoke test)
ic mod run                 # launch game with this mod loaded
ic mod server              # launch dedicated server for this mod
ic mod package             # build distributable packages (workshop or standalone)
ic mod publish             # publish to workshop
ic mod update-engine       # update engine version in mod.toml
ic mod lint                # style/convention checks + llm: metadata completeness
ic mod watch               # hot-reload mode: watches files, reloads YAML/Lua on change
ic git setup               # install repo-local .gitattributes and IC diff/merge helper hints (Git-first workflow)
ic content diff <file>     # semantic diff for IC editor-authored content (human review / CI summaries)
ic content merge           # semantic merge helper for Git merge-driver integration (Phase 6b)
ic mod perf-test           # headless playtest profiling summary for CI/perf budgets (Phase 6b)
ic auth token create       # create scoped API token for CI/CD (publish, promote, admin)
ic auth token revoke       # revoke a leaked or expired token
```

**Why a CLI, not just scripts:**
- Single binary — no Python, .NET, or shell dependencies
- Cross-platform (Windows, macOS, Linux) from one codebase
- Rich error messages with fix suggestions
- Integrates with the workshop API
- Designed for CI/CD — all commands work headless (no interactive prompts)

**Command/reference documentation requirement (D020 + D037 knowledge base):**
- The `ic` CLI command tree is a canonical source for a generated **CLI reference** (commands, subcommands, flags, examples, environment variables).
- This reference should be published into the shared authoring knowledge base (D037) and bundled into the SDK's embedded docs snapshot (D038).
- Help output (`--help`) remains the fast local surface; the manual provides fuller examples, workflows, and cross-links (e.g., `ic mod check` ↔ SDK `Validate`, `ic mod migrate` ↔ Migration Workbench).
- For script commands/APIs (Lua/WASM host functions), the modding docs and generated API reference must follow the same metadata model (`summary`, params, return values, examples, deprecations) so creators can reliably discover what is possible.

**Git-first workflow support (no custom VCS):**
- Git remains the only version-control system (history/branches/remotes/merges)
- `ic git setup` configures repo-local integration helpers only (no global Git config mutation)
- `ic content diff` / `ic content merge` improve review and mergeability for editor-authored IC files without changing the canonical "files in Git" workflow

**SDK "Validate" maps to CLI-grade checks, not a separate implementation:**
- **Quick Validate** wraps fast subsets of `ic mod check` + content graph/reference checks
- **Publish Validate** layers in `ic mod audit`, export verification (`ic export --dry-run` / `ic export --verify`), and optional smoke tests (`ic mod test`)
- The SDK is a UX layer over the same validation core used in CI/CD

**Local content overlay / dev-profile workflow (fast iteration, real game path):**
- The CLI should support a **local development overlay** mode so creators can run local content through the **real game flow** (menus, loading, runtime systems) without packaging/publishing first.
- This is a workflow/DX feature, not a second runtime: the game still runs `ic-game`; the difference is content resolution priority and clear "local dev" labeling.
- Typical loop:
  - edit YAML/Lua/assets locally
  - run `ic mod run` (or SDK "Play in Game") with a **local dev profile**
  - optional `ic mod watch` hot-reloads YAML/Lua where supported
  - validate/publish only when ready
- **No packaging required for local iteration** (packaging remains for Workshop/CI/distribution).
- The local dev overlay must be **explicitly visible** in the UI/logs ("Local Content Overlay Active") to avoid confusion with installed Workshop versions.
- Local overlay precedence applies only to the active development profile/session and must not silently mutate installed packages or profile fingerprints used for multiplayer compatibility.
- This workflow is the IC-native equivalent of the "test local content through the normal game UX" pattern seen in mature RTS mod ecosystems (adapted to IC's D020/D069/D062 model, not copied verbatim).

### Player-First Installation Wizard Reuse (D069 Shared Components)

The **D069 installation / first-run setup wizard** is designed player-first, but the SDK should reuse its shared setup components rather than inventing a parallel installer UX.

**What the SDK reuses:**
- install/setup mode framing (`Quick` / `Advanced` / `Maintenance`) where it fits creator workflows
- data directory selection/health checks and repair/reclaim patterns
- content source detection UI (useful for asset imports/reference game files)
- transfer/progress/verify/error presentation patterns
- maintenance entry points (`Modify Installation`, `Repair & Verify`, re-scan sources)

**SDK-specific additions (creator-focused):**
- Git availability check and guidance (informational, not a hard gate)
- optional creator components/toolchains/templates/sample projects
- optional export helper dependencies (downloaded on demand)
- no forced installation of heavy creator packs on first launch

**Boundary remains unchanged:** `ic-editor` is still a separate application/binary (D020/D040). D069 contributes shared setup UX components and semantics, not a merged player+SDK binary or a single monolithic installer.

### Continuous Deployment for Workshop Authors

The `ic` CLI is designed to run unattended in CI pipelines. Every command that touches the Workshop API accepts a `--token` flag (or reads `IC_WORKSHOP_TOKEN` from the environment) for headless authentication. No interactive login required.

**API tokens:**

```
ic auth token create --name "github-actions" --scope publish,promote --expires 90d
```

Tokens are scoped — a token can be limited to `publish` (upload only), `promote` (change channels), or `admin` (full access). Tokens expire. Leaked tokens can be revoked instantly via `ic auth token revoke` or the Workshop web UI.

**Example: GitHub Actions workflow**

```yaml
# .github/workflows/publish.yml
name: Publish to Workshop
on:
  push:
    tags: ["v*"]        # trigger on version tags

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install IC CLI
        run: curl -sSf https://install.ironcurtain.gg | sh

      - name: Validate mod
        run: ic mod check

      - name: Run smoke tests
        run: ic mod test --headless

      - name: Publish to beta channel
        run: ic mod publish --channel beta
        env:
          IC_WORKSHOP_TOKEN: ${{ secrets.IC_WORKSHOP_TOKEN }}

      # Optional: auto-promote to release after beta soak period
      - name: Promote to release
        if: github.ref_type == 'tag' && !contains(github.ref_name, '-beta')
        run: ic mod promote ${{ github.ref_name }} release
        env:
          IC_WORKSHOP_TOKEN: ${{ secrets.IC_WORKSHOP_TOKEN }}
```

**What this enables:**

| Workflow                    | Description                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Tag-triggered publish**   | Push a `v1.2.0` tag → CI validates, tests headless, publishes to Workshop automatically                                           |
| **Beta channel CI**         | Every merge to `main` publishes to `beta` channel; explicit tag promotes to `release`                                             |
| **Multi-resource monorepo** | A single repo with multiple resource packs, each published independently via matrix builds                                        |
| **Automated quality gates** | `ic mod check` + `ic mod test` + `ic mod audit` run before every publish — catch broken YAML, missing licenses, incompatible deps |
| **Scheduled rebuilds**      | Cron-triggered CI re-publishes against latest engine version to catch compatibility regressions early                             |

**GitLab CI, Gitea Actions, and any other CI system** work identically — the `ic` CLI is a single static binary with no runtime dependencies. Download it, set `IC_WORKSHOP_TOKEN`, run `ic mod publish`.

**Self-hosted Workshop servers** accept the same tokens and API — authors publishing to a community Workshop server use the same CI workflow, just pointed at a different `--server` URL:

```
ic mod publish --server https://mods.myclan.com/workshop --channel release
```

### Mod Manifest (`mod.toml`)

Every mod has a `mod.toml` at its root — the single source of truth for mod identity and composition. IC-native manifests use TOML (D067: infrastructure about a mod, not game content). OpenRA's `mod.yaml` is still read for compatibility (D026), but IC mods author `mod.toml`:

```toml
# mod.toml
[mod]
id = "my-total-conversion"
title = "Red Apocalypse"
version = "1.2.0"
authors = ["ModderName"]
description = "A total conversion set in an alternate timeline"
website = "https://example.com/red-apocalypse"
license = "CC-BY-SA-4.0"            # modder's choice — no GPL requirement

[engine]
version = "^0.3.0"                  # semver — compatible with 0.3.x
game_module = "ra1"                 # which GameModule this mod targets

[assets]
rules = ["rules/**/*.yaml"]
maps = ["maps/"]
missions = ["missions/"]
scripts = ["scripts/**/*.lua"]
wasm_modules = ["wasm/*.wasm"]
media = ["media/"]
chrome = ["chrome/**/*.yaml"]
sequences = ["sequences/**/*.yaml"]

[defaults]
balance_preset = "classic"           # default balance preset for this mod

[dependencies]                      # other mods/workshop items required
"community-hd-sprites" = { version = "^2.0", source = "workshop" }

[llm]
summary = "Alternate-timeline total conversion with new factions and units"
gameplay_tags = ["total_conversion", "alternate_history", "new_factions"]
```

### Standardized Mod Directory Layout

```
my-mod/
├── mod.toml                  # manifest (required)
├── rules/                    # Tier 1: YAML data
│   ├── units/
│   │   ├── infantry.yaml
│   │   └── vehicles.yaml
│   ├── structures/
│   ├── weapons/
│   ├── terrain/
│   └── presets/              # balance preset overrides
├── maps/                     # map files (.oramap or native)
├── missions/                 # campaign missions
│   ├── allied-01.yaml
│   └── allied-01.lua
├── campaigns/                # campaign definitions (D021)
│   └── tutorial/
│       └── campaign.yaml
├── hints/                    # contextual hint definitions (D065)
│   └── mod-hints.yaml
├── tips/                     # post-game tip definitions (D065)
│   └── mod-tips.yaml
├── scripts/                  # Tier 2: Lua scripts
│   ├── abilities/
│   └── triggers/
├── wasm/                     # Tier 3: WASM modules
│   └── custom_mechanics.wasm
├── media/                    # videos, cutscenes
├── chrome/                   # UI layout definitions
├── sequences/                # sprite sequence definitions
├── cursors/                  # custom cursor definitions
├── audio/                    # music, SFX, voice lines
├── templates/                # Tera mission/scene templates
└── README.md                 # human-readable mod description
```

**Contextual hints (`hints/`):** Modders define YAML-driven gameplay hints that appear at point-of-need during any game mode. Hints are merged with the base game's hints at load time. The full schema — trigger types, suppression rules, experience profile targeting, and SQLite tracking — is documented in `decisions/09g/D065-tutorial.md` Layer 2.

**Post-game tips (`tips/`):** YAML-driven rule-based tips shown on the post-game stats screen, matching gameplay event patterns. See `decisions/09g/D065-tutorial.md` Layer 5.

### Mod Templates (via `cargo-generate`)

`ic mod init` uses `cargo-generate`-style templates. Built-in templates:

| Template           | Creates                               | For                                         |
| ------------------ | ------------------------------------- | ------------------------------------------- |
| `data-mod`         | mod.toml + rules/ + empty maps/       | Simple balance/cosmetic mods (Tier 1 only)  |
| `scripted-mod`     | Above + scripts/ + missions/          | Mission packs, custom game modes (Tier 1+2) |
| `total-conversion` | Full directory layout including wasm/ | Total conversions (all tiers)               |
| `map-pack`         | mod.toml + maps/                      | Map collections                             |
| `asset-pack`       | mod.toml + media/ + sequences/        | Sprite/sound/video packs                    |

Community can publish custom templates to the workshop.

### Development Workflow

```
1. ic mod init scripted-mod          # scaffold
2. Edit YAML rules, write Lua scripts
3. ic mod watch                      # hot-reload mode
4. ic mod check                      # validate everything
5. ic mod test                       # headless smoke test
6. ic mod publish                    # push to workshop
```

Compare to OpenRA's workflow: install .NET SDK → fork SDK repo → edit MiniYAML → write C# DLL → `make` → `launch-game.sh` → manually package → upload to forum.
