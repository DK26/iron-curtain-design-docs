### Campaign Editor

D021 defines the campaign *system* — branching mission graphs, persistent rosters, story flags. But a system without an editor means campaigns are hand-authored YAML, which limits who can create them. The Campaign Editor makes D021's full power visual.

Every RTS editor ever shipped treats missions as isolated units. Warcraft III's World Editor came closest — it had a campaign screen with mission ordering and global variables — but even that was a flat list with linear flow. No visual branching, no state flow visualization, no intermission screens, no dialogue trees. The result: almost nobody creates custom RTS campaigns, because the tooling makes it miserable.

The Campaign Editor operates at a level above the Scenario Editor. Where the Scenario Editor zooms into one mission, the Campaign Editor zooms out to see the entire campaign structure. Double-click a mission node → the Scenario Editor opens for that mission. Back out → you're at the campaign graph again.

#### Visual Campaign Graph

The core view: missions as nodes, outcomes as directed edges.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Campaign: Red Tide Rising                     │
│                                                                  │
│    ┌─────────┐   victory    ┌──────────┐   bridge_held           │
│    │ Mission │─────────────→│ Mission  │───────────────→ ...     │
│    │   1     │              │   2      │                         │
│    │ Beach   │   defeat     │ Bridge   │   bridge_lost           │
│    │ Landing │──────┐       │ Assault  │──────┐                  │
│    └─────────┘      │       └──────────┘      │                  │
│                     │                         │                  │
│                     ▼                         ▼                  │
│               ┌──────────┐             ┌──────────┐             │
│               │ Mission  │             │ Mission  │             │
│               │   1B     │             │   3B     │             │
│               │ Retreat  │             │ Fallback │             │
│               └──────────┘             └──────────┘             │
│                                                                  │
│   [+ Add Mission]  [+ Add Transition]  [Validate Graph]         │
└─────────────────────────────────────────────────────────────────┘
```

**Node (mission) properties:**

| Property         | Description                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Mission file** | Link to the scenario (created in Scenario Editor)                                          |
| **Display name** | Shown in campaign graph and briefing                                                       |
| **Outcomes**     | Named results this mission can produce (e.g., `victory`, `defeat`, `bridge_intact`)        |
| **Briefing**     | Text/audio/portrait shown before the mission                                               |
| **Debriefing**   | Text/audio shown after the mission, per outcome                                            |
| **Intermission** | Optional between-mission screen (see Intermission Screens below)                           |
| **Roster in**    | What units the player receives: `none`, `carry_forward`, `preset`, `merge`                 |
| **Roster out**   | Carryover mode for surviving units: `none`, `surviving`, `extracted`, `selected`, `custom` |

**Edge (transition) properties:**

| Property          | Description                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| **From outcome**  | Which named outcome triggers this transition                                        |
| **To mission**    | Destination mission node                                                            |
| **Condition**     | Optional Lua expression or story flag check (e.g., `Flag.get("scientist_rescued")`) |
| **Weight**        | Probability weight when multiple edges share the same outcome (see below)           |
| **Roster filter** | Override roster carryover for this specific path                                    |

#### Randomized and Conditional Paths

D021 defines deterministic branching — outcome X always leads to mission Y. The Campaign Editor extends this with weighted and conditional edges, enabling randomized campaign structures.

**Weighted random:** When multiple edges share the same outcome, weights determine probability. The roll is seeded from the campaign save (deterministic for replays).

```yaml
# Mission 3 outcome "victory" → random next mission
transitions:
  - from_outcome: victory
    to: mission_4a_snow      # weight 40%
    weight: 40
  - from_outcome: victory
    to: mission_4b_desert    # weight 60%
    weight: 60
```

Visually in the graph editor, weighted edges show their probability and use varying line thickness.

**Conditional edges:** An edge with a condition is only eligible if the condition passes. Conditions are evaluated before weights. This enables "if you rescued the scientist, always go to the lab mission; otherwise, random between two alternatives."

**Mission pools:** A pool node represents "pick N missions from this set" — the campaign equivalent of side quests. The player gets a random subset, plays them in any order, then proceeds. Enables roguelike campaign structures.

```
┌──────────┐         ┌─────────────────┐         ┌──────────┐
│ Mission  │────────→│   Side Mission   │────────→│ Mission  │
│    3     │         │   Pool (2 of 5)  │         │    4     │
└──────────┘         │                  │         └──────────┘
                     │ ☐ Raid Supply    │
                     │ ☐ Rescue POWs    │
                     │ ☐ Sabotage Rail  │
                     │ ☐ Defend Village │
                     │ ☐ Naval Strike   │
                     └─────────────────┘
```

Mission pools are a natural fit for the persistent roster system — side missions that strengthen (or deplete) the player's forces before a major battle.

#### Classic Globe Mission Select (RA1-Style)

The original Red Alert featured a **globe screen** between certain missions — the camera zooms to a region, and the player chooses between 2-3 highlighted countries to attack next. "Do we strike Greece or Turkey?" Each choice leads to a different mission variant, and the unchosen mission is skipped. This was one of RA1's most memorable campaign features — the feeling that *you* decided where the war went next. It was also one of the things OpenRA never reproduced; OpenRA campaigns are strictly linear mission lists.

IC supports this natively. It's not a special mode — it falls out of the existing building blocks:

**How it works:** A campaign graph node has multiple outgoing edges. Instead of selecting the next mission via a text menu or automatic branching, the campaign uses a **World Map intermission** to present the choice visually. The player sees the map with highlighted regions, picks one, and that edge is taken.

```yaml
# Campaign graph — classic RA globe-style mission select
nodes:
  mission_5:
    name: "Allies Regroup"
    # After completing this mission, show the globe
    post_intermission:
      template: world-map
      config:
        zoom_to: "eastern_mediterranean"
        choices:
          - region: greece
            label: "Strike Athens"
            target_node: mission_6a_greece
            briefing_preview: "Greek resistance is weak. Take the port city."
          - region: turkey
            label: "Assault Istanbul"
            target_node: mission_6b_turkey
            briefing_preview: "Istanbul controls the straits. High risk, strategic value."
        display:
          highlight_available: true      # glow effect on selectable regions
          show_enemy_strength: true      # "Light/Medium/Heavy resistance"
          camera_animation: globe_spin   # classic RA globe spin to region

  mission_6a_greece:
    name: "Mediterranean Assault"
    # ... mission definition

  mission_6b_turkey:
    name: "Straits of War"
    # ... mission definition
```

This is a **D021 branching campaign** with a **D038 World Map intermission** as the branch selector. The campaign graph has the branching structure; the world map is just the presentation layer for the player's choice. No strategic territory tracking, no force pools, no turn-based meta-layer — just a map that asks "where do you want to fight next?"

**Comparison to World Domination:**

| Aspect                 | Globe Mission Select (RA1-style)               | World Domination                   |
| ---------------------- | ---------------------------------------------- | ---------------------------------- |
| **Purpose**            | Choose between pre-authored mission variants   | Emergent strategic territory war   |
| **Number of choices**  | 2-3 per decision point                         | All adjacent regions               |
| **Missions**           | Pre-authored (designer-created)                | Generated from strategic state     |
| **Map role**           | Presentation for a branch choice               | Primary campaign interface         |
| **Territory tracking** | None — cosmetic only                           | Full (gains, losses, garrisons)    |
| **Complexity**         | Simple — just a campaign graph + map UI        | Complex — full strategic layer     |
| **OpenRA support**     | No                                             | No                                 |
| **IC support**         | Yes — D021 graph + D038 World Map intermission | Yes — World Domination mode (D016) |

The globe mission select is the **simplest** use of the world map component — a visual branch selector for hand-crafted campaigns. World Domination is the most complex — a full strategic meta-layer. Everything in between is supported too: a map that shows your progress through a linear campaign (locations lighting up as you complete them), a map with side-mission markers, a map that shows enemy territory shrinking as you advance.

**RA1 game module default:** The Red Alert game module ships with a campaign that recreates the original RA1 globe-style mission select at the same decision points as the original game. When the original RA1 campaign asked "Greece or Turkey?", IC's RA1 campaign shows the same choice on the same map — but with IC's modern World Map renderer instead of the original 320×200 pre-rendered globe FMV.

#### Persistent State Dashboard

The biggest reason campaign creation is painful in every RTS editor: you can't see what state flows between missions. Story flags are set in Lua buried inside mission scripts. Roster carryover is configured in YAML you never visualize. Variables disappear between missions unless you manually manage them.

The **Persistent State Dashboard** makes campaign state visible and editable in the GUI.

**Roster view:**
```
┌──────────────────────────────────────────────────────┐
│  Campaign Roster                                      │
│                                                       │
│  Mission 1 → Mission 2:  Carryover: surviving         │
│  ├── Tanya (named hero)     ★ Must survive            │
│  ├── Medium Tanks ×4        ↝ Survivors carry forward  │
│  └── Engineers ×2           ↝ Survivors carry forward  │
│                                                       │
│  Mission 2 → Mission 3:  Carryover: extracted          │
│  ├── Extraction zone: bridge_south                    │
│  └── Only units in zone at mission end carry forward  │
│                                                       │
│  Named Characters: Tanya, Volkov, Stavros              │
│  Equipment Pool: Captured MiG, Prototype Chrono        │
└──────────────────────────────────────────────────────┘
```

**Story flags view:** A table of every flag across the entire campaign — where it's set, where it's read, current value in test runs. See at a glance: "The flag `bridge_destroyed` is set in Mission 2's trigger #14, read in Mission 4's Condition of Presence on the bridge entity and Mission 5's briefing text."

| Flag                | Set in                | Read in                               | Type    |
| ------------------- | --------------------- | ------------------------------------- | ------- |
| `bridge_destroyed`  | Mission 2, trigger 14 | Mission 4 (CoP), Mission 5 (briefing) | switch  |
| `scientist_rescued` | Mission 3, Lua script | Mission 4 (edge condition)            | switch  |
| `tanks_captured`    | Mission 2, debrief    | Mission 3 (roster merge)              | counter |
| `player_reputation` | Multiple missions     | Mission 6 (dialogue branches)         | counter |

**Campaign variables:** Separate from per-mission variables (Variables Panel). Campaign variables persist across ALL missions. Per-mission variables reset. The dashboard shows which scope each variable belongs to and highlights conflicts (same name in both scopes).

#### Intermission Screens

Between missions, the player sees an intermission — not just a text briefing, but a customizable screen layout. This is where campaigns become more than "mission list" and start feeling like a *game within the game*.

**Built-in intermission templates:**

| Template              | Layout                                                                                                                                                                                                                                                                      | Use Case                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Briefing Only**     | Portrait + text + "Begin Mission" button                                                                                                                                                                                                                                    | Simple campaigns, classic RA style            |
| **Roster Management** | Unit list with keep/dismiss, equipment assignment, formation arrangement                                                                                                                                                                                                    | OFP: Resistance style unit management         |
| **Base Screen**       | Persistent base view — spend resources on upgrades that carry forward                                                                                                                                                                                                       | Between-mission base building (C&C3 style)    |
| **Shop / Armory**     | Campaign inventory + purchase panel + currency                                                                                                                                                                                                                              | RPG-style equipment management                |
| **Dialogue**          | Portrait + branching text choices (see Dialogue Editor below)                                                                                                                                                                                                               | Story-driven campaigns, RPG conversations     |
| **World Map**         | Map with mission locations — player chooses next mission from available nodes. In World Domination campaigns (D016), shows faction territories, frontlines, and the LLM-generated briefing for the next mission                                                             | Non-linear campaigns, World Domination        |
| **Debrief + Stats**   | Mission results, casualties, performance grade, story flag changes                                                                                                                                                                                                          | Post-mission feedback                         |
| **Credits**           | Auto-scrolling text with section headers, role/name columns, optional background video/image and music track. Supports contributor photos, logo display, and "special thanks" sections. Speed and style (classic scroll / paginated / cinematic) configurable per-campaign. | Campaign completion, mod credits, jam credits |
| **Custom**            | Empty canvas — arrange any combination of panels via the layout editor                                                                                                                                                                                                      | Total creative freedom                        |

Intermissions are defined per campaign node (between "finish Mission 2" and "start Mission 3"). They can chain: debrief → roster management → briefing → begin mission. A typical campaign ending chains: final debrief → credits → return to campaign select (or main menu).

**Intermission panels (building blocks):**

- **Text panel** — rich text with variable substitution (`"Commander, we lost {Var.get('casualties')} soldiers."`).
- **Portrait panel** — character portrait + name. Links to Named Characters.
- **Roster panel** — surviving units from previous mission. Player can dismiss, reorganize, assign equipment.
- **Inventory panel** — campaign-wide items. Drag onto units to equip. Purchase from shop with campaign currency.
- **Choice panel** — buttons that set story flags or campaign variables. "Execute the prisoner? [Yes] [No]" → sets `prisoner_executed` flag.
- **Map panel** — shows campaign geography. Highlights available next missions if using mission pools. In World Domination mode, renders the world map with faction-colored regions, animated frontlines, and narrative briefing panel. The LLM presents the next mission through the briefing; the player sees their territory and the story context, not a strategy game menu.
- **Stats panel** — mission performance: time, casualties, objectives completed, units destroyed.
- **Credits panel** — auto-scrolling rich text optimized for credits display. Supports section headers ("Cast," "Design," "Special Thanks"), two-column role/name layout, contributor portraits, logo images, and configurable scroll speed. The text source can be inline, loaded from a `credits.yaml` file (for reuse across campaigns), or generated dynamically via Lua. Scroll style options: `classic` (continuous upward scroll, Star Wars / RA1 style), `paginated` (fade between pages), `cinematic` (camera-tracked text over background video). Music reference plays for the duration. The panel emits a `credits_finished` event when scrolling completes — chain to a Choice panel ("Play Again?" / "Return to Menu") or auto-advance.
- **Custom Lua panel** — advanced panel that runs arbitrary Lua to generate content dynamically.

These panels compose freely. A "Base Screen" template is just a preset arrangement: roster panel on the left, inventory panel center, stats panel right, briefing text bottom. The Custom template starts empty and lets the designer arrange any combination.

**Per-player intermission variants:** In co-op campaigns, each intermission can optionally define per-player layouts. The intermission editor exposes a "Player Variant" selector: Default (all players see the same screen) or per-slot overrides (Player 1 sees layout A, Player 2 sees layout B). Per-player briefing text is always supported regardless of this setting. Per-player layouts go further — different panel arrangements, different choice options, different map highlights per player slot. This is what makes co-op campaigns feel like each player has a genuine role, not just a shared screen. Variant layouts share the same panel library; only the arrangement and content differ.

#### Dialogue Editor

Branching dialogue isn't RPG-exclusive — it's what separates a campaign with a story from a campaign that's just a mission list. "Commander, we've intercepted enemy communications. Do we attack now or wait for reinforcements?" That's a dialogue tree. The choice sets a story flag that changes the next mission's layout.

The Dialogue Editor is a visual branching tree editor, similar to tools like Twine or Ink but built into the scenario editor.

```
┌──────────────────────────────────────────────────────┐
│  Dialogue: Mission 3 Briefing                         │
│                                                       │
│  ┌────────────────────┐                               │
│  │ STAVROS:            │                               │
│  │ "The bridge is       │                               │
│  │  heavily defended." │                               │
│  └────────┬───────────┘                               │
│           │                                            │
│     ┌─────┴─────┐                                      │
│     │           │                                      │
│  ┌──▼───┐  ┌───▼────┐                                  │
│  │Attack│  │Flank   │                                  │
│  │Now   │  │Through │                                  │
│  │      │  │Forest  │                                  │
│  └──┬───┘  └───┬────┘                                  │
│     │          │                                       │
│  sets:       sets:                                     │
│  approach=   approach=                                 │
│  "direct"    "flank"                                   │
│     │          │                                       │
│  ┌──▼──────────▼──┐                                    │
│  │ TANYA:          │                                    │
│  │ "I'll take       │                                    │
│  │  point."         │                                    │
│  └─────────────────┘                                    │
└──────────────────────────────────────────────────────┘
```

**Dialogue node properties:**

| Property      | Description                                                        |
| ------------- | ------------------------------------------------------------------ |
| **Speaker**   | Character name + portrait reference                                |
| **Text**      | Dialogue line (supports variable substitution)                     |
| **Audio**     | Optional voice-over reference                                      |
| **Choices**   | Player responses — each is an outgoing edge                        |
| **Condition** | Node only appears if condition is true (enables adaptive dialogue) |
| **Effects**   | On reaching this node: set flags, adjust variables, give items     |

**Conditional dialogue:** Nodes can have conditions — "Only show this line if `scientist_rescued` is true." This means the same dialogue tree adapts to campaign state. A character references events from earlier missions without the designer creating separate trees per path.

**Dialogue in missions:** Dialogue trees aren't limited to intermissions. They can trigger during a mission — an NPC unit triggers a dialogue when approached or when a trigger fires. The dialogue pauses the game (or runs alongside it, designer's choice) and the player's choice sets flags that affect the mission in real-time.

#### Named Characters

A **named character** is a persistent entity identity that survives across missions. Not a specific unit instance (those die) — a character definition that can have multiple appearances.

| Property          | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| **ID**            | Stable identifier (`character_id`) used by campaign state, hero progression, and references; not shown to players |
| **Name**          | Display name ("Tanya", "Commander Volkov")                              |
| **Portrait**      | Image reference for dialogue and intermission screens                   |
| **Unit type**     | Default unit type when spawned (can change per mission)                 |
| **Traits**        | Arbitrary key-value pairs (strength, charisma, rank — designer-defined) |
| **Inventory**     | Items this character carries (from campaign inventory system)           |
| **Biography**     | Text shown in roster screen, updated by Lua as the campaign progresses  |
| **Presentation**  | Optional character-level overrides for portrait/icon/voice/skin/markers (convenience layer over unit defaults/resource packs) |
| **Must survive**  | If true, character death → mission failure (or specific outcome)        |
| **Death outcome** | Named outcome triggered if this character dies (e.g., `tanya_killed`)   |

Named characters bridge scenarios and intermissions. Tanya in Mission 1 is the same Tanya in Mission 5 — same `character_id`, same veterancy, same kill count, same equipment (even if the display name/portrait changes over time). If she dies in Mission 3 and doesn't have "must survive," the campaign continues without her — and future dialogue trees skip her lines via conditions.

This is the primitive that makes RPG campaigns possible. A designer creates 6 named characters, gives them traits and portraits, writes dialogue between them, and lets the player manage their roster between missions. That's an RPG party in an RTS shell — no engine changes required, just creative use of the campaign editor's building blocks.

**Optional character presentation overrides (convenience layer):** D038 should expose a character-level presentation override panel so designers can make a unit clearly read as a unique hero/operative **without** creating a full custom mod stack for every case. These overrides sit on top of the character's default unit type + resource pack selection and are intended for identity/readability:

- `portrait_override` (dialogue/intermission/hero sheet portrait)
- `unit_icon_override` (sidebar/build/roster icon where shown)
- `voice_set_override` (selection/move/attack/deny response set)
- `sprite_sequence_override` or `sprite_variant` (alternate sprite/sequence mapping for the same gameplay role)
- `palette_variant` / tint or marker style (e.g., elite trim, stealth suit tint, squad color accent)
- `selection_badge` / minimap marker variant (hero star, special task force glyph)

**Design rule:** gameplay-changing differences (weapons, stats, abilities) still belong in the unit definition + hero toolkit/skill system. The presentation override layer is a **creator convenience** for making unique characters legible and memorable. It can pair with a gameplay variant unit type, but it should not hide gameplay changes behind purely visual metadata.

**Scope and layering:** overrides may be defined as a campaign-wide default for a named character and optionally as mission-scoped variants (e.g., `disguise`, `winter_gear`, `captured_uniform`). Scenario bindings choose which variant to apply when spawning the character.

> **Canonical schema:** The shared `CharacterPresentationOverrides` / variant model used by D038 authoring surfaces is documented in `src/modding/campaigns.md` § "Named Character Presentation Overrides (Optional Convenience Layer)" so the SDK and campaign runtime/docs stay aligned.

#### Campaign Inventory

Persistent items that exist at the campaign level, not within any specific mission.

| Property       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| **Name**       | Item identifier (`prototype_chrono`, `captured_mig`)       |
| **Display**    | Name, icon, description shown in intermission screens      |
| **Quantity**   | Stack count (1 for unique items, N for consumables)        |
| **Category**   | Grouping for inventory panel (equipment, intel, resources) |
| **Effects**    | Optional Lua — what happens when used/equipped             |
| **Assignable** | Can be assigned to named characters in roster screen       |

Items are added via Lua (`Campaign.add_item("captured_mig", 1)`) or via debrief/intermission choices. They're spent, equipped, or consumed in later missions or intermissions.

Combined with named characters and the roster screen: a player captures enemy equipment in Mission 2, assigns it to a character in the intermission, and that character spawns with it in Mission 3. The system is general-purpose — "items" can be weapons, vehicles, intel documents, key cards, magical artifacts, or anything the designer defines.

#### Hero Campaign Toolkit (Optional, Built-In Layer)

Warcraft III-style hero campaigns (for example, Tanya gaining XP, levels, skills, and persistent equipment) **fit IC's campaign design** and should be authorable **without engine modding**. The common case should be handled entirely by D021 campaign state + D038 campaign/scenario/intermission tooling. Lua remains the escape hatch for unusual mechanics.

> **Canonical schema & Lua API:** The authoritative `HeroProfileState` struct, skill tree YAML schema, and Lua helper functions live in `src/modding/campaigns.md` § "Hero Campaign Toolkit". This section covers only the **editor/authoring UX** — what the designer sees in the Campaign Editor and Scenario Editor.

This is not a separate game mode. It's an **optional authoring layer** that sits on top of:
- **Named Characters** (persistent hero identities)
- **Campaign Inventory** (persistent items/loadouts)
- **Intermission Screens** (hero sheet, skill choice, armory)
- **Dialogue Editor** (hero-conditioned lines and choices)
- **D021 persistent state** (XP/level/skills/hero flags)

**Campaign Editor authoring surfaces (Advanced mode):**
- **Hero Roster & Progression tab** in the Persistent State Dashboard: hero list, level/xp preview, skill trees, death/injury policy, carryover rules
- **XP / reward authoring** on mission outcomes and debrief/intermission choices (award XP, grant item, unlock skill, set hero stat/flag)
- **Hero ability loadout editor** (which unlocked abilities are active in the next mission, if the campaign uses ability slots)
- **Skill tree editor** (graph or list view): prerequisites, costs, descriptions, icon, unlock effects
- **Character presentation override panel** (portrait/icon/voice/skin/marker variants) with "global default" + mission-scoped variants and in-context preview
- **Hero-conditioned graph validation**: warns if a branch requires a hero/skill that can never be obtained on any reachable path

**Scenario Editor integration (mission-level hooks):**
- Trigger actions/modules for common hero-campaign patterns:
  - `Award Hero XP`
  - `Unlock Hero Skill`
  - `Set Hero Flag`
  - `Modify Hero Stat`
  - `Branch on Hero Condition` (level/skill/flag)
- `Hero Spawn` / `Apply Hero Loadout` conveniences that bind a scenario actor to a D021 named character profile
- `Apply Character Presentation Variant` convenience (optional): switch a named character between authored variants (`default`, `disguise`, `winter_ops`, etc.) without changing the underlying gameplay profile
- Preview/test helpers to simulate hero states ("Start with Tanya level 3 + Satchel Charge Mk2")

**Concrete mission example (Tanya AA sabotage → reinforcements → skill-gated infiltration):**

This is a standard D038 scenario using built-in trigger actions/modules (no engine modding, no WASM required for the common case). See `src/modding/campaigns.md` for the full skill tree YAML schema that defines skills like `silent_step` referenced here.

```yaml
# Scenario excerpt (conceptual D038 serialization)
hero_bindings:
  - actor_tag: tanya_spawn
    character_id: tanya
    apply_campaign_profile: true      # loads level/xp/skills/loadout from D021 state

objectives:
  - id: destroy_aa_sites
    type: compound
    children: [aa_north, aa_east, aa_west]
  - id: infiltrate_lab
    hidden: true

triggers:
  - id: aa_sites_disabled
    when:
      objective_completed: destroy_aa_sites
    actions:
      - cinematic_sequence: aa_sabotage_success_pan
      - award_hero_xp:
          hero: tanya
          amount: 150
          reason: aa_sabotage
      - set_hero_flag:
          hero: tanya
          key: aa_positions_cleared
          value: true
      - spawn_reinforcements:
          faction: allies
          group_preset: black_ops_team
          entry_point: south_edge
      - objective_reveal:
          id: infiltrate_lab
      - objective_set_active:
          id: infiltrate_lab
      - dialogue_trigger:
          tree: tanya_aa_success_comm

  - id: lab_side_entrance_interact
    when:
      actor_interacted: lab_side_terminal
    branch:
      if:
        hero_condition:
          hero: tanya
          any_skill: [silent_step, infiltrator_clearance]
      then:
        - open_gate: lab_side_door
        - set_flag: { key: lab_entry_mode, value: stealth }
      else:
        - spawn_patrol: lab_side_response_team
        - set_flag: { key: lab_entry_mode, value: loud }
        - advice_popup: "Tanya needs a stealth skill to bypass this terminal quietly."

debrief_rewards:
  on_outcome: victory
  choices:
    - id: field_upgrade
      label: "Field Upgrade"
      grant_skill_choice_from: [silent_step, satchel_charge_mk2]
    - id: requisition_cache
      label: "Requisition Cache"
      grant_items:
        - { id: remote_detonator_pack, qty: 1 }
```

**Visual-editor equivalent (what the designer sees):**
- `Objective Completed (Destroy AA Sites)` → `Cinematic Sequence` → `Award Hero XP (Tanya, +150)` → `Spawn Reinforcements` → `Reveal Objective: Infiltrate Lab`
- `Interact: Lab Terminal` → `Branch on Hero Condition (Tanya has Silent Step OR Infiltrator Clearance)` → stealth path / loud path
- `Debrief Outcome: Victory` → `Skill Choice or Requisition Cache` (intermission reward panel)

**Intermission support (player-facing):**
- `Hero Sheet` panel/template — portrait, level, stats, abilities, equipment, biography/progression summary
- `Skill Choice` panel/template — choose one unlock from a campaign-defined set, spend points, preview effects
- `Armory + Hero` combined layout presets for RPG-style between-mission management

**Complexity policy (important):**
- Hidden in **Simple mode** by default (hero campaigns are advanced content)
- No hero progression UI appears unless the campaign enables the D021 hero toolkit
- Classic campaigns remain unaffected and as simple as today

**Compatibility / export note (D066):** Hero progression campaigns are often IC-native. Export to RA1/OpenRA may require flattening to flags/carryover stubs or manual rewrites; the SDK surfaces fidelity warnings in Export-Safe mode and Publish Readiness.

#### Campaign Testing

The Campaign Editor includes tools for testing campaign flow without playing every mission to completion:

- **Graph validation** — checks for dead ends (outcomes with no outgoing edge), unreachable missions, circular paths (unless intentional), and missing mission files
- **Jump to mission** — start any mission with simulated campaign state (set flags, roster, and inventory to test a specific path)
- **Fast-forward state** — manually set campaign variables and flags to simulate having played earlier missions
- **Hero state simulation** — set hero levels, skills, equipment, and injury flags for branch testing (hero toolkit campaigns)
- **Path coverage** — highlights which campaign paths have been test-played and which haven't. Color-coded: green (tested), yellow (partially tested), red (untested)
- **Campaign playthrough** — play the entire campaign with accelerated sim (or auto-resolve missions) to verify flow and state propagation
- **State inspector** — during preview, shows live campaign state: current flags, roster, inventory, hero progression state (if enabled), variables, which path was taken

#### Reference Material (Campaign Editors)

The campaign editor design draws from these (in addition to the scenario editor references above):

- **Warcraft III World Editor (2002):** The closest any RTS came to campaign editing — campaign screen with mission ordering, cinematic editor, global variables persistent across maps. Still linear and limited: no visual branching, no roster management, no intermission screen customization. IC takes WC3's foundation and adds the graph, state, and intermission layers.
- **RPG Maker (1992–present):** Campaign-level persistent variables, party management, item/equipment systems, branching dialogue. Proves these systems work for non-programmers. IC adapts the persistence model for RTS context.
- **Twine / Ink (interactive fiction tools):** Visual branching narrative editors. Twine's node-and-edge graph directly inspired IC's campaign graph view. Ink's conditional text ("You remember the bridge{bridge_destroyed: 's destruction| still standing}") inspired IC's variable substitution in dialogue.
- **Heroes of Might and Magic III (1999):** Campaign with carryover — hero stats, army, artifacts persist between maps. Proved that persistent state between RTS-adjacent missions creates investment. Limited to linear ordering.
- **FTL / Slay the Spire (roguelikes):** Randomized mission path selection, persistent resources, risk/reward side missions. Inspired IC's mission pools and weighted random paths.
- **OFP: Resistance (2002):** The gold standard for persistent campaigns — surviving soldiers, captured equipment, emotional investment. Every feature in IC's campaign editor exists because OFP: Resistance proved persistent campaigns are transformative.

