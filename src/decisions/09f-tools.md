# Decision Log — Tools & Editor

LLM mission generation, scenario editor, asset studio, LLM configuration, foreign replays, and skill library.

---

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

AI-generated media — voice synthesis, music generation, sound effect creation, and eventually video/cutscene generation — is advancing rapidly. By the time IC reaches Phase 7, production-quality AI voice synthesis will be mature (it largely is already in 2025–2026), AI music generation is approaching usable quality, and AI video is on a clear trajectory. The generative media pipeline prepares for this without creating obstacles for a media-free fallback.

**Core design principle: every generative media feature is a progressive enhancement.** A generative campaign plays identically with or without media generation. Text briefings work. Music from the existing library works. Silent radar comms with text work. When AI media providers are available, they *enhance* the experience — voiced briefings, custom music, generated sound effects — but nothing *depends* on them.

**Three tiers of generative media (from most ambitious to most conservative):**

**Tier 1 — Live generation during generative campaigns:**

The most ambitious mode. The player is playing a generative campaign. Between missions, during the loading/intermission screen, the system generates media for the next mission in real-time. The player reads the text briefing while voice synthesis runs in the background; when ready, the briefing replays with voice. If voice generation isn't finished in time, the text-only version is already playing — no delay.

| Media Type       | Generation Window                                       | Fallback (if not ready or unavailable)          | Provider Class                                               |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| **Voice lines**  | Loading screen / intermission (~15–30s)                 | Text-only briefing, text bubble radar comms     | Voice synthesis (ElevenLabs, local TTS, XTTS, Bark, Piper)   |
| **Music tracks** | Pre-generated during campaign setup or between missions | Existing game module soundtrack, Workshop packs | Music generation (Suno, Udio, MusicGen, local models)        |
| **Sound FX**     | Pre-generated during mission generation                 | Game module default sound library               | Sound generation (AudioGen, Stable Audio, local models)      |
| **Cutscenes**    | Pre-generated between missions (longer)                 | Text+portrait briefing, radar comm text overlay | Video generation (future — Sora class, Runway, local models) |

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
5. **Cutscenes** (future) — generate video sequences for mission intros, mid-mission cinematics, campaign intro/outro.

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
| Video/Cutscene (future)   | `VideoProvider`   | Cloud API (when mature)                              |
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

---

---

## D038 — Scenario Editor (OFP/Eden-Inspired, SDK)

**Resolves:** P005 (Map editor architecture)

**Decision:** Visual scenario editor — not just a map/terrain painter, but a full mission authoring tool inspired by Operation Flashpoint's mission editor (2001) and Arma 3's Eden Editor (2016). Ships as part of the **IC SDK** (separate application from the game — see D040 § SDK Architecture). Live isometric preview via shared Bevy crates. Combines terrain editing (tiles, resources, cliffs) with scenario logic editing (unit placement, triggers, waypoints, modules). Two complexity tiers: Simple mode (accessible) and Advanced mode (full power).

**Rationale:**

The OFP mission editor is one of the most successful content creation tools in gaming history. It shipped with a $40 game in 2001 and generated thousands of community missions across 15 years — despite having no undo button. Its success came from three principles:

1. **Accessibility through layered complexity.** Easy mode hides advanced fields. A beginner places units and waypoints in minutes. An advanced user adds triggers, conditions, probability of presence, and scripting. Same data, different UI.
2. **Emergent behavior from simple building blocks.** Guard + Guarded By creates dynamic multi-group defense behavior from pure placement — zero scripting. Synchronization lines coordinate multi-group operations. Triggers with countdown/timeout timers and min/mid/max randomization create unpredictable encounters.
3. **Instant preview collapses the edit→test loop.** Place things on the actual map, hit "Test" to launch the game with your scenario loaded. Hot-reload keeps the loop tight — edit in the SDK, changes appear in the running game within seconds.

Eden Editor (2016) evolved these principles: 3D placement, undo/redo, 154 pre-built modules (complex logic as drag-and-drop nodes), compositions (reusable prefabs), layers (organizational folders), and Steam Workshop publishing directly from the editor. Arma Reforger (2022) added budget systems, behavior trees for waypoints, controller support, and a real-time Game Master mode.

**Iron Curtain applies these lessons to the RTS genre.** An RTS scenario editor has different needs than a military sim — isometric view instead of first-person, base-building and resource placement instead of terrain sculpting, wave-based encounters instead of patrol routes. But the underlying principles are identical: layered complexity, emergent behavior from simple rules, and zero barrier between editing and playing.

### Architecture

The scenario editor lives in the `ic-editor` crate and ships as part of the **IC SDK** — a separate Bevy application from the game (see D040 § SDK Architecture for the full separation rationale). It reuses the game's rendering and simulation crates: `ic-render` (isometric viewport), `ic-sim` (preview playback), `ic-ui` (shared UI components like panels and attribute editors), and `ic-protocol` (order types for preview). `ic-game` does NOT depend on `ic-editor` — the game binary has zero editor code. The SDK binary (`ic-sdk`) bundles the scenario editor, asset studio (D040), campaign editor, and Game Master mode in a single application with a tab-based workspace.

**Test/preview communication:** When the user hits "Test," the SDK serializes the current scenario and launches `ic-game` with it loaded, using a `LocalNetwork` (from `ic-net`). The game runs the scenario identically to normal gameplay — the sim never knows it was launched from the SDK. For quick in-SDK preview (without launching the full game), the SDK can also run `ic-sim` internally with a lightweight preview viewport. Editor-generated inputs (e.g., placing a debug unit mid-preview) are submitted as `PlayerOrder`s through `ic-protocol`. The hot-reload bridge watches for file changes and pushes updates to the running game test session.

```
┌─────────────────────────────────────────────────┐
│                 Scenario Editor                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Terrain  │  │  Entity   │  │   Logic       │ │
│  │  Painter  │  │  Placer   │  │   Editor      │ │
│  │           │  │           │  │               │ │
│  │ tiles     │  │ units     │  │ triggers      │ │
│  │ resources │  │ buildings │  │ waypoints     │ │
│  │ cliffs    │  │ props     │  │ modules       │ │
│  │ water     │  │ markers   │  │ regions       │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │            Attributes Panel               │   │
│  │  Per-entity properties (GUI, not code)    │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Layers  │  │ Comps    │  │ Preview/Test │   │
│  │ Panel   │  │ Library  │  │ Button       │   │
│  └─────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Script  │  │ Vars     │  │ Complexity   │   │
│  │ Editor  │  │ Panel    │  │ Meter        │   │
│  └─────────┘  └──────────┘  └──────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Campaign Editor                 │   │
│  │  Graph · State · Intermissions · Dialogue │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Crate: ic-editor                                │
│  Uses:  ic-render (isometric view)               │
│         ic-sim   (preview playback)              │
│         ic-ui    (shared panels, attributes)     │
└─────────────────────────────────────────────────┘
```

### Editing Modes

| Mode            | Purpose                                                               | OFP Equivalent                         |
| --------------- | --------------------------------------------------------------------- | -------------------------------------- |
| **Terrain**     | Paint tiles, place resources (ore/gems), sculpt cliffs, water         | N/A (OFP had fixed terrains)           |
| **Entities**    | Place units, buildings, props, markers                                | F1 (Units) + F6 (Markers)              |
| **Groups**      | Organize units into squads/formations, set group behavior             | F2 (Groups)                            |
| **Triggers**    | Place area-based conditional logic (win/lose, events, spawns)         | F3 (Triggers)                          |
| **Waypoints**   | Assign movement/behavior orders to groups                             | F4 (Waypoints)                         |
| **Connections** | Link triggers ↔ waypoints ↔ modules visually                          | F5 (Synchronization)                   |
| **Modules**     | Pre-packaged game logic nodes                                         | F7 (Modules)                           |
| **Regions**     | Draw named spatial zones reusable across triggers and scripts         | N/A (AoE2/StarCraft concept)           |
| **Scripts**     | Browse and edit external `.lua` files referenced by inline scripts    | OFP mission folder `.sqs`/`.sqf` files |
| **Campaign**    | Visual campaign graph — mission ordering, branching, persistent state | N/A (no RTS editor has this)           |

### Entity Palette UX

The Entities mode panel provides the primary browse/select interface for all placeable objects. Inspired by Garry's Mod's spawn menu (`Q` menu) — the gold standard for navigating massive asset libraries — the palette includes:

- **Search-as-you-type** across all entities (units, structures, props, modules, compositions) — filters the tree in real time
- **Favorites list** — star frequently-used items; persisted per-user in SQLite (D034). A dedicated Favorites tab at the top of the palette
- **Recently placed** — shows the last 20 entities placed this session, most recent first. One click to re-select
- **Per-category browsing** with collapsible subcategories (faction → unit type → specific unit). Categories are game-module-defined via YAML
- **Thumbnail previews** — small sprite/icon preview next to each entry. Hovering shows a larger preview with stats summary

The same palette UX applies to the Compositions Library panel, the Module selector, and the Trigger type picker — search/favorites/recents are universal navigation patterns across all editor panels.

### Entity Attributes Panel

Every placed entity has a GUI properties panel (no code required). This replaces OFP's "Init" field for most use cases while keeping advanced scripting available.

**Unit attributes (example):**

| Attribute                   | Type              | Description                                |
| --------------------------- | ----------------- | ------------------------------------------ |
| **Type**                    | dropdown          | Unit class (filtered by faction)           |
| **Name**                    | text              | Variable name for Lua scripting            |
| **Faction**                 | dropdown          | Owner: Player 1–8, Neutral, Creeps         |
| **Facing**                  | slider 0–360      | Starting direction                         |
| **Stance**                  | enum              | Guard / Patrol / Hold / Aggressive         |
| **Health**                  | slider 0–100%     | Starting hit points                        |
| **Veterancy**               | enum              | None / Rookie / Veteran / Elite            |
| **Probability of Presence** | slider 0–100%     | Random chance to exist at mission start    |
| **Condition of Presence**   | expression        | Lua boolean (e.g., `difficulty >= "hard"`) |
| **Placement Radius**        | slider 0–10 cells | Random starting position within radius     |
| **Init Script**             | text (multi-line) | Inline Lua — the primary scripting surface |

**Probability of Presence** is the single most important replayability feature from OFP. Every entity — units, buildings, resource patches, props — can have a percentage chance of existing when the mission loads. Combined with Condition of Presence, this creates two-factor randomization: "50% chance this tank platoon spawns, but only on Hard difficulty." A player replaying the same mission encounters different enemy compositions each time. This is trivially deterministic — the mission seed determines all rolls.

### Named Regions

Inspired by Age of Empires II's trigger areas and StarCraft's "locations" — both independently proved that named spatial zones are how non-programmers think about RTS mission logic. A **region** is a named area on the map (rectangle or ellipse) that can be referenced by name across multiple triggers, modules, and scripts.

Regions are NOT triggers — they have no logic of their own. They are spatial labels. A region named `bridge_crossing` can be referenced by:
- Trigger 1: "IF Player 1 faction present in `bridge_crossing` → activate reinforcements"
- Trigger 2: "IF `bridge_crossing` has no enemies → play victory audio"
- Lua script: `Region.unit_count("bridge_crossing", faction.allied) >= 5`
- Module: Wave Spawner configured to spawn at `bridge_crossing`

This separation prevents the common RTS editor mistake of coupling spatial areas to individual triggers. In AoE2, if three triggers need to reference the same map area, you create three identical areas. In IC, you create one region and reference it three times.

**Region attributes:**

| Attribute   | Type               | Description                                           |
| ----------- | ------------------ | ----------------------------------------------------- |
| **Name**    | text               | Unique identifier (e.g., `enemy_base`, `ambush_zone`) |
| **Shape**   | rect / ellipse     | Cell-aligned or free-form                             |
| **Color**   | color picker       | Editor visualization color (not visible in-game)      |
| **Tags**    | text[]             | Optional categorization for search/filter             |
| **Z-layer** | ground / air / any | Which unit layers the region applies to               |

### Inline Scripting (OFP-Style)

OFP's most powerful feature was also its simplest: double-click a unit, type a line of SQF in the Init field, done. No separate IDE, no file management, no project setup. The scripting lived *on the entity*. For anything complex, the Init field called an external script file — one line bridges the gap between visual editing and full programming.

IC follows the same model with Lua. The **Init Script** field on every entity is the primary scripting surface — not a secondary afterthought.

**Inline scripting examples:**

```lua
-- Simple: one-liner directly on the entity
this:set_stance("hold")

-- Medium: a few lines of inline behavior
this:set_patrol_route("north_road")
this:on_damaged(function() Var.set("alarm_triggered", true) end)

-- Complex: inline calls an external script file
dofile("scripts/elite_guard.lua")(this)

-- OFP equivalent of `nul = [this] execVM "patrol.sqf"`
run_script("scripts/convoy_escort.lua", { unit = this, route = "highway" })
```

This is exactly how OFP worked: most units have no Init script at all (pure visual placement). Some have one-liners. A few call external files for complex behavior. The progression is organic — a designer starts with visual placement, realizes they need a small tweak, types a line, and naturally graduates to scripting when they're ready. No mode switch, no separate tool.

**Inline scripts run at entity spawn time** — when the mission loads (or when the entity is dynamically spawned by a trigger/module). The `this` variable refers to the entity the script is attached to.

**Triggers and modules also have inline script fields:**
- Trigger **On Activation**: inline Lua that runs when the trigger fires
- Trigger **On Deactivation**: inline Lua for repeatable triggers
- Module **Custom Logic**: override or extend a module's default behavior

Every inline script field has:
- **Syntax highlighting** for Lua with IC API keywords
- **Autocompletion** for entity names, region names, variables, and the IC Lua API (D024)
- **Error markers** shown inline before preview (not in a crash log)
- **Expand button** — opens the field in a larger editing pane for multi-line scripts without leaving the entity's properties panel

### Script Files Panel

When inline scripts call external files (`dofile("scripts/ambush.lua")`), those files need to live somewhere. The **Script Files Panel** manages them — it's the editor for the external script files that inline scripts reference.

This is the same progression OFP used: Init field → `execVM "script.sqf"` → the .sqf file lives in the mission folder. IC keeps the external files *inside the editor* rather than requiring alt-tab to a text editor.

**Script Files Panel features:**
- **File browser** — lists all `.lua` files in the mission
- **New file** — create a script file, it's immediately available to inline `dofile()` calls
- **Syntax highlighting** and **autocompletion** (same as inline fields)
- **Live reload** — edit a script file during preview, save, changes take effect next tick
- **API reference sidebar** — searchable IC Lua API docs without leaving the editor
- **Breakpoints and watch** (Advanced mode) — pause the sim on a breakpoint, inspect variables

**Script scope hierarchy (mirrors the natural progression):**
```
Inline init scripts  — on entities, run at spawn (the starting point)
Inline trigger scripts — on triggers, run on activation/deactivation
External script files  — called by inline scripts for complex logic
Mission init script    — special file that runs once at mission start
```

The tiered model: most users never write a script. Some write one-liners on entities. A few create external files. The progression is seamless — there's no cliff between "visual editing" and "programming," just a gentle slope that starts with `this:set_stance("hold")`.

### Variables Panel

AoE2 scenario designers used invisible units placed off-screen as makeshift variables. StarCraft modders abused the "deaths" counter as integer storage. Both are hacks because the editors lacked native state management.

IC provides a **Variables Panel** — mission-wide state visible and editable in the GUI. Triggers and modules can read/write variables without Lua.

| Variable Type | Example                     | Use Case                             |
| ------------- | --------------------------- | ------------------------------------ |
| **Switch**    | `bridge_destroyed` (on/off) | Boolean flags for trigger conditions |
| **Counter**   | `waves_survived` (integer)  | Counting events, tracking progress   |
| **Timer**     | `mission_clock` (ticks)     | Elapsed time tracking                |
| **Text**      | `player_callsign` (string)  | Dynamic text for briefings/dialogue  |

**Variable operations in triggers (no Lua required):**
- Set variable, increment/decrement counter, toggle switch
- Condition: "IF `waves_survived` >= 5 → trigger victory"
- Module connection: Wave Spawner increments `waves_survived` after each wave

Variables are visible in the Variables Panel, named by the designer, and referenced by name everywhere. Lua scripts access them via `Var.get("waves_survived")` / `Var.set("waves_survived", 5)`. All variables are deterministic sim state (included in snapshots and replays).

### Scenario Complexity Meter

Inspired by TimeSplitters' memory bar — a persistent, always-visible indicator of scenario complexity and estimated performance impact.

```
┌──────────────────────────────────────────────┐
│  Complexity: ████████████░░░░░░░░  58%       │
│  Entities: 247/500  Triggers: 34/200         │
│  Scripts: 3 files   Regions: 12              │
└──────────────────────────────────────────────┘
```

The meter reflects:
- **Entity count** vs recommended maximum (per target platform)
- **Trigger count** and nesting depth
- **Script complexity** (line count, hook count)
- **Estimated tick cost** — based on entity types and AI behaviors

The meter is a **guideline, not a hard limit**. Exceeding 100% shows a warning ("This scenario may perform poorly on lower-end hardware") but doesn't prevent saving or publishing. Power users can push past it; casual creators stay within safe bounds without thinking about performance.

### Trigger Organization

The AoE2 Scenario Editor's trigger list collapses into an unmanageable wall at 200+ triggers — no folders, no search, no visual overview. IC prevents this from day one:

- **Folders** — group triggers by purpose ("Phase 1", "Enemy AI", "Cinematics", "Victory Conditions")
- **Search / Filter** — find triggers by name, condition type, connected entity, or variable reference
- **Color coding** — triggers inherit their folder's color for visual scanning
- **Flow graph view** — toggle between list view and a visual node graph showing trigger chains, connections to modules, and variable flow. Read-only visualization, not a node-based editor (that's the "Alternatives Considered" item). Lets designers see the big picture of complex mission logic without reading every trigger.
- **Collapse / expand** — folders collapse to single lines; individual triggers collapse to show only name + condition summary

### Undo / Redo

OFP's editor shipped without undo. Eden added it 15 years later. IC ships with full undo/redo from day one.

- **Unlimited undo stack** (bounded by memory, not count)
- Covers all operations: entity placement/deletion/move, trigger edits, terrain painting, variable changes, layer operations
- **Redo** restores undone actions until a new action branches the history
- Undo history survives save/load within a session
- **Ctrl+Z / Ctrl+Y** (desktop), equivalent bindings on controller

### Autosave & Crash Recovery

OFP's editor had no undo and no autosave — one misclick or crash could destroy hours of work. IC ships with both from day one.

- **Autosave** — configurable interval (default: every 5 minutes). Writes to a rotating set of 3 autosave slots so a corrupted save doesn't overwrite the only backup
- **Pre-preview save** — the editor automatically saves a snapshot before entering preview mode. If the game crashes during preview, the editor state is preserved
- **Recovery on launch** — if the editor detects an unclean shutdown (crash), it offers to restore from the most recent autosave: "The editor was not closed properly. Restore from autosave (2 minutes ago)? [Restore] [Discard]"
- **Undo history persistence** — the undo stack is included in autosaves. Restoring from autosave also restores the ability to undo recent changes
- **Manual save is always available** — Ctrl+S saves to the scenario file. Autosave supplements manual save, never replaces it

### Trigger System (RTS-Adapted)

OFP's trigger system adapted for RTS gameplay:

| Attribute            | Description                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Area**             | Rectangle or ellipse on the isometric map (cell-aligned or free-form)                                                |
| **Activation**       | Who triggers it: Any Player / Specific Player / Any Unit / Faction Units / No Unit (condition-only)                  |
| **Condition Type**   | Present / Not Present / Destroyed / Built / Captured / Harvested                                                     |
| **Custom Condition** | Lua expression (e.g., `Player.cash(1) >= 5000`)                                                                      |
| **Repeatable**       | Once or Repeatedly (with re-arm)                                                                                     |
| **Timer**            | Countdown (fires after delay, condition can lapse) or Timeout (condition must persist for full duration)             |
| **Timer Values**     | Min / Mid / Max — randomized, gravitating toward Mid. Prevents predictable timing.                                   |
| **Trigger Type**     | None / Victory / Defeat / Reveal Area / Spawn Wave / Play Audio / Weather Change / Reinforcements / Objective Update |
| **On Activation**    | Advanced: Lua script                                                                                                 |
| **On Deactivation**  | Advanced: Lua script (repeatable triggers only)                                                                      |
| **Effects**          | Play music / Play sound / Play video / Show message / Camera flash / Screen shake / Enter cinematic mode             |

**RTS-specific trigger conditions:**

| Condition               | Description                                                         | OFP Equivalent   |
| ----------------------- | ------------------------------------------------------------------- | ---------------- |
| `faction_present`       | Any unit of faction X is alive inside the trigger area              | Side Present     |
| `faction_not_present`   | No units of faction X inside trigger area                           | Side Not Present |
| `building_destroyed`    | Specific building is destroyed                                      | N/A              |
| `building_captured`     | Specific building changed ownership                                 | N/A              |
| `building_built`        | Player has constructed building type X                              | N/A              |
| `unit_count`            | Faction has ≥ N units of type X alive                               | N/A              |
| `resources_collected`   | Player has harvested ≥ N resources                                  | N/A              |
| `timer_elapsed`         | N ticks since mission start (or since trigger activation)           | N/A              |
| `area_seized`           | Faction dominates the trigger area (adapted from OFP's "Seized by") | Seized by Side   |
| `all_destroyed_in_area` | Every enemy unit/building inside the area is destroyed              | N/A              |
| `custom_lua`            | Arbitrary Lua expression                                            | Custom Condition |

**Countdown vs Timeout with Min/Mid/Max** is crucial for RTS missions. Example: "Reinforcements arrive 3–7 minutes after the player captures the bridge" (Countdown, Min=3m, Mid=5m, Max=7m). The player can't memorize the exact timing. In OFP, this was the key to making missions feel alive rather than scripted.

### Module System (Pre-Packaged Logic Nodes)

Modules are IC's equivalent of Eden Editor's 154 built-in modules — complex game logic packaged as drag-and-drop nodes with a properties panel. Non-programmers get 80% of the power without writing Lua.

**Built-in module library (initial set):**

| Category        | Module             | Parameters                                                           | Logic                                                                                                                                                                                                                                  |
| --------------- | ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spawning**    | Wave Spawner       | waves[], interval, escalation, entry_points[]                        | Spawns enemy units in configurable waves                                                                                                                                                                                               |
| **Spawning**    | Reinforcements     | units[], entry_point, trigger, delay                                 | Sends units from map edge on trigger                                                                                                                                                                                                   |
| **Spawning**    | Probability Group  | units[], probability 0–100%                                          | Group exists only if random roll passes (visual wrapper around Probability of Presence)                                                                                                                                                |
| **AI Behavior** | Patrol Route       | waypoints[], alert_radius, response                                  | Units cycle waypoints, engage if threat detected                                                                                                                                                                                       |
| **AI Behavior** | Guard Position     | position, radius, priority                                           | Units defend location; peel to attack nearby threats (OFP Guard/Guarded By pattern)                                                                                                                                                    |
| **AI Behavior** | Hunt and Destroy   | area, unit_types[], aggression                                       | AI actively searches for and engages enemies in area                                                                                                                                                                                   |
| **AI Behavior** | Harvest Zone       | area, harvesters, refinery                                           | AI harvests resources in designated zone                                                                                                                                                                                               |
| **Objectives**  | Destroy Target     | target, description, optional                                        | Player must destroy specific building/unit                                                                                                                                                                                             |
| **Objectives**  | Capture Building   | building, description, optional                                      | Player must engineer-capture building                                                                                                                                                                                                  |
| **Objectives**  | Defend Position    | area, duration, description                                          | Player must keep faction presence in area for N ticks                                                                                                                                                                                  |
| **Objectives**  | Timed Objective    | target, time_limit, failure_consequence                              | Objective with countdown timer                                                                                                                                                                                                         |
| **Objectives**  | Escort Convoy      | convoy_units[], route, description                                   | Protect moving units along a path                                                                                                                                                                                                      |
| **Events**      | Reveal Map Area    | area, trigger, delay                                                 | Removes shroud from an area                                                                                                                                                                                                            |
| **Events**      | Play Briefing      | text, audio_ref, portrait                                            | Shows briefing panel with text and audio                                                                                                                                                                                               |
| **Events**      | Camera Pan         | from, to, duration, trigger                                          | Cinematic camera movement on trigger                                                                                                                                                                                                   |
| **Events**      | Weather Change     | type, intensity, transition_time, trigger                            | Changes weather on trigger activation                                                                                                                                                                                                  |
| **Events**      | Dialogue           | lines[], trigger                                                     | In-game dialogue sequence                                                                                                                                                                                                              |
| **Flow**        | Mission Timer      | duration, visible, warning_threshold                                 | Global countdown affecting mission end                                                                                                                                                                                                 |
| **Flow**        | Checkpoint         | trigger, save_state                                                  | Auto-save when trigger fires                                                                                                                                                                                                           |
| **Flow**        | Branch             | condition, true_path, false_path                                     | Campaign branching point (D021)                                                                                                                                                                                                        |
| **Flow**        | Difficulty Gate    | min_difficulty, entities[]                                           | Entities only exist above threshold difficulty                                                                                                                                                                                         |
| **Effects**     | Explosion          | position, size, trigger                                              | Cosmetic explosion on trigger                                                                                                                                                                                                          |
| **Effects**     | Sound Emitter      | sound_ref, trigger, loop, 3d                                         | Play sound effect — positional (3D) or global                                                                                                                                                                                          |
| **Effects**     | Music Trigger      | track, trigger, fade_time                                            | Change music track on trigger activation                                                                                                                                                                                               |
| **Media**       | Video Playback     | video_ref, trigger, display_mode, skippable                          | Play video — fullscreen, radar_comm, or picture_in_picture (see 04-MODDING.md)                                                                                                                                                         |
| **Media**       | Cinematic Sequence | steps[], trigger, skippable                                          | Chain camera pans + dialogue + music + video + letterbox into a scripted sequence                                                                                                                                                      |
| **Media**       | Ambient Sound Zone | region, sound_ref, volume, falloff                                   | Looping positional audio tied to a named region (forest, river, factory hum)                                                                                                                                                           |
| **Media**       | Music Playlist     | tracks[], mode, trigger                                              | Set active playlist — sequential, shuffle, or dynamic (combat/ambient/tension)                                                                                                                                                         |
| **Media**       | Radar Comm         | portrait, audio_ref, text, duration, trigger                         | RA2-style comm overlay in radar panel — portrait + voice + subtitle (no video required)                                                                                                                                                |
| **Media**       | EVA Notification   | event_type, text, audio_ref, trigger                                 | Play EVA-style notification with audio + text banner                                                                                                                                                                                   |
| **Media**       | Letterbox Mode     | trigger, duration, enter_time, exit_time                             | Toggle cinematic letterbox bars — hides HUD, enters cinematic aspect ratio                                                                                                                                                             |
| **Multiplayer** | Spawn Point        | faction, position                                                    | Player starting location in MP scenarios                                                                                                                                                                                               |
| **Multiplayer** | Crate Drop         | position, trigger, contents                                          | Random powerup/crate on trigger                                                                                                                                                                                                        |
| **Multiplayer** | Spectator Bookmark | position, label, trigger, camera_angle                               | Author-defined camera bookmark for spectator/replay mode — marks key locations and dramatic moments. Spectators can cycle bookmarks with hotkeys. Replays auto-cut to bookmarks when triggered.                                        |
| **Tutorial**    | Tutorial Step      | step_id, title, hint, completion, focus_area, highlight_ui, eva_line | Defines a tutorial step with instructional overlay, completion condition, and optional camera/UI focus. Equivalent to `Tutorial.SetStep()` in Lua but configurable without scripting. Connects to triggers for step sequencing. (D065) |
| **Tutorial**    | Tutorial Hint      | text, position, duration, icon, eva_line, dismissable                | Shows a one-shot contextual hint. Equivalent to `Tutorial.ShowHint()` in Lua. Connect to a trigger to control when the hint appears. (D065)                                                                                            |
| **Tutorial**    | Tutorial Gate      | allowed_build_types[], allowed_orders[], restrict_sidebar            | Restricts player actions for pedagogical pacing — limits what can be built or ordered until a trigger releases the gate. Equivalent to `Tutorial.RestrictBuildOptions()` / `Tutorial.RestrictOrders()` in Lua. (D065)                  |
| **Tutorial**    | Skill Check        | action_type, target_count, time_limit                                | Monitors player performance on a specific action (selection speed, combat accuracy, etc.) and fires success/fail outputs. Used for skill assessment exercises and remedial branching. (D065)                                           |

Modules connect to triggers and other entities via **visual connection lines** — same as OFP's synchronization system. A "Reinforcements" module connected to a trigger means the reinforcements arrive when the trigger fires. No scripting required.

**Custom modules** can be created by modders — a YAML definition + Lua implementation, publishable via Workshop (D030). The community can extend the module library indefinitely.

### Compositions (Reusable Building Blocks)

Compositions are saved groups of entities, triggers, modules, and connections — like Eden Editor's custom compositions. They bridge the gap between individual entity placement and full scene templates (04-MODDING.md).

**Hierarchy:**

```
Entity           — single unit, building, trigger, or module
  ↓ grouped into
Composition      — reusable cluster (base layout, defensive formation, scripted encounter)
  ↓ assembled into
Scenario         — complete mission with objectives, terrain, all compositions placed
  ↓ sequenced into (via Campaign Editor)
Campaign         — branching multi-mission graph with persistent state, intermissions, and dialogue (D021)
```

**Built-in compositions:**

| Composition         | Contents                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| Soviet Base (Small) | Construction Yard, Power Plant, Barracks, Ore Refinery, 3 harvesters, guard units |
| Allied Outpost      | Pillbox ×2, AA Gun, Power Plant, guard units with patrol waypoints                |
| Ore Field (Rich)    | Ore cells + ore truck spawn trigger                                               |
| Ambush Point        | Hidden units + area trigger + attack waypoints (Probability of Presence per unit) |
| Bridge Checkpoint   | Bridge + guarding units + trigger for crossing detection                          |
| Air Patrol          | Aircraft with looping patrol waypoints + scramble trigger                         |
| Coastal Defense     | Naval turrets + submarine patrol + radar                                          |

**Workflow:**
1. Place entities, arrange them, connect triggers/modules
2. Select all → "Save as Composition" → name, category, description, tags, thumbnail
3. Composition appears in the Compositions Library panel (searchable, with favorites — same palette UX as the entity panel)
4. Drag composition onto any map to place a pre-built cluster
5. Publish to Workshop (D030) — community compositions become shared building blocks

**Compositions are individually publishable.** Unlike scenarios (which are complete missions), a single composition can be published as a standalone Workshop resource — a "Soviet Base (Large)" layout, a "Scripted Ambush" encounter template, a "Tournament Start" formation. Other designers browse and install individual compositions, just as Garry's Mod's Advanced Duplicator lets players share and browse individual contraptions independently of full maps. Composition metadata (name, description, thumbnail, tags, author, dependencies) enables a browsable composition library within the Workshop, not just a flat file list.

This completes the content creation pipeline: compositions are the visual-editor equivalent of scene templates (04-MODDING.md). Scene templates are YAML/Lua for programmatic use and LLM generation. Compositions are the same concept for visual editing. They share the same underlying data format — a composition saved in the editor can be loaded as a scene template by Lua/LLM, and vice versa.

### Layers

Organizational folders for managing complex scenarios:

- Group entities by purpose: "Phase 1 — Base Defense", "Phase 2 — Counterattack", "Enemy Patrols", "Civilian Traffic"
- **Visibility toggle** — hide layers in the editor without affecting runtime (essential when a mission has 500+ entities)
- **Lock toggle** — prevent accidental edits to finalized layers
- **Runtime show/hide** — Lua can show/hide entire layers at runtime: `Layer.activate("Phase2_Reinforcements")` / `Layer.deactivate(...)`. Activating a layer spawns all entities in it as a batch; deactivating despawns them. These are **sim operations** (deterministic, included in snapshots and replays), not editor operations — the Lua API name uses `Layer`, not `Editor`, to make the boundary clear. Internally, each entity has a `layer: Option<String>` field; activation toggles a per-layer `active` flag that the spawn system reads. Entities in inactive layers do not exist in the sim — they are serialized in the scenario file but not instantiated until activation. **Deactivation is destructive:** calling `Layer.deactivate()` despawns all entities in the layer — any runtime state (damage taken, position changes, veterancy gained) is lost. Re-activating the layer spawns fresh copies from the scenario template. This is intentional: layers model "reinforcement waves" and "phase transitions," not pausable unit groups. For scenarios that need to preserve unit state across activation cycles, use Lua variables or campaign state (D021) to snapshot and restore specific values

### Media & Cinematics

Original Red Alert's campaign identity was defined as much by its media as its gameplay — FMV briefings before missions, the radar panel switching to a video feed during gameplay, Hell March driving the combat tempo, EVA voice lines as constant tactical feedback. A campaign editor that can't orchestrate media is a campaign editor that can't recreate what made C&C campaigns feel like C&C campaigns.

The modding layer (`04-MODDING.md`) defines the primitives: `video_playback` scene templates with display modes (`fullscreen`, `radar_comm`, `picture_in_picture`), `scripted_scene` templates, and the `Media` Lua global. The scenario editor surfaces all of these as **visual modules** — no Lua required for standard use, Lua available for advanced control.

#### Video Playback

The **Video Playback** module plays video files (`.vqa`, `.mp4`, `.webm`) at a designer-specified trigger point. Three display modes (from `04-MODDING.md`):

| Display Mode         | Behavior                                                                          | Inspiration                     |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| `fullscreen`         | Pauses gameplay, fills screen, letterboxed. Classic FMV briefing.                 | RA1 mission briefings           |
| `radar_comm`         | Video replaces the radar/minimap panel. Game continues. Sidebar stays functional. | RA2 EVA / commander video calls |
| `picture_in_picture` | Small floating video overlay in a corner. Game continues. Dismissible.            | Modern RTS cinematics           |

**Module properties in the editor:**

| Property         | Type                  | Description                                                       |
| ---------------- | --------------------- | ----------------------------------------------------------------- |
| **Video**        | file picker           | Video file reference (from mission assets or Workshop dependency) |
| **Display mode** | dropdown              | `fullscreen` / `radar_comm` / `picture_in_picture`                |
| **Trigger**      | connection            | When to play — connected to a trigger, module, or "mission start" |
| **Skippable**    | checkbox              | Whether the player can press Escape to skip                       |
| **Subtitle**     | text (optional)       | Subtitle text shown during playback (accessibility)               |
| **On Complete**  | connection (optional) | Trigger or module to activate when the video finishes             |

**Radar Comm** deserves special emphasis — it's the feature that makes in-mission storytelling possible without interrupting gameplay. A commander calls in during a battle, their face appears in the radar panel, they deliver a line, and the radar returns. The designer connects a Video Playback (mode: `radar_comm`) to a trigger, and that's it. No scripting, no timeline editor, no separate cinematic tool.

For missions without custom video, the **Radar Comm** module (separate from Video Playback) provides the same radar-panel takeover using a static portrait + audio + subtitle text — the RA2 communication experience without requiring video production.

#### Cinematic Sequences

Individual modules (Camera Pan, Video Playback, Dialogue, Music Trigger) handle single media events. A **Cinematic Sequence** chains them into a scripted multi-step sequence — the editor equivalent of a cutscene director.

**Sequence step types:**

| Step Type      | Parameters                                   | What It Does                                             |
| -------------- | -------------------------------------------- | -------------------------------------------------------- |
| `camera_pan`   | from, to, duration, easing                   | Smooth camera movement between positions                 |
| `camera_shake` | intensity, duration                          | Screen shake (explosion, impact)                         |
| `dialogue`     | speaker, portrait, text, audio_ref, duration | Character speech bubble / subtitle overlay               |
| `play_video`   | video_ref, display_mode                      | Video playback (any display mode)                        |
| `play_music`   | track, fade_in                               | Music change with crossfade                              |
| `play_sound`   | sound_ref, position (optional)               | Sound effect — positional or global                      |
| `wait`         | duration                                     | Pause between steps (in game ticks or seconds)           |
| `spawn_units`  | units[], position, faction                   | Dramatic unit reveal (reinforcements arriving on-camera) |
| `destroy`      | target                                       | Scripted destruction (building collapses, bridge blows)  |
| `weather`      | type, intensity, transition_time             | Weather change synchronized with the sequence            |
| `letterbox`    | enable/disable, transition_time              | Toggle cinematic letterbox bars                          |
| `set_variable` | name, value                                  | Set a mission or campaign variable during the sequence   |
| `lua`          | script                                       | Advanced: arbitrary Lua for anything not covered above   |

**Cinematic Sequence module properties:**

| Property        | Type                  | Description                                                   |
| --------------- | --------------------- | ------------------------------------------------------------- |
| **Steps**       | ordered list          | Sequence of steps (drag-to-reorder in the editor)             |
| **Trigger**     | connection            | When to start the sequence                                    |
| **Skippable**   | checkbox              | Whether the player can skip the entire sequence               |
| **Pause sim**   | checkbox              | Whether gameplay pauses during the sequence (default: yes)    |
| **Letterbox**   | checkbox              | Auto-enter letterbox mode when sequence starts (default: yes) |
| **On Complete** | connection (optional) | What fires when the sequence finishes                         |

**Visual editing:** Steps are shown as a vertical timeline in the module's expanded properties panel. Each step has a colored icon by type. Drag steps to reorder. Click a camera_pan step to see from/to positions highlighted on the map. Click "Preview from step" to test a subsequence without playing the whole thing.

**Example — mission intro cinematic:**

```
Cinematic Sequence: "Mission 3 Intro"
  Trigger: mission_start
  Skippable: yes
  Pause sim: yes

  Steps:
  1. [letterbox]   enable, 0.5s transition
  2. [camera_pan]  from: player_base → to: enemy_fortress, 3s, ease_in_out
  3. [dialogue]    Stavros: "The enemy has fortified the river crossing."
  4. [play_sound]  artillery_distant.wav (global)
  5. [camera_shake] intensity: 0.3, duration: 0.5s
  6. [camera_pan]  to: bridge_crossing, 2s
  7. [dialogue]    Tanya: "I see a weak point in their eastern wall."
  8. [play_music]  "hell_march_v2", fade_in: 2s
  9. [letterbox]   disable, 0.5s transition
```

This replaces what would be 40+ lines of Lua with a visual drag-and-drop sequence. The designer sees the whole flow, reorders steps, previews specific moments, and never touches code.

#### Dynamic Music

`ic-audio` supports dynamic music states (combat/ambient/tension) that respond to game state (see `13-PHILOSOPHY.md` — Klepacki's game-tempo philosophy). The editor exposes this through two mechanisms:

**1. Music Trigger module** — simple track swap on trigger activation. Already in the module table. Good for scripted moments ("play Hell March when the tanks roll out").

**2. Music Playlist module** — manages an active playlist with playback modes:

| Mode         | Behavior                                                                                |
| ------------ | --------------------------------------------------------------------------------------- |
| `sequential` | Play tracks in order, loop                                                              |
| `shuffle`    | Random order, no immediate repeats                                                      |
| `dynamic`    | Engine selects track based on game state — `combat` / `ambient` / `tension` / `victory` |

**Dynamic mode** is the key feature. The designer tags tracks by mood:

```yaml
music_playlist:
  combat:
    - hell_march
    - grinder
    - drill
  ambient:
    - fogger
    - trenches
    - mud
  tension:
    - radio_2
    - face_the_enemy
  victory:
    - credits
```

The engine monitors game state (active combat, unit losses, base threat, objective progress) and crossfades between mood categories automatically. No triggers required — the music responds to what's happening. The designer curates the playlist; the engine handles transitions.

**Crossfade control:** Music Trigger and Music Playlist modules both support `fade_time` — the duration of the crossfade between the current track and the new one. Default: 2 seconds. Set to 0 for a hard cut (dramatic moments).

#### Ambient Sound Zones

**Ambient Sound Zone** modules tie looping environmental audio to named regions. Walk units near a river — hear water. Move through a forest — hear birds and wind. Approach a factory — hear industrial machinery.

| Property    | Type          | Description                                                           |
| ----------- | ------------- | --------------------------------------------------------------------- |
| **Region**  | region picker | Named region this sound zone covers                                   |
| **Sound**   | file picker   | Looping audio file                                                    |
| **Volume**  | slider 0–100% | Base volume at the center of the region                               |
| **Falloff** | slider        | How quickly sound fades at region edges (sharp → gradual)             |
| **Active**  | checkbox      | Whether the zone starts active (can be toggled by triggers/Lua)       |
| **Layer**   | text          | Optional layer assignment — zone activates/deactivates with its layer |

Ambient Sound Zones are **render-side only** (`ic-audio`) — they have zero sim impact and are not deterministic. They exist purely for atmosphere. The sound is spatialized: the camera's position determines what the player hears and at what volume.

Multiple overlapping zones blend naturally. A bridge over a river in a forest plays water + birds + wind, with each source fading based on camera proximity to its region.

#### EVA Notification System

EVA voice lines are how C&C communicates game events to the player — "Construction complete," "Unit lost," "Enemy approaching." The editor exposes EVA as a module for custom notifications:

| Property       | Type        | Description                                          |
| -------------- | ----------- | ---------------------------------------------------- |
| **Event type** | dropdown    | `custom` / `warning` / `info` / `critical`           |
| **Text**       | text        | Notification text shown in the message area          |
| **Audio**      | file picker | Voice line audio file                                |
| **Trigger**    | connection  | When to fire the notification                        |
| **Cooldown**   | slider      | Minimum time before this notification can fire again |
| **Priority**   | dropdown    | `low` / `normal` / `high` / `critical`               |

Priority determines queuing behavior — critical notifications interrupt lower-priority ones; low-priority notifications wait. This prevents EVA spam during intense battles while ensuring critical alerts always play.

**Built-in EVA events** (game module provides defaults for standard events: unit lost, building destroyed, harvester under attack, insufficient funds, etc.). Custom EVA modules are for mission-specific notifications — "The bridge has been rigged with explosives," "Reinforcements are en route."

#### Letterbox / Cinematic Mode

The **Letterbox Mode** module toggles cinematic presentation:

- **Letterbox bars** — black bars at top and bottom of screen, creating a widescreen aspect ratio
- **HUD hidden** — sidebar, minimap, resource bar, unit selection all hidden
- **Input restricted** — player cannot issue orders (optional — some sequences allow camera panning)
- **Transition time** — bars slide in/out smoothly (configurable)

Letterbox mode is automatically entered by Cinematic Sequences when `letterbox: true` (the default). It can also be triggered independently — a Letterbox Mode module connected to a trigger enters cinematic mode for dramatic moments without a full sequence (e.g., a dramatic camera pan to a nuclear explosion, then back to gameplay).

#### Media in Campaigns

All media modules work within the campaign editor's intermission system:

- **Fullscreen video** before missions (briefing FMVs)
- **Music Playlist** per campaign node (each mission can have its own playlist, or inherit from the campaign default)
- **Dialogue with audio** in intermission screens — character portraits with voice-over
- **Ambient sound** in intermission screens (command tent ambiance, war room hum)

The campaign node properties (briefing, debriefing) support media references:

| Property           | Type             | Description                                         |
| ------------------ | ---------------- | --------------------------------------------------- |
| **Briefing video** | file picker      | Optional FMV played before the mission (fullscreen) |
| **Briefing audio** | file picker      | Voice-over for text briefing (if no video)          |
| **Briefing music** | track picker     | Music playing during the briefing screen            |
| **Debrief audio**  | file picker (×N) | Per-outcome voice-over for debrief screens          |
| **Debrief video**  | file picker (×N) | Per-outcome FMV (optional)                          |

This means a campaign creator can build the full original RA experience — FMV briefing → mission with in-game radar comms → debrief with per-outcome results — entirely through the visual editor.

#### Lua Media API (Advanced)

All media modules map to Lua functions for advanced scripting. The `Media` global (OpenRA-compatible, D024) provides the baseline; IC extensions add richer control:

```lua
-- OpenRA-compatible (work identically)
Media.PlaySpeech("eva_building_captured")    -- EVA notification
Media.PlaySound("explosion_large")           -- Sound effect
Media.PlayMusic("hell_march")                -- Music track
Media.DisplayMessage("Bridge destroyed!", "warning")  -- Text message

-- IC extensions (additive)
Media.PlayVideo("briefing_03.vqa", "fullscreen", { skippable = true })
Media.PlayVideo("commander_call.mp4", "radar_comm")
Media.PlayVideo("heli_arrives.webm", "picture_in_picture")

Media.SetMusicPlaylist({ "hell_march", "grinder" }, "shuffle")
Media.SetMusicMode("dynamic")    -- switch to dynamic mood-based selection
Media.CrossfadeTo("fogger", 3.0) -- manual crossfade with duration

Media.SetAmbientZone("forest_region", "birds_wind.ogg", { volume = 0.7 })
Media.SetAmbientZone("river_region", "water_flow.ogg", { volume = 0.5 })

-- Cinematic sequence from Lua (for procedural cutscenes)
local seq = Media.CreateSequence({ skippable = true, pause_sim = true })
seq:AddStep("letterbox", { enable = true, transition = 0.5 })
seq:AddStep("camera_pan", { to = bridge_pos, duration = 3.0 })
seq:AddStep("dialogue", { speaker = "Tanya", text = "I see them.", audio = "tanya_03.wav" })
seq:AddStep("play_sound", { ref = "artillery.wav" })
seq:AddStep("camera_shake", { intensity = 0.4, duration = 0.5 })
seq:AddStep("letterbox", { enable = false, transition = 0.5 })
seq:Play()
```

The visual modules and Lua API are interchangeable — a Cinematic Sequence created in the editor generates the same data as one built in Lua. Advanced users can start with the visual editor and extend with Lua; Lua-first users get the same capabilities without the GUI.

### Preview / Test

- **Preview button** — starts the sim from current editor state. Play the mission, then return to editor. No compilation, no export, no separate process.
- **Play from cursor** — start the preview with the camera at the current editor position (Eden Editor's "play from here")
- **Speed controls** — preview at 2x/4x/8x to quickly reach later mission stages
- **Instant restart** — reset to editor state without re-entering the editor

### Simple vs Advanced Mode

Inspired by OFP's Easy/Advanced toggle:

| Feature                         | Simple Mode | Advanced Mode |
| ------------------------------- | ----------- | ------------- |
| Entity placement                | ✓           | ✓             |
| Faction/facing/health           | ✓           | ✓             |
| Basic triggers (win/lose/timer) | ✓           | ✓             |
| Waypoints (move/patrol/guard)   | ✓           | ✓             |
| Modules                         | ✓           | ✓             |
| Probability of Presence         | —           | ✓             |
| Condition of Presence           | —           | ✓             |
| Custom Lua conditions           | —           | ✓             |
| Init scripts per entity         | —           | ✓             |
| Countdown/Timeout timers        | —           | ✓             |
| Min/Mid/Max randomization       | —           | ✓             |
| Connection lines                | —           | ✓             |
| Layer management                | —           | ✓             |
| Campaign editor                 | —           | ✓             |
| Named regions                   | —           | ✓             |
| Variables panel                 | —           | ✓             |
| Inline Lua scripts on entities  | —           | ✓             |
| External script files panel     | —           | ✓             |
| Trigger folders & flow graph    | —           | ✓             |
| Media modules (basic)           | ✓           | ✓             |
| Video playback                  | ✓           | ✓             |
| Music trigger / playlist        | ✓           | ✓             |
| Cinematic sequences             | —           | ✓             |
| Ambient sound zones             | —           | ✓             |
| Letterbox / cinematic mode      | —           | ✓             |
| Lua Media API                   | —           | ✓             |
| Intermission screens            | —           | ✓             |
| Dialogue editor                 | —           | ✓             |
| Campaign state dashboard        | —           | ✓             |
| Multiplayer / co-op properties  | —           | ✓             |
| Game mode templates             | ✓           | ✓             |

Simple mode covers 80% of what a casual scenario creator needs. Advanced mode exposes the full power. Same data format — a mission created in Simple mode can be opened in Advanced mode and extended.

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
| **Name**          | Display name ("Tanya", "Commander Volkov")                              |
| **Portrait**      | Image reference for dialogue and intermission screens                   |
| **Unit type**     | Default unit type when spawned (can change per mission)                 |
| **Traits**        | Arbitrary key-value pairs (strength, charisma, rank — designer-defined) |
| **Inventory**     | Items this character carries (from campaign inventory system)           |
| **Biography**     | Text shown in roster screen, updated by Lua as the campaign progresses  |
| **Must survive**  | If true, character death → mission failure (or specific outcome)        |
| **Death outcome** | Named outcome triggered if this character dies (e.g., `tanya_killed`)   |

Named characters bridge scenarios and intermissions. Tanya in Mission 1 is the same Tanya in Mission 5 — same veterancy, same kill count, same equipment. If she dies in Mission 3 and doesn't have "must survive," the campaign continues without her — and future dialogue trees skip her lines via conditions.

This is the primitive that makes RPG campaigns possible. A designer creates 6 named characters, gives them traits and portraits, writes dialogue between them, and lets the player manage their roster between missions. That's an RPG party in an RTS shell — no engine changes required, just creative use of the campaign editor's building blocks.

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

#### Campaign Testing

The Campaign Editor includes tools for testing campaign flow without playing every mission to completion:

- **Graph validation** — checks for dead ends (outcomes with no outgoing edge), unreachable missions, circular paths (unless intentional), and missing mission files
- **Jump to mission** — start any mission with simulated campaign state (set flags, roster, and inventory to test a specific path)
- **Fast-forward state** — manually set campaign variables and flags to simulate having played earlier missions
- **Path coverage** — highlights which campaign paths have been test-played and which haven't. Color-coded: green (tested), yellow (partially tested), red (untested)
- **Campaign playthrough** — play the entire campaign with accelerated sim (or auto-resolve missions) to verify flow and state propagation
- **State inspector** — during preview, shows live campaign state: current flags, roster, inventory, variables, which path was taken

#### Reference Material (Campaign Editors)

The campaign editor design draws from these (in addition to the scenario editor references above):

- **Warcraft III World Editor (2002):** The closest any RTS came to campaign editing — campaign screen with mission ordering, cinematic editor, global variables persistent across maps. Still linear and limited: no visual branching, no roster management, no intermission screen customization. IC takes WC3's foundation and adds the graph, state, and intermission layers.
- **RPG Maker (1992–present):** Campaign-level persistent variables, party management, item/equipment systems, branching dialogue. Proves these systems work for non-programmers. IC adapts the persistence model for RTS context.
- **Twine / Ink (interactive fiction tools):** Visual branching narrative editors. Twine's node-and-edge graph directly inspired IC's campaign graph view. Ink's conditional text ("You remember the bridge{bridge_destroyed: 's destruction| still standing}") inspired IC's variable substitution in dialogue.
- **Heroes of Might and Magic III (1999):** Campaign with carryover — hero stats, army, artifacts persist between maps. Proved that persistent state between RTS-adjacent missions creates investment. Limited to linear ordering.
- **FTL / Slay the Spire (roguelikes):** Randomized mission path selection, persistent resources, risk/reward side missions. Inspired IC's mission pools and weighted random paths.
- **OFP: Resistance (2002):** The gold standard for persistent campaigns — surviving soldiers, captured equipment, emotional investment. Every feature in IC's campaign editor exists because OFP: Resistance proved persistent campaigns are transformative.

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
| **Assassination**       | StarCraft UMS                   | Commander unit per player (powerful but fragile), protect yours, kill theirs. Commander death = defeat.                          |
| **Tower Defense**       | Desktop TD, custom WC3 maps     | Pre-defined enemy paths (waypoints), restricted build zones, economy from kills, wave system with boss rounds                    |
| **Tug of War**          | WC3 custom maps                 | Automated unit spawning on timer, player controls upgrades/abilities/composition. Push the enemy back.                           |
| **Base Defense**        | They Are Billions, C&C missions | Defend a position for N minutes/waves. Pre-placed base, incoming attacks from multiple directions, escalating difficulty.        |
| **Capture the Flag**    | FPS tradition                   | Each player has a flag entity (or MCV). Steal the opponent's and return it to your base. Combines economy + raiding.             |
| **Free for All**        | Every RTS                       | 3+ players, no alliances allowed. Last player standing. Diplomacy module optional (alliances that can be broken).                |
| **Diplomacy**           | Civilization, AoE4              | FFA with dynamic alliance system. Players can propose/accept/break alliances. Shared vision opt-in. Betrayal is a game mechanic. |
| **Sandbox**             | Garry's Mod, Minecraft Creative | Unlimited resources, no enemies, no victory condition. Pure building and experimentation. Good for testing and screenshots.      |
| **Co-op Survival**      | Deep Rock Galactic, Helldivers  | Multiple human players vs escalating AI waves. Shared base. Team objectives. Difficulty scales with player count.                |
| **Sudden Death**        | Various                         | No rebuilding — if a building is destroyed, it's gone. Every engagement is high-stakes. Smaller starting armies.                 |

**Templates are starting points, not constraints.** Open a template, add your own triggers/modules/Lua, publish to Workshop. Templates save 30–60 minutes of boilerplate setup and ensure the core game mode logic is correct.

**Phasing:** Not all 17 templates ship simultaneously. **Phase 6b core set** (8 templates): Skirmish, Survival/Horde, King of the Hill, Regicide, Free for All, Co-op Survival, Sandbox, Base Defense — these cover the most common community needs and validate the template system. **Phase 7 / community-contributed** (9 templates): Treaty, Nomad, Empire Wars, Assassination, Tower Defense, Tug of War, Capture the Flag, Diplomacy, Sudden Death — these are well-defined patterns that the community can build and publish via Workshop before (or instead of) first-party implementation. Scope to what you have (Principle #6); don't ship 17 mediocre templates when 8 excellent ones plus a thriving Workshop library serves players better.

**Custom game mode templates:** Modders can create new templates and publish them to Workshop (D030). A "Zombie Survival" template, a "MOBA Lanes" template, a "RPG Quest Hub" template — the community extends the library indefinitely. Templates use the same composition + module + trigger format as everything else.

**Community tools > first-party completeness.** Garry's Mod shipped ~25 built-in tools; the community built hundreds more that matched or exceeded first-party quality — because the tool API was clean enough that addon authors could. The same philosophy applies here: ship 8 excellent templates, make the authoring format so clean that community templates are indistinguishable from built-in ones, and let Workshop do the rest. The limiting factor should be community imagination, not API complexity.

**Sandbox as default preview.** The Sandbox template (unlimited resources, no enemies, no victory condition) doubles as the default environment when the editor's Preview button is pressed without a specific scenario loaded. This follows Garry's Mod's lesson: sandbox mode is how people **learn the tools** before making real content. A zero-pressure environment where every entity and module can be tested without mission constraints.

**Templates + Co-op:** Several templates have natural co-op variants. Co-op Survival is explicit, but most templates work with 2+ players if the designer adds co-op spawn points and per-player objectives.

### Workshop-Distributed Editor Plugins

Garry's Mod's most powerful pattern: community-created tools appear alongside built-in tools in the same menu. The community doesn't just create content — they **extend the creation tools themselves.** Wire Mod and Expression 2 are the canonical examples: community-built systems that became essential editor infrastructure, indistinguishable from first-party tools.

IC supports this explicitly. Workshop-published packages can contain:

| Plugin Type             | What It Adds                                                            | Example                                                     |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Custom modules**      | New entries in the Modules panel (YAML definition + Lua implementation) | "Convoy System" module — defines waypoints + spawn + escort |
| **Custom triggers**     | New trigger condition/action types                                      | "Music trigger" — plays specific track on activation        |
| **Compositions**        | Pre-built reusable entity groups (see Compositions section)             | "Tournament 1v1 Start" — balanced spawn with resources      |
| **Game mode templates** | Complete game mode setups (see Game Mode Templates section)             | "MOBA Lanes" — 3-lane auto-spawner with towers and heroes   |
| **Editor tools**        | New editing tools and panels (Lua-based UI extensions, Phase 7)         | "Formation Arranger" — visual grid formation editor tool    |
| **Terrain brushes**     | Custom terrain painting presets                                         | "River Painter" — places water + bank tiles + bridge snaps  |

All plugin types use the tiered modding system (invariant #3): YAML for data definitions, Lua for logic, WASM for complex tools. Plugins are sandboxed — an editor plugin cannot access the filesystem, network, or sim internals beyond the editor's public API. They install via Workshop like any other resource and appear in the editor's palettes automatically.

This aligns with philosophy principle #19 ("Build for surprise — expose primitives, not just parameterized behaviors"): the module/trigger/composition system is powerful enough that community extensions can create things the engine developers never imagined.

**Phase:** Custom modules and compositions are publishable from Phase 6a (they use the existing YAML + Lua format). Custom editor tools (Lua-based UI extensions) are a Phase 7 capability that depends on the editor's Lua plugin API.

### Editor Onboarding for Veterans

The IC editor's concepts — triggers, waypoints, entities, layers — aren't new. They're the same ideas that OFP, AoE2, StarCraft, and WC3 editors have used for decades. But each editor uses different names, different hotkeys, and different workflows. A 20-year AoE2 scenario editor veteran has deep muscle memory that IC shouldn't fight — it should channel.

**"Coming From" profile (first-launch):**

When the editor opens for the first time, a non-blocking welcome panel asks: "Which editor are you most familiar with?" Options:

| Profile             | Sets Default Keybindings | Sets Terminology Hints | Sets Tutorial Path                       |
| ------------------- | ------------------------ | ---------------------- | ---------------------------------------- |
| **New to editing**  | IC Default               | IC terms only          | Full guided tour, start with Simple mode |
| **OFP / Eden**      | F1–F7 mode switching     | OFP equivalents shown  | Skip basics, focus on RTS differences    |
| **AoE2**            | AoE2 trigger workflow    | AoE2 equivalents shown | Skip triggers, focus on Lua + modules    |
| **StarCraft / WC3** | WC3 trigger shortcuts    | Location→Region, etc.  | Skip locations, focus on compositions    |
| **Other / Skip**    | IC Default               | No hints               | Condensed overview                       |

This is a **one-time suggestion, not a lock-in.** Profile can be changed anytime in settings. All it does is set initial keybindings and toggle contextual hints.

**Customizable keybinding presets:**

Full key remapping with shipped presets:

```
IC Default   — Tab cycles modes, 1-9 entity selection, Space preview
OFP Classic  — F1-F7 modes, Enter properties, Space preview
Eden Modern  — Ctrl+1-7 modes, double-click properties, P preview
AoE2 Style   — T triggers, U units, R resources, Ctrl+C copy trigger
WC3 Style    — Ctrl+T trigger editor, Ctrl+B triggers browser
```

Not just hotkeys — mode switching behavior and right-click context menus adapt to the profile. OFP veterans expect right-click on empty ground to deselect; AoE2 veterans expect right-click to open a context menu.

**Terminology Rosetta Stone:**

A toggleable panel (or contextual tooltips) that maps IC terms to familiar ones:

| IC Term                 | OFP / Eden              | AoE2                         | StarCraft / WC3         |
| ----------------------- | ----------------------- | ---------------------------- | ----------------------- |
| Region                  | Trigger (area-only)     | Trigger Area                 | Location                |
| Module                  | Module                  | Looping Trigger Pattern      | GUI Trigger Template    |
| Composition             | Composition             | (Copy-paste group)           | Template                |
| Variables Panel         | (setVariable in SQF)    | (Invisible unit on map edge) | Deaths counter / Switch |
| Inline Script           | Init field (SQF)        | —                            | Custom Script           |
| Connection              | Synchronize             | —                            | —                       |
| Layer                   | Layer                   | —                            | —                       |
| Probability of Presence | Probability of Presence | —                            | —                       |
| Named Character         | Playable unit           | Named hero (scenario)        | Named hero              |

Displayed as **tooltips on hover** — when an AoE2 veteran hovers over "Region" in the UI, a tiny tooltip says "AoE2: Trigger Area." Not blocking, not patronizing, just a quick orientation aid. Tooltips disappear after the first few uses (configurable).

**Interactive migration cheat sheets:**

Context-sensitive help that recognizes familiar patterns:

- Designer opens Variables Panel → tip: "In AoE2, you might have used invisible units placed off-screen as variables. IC has native variables — no workarounds needed."
- Designer creates first trigger → tip: "In OFP, triggers were areas on the map. IC triggers work the same way, but you can also use Regions for reusable areas across multiple triggers."
- Designer writes first Lua line → tip: "Coming from SQF? Here's a quick Lua comparison: `_myVar = 5` → `local myVar = 5`. `hint \"hello\"` → `Game.message(\"hello\")`. Full cheat sheet: Help → SQF to Lua."

These only appear once per concept. They're dismissable and disable-all with one toggle. They're not tutorials — they're translation aids.

**Scenario import (partial):**

Full import of complex scenarios from other engines is unrealistic — but partial import of the most tedious-to-recreate elements saves real time:

- **AoE2 trigger import** — parse AoE2 scenario trigger data, convert condition→effect pairs to IC triggers + modules. Not all triggers translate, but simple ones (timer, area detection, unit death) map cleanly.
- **StarCraft trigger import** — parse StarCraft triggers, convert locations to IC Regions, convert trigger conditions/actions to IC equivalents.
- **OFP mission.sqm import** — parse entity placements, trigger positions, and waypoint connections. SQF init scripts flag as "needs Lua conversion" but the spatial layout transfers.
- **OpenRA .oramap entities** — already supported by the asset pipeline (D025/D026). Editor imports the map and entity placement directly.

Import is always **best-effort** with clear reporting: "Imported 47 of 52 triggers. 5 triggers used features without IC equivalents — see import log." Better to import 90% and fix 10% than to recreate 100% from scratch.

**The 30-minute goal:** A veteran editor from ANY background should feel productive within 30 minutes. Not expert — productive. They recognize familiar concepts wearing new names, their muscle memory partially transfers via keybinding presets, and the migration cheat sheet fills the gaps. The learning curve is a gentle slope, not a cliff.

### Controller & Steam Deck Support

Steam Deck is a target platform (Invariant #10), so the editor must be usable without mouse+keyboard — but it doesn't need to be *equally* powerful. The approach: full functionality on mouse+keyboard, comfortable core workflows on controller.

- **Controller input mapping:** Left stick for cursor movement (with adjustable acceleration), right stick for camera pan/zoom. D-pad cycles editing modes. Face buttons: place (A), delete (B), properties panel (X), context menu (Y). Triggers: undo (LT), redo (RT). Bumpers: cycle selected entity type
- **Radial menus** — controller-optimized selection wheels for entity types, trigger types, and module categories (replacing mouse-dependent dropdowns)
- **Snap-to-grid** — always active on controller (optional on mouse) to compensate for lower cursor precision
- **Touch input (Steam Deck / mobile):** Tap to place, pinch to zoom, two-finger drag to pan. Long press for properties panel. Touch works as a complement to controller, not a replacement for mouse
- **Scope:** Core editing (terrain, entity placement, triggers, waypoints, modules, preview) is controller-compatible at launch. Advanced features (inline Lua editing, campaign graph wiring, dialogue tree authoring) require keyboard and are flagged in the UI: "Connect a keyboard for this feature." This is the same trade-off Eden Editor made — and Steam Deck has a built-in keyboard for occasional text entry

**Phase:** Controller input for the editor ships with Phase 6a. Touch input is Phase 7.

### Accessibility

The editor's "accessibility through layered complexity" principle applies to disability access, not just skill tiers. These features ensure the editor is usable by the widest possible audience.

**Visual accessibility:**
- **Colorblind modes** — all color-coded elements (trigger folders, layer colors, region colors, connection lines, complexity meter) use a palette designed for deuteranopia, protanopia, and tritanopia. In addition to color, elements use distinct **shapes and patterns** (dashed vs solid lines, different node shapes) so color is never the only differentiator
- **High contrast mode** — editor UI switches to high-contrast theme with stronger borders and larger text. Toggle in editor settings
- **Scalable UI** — all editor panels respect the game's global UI scale setting (50%–200%). Editor-specific elements (attribute labels, trigger text, node labels) scale independently if needed
- **Zoom and magnification** — the isometric viewport supports arbitrary zoom levels. Combined with UI scaling, users with low vision can work at comfortable magnification

**Motor accessibility:**
- **Full keyboard navigation** — every editor operation is reachable via keyboard. Tab cycles panels, arrow keys navigate within panels, Enter confirms, Escape cancels. No operation requires mouse-only gestures
- **Adjustable click timing** — double-click speed and drag thresholds are configurable for users with reduced dexterity
- **Sticky modes** — editing modes (terrain, entity, trigger) stay active until explicitly switched, rather than requiring held modifier keys

**Cognitive accessibility:**
- **Simple/Advanced mode** (already designed) is the primary cognitive accessibility feature — it reduces the number of visible options from 30+ to ~10
- **Consistent layout** — panels don't rearrange based on context. The attributes panel is always on the right, the mode selector always on the left. Predictable layout reduces cognitive load
- **Tooltips with examples** — every field in the attributes panel has a tooltip with a concrete example, not just a description. "Probability of Presence: 75" → tooltip: "75% chance this unit exists when the mission starts. Example: set to 50 for a coin-flip ambush."

**Phase:** Colorblind modes, UI scaling, and keyboard navigation ship with Phase 6a. High contrast mode and motor accessibility refinements ship in Phase 6b–7.

> **Note:** The accessibility features above cover the **editor** UI. **Game-level accessibility** — colorblind faction colors, minimap palettes, resource differentiation, screen reader support for menus, subtitle options for EVA/briefings, and remappable controls — is a separate concern that applies to `ic-render` and `ic-ui`, not `ic-editor`. Game accessibility ships in Phase 7 (see `08-ROADMAP.md`).

### Alternatives Considered

1. **In-game editor (original design, revised by D040):** The original D038 design embedded the editor inside the game binary. Revised to SDK-separate architecture — players shouldn't see creator tools. The SDK still reuses the same Bevy rendering and sim crates, so there's no loss of live preview capability. See D040 § SDK Architecture for the full rationale.
2. **Text-only editing (YAML + Lua):** Already supported for power users and LLM generation. The visual editor is the accessibility layer on top of the same data format.
3. **Node-based visual scripting (like Unreal Blueprints):** Too complex for the casual audience. Modules + triggers cover the sweet spot. Advanced users write Lua directly. A node editor is a potential Phase 7+ community contribution.

**Phase:** Core scenario editor (terrain + entities + triggers + waypoints + modules + compositions + preview + autosave + controller input + accessibility) ships in **Phase 6a** alongside the modding SDK and full Workshop. Campaign editor (graph, state dashboard, intermissions, dialogue, named characters), game mode templates, multiplayer/co-op scenario tools, and Game Master mode ship in **Phase 6b**. Editor onboarding ("Coming From" profiles, keybinding presets, migration cheat sheets, partial import) and touch input ship in **Phase 7**. The campaign editor's graph, state dashboard, and intermission screens build on D021's campaign system (Phase 4) — the sim-side campaign engine must exist before the visual editor can drive it.

---

---

## D040: Asset Studio — Visual Resource Editor & Agentic Generation

**Decision:** Ship an Asset Studio as part of the IC SDK — a visual tool for browsing, viewing, editing, and generating game resources (sprites, palettes, terrain tiles, UI chrome, 3D models). Optionally agentic: modders can describe what they want and an LLM generates or modifies assets, with in-context preview and iterative refinement. The Asset Studio is a tab/mode within the SDK application alongside the scenario editor (D038) — separate from the game binary.

**Context:** The current design covers the full lifecycle *around* assets — parsing (ra-formats), runtime loading (Bevy pipeline), in-game use (ic-render), mission editing (D038), and distribution (D030 Workshop) — but nothing for the creative work of making or modifying assets. A modder who wants to create a new unit sprite, adjust a palette, or redesign menu chrome has zero tooling in our chain. They use external tools (Photoshop, GIMP, Aseprite) and manually convert. The community's most-used asset tool is XCC Mixer (a 20-year-old Windows utility for browsing .mix archives). We can do better.

Bevy does not fill this gap. Bevy's asset system handles loading and hot-reloading at runtime. The in-development Bevy Editor is a scene/entity inspector, not an art tool. No Bevy ecosystem crate provides C&C-format-aware asset editing.

**What this is NOT:** A Photoshop competitor. The Asset Studio does not provide pixel-level painting or 3D modeling. Artists use professional external tools for that. The Asset Studio handles the last mile: making assets game-ready, previewing them in context, and bridging the gap between "I have a PNG" and "it works as a unit in the game."

### SDK Architecture — Editor/Game Separation

**The IC SDK is a separate application from the game.** Normal players never see editor UI. Creators download the SDK alongside the game (or as part of the `ic` CLI toolchain). This follows the industry standard: Bethesda's Creation Kit, Valve's Hammer/Source SDK, Epic's Unreal Editor, Blizzard's StarEdit/World Editor (bundled but launches separately).

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│         IC Game              │     │          IC SDK              │
│  (ic-game binary)            │     │  (ic-sdk binary)             │
│                              │     │                              │
│  • Play skirmish/campaign    │     │  ┌────────────────────────┐  │
│  • Online multiplayer        │     │  │   Scenario Editor      │  │
│  • Browse/install mods       │     │  │   (D038)               │  │
│  • Watch replays             │     │  ├────────────────────────┤  │
│  • Settings & profiles       │     │  │   Asset Studio         │  │
│                              │     │  │   (D040)               │  │
│  No editor UI.               │     │  ├────────────────────────┤  │
│  No asset tools.             │     │  │   Campaign Editor      │  │
│  Clean player experience.    │     │  │   (D038/D021)          │  │
│                              │     │  ├────────────────────────┤  │
│                              │     │  │   Game Master Mode     │  │
│                              │     │  │   (D038)               │  │
│                              │     │  └────────────────────────┘  │
│                              │     │                              │
│                              │     │  Shares: ic-render, ic-sim,  │
│                              │     │  ic-ui, ic-protocol,         │
│                              │     │  ra-formats                  │
└──────────────────────────────┘     └──────────────────────────────┘
         ▲                                      │
         │         ic mod run / Test button      │
         └───────────────────────────────────────┘
```

**Why separate binaries instead of in-game editor:**
- **Players aren't overwhelmed.** A player launches the game and sees: Play, Multiplayer, Replays, Settings. No "Editor" menu item they'll never use.
- **SDK can be complex without apology.** The SDK UI can have dense panels, multi-tab layouts, technical property editors. It's for creators — they expect professional tools.
- **Smaller game binary.** All editor systems, asset processing code, LLM integration, and creator UI are excluded from the game build. Players download less.
- **Industry convention.** Players expect an SDK. "Download the Creation Kit" is understood. "Open the in-game editor" confuses casual players who accidentally click it.

**Why this still works for fast iteration:**
- **"Test" button in SDK** launches `ic-game` with the current scenario/asset loaded. One click, instant playtest. Same `LocalNetwork` path as before — the preview is real gameplay.
- **Hot-reload bridge.** While the game is running from a Test launch, the SDK watches for file changes. Edit a YAML file, save → game hot-reloads. Edit a sprite, save → game picks up the new asset. The iteration loop is seconds, not minutes.
- **Shared Bevy crates.** The SDK reuses `ic-render` for its preview viewports, `ic-sim` for gameplay preview, `ic-ui` for shared components. It's the same rendering and simulation — just in a different window with different chrome.

**Crate boundary:** `ic-editor` contains all SDK functionality (scenario editor, asset studio, campaign editor, Game Master mode). It depends on `ic-render`, `ic-sim`, `ic-ui`, `ic-protocol`, `ra-formats`, and optionally `ic-llm` (via traits). `ic-game` does NOT depend on `ic-editor`. Both `ic-game` and `ic-editor` are separate binary targets in the workspace — they share library crates but produce independent executables.

**Game Master mode exception:** Game Master mode requires real-time manipulation of a live game session. The SDK connects to a running game as a special client — the Game Master's SDK sends `PlayerOrder`s through `ic-protocol` to the game's `NetworkModel`, same as any other player. The game doesn't know it's being controlled by an SDK — it receives orders. The Game Master's SDK renders its own view (top-down strategic overview, budget panel, entity palette) but the game session runs in `ic-game`. Open questions deferred to Phase 6b design: how matchmaking/lobby handles GM slots (dedicated GM slot vs. spectator-with-controls), whether GM can join mid-match, and how GM presence is communicated to players.

### Three Layers

#### Layer 1 — Asset Browser & Viewer

Browse, search, and preview every asset the engine can load. This is the XCC Mixer replacement — but integrated into a modern Bevy-based UI with live preview.

| Capability              | Description                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Archive browser**     | Browse .mix archive contents, see file list, extract individual files or bulk export                                                               |
| **Sprite viewer**       | View .shp sprites with palette applied, animate frame sequences, scrub through frames, zoom                                                        |
| **Palette viewer**      | View .pal palettes as color grids, compare palettes side-by-side, see palette applied to any sprite                                                |
| **Terrain tile viewer** | Preview .tmp terrain tiles in grid layout, see how tiles connect                                                                                   |
| **Audio player**        | Play .aud/.wav/.ogg/.mp3 files directly, waveform visualization, spectral view, loop point markers, sample rate / bit depth / channel info display |
| **Video player**        | Play .vqa/.mp4/.webm cutscenes, frame-by-frame scrub, preview in all three display modes (fullscreen, radar_comm, picture_in_picture)              |
| **Chrome previewer**    | View UI theme sprite sheets (D032) with 9-slice visualization, see button states                                                                   |
| **3D model viewer**     | Preview GLTF/GLB models (and .vxl voxel models for future RA2 module) with rotation, lighting                                                      |
| **Asset search**        | Full-text search across all loaded assets — by filename, type, archive, tags                                                                       |
| **In-context preview**  | "Preview as unit" — see this sprite on an actual map tile. "Preview as building" — see footprint. "Preview as chrome" — see in actual menu layout. |
| **Dependency graph**    | Which assets reference this one? What does this mod override? Visual dependency tree.                                                              |

**Format support by game module:**

| Game          | Archive       | Sprites             | Models            | Palettes    | Audio          | Video      | Source                                   |
| ------------- | ------------- | ------------------- | ----------------- | ----------- | -------------- | ---------- | ---------------------------------------- |
| RA1 / TD      | .mix          | .shp                | —                 | .pal        | .aud           | .vqa       | EA GPL release — fully open              |
| RA2 / TS      | .mix          | .shp, .vxl (voxels) | .hva (voxel anim) | .pal        | .aud           | .bik       | Community-documented (XCC, Ares, Phobos) |
| Generals / ZH | .big          | —                   | .w3d (3D meshes)  | —           | —              | .bik       | EA GPL release — fully open              |
| OpenRA        | .oramap (ZIP) | .png                | —                 | .pal        | .wav/.ogg      | —          | Open source                              |
| IC native     | —             | .png, sprite sheets | .glb/.gltf        | .pal, .yaml | .wav/.ogg/.mp3 | .mp4/.webm | Our format                               |

**Minimal reverse engineering required.** RA1/TD and Generals/ZH are fully open-sourced by EA (GPL). RA2/TS formats are not open-sourced but have been community-documented for 20+ years — .vxl, .hva, .csf are thoroughly understood by the XCC, Ares, and Phobos projects. The `FormatRegistry` trait (D018) already anticipates per-module format loaders.

#### Layer 2 — Asset Editor

Scoped asset editing operations. Not pixel painting — structured operations on game asset types.

| Tool                        | What It Does                                                                                                                                                         | Example                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palette editor**          | Remap colors, adjust faction-color ranges, create palette variants, shift hue/saturation/brightness per range                                                        | "Make a winter palette from temperate" — shift greens to whites                                                                                                                                                   |
| **Sprite sheet organizer**  | Reorder frames, adjust animation timing, add/remove frames, composite sprite layers, set hotpoints/offsets                                                           | Import 8 PNG frames → assemble into .shp-compatible sprite sheet with correct facing rotations                                                                                                                    |
| **Chrome / theme designer** | Visual editor for D032 UI themes — drag 9-slice panels, position elements, see result live in actual menu mockup                                                     | Design a new sidebar layout: drag resource bar, build queue, minimap into position. Live preview updates.                                                                                                         |
| **Terrain tile editor**     | Create terrain tile sets — assign connectivity rules, transition tiles, cliff edges. Preview tiling on a test map.                                                   | Paint a new snow terrain set: assign which tiles connect to which edges                                                                                                                                           |
| **Import pipeline**         | Convert standard formats to game-ready assets: PNG → palette-quantized .shp, GLTF → game model with LODs, font → bitmap font sheet                                   | Drag in a 32-bit PNG → auto-quantize to .pal, preview dithering options, export as .shp                                                                                                                           |
| **Batch operations**        | Apply operations across multiple assets: bulk palette remap, bulk resize, bulk re-export                                                                             | "Remap all Soviet unit sprites to use the Tiberium Sun palette"                                                                                                                                                   |
| **Diff / compare**          | Side-by-side comparison of two versions of an asset — sprite diff, palette diff, before/after                                                                        | Compare original RA1 sprite with your modified version, pixel-diff highlighted                                                                                                                                    |
| **Video converter**         | Convert between C&C video formats (.vqa) and modern formats (.mp4, .webm). Trim, crop, resize. Subtitle overlay. Frame rate control.                                 | Record a briefing in OBS → import .mp4 → convert to .vqa for classic feel, or keep as .mp4 for modern campaigns. Extract original RA1 briefings to .mp4 for remixing in Premiere/DaVinci.                         |
| **Audio converter**         | Convert between C&C audio format (.aud) and modern formats (.wav, .ogg). Trim, normalize, fade in/out. Sample rate conversion. Batch convert entire sound libraries. | Extract all RA1 sound effects to .wav for remixing in Audacity/Reaper. Record custom EVA lines → normalize → convert to .aud for classic feel. Batch-convert a voice pack from .wav to .ogg for Workshop publish. |

**Design rule:** Every operation the Asset Studio performs produces standard output formats. Palette edits produce .pal files. Sprite operations produce .shp or sprite sheet PNGs. Chrome editing produces YAML + sprite sheet PNGs. No proprietary intermediate format — the output is always mod-ready.

#### Layer 3 — Agentic Asset Generation (D016 Extension, Phase 7)

LLM-powered asset creation for modders who have ideas but not art skills. Same BYOLLM pattern as D016 — user brings their own provider (DALL-E, Stable Diffusion, Midjourney API, local model), `ic-llm` routes the request.

| Capability             | How It Works                                                                      | Example                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sprite generation**  | Describe unit → LLM generates sprite sheet → preview on map → iterate             | "Soviet heavy tank, double barrel, darker than the Mammoth Tank" → generates 8-facing sprite sheet → preview as unit on map → "make the turret bigger" → re-generates |
| **Palette generation** | Describe mood/theme → LLM generates palette → preview applied to existing sprites | "Volcanic wasteland palette — reds, oranges, dark stone" → generates .pal → preview on temperate map sprites                                                          |
| **Chrome generation**  | Describe UI style → LLM generates theme elements → preview in actual menu         | "Brutalist concrete UI theme, sharp corners, red accents" → generates chrome sprite sheet → preview in sidebar                                                        |
| **Terrain generation** | Describe biome → LLM generates tile set → preview tiling                          | "Frozen tundra with ice cracks and snow drifts" → generates terrain tiles with connectivity → preview on test map                                                     |
| **Asset variation**    | Take existing asset + describe change → LLM produces variant                      | "Take this Allied Barracks and make a Nod version — darker, angular, with a scorpion emblem"                                                                          |
| **Style transfer**     | Apply visual style across asset set                                               | "Make all these units look hand-drawn like Advance Wars"                                                                                                              |

**Workflow:**
1. Describe what you want (text prompt + optional reference image)
2. LLM generates candidate(s) — multiple options when possible
3. Preview in-context (on map, in menu, as unit) — not just a floating image, but in the actual game rendering
4. Iterate: refine prompt, adjust, regenerate
5. Post-process: palette quantize, frame extract, format convert
6. Export as mod-ready asset → ready for Workshop publish

**Crate boundary:** `ic-editor` defines an `AssetGenerator` trait (input: text description + format constraints + optional reference → output: generated image data). `ic-llm` implements it by routing to the configured provider. `ic-game` wires them at startup in the SDK binary. Same pattern as `NarrativeGenerator` for the replay-to-scenario pipeline. The SDK works without an LLM — Layers 1 and 2 are fully functional. Layer 3 activates when a provider is configured.

**What the LLM does NOT replace:**
- Professional art. LLM-generated sprites are good enough for prototyping, playtesting, and small mods. Professional pixel art for a polished release still benefits from a human artist.
- Format knowledge. The LLM generates images. The Asset Studio handles palette quantization, frame extraction, sprite sheet assembly, and format conversion. The LLM doesn't need to know about .shp internals.
- Quality judgment. The modder decides if the result is good enough. The Asset Studio shows it in context so the judgment is informed.

> **See also:** D016 § "Generative Media Pipeline" extends agentic generation beyond visual assets to audio and video: voice synthesis (`VoiceProvider`), music generation (`MusicProvider`), sound FX (`SoundFxProvider`), and video/cutscene generation (`VideoProvider`). The SDK integrates these as Tier 3 Asset Studio tools alongside visual generation. All media provider types use the same BYOLLM pattern and D047 task routing.

### Menu / Chrome Design Workflow

UI themes (D032) are YAML + sprite sheets. Currently there's no visual editor — modders hand-edit coordinates and pixel offsets. The Asset Studio's chrome designer closes this gap:

1. **Load a base theme** (Classic, Remastered, Modern, or any workshop theme)
2. **Visual element editor** — see the 9-slice panels, button states, scrollbar tracks as overlays on the sprite sheet. Drag edges to resize. Click to select.
3. **Layout preview** — split view: sprite sheet on left, live menu mockup on right. Every edit updates the mockup instantly.
4. **Element properties** — per-element: padding, margins, color tint, opacity, font assignment, animation (hover/press states)
5. **Full menu preview** — "Preview as: Main Menu / Sidebar / Build Queue / Lobby / Settings" — switch between all game screens to see the theme in each context
6. **Export** — produces `theme.yaml` + sprite sheet PNG, ready for `ic mod publish`
7. **Agentic mode** — describe desired changes: "make the sidebar narrower with a brushed metal look" → LLM modifies the sprite sheet + adjusts YAML layout → preview → iterate

### Cross-Game Asset Bridge

The Asset Studio understands multiple C&C format families and can convert between them:

| Conversion                 | Direction     | Use Case                                                                                                                                                   | Phase  |
| -------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| .shp (RA1) → .png          | Export        | Extract classic sprites for editing in external tools                                                                                                      | 6a     |
| .png → .shp + .pal         | Import        | Turn modern art into classic-compatible format                                                                                                             | 6a     |
| .vxl (RA2) → .glb          | Export        | Convert RA2 voxel models to standard 3D format for editing                                                                                                 | Future |
| .glb → game model          | Import        | Import artist-created 3D models for future 3D game modules                                                                                                 | Future |
| .w3d (Generals) → .glb     | Export        | Convert Generals models for viewing and editing                                                                                                            | Future |
| .vqa → .mp4/.webm          | Export        | Extract original RA/TD cutscenes to modern formats for viewing, remixing, or re-editing in standard video tools (Premiere, DaVinci, Kdenlive)              | 6a     |
| .mp4/.webm → .vqa          | Import        | Convert custom-recorded campaign briefings/cutscenes to classic VQA format (palette-quantized, VQ-compressed) for authentic retro feel                     | 6a     |
| .mp4/.webm passthrough     | Native        | Modern video formats play natively — no conversion required. Campaign creators can use .mp4/.webm directly for briefings and radar comms.                  | 4      |
| .aud → .wav/.ogg           | Export        | Extract original RA/TD sound effects, EVA lines, and music to modern formats for remixing or editing in standard audio tools (Audacity, Reaper, FL Studio) | 6a     |
| .wav/.ogg → .aud           | Import        | Convert custom audio recordings to classic Westwood AUD format (IMA ADPCM compressed) for authentic retro sound or OpenRA mod compatibility                | 6a     |
| .wav/.ogg/.mp3 passthrough | Native        | Modern audio formats play natively — no conversion required. Mod creators can use .wav/.ogg/.mp3 directly for sound effects, music, and EVA lines.         | 3      |
| Theme YAML ↔ visual        | Bidirectional | Edit themes visually or as YAML — changes sync both ways                                                                                                   | 6a     |

**ra-formats write support:** Currently `ra-formats` is read-only (parse .mix, .shp, .pal, .vqa, .aud). The Asset Studio requires write support — generating .shp from frames, writing .pal files, encoding .vqa video, encoding .aud audio, optionally packing .mix archives. This is an additive extension to `ra-formats` (no redesign of existing parsers), but non-trivial engineering: .shp writing requires correct header generation, frame offset tables, and optional LCW/RLE compression; .vqa encoding requires VQ codebook generation and frame differencing; .aud encoding requires IMA ADPCM compression with correct `AUDHeaderType` generation and `IndexTable`/`DiffTable` lookup table application; .mix packing requires building the file index and CRC hash table. All encoders reference the EA GPL source code implementations directly (see `05-FORMATS.md` § Binary Format Codec Reference). Budget accordingly in Phase 6a.

**Video pipeline:** The game engine natively plays .mp4 and .webm via standard media decoders (platform-provided or bundled). Campaign creators can use modern formats directly — no conversion needed. The .vqa ↔ .mp4/.webm conversion in the Asset Studio is for creators who *want* the classic C&C aesthetic (palette-quantized, low-res FMV look) or who need to extract and remix original EA cutscenes. The conversion pipeline lives in `ra-formats` (VQA codec) + `ic-editor` (UI, preview, trim/crop tools). Someone recording a briefing with a webcam or screen recorder imports their .mp4, previews it in the Video Playback module's display modes (fullscreen, radar_comm, picture_in_picture), optionally converts to .vqa for retro feel, and publishes via Workshop (D030).

**Audio pipeline:** The game engine natively plays .wav, .ogg, and .mp3 via standard audio decoders (Bevy audio plugin + platform codecs). Modern formats are the recommended choice for new content — .ogg for music and voice lines (good compression, no licensing issues), .wav for short sound effects (zero decode latency). The .aud ↔ .wav/.ogg conversion in the Asset Studio is for creators who need to extract and remix original EA audio (hundreds of classic sound effects, EVA voice lines, and Hell March variations) or who want to encode custom audio in classic AUD format for OpenRA mod compatibility. The conversion pipeline lives in `ra-formats` (AUD codec — IMA ADPCM encode/decode using the original Westwood `IndexTable`/`DiffTable` from the EA GPL source) + `ic-editor` (UI, waveform preview, trim/normalize/fade tools). Someone recording custom EVA voice lines imports their .wav files, previews with waveform visualization, normalizes volume, optionally converts to .aud for classic feel or keeps as .ogg for modern mods, and publishes via Workshop (D030). Batch conversion handles entire sound libraries — extract all 200+ RA1 sound effects to .wav in one operation.

### Alternatives Considered

1. **Rely on external tools entirely** (Photoshop, Aseprite, XCC Mixer) — Rejected. Forces modders to learn multiple disconnected tools with no in-context preview. The "last mile" problem (PNG → game-ready .shp with correct palette, offsets, and facing rotations) is where most modders give up.
2. **Build a full art suite** (pixel editor, 3D modeler) — Rejected. Scope explosion. Aseprite and Blender exist. We handle the game-specific parts they can't.
3. **In-game asset tools** — Rejected. Same reasoning as the overall SDK separation: players shouldn't see asset editing tools. The SDK is for creators.
4. **Web-based editor** — Deferred. A browser-based asset viewer/editor is a compelling Phase 7+ goal (especially for the WASM target), but the primary tool ships as a native Bevy application in the SDK.

### Phase

- **Phase 0:** `ra-formats` delivers CLI asset inspection (dump/inspect/validate) — the text-mode precursor.
- **Phase 6a:** Asset Studio ships as part of the SDK alongside the scenario editor. Layer 1 (browser/viewer) and Layer 2 (editor) are the deliverables. Chrome designer ships alongside the UI theme system (D032).
- **Phase 7:** Layer 3 (agentic generation via `ic-llm`). Same phase as LLM text generation (D016).
- **Future:** .vxl/.hva write support (for RA2 module), .w3d viewing (for Generals module), browser-based viewer.

---

---

## D047: LLM Configuration Manager — Provider Management & Community Sharing

**Status:** Accepted
**Scope:** `ic-ui`, `ic-llm`, `ic-game`
**Phase:** Phase 7 (ships with LLM features)

### The Problem

D016 established the BYOLLM architecture: users configure an `LlmProvider` (endpoint, API key, model name) in settings. But as LLM features expand across the engine — mission generation (D016), coaching (D042), AI orchestrator (D044), asset generation (D040) — managing provider configurations becomes non-trivial. Users may want:

- Multiple providers configured simultaneously (local Ollama for AI orchestrator speed, cloud API for high-quality mission generation)
- Task-specific routing (use a cheap model for real-time AI, expensive model for campaign generation)
- Sharing working configurations with the community (without sharing API keys)
- Discovering which models work well for which IC features
- An achievement for configuring and using LLM features (engagement incentive)

### Decision

Provide a dedicated **LLM Manager** UI screen and a community-shareable configuration format for LLM provider setups.

### LLM Manager UI

Accessible from Settings → LLM Providers:

```
┌─────────────────────────────────────────────────────────┐
│  LLM Providers                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [+] Add Provider                                       │
│                                                         │
│  ┌─ Local Ollama (llama3.2) ──────── ✓ Active ───────┐ │
│  │  Endpoint: http://localhost:11434                   │ │
│  │  Model: llama3.2:8b                                │ │
│  │  Assigned to: AI Orchestrator, Quick coaching       │ │
│  │  Avg latency: 340ms  │  Status: ● Connected        │ │
│  │  [Test] [Edit] [Remove]                            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ OpenAI API (GPT-4o) ───────── ✓ Active ──────────┐ │
│  │  Endpoint: https://api.openai.com/v1               │ │
│  │  Model: gpt-4o                                     │ │
│  │  Assigned to: Mission generation, Campaign briefings│ │
│  │  Avg latency: 1.2s   │  Status: ● Connected        │ │
│  │  [Test] [Edit] [Remove]                            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ Anthropic API (Claude) ────── ○ Inactive ─────────┐ │
│  │  Endpoint: https://api.anthropic.com/v1            │ │
│  │  Model: claude-sonnet-4-20250514                          │ │
│  │  Assigned to: (none)                               │ │
│  │  [Test] [Edit] [Remove] [Activate]                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  Task Routing:                                          │
│  ┌──────────────────────┬──────────────────────────┐    │
│  │ Task                 │ Provider                 │    │
│  ├──────────────────────┼──────────────────────────┤    │
│  │ AI Orchestrator      │ Local Ollama (fast)      │    │
│  │ Mission Generation   │ OpenAI API (quality)     │    │
│  │ Campaign Briefings   │ OpenAI API (quality)     │    │
│  │ Post-Match Coaching  │ Local Ollama (fast)      │    │
│  │ Asset Generation     │ OpenAI API (quality)     │    │
│  │ Voice Synthesis      │ ElevenLabs (quality)     │    │
│  │ Music Generation     │ Suno API (quality)       │    │
│  └──────────────────────┴──────────────────────────┘    │
│                                                         │
│  [Export Config] [Import Config] [Browse Community]      │
└─────────────────────────────────────────────────────────┘
```

### Community-Shareable Configurations

LLM configurations can be exported (without API keys) and shared via the Workshop (D030):

```yaml
# Exported LLM configuration (shareable)
llm_config:
  name: "Budget-Friendly RA Setup"
  author: "PlayerName"
  description: "Ollama for real-time features, free API tier for generation"
  version: 1
  providers:
    - name: "Local Ollama"
      type: ollama
      endpoint: "http://localhost:11434"
      model: "llama3.2:8b"
      # NO api_key — never exported
    - name: "Cloud Provider"
      type: openai-compatible
      # endpoint intentionally omitted — user fills in their own
      model: "gpt-4o-mini"
      notes: "Works well with OpenAI or any compatible API"
  routing:
    ai_orchestrator: "Local Ollama"
    mission_generation: "Cloud Provider"
    coaching: "Local Ollama"
    campaign_briefings: "Cloud Provider"
    asset_generation: "Cloud Provider"
  performance_notes: |
    Tested on RTX 3060 + Ryzen 5600X.
    Ollama latency ~300ms for orchestrator (acceptable).
    GPT-4o-mini at ~$0.02 per mission generation.
  compatibility:
    ic_version: ">=0.5.0"
    tested_models:
      - "llama3.2:8b"
      - "mistral:7b"
      - "gpt-4o-mini"
      - "gpt-4o"
```

**Security:** API keys are **never** included in exported configurations. The export contains provider types, model names, and routing — the user fills in their own credentials after importing.

### Workshop Integration

LLM configurations are a Workshop resource type (D030):

- **Category:** "LLM Configurations" in the Workshop browser
- **Ratings and reviews:** Community rates configurations by reliability, cost, quality
- **Tagging:** `budget`, `high-quality`, `local-only`, `fast`, `creative`, `coaching`
- **Compatibility tracking:** Configurations specify which IC version and features they've been tested with

### Achievement Integration (D036)

LLM configuration is an achievement milestone — encouraging discovery and adoption:

| Achievement               | Trigger                                           | Category    |
| ------------------------- | ------------------------------------------------- | ----------- |
| "Intelligence Officer"    | Configure your first LLM provider                 | Community   |
| "Strategic Command"       | Win a game with LLM Orchestrator AI active        | Exploration |
| "Artificial Intelligence" | Play 10 games with any LLM-enhanced AI mode       | Exploration |
| "The Sharing Protocol"    | Publish an LLM configuration to the Workshop      | Community   |
| "Commanding General"      | Use task routing with 2+ providers simultaneously | Exploration |

### Storage (D034)

```sql
CREATE TABLE llm_providers (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,           -- 'ollama', 'openai', 'anthropic', 'custom'
    endpoint    TEXT,
    model       TEXT NOT NULL,
    api_key     TEXT,                    -- encrypted at rest
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    last_tested TEXT
);

CREATE TABLE llm_task_routing (
    task_name   TEXT PRIMARY KEY,        -- 'ai_orchestrator', 'mission_generation', etc.
    provider_id INTEGER REFERENCES llm_providers(id)
);
```

### Relationship to Existing Decisions

- **D016 (BYOLLM):** D047 is the UI and management layer for D016's `LlmProvider` trait. D016 defined the trait and provider types; D047 provides the user experience for configuring them.
- **D036 (Achievements):** LLM-related achievements encourage exploration of optional features without making them required.
- **D030 (Workshop):** LLM configurations become another shareable resource type.
- **D034 (SQLite):** Provider configurations stored locally, encrypted API keys.
- **D044 (LLM AI):** The task routing table directly determines which provider the orchestrator and LLM player use.

### Alternatives Considered

- Settings-only configuration, no dedicated UI (rejected — multiple providers with task routing is too complex for a settings page)
- No community sharing (rejected — LLM configuration is a significant friction point; community knowledge sharing reduces the barrier)
- Include API keys in exports (rejected — obvious security risk; never export secrets)
- Centralized LLM service run by IC project (rejected — conflicts with BYOLLM principle; users control their own data and costs)

---

---

## D056: Foreign Replay Import (OpenRA & Remastered Collection)

**Status:** Settled
**Phase:** Phase 5 (Multiplayer) — decoders in Phase 2 (Simulation) for testing use
**Depends on:** D006 (Pluggable Networking), D011 (Cross-Engine Compatibility), `ra-formats` crate, `ic-protocol` (OrderCodec trait)

### Problem

The C&C community has accumulated thousands of replay files across two active engines:

- **OpenRA** — `.orarep` files (ZIP archives containing order streams + metadata YAML)
- **C&C Remastered Collection** — binary `EventClass` recordings via `Queue_Record()` / `Queue_Playback()` (DoList serialization per frame, with header from `Save_Recording_Values()`)

These replays represent community history, tournament archives, and — critically for IC — a massive corpus of **known-correct gameplay sequences** that can be used as behavioral regression tests. If IC's simulation handles the same orders and produces visually wrong results (units walking through walls, harvesters ignoring ore, Tesla Coils not firing), that's a bug we can catch automatically.

Without foreign replay support, this testing corpus is inaccessible. Additionally, players switching to IC lose access to their replay libraries — a real migration friction point.

### Decision

**Support direct playback of OpenRA and Remastered Collection replay files, AND provide a converter to IC's native `.icrep` format.**

Both paths are supported because they serve different needs:

| Capability                        | Direct Playback                                      | Convert to `.icrep`                           |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| **Use case**                      | Quick viewing, casual browsing                       | Archival, analysis tooling, regression tests  |
| **Requires original engine sim?** | No — runs through IC's sim                           | No — conversion is a format translation       |
| **Bit-identical to original?**    | No — IC's sim will diverge (D011)                    | N/A — stored as IC orders, replayed by IC sim |
| **Analysis events available?**    | Only if IC re-derives them during playback           | Yes — generated during conversion playback    |
| **Signature chain?**              | Not applicable (foreign replays aren't relay-signed) | Unsigned (provenance metadata preserved)      |
| **Speed**                         | Instant (stream-decode on demand)                    | One-time batch conversion                     |

### Architecture

#### Foreign Replay Decoders (in `ra-formats`)

Foreign replay file parsing belongs in `ra-formats` — it reads C&C-family file formats, which is exactly what this crate exists for. The decoders produce a uniform intermediate representation:

```rust
/// A decoded foreign replay, normalized to a common structure.
/// Lives in `ra-formats`. No dependency on `ic-sim` or `ic-net`.
pub struct ForeignReplay {
    pub source: ReplaySource,
    pub metadata: ForeignReplayMetadata,
    pub initial_state: ForeignInitialState,
    pub frames: Vec<ForeignFrame>,
}

pub enum ReplaySource {
    OpenRA { mod_id: String, mod_version: String },
    Remastered { game: RemasteredGame, version: String },
}

pub enum RemasteredGame { RedAlert, TiberianDawn }

pub struct ForeignReplayMetadata {
    pub players: Vec<ForeignPlayerInfo>,
    pub map_name: String,
    pub map_hash: Option<String>,
    pub duration_frames: u64,
    pub game_speed: Option<String>,
    pub recorded_at: Option<String>,
}

pub struct ForeignInitialState {
    pub random_seed: u32,
    pub scenario: String,
    pub build_level: Option<u32>,
    pub options: HashMap<String, String>,  // game options (shroud, crates, etc.)
}

/// One frame's worth of decoded orders from a foreign replay.
pub struct ForeignFrame {
    pub frame_number: u64,
    pub orders: Vec<ForeignOrder>,
}

/// A single order decoded from a foreign replay format.
/// Preserves the original order type name for diagnostics.
pub enum ForeignOrder {
    Move { player: u8, unit_ids: Vec<u32>, target_x: i32, target_y: i32 },
    Attack { player: u8, unit_ids: Vec<u32>, target_id: u32 },
    Deploy { player: u8, unit_id: u32 },
    Produce { player: u8, building_type: String, unit_type: String },
    Sell { player: u8, building_id: u32 },
    PlaceBuilding { player: u8, building_type: String, x: i32, y: i32 },
    SetRallyPoint { player: u8, building_id: u32, x: i32, y: i32 },
    // ... other order types common to C&C games
    Unknown { player: u8, raw_type: u32, raw_data: Vec<u8> },
}
```

Two decoder implementations:

```rust
/// Decodes OpenRA .orarep files.
/// .orarep = ZIP archive containing:
///   - orders stream (binary, per-tick Order objects)
///   - metadata.yaml (players, map, mod, outcome)
///   - sync.bin (state hashes per tick for desync detection)
pub struct OpenRAReplayDecoder;

impl OpenRAReplayDecoder {
    pub fn decode(reader: impl Read + Seek) -> Result<ForeignReplay> { ... }
}

/// Decodes Remastered Collection replay files.
/// Binary format: Save_Recording_Values() header + per-frame EventClass records.
/// Format documented in research/remastered-collection-netcode-analysis.md § 6.
pub struct RemasteredReplayDecoder;

impl RemasteredReplayDecoder {
    pub fn decode(reader: impl Read) -> Result<ForeignReplay> { ... }
}
```

#### Order Translation (in `ic-protocol`)

`ForeignOrder` → `TimestampedOrder` translation uses the existing `OrderCodec` trait architecture (already defined in `07-CROSS-ENGINE.md`). A `ForeignReplayCodec` maps foreign order types to IC's `PlayerOrder` enum:

```rust
/// Translates ForeignOrder → TimestampedOrder.
/// Lives in ic-protocol alongside OrderCodec.
pub struct ForeignReplayCodec {
    coord_transform: CoordTransform,
    unit_type_map: HashMap<String, UnitTypeId>,   // "1tnk" → IC's UnitTypeId
    building_type_map: HashMap<String, UnitTypeId>,
}

impl ForeignReplayCodec {
    /// Translate a ForeignFrame into IC TickOrders.
    /// Orders that can't be mapped produce warnings, not errors.
    /// Unknown orders are skipped with a diagnostic log entry.
    pub fn translate_frame(
        &self,
        frame: &ForeignFrame,
        tick_rate_ratio: f64,  // e.g., OpenRA 40fps → IC 30tps
    ) -> (TickOrders, Vec<TranslationWarning>) { ... }
}
```

#### Direct Playback (in `ic-net`)

`ForeignReplayPlayback` wraps the decoder output and implements `NetworkModel`, feeding translated orders to the sim tick by tick:

```rust
/// Plays back a foreign replay through IC's simulation.
/// Implements NetworkModel — the sim has no idea the orders came from OpenRA.
pub struct ForeignReplayPlayback {
    frames: Vec<TickOrders>,          // pre-translated
    current_tick: usize,
    source_metadata: ForeignReplayMetadata,
    translation_warnings: Vec<TranslationWarning>,
    divergence_tracker: DivergenceTracker,
}

impl NetworkModel for ForeignReplayPlayback {
    fn poll_tick(&mut self) -> Option<TickOrders> {
        let frame = self.frames.get(self.current_tick)?;
        self.current_tick += 1;
        Some(frame.clone())
    }
}
```

**Divergence tracking:** Since IC's sim is not bit-identical to OpenRA's or the Remastered Collection's (D011), playback WILL diverge. The `DivergenceTracker` monitors for visible signs of divergence (units in invalid positions, negative resources, dead units receiving orders) and surfaces them in the UI:

```rust
pub struct DivergenceTracker {
    pub orders_targeting_dead_units: u64,
    pub orders_targeting_invalid_positions: u64,
    pub first_likely_divergence_tick: Option<u64>,
    pub confidence: DivergenceConfidence,
}

pub enum DivergenceConfidence {
    /// Playback looks plausible — no obvious divergence detected.
    Plausible,
    /// Minor anomalies detected — playback may be slightly off.
    MinorDrift { tick: u64, details: String },
    /// Major divergence — orders no longer make sense for current game state.
    Diverged { tick: u64, details: String },
}
```

The UI shows a subtle indicator: green (plausible) → yellow (minor drift) → red (diverged). Players can keep watching past divergence — they just know the playback is no longer representative of the original game.

#### Conversion to `.icrep` (CLI tool)

The `ic` CLI provides a conversion subcommand:

```
ic replay import game.orarep -o game.icrep
ic replay import recording.bin --format remastered-ra -o game.icrep
ic replay import --batch ./openra-replays/ -o ./converted/
```

Conversion process:
1. Decode foreign replay via `ra-formats` decoder
2. Translate all orders via `ForeignReplayCodec`
3. Run translated orders through IC's sim headlessly (generates analysis events + state hashes)
4. Write `.icrep` with `Minimal` embedding mode + provenance metadata

The converted `.icrep` includes provenance metadata in its JSON metadata block:

```json
{
  "replay_id": "...",
  "converted_from": {
    "source": "openra",
    "original_file": "game-20260115-1530.orarep",
    "original_mod": "ra",
    "original_version": "20231010",
    "conversion_date": "2026-02-15T12:00:00Z",
    "translation_warnings": 3,
    "diverged_at_tick": null
  }
}
```

#### Automated Regression Testing

The most valuable use of foreign replay import is **automated behavioral regression testing**:

```
ic replay test ./test-corpus/openra-replays/ --check visual-sanity
```

This runs each foreign replay headlessly through IC's sim and checks for:
- **Order rejection rate:** What percentage of translated orders does IC's sim reject as invalid? A high rate means IC's order validation (D012) disagrees with OpenRA's — worth investigating.
- **Unit survival anomalies:** If a unit that survived the entire original game dies in tick 50 in IC, the combat/movement system likely has a significant behavioral difference.
- **Economy divergence:** Comparing resource trajectories (if OpenRA replay has sync data) against IC's sim output highlights harvesting/refinery bugs early.
- **Crash-free completion:** The replay completes without panics, even if the game state diverges.

This is NOT about achieving bit-identical results (D011 explicitly rejects that). It's about detecting **gross behavioral bugs** — the kind where a tank drives into the ocean or a building can't be placed on flat ground. The foreign replay corpus acts as a "does this look roughly right?" sanity check.

### Tick Rate Reconciliation

OpenRA runs at a configurable tick rate (default 40 tps for Normal speed). The Remastered Collection's original engine runs at approximately 15 fps for game logic. IC targets 30 tps. Foreign replay playback must reconcile these rates:

- **OpenRA 40 tps → IC 30 tps:** Some foreign ticks have no orders and can be merged. Orders are retimed proportionally: foreign tick 120 at 40 tps = 3.0 seconds → IC tick 90 at 30 tps.
- **Remastered ~15 fps → IC 30 tps:** Each foreign frame maps to ~2 IC ticks. Orders land on the nearest IC tick boundary.

The mapping is approximate — sub-tick timing differences mean some orders arrive 1 tick earlier or later than the original. For direct playback this is acceptable (the game will diverge anyway). For regression tests, the tick mapping is deterministic (always the same IC tick for the same foreign tick).

### What This Is NOT

- **NOT cross-engine multiplayer.** Foreign replays are played back through IC's sim only. No attempt to match the original engine's behavior tick-for-tick.
- **NOT a guarantee of visual fidelity.** The game will look "roughly right" for early ticks, then progressively diverge as simulation differences compound. This is expected and documented (D011).
- **NOT a replacement for IC's native replay system.** Native `.icrep` replays are the primary format. Foreign replay support is a compatibility/migration/testing feature.

### Alternatives Considered

- **Convert-only, no direct playback** (rejected — forces a batch step before viewing; users want to double-click an `.orarep` and watch it immediately)
- **Direct playback only, no conversion** (rejected — analysis tooling and regression tests need `.icrep` format; conversion enables the analysis event stream and signature chain)
- **Embed OpenRA/Remastered sim for accurate playback** (rejected — contradicts D011's "not a port" principle; massive dependency; licensing complexity; architecture violation of sim purity)
- **Support only OpenRA, not Remastered** (rejected — Remastered replays are simpler to decode and the community has archives worth preserving; the DoList format is well-documented in EA's GPL source)

### Integration with Existing Decisions

- **D006 (Pluggable Networking):** `ForeignReplayPlayback` is just another `NetworkModel` implementation — the sim doesn't know the orders came from a foreign replay.
- **D011 (Cross-Engine Compatibility):** Foreign replay playback is "Level 1: Replay Compatibility" from `07-CROSS-ENGINE.md` — now with concrete architecture.
- **D023 (OpenRA Vocabulary Compatibility):** The `ForeignReplayCodec` uses the same OpenRA vocabulary mapping (trait names, order names) that D023 established for YAML rules.
- **D025 (Runtime MiniYAML Loading):** OpenRA `.orarep` metadata is MiniYAML — parsed by the same `ra-formats` infrastructure.
- **D027 (Canonical Enum Compatibility):** Foreign order type names (locomotor types, stance names) use D027's enum mappings.

---

---

## D057: LLM Skill Library — Lifelong Learning for AI and Content Generation

**Status:** Settled
**Scope:** `ic-llm`, `ic-ai`, `ic-sim` (read-only via `FogFilteredView`)
**Phase:** Phase 7 (LLM Missions + Ecosystem), with AI skill accumulation feasible as soon as D044 ships
**Depends on:** D016 (LLM-Generated Missions), D034 (SQLite Storage), D041 (AiStrategy), D044 (LLM-Enhanced AI), D030 (Workshop)
**Inspired by:** Voyager (NVIDIA/MineDojo, 2023) — LLM-powered lifelong learning agent for Minecraft with an ever-growing skill library of verified, composable, semantically-indexed executable behaviors

### Problem

IC's LLM features are currently **stateless between sessions**:

- **D044 (`LlmOrchestratorAi`):** Every strategic consultation starts from scratch. The LLM receives game state + `AiEventLog` narrative and produces a `StrategicPlan` with no memory of what strategies worked in previous games. A 100-game-old AI is no smarter than a first-game AI.
- **D016 (mission generation):** Every mission is generated from raw prompts or template-filling. The LLM has no knowledge of which encounter compositions produced missions that players rated highly, completed at target difficulty, or found genuinely fun.
- **D044 (`LlmPlayerAi`):** The experimental full-LLM player repeats the same reasoning mistakes across games because it has no accumulated knowledge of what works in Red Alert.

The scene template library (`04-MODDING.md` § Scene Templates) is a **hand-authored** skill library — pre-built, verified building blocks (ambush, patrol, convoy escort, defend position). But there's no mechanism for the LLM to **discover, verify, and accumulate** its own proven patterns over time.

Voyager (Wang et al., 2023) demonstrated that an LLM agent with a **skill library** — verified executable behaviors indexed by semantic embedding, retrieved by similarity, and composed for new tasks — dramatically outperforms a stateless LLM agent. Voyager obtained 3.3x more unique items and unlocked tech tree milestones 15.3x faster than agents without skill accumulation. The key insight: storing verified skills eliminates catastrophic forgetting and compounds the agent's capabilities over time.

IC already has almost every infrastructure piece needed for this pattern. The missing component is the **verification → storage → retrieval → composition** loop that turns individual LLM outputs into a growing library of proven capabilities.

### Decision

Add a **Skill Library** system to `ic-llm` — a persistent, semantically-indexed store of verified LLM outputs that accumulates knowledge across sessions. The library serves two domains with shared infrastructure:

1. **AI Skills** — strategic patterns verified through gameplay outcomes (D044)
2. **Generation Skills** — mission/encounter patterns verified through player ratings and validation (D016)

Both domains use the same storage format, retrieval mechanism, verification pipeline, and sharing infrastructure. They differ only in what constitutes a "skill" and how verification works.

### Architecture

#### The Skill

A skill is a verified, reusable LLM output with provenance and quality metadata:

```rust
/// A verified, reusable LLM output stored in the skill library.
/// Applicable to both AI strategy skills and content generation skills.
pub struct Skill {
    pub id: SkillId,                        // UUID
    pub domain: SkillDomain,
    pub name: String,                       // human-readable, LLM-generated
    pub description: String,                // semantic description for retrieval
    pub description_embedding: Vec<f32>,    // embedding vector for similarity search
    pub body: SkillBody,                    // the actual executable content
    pub provenance: SkillProvenance,
    pub quality: SkillQuality,
    pub tags: Vec<String>,                  // searchable tags (e.g., "anti-air", "early-game", "naval")
    pub composable_with: Vec<SkillId>,      // skills this has been successfully composed with
    pub created_at: String,                 // ISO 8601
    pub last_used: String,
    pub use_count: u32,
}

pub enum SkillDomain {
    /// Strategic AI patterns (D044) — "how to play"
    AiStrategy,
    /// Mission/encounter generation patterns (D016) — "how to build content"
    ContentGeneration,
}

pub enum SkillBody {
    /// A strategic plan template with parameter bindings.
    /// Used by LlmOrchestratorAi to guide inner AI behavior.
    StrategicPattern {
        /// The situation this pattern addresses (serialized game state features).
        situation: SituationSignature,
        /// The StrategicPlan that worked in this situation.
        plan: StrategicPlan,
        /// Parameter adjustments applied to the inner AI.
        parameter_bindings: Vec<(String, i32)>,
    },
    /// A mission encounter composition — scene templates + parameter values.
    /// Used by D016 mission generation to compose proven building blocks.
    EncounterPattern {
        /// Scene template IDs and their parameter values.
        scene_composition: Vec<SceneInstance>,
        /// Overall mission structure metadata.
        mission_structure: MissionStructureHints,
    },
    /// A raw prompt+response pair that produced a verified good result.
    /// Injected as few-shot examples in future LLM consultations.
    VerifiedExample {
        prompt_context: String,
        response: String,
    },
}

pub struct SkillProvenance {
    pub source: SkillSource,
    pub model_id: Option<String>,           // which LLM model generated it
    pub game_module: String,                // "ra1", "td", etc.
    pub engine_version: String,
}

pub enum SkillSource {
    /// Discovered by the LLM during gameplay or generation, then verified.
    LlmDiscovered,
    /// Hand-authored by a human (e.g., built-in scene templates promoted to skills).
    HandAuthored,
    /// Imported from Workshop.
    Workshop { source_id: String, author: String },
    /// Refined from an LLM-discovered skill by a human editor.
    HumanRefined { original_id: SkillId },
}

pub struct SkillQuality {
    pub verification_count: u32,            // how many times verified
    pub success_rate: f64,                  // wins / uses for AI; completion rate for missions
    pub average_rating: Option<f64>,        // player rating (1-5) for generation skills
    pub confidence: SkillConfidence,
    pub last_verified: String,              // ISO 8601
}

pub enum SkillConfidence {
    /// Passed initial validation but low sample size (< 3 verifications).
    Tentative,
    /// Consistently successful across multiple verifications (3-10).
    Established,
    /// Extensively verified with high success rate (10+).
    Proven,
}
```

#### Storage: SQLite (D034)

Skills are stored in SQLite — same embedded database as all other IC persistent state. No external vector database required.

```sql
CREATE TABLE skills (
    id              TEXT PRIMARY KEY,
    domain          TEXT NOT NULL,       -- 'ai_strategy' | 'content_generation'
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    body_json       TEXT NOT NULL,       -- JSON-serialized SkillBody
    tags            TEXT NOT NULL,       -- JSON array of tags
    game_module     TEXT NOT NULL,
    source          TEXT NOT NULL,       -- 'llm_discovered' | 'hand_authored' | 'workshop' | 'human_refined'
    model_id        TEXT,
    verification_count  INTEGER DEFAULT 0,
    success_rate    REAL DEFAULT 0.0,
    average_rating  REAL,
    confidence      TEXT DEFAULT 'tentative',
    use_count       INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    last_used       TEXT,
    last_verified   TEXT
);

-- FTS5 for text-based skill retrieval (fast, no external dependencies)
CREATE VIRTUAL TABLE skills_fts USING fts5(
    name, description, tags,
    content=skills, content_rowid=rowid
);

-- Embedding vectors stored as BLOBs for similarity search
CREATE TABLE skill_embeddings (
    skill_id        TEXT PRIMARY KEY REFERENCES skills(id),
    embedding       BLOB NOT NULL,       -- f32 array, serialized
    model_id        TEXT NOT NULL         -- which embedding model produced this
);

-- Composition history: which skills have been successfully used together
CREATE TABLE skill_compositions (
    skill_a         TEXT REFERENCES skills(id),
    skill_b         TEXT REFERENCES skills(id),
    success_count   INTEGER DEFAULT 0,
    PRIMARY KEY (skill_a, skill_b)
);
```

**Retrieval strategy (two-tier):**

1. **FTS5 keyword search** — fast, zero-dependency, works offline. Query: `"anti-air defense early-game"` matches skills with those terms in name/description/tags. This is the primary retrieval path and works without an embedding model.
2. **Embedding similarity** — optional, higher quality. If the user's `LlmProvider` (D016) supports embeddings (most do), skill descriptions are embedded at storage time. Retrieval computes cosine similarity between the query embedding and stored embeddings. This is a SQLite scan with in-process vector math — no external vector database.

FTS5 is always available. Embedding similarity is used when an embedding model is configured and falls back to FTS5 otherwise. Both paths return ranked results; the top-K skills are injected into the LLM prompt as few-shot context.

#### Verification Pipeline

The critical difference between a skill library and a prompt cache: **skills are verified**. An unverified LLM output is a candidate; a verified output is a skill.

**AI Strategy verification (D044):**

```
LlmOrchestratorAi generates StrategicPlan
  → Inner AI executes the plan over the next consultation interval
  → Match outcome observed (win/loss, resource delta, army value delta, territory change)
  → If favorable outcome: candidate skill created
  → Candidate includes: SituationSignature (game state features at plan time)
                        + StrategicPlan + parameter bindings + outcome metrics
  → Same pattern used in 3+ games with >60% success → promoted to Established skill
  → 10+ uses with >70% success → promoted to Proven skill
```

`SituationSignature` captures the game state features that made this plan applicable — not the entire state, but the strategically relevant dimensions:

```rust
/// A compressed representation of the game situation when a skill was applied.
/// Used to match current situations against stored skills.
pub struct SituationSignature {
    pub game_phase: GamePhase,              // early / mid / late (derived from tick + tech level)
    pub economy_state: EconomyState,        // ahead / even / behind (relative resource flow)
    pub army_composition: Vec<(String, u8)>, // top unit types by proportion
    pub enemy_composition_estimate: Vec<(String, u8)>,
    pub map_control: f32,                   // 0.0-1.0 estimated map control
    pub threat_level: ThreatLevel,          // none / low / medium / high / critical
    pub active_tech: Vec<String>,           // available tech tiers
}
```

**Content Generation verification (D016):**

```
LLM generates mission (from template or raw)
  → Schema validation passes (valid unit types, reachable objectives, balanced resources)
  → Player plays the mission
  → Outcome observed: completion (yes/no), time-to-complete, player rating (if provided)
  → If completed + rated ≥ 3 stars: candidate encounter skill created
  → Candidate includes: scene composition + parameter values + mission structure + rating
  → Aggregated across 3+ players/plays with avg rating ≥ 3.5 → Established
  → Workshop rating data (if published) feeds back into quality scores
```

**Automated pre-verification (no player required):**

For AI skills, headless simulation provides automated verification:

```
ic skill verify --domain ai --games 20 --opponent "IC Default Hard"
```

This runs the AI with each candidate skill against a reference opponent headlessly, measuring win rate. Skills that pass automated verification at a lower threshold (>40% win rate against Hard AI) are promoted to `Tentative`. Human play promotes them further.

#### Prompt Augmentation — How Skills Reach the LLM

When the `LlmOrchestratorAi` or mission generator prepares a prompt, the skill library injects relevant context:

```rust
/// Retrieves relevant skills and augments the LLM prompt.
pub struct SkillRetriever {
    db: SqliteConnection,
    embedding_provider: Option<Box<dyn EmbeddingProvider>>,
}

impl SkillRetriever {
    /// Find skills relevant to the current context.
    /// Returns top-K skills ranked by relevance, filtered by domain and game module.
    pub fn retrieve(
        &self,
        query: &str,
        domain: SkillDomain,
        game_module: &str,
        max_results: usize,
    ) -> Vec<Skill> {
        // 1. Try embedding similarity if available
        // 2. Fall back to FTS5 keyword search
        // 3. Filter by confidence >= Tentative
        // 4. Rank by (relevance_score * quality.success_rate)
        // 5. Return top-K
        ...
    }

    /// Format retrieved skills as few-shot context for the LLM prompt.
    pub fn format_as_context(&self, skills: &[Skill]) -> String {
        // Each skill becomes a "Previously successful approach:" block
        // in the prompt, with situation → plan → outcome
        ...
    }
}
```

**In the orchestrator prompt flow (D044):**

```
System prompt (from llm/prompts/orchestrator.yaml)
  + "Previously successful strategies in similar situations:"
  + [top 3-5 retrieved AI skills, formatted as situation/plan/outcome examples]
  + "Current game state:"
  + [serialized FogFilteredView]
  + "Recent events:"
  + [event_log.to_narrative(since_tick)]
  → LLM produces StrategicPlan
    (informed by proven patterns, but free to adapt or deviate)
```

**In the mission generation prompt flow (D016):**

```
System prompt (from llm/prompts/mission_generator.yaml)
  + "Encounter patterns that players enjoyed:"
  + [top 3-5 retrieved generation skills, formatted as composition/rating examples]
  + Campaign context (skeleton, current act, character states)
  + Player preferences
  → LLM produces mission YAML
    (informed by proven encounter patterns, but free to create new ones)
```

The LLM is never forced to use retrieved skills — they're few-shot examples that bias toward proven patterns while preserving creative freedom. If the current situation is genuinely novel (no similar skills found), the retrieval returns nothing and the LLM operates as it does today — statelessly.

#### Skill Composition

Complex gameplay requires combining multiple skills. Voyager's key insight: skills compose — "mine iron" + "craft furnace" + "smelt iron ore" compose into "make iron ingots." IC skills compose similarly:

**AI skill composition:**
- "Rush with light vehicles at 5:00" + "transition to heavy armor at 12:00" = an early-aggression-into-late-game strategic arc
- The `composable_with` field and `skill_compositions` table track which skills have been successfully used in sequence
- The orchestrator can retrieve a *sequence* of skills for different game phases, not just a single skill for the current moment

**Generation skill composition:**
- "bridge_ambush" + "timed_extraction" + "weather_escalation" = a specific mission pattern
- This is exactly the existing scene template hierarchy (`04-MODDING.md` § Template Hierarchy), but with LLM-discovered compositions alongside hand-authored ones
- The `EncounterPattern` skill body stores the full composition — which scene templates, in what order, with what parameter values

#### Workshop Distribution (D030)

Skill libraries are Workshop-shareable resources:

```yaml
# workshop/my-ai-skill-library/resource.yaml
type: skill_library
display_name: "Competitive RA1 AI Strategies"
description: "150 verified strategic patterns learned over 500 games against Hard AI"
game_module: ra1
domain: ai_strategy
skill_count: 150
average_confidence: proven
license: CC-BY-SA-4.0
ai_usage: Allow
```

**Sharing model:**
- Players export their skill library (or a curated subset) as a Workshop package
- Other players subscribe and merge into their local library
- Skill provenance tracks origin — `Workshop { source_id, author }`
- Community curation: Workshop ratings on skill libraries indicate quality
- AI tournament leaderboards (D043) can require contestants to publish their skill libraries, creating a knowledge commons

**Privacy:**
- Skill libraries contain **no player data** — only LLM outputs, game state features, and outcome metrics
- No replays, no player names, no match IDs in the exported skill data
- A skill that says "rush at 5:00 with 3 light tanks against enemy who expanded early" reveals a strategy, not a person

#### Skill Lifecycle

```
1. DISCOVERY      LLM generates an output (StrategicPlan or mission content)
        ↓
2. EXECUTION      Output is used in gameplay or mission play
        ↓
3. EVALUATION     Outcome measured (win/loss, rating, completion)
        ↓
4. CANDIDACY      If outcome meets threshold → candidate skill created
        ↓
5. VERIFICATION   Same pattern reused 3+ times with consistent success → Established
        ↓
6. PROMOTION      10+ verifications with high success → Proven
        ↓
7. RETRIEVAL      Proven skills injected as few-shot context in future LLM consultations
        ↓
8. COMPOSITION    Skills used together successfully → composition recorded
        ↓
9. SHARING        Player exports library to Workshop; community benefits
```

**Skill decay:** Skills verified against older engine versions may become less relevant as game balance changes. Skills include `engine_version` in provenance. A periodic maintenance pass (triggered by engine update) re-validates `Proven` skills by running them through headless simulation. Skills that fall below threshold are downgraded to `Tentative` rather than deleted — balance might revert, or the pattern might work in a different context.

**Skill pruning:** Libraries grow unboundedly without curation. Automatic pruning removes skills that are: (a) `Tentative` for >30 days with no additional verifications, (b) `use_count == 0` for >90 days, or (c) superseded by a strictly-better skill (same situation, higher success rate). Manual pruning via `ic skill prune` CLI. Users set a max library size; pruning prioritizes keeping `Proven` skills and removing `Tentative` duplicates.

### Embedding Provider

Embeddings require a model. IC does not ship one — same BYOLLM principle as D016:

```rust
/// Produces embedding vectors from text descriptions.
/// Optional — FTS5 provides retrieval without embeddings.
pub trait EmbeddingProvider: Send + Sync {
    fn embed(&self, text: &str) -> Result<Vec<f32>>;
    fn embedding_dimensions(&self) -> usize;
    fn model_id(&self) -> &str;
}
```

Built-in implementations:
- `OpenAIEmbeddings` — uses OpenAI's `text-embedding-3-small` (or compatible API)
- `OllamaEmbeddings` — uses any Ollama model with embedding support (local, free)
- `NoEmbeddings` — disables embedding similarity; FTS5 keyword search only

The embedding model is configured alongside the `LlmProvider` in D047's task routing table. If no embedding provider is configured, the skill library works with FTS5 only — slightly lower retrieval quality, but fully functional offline with zero external dependencies.

### CLI

```
ic skill list [--domain ai|content] [--confidence proven|established|tentative] [--game-module ra1]
ic skill show <skill-id>
ic skill verify --domain ai --games 20 --opponent "IC Default Hard"
ic skill export [--domain ai] [--confidence established+] -o skills.icpkg
ic skill import skills.icpkg [--merge|--replace]
ic skill prune [--max-size 500] [--dry-run]
ic skill stats     # library overview: counts by domain/confidence/game module
```

### What This Is NOT

- **NOT fine-tuning.** The LLM model parameters are never modified. Skills are retrieved context (few-shot examples), not gradient updates. Users never need GPU training infrastructure.
- **NOT a replay database.** Skills store compressed patterns (situation signature + plan + outcome), not full game replays. A skill is ~1-5 KB; a replay is ~2-5 MB.
- **NOT required for any LLM feature to work.** All LLM features (D016, D044) work without a skill library — they just don't improve over time. The library is an additive enhancement, not a prerequisite.
- **NOT a replacement for hand-authored content.** The built-in scene templates, AI behavior presets (D043), and campaign content (D021) are hand-crafted and don't depend on the skill library. The library augments LLM capabilities; it doesn't replace authored content.

### Alternatives Considered

- **Full model fine-tuning per user** (rejected — requires GPU infrastructure, violates BYOLLM portability, incompatible with API-based providers, and risks catastrophic forgetting of general capabilities)
- **Replay-as-skill (store full replays as skills)** (rejected — replays are too large and unstructured for retrieval; skills must be compressed to situation+plan patterns that fit in a prompt context window)
- **External vector database (Pinecone, Qdrant, Chroma)** (rejected — violates D034's "no external DB" principle; SQLite + FTS5 + in-process vector math is sufficient for a skill library measured in hundreds-to-thousands of entries, not millions)
- **Skills stored in the LLM's context window only (no persistence)** (rejected — context windows are bounded and ephemeral; the whole point is cross-session accumulation)
- **Shared global skill library** (rejected — violates local-first privacy principle; players opt in to sharing via Workshop, never forced; global aggregation risks homogenizing strategies)
- **AI training via reinforcement learning instead of skill accumulation** (rejected — RL requires model parameter access, massive compute, and is incompatible with BYOLLM API models; skill retrieval works with any LLM including cloud APIs)

### Integration with Existing Decisions

- **D016 (LLM Missions):** Generation skills are accumulated from D016's mission generation pipeline. The template-first approach (`04-MODDING.md` § LLM + Templates) benefits most — proven template parameter combinations become generation skills, dramatically improving template-filling reliability.
- **D034 (SQLite):** Skill storage uses the same embedded SQLite database as replay catalogs, match history, and gameplay events. New tables, same infrastructure. FTS5 is already available for search.
- **D041 (AiStrategy):** The `AiEventLog`, `FogFilteredView`, and `set_parameter()` infrastructure provide the verification feedback loop. Skill outcomes are measured through the same event pipeline that informs the orchestrator.
- **D043 (AI Presets):** Built-in AI behavior presets can be promoted to hand-authored skills in the library, giving the retrieval system access to the same proven patterns that the preset system encodes — but indexed for semantic search rather than manual selection.
- **D044 (LLM AI):** AI strategy skills directly augment the orchestrator's consultation prompts. The `LlmOrchestratorAi` becomes the primary skill producer and consumer. The `LlmPlayerAi` also benefits — its reasoning improves with proven examples in context.
- **D047 (LLM Configuration Manager):** The embedding provider is configured alongside other LLM providers in D047's task routing table. Task: `embedding` → Provider: Ollama/OpenAI.
- **D030 (Workshop):** Skill libraries are Workshop resources — shareable, versionable, ratable. AI tournament communities can maintain curated skill libraries.
- **D031 (Observability):** Skill retrieval, verification, and promotion events are logged as telemetry events — observable in Grafana dashboards for debugging skill library behavior.

### Relationship to Voyager

IC's skill library adapts Voyager's three core insights to the RTS domain:

| Voyager Concept                                 | IC Adaptation                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Skill = executable JavaScript function**      | Skill = `StrategicPlan` (AI) or `EncounterPattern` (generation) — domain-specific executable content                                                                     |
| **Skill verification via environment feedback** | Verification via match outcome (AI) or player rating + schema validation (generation)                                                                                    |
| **Embedding-indexed retrieval**                 | Two-tier: FTS5 keyword (always available) + optional embedding similarity                                                                                                |
| **Compositional skills**                        | `composable_with` + `skill_compositions` table; scene template hierarchy for generation                                                                                  |
| **Automatic curriculum**                        | Not directly adopted — IC's curriculum is human-driven (player picks missions, matchmaking picks opponents). The skill library accumulates passively during normal play. |
| **Iterative prompting with self-verification**  | Schema validation + headless sim verification (`ic skill verify`) replaces Voyager's in-environment code testing                                                         |

The key architectural difference: Voyager's agent runs in a single-player sandbox with fast iteration loops (try code → observe → refine → store). IC's skills accumulate more slowly — each verification requires a full game or mission play. This means IC's library grows over days/weeks rather than hours, but the skills are verified against real gameplay rather than sandbox experiments, producing higher-quality patterns.

---

