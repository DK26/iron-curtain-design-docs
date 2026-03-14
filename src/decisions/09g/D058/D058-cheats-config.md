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
# Custom cheat codes (in game content YAML, referenced from mod.toml)
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

| Risk                                    | Mitigation                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arbitrary Lua execution**             | Lua runs in the D004 sandbox — no filesystem, no network, no `os.*`. `loadstring()` disabled. Execution timeout (100ms default). Memory limit per invocation.                                                                                                                                                                                                                      |
| **Cvar manipulation for cheating**      | Sim-affecting cvars require `DEV_ONLY` flag and flow through order validation. Render/audio cvars cannot affect gameplay. A `/set` command for a `DEV_ONLY` cvar without dev mode active is rejected.                                                                                                                                                                              |
| **Chat message buffer overflow**        | Chat messages are bounded (512 chars, same as `ProtocolLimits::max_chat_message_length` from `06-SECURITY.md` § V15). Command input bounded similarly. The `StringReader` parser rejects input exceeding the limit before parsing.                                                                                                                                                 |
| **Command injection in multiplayer**    | Commands execute locally on the issuing client. Sim-affecting engine commands produce native `PlayerOrder` variants (e.g., `PlayerOrder::CheatCode(CheatId)`) — validated by the sim like any other order. Mod-registered commands that need sim-side effects use `PlayerOrder::ChatCommand { cmd, args }`. A malicious client cannot execute commands on another client's behalf. |
| **Denial of service via expensive Lua** | Lua execution has a tick budget. `/c` commands that exceed the budget are interrupted with an error. The chat/console remains responsive because Lua runs in the script system's time slice, not the UI thread.                                                                                                                                                                    |
| **Cvar persistence tampering**          | `config.toml` is local — tampering only affects the local client. Server-authoritative cvars (`SERVER` flag) cannot be overridden by client-side config.                                                                                                                                                                                                                           |

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

### GUI-First Application Design (Cross-Reference)

The in-game command console is part of the game client's GUI — not a separate terminal. IC's binary architecture is documented in `architecture/crate-graph.md` § "Binary Architecture: GUI-First Design." The key principle: the game client (`iron-curtain[.exe]`) is a **GUI application** that launches into a windowed menu. The `ic` CLI is a separate developer/modder utility. Players never need a terminal. The command console (`/help`, `/speed 2x`) is an in-game overlay — a text field inside the game window, not a shell prompt. CI-1 (Console = GUI parity) ensures every console command has a GUI equivalent.

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

