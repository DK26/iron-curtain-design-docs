#### Saving, Replaying, and Sharing

**Campaign library:**

Every generative campaign is saved to the player's local campaign list:

```
┌──────────────────────────────────────────────────────┐
│  My Campaigns                                         │
│                                                       │
│  📖 Operation Iron Tide          Soviet  24/24  ★★★★  │
│     Generated 2026-02-14  |  Completed  |  18h 42m   │
│  📖 Arctic Vengeance             Allied  12/16  ▶︎    │
│     Generated 2026-02-10  |  In Progress              │
│  📖 Desert Crossroads            Soviet   8/8   ★★★   │
│     Generated 2026-02-08  |  Completed  |  6h 15m    │
│  📕 Red Alert (Hand-crafted)     Soviet  14/14  ★★★★★ │
│     Built-in campaign                                 │
│                                                       │
│  [+ New Generative Campaign]  [Import...]             │
└──────────────────────────────────────────────────────┘
```

- **Auto-naming:** The LLM names each campaign at skeleton generation. The player can rename.
- **Progress tracking:** Shows mission count (played / total), completion status, play time.
- **Rating:** Player can rate their own campaign (personal quality bookmark).
- **Resume:** In-progress campaigns resume from the last completed mission. The next mission generates on resume if not already cached.

**Replayability:**

A completed generative campaign is a complete D021 campaign — all 24 missions exist as YAML + Lua + maps. The player (or anyone they share it with) can replay it from the start without an LLM. The campaign graph, all branching paths, and all mission content are materialized. A replayer can take different branches than the original player did, experiencing the missions the original player never saw.

**Sharing:**

Campaigns are shareable as standard IC campaign packages:

- **Export:** `ic campaign export "Operation Iron Tide"` → produces a `.icpkg` campaign package (ZIP with `campaign.yaml`, mission files, maps, Lua scripts, assets). Same format as any hand-crafted campaign.
- **Workshop publish:** One-click publish to Workshop (D030). The campaign appears alongside hand-crafted campaigns — there's no second-class status. Tags indicate "LLM-generated" for discoverability, not segregation.
- **Import:** Other players install the campaign like any Workshop content. No LLM needed to play.

**Community refinement:**

Shared campaigns are standard IC content — fully editable. Community members can:

- **Open in the Campaign Editor (D038):** See the full mission graph, edit transitions, adjust difficulty, fix LLM-generated rough spots.
- **Modify missions in the Scenario Editor:** Adjust unit placement, triggers, objectives, terrain. Polish LLM output into hand-crafted quality.
- **Edit campaign parameters:** The campaign package includes the original `CampaignParameters` and `CampaignSkeleton` YAML. A modder can adjust these and re-generate specific missions (if they have an LLM configured), or directly edit the generated output.
- **Edit inner prompts:** The campaign package preserves the generation prompts used for each mission. A modder can modify these prompts — adjusting tone, adding constraints, changing character behavior — and re-generate specific missions to see different results. This is the "prompt as mod parameter" principle: the LLM instructions are part of the campaign's editable content, not hidden internals.
- **Fork and republish:** Take someone's campaign, improve it, publish as a new version. Standard Workshop versioning applies. Credit the original via Workshop dependency metadata.

This creates a **generation → curation → refinement pipeline**: the LLM generates raw material, the community curates the best campaigns (Workshop ratings, downloads), and skilled modders refine them into polished experiences. The LLM is a starting gun, not the finish line.

#### Branching in Generative Campaigns

Branching is central to generative campaigns, not optional. The LLM generates missions with multiple named outcomes (D021), and the player's choice of outcome drives the next generation.

**Within-mission branching:**

Each generated mission has 2–4 named outcomes. These aren't just win/lose — they're narrative forks:

- "Victory — civilians evacuated" vs. "Victory — civilians sacrificed for tactical advantage"
- "Victory — Volkov survived" vs. "Victory — Volkov killed covering the retreat"
- "Defeat — orderly retreat" vs. "Defeat — routed, heavy losses"

The LLM generates different outcome descriptions and assigns different story flag effects to each. The next mission is generated based on which outcome the player achieved.

**Between-mission branching:**

The campaign skeleton includes planned branch points (approximately every 4–6 missions). At these points, the LLM generates 2–3 possible next missions and lets the campaign graph branch. The player's outcome determines which branch they take — but since missions are generated progressively, the LLM only generates the branch the player actually enters (plus one mission lookahead on the most likely alternate path, for pacing).

**Branch convergence:**

Not every branch diverges permanently. The LLM's skeleton includes convergence points — moments where different paths lead to the same narrative beat (e.g., "regardless of which route you took, the final assault on Berlin begins"). This prevents the campaign from sprawling into an unmanageable tree. The skeleton's act structure naturally creates convergence: all Act 1 paths converge at the Act 2 opening, all Act 2 paths converge at the climax.

**Why branching matters even with LLM generation:**

One might argue that since the LLM generates each mission dynamically, branching is unnecessary — just generate whatever comes next. But branching serves a critical purpose: **the generated campaign must be replayable without an LLM.** Once materialized, the campaign graph must contain the branches the player *didn't* take too, so a replayer (or the same player on a second playthrough) can explore alternate paths. The LLM generates branches ahead of time. Progressive generation generates the branches as they become relevant — not all 24 missions on day one, but also not waiting until the player finishes mission 7 to generate mission 8's alternatives.

#### Campaign Event Patterns

The LLM doesn't just generate "attack this base" missions in sequence. It draws from a vocabulary of **dramatic event patterns** — narrative structures inspired by the C&C franchise's most memorable campaign moments and classic military fiction. These patterns are documented in the system prompt so the LLM has a rich palette to paint from.

The LLM chooses when and how to deploy these patterns based on the campaign context, battle reports, character states, and narrative pacing. None are scripted in advance — they emerge from the interplay of the player's actions and the LLM's storytelling.

**Betrayal & defection patterns:**

- **The backstab.** A trusted ally — an intelligence officer, a fellow commander, a political advisor — switches sides mid-campaign. The turn is foreshadowed in briefings (the LLM plants hints over 2–3 missions: contradictory intel, suspicious absences, intercepted communications), then triggered by a story flag or a player decision. Inspired by: Nadia poisoning Stalin (RA1), Yuri's betrayal (RA2).
- **Defection offer.** An enemy commander, impressed by the player's performance or disillusioned with their own side, secretly offers to defect. The player must decide: accept (gaining intelligence + units but risking a double agent) or refuse. The LLM uses the `relationship_to_player` score from battle reports — if the player spared enemy forces in previous missions, defection becomes plausible.
- **Loyalty erosion.** A character's `loyalty` score drops based on player actions: sacrificing troops carelessly, ignoring a character's advice repeatedly, making morally questionable choices. When loyalty drops below a threshold, the LLM generates a confrontation mission — the character either leaves, turns hostile, or issues an ultimatum.
- **The double agent.** A rescued prisoner, a defector from the enemy, a "helpful" neutral — someone the player trusted turns out to be feeding intelligence to the other side. The reveal comes when the player notices the enemy is always prepared for their strategies (the LLM has been describing suspiciously well-prepared enemies for several missions).

**Rogue faction patterns:**

- **Splinter group.** Part of the player's own faction breaks away — a rogue general forms a splinter army, or a political faction seizes a province and declares independence. The player must fight former allies with the same unit types and tactics. Inspired by: Yuri's army splitting from the Soviets (RA2), rogue Soviet generals in RA1.
- **Third-party emergence.** A faction that didn't exist at campaign start appears mid-campaign: a resistance movement, a mercenary army, a scientific cult with experimental weapons. The LLM introduces them as a complication — sometimes an optional ally, sometimes an enemy, sometimes both at different times.
- **Warlord territory.** In open-ended campaigns, regions not controlled by either main faction become warlord territories — autonomous zones with their own mini-armies and demands. The LLM generates negotiation or conquest missions for these zones.

**Plot twist patterns:**

- **Secret weapon reveal.** The enemy unveils a devastating new technology: a superweapon, an experimental unit, a weaponized chronosphere. The LLM builds toward the reveal (intelligence fragments over 2–3 missions), then the player faces it in a desperate defense mission. Follow-up missions involve stealing or destroying it.
- **True enemy reveal.** The faction the player has been fighting isn't the real threat. A larger power has been manipulating both sides. The campaign pivots to a temporary alliance with the former enemy against the true threat. Inspired by: RA2 Yuri's Revenge (Allies and Soviets team up against Yuri).
- **The war was a lie.** The player's own command has been giving false intelligence. The "enemy base" the player destroyed in mission 5 was a civilian research facility. The "war hero" the player is protecting is a war criminal. Moral complexity emerges from the campaign's own history, not from a pre-written script.
- **Time pressure crisis.** A countdown starts: nuclear launch, superweapon charging, allied capital about to fall. The next 2–3 missions are a race against time, each one clearing a prerequisite for the final mission (destroy the radar, capture the codes, reach the launch site). The LLM paces this urgently — short missions, high stakes, no breathers.

**Force dynamics patterns:**

- **Army to resistance.** After a catastrophic loss, the player's conventional army is shattered. The campaign genre shifts: smaller forces, guerrilla objectives (sabotage, assassination, intelligence gathering), no base building. The LLM generates this naturally when the battle report shows heavy losses. Rebuilding over subsequent missions gradually restores conventional operations.
- **Underdog to superpower.** The inverse: the player starts with a small force and grows mission by mission. The LLM scales enemy composition accordingly, and the tone shifts from desperate survival to strategic dominance. Late-campaign missions are large-scale assaults the player couldn't have dreamed of in mission 2.
- **Siege / last stand.** The player must hold a critical position against overwhelming odds. Reinforcement timing is the drama — will they arrive? The LLM generates increasingly desperate defensive waves, with the outcome determining whether the campaign continues as a retreat or a counter-attack.
- **Behind enemy lines.** A commando mission deep in enemy territory with a small, hand-picked squad. No reinforcements, no base, limited resources. Named characters shine here. Inspired by: virtually every Tanya mission in the RA franchise.

**Character-driven patterns:**

- **Rescue the captured.** A named character is captured during a mission (or between missions, as a narrative event). The player faces a choice: launch a risky rescue operation, negotiate a prisoner exchange (giving up tactical advantage), or abandon them (with loyalty consequences for other characters). A rescued character returns with changed traits — traumatized, radicalized, or more loyal than ever.
- **Rival commander.** The LLM develops a specific enemy commander as the player's nemesis. This character appears in briefings, taunts the player after defeats, acts surprised after losses. The rivalry develops over 5–10 missions before the final confrontation. The enemy commander reacts to the player's tactics: if the player favors air power, the rival starts deploying heavy AA and mocking the strategy.
- **Mentor's fall.** An experienced commander who guided the player in early missions is killed, goes MIA, or turns traitor. The player must continue without their guidance — the tone shifts from "following orders" to "making hard calls alone."
- **Character return.** A character thought dead or MIA resurfaces — changed. An MIA character returns with intelligence gained during capture. A "dead" character survived and is now leading a resistance cell. A defected character has second thoughts. The LLM tracks `CharacterStatus::MIA` and `CharacterStatus::Dead` and can reverse them with narrative justification.

**Diplomatic & political patterns:**

- **Temporary alliance.** The player's faction and the enemy faction must cooperate against a common threat (rogue faction, third-party invasion, natural disaster). Missions feature mixed unit control — the player commands some enemy units. Trust is fragile; the alliance may end in betrayal.
- **Ceasefire and cold war.** Fighting pauses for 2–3 missions while the LLM generates espionage, infiltration, and political maneuvering missions. The player builds up forces during the ceasefire, knowing combat will resume. When and how it resumes depends on the player's actions during the ceasefire.
- **Civilian dynamics.** Missions where civilians matter: evacuate a city before a bombing, protect a refugee convoy, decide whether to commandeer civilian infrastructure. The player's treatment of civilians affects the campaign's politics — a player who protects civilians gains partisan support; one who sacrifices them faces insurgencies on their own territory.

These patterns are examples, not an exhaustive list. The LLM's system prompt includes them as inspiration. The LLM can also invent novel patterns that don't fit these categories — the constraint is that every event must produce standard D021 missions and respect the campaign's current state, not that every event must match a template.

#### Open-Ended Campaigns

Fixed-length campaigns (8, 16, 24 missions) suit players who want a structured experience. But the most interesting generative campaigns may be **open-ended** — where the campaign continues until victory conditions are met, and the LLM determines the pacing.

**How open-ended campaigns work:**

Instead of "generate 24 missions," the player defines **victory conditions** — a set of goals that, when achieved, trigger the campaign finale:

```yaml
victory_conditions:
  # Any ONE of these triggers the final mission sequence
  - type: eliminate_character
    target: "General Morrison"
    description: "Hunt down and eliminate the Allied Supreme Commander"
  - type: capture_locations
    targets: ["London", "Paris", "Washington"]
    description: "Capture all three Allied capitals"
  - type: survival
    missions: 30
    description: "Survive 30 missions against escalating odds"

# Optional: defeat conditions that end the campaign in failure
defeat_conditions:
  - type: roster_depleted
    threshold: 0       # lose all named characters
    description: "All commanders killed — the war is lost"
  - type: lose_streak
    count: 3
    description: "Three consecutive mission failures — command is relieved"
```

The LLM sees these conditions and works toward them narratively. It doesn't just generate missions until the player happens to kill Morrison — it builds a story arc where Morrison is an escalating threat, intelligence about his location is gathered over missions, near-misses create tension, and the final confrontation feels earned.

**Dynamic narrative shifts:**

Open-ended campaigns enable dramatic genre shifts that fixed-length campaigns can't. The LLM inspects the battle report and can pivot the entire campaign direction:

- **Army → Resistance.** The player starts with a full division. After a devastating defeat in mission 8, they lose most forces. The LLM generates mission 9 as a guerrilla operation — small squad, no base building, ambush tactics, sabotage objectives. The campaign has organically shifted from conventional warfare to an insurgency. If the player rebuilds over the next few missions, it shifts back.
- **Hunter → Hunted.** The player is pursuing a VIP target. The VIP escapes repeatedly. The LLM decides the VIP has learned the player's tactics and launches a counter-offensive. Now the player is defending against an enemy who knows their weaknesses.
- **Rising power → Civil war.** The player's faction is winning the war. Political factions within their own side start competing for control. The LLM introduces betrayal missions where the player fights former allies.
- **Conventional → Desperate.** Resources dry up. Supply lines are cut. The LLM generates missions with scarce starting resources, forcing the player to capture enemy supplies or scavenge the battlefield.

These shifts emerge naturally from the battle reports. The LLM doesn't follow a script — it reads the game state and decides what makes a good story.

**Escalation mechanics:**

In open-ended campaigns, the enemy isn't static. The LLM uses a concept of **enemy adaptation** — the longer the campaign runs, the more the enemy evolves:

- **VIP escalation.** A fleeing VIP gains experience and resources the longer they survive. Early missions to catch them are straightforward pursuits. By mission 15, the VIP has fortified a stronghold, recruited allies, and developed counter-strategies. The difficulty curve is driven by the narrative, not a slider.
- **Enemy learning.** The LLM tracks what strategies the player uses (from battle reports) and has the enemy adapt. Player loves tank rushes? The enemy starts mining approaches and building anti-armor defenses. Player relies on air power? The enemy invests in AA.
- **Resource escalation.** Both sides grow over the campaign. Early missions are skirmishes. Late missions are full-scale battles. The LLM scales force composition to match the campaign's progression.
- **Alliance shifts.** Neutral factions that appeared in early missions may become allies or enemies based on the player's choices. The political landscape evolves.

**How the LLM decides "it's time for the finale":**

The LLM doesn't just check `if conditions_met { generate_finale(); }`. It builds toward the conclusion:

1. **Sensing readiness.** The LLM evaluates whether the player's current roster, position, and narrative momentum make a finale satisfying. If the player barely survived the last mission, the finale waits — a recovery mission first.
2. **Creating the opportunity.** When conditions are approaching (the player has captured 2/3 capitals, Morrison's location is almost known), the LLM generates missions that create the *opportunity* for the final push — intelligence missions, staging operations, securing supply lines.
3. **The finale sequence.** The final mission (or final 2–3 missions) are generated as a climactic arc, not a single mission. The LLM knows these are the last ones and gives them appropriate weight — cutscene-worthy briefings, all surviving named characters present, callbacks to early campaign events.
4. **Earning the ending.** The campaign length is indeterminate but not infinite. The LLM aims for a satisfying arc — typically 15–40 missions depending on the victory conditions. If the campaign has gone on "too long" without progress toward victory (the player keeps failing to advance), the LLM introduces narrative catalysts: an unexpected ally, a turning point event, or a vulnerability in the enemy's position.

**Open-ended campaign identity:**

What makes open-ended campaigns distinct from fixed-length ones:

| Aspect               | Fixed-length (24 missions)               | Open-ended                                       |
| -------------------- | ---------------------------------------- | ------------------------------------------------ |
| **End condition**    | Mission count reached                    | Victory conditions met                           |
| **Skeleton**         | Full arc planned upfront                 | Backstory + conditions + characters; arc emerges |
| **Pacing**           | LLM knows position in arc (mission 8/24) | LLM estimates narrative momentum                 |
| **Narrative shifts** | Planned at branch points                 | Emerge from battle reports                       |
| **Difficulty**       | Follows configured curve                 | Driven by enemy adaptation + player state        |
| **Replayability**    | Take different branches                  | Entirely different campaign length and arc       |
| **Typical length**   | Exactly as configured                    | 15–40 missions (emergent)                        |

Both modes produce standard D021 campaigns. Both are saveable, shareable, and replayable without an LLM. The difference is in how much creative control the LLM exercises during generation.

#### World Domination Campaign

A third generative campaign mode — distinct from both fixed-length narrative campaigns and open-ended condition-based campaigns. **World Domination** is an LLM-driven narrative campaign where the story plays out across a world map. The LLM is the narrative director — it generates missions, drives the story, and decides what happens next based on the player's real-time battle results. The world map is the visualization: territory expands when you win, contracts when you lose, and shifts when the narrative demands it.

This is the mode where the campaign *is* the map.

**How it works:**

The player starts in a region — say, Greece — and fights toward a goal: conquer Europe, defend the homeland, push west to the Atlantic. The LLM generates each mission based on where the player stands on the map, what happened in previous battles, and where the narrative is heading. The player doesn't pick targets from a strategy menu — the LLM presents the next mission (or a choice between missions) based on the story it's building.

After each RTS battle, the results feed back to the LLM. Won decisively? Territory advances. Lost badly? The enemy pushes into your territory. But it's not purely mechanical — the LLM controls the narrative arc. Maybe you lose three missions in a row, your territory shrinks, things look dire — and then the LLM introduces a turning point: your engineers develop a new weapon, a neutral faction joins your side, a storm destroys the enemy's supply lines. Or maybe there's no rescue — you simply lose. The LLM decides based on accumulated battle results, the story it's been building, and the dramatic pacing.

```yaml
# World Domination campaign setup (extends standard CampaignParameters)
world_domination:
  map: "europe_1953"                  # world map asset (see World Map Assets below)
  starting_region: "athens"           # where the player's campaign begins
  factions:
    - id: soviet
      name: "Soviet Union"
      color: "#CC0000"
      starting_regions: ["moscow", "leningrad", "stalingrad", "kiev", "minsk"]
      ai_personality: null             # player-controlled
    - id: allied
      name: "Allied Forces"
      color: "#0044CC"
      starting_regions: ["london", "paris", "washington", "rome", "berlin"]
      ai_personality: "strategic"      # AI-controlled (D043 preset)
    - id: neutral
      name: "Neutral States"
      color: "#888888"
      starting_regions: ["stockholm", "bern", "ankara", "cairo"]
      ai_personality: "defensive"      # defends territory, doesn't expand

  # The LLM decides when and how the campaign ends — these are hints, not hard rules.
  # The LLM may end the campaign with a climactic finale at 60% control, or let
  # the player push to 90% if the narrative supports it.
  narrative_hints:
    goal_direction: west               # general direction of conquest (flavor for LLM)
    domination_target: "Europe"        # what "winning" means narratively
    tone: military_drama              # narrative tone: military_drama, pulp, dark, heroic
```

**The campaign loop:**

```
┌────────────────────────────────────────────────────────────────┐
│                    World Domination Loop                        │
│                                                                │
│  1. VIEW WORLD MAP                                             │
│     ├── See your territory, enemy territory, contested zones   │
│     ├── See the frontline — where your campaign stands         │
│     └── See the narrative state (briefing, intel, context)     │
│                                                                │
│  2. LLM PRESENTS NEXT MISSION                                  │
│     ├── Based on current frontline and strategic situation      │
│     ├── Based on accumulated battle results and player actions  │
│     ├── Based on narrative arc (pacing, tension, stakes)        │
│     ├── May offer a choice: "Attack Crete or reinforce Athens?" │
│     └── May force a scenario: "Enemy launches surprise attack!" │
│                                                                │
│  3. PLAY RTS MISSION (standard IC gameplay)                    │
│     └── Full real-time battle — this is the game                │
│                                                                │
│  4. RESULTS FEED BACK TO LLM                                   │
│     ├── Battle outcome (victory, defeat, pyrrhic, decisive)    │
│     ├── Casualties, surviving units, player tactics used        │
│     ├── Objectives completed or failed                         │
│     └── Time taken, resources spent, player style               │
│                                                                │
│  5. LLM UPDATES THE WORLD                                      │
│     ├── Territory changes (advance, retreat, or hold)           │
│     ├── Narrative consequences (new allies, betrayals, tech)    │
│     ├── Story progression (turning points, escalation, arcs)   │
│     └── May introduce recovery or setback events               │
│                                                                │
│  6. GOTO 1                                                     │
└────────────────────────────────────────────────────────────────┘
```

**Region properties:**

Each region on the world map has strategic properties that affect mission generation:

```yaml
regions:
  berlin:
    display_name: "Berlin"
    terrain_type: urban              # affects generated map terrain
    climate: temperate               # affects weather (D022)
    resource_value: 3                # economic importance (LLM considers for narrative weight)
    fortification: heavy             # affects defender advantage
    population: civilian_heavy       # affects civilian presence in missions
    adjacent: ["warsaw", "prague", "hamburg", "munich"]
    special_features:
      - type: factory_complex        # bonus: faster unit production
      - type: airfield               # bonus: air support in adjacent battles
    strategic_importance: critical    # LLM emphasizes this in narrative

  arctic_outpost:
    display_name: "Arctic Research Station"
    terrain_type: arctic
    climate: arctic
    resource_value: 1
    fortification: light
    population: minimal
    adjacent: ["murmansk", "arctic_sea"]
    special_features:
      - type: research_lab           # bonus: unlocks special units/tech
    strategic_importance: moderate
```

**Progress and regression:**

The world map is not a one-way march to victory. The LLM drives territory changes based on battle outcomes *and* narrative arc:

- **Win a mission** → territory typically advances. The LLM decides how much — a minor victory might push one region forward, a decisive rout might cascade into capturing two or three.
- **Lose a mission** → the enemy pushes in. The LLM decides the severity — a narrow loss might mean holding the line but losing influence, while a collapse means the enemy sweeps through multiple regions.
- **Pyrrhic victory** → you won, but at what cost? The LLM might advance your territory but weaken your forces so severely that the next mission is a desperate defense.

But it's not a mechanical formula. The LLM is a **narrative director**, not a spreadsheet. It mixes battle results with story:

- **Recovery arcs:** You've lost three missions. Your territory has shrunk to a handful of regions. Things look hopeless — and then the LLM introduces a breakthrough. Maybe your engineers develop a new superweapon. Maybe a neutral faction defects to your side. Maybe a brutal winter slows the enemy advance and buys you time. The recovery feels earned because it follows real setbacks.
- **Deus ex machina:** Rarely, the LLM creates a dramatic reversal — an earthquake destroys the enemy's main base, a rogue commander switches sides, an intelligence coup reveals the enemy's plans. These are narratively justified and infrequent enough to feel special.
- **Escalation:** You're winning too easily? The LLM introduces complications — a second front opens, the enemy deploys experimental weapons, an ally betrays you. The world map shifts to reflect the new threat.
- **Inevitable defeat:** Sometimes there's no rescue. If the player keeps losing badly and the narrative can't credibly save them, the campaign ends in defeat. The LLM builds to a dramatic conclusion — a last stand, a desperate evacuation, a bitter retreat — rather than just showing "Game Over."

The key insight: **the player's agency is in the RTS battles.** How well you fight determines the raw material the LLM works with. Win well and consistently, and the narrative carries you forward. Fight poorly, and the LLM builds a story of struggle and potential collapse. But the LLM always has latitude to shape the pacing — it's telling a war story, not just calculating territory percentages.

**Force persistence across the map:**

Units aren't disposable between battles. The world domination mode uses a **per-region force pool**:

- Each region the player controls has a garrison (force pool). The player deploys from these forces when attacking from or defending that region.
- Casualties in battle reduce the garrison. Reinforcements arrive as the narrative progresses (based on controlled factories, resource income, and narrative events).
- Veteran units from previous battles remain — a region with battle-hardened veterans is harder to defeat than one with fresh recruits.
- Named characters (D038 Named Characters) can be assigned to regions. Moving them to a front gives bonuses but risks their death.
- D021's roster persistence and carryover apply within the campaign — the "roster" is the regional garrison.

**Mission generation from campaign state:**

The LLM generates each mission from the **strategic situation** — it's not picking from a random pool, it's reading the state of the world and crafting a battle that makes sense:

| Input                       | How it affects the mission                                                             |
| --------------------------- | -------------------------------------------------------------------------------------- |
| **Region terrain type**     | Map terrain (urban streets, arctic tundra, rural farmland, desert, mountain pass)      |
| **Attacker's force pool**   | Player's starting units (drawn from the garrison)                                      |
| **Defender's force pool**   | Enemy's garrison strength (affects enemy unit count and quality)                       |
| **Fortification level**     | Defender gets pre-built structures, mines, walls                                       |
| **Campaign progression**    | Tech level escalation — later in the campaign unlocks higher-tier units                |
| **Adjacent region bonuses** | Airfield = air support; factory = reinforcements mid-mission; radar = revealed shroud  |
| **Special features**        | Research lab = experimental units; port = naval elements                               |
| **Battle history**          | Regions fought over multiple times get war-torn terrain (destroyed buildings, craters) |
| **Narrative arc**           | Briefing, character dialogue, story events, turning points, named objectives           |
| **Player battle results**   | Previous performance shapes difficulty, tone, and stakes of the next mission           |

Without an LLM, missions are generated from **templates** — the system picks a template matching the terrain type and action type (urban assault, rural defense, naval landing, etc.) and populates it with forces from the strategic state. With an LLM, the missions are crafted: the briefing tells a story, characters react to what you did last mission, the objectives reflect the narrative the LLM is building.

**The world map between missions:**

Between missions, the player sees the world map — the D038 World Map intermission template, elevated into the primary campaign interface. The map shows the story so far: where you've been, what you control, and where the narrative is taking you next.

```
┌────────────────────────────────────────────────────────────────────────┐
│  WORLD DOMINATION — Operation Iron Tide          Mission 14  Soviet   │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │           ██ MURMANSK                                          │    │
│  │          ░░░░                                                  │    │
│  │    ██ STOCKHOLM    ██ LENINGRAD                                │    │
│  │      ░░░░░        ████████                                     │    │
│  │  ▓▓ LONDON    ▓▓ BERLIN   ██ MOSCOW    Legend:                 │    │
│  │  ▓▓▓▓▓▓▓▓   ░░░░░░░░   ████████████   ██ Soviet (You)        │    │
│  │  ▓▓ PARIS    ▓▓ PRAGUE   ██ KIEV       ▓▓ Allied (Enemy)      │    │
│  │  ▓▓▓▓▓▓▓▓   ░░ VIENNA   ██ STALINGRAD ░░ Contested           │    │
│  │  ▓▓ ROME     ░░ BUDAPEST ██ MINSK      ▒▒ Neutral             │    │
│  │              ▒▒ ISTANBUL                                       │    │
│  │              ▒▒ CAIRO                                          │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  Territory: 12/28 regions (43%)                                        │
│                                                                        │
│  ┌─ BRIEFING ────────────────────────────────────────────────────┐    │
│  │  General Volkov has ordered an advance into Central Europe.   │    │
│  │  Berlin is contested — Allied forces are dug in. Our victory  │    │
│  │  at Warsaw has opened the road west, but intelligence reports │    │
│  │  a counterattack forming from Hamburg.                        │    │
│  │                                                                │    │
│  │  "We push now, or we lose the initiative." — Col. Petrov      │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  [BEGIN MISSION: Battle for Berlin]                  [Save & Quit]    │
└────────────────────────────────────────────────────────────────────────┘
```

The map is the campaign. The player sees their progress and regression at a glance — territory expanding and contracting as the war ebbs and flows. The LLM presents the next mission through narrative briefing, not through a strategy game menu. Sometimes the LLM offers a choice ("Reinforce the eastern front or press the western advance?") — but the choices are narrative, not board-game actions.

**Comparison to narrative campaigns:**

| Aspect             | Narrative Campaign (fixed/open-ended)      | World Domination                                   |
| ------------------ | ------------------------------------------ | -------------------------------------------------- |
| **Structure**      | Linear/branching mission graph             | LLM-driven narrative across a world map            |
| **Mission order**  | Determined by story arc                    | Determined by LLM based on map state + results     |
| **Progress model** | Mission completion advances the story      | Territory changes visualize campaign progress      |
| **Regression**     | Rarely (defeat branches to different path) | Frequent — battles lost = territory lost           |
| **Recovery**       | Fixed by story branches                    | LLM-driven: new tech, allies, events, or defeat    |
| **Player agency**  | Choose outcomes within missions            | Fight well in RTS battles; LLM shapes consequences |
| **LLM role**       | Story arc, characters, narrative pacing    | Narrative director — drives the entire campaign    |
| **Without LLM**    | Requires shared/imported campaign          | Playable with templates (loses narrative richness) |
| **Replayability**  | Different branches                         | Different narrative every time                     |
| **Inspired by**    | C&C campaign structure + Total War         | C&C campaign feel + dynamic world map              |

**World domination without LLM:**

World Domination is **playable without an LLM**, though it loses its defining feature. Without the LLM, the system falls back to template-generated missions — pick a template matching the terrain and action type, populate it with forces from the strategic state. Territory advances/retreats follow mechanical rules (win = advance, lose = retreat) instead of narrative-driven pacing. There are no recovery arcs, no turning points, no deus ex machina — just a deterministic strategic layer. It still works as a campaign, but it's closer to a Risk-style conquest game than the narrative experience the LLM provides. The LLM is what makes World Domination feel like a *war story* rather than a *board game*.

**Strategic AI for non-player factions (no-LLM fallback):**

When the LLM drives the campaign, non-player factions behave according to the narrative — the LLM decides when and where the enemy attacks, retreats, or introduces surprises. Without an LLM, a mechanical **strategic AI** controls non-player faction behavior on the world map:

- Each AI faction has an `ai_personality` (D043 preset): `aggressive` (expands toward player), `defensive` (holds territory, counter-attacks only), `opportunistic` (attacks weakened regions), `strategic` (balances expansion and defense).
- The AI evaluates regions by adjacency, garrison strength, and strategic importance. It prioritizes attacking weak borders and reinforcing threatened ones.
- If the player pushes hard on one front, the AI opens a second front on an undefended border — simple but effective strategic pressure.
- The AI's behavior is deterministic given the campaign state, ensuring consistent replay behavior.

This strategic AI is separate from the tactical RTS AI (D043) — it operates on the world map layer, not within individual missions. The tactical AI still controls enemy units during RTS battles.

