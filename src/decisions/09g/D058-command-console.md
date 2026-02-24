## D058: In-Game Command Console — Unified Chat and Command System

**Status:** Settled
**Scope:** `ic-ui` (chat input, dev console UI), `ic-game` (CommandDispatcher, wiring), `ic-sim` (order pipeline), `ic-script` (Lua execution)
**Phase:** Phase 3 (Game Chrome — chat + basic commands), Phase 4 (Lua console), Phase 6a (mod-registered commands)
**Depends on:** D004 (Lua Scripting), D006 (Pluggable Networking — commands produce PlayerOrders that flow through NetworkModel), D007 (Relay Server — server-enforced rate limits), D012 (Order Validation), D033 (QoL Toggles), D036 (Achievements), D055 (Ranked Matchmaking — competitive integrity)

**Crate ownership:** The `CommandDispatcher` lives in `ic-game` — it cannot live in `ic-sim` (would violate Invariant #1: no I/O in the simulation) and is too cross-cutting for `ic-ui` (CLI and scripts also use it). `ic-game` is the wiring crate that depends on all library crates, making it the natural home for the dispatcher.
**Inspired by:** Mojang's Brigadier (command tree architecture), Factorio (unified chat+command UX), Source Engine (developer console + cvars)

**Revision note (2026-02-22):** Revised to formalize camera bookmarks (`/bookmark_set`, `/bookmark`) as a first-class cross-platform navigation feature with explicit desktop/touch UI affordances, and to clarify that mobile tempo comfort guidance around `/speed` is advisory UI only (no new simulation/network authority path). This revision was driven by mobile/touch UX design work and cross-device tutorial integration (see D065 and `research/mobile-rts-ux-onboarding-community-platform-analysis.md`).

### Decision Capsule (LLM/RAG Summary)

- **Status:** Settled (Revised 2026-02-22)
- **Phase:** Phase 3 (chat + basic commands), Phase 4 (Lua console), Phase 6a (mod-registered commands)
- **Canonical for:** Unified chat/command console design, command dispatch model, cvar/command UX, and competitive-integrity command policy
- **Scope:** `ic-ui` text input/dev console UI, `ic-game` command dispatcher, command→order routing, Lua console integration, mod command registration
- **Decision:** IC uses a **unified chat/command input** (Brigadier-style command tree) as the primary interface, plus an optional developer console overlay for power users; both share the same dispatcher and permission/rule system.
- **Why:** Unified input is more discoverable and portable, while a separate power-user console still serves advanced workflows (multi-line input, cvars, debugging, admin tasks).
- **Non-goals:** Chat-only magic-string commands with no structured parser; a desktop-only tilde-console model that excludes touch/console platforms.
- **Invariants preserved:** `CommandDispatcher` lives outside `ic-sim`; commands affecting gameplay flow through normal validated order/network paths; competitive integrity is enforced by permissions/rules, not hidden UI.
- **Defaults / UX behavior:** Enter opens the primary text field; `/` routes to commands; command/help/autocomplete behavior is shared across unified input and console overlay.
- **Mobile / accessibility impact:** Command access has GUI/touch-friendly paths; camera bookmarks are first-class across desktop and touch; mobile tempo guidance around `/speed` is advisory UI only.
- **Security / Trust impact:** Rate limits, permissions, anti-trolling measures, and ranked restrictions are part of the command system design.
- **Public interfaces / types / commands:** Brigadier-style command tree, cvars, `/bookmark_set`, `/bookmark`, `/speed`, mod-registered commands (`.iccmd`, Lua registration as defined in body)
- **Affected docs:** `src/03-NETCODE.md`, `src/06-SECURITY.md`, `src/17-PLAYER-FLOW.md`, `src/decisions/09g-interaction.md` (D059/D065)
- **Revision note summary:** Added formal camera bookmark command/UI semantics and clarified mobile tempo guidance is advisory-only with no new authority path.
- **Keywords:** command console, unified chat commands, brigadier, cvars, bookmarks, speed command, mod commands, competitive integrity, mobile command UX, diagnostic overlay, net_graph, /diag, real-time observability

### Problem

IC needs two text-input capabilities during gameplay:

1. **Player chat** — team messages, all-chat, whispers in multiplayer
2. **Commands** — developer cheats, server administration, configuration tweaks, Lua scripting, mod-injected commands

These could be separate systems (Source Engine's tilde console vs. in-game chat) or unified (Factorio's `/` prefix in chat, Minecraft's Brigadier-powered `/` system). The choice affects UX, security, trolling surface, modding ergonomics, and platform portability.

### How Other Games Handle This

| Game/Engine                  | Architecture                                | Console Type                                    | Cheat Consequence                                   | Mod Commands                                            |
| ---------------------------- | ------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| **Factorio**                 | Unified: chat + `/command` + `/c lua`       | Same input field, `/` prefix routes to commands | `/c` permanently disables achievements for the save | Mods register Lua commands via `commands.add_command()` |
| **Minecraft**                | Unified: chat + Brigadier `/command`        | Same input field, Brigadier tree parser         | Commands in survival may disable advancements       | Mods inject nodes into the Brigadier command tree       |
| **Source Engine (CS2, HL2)** | Separate: `~` developer console + team chat | Dedicated half-screen overlay (tilde key)       | `sv_cheats 1` flags match                           | Server plugins register ConCommands                     |
| **StarCraft 2**              | No text console; debug tools = GUI          | Chat only; no command input                     | N/A (no player-accessible console)                  | Limited custom UI via Galaxy editor                     |
| **OpenRA**                   | GUI-only: DevMode checkbox menu             | No text console; toggle flags in GUI panel      | Flags replay as cheated                             | No mod-injected commands                                |
| **Age of Empires 2/4**       | Chat-embedded: type codes in chat box       | Same input field, magic strings                 | Flags game; disables achievements                   | No mod commands                                         |
| **Arma 3 / OFP**             | Separate: debug console (editor) + chat     | Dedicated windowed Lua/SQF console              | Editor-only; not in normal gameplay                 | Full SQF/Lua API access                                 |

**Key patterns observed:**

1. **Unified wins for UX.** Factorio and Minecraft prove that a single input field with prefix routing (`/` = command, no prefix = chat) is more discoverable and less jarring than a separate overlay. Players don't need to remember two different keybindings. Tab completion works everywhere.

2. **Separate console wins for power users.** Source Engine's tilde console supports multi-line input, scrollback history, cvar browsing, and autocomplete — features that are awkward in a single-line chat field. Power users (modders, server admins, developers) need this.

3. **Achievement/ranking consequences are universal.** Every game that supports both commands and competitive play permanently marks saves/matches when cheats are used. No exceptions.

4. **Trolling via chat is a solved problem.** Muting, ignoring, rate limiting, and admin tools handle chat abuse. The command system introduces a new trolling surface only if commands can affect other players — which is controlled by permissions, not by hiding the console.

5. **Platform portability matters.** A tilde console assumes a physical keyboard. Mobile and console platforms need command access through a GUI or touch-friendly interface.

### Decision

IC uses a **unified chat/command system** with a **Brigadier-style command tree**, plus an optional **developer console overlay** for power users. The two interfaces share the same command dispatcher — they differ only in presentation.

#### The Unified Input (Primary)

A single text input field, opened by pressing Enter (configurable). Prefix routing:

| Input                      | Behavior                        |
| -------------------------- | ------------------------------- |
| `hello team`               | Team chat message (default)     |
| `/help`                    | Execute command                 |
| `/give 5000`               | Execute command with arguments  |
| `/s hello everyone`        | Shout to all players (all-chat) |
| `/w PlayerName msg`        | Whisper to specific player      |
| `/c game.player.print(42)` | Execute Lua (if permitted)      |

**`/s` vs `/all` distinction:** `/s <message>` is a **one-shot** all-chat message — it sends the rest of the line to all players without changing your active channel. `/all` (D059 § Channel Switching) is a **sticky** channel switch — it changes your default channel to All so subsequent messages go to all-chat until you switch back. Same distinction as IRC's `/say` vs `/join`.

This matches Factorio's model exactly — proven UX with millions of users. The `/` prefix is universal (Minecraft, Factorio, Discord, IRC, MMOs). No learning curve.

**Tab completion** powered by the command tree. Typing `/he` and pressing Tab suggests `/help`. Typing `/give ` suggests valid argument types. The Brigadier-style tree generates completions automatically — mods that register commands get tab completion for free.

**Command visibility.** Following Factorio's principle: by default, all commands executed by any player are visible to all players in the chat log. This prevents covert cheating in multiplayer. Players see `[Admin] /give 5000` or `[Player] /reveal_map`. Lua commands (`/c`) can optionally use `/sc` (silent command) — but only for the host/admin, and the fact that a silent command was executed is still logged (the output is hidden, not the execution).

#### The Developer Console (Secondary, Power Users)

Toggled by `~` (tilde/grave, configurable). A half-screen overlay rendered via `bevy_egui`, inspired by Source Engine:

- **Multi-line input** with syntax highlighting for Lua
- **Scrollable output history** with filtering (errors, warnings, info, chat)
- **Cvar browser** — searchable list of all configuration variables with current values, types, and descriptions
- **Autocomplete** — same Brigadier tree, but with richer display (argument types, descriptions, permission requirements)
- **Command history** — up/down arrow scrolls through previous commands, persisted across sessions in SQLite (D034)

The developer console dispatches commands through the **same `CommandDispatcher`** as the chat input. It provides a better interface for the same underlying system — not a separate system with different commands.

**Compile-gated sections:** The Lua console (`/c`, `/sc`, `/mc`) and debug commands are behind `#[cfg(feature = "dev-tools")]` in release builds. Regular players see only the chat/command interface. The tilde console is always available but shows only non-dev commands unless dev-tools is enabled.

#### Command Tree Architecture (Brigadier-Style)

Already identified in `04-MODDING.md` as the design target. Formalized here:

```rust
/// The source of a command — who is executing it and in what context.
pub struct CommandSource {
    pub origin: CommandOrigin,
    pub permissions: PermissionLevel,
    pub player_id: Option<PlayerId>,
}

pub enum CommandOrigin {
    /// Typed in the in-game chat/command input
    ChatInput,
    /// Typed in the developer console overlay
    DevConsole,
    /// Executed from the CLI tool (`ic` binary)
    Cli,
    /// Executed from a Lua script (mission/mod)
    LuaScript { script_id: String },
    /// Executed from a WASM module
    WasmModule { module_id: String },
    /// Executed from a configuration file
    ConfigFile { path: String },
}

/// How the player physically invoked the action — the hardware/UI input method.
/// Attached to PlayerOrder (not CommandSource) for replay analysis and APM tracking.
/// This is a SEPARATE concept from CommandOrigin: CommandOrigin tracks WHERE the
/// command was dispatched (chat input, dev console, Lua script); InputSource tracks
/// HOW the player physically triggered it (keyboard shortcut, mouse click, etc.).
///
/// NOTE: InputSource is client-reported and advisory only. A modified open-source
/// client can fake any InputSource value. Replay analysis tools should treat it as
/// a hint, not proof. The relay server can verify ORDER VOLUME (spoofing-proof)
/// but not input source (client-reported). See "Competitive Integrity Principles"
/// § CI-3 below.
pub enum InputSource {
    /// Triggered via a keyboard shortcut / hotkey
    Keybinding,
    /// Triggered via mouse click on the game world or GUI button
    MouseClick,
    /// Typed as a chat/console command (e.g., `/move 120,80`)
    ChatCommand,
    /// Loaded from a config file or .iccmd script on startup
    ConfigFile,
    /// Issued by a Lua or WASM script (mission/mod automation)
    Script,
    /// Touchscreen input (mobile/tablet)
    Touch,
    /// Controller input (Steam Deck, console)
    Controller,
}

pub enum PermissionLevel {
    /// Regular player — chat, help, basic status commands
    Player,
    /// Game host — server config, kick/ban, dev mode toggle
    Host,
    /// Server administrator — full server management
    Admin,
    /// Developer — debug commands, Lua console, fault injection
    Developer,
}

/// A typed argument parser — Brigadier's `ArgumentType<T>` in Rust.
pub trait ArgumentType: Send + Sync {
    type Output;
    fn parse(&self, reader: &mut StringReader) -> Result<Self::Output, CommandError>;
    fn suggest(&self, context: &CommandContext, builder: &mut SuggestionBuilder);
    fn examples(&self) -> &[&str];
}

/// Built-in argument types.
pub struct IntegerArg { pub min: Option<i64>, pub max: Option<i64> }
pub struct FloatArg { pub min: Option<f64>, pub max: Option<f64> }
pub struct StringArg { pub kind: StringKind }  // Word, Quoted, Greedy
pub struct BoolArg;
pub struct PlayerArg;           // autocompletes to connected player names
pub struct UnitTypeArg;         // autocompletes to valid unit type names from YAML rules
pub struct PositionArg;         // parses "x,y" or "x,y,z" coordinates
pub struct ColorArg;            // named color or R,G,B

/// The command dispatcher — shared by chat input, dev console, CLI, and scripts.
pub struct CommandDispatcher {
    root: CommandNode,
}

impl CommandDispatcher {
    /// Register a command. Mods call this via Lua/WASM API.
    pub fn register(&mut self, node: CommandNode);

    /// Parse input into a command + arguments. Does NOT execute.
    pub fn parse(&self, input: &str, source: &CommandSource) -> ParseResult;

    /// Execute a previously parsed command.
    pub fn execute(&self, parsed: &ParseResult) -> CommandResult;

    /// Generate tab-completion suggestions at cursor position.
    pub fn suggest(&self, input: &str, cursor: usize, source: &CommandSource) -> Vec<Suggestion>;

    /// Generate human-readable usage string for a command.
    pub fn usage(&self, command: &str, source: &CommandSource) -> String;
}
```

**Permission filtering:** Commands whose root node's permission requirement exceeds the source's level are invisible — not shown in `/help`, not tab-completed, not executable. A regular player never sees `/kick` or `/c`. This is Brigadier's `requirement` predicate.

**Append-only registration:** Mods register commands by adding children to the root node. A mod can also extend existing commands by adding new sub-nodes. Two mods adding `/spawn` would conflict — the second registration merges into the first's node, following Brigadier's merge semantics.

#### Configuration Variables (Cvars)

Runtime-configurable values, inspired by Source Engine's ConVar system but adapted for IC's YAML-first philosophy:

```rust
/// A runtime-configurable variable with type, default, bounds, and metadata.
pub struct Cvar {
    pub name: String,                    // dot-separated: "render.shadows", "sim.fog_enabled"
    pub description: String,
    pub value: CvarValue,
    pub default: CvarValue,
    pub flags: CvarFlags,
    pub category: String,                // for grouping in the cvar browser
}

pub enum CvarValue {
    Bool(bool),
    Int(i64),
    Float(f64),
    String(String),
}

bitflags! {
    pub struct CvarFlags: u32 {
        /// Persisted to config file on change
        const PERSISTENT = 0b0001;
        /// Requires dev mode to modify (gameplay-affecting)
        const DEV_ONLY   = 0b0010;
        /// Server-authoritative in multiplayer (clients can't override)
        const SERVER     = 0b0100;
        /// Read-only — informational, cannot be set by commands
        const READ_ONLY  = 0b1000;
    }
}
```

**Loading from config file:**

```toml
# config.toml (user configuration — loaded at startup, saved on change)
[render]
shadows = true
shadow_quality = 2          # 0=off, 1=low, 2=medium, 3=high
vsync = true
max_fps = 144

[audio]
master_volume = 80
music_volume = 60
eva_volume = 100

[gameplay]
scroll_speed = 5
control_group_steal = false
auto_rally_harvesters = true

[net]
show_diagnostics = false        # toggle network overlay (latency, jitter, tick timing)
sync_frequency = 120            # ticks between full state hash checks (SERVER)
# DEV_ONLY parameters — debug builds only:
# desync_debug_level = 0        # 0-3, see 03-NETCODE.md § Debug Levels
# visual_prediction = true       # cosmetic prediction; disable for latency testing
# simulate_latency = 0           # artificial one-way latency (ms)
# simulate_loss = 0.0            # artificial packet loss (%)
# simulate_jitter = 0            # artificial jitter (ms)

[debug]
show_fps = true
show_network_stats = false
diag_level = 0            # 0-3, diagnostic overlay level (see 10-PERFORMANCE.md)
diag_position = "tr"      # tl, tr, bl, br — overlay corner position
diag_scale = 1.0          # overlay text scale factor (0.5-2.0)
diag_opacity = 0.8        # overlay background opacity (0.0-1.0)
diag_history_seconds = 30  # graph history duration in seconds
diag_batch_interval_ms = 500  # collection interval for expensive L2 metrics (ms)
```

Cvars are the runtime mirror of `config.toml`. Changing a cvar with `PERSISTENT` flag writes back to `config.toml`. Cvars map to the same keys as the TOML config — `render.shadows` in the cvar system corresponds to `[render] shadows` in the file. This means `config.toml` is both the startup configuration file and the serialized cvar state.

**Cvar commands:**

| Command               | Description                          | Example                     |
| --------------------- | ------------------------------------ | --------------------------- |
| `/set <cvar> <value>` | Set a cvar                           | `/set render.shadows false` |
| `/get <cvar>`         | Display current value                | `/get render.max_fps`       |
| `/reset <cvar>`       | Reset to default                     | `/reset render.shadows`     |
| `/find <pattern>`     | Search cvars by name/description     | `/find shadow`              |
| `/cvars [category]`   | List all cvars (optionally filtered) | `/cvars audio`              |
| `/toggle <cvar>`      | Toggle boolean cvar                  | `/toggle render.vsync`      |

**Sim-affecting cvars** (like fog of war, game speed) use the `DEV_ONLY` flag and flow through the order pipeline as `PlayerOrder::SetCvar(name, value)` — deterministic, validated, visible to all clients. Client-only cvars (render settings, audio) take effect immediately without going through the sim.

#### Built-In Commands

**Always available (all players):**

| Command                                                | Description                                           |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `/help [command]`                                      | List commands or show detailed usage for one command  |
| `/set`, `/get`, `/reset`, `/find`, `/toggle`, `/cvars` | Cvar manipulation (non-dev cvars only)                |
| `/version`                                             | Display engine version, game module, build info       |
| `/ping`                                                | Show current latency to server                        |
| `/fps`                                                 | Toggle FPS counter overlay                            |
| `/stats`                                               | Show current game statistics (score, resources, etc.) |
| `/time`                                                | Display current game time (sim tick + wall clock)     |
| `/clear`                                               | Clear chat/console history                            |
| `/players`                                             | List connected players                                |
| `/mods`                                                | List active mods with versions                        |

**Chat commands (multiplayer):**

| Command                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| (no prefix)             | Team chat (default)                                   |
| `/s <message>`          | Shout — all-chat visible to all players and observers |
| `/w <player> <message>` | Whisper — private message to specific player          |
| `/r <message>`          | Reply to last whisper sender                          |
| `/ignore <player>`      | Hide messages from a player (client-side)             |
| `/unignore <player>`    | Restore messages from a player                        |
| `/mute <player>`        | Admin: prevent player from chatting                   |
| `/unmute <player>`      | Admin: restore player chat                            |

**Host/Admin commands (multiplayer):**

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `/kick <player> [reason]` | Remove player from game                 |
| `/ban <player> [reason]`  | Ban player from rejoining               |
| `/unban <player>`         | Remove ban                              |
| `/pause`                  | Pause game (requires consent in ranked) |
| `/speed <multiplier>`     | Set game speed (non-ranked only)        |
| `/config <key> <value>`   | Change server settings at runtime       |

**Developer commands (dev-tools feature flag + DeveloperMode active):**

| Command                               | Description                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/c <lua>`                            | Execute Lua code (Factorio-style)                                                                                                                                         |
| `/sc <lua>`                           | Silent Lua execution (output hidden from other players)                                                                                                                   |
| `/mc <lua>`                           | Measured Lua execution (prints execution time)                                                                                                                            |
| `/give <amount>`                      | Grant credits to your player                                                                                                                                              |
| `/spawn <unit_type> [count] [player]` | Create units at cursor position                                                                                                                                           |
| `/kill`                               | Destroy selected entities                                                                                                                                                 |
| `/reveal`                             | Remove fog of war                                                                                                                                                         |
| `/instant_build`                      | Toggle instant construction                                                                                                                                               |
| `/invincible`                         | Toggle invincibility for selected units                                                                                                                                   |
| `/tp <x,y>`                           | Teleport camera to coordinates                                                                                                                                            |
| `/weather <type>`                     | Force weather state (D022). Valid types defined by D022's weather state machine — e.g., `clear`, `rain`, `snow`, `storm`, `sandstorm`; exact set is game-module-specific. |
| `/desync_check`                       | Force full-state hash comparison across all clients                                                                                                                       |
| `/save_snapshot`                      | Write sim state snapshot to disk                                                                                                                                          |
| `/step [N]`                           | Advance N sim ticks while paused (default: 1). Requires `/pause` first. Essential for determinism debugging — inspired by SAGE engine's script debugger frame-stepping   |

**Diagnostic overlay commands (client-local, no network traffic):**

These commands control the real-time diagnostic overlay described in `10-PERFORMANCE.md` § Diagnostic Overlay & Real-Time Observability. They are **client-local** — they read telemetry data already being collected (D031) and do not produce `PlayerOrder`s. Level 1–2 commands are available to all players; Level 3 panels require `dev-tools`.

| Command                  | Description                                                              | Permission |
| ------------------------ | ------------------------------------------------------------------------ | ---------- |
| `/diag` or `/diag 1`    | Toggle basic diagnostic overlay (FPS, tick time, RTT, entity count)     | Player     |
| `/diag 0`               | Turn off diagnostic overlay                                             | Player     |
| `/diag 2`               | Detailed overlay (per-system breakdown, pathfinding, memory, network)   | Player     |
| `/diag 3`               | Full developer overlay (ECS inspector, AI viewer, desync debugger)      | Developer  |
| `/diag net`             | Show only the network diagnostic panel                                   | Player     |
| `/diag sim`             | Show only the sim tick breakdown panel                                   | Player     |
| `/diag path`            | Show only the pathfinding statistics panel                               | Player     |
| `/diag mem`             | Show only the memory usage panel                                         | Player     |
| `/diag ai`              | Show AI state viewer for selected unit(s)                                | Developer  |
| `/diag orders`          | Show order queue inspector                                               | Developer  |
| `/diag fog`             | Toggle fog-of-war debug visualization on game world                      | Developer  |
| `/diag desync`          | Show desync debugger panel                                               | Developer  |
| `/diag history`         | Toggle graph history mode (scrolling line graphs for key metrics)        | Player     |
| `/diag pos <corner>`    | Move overlay position: `tl`, `tr`, `bl`, `br` (default: `tr`)          | Player     |
| `/diag scale <factor>`  | Scale overlay text size, 0.5–2.0 (accessibility)                        | Player     |
| `/diag export`          | Dump current overlay snapshot to timestamped JSON file                   | Player     |

**Note on DeveloperMode interaction:** Dev commands check `DeveloperMode` sim state (V44). In multiplayer, dev mode must be unanimously enabled in the lobby before game start. Dev commands issued without active dev mode are rejected by the sim with an error message. This is enforced at the order validation layer (D012), not the UI layer.

#### Comprehensive Command Catalog

The design principle: **anything the GUI can do, the console can do.** Every button, menu, slider, and toggle in the game UI has a console command equivalent. This enables scripting via `autoexec.cfg`, accessibility for players who prefer keyboard-driven interfaces, and full remote control for tournament administration. Commands are organized by functional domain — matching the system categories in `02-ARCHITECTURE.md`.

**Engine-core vs. game-module commands:** Per Invariant #9, the engine core is game-agnostic. Commands are split into two registration layers:

- **Engine commands** (registered by the engine, available to all game modules): `/help`, `/set`, `/get`, `/version`, `/fps`, `/volume`, `/screenshot`, `/camera`, `/zoom`, `/ui_scale`, `/ui_theme`, `/locale`, `/save_game`, `/load_game`, `/clear`, `/players`, etc. These operate on engine-level concepts (rendering, audio, camera, files, cvars) and exist regardless of game module.
- **Game-module commands** (registered by the RA1 module via `GameModule::register_commands()`): `/build`, `/sell`, `/deploy`, `/rally`, `/stance`, `/guard`, `/patrol`, `/power`, `/credits`, `/surrender`, `/power_activate`, etc. These operate on RA1-specific gameplay systems — a Dune II module or tower defense total conversion would register different commands. The tables below include both layers; game-module commands are marked with **(RA1)** where the command is game-module-specific rather than engine-generic.

**Implementation phasing:** This catalog is a **reference target**, not a Phase 3 deliverable. Commands are added incrementally as the systems they control are built — unit commands arrive with Phase 2 (simulation), production/building UI commands with Phase 3 (game chrome), observer commands with Phase 5 (multiplayer), etc. The Brigadier `CommandDispatcher` and cvar system are Phase 3; the full catalog grows across Phases 3–6.

**Unit commands (require selection unless noted) (RA1):**

| Command                                                     | Description                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `/move <x,y>`                                               | Move selected units to world position                         |
| `/attack <x,y>`                                             | Attack-move to position                                       |
| `/attack_unit <unit_id>`                                    | Attack specific target                                        |
| `/force_fire <x,y>`                                         | Force-fire at ground position (Ctrl+click equivalent)         |
| `/force_move <x,y>`                                         | Force-move, crushing obstacles in path (Alt+click equivalent) |
| `/stop`                                                     | Stop all selected units                                       |
| `/guard [unit_id]`                                          | Guard selected unit or target unit                            |
| `/patrol <x1,y1> [x2,y2] ...`                               | Set patrol route through waypoints                            |
| `/scatter`                                                  | Scatter selected units from current position                  |
| `/deploy`                                                   | Deploy/undeploy selected units (MCV, siege units)             |
| `/stance <hold_fire\|return_fire\|defend\|attack_anything>` | Set engagement stance                                         |
| `/load`                                                     | Load selected infantry into selected transport                |
| `/unload`                                                   | Unload all passengers from selected transport                 |

**Selection commands:**

| Command                   | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `/select <filter>`        | Select units by filter: `all`, `idle`, `military`, `harvesters`, `damaged`, `type:<actor_type>` |
| `/deselect`               | Clear selection                                                                                 |
| `/select_all_type`        | Select all on-screen units matching the currently selected type (double-click equivalent)       |
| `/group <0-9>`            | Select control group                                                                            |
| `/group_set <0-9>`        | Assign current selection to control group (Ctrl+number equivalent)                              |
| `/group_add <0-9>`        | Add current selection to existing control group (Shift+Ctrl+number)                             |
| `/tab`                    | Cycle through unit types within current selection                                               |
| `/find_unit <actor_type>` | Center camera on next unit of type (cycles through matches)                                     |
| `/find_idle`              | Center on next idle unit (factory, harvester)                                                   |

**Production commands (RA1):**

| Command                       | Description                                                |
| ----------------------------- | ---------------------------------------------------------- |
| `/build <actor_type> [count]` | Queue production (default count: 1, or `inf` for infinite) |
| `/cancel <actor_type\|all>`   | Cancel queued production                                   |
| `/place <actor_type> <x,y>`   | Place completed building at position                       |
| `/set_primary [building_id]`  | Set selected or specified building as primary factory      |
| `/rally <x,y>`                | Set rally point for selected production building           |
| `/pause_production`           | Pause production queue on selected building                |
| `/resume_production`          | Resume paused production queue                             |
| `/queue`                      | Display current production queue contents                  |

**Building commands (RA1):**

| Command        | Description                                               |
| -------------- | --------------------------------------------------------- |
| `/sell`        | Sell selected building                                    |
| `/sell_mode`   | Toggle sell cursor mode (click buildings to sell)         |
| `/repair_mode` | Toggle repair cursor mode (click buildings to repair)     |
| `/repair`      | Toggle auto-repair on selected building                   |
| `/power_down`  | Toggle power on selected building (disable to save power) |
| `/gate_open`   | Force gate open/closed                                    |

**Economy / resource commands (RA1):**

| Command    | Description                                           |
| ---------- | ----------------------------------------------------- |
| `/credits` | Display current credits and storage capacity          |
| `/income`  | Display income rate, expenditure rate, net flow       |
| `/power`   | Display power capacity, drain, and status             |
| `/silos`   | Display storage utilization and warn if near capacity |

**Support power commands (RA1):**

| Command                                                  | Description                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/power_activate <power_name> <x,y> [target_x,target_y]` | Activate support power at position (second position for Chronoshift origin)   |
| `/paradrop <x,y>`                                        | Activate Airfield paradrop at position (plane flies over, drops paratroopers) |
| `/powers`                                                | List all available support powers with charge status                          |

**Camera and navigation commands:**

| Command                    | Description                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/camera <x,y>`            | Move camera to world position                                                                                                                                                                                                                          |
| `/camera_follow [unit_id]` | Follow selected or specified unit                                                                                                                                                                                                                      |
| `/camera_follow_stop`      | Stop following                                                                                                                                                                                                                                         |
| `/bookmark_set <1-9>`      | Save current camera position to bookmark slot                                                                                                                                                                                                          |
| `/bookmark <1-9>`          | Jump to bookmarked camera position                                                                                                                                                                                                                     |
| `/zoom <in\|out\|level>`   | Adjust zoom (level: 0.5–4.0, default 1.0; see `02-ARCHITECTURE.md` § Camera). In ranked/tournament, clamped to the competitive zoom range (default: 0.75–2.0). Zoom-toward-cursor when used with mouse wheel; zoom-toward-center when used via command |
| `/center`                  | Center camera on current selection                                                                                                                                                                                                                     |
| `/base`                    | Center camera on construction yard                                                                                                                                                                                                                     |
| `/alert`                   | Jump to last alert position (base under attack, etc.)                                                                                                                                                                                                  |

**Camera bookmarks (Generals-style navigation, client-local):** IC formalizes camera bookmarks as a first-class navigation feature on all platforms. Slots `1-9` are **local UI state only** (not synced, not part of replay determinism, no simulation effect). Desktop exposes quick slots through hotkeys (see `17-PLAYER-FLOW.md`), while touch layouts expose a minimap-adjacent bookmark dock (tap = jump, long-press = save). The `/bookmark_set` and `/bookmark` commands remain the canonical full-slot interface and work consistently across desktop, touch, observer, replay, and editor playtest contexts. Local-only D031 telemetry events (`camera_bookmark.set`, `camera_bookmark.jump`) support UX tuning and tutorial hint validation.

**Game state commands:**

| Command                                             | Description                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/save_game [name]`                                 | Save game (default: auto-named with timestamp)                                          |
| `/load_game <name>`                                 | Load saved game                                                                         |
| `/restart`                                          | Restart current mission/skirmish                                                        |
| `/surrender`                                        | Forfeit current match (alias for `/callvote surrender` in team games, immediate in 1v1) |
| `/gg`                                               | Alias for `/surrender`                                                                  |
| `/ff`                                               | Alias for `/surrender` (LoL/Valorant convention)                                        |
| `/speed <slowest\|slower\|normal\|faster\|fastest>` | Set game speed (single-player or host-only)                                             |
| `/pause`                                            | Toggle pause (single-player instant; multiplayer requires consent)                      |
| `/score`                                            | Display current match score (units killed, resources, etc.)                             |

**Game speed and mobile tempo guidance:** `/speed` remains the authoritative gameplay command surface for single-player and host-controlled matches. Any mobile "Tempo Advisor" or comfort warning UI is **advisory only** — it may recommend a range (for touch usability) but never changes or blocks the requested speed by itself. Ranked multiplayer continues to use server-enforced speed (see D055/D064 and `09b-networking.md`).

**Vote commands (multiplayer — see `03-NETCODE.md` § "In-Match Vote Framework"):**

| Command                            | Description                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| `/callvote surrender`              | Propose a surrender vote (team games) or surrender immediately (1v1) |
| `/callvote kick <player> <reason>` | Propose to kick a teammate (team games only)                         |
| `/callvote remake`                 | Propose to void the match (early game only)                          |
| `/callvote draw`                   | Propose a mutual draw (requires cross-team unanimous agreement)      |
| `/vote yes` (or `/vote y`)         | Vote yes on the active vote (equivalent to F1)                       |
| `/vote no` (or `/vote n`)          | Vote no on the active vote (equivalent to F2)                        |
| `/vote cancel`                     | Cancel a vote you proposed                                           |
| `/vote status`                     | Display the current active vote (if any)                             |
| `/poll <phrase_id\|phrase_text>`   | Propose a tactical poll (non-binding team coordination)              |
| `/poll agree` (or `/poll yes`)     | Agree with the active tactical poll                                  |
| `/poll disagree` (or `/poll no`)   | Disagree with the active tactical poll                               |

**Audio commands:**

| Command                                       | Description                                |
| --------------------------------------------- | ------------------------------------------ |
| `/volume <master\|music\|sfx\|voice> <0-100>` | Set volume level                           |
| `/mute [master\|music\|sfx\|voice]`           | Toggle mute (no argument = master)         |
| `/music_next`                                 | Skip to next music track                   |
| `/music_prev`                                 | Skip to previous music track               |
| `/music_stop`                                 | Stop music playback                        |
| `/music_play [track_name]`                    | Play specific track (no argument = resume) |
| `/eva <on\|off>`                              | Toggle EVA voice notifications             |
| `/music_list`                                 | List available music tracks                |
| `/voice effect list`                          | List available voice effect presets        |
| `/voice effect set <name>`                    | Apply voice effect preset                  |
| `/voice effect off`                           | Disable voice effects                      |
| `/voice effect preview <name>`                | Play sample clip with effect applied       |
| `/voice effect info <name>`                   | Show DSP stages and parameters for preset  |
| `/voice volume <0-100>`                       | Set incoming voice volume                  |
| `/voice ptt <key>`                            | Set push-to-talk keybind                   |
| `/voice toggle`                               | Toggle voice on/off                        |
| `/voice diag`                                 | Open voice diagnostics overlay             |
| `/voice isolation toggle`                     | Toggle enhanced voice isolation            |

**Render and display commands:**

| Command                                          | Description                                           |
| ------------------------------------------------ | ----------------------------------------------------- |
| `/render_mode <classic\|remastered\|modern>`     | Switch render mode (D048)                             |
| `/screenshot [filename]`                         | Capture screenshot                                    |
| `/shadows <on\|off>`                             | Toggle shadow rendering                               |
| `/healthbars <always\|selected\|damaged\|never>` | Health bar visibility mode                            |
| `/names <on\|off>`                               | Toggle unit name labels                               |
| `/grid <on\|off>`                                | Toggle terrain grid overlay                           |
| `/palette <name>`                                | Switch color palette (for classic render mode)        |
| `/camera_shake <on\|off>`                        | Toggle screen shake effects                           |
| `/weather_fx <on\|off>`                          | Toggle weather visual effects (rain, snow particles)  |
| `/post_fx <on\|off>`                             | Toggle post-processing effects (bloom, color grading) |

**Observer/spectator commands (observer mode only):**

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `/observe [player_name]` | Enter observer mode / follow specific player's view      |
| `/observe_free`          | Free camera (not following any player)                   |
| `/show army`             | Toggle army composition overlay                          |
| `/show production`       | Toggle production overlay (what each player is building) |
| `/show economy`          | Toggle economy overlay (income graph)                    |
| `/show powers`           | Toggle superweapon charge overlay                        |
| `/show score`            | Toggle score tracker                                     |

**UI control commands:**

| Command                                         | Description                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `/minimap <on\|off>`                            | Toggle minimap visibility                                                |
| `/sidebar <on\|off>`                            | Toggle sidebar visibility                                                |
| `/tooltip <on\|off>`                            | Toggle unit/building tooltips                                            |
| `/clock <on\|off>`                              | Toggle game clock display                                                |
| `/ui_scale <50-200>`                            | Set UI scale percentage                                                  |
| `/ui_theme <classic\|remastered\|modern\|name>` | Switch UI theme (D032)                                                   |
| `/encyclopedia [actor_type]`                    | Open encyclopedia (optionally to a specific entry)                       |
| `/hotkeys [profile]`                            | Switch hotkey profile (classic, openra, modern) or list current bindings |

**Map interaction commands:**

| Command                   | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `/map_ping <x,y> [color]` | Place a map ping visible to allies (with optional color) |
| `/map_draw <on\|off>`     | Toggle minimap drawing mode for tactical markup          |
| `/map_info`               | Display current map name, size, author, and game mode    |

**Localization commands:**

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `/locale <code>` | Switch language (e.g., `en`, `de`, `zh-CN`) |
| `/locale_list`   | List available locales                      |

**Note:** Commands that affect simulation state (`/move`, `/attack`, `/build`, `/sell`, `/deploy`, `/stance`, `/surrender`, `/callvote`, `/vote`, `/poll`, etc.) produce `PlayerOrder` variants and flow through the deterministic order pipeline — they are functionally identical to clicking the GUI button. Commands that affect only the local client (`/volume`, `/shadows`, `/zoom`, `/ui_scale`, etc.) take effect immediately without touching the sim. This distinction mirrors the cvar split: sim-affecting cvars require `DEV_ONLY` or `SERVER` flags and use the order pipeline; client-only cvars are immediate. In multiplayer, sim-affecting commands also respect D033 QoL toggle state — if a toggle is disabled in the lobby, the corresponding console command is rejected. See "Competitive Integrity in Multiplayer" below for the full framework.

**PlayerOrder variant taxonomy:** Commands map to `PlayerOrder` variants as follows:
- **GUI-equivalent commands** (`/move`, `/attack`, `/build`, `/sell`, `/deploy`, `/stance`, `/select`, `/place`, etc.) produce the **same native `PlayerOrder` variant** as their GUI counterpart — e.g., `/move 120,80` produces `PlayerOrder::Move { target: WorldPos(120,80) }`, identical to right-clicking the map.
- **Cvar mutations** (`/set <name> <value>`) produce `PlayerOrder::SetCvar(name, value)` when the cvar has `DEV_ONLY` or `SERVER` flags — these flow through order validation.
- **Cheat codes** (hidden phrases typed in chat) produce `PlayerOrder::CheatCode(CheatId)` — see "Hidden Cheat Codes" below.
- **Chat messages** (`/s`, `/w`, unprefixed text) produce `PlayerOrder::ChatMessage { channel, text }` — see D059 § Text Chat.
- **Coordination actions** (pings, chat wheel, minimap drawing) produce their respective `PlayerOrder` variants (`TacticalPing`, `ChatWheelPhrase`, `MinimapDraw`) — see D059 § Coordination.
- **Meta-commands** (`/help`, `/locale`, `/hotkeys`, `/voice diag`, etc.) are **local-only** — they produce no `PlayerOrder` and never touch the sim.
- **`PlayerOrder::ChatCommand(cmd, args)`** is used only for mod-registered commands that produce custom sim-side effects not covered by a native variant. Engine commands never use `ChatCommand`.

**Game-module registration example (RA1):** The RA1 game module registers all RA1-specific commands during `GameModule::register_commands()`. A Tiberian Dawn module would register similar but distinct commands (e.g., `/sell` exists in both, but `/power_activate` with different superweapon names). A total conversion could register entirely novel commands (`/mutate`, `/terraform`, etc.) using the same `CommandDispatcher` infrastructure. This follows the "game is a mod" principle (13-PHILOSOPHY.md § Principle 4) — the base game uses the same registration API available to external modules.

#### Mod-Registered Commands

Mods register commands via the Lua API (D004) or WASM host functions (D005):

```lua
-- Lua mod registration example
Commands.register("spawn_reinforcements", {
    description = "Spawn reinforcements at a location",
    permission = "host",       -- only host can use
    arguments = {
        { name = "faction", type = "string", suggestions = {"allies", "soviet"} },
        { name = "count",   type = "integer", min = 1, max = 50 },
        { name = "location", type = "position" },
    },
    execute = function(source, args)
        -- Mod logic here
        SpawnReinforcements(args.faction, args.count, args.location)
        return "Spawned " .. args.count .. " " .. args.faction .. " reinforcements"
    end
})
```

**Sandboxing:** Mod commands execute within the same Lua sandbox as mission scripts. A mod command cannot access the filesystem, network, or memory outside its sandbox. The `CommandSource` tracks which mod registered the command — if a mod command crashes or times out, the error is attributed to the mod, not the engine.

**Namespace collision:** Mod commands are prefixed with the mod name by default: a mod named `cool_units` registering `spawn` creates `/cool_units:spawn`. Mods can request unprefixed registration (`/spawn`) but collisions are resolved by load order — last mod wins, with a warning logged. The convention follows Minecraft's `namespace:command` pattern.

#### Anti-Trolling Measures

Chat and commands create trolling surfaces. IC addresses each:

| Trolling Vector                                                            | Mitigation                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat spam**                                                              | Rate limit: max 5 messages per 3 seconds, relay-enforced (see D059 § Text Chat). Client applies the same limit locally to avoid round-trip rejection. Exceeding the limit queues messages with a cooldown warning. Configurable by server.                                                                                                                                |
| **Chat harassment**                                                        | `/ignore` is client-side and instant. `/mute` is admin-enforced and server-side. Ignored players can't whisper you.                                                                                                                                                                                                                                                       |
| **Unicode abuse** (oversized chars, bidi-spoof controls, invisible chars, zalgo) | Chat input is sanitized **before** order injection: preserve legitimate letters/numbers/punctuation (including Arabic/Hebrew/RTL text), but strip disallowed control/invisible characters used for spoofing, normalize Unicode to NFC, cap display width, and clamp combining-character abuse. Normalization happens on the sending client before the text enters `PlayerOrder::ChatMessage` — ensuring all clients receive identical normalized bytes (determinism requirement). Homoglyph detection warns admins of impersonation attempts. |
| **Command abuse** (admin runs `/kill` on all players)                      | Admin commands that affect other players are logged as telemetry events (D031). Community server governance (D037) allows reputation consequences.                                                                                                                                                                                                                        |
| **Lua injection** via chat                                                 | Chat messages never touch the command parser unless they start with `/`. A message like `hello /c game.destroy()` is plain text, not a command. Only the first `/` at position 0 triggers command parsing.                                                                                                                                                                |
| **Fake command output**                                                    | System messages (command results, join/leave notifications) use a distinct visual style (color, icon) that players cannot replicate through chat.                                                                                                                                                                                                                         |
| **Command spam**                                                           | Commands have the same rate limit as chat. Dev commands additionally logged with timestamps for abuse review.                                                                                                                                                                                                                                                             |
| **Programmable spam** (Factorio's speaker problem)                         | IC doesn't have programmable speakers, but any future mod-driven notification system should respect the same per-player mute controls.                                                                                                                                                                                                                                    |

#### Achievement and Ranking Interaction

Following the universal convention (Factorio, AoE, OpenRA):

- **Using any dev command permanently flags the match/save** as using cheats. This is recorded in the replay metadata and sim state.
- **Flagged games cannot count toward ranked matchmaking (D055)** or achievements (D036).
- **The flag is irreversible** for that save/match — even if you toggle dev mode off.
- **Non-dev commands** (`/help`, `/set render.shadows false`, chat, `/ping`) do NOT flag the game. Only commands that affect simulation state through `DevCommand` orders trigger the flag.
- **Saved game cheated flag:** The snapshot (D010) includes `cheats_used: bool` and `cosmetic_cheats_used: bool` fields. Loading a save with `cheats_used = true` displays a permanent "cheats used" indicator and disables achievements. Loading a save with only `cosmetic_cheats_used = true` displays a subtle "cosmetic mods active" indicator but achievements remain enabled. Both flags are irreversible per save and recorded in replay metadata.

This follows Factorio's model — the Lua console is immensely useful for testing and debugging, but using it has clear consequences for competitive integrity — while refining it with a proportional response: gameplay cheats carry full consequences, cosmetic cheats are recorded but don't punish the player for having fun.

#### Competitive Integrity in Multiplayer

Dev commands and cheat codes are handled. But what about the ~120 *normal* commands available to every player in multiplayer — `/move`, `/attack`, `/build`, `/select`, `/place`? These produce the same `PlayerOrder` variants as clicking the GUI, but they make external automation trivially easy. A script that sends `/select idle` → `/build harvester` → `/rally 120,80` every 3 seconds is functionally a perfect macro player. Does this create an unfair advantage for scripters?

##### The Open-Source Competitive Dilemma

This section documents a fundamental, irreconcilable tension that shapes every competitive integrity decision in IC. It is written as a permanent reference for future contributors, so the reasoning does not need to be re-derived.

**The dilemma in one sentence:** An open-source game engine cannot prevent client-side cheating, but a competitive community demands competitive integrity.

In a closed-source game (StarCraft 2, CS2, Valorant), the developer controls the client binary. They can:
- Obfuscate the protocol and memory layout so reverse-engineering is expensive
- Deploy kernel-level anti-cheat (Warden, VAC, Vanguard) to detect modified clients
- Ban players whose clients fail integrity checks
- Update obfuscation faster than hackers can reverse-engineer

**What commercial anti-cheat products actually do:**

| Product                       | Technique                                          | How It Works                                                                                                                                                   | Why It Fails for Open-Source GPL                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VAC** (Valve Anti-Cheat)    | Memory scanning + process hashing                  | Scans client RAM for known cheat signatures; hashes game binaries to detect tampering; delayed bans to obscure detection vectors                               | Source is public — cheaters know exactly what memory layouts to avoid. Binary hashing is meaningless when every user compiles from source. Delayed bans rely on secrecy of detection methods; GPL eliminates that secrecy.                                                                                                                                                               |
| **PunkBuster** (Even Balance) | Screenshot capture + hash checks + memory scanning | Takes periodic screenshots to detect overlays/wallhacks; hashes client files; scans process memory for known cheat DLLs                                        | Screenshots assume a single canonical renderer — IC's switchable render modes (D048) make "correct" screenshots undefined. Client file hashing fails when users compile their own binaries. GPL means the scanning logic itself is public, trivially bypassed.                                                                                                                           |
| **EAC / BattlEye**            | Kernel-mode driver (ring-0)                        | Loads a kernel driver at boot that monitors all system calls, blocks known cheat tools from loading, detects memory manipulation from outside the game process | Kernel drivers are incompatible with Linux (where they'd need custom kernel modules), impossible on WASM, antithetical to user trust in open-source software, and unenforceable when users can simply remove the driver from source and recompile. Ring-0 access also creates security liability — EAC and BattlEye vulnerabilities have been exploited as privilege escalation vectors. |
| **Vanguard** (Riot Games)     | Always-on kernel driver + client integrity         | Runs from system boot (not just during gameplay); deep system introspection; hardware fingerprinting; client binary attestation                                | The most invasive model — requires the developer to be more trusted than the user's OS. Fundamentally incompatible with GPL's guarantee that users control their own software. Also requires a dedicated security team maintaining driver compatibility across OS versions — organizations like Riot spend millions annually on this infrastructure.                                     |

The common thread: every commercial anti-cheat product depends on **information asymmetry** (the developer knows things the cheater doesn't) or **privilege asymmetry** (the anti-cheat has deeper system access than the cheat). GPL v3 eliminates both. The source code is public. The user controls the binary. These are features, not flaws — but they make client-side anti-cheat a solved impossibility.

None of these are available to IC:
- The engine is GPL v3 (D051). The source code is public. There is nothing to reverse-engineer — anyone can read the protocol, the order format, and the sim logic directly.
- Kernel-level anti-cheat is antithetical to GPL, Linux support, user privacy, and community trust. It is also unenforceable when users can compile their own client.
- Client integrity checks are meaningless when the "legitimate" client is whatever the user compiled from source.
- Obfuscation is impossible — the source repository IS the documentation.

**What a malicious player can do** (and no client-side measure can prevent):
- Read the source to understand exactly what `PlayerOrder` variants exist and what the sim accepts
- Build a modified client that sends orders directly to the relay server, bypassing all GUI and console input
- Fake any `CommandOrigin` tag (`Keybinding`, `MouseClick`) to disguise scripted input as human
- Automate any action the game allows: perfect split micro, instant building placement, zero-delay production cycling
- Implement maphack if fog-of-war is client-side (which is why fog-authoritative mode via the relay is critical — see `06-SECURITY.md`)

**What a malicious player cannot do** (architectural defenses that work regardless of client modification):
- Send orders that fail validation (D012). The sim rejects invalid orders deterministically — every client agrees on the rejection. Modified clients can send orders faster, but they can't send orders the sim wouldn't accept from any client.
- Spoof their order volume at the relay server (D007). The relay counts orders per player per tick server-side. A modified client can lie about `CommandOrigin`, but it can't hide the fact that it sent 500 orders in one tick.
- Avoid replay evidence. Every order, every tick, is recorded in the deterministic replay (D010). Post-match analysis can detect inhuman patterns regardless of what the client reported as its input source.
- Bypass server-side fog-authoritative mode. When enabled, the relay only forwards entity data within each player's vision — the client physically doesn't receive information about units it shouldn't see.

**The resolution — what IC chooses:**

IC does not fight this arms race. Instead, it adopts a four-part strategy modeled on the most successful open-source competitive platforms (Lichess, FAF, DDNet):

1. **Architectural defense.** Make cheating impossible where we can (order validation, relay integrity, fog authority) rather than improbable (obfuscation, anti-tamper). These defenses work even against a fully modified client.
2. **Equalization through features.** When automation provides an advantage, build it into the game as a D033 QoL toggle available to everyone. The script advantage disappears when everyone has the feature.
3. **Total transparency.** Record everything. Expose everything. Every order, every input source, every APM metric, every active script — in the replay and in the lobby. Make scripting visible, not secret.
4. **Community governance.** Let communities enforce their own competitive norms (D037, D052). Engine-enforced rules are minimal and architectural. Social rules — what level of automation is acceptable, what APM patterns trigger investigation — belong to the community.

This is the Lichess model applied to RTS. Lichess is fully open-source, cannot prevent engine-assisted play through client-side measures, and is the most successful competitive gaming platform in its genre. Its defense is behavioral analysis (Irwin + Kaladin AI systems), statistical pattern matching, community reporting, and permanent reputation consequences — not client-side policing. IC adapts this approach for real-time strategy: server-side order analysis replaces move-time analysis, APM patterns replace centipawn-loss metrics, and replay review replaces PGN review. See `research/minetest-lichess-analysis.md` § Lichess for detailed analysis of Lichess's anti-cheat architecture.

**Why documenting this matters:** Without this explicit rationale, future contributors will periodically propose "just add anti-cheat" or "just disable the console in ranked" or "just detect scripts." These proposals are not wrong because they're technically difficult — they're wrong because they're architecturally impossible in an open-source engine and create a false sense of security that is worse than no protection at all. This dilemma is settled. The resolution is the six principles below.

##### What Other Games Teach Us

| Game             | Console in MP                               | Automation Stance                                                                  | Anti-Cheat Model                                                           | Key Lesson for IC                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **StarCraft 2**  | No console                                  | APM is competitive skill — manual micro required                                   | Warden (kernel, closed-source)                                             | Works for closed-source; impossible for GPL. SC2 treats mechanical speed as a competitive dimension. IC must decide if it does too                                                                                            |
| **AoE2 DE**      | No console                                  | Added auto-reseed farms, auto-queue — initially controversial, now widely accepted | Server-side + reporting                                                    | Give automation AS a feature (QoL toggle), not as a script advantage. Community will accept it when everyone has it                                                                                                           |
| **SupCom / FAF** | UI mods, SimMods                            | Strategy > APM — extensive automation accepted                                     | Lobby-agreed mods, all visible                                             | If mods automate, require lobby consent. FAF's community embraces this because SupCom's identity is strategic, not mechanical. **All UI mods are listed in the lobby** — every player sees what every other player is running |
| **Factorio**     | `/c` Lua in MP — visible to all, flags game | Blueprints, logistics bots, and circuit networks ARE the automation                | Peer transparency                                                          | Build automation INTO the game as first-class systems. When the game provides it, scripts are unnecessary                                                                                                                     |
| **CS2**          | Full console + autoexec.cfg                 | Config/preference commands fine; gameplay macros banned                            | VAC (kernel)                                                               | Distinguish **personalization** (sensitivity, crosshair) from **automation** (playing the game for you)                                                                                                                       |
| **OpenRA**       | No console beyond chat                      | No scripting API; community self-policing                                          | Trust + reports                                                            | Works at small scale; doesn't scale. IC aims larger                                                                                                                                                                           |
| **Minecraft**    | Operator-only in MP                         | Redstone and command blocks ARE the automation                                     | Permission system                                                          | Gate powerful commands behind roles/permissions                                                                                                                                                                               |
| **Lichess**      | N/A (turn-based)                            | Cannot prevent engine use — fully open source                                      | Dual AI analysis (Irwin + Kaladin) + statistical flags + community reports | **The gold standard for open-source competitive integrity.** No client-side anti-cheat at all. Detection is entirely behavioral and server-side. 100M+ games played. Proves the model works at massive scale                  |
| **DDNet**        | No console                                  | Cooperative game — no adversarial scripting problem                                | Optional antibot plugin (relay-side, swappable ABI)                        | Server-side behavioral hooks with a swappable plugin architecture. IC's relay server should support similar pluggable analysis                                                                                                |
| **Minetest**     | Server-controlled                           | CSM (Client-Side Mod) restriction flags sent by server                             | LagPool time-budget + server-side validation                               | Server tells client which capabilities are allowed. IC's WASM capability model is architecturally stronger (capabilities are enforced, not requested), but the flag-based transparency is a good UX pattern                   |

**The lesson across all of these:** The most successful approach is the Factorio/FAF/Lichess model — build the automation people want INTO the game as features available to everyone, make all actions transparent and auditable, and let communities enforce their own competitive norms. The open-source projects (Lichess, FAF, DDNet, Minetest) all converge on the same insight: **you cannot secure the client, so secure the server and empower the community.**

##### IC's Competitive Integrity Principles

**CI-1: Console = GUI parity, never superiority.**

Every console command must produce exactly the same `PlayerOrder` as its GUI equivalent. No command may provide capability that the GUI doesn't offer. This is already the design (noted at the end of the Command Catalog) — this principle makes it an explicit invariant.

Specific implications:
- `/select all` selects everything in the current **screen viewport**, matching box-select behavior — NOT all units globally, unless the player has them in a control group (which the GUI also supports via D033's `control_group_limit`).
- `/build <type> inf` (infinite queue) is only available when D033's `multi_queue` toggle is enabled in the lobby. If the lobby uses the vanilla preset (`multi_queue: false`), infinite queuing is rejected.
- `/attack <x,y>` (attack-move) is only available when D033's `attack_move` toggle is enabled. A vanilla preset lobby rejects it.
- Every console command respects the D033 QoL toggle state. **The console is an alternative input method, not a QoL override.**

**CI-2: D033 QoL toggles govern console commands.**

Console commands are bound by the same lobby-agreed QoL configuration as GUI actions. When a D033 toggle is disabled:
- The corresponding console command is rejected with: `"[feature] is disabled in this lobby's rule set."`
- The command does not produce a `PlayerOrder`. It is rejected at the command dispatcher layer, before reaching the order pipeline.
- The help text for disabled commands shows their disabled status: `"/attack — Attack-move to position [DISABLED: attack_move toggle off]"`.

This ensures the console cannot bypass lobby agreements. If the lobby chose the vanilla preset, console users get the vanilla feature set.

**CI-3: Order rate monitoring, not blocking.**

Hard-blocking input rates punishes legitimately fast players (competitive RTS players regularly exceed 300 APM). Instead, IC monitors and exposes:

- **Orders-per-tick tracking.** The sim records orders-per-tick per player in replay metadata. This is always recorded, not opt-in.
- **Input source tagging.** Each `PlayerOrder` in the replay includes an `InputSource` tag: `Keybinding`, `MouseClick`, `ChatCommand`, `ConfigFile`, `Script`, `Touch`, `Controller`. A player issuing 300 orders/minute via `Keybinding` and `MouseClick` is playing fast. A player issuing 300 orders/minute via `ChatCommand` or `Script` is scripting. Note: `InputSource` is client-reported and advisory only — see the `InputSource` enum definition above.
- **APM display.** Observers and replay viewers see per-player APM, broken down by input source. This is standard competitive RTS practice (SC2, AoE2, OpenRA all display APM).
- **Community-configurable thresholds.** Community servers (D052) can define APM alerts or investigation triggers for ranked play. The engine does not hard-enforce these — communities set their own competitive norms. A community that values APM skill sets no cap. A community that values strategy over speed sets a 200 APM soft cap with admin review.

**Why not hard-block:** In an open-source engine, a modified client can send orders with any `CommandOrigin` tag — faking `Keybinding` when actually scripted. Hard-blocking based on unverifiable client-reported data gives a false sense of security. The relay server (D007) can count order volume server-side (where it can't be spoofed), but the input source tag is client-reported and advisory only.

**Note on V17 transport-layer caps:** The `ProtocolLimits` hard ceilings (256 orders/tick, 4 KB/order — see `06-SECURITY.md` § V17) still apply as anti-flooding protection at the relay layer. These are not APM caps — they're DoS prevention. Normal RTS play peaks at 5–10 orders/tick even at professional APM levels, so the 256/tick ceiling is never reached by legitimate play. The distinction: V17 prevents network flooding (relay-enforced, spoofing-proof); Principle 3 here addresses *gameplay* APM policy (community-governed, not engine-enforced).

**CI-4: Automate the thing, not the workaround.**

When the community discovers that a script provides an advantage, the correct response is not to ban the script — it's to build the scripted behavior into the game as a D033 QoL toggle, making it available to everyone with a single checkbox in the lobby settings. Not buried in a config file. Not requiring a Workshop download. Not needing technical knowledge. **A toggle in the settings menu that any player can find and enable.**

This is the most important competitive integrity principle for an open-source engine: **if someone has to script it, the game's UX has failed.** Every popular script is evidence of a feature the game should have provided natively. The script author identified a need; the game should absorb the solution.

The AoE2 DE lesson is the clearest example: auto-reseed farms were a popular mod/script for years. Players who knew about it had an economic advantage — their farms never went idle. Players who didn't know the script existed fell behind. Forgotten Empires eventually built it into the game as a toggle. Controversy faded immediately. Everyone uses it now. The automation advantage disappeared because it stopped being an advantage — it became a baseline feature.

This principle applies proactively, not just reactively:

**Reactive (minimum):** When a Workshop script becomes popular, evaluate it for D033 promotion. The criteria: (a) widely used by script authors, (b) not controversial when available to everyone, (c) reduces tedious repetition without removing strategic decision-making. D037's governance process (community RFCs) is the mechanism.

**Proactive (better):** When designing any system, ask: "will players script this?" If the answer is yes — if there's a repetitive task that rewards automation — build the automation in from the start. Don't wait for the scripting community to solve it. Design the feature with a D033 toggle so lobbies can enable or disable it as they see fit.

Examples of automation candidates for IC:
- **Auto-harvest:** Idle harvesters automatically return to the nearest ore field → D033 toggle `auto_harvest`. Without this, scripts that re-dispatch idle harvesters provide a measurable economic advantage. With the toggle, every player gets perfect harvester management.
- **Auto-repair:** Damaged buildings near repair facilities automatically start repairing → D033 toggle `auto_repair`. Eliminates the tedious click-each-damaged-building loop that scripts handle perfectly.
- **Production auto-repeat:** Re-queue the last built unit type automatically → D033 toggle `production_repeat`. Prevents the "forgot to queue another tank" problem that scripts never have.
- **Idle unit alert:** Notification when production buildings have been idle for N seconds → D033 toggle `idle_alert`. A script can monitor every building simultaneously; a player can't. The alert makes the information accessible to everyone.
- **Smart rally:** Rally points that automatically assign new units to the nearest control group → D033 toggle `smart_rally`. Avoids the need for scripts that intercept newly produced units.

These are NOT currently in D033's catalog — they are examples of both the reactive adoption process and the proactive design mindset. The game should be designed so that someone who has never heard of console scripts or the Workshop has the same access to automation as someone who writes custom `.iccmd` files.

**The accessibility test:** For any automation feature, ask: "Can a player who doesn't know what a script is get this benefit?" If the answer is no — if the only path to the automation is technical knowledge — the game has created an unfair advantage that favors technical literacy over strategic skill. IC should always be moving toward yes.

**CI-5: If you can't beat them, host them.**

Console scripts are shareable on the Workshop (D030) as a first-class resource category. Not reluctantly tolerated — actively supported with the same publishing, versioning, dependency, and discovery infrastructure as maps, mods, and music.

The reasoning is simple: players WILL write automation scripts. In a closed-source engine, that happens underground — in forums, Discord servers, private AutoHotKey configs. The developers can't see what's being shared, can't ensure quality or safety, can't help users find good scripts, and can't detect which automations are becoming standard practice. In an open-source engine, the underground is even more pointless — anyone can read the source and write a script trivially.

So instead of pretending scripts don't exist, IC makes them a Workshop resource:

- **Published scripts are visible.** The development team (and community) can see which automations are popular — direct signal for which behaviors to promote to D033 QoL toggles.
- **Published scripts are versioned.** When the engine updates, script authors can update their packages. Users get notified of compatibility issues.
- **Published scripts are sandboxed.** Workshop console scripts are sequences of console commands (`.iccmd` files), not arbitrary executables. They run through the same `CommandDispatcher` — they can't do anything the console can't do. They're macros, not programs.
- **Published scripts are rated and reviewed.** Community quality filtering applies — same as maps, mods, and balance presets.
- **Published scripts carry lobby disclosure.** In multiplayer, active Workshop scripts are listed in the lobby alongside active mods. All players see what automations each player is running. This is the FAF model — UI mods are visible to all players in the lobby.
- **Published scripts respect D033 toggles.** A script that issues `/attack` commands is rejected in a vanilla-preset lobby where `attack_move` is disabled — just like typing the command manually.

**Script format — `.iccmd` files:**

```
# auto-harvest.iccmd — Auto-queue harvesters when income drops
# Workshop: community/auto-harvest@1.0.0
# Category: Script Libraries > Economy Automation
# Lobby visibility: shown as active script to all players

@on income_below 500
  /select type:war_factory idle
  /build harvester 1
@end

@on building_idle war_factory 10s
  /build harvester 1
@end
```

The `.iccmd` format is deliberately limited — event triggers + console commands, not a programming language. Complex automation belongs in Lua mods (D004), not console scripts. **Boundary with Lua:** `.iccmd` triggers are pre-defined patterns (event name + threshold), not arbitrary conditionals. If a script needs `if/else`, loops, variables, or access to game state beyond trigger parameters, it should be a Lua mod. The triggers shown above (`@on income_below`, `@on building_idle`) are the *ceiling* of `.iccmd` expressiveness — they fire when a named condition crosses a threshold, nothing more. Event triggers must have a per-trigger cooldown (minimum interval between firings) to prevent rapid-fire order generation — without cooldowns, a trigger that fires every tick could consume the player's entire order budget (V17: 256 orders/tick hard ceiling) and crowd out intentional commands. The format details are illustrative — final syntax is a Phase 5+ design task.

**The promotion pipeline:** Workshop script popularity directly feeds the D033 adoption process:

1. **Community creates** — someone publishes `auto-harvest.iccmd` on the Workshop
2. **Community adopts** — it becomes the most-downloaded script in its category
3. **Community discusses** — D037 RFC: "should auto-harvest be a built-in QoL toggle?"
4. **Design team evaluates** — does it reduce tedium without removing decisions?
5. **Engine absorbs** — if yes, it becomes `D033 toggle auto_harvest`, the Workshop script becomes redundant, and the community moves on to the next automation frontier

This is how healthy open-source ecosystems work. npm packages become Node.js built-ins. Popular Vim plugins become Neovim defaults. Community Firefox extensions become browser features. The Workshop is IC's proving ground for automation features.

**CI-6: Transparency over restriction.**

Every action a player takes is recorded in the replay — including the commands they used and their input source. The community can see exactly how each player played. This is the most powerful competitive integrity tool available to an open-source project:

- Post-match replays show full APM breakdown with input source tags
- Tournament casters can display "console commands used" alongside APM
- Community server admins can review flagged matches
- The community decides what level of automation is acceptable for their competitive scene

This mirrors how chess handles engine cheating online: no client can be fully trusted, so the detection is behavioral/statistical, reviewed by humans or automated analysis, and enforced by the community.

##### Player Transparency — What Players See

Principle 6 states transparency over restriction. This subsection specifies exactly what players see — the concrete UX that makes automation visible rather than hidden.

**Lobby (pre-game):**

| Element                     | Visibility                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Active mods**             | All loaded mods listed per player (name + version). Mismatches highlighted. Same model as Factorio/FAF            |
| **Active `.iccmd` scripts** | Workshop scripts listed by name with link to Workshop page. Custom (non-Workshop) scripts show "Local script"     |
| **QoL preset**              | Player's active experience profile (D033) displayed — e.g., "OpenRA Purist," "IC Standard," or custom             |
| **D033 toggles summary**    | Expandable panel: which automations are enabled (auto-harvest, auto-repair, production repeat, idle alerts, etc.) |
| **Input devices**           | Not shown — input hardware is private. Only the *commands issued* are tracked, not the device                     |

The lobby is the first line of defense against surprise: if your opponent has auto-repair and production repeat enabled, you see that *before* clicking Ready. This is the FAF model — every UI mod is listed in the lobby, and opponents can inspect the full list.

**In-game HUD:**

- **No real-time script indicators for opponents.** Showing "Player 2 is using a script" mid-game would be distracting, potentially misleading (is auto-harvest a "script" or a QoL toggle?), and would create incentive to game the indicator. The lobby disclosure is sufficient.
- **Own-player indicators:** Your own enabled automations appear as small icons near the minimap (same UI surface as stance icons). You see what *you* have active, always.
- **Observer/caster mode:** Observers and casters see a per-player APM counter with source breakdown (GUI clicks vs. console commands vs. script-issued orders). This is a spectating feature, not a player-facing one — competitive players don't get distracted, but casters can narrate automation differences.

**Post-match score screen:**

| Metric                      | Description                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| **APM (total)**             | Raw actions per minute, standard RTS metric                                                     |
| **APM by source**           | Breakdown: GUI / console / `.iccmd` script / config file. Shows how each player issued orders   |
| **D033 toggles active**     | Which automations were enabled during the match                                                 |
| **Workshop scripts active** | Named list of `.iccmd` scripts used, with Workshop links                                        |
| **Order volume graph**      | Timeline of orders-per-second, color-coded by source — spikes from scripts are visually obvious |

The post-match screen answers "how did they play?" without judgment. A player who used auto-repair and a build-order script can be distinguished from one who micro'd everything manually — but neither is labeled "cheater." The community decides what level of automation they respect.

**Replay viewer:**

- Full command log with `CommandOrigin` tags (GUI, Console, Script, ConfigFile)
- APM timeline graph with source-coded coloring
- Script execution markers on the timeline (when each `.iccmd` trigger fired)
- Exportable match data (JSON/CSV) for community statistical analysis tools
- Same observer APM overlay available during replay playback

**Why no "script detected" warnings?**

The user asked: "should we do something to let players know scripts are in use?" The answer is: yes — *before the game starts* (lobby) and *after it ends* (score screen, replay), but *not during the game*. Mid-game warnings create three problems:

1. **Classification ambiguity.** Where is the line between "D033 QoL toggle" and "script"? Auto-harvest is engine-native. A `.iccmd` that does the same thing is functionally identical. Warning about one but not the other is arbitrary.
2. **False security.** A warning that says "no scripts detected" when running an open-source client is meaningless — any modified client can suppress the flag. The lobby disclosure is opt-in honesty backed by replay verification, not a trust claim.
3. **Distraction.** Players should focus on playing, not monitoring opponent automation status. Post-match review is the right time for analysis.

**Lessons from open-source games on client trust:**

The comparison table above includes Lichess, DDNet, and Minetest. The cross-cutting lesson from all open-source competitive games:

- **You cannot secure the client.** Any GPL codebase can be modified to lie about anything client-side. Lichess knows this — their entire anti-cheat (Irwin + Kaladin) is server-side behavioral analysis. DDNet's antibot plugin runs server-side. Minetest's CSM restriction flags are server-enforced.
- **Embrace the openness.** Rather than fighting modifications, make the *legitimate* automation excellent so there's no incentive to use shady external tools. Factorio's mod system is so good that cheating is culturally irrelevant. FAF's sim mod system is so transparent that the community self-polices.
- **The server is the only trust boundary.** Order validation (D012), relay-side order counting (D007), and replay signing (D052) are the real anti-cheat. Client-side anything is theater.

IC's position: we don't pretend the client is trustworthy. We make automation visible, accessible, and community-governed — then let the server and the replay be the source of truth.

##### Ranked Mode Restrictions

Ranked matchmaking (D055) enforces additional constraints beyond casual play:

- **DeveloperMode is unavailable.** The lobby option is hidden in ranked queue — dev commands cannot be enabled.
- **Mod commands require ranked certification.** Community servers (D052) maintain a whitelist of mod commands approved for ranked play. Uncertified mod commands are rejected in ranked matches. The default: only engine-core commands are permitted; game-module commands (those registered by the built-in game module, e.g., RA1) are permitted; third-party mod commands require explicit whitelist entry.
- **Order volume is recorded server-side.** The relay server counts orders per player per tick. This data is included in match certification (D055) and available for community review. It cannot be spoofed by modified clients.
- **`autoexec.cfg` commands execute normally.** Cvar-setting commands (`/set`, `/get`, `/toggle`) from autoexec execute as preferences. Gameplay commands (`/build`, `/move`, etc.) from autoexec are rejected in ranked — `CommandOrigin::ConfigFile` is not a valid origin for sim-affecting orders in ranked mode. You can set your sensitivity in autoexec; you can't script your build order.
- **Zoom range is clamped.** The competitive zoom range (default: 0.75–2.0) overrides the render mode's `CameraConfig.zoom_min/zoom_max` (see `02-ARCHITECTURE.md` § "Camera System") in ranked matches. This prevents extreme zoom-out from providing disproportionate map awareness. The default range is configured per ranked queue by the competitive committee (D037) and stored in the seasonal ranked configuration YAML. Tournament organizers can set their own zoom range via `TournamentConfig`. The `/zoom` command respects these bounds.

##### Tournament Mode

Tournament organizers (via community server administration, D052) can enable a stricter **tournament mode** in the lobby:

| Restriction                         | Effect                                                                                    | Rationale                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Command whitelist**               | Only whitelisted commands accepted; all others rejected                                   | Organizers control exactly which console commands are legal                                        |
| **ConfigFile gameplay rejection**   | `autoexec.cfg` sim-affecting commands rejected (same as ranked)                           | Level playing field — no pre-scripted build orders                                                 |
| **Input source logging**            | All `CommandOrigin` tags recorded in match data, visible to admins                        | Post-match review for scripting investigation                                                      |
| **APM cap (optional)**              | Configurable orders-per-minute soft cap; exceeding triggers admin alert, not hard block   | Communities that value strategy over APM can set limits                                            |
| **Forced replay recording**         | Match replay saved automatically; both players receive copies                             | Evidence for dispute resolution                                                                    |
| **No mod commands**                 | Third-party mod commands disabled entirely                                                | Pure vanilla/IC experience for competition                                                         |
| **Workshop scripts (configurable)** | Organizer chooses: allow all, whitelist specific scripts, or disable all `.iccmd` scripts | Some tournaments embrace automation (FAF-style); others require pure manual play. Organizer's call |

Tournament mode is a superset of ranked restrictions — it's ranked plus organizer-defined rules. The `CommandDispatcher` checks a `TournamentConfig` resource (if present) before executing any command.

| Additional Tournament Option | Effect                                          | Default                   |
| ---------------------------- | ----------------------------------------------- | ------------------------- |
| **Zoom range override**      | Custom min/max zoom bounds                      | Same as ranked (0.75–2.0) |
| **Resolution cap**           | Maximum horizontal resolution for game viewport | Disabled (no cap)         |
| **Weather sim effects**      | Force `sim_effects: false` on all maps          | Off (use map's setting)   |

##### Visual Settings & Competitive Fairness

Client-side visual settings — `/weather_fx`, `/shadows`, graphics quality presets, and render quality tiers — can affect battlefield visibility. A player who disables weather particles sees more clearly during a storm; a player on Low shadows has cleaner unit silhouettes.

This is a **conscious design choice, not an oversight.** Nearly every competitive game exhibits this pattern: CS2 players play on low settings for visibility, SC2 players minimize effects for performance. The access is symmetric (every player can toggle the same settings), the tradeoff is aesthetics vs. clarity, and restricting visual preferences would be hostile to players on lower-end hardware who *need* reduced effects to maintain playable frame rates.

**Resolution and aspect ratio** follow the same principle. A 32:9 ultrawide player sees more horizontal area than a 16:9 player. In an isometric RTS, this advantage is modest — the sidebar and minimap consume significant screen space, and the critical information (unit positions, fog of war) is available to all players via the minimap regardless of viewport size. Restricting resolution would punish players for their hardware. Tournament organizers can set resolution caps via `TournamentConfig` if their ruleset demands hardware parity, but engine-level ranked play does not restrict this.

**Principle:** Visual settings that are universally accessible, symmetrically available, and involve a meaningful aesthetic tradeoff are not restricted. Settings that provide information not available to other players (hypothetical: a shader that reveals cloaked units) would be restricted. The line is **information equivalence**, not visual equivalence.

##### What We Explicitly Do NOT Do

- **No kernel anti-cheat.** Warden, VAC, Vanguard, EasyAntiCheat — none of these are compatible with GPL, Linux, community trust, or open-source principles. We accept that the client cannot be trusted and design our competitive integrity around server-side verification and community governance instead.
- **No hard APM cap for all players.** Fast players exist. Punishing speed punishes skill. APM is monitored and exposed, not limited (except in tournament mode where organizers opt in).
- **No "you used the console, achievements disabled" for non-dev commands.** Typing `/move 100,200` instead of right-clicking is a UX preference, not cheating. Only dev commands trigger the cheat flag.
- **No script detection heuristics in the engine.** Attempting to distinguish "human typing fast" from "script typing" is an arms race the open-source side always loses. Detection belongs to the community layer (replay review, statistical analysis), not the engine layer.
- **No removal of the console in multiplayer.** The console is an accessibility and power-user feature. Removing it doesn't prevent scripting (external tools exist); it just removes a legitimate interface. The answer to automation isn't removing tools — it's making the automation available to everyone (D033) and transparent to the community (replays).

##### Cross-Reference Summary

- **D012 (Order Validation):** The architectural defense — every `PlayerOrder` is validated by the sim regardless of origin. Invalid orders are rejected deterministically.
- **D007 (Relay Server):** Server-side order counting cannot be spoofed by modified clients. The relay sees the real order volume.
- **D030 (Workshop):** Console scripts are a first-class Workshop resource category. Visibility, versioning, and community review make underground scripting unnecessary. Popular scripts feed the D033 promotion pipeline.
- **D033 (QoL Toggles):** The great equalizer — when automation becomes standard community practice, promote it to a QoL toggle so everyone benefits equally. Workshop script popularity is the primary signal for which automations to promote.
- **D037 (Community Governance):** Communities define their own competitive norms via RFCs. APM policies, script policies, and tournament rules are community decisions, not engine-enforced mandates.
- **D052 (Community Servers):** Server operators configure ranked restrictions, tournament mode, and mod command whitelists.
- **D055 (Ranked Tiers):** Ranked mode automatically applies the competitive integrity restrictions described above.
- **D048 (Render Modes):** Information equivalence guarantee — all render modes display identical game-state information. See D048 § "Information Equivalence Across Render Modes."
- **D022 (Weather):** Weather sim effects on ranked maps are a map pool curation concern — see D055 § "Map pool curation guidelines."
- **D018 (Experience Profiles):** Profile locking table specifies which axes are fixed in ranked. See D018 § profile locking table.

#### Classic Cheat Codes (Single-Player Easter Egg)

**Phase:** Phase 3+ (requires command system; trivial to implement once `CheatCodeHandler` and `PlayerOrder::CheatCode` exist — each cheat reuses existing dev command effects).

A hidden, undocumented homage to the golden age of cheat codes and trainers. In single-player, the player can type certain phrases into the chat input — no `/` prefix needed — and trigger hidden effects. These are never listed in `/help`, never mentioned in any in-game documentation, and never exposed through the UI. They exist for the community to discover, share, and enjoy — exactly like AoE2's "how do you turn this on" or StarCraft's "power overwhelming."

**Design principles:**

1. **Single-player only.** Cheat phrases are ignored entirely in multiplayer — the `CheatCodeHandler` is not even registered as a system when `NetworkModel` is anything other than `LocalNetwork`. No server-side processing, no network traffic, no possibility of multiplayer exploitation.

2. **Undocumented.** Not in `/help`. Not in the encyclopedia. Not in any in-game tooltip or tutorial. The game's official documentation does not acknowledge their existence. Community wikis and word-of-mouth are the discovery mechanism — just like the originals.

3. **Hashed, not plaintext.** Cheat phrase strings are stored as pre-computed hashes in the binary, not as plaintext string literals. Casual inspection of the binary or source code does not trivially reveal all cheats. This is a speed bump, not cryptographic security — determined data-miners will find them, and that's fine. The goal is to preserve the discovery experience, not to make them impossible to find.

4. **Two-tier achievement-flagging.** Not all cheats are equal — disco palette cycling doesn't affect competitive integrity the same way infinite credits does. IC uses a two-tier cheat classification:

   - **Gameplay cheats** (invincibility, instant build, free credits, reveal map, etc.) permanently set `cheats_used = true` on the save/match. Achievements (D036) are disabled. Same rules as dev commands.
   - **Cosmetic cheats** (palette effects, visual gags, camera tricks, audio swaps) set `cosmetic_cheats_used = true` but do NOT disable achievements or flag the save as "cheated." They are recorded in replay metadata for transparency but carry no competitive consequence.

   The litmus test: **does this cheat change the simulation state in a way that affects win/loss outcomes?** If yes → gameplay cheat. If it only touches rendering, audio, or visual effects with zero sim impact → cosmetic cheat. Edge cases default to gameplay (conservative). The classification is per-cheat, defined in the game module's cheat table (the `CheatFlags` field below).

   This is more honest than a blanket flag. Punishing a player for typing "kilroy was here" the same way you punish them for infinite credits is disproportionate — it discourages the fun, low-stakes cheats that are the whole point of the system.

5. **Thematic.** Phrases are Cold War themed, fitting the Red Alert setting, and extend to C&C franchise cultural moments and cross-game nostalgia. Each cheat has a brief, in-character confirmation message displayed as an EVA notification — no generic "cheat activated" text. Naming follows the narrative identity principle: earnest commitment, never ironic distance (Principle #20, [13-PHILOSOPHY.md](13-PHILOSOPHY.md)). Even hidden mechanisms carry the world's flavor.

6. **Fun first.** Some cheats are practical (infinite credits, invincibility). Others are purely cosmetic silliness (visual effects, silly unit behavior). The two-tier flagging (principle 4 above) ensures cosmetic cheats don't carry disproportionate consequences — players can enjoy visual gags without losing achievement progress.

**Implementation:**

```rust
/// Handles hidden cheat code activation in single-player.
/// Registered ONLY when NetworkModel is LocalNetwork (single-player / skirmish vs AI).
/// Checked BEFORE the CommandDispatcher — if input matches a known cheat hash,
/// the cheat is activated and the input is consumed (never reaches chat or command parser).
pub struct CheatCodeHandler {
    /// Pre-computed FNV-1a hashes of cheat phrases (lowercased, trimmed).
    /// Using hashes instead of plaintext prevents casual string extraction from the binary.
    /// Map: hash → CheatEntry (id + flags).
    known_hashes: HashMap<u64, CheatEntry>,
    /// Currently active toggle cheats (invincibility, instant build, etc.).
    active_toggles: HashSet<CheatId>,
}

pub struct CheatEntry {
    pub id: CheatId,
    pub flags: CheatFlags,
}

bitflags! {
    /// Per-cheat classification. Determines achievement/ranking consequences.
    pub struct CheatFlags: u8 {
        /// Affects simulation state (credits, health, production, fog, victory).
        /// Sets `cheats_used = true` — disables achievements and ranked submission.
        const GAMEPLAY = 0b01;
        /// Affects only rendering, audio, or camera — zero sim impact.
        /// Sets `cosmetic_cheats_used = true` — recorded in replay but no competitive consequence.
        const COSMETIC = 0b10;
    }
}

impl CheatCodeHandler {
    /// Called from InputSource processing pipeline, BEFORE command dispatch.
    /// Returns true if input was consumed as a cheat code.
    pub fn try_activate(&mut self, input: &str) -> Option<CheatActivation> {
        let normalized = input.trim().to_lowercase();
        let hash = fnv1a_hash(normalized.as_bytes());
        if let Some(&cheat_id) = self.known_hashes.get(&hash) {
            Some(CheatActivation {
                cheat_id,
                // Produces a PlayerOrder::CheatCode(cheat_id) that flows through
                // the sim's order pipeline — deterministic, snapshottable, replayable.
                order: PlayerOrder::CheatCode(cheat_id),
            })
        } else {
            None
        }
    }
}

/// Cheat activation produces a PlayerOrder — the sim handles it deterministically.
/// This means cheats are: (a) snapshottable (D010), (b) replayable, (c) validated
/// (the sim rejects CheatCode orders when not in single-player mode).
pub enum PlayerOrder {
    // ... existing variants ...
    CheatCode(CheatId),
}
```

**Processing flow:** Chat input → `CheatCodeHandler::try_activate()` → if match, produce `PlayerOrder::CheatCode` → order pipeline → sim validates (single-player only) → check `CheatFlags`: if `GAMEPLAY`, set `cheats_used = true`; if `COSMETIC`, set `cosmetic_cheats_used = true` → apply effect → EVA confirmation notification. If no match, input falls through to normal chat/command dispatch.

**Note on chat swallowing:** If a player types a cheat phrase (e.g., "iron curtain") as normal chat, it is consumed as a cheat activation — the text is NOT sent as a chat message. This is **intentional and by design**: cheat codes only activate in single-player mode (multiplayer rejects `CheatCode` orders), and the hidden-phrase discovery mechanic requires that the input be consumed on match. Players in single-player who accidentally trigger a cheat receive an EVA confirmation that makes the activation obvious, and all cheats are toggleable (can be deactivated by typing the phrase again).

**Cheat codes (RA1 game module examples):**

*Trainer-style cheats (gameplay-affecting — `GAMEPLAY` flag, disables achievements):*

| Phrase                           | Effect                                                                                                   | Type       | Flags      | Confirmation                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------- |
| `perestroika`                    | Reveal entire map permanently                                                                            | One-shot   | `GAMEPLAY` | "Transparency achieved."                                                          |
| `glasnost`                       | Remove fog of war permanently (live vision of all units)                                                 | One-shot   | `GAMEPLAY` | "Nothing to hide, comrade."                                                       |
| `iron curtain`                   | Toggle invincibility for all your units                                                                  | Toggle     | `GAMEPLAY` | "Your forces are shielded." / "Shield lowered."                                   |
| `five year plan`                 | Toggle instant build (all production completes in 1 tick)                                                | Toggle     | `GAMEPLAY` | "Plan accelerated." / "Plan normalized."                                          |
| `surplus`                        | Grant 10,000 credits (repeatable)                                                                        | Repeatable | `GAMEPLAY` | "Economic stimulus approved."                                                     |
| `marshall plan`                  | Max out credits + complete all queued production instantly                                               | One-shot   | `GAMEPLAY` | "Full economic mobilization."                                                     |
| `mutual assured destruction`     | All superweapons fully charged                                                                           | Repeatable | `GAMEPLAY` | "Launch readiness confirmed."                                                     |
| `arms race`                      | All current units gain elite veterancy                                                                   | One-shot   | `GAMEPLAY` | "Accelerated training complete."                                                  |
| `not a step back`                | Toggle +100% fire rate and +50% damage for all your units                                                | Toggle     | `GAMEPLAY` | "Order 227 issued." / "Order rescinded."                                          |
| `containment`                    | All enemy units frozen in place for 30 seconds                                                           | Repeatable | `GAMEPLAY` | "Enemies contained."                                                              |
| `scorched earth`                 | Next click drops a nuke at cursor position (one-use per activation)                                      | One-use    | `GAMEPLAY` | "Strategic asset available. Select target."                                       |
| `red october`                    | Spawn a submarine fleet at nearest water body                                                            | One-shot   | `GAMEPLAY` | "The fleet has arrived."                                                          |
| `from russia with love`          | Spawn a Tanya at cursor position                                                                         | Repeatable | `GAMEPLAY` | "Special operative deployed."                                                     |
| `new world order`                | Instant victory                                                                                          | One-shot   | `GAMEPLAY` | "Strategic dominance achieved."                                                   |
| `better dead than red`           | Instant defeat (you lose)                                                                                | One-shot   | `GAMEPLAY` | "Surrender accepted."                                                             |
| `dead hand`                      | Automated retaliation: when your last building dies, all enemy units on the map take massive damage      | Persistent | `GAMEPLAY` | "Automated retaliation system armed. They cannot win without losing."             |
| `mr gorbachev`                   | Destroys every wall segment on the map (yours and the enemy's)                                           | One-shot   | `GAMEPLAY` | "Tear down this wall!"                                                            |
| `domino theory`                  | When an enemy unit dies, adjacent enemies take 25% of the killed unit’s max HP. Chain reactions possible | Toggle     | `GAMEPLAY` | "One falls, they all fall." / "Containment restored."                             |
| `wolverines`                     | All infantry deal +50% damage (Red Dawn, 1984)                                                           | Toggle     | `GAMEPLAY` | "WOLVERINES!" / "Stand down, guerrillas."                                         |
| `berlin airlift`                 | A cargo plane drops 5 random crates across your base                                                     | Repeatable | `GAMEPLAY` | "Supply drop inbound."                                                            |
| `how about a nice game of chess` | AI difficulty drops to minimum (WarGames, 1983)                                                          | One-shot   | `GAMEPLAY` | "A strange game. The only winning move is not to play. ...But let’s play anyway." |
| `trojan horse`                   | Your next produced unit appears with enemy colors. Enemies ignore it until it fires                      | One-use    | `GAMEPLAY` | "Infiltrator ready. They won't see it coming."                                    |

*Cosmetic / fun cheats (visual-only — `COSMETIC` flag, achievements remain enabled):*

| Phrase                   | Effect                                                                                                                                                                                                                                                               | Type   | Flags      | Confirmation                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------- |
| `party like its 1946`    | Disco palette cycling on all units                                                                                                                                                                                                                                   | Toggle | `COSMETIC` | "♪ Boogie Woogie Bugle Boy ♪"                                                     |
| `space race`             | Unlock maximum camera zoom-out (full map view). Fog of war still renders at all zoom levels — unexplored/fogged terrain is hidden regardless of altitude. This is purely a camera unlock, not a vision cheat (compare `perestroika`/`glasnost` which ARE `GAMEPLAY`) | Toggle | `COSMETIC` | "Orbital altitude reached." / "Returning to ground."                              |
| `propaganda`             | EVA voice lines replaced with exaggerated patriotic variants                                                                                                                                                                                                         | Toggle | `COSMETIC` | "For the motherland!" / "Standard communications restored."                       |
| `kilroy was here`        | All infantry units display a tiny "Kilroy" graffiti sprite above their head                                                                                                                                                                                          | Toggle | `COSMETIC` | "He was here." / "He left."                                                       |
| `hell march`             | Force Hell March to play on infinite loop, overriding all other music. The definitive RA experience                                                                                                                                                                  | Toggle | `COSMETIC` | "♪ Die Waffen, legt an! ♪" / "Standard playlist restored."                        |
| `kirov reporting`        | A massive Kirov airship shadow slowly drifts across the map every few minutes. No actual unit — pure atmospheric dread                                                                                                                                               | Toggle | `COSMETIC` | "Kirov reporting." / "Airspace cleared."                                          |
| `conscript reporting`    | Every single unit — tanks, ships, planes, buildings — uses Conscript voice lines when selected or ordered                                                                                                                                                            | Toggle | `COSMETIC` | "Conscript reporting!" / "Specialized communications restored."                   |
| `rubber shoes in motion` | All units crackle with Tesla electricity visual effects when moving                                                                                                                                                                                                  | Toggle | `COSMETIC` | "Charging up!" / "Discharge complete."                                            |
| `silos needed`           | EVA says "silos needed" every 5 seconds regardless of actual silo status. The classic annoyance, weaponized as nostalgia                                                                                                                                             | Toggle | `COSMETIC` | "You asked for this." / "Sanity restored."                                        |
| `big head mode`          | All unit sprites and turrets rendered at 200% head/turret size. Classic Goldeneye DK Mode homage                                                                                                                                                                     | Toggle | `COSMETIC` | "Cranial expansion complete." / "Normal proportions restored."                    |
| `crab rave`              | All idle units slowly rotate in place in synchronized circles                                                                                                                                                                                                        | Toggle | `COSMETIC` | "🦀" / "Units have regained their sense of purpose."                               |
| `dr strangelove`         | Units occasionally shout "YEEEEHAW!" when attacking. Nuclear explosions display riding-the-bomb animation overlay                                                                                                                                                    | Toggle | `COSMETIC` | "Gentlemen, you can't fight in here! This is the War Room!" / "Decorum restored." |
| `sputnik`                | A tiny satellite sprite orbits your cursor wherever it goes                                                                                                                                                                                                          | Toggle | `COSMETIC` | "Beep... beep... beep..." / "Satellite deorbited."                                |
| `duck and cover`         | All infantry periodically go prone for 1 second at random, as if practicing civil defense drills (purely animation — no combat effect)                                                                                                                               | Toggle | `COSMETIC` | "This is a drill. This is only a drill." / "All clear."                           |
| `enigma`                 | All AI chat/notification text is displayed as scrambled cipher characters                                                                                                                                                                                            | Toggle | `COSMETIC` | "XJFKQ ZPMWV ROTBG." / "Decryption restored."                                     |

*Cross-game easter eggs (meta-references — `COSMETIC` flag):*

These recognize cheat codes from other iconic games and respond with in-character humor. **None of them do anything mechanically** — the witty EVA response IS the entire easter egg. They reward gaming cultural knowledge with a knowing wink, not a gameplay advantage. They’re love letters to the genre.

| Phrase                    | Recognized From    | Type     | Flags      | Response                                                                       |
| ------------------------- | ------------------ | -------- | ---------- | ------------------------------------------------------------------------------ |
| `power overwhelming`      | StarCraft          | One-shot | `COSMETIC` | "Protoss technologies are not available in this theater of operations."        |
| `show me the money`       | StarCraft          | One-shot | `COSMETIC` | "This is a command economy, Commander. Fill out the proper requisition forms." |
| `there is no cow level`   | Diablo / StarCraft | One-shot | `COSMETIC` | "Correct."                                                                     |
| `how do you turn this on` | Age of Empires II  | One-shot | `COSMETIC` | "Motorpool does not stock that vehicle. Try a Mammoth Tank."                   |
| `rosebud`                 | The Sims           | One-shot | `COSMETIC` | "§;§;§;§;§;§;§;§;§;"                                                           |
| `iddqd`                   | DOOM               | One-shot | `COSMETIC` | "Wrong engine. This one uses Bevy."                                            |
| `impulse 101`             | Half-Life          | One-shot | `COSMETIC` | "Requisition denied. This isn't Black Mesa."                                   |
| `greedisgood`             | Warcraft III       | One-shot | `COSMETIC` | "Wrong franchise. We use credits here, not gold."                              |
| `up up down down`         | Konami Code        | One-shot | `COSMETIC` | "30 extra lives. ...But this isn't that kind of game."                         |
| `cheese steak jimmys`     | Age of Empires II  | One-shot | `COSMETIC` | "The mess hall is closed, Commander."                                          |
| `black sheep wall`        | StarCraft          | One-shot | `COSMETIC` | "Try 'perestroika' instead. We have our own words for that."                   |
| `operation cwal`          | StarCraft          | One-shot | `COSMETIC` | "Try 'five year plan'. Same idea, different ideology."                         |

**Why meta-references are `COSMETIC`:** They have zero game effect. The reconnaissance value of knowing "`black sheep wall` doesn't work but `perestroika` does" is part of the discovery fun — the game is training you to find the real cheats. The last two entries deliberately point players toward IC's actual cheat codes, rewarding cross-game knowledge with a hint.

**Mod-defined cheats:** Game modules register their own cheat code tables — the engine provides the `CheatCodeHandler` infrastructure, the game module supplies the phrase hashes and effect implementations. A Tiberian Dawn module would have different themed phrases than RA1. Total conversion mods can define entirely custom cheat tables via YAML:

```yaml
# Custom cheat codes (mod.yaml)
cheat_codes:
  - phrase_hash: 0x7a3f2e1d   # hash of the phrase — not the phrase itself
    effect: give_credits
    amount: 50000
    flags: gameplay          # disables achievements
    confirmation: "Tiberium dividend received."
  - phrase_hash: 0x4b8c9d0e
    effect: toggle_invincible
    flags: gameplay
    confirmation_on: "Blessed by Kane."
    confirmation_off: "Mortality restored."
  - phrase_hash: 0x9e2f1a3b
    effect: toggle_visual
    flags: cosmetic           # achievements unaffected
    confirmation_on: "The world changes."
    confirmation_off: "Reality restored."
```

**Relationship to dev commands:** Cheat codes and dev commands are complementary, not redundant. Dev commands (`/give`, `/spawn`, `/reveal`, `/instant_build`) are the precise, documented, power-user interface — visible in `/help`, discoverable, parameterized. Cheat codes are the thematic, hidden, fun interface — no parameters, no documentation, themed phrases with in-character responses. Under the hood, many cheats produce the same `PlayerOrder` variants as their dev command counterparts. The difference is entirely in the surface: how the player discovers, invokes, and experiences them.

**Why hashed phrases, not encrypted:** We are preserving a nostalgic discovery experience, not implementing DRM. Hashing makes cheats non-obvious to casual inspection but deliberately yields to determined community effort. Within weeks of release, every cheat will be on a wiki — and that's the intended outcome. The joy is in the initial community discovery process, not in permanent secrecy.

#### Security Considerations

| Risk                                    | Mitigation                                                                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arbitrary Lua execution**             | Lua runs in the D004 sandbox — no filesystem, no network, no `os.*`. `loadstring()` disabled. Execution timeout (100ms default). Memory limit per invocation.                                                                                                     |
| **Cvar manipulation for cheating**      | Sim-affecting cvars require `DEV_ONLY` flag and flow through order validation. Render/audio cvars cannot affect gameplay. A `/set` command for a `DEV_ONLY` cvar without dev mode active is rejected.                                                             |
| **Chat message buffer overflow**        | Chat messages are bounded (512 chars, same as `ProtocolLimits::max_chat_message_length` from `06-SECURITY.md` § V15). Command input bounded similarly. The `StringReader` parser rejects input exceeding the limit before parsing.                                |
| **Command injection in multiplayer**    | Commands execute locally on the issuing client. Sim-affecting commands go through the order pipeline as `PlayerOrder::ChatCommand(cmd, args)` — validated by the sim like any other order. A malicious client cannot execute commands on another client's behalf. |
| **Denial of service via expensive Lua** | Lua execution has a tick budget. `/c` commands that exceed the budget are interrupted with an error. The chat/console remains responsive because Lua runs in the script system's time slice, not the UI thread.                                                   |
| **Cvar persistence tampering**          | `config.toml` is local — tampering only affects the local client. Server-authoritative cvars (`SERVER` flag) cannot be overridden by client-side config.                                                                                                          |

#### Platform Considerations

| Platform             | Chat Input                                 | Developer Console                                                 | Notes                                              |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------- |
| **Desktop**          | Enter opens input, `/` prefix for commands | `~` toggles overlay                                               | Full keyboard; best experience                     |
| **Browser (WASM)**   | Same                                       | Same (tilde might conflict with browser shortcuts — configurable) | Virtual keyboard on mobile browsers                |
| **Steam Deck**       | On-screen keyboard when input focused      | Touchscreen or controller shortcut                                | Steam's built-in OSK works                         |
| **Mobile (future)**  | Tap chat icon → OS keyboard                | Not exposed (use GUI settings instead)                            | Commands via chat input; no tilde console          |
| **Console (future)** | D-pad/bumper to open, OS keyboard          | Not exposed                                                       | Controller-friendly command browser as alternative |

For non-desktop platforms, the cvar browser in the developer console is replaced by the **Settings UI** — a GUI-based equivalent that exposes the same cvars through menus and sliders. The command system is accessible via chat input on all platforms; the developer console overlay is a desktop convenience, not a requirement.

### Config File on Startup

Cvars are loadable from `config.toml` on startup and optionally from a per-game-module override:

```
config.toml                   # global defaults
config.ra1.toml               # RA1-specific overrides (optional)
config.td.toml                # TD-specific overrides (optional)
```

**Load order:** `config.toml` → `config.<game_module>.toml` → command-line arguments → in-game `/set` commands. Each layer overrides the previous. Changes made via `/set` on `PERSISTENT` cvars write back to the appropriate config file.

**Autoexec:** An optional `autoexec.cfg` file (Source Engine convention) runs commands on startup:

```
# autoexec.cfg — runs on game startup
/set render.max_fps 144
/set audio.master_volume 80
/set gameplay.scroll_speed 7
```

This is a convenience for power users who prefer text files over GUI settings. The format is one command per line, `#` for comments. Parsed by the same `CommandDispatcher` with `CommandOrigin::ConfigFile`.

### What This Is NOT

- **NOT a replacement for the Settings UI.** Most players change settings through the GUI. The command system and cvars are the power-user interface to the same underlying settings. Both read and write the same `config.toml`.
- **NOT a scripting environment.** The `/c` Lua console is for quick testing and debugging, not for writing mods. Mods belong in proper `.lua` files loaded through the mod system (D004). The console is a REPL — one-liners and quick experiments.
- **NOT available in competitive/ranked play.** Dev commands are gated behind DeveloperMode (V44). The chat system and non-dev commands work in ranked; the Lua console and dev commands do not. Normal console commands (`/move`, `/build`, etc.) are treated as GUI-equivalent inputs — they produce the same `PlayerOrder` and are governed by D033 QoL toggles. See "Competitive Integrity in Multiplayer" above for the full framework: order rate monitoring, input source tracking, ranked restrictions, and tournament mode.
- **NOT a server management panel.** Server administration beyond kick/ban/config should use external tools (web panels, RCON protocol). The in-game commands cover in-match operations only.

### Alternatives Considered

- **Separate console only, no chat integration** (rejected — Source Engine's model works for FPS games where chat is secondary, but RTS players use chat heavily during matches; forcing tilde-switch for commands is friction. Factorio and Minecraft prove unified is better for games where chat and commands coexist.)
- **Chat only, no developer console** (rejected — power users need multi-line Lua input, scrollback, cvar browsing, and syntax highlighting. A single-line chat field can't provide this. The developer console is a thin UI layer over the same dispatcher — minimal implementation cost.)
- **GUI-only commands like OpenRA** (rejected — checkbox menus are fine for 7 dev mode flags but don't scale to dozens of commands, mod-injected commands, or Lua execution. A text interface is necessary for extensibility.)
- **Custom command syntax instead of `/` prefix** (rejected — `/` is the universal standard across Minecraft, Factorio, Discord, IRC, MMOs, and dozens of other games. Any other prefix would surprise users.)
- **RCON protocol for remote administration** (deferred to `M7` / Phase 5 productization, `P-Scale` — useful for dedicated/community servers but out of scope for Phase 3. Planned implementation path: add `CommandOrigin::Rcon` with `Admin` permission level; the command dispatcher is origin-agnostic by design. Not part of Phase 3 exit criteria.)
- **Unrestricted Lua console without achievement consequences** (rejected — every game that has tried this has created a split community where "did you use the console?" is a constant question. Factorio's model — use it freely, but achievements are permanently disabled — is honest and universally understood.)
- **Disable console commands in multiplayer to prevent scripting** (rejected — console commands produce the same `PlayerOrder` as GUI actions. Removing them doesn't prevent scripting — external tools like AutoHotKey can automate mouse/keyboard input. Worse, a modified open-source client can send orders directly, bypassing all input methods. Removing the console punishes legitimate power users and accessibility needs while providing zero security benefit. The correct defense is D033 equalization, input source tracking, and community governance — see "Competitive Integrity in Multiplayer.")

### Integration with Existing Decisions

- **D004 (Lua Scripting):** The `/c` command executes Lua in the same sandbox as mission scripts. The `CommandSource` passed to Lua commands provides the execution context (`CommandOrigin::ChatInput` vs `LuaScript` vs `ConfigFile`).
- **D005 (WASM):** WASM modules register commands through the same `CommandDispatcher` host function API. WASM commands have the same permission model and sandboxing guarantees.
- **D012 (Order Validation):** Sim-affecting commands produce `PlayerOrder` variants. The order validator rejects dev commands when dev mode is inactive, and logs repeated rejections for anti-cheat analysis.
- **D031 (Observability):** Command execution events (who, what, when) are telemetry events. Admin actions, dev mode usage, and Lua console invocations are all observable.
- **D033 (QoL Toggles):** Many QoL settings map directly to cvars. The QoL toggle UI and the cvar system read/write the same underlying values.
- **D034 (SQLite):** Console command history is persisted in SQLite. The cvar browser's search index uses the same FTS5 infrastructure.
- **D036 (Achievements):** The `cheats_used` flag in sim state is set when any dev command or gameplay cheat executes. Achievement checks respect this flag. Cosmetic cheats (`cosmetic_cheats_used`) do not affect achievements — only `cheats_used` does.
- **D055 (Ranked Matchmaking):** Games with `cheats_used = true` are excluded from ranked submission. The relay server verifies this flag in match certification. `cosmetic_cheats_used` alone does not affect ranked eligibility (cosmetic cheats are single-player only regardless).
- **03-NETCODE.md (In-Match Vote Framework):** The `/callvote`, `/vote`, `/poll` commands are registered in the Brigadier command tree. `/gg` and `/ff` are aliases for `/callvote surrender`. Vote commands produce `PlayerOrder::Vote` variants — processed by the sim like any other order. Tactical polls extend the chat wheel phrase system.
- **V44 (06-SECURITY.md):** `DeveloperMode` is sim state, toggled in lobby only, with unanimous consent in multiplayer. The command system enforces this — dev commands are rejected at the order validation layer, not the UI layer.

---

---

