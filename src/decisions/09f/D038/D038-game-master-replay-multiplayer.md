### Game Master Mode (Zeus-Inspired)

A real-time scenario manipulation mode where one player (the Game Master) controls the scenario while others play. Derived from the scenario editor's UI but operates on a live game.

**Use cases:**
- **Cooperative campaigns** — a human GM controls the enemy faction, placing reinforcements, directing attacks, adjusting difficulty in real-time based on how players are doing
- **Training** — a GM creates escalating challenges for new players
- **Events** — community game nights with a live GM creating surprises
- **Content testing** — mission designers test their scenarios with real players while making live adjustments

**Game Master controls:**
- Place/remove units and buildings (from a budget — prevents flooding)
- Direct AI unit groups (attack here, retreat, patrol)
- Change weather, time of day
- Trigger scripted events (reinforcements, briefings, explosions)
- Reveal/hide map areas
- Adjust resource levels
- Pause sim for dramatic reveals (if all players agree)

**Not included at launch:** Player control of individual units (RTS is about armies, not individual soldiers). The GM operates at the strategic level — directing groups, managing resources, triggering events.

**Per-player undo:** In multiplayer editing contexts (and Game Master mode specifically), undo is scoped per-actor. The GM's undo reverts only GM actions, not player orders or other players' actions. This follows Garry's Mod's per-player undo model — in a shared session, pressing undo reverts YOUR last action, not the last global action. For the single-player editor, undo is global (only one actor).

**Phase:** Game Master mode is a Phase 6b deliverable. It reuses 90% of the scenario editor's systems — the main new work is the real-time overlay UI and budget/permission system.

### Publishing

Scenarios created in the editor export as standard IC mission format (YAML map + Lua scripts + assets). They can be:
- Saved locally
- Published to Workshop (D030) with one click
- Shared as files
- Used in campaigns (D021) — or created directly in the Campaign Editor
- Assembled into full campaigns and published as campaign packs
- Loaded by the LLM for remixing (D016)

### Replay-to-Scenario Pipeline

Replays are the richest source of gameplay data in any RTS — every order, every battle, every building placement, every dramatic moment. IC already stores replays as deterministic order streams and enriches them with structured gameplay events (D031) in SQLite (D034). The Replay-to-Scenario pipeline turns that data into editable scenarios.

Replays already contain what's hardest to design from scratch: pacing, escalation, and dramatic turning points. The pipeline extracts that structure into an editable scenario skeleton — a designer adds narrative and polish on top.

#### Two Modes: Direct Extraction and LLM Generation

**Direct extraction (no LLM required):** Deterministic, mechanical conversion of replay data into editor entities. This always works, even without an LLM configured.

| Extracted Element        | Source Data                                                | Editor Result                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Map & terrain**        | Replay's initial map state                                 | Full terrain imported — tiles, resources, cliffs, water                                                                                                                                                      |
| **Starting positions**   | Initial unit/building placements per player                | Entities placed with correct faction, position, facing                                                                                                                                                       |
| **Movement paths**       | `OrderIssued` (move orders) over time                      | Waypoints along actual routes taken — patrol paths, attack routes, retreat lines                                                                                                                             |
| **Build order timeline** | `BuildingPlaced` events with tick timestamps               | Building entities with `timer_elapsed` triggers matching the original timing                                                                                                                                 |
| **Combat hotspots**      | Clusters of `CombatEngagement` events in spatial proximity | Named regions at cluster centroids — "Combat Zone 1 (2400, 1800)," "Combat Zone 2 (800, 3200)." The LLM path (below) upgrades these to human-readable names like "Bridge Assault" using map feature context. |
| **Unit composition**     | `UnitCreated` events per faction per time window           | Wave Spawner modules mimicking the original army buildup timing                                                                                                                                              |
| **Key moments**          | Spikes in event density (kills/sec, orders/sec)            | Trigger markers at dramatic moments — editor highlights them in the timeline                                                                                                                                 |
| **Resource flow**        | `HarvestDelivered` events                                  | Resource deposits and harvester assignments matching the original economy                                                                                                                                    |

The result: a scenario skeleton with correct terrain, unit placements, waypoints tracing the actual battle flow, and trigger points at dramatic moments. It's mechanically accurate but has no story — no briefing, no objectives, no dialogue. A designer opens it in the editor and adds narrative on top.

**LLM-powered generation (D016, requires LLM configured):** The LLM reads the gameplay event log and generates the narrative layer that direct extraction can't provide.

| Generated Element     | LLM Input                                             | LLM Output                                                                                  |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Mission briefing**  | Event timeline summary, factions, map name, outcome   | "Commander, intelligence reports enemy armor massing at the river crossing..."              |
| **Objectives**        | Key events + outcome                                  | Primary: "Destroy the enemy base." Secondary: "Capture the tech center before it's razed."  |
| **Dialogue**          | Combat events, faction interactions, dramatic moments | In-mission dialogue triggered at key moments — characters react to what originally happened |
| **Difficulty curve**  | Event density over time, casualty rates               | Wave timing and composition tuned to recreate the original difficulty arc                   |
| **Story context**     | Faction composition, map geography, battle outcome    | Narrative framing that makes the mechanical events feel like a story                        |
| **Named characters**  | High-performing units (most kills, longest survival)  | Surviving units promoted to named characters with generated backstories                     |
| **Alternative paths** | What-if analysis of critical moments                  | Branch points: "What if the bridge assault failed?" → generates alternate mission variant   |

The LLM output is standard YAML + Lua — the same format as hand-crafted missions. Everything is editable in the editor. The LLM is a starting point, not a black box.

#### Workflow

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐     ┌──────────────┐
│   Replay    │────→│  Event Log       │────→│  Replay-to-Scenario │────→│   Scenario   │
│   Browser   │     │  (SQLite, D034)  │     │  Pipeline           │     │   Editor     │
└─────────────┘     └──────────────────┘     │                     │     └──────────────┘
                                             │  Direct extraction  │
                                             │  + LLM (optional)   │
                                             └────────────────────┘
```

1. **Browse replays** — open the replay browser, select a replay (or multiple — a tournament series, a campaign run)
2. **"Create Scenario from Replay"** — button in the replay browser context menu
3. **Import settings dialog:**

| Setting                | Options                                                    | Default              |
| ---------------------- | ---------------------------------------------------------- | -------------------- |
| **Perspective**        | Player 1's view / Player 2's view / Observer (full map)    | Player 1             |
| **Time range**         | Full replay / Custom range (tick start – tick end)         | Full replay          |
| **Extract waypoints**  | All movement / Combat movement only / Key maneuvers only   | Key maneuvers only   |
| **Combat zones**       | Mark all engagements / Major battles only (threshold)      | Major battles only   |
| **Generate narrative** | Yes (requires LLM) / No (direct extraction only)           | Yes if LLM available |
| **Difficulty**         | Match original / Easier / Harder / Let LLM tune            | Match original       |
| **Playable as**        | Player 1's faction / Player 2's faction / New player vs AI | New player vs AI     |

4. **Pipeline runs** — extraction is instant (SQL queries on the event log); LLM generation takes seconds to minutes depending on the provider
5. **Open in editor** — the scenario opens with all extracted/generated content. Everything is editable. The designer adds, removes, or modifies anything before publishing.

#### Perspective Conversion

The key design challenge: a replay is a symmetric record (both sides played). A scenario is asymmetric (the player is one side, the AI is the other). The pipeline handles this conversion:

- **"Playable as Player 1"** — Player 1's units become the player's starting forces. Player 2's units, movements, and build order become AI-controlled entities with waypoints and triggers mimicking the replay behavior.
- **"Playable as Player 2"** — reversed.
- **"New player vs AI"** — the player starts fresh. The AI follows a behavior pattern extracted from the better-performing replay side. The LLM (if available) adjusts difficulty so the mission is winnable but challenging.
- **"Observer (full map)"** — both sides are AI-controlled, recreating the entire battle as a spectacle. Useful for "historical battle" recreations of famous tournament matches.

Initial implementation targets 1v1 replays — perspective conversion maps cleanly to "one player side, one AI side." 2v2 team games work by merging each team's orders into a single AI side. FFA and larger multiplayer replays require per-faction AI assignment and are deferred to a future iteration. Observer mode is player-count-agnostic (all sides are AI-controlled regardless of player count).

#### AI Behavior Extraction

The pipeline converts a player's replay orders into AI modules that approximate the original behavior at the strategic level. The mapping is deterministic — no LLM required.

| Replay Order Type         | AI Module Generated  | Example                                                                         |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| Move orders               | Patrol waypoints     | Unit moved A→B→C → patrol route with 3 waypoints                                |
| Attack-move orders        | Attack-move zones    | Attack-move toward (2400, 1800) → attack-move zone centered on that area        |
| Build orders (structures) | Timed build queue    | Barracks at tick 300, War Factory at tick 600 → build triggers at those offsets |
| Unit production orders    | Wave Spawner timing  | 5 tanks produced ticks 800–1000 → Wave Spawner with matching composition        |
| Harvest orders            | Harvester assignment | 3 harvesters assigned to ore field → harvester waypoints to that resource       |

This isn't "perfectly replicate a human player" — it's "create an AI that does roughly the same thing in roughly the same order." The Probability of Presence system (per-entity randomization) can be applied on top, so replaying the scenario doesn't produce an identical experience every time.

**Crate boundary:** The extraction logic lives in `ic-ai` behind a `ReplayBehaviorExtractor` trait. `ic-editor` calls this trait to generate AI modules from replay data. `ic-game` wires the concrete implementation. This keeps `ic-editor` decoupled from AI internals — the same pattern as sim/net separation.

#### Use Cases

- **"That was an incredible game — let others experience it"** — import your best multiplayer match, add briefing and objectives, publish as a community mission
- **Tournament highlight missions** — import famous tournament replays, let players play from either side. "Can you do better than the champion?"
- **Training scenarios** — import a skilled player's replay, the new player faces an AI that follows the skilled player's build order and attack patterns
- **Campaign from history** — import a series of replays from a ladder season or clan war, LLM generates connecting narrative → instant campaign
- **Modder stress test** — import a replay with 1000+ units to create a performance benchmark scenario
- **Content creation** — streamers import viewer-submitted replays and remix them into challenge missions live

#### Batch Import: Replay Series → Campaign

Multiple replays can be imported as a connected campaign:

1. Select multiple replays (e.g., a best-of-5 tournament series)
2. Pipeline extracts each as a separate mission
3. LLM (if available) generates connecting narrative: briefings that reference previous missions, persistent characters who survive across matches, escalating stakes
4. Campaign graph auto-generated: linear (match order) or branching (win/loss → different next mission)
5. Open in Campaign Editor for refinement

This is the fastest path from "cool replays" to "playable campaign" — and it's entirely powered by existing systems (D016 + D021 + D031 + D034 + D038).

#### What This Does NOT Do

- **Perfectly reproduce a human player's micro** — AI modules approximate human behavior at the strategic level. Precise micro (target switching, spell timing, retreat feints) is not captured. The goal is "similar army, similar timing, similar aggression," not "frame-perfect recreation."
- **Work on corrupted or truncated replays** — the pipeline requires a complete event log. Partial replays produce partial scenarios (with warnings).
- **Replace mission design** — direct extraction produces a mechanical skeleton, not a polished mission. The LLM adds narrative, but a human designer's touch is what makes it feel crafted. The pipeline reduces the work from "start from scratch" to "edit and polish."

**Crate boundary for LLM integration:** `ic-editor` defines a `NarrativeGenerator` trait (input: replay event summary → output: briefing, objectives, dialogue YAML). `ic-llm` implements it. `ic-game` wires the implementation at startup — if no LLM provider is configured, the trait is backed by a no-op that skips narrative generation. `ic-editor` never imports `ic-llm` directly. This mirrors the sim/net separation: the editor knows it *can* request narrative, but has zero knowledge of how it's generated.

**Phase:** Direct extraction ships with the scenario editor in **Phase 6a** (it's just SQL queries + editor import — no new system needed). LLM-powered narrative generation ships in **Phase 7** (requires `ic-llm`). Batch campaign import is a **Phase 7** feature built on D021's campaign graph.

### Reference Material

The scenario editor design draws from:
- **OFP mission editor (2001):** Probability of Presence, triggers with countdown/timeout, Guard/Guarded By, synchronization, Easy/Advanced toggle. The gold standard for "simple, not bloated, not limiting."
- **OFP: Resistance (2002):** Persistent campaign — surviving soldiers, captured equipment, emotional investment. The campaign editor exists because Resistance proved persistent campaigns are transformative.
- **Arma 3 Eden Editor (2016):** 3D placement, modules (154 built-in), compositions, layers, Workshop integration, undo/redo
- **Arma Reforger Game Master (2022):** Budget system, real-time manipulation, controller support, simplified objectives
- **Age of Empires II Scenario Editor (1999):** Condition-effect trigger system (the RTS gold standard — 25+ years of community use), trigger areas as spatial logic. Cautionary lesson: flat trigger list collapses at scale — IC adds folders, search, and flow graph to prevent this.
- **StarCraft Campaign Editor / SCMDraft (1998+):** Named locations (spatial regions referenced by name across triggers). The "location" concept directly inspired IC's Named Regions. Also: open file format enabled community editors — validates IC's YAML approach.
- **Warcraft III World Editor:** GUI-based triggers with conditions, actions, and variables. IC's module system and Variables Panel serve the same role.
- **TimeSplitters 2/3 MapMaker (2002/2005):** Visible memory/complexity budget bar — always know what you can afford. Inspired IC's Scenario Complexity Meter.
- **Super Mario Maker (2015/2019):** Element interactions create depth without parameter bloat. Behaviors emerge from spatial arrangement. Instant build-test loop measured in seconds.
- **LittleBigPlanet 2 (2011):** Pre-packaged logic modules (drop-in game patterns). Directly inspired IC's module system. Cautionary lesson: server shutdown destroyed 10M+ creations — content survival is non-negotiable (IC uses local-first storage + Workshop export).
- **RPG Maker (1992–present):** Tiered complexity architecture (visual events → scripting). Validates IC's Simple → Advanced → Lua progression.
- **Halo Forge (2007–present):** In-game real-time editing with instant playtesting. Evolution from minimal (Halo 3) to powerful (Infinite) proves: ship simple, grow over iterations. Also: game mode prefabs (Strongholds, CTF) that designers customize — directly inspired IC's Game Mode Templates.
- **Far Cry 2 Map Editor (2008):** Terrain sculpting separated from mission logic. Proves environment creation and scenario scripting can be independent workflows.
- **Divinity: Original Sin 2 (2017):** Co-op campaign with persistent state, per-player dialogue choices that affect the shared story. Game Master mode with real-time scenario manipulation. Proved co-op campaign RPG works — and that the tooling for CREATING co-op content matters as much as the runtime support.
- **Doom community editors (1994–present):** Open data formats enable 30+ years of community tools. The WAD format's openness is why Doom modding exists — validates IC's YAML-based scenario format.
- **OpenRA map editor:** Terrain painting, resource placement, actor placement — standalone tool. IC improves by integrating a full creative toolchain in the SDK (scenario editor + asset studio + campaign editor)
- **Garry's Mod (2006–present):** Spawn menu UX (search/favorites/recents for large asset libraries) directly inspired IC's Entity Palette. Duplication system (save/share/browse entity groups) validates IC's Compositions. Per-player undo in multiplayer sessions informed IC's Game Master undo scoping. Community-built tools (Wire Mod, Expression 2) that became indistinguishable from first-party tools proved that a clean tool API matters more than shipping every tool yourself — directly inspired IC's Workshop-distributed editor plugins. Sandbox mode as the default creative environment validated IC's Sandbox template as the editor's default preview mode. Cautionary lesson: unrestricted Lua access enabled the Glue Library incident (malicious addon update) — reinforces IC's sandboxed Lua model (D004) and Workshop supply chain defenses (D030, `06-SECURITY.md` § Vulnerability 18)

### Multiplayer & Co-op Scenario Tools

Most RTS editors treat multiplayer as an afterthought — place some spawn points, done. Creating a proper co-op mission, a team scenario with split objectives, or a campaign playable by two friends requires hacking around the editor's single-player assumptions. IC's editor treats multiplayer and co-op as first-class authoring targets.

#### Player Slot Configuration

Every scenario has a **Player Slots panel** — the central hub for multiplayer setup.

| Property           | Description                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| **Slot count**     | Number of human player slots (1–8). Solo missions = 1. Co-op = 2+.               |
| **Faction**        | Which faction each slot controls (or "any" for lobby selection)                  |
| **Team**           | Team assignment (Team 1, Team 2, FFA, Configurable in lobby)                     |
| **Spawn area**     | Starting position/area per slot                                                  |
| **Starting units** | Pre-placed entities assigned to this slot                                        |
| **Color**          | Default color (overridable in lobby)                                             |
| **AI fallback**    | What happens if this slot is unfilled: AI takes over, slot disabled, or required |

The designer places entities and assigns them to player slots via the Attributes Panel — a dropdown says "belongs to Player 1 / Player 2 / Player 3 / Any." Triggers and objectives can be scoped to specific slots or shared.

#### Co-op Mission Modes

The editor supports several co-op configurations. These are set per-mission in the scenario properties:

| Mode                 | Description                                                                                               | Example                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Allied Factions**  | Each player controls a separate allied faction with their own base, army, and economy                     | Player 1: Allies infantry push. Player 2: Soviet armor support.       |
| **Shared Command**   | Players share a single faction. Units can be assigned to specific players or freely controlled by anyone. | One player manages economy/production, the other commands the army.   |
| **Commander + Ops**  | One player has the base and production (Commander), the other controls field units only (Operations).     | Commander builds and sends reinforcements. Ops does all the fighting. |
| **Asymmetric**       | Players have fundamentally different gameplay. One does RTS, the other does Game Master or support roles. | Player 1 plays the mission. Player 2 controls enemy as GM.            |
| **Split Objectives** | Players have different objectives on the same map. Both must succeed for mission victory.                 | Player 1: capture the bridge. Player 2: defend the base.              |

#### Asymmetric Commander + Field Ops Toolkit (D070)

D070 formalizes a specific IC-native asymmetric co-op pattern: **Commander & Field Ops**. In D038, this is implemented as a **template + authoring toolkit**, not a hardcoded engine mode.

**Scenario authoring surfaces (v1 requirements):**
- **Role Slot editor** — configure role slots (`Commander`, `FieldOps`, future `CounterOps`/`Observer`) with min/max player counts, UI profile hints, and communication preset links
- **Control Scope painter** — assign ownership/control scopes for structures, factories, squads, and scripted attachments (who commands what by default)
- **Objective Channels** — mark objectives as `Strategic`, `Field`, `Joint`, or `Hidden` with visibility/completion-credit per role
- **SpecOps Task Catalog presets** — authoring shortcuts/templates for common D070 side-mission categories (economy raid, power sabotage, tech theft, expansion-site clear, superweapon delay, route control, VIP rescue, recon designation)
- **Support Catalog + Requisition Rules** — define requestable support actions (CAS/recon/reinforcements/extraction), costs, cooldowns, prerequisites, and UI labels
- **Operational Momentum / Agenda Board editor (optional)** — define agenda lanes (e.g., economy/power/intel/command-network/superweapon denial), milestones/rewards, and optional extraction-vs-stay prompts for "one more phase" pacing
- **Request/Response Preview Simulation** — in Preview/Test, simulate Field Ops requests and Commander responses to verify timing, cooldown, duplicate-request collapse, and objective wiring without a second human player
- **Portal Ops integration** — reuse D038 `Sub-Scenario Portal` authoring for optional infiltration micro-ops; portal return outcomes can feed Commander/Field/Joint objectives

**Validation profile (D070-aware) checks:**
- no role idle-start (both roles have meaningful actions in the first ~90s)
- joint objectives are reachable and have explicit role contributions
- every request type referenced by objectives maps to at least one satisfiable commander action path
- request/reward definitions specify a meaningful war-effort outcome category (economy/power/tech/map-state/timing/intel)
- commander support catalog has valid budget/cooldown definitions
- request spam controls are configured (duplicate collapse or cooldown rule) for missions with repeatable support asks
- if Operational Momentum is enabled, each agenda milestone declares explicit rewards and role visibility
- agenda foreground/timer limits are configured (or safe defaults apply) to avoid HUD overload warnings
- portal return outcomes are wired (success/fail/timeout)
- role communication mappings exist (D059/D065 integration)

**Scope boundary (v1):** D038 supports **same-map asymmetric co-op** and optional portal micro-ops using the existing `Sub-Scenario Portal` pattern. True concurrent nested sub-map runtime instances remain deferred (D070).

**Pacing guardrail (optional layer):** Operational Momentum / "one more phase" is an **optional template/preset-level pacing system** for D070 scenarios. It must not become a mandatory overlay on all asymmetric missions or a hidden source of unreadable timer spam.

#### D070-adjacent Commander Avatar / Assassination / Presence authoring (TA-style variants)

D070's adjacent **Commander Avatar** mode family (Assassination / Commander Presence / hybrid presets) should be exposed as template/preset-level authoring in D038, not as hidden Lua-only patterns.

**Authoring surfaces (preset extensions):**
- **Commander Avatar panel** — select the commander avatar unit/archetype, death policy (`ImmediateDefeat`, `DownedRescueTimer`, etc.), and warning/UI labels
- **Commander Presence profile** — define soft influence bonuses (radius, falloff, effect type, command-network prerequisites)
- **Command Network objectives** — tag comm towers/uplinks/relays and wire them to support quality, presence bonuses, or commander ability unlocks
- **Commander + SpecOps combo preset** — bind commander avatar rules to D070 role slots so the Commander role owns the avatar and the SpecOps role can support/protect it
- **Rescue Bootstrap pattern preset** (campaign-friendly) — starter trigger/objective wiring for "commander missing/captured -> rescue -> unlock command/building/support"

**Validation checks (v1):**
- commander defeat/death policy is explicitly configured and visible in briefing/lobby metadata
- commander avatar spawn is not trivially exposed without authored counterplay (warning, not hard fail)
- presence bonuses are soft effects by default (warn on hard control-denial patterns in v1 templates)
- command-network dependencies are wired (no orphan "requires network" rules)
- rescue-bootstrap unlocks show explicit UI/objective messaging when command/building becomes available

#### D070 Experimental Survival Variant Reuse (`Last Commando Standing` / `SpecOps Survival`)

D070's experimental SpecOps-focused last-team-standing variant (see D070 "Last Commando Standing / SpecOps Survival") is **not** the same asymmetric Commander/Field Ops mode, but it reuses part of the same toolkit:

- **SpecOps Task Catalog presets** for meaningful side-objectives (economy/power/tech/route/intel)
- **Field progression + requisition authoring** (session-local upgrades/supports)
- **Objective Channel** visibility patterns (often `Field` + `Hidden`, sometimes `Joint` for team variants)
- **Request/response preview** if the survival scenario includes limited support actions

Additional authoring presets for this experimental variant should be template-driven and optional:
- **Hazard Contraction Profiles** (radiation storm, artillery saturation, chrono distortion, firestorm/gas spread) with warning telegraphs and phase timing
- **Neutral Objective Clusters** (cache depots, power relays, tech uplinks, bridge controls, extraction points)
- **Elimination / Spectate / Redeploy policies** (prototype-specific and scenario-controlled)

**Scope boundary:** D038 should expose this as a **prototype-first template preset**, not a promise of a ranked-ready or large-scale battle-royale system.

#### Per-Player Objectives & Triggers

The key to good co-op missions: players need their own goals, not just shared ones.

- **Objective assignment** — each objective module has a "Player" dropdown: All Players, Player 1, Player 2, etc. Shared objectives require all assigned players to contribute. Per-player objectives belong to one player.
- **Trigger scoping** — triggers can fire based on a specific player's actions: "When Player 2's units enter this region" vs "When any allied unit enters this region." The trigger's faction/player filter handles this.
- **Per-player briefings** — the briefing module supports per-slot text: Player 1 sees "Commander, your objective is the bridge..." while Player 2 sees "Comrade, you will hold the flank..."
- **Split victory conditions** — the mission can require ALL players to complete their individual objectives, or ANY player, or a custom Lua condition combining them.

#### Co-op Campaigns

Co-op extends beyond individual missions into campaigns (D021). The Campaign Editor supports multi-player campaigns with these additional properties per mission node:

| Property          | Description                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| **Player count**  | Min and max human players for this mission (1 for solo-compatible, 2+ for co-op) |
| **Co-op mode**    | Which mode applies (see table above)                                             |
| **Solo fallback** | How the mission plays if solo: AI ally, simplified objectives, or unavailable    |

**Shared roster management:** In persistent campaigns, the carried-forward roster is shared between co-op players. The intermission screen shows the combined roster with options for dividing control:

- **Draft** — players take turns picking units from the survivor pool (fantasy football for tanks)
- **Split by type** — infantry to Player 1, vehicles to Player 2 (configured by the scenario designer)
- **Free claim** — each player grabs what they want from the shared pool, first come first served
- **Designer-assigned** — the mission YAML specifies which named characters belong to which player slot

**Drop-in / drop-out:** If a co-op player disconnects mid-mission, their units revert to AI control (or a configurable fallback: pause, auto-extract, or continue without). Reconnection restores control.

#### Multiplayer Testing

Testing multiplayer scenarios is painful in every editor — you normally need to launch two game instances and play both yourself. IC reduces this friction:

- **Multi-slot preview** — preview the mission with AI controlling unfilled player slots. Test your co-op triggers and per-player objectives without needing a real partner.
- **Slot switching** — during preview, hot-switch between player viewpoints to verify each player's experience (camera, fog of war, objectives).
- **Network delay simulation** — preview with configurable artificial latency to catch timing-sensitive trigger issues in multiplayer.
- **Lobby preview** — see how the mission appears in the multiplayer lobby before publishing: slot configuration, team layout, map preview, description.

### Game Mode Templates

Almost every popular RTS game mode can be built with IC's existing module system + triggers + Lua. But discoverability matters — a modder shouldn't need to reinvent the Survival mode from scratch when the pattern is well-known.

**Game Mode Templates** are pre-configured scenario setups: a starting point with the right modules, triggers, variables, and victory conditions already wired. The designer customizes the specifics (which units, which map, which waves) without building the infrastructure.

**Built-in templates:**

| Template                | Inspired By                     | What's Pre-Configured                                                                                                            |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Skirmish (Standard)** | Every RTS                       | Spawn points, tech tree, resource deposits, standard victory conditions (destroy all enemy buildings)                            |
| **Survival / Horde**    | They Are Billions, CoD Zombies  | Wave Spawners with escalation, base defense zone, wave counter variable, survival timer, difficulty scaling per wave             |
| **King of the Hill**    | FPS/RTS variants                | Central capture zone, scoreboard tracking cumulative hold time per faction, configurable score-to-win                            |
| **Regicide**            | AoE2                            | King/Commander unit per player (named character, must-survive), kill the king = victory, king abilities optional                 |
| **Treaty**              | AoE2                            | No-combat timer (configurable), force peace during treaty, countdown display, auto-reveal on treaty end                          |
| **Nomad**               | AoE2                            | No starting base — each player gets only an MCV (or equivalent). Random spawn positions. Land grab gameplay.                     |
| **Empire Wars**         | AoE2 DE                         | Pre-built base per player (configurable: small/medium/large), starting army, skip early game                                     |
| **Assassination**       | StarCraft UMS, Total Annihilation commander tension | Commander avatar unit per player (powerful but fragile), protect yours, kill theirs. Commander death = defeat (or authored downed timer). Optional D070-adjacent **Commander Presence** soft-bonus profile and command-network objective hooks. |
| **Tower Defense**       | Desktop TD, custom WC3 maps     | Pre-defined enemy paths (waypoints), restricted build zones, economy from kills, wave system with boss rounds                    |
| **Tug of War**          | WC3 custom maps                 | Automated unit spawning on timer, player controls upgrades/abilities/composition. Push the enemy back.                           |
| **Base Defense**        | They Are Billions, C&C missions | Defend a position for N minutes/waves. Pre-placed base, incoming attacks from multiple directions, escalating difficulty.        |
| **Capture the Flag**    | FPS tradition                   | Each player has a flag entity (or MCV). Steal the opponent's and return it to your base. Combines economy + raiding.             |
| **Free for All**        | Every RTS                       | 3+ players, no alliances allowed. Last player standing. Diplomacy module optional (alliances that can be broken).                |
| **Diplomacy**           | Civilization, AoE4              | FFA with dynamic alliance system. Players can propose/accept/break alliances. Shared vision opt-in. Betrayal is a game mechanic. |
| **Sandbox**             | Garry's Mod, Minecraft Creative | Unlimited resources, no enemies, no victory condition. Pure building and experimentation. Good for testing and screenshots.      |
| **Co-op Survival**      | Deep Rock Galactic, Helldivers  | Multiple human players vs escalating AI waves. Shared base. Team objectives. Difficulty scales with player count.                |
| **Commander & Field Ops Co-op** *(player-facing: "Commander & SpecOps")* | Savage, Natural Selection (role asymmetry lesson) | Commander role slot + Field Ops slot(s), split control scopes, strategic/field/joint objective channels, SpecOps task catalog presets, support request/requisition flows, request-status UI hooks, optional portal micro-op wiring. |
| **Last Commando Standing** *(experimental, D070-adjacent / player-facing alt: "SpecOps Survival")* | RTS commando survival + battle-royale-style tension | Commando-led squad per player/team, neutral objective clusters, hazard contraction phase presets (RA-themed), match-based field upgrades/requisition, elimination/spectate/redeploy policy hooks, short-round prototype tuning. |
| **Sudden Death**        | Various                         | No rebuilding — if a building is destroyed, it's gone. Every engagement is high-stakes. Smaller starting armies.                 |

**Templates are starting points, not constraints.** Open a template, add your own triggers/modules/Lua, publish to Workshop. Templates save 30–60 minutes of boilerplate setup and ensure the core game mode logic is correct.

**Phasing:** Not all templates ship simultaneously. **Phase 6b core set** (8 templates): Skirmish, Survival/Horde, King of the Hill, Regicide, Free for All, Co-op Survival, Sandbox, Base Defense — these cover the most common community needs and validate the template system. **Phase 7 / community-contributed** (remaining classic templates): Treaty, Nomad, Empire Wars, Assassination, Tower Defense, Tug of War, Capture the Flag, Diplomacy, Sudden Death. **D070 Commander & Field Ops Co-op** follows a separate path: prototype/playtest validation first, then promotion to a built-in IC-native template once role-clarity and communication UX are proven. The D070-adjacent **Commander Avatar / Assassination + Commander Presence** presets should ship only after the anti-snipe/readability guardrails and soft-presence tuning are playtested. The D070-adjacent **Last Commando Standing / SpecOps Survival** variant is even more experimental: prototype-first and community/Workshop-friendly before any first-party promotion. Scope to what you have (Principle #6); don't ship flashy asymmetric/survival variants before the tooling, onboarding, and playtest evidence are actually good.

**Custom game mode templates:** Modders can create new templates and publish them to Workshop (D030). A "Zombie Survival" template, a "MOBA Lanes" template, a "RPG Quest Hub" template — the community extends the library indefinitely. Templates use the same composition + module + trigger format as everything else.

**Community tools > first-party completeness.** Garry's Mod shipped ~25 built-in tools; the community built hundreds more that matched or exceeded first-party quality — because the tool API was clean enough that addon authors could. The same philosophy applies here: ship 8 excellent templates, make the authoring format so clean that community templates are indistinguishable from built-in ones, and let Workshop do the rest. The limiting factor should be community imagination, not API complexity.

**Sandbox as default preview.** The Sandbox template (unlimited resources, no enemies, no victory condition) doubles as the default environment when the editor's Preview button is pressed without a specific scenario loaded. This follows Garry's Mod's lesson: sandbox mode is how people **learn the tools** before making real content. A zero-pressure environment where every entity and module can be tested without mission constraints.

**Templates + Co-op:** Several templates have natural co-op variants. Co-op Survival is explicit, but most templates work with 2+ players if the designer adds co-op spawn points and per-player objectives.

