## D016: LLM-Generated Missions and Campaigns

**Decision:** Provide an optional LLM-powered mission generation system (Phase 7) via the `ic-llm` crate. IC ships built-in CPU models (D047 Tier 1) that make LLM features functional with zero setup; users who want higher quality bring their own provider (BYOLLM Tiers 2–4). Every game feature works fully without an LLM configured.

**Rationale:**
- Transforms Red Alert from finite content to infinite content — for players who opt in
- Generated output is standard YAML + Lua — fully editable, shareable, learnable
- No other RTS (Red Alert or otherwise) offers this capability
- LLM quality is sufficient for terrain layout, objective design, AI behavior scripting
- **Strictly optional:** `ic-llm` crate is optional, game works without it. No feature — campaigns, skirmish, multiplayer, modding, analytics — depends on LLM availability. The LLM enhances the experience; it never gates it

**Scope:**
- Phase 7: single mission generation (terrain, objectives, enemy composition, triggers, briefing)
- Phase 7: player-aware generation — LLM reads local SQLite (D034) for faction history, unit preferences, win rates, campaign roster state; injects player context into prompts for personalized missions, adaptive briefings, post-match commentary, coaching suggestions, and rivalry narratives
- Phase 7: replay-to-scenario narrative generation — LLM reads gameplay event logs from replays to generate briefings, objectives, dialogue, and story context for scenarios extracted from real matches (see D038 § Replay-to-Scenario Pipeline)
- Phase 7: **generative campaigns** — full multi-mission branching campaigns generated progressively as the player advances (see Generative Campaign Mode below)
- Phase 7: **generative media** — AI-generated voice lines, music, sound FX for campaigns and missions via pluggable provider traits (see Generative Media Pipeline below)
- Phase 7+ / Future: AI-generated cutscenes/video (depends on technology maturity)
- Future: cooperative scenario design, community challenge campaigns

> **Positioning note:** LLM features are a quiet power-user capability, not a project headline. The primary single-player story is the hand-authored branching campaign system (D021), which requires no LLM and is genuinely excellent on its own merits. LLM generation is for players who want more content — it should never appear before D021 in marketing or documentation ordering. The word “AI” in gaming contexts attracts immediate hostility from a significant audience segment regardless of implementation quality. Lead with campaigns, reveal LLM as “also, modders and power users can use AI tools if they want.”

> **Design goal — “One More Prompt.”** The LLM features should create the same compulsion loop as Civilization's “one more turn.” Every generated output — a mission debrief, a campaign twist, an exhibition match result — should leave the player wanting to try one more prompt to see what happens next. The generative campaign's inspect-and-react loop (battle report → narrative hook → next mission) is the primary driver: the player doesn't just want to play the next mission, they want to see what the LLM does with what just happened. The parameter space (faction, tone, story style, moral complexity, custom instructions) ensures that “one more prompt” also means “one more campaign” — each configuration produces a fundamentally different experience. This effect is the quiet retention engine for players who discover LLM features. See `01-VISION.md` § “The One More Prompt effect.”

**Implementation approach:**
- LLM generates YAML map definition + Lua trigger scripts
- Same format as hand-crafted missions — no special runtime
- Validation pass ensures generated content is playable (valid unit types, reachable objectives)
- Can use local models or API-based models (user choice)
- Player data for personalization comes from local SQLite queries (read-only) — no data leaves the device unless the user's LLM provider is cloud-based (BYOLLM architecture)

**Bring-Your-Own-LLM (BYOLLM) architecture:**
- `ic-llm` defines a `LlmProvider` trait — any backend that accepts a prompt and returns structured text
- Built-in providers: IC Built-in (pure Rust CPU inference), OpenAI-compatible API, local Ollama, Anthropic API
- Users configure their provider in settings (API key, endpoint, model name) — or use IC Built-in with zero configuration
- The engine never *requires* a specific external model — the user chooses; IC Built-in is the default floor
- Provider is a runtime setting, not a compile-time dependency
- All prompts and responses are logged (opt-in) for debugging and sharing
- Offline mode: pre-generated content works without any LLM connection

**Prompt strategy is provider/model-specific (especially local vs cloud):**
- IC does **not** assume one universal prompt style works across all BYOLLM providers.
- Local models (Ollama and other self-hosted backends) often require different **chat templates**, tighter context budgets, simpler output schemas, and more staged task decomposition than frontier cloud APIs.
- A "bad local model result" may actually be a **prompt/template mismatch** (wrong role formatting, unsupported tool-call pattern, too much context, overly complex schema).
- D047 therefore introduces a provider/model-aware **Prompt Strategy Profile** system (auto-selected by capability probe, user-overridable) rather than a single hardcoded prompt preset for every backend.

**Design rule:** Prompt behavior = `provider transport + chat template + decoding settings + prompt strategy profile`, not just "the text of the prompt."

### Generative Campaign Mode

The single biggest use of LLM generation: **full branching campaigns created on the fly.** The player picks a faction, adjusts parameters (or accepts defaults), and the LLM generates an entire campaign — backstory, missions, branching paths, persistent characters, and narrative arc — progressively as they play. Every generated campaign is a standard D021 campaign: YAML graph, Lua scripts, maps, briefings. Once generated, a campaign is **fully playable without an LLM** — generation is the creative act; playing is standard IC.

#### How It Works

**Step 1 — Campaign Setup (one screen, defaults provided):**

The player opens "New Generative Campaign" from the main menu. If no LLM provider is configured, the button is still clickable — it opens a guidance panel: "Generative campaigns need an LLM provider to create missions. [Configure LLM Provider →] You can also browse pre-generated campaigns on the Workshop. [Browse Workshop →]" (see D033 § "UX Principle: No Dead-End Buttons"). Once an LLM is configured, the same button opens the configuration screen with defaults and an "Advanced" expander for fine-tuning:

| Parameter              | Default           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Player faction**     | (must pick)       | Soviet, Allied, or a modded faction. Determines primary enemies and narrative allegiance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Campaign length**    | 24 missions       | Total missions in the campaign arc. Configurable: 8 (short), 16 (medium), 24 (standard), 32+ (epic), or **open-ended** (no fixed count — campaign ends when victory conditions are met; see Open-Ended Campaigns below).                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Branching density**  | Medium            | How many branch points. Low = mostly linear with occasional forks. High = every mission has 2–3 outcomes leading to different paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Tone**               | Military thriller | Narrative style: military thriller, pulp action, dark/gritty, campy Cold War, espionage, or freeform text description.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Story style**        | C&C Classic       | Story structure and character voice. See "Story Style Presets" below. Options: C&C Classic (default — over-the-top military drama with memorable personalities), Realistic Military, Political Thriller, Pulp Sci-Fi, Character Drama, or freeform text description. Note: "Military thriller" tone + "C&C Classic" story style is the canonical pairing — they are complementary, not contradictory. C&C IS a military thriller, played at maximum volume with camp and conviction (see 13-PHILOSOPHY.md § Principle 20). The tone governs atmospheric tension; the story style governs character voice and narrative structure. |
| **Difficulty curve**   | Adaptive          | Start easy, escalate. Options: flat, escalating, adaptive (adjusts based on player performance), brutal (hard from mission 1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Roster persistence** | Enabled           | Surviving units carry forward (D021 carryover). Disabled = fresh forces each mission.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Named characters**   | 3–5               | How many recurring characters the LLM creates. Built using personality-driven construction (see Character Construction Principles below). These can survive, die, betray, return.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Theater**            | Random            | European, Arctic, Desert, Pacific, Global (mixed), or a specific setting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Game module**        | (current)         | RA1, TD, or any installed game module.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Advanced parameters** (hidden by default):

| Parameter                   | Default             | Description                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mission variety targets** | Balanced            | Distribution of mission types: assault, defense, stealth, escort, naval, combined arms. The LLM aims for this mix but adapts based on narrative flow.                                                                                                                                                                                                                                         |
| **Faction purity**          | 90%                 | Percentage of missions fighting the opposing faction. Remainder = rogue elements of your own faction, third parties, or storyline twists (civil war, betrayal missions).                                                                                                                                                                                                                      |
| **Resource level**          | Standard            | Starting resources per mission. Scarce = more survival-focused. Abundant = more action-focused.                                                                                                                                                                                                                                                                                               |
| **Weather variation**       | Enabled             | LLM introduces weather changes across the campaign arc (D022). Arctic campaign starts mild, ends in blizzard.                                                                                                                                                                                                                                                                                 |
| **Workshop resources**      | Configured sources  | Which Workshop sources (D030) the LLM can pull assets from (maps, terrain packs, music, voice lines). Only resources with `ai_usage: Allow` are eligible.                                                                                                                                                                                                                                     |
| **Custom instructions**     | (empty)             | Freeform text the player adds to every prompt. "Include lots of naval missions." "Make Tanya a villain." "Based on actual WW2 Eastern Front operations."                                                                                                                                                                                                                                      |
| **Moral complexity**        | Low                 | How often the LLM generates tactical dilemmas with no clean answer, and how much character personality drives the fallout. Low = straightforward objectives. Medium = occasional trade-offs with character consequences. High = genuine moral weight with long-tail consequences across missions. See "Moral Complexity Parameter" under Extended Generative Campaign Modes.                  |
| **Victory conditions**      | (fixed length only) | For open-ended campaigns: a set of conditions that define campaign victory. Examples: "Eliminate General Morrison," "Capture all three Allied capitals," "Survive 30 missions." The LLM works toward these conditions narratively — building tension, creating setbacks, escalating stakes — and generates the final mission when conditions are ripe. Ignored when campaign length is fixed. |

The player clicks "Generate Campaign" — the LLM produces the campaign skeleton before the first mission starts (typically 10–30 seconds depending on provider).

**Step 1b — Natural Language Campaign Intent (optional, recommended):**

The configuration screen above works. But most players don't think in parameters — they think in stories. A player's mental model is "Soviet campaign where I'm a disgraced colonel trying to redeem myself on the Eastern Front," not "faction=soviet, tone=realistic_military, difficulty_curve=escalating, theater=snow."

The system supports **two entry paths** to the same pipeline:

```
Path A (structured — current):
  Configuration screen → fill params → "Generate Campaign"

Path B (natural language — new):
  "Describe your campaign" text box → Intent Interpreter →
  pre-filled configuration screen → user reviews/adjusts → "Generate Campaign"
```

Path B feeds into Path A. The user's natural language description **pre-fills** the same `CampaignParameters` struct, then shows the structured configuration screen with inferred values highlighted (subtle "inferred" badge). The user can review, override anything, or just click "Generate Campaign" immediately if the inferences look right.

**The "Describe Your Campaign" text area** appears at the top of the "New Generative Campaign" screen, above the structured parameters. It's prominent but never required — a "Skip to manual configuration" link is always visible. Players who prefer clicking dropdowns use Path A directly. Players who prefer storytelling type a description and let the system figure out the details.

**The Intent Interpreter** is a dedicated, lightweight LLM call (separate from skeleton generation) that takes the user's natural language and outputs structured parameter inferences with confidence scores:

```yaml
# User input: "Soviet campaign where you're a disgraced colonel
#  trying to redeem yourself on the Eastern Front"
#
# Intent Interpreter output:
inferred_parameters:
  faction: { value: "soviet", confidence: 1.0, source: "explicit" }
  tone: { value: "realistic_military", confidence: 0.8, source: "inferred: 'disgraced colonel' + 'redeem' → serious military drama" }
  story_style: { value: "character_drama", confidence: 0.7, source: "inferred: redemption arc = character-driven narrative" }
  difficulty_curve: { value: "escalating", confidence: 0.8, source: "inferred: redemption = start weak, earn power back" }
  theater: { value: "snow", confidence: 0.7, source: "inferred: 'Eastern Front' → snow/temperate Eastern Europe" }
  campaign_length: { value: 24, confidence: 0.5, source: "default — no signal from input" }
  moral_complexity: { value: "medium", confidence: 0.7, source: "inferred: redemption arc implies moral stakes" }
  roster_persistence: { value: true, confidence: 0.8, source: "inferred: persistent squad builds attachment for character drama" }
  named_character_count: { value: 4, confidence: 0.6, source: "default, nudged up for character-driven style" }
  mission_variety: { value: "defense_heavy", confidence: 0.7, source: "inferred: start desperate → transition to offensive" }
  resource_level: { value: "scarce", confidence: 0.7, source: "inferred: disgraced = under-resourced, proving worth" }

  # Narrative seeds — creative DNA that flows into skeleton generation
  narrative_seeds:
    protagonist_archetype: "disgraced officer seeking redemption through action"
    starting_situation: "stripped of rank/resources, given a suicide mission nobody expects to succeed"
    arc_shape: "fall → proving ground → earning trust → vindication or tragic failure"
    suggested_characters:
      - role: "skeptical superior who assigned the suicide mission"
        personality_hint: "doubts the protagonist but secretly hopes they succeed"
      - role: "loyal NCO who followed the colonel into disgrace"
        personality_hint: "believes in the colonel when no one else does"
      - role: "enemy commander who remembers the protagonist's former reputation"
        personality_hint: "respects the protagonist, which makes the conflict personal"
    thematic_tensions:
      - "redemption vs. revenge — does the colonel fight to be restored, or to prove everyone wrong?"
      - "obedience vs. initiative — following the orders that disgraced you, or doing what's right this time?"
```

**Why two outputs?** Some of the user's intent maps to `CampaignParameters` fields (faction, tone, difficulty) — these pre-fill the structured UI. The rest maps to **narrative seeds** — creative guidance that doesn't have a dropdown equivalent. Narrative seeds flow directly into the skeleton generation prompt (Step 2), enriching the campaign's creative DNA beyond what parameters alone can express.

**The design principle: great defaults, not hidden magic.** The Intent Interpreter's inferences are always visible and overridable. The structured configuration screen shows exactly what was inferred and why (tooltips on inferred badges: "Inferred from 'Eastern Front' in your description"). Nothing is locked. The user can change "snow" to "desert" if they want an Eastern Front campaign in North Africa. The system's job is to provide the best starting point so most users just click "Generate."

**Override priority** (when natural language and structured parameters conflict):

```
1. Explicit structured parameter (user clicked/typed in the config UI)     — ALWAYS wins
2. Explicit natural language instruction ("make it brutal", "lots of naval") — high confidence
3. Inferred from narrative context ("redemption arc" → escalating difficulty) — medium confidence
4. Story style preset defaults (C&C Classic implies military thriller tone)   — low confidence
5. Global defaults (the Default column in the parameter tables above)         — fallback
```

When a conflict arises — user says "Eastern Front" (implying land warfare) but also "include naval missions" (explicit override) — explicit instruction (#2) beats inference (#3). The UI can show this: `mission_variety: naval_heavy (from "include naval missions")` with the original inference struck through.

**Single mission mode** uses the same Intent Interpreter. A user types "desperate defense on a frozen river, start with almost nothing, hold out until reinforcements arrive" and the system infers: theater=snow, mission_type=defense/survival, resources=scarce, difficulty=hard, a timed reinforcement trigger, narrative=desperate last stand. Same two-path pattern: natural language → pre-filled mission parameters → review → generate.

**Inference heuristic grounding:** The Intent Interpreter's prompt includes a reference table mapping common natural language signals to parameter adjustments (see `research/llm-generation-schemas.md` § 13 for the complete table and prompt template). This keeps inferences consistent across LLM providers — the heuristics are documented guidance, not provider-specific emergent behavior.

**Rust type definitions:**

```rust
/// Output of the Intent Interpreter — a lightweight LLM call that converts
/// natural language campaign descriptions into structured parameters.
pub struct IntentInterpretation {
    /// Inferred values for CampaignParameters fields, with confidence scores.
    pub inferred_params: HashMap<String, InferredValue>,
    /// Creative guidance for skeleton generation — doesn't map to CampaignParameters.
    pub narrative_seeds: Vec<NarrativeSeed>,
    /// The original user input, preserved for the skeleton prompt.
    pub raw_description: String,
}

pub struct InferredValue {
    pub value: serde_json::Value,  // the inferred parameter value
    pub confidence: f32,           // 0.0-1.0
    pub source: InferenceSource,   // why this was inferred
    pub explanation: String,       // human-readable: "Inferred from 'Eastern Front'"
}

pub enum InferenceSource {
    Explicit,       // user directly stated it ("Soviet campaign")
    Inferred,       // derived from narrative context ("redemption" → escalating)
    Default,        // no signal — using global default
}

/// Narrative guidance that enriches skeleton generation beyond CampaignParameters.
pub struct NarrativeSeed {
    pub seed_type: NarrativeSeedType,
    pub content: String,
    pub related_characters: Vec<String>,
}

pub enum NarrativeSeedType {
    ProtagonistArchetype,    // "disgraced officer seeking redemption"
    StartingSituation,       // "given a suicide mission nobody expects to succeed"
    ArcShape,                // "fall → proving ground → vindication"
    CharacterSuggestion,     // "loyal NCO who believes in the colonel"
    ThematicTension,         // "redemption vs. revenge"
    NarrativeThread,         // "betrayal from within"
    GeographicContext,       // "Eastern Front, 1943"
    HistoricalInspiration,   // "based on the Battle of Kursk"
    ToneModifier,            // "but with dark humor"
    CustomConstraint,        // anything else the user specified
}
```

> **Cross-reference:** The complete Intent Interpreter prompt template, inference heuristic grounding table, and narrative seed YAML schema are specified in `research/llm-generation-schemas.md` §§ 13–14.

**Step 2 — Campaign Skeleton (generated once, upfront):**

Before the first mission, the LLM generates a **campaign skeleton** — the high-level arc that provides coherence across all missions:

```yaml
# Generated campaign skeleton (stored in campaign save)
generative_campaign:
  id: gen_soviet_2026-02-14_001
  title: "Operation Iron Tide"           # LLM-generated title
  faction: soviet
  enemy_faction: allied
  theater: european
  length: 24
  
  # Narrative arc — the LLM's plan for the full campaign
  arc:
    act_1: "Establishing foothold in Eastern Europe (missions 1–8)"
    act_2: "Push through Central Europe, betrayal from within (missions 9–16)"
    act_3: "Final assault on Allied HQ, resolution (missions 17–24)"
  
  # Named characters (persistent across the campaign)
  characters:
    - name: "Colonel Petrov"
      role: player_commander
      allegiance: soviet           # current allegiance (can change mid-campaign)
      loyalty: 100                 # 0–100; below threshold triggers defection risk
      personality:
        mbti: ISTJ                 # Personality type — guides dialogue voice, decision patterns, stress reactions
        core_traits: ["pragmatic", "veteran", "distrusts politicians"]
        flaw: "Rigid adherence to doctrine; struggles when improvisation is required"
        desire: "Protect his soldiers and win the war with minimal casualties"
        fear: "Becoming the kind of officer who treats troops as expendable"
        speech_style: "Clipped military brevity. No metaphors. States facts, expects action."
      arc: "Loyal commander who questions orders in Act 2"
      hidden_agenda: null          # no secret agenda
    - name: "Lieutenant Sonya"
      role: intelligence_officer
      allegiance: soviet
      loyalty: 75                  # not fully committed — exploitable
      personality:
        mbti: ENTJ                 # Ambitious leader type — strategic, direct, will challenge authority
        core_traits: ["brilliant", "ambitious", "morally flexible"]
        flaw: "Believes the ends always justify the means; increasingly willing to cross lines"
        desire: "Power and control over the outcome of the war"
        fear: "Being a pawn in someone else's game — which is exactly what she is"
        speech_style: "Precise intelligence language with subtle manipulation. Plants ideas as questions."
      arc: "Provides intel briefings; has a hidden agenda revealed in Act 2"
      hidden_agenda: "secretly working for a rogue faction; will betray if loyalty drops below 40"
    - name: "Sergeant Volkov"
      role: field_hero
      allegiance: soviet
      loyalty: 100
      unit_type: commando
      personality:
        mbti: ESTP                 # Action-oriented operator — lives in the moment, reads the battlefield
        core_traits: ["fearless", "blunt", "fiercely loyal"]
        flaw: "Impulsive; acts first, thinks later; puts himself at unnecessary risk"
        desire: "To be in the fight. Peace terrifies him more than bullets."
        fear: "Being sidelined or deemed unfit for combat"
        speech_style: "Short, punchy, darkly humorous. Gallows humor under fire. Calls everyone by nickname."
      arc: "Accompanies the player; can die permanently"
      hidden_agenda: null
    - name: "General Morrison"
      role: antagonist
      allegiance: allied
      loyalty: 90
      personality:
        mbti: INTJ                 # Strategic mastermind — plans 10 moves ahead, emotionally distant
        core_traits: ["strategic genius", "ruthless", "respects worthy opponents"]
        flaw: "Arrogance — sees the player as a puzzle to solve, not a genuine threat, until it's too late"
        desire: "To prove the intellectual superiority of his approach to warfare"
        fear: "Losing to brute force rather than strategy — it would invalidate his entire philosophy"
        speech_style: "Calm, measured, laced with classical references. Never raises his voice. Compliments the player before threatening them."
      arc: "Allied commander; grows from distant threat to personal rival"
      hidden_agenda: "may offer a secret truce if the player's reputation is high enough"
  
  # Backstory and context (fed to the LLM for every subsequent mission prompt)
  backstory: |
    The year is 1953. The Allied peace treaty has collapsed after the
    assassination of the Soviet delegate at the Vienna Conference.
    Colonel Petrov leads a reformed armored division tasked with...
  
  # Planned branch points (approximate — adjusted as the player plays)
  branch_points:
    - mission: 4
      theme: "betray or protect civilian population"
    - mission: 8
      theme: "follow orders or defy command"
    - mission: 12
      theme: "Sonya's loyalty revealed"
    - mission: 16
      theme: "ally with rogue faction or destroy them"
    - mission: 20
      theme: "mercy or ruthlessness in final push"
```

The skeleton is a plan, not a commitment. The LLM adapts it as the player makes choices and encounters different outcomes. Act 2's betrayal might happen in mission 10 or mission 14 depending on how the player's story unfolds.

