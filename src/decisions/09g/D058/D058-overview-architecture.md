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

    /// Execute a previously parsed **local-only** command (e.g., `/help`, `/volume`).
    /// Sim-affecting mod commands are NOT executed here — they are packaged into
    /// `PlayerOrder::ChatCommand` and routed through the deterministic order pipeline.
    /// See "Mod command execution contract" below.
    pub fn execute(&self, parsed: &ParseResult) -> CommandResult;

    /// Generate tab-completion suggestions at cursor position.
    pub fn suggest(&self, input: &str, cursor: usize, source: &CommandSource) -> Vec<Suggestion>;

    /// Generate human-readable usage string for a command.
    pub fn usage(&self, command: &str, source: &CommandSource) -> String;
}
```

**Mod command execution contract:** `CommandDispatcher` lives in `ic-game`, but mod command handlers that perform trigger-context mutations (e.g., `Reinforcements.Spawn()`, `Actor.Create()`) are **not executed by the dispatcher directly**. Instead, the dispatcher packages the parsed command into a `PlayerOrder::ChatCommand { cmd, args }` which flows through the deterministic order pipeline. On every client, the sim's `OrderValidator` (D041 — runs before `apply_orders`, see `02-ARCHITECTURE.md` § OrderValidator Trait) validates the `ChatCommand` by re-parsing each string argument against the registered `CommandNode` types. If validation passes, `apply_orders` (step 1) queues the command, and `trigger_system()` (step 19) invokes the mod handler in trigger context — the same execution environment as mission trigger callbacks. This guarantees determinism: every client runs the same handler with the same state at the same pipeline step. The dispatcher's `execute()` method is used only for **local-only commands** (e.g., `/help`, `/volume`) that produce no `PlayerOrder`.

**ChatCommand argument canonicalization:** The `args: Vec<String>` on the wire uses a canonical string encoding to ensure all clients parse identically. Typed arguments (e.g., `PositionArg`, `IntegerArg`) are serialized to their canonical string form by the sending client's `CommandDispatcher::parse()` — positions as `"x,y"` or `"x,y,z"` (fixed-point decimal), integers as decimal digits, booleans as `"true"`/`"false"`, player names as their canonical display form. On the sim side, `OrderValidator` re-parses each string argument using the same `CommandNode` argument type registered at mod load time. If re-parsing fails (type mismatch, out-of-range, unknown player), the order is **rejected at validation time** — before `apply_orders`, before any system runs. This is deterministic rejection on all clients (D012). `trigger_system()` (step 19) receives only pre-validated `ChatCommand`s and invokes the handler with guaranteed-valid arguments. This two-phase parse→serialize→re-parse design means the wire format is always `Vec<String>` (simple, versionable), while type safety is enforced at both ends.

**Permission filtering:** Commands whose root node's permission requirement exceeds the source's level are invisible — not shown in `/help`, not tab-completed, not executable. A regular player never sees `/kick` or `/c`. This is Brigadier's `requirement` predicate.

**Append-only registration:** Mods register commands by adding children to the root node. A mod can also extend existing commands by adding new sub-nodes. Two mods adding different sub-commands under `/spawn` coexist — the second registration merges into the first's node (Brigadier tree merge). If two mods register the exact same leaf command (e.g., both register `/spawn tank`), the last mod loaded replaces the earlier handler, with a warning logged. This is the same rule applied to unprefixed namespace collisions in D058 § "Mod-Registered Commands."

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

**Sim-affecting cvars** (like fog of war, game speed) use the `DEV_ONLY` flag and flow through the order pipeline as `PlayerOrder::SetCvar { name, value }` — deterministic, validated, visible to all clients. Client-only cvars (render settings, audio) take effect immediately without going through the sim.

