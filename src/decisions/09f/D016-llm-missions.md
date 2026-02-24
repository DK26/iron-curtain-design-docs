## D016: LLM-Generated Missions and Campaigns

**Decision:** Provide an optional LLM-powered mission generation system (Phase 7) via the `ic-llm` crate. Players bring their own LLM provider (BYOLLM) — the engine never ships or requires one. Every game feature works fully without an LLM configured.

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

**Implementation approach:**
- LLM generates YAML map definition + Lua trigger scripts
- Same format as hand-crafted missions — no special runtime
- Validation pass ensures generated content is playable (valid unit types, reachable objectives)
- Can use local models or API-based models (user choice)
- Player data for personalization comes from local SQLite queries (read-only) — no data leaves the device unless the user's LLM provider is cloud-based (BYOLLM architecture)

**Bring-Your-Own-LLM (BYOLLM) architecture:**
- `ic-llm` defines a `LlmProvider` trait — any backend that accepts a prompt and returns structured text
- Built-in providers: OpenAI-compatible API, local Ollama/llama.cpp, Anthropic API
- Users configure their provider in settings (API key, endpoint, model name)
- The engine never ships or requires a specific model — the user chooses
- Provider is a runtime setting, not a compile-time dependency
- All prompts and responses are logged (opt-in) for debugging and sharing
- Offline mode: pre-generated content works without any LLM connection

**Prompt strategy is provider/model-specific (especially local vs cloud):**
- IC does **not** assume one universal prompt style works across all BYOLLM providers.
- Local models (Ollama/llama.cpp and other self-hosted backends) often require different **chat templates**, tighter context budgets, simpler output schemas, and more staged task decomposition than frontier cloud APIs.
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

#### Character Construction Principles

Generative campaigns live or die on character quality. A procedurally generated mission with a mediocre map is forgettable. A procedurally generated mission where a character you care about betrays you is unforgettable. The LLM's system prompt includes explicit character construction guidance drawn from proven storytelling principles.

**Personality-first construction:**

Every named character is built from a personality model, not just a role label. The LLM assigns each character:

| Field            | Purpose                                                                                             | Example (Sonya)                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **MBTI type**    | Governs decision-making patterns, stress reactions, communication style, and interpersonal dynamics | ENTJ — ambitious strategist who leads from the front and challenges authority |
| **Core traits**  | 3–5 adjectives that define the character's public-facing personality                                | Brilliant, ambitious, morally flexible                                        |
| **Flaw**         | A specific weakness that creates dramatic tension and makes the character human                     | Believes the ends always justify the means                                    |
| **Desire**       | What the character wants — drives their actions and alliances                                       | Power and control over the outcome of the war                                 |
| **Fear**         | What the character dreads — drives their mistakes and vulnerabilities                               | Being a pawn in someone else's game                                           |
| **Speech style** | Concrete voice direction so dialogue sounds like a person, not a bot                                | "Precise intelligence language with subtle manipulation"                      |

The MBTI type is not a horoscope — it's a **consistency framework**. When the LLM generates dialogue, decisions, and reactions over 24 missions, the personality type keeps the character's voice and behavior coherent. An ISTJ commander (Petrov) responds to a crisis differently than an ESTP commando (Volkov): Petrov consults doctrine, Volkov acts immediately. An ENTJ intelligence officer (Sonya) challenges the player's plan head-on; an INFJ would express doubts obliquely. The LLM's system prompt maps each type to concrete behavioral patterns:

- **Under stress:** How the character cracks (ISTJ → becomes rigidly procedural; ESTP → reckless improvisation; ENTJ → autocratic overreach; INTJ → cold withdrawal)
- **In conflict:** How they argue (ST types cite facts; NF types appeal to values; TJ types issue ultimatums; FP types walk away)
- **Loyalty shifts:** What makes them stay or leave (SJ types value duty and chain of command; NP types value autonomy and moral alignment; NT types follow competence; SF types follow personal bonds)
- **Dialogue voice:** How they talk (specific sentence structures, vocabulary patterns, verbal tics, and what they never say)

**The flaw/desire/fear triangle** is the engine of character drama. Every meaningful character moment comes from the collision between what a character wants, what they're afraid of, and the weakness that undermines them. Sonya *wants* control, *fears* being a pawn, and her *flaw* (ends justify means) is exactly what makes her vulnerable to becoming the thing she fears. The LLM uses this triangle to generate character arcs that feel authored, not random.

**Ensemble dynamics:**

The LLM doesn't build characters in isolation — it builds a cast with deliberate personality contrasts. The system prompt instructs:

- **No duplicate MBTI types** in the core cast (3–5 characters). Personality diversity creates natural interpersonal tension.
- **Complementary and opposing pairs.** Petrov (ISTJ, duty-bound) and Sonya (ENTJ, ambitious) disagree on *why* they're fighting. Volkov (ESTP, lives-for-combat) and a hypothetical diplomat character (INFJ, seeks-peace) disagree on *whether* they should be. These pairings generate conflict without scripting.
- **Role alignment — or deliberate misalignment.** A character whose MBTI fits their role (ISTJ commander) is reliable. A character whose personality clashes with their role (ENFP intelligence officer — creative but unfocused) creates tension that pays off during crises.

**Inter-character dynamics (MBTI interaction simulation):**

Characters don't exist in isolation — they interact with each other, and those interactions are where the best drama lives. The LLM uses MBTI compatibility and tension patterns to simulate how characters relate, argue, collaborate, and clash *with each other* — not just with the player.

The system prompt maps personality pairings to interaction patterns:

| Pairing dynamic                              | Example                                   | Interaction pattern                                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NT + NT** (strategist meets strategist)    | Sonya (ENTJ) vs. Morrison (INTJ)          | Intellectual respect masking mutual threat. Each anticipates the other's moves. Conversations are chess games. If forced to cooperate, they're devastatingly effective — but neither trusts the other to stay loyal.                        |
| **ST + NF** (realist meets idealist)         | Petrov (ISTJ) + diplomat (INFJ)           | Petrov dismisses idealism as naïve; the diplomat sees Petrov as a blunt instrument. Under pressure, the diplomat's moral clarity gives Petrov purpose he didn't know he lacked.                                                             |
| **SP + SJ** (improviser meets rule-follower) | Volkov (ESTP) + Petrov (ISTJ)             | Volkov breaks protocol; Petrov enforces it. They argue constantly — but Volkov's improvisation saves the squad when doctrine fails, and Petrov's discipline saves them when improvisation gets reckless. Grudging mutual respect over time. |
| **TJ + FP** (commander meets rebel)          | Sonya (ENTJ) + a resistance leader (ISFP) | Sonya issues orders; the ISFP resists on principle. Sonya sees inefficiency; the ISFP sees tyranny. The conflict escalates until one of them is proven right — or both are proven wrong.                                                    |

The LLM generates inter-character dialogue — not just player-facing briefings — by simulating how each character would respond to the other's personality. When Petrov delivers a mission debrief and Volkov interrupts with a joke, the LLM knows Petrov's ISTJ response is clipped disapproval ("This isn't the time, Sergeant"), not laughter. When Sonya proposes a morally questionable plan, the LLM knows which characters push back (NF types, SF types) and which support it (NT types, pragmatic ST types).

Over a 24-mission campaign, these simulated interactions create emergent relationships that the LLM tracks in narrative threads. A Petrov-Volkov friction arc might evolve from mutual irritation (missions 1–5) to grudging respect (missions 6–12) to genuine trust (missions 13–20) to devastating loss if one of them dies. None of this is scripted — it emerges from consistent MBTI-driven behavioral simulation applied to the campaign's actual events.

**Story Style Presets:**

The `story_style` parameter controls how the LLM constructs both characters and narrative. The default — **C&C Classic** — is designed to feel like an actual C&C campaign:

| Style                     | Character Voice                                                                                                                                                   | Narrative Feel                                                                                                                                         | Inspired By                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **C&C Classic** (default) | Over-the-top military personalities. Commanders are larger-than-life. Villains monologue. Heroes quip under fire. Every character is memorable on first briefing. | Bombastic Cold War drama with genuine tension underneath. Betrayals. Superweapons. Last stands. The war is absurd and deadly serious at the same time. | RA1/RA2 campaigns, Tanya's one-liners, Stalin's theatrics, Yuri's menace, Carville's charm |
| **Realistic Military**    | Understated professionalism. Characters speak in military shorthand. Emotions are implied, not stated.                                                            | Band of Brothers tone. The horror of war comes from what's *not* said. Missions feel like operations, not adventures.                                  | Generation Kill, Black Hawk Down, early Tom Clancy                                         |
| **Political Thriller**    | Everyone has an agenda. Dialogue is subtext-heavy. Trust is currency.                                                                                             | Slow-burn intrigue with sudden violence. The real enemy is often on your own side.                                                                     | The Americans, Tinker Tailor Soldier Spy, Metal Gear Solid                                 |
| **Pulp Sci-Fi**           | Characters are archetypes turned to 11. Scientists are mad. Soldiers are grizzled. Villains are theatrical.                                                       | Experimental tech, dimension portals, time travel, alien artifacts. Camp embraced, not apologized for.                                                 | RA2 Yuri's Revenge, C&C Renegade, Starship Troopers                                        |
| **Character Drama**       | Deeply human characters with complex motivations. Relationships shift over the campaign.                                                                          | The war is the backdrop; the story is about the people. Victory feels bittersweet. Loss feels personal.                                                | The Wire, Battlestar Galatica, This War of Mine                                            |

The default (C&C Classic) exists because generative campaigns should feel like C&C out of the box — not generic military fiction. Kane, Tanya, Yuri, and Carville are memorable because they're *specific*: exaggerated personalities with distinctive voices, clear motivations, and dramatic reveals. The LLM's system prompt for C&C Classic includes explicit guidance: "Characters should be instantly recognizable from their first line of dialogue. A commander who speaks in forgettable military platitudes is a failed character. Every briefing should have a line worth quoting."

Players who want a different narrative texture pick a different style — or write a freeform description. The `custom_instructions` field in Advanced parameters stacks with the style preset, so a player can select "C&C Classic" and add "but make the villain sympathetic" for a hybrid tone.

**C&C Classic — Narrative DNA (LLM System Prompt Guidelines):**

The "C&C Classic" preset isn't just a label — it's a set of concrete generation rules derived from Principle #20 (Narrative Identity) in [13-PHILOSOPHY.md](13-PHILOSOPHY.md). When the LLM generates content in this style, its system prompt includes the following directives. These also serve as authoring guidelines for hand-crafted IC campaigns.

*Tone rules:*

1. **Play everything straight.** Never acknowledge absurdity. A psychic weapon is presented with the same military gravitas as a tank column. A trained attack dolphin gets a unit briefing, not a joke. The audience finds the humor because the world takes itself seriously — the moment the writing winks, the spell breaks.
2. **Escalate constantly.** Every act raises the stakes. If mission 1 is "secure a bridge," mission 8 should involve a superweapon, and mission 20 should threaten civilization. C&C campaigns climb from tactical skirmish to existential crisis. Never de-escalate the macro arc, even if individual missions provide breathers.
3. **Make it quotable.** Before finalizing any briefing, villain monologue, or unit voice line, apply the quotability test: would a player repeat this line to a friend? Would it work as a forum signature? If a line communicates information but isn't memorable, rewrite it until it is.

*Character rules:*

4. **First line establishes personality.** A character's introduction must immediately communicate who they are. Generic: "Commander, I'll be your intelligence officer." C&C Classic: "Commander, I've read your file. Impressive — if any of it is true." The personality is the introduction.
5. **Villains believe they're right.** C&C villains — Kane, Yuri, Stalin — are compelling because they have genuine convictions. Kane isn't evil for evil's sake; he has a vision. Generate villains with philosophy, not just malice. The best villain dialogue makes the player pause and think "...he has a point."
6. **Heroes have attitude, not perfection.** Tanya isn't a generic soldier — she's cocky, impatient, and treats war like a playground. Carville isn't a generic general — he's folksy, irreverent, and drops Southern metaphors. Generate heroes with specific personality quirks that make them fun, not admirable.
7. **Betrayal is always personal.** C&C campaigns are built on betrayals — and the best ones hurt because you liked the character. If the campaign skeleton includes a betrayal arc, invest missions in making that character genuinely likeable first. A betrayal by a cipher is plot. A betrayal by someone you trusted is drama.

*World-building rules:*

8. **Cold War as mythology, not history.** Real Cold War events are raw material, not constraints. Einstein erasing Hitler, chronosphere technology, psychic amplifiers, orbital ion cannons — these are mythological amplifications of real anxieties. Generate world details that feel like Cold War fever dreams, not Wikipedia entries.
9. **Technology is dramatic, not realistic.** Every weapon and structure should evoke a feeling. "GAP generator" isn't just radar jamming — it's shrouding your base in mystery. "Iron Curtain device" isn't just invulnerability — it's invoking the most famous metaphor of the Cold War era. Name technologies for dramatic impact, not technical accuracy.
10. **Factions are worldviews.** Allied briefings should feel like Western military confidence: professional, optimistic, technologically superior, with an undercurrent of "we're the good guys, right?" Soviet briefings should feel like revolutionary conviction: the individual serves the collective, sacrifice is glory, industrial might is beautiful. Generate faction-specific vocabulary, sentence structure, and emotional register — not just different unit names.

*Structural rules:*

11. **Every mission has a "moment."** A moment is a scripted event that creates an emotional peak — a character's dramatic entrance, a surprise betrayal, a superweapon firing, an unexpected ally, a desperate last stand. Missions without moments are forgettable. Generate at least one moment per mission, placed at a dramatically appropriate time (not always the climax — a mid-mission gut punch is often stronger).
12. **Briefings sell the mission.** The briefing exists to make the player *want* to play the next mission. It should end with a question (explicit or implied) that the mission answers. "Can we take the beachhead before Morrison moves his armor south?" The player clicks "Deploy" because they want to find out.
13. **Debriefs acknowledge what happened.** Post-mission debriefs should reference specific battle report outcomes: casualties, key moments, named units that survived or died. A debrief that says "Well done, Commander" regardless of outcome is a failed debrief. React to the player's actual experience.

> **Cross-reference:** These rules derive from Principle #20 (Narrative Identity — Earnest Commitment, Never Ironic Distance) in [13-PHILOSOPHY.md](13-PHILOSOPHY.md), which establishes the seven C&C narrative pillars. The rules above are the specific, actionable LLM directives and human authoring guidelines that implement those pillars for content generation. Other story style presets (Realistic Military, Political Thriller, etc.) have their own rule sets — but C&C Classic is the default because it captures the franchise's actual identity.

**Step 3 — Post-Mission Inspection & Progressive Generation:**

After each mission, the system collects a detailed **battle report** — not just "win/lose" but a structured account of what happened during gameplay. This report is the LLM's primary input for generating the next mission. The LLM inspects what actually occurred and reacts to it against the backstory and campaign arc.

**What the battle report captures:**

- **Outcome:** which named outcome the player achieved (victory variant, defeat variant)
- **Casualties:** units lost by type, how they died (combat, friendly fire, sacrificed), named characters killed or wounded
- **Surviving forces:** exact roster state — what the player has left to carry forward
- **Buildings:** structures built, destroyed, captured (especially enemy structures)
- **Economy:** resources gathered, spent, remaining; whether the player was resource-starved or flush
- **Timeline:** mission duration, how quickly objectives were completed, idle periods
- **Territory:** areas controlled at mission end, ground gained or lost
- **Key moments:** scripted triggers that fired (or didn't), secondary objectives attempted, hidden objectives discovered
- **Enemy state:** what enemy forces survived, whether the enemy retreated or was annihilated, enemy structures remaining
- **Player behavior patterns:** aggressive vs. defensive play, tech rush vs. mass production, micromanagement intensity (from D042 event logs)

The LLM receives this battle report alongside the campaign context and generates the next mission **as a direct reaction to what happened.** This is not "fill in the next slot in a pre-planned arc" — it's "inspect the battlefield aftermath and decide what happens next in the story."

**How inspection drives generation:**

1. **Narrative consequences.** The LLM sees the player barely survived mission 5 with 3 tanks and no base — the next mission isn't a large-scale assault. It's a desperate retreat, a scavenging mission, or a resistance operation behind enemy lines. The campaign *genre* shifts based on the player's actual situation.
2. **Escalation and de-escalation.** If the player steamrolled mission 3, the LLM escalates: the enemy regroups, brings reinforcements, changes tactics. If the player struggled, the LLM provides a breather mission — resupply, ally arrival, intelligence gathering.
3. **Story continuity.** The LLM references specific events: "Commander, the bridge at Danzig we lost in the last operation — the enemy is using it to move armor south. We need it back." Because the player actually lost that bridge.
4. **Character reactions.** Named characters react to what happened. Volkov's briefing changes if the player sacrificed civilians in the last mission. Sonya questions the commander's judgment after heavy losses. Morrison taunts the player after a defensive victory: "You held the line. Impressive. It won't save you."
5. **Campaign arc awareness.** The LLM knows where it is in the story — mission 8 of 24, end of Act 1 — and paces accordingly. Early missions establish, middle missions complicate, late missions resolve. But the *specific* complications come from the battle reports, not from a pre-written script.
6. **Mission number context.** The LLM knows which mission number it's generating relative to the total (or relative to victory conditions in open-ended mode). Mission 3/24 gets an establishing tone. Mission 20/24 gets climactic urgency. The story progression scales accordingly — the LLM won't generate a "final confrontation" at mission 6 unless the campaign is 8 missions long.

**Generation pipeline per mission:**

```
┌─────────────────────────────────────────────────────────┐
│                 Mission Generation Pipeline              │
│                                                          │
│  Inputs:                                                 │
│  ├── Campaign skeleton (backstory, arc, characters)      │
│  ├── Campaign context (accumulated state — see below)    │
│  ├── Player's campaign state (roster, flags, path taken) │
│  ├── Last mission battle report (detailed telemetry)     │
│  ├── Player profile (D042 — playstyle, preferences)      │
│  ├── Campaign parameters (difficulty, tone, etc.)        │
│  ├── Victory condition progress (open-ended campaigns)   │
│  └── Available Workshop resources (maps, assets)         │
│                                                          │
│  LLM generates:                                          │
│  ├── Mission briefing (text, character dialogue)         │
│  ├── Map layout (YAML terrain definition)                │
│  ├── Objectives (primary + secondary + hidden)           │
│  ├── Enemy composition and AI behavior                   │
│  ├── Triggers and scripted events (Lua)                  │
│  ├── Named outcomes (2–4 per mission)                    │
│  ├── Carryover configuration (roster, equipment, flags)  │
│  ├── Weather schedule (D022)                             │
│  ├── Debrief per outcome (text, story flag effects)      │
│  ├── Cinematic sequences (mid-mission + pre/post)        │
│  ├── Dynamic music playlist + mood tags                  │
│  ├── Radar comm events (in-mission character dialogue)   │
│  ├── In-mission branching dialogues (RPG-style choices)  │
│  ├── EVA notification scripts (custom voice cues)        │
│  └── Intermission dialogue trees (between missions)      │
│                                                          │
│  Validation pass:                                        │
│  ├── All unit types exist in the game module             │
│  ├── All map references resolve                          │
│  ├── Objectives are reachable (pathfinding check)        │
│  ├── Lua scripts parse and sandbox-check                 │
│  ├── Named outcomes have valid transitions               │
│  └── Difficulty budget is within configured range        │
│                                                          │
│  Output: standard D021 mission node (YAML + Lua + map)   │
└─────────────────────────────────────────────────────────┘
```

**Step 4 — Campaign Context (the LLM's memory):**

The LLM doesn't have inherent memory between generation calls. The system maintains a **campaign context** document — a structured summary of everything that has happened — and includes it in every generation prompt. This is the bridge between "generate mission N" and "generate mission N+1 that makes sense."

```rust
/// Accumulated campaign context — passed to the LLM with each generation request.
/// Grows over the campaign but is summarized/compressed to fit context windows.
#[derive(Serialize, Deserialize, Clone)]
pub struct GenerativeCampaignContext {
    /// The original campaign skeleton (backstory, arc, characters).
    pub skeleton: CampaignSkeleton,
    
    /// Campaign parameters chosen by the player at setup.
    pub parameters: CampaignParameters,
    
    /// Per-mission summary of what happened (compressed narrative, not raw state).
    pub mission_history: Vec<MissionSummary>,
    
    /// Current state of each named character — tracks everything the LLM needs
    /// to write them consistently and evolve their arc.
    pub character_states: Vec<CharacterState>,
    
    /// Active story flags and campaign variables (D021 persistent state).
    pub flags: HashMap<String, Value>,
    
    /// Current unit roster summary (unit counts by type, veterancy distribution,
    /// named units — not individual unit state, which is too granular for prompts).
    pub roster_summary: RosterSummary,
    
    /// Narrative threads the LLM is tracking (set up in skeleton, updated per mission).
    /// e.g., "Sonya's betrayal — foreshadowed in missions 3, 5; reveal planned for ~mission 12"
    pub active_threads: Vec<NarrativeThread>,
    
    /// Player tendency observations (from D042 profile + mission outcomes).
    /// e.g., "Player favors aggressive strategies, rarely uses naval units,
    /// tends to protect civilians"
    pub player_tendencies: Vec<String>,
    
    /// The planned arc position — where we are in the narrative structure.
    /// e.g., "Act 2, rising action, approaching midpoint crisis"
    pub arc_position: String,
}

pub struct MissionSummary {
    pub mission_number: u32,
    pub title: String,
    pub outcome: String,            // the named outcome the player achieved
    pub narrative_summary: String,  // 2-3 sentence LLM-generated summary
    pub key_events: Vec<String>,    // "Volkov killed", "bridge destroyed", "civilians saved"
    pub performance: MissionPerformance, // time, casualties, rating
}

/// Detailed battle telemetry collected after each mission.
/// This is what the LLM "inspects" to decide what happens next.
pub struct BattleReport {
    pub units_lost: HashMap<String, u32>,        // unit type → count lost
    pub units_surviving: HashMap<String, u32>,   // unit type → count remaining
    pub named_casualties: Vec<String>,           // named characters killed this mission
    pub buildings_destroyed: Vec<String>,        // player structures lost
    pub buildings_captured: Vec<String>,         // enemy structures captured
    pub enemy_forces_remaining: EnemyState,      // annihilated, retreated, regrouping, entrenched
    pub resources_gathered: i64,
    pub resources_spent: i64,
    pub mission_duration_seconds: u32,
    pub territory_control_permille: i32,          // 0–1000, fraction of map controlled (fixed-point, not f32)
    pub objectives_completed: Vec<String>,       // primary + secondary + hidden
    pub objectives_failed: Vec<String>,
    pub player_behavior: PlayerBehaviorSnapshot, // from D042 event classification
}

/// Tracks a named character's evolving state across the campaign.
/// The LLM reads this to write consistent, reactive character behavior.
pub struct CharacterState {
    pub name: String,
    pub status: CharacterStatus,         // Alive, Dead, MIA, Captured, Defected
    pub allegiance: String,              // current faction — can change mid-campaign
    pub loyalty: u8,                     // 0–100; LLM adjusts based on player actions
    pub relationship_to_player: i8,      // -100 to +100 (hostile → loyal)
    pub hidden_agenda: Option<String>,   // secret motivation; revealed when conditions trigger
    pub personality_type: String,        // MBTI code (e.g., "ISTJ") — personality consistency anchor
    pub speech_style: String,            // dialogue voice guidance for the LLM
    pub flaw: String,                    // dramatic weakness — drives character conflict
    pub desire: String,                  // what they want — drives their actions
    pub fear: String,                    // what they dread — drives their mistakes
    pub missions_appeared: Vec<u32>,     // which missions this character appeared in
    pub kills: u32,                      // if a field unit — combat track record
    pub notable_events: Vec<String>,     // "betrayed the player in mission 12", "saved Volkov in mission 7"
    pub current_narrative_role: String,  // "ally", "antagonist", "rival", "prisoner", "rogue"
}

pub enum CharacterStatus {
    Alive,
    Dead { mission: u32, cause: String },     // permanently gone
    MIA { since_mission: u32 },                // may return
    Captured { by_faction: String },           // rescue or prisoner exchange possible
    Defected { to_faction: String, mission: u32 }, // switched sides
    Rogue { since_mission: u32 },              // operating independently
}
```

**Context window management:** The context grows with each mission. For long campaigns (24+ missions), the system compresses older mission summaries into shorter recaps (the LLM itself does this compression: "Summarize missions 1–8 in 200 words, retaining key plot points and character developments"). This keeps the prompt within typical context window limits (~8K–32K tokens for the campaign context, leaving room for the generation instructions and output).

#### Generated Output = Standard D021 Campaigns

Everything the LLM generates is standard IC format:

| Generated artifact   | Format                                                               | Same as hand-crafted? |
| -------------------- | -------------------------------------------------------------------- | --------------------- |
| Campaign graph       | D021 YAML (`campaign.yaml`)                                          | Identical             |
| Mission maps         | YAML map definition                                                  | Identical             |
| Triggers / scripts   | Lua (same API as `04-MODDING.md`)                                    | Identical             |
| Briefings            | YAML text + character references                                     | Identical             |
| Named characters     | D038 Named Characters format                                         | Identical             |
| Carryover config     | D021 carryover modes                                                 | Identical             |
| Story flags          | D021 `flags`                                                         | Identical             |
| Intermissions        | D038 Intermission Screens (briefing, debrief, roster mgmt, dialogue) | Identical             |
| Cinematic sequences  | D038 Cinematic Sequence module (YAML step list)                      | Identical             |
| Dynamic music config | D038 Music Playlist module (mood-tagged track lists)                 | Identical             |
| Radar comm events    | D038 Video Playback / Radar Comm module                              | Identical             |
| In-mission dialogues | D038 Dialogue Editor format (branching tree YAML)                    | Identical             |
| EVA notifications    | D038 EVA module (custom event → audio + text)                        | Identical             |
| Ambient sound zones  | D038 Ambient Sound Zone module                                       | Identical             |

This is the key architectural decision: **there is no "generative campaign runtime."** The LLM is a content creation tool. Once a mission is generated, it's a normal mission. Once the full campaign is complete (all 24 missions played), it's a normal D021 campaign — playable by anyone, with or without an LLM.

#### Cinematic & Narrative Generation

A generated mission that plays well but *feels* empty — no mid-mission dialogue, no music shifts, no character moments, no dramatic reveals — is a mission that fails the C&C fantasy. The original Red Alert didn't just have good missions; it had missions where Stavros called you on the radar mid-battle, where the music shifted from ambient to Hell March when the tanks rolled in, where Tanya dropped a one-liner before breaching the base. That's the standard.

The LLM generates the **full cinematic layer** for each mission — not just objectives and unit placement, but the narrative moments that make a mission feel authored:

**Mid-mission radar comm events:**

The classic C&C moment: your radar screen flickers, a character's face appears, they deliver intel or a dramatic line. The LLM generates these as D038 Radar Comm modules, triggered by game events:

```yaml
# LLM-generated radar comm event
radar_comms:
  - id: bridge_warning
    trigger:
      type: unit_enters_region
      region: bridge_approach
      faction: player
    speaker: "General Stavros"
    portrait: stavros_concerned
    text: "Commander, our scouts report heavy armor at the bridge. Going in head-on would be suicide. There's a ford upstream — shallow enough for infantry."
    audio: null                        # TTS if available, silent otherwise
    display_mode: radar_comm           # replaces radar panel
    duration: 6.0                      # seconds, then radar returns
    
  - id: betrayal_reveal
    trigger:
      type: objective_complete
      objective: capture_command_post
    speaker: "Colonel Vasquez"
    portrait: vasquez_smug
    text: "Surprised to see me, Commander? Your General Stavros sold you out. These men now answer to me."
    display_mode: radar_comm
    effects:
      - set_flag: vasquez_betrayal
      - convert_units:                 # allied garrison turns hostile
          region: command_post_interior
          from_faction: player
          to_faction: enemy
    cinematic: true                    # brief letterbox + game pause for drama
```

The LLM decides *when* these moments should happen based on the mission's narrative arc. A routine mission might have 1-2 comms (intel at start, debrief at end). A story-critical mission might have 5-6, including a mid-battle betrayal, a desperate plea for reinforcements, and a climactic confrontation.

**In-mission branching dialogues (RPG-style choices):**

Not just in intermissions — branching dialogue can happen *during* a mission. An NPC unit is reached, a dialogue triggers, the player makes a choice that affects the mission in real-time:

```yaml
mid_mission_dialogues:
  - id: prisoner_interrogation
    trigger:
      type: unit_enters_region
      unit: tanya
      region: prison_compound
    pause_game: true                   # freezes game during dialogue
    tree:
      - speaker: "Captured Officer"
        portrait: captured_officer
        text: "I'll tell you everything — the mine locations, the patrol routes. Just let me live."
        choices:
          - label: "Talk. Now."
            effects:
              - reveal_shroud: minefield_region
              - set_flag: intel_acquired
            next: officer_cooperates
          - label: "We don't negotiate with the enemy."
            effects:
              - set_flag: officer_executed
              - adjust_character: { name: "Tanya", loyalty: -5 }
            next: tanya_reacts
          - label: "You'll come with us. Command will want to talk to you."
            effects:
              - spawn_unit: { type: prisoner_escort, region: prison_compound }
              - add_objective: { text: "Extract the prisoner to the LZ", type: secondary }
            next: extraction_added
      
      - id: officer_cooperates
        speaker: "Captured Officer"
        text: "The mines are along the ridge — I'll mark them on your map. And Commander... the base commander is planning to retreat at 0400."
        effects:
          - add_objective: { text: "Destroy the base before 0400", type: bonus, timer: 300 }
      
      - id: tanya_reacts
        speaker: "Tanya"
        portrait: tanya_cold
        text: "Your call, Commander. But he might have known something useful."
```

These are **full D038 Dialogue Editor trees** — the same format a human designer would create. The LLM generates them with awareness of the mission's objectives, characters, and narrative context. The choices have *mechanical consequences* — revealing shroud, adding objectives, changing timers, spawning units, adjusting character loyalty.

The LLM can also generate **consequence chains** — a choice in Mission 5's dialogue affects Mission 7's setup (via story flags). "You spared the officer in Mission 5" → in Mission 7, that officer appears as an informant. The LLM tracks these across the campaign context.

**Dynamic music generation:**

The LLM doesn't compose music — it curates it. For each mission, the LLM generates a D038 Music Playlist with mood-tagged tracks selected from the game module's soundtrack and any Workshop music packs the player has installed:

```yaml
music:
  mode: dynamic
  tracks:
    ambient:
      - fogger                         # game module default
      - workshop:cold-war-ost/frozen_fields   # from Workshop music pack
    combat:
      - hell_march
      - grinder
    tension:
      - radio_2
      - workshop:cold-war-ost/countdown
    victory:
      - credits
  
  # Scripted music cues (override dynamic system at specific moments)
  scripted_cues:
    - trigger: { type: timer, seconds: 0 }         # mission start
      track: fogger
      fade_in: 3.0
    - trigger: { type: objective_complete, objective: breach_wall }
      track: hell_march
      fade_in: 0.5                                  # hard cut — dramatic
    - trigger: { type: flag_set, flag: vasquez_betrayal }
      track: workshop:cold-war-ost/countdown
      fade_in: 1.0
```

The LLM picks tracks that match the mission's tone. A desperate defense mission gets tense ambient tracks and hard-hitting combat music. A stealth infiltration gets quiet ambient and reserves the intense tracks for when the alarm triggers. The scripted cues tie specific music moments to narrative beats — the betrayal hits differently when the music shifts at exactly the right moment.

**Cinematic sequences:**

For high-stakes moments, the LLM generates full D038 Cinematic Sequences — multi-step scripted events combining camera movement, dialogue, music, unit spawns, and letterbox:

```yaml
cinematic_sequences:
  - id: reinforcement_arrival
    trigger:
      type: objective_complete
      objective: hold_position_2_min
    skippable: true
    steps:
      - type: letterbox
        enable: true
        transition_time: 0.5
      - type: camera_pan
        from: player_base
        to: beach_landing
        duration: 3.0
        easing: ease_in_out
      - type: play_music
        track: hell_march
        fade_in: 0.5
      - type: spawn_units
        units: [medium_tank, medium_tank, medium_tank, apc, apc]
        position: beach_landing
        faction: player
        arrival: landing_craft          # visual: landing craft delivers them
      - type: dialogue
        speaker: "Admiral Kowalski"
        portrait: kowalski_grinning
        text: "The cavalry has arrived, Commander. Where do you want us?"
        duration: 4.0
      - type: camera_pan
        to: player_base
        duration: 2.0
      - type: letterbox
        enable: false
        transition_time: 0.5
```

The LLM generates these for **key narrative moments** — not every trigger. Typical placement:

| Moment                     | Frequency           | Example                                                        |
| -------------------------- | ------------------- | -------------------------------------------------------------- |
| **Mission intro**          | Every mission       | Camera pan across the battlefield, briefing dialogue overlay   |
| **Reinforcement arrival**  | 30-50% of missions  | Camera shows troops landing/parachuting in, commander dialogue |
| **Mid-mission plot twist** | 20-40% of missions  | Betrayal reveal, surprise enemy, intel discovery               |
| **Objective climax**       | Key objectives only | Bridge explosion, base breach, hostage rescue                  |
| **Mission conclusion**     | Every mission       | Victory/defeat sequence, debrief comm                          |

**Intermission dialogue and narrative scenes:**

Between missions, the LLM generates intermission screens that go beyond simple briefings:

- **Branching dialogue with consequences** — "General, do we reinforce the eastern front or push west?" The choice affects the next mission's setup, available forces, or strategic position.
- **Character moments** — two named characters argue about strategy. The player's choice affects their loyalty and relationship. A character whose advice is ignored too many times might defect (Campaign Event Patterns).
- **Intel briefings** — the player reviews intelligence gathered from the previous mission. What they focus on (or ignore) shapes the next mission's surprises.
- **Moral dilemmas** — execute the prisoner or extract intel? Bomb the civilian bridge or let the enemy escape? These set story flags that ripple forward through the campaign.

The LLM generates these as D038 Intermission Screens using the Dialogue template with Choice panels. Every choice links to a story flag; every flag feeds back into the LLM's campaign context for future mission generation.

**EVA and ambient audio:**

The LLM generates custom EVA notification scripts — mission-specific voice cues beyond the default "Unit lost" / "Construction complete":

```yaml
custom_eva:
  - event: unit_enters_region
    region: minefield_zone
    text: "Warning: mines detected in this area."
    priority: high
    cooldown: 30                       # don't repeat for 30 seconds
    
  - event: building_captured
    building: enemy_radar
    text: "Enemy radar facility captured. Shroud cleared."
    priority: normal
    
  - event: timer_warning
    timer: evacuation_timer
    remaining: 60
    text: "60 seconds until evacuation window closes."
    priority: critical
```

The LLM also generates ambient sound zone definitions for narrative atmosphere — a mission in a forest gets wind and bird sounds; a mission in a bombed-out city gets distant gunfire and sirens.

**What this means in practice:**

A generated mission doesn't just drop units on a map with objectives. A generated mission:

1. Opens with a **cinematic pan** across the battlefield while the commander briefs you
2. Plays **ambient music** that matches the terrain and mood
3. Calls you on the **radar** when something important happens — a new threat, a character moment, a plot development
4. Presents **RPG-style dialogue choices** when you reach key locations or NPCs
5. **Shifts the music** from ambient to combat when the fighting starts
6. Triggers a **mid-mission cinematic** when the plot twists — a betrayal, a reinforcement arrival, a bridge explosion
7. Announces custom **EVA warnings** for mission-specific hazards
8. Ends with a **conclusion sequence** — victory celebration or desperate evacuation
9. Transitions to an **intermission** with character dialogue, choices, and consequences

All of it is standard D038 format. All of it is editable after generation. All of it works exactly like hand-crafted content. The LLM just writes it faster.

#### Generative Media Pipeline (Forward-Looking)

The sections above describe the LLM generating *text*: YAML definitions, Lua triggers, briefing scripts, dialogue trees. But the full C&C experience isn't text — it's voice-acted briefings, dynamic music, sound effects, and cutscenes. Currently, generative campaigns use existing media assets: game module sound libraries, Workshop music packs, the player's installed voice collections. A mission briefing is *text* that the player reads; a radar comm event is a text bubble without voice audio.

AI-generated media — voice synthesis, music generation, sound effect creation, and a deferred optional `M11` video/cutscene generation layer — is advancing rapidly. By the time IC reaches Phase 7, production-quality AI voice synthesis will be mature (it largely is already in 2025–2026), AI music generation is approaching usable quality, and AI video is on a clear trajectory. The generative media pipeline prepares for this without creating obstacles for a media-free fallback.

**Core design principle: every generative media feature is a progressive enhancement.** A generative campaign plays identically with or without media generation. Text briefings work. Music from the existing library works. Silent radar comms with text work. When AI media providers are available, they *enhance* the experience — voiced briefings, custom music, generated sound effects — but nothing *depends* on them.

**Three tiers of generative media (from most ambitious to most conservative):**

**Tier 1 — Live generation during generative campaigns:**

The most ambitious mode. The player is playing a generative campaign. Between missions, during the loading/intermission screen, the system generates media for the next mission in real-time. The player reads the text briefing while voice synthesis runs in the background; when ready, the briefing replays with voice. If voice generation isn't finished in time, the text-only version is already playing — no delay.

| Media Type       | Generation Window                                       | Fallback (if not ready or unavailable)          | Provider Class                                               |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| **Voice lines**  | Loading screen / intermission (~15–30s)                 | Text-only briefing, text bubble radar comms     | Voice synthesis (ElevenLabs, local TTS, XTTS, Bark, Piper)   |
| **Music tracks** | Pre-generated during campaign setup or between missions | Existing game module soundtrack, Workshop packs | Music generation (Suno, Udio, MusicGen, local models)        |
| **Sound FX**     | Pre-generated during mission generation                 | Game module default sound library               | Sound generation (AudioGen, Stable Audio, local models)      |
| **Cutscenes**    | Pre-generated between missions (longer)                 | Text+portrait briefing, radar comm text overlay | Video generation (deferred optional `M11` — Sora class, Runway, local models) |

**Architecture:**

```rust
/// Trait for media generation providers. Same BYOLLM pattern as LlmProvider.
/// Each media type has its own trait — providers are specialized.
pub trait VoiceProvider: Send + Sync {
    /// Generate speech audio from text + voice profile.
    /// Returns audio data in a standard format (WAV/OGG).
    fn synthesize(
        &self,
        text: &str,
        voice_profile: &VoiceProfile,
        options: &VoiceSynthesisOptions,
    ) -> Result<AudioData>;
}

pub trait MusicProvider: Send + Sync {
    /// Generate a music track from mood/style description.
    /// Returns audio data in a standard format.
    fn generate_track(
        &self,
        description: &MusicPrompt,
        duration_secs: f32,
        options: &MusicGenerationOptions,
    ) -> Result<AudioData>;
}

pub trait SoundFxProvider: Send + Sync {
    /// Generate a sound effect from description.
    fn generate_sfx(
        &self,
        description: &str,
        duration_secs: f32,
    ) -> Result<AudioData>;
}

pub trait VideoProvider: Send + Sync {
    /// Generate a video clip from description + character portraits + context.
    fn generate_video(
        &self,
        description: &VideoPrompt,
        options: &VideoGenerationOptions,
    ) -> Result<VideoData>;
}

/// Voice profile for consistent character voices across a campaign.
/// Stored in campaign context alongside CharacterState.
pub struct VoiceProfile {
    /// Character name — links to campaign skeleton character.
    pub character_name: String,
    /// Voice description for the provider (text prompt).
    /// e.g., "Deep male voice, Russian accent, military authority, clipped speech."
    pub voice_description: String,
    /// Provider-specific voice ID (if using a cloned/preset voice).
    pub voice_id: Option<String>,
    /// Reference audio sample (if provider supports voice cloning from sample).
    pub reference_audio: Option<AudioData>,
}
```

**Voice consistency model:** The most critical challenge for campaign voice generation is consistency — the same character must sound the same across 24 missions. The `VoiceProfile` is created during campaign skeleton generation (Step 2) and persisted in `GenerativeCampaignContext`. The LLM generates the voice description from the character's personality profile (Principle #20 — a ISTJ commander sounds different from an ESTP commando). If the provider supports voice cloning from a sample, the system generates one calibration line during setup and uses that sample as the reference for all subsequent voice generation. If not, the text description must be consistent enough that the provider produces recognizably similar output.

**Music mood integration:** The generation pipeline already produces music playlists with mood tags (combat, tension, ambient, victory). When a `MusicProvider` is configured, the system can generate mission-specific tracks from these mood tags instead of selecting from existing libraries. The LLM adds mission-specific context to the music prompt: "Tense ambient track for a night infiltration mission in an Arctic setting, building to war drums when combat triggers fire." Generated tracks are cached in the campaign save — once created, they're standard audio files.

**Tier 2 — Pre-generated campaign (full media creation upfront):**

The more conservative mode. The player configures a generative campaign, clicks "Generate Campaign," and the system creates the entire campaign — all missions, all briefings, all media — before the first mission starts. This takes longer (minutes to hours depending on provider speed and campaign length) but produces a complete, polished campaign package.

This mode is also the **content creator workflow**: a modder or community member generates a campaign, reviews/edits it in the SDK (D038), replaces any weak AI-generated media with hand-crafted alternatives, and publishes the polished result to the Workshop. The AI-generated media is a *starting point*, not a final product.

| Advantage                      | Trade-off                                                           |
| ------------------------------ | ------------------------------------------------------------------- |
| Complete before play begins    | Long generation time (depends on provider)                          |
| All media reviewable in SDK    | Higher API cost (all media generated at once)                       |
| Publishable to Workshop as-is  | Less reactive to player choices (media pre-committed, not adaptive) |
| Can replace weak media by hand | Requires all providers configured upfront                           |

**Generation pipeline (extends Step 2 — Campaign Skeleton):**

After the campaign skeleton is generated, the media pipeline runs:

1. **Voice profiles** — create `VoiceProfile` for each named character. If voice cloning is supported, generate calibration samples.
2. **All mission briefings** — generate voice audio for every briefing text, every radar comm event, every intermission dialogue line.
3. **Mission music** — generate mood-appropriate tracks for each mission (or select from existing library + generate only gap-filling tracks).
4. **Mission-specific sound FX** — generate any custom sound effects referenced in mission scripts (ambient weather, unique weapon sounds, environmental audio).
5. **Cutscenes** (deferred optional `M11`) — generate video sequences for mission intros, mid-mission cinematics, campaign intro/outro.

Each step is independently skippable — a player might configure voice synthesis but skip music generation, using the game's built-in soundtrack. The campaign save tracks which media was generated vs. sourced from existing libraries.

**Tier 3 — SDK Asset Studio integration:**

This tier already exists architecturally (D040 § Layer 3 — Agentic Asset Generation) but currently covers only visual assets (sprites, palettes, terrain, chrome). The generative media pipeline extends the Asset Studio to cover audio and video:

| Capability              | Asset Studio Tool                                                                                 | Provider Trait    |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------- |
| **Voice acting**        | Record text → generate voice → preview on timeline → adjust pitch/speed → export .ogg/.wav        | `VoiceProvider`   |
| **EVA line generation** | Select EVA event type → generate authoritative voice → preview in-game → export to sound library  | `VoiceProvider`   |
| **Music composition**   | Describe mood/style → generate track → preview against gameplay footage → trim/fade → export .ogg | `MusicProvider`   |
| **Sound FX design**     | Describe effect → generate → preview → layer with existing FX → export .wav                       | `SoundFxProvider` |
| **Cutscene creation**   | Write script → generate video → preview in briefing player → edit → export .mp4/.webm             | `VideoProvider`   |
| **Voice pack creation** | Define character → generate all voice lines → organize → preview → publish as Workshop voice pack | `VoiceProvider`   |

This is the modder-facing tooling. A modder creating a total conversion can generate an entire voice pack for their custom EVA, unit voice lines for new unit types, ambient music that matches their mod's theme, and briefing videos — all within the SDK, using the same BYOLLM infrastructure.

**Crate boundaries:**

- **`ic-llm`** — implements all provider traits (`VoiceProvider`, `MusicProvider`, `SoundFxProvider`, `VideoProvider`). Routes to configured providers via D047 task routing. Handles API communication, format conversion, caching.
- **`ic-editor`** (SDK) — defines the provider traits (same pattern as `AssetGenerator`). Provides UI for media preview, editing, and export. Tier 3 tools live here.
- **`ic-game`** — wires providers at startup. In generative campaign mode, triggers Tier 1 generation during loading/intermission. Plays generated media through standard `ic-audio` and video playback systems.
- **`ic-audio`** — plays generated audio identically to pre-existing audio. No awareness of generation source.

**What the AI does NOT replace:**

- **Professional voice acting.** AI voice synthesis is serviceable for procedural content but cannot match a skilled human performance. Hand-crafted campaigns (D021) will always benefit from real voice actors. The AI-generated voice is a first draft, not a final product.
- **Composed music.** Frank Klepacki's Hell March was not generated by an algorithm. AI music fills gaps and provides variety; it doesn't replace composed soundtracks. The game module ships with a human-composed soundtrack; AI supplements it.
- **Quality judgment.** The modder/player decides if generated media meets their standards. The SDK shows it in context. The Workshop provides a distribution channel for polished results.

**D047 integration — task routing for media providers:**

The LLM Configuration Manager (D047) extends its task routing to include media generation tasks:

| Task                      | Provider Type     | Typical Routing                                      |
| ------------------------- | ----------------- | ---------------------------------------------------- |
| Mission Generation        | `LlmProvider`     | Cloud API (quality)                                  |
| Campaign Briefings        | `LlmProvider`     | Cloud API (quality)                                  |
| Voice Synthesis           | `VoiceProvider`   | ElevenLabs / Local TTS (quality vs. speed trade-off) |
| Music Generation          | `MusicProvider`   | Suno API / Local MusicGen                            |
| Sound FX Generation       | `SoundFxProvider` | AudioGen / Stable Audio                              |
| Video/Cutscene (deferred optional `M11`) | `VideoProvider`   | Cloud API (when mature)                              |
| Asset Generation (visual) | `AssetGenerator`  | DALL-E / Stable Diffusion / Local                    |
| AI Orchestrator           | `LlmProvider`     | Local Ollama (fast)                                  |
| Post-Match Coaching       | `LlmProvider`     | Local model (fast)                                   |

Each media provider type is independently configurable. A player might have voice synthesis (local Piper TTS — free, fast, lower quality) but no music generation. The system adapts: generated missions get voiced briefings but use the existing soundtrack.

**Phase:**

- **Phase 7:** Voice synthesis integration (`VoiceProvider` trait, ElevenLabs/Piper/XTTS providers, voice profile system, Tier 1 live generation, Tier 2 pre-generation, Tier 3 SDK voice tools). Voice is the highest-impact media type and the most mature AI capability.
- **Phase 7:** Music generation integration (`MusicProvider` trait, Suno/MusicGen providers, mood-to-prompt translation). Lower priority than voice — existing soundtrack provides good coverage.
- **Phase 7+:** Sound FX generation (`SoundFxProvider`). Useful but niche — game module sound libraries cover most needs.
- **Future:** Video/cutscene generation (`VideoProvider`). Depends on AI video technology maturity. The trait is defined now so the architecture is ready; implementation waits until quality meets the bar. The Asset Studio video pipeline (D040 — .mp4/.webm/.vqa conversion) provides the playback infrastructure.

> **Architectural note:** The design deliberately separates provider traits by media type rather than using a single unified `MediaProvider`. Voice, music, sound, and video providers have fundamentally different inputs, outputs, quality curves, and maturity timelines. A player may have excellent voice synthesis available but no music generation at all. Per-type traits and per-type D047 task routing enable this mix-and-match reality. The progressive enhancement principle ensures every combination works — from "no media providers" (text-only, existing assets) to "all providers configured" (fully generated multimedia campaigns).

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
│     │   └── Full sim snapshot + order history + campaign state  │
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

- **Mid-mission save:** Uses D010 — full sim snapshot. Both players receive the snapshot. Either player can host the resume session. The save file is a standard `.icsave` containing the sim snapshot, order history, and campaign state.
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

#### Extended Generative Campaign Modes

The three core generative modes — **Narrative** (fixed-length), **Open-Ended** (condition-driven), and **World Domination** (world map + LLM narrative director) — are the structural foundations. But the LLM's expressive range and IC's compositional architecture enable a much wider vocabulary of campaign experiences. Each mode below composes from existing systems (D021 branching, CharacterState, MBTI dynamics, battle reports, roster persistence, story flags, world map renderer, Workshop resources) — no new engine changes required.

These modes are drawn from the deepest wells of human storytelling: philosophy, cinema, literature, military history, game design, and the universal experiences that make stories resonate across cultures. The test for each: **does it make the toy soldiers come alive in a way no other mode does?**

---

**The Long March (Survival Exodus)**

*Inspired by: Battlestar Galactica, FTL: Faster Than Light, the Biblical Exodus, Xenophon's Anabasis, the real Long March, Oregon Trail, refugee crises throughout history.*

You're not conquering — you're surviving. Your army has been shattered, your homeland overrun. You must lead what remains of your people across hostile territory to safety. Every mission is a waypoint on a desperate journey. The world map shows your route — not territory you hold, but ground you must cross.

The LLM generates waypoint encounters: ambushes at river crossings, abandoned supply depots (trap or salvation?), hostile garrisons blocking mountain passes, civilian populations who might shelter you or sell you out. The defining tension is **resource scarcity** — you can't replace what you lose. A tank destroyed in mission 4 is gone forever. A hero killed at the third river crossing never reaches the promised land. Every engagement forces a calculation: fight (risk losses), sneak (risk detection), or negotiate (risk betrayal).

What makes this profoundly different from conquest modes: the emotional arc is inverted. In a normal campaign, the player grows stronger. Here, the player holds on. Victory isn't domination — it's survival. The LLM tracks the convoy's dwindling strength and generates missions that match: early missions are organized retreats with rear-guard actions; mid-campaign missions are desperate scavenging operations; late missions are harrowing last stands at chokepoints. The finale isn't assaulting the enemy capital — it's crossing the final border with whatever you have left.

Every unit that makes it to the end feels earned. A veteran tank that survived 20 missions of running battles, ambushes, and near-misses isn't just a unit — it's a story.

| Aspect        | Solo                                        | Multiplayer                                                                                                                            |
| ------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Structure** | One player leads the exodus                 | Co-op: each player commands part of the convoy. Split up to cover more ground (faster but weaker) or stay together (slower but safer). |
| **Tension**   | Resource triage — what do you leave behind? | Social triage — whose forces protect the rear guard? Who gets the last supply drop?                                                    |
| **Failure**   | Convoy destroyed or starved                 | One player's column is wiped out — the other must continue without their forces. Or go back for them.                                  |

---

**Cold War Espionage (The Intelligence Campaign)**

*Inspired by: John le Carré (The Spy Who Came in from the Cold, Tinker Tailor Soldier Spy), The Americans (TV), Bridge of Spies, Metal Gear Solid, the real Cold War intelligence apparatus.*

The war is fought with purpose. Every mission is a full RTS engagement — Extract→Build→Amass→Crush — but the *objectives* are intelligence-driven. You assault a fortified compound to extract a defecting scientist before the enemy can evacuate them. You defend a relay station for 15 minutes while your signals team intercepts a critical transmission. You raid a convoy to capture communications equipment that reveals the next enemy offensive. The LLM generates these intelligence-flavored objectives, but what the player actually *does* is build bases, train armies, and fight battles.

Between missions, the player manages an intelligence network in the intermission layer. The LLM generates a web of agents, double agents, handlers, and informants, each with MBTI-driven motivations that determine when they cooperate, when they lie, and when they defect. Each recruited agent has a loyalty score, a personality type, and a price. An ISFJ agent spies out of duty but breaks under moral pressure. An ENTP agent spies for the thrill but gets bored with routine operations. The LLM uses these personality models to simulate when an agent provides good intelligence, when they feed disinformation (intentionally or under duress), and when they get burned.

Intelligence gathered between missions shapes the next battle. Good intel reveals enemy base locations, unlocks alternative starting positions, weakens enemy forces through pre-mission sabotage, or provides reinforcement timelines. Bad intel — from burned agents or double agents feeding disinformation — sends the player into missions with false intelligence: the enemy base isn't where your agent said it was, the "lightly defended" outpost is a trap, the reinforcements that were supposed to arrive don't exist. The campaign's strategic metagame is information quality; the moment-to-moment gameplay is commanding armies.

The MBTI interaction system drives the intermission layer: every agent conversation is a negotiation, every character is potentially lying, and reading people's personalities correctly determines the quality of intel you bring into battle. Petrov (ISTJ) can be trusted because duty-bound types don't betray without extreme cause. Sonya (ENTJ) is useful but dangerous — her ambition makes her a powerful asset and an unpredictable risk. The LLM simulates these dynamics through dialogue that reveals (or conceals) character intentions based on their personality models.

| Aspect                | Solo                                                                    | Multiplayer                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Structure**         | RTS missions with intelligence-driven objectives; agent network between | Adversarial: two players run competing spy networks between missions. Better intel = battlefield advantage in the next engagement. |
| **Tension**           | Is your intel good — or did a burned agent just send you into a trap?   | Your best double agent might be feeding your opponent better intel than you. The battlefield reveals who was lied to.              |
| **Async multiplayer** | N/A                                                                     | Espionage metagame is inherently asynchronous. Plant an operation between missions, see the results on the next battlefield.       |

---

**The Defection (Two Wars in One)**

*Inspired by: The Americans, Metal Gear Solid 3: Snake Eater, Bridge of Spies, real Cold War defection stories (Oleg Gordievsky, Aldrich Ames), Star Wars: The Force Awakens (Finn's defection).*

Act 1: You fight for one side. You know your commanders. You trust (or distrust) your team. You fight the enemy as defined by your faction. Then something happens — an order you can't follow, a truth you can't ignore, an atrocity that changes everything. Act 2: You defect. Everything inverts. Your former allies hunt you with the tactics you taught them. Your new allies don't trust you. The characters you built relationships with in Act 1 react to your betrayal according to their MBTI types — the ISTJ commander feels personally betrayed, the ESTP commando grudgingly respects your courage, the ENTJ intelligence officer was expecting it and already has a contingency plan.

What makes this structurally unique: the same CharacterState instances exist in both acts, but their `allegiance` and `relationship_to_player` values flip. The LLM generates Act 2 dialogue where former friends reference specific events from Act 1 — "I trusted you at the bridge, Commander. I won't make that mistake again." The personality system ensures each character's reaction to the defection is psychologically consistent: some hunt you with rage, some with sorrow, some with professional detachment.

The defection trigger can be player-chosen (a moral crisis) or narrative-driven (you discover your faction's war crimes). The LLM builds toward it across Act 1 — uncomfortable orders, suspicious intelligence, moral gray areas — so it feels earned, not arbitrary. The `hidden_agenda` field and `loyalty` score track the player's growing doubts through story flags.

| Aspect             | Solo                                                                       | Multiplayer                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Structure**      | One player, two acts, two factions                                         | Co-op: both players defect, or one defects and the other doesn't — the campaign splits. Former co-op partners become enemies. |
| **Tension**        | Your knowledge of your old faction is your weapon — and your vulnerability | The betrayal is social, not just narrative. Your co-op partner didn't expect you to switch sides.                             |
| **Emotional core** | "Were we ever fighting for the right side?"                                | "Can I trust someone who's already betrayed one allegiance?"                                                                  |

---

**Nemesis (The Personal War)**

*Inspired by: Shadow of Mordor's Nemesis system, Captain Ahab and the white whale (Moby-Dick), Holmes/Moriarty, Batman/Joker, Heat (Mann), the primal human experience of rivalry.*

The entire campaign is structured around a single, escalating rivalry with an enemy commander who adapts, learns, remembers, and grows. The Nemesis isn't a scripted boss — they're a fully realized CharacterState with an MBTI personality, their own flaw/desire/fear triangle, and a relationship to the player that evolves based on actual battle outcomes.

The LLM reads every battle report and updates the Nemesis's behavior. Player loves tank rushes? The Nemesis develops anti-armor obsession — mines every approach, builds AT walls, taunts the player about predictability. Player won convincingly in mission 5? The Nemesis retreats to rebuild, and the LLM generates 2-3 missions of fragile peace before the Nemesis returns with a new strategy and a grudge. Player barely wins? The Nemesis respects the challenge and begins treating the war as a personal duel rather than a strategic campaign.

What separates this from the existing "Rival commander" pattern: the Nemesis IS the campaign. Not a subplot — the main plot. The arc follows the classical rivalry structure: introduction (missions 1-3), first confrontation (4-5), escalation (6-12), reversal (the Nemesis wins one — 13-14), obsession (15-18), and final reckoning (19-24). Both characters are changed by the end. The LLM generates the Nemesis's personal narrative — their own setbacks, alliances, and moral evolution — and delivers fragments through intercepted communications, captured intel, and enemy officer interrogations.

The deepest philosophical parallel: the Nemesis is a mirror. Their MBTI type is deliberately chosen as the player's faction's shadow — strategically complementary, personally incompatible. An INTJ strategic mastermind opposing the player's blunt-force army creates a "brains vs. brawn" struggle. An ENFP charismatic rebel opposing the player's disciplined advance creates "heart vs. machine." The LLM makes the Nemesis compelling enough that defeating them feels bittersweet.

| Aspect         | Solo                                                                                                                | Multiplayer                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Structure**  | Player vs. LLM-driven Nemesis                                                                                       | Symmetric: each player IS the other's Nemesis. Your victories write their villain's story. |
| **Adaptation** | The Nemesis learns from your battle reports                                                                         | Both players adapt simultaneously — a genuine arms race with narrative weight.             |
| **Climax**     | Final confrontation after 20+ missions of escalation                                                                | The players meet in a final battle that their entire campaign has been building toward.    |
| **Export**     | After finishing, export your Nemesis as a Workshop character — other players face the villain YOUR campaign created | Post-campaign, challenge a friend: "Can you beat the commander who almost beat me?"        |

---

**Moral Complexity Parameter (Tactical Dilemmas)**

*Inspired by: Spec Ops: The Line (tonal caution), Papers Please (systemic moral choices), the trolley problem (Philippa Foot), Walzer's "Just and Unjust Wars," the enduring human interest in difficult decisions under pressure.*

Moral complexity is not a standalone campaign mode — it's a **parameter available on any generative campaign mode**. It controls how often the LLM generates tactical dilemmas with no clean answer, and how much character personality drives the fallout. Three levels:

- **Low** (default): Straightforward tactical choices. The mission has a clear objective; characters react to victory and defeat but not to moral ambiguity. Standard C&C fare — good guys, bad guys, blow stuff up.
- **Medium**: Tactical trade-offs with character consequences. Occasional missions present two valid approaches with different costs. Destroy the bridge to cut off enemy reinforcements, or leave it intact so civilians can evacuate? The choice affects the next mission's conditions AND how your MBTI-typed commanders view your leadership. No wrong answer — but each choice shifts character loyalty.
- **High**: Genuine moral weight with long-tail consequences. The LLM generates dilemmas where both options have defensible logic and painful costs. Tactical, not gratuitous — these stay within the toy-soldier abstraction of C&C:
  - A fortified enemy position is using a civilian structure as cover. Shelling it ends the siege quickly but your ISFJ field commander loses respect for your methods. Flanking costs time and units but preserves your team's trust.
  - You've intercepted intelligence that an enemy officer wants to defect — but extracting them requires diverting forces from a critical defensive position. Commit to the extraction (gain a valuable asset, risk the defense) or hold the line (lose the defector, secure the front).
  - Two allied positions are under simultaneous attack. You can only reinforce one in time. The LLM ensures both positions have named characters the player has built relationships with. Whoever you don't reinforce takes heavy casualties — and remembers.

The LLM tracks choices in campaign story flags and generates **long-tail consequences**. A choice from mission 3 might resurface in mission 15 — the officer you extracted becomes a critical ally, or the position you didn't reinforce never fully trusts your judgment again. Characters react according to their MBTI type: TJ types evaluate consequences; FP types evaluate intent; SJ types evaluate duty; NP types evaluate principle. Loyalty shifts based on personality-consistent moral frameworks, not a universal morality scale.

At **High** in co-op campaigns, both players must agree on dilemma choices — creating genuine social negotiation. "Do we divert for the extraction or hold the line?" becomes a real conversation between real people with different strategic instincts.

This parameter composes with every mode: a Nemesis campaign at High moral complexity generates dilemmas where the Nemesis exploits the player's past choices. A Generational Saga at High carries moral consequences across generations — Generation 3 lives with Generation 1's trade-offs. A Mystery campaign at Medium lets the traitor steer the player toward choices that look reasonable but serve enemy interests.

---

**Generational Saga (The Hundred-Year War)**

*Inspired by: Crusader Kings (Paradox), Foundation (Asimov), Dune (Herbert), The Godfather trilogy, Fire Emblem (permadeath + inheritance), the lived experience of generational trauma and inherited conflict.*

The war spans three generations. Each generation is ~8 missions. Characters age, retire, die of old age or in combat. Young lieutenants from Generation 1 are old generals in Generation 3. The decisions of grandparents shape the world their grandchildren inherit.

Generation 1 establishes the conflict. The player's commanders are young, idealistic, sometimes reckless. Their victories and failures set the starting conditions for everything that follows. The LLM generates the world state that Generation 2 inherits: borders drawn by Generation 1's campaigns, alliances forged by their diplomacy, grudges created by their atrocities, technology unlocked by their captured facilities.

Generation 2 lives in their predecessors' shadow. The LLM generates characters who are the children or proteges of Generation 1's heroes — with inherited MBTIs modified by upbringing. A legendary commander's daughter might be an ENTJ like her father... or an INFP who rejects everything he stood for. The Nemesis from Generation 1 might be dead, but their successor inherited their grudge and their tactical files. "Your father destroyed my father's army at Stalingrad. I've spent 20 years studying how."

Generation 3 brings resolution. The war's original cause may be forgotten — the LLM tracks how meaning shifts across generations. What started as liberation becomes occupation becomes tradition becomes identity. The final generation must either find peace or perpetuate a war that nobody remembers starting. The LLM generates characters who question why they're fighting — and the MBTI system determines who accepts "it's always been this way" (SJ types) and who demands "but why?" (NP types).

Cross-campaign hero persistence (Legacy mode) provides the technical infrastructure. CharacterState serializes between generations. Veterancy, notable events, and relationship history persist in the save. The LLM writes Generation 3's dialogue with explicit callbacks to Generation 1's battles — events the *player* remembers but the *characters* only know as stories.

| Aspect         | Solo                                                                      | Multiplayer                                                                                                            |
| -------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Structure**  | One player, three eras, one evolving war                                  | Two dynasties: each player leads a family across three generations. Your grandfather's enemy's grandson is your rival. |
| **Investment** | Watching characters age and pass the torch                                | Shared 20+ year fictional history between two real players                                                             |
| **Climax**     | Generation 3 resolves (or doesn't) the conflict that Generation 1 started | The final generation can negotiate peace — or realize they've become exactly what Generation 1 fought against          |

---

**Parallel Timelines (The Chronosphere Fracture)**

*Inspired by: Sliding Doors (film), Everything Everywhere All at Once, Bioshock Infinite, the Many-Worlds interpretation of quantum mechanics, the universal human experience of "what if I'd chosen differently?"*

This mode is uniquely suited to Red Alert's lore — the Chronosphere is literally a time machine. A Chronosphere malfunction fractures reality into two parallel timelines diverging from a single critical decision. The player alternates missions between Timeline A (where they made one choice) and Timeline B (where they made the opposite).

The LLM generates both timelines from the same campaign skeleton but with diverging consequences. In Timeline A, you destroyed the bridge — the enemy can't advance, but your reinforcements can't reach you either. In Timeline B, you saved the bridge — the enemy pours across, but so do your reserves. The same characters exist in both timelines but develop differently based on divergent circumstances. Sonya (ENTJ) in Timeline A seizes power during the chaos; Sonya in Timeline B remains loyal because the bridge gave her the resources she needed. Same personality, different circumstances, different trajectory — the MBTI system ensures both versions are psychologically plausible.

The player experiences both consequences simultaneously. Every 2 missions, the timeline switches. The LLM generates narrative parallels and contrasts — events that rhyme across timelines. Mission 6A is a desperate defense; Mission 6B is an easy victory. But the easy victory in B created a complacency that sets up a devastating ambush in 8B, while the desperate defense in A forged a harder, warier force that handles 8A better. The timelines teach different lessons.

The climax: the timelines threaten to collapse into each other (Chronosphere overload). The player must choose which timeline becomes "real" — with full knowledge of what they're giving up. Or, in the boldest variant, the two timelines collide and the player must fight their way through a reality-fractured final mission where enemies and allies from both timelines coexist.

| Aspect        | Solo                                                  | Multiplayer                                                                                                                        |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Structure** | One player alternates between two timelines           | Each player IS a timeline. They can't communicate directly — but their timelines leak into each other (Chronosphere interference). |
| **Tension**   | "Which timeline do I want to keep?"                   | "My partner's timeline is falling apart because of a choice I made in mine"                                                        |
| **Lore fit**  | The Chronosphere is already RA's signature technology | Chronosphere multiplayer events: one player's Chronosphere experiment affects the other's battlefield                              |

---

**The Mystery (Whodunit at War)**

*Inspired by: Agatha Christie, The Thing (Carpenter), Among Us, Clue, Knives Out, the universal human fascination with deduction and betrayal.*

Someone in your own command structure is sabotaging operations. Missions keep going wrong in ways that can't be explained by bad luck — the enemy always knows your plans, supply convoys vanish, key systems fail at critical moments. The campaign is simultaneously a military campaign and a murder mystery. The player must figure out which of their named characters is the traitor — while still winning a war.

The LLM randomly selects the traitor at campaign start from the named cast and plays that character's MBTI type *as if they were loyal* — because a good traitor acts normal. But the LLM plants clues in mission outcomes and character behavior. An ISFJ traitor might "accidentally" route supplies to the wrong location (duty-driven guilt creates mistakes). An ENTJ traitor might push too hard for a specific strategic decision that happens to benefit the enemy (ambition overrides subtlety). An ESTP traitor makes bold, impulsive moves that look like heroism but create exploitable vulnerabilities.

The player gathers evidence through mission outcomes, character dialogue inconsistencies, and optional investigation objectives (hack a communications relay, interrogate a captured enemy, search a character's quarters). At various points the campaign offers "accuse" branching — name the traitor and take action. Accuse correctly → the conspiracy unravels and the campaign pivots to hunting the traitor's handlers. Accuse incorrectly → you've just purged a loyal officer, damaged morale, and the real traitor is still operating. The LLM generates the fallout either way.

What makes this work with MBTI: each character type hides guilt differently, leaks information differently, and responds to suspicion differently. The LLM generates behavioral tells that are personality-consistent — learnable but not obvious. Repeat playthroughs with the same characters but a different traitor create genuinely different mystery experiences because the deception patterns change with the traitor's personality type.

**Marination — trust before betrayal:** The LLM follows a deliberate escalation curve inspired by Among Us's best impostors. The traitor character performs *exceptionally well* in early missions — perhaps saving the player from a tough situation, providing critical intelligence, or volunteering for dangerous assignments. The first 30–40% of the campaign builds genuine trust. Clues begin appearing only after the player has formed a real attachment to every character (including the traitor). In co-op Traitor mode, divergent objectives start trivially small — capture a minor building that barely affects the mission outcome — and escalate gradually as the campaign progresses. This ensures the eventual reveal feels earned rather than random, and the player's "I trusted you" reaction has genuine emotional weight.

| Aspect        | Solo                                                  | Multiplayer                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Structure** | Player deduces the traitor from clues across missions | Co-op with explicit opt-in "Traitor" party mode: one player receives secret *divergent* objectives from the LLM (capture instead of destroy, let a specific unit escape, secure a specific building). Not sabotage — different priorities. |
| **Tension**   | "Which of my commanders is lying to me?"              | "Is my co-op partner pursuing a different objective, or are we playing the same mission?" Subtle divergence, not griefing.                                                                                                                 |
| **Climax**    | The accusation — right or wrong, the campaign changes | The reveal — when divergent objectives surface, the campaign's entire history is recontextualized. Both players were playing their own version of the war.                                                                                 |

**Verifiable actions (trust economy):** In co-op Traitor mode, the system tracks **verifiable actions** — things that both players can confirm through shared battlefield data. "I defended the northern flank solo for 8 minutes" is system-confirmable from the replay. "I captured objective Alpha as requested" appears in the shared mission summary. A player building trust spends time on verifiable actions visible to their partner — but this diverts from optimal play or from pursuing secret divergent objectives. The traitor faces a genuine strategic choice: build trust through verifiable actions (slower divergent progress, safer cover) or pursue secret objectives aggressively (faster but riskier if the partner is watching closely). This creates an Among Us-style "visual tasks" dynamic where proving innocence has a real cost.

**Intelligence review (structured suspicion moments):** In co-op Mystery campaigns, each intermission functions as an **intelligence review** — a structured moment where both players see a summary of mission outcomes and the LLM surfaces anomalies. "Objective Alpha was captured instead of destroyed — consistent with enemy priorities." "Forces were diverted from Sector 7 during the final push — 12% efficiency loss." The system generates this data automatically from divergent-objective tracking and presents it neutrally. Players discuss before the next mission — creating a natural accusation-or-trust moment without pausing gameplay. This mirrors Among Us's emergency meeting mechanic: action stops, evidence is reviewed, and players must decide whether to confront suspicion or move on.

**Asymmetric briefings (information asymmetry in all co-op modes):** Beyond Mystery, ALL co-op campaign modes benefit from a lesson Among Us teaches about information asymmetry: **each player's pre-mission briefing should include information the other player doesn't have**. Player A's intelligence report mentions an enemy weapons cache in the southeast; Player B's report warns of reinforcements arriving from the north. Neither briefing is wrong — they're simply incomplete. This creates natural "wait, what did YOUR briefing say?" conversations that build cooperative engagement. In Mystery co-op, asymmetric briefings also provide cover for the traitor's divergent objectives — they can claim "my briefing said to capture that building" and the other player can't immediately verify it. The LLM generates briefing splits based on each player's assigned intelligence network and agent roster.

---

#### Solo–Multiplayer Bridges

The modes above work as standalone solo or multiplayer experiences. But the most interesting innovation is allowing **ideas to cross between solo and multiplayer** — things you create alone become part of someone else's experience, and vice versa. These bridges emerge naturally from IC's existing architecture (CharacterState serialization, Workshop sharing, D042 player behavioral profiles, campaign save portability):

**Nemesis Export:** Complete a Nemesis campaign. Your nemesis — their MBTI personality, their adapted tactics (learned from your battle reports), their grudge, their dialogue patterns — serializes to a Workshop-sharable character file. Another player imports your nemesis into their own campaign. Now they're fighting a villain that was forged by YOUR gameplay. The nemesis "remembers" their history and references it: "The last commander who tried that tactic... I made them regret it." Community-curated nemesis libraries let players challenge themselves against the most compelling villain characters the community has generated.

**Ghost Operations (Asynchronous Competition):** A solo player completes a campaign. Their campaign save — including every tactical decision, unit composition, timing, and outcome — becomes a "ghost." Another player plays the same campaign seed but races against the ghost's performance. Not a replay — a parallel run. The ghost's per-mission results appear as benchmark data: "The ghost completed this mission in 12 minutes with 3 casualties. Can you do better?" This transforms solo campaigns into asynchronous races. Weekly challenges already use fixed seeds; ghost operations extend this to full campaigns.

**War Dispatches (Narrative Fragments):** A solo player's campaign generates "dispatches" — short, LLM-written narrative summaries of key campaign moments, formatted as fictional news reports, radio intercepts, or intelligence briefings. These dispatches are shareable. Other players can subscribe to a friend's campaign dispatches — following their war as a serialized story. A dispatch might say: "Reports confirm the destruction of the 3rd Allied Armored Division at the Rhine crossing. Soviet commander [player name] is advancing unchecked." The reader sees the story; the player lived it.

**Community Front Lines (Persistent World):** Every solo player's World Domination campaign contributes to a shared community war map. Your victories advance your faction's front lines; your defeats push them back. Weekly aggregation: the community's collective Solo campaigns determine the global state. Weekly community briefings (LLM-generated from aggregate data) report on the state of the war. "The Allied front in Northern Europe has collapsed after 847 Soviet campaign victories this week. The community's attention shifts to the Pacific theater." This doesn't affect individual campaigns — it's a metagame visualization. But it creates the feeling that your solo campaign matters to something larger.

**Tactical DNA (D042 Profile as Challenge):** Complete a campaign. Your D042 player behavioral profile — which tracks your strategic tendencies, unit preferences, micro patterns — exports as a "tactical DNA" file. An AI opponent can load your tactical DNA and play *as you*. Another player can challenge your tactical DNA: "Can you beat the AI version of Copilot? They love air rushes, never build naval, and always go for the tech tree." This creates asymmetric AI opponents that are genuinely personal — not generic difficulty levels, but specific human-like play patterns. Community members share and compete against each other's tactical DNA in skirmish mode.

---

All extended modes produce standard D021 campaigns. All are playable without an LLM once generated. All are saveable, shareable via Workshop, editable in the Campaign Editor, and replayable. The LLM provides the creative act; the engine provides the infrastructure. Modders can create new modes by combining the same building blocks differently — the modes above are a curated library, not an exhaustive list.

> **See also D057 (Skill Library):** Proven mission generation patterns — which scene template combinations, parameter values, and narrative structures produce highly-rated missions — are stored in the skill library and retrieved as few-shot examples for future generation. This makes D016's template-filling approach more reliable over time without changing the generation architecture.

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

