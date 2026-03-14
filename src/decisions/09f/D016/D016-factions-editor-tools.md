### LLM-Generated Custom Factions

Beyond missions and campaigns, the LLM can generate **complete custom factions** — a tech tree, unit roster, building roster, unique mechanics, visual identity, and faction personality — from a natural language description. The output is standard YAML (Tier 1), optionally with Lua scripts (Tier 2) for unique abilities. A generated faction is immediately playable in skirmish and custom games, shareable via Workshop, and fully editable by hand.

**Why this matters:** Creating a new faction in any RTS is one of the hardest modding tasks. It requires designing 15-30+ units with coherent roles, a tech tree with meaningful progression, counter-relationships against existing factions, visual identity, and balance — all simultaneously. Most aspiring modders give up before finishing. An LLM that can generate a complete, validated faction from a description like "a guerrilla faction that relies on stealth, traps, and hit-and-run tactics" lowers the barrier from months of work to minutes of iteration.

**Available resource pool:** The LLM has access to everything the engine knows about:

| Source                                 | What the LLM Can Reference                                                                                                                          | How                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Base game units/weapons/structures** | All YAML definitions from the active game module (RA1, TD, etc.) including stats, counter relationships, prerequisites, and `llm:` metadata         | Direct YAML read at generation time                                                                                                                                                         |
| **Balance presets (D019)**             | All preset values — the LLM knows what "Classic" vs "OpenRA" Tanya stats look like and can calibrate accordingly                                    | Preset YAML loaded alongside base definitions                                                                                                                                               |
| **Workshop resources (D030)**          | Published mods, unit packs, sprite sheets, sound packs, weapon definitions — anything the player has installed or that the Workshop index describes | Workshop metadata queries via `LLM` Lua global (Phase 7); local installed resources via filesystem; remote resources via Workshop API with `ai_usage` consent check (D030 § Author Consent) |
| **Skill Library (D057)**               | Previously generated factions that were rated highly by players; proven unit archetypes, tech tree patterns, and balance relationships              | Semantic search retrieval as few-shot examples                                                                                                                                              |
| **Player data (D034)**                 | The player's gameplay history: preferred playstyles, unit usage patterns, faction win rates                                                         | Local SQLite queries (read-only) for personalization                                                                                                                                        |

**Generation pipeline:**

```
User prompt                    "A faction based on weather control and
                                environmental warfare"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  1. CONCEPT GENERATION                                  │
│     LLM generates faction identity:                     │
│     - Name, theme, visual style                         │
│     - Core mechanic ("weather weapons that affect       │
│       terrain and visibility")                          │
│     - Asymmetry axis ("environmental control vs          │
│       direct firepower — strong area denial,            │
│       weak in direct unit-to-unit combat")              │
│     - Design pillars (3-4 one-line principles)          │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  2. TECH TREE GENERATION                                │
│     LLM designs the tech tree:                          │
│     - Building unlock chain (3-4 tiers)                 │
│     - Each tier unlocks 2-5 units/abilities             │
│     - Prerequisites form a DAG (validated)              │
│     - Key decision points ("at Tier 3, choose           │
│       Tornado Generator OR Blizzard Chamber —           │
│       not both")                                        │
│     References: base game tech tree structure,           │
│     D019 balance philosophy Principle 5                  │
│     (shared foundation + unique exceptions)             │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  3. UNIT ROSTER GENERATION                              │
│     For each unit slot in the tech tree:                │
│     - Generate full YAML unit definition                │
│     - Stats calibrated against existing factions        │
│     - Counter relationships defined (Principle 2)       │
│     - `llm:` metadata block filled in                   │
│     - Weapon definitions generated or reused            │
│     Workshop query: "Are there existing sprite packs    │
│     or weapon definitions I can reference?"             │
│     Skill library query: "What unit archetypes work     │
│     well for area-denial factions?"                     │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  4. BALANCE VALIDATION                                  │
│     Automated checks (no LLM needed):                   │
│     - Total faction cost curve vs existing factions     │
│     - DPS-per-cost distribution within normal range     │
│     - Every unit has counters AND is countered by       │
│     - Tech tree is a valid DAG (no cycles,              │
│       every unit reachable)                             │
│     - No unit duplicates another unit's role exactly    │
│     - Name/identifier uniqueness                        │
│     If validation fails → feedback to LLM for          │
│     iteration (up to 3 retries per issue)               │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  5. OUTPUT                                              │
│     Standard mod directory:                             │
│     factions/weather_control/                           │
│       faction.yaml     # faction identity + color       │
│       tech_tree.yaml   # prerequisite graph             │
│       units/           # one .yaml per unit             │
│       weapons/         # weapon definitions             │
│       structures/      # building definitions           │
│       abilities.lua    # unique mechanics (Tier 2)      │
│       preview.png      # generated or placeholder       │
│       README.md        # faction lore + design notes    │
│                                                         │
│     Playable immediately. Editable by hand.             │
│     Publishable to Workshop.                            │
└─────────────────────────────────────────────────────────┘
```

**Example generation session:**

```
Player: "Create a faction that uses mind control and
         psychic technology. Fragile units but powerful
         area effects. Should be viable against both
         Allies and Soviets in the Classic preset."

LLM generates:
  Faction: Psi Corps
  Theme: Psychic warfare — control, confusion, area denial
  Asymmetry: Weak individual units, powerful area abilities.
             Can turn enemy units into assets. Vulnerable
             to fast rushes before psychic tech is online.

  Tech tree:
    Tier 1: Psi Barracks → Initiate (basic infantry, weak attack,
            can detect cloaked), Psi Trooper (anti-vehicle mind blast)
    Tier 2: Psi Lab → Mentalist (area confusion — enemies attack
            each other for 10s), Mind Reader (reveals fog in radius)
    Tier 3: Amplifier Tower → Dominator (permanently converts one
            enemy unit, long cooldown, expensive)
    Tier 3 alt: Psychic Beacon → mass area slow + damage over time
    ...

  Balance validation:
    ✓ Total faction DPS-per-cost: 0.87x Allied average (intended —
      compensated by mind control economy)
    ✓ Counter relationships complete: Psi units weak to vehicles
      (can't mind-control machines), strong vs infantry
    ✓ Tech tree DAG valid, all units reachable
    ⚠ Dominator ability may be too strong in team games —
      suggest adding "one active Dominator per player" cap
    → LLM adjusts and re-validates
```

**Workshop asset integration:** The LLM can reference Workshop resources with compatible licenses and `ai_usage: allow` consent (D030 § Author Consent):

- **Sprite packs:** "Use 'alice/psychic-infantry-sprites' for the Initiate's visual" — the generated YAML references the Workshop package as a dependency
- **Sound packs:** "Use 'bob/sci-fi-weapon-sounds' for the mind blast weapon audio"
- **Weapon definitions:** "Inherit from 'carol/energy-weapons/plasma_bolt' and adjust damage for psychic theme"
- **Existing unit definitions:** "The Mentalist's confusion ability works like 'dave/chaos-mod/confusion_gas' but with psychic visuals instead of chemical"

This means a generated faction can have real art, real sounds, and tested mechanics from day one — not just placeholder stats waiting for assets. The Workshop becomes a **component library** for LLM faction assembly.

**What this is NOT:**
- **Not allowed in ranked play.** LLM-generated factions are for skirmish, custom lobbies, and single-player. Ranked games use curated balance presets (D019/D055).
- **Not autonomous.** The LLM proposes; the player reviews, edits, and approves. The generation UI shows every unit definition and lets the player tweak stats, rename units, or regenerate individual components before saving.
- **Not a substitute for hand-crafted factions.** The built-in Allied and Soviet factions are carefully designed from EA source code values. Generated factions are community content — fun, creative, potentially brilliant, but not curated to the same standard.
- **Not dependent on specific assets.** If a referenced Workshop sprite pack isn't installed, the faction still loads with placeholder sprites. Assets are enhancement, not requirements.

**Iterative refinement:** After generating, the player can:
1. **Playtest** the faction in a skirmish against AI
2. **Request adjustments:** "Make the Tier 2 units cheaper but weaker" or "Add a naval unit"
3. The LLM regenerates affected units with context from the existing faction definition
4. **Manually edit** any YAML file — the generated output is standard IC content
5. **Publish to Workshop** for others to play, rate, and fork

**Phase:** Phase 7 (alongside other LLM generation features). Requires: YAML unit/faction definition system (Phase 2), Workshop resource API (Phase 6a), `ic-llm` provider system, skill library (D057).

### LLM-Callable Editor Tool Bindings (Phase 7, D038/D040 Bridge)

D016 generates **content** (missions, campaigns, factions as YAML+Lua). D038 and D040 provide **editor operations** (place actor, add trigger, set objective, import sprite, adjust material). There is a natural bridge between them: exposing SDK editor operations as a **structured tool-calling schema** that an LLM can invoke through the same validated paths the GUI uses.

**What this enables:**

An LLM connected via D047 can act as an **editor assistant** — not just generating YAML files, but performing editor actions in context:

- "Add a patrol trigger between these two waypoints" → invokes the trigger-placement operation with parameters
- "Create a tiberium field in the northwest corner with 3 harvesters" → invokes entity placement + resource field setup
- "Set up the standard base defense layout for a Soviet mission" → invokes a sequence of entity placements using the module/composition library
- "Run Quick Validate and tell me what's wrong" → invokes the validation pipeline, reads results
- "Export this mission to OpenRA format and show me the fidelity report" → invokes the export planner

**Architecture:**

The editor operations already exist as internal commands (every GUI action has a programmatic equivalent — this is a D038 design principle). The tool-calling layer is a thin schema that:

1. **Enumerates available operations** as a tool manifest (name, parameters, return type, description) — similar to how MCP or OpenAI function-calling schemas work
2. **Routes LLM tool calls** through the same validation and undo/redo pipeline as GUI actions — no special path, no privilege escalation
3. **Returns structured results** (success/failure, created entity IDs, validation issues) that the LLM can reason about for multi-step workflows

**Crate boundary:** The tool manifest lives in `ic-editor` (it's editor-specific). `ic-llm` consumes it via the same provider routing as other LLM features (D047). The manifest is auto-generated from the editor's command registry — no manual sync needed.

**What this is NOT:**

- **Not autonomous by default.** The LLM proposes actions; the editor shows a preview; the user confirms or edits. Autonomous mode (accept-all) is an opt-in toggle for experienced users, same as any batch operation.
- **Not a new editor.** This is a communication layer over the existing editor. If the GUI can't do it, the LLM can't do it.
- **Not required.** The editor works fully without an LLM. This is Layer 3 functionality, same as agentic asset generation in D040.

**Prior art:** The UnrealAI plugin for Unreal Engine 5 (announced February 2026) demonstrates this pattern with 100+ tool bindings for Blueprint creation, Actor placement, Material building, and scene generation from text. Their approach validates that structured tool-calling over editor operations is practical and that multi-provider support (8 providers, local models via Ollama) matches real demand. Key differences: IC's tool bindings route through the same validation/undo pipeline as GUI actions (UnrealAI appears to bypass some editor safeguards); IC's output is always standard YAML+Lua (not engine-specific binary formats); and IC's BYOLLM architecture means no vendor lock-in.

**Phase:** Phase 7. Requires: editor command registry (Phase 6a), `ic-llm` provider system (Phase 7), tool manifest schema. The manifest schema should be designed during Phase 6a so editor commands are registry-friendly from the start, even though LLM integration ships later.

---

---

