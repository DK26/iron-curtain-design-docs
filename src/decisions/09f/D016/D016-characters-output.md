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

// --- Types referenced above but not yet defined ---

/// The high-level campaign arc generated once at campaign start.
/// Mirrors the YAML skeleton shown above, but typed for Rust consumption.
pub struct CampaignSkeleton {
    pub id: String,                    // e.g. "gen_soviet_2026-02-14_001"
    pub title: String,
    pub faction: String,
    pub enemy_faction: String,
    pub theater: String,
    pub length: u32,                   // total missions (0 = open-ended)
    pub arc: CampaignArc,
    pub characters: Vec<CharacterState>,
    pub backstory: String,
    pub branch_points: Vec<PlannedBranchPoint>,
}

pub struct CampaignArc {
    pub act_1: String,                 // e.g. "Establishing foothold (missions 1-8)"
    pub act_2: String,
    pub act_3: String,
}

pub struct PlannedBranchPoint {
    pub mission: u32,                  // approximate mission number
    pub theme: String,                 // e.g. "betray or protect civilian population"
}

/// All player-chosen parameters from the campaign setup screen.
pub struct CampaignParameters {
    pub faction: String,
    pub campaign_length: u32,          // 8, 16, 24, 32, or 0 for open-ended
    pub branching_density: BranchingDensity,
    pub tone: String,                  // "military_thriller", "pulp_action", etc.
    pub story_style: String,           // "cnc_classic", "realistic_military", etc.
    pub difficulty_curve: DifficultyCurve,
    pub roster_persistence: bool,
    pub named_character_count: u8,     // 3-5 typically
    pub theater: String,               // "european", "arctic", "random", etc.
    pub game_module: String,
    // Advanced parameters
    pub mission_variety: String,       // "balanced", "assault_heavy", "defense_heavy"
    pub faction_purity_permille: u16,  // 0-1000, default 900
    pub resource_level: String,        // "scarce", "standard", "abundant"
    pub weather_variation: bool,
    pub custom_instructions: String,   // freeform player text
    pub moral_complexity: MoralComplexity,
    pub victory_conditions: Vec<String>, // for open-ended campaigns
}

pub enum BranchingDensity { Low, Medium, High }
pub enum DifficultyCurve { Flat, Escalating, Adaptive, Brutal }
pub enum MoralComplexity { Low, Medium, High }

/// Compressed roster state for LLM prompts — not individual unit state.
pub struct RosterSummary {
    pub unit_counts: HashMap<String, u32>,   // unit_type → count
    pub veterancy_distribution: [u32; 4],    // count at each vet level (0-3)
    pub named_units: Vec<NamedUnitSummary>,  // hero units, named vehicles, etc.
    pub total_value: i32,                    // approximate resource value of roster
    pub army_composition: String,            // "armor-heavy", "balanced", "infantry-focused"
}

pub struct NamedUnitSummary {
    pub name: String,
    pub unit_type: String,
    pub veterancy: u8,
    pub kills: u32,
    pub missions_survived: u32,
}

/// A story thread the LLM is tracking across the campaign.
pub struct NarrativeThread {
    pub id: String,                         // e.g. "sonya_betrayal"
    pub title: String,                      // "Sonya's hidden agenda"
    pub status: ThreadStatus,
    pub involved_characters: Vec<String>,   // character names
    pub foreshadowed_in: Vec<u32>,          // mission numbers where hints were dropped
    pub expected_resolution_mission: Option<u32>, // approximate planned reveal
    pub resolution_conditions: Vec<String>, // e.g. "loyalty < 40", "player chose ruthless path"
    pub notes: String,                      // LLM's internal notes about this thread
}

pub enum ThreadStatus {
    Foreshadowing,   // hints being dropped
    Rising,          // tension building
    Active,          // thread is the current focus
    Resolved,        // payoff delivered
    Abandoned,       // player's choices made this thread irrelevant
}

/// Snapshot of player behavior from D042 event classification.
/// Informs LLM about how the player actually plays.
pub struct PlayerBehaviorSnapshot {
    pub aggression_score: u16,         // 0-1000, higher = more aggressive
    pub micro_intensity: u16,          // 0-1000, higher = more active micro
    pub tech_rush_tendency: u16,       // 0-1000, higher = prefers tech over mass
    pub expansion_rate: u16,           // 0-1000, higher = expands faster
    pub preferred_unit_mix: Vec<(String, u16)>, // (unit_type, usage_permille)
    pub risk_tolerance: u16,           // 0-1000, higher = takes more risks
    pub economy_focus: u16,            // 0-1000, higher = prioritizes economy
    pub naval_preference: u16,         // 0-1000, usage of naval units
    pub air_preference: u16,           // 0-1000, usage of air units
}

/// State of enemy forces at mission end.
pub enum EnemyState {
    Annihilated,                       // no enemy forces remain
    Retreated { direction: String },   // enemy pulled back
    Regrouping { estimated_strength: u16 }, // reforming for counter-attack
    Entrenched { position: String },   // holding defensive position
    Reinforcing { from: String },      // receiving reinforcements
}

/// Performance metrics for a completed mission.
pub struct MissionPerformance {
    pub time_seconds: u32,             // mission duration
    pub efficiency_score: u16,         // 0-1000, resources_destroyed / resources_spent
    pub units_lost: u32,
    pub units_killed: u32,
    pub structures_destroyed: u32,
    pub objectives_completion_rate: u16, // 0-1000, completed / total objectives
    pub territory_control_permille: u16, // 0-1000, map area controlled at end
    pub economy_rating: u16,           // 0-1000, resource management quality
    pub micro_rating: u16,             // 0-1000, unit preservation efficiency
}
```

> **Schema cross-reference:** For the full concrete YAML output schemas (map layout, actor placement, objectives, outcomes, Lua triggers) and prompt templates used by the LLM to generate these structures, see `research/llm-generation-schemas.md`.

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

