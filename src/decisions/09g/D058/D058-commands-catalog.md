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
| `/step [N]`                           | Advance N sim ticks while paused (default: 1). Requires `/pause` first. Essential for determinism debugging — inspired by SAGE engine's script debugger frame-stepping    |

**Diagnostic overlay commands (client-local, no network traffic):**

These commands control the real-time diagnostic overlay described in `10-PERFORMANCE.md` § Diagnostic Overlay & Real-Time Observability. They are **client-local** — they read telemetry data already being collected (D031) and do not produce `PlayerOrder`s. Level 1–2 commands are available to all players; Level 3 panels require `dev-tools`.

| Command                | Description                                                           | Permission |
| ---------------------- | --------------------------------------------------------------------- | ---------- |
| `/diag` or `/diag 1`   | Toggle basic diagnostic overlay (FPS, tick time, RTT, entity count)   | Player     |
| `/diag 0`              | Turn off diagnostic overlay                                           | Player     |
| `/diag 2`              | Detailed overlay (per-system breakdown, pathfinding, memory, network) | Player     |
| `/diag 3`              | Full developer overlay (ECS inspector, AI viewer, desync debugger)    | Developer  |
| `/diag net`            | Show only the network diagnostic panel                                | Player     |
| `/diag sim`            | Show only the sim tick breakdown panel                                | Player     |
| `/diag path`           | Show only the pathfinding statistics panel                            | Player     |
| `/diag mem`            | Show only the memory usage panel                                      | Player     |
| `/diag ai`             | Show AI state viewer for selected unit(s)                             | Developer  |
| `/diag orders`         | Show order queue inspector                                            | Developer  |
| `/diag fog`            | Toggle fog-of-war debug visualization on game world                   | Developer  |
| `/diag desync`         | Show desync debugger panel                                            | Developer  |
| `/diag history`        | Toggle graph history mode (scrolling line graphs for key metrics)     | Player     |
| `/diag pos <corner>`   | Move overlay position: `tl`, `tr`, `bl`, `br` (default: `tr`)         | Player     |
| `/diag scale <factor>` | Scale overlay text size, 0.5–2.0 (accessibility)                      | Player     |
| `/diag export`         | Dump current overlay snapshot to timestamped JSON file                | Player     |

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
- **Cvar mutations** (`/set <name> <value>`) produce `PlayerOrder::SetCvar { name, value }` when the cvar has `DEV_ONLY` or `SERVER` flags — these flow through order validation.
- **Cheat codes** (hidden phrases typed in chat) produce `PlayerOrder::CheatCode(CheatId)` — see "Hidden Cheat Codes" below.
- **Chat messages** (`/s`, `/w`, unprefixed text) produce `PlayerOrder::ChatMessage { channel, text }` — see D059 § Text Chat.
- **Coordination actions** (pings, chat wheel, minimap drawing) produce their respective `PlayerOrder` variants (`TacticalPing`, `ChatWheelPhrase`, `MinimapDraw`) — see D059 § Coordination.
- **Meta-commands** (`/help`, `/locale`, `/hotkeys`, `/voice diag`, etc.) are **local-only** — they produce no `PlayerOrder` and never touch the sim.
- **`PlayerOrder::ChatCommand { cmd, args }`** is used only for mod-registered commands that produce custom sim-side effects not covered by a native variant. Engine commands never use `ChatCommand`.

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
        { name = "unit_type", type = "string", suggestions = {"Tank", "Rifle", "APC"} },
        { name = "count",   type = "integer", min = 1, max = 50 },
        { name = "location", type = "string", suggestions = {"north", "south", "east", "west"} },
    },
    execute = function(source, args)
        -- Mod logic here — note: Reinforcements.Spawn takes
        -- (faction, unit_type_list, entry_point_id), matching
        -- the canonical Lua API (see modding/lua-scripting.md).
        local units = {}
        for i = 1, args.count do table.insert(units, args.unit_type) end
        Reinforcements.Spawn(args.faction, units, args.location)
        return "Spawned " .. args.count .. " " .. args.faction .. " reinforcements"
    end
})
```

**Sandboxing:** Mod commands execute within the same Lua sandbox as mission scripts. A mod command cannot access the filesystem, network, or memory outside its sandbox. The `CommandSource` tracks which mod registered the command — if a mod command crashes or times out, the error is attributed to the mod, not the engine.

**Namespace collision:** Mod commands are prefixed with the mod name by default: a mod named `cool_units` registering `spawn` creates `/cool_units:spawn`. Mods can request unprefixed registration (`/spawn`) but collisions are resolved deterministically: sub-commands under the same parent node are merged (Brigadier tree merge — two mods adding different sub-commands under `/spawn` coexist). If two mods register the exact same leaf command path, the last mod loaded replaces the earlier handler, with a warning logged. The convention follows Minecraft's `namespace:command` pattern.

#### Anti-Trolling Measures

Chat and commands create trolling surfaces. IC addresses each:

| Trolling Vector                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat spam**                                                                    | Rate limit: max 5 messages per 3 seconds, relay-enforced (see D059 § Text Chat). Client applies the same limit locally to avoid round-trip rejection. Exceeding the limit queues messages with a cooldown warning. Configurable by server.                                                                                                                                                                                                                                                                                                    |
| **Chat harassment**                                                              | `/ignore` is client-side and instant. `/mute` is admin-enforced and server-side. Ignored players can't whisper you.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Unicode abuse** (oversized chars, bidi-spoof controls, invisible chars, zalgo) | Chat input is sanitized **before** order injection: preserve legitimate letters/numbers/punctuation (including Arabic/Hebrew/RTL text), but strip disallowed control/invisible characters used for spoofing, normalize Unicode to NFC, cap display width, and clamp combining-character abuse. Normalization happens on the sending client before the text enters `PlayerOrder::ChatMessage` — ensuring all clients receive identical normalized bytes (determinism requirement). Homoglyph detection warns admins of impersonation attempts. |
| **Command abuse** (admin runs `/kill` on all players)                            | Admin commands that affect other players are logged as telemetry events (D031). Community server governance (D037) allows reputation consequences.                                                                                                                                                                                                                                                                                                                                                                                            |
| **Lua injection** via chat                                                       | Chat messages never touch the command parser unless they start with `/`. A message like `hello /c game.destroy()` is plain text, not a command. Only the first `/` at position 0 triggers command parsing.                                                                                                                                                                                                                                                                                                                                    |
| **Fake command output**                                                          | System messages (command results, join/leave notifications) use a distinct visual style (color, icon) that players cannot replicate through chat.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Command spam**                                                                 | Commands have the same rate limit as chat. Dev commands additionally logged with timestamps for abuse review.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Programmable spam** (Factorio's speaker problem)                               | IC doesn't have programmable speakers, but any future mod-driven notification system should respect the same per-player mute controls.                                                                                                                                                                                                                                                                                                                                                                                                        |

#### Achievement and Ranking Interaction

Following the universal convention (Factorio, AoE, OpenRA):

- **Using any dev command permanently flags the match/save** as using cheats. This is recorded in the replay metadata and sim state.
- **Flagged games cannot count toward ranked matchmaking (D055)** or achievements (D036).
- **The flag is irreversible** for that save/match — even if you toggle dev mode off.
- **Non-dev commands** (`/help`, `/set render.shadows false`, chat, `/ping`) do NOT flag the game. Only commands that affect simulation state through `DevCommand` orders trigger the flag.
- **Saved game cheated flag:** The snapshot (D010) includes `cheats_used: bool` and `cosmetic_cheats_used: bool` fields. Loading a save with `cheats_used = true` displays a permanent "cheats used" indicator and disables achievements. Loading a save with only `cosmetic_cheats_used = true` displays a subtle "cosmetic mods active" indicator but achievements remain enabled. Both flags are irreversible per save and recorded in replay metadata.

This follows Factorio's model — the Lua console is immensely useful for testing and debugging, but using it has clear consequences for competitive integrity — while refining it with a proportional response: gameplay cheats carry full consequences, cosmetic cheats are recorded but don't punish the player for having fun.

