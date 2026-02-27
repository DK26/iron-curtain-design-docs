# Godot Engine & O3DE (Open 3D Engine) — Architecture Analysis for Iron Curtain

> **Research date:** 2026-02-15
> **Repositories analyzed:**
> - [godotengine/godot](https://github.com/godotengine/godot) — 106,662★, MIT license, C++
> - [o3de/o3de](https://github.com/o3de/o3de) — 8,944★, Apache-2.0 OR MIT, C++
>
> **Purpose:** Extract architectural patterns relevant to Iron Curtain (Rust/Bevy RTS engine).
> Both are fully open-source, game-agnostic engines with rich extension systems, editors, and community models.

---

## 1. Extension / Plugin Architecture

### Godot: GDExtension System

Godot's extension architecture operates at two levels: **built-in modules** (compiled into the engine) and **GDExtensions** (loaded at runtime via shared libraries).

**Built-in Modules** (`modules/` directory — 40+ modules):
- Each module is a self-contained directory with an `SCsub` build file
- Modules register their types, servers, and editor integrations at specific initialization levels
- Examples: `multiplayer`, `gdscript`, `mono` (C#), `websocket`, `navigation`
- Modules can be compiled out entirely via build flags — the engine remains functional without any single module

**GDExtension** (`core/extension/`):
- Runtime-loadable shared libraries (`.gdextension` files describe them)
- The `GDExtensionManager` singleton manages lifecycle: load → initialize → reload → unload
- Four initialization levels mirror the engine's boot sequence:
  ```
  INITIALIZATION_LEVEL_CORE
  INITIALIZATION_LEVEL_SERVERS
  INITIALIZATION_LEVEL_SCENE
  INITIALIZATION_LEVEL_EDITOR
  ```
- Extensions register new classes by inheriting from existing Godot classes via a C ABI
- The `gdextension_interface.cpp` (87KB) exposes the entire engine API through function pointers — extensions call engine functions through this stable interface
- **Hot-reloading support** in editor: extensions track instance bindings, save/restore state, and clear/rebuild when the library changes
- Extensions can register methods, properties, signals, constants, and virtual methods — the full class system is available
- An `extension_api_dump.cpp` generates a complete JSON API description for language binding generators

**Key design insight:** Godot achieves maximum extensibility through a **stable C ABI boundary**. The extension doesn't link against engine symbols — it receives function pointers at initialization. This means extensions compiled against one Godot version work across compatible versions without recompilation.

### O3DE: Gem System

O3DE's modular architecture is built around **Gems** — self-contained packages of code, assets, and configuration.

**Gem Structure** (each Gem contains):
- `gem.json` — metadata manifest declaring name, version, license, tags, dependencies, and type
- `Code/` — C++ source with CMakeLists.txt
- `Assets/` — any associated assets
- `Registry/` — settings registry files
- `preview.png` — icon for the editor

**The `engine.json` manifest** lists all registered Gems (80+ in the main repo):
- `external_subdirectories` — filesystem paths to Gem directories
- `gem_names` — which Gems are active for the engine build itself
- `templates` — project/Gem templates for scaffolding new content
- `repos` — remote repository URLs for discovering third-party Gems

**Gem Categories** observed in the repository:
- **Core framework:** Atom (renderer), LmbrCentral, ScriptCanvas
- **Networking:** Multiplayer, MultiplayerCompression, CertificateManager
- **Audio:** AudioSystem, AudioEngineWwise, MiniAudio
- **Physics:** PhysX (with separate PhysX4 and PhysX5 variants)
- **Navigation:** RecastNavigation
- **UI:** LyShine, UiBasics
- **Input:** BarrierInput, Gestures, StartingPointInput, VirtualGamepad
- **Terrain/World:** Terrain, Vegetation, SurfaceData, GradientSignal
- **Tooling:** Profiler, DebugDraw, ImGui, RemoteTools
- **Scripting:** ScriptCanvas, ScriptEvents, EditorPythonBindings

**Dependency system:** Gems declare dependencies in `gem.json`. The Multiplayer Gem depends on `CertificateManager`, `Atom_Feature_Common`, and `ImGui`. The build system resolves the dependency graph via CMake.

**Key design insight:** O3DE's Gem system makes **everything optional** — even the renderer (Atom) is a Gem. The engine core (`AzCore`, `AzFramework`, `AzNetworking`) provides only fundamental services. Games compose their feature set by selecting Gems. This is extreme modularity, but it comes with complexity — understanding which Gems to enable is non-trivial.

### Comparison & IC Lessons

| Aspect                 | Godot GDExtension                             | O3DE Gems                          | IC (Bevy Plugins)                           |
| ---------------------- | --------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| Interface boundary     | Stable C ABI                                  | C++ ABI + CMake                    | Rust trait + Bevy Plugin trait              |
| Granularity            | Class-level (register individual types)       | Package-level (entire feature set) | Crate-level                                 |
| Hot-reload             | Yes (editor-mode)                             | No (requires rebuild)              | Possible via Bevy hot-reload (experimental) |
| Dependency declaration | `.gdextension` file                           | `gem.json` dependencies            | `Cargo.toml`                                |
| Discovery              | Built-in Asset Library                        | `repos` in engine.json + templates | IC Workshop (D030)                          |
| Initialization order   | 4 explicit levels (Core→Servers→Scene→Editor) | Component activation order         | Bevy plugin dependency ordering             |

**Actionable lessons for IC:**

1. **Godot's 4-level initialization is directly applicable.** IC should define initialization stages for its plugin system — e.g., `Protocol → Sim → Render → Editor`. This maps well to Bevy's startup stages, but making it explicit in documentation prevents ordering bugs.

2. **O3DE's `gem.json` pattern validates IC's Workshop approach (D030).** The manifest-driven Gem system where metadata is declarative JSON is exactly what IC plans for Workshop packages. Consider adopting a similar schema: `name`, `version`, `license`, `dependencies`, `tags`, `type` (Code/Asset/Mixed).

3. **Godot's stable ABI is a lesson in forward-compatibility.** IC's WASM mod interface (D005) already achieves this — WASM provides an even more portable ABI than shared libraries. For Lua mods, the Lua C API serves the same role. IC's tiered model (YAML→Lua→WASM) is well-positioned.

4. **O3DE's "everything is a Gem" philosophy is a cautionary tale.** When even the renderer is optional, the configuration space explodes. IC's approach of having a fixed engine core with an optional `GameModule` trait for game-specific behavior is a better balance — the core is stable, and only game-specific systems are pluggable.

---

## 2. Editor Architecture

### Godot Editor

The Godot editor is **the engine itself** — it runs the same scene tree and rendering pipeline as a game. The editor is a Godot application built on top of the engine.

**Key architectural elements** (from `editor/editor_node.h`):

- `EditorNode` is a `Node` subclass (GDCLASS heritage) — it lives in the scene tree like any game object
- The editor is composed of dockable panels managed by `EditorDockManager`
- Split container hierarchy: `left_l_vsplit`, `left_r_vsplit`, `main_hsplit`, `right_l_vsplit`, `right_r_vsplit`, `center_split`
- Major subsystems:
  - `FileSystemDock` — project asset browser
  - `EditorMainScreen` — viewport switching (2D/3D/Script)
  - `EditorBottomPanel` — output, debugger, profiler
  - `EditorLog` — console output
  - `EditorRunBar` — play/stop/pause controls
  - `ProjectSettingsEditor`, `EditorSettingsDialog` — configuration UIs
  - `EditorExport` — platform export pipeline
  - `EditorResourcePreview` — thumbnail generation
  - `EditorCommandPalette` — fuzzy command search

**Editor Plugin System** (`editor/plugins/editor_plugin.h`):
- `EditorPlugin` is a `Node` that can:
  - Add controls to any dock slot, toolbar, or bottom panel
  - Register custom import plugins, export plugins, inspector plugins
  - Forward 2D/3D input events for custom gizmos
  - Add tool menu items and context menu entries
  - Save/restore state across editor sessions
  - Register custom resource conversion, debugger plugins, translation parsers
- Virtual methods like `_handles(Object*)`, `_edit(Object*)`, `_make_visible(bool)` allow plugins to react to selection changes
- Plugins can provide main screen tabs (like the Script editor or AssetLib)

**EditorPlugin capabilities list** (from the header):
- `add_import_plugin()` / `add_export_plugin()` — asset pipeline extensions
- `add_node_3d_gizmo_plugin()` — 3D viewport gizmos
- `add_inspector_plugin()` — property panel customization
- `add_scene_format_importer_plugin()` — scene import (FBX, glTF, etc.)
- `add_debugger_plugin()` — debugger tab extensions
- `add_autoload_singleton()` — persistent game services
- `add_context_menu_plugin()` — right-click context menus

### O3DE Editor

O3DE's editor is a **Qt-based application** separate from the runtime. It uses `EditorPythonBindings` for scripting and extends through the Gem system.

**Key characteristics:**
- Built with Qt (via `Gems/QtForPython`)
- The editor is composed of components that connect via O3DE's EBus (Event Bus) system
- Gems can register editor components that add panels, property editors, and viewport tools
- `ScriptCanvas` provides visual scripting — a node-based graph editor living in its own Gem
- `GraphCanvas` and `GraphModel` Gems provide the underlying graph UI framework

### IC Lesson: Scenario Editor (D038) Design

1. **Follow Godot's "editor is the engine" philosophy.** IC should build `ic-editor` as a Bevy application that uses the same ECS, rendering, and simulation systems as the game. This means the scenario editor can preview maps with real rendering, test mission scripts live, and share all asset loading code with the game.

2. **Adopt an EditorPlugin-style extension point system.** IC's editor should define extension traits:
   - `EditorPanel` — for adding dockable UI panels
   - `EditorGizmo` — for map viewport overlays (waypoint visualization, trigger zones)
   - `EditorImporter` — for custom asset import
   - `EditorInspector` — for custom property editing
   This allows the community to extend the editor via Workshop packages.

3. **Godot's distraction-free mode and layout persistence** are applicable to IC's editor. Store dock layouts in user preferences, allow saving/loading custom layouts for different workflow stages (mapping vs. scripting vs. testing).

4. **O3DE's separate editor binary validates IC's architectural choice (D038).** IC already specifies `ic-editor` as a separate binary from `ic-game`. This is the right call — the editor has different dependencies (UI frameworks, file dialogs, undo/redo) that should not bloat the game binary.

---

## 3. Asset Pipeline

### Godot: Import-on-Save System

Godot's asset pipeline uses a **ResourceFormatLoader / ResourceImporter** pattern:

**ResourceFormatLoader** (`core/io/resource_loader.h`):
- Pluggable loader system — up to 64 loaders can be registered
- Thread-safe loading with `load_threaded_request()` / `load_threaded_get()`
- Cache modes: `IGNORE`, `REUSE`, `REPLACE`, `IGNORE_DEEP`, `REPLACE_DEEP`
- Resource UIDs for stable references across renames
- Dependency tracking via `get_dependencies()`
- Custom loaders register via `add_resource_format_loader()`
- Translation remapping support (localization)

**ResourceImporter** (`core/io/resource_importer.h`):
- Import presets allow users to configure how assets are processed
- Import groups batch multiple source files into one output
- Import ordering ensures dependencies are processed first
- Each importer defines: recognized extensions, save extension, resource type, priority
- Import settings can be validated for correctness
- Threaded importing support (`can_import_threaded()`)
- Build dependencies tracking for incremental rebuilds

**Import workflow:**
1. User drops a `.png` into the project folder
2. The `ResourceFormatImporter` detects the new file
3. The appropriate `ResourceImporter` (e.g., texture importer) processes it
4. A `.import` file is created alongside the original, storing import settings
5. The processed resource is cached in `.godot/imported/`
6. Subsequent loads use the cached version until the source or settings change

### O3DE: Asset Processor

O3DE uses a **separate background process** called the Asset Processor:

**Architecture** (`Code/Tools/AssetProcessor/`):
- Runs as a standalone GUI or batch application
- Watches source directories for changes
- Processes assets through registered `AssetBuilder` modules
- Output goes to a platform-specific cache directory
- `AssetBuilderSDK` defines the interface for custom builders
- Each Gem can register its own asset builders
- Supports per-platform asset variants (PC, console, mobile)

**Key files:**
- `AssetBuilder/` — the builder host process
- `AssetBuilderSDK/` — public API for writing custom builders
- `native/` — the main processor implementation
- `assetprocessor_gui_files.cmake` — Qt-based monitoring UI
- `assetprocessor_batch_files.cmake` — headless batch mode

### IC Lesson: Asset Pipeline Design

1. **Follow Godot's pluggable loader pattern.** IC's `ra-formats` crate already handles C&C-specific formats. For the broader engine, define a `ResourceLoader` trait in ic-game that `ra-formats` implements. This allows future game modules (TD, RA2) to register their own format handlers.

2. **Godot's threaded loading with UIDs is directly applicable.** Bevy already provides async asset loading, but IC should add:
   - UID-based references for stable asset addressing (especially for Workshop resources)
   - Import settings persistence (YAML, not `.import` files)
   - Dependency-aware loading order

3. **O3DE's background Asset Processor is overkill for IC.** Godot's simpler import-on-save model is more appropriate. IC's assets are relatively small (sprites, audio, maps) — they don't need a dedicated background process. Use Bevy's built-in asset system with custom loaders.

4. **Both engines validate the importance of hot-reloading for editor productivity.** The scenario editor (D038) should detect file changes and re-process affected assets without a full restart. Bevy's asset watcher can handle this.

---

## 4. Modding & Community Content Distribution

### Godot: Asset Library

Godot's community content system operates through:

1. **Godot Asset Library** (https://godotengine.org/asset-library/asset):
   - Web-based repository integrated into the editor
   - Assets are categorized by type, Godot version, and license
   - Authors submit GitHub/GitLab repository URLs
   - The library doesn't host files — it links to Git repositories
   - Review process exists before listing
   - In-editor browsing and one-click install

2. **Addon structure:**
   - Addons live in `addons/` directory within a project
   - An `plugin.cfg` file declares the addon's metadata
   - EditorPlugins are activated/deactivated in Project Settings
   - Addons can include scripts (GDScript/C#), scenes, resources, and GDExtensions

3. **Separate proposals repository** (`godotengine/godot-proposals`):
   - Feature requests are filed separately from bug reports
   - This prevents the main issue tracker from drowning in feature discussions
   - Proposals are discussed, refined, and sometimes championed by community members

### O3DE: Remote Gem Repositories

O3DE's content distribution:

1. **Remote Gem Repositories:**
   - `engine.json` declares `repos` URLs pointing to canonical registries
   - The `o3de` CLI tool (`scripts/o3de.bat`) manages Gem discovery, download, and registration
   - Templates exist for creating new Gems: `DefaultGem`, `AssetGem`, `CppToolGem`, `GraphicsGem`, `PrebuiltGem`, etc.
   - Community Gems can live in any Git repository

2. **Gem Templates** (from `engine.json`):
   ```
   Templates/AssetGem          — asset-only packages
   Templates/CppToolGem        — editor tool extensions
   Templates/DefaultGem        — standard code+asset Gem
   Templates/GraphicsGem       — rendering extensions
   Templates/PrebuiltGem       — pre-compiled binary Gems
   Templates/PythonToolGem     — Python-based editor tools
   Templates/UnifiedMultiplayerGem — multiplayer game template
   Templates/GemRepo           — template for creating a Gem repository
   Templates/RemoteRepo        — template for remote repository index
   ```

### IC Lesson: Workshop & Community Content (D030)

1. **Godot's "link to Git, don't host files" model is elegant and low-cost.** IC's Workshop registry (D030) plans a federated multi-source approach — this aligns well. The index is metadata; the content lives in user-hosted repositories. This reduces hosting costs and legal liability.

2. **O3DE's template system is excellent for onboarding.** IC should provide templates for common mod types:
   - `ic mod init --template=balance-preset` — YAML-only balance mod
   - `ic mod init --template=lua-mission` — Lua mission script
   - `ic mod init --template=total-conversion` — WASM game module
   - `ic mod init --template=map-pack` — map collection

3. **Godot's separation of proposals from bug reports is a governance win.** IC should adopt this pattern: main repo for bugs, separate repo for feature proposals. This keeps development-focused conversations clean.

4. **O3DE's `PrebuiltGem` template validates IC's WASM mod distribution model.** Pre-compiled packages avoid the "everyone needs a build environment" problem. WASM modules serve the same purpose — distributable, sandboxed, no toolchain required for end users.

---

## 5. Networking Architecture

### Godot: Pluggable MultiplayerAPI

Godot's networking is built around a clean abstraction layer:

**MultiplayerAPI** (`scene/main/multiplayer_api.h`):
- Pure abstract interface with virtual methods:
  - `poll()` — process network events
  - `set_multiplayer_peer()` / `get_multiplayer_peer()` — transport swapping
  - `rpcp()` — remote procedure calls
  - `object_configuration_add()` / `object_configuration_remove()` — object replication
- The default implementation is `SceneMultiplayer` (in `modules/multiplayer/`)
- **Custom implementations can fully replace the default** via `MultiplayerAPIExtension` (GDVIRTUAL methods)
- Multiple `MultiplayerAPI` instances can coexist (mapped to different NodePaths in the SceneTree)

**MultiplayerPeer** — transport abstraction:
- Abstract base with `get_packet()` / `put_packet()` / `poll()`
- Transfer modes: `RELIABLE`, `UNRELIABLE`, `UNRELIABLE_ORDERED`
- Target peer addressing for broadcast vs. direct messaging
- Connection status tracking
- `OfflineMultiplayerPeer` — a null implementation for single-player

**SceneMultiplayer** (`modules/multiplayer/scene_multiplayer.h`):
- Network commands: `REMOTE_CALL`, `SIMPLIFY_PATH`, `CONFIRM_PATH`, `RAW`, `SPAWN`, `DESPAWN`, `SYNC`, `SYS`
- System commands: `AUTH`, `ADD_PEER`, `DEL_PEER`, `RELAY`
- Built-in **server relay** support (`server_relay` boolean)
- **Authentication callback** system with configurable timeout
- Scene replication interface: `SceneReplicationInterface`
- Scene cache: `SceneCacheInterface` (path compression)
- RPC interface: `SceneRPCInterface`
- Bandwidth profiling in debug builds

**Key pattern:** Networking is integrated into the scene tree via `SceneTree::multiplayer`. The tree owns the multiplayer API instance. This means networking is available everywhere a scene tree exists, but it's **not in the core** — it's in `modules/multiplayer/`.

### O3DE: Layered Networking Framework

O3DE has a sophisticated multi-layer networking stack:

**AzNetworking** (`Code/Framework/AzNetworking/`):
- Low-level transport framework with sub-directories:
  - `ConnectionLayer/` — connection management, handshakes
  - `PacketLayer/` — packet encoding/decoding
  - `TcpTransport/` — TCP implementation
  - `UdpTransport/` — UDP implementation
  - `Serialization/` — network serialization
  - `DataStructures/` — ring buffers, etc.
  - `Framework/` — network interface management
  - `AutoGen/` — code-generated packet definitions
- `IConnectionListener` interface for handling connection events

**Multiplayer Gem** (`Gems/Multiplayer/`):
- Built on top of AzNetworking
- `MultiplayerSystemComponent` implements `IMultiplayer`, `IConnectionListener`, and `AZ::TickBus::Handler`
- **Agent types:** Server, Client, ClientServer — assigned at initialization
- Entity replication via `NetworkEntityManager`
- Network time synchronization via `NetworkTime`
- **Auto-generated packet dispatchers** (`Multiplayer.AutoPacketDispatcher.h`)
- Client migration support (server handoff)
- Physics-tick aligned networking (`OnPhysicsPreSimulate` / `OnPhysicsPostSimulate`)
- Session management via `SessionNotificationBus`
- Metrics collection and reporting
- Handles player spawn queuing (connect before level load)

**Key pattern:** O3DE separates transport (`AzNetworking`) from game networking (`Multiplayer Gem`). The transport layer knows nothing about entities or game state — it just moves packets. The Multiplayer Gem handles replication, RPCs, and game-level networking on top.

### IC Lesson: Network Architecture

1. **Godot's `MultiplayerAPI` trait pattern directly validates IC's `NetworkModel` trait (D006).** The design is nearly identical:
   - Godot: `MultiplayerAPI` → `SceneMultiplayer` (default) or custom impl
   - IC: `NetworkModel` → `RelayLockstepNetwork` (default), `RollbackNetwork` (future), or custom

2. **O3DE's transport/game-networking split maps exactly to IC's `ic-net` / `ic-protocol` boundary.** `AzNetworking` ≈ transport layer in `ic-net`. `Multiplayer Gem` ≈ game-level protocol in `ic-protocol`. IC's design already separates these cleanly.

3. **Godot's `OfflineMultiplayerPeer` validates IC's `LocalNetwork` concept.** A null/offline implementation that satisfies the trait interface but runs everything locally is essential for testing and single-player. IC should implement `LocalNetwork: NetworkModel` as a zero-overhead passthrough.

4. **O3DE's physics-tick aligned networking is relevant for IC.** The `MultiplayerSystemComponent` explicitly hooks into `OnPhysicsPreSimulate` and `OnPhysicsPostSimulate`. IC's deterministic sim runs in Bevy's `FixedUpdate` — network order processing should align with this fixed timestep.

5. **Godot's server relay as a built-in option** reinforces IC's relay server design (D007). Both engines recognize that relay is a practical default for most players. IC's relay design is well-aligned with industry practice.

6. **O3DE's auto-generated packet code** (from AutoGen templates) is worth noting. IC could use Rust macros or build scripts to auto-generate `PlayerOrder` serialization/deserialization from a schema, reducing boilerplate in `ic-protocol`.

---

## 6. Game-Agnostic Design

### Godot: Scene Tree + Node Composition

Godot achieves game-type independence through:

**Node-based composition:**
- Everything is a `Node` in a tree hierarchy
- Game-specific behavior comes from combining built-in node types and scripts
- No hardcoded game genres — the engine provides primitives (sprites, physics bodies, cameras)
- Scene tree separation: `scene/2d/`, `scene/3d/`, `scene/animation/`, `scene/audio/`, `scene/gui/`, `scene/resources/`

**SceneTree** (`scene/main/scene_tree.h`):
- Manages the process loop: `physics_process()` and `process()` (fixed-step and variable-step)
- Group system for organizing nodes by tag (e.g., "enemies", "projectiles")
- Process groups with configurable threading
- Pause/suspend support with per-node overrides
- Frame interpolation (FTI) for smooth rendering between physics ticks

**Key abstractions that enable game-agnosticism:**
- Rendering is node-based (add a `Sprite2D`, `MeshInstance3D`, etc.) — no hardcoded render pipeline
- Physics uses `PhysicsServer2D` / `PhysicsServer3D` abstractions — multiple backends can implement them
- Input is event-driven (`InputEvent` hierarchy) — supports keyboard, mouse, touch, gamepad equally
- Animation system is generic — animate any property on any node

### O3DE: Component Entity System + Gems

O3DE achieves game independence through:

**Component model:**
- Entities are composed of components from Gems
- No entity archetype is hardcoded — a "character" is just an entity with movement, input, and rendering components
- `AZ::Component` base class with `Activate()` / `Deactivate()` lifecycle
- Components communicate via the EBus (Event Bus) system — loose coupling

**Gem-as-feature:**
- Want multiplayer? Add the Multiplayer Gem
- Want physics? Add PhysX4 or PhysX5 Gem
- Want navigation? Add RecastNavigation Gem
- Want terrain? Add Terrain + Vegetation + SurfaceData Gems
- The game is defined by its Gem selection and component composition

**Prefab system** (`Gems/Prefab/`):
- Reusable entity compositions stored as Prefabs (like Godot's PackedScenes)
- Prefabs can be nested, overridden, and instantiated

### IC Lesson: Game-Agnostic Core (D039)

1. **IC's `GameModule` trait aligns with both engines' approaches.** Godot uses node types and scripts; O3DE uses Gems and components; IC uses `GameModule` to bundle systems, pathfinder, spatial index, and fog implementation. This is the right level of abstraction for an RTS engine.

2. **IC should resist Godot's scene tree and O3DE's deep component nesting.** For an RTS with hundreds of units, flat ECS archetypes in Bevy are more appropriate than deep hierarchies. The lesson from both engines is about the interface (traits/virtuals), not the implementation pattern.

3. **Both engines confirm IC's "positions are 3D" invariant.** Godot has both `Node2D` and `Node3D` hierarchies; O3DE is 3D-native with 2D overlay. IC's `WorldPos { x, y, z }` is correct — even if RA1 sets z=0, the engine must not assume 2D.

4. **O3DE's selective Gem activation validates IC's approach.** Not every game needs every subsystem. IC's game modules should be able to register only the systems they need. The TD module might use different pathfinding than RA1; the engine core shouldn't care.

5. **Godot's process group system is interesting for IC.** Process groups allow different parts of the scene tree to run on different threads. IC could group entities by spatial locality or by type for cache-friendly processing — aligning with the efficiency pyramid (D015).

---

## 7. Community Governance

### Godot: Foundation-Backed Open Development

Godot's governance is notably successful and well-documented:

**Organizational structure:**
- **Godot Foundation** — a non-profit that employs core developers and handles finances
- Development is "fully independent and community-driven" (from README)
- Juan Linietsky (reduz) remains lead developer and project founder
- Core team of contributors with merge access

**Contribution workflow** (from CONTRIBUTING.md):
- Bug reports go to the main repository with MRP (Minimal Reproduction Project) requirements
- Feature proposals go to a **separate repository** (`godotengine/godot-proposals`)
- PRs must solve common use cases that "several users will need in their real-life projects"
- Code style guidelines are documented and enforced
- Unit tests are required for bug fixes and new features
- Commit messages follow a specific format (imperative verb, 72-char title)
- `git pull --rebase` — no merge commits in PRs

**Communication channels:**
- Godot Contributors Chat (chat.godotengine.org) — primary development discussion
- Bug tracker (GitHub Issues) — structured problem reports
- Proposals repo — feature requests and design discussions
- Weblate — translation contributions

**Key governance insights:**
- **Separate bug tracker from feature proposals** — keeps development focused
- **Clear PR guidelines** — prevents "drive-by" contributions that create maintenance burden
- **MRP requirement** — bug reports must be actionable, not vague complaints
- **"Best to discuss the implementation in the bug report first"** — avoids wasted effort
- **Documentation is in its own repository** — different pace than engine development
- **Demos are in their own repository** — keeps the main repo clean

### O3DE: Linux Foundation Governance

O3DE uses a more formal governance structure:

**Organizational structure:**
- **Linux Foundation project** — corporate governance with formal committees
- Community repo (`o3de/community`) manages organizational processes
- SIG (Special Interest Group) model for decision-making
- DCO (Developer Certificate of Origin) required — `git commit -s`
- Code of Conduct enforcement

**Contribution approach:**
- Formal contribution guide lives in the community repo, not the engine repo
- The main CONTRIBUTING.md is minimal — just links to the community repo
- This separates "how to contribute code" from "how the community works"

### IC Lesson: Community Governance (D037)

1. **Godot's proposals repository pattern is highly recommended.** IC should create `iron-curtain-proposals` (or equivalent) for feature requests, keeping the main repo clean for code and bug reports.

2. **Godot's MRP requirement is a model for IC bug reporting.** IC should require a save file, replay, or minimal mod that reproduces the issue. For a deterministic RTS, a replay file that demonstrates a bug is the ultimate reproduction case.

3. **IC's DCO approach (from AGENTS.md) matches both engines.** Both Godot (implicitly through PR process) and O3DE (explicitly through DCO) use developer attestation rather than CLAs. IC's `Signed-off-by:` requirement is industry standard.

4. **Godot's Foundation model is the aspirational target for IC.** A non-profit foundation that employs developers ensures long-term sustainability. IC's phased approach (community-driven → possible foundation) is realistic. O3DE's Linux Foundation stewardship is heavier but provides corporate legitimacy.

5. **Godot's success comes from opinionated simplicity.** The engine has clear design principles, a lead developer with strong vision, and community trust built over years. IC should maintain its opinionated design philosophy (from 13-PHILOSOPHY.md) — community input shapes priorities, but architectural decisions have a clear decision-maker.

6. **Separate documentation repos** (both engines do this) keep the engine repository focused. IC already separates design docs from code — this is correct.

---

## Summary: Top 10 Extractable Patterns for Iron Curtain

| #   | Pattern                                                     | Source                        | IC Applicability                                                  |
| --- | ----------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| 1   | Stable extension ABI via function pointers / WASM boundary  | Godot GDExtension             | IC's WASM mods (D005) already achieve this; validate the approach |
| 2   | 4-stage initialization ordering (Core→Servers→Scene→Editor) | Godot                         | Define explicit plugin init stages in Bevy App setup              |
| 3   | Declarative package manifest with dependency graph          | O3DE gem.json                 | Adopt for Workshop packages (D030)                                |
| 4   | Editor-is-the-engine (same runtime for game and editor)     | Godot                         | Build ic-editor as a Bevy app sharing ic-sim/ic-render            |
| 5   | Pluggable MultiplayerAPI trait with null implementation     | Godot                         | Validates IC's NetworkModel trait + LocalNetwork design (D006)    |
| 6   | Transport layer separated from game networking              | O3DE AzNetworking/Multiplayer | Validates ic-net/ic-protocol separation                           |
| 7   | Mod templates for scaffolding common mod types              | O3DE Templates                | `ic mod init --template=...` for the IC CLI                       |
| 8   | Separate proposals repository from bug tracker              | Godot                         | Create iron-curtain-proposals for feature requests                |
| 9   | Pluggable resource loader/importer with caching             | Godot ResourceFormatLoader    | Bevy asset system + custom loaders per game module                |
| 10  | Non-profit foundation for long-term sustainability          | Godot Foundation              | Aspirational target for IC community phase                        |

---

## Appendix: Source File References

### Godot Files Examined
- `README.md` — project overview, MIT license, community links
- `CONTRIBUTING.md` — contribution guidelines, PR process, commit format
- `core/extension/gdextension.h` — GDExtension class: loading, initialization, hot-reload, class registration
- `core/extension/gdextension_manager.h` — singleton managing all loaded extensions, initialization levels
- `core/extension/gdextension_interface.cpp` — 87KB file exposing entire engine API via C ABI
- `core/extension/extension_api_dump.cpp` — JSON API dump for language binding generators
- `core/io/resource_loader.h` — threaded resource loading, cache modes, format registration
- `core/io/resource_importer.h` — import pipeline: presets, options, threaded import, build dependencies
- `scene/main/scene_tree.h` — main loop, process groups, pause/suspend, multiplayer integration
- `scene/main/multiplayer_api.h` — abstract multiplayer interface, RPC modes, extension points
- `modules/multiplayer/scene_multiplayer.h` — default multiplayer implementation, relay, auth, replication
- `editor/editor_node.h` — editor application: docks, panels, menus, plugin management
- `editor/plugins/editor_plugin.h` — editor extension API: docks, importers, gizmos, inspectors
- `modules/` directory — 40+ built-in modules (multiplayer, gdscript, mono, websocket, etc.)
- `scene/` directory — scene system (2d, 3d, animation, audio, gui, resources, main)

### O3DE Files Examined
- `README.md` — project overview, build instructions, CMake setup
- `CONTRIBUTING.md` — DCO requirement, links to community repo
- `engine.json` — engine manifest: 80+ Gems, templates, remote repos, API versions
- `Gems/` directory — 60+ Gems covering all engine subsystems
- `Gems/Multiplayer/gem.json` — Gem metadata: dependencies, tags, type
- `Gems/Multiplayer/Code/Source/MultiplayerSystemComponent.h` — multiplayer system: agent types, entity replication, migration, metrics
- `Code/Framework/AzNetworking/AzNetworking/` — transport layer: TCP, UDP, serialization, connection management
- `Code/Tools/AssetProcessor/` — background asset processing: builders, SDK, batch/GUI modes
- `Code/Framework/AzFramework/AzFramework/Components/` — component system
