#### World Map Assets

World maps are **game-module-provided and moddable assets** — not hardcoded. A world map can represent anything: Cold War Europe, the entire globe, a fictional continent, an alien planet, a galactic star map, a subway network — whatever fits the game or mod. The engine doesn't care what the map *is*, only that it has regions with connections. Each game module ships with default world maps, and modders can create their own for any setting they imagine.

**World map definition:**

```yaml
# World map asset — shipped with the game module or created by modders
world_map:
  id: "europe_1953"
  display_name: "Europe 1953"
  game_module: red_alert              # which game module this map is for
  
  # Visual asset — the actual map image
  # Supports multiple render modes (D048): sprite, vector, or 3D globe
  visual:
    base_image: "maps/world/europe_1953.png"    # background image
    region_overlays: "maps/world/europe_1953_regions.png"  # color-coded regions
    faction_colors: true                         # color regions by controlling faction
    animation: frontline_glow                    # animated frontlines between factions
  
  # Region definitions (see region YAML above)
  regions:
    # ... region definitions with adjacency, terrain, resources, etc.
  
  # Starting configurations (selectable in setup)
  scenarios:
    - id: "cold_war_heats_up"
      description: "Classical East vs. West. Soviets hold Eastern Europe, Allies hold the West."
      faction_assignments:
        soviet: ["moscow", "leningrad", "stalingrad", "kiev", "minsk", "warsaw"]
        allied: ["london", "paris", "rome", "berlin", "madrid"]
        neutral: ["stockholm", "bern", "ankara", "cairo", "istanbul"]
    - id: "last_stand"
      description: "Soviets control most of Europe. Allies hold only Britain and France."
      faction_assignments:
        soviet: ["moscow", "leningrad", "stalingrad", "kiev", "minsk", "warsaw", "berlin", "prague", "vienna", "budapest", "rome"]
        allied: ["london", "paris"]
        neutral: ["stockholm", "bern", "ankara", "cairo", "istanbul"]
```

**Game-module world maps:**

Each game module provides at least one default world map:

| Game module   | Default world map | Description                                     |
| ------------- | ----------------- | ----------------------------------------------- |
| Red Alert     | `europe_1953`     | Cold War Europe — Soviets vs. Allies            |
| Tiberian Dawn | `gdi_nod_global`  | Global map — GDI vs. Nod, Tiberium spread zones |
| (Community)   | Anything          | The map is whatever the modder wants it to be   |

Community world map examples (the kind of thing modders could create):

- **Pacific Theater** — island-hopping across the Pacific; naval-heavy campaigns
- **Entire globe** — six continents, dozens of regions, full world war
- **Fictional continent** — Westeros, Middle-earth, or an original fantasy setting
- **Galactic star map** — planets as regions, fleets as garrisons, a sci-fi total conversion
- **Single city** — district-by-district urban warfare; each "region" is a city block or neighborhood
- **Underground network** — cavern systems, bunker complexes, tunnel connections
- **Alternate history** — what if the Roman Empire never fell? What if the Cold War went hot in 1962?
- **Abstract/non-geographic** — a network of space stations, a corporate org chart, whatever the mod needs

The world map is a YAML + image asset, loadable from any source: game module defaults, Workshop (D030), or local mod folders. The Campaign Editor (D038) includes a world map editor for creating and editing regions, adjacencies, and starting scenarios.

**World maps as Workshop resources:**

World maps are a first-class Workshop resource category (`category: world-map`). This makes them discoverable, installable, version-tracked, and composable like any other Workshop content:

```yaml
# Workshop manifest for a world map package
package:
  name: "galactic-conquest-map"
  publisher: "scifi-modding-collective"
  version: "2.1.0"
  license: "CC-BY-SA-4.0"
  description: "A 40-region galactic star map for sci-fi total conversions"
  category: world-map
  game_module: any                     # or a specific module
  engine_version: "^0.3.0"
  
  tags: ["sci-fi", "galactic", "space", "large"]
  ai_usage: allow                       # LLM can select this map for generated campaigns
  
  dependencies:
    - id: "scifi-modding-collective/space-faction-pack"
      version: "^1.0"                  # faction definitions this map references

files:
  world_map.yaml: { sha256: "..." }   # region definitions, adjacency, scenarios
  assets/galaxy_background.png: { sha256: "..." }
  assets/region_overlays.png: { sha256: "..." }
  assets/faction_icons/: {}            # per-faction marker icons
  preview.png: { sha256: "..." }       # Workshop listing thumbnail
```

Workshop world maps support the full Workshop lifecycle:

- **Discovery** — browse/search by game module, region count, theme tags, rating. Filter by "maps with 20+ regions" or "fantasy setting" or "historical."
- **One-click install** — download the `.icpkg`, world map appears in the campaign setup screen under "Community Maps."
- **Dependency resolution** — a world map can depend on faction packs, terrain packs, or sprite sets. Workshop resolves and installs dependencies automatically.
- **Versioning** — semver; breaking changes (region ID renames, adjacency changes) require major version bumps. Saved campaigns pin the world map version they were started with.
- **Forking** — any published world map can be forked. "I like that galactic map but I want to add a wormhole network" → fork, edit in Campaign Editor, republish as a derivative (license permitting).
- **LLM integration** — world maps with `ai_usage: allow` can be discovered by the LLM during campaign generation. The LLM reads region metadata (terrain types, strategic values, flavor text) to generate contextually appropriate missions. A rich, well-annotated world map gives the LLM more material to work with.
- **Composition** — a world map can reference other Workshop resources. Faction packs define the factions. Terrain packs provide the visual assets. Music packs set the atmosphere. The world map is the strategic skeleton; other Workshop resources flesh it out.
- **Rating and reviews** — community rates world maps on balance, visual quality, replayability. High-rated maps surface in "Featured" listings.

**World map as an engine feature, not a campaign feature:**

The world map renderer is in `ic-ui` — it's a general-purpose interactive map component. The World Domination campaign mode uses it as its primary interface, but the same component powers:

- The "World Map" intermission template in D038 (for non-domination campaigns that want a mission-select map)
- Strategic overview displays in Game Master mode
- Multiplayer lobby map selection (showing region-based game modes)
- Mod-defined strategic layers (e.g., a Generals mod with a global war on terror, a Star Wars mod with a galactic conquest, a fantasy mod with a continent map)

The engine imposes no assumptions about what the map represents. Regions are abstract nodes with connections, properties, and an image overlay. Whether those nodes are countries, planets, city districts, or dungeon rooms is entirely up to the content creator. The engine provides the map renderer; the game module and mods provide the map data.

Because world maps are Workshop resources, the community can build a library of strategic maps independently of the engine team. A thriving Workshop means a player launching World Domination for the first time can browse dozens of community-created maps — historical, fictional, fantastical — and start a campaign on any of them without the modder needing to ship a full game module.

#### Workshop Resource Integration

The LLM doesn't generate everything from scratch. It draws on the player's configured Workshop sources (D030) for maps, terrain packs, music, and other assets — the same pipeline described in § LLM-Driven Resource Discovery above.

**How this works in campaign generation:**

1. The LLM plans a mission: "Arctic base assault in a fjord."
2. The generation system searches Workshop: `tags=["arctic", "fjord", "base"], ai_usage=Allow`.
3. If a suitable map exists → use it as the terrain base, generate objectives/triggers/briefing on top.
4. If no map exists → generate the map from scratch (YAML terrain definition).
5. Music, ambient audio, and voice packs from Workshop enhance the atmosphere — the LLM selects thematically appropriate resources from those available.

This makes generative campaigns richer in communities with active Workshop content creators. A well-stocked Workshop full of diverse maps and assets becomes a palette the LLM paints from. Resource attribution is tracked: the campaign's `mod.yaml` lists all Workshop dependencies, crediting the original creators.

#### No LLM? Campaign Still Works

The generative campaign system follows the core D016 principle: **LLM is for creation, not for play.**

- A player with an LLM generates a campaign → plays it → it's saved as standard D021.
- A player without an LLM → imports and plays a shared campaign from Workshop. No different from playing a hand-crafted campaign.
- A player starts a generative campaign, generates 12/24 missions, then loses LLM access → the 12 generated missions are fully playable. The campaign is "shorter than planned" but complete up to that point. When LLM access returns, generation resumes from mission 12.
- A community member takes a generated 24-mission campaign, opens it in the Campaign Editor, and hand-edits missions 15–24 to improve them. No LLM needed for editing.

The LLM is a tool in the content creation pipeline — the same pipeline that includes the Scenario Editor, Campaign Editor, and hand-authored YAML. Generated campaigns are first-class citizens of the same content ecosystem.

#### Multiplayer & Co-op Generative Campaigns

Everything described above — narrative campaigns, open-ended campaigns, world domination, cinematic generation — works in multiplayer. The generative campaign system builds on D038's co-op infrastructure (Player Slots, Co-op Mission Modes, Per-Player Objectives) and the D010 snapshottable sim. These are the multiplayer modes the generative system supports:

**Co-op generative campaigns:**

Two or more players share a generative campaign. They play together, the LLM generates for all of them, and the campaign adapts to their combined performance.

```yaml
# Co-op generative campaign setup
campaign_parameters:
  mode: generative
  player_count: 2                      # 2-4 players
  co_op_mode: allied_factions          # each player controls their own faction
  # Alternative modes from D038:
  # shared_command — both control the same army
  # commander_ops — one builds, one fights
  # split_objectives — different goals on the same map
  # asymmetric — one RTS player, one GM/support

  faction_player_1: soviet
  faction_player_2: allied             # co-op doesn't mean same faction
  difficulty: hard
  campaign_type: narrative             # or open_ended, world_domination
  length: 16
  tone: serious
```

**What the LLM generates differently for co-op:**

The LLM knows it's generating for multiple players. This changes mission design:

| Aspect                   | Single-player                  | Co-op                                                                      |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------- |
| **Map layout**           | One base, one frontline        | Multiple bases or sectors per player                                       |
| **Objectives**           | Unified objective list         | Per-player objectives + shared goals                                       |
| **Briefings**            | One briefing                   | Per-player briefings (different intel, different roles)                    |
| **Radar comms**          | Addressed to "Commander"       | Addressed to specific players by role/faction                              |
| **Dialogue choices**     | One player decides             | Each player gets their own choices; disagreements create narrative tension |
| **Character assignment** | All characters with the player | Named characters distributed across players                                |
| **Mission difficulty**   | Scaled for one                 | Scaled for combined player power + coordination challenge                  |
| **Narrative**            | One protagonist's story        | Interweaving storylines that converge at key moments                       |

**Player disagreements as narrative fuel:**

The most interesting co-op feature: **what happens when players disagree.** In a single-player campaign, the player makes all dialogue choices. In co-op, each player makes their own choices in intermissions and mid-mission dialogues. The LLM uses disagreements as narrative material:

- Player 1 wants to spare the prisoner. Player 2 wants to execute them. The LLM generates a confrontation scene between the players' commanding officers, then resolves based on a configurable rule: majority wins, mission commander decides (rotating role), or the choice splits into two consequences.
- Player 1 wants to attack the eastern front. Player 2 wants to defend the west. In World Domination mode, they can split — each player tackles a different region simultaneously (parallel missions at the same point in the campaign).
- Persistent disagreements shift character loyalties — an NPC commander who keeps getting overruled becomes resentful, potentially defecting (Campaign Event Patterns).

**Saving, pausing, and resuming co-op campaigns:**

Co-op campaigns are long. Players can't always finish in one sitting. The system supports **pause, save, and resume** for multiplayer campaigns:

```
┌────────────────────────────────────────────────────────────────┐
│                  Co-op Campaign Session Flow                    │
│                                                                │
│  1. Player A creates a co-op generative campaign               │
│     └── Campaign saved to Player A's local storage             │
│                                                                │
│  2. Player A invites Player B (friend list, lobby code, link)  │
│     └── Player B receives campaign metadata + join token       │
│                                                                │
│  3. Both players play missions together                        │
│     └── Campaign state synced: both have a local copy          │
│                                                                │
│  4. Mid-campaign: players want to stop                         │
│     ├── Either player can request pause                        │
│     ├── Current mission: standard multiplayer save (D010)      │
│     │   └── Full sim snapshot + campaign state                  │
│     └── Campaign state saved: mission progress, roster, flags  │
│                                                                │
│  5. Resume later (hours, days, weeks)                          │
│     ├── Player A loads campaign from "My Campaigns"            │
│     ├── Player A re-invites Player B                           │
│     ├── Player B's client receives the campaign state delta    │
│     └── Resume from exactly where they left off                │
│                                                                │
│  6. Player B unavailable? Options:                             │
│     ├── Wait for Player B                                      │
│     ├── AI takes Player B's slot (temporary)                   │
│     ├── Invite Player C to take over (with B's consent)        │
│     └── Continue solo (B's faction runs on AI)                 │
└────────────────────────────────────────────────────────────────┘
```

**How multiplayer save works (technically):**

- **Mid-mission save:** Uses D010 — full sim snapshot. Both players receive the snapshot. Either player can host the resume session. The save file is a standard `.icsave` containing the sim snapshot and campaign state (embedded in `SimSnapshot.campaign_state`). No order history is stored — the snapshot is self-contained; the sim restores from it directly without replaying orders. See `formats/save-replay-formats.md` for the canonical `.icsave` layout.
- **Between-mission save:** The natural pause point. Campaign state (D021) is serialized — roster, flags, mission graph position, world map state (if World Domination). No sim snapshot needed — the next mission hasn't started yet.
- **Campaign ownership:** The campaign is "owned" by the creating player but the save state is portable. If Player A disappears, Player B has a full local copy and can resume solo or with a new partner.

**Co-op World Domination:**

World Domination campaigns with multiple human players — each controlling a faction on the world map. The LLM generates missions for all players, weaving their actions into a shared narrative. Two modes:

| Mode                  | Description                                                                                                                                                                                | Example                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Allied co-op**      | Players share a team against AI factions. They coordinate attacks on different fronts simultaneously. One player attacks Berlin while the other defends Moscow.                            | 2 players (Soviet team) vs. AI (Allied + Neutral)              |
| **Competitive co-op** | Players are rival factions on the same map. Each plays their own campaign missions. When players' territories are adjacent, they fight each other. An AI faction provides a shared threat. | Player 1 (Soviet) vs. Player 2 (Allied) vs. AI (Rogue faction) |

Allied co-op World Domination is particularly compelling — two friends on voice chat, splitting their forces across a continent, coordinating strategy: "I'll push into Scandinavia if you hold the Polish border." The LLM generates missions for both fronts simultaneously, with narrative crossover: "Intelligence reports your ally has broken through in Norway. Allied forces are retreating south — expect increased resistance on your front."

**Asynchronous campaign play:**

Not every multiplayer session needs to be real-time. For players in different time zones or with unpredictable schedules, the system supports **asynchronous play** in competitive World Domination campaigns:

```yaml
async_config:
  mode: async_competitive              # players play their campaigns asynchronously
  move_deadline: 48h                   # max time before AI plays your next mission
  notification: true                   # notify when the other player has completed a mission
  ai_fallback_on_deadline: true        # AI plays your mission if you don't show up
```

How it works:

1. Player A logs in, sees the world map. The LLM (or template system) presents their next mission — an attack, defense, or narrative event.
2. Player A plays the RTS mission in real-time. The mission resolves. The campaign state updates. Notification sent to Player B.
3. Player B logs in hours/days later. They see how the map changed based on Player A's results. The LLM presents Player B's next mission based on the updated state.
4. Player B plays their mission. The map updates again. Notification sent to Player A.

The RTS missions are fully real-time (you play a complete battle). The asynchronous part is *when* each player sits down to play — not what they do when they're playing. The LLM (or strategic AI fallback) generates narrative that acknowledges the asynchronous pacing — no urgent "the enemy is attacking NOW!" when the other player won't see it for 12 hours.

**Generative challenge campaigns:**

The LLM generates short, self-contained challenges that the community can attempt and compete on:

| Challenge type       | Description                                                                                        | Competitive element                  |
| -------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Weekly challenge** | A generated 3-mission mini-campaign with a leaderboard. Same seed = same campaign for all players. | Score (time, casualties, objectives) |
| **Ironman run**      | A generated campaign with permadeath — no save/reload. Campaign ends when you lose.                | How far you get (mission count)      |
| **Speed campaign**   | Generated campaign optimized for speed — short missions, tight timers.                             | Total completion time                |
| **Impossible odds**  | Generated campaign where the LLM deliberately creates unfair scenarios.                            | Binary: did you survive?             |
| **Community vote**   | Players vote on campaign parameters. The LLM generates one campaign that everyone plays.           | Score leaderboard                    |

Weekly challenges reuse the same seed and LLM output — the campaign is generated once, published to the community, and everyone plays the identical missions. This is fair because the content is deterministic once generated. Leaderboards are per-challenge, stored via the community server (D052) with signed credential records.

**Spectator and observer mode:**

Live campaigns (especially co-op and competitive World Domination) can be observed:

- **Live spectator** — watch a co-op campaign in progress (delay configurable for competitive fairness). See both players' perspectives.
- **Replay spectator** — watch a completed campaign, switching between player perspectives. The replay includes all dialogue choices, intermission decisions, and world map actions.
- **Commentary mode** — a spectator can record voice commentary over a replay, creating a "let's play" package sharable on Workshop.
- **Campaign streaming** — the campaign state can be broadcast to a spectator server. Community members watch the world map update in real-time during community events.
- **Author-guided camera** — scenario authors place Spectator Bookmark modules (D038) at key map locations and wire them to triggers. Spectators cycle bookmarks with hotkeys; replays auto-cut to bookmarks at dramatic moments. Free camera remains available — bookmarks are hints, not constraints.
- **Spectator appeal as design input** — Among Us became a cultural phenomenon through streaming because social dynamics are more entertaining to *watch* than many games are to play. Modes like Mystery (accusation moments), Nemesis (escalating rivalry), and Defection (betrayal) are inherently watchable — LLM-generated dialogue, character reactions, and dramatic pivots create spectator-friendly narrative beats. This is a validation of the existing spectator infrastructure, not a new feature: the commentary mode, War Dispatches, and replay system already capture these moments. When the LLM generates campaign content, it should mark **spectator-highlight moments** (accusations, betrayals, nemesis confrontations, moral dilemmas) in the campaign save so replays can auto-cut to them.

**Co-op resilience (eliminated player engagement):**

In any co-op campaign, a critical question: what happens when one player's forces are devastated mid-mission? Among Us's insight is that eliminated players keep playing — dead crewmates complete tasks and observe. IC applies this principle: a player whose army is destroyed doesn't sit idle. Options compose from existing systems:

- **Intelligence/advisor role** — the eliminated player transitions to managing the intermission-layer intelligence network (Espionage mode) or providing strategic guidance through the shared chat. They see the full battlefield (observer perspective) and can ping locations, mark threats, and coordinate with the surviving player.
- **Reinforcement controller** — the eliminated player controls reinforcement timing and positioning for the surviving partner. They decide *when* and *where* reserve units deploy, adding a cooperative command layer.
- **Rebuild mission** — the eliminated player receives a smaller side-mission to re-establish from a secondary base or rally point. Success in the side-mission provides reinforcements to the surviving player's main mission.
- **Game Master lite** — using the scenario's reserve pool, the eliminated player places emergency supply drops, triggers scripted reinforcements, or activates defensive structures. A subset of Game Master (D038) powers, scoped to assist rather than control.

The specific role available depends on the campaign mode and scenario design. The key principle: **no player should ever watch an empty screen in a co-op campaign**. Even total military defeat is a phase transition, not an ejection.

**Generative multiplayer scenarios (non-campaign):**

Beyond campaigns, the LLM generates one-off multiplayer scenarios:

- **Generated skirmish maps** — "Generate a 4-player free-for-all map with lots of chokepoints and limited resources." The LLM creates a balanced multiplayer map.
- **Generated team scenarios** — "Create a 2v2 co-op defense mission against waves of enemies." The LLM generates a PvE scenario with scaling difficulty.
- **Generated party modes** — "Make a king-of-the-hill map where the hill moves every 5 minutes." Creative game modes generated on demand.
- **Tournament map packs** — "Generate 7 balanced 1v1 maps for a tournament, varied terrain, no water." A set of maps with consistent quality and design language.

These generate as standard IC content — the same maps and scenarios that human designers create. They can be played immediately, saved, edited, or published to Workshop.

#### Persistent Heroes & Named Squads

The infrastructure for hero-centric, squad-based campaigns with long-term character development is fully supported by existing systems — no new engine features required. Everything described below composes from D021 (persistent rosters), D016 (character construction + CharacterState), D029 (component library), the veterancy system, and YAML/Lua modding.

**What the engine already provides:**

| Capability                            | Source                                         | How it applies                                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Named units persist across missions   | D021 carryover modes                           | A hero unit that survives mission 3 is the *same entity* in mission 15 — same health, same veterancy, same kill count                                                                                                    |
| Veterancy accumulates permanently     | D021 + veterancy system                        | A commando who kills 50 enemies across 10 missions earns promotions that change their stats, voice lines, and visual appearance                                                                                          |
| Permanent death                       | D021 + CharacterState                          | If Volkov dies in mission 7, `CharacterStatus::Dead` — he's gone forever. The campaign adapts around his absence. No reloading in Iron Man mode.                                                                         |
| Character personality persists        | D016 CharacterState                            | MBTI type, speech style, flaw/desire/fear, loyalty, relationship — all tracked and evolved by the LLM across the full campaign                                                                                           |
| Characters react to their own history | D016 battle reports + narrative threads        | A hero who was nearly killed in mission 5 develops caution. One who was betrayed develops trust issues. The LLM reads `notable_events` and adjusts behavior.                                                             |
| Squad composition matters             | D021 roster + D029 components                  | A hand-picked 5-unit squad with complementary abilities (commando + engineer + sniper + medic + demolitions) plays differently than a conventional army. Equipment captured in one mission equips the squad in the next. |
| Upgrades and equipment persist        | D021 equipment carryover + D029 upgrade system | A hero's captured experimental weapon, earned battlefield upgrades, and scavenged equipment carry forward permanently                                                                                                    |
| Customizable unit identity            | YAML unit definitions + Lua                    | Named units can have custom names, visual markings (kill tallies, custom insignia via Lua), and unique voice lines                                                                                                       |

**Campaign modes this enables:**

**Commando campaign ("Tanya Mode"):** A series of behind-enemy-lines missions with 1–3 hero units and no base building. Every mission is a commando operation. The heroes accumulate kills, earn abilities, and develop personality through LLM-generated briefing dialogue. Losing your commando ends the campaign (Iron Man) or branches to a rescue mission (standard). The LLM generates increasingly personal rivalry between your commando and an enemy commander who's hunting them.

**Squad campaign ("Band of Brothers"):** A persistent squad of 5–12 named soldiers. Each squad member has an MBTI personality, a role specialization, and a relationship to the others. Between missions, the LLM generates squad interactions — arguments, bonding moments, confessions, humor — driven by MBTI dynamics and recent battle events. A medic (ISFJ) who saved the sniper (INTJ) in mission 4 develops a protective bond. The demolitions expert (ESTP) and the squad leader (ISTJ) clash over tactics. When a squad member dies, the LLM writes the other characters' grief responses consistent with their personalities and relationships. Replacements arrive — but they're new personalities who have to earn the squad's trust.

**Hero army campaign ("Generals"):** A conventional campaign where 3–5 hero units lead a full army. Heroes are special units with unique abilities, voice lines, and narrative arcs. They appear in briefings, issue orders to the player, argue with each other about strategy, and can be sent on solo objectives within larger missions. Losing a hero doesn't end the campaign but permanently changes it — the army loses a capability, the other heroes react, and the enemy adapts.

**Cross-campaign hero persistence ("Legacy"):** Heroes from a completed campaign carry over to the next campaign. A veteran commando from "Soviet Campaign" appears as a grizzled mentor in "Soviet Campaign 2" — with their full history, personality evolution, and kill count. `CharacterState` serializes to campaign save files and can be imported. The LLM reads the imported history and writes the character accordingly — a war hero is treated like a war hero.

**Iron Man integration:** All hero modes compose with Iron Man (no save/reload). Death is permanent. The campaign adapts. This is where the character investment pays off most intensely — the player who nursed a hero through 15 missions has real emotional stakes when that hero is sent into a dangerous situation. The LLM knows this and uses it: "Volkov volunteers for the suicide mission. He's your best commando. But if he goes in alone, he won't come back."

**Modding support:** All of this is achievable through YAML + Lua (Tier 1-2 modding). A modder defines named hero units in YAML with custom stats, abilities, and visual markings. Lua scripts handle special hero abilities ("Volkov plants the charges — 30-second timer"), squad interaction triggers, and custom carryover rules. The LLM's character construction system works with any modder-defined units — the MBTI framework and flaw/desire/fear triangle apply regardless of the game module. A Total Conversion mod in a fantasy setting could have a persistent party of heroes with swords instead of guns — the personality simulation works the same way.

