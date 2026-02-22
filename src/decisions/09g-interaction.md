# Decision Log — In-Game Interaction

Command console, communication systems (chat, voice, pings), and tutorial/new player experience.

---

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
- **Keywords:** command console, unified chat commands, brigadier, cvars, bookmarks, speed command, mod commands, competitive integrity, mobile command UX

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
| **Unicode abuse** (oversized chars, RTL overrides, invisible chars, zalgo) | Chat input is sanitized **before** order injection: strip control characters, normalize Unicode to NFC, cap display width. Normalization happens on the sending client before the text enters `PlayerOrder::ChatMessage` — ensuring all clients receive identical normalized bytes (determinism requirement). Homoglyph detection warns admins of impersonation attempts. |
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
- **RCON protocol for remote administration** (deferred — useful for dedicated servers but out of scope for Phase 3. Can be added later as a `CommandOrigin::Rcon` variant with `Admin` permission level. The command dispatcher is origin-agnostic by design.)
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

## D059: In-Game Communication — Text Chat, Voice, Beacons, and Coordination

|                |                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**     | Accepted                                                                                                                                                                             |
| **Phase**      | Phase 3 (text chat, beacons), Phase 5 (VoIP, voice-in-replay)                                                                                                                        |
| **Depends on** | D006 (NetworkModel), D007 (Relay Server), D024 (Lua API), D033 (QoL Toggles), D054 (Transport), D058 (Chat/Command Console)                                                          |
| **Driver**     | No open-source RTS has built-in VoIP. OpenRA has no voice chat. The Remastered Collection added basic lobby voice via Steam. This is a major opportunity for IC to set the standard. |

### Problem

RTS multiplayer requires three kinds of player coordination:

1. **Text communication** — chat channels (all, team, whisper), emoji, mod-registered phrases
2. **Voice communication** — push-to-talk VoIP for real-time callouts during gameplay
3. **Spatial signaling** — beacons, pings, map markers, tactical annotations that convey *where* and *what* without words

D058 designed the text input/command system (chat box, `/` prefix routing, command dispatch). What D058 did NOT address:

- Chat **channel routing** — how messages reach the right recipients (all, team, whisper, observers)
- **VoIP architecture** — codec, transport, relay integration, bandwidth management
- **Beacons and pings** — the non-verbal coordination layer that Apex Legends proved is often more effective than voice
- **Voice-in-replay** — whether and how voice recordings are preserved for replay playback
- How all three systems integrate with the existing `MessageLane` infrastructure (`03-NETCODE.md`) and `Transport` trait (D054)

### Decision

Build a unified coordination system with three tiers: text chat channels, relay-forwarded VoIP, and a contextual ping/beacon system — plus novel coordination tools (chat wheel, minimap drawing, tactical markers). Voice is optionally recorded into replays as a separate stream with explicit consent.

**Revision note (2026-02-22):** Revised platform guidance to define mobile minimap/bookmark coexistence (minimap cluster + adjacent bookmark dock) and explicit touch interaction precedence so future mobile coordination features (pings, chat wheel, minimap drawing) do not conflict with fast camera navigation. This revision was informed by mobile RTS UX research and touch-layout requirements (see `research/mobile-rts-ux-onboarding-community-platform-analysis.md`).

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-22)
- **Phase:** Phase 3 (text chat, beacons), Phase 5 (VoIP, voice-in-replay)
- **Canonical for:** In-game communication architecture (text chat, voice, pings/beacons, tactical coordination) and integration with commands/replay/network lanes
- **Scope:** `ic-ui` chat/voice/ping UX, `ic-net` message lanes/relay forwarding, replay voice stream policy, moderation/muting, mobile coordination input behavior
- **Decision:** IC provides a unified coordination system with **text chat channels**, **relay-forwarded VoIP**, and **contextual pings/beacons/markers**, with optional voice recording in replays via explicit consent.
- **Why:** RTS coordination needs verbal, textual, and spatial communication; open-source RTS projects under-serve VoIP and modern ping tooling; IC can set a higher baseline.
- **Non-goals:** Text-only communication as the sole coordination path; separate mobile and desktop communication rules that change gameplay semantics.
- **Invariants preserved:** Communication integrates with existing order/message infrastructure; D058 remains the input/command console foundation and D012 validation remains relevant for command-side actions.
- **Defaults / UX behavior:** Text chat channels are first-class and sticky; voice is optional; advanced coordination tools (chat wheel/minimap drawing/tactical markers) layer onto the same system.
- **Mobile / accessibility impact:** Mobile minimap and bookmark dock coexist in one cluster with explicit touch precedence rules to avoid conflicts between camera navigation and communication gestures.
- **Security / Trust impact:** Moderation, muting, observer restrictions, and replay/voice consent rules are part of the core communication design.
- **Public interfaces / types / commands:** `ChatChannel`, chat message orders/routing, voice packet/lane formats, beacon/ping/tactical marker events (see body sections)
- **Affected docs:** `src/03-NETCODE.md`, `src/06-SECURITY.md`, `src/17-PLAYER-FLOW.md`, `src/decisions/09g-interaction.md` (D058/D065)
- **Revision note summary:** Added mobile minimap/bookmark cluster coexistence and touch precedence so communication gestures do not break mobile camera navigation.
- **Keywords:** chat, voip, pings, beacons, minimap drawing, communication lanes, replay voice, mobile coordination, command console integration

### 1. Text Chat — Channel Architecture

D058 defined the chat *input* system. This section defines the chat *routing* system — how messages are delivered to the correct recipients.

#### Channel Model

```rust
/// Chat channel identifiers. Sent as part of every ChatMessage order.
/// The channel determines who receives the message. Channel selection
/// is sticky — the player's last-used channel persists until changed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChatChannel {
    /// All players and observers see the message.
    All,
    /// Only players on the same team (including shared-control allies).
    Team,
    /// Private message to a specific player. Not visible to others.
    /// Observers cannot whisper to players (anti-coaching, V41).
    Whisper { target: PlayerId },
    /// Observer-only channel. Players do not see these messages.
    /// Prevents spectator coaching during live games (V41).
    Observer,
}
```

#### Chat Message Order

Chat messages flow through the order pipeline — they are `PlayerOrder` variants, validated by the sim (D012), and replayed deterministically:

```rust
/// Chat message as a player order. Part of the deterministic order stream.
/// This means chat is captured in replays and can be replayed alongside
/// gameplay — matching SC2's `replay.message.events` stream.
pub enum PlayerOrder {
    // ... existing variants ...
    ChatMessage {
        channel: ChatChannel,
        /// UTF-8 text, bounded by ProtocolLimits::max_chat_message_length (512 chars, V15).
        text: String,
    },
    /// Notification-only metadata marker: player started/stopped voice transmission.
    /// NOT the audio data itself — that flows outside the order pipeline
    /// via MessageLane::Voice (see D059 § VoIP Architecture). This order exists
    /// solely so the sim can record voice activity timestamps in the replay's
    /// analysis event stream. The sim DOES NOT process, decode, or relay any audio.
    /// "VoIP is not part of the simulation" — VoiceActivity is a timestamp marker,
    /// not audio data.
    VoiceActivity {
        active: bool,
    },
    /// Tactical ping placed on the map. Sim-side so it appears in replays.
    TacticalPing {
        ping_type: PingType,
        pos: WorldPos,
        /// Optional entity target (e.g., "attack this unit").
        target: Option<UnitTag>,
    },
    /// Chat wheel phrase selected. Sim-side for deterministic replay.
    ChatWheelPhrase {
        phrase_id: u16,
    },
    /// Minimap annotation stroke (batch of points). Sim-side for replay.
    MinimapDraw {
        points: Vec<WorldPos>,
        color: PlayerColor,
    },
}
```

**Why chat is in the order stream:** SC2 stores chat in a separate `replay.message.events` stream alongside `replay.game.events` (orders) and `replay.tracker.events` (analysis). IC follows this model — `ChatMessage` orders are part of the tick stream, meaning replays preserve the full text conversation. During replay playback, the chat overlay shows messages at the exact tick they were sent. This is essential for tournament review and community content creation.

#### Channel Routing

Chat routing is a relay server concern, not a sim concern. The relay inspects `ChatChannel` to determine forwarding:

| Channel              | Relay Forwards To                           | Replay Visibility | Notes                                            |
| -------------------- | ------------------------------------------- | ----------------- | ------------------------------------------------ |
| `All`                | All connected clients (players + observers) | Full              | Standard all-chat                                |
| `Team`               | Same-team players only                      | Full (after game) | Hidden from opponents during live game           |
| `Whisper { target }` | Target player only + sender echo            | Sender only       | Private — not in shared replay                   |
| `Observer`           | All observers only                          | Full              | Players never see observer chat during live game |

**Anti-coaching:** During a live game, observer messages are never forwarded to players. This prevents spectator coaching in competitive matches. In replay playback, all channels are visible (the information is historical).

**Chat cooldown:** Rate-limited at the relay: max 5 messages per 3 seconds per player (configurable via server cvar). Exceeding the limit queues messages with a "slow mode" indicator. This prevents chat spam without blocking legitimate rapid communication during intense moments.

#### Channel Switching

```
Enter         → Open chat in last-used channel
Shift+Enter   → Open chat in All (if last-used was Team)
Tab           → Cycle: All → Team → Observer (if spectating)
/w <name>     → Switch to whisper channel targeting <name>
/all           → Switch to All channel (D058 command)
/team          → Switch to Team channel (D058 command)  
```

The active channel is displayed as a colored prefix in the chat input: `[ALL]`, `[TEAM]`, `[WHISPER → Alice]`, `[OBS]`.

#### Emoji and Rich Text

Chat messages support a limited set of inline formatting:

- **Emoji shortcodes** — `:gg:`, `:glhf:`, `:allied:`, `:soviet:` mapped to sprite-based emoji (not Unicode — ensures consistent rendering across platforms). Custom emoji can be registered by mods via YAML.
- **Unit/building links** — `[Tank]` auto-links to the unit's encyclopedia entry (if `ic-ui` has one). Parsed client-side, not in the order stream.
- **No markdown, no HTML, no BBCode.** Chat is plain text with emoji shortcodes. This eliminates an entire class of injection attacks and keeps the parser trivial.

### 2. Voice-over-IP — Architecture

No open-source RTS engine has built-in VoIP. OpenRA relies on Discord/TeamSpeak. The Remastered Collection added lobby voice via Steam's API (Steamworks `ISteamNetworkingMessages`). IC's VoIP is engine-native — no external service dependency.

#### Design Principles

1. **VoIP is NOT part of the simulation.** Voice data never enters `ic-sim`. It is pure I/O — captured, encoded, transmitted, decoded, and played back entirely in `ic-net` and `ic-audio`. The sim is unaware that voice exists (Invariant #1: simulation is pure and deterministic).

2. **Voice flows through the relay.** Not P2P. This maintains D007's architecture: the relay prevents IP exposure, provides consistent routing, and enables server-side mute enforcement. P2P voice would leak player IP addresses — a known harassment vector in competitive games.

3. **Push-to-talk is the default.** Voice activation detection (VAD) is available as an option but not default. PTT prevents accidental transmission of background noise, private conversations, and keyboard/mouse sounds — problems that plague open-mic games.

4. **Voice is best-effort.** Lost voice packets are not retransmitted. Human hearing tolerates ~5% packet loss with Opus's built-in PLC (packet loss concealment). Retransmitting stale voice data adds latency without improving quality.

5. **Voice never delays gameplay.** The `MessageLane::Voice` lane has lower priority than `Orders` and `Control` — voice packets are dropped before order packets under bandwidth pressure.

6. **End-to-end latency target: <150ms.** Mouth-to-ear latency must stay under 150ms for natural conversation. Budget: capture buffer ~5ms + encode ~2ms + network RTT/2 (typically 30-80ms) + jitter buffer (20-60ms) + decode ~1ms + playback buffer ~5ms = 63-153ms. CS2 and Valorant achieve ~100-150ms. Mumble achieves ~50-80ms on LAN, ~100-150ms on WAN. At >200ms, conversation becomes turn-taking rather than natural overlap — unacceptable for real-time RTS callouts. The adaptive jitter buffer (see below) is the primary latency knob: on good networks it stays at 1 frame (20ms); on poor networks it expands up to 10 frames (200ms) as a tradeoff. Monitoring this budget is exposed via `VoiceDiagnostics` (see UI Indicators).

#### Codec: Opus

**Opus** (RFC 6716) is the only viable choice. It is:
- Royalty-free and open-source (BSD license)
- The standard game voice codec (used by Discord, Steam, ioquake3, Mumble, WebRTC)
- Excellent at low bitrates (usable at 6 kbps, good at 16 kbps, transparent at 32 kbps)
- Built-in forward error correction (FEC) and packet loss concealment (PLC)
- Native Rust bindings available via `audiopus` crate (safe wrapper around libopus)

**Encoding parameters:**

| Parameter              | Default  | Range         | Notes                                                                     |
| ---------------------- | -------- | ------------- | ------------------------------------------------------------------------- |
| Sample rate            | 48 kHz   | Fixed         | Opus native rate; input is resampled if needed                            |
| Channels               | 1 (mono) | Fixed         | Voice chat is mono; stereo is wasted bandwidth                            |
| Frame size             | 20 ms    | 10, 20, 40 ms | 20 ms is the standard balance of latency vs. overhead                     |
| Bitrate                | 32 kbps  | 8–64 kbps     | Adaptive (see below). 32 kbps matches Discord/Mumble quality expectations |
| Application mode       | `VOIP`   | Fixed         | Opus `OPUS_APPLICATION_VOIP` — optimized for speech, enables DTX          |
| Complexity             | 7        | 0–10          | Mumble uses 10, Discord similar; 7 is quality/CPU sweet spot              |
| DTX (Discontinuous Tx) | Enabled  | On/Off        | Stops transmitting during silence — major bandwidth savings               |
| In-band FEC            | Enabled  | On/Off        | Encodes lower-bitrate redundancy of previous frame — helps packet loss    |
| Packet loss percentage | Dynamic  | 0–100         | Fed from `VoiceBitrateAdapter.loss_ratio` — adapts FEC to actual loss     |

**Bandwidth budget per player:**

| Bitrate | Opus payload/frame (20ms) | + overhead (per packet) | Per second | Quality      |
| ------- | ------------------------- | ----------------------- | ---------- | ------------ |
| 8 kbps  | 20 bytes                  | ~48 bytes               | ~2.4 KB/s  | Intelligible |
| 16 kbps | 40 bytes                  | ~68 bytes               | ~3.4 KB/s  | Good         |
| 24 kbps | 60 bytes                  | ~88 bytes               | ~4.4 KB/s  | Very good    |
| 32 kbps | 80 bytes                  | ~108 bytes              | ~5.4 KB/s  | **Default**  |
| 64 kbps | 160 bytes                 | ~188 bytes              | ~9.4 KB/s  | Music-grade  |

Overhead = 28 bytes UDP/IP + lane header. With DTX enabled, actual bandwidth is ~60% of these figures (voice is ~60% activity, ~40% silence in typical conversation). An 8-player game where 2 players speak simultaneously at the default 32 kbps uses 2 × 5.4 KB/s = ~10.8 KB/s inbound — negligible compared to the order stream.

#### Adaptive Bitrate

The relay monitors per-connection bandwidth using the same ack vector RTT measurements used for order delivery (`03-NETCODE.md` § Per-Ack RTT Measurement). When bandwidth is constrained:

```rust
/// Voice bitrate adaptation based on available bandwidth.
/// Runs on the sending client. The relay reports congestion via
/// a VoiceBitrateHint control message (not an order — control lane).
pub struct VoiceBitrateAdapter {
    /// Current target bitrate (Opus encoder parameter).
    pub current_bitrate: u32,
    /// Minimum acceptable bitrate. Below this, voice is suspended
    /// with a "low bandwidth" indicator to the UI.
    pub min_bitrate: u32,       // default: 8_000
    /// Maximum bitrate when bandwidth is plentiful.
    pub max_bitrate: u32,       // default: 32_000
    /// Smoothed trip time from ack vectors (updated every packet).
    pub srtt_us: u64,
    /// Packet loss ratio (0.0–1.0) from ack vector analysis.
    pub loss_ratio: f32,        // f32 OK — this is I/O, not sim
}

impl VoiceBitrateAdapter {
    /// Called each frame. Returns the bitrate to configure on the encoder.
    /// Also updates Opus's OPUS_SET_PACKET_LOSS_PERC hint dynamically
    /// (learned from Mumble/Discord — static loss hints under-optimize FEC).
    pub fn adapt(&mut self) -> u32 {
        if self.loss_ratio > 0.15 {
            // Heavy loss: drop to minimum, prioritize intelligibility
            self.current_bitrate = self.min_bitrate;
        } else if self.loss_ratio > 0.05 {
            // Moderate loss: reduce by 25%
            self.current_bitrate = (self.current_bitrate * 3 / 4).max(self.min_bitrate);
        } else if self.srtt_us < 100_000 {
            // Low latency, low loss: increase toward max
            self.current_bitrate = (self.current_bitrate * 5 / 4).min(self.max_bitrate);
        }
        self.current_bitrate
    }

    /// Returns the packet loss percentage hint for OPUS_SET_PACKET_LOSS_PERC.
    /// Dynamic: fed from observed loss_ratio rather than a static 10% default.
    /// At higher loss hints, Opus allocates more bits to in-band FEC.
    pub fn opus_loss_hint(&self) -> i32 {
        // Quantize to 0, 5, 10, 15, 20, 25 — Opus doesn't need fine granularity
        ((self.loss_ratio * 100.0) as i32 / 5 * 5).clamp(0, 25)
    }
}
```

#### Message Lane: Voice

Voice traffic uses a new `MessageLane::Voice` lane, positioned between `Chat` and `Bulk`:

```rust
pub enum MessageLane {
    Orders = 0,
    Control = 1,
    Chat = 2,
    Voice = 3,    // NEW — voice frames
    Bulk = 4,     // was 3, renumbered
}
```

| Lane      | Priority | Weight | Buffer | Reliability | Rationale                                                     |
| --------- | -------- | ------ | ------ | ----------- | ------------------------------------------------------------- |
| `Orders`  | 0        | 1      | 4 KB   | Reliable    | Orders must arrive; missed = Idle (deadline is the cap)       |
| `Control` | 0        | 1      | 2 KB   | Unreliable  | Latest sync hash wins; stale hashes are useless               |
| `Chat`    | 1        | 1      | 8 KB   | Reliable    | Chat messages should arrive but can wait                      |
| `Voice`   | 1        | 2      | 16 KB  | Unreliable  | Real-time voice; dropped frames use Opus PLC (not retransmit) |
| `Bulk`    | 2        | 1      | 64 KB  | Unreliable  | Telemetry/observer data uses spare bandwidth                  |

**Voice and Chat share priority tier 1** with a 2:1 weight ratio — voice gets twice the bandwidth share because it's time-sensitive. Under bandwidth pressure, Orders and Control are served first (tier 0), then Voice and Chat split the remainder (tier 1, 67%/33%), then Bulk gets whatever is left (tier 2). This ensures voice never delays order delivery, but voice frames are prioritized over chat messages within the non-critical tier.

**Buffer limit:** 16 KB allows ~73ms of buffered voice at the default 32 kbps (~148 frames at 108 bytes each). If the buffer fills (severe congestion), the oldest voice frames are dropped — this is correct behavior for real-time audio (stale audio is worse than silence).

#### Voice Packet Format

```rust
/// Voice data packet. Travels on MessageLane::Voice.
/// NOT a PlayerOrder — voice never enters the sim.
/// Encoded in the lane's framing, not the order TLV format.
pub struct VoicePacket {
    /// Which player is speaking. Set by relay (not client) to prevent spoofing.
    pub speaker: PlayerId,
    /// Monotonically increasing sequence number for ordering + loss detection.
    pub sequence: u32,
    /// Opus frame count in this packet (typically 1, max 3 for 60ms bundling).
    pub frame_count: u8,
    /// Voice routing target. The relay uses this to determine forwarding.
    pub target: VoiceTarget,
    /// Flags: SPATIAL (positional audio hint), FEC (frame contains FEC data).
    pub flags: VoiceFlags,
    /// Opus-encoded audio payload. Size determined by bitrate and frame_count.
    pub data: Vec<u8>,
}

/// Who should hear this voice transmission.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoiceTarget {
    /// All players and observers hear the transmission.
    All,
    /// Only same-team players.
    Team,
    /// Specific player (private voice — rare, but useful for coaching/tutoring).
    Player(PlayerId),
}

bitflags! {
    pub struct VoiceFlags: u8 {
        /// Positional audio hint — the listener should spatialize this
        /// voice based on the speaker's camera position or selected units.
        /// Opt-in via D033 QoL toggle. Disabled by default.
        const SPATIAL = 0x01;
        /// This packet contains Opus in-band FEC data for the previous frame.
        const FEC     = 0x02;
    }
}
```

**Speaker ID is relay-assigned.** The client sends voice data; the relay stamps `speaker` before forwarding. This prevents voice spoofing — a client cannot impersonate another player's voice. Same pattern as ioquake3's server-side VoIP relay (where `sv_client.c` stamps the client number on forwarded voice packets).

#### Relay Voice Forwarding

The relay server forwards voice packets with minimal processing:

```rust
/// Relay-side voice forwarding. Per-client, per-tick.
/// The relay does NOT decode Opus — it forwards opaque bytes.
/// This keeps relay CPU cost near zero for voice.
impl RelaySession {
    fn forward_voice(&mut self, from: PlayerId, packet: &VoicePacket) {
        // 1. Validate: is this player allowed to speak? (not muted, not observer in competitive)
        if self.is_muted(from) { return; }

        // 2. Rate limit: max voice_packets_per_second per player (default 50 = 1 per 20ms)
        if !self.voice_rate_limiter.check(from) { return; }

        // 3. Stamp speaker ID (overwrite whatever the client sent)
        let mut forwarded = packet.clone();
        forwarded.speaker = from;

        // 4. Route based on VoiceTarget
        match packet.target {
            VoiceTarget::All => {
                for client in &self.clients {
                    if client.id != from && !client.has_muted(from) {
                        client.send_voice(&forwarded);
                    }
                }
            }
            VoiceTarget::Team => {
                for client in &self.clients {
                    if client.id != from
                        && client.team == self.clients[from].team
                        && !client.has_muted(from)
                    {
                        client.send_voice(&forwarded);
                    }
                }
            }
            VoiceTarget::Player(target) => {
                if let Some(client) = self.clients.get(target) {
                    if !client.has_muted(from) {
                        client.send_voice(&forwarded);
                    }
                }
            }
        }
    }
}
```

**Relay bandwidth cost:** The relay is a packet reflector for voice — it copies bytes without decoding. For an 8-player game where 2 players speak simultaneously at the default 32 kbps, the relay transmits: 2 speakers × 7 recipients × 5.4 KB/s = ~75.6 KB/s outbound. This is negligible for a server. The relay already handles order forwarding; voice adds proportionally small overhead.

#### Spatial Audio (Optional)

Inspired by ioquake3's `VOIP_SPATIAL` flag and Mumble's positional audio plugin:

When `VoiceFlags::SPATIAL` is set, the receiving client spatializes the voice based on the speaker's in-game position. The speaker's position is derived from their primary selection or camera center — NOT transmitted in the voice packet (that would leak tactical information). The receiver's client already knows all unit positions (lockstep sim), so it can compute relative direction and distance locally.

**Spatial audio is a D033 QoL toggle** (`voice.spatial_audio: bool`, default `false`). When enabled, teammates' voice is panned left/right based on where their units are on the map. This creates a natural "war room" effect — you hear your ally to your left when their base is left of yours.

**Why disabled by default:** Spatial voice is disorienting if unexpected. Players accustomed to centered voice chat need to opt in. Additionally, it only makes sense in team games with distinct player positions — 1v1 games get no benefit.

#### Browser (WASM) VoIP

Native desktop clients use raw Opus-over-UDP through the `UdpTransport` (D054). Browser clients cannot use raw UDP — they use WebRTC for voice transport.

**str0m** (github.com/algesten/str0m) is the recommended Rust WebRTC library:
- Pure Rust, Sans I/O (no internal threads — matches IC's architecture)
- Frame-level and RTP-level APIs
- Multiple crypto backends (aws-lc-rs, ring, OpenSSL, platform-native)
- Bandwidth estimation (BWE), NACK, Simulcast support
- `&mut self` pattern — no internal mutexes
- 515+ stars, 43+ contributors, 602 dependents

For browser builds, VoIP uses str0m's WebRTC data channels routed through the relay. The relay bridges WebRTC ↔ raw UDP voice packets, enabling cross-platform voice between native and browser clients. The Opus payload is identical — only the transport framing differs.

```rust
/// VoIP transport selection — the INITIAL transport chosen per platform.
/// This is a static selection at connection time (platform-dependent).
/// Runtime transport adaptation (e.g., UDP→TCP fallback) is handled by
/// VoiceTransportState (see § "Connection Recovery" below), which is a
/// separate state machine that manages degraded-mode transitions without
/// changing the VoiceTransport enum.
pub enum VoiceTransport {
    /// Raw Opus frames on MessageLane::Voice over UdpTransport.
    /// Desktop default. Lowest latency, lowest overhead.
    Native,
    /// Opus frames via WebRTC data channel (str0m).
    /// Browser builds. Higher overhead but compatible with browser APIs.
    WebRtc,
}
```

#### Muting and Moderation

Per-player mute is client-side AND relay-enforced:

| Action              | Scope       | Mechanism                                                                |
| ------------------- | ----------- | ------------------------------------------------------------------------ |
| **Player mutes**    | Client-side | Receiver ignores voice from muted player. Also sends mute hint to relay. |
| **Relay mute hint** | Server-side | Relay skips forwarding to the muting player — saves bandwidth.           |
| **Admin mute**      | Server-side | Relay drops all voice from the muted player. Cannot be overridden.       |
| **Self-mute**       | Client-side | PTT disabled, mic input stopped. "Muted" icon shown to other players.    |
| **Self-deafen**     | Client-side | All incoming voice silenced. "Deafened" icon shown.                      |

**Mute persistence:** Per-player mute decisions are stored in local SQLite (D034) keyed by the player's Ed25519 public key (D052). Muting "Bob" in one game persists across future games with the same player. The relay does not store mute relationships — mute is a client preference, communicated to the relay as a routing hint.

**Hotmic protection:** If PTT is held continuously for longer than `voice.max_ptt_duration` (default 120 seconds, configurable), transmission is automatically cut and the player sees a "PTT timeout — release and re-press to continue" notification. This prevents stuck-key scenarios where a player unknowingly broadcasts for an entire match (keyboard malfunction, key binding conflict, cat on keyboard). Discord implements similar detection; CS2 cuts after ~60 seconds continuous transmission. The timeout resets immediately on key release — there is no cooldown.

**Communication abuse penalties:** Repeated mute/report actions against a player across multiple games trigger **progressive communication restrictions** on that player's community profile (D052/D053). The community server (D052) tracks reports per player:

| Threshold            | Penalty                                                    | Duration       | Scope                |
| -------------------- | ---------------------------------------------------------- | -------------- | -------------------- |
| 3 reports in 24h     | Warning displayed to player                                | Immediate      | Informational only   |
| 5 reports in 72h     | Voice-restricted: team-only voice, no all-chat voice       | 24 hours       | Per community server |
| 10 reports in 7 days | Voice-muted: cannot transmit voice                         | 72 hours       | Per community server |
| Repeated offenses    | Escalated to community moderators (D037) for manual review | Until resolved | Per community server |

Thresholds are configurable per community server — tournament communities may be stricter. Penalties are community-scoped (D052 federation), not global. A player comm-banned on one community can still speak on others. Text chat follows the same escalation path. False report abuse is itself a reportable offense.

#### Jitter Buffer

Voice packets arrive with variable delay (network jitter). Without a jitter buffer, packets arriving late cause audio stuttering and packets arriving out-of-order cause gaps. Every production VoIP system uses a jitter buffer — Mumble, Discord, TeamSpeak, and WebRTC all implement one. D059 requires an **adaptive jitter buffer** per-speaker in `ic-audio`.

**Design rationale:** A fixed jitter buffer (constant delay) wastes latency on good networks and is insufficient on bad networks. An adaptive buffer dynamically adjusts delay based on observed inter-arrival jitter — expanding when jitter increases (prevents drops) and shrinking when jitter decreases (minimizes latency). This is the universal approach in production VoIP systems (see `research/open-source-voip-analysis.md` § 6).

```rust
/// Adaptive jitter buffer for voice playback.
/// Smooths variable packet arrival times into consistent playback.
/// One instance per speaker, managed by ic-audio.
///
/// Design informed by Mumble's audio pipeline and WebRTC's NetEq.
/// Mumble uses a similar approach with its Resynchronizer for echo
/// cancellation timing — IC generalizes this to all voice playback.
pub struct JitterBuffer {
    /// Ring buffer of received voice frames, indexed by sequence number.
    /// None entries represent lost or not-yet-arrived packets.
    frames: VecDeque<Option<VoiceFrame>>,
    /// Current playback delay in 20ms frame units.
    /// E.g., delay=3 means 60ms of buffered audio before playback starts.
    delay: u32,
    /// Minimum delay (frames). Default: 1 (20ms).
    min_delay: u32,
    /// Maximum delay (frames). Default: 10 (200ms).
    /// Above 200ms, voice feels too delayed for real-time conversation.
    max_delay: u32,
    /// Exponentially weighted moving average of inter-arrival jitter.
    jitter_estimate: f32,   // f32 OK — this is I/O, not sim
    /// Timestamp of last received frame for jitter calculation.
    last_arrival: Instant,
    /// Statistics: total frames received, lost, late, buffer expansions/contractions.
    stats: JitterStats,
}

impl JitterBuffer {
    /// Called when a voice packet arrives from the network.
    pub fn push(&mut self, sequence: u32, opus_data: &[u8], now: Instant) {
        // Update jitter estimate using EWMA
        let arrival_delta = now - self.last_arrival;
        let expected_delta = Duration::from_millis(20); // one frame period
        let jitter = (arrival_delta.as_secs_f32() - expected_delta.as_secs_f32()).abs();
        // Smoothing factor 0.9 — reacts within ~10 packets to jitter changes
        self.jitter_estimate = 0.9 * self.jitter_estimate + 0.1 * jitter;
        self.last_arrival = now;
        
        // Insert frame at correct position based on sequence number.
        // Handles out-of-order delivery by placing in the correct slot.
        self.insert_frame(sequence, opus_data);
        
        // Adapt buffer depth based on current jitter estimate
        self.adapt_delay();
    }
    
    /// Called every 20ms by the audio render thread.
    /// Returns the next frame to play, or None if the frame is missing.
    /// On None, the caller invokes Opus PLC (decoder with null input)
    /// to generate concealment audio from the previous frame's spectral envelope.
    pub fn pop(&mut self) -> Option<VoiceFrame> {
        self.frames.pop_front().flatten()
    }
    
    fn adapt_delay(&mut self) {
        // Target: 2× jitter estimate + 1 frame covers ~95% of variance
        let target = ((2.0 * self.jitter_estimate * 50.0) as u32 + 1)
            .clamp(self.min_delay, self.max_delay);
        
        if target > self.delay {
            // Increase delay: expand buffer immediately (insert silence frame)
            self.delay += 1;
        } else if target + 2 < self.delay {
            // Decrease delay: only when significantly over-buffered
            // Hysteresis of 2 frames prevents oscillation on borderline networks
            self.delay -= 1;
        }
    }
}
```

**Packet Loss Concealment (PLC) integration:** When `pop()` returns `None` (missing frame due to packet loss), the Opus decoder is called with null input (`opus_decode(null, 0, ...)`) to generate PLC audio. Opus's built-in PLC extrapolates from the previous frame's spectral envelope, producing a smooth fade-out over 3-5 lost frames. At 5% packet loss, PLC is barely audible. At 15% loss, artifacts become noticeable — this is where the `VoiceBitrateAdapter` reduces bitrate and increases FEC allocation. Combined with dynamic `OPUS_SET_PACKET_LOSS_PERC` (see Adaptive Bitrate above), the encoder and decoder cooperate: the encoder allocates more bits to FEC when loss is high, and the decoder conceals any remaining gaps.

#### UDP Connectivity Checks and TCP Tunnel Fallback

Learned from Mumble's protocol (see `research/open-source-voip-analysis.md` § 7): some networks block or heavily throttle UDP (corporate firewalls, restrictive NATs, aggressive ISP rate limiting). D059 must not assume voice always uses UDP.

Mumble solves this with a graceful fallback: the client sends periodic UDP ping packets; if responses stop, voice is tunneled through the TCP control connection transparently. IC adopts this pattern:

```rust
/// Voice transport state machine. Manages UDP/TCP fallback for voice.
/// Runs on each client independently. The relay accepts voice from
/// either transport — it doesn't care how the bytes arrived.
pub enum VoiceTransportState {
    /// UDP voice active. UDP pings succeeding.
    /// Default state when connection is established.
    UdpActive,
    /// UDP pings failing. Testing connectivity.
    /// Voice is tunneled through TCP/WebSocket during this state.
    /// UDP pings continue in background to detect recovery.
    UdpProbing {
        last_ping: Instant,
        consecutive_failures: u8,  // switch to TcpTunnel after 5 failures
    },
    /// UDP confirmed unavailable. Voice fully tunneled through TCP.
    /// Higher latency (~20-50ms from TCP queuing) but maintains connectivity.
    /// UDP pings continue every 5 seconds to detect recovery.
    TcpTunnel,
    /// UDP restored after tunnel period. Transitioning back.
    /// Requires 3 consecutive successful UDP pings before switching.
    UdpRestoring { consecutive_successes: u8 },
}
```

**How TCP tunneling works:** Voice frames use the same `VoicePacket` binary format regardless of transport. When tunneled through TCP, voice packets are sent as a distinct message type on the existing control connection — the relay identifies the message type and forwards the voice payload normally. The relay doesn't care whether voice arrived via UDP or TCP; it stamps the speaker ID and forwards to recipients.

**UI indicator:** A small icon in the voice overlay shows the transport state — "Direct" (UDP, normal) or "Tunneled" (TCP, yellow warning icon). Tunneled voice has ~20-50ms additional latency from TCP head-of-line blocking but is preferable to no voice at all.

**Implementation phasing note (from Mumble documentation):** "When implementing the protocol it is easier to ignore the UDP transfer layer at first and just tunnel the UDP data through the TCP tunnel. The TCP layer must be implemented for authentication in any case." This matches IC's phased approach — TCP-tunneled voice can ship in Phase 3 (alongside text chat), with UDP voice optimization in Phase 5.

#### Audio Preprocessing Pipeline

The audio capture-to-encode pipeline in `ic-audio`. Order matters — this sequence is the standard across Mumble, Discord, WebRTC, and every production VoIP system (see `research/open-source-voip-analysis.md` § 8):

```
Platform Capture (cpal) → Resample to 48kHz (rubato) →
  Echo Cancellation (optional, speaker users only) →
    Noise Suppression (nnnoiseless / RNNoise) →
      Voice Activity Detection (for VAD mode) →
        Opus Encode (audiopus, VOIP mode, FEC, DTX) →
          VoicePacket → MessageLane::Voice
```

**Recommended Rust crates for the pipeline:**

| Component         | Crate                                          | Notes                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio I/O         | `cpal`                                         | Cross-platform (WASAPI, CoreAudio, ALSA/PulseAudio, WASM AudioWorklet). Already used by Bevy's audio ecosystem.                                                                                                                       |
| Resampler         | `rubato`                                       | Pure Rust, high quality async resampler. No C dependencies. Converts from mic sample rate to Opus's 48kHz.                                                                                                                            |
| Noise suppression | `nnnoiseless`                                  | Pure Rust port of Mozilla's RNNoise. ML-based (GRU neural network). Dramatically better than DSP-based Speex preprocessing for non-stationary noise (keyboard clicks, fans, traffic). ~0.3% CPU cost per core — negligible.           |
| Opus codec        | `audiopus`                                     | Safe Rust wrapper around libopus. Required. Handles encode/decode/PLC.                                                                                                                                                                |
| Echo cancellation | Speex AEC via `speexdsp-rs`, or browser-native | Full AEC only matters for speaker/laptop users (not headset). Mumble's `Resynchronizer` shows this requires a ~20ms mic delay queue to ensure speaker data reaches the canceller first. Browser builds can use WebRTC's built-in AEC. |

**Why RNNoise (`nnnoiseless`) over Speex preprocessing:** Mumble supports both. RNNoise is categorically superior — it uses a recurrent neural network trained on 80+ hours of noise samples, whereas Speex uses traditional FFT-based spectral subtraction. RNNoise handles non-stationary noise (typing, mouse clicks — common in RTS gameplay) far better than Speex. The `nnnoiseless` crate is pure Rust (no C dependency), adding ~0.3% CPU per core versus Speex's ~0.1%. This is negligible on any hardware that can run IC. Noise suppression is a D033 QoL toggle (`voice.noise_suppression: bool`, default `true`).

**Playback pipeline (receive side):**

```
MessageLane::Voice → VoicePacket → JitterBuffer →
  Opus Decode (or PLC on missing frame) →
    Per-speaker gain (user volume setting) →
      Voice Effects Chain (if enabled — see below) →
        Spatial panning (if VoiceFlags::SPATIAL) →
          Mix with game audio → Platform Output (cpal/Bevy audio)
```

#### Voice Effects & Enhancement

Voice effects apply DSP processing to incoming voice on the **receiver side** — after Opus decode, before spatial panning and mixing. This is a deliberate architectural choice:

- **Receiver controls their experience.** Alice hears radio-filtered voice; Bob hears clean audio. Neither imposes on the other.
- **Clean audio preserved.** The Opus-encoded stream in replays (voice-in-replay, D059 § 7) is unprocessed. Effects can be re-applied during replay playback with different presets — a caster might use clean voice while a viewer uses radio flavor.
- **No codec penalty.** Applying effects before Opus encoding wastes bits encoding the effect rather than the voice. Receiver-side effects are "free" from a compression perspective.
- **Per-speaker effects.** A player can assign different effects to different teammates (e.g., radio filter on ally A, clean for ally B) via per-speaker settings.

##### DSP Chain Architecture

Each voice effect preset is a composable chain of lightweight DSP stages:

```rust
/// A single DSP processing stage. Implementations are stateful
/// (filters maintain internal buffers) but cheap — a biquad filter
/// processes 960 samples (20ms at 48kHz) in <5 microseconds.
pub trait VoiceEffectStage: Send + 'static {
    /// Process samples in-place. Called on the audio thread.
    /// `sample_rate` is always 48000 (Opus output).
    fn process(&mut self, samples: &mut [f32], sample_rate: u32);

    /// Reset internal state. Called when a speaker stops and restarts
    /// (avoids filter ringing from stale state across transmissions).
    fn reset(&mut self);

    /// Human-readable name for diagnostics.
    fn name(&self) -> &str;
}

/// A complete voice effect preset — an ordered chain of DSP stages
/// plus optional transmission envelope effects (squelch tones).
pub struct VoiceEffectChain {
    pub stages: Vec<Box<dyn VoiceEffectStage>>,
    pub squelch: Option<SquelchConfig>,
    pub metadata: EffectMetadata,
}

/// Squelch tones — short audio cues on transmission start/end.
/// Classic military radio has a distinctive "roger beep."
pub struct SquelchConfig {
    pub start_tone_hz: u32,       // e.g., 1200 Hz
    pub end_tone_hz: u32,         // e.g., 800 Hz
    pub duration_ms: u32,         // e.g., 60ms
    pub volume: f32,              // 0.0-1.0, relative to voice
}

pub struct EffectMetadata {
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,         // semver
    pub tags: Vec<String>,
}
```

**Built-in DSP stages** (implemented in `ic-audio`, no external crate dependencies beyond `std` math):

| Stage             | Parameters                                              | Use                                                                      | CPU Cost (960 samples) |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `BiquadFilter`    | `mode` (LP/HP/BP/notch/shelf), `freq_hz`, `q`, `gain`   | Band-pass for radio; high-shelf for presence; low-cut for clarity        | ~3 μs                  |
| `Compressor`      | `threshold_db`, `ratio`, `attack_ms`, `release_ms`      | Even out loud/quiet speakers; radio dynamic range control                | ~5 μs                  |
| `SoftClipDistort` | `drive` (0.0-1.0), `mode` (soft_clip / tube / foldback) | Subtle harmonic warmth for vintage radio; tube saturation                | ~2 μs                  |
| `NoiseGate`       | `threshold_db`, `attack_ms`, `release_ms`, `hold_ms`    | Radio squelch — silence below threshold; clean up mic bleed              | ~3 μs                  |
| `NoiseLayer`      | `type` (static / crackle / hiss), `level_db`, `seed`    | Atmospheric static for radio presets; deterministic seed for consistency | ~4 μs                  |
| `SimpleReverb`    | `decay_ms`, `mix` (0.0-1.0), `pre_delay_ms`             | Room/bunker ambiance; short decay for command post feel                  | ~8 μs                  |
| `DeEsser`         | `frequency_hz`, `threshold_db`, `ratio`                 | Sibilance reduction; tames harsh microphones                             | ~5 μs                  |
| `GainStage`       | `gain_db`                                               | Level adjustment between stages; makeup gain after compression           | ~1 μs                  |
| `FrequencyShift`  | `shift_hz`, `mix` (0.0-1.0)                             | Subtle pitch shift for scrambled/encrypted effect                        | ~6 μs                  |

**CPU budget:** A 6-stage chain (typical for radio presets) costs ~25 μs per speaker per 20ms frame. With 8 simultaneous speakers, that's 200 μs — well under 5% of the audio thread's budget. Even aggressive 10-stage custom chains remain negligible.

**Why no external DSP crate:** Audio DSP filter implementations are straightforward (a biquad is ~10 lines of Rust). External crates like `fundsp` or `dasp` are excellent for complex synthesis but add dependency weight for operations that IC needs in their simplest form. The built-in stages above total ~500 lines of Rust. If future effects need convolution reverb or FFT-based processing, `fundsp` becomes a justified dependency — but the Phase 3 built-in presets don't require it.

##### Built-in Presets

Six presets ship with IC, spanning practical enhancement to thematic immersion. All are defined in YAML — the same format modders use for custom presets.

**1. Clean Enhanced** — *Practical voice clarity without character effects.*

Noise gate removes mic bleed, gentle compression evens volume differences between speakers, de-esser tames harsh sibilance, and a subtle high-shelf adds presence. Recommended for competitive play where voice clarity matters more than atmosphere.

```yaml
name: "Clean Enhanced"
description: "Improved voice clarity — compression, de-essing, noise gate"
tags: ["clean", "competitive", "clarity"]
chain:
  - type: noise_gate
    threshold_db: -42
    attack_ms: 1
    release_ms: 80
    hold_ms: 50
  - type: compressor
    threshold_db: -22
    ratio: 3.0
    attack_ms: 8
    release_ms: 60
  - type: de_esser
    frequency_hz: 6500
    threshold_db: -15
    ratio: 4.0
  - type: biquad_filter
    mode: high_shelf
    freq_hz: 3000
    q: 0.7
    gain_db: 2.0
```

**2. Military Radio** — *NATO-standard HF radio. The signature IC effect.*

Tight band-pass (300 Hz–3.4 kHz) matches real HF radio bandwidth. Compression squashes dynamic range like AGC circuitry. Subtle soft-clip distortion adds harmonic warmth. Noise gate creates a squelch effect. A faint static layer completes the illusion. Squelch tones mark transmission start/end — the distinctive "roger beep" of military comms.

```yaml
name: "Military Radio"
description: "NATO HF radio — tight bandwidth, squelch, static crackle"
tags: ["radio", "military", "immersive", "cold-war"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 300
    q: 0.7
  - type: biquad_filter
    mode: low_pass
    freq_hz: 3400
    q: 0.7
  - type: compressor
    threshold_db: -18
    ratio: 6.0
    attack_ms: 3
    release_ms: 40
  - type: soft_clip_distortion
    drive: 0.12
    mode: tube
  - type: noise_gate
    threshold_db: -38
    attack_ms: 1
    release_ms: 100
    hold_ms: 30
  - type: noise_layer
    type: static_crackle
    level_db: -32
squelch:
  start_tone_hz: 1200
  end_tone_hz: 800
  duration_ms: 60
  volume: 0.25
```

**3. Field Radio** — *Forward observer radio with environmental interference.*

Wider band-pass than Military Radio (less "studio," more "field"). Heavier static and occasional signal drift (subtle frequency wobble). No squelch tones — field conditions are rougher. The effect intensifies when `ConnectionQuality.quality_tier` drops (more static at lower quality) — adaptive degradation as a feature, not a bug.

```yaml
name: "Field Radio"
description: "Frontline field radio — static interference, signal drift"
tags: ["radio", "military", "atmospheric", "cold-war"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 250
    q: 0.5
  - type: biquad_filter
    mode: low_pass
    freq_hz: 3800
    q: 0.5
  - type: compressor
    threshold_db: -20
    ratio: 4.0
    attack_ms: 5
    release_ms: 50
  - type: soft_clip_distortion
    drive: 0.20
    mode: soft_clip
  - type: noise_layer
    type: static_crackle
    level_db: -26
  - type: frequency_shift
    shift_hz: 0.3
    mix: 0.05
```

**4. Command Post** — *Bunker-filtered comms with short reverb.*

Short reverb (~180ms decay) creates the acoustic signature of a concrete command bunker. Slight band-pass and compression. No static — the command post has clean equipment. This is the "mission briefing room" voice.

```yaml
name: "Command Post"
description: "Concrete bunker comms — short reverb, clean equipment"
tags: ["bunker", "military", "reverb", "cold-war"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 200
    q: 0.7
  - type: biquad_filter
    mode: low_pass
    freq_hz: 5000
    q: 0.7
  - type: compressor
    threshold_db: -20
    ratio: 3.5
    attack_ms: 5
    release_ms: 50
  - type: simple_reverb
    decay_ms: 180
    mix: 0.20
    pre_delay_ms: 8
```

**5. SIGINT Intercept** — *Encrypted comms being decoded. For fun.*

Frequency shifting, periodic glitch artifacts, and heavy processing create the effect of intercepted encrypted communications being partially decoded. Not practical for serious play — this is the "I'm playing a spy" preset.

```yaml
name: "SIGINT Intercept"
description: "Intercepted encrypted communications — partial decode artifacts"
tags: ["scrambled", "spy", "fun", "cold-war"]
chain:
  - type: biquad_filter
    mode: band_pass
    freq_hz: 1500
    q: 2.0
  - type: frequency_shift
    shift_hz: 3.0
    mix: 0.15
  - type: soft_clip_distortion
    drive: 0.30
    mode: foldback
  - type: compressor
    threshold_db: -15
    ratio: 8.0
    attack_ms: 1
    release_ms: 30
  - type: noise_layer
    type: hiss
    level_db: -28
```

**6. Vintage Valve** — *1940s vacuum tube radio warmth.*

Warm tube saturation, narrower bandwidth than HF radio, gentle compression. Evokes WW2-era communications equipment. Pairs well with Tiberian Dawn's earlier-era aesthetic.

```yaml
name: "Vintage Valve"
description: "Vacuum tube radio — warm saturation, WW2-era bandwidth"
tags: ["radio", "vintage", "warm", "retro"]
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 350
    q: 0.5
  - type: biquad_filter
    mode: low_pass
    freq_hz: 2800
    q: 0.5
  - type: soft_clip_distortion
    drive: 0.25
    mode: tube
  - type: compressor
    threshold_db: -22
    ratio: 3.0
    attack_ms: 10
    release_ms: 80
  - type: gain_stage
    gain_db: -2.0
  - type: noise_layer
    type: hiss
    level_db: -30
squelch:
  start_tone_hz: 1000
  end_tone_hz: 600
  duration_ms: 80
  volume: 0.20
```

##### Enhanced Voice Isolation (Background Voice Removal)

The user's request for "getting rid of background voices" is addressed at two levels:

1. **Sender-side (existing):** `nnnoiseless` (RNNoise) already handles this on the capture side. RNNoise's GRU neural network is trained specifically to isolate a primary speaker from background noise — including other voices. It performs well against TV audio, family conversations, and roommate speech because these register as non-stationary noise at lower amplitude than the primary mic input. This is already enabled by default (`voice.noise_suppression: true`).

2. **Receiver-side (new, optional):** An enhanced isolation mode applies a second `nnnoiseless` pass on the decoded audio. This catches background voices that survived Opus compression (Opus preserves all audio above the encoding threshold — including faint background voices that RNNoise on the sender side left in). The double-pass is more aggressive but risks removing valid speaker audio in edge cases (e.g., two people talking simultaneously into one mic). Exposed as `voice.enhanced_isolation: bool` (D033 toggle, default `false`).

**Why receiver-side isolation is optional:** Double-pass noise suppression can create audible artifacts — "underwater" voice quality when the second pass is too aggressive. Most users will find sender-side RNNoise sufficient. Enhanced isolation is for environments where background voices are a persistent problem (shared rooms, open offices) and the speaker cannot control their environment.

##### Workshop Voice Effect Presets

Voice effect presets are a Workshop resource type (D030), published and shared like any other mod resource:

**Resource type:** `voice_effect` (Workshop category: "Voice Effects")
**File format:** YAML with `.icvfx.yaml` extension (standard YAML — `serde_yaml` deserialization)
**Version:** Semver, following Workshop resource conventions (D030)

**Workshop preset structure:**

```yaml
# File: radio_spetsnaz.icvfx.yaml
# Workshop metadata block (same as all Workshop resources)
workshop:
  name: "Spetsnaz Radio"
  description: "Soviet military radio — heavy static, narrow bandwidth, authentic squelch"
  author: "comrade_modder"
  version: "1.2.0"
  license: "CC-BY-4.0"
  tags: ["radio", "soviet", "military", "cold-war", "immersive"]
  # Optional LLM metadata (D016 narrative DNA)
  llm:
    tone: "Soviet military communications — terse, formal"
    era: "Cold War, 1980s"

# DSP chain — same format as built-in presets
chain:
  - type: biquad_filter
    mode: high_pass
    freq_hz: 400
    q: 0.8
  - type: biquad_filter
    mode: low_pass
    freq_hz: 2800
    q: 0.8
  - type: compressor
    threshold_db: -16
    ratio: 8.0
    attack_ms: 2
    release_ms: 30
  - type: soft_clip_distortion
    drive: 0.18
    mode: tube
  - type: noise_layer
    type: static_crackle
    level_db: -24
squelch:
  start_tone_hz: 1400
  end_tone_hz: 900
  duration_ms: 50
  volume: 0.30
```

**Preview before subscribing:** The Workshop browser includes an "audition" feature — a 5-second sample voice clip (bundled with IC) is processed through the effect in real-time and played back. Players hear exactly what the effect sounds like before downloading. This uses the same DSP chain instantiation as live voice — no separate preview system.

**Validation:** Workshop voice effects are pure data (YAML DSP parameters). The DSP stages are built-in engine code — presets cannot execute arbitrary code. Parameter values are clamped to safe ranges (e.g., `drive` 0.0-1.0, `freq_hz` 20-20000, `gain_db` -40 to +20). This is inherently sandboxed — a malicious preset can at worst produce unpleasant audio, never crash the engine or access the filesystem. If a `chain` stage references an unknown `type`, it is skipped with a warning log.

**CLI tooling:** The `ic` CLI supports effect preset development:

```bash
ic audio effect preview radio_spetsnaz.icvfx.yaml      # Preview with sample clip
ic audio effect validate radio_spetsnaz.icvfx.yaml      # Check YAML structure + param ranges
ic audio effect chain-info radio_spetsnaz.icvfx.yaml    # Print stage count, CPU estimate
ic workshop publish --type voice-effect radio_spetsnaz.icvfx.yaml
```

##### Voice Effect Settings Integration

Updated `VoiceSettings` resource (additions in bold comments):

```rust
#[derive(Resource)]
pub struct VoiceSettings {
    pub noise_suppression: bool,       // D033 toggle, default true
    pub enhanced_isolation: bool,      // D033 toggle, default false — receiver-side double-pass
    pub spatial_audio: bool,           // D033 toggle, default false
    pub vad_mode: bool,                // false = PTT, true = VAD
    pub ptt_key: KeyCode,
    pub max_ptt_duration_secs: u32,    // hotmic protection, default 120
    pub effect_preset: Option<String>, // D033 setting — preset name or None for bypass
    pub effect_enabled: bool,          // D033 toggle, default false — master effect switch
    pub per_speaker_effects: HashMap<PlayerId, String>, // per-speaker override presets
}
```

**D033 QoL toggle pattern:** Voice effects follow the same toggle pattern as spatial audio and noise suppression. The `effect_preset` name is a D033 setting (selectable in voice settings UI). Experience profiles (D033) can bundle a voice effect preset with other preferences — e.g., an "Immersive" profile might enable spatial audio + Military Radio effect + smart danger alerts.

**Audio thread sync:** When `VoiceSettings` changes (user selects a new preset in the UI), the ECS → audio thread channel sends a `VoiceCommand::SetEffectPreset(chain)` message. The audio thread instantiates the new `VoiceEffectChain` and applies it starting from the next decoded frame. No glitch — the old chain's state is discarded and the new chain processes from a clean `reset()` state.

##### Competitive Considerations

Voice effects are **cosmetic audio processing** with no competitive implications:

- **Receiver-side only** — what you hear is your choice, not imposed on others. No player gains information advantage from voice effects.
- **No simulation interaction** — effects run entirely in `ic-audio` on the playback thread. Zero contact with `ic-sim`.
- **Tournament mode (D058):** Tournament organizers can restrict voice effects via lobby settings (`voice_effects_allowed: bool`). Broadcast streams may want clean voice for professional production. The restriction is per-lobby, not global — community tournaments set their own rules.
- **Replay casters:** When casting replays with voice-in-replay, casters apply their own effect preset (or none). This means the same replay can sound like a military briefing or a clean podcast depending on the caster's preference.

#### ECS Integration and Audio Thread Architecture

Voice state management uses Bevy ECS. The real-time audio pipeline runs on a dedicated thread. This follows the same pattern as Bevy's own audio system — ECS components are the *control surface*; the audio thread is the *engine*.

**ECS components and resources** (in `ic-audio` and `ic-net` systems, regular `Update` schedule — NOT in `ic-sim`'s `FixedUpdate`):

**Crate boundary note:** `ic-audio` (voice processing, jitter buffer, Opus encode/decode) and `ic-net` (VoicePacket send/receive on `MessageLane::Voice`) do not depend on each other directly. The bridge is `ic-game`, which depends on both and wires them together at app startup: `ic-net` systems write incoming `VoicePacket` data to a crossbeam channel; `ic-audio` systems read from that channel to feed the jitter buffer. Outgoing voice follows the reverse path. This preserves crate independence while enabling data flow — the same integration pattern `ic-game` uses to wire `ic-sim` and `ic-net` via `ic-protocol`.

```rust
/// Attached to player entities. Updated by the voice network system
/// when VoicePackets arrive (or VoiceActivity orders are processed).
/// Queried by ic-ui to render speaker icons.
#[derive(Component)]
pub struct VoiceActivity {
    pub speaking: bool,
    pub last_transmission: Instant,
}

/// Per-player mute/deafen state. Written by UI and /mute commands.
/// Read by the voice network system to filter forwarding hints.
#[derive(Component)]
pub struct VoiceMuteState {
    pub self_mute: bool,
    pub self_deafen: bool,
    pub muted_players: HashSet<PlayerId>,
}

/// Per-player incoming voice volume (0.0–2.0). Written by UI slider.
/// Sent to the audio thread via channel for per-speaker gain.
#[derive(Component)]
pub struct VoiceVolume(pub f32);

/// Per-speaker diagnostics. Updated by the audio thread via channel.
/// Queried by ic-ui to render connection quality indicators.
#[derive(Component)]
pub struct VoiceDiagnostics {
    pub jitter_ms: f32,
    pub packet_loss_pct: f32,
    pub round_trip_ms: f32,
    pub buffer_depth_frames: u32,
    pub estimated_latency_ms: f32,
}

/// Global voice settings. Synced to audio thread on change.
#[derive(Resource)]
pub struct VoiceSettings {
    pub noise_suppression: bool,     // D033 toggle, default true
    pub enhanced_isolation: bool,    // D033 toggle, default false
    pub spatial_audio: bool,         // D033 toggle, default false
    pub vad_mode: bool,              // false = PTT, true = VAD
    pub ptt_key: KeyCode,
    pub max_ptt_duration_secs: u32,  // hotmic protection, default 120
    pub effect_preset: Option<String>, // D033 setting, None = bypass
    pub effect_enabled: bool,        // D033 toggle, default false
}
```

**ECS ↔ Audio thread communication** via lock-free `crossbeam` channels:

```
┌─────────────────────────────────────────────────────┐
│  ECS World (Bevy systems — ic-audio, ic-ui, ic-net) │
│                                                     │
│  Player entities:                                   │
│    VoiceActivity, VoiceMuteState, VoiceVolume,      │
│    VoiceDiagnostics                                 │
│                                                     │
│  Resources:                                         │
│    VoiceBitrateAdapter, VoiceTransportState,         │
│    PttState, VoiceSettings                          │
│                                                     │
│  Systems:                                           │
│    voice_ui_system — reads activity, renders icons  │
│    voice_settings_system — syncs settings to thread │
│    voice_network_system — sends/receives packets    │
│      via channels, updates diagnostics              │
└──────────┬──────────────────────────┬───────────────┘
           │ crossbeam channel        │ crossbeam channel
           │ (commands ↓)             │ (events ↑)
┌──────────▼──────────────────────────▼───────────────┐
│  Audio Thread (dedicated, NOT ECS-scheduled)        │
│                                                     │
│  Capture: cpal → resample → denoise → encode        │
│  Playback: jitter buffer → decode/PLC → mix → cpal  │
│                                                     │
│  Runs on OS audio callback cadence (~5-10ms)        │
└─────────────────────────────────────────────────────┘
```

**Why the audio pipeline cannot be an ECS system:** ECS systems run on Bevy's task pool at frame rate (16ms at 60fps, 33ms at 30fps). Audio capture/playback runs on OS audio threads with ~5ms deadlines via `cpal` callbacks. A jitter buffer that pops every 20ms cannot be driven by a system running at frame rate — the timing mismatch causes audible artifacts. The audio thread runs independently and communicates with ECS via channels: the ECS side sends commands ("PTT pressed", "mute player X", "change bitrate") and receives events ("speaker X started", "diagnostics update", "encoded packet ready").

**What lives where:**

| Concern                                   | ECS? | Rationale                                                 |
| ----------------------------------------- | ---- | --------------------------------------------------------- |
| Voice state (speaking, mute, volume)      | Yes  | Components on player entities, queried by UI systems      |
| Voice settings (PTT key, noise suppress)  | Yes  | Bevy resource, synced to audio thread via channel         |
| Voice effect preset selection             | Yes  | Part of VoiceSettings; chain instantiated on audio thread |
| Network send/receive (VoicePacket ↔ lane) | Yes  | ECS system bridges network layer and audio thread         |
| Voice UI (speaker icons, PTT indicator)   | Yes  | Standard Bevy UI systems querying voice components        |
| Audio capture + encode pipeline           | No   | Dedicated audio thread, cpal callback timing              |
| Jitter buffer + decode/PLC                | No   | Dedicated audio thread, 20ms frame cadence                |
| Audio output + mixing                     | No   | Bevy audio backend thread (existing)                      |

#### UI Indicators

Voice activity is shown in the game UI:

- **In-game overlay:** Small speaker icon next to the player's name/color indicator when they are transmitting. Follows the same placement as SC2's voice indicators (top-right player list).
- **Lobby:** Speaker icon pulses when a player is speaking. Volume slider per player.
- **Chat log:** `[VOICE] Alice is speaking` / `[VOICE] Alice stopped` timestamps in the chat log (optional, toggle via D033 QoL).
- **PTT indicator:** Small microphone icon in the bottom-right corner when PTT key is held. Red slash through it when self-muted.
- **Connection quality:** Per-speaker signal bars (1-4 bars) derived from `VoiceDiagnostics` — jitter, loss, and latency combined into a single quality score. Visible in the player list overlay next to the speaker icon. A player with consistently poor voice quality sees a tooltip: "Poor voice connection — high packet loss" to distinguish voice issues from game network issues. Transport state ("Direct" vs "Tunneled") shown as a small icon when TCP fallback is active.
- **Hotmic warning:** If PTT exceeds 90 seconds (75% of the 120s auto-cut threshold), the PTT indicator turns yellow with a countdown. At 120s, it cuts and shows a brief "PTT timeout" notification.
- **Voice diagnostics panel:** `/voice diag` command opens a detailed overlay (developer/power-user tool) showing per-speaker jitter histogram, packet loss graph, buffer depth, estimated mouth-to-ear latency, and encode/decode CPU time. This is the equivalent of Discord's "Voice & Video Debug" panel.
- **Voice effect indicator:** When a voice effect preset is active, a small filter icon appears next to the microphone indicator. Hovering shows the active preset name (e.g., "Military Radio"). The icon uses the preset's primary tag color (radio presets = olive drab, clean presets = blue, fun presets = purple).

#### Competitive Voice Rules

Voice behavior in competitive contexts requires explicit rules that D058's tournament/ranked modes enforce:

**Voice during pause:** Voice transmission continues during game pauses and tactical timeouts. Voice is I/O, not simulation — pausing the sim does not pause communication. This matches CS2 (voice continues during tactical timeout) and SC2 (voice unaffected by pause). Team coordination during pauses is a legitimate strategic activity.

**Eliminated player voice routing:** When a player is eliminated (all units/structures destroyed), their voice routing depends on the game mode:

| Mode              | Eliminated player can...                                                                  | Rationale                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Casual / unranked | Remain on team voice                                                                      | Social experience; D021 eliminated-player roles (advisor, reinforcement controller) require voice                     |
| Ranked 1v1        | N/A (game ends on elimination)                                                            | No team to talk to                                                                                                    |
| Ranked team       | Remain on team voice for 60 seconds, then observer-only                                   | Brief window for handoff callouts, then prevents persistent backseat gaming. Configurable via tournament rules (D058) |
| Tournament        | Configurable by organizer: permanent team voice, timed cutoff, or immediate observer-only | Tournament organizers decide the rule for their event                                                                 |

**Ranked voice channel restrictions:** In ranked matchmaking (D055), `VoiceTarget::All` (all-chat voice) is **disabled**. Players can only use `VoiceTarget::Team`. All-chat text remains available (for gg/glhf). This matches CS2 and Valorant's competitive modes, which restrict voice to team-only. Rationale: cross-team voice is a toxicity vector and provides no competitive value. Tournament mode (D058) can re-enable all-voice if the organizer chooses (e.g., for show matches).

**Coach slot:** Community servers (D052) can designate a **coach slot** per team — a non-playing participant who has team voice access but cannot issue orders. The coach sees the team's shared vision (not full-map observer view). Coach voice routing uses `VoiceTarget::Team` but the coach's `PlayerId` is flagged as `PlayerRole::Coach` in the lobby. Coaches are subject to the same mute/report system as players. For ranked, coach slots are disabled (pure player skill measurement). For tournaments, organizer configures per-event. This follows CS2's coach system (voice during freezetime/timeouts, restricted during live rounds) but adapted for RTS where there are no freezetime rounds — the coach can speak at all times.

### 3. Beacons and Tactical Pings

The non-verbal coordination layer. Research shows this is often more effective than voice for spatial RTS communication — Respawn Entertainment play-tested Apex Legends for a month with no voice chat and found their ping system "rendered voice chat with strangers largely unnecessary" (Polygon review). EA opened the underlying patent (US 11097189, "Contextually Aware Communications Systems") for free use in August 2021.

#### OpenRA Beacon Compatibility (D024)

OpenRA's Lua API includes `Beacon` (map beacon management) and `Radar` (radar ping control) globals. IC must support these for mission script compatibility:

- `Beacon.New(owner, pos, duration, palette, isPlayerPalette)` — create a map beacon
- `Radar.Ping(player, pos, color, duration)` — flash a radar ping on the minimap

IC's beacon system is a superset — OpenRA's beacons are simple map markers with duration. IC adds contextual types, entity targeting, and the ping wheel (see below). OpenRA beacon/radar Lua calls map to `PingType::Generic` with appropriate visual parameters.

#### Ping Type System

```rust
/// Contextual ping types. Each has a distinct visual, audio cue, and
/// minimap representation. The set is fixed at the engine level but
/// game modules can register additional types via YAML.
///
/// Inspired by Apex Legends' contextual ping system, adapted for RTS:
/// Apex pings communicate "what is here" for a shared 3D space.
/// RTS pings communicate "what should we do about this location" for
/// a top-down strategic view. The emphasis shifts from identification
/// to intent.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PingType {
    /// General attention ping. "Look here."
    /// Default when no contextual modifier applies.
    Generic,
    /// Attack order suggestion. "Attack here / attack this unit."
    /// Shows crosshair icon. Red minimap flash.
    Attack,
    /// Defend order suggestion. "Defend this location."
    /// Shows shield icon. Blue minimap flash.
    Defend,
    /// Warning / danger alert. "Enemies here" or "be careful."
    /// Shows exclamation icon. Yellow minimap flash. Pulsing audio cue.
    Danger,
    /// Rally point. "Move units here" / "gather here."
    /// Shows flag icon. Green minimap flash.
    Rally,
    /// Request assistance. "I need help here."
    /// Shows SOS icon. Orange minimap flash with urgency pulse.
    Assist,
    /// Enemy spotted — marks a position where enemy units were seen.
    /// Auto-fades after the fog of war re-covers the area.
    /// Shows eye icon. Red blinking on minimap.
    EnemySpotted,
    /// Economic marker. "Expand here" / "ore field here."
    /// Shows resource icon. Green on minimap.
    Economy,
}
```

#### Contextual Ping (Apex Legends Adaptation)

The ping type auto-selects based on what's under the cursor when the ping key is pressed:

| Cursor Target                      | Auto-Selected Ping | Visual                             |
| ---------------------------------- | ------------------ | ---------------------------------- |
| Empty terrain (own territory)      | `Rally`            | Flag marker at position            |
| Empty terrain (enemy territory)    | `Attack`           | Crosshair marker at position       |
| Empty terrain (neutral/unexplored) | `Generic`          | Diamond marker at position         |
| Visible enemy unit                 | `EnemySpotted`     | Eye icon tracking the unit briefly |
| Own damaged building               | `Assist`           | SOS icon on building               |
| Ore field / resource               | `Economy`          | Resource icon at position          |
| Fog-of-war edge                    | `Danger`           | Exclamation at fog boundary        |

**Override via ping wheel:** Holding the ping key (default: `G`) opens a radial menu (ping wheel) showing all 8 ping types. Flick the mouse in the desired direction to select. Release to place. Quick-tap (no hold) uses the contextual default. This two-tier interaction (quick contextual + deliberate selection) follows Apex Legends' proven UX pattern.

#### Ping Wheel UI

```
              Danger
         ╱            ╲
    Defend              Attack
       │    [cursor]     │
    Assist              Rally
         ╲            ╱
         Economy    EnemySpotted
              Generic
```

The ping wheel is a radial menu rendered by `ic-ui`. Each segment shows the ping type icon and name. The currently highlighted segment follows the mouse direction from center. Release places the selected ping type. Escape cancels.

**Controller support (Steam Deck / future console):** Ping wheel opens on right stick click, direction selected via stick. Quick-ping on D-pad press.

#### Ping Properties

```rust
/// A placed ping marker. Managed by ic-ui (rendering) and forwarded
/// to the sim via PlayerOrder::TacticalPing for replay recording.
pub struct PingMarker {
    pub id: PingId,
    pub owner: PlayerId,
    pub ping_type: PingType,
    pub pos: WorldPos,
    /// If the ping was placed on a specific entity, track it.
    /// The marker follows the entity until it dies or the ping expires.
    pub tracked_entity: Option<UnitTag>,
    /// Ping lifetime. Default 8 seconds. Danger pings pulse.
    pub duration: Duration,
    /// Audio cue played on placement. Each PingType has a distinct sound.
    pub audio_cue: PingAudioCue,
    /// Tick when placed (for expiration).
    pub placed_at: u64,
}
```

**Ping rate limiting:** Max 3 pings per 5 seconds per player (configurable). Exceeding the limit suppresses pings with a cooldown indicator. This prevents ping spam, which is a known toxicity vector in games with ping systems (LoL's "missing" ping spam problem).

**Ping persistence:** Pings are ephemeral — they expire after `duration` (default 8 seconds). They do NOT persist in save games. They DO appear in replays (via `PlayerOrder::TacticalPing` in the order stream).

**Audio feedback:** Each ping type has a distinct short audio cue (< 300ms). Incoming pings from teammates play the cue with a minimap flash. Audio volume follows the `voice.ping_volume` cvar (D058). Repeated rapid pings from the same player have diminishing audio (third ping in 5 seconds is silent) to reduce annoyance.

### 4. Novel Coordination Mechanics

Beyond standard chat/voice/pings, IC introduces coordination tools not found in other RTS games:

#### 4a. Chat Wheel (Dota 2 / Rocket League Pattern)

A radial menu of pre-defined phrases that are:
- **Instantly sent** — no typing, one keypress + flick
- **Auto-translated** — each phrase has a `phrase_id` that maps to the recipient's locale, enabling communication across language barriers
- **Replayable** — sent as `PlayerOrder::ChatWheelPhrase` in the order stream

```yaml
# chat_wheel_phrases.yaml — game module provides these
chat_wheel:
  phrases:
    - id: 1
      category: tactical
      label:
        en: "Attack now!"
        de: "Jetzt angreifen!"
        ru: "Атакуем!"
        zh: "现在进攻!"
      audio_cue: "eva_attack"  # optional EVA voice line

    - id: 2
      category: tactical
      label:
        en: "Fall back!"
        de: "Rückzug!"
        ru: "Отступаем!"
        zh: "撤退!"
      audio_cue: "eva_retreat"

    - id: 3
      category: tactical
      label:
        en: "Defend the base!"
        de: "Basis verteidigen!"
        ru: "Защищайте базу!"
        zh: "防守基地!"

    - id: 4
      category: economy
      label:
        en: "Need more ore"
        de: "Brauche mehr Erz"
        ru: "Нужна руда"
        zh: "需要更多矿石"

    - id: 5
      category: social
      label:
        en: "Good game!"
        de: "Gutes Spiel!"
        ru: "Хорошая игра!"
        zh: "打得好！"
      audio_cue: null

    - id: 6
      category: social
      label:
        en: "Well played"
        de: "Gut gespielt"
        ru: "Хорошо сыграно"
        zh: "打得漂亮"

    # ... 20-30 phrases per game module, community can add more via mods
```

**Chat wheel key:** Default `V`. Hold to open, flick to select, release to send. The phrase appears in team chat (or all chat, depending on category — social phrases go to all). The phrase displays in the recipient's language, but the chat log also shows `[wheel]` tag so observers know it's a pre-defined phrase.

**Why this matters for RTS:** International matchmaking means players frequently cannot communicate by text. The chat wheel solves this with zero typing — the same phrase ID maps to every supported language. Dota 2 proved this works at scale across a global player base. For IC's Cold War setting, phrases use military communication style: "Affirmative," "Negative," "Enemy contact," "Position compromised."

**Mod-extensible:** Game modules (RA1, TD, community mods) provide their own phrase sets via YAML. The engine provides the wheel UI and `ChatWheelPhrase` order — the phrases are data, not code.

#### 4b. Minimap Drawing

Players can draw directly on the minimap to communicate tactical plans:

- **Activation:** Hold `Alt` + click-drag on minimap (or `/draw` command via D058)
- **Visual:** Freeform line drawn in the player's team color. Visible to teammates only.
- **Duration:** Drawings fade after 8 seconds (same as pings).
- **Persistence:** Drawings are sent as `PlayerOrder::MinimapDraw` — they appear in replays.
- **Rate limit:** Max 3 drawing strokes per 10 seconds, max 32 points per stroke. Prevents minimap vandalism.

```rust
/// Minimap drawing stroke. Points are quantized to cell resolution
/// to keep order size small. A typical stroke is 8-16 points.
pub struct MinimapStroke {
    pub points: Vec<CellPos>,    // max 32 points
    pub color: PlayerColor,
    pub thickness: u8,           // 1-3 pixels on minimap
    pub placed_at: u64,          // tick for expiration
}
```

**Why this is novel for RTS:** Most RTS games have no minimap drawing. Players resort to rapid pinging to trace paths, which is imprecise and annoying. Minimap drawing enables "draw the attack route" coordination naturally. Some MOBA games (LoL) have minimap drawing; no major RTS does.

#### 4c. Tactical Markers (Persistent Team Annotations)

Unlike pings (ephemeral, 8 seconds) and drawings (ephemeral, 8 seconds), tactical markers are persistent annotations placed by team leaders:

```rust
/// Persistent tactical marker. Lasts until manually removed or game ends.
/// Limited to 10 per player, 30 per team. Intended for strategic planning,
/// not moment-to-moment callouts (that's what pings are for).
pub struct TacticalMarker {
    pub id: MarkerId,
    pub owner: PlayerId,
    pub marker_type: MarkerType,
    pub pos: WorldPos,
    pub label: Option<String>,   // max 16 chars, e.g., "Expand", "Ambush"
    pub placed_at: u64,
}

#[derive(Clone, Copy, Debug)]
pub enum MarkerType {
    /// Numbered waypoint (1-9). For coordinating multi-prong attacks.
    Waypoint(u8),
    /// Named objective marker. Shows label on the map.
    Objective,
    /// Hazard zone. Renders a colored radius indicating danger area.
    HazardZone { radius: u16 },
}
```

**Access:** Place via ping wheel (hold longer to access marker submenu) or via commands (`/marker waypoint 1`, `/marker objective "Expand here"`, `/marker hazard 50`). Remove with `/marker clear` or right-click on existing marker.

**Use case:** Before a coordinated push, the team leader places waypoint markers 1-3 showing the attack route, an objective marker on the target, and a hazard zone on the enemy's defensive line. These persist until the push is complete, giving the team a shared tactical picture.

#### 4d. Smart Danger Alerts (Novel)

Automatic alerts that supplement manual pings with game-state-aware warnings:

```rust
/// Auto-generated alerts based on sim state. These are NOT orders —
/// they are client-side UI events computed locally from the shared sim state.
/// Each player's client generates its own alerts; no network traffic.
///
/// CRITICAL: All alerts involving enemy state MUST filter through the
/// player's current fog-of-war vision. In standard lockstep, each client
/// has the full sim state — querying enemy positions without vision
/// filtering would be a built-in maphack. The alert system calls
/// `FogProvider::is_visible(player, cell)` before considering any
/// enemy entity. Only enemies the player can currently see trigger alerts.
/// (In fog-authoritative relay mode per V26, this is solved at the data
/// level — the client simply doesn't have hidden enemy state.)
pub enum SmartAlert {
    /// Large enemy force detected moving toward the player's base.
    /// Triggered when >= 5 **visible** enemy units are within N cells of
    /// the base and were not there on the previous check (debounced,
    /// 10-second cooldown). Units hidden by fog of war are excluded.
    IncomingAttack { direction: CompassDirection, unit_count: u32 },
    /// Ally's base is under sustained attack (> 3 buildings damaged in
    /// 10 seconds). Only fires if the attacking units or damaged buildings
    /// are within the player's shared team vision.
    AllyUnderAttack { ally: PlayerId },
    /// Undefended expansion at a known resource location.
    /// Triggered when an ore field has no friendly structures or units nearby.
    /// This alert uses only friendly-side data, so no fog filtering is needed.
    UndefendedResource { pos: WorldPos },
    /// Enemy superweapon charging (if visible). RTS-specific high-urgency alert.
    /// Only fires if the superweapon structure is within the player's vision.
    SuperweaponWarning { weapon_type: String, estimated_ticks: u64 },
}
```

**Why client-side, not sim-side:** Smart alerts are purely informational — they don't affect gameplay. Computing them client-side means zero network cost and zero impact on determinism. Each client already has the full sim state (lockstep), but **alerts must respect fog of war** — only visible enemy units are considered. The `FogProvider` trait (D041) provides the vision query; alerts call `is_visible()` before evaluating any enemy entity. In fog-authoritative relay mode (V26 in `06-SECURITY.md`), this is inherently safe because the client never receives hidden enemy state. The alert thresholds are configurable via D033 QoL toggles.

**Why this is novel:** No RTS engine has context-aware automatic danger alerts. Players currently rely on manual minimap scanning. Smart alerts reduce the cognitive load of map awareness without automating decision-making — they tell you *that* something is happening, not *what to do about it*. This is particularly valuable for newer players who haven't developed the habit of constant minimap checking.

**Competitive consideration:** Smart alerts are a D033 QoL toggle (`alerts.smart_danger: bool`, default `true`). Tournament hosts can disable them for competitive purity. Experience profiles (D033) bundle this toggle with other QoL settings.

### 5. Voice-in-Replay — Architecture & Feasibility

The user asked: "would it make sense technically speaking and otherwise, to keep player voice records in the replay?"

**Yes — technically feasible, precedented, and valuable. But: strictly opt-in with clear consent.**

#### Technical Approach

Voice-in-replay follows ioquake3's proven pattern (the only open-source game with this feature): inject Opus frames as tagged messages into the replay file alongside the order stream.

IC's replay format (`05-FORMATS.md`) already separates streams:
- **Order stream** — deterministic tick frames (for playback)
- **Analysis event stream** — sampled sim state (for stats tools)

Voice adds a third stream:
- **Voice stream** — timestamped Opus frames (for communication context)

```rust
/// Replay file structure with voice stream.
/// Voice is a separate section with its own offset in the header.
/// Tools that don't need voice skip it entirely — zero overhead.
///
/// The voice stream is NOT required for replay playback — it adds
/// communication context, not gameplay data.
pub struct ReplayVoiceStream {
    /// Per-player voice tracks, each independently seekable.
    pub tracks: Vec<VoiceTrack>,
}

pub struct VoiceTrack {
    pub player: PlayerId,
    /// Whether this player consented to voice recording.
    /// If false, this track is empty (header only, no frames).
    pub consented: bool,
    pub frames: Vec<VoiceReplayFrame>,
}

pub struct VoiceReplayFrame {
    /// Game tick when this audio was transmitted.
    pub tick: u64,
    /// Opus-encoded audio data. Same codec as live audio.
    pub opus_data: Vec<u8>,
    /// Original voice target (team/all). Preserved for replay filtering.
    pub target: VoiceTarget,
}
```

**Header extension:** The replay header (`ReplayHeader`) gains a new field:

```rust
pub struct ReplayHeader {
    // ... existing fields ...
    pub voice_offset: u32,       // 0 if no voice stream
    pub voice_length: u32,       // Compressed length of voice stream
}
```

The `flags` field gains a `HAS_VOICE` bit. Replay viewers check this flag before attempting to load voice data.

#### Storage Cost

| Game Duration | Players Speaking | Avg Bitrate | DTX Savings | Voice Stream Size |
| ------------- | ---------------- | ----------- | ----------- | ----------------- |
| 20 min        | 2 of 4           | 32 kbps     | ~40%        | ~1.3 MB           |
| 45 min        | 3 of 8           | 32 kbps     | ~40%        | ~4.7 MB           |
| 60 min        | 4 of 8           | 32 kbps     | ~40%        | ~8.3 MB           |

Compare to the order stream: a 60-minute game's order stream (compressed) is ~2-5 MB. Voice roughly doubles the replay size when all players are recorded. For `Minimal` replays (the default), voice adds 1-8 MB — still well within reasonable file sizes for modern storage.

**Mitigation:** Voice data is LZ4-compressed independently of the order stream. Opus is already compressed (it does not benefit much from generic compression), so LZ4 primarily helps with the framing overhead and silence gaps.

#### Consent Model

**Recording voice in replays is a serious privacy decision.** The design must make consent explicit, informed, and revocable:

1. **Opt-in, not opt-out.** Voice recording for replays is disabled by default. Players enable it via a settings toggle (`replay.record_voice: bool`, default `false`).

2. **Per-session consent display.** When joining a game where ANY player has voice recording enabled, all players see a notification: "Voice may be recorded for replay by: Alice, Bob." This ensures no one is unknowingly recorded.

3. **Per-player granularity.** Each player independently decides whether THEIR voice is recorded. Alice can record her own voice while Bob opts out — Bob's track in the replay is empty.

4. **Relay enforcement.** The relay server tracks each player's recording consent flag. The replay writer (each client) only writes voice frames for consenting players. Even if a malicious client records non-consenting voice locally, the *shared* replay file (relay-signed, D007) contains only consented tracks.

5. **Post-game stripping.** The `/replay strip-voice` command (D058) removes the voice stream from a replay file, producing a voice-free copy. Players can share gameplay replays without voice.

6. **No voice in ranked replays by default.** Ranked match replays submitted for ladder certification (D055) strip voice automatically. Voice is a communication channel, not a gameplay record — it has no bearing on match verification.

7. **Legal compliance.** In jurisdictions requiring two-party consent for recording (e.g., California, Germany), the per-session notification + opt-in model satisfies the consent requirement. Players who haven't enabled recording cannot have their voice captured.

#### Replay Playback with Voice

During replay playback, voice is synchronized to the game tick:

- Voice frames are played at the tick they were originally transmitted
- Fast-forward/rewind seeks the voice stream to the nearest frame boundary
- Voice is mixed into playback audio at a configurable volume (`replay.voice_volume` cvar)
- Individual player voice tracks can be muted/soloed (useful for analysis: "what was Alice saying when she attacked?")
- Voice target filtering: viewer can choose to hear only `All` chat, only `Team` chat, or both

**Use cases for voice-in-replay:**
- **Tournament commentary:** Casters can hear team communication during featured replays (with player consent), adding depth to analysis
- **Coaching:** A coach reviews a student's replay with voice to understand decision-making context
- **Community content:** YouTubers/streamers share replays with natural commentary intact
- **Post-game review:** Players review their own team communication for improvement

### 6. Security Considerations

| Vulnerability               | Risk   | Mitigation                                                                                                                                                                                                       |
| --------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voice spoofing**          | HIGH   | Relay stamps `speaker: PlayerId` on all forwarded voice packets. Client-submitted speaker ID is overwritten. Same pattern as ioquake3 server-side VoIP.                                                          |
| **Voice DDoS**              | MEDIUM | Rate limit: max 50 voice packets/sec per player (relay-enforced). Bandwidth cap: `MessageLane::Voice` has a 16 KB buffer — overflow drops oldest frames. Exceeding rate limit triggers mute + warning.           |
| **Voice data in replays**   | HIGH   | Opt-in consent model (see § 5). Voice tracks only written for consenting players. `/replay strip-voice` for post-hoc removal. No voice in ranked replays by default.                                             |
| **Ping spam / toxicity**    | MEDIUM | Max 3 pings per 5 seconds per player. Diminishing audio on rapid pings. Report pathway for ping abuse.                                                                                                           |
| **Chat flood**              | LOW    | 5 messages per 3 seconds (relay-enforced). Slow mode indicator. Already addressed by ProtocolLimits (V15).                                                                                                       |
| **Minimap drawing abuse**   | LOW    | Max 3 strokes per 10 seconds, 32 points per stroke. Drawings are team-only. Report pathway.                                                                                                                      |
| **Whisper harassment**      | MEDIUM | Player-level mute persists across sessions (SQLite, D034). Whisper requires mutual non-mute (if either party has muted the other, whisper is silently dropped). Report → admin mute pathway.                     |
| **Observer voice coaching** | HIGH   | In competitive/ranked games, observers cannot transmit voice to players. Observer `VoiceTarget::All/Team` is restricted to observer-only routing. Same isolation as observer chat.                               |
| **Content in voice data**   | MEDIUM | IC does not moderate voice content in real-time (no speech-to-text analysis). Moderation is reactive: player reports + replay review. Community server admins (D052) can review voice replays of reported games. |

**New ProtocolLimits fields:**

```rust
pub struct ProtocolLimits {
    // ... existing fields (V15) ...
    pub max_voice_packets_per_second: u32,    // 50 (1 per 20ms frame)
    pub max_voice_packet_size: usize,         // 256 bytes (covers single-frame 64kbps Opus
                                              // = ~160 byte payload + headers. Multi-frame
                                              // bundles (frame_count > 1) send multiple packets,
                                              // not one oversized packet.)
    pub max_pings_per_interval: u32,          // 3 per 5 seconds
    pub max_minimap_draw_points: usize,       // 32 per stroke
    pub max_tactical_markers_per_player: u8,  // 10
    pub max_tactical_markers_per_team: u8,    // 30
}
```

### 7. Platform Considerations

| Platform            | Text Chat     | VoIP                     | Pings               | Chat Wheel          | Minimap Draw  |
| ------------------- | ------------- | ------------------------ | ------------------- | ------------------- | ------------- |
| **Desktop**         | Full keyboard | PTT or VAD; Opus/UDP     | G key + wheel       | V key + wheel       | Alt+drag      |
| **Browser (WASM)**  | Full keyboard | PTT; Opus/WebRTC (str0m) | Same                | Same                | Same          |
| **Steam Deck**      | On-screen KB  | PTT on trigger/bumper    | D-pad or touchpad   | D-pad submenu       | Touch minimap |
| **Mobile (future)** | On-screen KB  | PTT button on screen     | Tap-hold on minimap | Radial menu on hold | Finger draw   |

**Mobile minimap + bookmark coexistence:** On phone/tablet layouts, camera bookmarks sit in a **bookmark dock adjacent to the minimap/radar cluster** rather than overloading minimap gestures. This keeps minimap interactions free for camera jump, pings, and drawing (D059), while giving touch players a fast, visible "save/jump camera location" affordance similar to C&C Generals. Gesture priority is explicit: touches that start on bookmark chips stay bookmark interactions; touches that start on the minimap stay minimap interactions.

**Layout and handedness:** The minimap cluster (minimap + alerts + bookmark dock) mirrors with the player's handedness setting. The command rail remains on the dominant-thumb side, so minimap communication and camera navigation stay on the opposite side and don't fight for the same thumb.

**Official binding profile integration (D065):** Communication controls in D059 are not a separate control scheme. They are semantic actions in D065's canonical input action catalog (e.g., `open_chat`, `voice_ptt`, `ping_wheel`, `chat_wheel`, `minimap_draw`, `callvote`, `mute_player`) and are mapped through the same official profiles (`Classic RA`, `OpenRA`, `Modern RTS`, `Gamepad Default`, `Steam Deck Default`, `Touch Phone/Tablet`). This keeps tutorial prompts, Quick Reference, and "What's Changed in Controls" updates consistent across devices and profile changes.

**Discoverability rule (controller/touch):** Every D059 communication action must have a visible UI path in addition to any shortcut/button chord. Example: PTT may be on a shoulder button, but the voice panel still exposes the active binding and a test control; pings/chat wheel may use radial holds, but the pause/controls menu and Quick Reference must show how to trigger them on the current profile.

### 8. Lua API Extensions (D024)

Building on the existing `Beacon` and `Radar` globals from OpenRA compatibility:

```lua
-- Existing OpenRA globals (unchanged)
Beacon.New(owner, pos, duration, palette, isPlayerPalette)
Radar.Ping(player, pos, color, duration)

-- IC extensions
Ping.Place(player, pos, pingType)          -- Place a typed ping
Ping.PlaceOnTarget(player, target, pingType) -- Ping tracking an entity
Ping.Clear(player)                          -- Clear all pings from player
Ping.ClearAll()                             -- Clear all pings (mission use)

ChatWheel.Send(player, phraseId)           -- Trigger a chat wheel phrase
ChatWheel.RegisterPhrase(id, translations) -- Register a custom phrase

Marker.Place(player, pos, markerType, label) -- Place tactical marker
Marker.Remove(player, markerId)              -- Remove a marker
Marker.ClearAll(player)                      -- Clear all markers

Chat.Send(player, channel, message)        -- Send a chat message
Chat.SendToAll(player, message)            -- Convenience: all-chat
Chat.SendToTeam(player, message)           -- Convenience: team-chat
```

**Mission scripting use cases:** Lua mission scripts can place scripted pings ("attack this target"), send narrated chat messages (briefing text during gameplay), and manage tactical markers (pre-placed waypoints for mission objectives). The `Chat.Send` function enables bot-style NPC communication in co-op scenarios.

### 9. Console Commands (D058 Integration)

All coordination features are accessible via the command console:

```
/all <message>           # Send to all-chat
/team <message>          # Send to team chat  
/w <player> <message>    # Whisper to player
/mute <player>           # Mute player (voice + text)
/unmute <player>         # Unmute player
/mutelist                # Show muted players
/voice volume <0-100>    # Set incoming voice volume
/voice ptt <key>         # Set push-to-talk key
/voice toggle            # Toggle voice on/off
/voice diag              # Open voice diagnostics overlay
/voice effect list       # List available effect presets (built-in + Workshop)
/voice effect set <name> # Apply effect preset (e.g., "Military Radio")
/voice effect off        # Disable voice effects
/voice effect preview <name>  # Play sample clip with effect applied
/voice effect info <name>     # Show preset details (stages, CPU estimate, author)
/voice isolation toggle  # Toggle enhanced voice isolation (receiver-side double-pass)
/ping <type> [x] [y]     # Place a ping (type: attack, defend, danger, etc.)
/ping clear              # Clear your pings
/draw                    # Toggle minimap drawing mode
/marker <type> [label]   # Place tactical marker at cursor
/marker clear [id|all]   # Remove marker(s)
/wheel <phrase_id>       # Send chat wheel phrase by ID
/replay strip-voice <file> # Remove voice from replay file
```

### Alternatives Considered

- **External voice only (Discord/TeamSpeak/Mumble)** (rejected — external voice is the status quo for OpenRA and it's the #1 friction point for new players. Forcing third-party voice excludes casual players, fragments the community, and makes beacons/pings impossible to synchronize with voice. Built-in voice is table stakes for a modern multiplayer game. However, deep analysis of Mumble's protocol, Janus SFU, and str0m's sans-I/O WebRTC directly informed IC's VoIP design — see `research/open-source-voip-analysis.md` for the full survey.)
- **P2P voice instead of relay-forwarded** (rejected — P2P voice exposes player IP addresses to all participants. This is a known harassment vector: competitive players have been DDoS'd via IPs obtained from game voice. Relay-forwarded voice maintains D007's IP privacy guarantee. The bandwidth cost is negligible for the relay.)
- **WebRTC for all platforms** (rejected — WebRTC's complexity (ICE negotiation, STUN/TURN, DTLS) is unnecessary overhead for native desktop clients that already have a UDP connection to the relay. Raw Opus-over-UDP is simpler, lower latency, and sufficient. WebRTC is used only for browser builds where raw UDP is unavailable.)
- **Voice activation (VAD) as default** (rejected — VAD transmits background noise, keyboard sounds, and private conversations. Every competitive game that tried VAD-by-default reverted to PTT-by-default. VAD remains available as a user preference for casual play.)
- **Voice moderation via speech-to-text** (rejected — real-time STT is compute-intensive, privacy-invasive, unreliable across accents/languages, and creates false positive moderation actions. Reactive moderation via reports + voice replay review is more appropriate. IC is not a social platform with tens of millions of users — community-scale moderation (D037/D052) is sufficient.)
- **Always-on voice recording in replays** (rejected — recording without consent is a privacy violation in many jurisdictions. Even with consent, always-on recording creates storage overhead for every game. Opt-in recording is the correct default. ioquake3 records voice in demos by default, but ioquake3 predates modern privacy law.)
- **Opus alternative: Lyra/Codec2** (rejected — Lyra is a Google ML-based codec with excellent compression (3 kbps) but requires ML model distribution, is not WASM-friendly, and has no Rust bindings. Codec2 is designed for amateur radio with lower quality than Opus at comparable bitrates. Opus is the industry standard, has mature Rust bindings, and is universally supported.)
- **Custom ping types per mod** (partially accepted — the engine defines the 8 core ping types; game modules can register additional types via YAML. This avoids UI inconsistency while allowing mod creativity. Custom ping types inherit the rate-limiting and visual framework.)
- **Sender-side voice effects** (rejected — applying DSP effects before Opus encoding wastes codec bits on the effect rather than the voice, degrades quality, and forces the sender's aesthetic choice on all listeners. Receiver-side effects let each player choose their own experience while preserving clean audio for replays and broadcast.)
- **External DSP library (fundsp/dasp) for voice effects** (deferred — the built-in DSP stages (biquad, compressor, soft-clip, noise gate, reverb, de-esser) are ~500 lines of straightforward Rust. External libraries add dependency weight for operations that don't need their generality. If future effects require convolution reverb or FFT-based processing, `fundsp` becomes a justified addition.)
- **Voice morphing / pitch shifting** (deferred — AI-powered voice morphing (deeper voice, gender shifting, character voices) is technically feasible but raises toxicity concerns: voice morphing enables identity manipulation in team games. Competitive games that implemented voice morphing (Fortnite's party effects) limit it to cosmetic fun modes. IC could add this as a Phase 7 Workshop resource type with appropriate social guardrails — deferred, not rejected.)
- **Shared audio channels / proximity voice** (deferred — proximity voice where you hear players based on their units' positions is interesting for immersive scenarios but confusing for competitive play. The `SPATIAL` flag provides spatial panning as a toggle-able approximation. Full proximity voice could be added in Phase 7 as an optional game mode feature.)

### Integration with Existing Decisions

- **D006 (NetworkModel):** Voice is not a NetworkModel concern — it is an `ic-net` service that sits alongside `NetworkModel`, using the same `Transport` connection but on a separate `MessageLane`. `NetworkModel` handles orders; voice forwarding is independent.
- **D007 (Relay Server):** Voice packets are relay-forwarded, maintaining IP privacy and consistent routing. The relay's voice forwarding is stateless — it copies bytes without decoding Opus. The relay's rate limiting (per-player voice packet cap) defends against voice DDoS.
- **D024 (Lua API):** IC extends Beacon and Radar globals with `Ping`, `ChatWheel`, `Marker`, and `Chat` globals. OpenRA beacon/radar calls map to IC's ping system with `PingType::Generic`.
- **D033 (QoL Toggles):** Spatial audio, voice effects (preset selection), enhanced voice isolation, smart danger alerts, ping sounds, voice recording are individually toggleable. Experience profiles (D033) bundle communication preferences — e.g., an "Immersive" profile enables spatial audio + Military Radio voice effect + smart danger alerts.
- **D054 (Transport):** On native builds, voice uses the same `Transport` trait connection as orders — Opus frames are sent on `MessageLane::Voice` over `UdpTransport`. On browser builds, voice uses a parallel `str0m` WebRTC session *alongside* (not through) the `Transport` trait, because browser audio capture/playback requires WebRTC media APIs. The relay bridges between the two: it receives voice from native clients on `MessageLane::Voice` and from browser clients via WebRTC, then forwards to each recipient using their respective transport. The `VoiceTransport` enum (`Native` / `WebRtc`) selects the appropriate path per platform.
- **D055 (Ranked Matchmaking):** Voice is stripped from ranked replay submissions. Chat and pings are preserved (they are orders in the deterministic stream).
- **D058 (Chat/Command Console):** All coordination features are accessible via console commands. D058 defined the input system; D059 defines the routing, voice, spatial signaling, and voice effect selection that D058's commands control. The `/all`, `/team`, `/w` commands were placeholder in D058 — D059 specifies their routing implementation. Voice effect commands (`/voice effect list`, `/voice effect set`, `/voice effect preview`) give console-first access to the voice effects system.
- **05-FORMATS.md (Replay Format):** Voice stream extends the replay file format with a new section. The replay header gains `voice_offset`/`voice_length` fields and a `HAS_VOICE` flag bit. Voice is independent of the order and analysis streams — tools that don't process voice ignore it.
- **06-SECURITY.md:** New `ProtocolLimits` fields for voice, ping, and drawing rate limits. Voice spoofing prevention (relay-stamped speaker ID). Voice-in-replay consent model addresses privacy requirements.
- **D010 (Snapshots) / Analysis Event Stream:** The replay analysis event stream now includes **camera position samples** (`CameraPositionSample`), **selection tracking** (`SelectionChanged`), **control group events** (`ControlGroupEvent`), **ability usage** (`AbilityUsed`), **pause events** (`PauseEvent`), and **match end events** (`MatchEnded`) — see `05-FORMATS.md` § "Analysis Event Stream" for the full enum. Camera samples are lightweight (~8 bytes per player per sample at 2 Hz = ~1 KB/min for 8 players). D059 notes this integration because voice-in-replay is most valuable when combined with camera tracking — hearing what a player said while seeing what they were looking at.
- **03-NETCODE.md (Match Lifecycle):** D059's competitive voice rules (pause behavior, eliminated player routing, ranked restrictions, coach slot) integrate with the match lifecycle protocol defined in `03-NETCODE.md` § "Match Lifecycle." Voice pause behavior follows the game pause state — voice continues during pause per D059's competitive voice rules. Surrender and disconnect events affect voice routing (eliminated-to-observer transition). The **In-Match Vote Framework** (`03-NETCODE.md` § "In-Match Vote Framework") extends D059's tactical coordination: tactical polls build on the chat wheel phrase system (`poll: true` phrases in `chat_wheel_phrases.yaml`), and `/callvote` commands are registered via D058's Brigadier command tree. See vote framework research: `research/vote-callvote-system-analysis.md`.

### Shared Infrastructure: Voice, Game Netcode & Workshop Cross-Pollination

IC's voice system (D059), game netcode (`03-NETCODE.md`), and Workshop distribution (D030/D049/D050) share underlying networking patterns. This section documents concrete improvements that flow between them — shared infrastructure that avoids duplicate work and strengthens all three systems.

#### Unified Connection Quality Monitor

Both voice (D059's `VoiceBitrateAdapter`) and game netcode (`03-NETCODE.md` § Adaptive Run-Ahead) independently monitor connection quality to adapt their behavior. Voice adjusts Opus bitrate based on packet loss and RTT. Game adjusts order submission timing based on relay timing feedback. Both systems need the same measurements — yet without coordination, they probe independently.

**Improvement:** A single `ConnectionQuality` resource in `ic-net`, updated by the relay connection, feeds both systems:

```rust
/// Shared connection quality state — updated by the relay connection,
/// consumed by voice, game netcode, and Workshop download scheduler.
#[derive(Resource)]
pub struct ConnectionQuality {
    pub rtt_ms: u32,                  // smoothed RTT (EWMA)
    pub rtt_variance_ms: u32,         // jitter estimate
    pub packet_loss_pct: u8,          // 0-100, rolling window
    pub bandwidth_estimate_kbps: u32, // estimated available bandwidth
    pub quality_tier: QualityTier,    // derived summary for quick decisions
}

pub enum QualityTier {
    Excellent,  // <30ms RTT, <1% loss
    Good,       // <80ms RTT, <3% loss
    Fair,       // <150ms RTT, <5% loss  
    Poor,       // <300ms RTT, <10% loss
    Critical,   // >300ms RTT or >10% loss
}
```

**Who benefits:**
- **Voice:** `VoiceBitrateAdapter` reads `ConnectionQuality` instead of maintaining its own RTT/loss measurements. Bitrate decisions align with the game connection's actual state.
- **Game netcode:** Adaptive run-ahead uses the same smoothed RTT that voice uses, ensuring consistent latency estimation across systems.
- **Workshop downloads:** Large package downloads (D049) can throttle based on `bandwidth_estimate_kbps` during gameplay — never competing with order delivery or voice. Downloads pause automatically when `quality_tier` drops to `Poor` or `Critical`.

#### Voice Jitter Buffer ↔ Game Order Buffering

D059's adaptive jitter buffer (EWMA-based target depth, packet loss concealment) solves the same fundamental problem as game order delivery: variable-latency packet arrival that must be smoothed into regular consumption.

**Voice → Game improvement:** The jitter buffer's adaptive EWMA algorithm can inform the game's run-ahead calculation. Currently, adaptive run-ahead adjusts order submission timing based on relay feedback. The voice jitter buffer's `target_depth` — computed from the same connection's actual packet arrival variance — provides a more responsive signal: if voice packets are arriving with high jitter, game order submission should also pad its timing.

**Game → Voice improvement:** The game netcode's token-based liveness check (nonce echo, `03-NETCODE.md` § Anti-Lag-Switch) detects frozen clients within one missed token. The voice system should use the same liveness signal — if the game connection's token check fails (client frozen), the voice system can immediately switch to PLC (Opus Packet Loss Concealment) rather than waiting for voice packet timeouts. This reduces the detection-to-concealment latency from ~200ms (voice timeout) to ~33ms (one game tick).

#### Lane Priority & Voice/Order Bandwidth Arbitration

D059 uses `MessageLane::Voice` (priority tier 1, weight 2) alongside game orders (`MessageLane::Orders`, priority tier 0). The lane system already prevents voice from starving orders. But the interaction can be tighter:

**Improvement:** When `ConnectionQuality.quality_tier` drops to `Poor`, the voice system should proactively reduce bitrate *before* the lane system needs to drop voice packets. The sequence:
1. `ConnectionQuality` detects degradation
2. `VoiceBitrateAdapter` drops to minimum bitrate (16 kbps) preemptively
3. Lane scheduler sees reduced voice traffic, allocates freed bandwidth to order reliability (retransmits)
4. When quality recovers, voice ramps back up over 2 seconds

This is better than the current design where voice and orders compete reactively — the voice system cooperates proactively because it reads the same quality signal.

#### Workshop P2P Distribution ↔ Spectator Feeds

D049's BitTorrent/WebTorrent infrastructure for Workshop package distribution can serve double duty:

**Spectator feed fan-out:** When a popular tournament match has 500+ spectators, the relay server becomes a bandwidth bottleneck (broadcasting delayed `TickOrders` to all spectators). Workshop's P2P distribution pattern solves this: the relay sends the spectator feed to N seed peers, who redistribute to other spectators via WebTorrent. The feed is chunked by tick range (matching the replay format's 256-tick LZ4 blocks) — each chunk is a small torrent piece that peers can share immediately after receiving it.

**Replay distribution:** Tournament replays often see thousands of downloads in the first hour. Instead of serving from a central server, popular `.icrep` files can use Workshop's BitTorrent distribution — the replay file format's block structure (header + per-256-tick LZ4 chunks) maps naturally to torrent pieces.

#### Unified Cryptographic Identity

Five systems independently use Ed25519 signing:
1. **Game netcode** — relay server signs `CertifiedMatchResult` (D007)
2. **Voice** — relay stamps speaker ID on forwarded voice packets (D059)
3. **Replay** — signature chain hashes each tick (05-FORMATS.md)
4. **Workshop** — package signatures (D049)
5. **Community servers** — SCR credential records (D052)

**Improvement:** A single `IdentityProvider` in `ic-net` manages the relay's signing key and exposes a `sign(payload: &[u8])` method. All five systems call this instead of independently managing `ed25519_dalek` instances. Key rotation (required for long-running servers) happens in one place. The `SignatureScheme` enum (D054) gates algorithm selection for all five systems uniformly.

#### Voice Preprocessing ↔ Workshop Audio Content

D059's audio preprocessing pipeline (noise suppression via `nnnoiseless`, echo cancellation via `speexdsp-rs`, Opus encoding via `audiopus`) is a complete audio processing chain that has value beyond real-time voice:

**Workshop audio quality tool:** Content creators producing voice packs, announcer mods, and sound effect packs for the Workshop can use the same preprocessing pipeline as a quality normalization tool (`ic audio normalize`). This ensures Workshop audio content meets consistent quality standards (sample rate, loudness, noise floor) without requiring creators to own professional audio software.

**Workshop voice effect presets:** The DSP stages used in voice effects (biquad filters, compressors, reverb, distortion) are shared infrastructure between the real-time voice effects chain and the `ic audio effect` CLI tools. Content creators developing custom voice effect presets use the same `ic audio effect preview` and `ic audio effect validate` commands that the engine uses to instantiate chains at runtime. The YAML preset format is a Workshop resource type — presets are published, versioned, rated, and discoverable through the same Workshop browser as maps and mods.

#### Adaptive Quality Is the Shared Pattern

The meta-pattern across all three systems is **adaptive quality degradation** — gracefully reducing fidelity when resources are constrained, rather than failing:

| System             | Constrained Resource      | Degradation Response                           | Recovery                               |
| ------------------ | ------------------------- | ---------------------------------------------- | -------------------------------------- |
| **Voice**          | Bandwidth/loss            | Reduce Opus bitrate (32→16 kbps), increase FEC | Ramp back over 2s                      |
| **Game**           | Latency                   | Increase run-ahead, pad order submission       | Reduce run-ahead as RTT improves       |
| **Workshop**       | Bandwidth during gameplay | Pause/throttle downloads                       | Resume at full speed post-game         |
| **Spectator feed** | Relay bandwidth           | Switch to P2P fan-out, reduce feed rate        | Return to relay-direct when load drops |
| **Replay**         | Storage                   | `Minimal` embedding mode (no map/assets)       | `SelfContained` when storage allows    |

All five responses share the same trigger signal (`ConnectionQuality`), the same reaction pattern (reduce → adapt → recover), and the same design philosophy (D015's efficiency pyramid — better algorithms before more resources). Building them on shared infrastructure ensures they cooperate rather than compete.

---

---

## D065: Tutorial & New Player Experience — Five-Layer Onboarding System

|                |                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                  |
| **Phase**      | Phase 3 (contextual hints, new player pipeline, progressive discovery), Phase 4 (Commander School campaign, skill assessment, post-game learning, tutorial achievements)                                                                                                                  |
| **Depends on** | D004 (Lua Scripting), D021 (Branching Campaigns), D033 (QoL Toggles — experience profiles), D034 (SQLite — hint history, skill estimate), D036 (Achievements), D038 (Scenario Editor — tutorial modules), D043 (AI Behavior Presets — tutorial AI tier)                                   |
| **Driver**     | OpenRA's new player experience is a wiki link to a YouTube video. The Remastered Collection added basic tooltips. No open-source RTS has a structured onboarding system. The genre's complexity is the #1 barrier to new players — players who bounce from one failed match never return. |

**Revision note (2026-02-22):** Revised D065 to support a single cross-device tutorial curriculum with semantic prompt rendering (`InputCapabilities`/`ScreenClass` aware), a skippable first-run controls walkthrough, camera bookmark instruction, and a touch-focused Tempo Advisor (advisory only). This revision incorporates confirmatory prior-art research on mobile strategy UX, platform adaptation, and community distribution friction (`research/mobile-rts-ux-onboarding-community-platform-analysis.md`).

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted (Revised 2026-02-22)
- **Phase:** Phase 3 (pipeline, hints, progressive discovery), Phase 4 (Commander School, assessment, post-game learning)
- **Canonical for:** Tutorial/new-player onboarding architecture, cross-device tutorial prompt model, controls walkthrough, and onboarding-related adaptive pacing
- **Scope:** `ic-ui` onboarding systems, tutorial Lua APIs, hint history + skill estimate persistence (SQLite/D034), cross-device prompt rendering, player-facing tutorial UX
- **Decision:** IC uses a **five-layer onboarding system** (campaign tutorial + contextual hints + first-run pipeline + skill assessment + adaptive pacing) integrated across the product rather than a single tutorial screen/mode.
- **Why:** RTS newcomers, veterans, and experienced OpenRA/Remastered players have different onboarding needs; one fixed tutorial path either overwhelms or bores large groups.
- **Non-goals:** Separate desktop and mobile tutorial campaigns; forced full tutorial completion before normal play; mouse-only prompt wording in shared tutorial content.
- **Invariants preserved:** Input remains abstracted (`InputCapabilities`/`ScreenClass` and core `InputSource` design); tutorial pacing/advisory systems are UI/client-level and do not alter simulation determinism.
- **Defaults / UX behavior:** Commander School is a first-class campaign; controls walkthrough is short and skippable; tutorial prompts are semantic and rendered per device/input mode.
- **Mobile / accessibility impact:** Touch platforms use the same curriculum with device-specific prompt text/UI anchors; Tempo Advisor is advisory-only and warns without blocking player choice (except existing ranked authority rules elsewhere).
- **Public interfaces / types / commands:** `InputPromptAction`, `TutorialPromptContext`, `ResolvedInputPrompt`, `UiAnchorAlias`, `LayoutAnchorResolver`, `TempoAdvisorContext`
- **Affected docs:** `src/17-PLAYER-FLOW.md`, `src/02-ARCHITECTURE.md`, `src/decisions/09b-networking.md`, `src/decisions/09d-gameplay.md`
- **Revision note summary:** Added cross-device semantic prompts, skippable controls walkthrough, camera bookmark teaching, and touch tempo advisory hooks based on researched mobile UX constraints.
- **Keywords:** tutorial, commander school, onboarding, cross-device prompts, controls walkthrough, tempo advisor, mobile tutorial, semantic action prompts

### Problem

Classic RTS games are notoriously hostile to new players. The original Red Alert's "tutorial" was Mission 1 of the Allied campaign, which assumed the player already understood control groups, attack-move, and ore harvesting. OpenRA offers no in-game tutorial at all. The Remastered Collection added tooltips and a training mode but no structured curriculum.

IC targets three distinct player populations and must serve all of them:

1. **Complete RTS newcomers** — never played any RTS. Need camera, selection, movement, and minimap/radar concepts before anything else.
2. **Lapsed RA veterans** — played in the 90s, remember concepts vaguely, need a refresher on specific mechanics and new IC features.
3. **OpenRA / Remastered players** — know RA well but may not know IC-specific features (weather, experience profiles, campaign persistence, console commands).

A single-sized tutorial serves none of them well. Veterans resent being forced through basics. Newcomers drown in information presented too fast. The system must adapt.

### Decision

A five-layer tutorial system that integrates throughout the player experience rather than existing as a single screen or mode. Each layer operates independently — players benefit from whichever layers they encounter, in any order.

**Cross-device curriculum rule:** IC ships one tutorial curriculum (Commander School + hints + skill assessment), not separate desktop and mobile tutorial campaigns. Tutorial content defines **semantic actions** ("move command", "assign control group", "save camera bookmark") and the UI layer renders device-specific instructions and highlights using `InputCapabilities` and `ScreenClass`.

**Controls walkthrough addition (Layer 3):** A short, skippable controls walkthrough (60-120s) is offered during first-run onboarding. It teaches camera pan/zoom, selection, context commands, minimap/radar, control groups, build UI basics, and camera bookmarks for the active platform before the player enters Commander School or regular play.

### Layer 1 — Commander School (Tutorial Campaign)

A dedicated 10-mission tutorial campaign using the D021 branching graph system, accessible from `Main Menu → Campaign → Commander School`. This is a first-class campaign, not a popup sequence — it has briefings, EVA voice lines, map variety, and a branching graph with remedial branches for players who struggle. It is shared across desktop and touch platforms; only prompt wording and UI highlight anchors differ by platform.

#### Mission Structure

```
                    ┌─────────────────┐
                    │  01: First Steps │  Camera, selection, movement
                    │  (Movement Only) │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ pass         │ struggle     │
              ▼              ▼              │
    ┌─────────────────┐  ┌──────────────┐  │
    │  02: First Blood │  │  01r: Camera  │  │  Remedial: just camera + selection
    │  (Basic Combat)  │  │  Basics      │──┘
    └────────┬────────┘  └──────────────┘
             │
             ▼
    ┌─────────────────┐
    │  03: Base Camp   │  Build a power plant + barracks
    │  (Construction)  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  04: Supply Line │  Build a refinery, protect harvesters
    │  (Economy)       │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  05: Hold the    │  Walls, turrets, repair
    │  Line (Defense)  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  06: Command     │  Control groups, hotkeys, camera bookmarks,
    │  Basics          │  queue commands
    │  (Controls)      │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  07: Combined    │  Rock-paper-scissors: infantry vs vehicles
    │  Arms            │  vs air; counter units
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  08: Iron        │  Full skirmish vs tutorial AI; apply
    │  Curtain Rising  │  everything learned
    │  (First Skirmish)│
    └────────┬────────┘
             │
       ┌─────┴─────┐
       │ victory    │ defeat
       ▼            ▼
    ┌────────┐  ┌──────────────┐
    │  09:   │  │  08r: Second │  Retry with hints enabled
    │  Multi │  │  Chance      │──► loops back to 09
    │  player│  └──────────────┘
    │  Intro │
    └───┬────┘
        │
        ▼
    ┌─────────────────┐
    │  10: Advanced    │  Tech tree, superweapons, naval,
    │  Tactics         │  weather effects (optional)
    └─────────────────┘
```

Every mission is **skippable**. Players can jump to any unlocked mission from the Commander School menu. Completing mission N unlocks mission N+1 (and its remedial branch, if any). Veterans can skip directly to Mission 08 (First Skirmish) or 10 (Advanced Tactics) after a brief skill check.

#### Tutorial AI Difficulty Tier

Commander School uses a dedicated tutorial AI difficulty tier below D043's Easy:

| AI Tier           | Behavior                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Tutorial**      | Scripted responses only. Attacks on cue. Does not exploit weaknesses. Builds at fixed timing. |
| **Easy** (D043)   | Priority-based; slow reactions; limited tech tree; no harassment                              |
| **Normal** (D043) | Full priority-based; moderate aggression; uses counters                                       |
| **Hard+** (D043)  | Full AI with aggression/strategy axes                                                         |

The Tutorial tier is **Lua-scripted per mission**, not a general-purpose AI. Mission 02's AI sends two rifle squads after 3 minutes. Mission 08's AI builds a base and attacks after 5 minutes. The behavior is pedagogically tuned — the AI exists to teach, not to win.

#### Experience-Profile Awareness

Commander School adapts to the player's experience profile (D033):

- **New to RTS:** Full hints, slower pacing, EVA narration on every new concept
- **RA veteran / OpenRA player:** Skip basic missions, focus on IC-specific features (weather, console, experience profiles)
- **Custom:** Player chose which missions to unlock via the skill assessment (Layer 3)

The experience profile is read from the first-launch self-identification (see `17-PLAYER-FLOW.md`). It is not a difficulty setting — it controls *what is taught*, not *how hard the AI fights*. On touch devices, "slower pacing" also informs the default tutorial tempo recommendation (`slower` on phone/tablet, advisory only and overridable by the player).

#### Campaign YAML Definition

```yaml
# campaigns/tutorial/campaign.yaml
campaign:
  id: commander_school
  title: "Commander School"
  description: "Learn to command — from basic movement to full-scale warfare"
  start_mission: tutorial_01
  category: tutorial  # displayed under Campaign → Tutorial, not Campaign → Allied/Soviet
  icon: tutorial_icon
  badge: commander_school  # shown on campaign menu for players who haven't started

  persistent_state:
    unit_roster: false        # tutorial missions don't carry units forward
    veterancy: false
    resources: false
    equipment: false
    custom_flags:
      skills_demonstrated: []  # tracks which skills the player has shown

  missions:
    tutorial_01:
      map: missions/tutorial/01-first-steps
      briefing: briefings/tutorial/01.yaml
      skip_allowed: true
      experience_profiles: [new_to_rts, all]  # shown to these profiles
      outcomes:
        pass:
          description: "Mission complete"
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection, movement] }
        struggle:
          description: "Player struggled with camera/selection"
          next: tutorial_01r
        skip:
          description: "Player skipped"
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection, movement] }

    tutorial_01r:
      map: missions/tutorial/01r-camera-basics
      briefing: briefings/tutorial/01r.yaml
      remedial: true  # UI shows this as a "practice" mission, not a setback
      outcomes:
        pass:
          next: tutorial_02
          state_effects:
            append_flag: { skills_demonstrated: [camera, selection] }

    tutorial_02:
      map: missions/tutorial/02-first-blood
      briefing: briefings/tutorial/02.yaml
      skip_allowed: true
      outcomes:
        pass:
          next: tutorial_03
          state_effects:
            append_flag: { skills_demonstrated: [attack, force_fire] }
        skip:
          next: tutorial_03

    # ... missions 03–10 follow the same pattern ...

    tutorial_08:
      map: missions/tutorial/08-first-skirmish
      briefing: briefings/tutorial/08.yaml
      skip_allowed: false  # this one is the capstone — encourage completion
      outcomes:
        victory:
          next: tutorial_09
          state_effects:
            append_flag: { skills_demonstrated: [full_skirmish] }
        defeat:
          next: tutorial_08r
          debrief: briefings/tutorial/08-debrief-defeat.yaml

    tutorial_08r:
      map: missions/tutorial/08-first-skirmish
      briefing: briefings/tutorial/08r.yaml
      remedial: true
      adaptive:
        on_previous_defeat:
          bonus_resources: 3000
          bonus_units: [medium_tank, medium_tank]
          enable_tutorial_hints: true  # force hints on for retry
      outcomes:
        victory:
          next: tutorial_09
        defeat:
          next: tutorial_08r  # can retry indefinitely

    tutorial_09:
      map: missions/tutorial/09-multiplayer-intro
      briefing: briefings/tutorial/09.yaml
      skip_allowed: true
      outcomes:
        pass:
          next: tutorial_10
        skip:
          next: tutorial_10

    tutorial_10:
      map: missions/tutorial/10-advanced-tactics
      briefing: briefings/tutorial/10.yaml
      optional: true  # not required for "Graduate" achievement
      experience_profiles: [all]
      outcomes:
        pass:
          description: "Commander School complete"
```

#### Tutorial Mission Lua Script Pattern

Each tutorial mission uses the `Tutorial` Lua global to manage the teaching flow:

```lua
-- missions/tutorial/02-first-blood.lua
-- Mission 02: First Blood — introduces basic combat

-- Mission setup
function OnMissionStart()
    -- Disable sidebar building (not taught yet)
    Tutorial.RestrictSidebar(true)

    -- Spawn player units
    local player = Player.GetPlayer("GoodGuy")
    local rifles = Actor.Create("e1", player, entry_south, { count = 5 })

    -- Spawn enemy patrol (tutorial AI — scripted, not general AI)
    local enemy = Player.GetPlayer("BadGuy")
    local patrol = Actor.Create("e1", enemy, patrol_start, { count = 3 })

    -- Step 1: Introduce the enemy
    Tutorial.SetStep("spot_enemy", {
        title = "Enemy Contact",
        hint = "Red units are hostile. Select your soldiers and right-click an enemy to attack.",
        focus_area = patrol_start,       -- camera pans here
        highlight_ui = nil,              -- no UI highlight needed
        eva_line = "enemy_units_detected",
        completion = { type = "kill", count = 1 }  -- complete when player kills any enemy
    })
end

-- Step progression
function OnStepComplete(step_id)
    if step_id == "spot_enemy" then
        Tutorial.SetStep("attack_move", {
            title = "Attack-Move",
            hint = "Hold Ctrl and right-click to attack-move. Your units will engage enemies along the way.",
            highlight_ui = "attack_move_button",  -- highlights the A-move button on the command bar
            eva_line = "commander_tip_attack_move",
            completion = { type = "action", action = "attack_move" }
        })

    elseif step_id == "attack_move" then
        Tutorial.SetStep("clear_area", {
            title = "Clear the Area",
            hint = "Destroy all remaining enemies to complete the mission.",
            completion = { type = "kill_all", faction = "BadGuy" }
        })

    elseif step_id == "clear_area" then
        -- Mission complete
        Campaign.complete("pass")
    end
end

-- Detect struggle: if player hasn't killed anyone after 2 minutes
Trigger.AfterDelay(DateTime.Minutes(2), function()
    if Tutorial.GetCurrentStep() == "spot_enemy" then
        Tutorial.ShowHint("Try selecting your units (click + drag) then right-clicking on an enemy.")
        -- If still stuck after 4 minutes total, the campaign graph routes to a remedial mission
    end
end)

-- Detect struggle: player lost most units without killing enemies
Trigger.OnAllKilledOrCaptured(Player.GetPlayer("GoodGuy"):GetActors(), function()
    Campaign.complete("struggle")
end)
```

### Layer 2 — Contextual Hints (YAML-Driven, Always-On)

Contextual hints appear as translucent overlay callouts during gameplay, triggered by game state. They are NOT part of Commander School — they work in any game mode (skirmish, multiplayer, custom campaigns). Modders can author custom hints for their mods.

#### Hint Pipeline

```
  HintTrigger          HintFilter           HintRenderer
  (game state     →    (suppression,    →   (overlay, fade,
   evaluation)          cooldowns,           positioning,
                        experience           dismiss)
                        profile)
```

1. **HintTrigger** evaluates conditions against the current game state every N ticks (configurable, default: every 150 ticks / 5 seconds). Triggers are YAML-defined — no Lua required for standard hints.
2. **HintFilter** suppresses hints the player doesn't need: already dismissed, demonstrated mastery (performed the action N times), cooldown not expired, experience profile excludes this hint.
3. **HintRenderer** displays the hint as a UI overlay — positioned near the relevant screen element, with fade-in/fade-out, dismiss button, and "don't show again" toggle.

#### Hint Definition Schema (`hints.yaml`)

```yaml
# hints/base-game.yaml — ships with the game
# Modders create their own hints.yaml in their mod directory

hints:
  - id: idle_harvester
    title: "Idle Harvester"
    text: "Your harvester is sitting idle. Click it and right-click an ore field to start collecting."
    category: economy
    icon: hint_harvester
    trigger:
      type: unit_idle
      unit_type: "harvester"
      idle_duration_seconds: 15    # only triggers after 15s of idling
    suppression:
      mastery_action: harvest_command      # stop showing after player has issued 5 harvest commands
      mastery_threshold: 5
      cooldown_seconds: 120               # don't repeat more than once every 2 minutes
      max_shows: 10                       # never show more than 10 times total
    experience_profiles: [new_to_rts, ra_veteran]  # show to these profiles, not openra_player
    priority: high     # high priority hints interrupt low priority ones
    position: near_unit  # position hint near the idle harvester
    eva_line: null       # no EVA voice for this hint (too frequent)
    dismiss_action: got_it  # "Got it" button only — no "don't show again" on high-priority hints

  - id: negative_power
    title: "Low Power"
    text: "Your base is low on power. Build more Power Plants to restore production speed."
    category: economy
    icon: hint_power
    trigger:
      type: resource_threshold
      resource: power
      condition: negative        # power demand > power supply
      sustained_seconds: 10      # must be negative for 10s (not transient during building)
    suppression:
      mastery_action: build_power_plant
      mastery_threshold: 3
      cooldown_seconds: 180
      max_shows: 8
    experience_profiles: [new_to_rts]
    priority: high
    position: near_sidebar       # position near the build queue
    eva_line: low_power           # EVA says "Low power"

  - id: control_groups
    title: "Control Groups"
    text: "Select units and press Ctrl+1 to assign them to group 1. Press 1 to reselect them instantly."
    category: controls
    icon: hint_hotkey
    trigger:
      type: unit_count
      condition: ">= 8"         # suggest control groups when player has 8+ units
      without_action: assign_control_group  # only if they haven't used groups yet
      sustained_seconds: 60      # must have 8+ units for 60s without grouping
    suppression:
      mastery_action: assign_control_group
      mastery_threshold: 1       # one use = mastery for this hint
      cooldown_seconds: 300
      max_shows: 3
    experience_profiles: [new_to_rts]
    priority: medium
    position: screen_top         # general hint, not tied to a unit
    eva_line: commander_tip_control_groups

  - id: tech_tree_reminder
    title: "Tech Up"
    text: "New units become available as you build advanced structures. Check the sidebar for greyed-out options."
    category: strategy
    icon: hint_tech
    trigger:
      type: time_without_action
      action: build_tech_structure
      time_minutes: 5            # 5 minutes into a game with no tech building
      min_game_time_minutes: 3   # don't trigger in the first 3 minutes
    suppression:
      mastery_action: build_tech_structure
      mastery_threshold: 1
      cooldown_seconds: 600
      max_shows: 3
    experience_profiles: [new_to_rts]
    priority: low
    position: near_sidebar

  # Modder-authored hint example (from a hypothetical "Chrono Warfare" mod):
  - id: chrono_shift_intro
    title: "Chrono Shift Ready"
    text: "Your Chronosphere is charged! Select units, then click the Chronosphere and pick a destination."
    category: mod_specific
    icon: hint_chrono
    trigger:
      type: building_ready
      building_type: "chronosphere"
      ability: "chrono_shift"
      first_time: true           # only on the first Chronosphere completion per game
    suppression:
      mastery_action: use_chrono_shift
      mastery_threshold: 1
      cooldown_seconds: 0        # first_time already limits it
      max_shows: 1
    experience_profiles: [all]
    priority: high
    position: near_building
    eva_line: chronosphere_ready
```

#### Trigger Types (Extensible)

| Trigger Type          | Parameters                                         | Fires When                                                     |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `unit_idle`           | `unit_type`, `idle_duration_seconds`               | A unit of that type has been idle for N seconds                |
| `resource_threshold`  | `resource`, `condition`, `sustained_seconds`       | A resource exceeds/falls below a threshold for N seconds       |
| `unit_count`          | `condition`, `without_action`, `sustained_seconds` | Player has N units and hasn't performed the suggested action   |
| `time_without_action` | `action`, `time_minutes`, `min_game_time_minutes`  | N minutes pass without the player performing a specific action |
| `building_ready`      | `building_type`, `ability`, `first_time`           | A building completes construction (or its ability charges)     |
| `first_encounter`     | `entity_type`                                      | Player sees an enemy unit/building type for the first time     |
| `damage_taken`        | `damage_source_type`, `threshold_percent`          | Player units take significant damage from a specific type      |
| `area_enter`          | `area`, `unit_types`                               | Player units enter a named map region                          |
| `custom`              | `lua_condition`                                    | Lua expression evaluates to true (Tier 2 mods only)            |

Modders define new triggers via Lua (Tier 2) or WASM (Tier 3). The `custom` trigger type is a Lua escape hatch for conditions that don't fit the built-in types.

#### Hint History (SQLite)

```sql
-- In player.db (D034)
CREATE TABLE hint_history (
    hint_id       TEXT NOT NULL,
    show_count    INTEGER NOT NULL DEFAULT 0,
    last_shown    INTEGER,          -- Unix timestamp
    dismissed     BOOLEAN NOT NULL DEFAULT FALSE,  -- "Don't show again"
    mastery_count INTEGER NOT NULL DEFAULT 0,      -- times the mastery_action was performed
    PRIMARY KEY (hint_id)
);
```

The hint system queries this table before showing each hint. `mastery_count >= mastery_threshold` suppresses the hint permanently. `dismissed = TRUE` suppresses it permanently. `last_shown + cooldown_seconds > now` suppresses it temporarily.

#### QoL Integration (D033)

Hints are individually toggleable per category in `Settings → QoL → Hints`:

| Setting            | Default (New to RTS) | Default (RA Vet) | Default (OpenRA) |
| ------------------ | -------------------- | ---------------- | ---------------- |
| Economy hints      | On                   | On               | Off              |
| Combat hints       | On                   | Off              | Off              |
| Controls hints     | On                   | On               | Off              |
| Strategy hints     | On                   | Off              | Off              |
| Mod-specific hints | On                   | On               | On               |
| Hint frequency     | Normal               | Reduced          | Minimal          |
| EVA voice on hints | On                   | Off              | Off              |

`/hints` console commands (D058): `/hints list`, `/hints enable <category>`, `/hints disable <category>`, `/hints reset`, `/hints suppress <id>`.

### Layer 3 — New Player Pipeline

The first-launch flow (see `17-PLAYER-FLOW.md`) includes a self-identification step:

```
Theme Selection (D032) → Self-Identification → Controls Walkthrough (optional) → Tutorial Offer → Main Menu
```

#### Self-Identification Gate

```
┌──────────────────────────────────────────────────┐
│  WELCOME, COMMANDER                              │
│                                                  │
│  How familiar are you with real-time strategy?   │
│                                                  │
│  ► New to RTS games                              │
│  ► Played some RTS games before                  │
│  ► Red Alert veteran                             │
│  ► OpenRA / Remastered player                    │
│  ► Skip — just let me play                       │
│                                                  │
└──────────────────────────────────────────────────┘
```

This sets the `experience_profile` used by all five layers. The profile is stored in `player.db` (D034) and changeable in `Settings → QoL → Experience Profile`.

| Selection           | Experience Profile | Default Hints      | Tutorial Offer                                   |
| ------------------- | ------------------ | ------------------ | ------------------------------------------------ |
| New to RTS          | `new_to_rts`       | All on             | "Would you like to start with Commander School?" |
| Played some RTS     | `rts_player`       | Economy + Controls | "Commander School available in Campaigns"        |
| Red Alert veteran   | `ra_veteran`       | Economy only       | Badge on campaign menu                           |
| OpenRA / Remastered | `openra_player`    | Mod-specific only  | Badge on campaign menu                           |
| Skip                | `skip`             | All off            | No offer                                         |

#### Controls Walkthrough (Phase 3, Skippable)

A short controls walkthrough is offered immediately after self-identification. It is **platform-specific in presentation** and **shared in intent**:

- **Desktop:** mouse/keyboard prompts ("Right-click to move", `Ctrl+F5` to save camera bookmark)
- **Tablet:** touch prompts with sidebar + on-screen hotbar highlights
- **Phone:** touch prompts with build drawer, command rail, minimap cluster, and bookmark dock highlights

The walkthrough teaches only control fundamentals (camera pan/zoom, selection, context commands, control groups, minimap/radar, camera bookmarks, and build UI basics) and ends with three options:
- `Start Commander School`
- `Practice Sandbox`
- `Skip to Game`

This keeps D065's early experience friendly on touch devices without duplicating Commander School missions.

#### Canonical Input Action Model and Official Binding Profiles

To keep desktop, touch, Steam Deck, TV/gamepad, tutorials, and accessibility remaps aligned, D065 defines a **single semantic input action catalog**. The game binds physical inputs to semantic actions; tutorial prompts, the Controls Quick Reference, and the Controls-Changed Walkthrough all render from the same catalog.

**Design rule:** IC does not define "the keyboard layout" as raw keys first. It defines **actions** first, then ships official binding profiles per device/input class.

**Semantic action categories (canonical):**
- **Camera** — pan, zoom, center-on-selection, cycle alerts, save/jump camera bookmark, minimap jump/scrub
- **Selection & Orders** — select, add/remove selection, box select, deselect, context command, attack-move, guard, stop, force action, deploy, stance/ability shortcuts
- **Production & Build** — open/close build UI, category navigation, queue/cancel, structure placement confirm/cancel/rotate (module-specific), repair/sell/context build actions
- **Control Groups** — select group, assign group, add-to-group, center group
- **Communication & Coordination** — open chat, channel shortcuts, whisper, push-to-talk, ping wheel, chat wheel, minimap draw, tactical markers, callvote
- **UI / System** — pause/menu, scoreboard, controls quick reference, console (where supported), screenshot, replay controls, observer panels

**Official profile families (shipped defaults):**
- `Classic RA (KBM)` — preserves classic RTS muscle memory where practical
- `OpenRA (KBM)` — optimized for OpenRA veterans (matching common command expectations)
- `Modern RTS (KBM)` — IC default desktop profile tuned for discoverability and D065 onboarding
- `Gamepad Default` — cursor/radial hybrid for TV/console-style play
- `Steam Deck Default` — Deck-specific variant (touchpads/optional gyro/OSK-aware), not just generic gamepad
- `Touch Phone` and `Touch Tablet` — gesture + HUD layout profiles (defined by D059/D065 mobile control rules; not "key" maps, but still part of the same action catalog)

**Binding profile behavior:**
- Profiles are versioned. A local profile stores either a stock profile ID or a **diff** from a stock profile (`Custom`).
- Rebinding UI edits semantic actions, never hardcodes UI-widget-local shortcuts.
- A single action may have multiple bindings (e.g., keyboard key + mouse button chord, or gamepad button + radial fallback).
- Platform-incompatible actions are hidden or remapped with a visible alternative (no dead-end actions on controller/touch).
- Tutorial prompts and quick reference entries resolve against the **active profile + current `InputCapabilities` + `ScreenClass`**.

**Official baseline defaults (high-level, normative examples):**

| Action | Desktop KBM default (Modern RTS) | Steam Deck / Gamepad default | Touch default |
| ------ | -------------------------------- | ---------------------------- | ------------- |
| Select / context command | Left-click / Right-click | Cursor confirm button (`A`/`Cross`) | Tap |
| Box select | Left-drag | Hold modifier + cursor drag / touchpad drag | Hold + drag |
| Attack-Move | `A` then target | Command radial → Attack-Move | Command rail `Attack-Move` (optional) |
| Guard | `Q` then target/self | Command radial → Guard | Command rail `Guard` (optional) |
| Stop | `S` | Face button / radial shortcut | Visible button in command rail/overflow |
| Deploy | `D` | Context action / radial | Context tap or rail button |
| Control groups | `1–0`, `Ctrl+1–0` | D-pad pages / radial groups (profile-defined) | Bottom control-group bar chips |
| Camera bookmarks | `F5–F8`, `Ctrl+F5–F8` | D-pad/overlay quick slots (profile-defined) | Bookmark dock near minimap (tap/long-press) |
| Open chat | `Enter` | Menu shortcut + OSK | Chat button + OS keyboard |
| Controls Quick Reference | `F1` | Pause → Controls (optionally bound) | Pause → Controls |

**Controller / Deck interaction model requirements (official profiles):**
- Controller profiles must provide a visible, discoverable path to all high-frequency orders (context command + command radial + pause/quick reference fallback)
- Steam Deck profile may use touchpad cursor and optional gyro precision, but every action must remain usable with gamepad-only input
- Text-heavy actions (chat, console where allowed) may invoke OSK; gameplay-critical actions may not depend on text entry
- Communication actions (PTT, ping wheel, chat wheel) must remain reachable without leaving combat camera control for more than one gesture/button chord

**Accessibility requirements for all profiles:**
- Full rebinding across keyboard, mouse, gamepad, and Deck controls
- Hold/toggle alternatives (e.g., PTT, radial hold vs tap-toggle, sticky modifiers)
- Adjustable repeat rates, deadzones, stick curves, cursor acceleration, and gyro sensitivity (where supported)
- One-handed / reduced-dexterity viable alternatives for high-frequency commands (via remaps, radials, or quick bars)
- Controls Quick Reference always reflects the player's current bindings and accessibility overrides, not only stock defaults

**Competitive integrity note:** Binding/remap freedom is supported, but multi-action automation/macros remain governed by D033 competitive equalization policy. Official profiles define discoverable defaults, not privileged input capabilities.

#### Official Default Binding Matrix (v1, Normative Baseline)

The tables below define the **normative baseline defaults** for:
- `Modern RTS (KBM)`
- `Gamepad Default`
- `Steam Deck Default` (Deck-specific overrides and additions)

`Classic RA (KBM)` and `OpenRA (KBM)` are compatibility-oriented profiles layered on the same semantic action catalog. They may differ in key placement, but must expose the same actions and remain fully documented in the Controls Quick Reference.

**Controller naming convention (generic):**
- `Confirm` = primary face button (`A` / `Cross`)
- `Cancel` = secondary face button (`B` / `Circle`)
- `Cmd Radial` = default **hold** command radial button (profile-defined; `Y` / `Triangle` by default)
- `Menu` / `View` = start/select-equivalent buttons

**Steam Deck defaults:** Deck inherits `Gamepad Default` semantics but prefers **right trackpad cursor** and optional **gyro precision** for fine targeting. All actions remain usable without gyro.

##### Camera & Navigation

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Camera pan | Mouse to screen edge / Middle-mouse drag | Left stick | Left stick | Edge-scroll can be disabled; drag-pan remains |
| Camera zoom in | Mouse wheel up | `RB` (tap) or zoom radial | `RB` (tap) / two-finger trackpad pinch emulation optional | Profile may swap with category cycling if player prefers |
| Camera zoom out | Mouse wheel down | `LB` (tap) or zoom radial | `LB` (tap) / two-finger trackpad pinch emulation optional | Same binding family as zoom in |
| Center on selection | `C` | `R3` click | `R3` click / `L4` (alt binding) | Mode-safe in gameplay and observer views |
| Cycle recent alert | `Space` | `D-pad Down` | `D-pad Down` | In replay mode, `Space` is reserved for replay pause/play |
| Jump bookmark slot 1–4 | `F5–F8` | `D-pad Left/Right` page + quick slot overlay confirm | Bookmark dock overlay via `R5`, then face/d-pad select | Quick slots map to D065 bookmark system |
| Save bookmark slot 1–4 | `Ctrl+F5–F8` | Hold bookmark overlay + `Confirm` on slot | Hold bookmark overlay (`R5`) + slot click/confirm | Matches desktop/touch semantics |
| Open minimap focus / camera jump mode | Mouse click minimap | `View` + left stick (minimap focus mode) | Left trackpad minimap focus (default) / `View`+stick fallback | No hidden-only path; visible in quick reference |

##### Selection & Orders

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Select / Context command | Left-click select / Right-click context | Cursor + `Confirm` | Trackpad cursor + `R2` (`Confirm`) | Same semantic action, resolved by context |
| Add/remove selection modifier | `Shift` + click/drag | `LT` modifier while selecting | `L2` modifier while selecting | Also used for queue modifier in production UI |
| Box select | Left-drag | Hold selection modifier + cursor drag | Hold `L2` + trackpad drag (or stick drag) | Touch remains hold+drag (D059/D065 mobile) |
| Deselect | `Esc` / click empty UI space | `Cancel` | `B` / `Cancel` | `Cancel` also exits modal targeting |
| Attack-Move | `A`, then target | `Cmd Radial` → Attack-Move | `R1` radial → Attack-Move | High-frequency, surfaced in radial + quick ref |
| Guard | `Q`, then target/self | `Cmd Radial` → Guard | `R1` radial → Guard | `Q` avoids conflict with `Hold G` ping wheel |
| Stop | `S` | `X` (tap) | `X` (tap) / `R4` (alt) | Immediate command, no target required |
| Force Action / Force Fire | `F`, then target | `Cmd Radial` → Force Action | `R1` radial → Force Action | Name varies by module; semantic action remains |
| Deploy / Toggle deploy state | `D` | `Y` (tap, context-sensitive) or radial | `Y` / radial | Falls back to context action if deployable selected |
| Scatter / emergency disperse | `X` | `Cmd Radial` → Scatter | `R1` radial → Scatter | Optional per module/profile; present if module supports |
| Cycle selected-unit subtype | `Ctrl+Tab` | `D-pad Right` (selection mode) | `D-pad Right` (selection mode) | If selection contains mixed types |

##### Production, Build, and Control Groups

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Open/close production panel focus | `B` (focus build UI) / click sidebar | `D-pad Left` (tap) | `D-pad Left` (tap) | Does not pause; focus shifts to production UI |
| Cycle production categories | `Q/E` (while build UI focused) | `LB/RB` | `LB/RB` | Contextual to production focus mode |
| Queue selected item | `Enter` / left-click on item | `Confirm` | `R2` / trackpad click | Works in production focus mode |
| Queue 5 / repeat modifier | `Shift` + queue | `LT` + queue | `L2` + queue | Uses same modifier family as selection add |
| Cancel queue item | Right-click queue slot | `Cancel` on queue slot | `B` on queue slot | Contextual in queue UI |
| Set rally point / waypoint | `R`, then target | `Cmd Radial` → Rally/Waypoint | `R1` radial → Rally/Waypoint | Module-specific labeling |
| Building placement confirm | Left-click | `Confirm` | `R2` / trackpad click | Ghost preview remains visible |
| Building placement cancel | `Esc` / Right-click | `Cancel` | `B` | Consistent across modes |
| Building placement rotate (if supported) | `R` | `Y` (placement mode) | `Y` (placement mode) | Context-sensitive; only shown if module supports rotation |
| Select control group 1–0 | `1–0` | Control-group overlay + slot select (`D-pad Up` opens) | Bottom/back-button overlay (`L4`) + slot select | Touch uses bottom control-group bar chips |
| Assign control group 1–0 | `Ctrl+1–0` | Overlay + hold slot | Overlay + hold slot | Assignment is explicit to avoid accidental overwrite |
| Center camera on control group | Double-tap `1–0` | Overlay + reselect active slot | Overlay + reselect active slot | Mirrors desktop double-tap behavior |

##### Communication & Coordination (D059)

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Open chat input | `Enter` | `View` (hold) → chat input / OSK | `View` (hold) or keyboard shortcut + OSK | D058/D059 command browser remains available where supported |
| Team chat shortcut | `/team` prefix or channel toggle in chat UI | Chat panel channel tab | Chat panel channel tab | Semantic action resolves to channel switch |
| All-chat shortcut | `/all` prefix or channel toggle in chat UI | Chat panel channel tab | Chat panel channel tab | D058 `/s` remains one-shot send |
| Whisper | `/w <player>` or player context menu | Player card → Whisper | Player card → Whisper | Visible UI path required |
| Push-to-talk (PTT) | `CapsLock` (default, rebindable) | `LB` (hold) | `L1` (hold) | VAD optional, PTT default per D059 |
| Ping wheel | `Hold G` + mouse direction | `R3` (hold) + right stick | `R3` hold + stick or right trackpad radial | Matches D059 controller guidance |
| Quick ping | `G` tap | `D-pad Up` tap | `D-pad Up` tap | Tap vs hold disambiguation for ping wheel |
| Chat wheel | `Hold V` + mouse direction | `D-pad Right` hold | `D-pad Right` hold | Quick-reference shows phrase preview by profile |
| Minimap draw | `Alt` + minimap drag | Minimap focus mode + `RT` draw | Touch minimap draw or minimap focus mode + `R2` | Deck prefers touch minimap when available |
| Callvote menu / command | `/callvote` or Pause → Vote | Pause → Vote | Pause → Vote | Console command remains equivalent where exposed |
| Mute/unmute player | Scoreboard/context menu (`Tab`) | Scoreboard/context menu | Scoreboard/context menu | No hidden shortcut required |

##### UI / System / Replay / Spectator

| Semantic action | Modern RTS (KBM) | Gamepad Default | Steam Deck Default | Notes |
| --------------- | ---------------- | --------------- | ------------------ | ----- |
| Pause / Escape menu | `Esc` | `Menu` | `Menu` | In multiplayer opens escape menu, not sim pause |
| Scoreboard / player list | `Tab` | `View` (tap) | `View` (tap) | Supports mute/report/context actions |
| Controls Quick Reference | `F1` | Pause → Controls (bindable shortcut optional) | `L5` (hold) optional + Pause → Controls | Always reachable from pause/settings |
| Developer console (where supported) | `~` | Pause → Command Browser (GUI) | Pause → Command Browser (GUI) | No tilde requirement on non-keyboard platforms |
| Screenshot | `F12` | Pause → Photo/Share submenu (platform API) | `Steam`+`R1` (OS default) / in-game photo action | Platform-specific capture APIs may override |
| Replay pause/play (replay mode) | `Space` | `Confirm` | `R2` / `Confirm` | Mode-specific; does not conflict with live match `Space` alert cycle |
| Replay seek step ± | `,` / `.` | `LB/RB` (replay mode) | `LB/RB` (replay mode) | Profile may remap to triggers |
| Observer panel toggle | `O` | `Y` (observer mode) | `Y` (observer mode) | Only visible in spectator/caster contexts |

#### Workshop-Shareable Configuration Profiles (Optional)

Players can share **configuration profiles** via the Workshop as an optional, non-gameplay resource type. This includes:
- control bindings / input profiles (KBM, gamepad, Deck, touch layout preferences)
- accessibility presets (target size, hold/toggle behavior, deadzones, high-contrast HUD toggles)
- HUD/layout preference bundles (where layout profiles permit customization)
- camera/QoL preference bundles (non-authoritative client settings)

**Hard boundaries (safety / trust):**
- No secrets or credentials (API keys, tokens, account auth data) — those remain D047-only local secrets
- No absolute file paths, device serials, hardware IDs, or OS-specific personal data
- No executable scripts/macros bundled in config profiles
- No automatic application on install; imports always show a **scope + diff preview** before apply

**Compatibility metadata (required for controls-focused profiles):**
- semantic action catalog version
- target input class (`desktop_kbm`, `gamepad`, `deck`, `touch_phone`, `touch_tablet`)
- optional `ScreenClass` / layout profile compatibility hints
- notes for features required by the profile (e.g., gyro, rear buttons, command rail enabled)

**UX behavior:**
- Controls screen supports `Import`, `Export`, and `Share on Workshop`
- Workshop pages show the target device/profile class and a human-readable action summary (e.g., "Deck profile: right-trackpad cursor + gyro precision + PTT on L1")
- Applying a profile can be partial (controls-only, touch-only, accessibility-only) to avoid clobbering unrelated preferences

This follows the same philosophy as the Controls Quick Reference and D065 prompt system: shared semantics, device-specific presentation, and no hidden behavior.

#### Controls Quick Reference (Always Available, Non-Blocking)

D065 also provides a persistent **Controls Quick Reference** overlay/menu entry so advanced actions are never hidden behind memory or community lore.

**Rules:**
- Always available from gameplay (desktop, controller/Deck, and touch), pause menu, and settings
- Device-specific presentation, shared semantic content (same action catalog, different prompts/icons)
- Includes core actions + advanced/high-friction actions (camera bookmarks, command rail overrides, build drawer/sidebar interactions, chat/ping wheels)
- Dismissable, searchable, and safe to open/close without disrupting the current mode
- Can be pinned in reduced form during early sessions (optional setting), then auto-unpins as the player demonstrates mastery

This is a **reference aid**, not a tutorial gate. It never blocks gameplay and does not require completion.

#### Controls-Changed Walkthrough (One-Time After Input UX Changes)

When a game update changes control defaults, official input profile mappings, touch gesture behavior, command-rail mappings, or HUD placements in a way that affects muscle memory, D065 can show a short **What's Changed in Controls** walkthrough on next launch.

**Behavior:**
- Triggered by a local controls-layout/version mismatch (e.g., input profile schema version or layout profile revision)
- One-time prompt per affected profile/device; skippable and replayable later from Settings
- Focuses only on changed interactions (not a full tutorial replay)
- Prioritizes touch-platform changes (where discoverability regressions are most likely), but desktop can use it too
- Links to the Controls Quick Reference and Commander School for deeper refreshers

**Philosophy fit:** This preserves discoverability and reduces frustration without forcing players through onboarding again. It is a reversible UI aid, not a simulation change.

#### Skill Assessment (Phase 4)

After Commander School Mission 01 (or as a standalone 2-minute exercise accessible from `Settings → QoL → Recalibrate`), the engine estimates the player's baseline skill:

```
┌──────────────────────────────────────────────────┐
│  SKILL CALIBRATION (2 minutes)                   │
│                                                  │
│  Complete these exercises:                       │
│  ✓  Select and move units to waypoints           │
│  ✓  Select specific units from a mixed group     │
│  ►  Camera: pan to each flashing area            │
│  ►  Optional: save/jump a camera bookmark        │
│     Timed combat: destroy targets in order       │
│                                                  │
│  [Skip Assessment]                               │
└──────────────────────────────────────────────────┘
```

Measures:
- **Selection speed** — time to select correct units from a mixed group
- **Camera fluency** — time to pan to each target area
- **Camera bookmark fluency (optional)** — time to save and jump to a bookmarked location (measured only on platforms where bookmarks are surfaced in the exercise)
- **Combat efficiency** — accuracy of focused fire on marked targets
- **APM estimate** — actions per minute during the exercises

Results stored in SQLite:

```sql
-- In player.db
CREATE TABLE player_skill_estimate (
    player_id        TEXT PRIMARY KEY,
    selection_speed  INTEGER,    -- percentile (0–100)
    camera_fluency   INTEGER,
    bookmark_fluency INTEGER,    -- nullable/0 if exercise omitted
    combat_efficiency INTEGER,
    apm_estimate     INTEGER,    -- raw APM
    input_class      TEXT,       -- 'desktop', 'touch_phone', 'touch_tablet', 'deck'
    screen_class     TEXT,       -- 'Phone', 'Tablet', 'Desktop', 'TV'
    assessed_at      INTEGER,    -- Unix timestamp
    assessment_type  TEXT        -- 'tutorial_01' or 'standalone'
);
```

Percentiles are normalized **within input class** (desktop vs touch phone vs touch tablet vs deck) so touch players are not under-rated against mouse/keyboard baselines.

The skill estimate feeds Layers 2 and 4: hint frequency scales with skill (fewer hints for skilled players), the first skirmish AI difficulty recommendation uses the estimate, and touch tempo guidance can widen/narrow its recommended speed band based on demonstrated comfort.

### Layer 4 — Adaptive Pacing Engine

A background system (no direct UI — it shapes the other layers) that continuously estimates player mastery and adjusts the learning experience.

#### Inputs

- `hint_history` — which hints have been shown, dismissed, or mastered
- `player_skill_estimate` — from the skill assessment
- `gameplay_events` (D031) — actual in-game actions (build orders, APM, unit losses, idle time)
- `experience_profile` — self-identified experience level
- `input_capabilities` / `screen_class` — touch vs mouse/keyboard and phone/tablet layout context
- optional touch friction signals — misclick proxies, selection retries, camera thrash, pause frequency (single-player)

#### Outputs

- **Hint frequency multiplier** — scales the cooldown on all hints. A player demonstrating mastery gets longer cooldowns (fewer hints). A struggling player gets shorter cooldowns (more hints).
- **Difficulty recommendation** — suggested AI difficulty for the next skirmish. Displayed as a tooltip in the lobby AI picker: "Based on your recent games, Normal difficulty is recommended."
- **Feature discovery pacing** — controls how quickly progressive discovery notifications appear (Layer 5 below).
- **Touch tutorial prompt density** — controls how much on-screen guidance is shown for touch platforms (e.g., keep command-rail hints visible slightly longer for new phone players).
- **Recommended tempo band (advisory)** — preferred speed range for the current device/input/skill context. Used by UI warnings only; never changes sim state on its own.
- **Camera bookmark suggestion eligibility** — enables/disables "save camera location" hints based on camera fluency and map scale.
- **Tutorial EVA activation** — in the Allied/Soviet campaigns (not Commander School), first encounters with new unit types or buildings trigger a brief EVA line if the player hasn't completed the relevant Commander School mission. "Construction complete. This is a Radar Dome — it reveals the minimap." Only triggers once per entity type per campaign playthrough.

#### Pacing Algorithm

```
skill_estimate = weighted_average(
    0.3 × selection_speed_percentile,
    0.2 × camera_fluency_percentile,
    0.2 × combat_efficiency_percentile,
    0.15 × recent_apm_trend,           -- from gameplay_events
    0.15 × hint_mastery_rate            -- % of hints mastered vs shown
)

hint_frequency_multiplier = clamp(
    2.0 - (skill_estimate / 50.0),      -- range: 0.0 (no hints) to 2.0 (double frequency)
    min = 0.2,
    max = 2.0
)

recommended_difficulty = match skill_estimate {
    0..25   => "Easy",
    25..50  => "Normal",
    50..75  => "Hard",
    75..100 => "Brutal",
}
```

#### Mobile Tempo Advisor (Client-Only, Advisory)

The adaptive pacing engine also powers a **Tempo Advisor** for touch-first play. This system is intentionally non-invasive:

- **Single-player:** any speed allowed; warnings shown outside the recommended band; one-tap "Return to Recommended"
- **Casual multiplayer (host-controlled):** lobby shows a warning if the selected speed is outside the recommended band for participating touch players
- **Ranked multiplayer:** informational only; speed remains server/queue enforced (D055/D064, see `09b-networking.md`)

Initial default bands (experimental; tune from playtests):

| Context | Recommended Band | Default |
| ------- | ---------------- | ------- |
| Phone (new/average touch) | `slowest`-`normal` | `slower` |
| Phone (high skill estimate + tutorial complete) | `slower`-`faster` | `normal` |
| Tablet | `slower`-`faster` | `normal` |
| Desktop / Deck | unchanged | `normal` |

Commander School on phone/tablet starts at `slower` by default, but players may override it.

The advisor emits local-only analytics events (D031-compatible) such as `mobile_tempo.warning_shown` and `mobile_tempo.warning_dismissed` to validate whether recommendations reduce overload without reducing agency.

This is deterministic and entirely local — no LLM, no network, no privacy concerns. The pacing engine exists in `ic-ui` (not `ic-sim`) because it affects presentation, not simulation.

#### Implementation-Facing Interfaces (Client/UI Layer, No Sim Impact)

These types live in `ic-ui` / `ic-game` client codepaths (not `ic-sim`) and formalize camera bookmarks, semantic prompt resolution, and tempo advice:

```rust
pub struct CameraBookmarkSlot {
    pub slot: u8,                    // 1..=9
    pub label: Option<String>,       // local-only label
    pub world_pos: WorldPos,
    pub zoom_level: Option<FixedPoint>, // optional client camera zoom
}

pub struct CameraBookmarkState {
    pub slots: [Option<CameraBookmarkSlot>; 9],
    pub quick_slots: [u8; 4],        // defaults: [1, 2, 3, 4]
}

pub enum CameraBookmarkIntent {
    Save { slot: u8 },
    Jump { slot: u8 },
    Clear { slot: u8 },
    Rename { slot: u8, label: String },
}

pub enum InputPromptAction {
    Select,
    BoxSelect,
    MoveCommand,
    AttackCommand,
    AttackMoveCommand,
    OpenBuildUi,
    QueueProduction,
    UseMinimap,
    SaveCameraBookmark,
    JumpCameraBookmark,
}

pub struct TutorialPromptContext {
    pub input_capabilities: InputCapabilities,
    pub screen_class: ScreenClass,
    pub advanced_mode: bool,
}

pub struct ResolvedInputPrompt {
    pub text: String,             // localized, device-specific wording
    pub icon_tokens: Vec<String>, // e.g. "tap", "f5", "ctrl+f5"
}

pub struct UiAnchorAlias(pub String); // e.g. "primary_build_ui", "minimap_cluster"

pub enum TempoSpeedLevel {
    Slowest,
    Slower,
    Normal,
    Faster,
    Fastest,
}

pub struct TempoComfortBand {
    pub recommended_min: TempoSpeedLevel,
    pub recommended_max: TempoSpeedLevel,
    pub default_speed: TempoSpeedLevel,
    pub warn_above: Option<TempoSpeedLevel>,
    pub warn_below: Option<TempoSpeedLevel>,
}

pub enum InputSourceKind {
    MouseKeyboard,
    TouchPhone,
    TouchTablet,
    Controller,
}

pub struct TempoAdvisorContext {
    pub screen_class: ScreenClass,
    pub has_touch: bool,
    pub primary_input: InputSourceKind, // advisory classification only
    pub skill_estimate: Option<PlayerSkillEstimate>,
    pub mode: MatchMode,            // SP / casual MP / ranked
}

pub enum TempoWarning {
    AboveRecommendedBand,
    BelowRecommendedBand,
    TouchOverloadRisk,
}

pub struct TempoRecommendation {
    pub band: TempoComfortBand,
    pub warnings: Vec<TempoWarning>,
    pub rationale: Vec<String>,     // short UI strings
}
```

The touch/mobile control layer maps these UI intents to normal `PlayerOrder`s through the existing `InputSource` pipeline. Bookmarks and tempo advice remain local UI state; they never enter the deterministic simulation.

### Layer 5 — Post-Game Learning

After every match, the post-game stats screen (D034) includes a learning section:

#### Rule-Based Tips

YAML-driven pattern matching on `gameplay_events`:

```yaml
# tips/base-game-tips.yaml
tips:
  - id: idle_harvesters
    title: "Keep Your Economy Running"
    positive: false
    condition:
      type: stat_threshold
      stat: idle_harvester_seconds
      threshold: 30
    text: "Your harvesters sat idle for {idle_harvester_seconds} seconds. Idle harvesters mean lost income."
    learn_more: tutorial_04  # links to Commander School Mission 04 (Economy)

  - id: good_micro
    title: "Sharp Micro"
    positive: true
    condition:
      type: stat_threshold
      stat: average_unit_efficiency  # damage dealt / damage taken per unit
      threshold: 1.5
      direction: above
    text: "Your units dealt {ratio}× more damage than they took — strong micro."

  - id: no_tech
    title: "Explore the Tech Tree"
    positive: false
    condition:
      type: never_built
      building_types: [radar_dome, tech_center, battle_lab]
      min_game_length_minutes: 8
    text: "You didn't build any advanced structures. Higher-tech units can turn the tide."
    learn_more: tutorial_07  # links to Commander School Mission 07 (Combined Arms)
```

**Tip selection:** 1–3 tips per game. At least one positive ("you did this well") and at most one improvement ("you could try this"). Tips rotate — the engine avoids repeating the same tip in consecutive games.

#### Annotated Replay Mode

"Watch the moment" links in post-game tips jump to an annotated replay — the replay plays with an overlay highlighting the relevant moment:

```
┌────────────────────────────────────────────────────────────┐
│  REPLAY — ANNOTATED                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │   [Game replay playing at 0.5x speed]               │  │
│  │                                                      │  │
│  │   ┌─────────────────────────────────┐               │  │
│  │   │ 💡 Your harvester sat idle here │               │  │
│  │   │    for 23 seconds while ore was │               │  │
│  │   │    available 3 cells away.      │               │  │
│  │   │    [Return to Stats]            │               │  │
│  │   └─────────────────────────────────┘               │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ◄◄  ►  ►►  │ 4:23 / 12:01 │ 0.5x │                       │
└────────────────────────────────────────────────────────────┘
```

The annotation data is generated at match end (not during gameplay — no sim overhead). It's a list of `(tick, position, text)` tuples stored alongside the replay file.

#### Progressive Feature Discovery

Milestone-based main menu notifications that surface features over the player's first weeks:

| Milestone              | Feature Suggested   | Notification                                                               |
| ---------------------- | ------------------- | -------------------------------------------------------------------------- |
| First game completed   | Replays             | "Your game was saved as a replay. Watch it from the Replays menu."         |
| 3 games completed      | Experience profiles | "Did you know? You can switch gameplay presets in Settings → QoL."         |
| First multiplayer game | Ranked play         | "Ready for a challenge? Ranked matches calibrate your skill rating."       |
| 5 games completed      | Workshop            | "The Workshop has community maps, mods, and campaigns. Browse it anytime." |
| Commander School done  | Training mode       | "Try training mode to practice against AI with custom settings."           |
| 10 games completed     | Console             | "Press Enter and type / to access console commands."                       |
| First mod installed    | Mod profiles        | "Create mod profiles to switch between different mod setups quickly."      |

Maximum one notification per session. Three dismissals of the same category = never again. Discovery state stored in `hint_history` SQLite table (reuses the same suppression infrastructure as Layer 2).

`/discovery` console commands (D058): `/discovery list`, `/discovery reset`, `/discovery trigger <milestone>`.

### Tutorial Lua Global API

The `Tutorial` global is an IC-exclusive Lua extension available in all game modes (not just Commander School). Modders use it to build tutorial sequences in their own campaigns and scenarios.

```lua
-- === Step Management ===

-- Define and activate a tutorial step. The step is displayed as a hint overlay
-- and tracked for completion. Only one step can be active at a time.
-- Calling SetStep while a step is active replaces it.
Tutorial.SetStep(step_id, {
    title = "Step Title",                    -- displayed in the hint overlay header
    hint = "Instructional text for the player", -- main body text
    hint_action = "move_command",            -- optional semantic prompt token; renderer
                                             -- resolves to device-specific wording/icons
    focus_area = position_or_region,         -- optional: camera pans to this location
    highlight_ui = "ui_element_id",          -- optional: logical UI target or semantic alias
    eva_line = "eva_sound_id",               -- optional: play an EVA voice line
    completion = {                           -- when is this step "done"?
        type = "action",                     -- "action", "kill", "kill_all", "build",
                                             -- "select", "move_to", "research", "custom"
        action = "attack_move",              -- specific action to detect
        -- OR:
        count = 3,                           -- for "kill": kill N enemies
        -- OR:
        unit_type = "power_plant",           -- for "build": build this structure
        -- OR:
        lua_condition = "CheckCustomGoal()", -- for "custom": Lua expression
    },
})

-- Query the currently active step ID (nil if no step active)
local current = Tutorial.GetCurrentStep()

-- Manually complete the current step (triggers OnStepComplete)
Tutorial.CompleteStep()

-- Skip the current step without triggering completion
Tutorial.SkipStep()

-- === Hint Display ===

-- Show a one-shot hint (not tied to a step). Useful for contextual tips
-- within a mission script without the full step tracking machinery.
Tutorial.ShowHint(text, {
    title = "Optional Title",        -- nil = no title bar
    duration = 8,                    -- seconds before auto-dismiss (0 = manual dismiss only)
    position = "near_unit",          -- "near_unit", "near_building", "screen_top",
                                     -- "screen_center", "near_sidebar", position_table
    icon = "hint_icon_id",           -- optional icon
    eva_line = "eva_sound_id",       -- optional EVA line
    dismissable = true,              -- show dismiss button (default: true)
})

-- Show a hint anchored to a specific actor (follows the actor on screen)
Tutorial.ShowActorHint(actor, text, options)

-- Show a one-shot hint using a semantic action token. The renderer chooses
-- desktop/touch wording (e.g., "Right-click" vs "Tap") and icon glyphs.
Tutorial.ShowActionHint(action_name, {
    title = "Optional Title",
    highlight_ui = "ui_element_id",   -- logical UI target or semantic alias
    duration = 8,
})

-- Dismiss all currently visible hints
Tutorial.DismissAllHints()

-- === Camera & Focus ===

-- Smoothly pan the camera to a position or region
Tutorial.FocusArea(position_or_region, {
    duration = 1.5,                  -- pan duration in seconds
    zoom = 1.0,                      -- optional zoom level (1.0 = default)
    lock = false,                    -- if true, player can't move camera until unlock
})

-- Release a camera lock set by FocusArea
Tutorial.UnlockCamera()

-- === UI Highlighting ===

-- Highlight a UI element with a pulsing glow effect
Tutorial.HighlightUI(element_id, {
    style = "pulse",                 -- "pulse", "arrow", "outline", "dim_others"
    duration = 0,                    -- seconds (0 = until manually cleared)
    text = "Click here",             -- optional tooltip on the highlight
})

-- Clear a specific highlight
Tutorial.ClearHighlight(element_id)

-- Clear all highlights
Tutorial.ClearAllHighlights()

-- === Restrictions (for teaching pacing) ===

-- Disable sidebar/building (player can't construct until enabled)
Tutorial.RestrictSidebar(enabled)

-- Restrict which unit types the player can build
Tutorial.RestrictBuildOptions(allowed_types)  -- e.g., {"power_plant", "barracks"}

-- Restrict which orders the player can issue
Tutorial.RestrictOrders(allowed_orders)  -- e.g., {"move", "stop", "attack"}

-- Clear all restrictions
Tutorial.ClearRestrictions()

-- === Progress Tracking ===

-- Check if the player has demonstrated a skill (from campaign state flags)
local knows_groups = Tutorial.HasSkill("assign_control_group")

-- Get the number of times a specific hint has been shown (from hint_history)
local shown = Tutorial.GetHintShowCount("idle_harvester")

-- Check if a specific Commander School mission has been completed
local passed = Tutorial.IsMissionComplete("tutorial_04")

-- === Callbacks ===

-- Register a callback for when a step completes
-- (also available as the global OnStepComplete function)
Tutorial.OnStepComplete(function(step_id)
    -- step_id is the string passed to SetStep
end)

-- Register a callback for when the player performs a specific action
Tutorial.OnAction(action_name, function(context)
    -- context contains details: { actor = ..., target = ..., position = ... }
end)
```

#### UI Element IDs and Semantic Aliases for HighlightUI

The `element_id` parameter refers to logical UI element names (not internal Bevy entity IDs). These IDs may be:

1. **Concrete logical element IDs** (stable names for a specific surface, e.g. `attack_move_button`)
2. **Semantic UI aliases** resolved by the active layout profile (desktop sidebar vs phone build drawer)

This allows a single tutorial step to say "highlight the primary build UI" while the renderer picks the correct widget for `ScreenClass::Desktop`, `ScreenClass::Tablet`, or `ScreenClass::Phone`.

| Element ID            | What It Highlights                                           |
| --------------------- | ------------------------------------------------------------ |
| `sidebar`             | The entire build sidebar                                     |
| `sidebar_building`    | The building tab of the sidebar                              |
| `sidebar_unit`        | The unit tab of the sidebar                                  |
| `sidebar_item:<type>` | A specific buildable item (e.g., `sidebar_item:power_plant`) |
| `build_drawer`        | Phone build drawer (collapsed/expanded production UI)        |
| `minimap`             | The minimap                                                  |
| `minimap_cluster`     | Touch minimap cluster (minimap + alerts + bookmark dock)     |
| `command_bar`         | The unit command bar (move, stop, attack, etc.)              |
| `control_group_bar`   | Bottom control-group strip (desktop or touch)                |
| `command_rail`        | Touch command rail (attack-move/guard/force-fire, etc.)      |
| `command_rail_slot:<action>` | Specific touch command-rail slot (e.g., `command_rail_slot:attack_move`) |
| `attack_move_button`  | The attack-move button specifically                          |
| `deploy_button`       | The deploy button                                            |
| `guard_button`        | The guard button                                             |
| `money_display`       | The credits/resource counter                                 |
| `power_bar`           | The power supply/demand indicator                            |
| `radar_toggle`        | The radar on/off button                                      |
| `sell_button`         | The sell (wrench/dollar) button                              |
| `repair_button`       | The repair button                                            |
| `camera_bookmark_dock` | Touch bookmark quick dock (phone/tablet minimap cluster)    |
| `camera_bookmark_slot:<n>` | A specific bookmark slot (e.g., `camera_bookmark_slot:1`) |

Modders can register custom UI element IDs for custom UI panels via `Tutorial.RegisterUIElement(id, description)`.

**Semantic UI alias examples (built-in):**

| Alias | Desktop | Tablet | Phone |
| ----- | ------- | ------ | ----- |
| `primary_build_ui` | `sidebar` | `sidebar` | `build_drawer` |
| `minimap_cluster` | `minimap` | `minimap` | `minimap` (plus bookmark dock/alerts cluster) |
| `bottom_control_groups` | `command_bar` / HUD bar region | touch group bar | touch group bar |
| `command_rail_attack_move` | `attack_move_button` | command rail A-move slot | command rail A-move slot |
| `tempo_speed_picker` | lobby speed dropdown | same | mobile speed picker + advisory chip |

The alias-to-element mapping is provided by the active UI layout profile (`ic-ui`) and keyed by `ScreenClass` + `InputCapabilities`.

### Tutorial Achievements (D036)

| Achievement         | Condition                                           | Icon |
| ------------------- | --------------------------------------------------- | ---- |
| **Graduate**        | Complete Commander School (missions 01–09)          | 🎓    |
| **Honors Graduate** | Complete Commander School with zero retries         | 🏅    |
| **Quick Study**     | Complete Commander School in under 45 minutes total | ⚡    |
| **Helping Hand**    | Complete a community-made tutorial campaign         | 🤝    |

These are engine-defined achievements (not mod-defined). They use the D036 achievement system and sync with Steam achievements for Steam builds.

### Multiplayer Onboarding

First time clicking **Multiplayer** from the main menu, a welcome overlay appears (see `17-PLAYER-FLOW.md` for the full layout):

- Explains relay server model (no host advantage)
- Suggests: casual game first → ranked → spectate
- "Got it, let me play" dismisses permanently
- Stored in `hint_history` as `mp_welcome_dismissed`

After the player's first multiplayer game, a brief overlay explains the post-game stats and rating system if ranked.

### Modder Tutorial API — Custom Tutorial Campaigns

The entire tutorial infrastructure is available to modders. A modder creating a total conversion or a complex mod with novel mechanics can build their own Commander School equivalent:

1. **Campaign YAML:** Use `category: tutorial` in the campaign definition. The campaign appears under `Campaign → Tutorial` in the main menu.
2. **Tutorial Lua API:** All `Tutorial.*` functions work in any campaign or scenario, not just the built-in Commander School. Call `Tutorial.SetStep()`, `Tutorial.ShowHint()`, `Tutorial.HighlightUI()`, etc.
3. **Custom hints:** Add a `hints.yaml` to the mod directory. Hints are merged with the base game hints at load time. Mod hints can reference mod-specific unit types, building types, and actions.
4. **Custom trigger types:** Define custom triggers via Lua using the `custom` trigger type in `hints.yaml`, or register a full trigger type via WASM (Tier 3).
5. **Scenario editor modules:** Use the Tutorial Step and Tutorial Hint modules (D038) to build tutorial sequences visually without writing Lua.

#### End-to-End Example: Modder Tutorial Campaign

A modder creating a "Chrono Warfare" mod with a time-manipulation mechanic wants a 3-mission tutorial introducing the new features:

```yaml
# mods/chrono-warfare/campaigns/tutorial/campaign.yaml
campaign:
  id: chrono_tutorial
  title: "Chrono Warfare — Basic Training"
  description: "Learn the new time-manipulation abilities"
  start_mission: chrono_01
  category: tutorial
  requires_mod: chrono-warfare

  missions:
    chrono_01:
      map: missions/chrono-tutorial/01-temporal-basics
      briefing: briefings/chrono-01.yaml
      outcomes:
        pass: { next: chrono_02 }
        skip: { next: chrono_02 }

    chrono_02:
      map: missions/chrono-tutorial/02-chrono-shift
      briefing: briefings/chrono-02.yaml
      outcomes:
        pass: { next: chrono_03 }
        skip: { next: chrono_03 }

    chrono_03:
      map: missions/chrono-tutorial/03-time-bomb
      briefing: briefings/chrono-03.yaml
      outcomes:
        pass: { description: "Training complete" }
```

```lua
-- mods/chrono-warfare/missions/chrono-tutorial/01-temporal-basics.lua

function OnMissionStart()
    -- Restrict everything except the new mechanic
    Tutorial.RestrictSidebar(true)
    Tutorial.RestrictOrders({"move", "stop", "chrono_freeze"})

    -- Step 1: Introduce the Chrono Freeze ability
    Tutorial.SetStep("learn_freeze", {
        title = "Temporal Freeze",
        hint = "Your Chrono Trooper can freeze enemies in time. " ..
               "Select the trooper and use the Chrono Freeze ability on the enemy tank.",
        focus_area = enemy_tank_position,
        highlight_ui = "sidebar_item:chrono_freeze",
        eva_line = "chrono_tech_available",
        completion = { type = "action", action = "chrono_freeze" }
    })
end

function OnStepComplete(step_id)
    if step_id == "learn_freeze" then
        Tutorial.ShowHint("The enemy tank is frozen in time for 10 seconds. " ..
                          "Frozen units can't move, shoot, or be damaged.", {
            duration = 6,
            position = "near_unit",
        })

        Trigger.AfterDelay(DateTime.Seconds(8), function()
            Tutorial.SetStep("destroy_frozen", {
                title = "Shatter the Frozen",
                hint = "When the freeze ends, the target takes bonus damage for 3 seconds. " ..
                       "Attack the tank right as the freeze expires!",
                completion = { type = "kill", count = 1 }
            })
        end)

    elseif step_id == "destroy_frozen" then
        Campaign.complete("pass")
    end
end
```

```yaml
# mods/chrono-warfare/hints/chrono-hints.yaml
hints:
  - id: chrono_freeze_ready
    title: "Chrono Freeze Available"
    text: "Your Chrono Trooper's freeze ability is ready. Use it on high-value targets."
    category: mod_specific
    trigger:
      type: building_ready
      building_type: "chrono_trooper"
      ability: "chrono_freeze"
      first_time: true
    suppression:
      mastery_action: use_chrono_freeze
      mastery_threshold: 3
      cooldown_seconds: 0
      max_shows: 1
    experience_profiles: [all]
    priority: high
    position: near_unit
```

### Campaign Pedagogical Pacing Guidelines

For the built-in Allied and Soviet campaigns (not Commander School), IC follows these pacing guidelines to ensure the official campaigns serve as gentle second-layer tutorials:

1. **One new mechanic per mission maximum.** Mission 1 introduces movement. Mission 2 adds combat. Mission 3 adds base building. Never two new systems in the same mission.
2. **Tutorial EVA lines for first encounters.** The first time the player builds a new structure type or encounters a new enemy unit type, EVA provides a brief explanation — but only if the player hasn't completed the relevant Commander School lesson. This is context-sensitive, not a lecture.
3. **Safe-to-fail early missions.** The first 3 missions of each campaign have generous time limits, weak enemies, and no base-building pressure. The player can explore at their own pace.
4. **No mechanic is required without introduction.** If Mission 7 requires naval combat, Mission 6 introduces shipyards in a low-pressure scenario.
5. **Difficulty progression: linear, not spiked.** No "brick wall" missions. If a mission has a significant difficulty increase, it offers a remedial branch (D021 campaign graph).

These guidelines apply to modders creating campaigns intended for the `category: campaign` (not `category: tutorial`). They're documented here rather than enforced by the engine — modders can choose to follow or ignore them.

### Cross-References

- **D004 (Lua Scripting):** `Tutorial` is a Lua global, part of the IC-exclusive API extension set (see `04-MODDING.md` § IC-exclusive extensions).
- **D021 (Branching Campaigns):** Commander School's branching graph (with remedial branches) uses the standard D021 campaign system. Tutorial campaigns are campaigns — they use the same YAML format, Lua API, and campaign graph engine.
- **D033 (QoL Toggles):** Experience profiles control hint defaults. Individual hint categories are toggleable. The D033 QoL panel exposes hint frequency settings.
- **D034 (SQLite):** `hint_history`, `player_skill_estimate`, and discovery state in `player.db`. Tip display history also in SQLite.
- **D036 (Achievements):** Graduate, Honors Graduate, Quick Study, Helping Hand. Engine-defined, Steam-synced.
- **D038 (Scenario Editor):** Tutorial Step and Tutorial Hint modules enable visual tutorial creation without Lua. See D038's module library.
- **D043 (AI Behavior Presets):** Tutorial AI tier sits below Easy difficulty. It's Lua-scripted per mission, not a general-purpose AI.
- **D058 (Command Console):** `/hints` and `/discovery` console commands for hint management and discovery milestone control.
- **D031 (Telemetry):** New player pipeline emits `onboarding.step` telemetry events. Hint shows/dismissals are tracked in `gameplay_events` for UX analysis.
- **`17-PLAYER-FLOW.md`:** Full player flow mockups for all five tutorial layers, including the self-identification screen, Commander School entry, multiplayer onboarding, and post-game tips.
- **`08-ROADMAP.md`:** Phase 3 deliverables (hint system, new player pipeline, progressive discovery), Phase 4 deliverables (Commander School, skill assessment, post-game learning, tutorial achievements).

