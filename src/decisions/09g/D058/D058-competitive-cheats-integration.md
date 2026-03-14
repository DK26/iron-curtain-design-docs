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

**Why not hard-block:** In an open-source engine, a modified client can send orders with any `InputSource` tag — faking `Keybinding` when actually scripted. Hard-blocking based on unverifiable client-reported data gives a false sense of security. The relay server (D007) can count order volume server-side (where it can't be spoofed), but both `InputSource` and `CommandOrigin` tags are client-reported and advisory only.

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
- **`autoexec.cfg` commands execute normally.** Cvar-setting commands (`/set`, `/get`, `/toggle`) from autoexec execute as preferences. Gameplay commands (`/build`, `/move`, etc.) from autoexec are rejected in ranked — the stock client's `CommandDispatcher` refuses to package sim-affecting orders when `CommandSource::ConfigFile` is the origin. **This is a client-side UX guard, not a server-enforced security boundary.** A modified client could bypass this check and fabricate orders with any origin. The real enforcement is server-side: relay order-volume recording (above), replay signing, and community review. The autoexec guard prevents honest players from accidentally scripting build orders in ranked — it does not prevent dedicated cheaters, consistent with CI-3.
- **Zoom range is clamped.** The competitive zoom range (default: 0.75–2.0) overrides the render mode's `CameraConfig.zoom_min/zoom_max` (see `02-ARCHITECTURE.md` § "Camera System") in ranked matches. This prevents extreme zoom-out from providing disproportionate map awareness. The default range is configured per ranked queue by the competitive committee (D037) and stored in the seasonal ranked configuration YAML. Tournament organizers can set their own zoom range via `TournamentConfig`. The `/zoom` command respects these bounds.

##### Tournament Mode

Tournament organizers (via community server administration, D052) can enable a stricter **tournament mode** in the lobby:

| Restriction                         | Effect                                                                                                                                                                      | Rationale                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Command whitelist**               | Only whitelisted commands accepted; all others rejected                                                                                                                     | Organizers control exactly which console commands are legal                                        |
| **ConfigFile gameplay rejection**   | `autoexec.cfg` sim-affecting commands rejected (same as ranked)                                                                                                             | Level playing field — no pre-scripted build orders                                                 |
| **Input source logging**            | All `InputSource` tags recorded in match data, visible to admins (note: `InputSource` is client-reported and advisory — see `InputSource` enum definition in D058 overview) | Post-match review for scripting investigation                                                      |
| **APM cap (optional)**              | Configurable orders-per-minute soft cap; exceeding triggers admin alert, not hard block                                                                                     | Communities that value strategy over APM can set limits                                            |
| **Forced replay recording**         | Match replay saved automatically; both players receive copies                                                                                                               | Evidence for dispute resolution                                                                    |
| **No mod commands**                 | Third-party mod commands disabled entirely                                                                                                                                  | Pure vanilla/IC experience for competition                                                         |
| **Workshop scripts (configurable)** | Organizer chooses: allow all, whitelist specific scripts, or disable all `.iccmd` scripts                                                                                   | Some tournaments embrace automation (FAF-style); others require pure manual play. Organizer's call |

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


---

## Sub-Pages

| Section                                             | File                                           |
| --------------------------------------------------- | ---------------------------------------------- |
| Classic Cheat Codes, Config, Security & Integration | [D058-cheats-config.md](D058-cheats-config.md) |
