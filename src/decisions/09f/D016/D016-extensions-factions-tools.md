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


---

## Sub-Pages

| Section | File |
| --- | --- |
| LLM-Generated Custom Factions & Editor Tool Bindings | [D016-factions-editor-tools.md](D016-factions-editor-tools.md) |
