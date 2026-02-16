# Vote & Callvote System Analysis — Cross-Game Survey for Iron Curtain

> **Purpose:** Research vote systems across competitive multiplayer games with emphasis on RTS team games. Inform the design of IC's in-match vote framework.
>
> **Date:** 2025-07
>
> **Scope:** In-match governance votes (surrender, kick, remake, pause, draw). Not lobby/pre-game configuration (handled by lobby settings) or community governance (D037).

---

## 1. The Core Problem

In team multiplayer games, individual players need a mechanism to propose binding decisions that affect the entire team or match. Without such a mechanism, players resort to:

- Leaving the game silently (no clean exit → punished by ranked systems)
- Griefing (sabotaging the team when they want to leave but teammates don't)
- External coordination (Discord, voice) that excludes teammates not on the same channel
- Passive non-participation (AFK or minimal effort)

The vote system is **match governance** — a structured way for players to collectively decide match-level questions. It is distinct from tactical coordination (pings, chat wheel, markers — covered by D059).

---

## 2. Cross-Game Analysis

### 2.1 FPS Games (Most Mature Vote Systems)

#### Counter-Strike 2 (CS2)

CS2 has the most influential callvote system in competitive gaming.

**Available vote types:**
| Vote Type        | Scope                             | Threshold                     | Cooldown                      | Context                              |
| ---------------- | --------------------------------- | ----------------------------- | ----------------------------- | ------------------------------------ |
| Kick player      | Team                              | Majority (4/5 in competitive) | 1 per player per half         | Can't kick in last 3 rounds          |
| Tactical timeout | Team (no vote — captain calls it) | N/A                           | 2 per team per half, 30s each | Pauses match for strategy discussion |
| Surrender        | Team                              | Unanimous (5/5)               | Once per half                 | Only after teammate abandons         |
| Map change       | All                               | Majority                      | N/A                           | Casual only                          |

**Key design choices:**
- **Prominent UI:** Vote bar appears center-screen with F1/F2 keys. Impossible to miss.
- **Brief duration:** 30-second vote window. No dragging it out.
- **Surrender gated on context:** Can only surrender after a teammate has been kicked or abandoned. Prevents premature giving up.
- **Kick has real consequences:** Kicked player receives a competitive cooldown (same as abandoning). Prevents "vote to kick then immediately rejoin" loops.
- **Anti-abuse:** You can only initiate 3 votes per match. Failed votes have a cooldown. You can't kick the last surviving teammate.

**What works:** The simplicity. Binary vote (F1/F2). Clear UI. Fast resolution. Players understand it immediately.

**What doesn't:** Kick-voting is weaponized against players who are underperforming but not griefing. "Bottom-fragging" is not a valid kick reason, but it's the most common one. Four-stack premades can bully the solo player.

#### Valorant

**Available vote types:**
| Vote Type | Threshold                           | Notes                                  |
| --------- | ----------------------------------- | -------------------------------------- |
| Surrender | Unanimous before round 8, 4/5 after | Must type `/ff` or use menu            |
| Remake    | 4/4 (minus disconnected player)     | First round only, someone disconnected |

**Key design choices:**
- **No kick vote.** Riot explicitly removed kick voting because it was too easily abused. Griefers are handled post-match via behavioral systems.
- **Context-sensitive thresholds:** Surrender requires unanimity early (prevents "one bad round" rage-quits) but relaxes later when the game might genuinely be lost.
- **Remake is narrowly scoped:** Only in the first round, only when someone didn't connect. Prevents mid-game abuse.

**Lesson for IC:** Fewer vote types can be better than more. Valorant's decision to remove kick voting was controversial but reduced toxicity. The trade-off: griefers can't be immediately removed, but neither can innocent players.

#### Team Fortress 2

**Available vote types:**
| Vote Type      | Scope                     | Notes    |
| -------------- | ------------------------- | -------- |
| Kick player    | All players on the server | Majority |
| Change map     | All players               | Majority |
| Scramble teams | All players               | Majority |
| Restart game   | All players               | Majority |

**Problems:**
- **Rampant abuse.** TF2's vote kick is one of the most frequently criticized systems in gaming. Bot attacks (automated programs joining servers and vote-kicking real players) were endemic for years.
- **No protection for minorities.** A group of 6 friends can dominate a 12-player server's votes.
- **No context requirements.** You can kick anyone for any reason (or no reason) at any time.

**Lesson for IC:** Unrestricted vote-kick is dangerous. Protections are essential: minimum game time, no kicking the last player, cooldowns, behavioral tracking of vote initiators.

#### Overwatch 2

**No vote system at all.** Blizzard removed all player voting and relies entirely on automated behavioral detection (endorsement system, ML-based griefing detection). Players can only report; they cannot take immediate collective action.

**Lesson for IC:** The absence of a vote system is also a valid design choice — but only if you have robust automated moderation. IC's open-source, self-hosted server model means automated ML moderation is impractical. Player agency via voting fills this gap.

### 2.2 MOBA Games

#### Dota 2

**Available vote types:**
| Vote Type      | Scope                   | Threshold                    | Notes                             |
| -------------- | ----------------------- | ---------------------------- | --------------------------------- |
| Pause          | Any player (no vote)    | Anyone can unpause after 30s | 3 pauses per player per game      |
| Remake         | Team                    | Any "yes"                    | First 5 min, someone disconnected |
| Team surrender | Not available in ranked | —                            | Only in private lobbies           |

**Key design choices:**
- **No surrender in ranked.** This is Valve's most distinctive choice. The reasoning: allowing surrender creates a "giving up culture" where teams surrender at the first sign of adversity, eliminating comeback potential. Dota 2 has some of gaming's most legendary comebacks precisely because teams can't give up.
- **Permissive pause:** Anyone can pause, no vote required. But anyone can also unpause (opponent after 30s, teammate immediately). This trusts players to self-regulate.
- **Remake is very lenient:** Only one "yes" vote needed for remake, because nobody should be forced to play 4v5 from minute zero.

**Lesson for IC:** The no-surrender-in-ranked debate is one of the most divisive in competitive gaming. IC's approach (D055: allow surrender but gate it behind 5-minute minimum and team vote) is a reasonable middle ground. The Dota 2 approach works for a game with massive player base and long average match times — RTS matches are shorter, and the C&C community generally expects a `/gg` option.

#### League of Legends

**Available vote types:**
| Vote Type         | Threshold                      | Context                                |
| ----------------- | ------------------------------ | -------------------------------------- |
| Early surrender   | Unanimous (5/5)                | Before 20 minutes                      |
| Regular surrender | 4/5 (80%)                      | After 20 minutes                       |
| Remake            | Any "yes" (minus disconnected) | Before 3 minutes, someone disconnected |

**Key design choices:**
- **Tiered surrender thresholds:** Unanimity early, majority later. This elegantly balances "don't give up too easily" with "respect the team's judgment when the game is clearly lost."
- **No kick vote.** Like Valorant, Riot decided kick voting creates more problems than it solves.
- **Surrender spam cooldown:** 3-minute cooldown between failed votes. Prevents the "surrender vote every minute" tilting problem.

**Lesson for IC:** Tiered thresholds based on game phase are a strong pattern. IC should adopt this: stricter thresholds early, relaxed thresholds later.

### 2.3 RTS Games (Primary Category)

#### StarCraft 2

**No vote system.** SC2 is overwhelmingly a 1v1 game. Players leave when they've lost — there's no team to coordinate with. Team games (2v2–4v4) exist but have minimal support: individual resign, no team vote, no coordination tools beyond chat.

**Lesson for IC:** SC2's approach is unsuitable for IC. C&C has always had a stronger team game tradition (2v2 and 3v3 are common in Red Alert competitive play). IC must design for team games as a first-class mode.

#### Age of Empires II / IV

**No formal vote system.** Players can:
- Resign individually (your units die or transfer to allies, depending on game settings)
- Diplomacy changes (ally → enemy, in some modes)
- Signal/flare (alert teammates to a location)

AoE has no team surrender vote, no kick mechanic, and no remake option. Team coordination relies entirely on voice/chat and the signal flare.

**Lesson for IC:** AoE's minimal approach works for its more casual team game culture, but competitive AoE2 team games (which can last 60+ minutes) frequently suffer from "that one teammate who won't resign" — a problem a vote system would solve.

#### Forged Alliance Forever (FAF)

FAF is the most relevant reference for IC — it's the premier competitive team RTS platform (Supreme Commander: Forged Alliance).

**Available vote types:**
| Vote Type    | Scope       | Implementation            |
| ------------ | ----------- | ------------------------- |
| Draw         | All players | Both teams must agree     |
| Kick (lobby) | Host        | Not a vote — host decides |

**In-game coordination:**
- Pings and markers (similar to IC's D059)
- Shared army mode (unique to FAF — all players on a team control all units)
- Rating-based team construction (automatic, not voted)

**Key observations:**
- FAF has *no* in-game kick vote. Griefers are handled post-game via the moderation team and reputation system.
- FAF's draw vote requires *both teams* to agree — neither team can unilaterally force a draw. This is important: a draw vote is fundamentally different from a surrender vote (surrender is one-sided).
- The most requested features on FAF's forums include: team surrender vote (frequently), kick vote (occasionally, controversial), and remake vote (rarely — FAF's lobby system catches most issues pre-game).

**Lesson for IC:** FAF's draw mechanic (both teams agree) is the right model for IC's draw vote. Surrender is one-sided (your team only). Draw is mutual, and the threshold should be cross-team unanimous.

#### Beyond All Reason (BAR) / Spring Engine

BAR is the other major active competitive RTS, built on Spring Engine.

**Available vote types (via `!vote` command):**
| Vote Type               | Scope               | Threshold            |
| ----------------------- | ------------------- | -------------------- |
| `!vote kick <player>`   | All players         | Majority             |
| `!vote resign`          | Team                | Majority             |
| `!vote mapchange <map>` | All players (lobby) | Majority             |
| `!vote forcestart`      | All players (lobby) | Majority             |
| `!vote stop`            | N/A                 | Cancels pending vote |

**Key observations:**
- **`!vote` is a generic framework.** Any vote type is dispatched through the same command pattern. This is extensible — community mods and autohost bots add custom vote types.
- **Autohost bots manage votes.** The Spring lobby system uses bots (SPADS, etc.) that handle vote processing server-side. The game engine itself has minimal vote awareness.
- **Kick requires all-player majority** (not team-only). This prevents one team from kicking opponents, but also means the enemy team can vote to keep a griefer on your team.

**Lesson for IC:** The generic `!vote <type>` pattern is clean, extensible, and proven. IC should adopt a similar generic framework rather than hardcoding individual vote types. Spring's approach places vote processing in the autohost bot (server-side); IC's equivalent is the relay server for relay-enforced votes, with the sim handling deterministic state changes. See § 5.4 for IC's recommended hybrid approach: sim-processed with relay assistance.

#### Warzone 2100

From our existing research (`research/0ad-warzone2100-netcode-analysis.md`):

**Available vote types:**
- Kick vote: majority of connected players

**Key observations:**
- Minimal but functional. The kick vote plus host controls handles the most critical cases.
- WZ2100 tracks kicked players per session, preventing rejoin in the same role.

#### C&C Generals / Zero Hour (EA)

From our existing research (`research/generals-zero-hour-netcode-analysis.md`):

**Disconnect vote:** When a player appears disconnected, remaining players vote on who to disconnect (`NETCOMMANDTYPE_DISCONNECTVOTE`). This is unique — it's not a governance vote (kick a griefer) but an arbitration vote (collectively agree on a factual question about who actually dropped).

**Key observations:**
- Generals treats voting as dispute resolution, not governance.
- The disconnect vote protocol coordinates with a specific frame number for deterministic removal.
- EA apparently envisioned the disconnect vote as a fairness mechanism for P2P topology where blame attribution is ambiguous.

**Lesson for IC:** IC's relay server knows who disconnected (it has direct connections to all players), so Generals' disconnect vote isn't needed. But the concept of "votes as collective fact-finding" is interesting for edge cases.

### 2.4 Other Relevant Games

#### Minecraft (Community Servers)

Many Minecraft servers implement vote systems via plugins:
- Vote kick, vote ban, vote map, vote gamemode
- The Brigadier command framework (which IC adopts for D058) originated in Minecraft
- Votes are typically server-plugin-managed, not built into the engine

**Lesson for IC:** Modder-extensible vote types (via Lua/WASM) mirror Minecraft's plugin vote model. The engine provides the framework; content provides the vote types.

#### iRacing / F1 Games

Racing games have race restart votes and incident penalty votes. These are interesting because they involve:
- Voting on something that already happened (was this incident my fault?)
- Voting to reset shared state (restart the race)

**Lesson for IC:** Could inspire "incident review" votes in tournament mode — when something controversial happens, players vote on whether it was fair. This is a future consideration, not a launch feature.

---

## 3. Cross-Game Patterns

### 3.1 Universal Vote Design Patterns

Every successful vote system shares these elements:

| Pattern                 | Description                                               | Adopted By                      |
| ----------------------- | --------------------------------------------------------- | ------------------------------- |
| **Binary choice**       | Yes/No. No ranked-choice, no multi-option.                | All                             |
| **Short duration**      | 15-45 seconds. Longer durations drag on gameplay.         | CS2 (30s), LoL (60s), BAR (30s) |
| **Cooldown on failure** | Failed votes can't be immediately retried.                | CS2, LoL (3min), Dota 2, BAR    |
| **Rate limiting**       | Max votes per player per match.                           | CS2 (3), LoL (1 per 3min), BAR  |
| **Prominent UI**        | Impossible to miss. Center-screen or prominent overlay.   | CS2 (center), LoL (right panel) |
| **Default = No**        | Non-voters are counted as "no" (prevents AFK abuse).      | CS2, LoL, Valorant              |
| **Recorded in replay**  | Votes and individual choices visible in post-game review. | CS2, Dota 2                     |

### 3.2 Patterns That FAILED

| Anti-Pattern                        | Problem                                                            | Examples                |
| ----------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| **Unrestricted kick**               | Weaponized against underperformers, minorities, solo queue players | TF2, early CS:GO        |
| **No minimum game time**            | Used to troll in the first seconds of a match                      | Various                 |
| **All-chat vote proposals**         | Enemy team votes to keep your griefer                              | Early BAR issues        |
| **No cooldown**                     | Spam surrender votes to tilt teammates                             | Pre-patch LoL           |
| **Majority kick in premade groups** | 4-stack premades bully the solo player                             | TF2, CS:GO              |
| **Anonymous votes**                 | No accountability for vote patterns                                | Removed from most games |
| **Surrender too easy**              | "Giving up culture," lost comeback potential                       | Classic FPS pubs        |

### 3.3 The Kick Vote Debate

The most divisive vote type across all competitive games. The positions:

**Pro kick vote:**
- Immediate remedy for griefers (AFK, team-killing, sabotage)
- Empowers the team to self-moderate without waiting for admin
- Necessary when automated moderation is insufficient

**Anti kick vote:**
- Easily weaponized against underperformers (not the same as griefers)
- Premade groups bully solo players
- Cold starts: new players get kicked for being bad, not for griefing
- Creates a hostile environment — the threat of being kicked adds social pressure

**Industry trend:** Newer competitive games (Valorant, OW2) have moved away from kick voting, relying on automated detection + post-game reports. Older games (CS2, TF2, BAR) retain it. The split correlates with publisher resources — free kick voting is a "cheap" moderation tool for games that can't afford ML detection.

**IC's position:** IC is open-source with community-operated servers. ML-based moderation is impractical (no centralized data pipeline, no dedicated trust & safety team). Kick voting is the pragmatic choice, but with strong anti-abuse protections:
- Team-only scope (can't kick opponents)
- Anti-premade protection (premade group members count as a single vote)
- Can't kick the last player or a player with >50% of team army value
- Kick proposals require a reason (from predefined list, to prevent harassment in the reason text)
- Kicked player's units are redistributed to team, not destroyed (preserving competitive integrity)

---

## 4. RTS-Specific Considerations

### 4.1 Why RTS Team Games Need Votes More Than FPS

| Factor                       | FPS (CS2)                              | RTS (IC)                                                   | Implication                                               |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| **Match length**             | 30-45 min (half-based)                 | 20-60 min (continuous)                                     | Longer commitment → more need for clean exit              |
| **Player elimination**       | Dead players respawn or wait for round | Eliminated players watch or leave                          | Once a teammate is eliminated, the game may be unwinnable |
| **Griefing surface**         | Limited (team damage, blocking)        | Huge (wrong buildings, feeding units, blocking expansions) | More subtle griefing → harder for automated detection     |
| **Impact of leaving**        | 4v5 is playable (CS2)                  | 1v2 is usually unwinnable (RTS)                            | Leavers have outsized impact → need vote to end cleanly   |
| **Comeback potential**       | High (economy resets each round)       | Lower (permanent economic damage)                          | RTS games decided earlier → surrender is more reasonable  |
| **Communication dependency** | Moderate (callouts)                    | High (coordinated attacks, shared economy)                 | Teams that can't coordinate are at a huge disadvantage    |

### 4.2 RTS-Specific Vote Types Beyond Standard Match Governance

Standard votes (surrender, kick, remake) apply universally. But RTS games have unique coordination needs that could benefit from lightweight voting:

1. **AI Takeover Vote:** When a teammate disconnects, vote to replace them with AI (vs. redistribute units, vs. playing short-handed). This is an RTS-specific option because RTS AI is functional enough to control a base.

2. **Shared Vision Vote:** In some game modes, teams start without shared vision and can vote to enable it. (Not relevant for default RA1 rules where team vision is always shared, but relevant for custom game modes.)

3. **Draw by Mutual Agreement:** Both teams agree the game is stalemated. This is an RTS-specific need — FPS games have round limits that prevent stalemates. RTS games can theoretically last forever. FAF's draw vote is the model.

4. **Time Extension Vote:** For games with a time limit (tournament rules), vote to extend. Both teams must agree.

### 4.3 The "Won't Resign" Problem

The most common frustration in RTS team games: a teammate refuses to resign when the game is clearly lost. The rest of the team wants to move on, but one player insists on playing out a lost position. Without a vote system:
- Teammates leave one by one, receiving abandon penalties
- The remaining player plays a 1v4, wasting everyone's time
- The opponents are trapped waiting for a game that's already decided

**Solution:** Team surrender vote with a ⅔ or ¾ majority threshold (never unanimous — unanimity gives one player veto power over the entire team). This is exactly what IC's existing surrender vote design (03-NETCODE.md) already specifies:
- 2v2: Both agree (unanimous — but with only 2 players, this is equivalent to majority)
- 3v3: 2 of 3 (⅔)
- 4v4: 3 of 4 (¾)

IC's existing design is correct. The framework should generalize it.

---

## 5. Design Recommendations for Iron Curtain

### 5.1 Core Principles

1. **Generic framework, specific types.** One vote infrastructure handles all vote types. Individual types are data (YAML-configured), not code.
2. **Deterministic where needed.** Votes that affect sim state (surrender, pause) are `PlayerOrder` variants. Votes that affect the connection layer (kick, remake) are relay-managed but recorded in the order stream for replay.
3. **Anti-abuse by default.** Every vote type has minimum game time, cooldowns, rate limits, and behavioral tracking. Tournament organizers can relax constraints; they cannot remove them entirely.
4. **Modder-extensible.** Game modules (RA1, TD, custom) register vote types via YAML. Complex vote logic uses Lua/WASM callbacks.
5. **Transparent.** All votes and individual choices are recorded in the replay. No secret votes.
6. **Default-deny.** Non-voters count as "no." Abstention is a valid choice (explicit opt-out), but silence is denial.
7. **Server-configurable.** Community operators (D052) configure which vote types are enabled, thresholds, cooldowns, and minimum game times. The defaults are carefully chosen, but operators can tune for their community.

### 5.2 Recommended Built-In Vote Types

| Type          | Audience                 | Default Threshold                          | Min Game Time      | Cooldown                     | Scope                        |
| ------------- | ------------------------ | ------------------------------------------ | ------------------ | ---------------------------- | ---------------------------- |
| **Surrender** | Team                     | Team-scaled (2v2: 2/2, 3v3: 2/3, 4v4: 3/4) | 5 min              | 3 min                        | Ranked + casual              |
| **Kick**      | Team                     | ⅔ majority (min 2 votes)                   | 2 min              | 5 min                        | Team games only              |
| **Remake**    | All players              | ¾ majority                                 | 0 (pre-5 min only) | None (once per match)        | All modes                    |
| **Draw**      | All players (both teams) | Unanimous                                  | 10 min             | 5 min                        | All modes                    |
| **Pause**     | Team (or all in FFA)     | Majority                                   | 30 sec             | Uses individual pause budget | Alternative to instant pause |

### 5.3 Recommended Anti-Abuse Protections

1. **Premade group consolidation:** In a 4v4 where three players are in a premade group, their kick vote counts as a single vote (preventing premade bullying of the solo player). Configurable: some community servers may disable this for trusted environments.
2. **Cannot kick the last teammate:** If kicking someone would leave only one player on the team, the kick vote is unavailable.
3. **Army value protection:** Cannot initiate a kick vote against a teammate whose army+structure value exceeds 40% of the team's total (configurable). Prevents kicking the best-performing player.
4. **Reason required:** Kick proposals select from a predefined reason list (AFK, Griefing, Abusive Communication, Other). Free-text reasons are not allowed — preventing the reason field from becoming a harassment vector.
5. **Vote initiator tracking:** Players who frequently initiate failed votes (> 5 failed votes across recent matches) receive a behavioral flag. Not automatically punished, but considered by the Lichess-inspired behavioral system.
6. **Max one active vote:** Only one vote can be active at a time per team. Prevents vote spam.
7. **Confirmation dialog:** Irreversible votes (surrender, kick) show a "Are you sure?" dialog before submitting the order. Prevents misclicks.

### 5.4 Architecture Decision: Where Do Votes Live?

**Recommendation: Hybrid — sim-processed with relay assistance.**

- **All votes are PlayerOrders.** `VoteOrder::Propose`, `VoteOrder::Cast`, `VoteOrder::Cancel` flow through the normal order pipeline. The sim maintains vote state (active votes, ballot counts, expiry timers) deterministically.
- **The relay assists for connection-affecting votes.** When the sim resolves a kick vote (count reaches threshold, sim emits `VoteResolved::Kick { target }`), the relay performs the network-level action (disconnect the player, prevent rejoin). When the sim resolves a remake vote, the relay terminates the match and voids results.
- **Why sim-side:** Deterministic processing ensures all clients agree on vote outcomes. No split-brain where the relay thinks a vote passed but clients disagree. The vote is just another deterministic game event (like an order or surrender).

### 5.5 Tactical Polls (Non-Binding Coordination)

Beyond binding votes, a lightweight poll system for tactical coordination:
- **Propose:** "Attack at 2:00?" — ping-like UI, one-key response
- **Respond:** Agree / Disagree (shown as icons above the proposer's units on the minimap)
- **Non-binding:** No game state effect. Purely informational.
- **Lifetime:** 15 seconds (like a ping)
- **Implementation:** `PlayerOrder::TacticalPoll { phrase_id }` + `PlayerOrder::PollResponse { poll_id, agree: bool }`

These are an extension of D059's chat wheel — a structured way to ask "should we?" questions that teammates can quickly agree or disagree with, without the overhead of a formal vote. The chat wheel phrase set includes poll-eligible phrases (marked in YAML), and the poll response shows as minimap icons + a brief summary ("2 agreed, 1 disagreed").

---

## 6. Reference Cross-Links

| Topic                                   | IC Reference                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Existing surrender vote                 | `03-NETCODE.md` § "Match Lifecycle" → "Surrender / Concede"                      |
| Game pause                              | `03-NETCODE.md` § "Match Lifecycle" → "Game Pause"                               |
| Relay server architecture               | `03-NETCODE.md` § D007 relay design                                              |
| Player orders pipeline                  | `03-NETCODE.md` § order processing, `09-DECISIONS.md` § D012                     |
| Ping/chat wheel/markers                 | `09-DECISIONS.md` § D059 "Novel Coordination Mechanics"                          |
| Console commands (`/callvote`, `/vote`) | `09-DECISIONS.md` § D058                                                         |
| Community governance (D037)             | `09-DECISIONS.md` § D037                                                         |
| Ranked constraints (D055)               | `09-DECISIONS.md` § D055 "Ranked Match Lifecycle"                                |
| Federated servers (D052)                | `09-DECISIONS.md` § D052                                                         |
| Behavioral tracking                     | `06-SECURITY.md` § behavioral detection; `research/minetest-lichess-analysis.md` |
| Generals disconnect vote                | `research/generals-zero-hour-netcode-analysis.md` § Finding 5                    |
| WZ2100 kick vote                        | `research/0ad-warzone2100-netcode-analysis.md` § "Kick Voting"                   |
| Spring/BAR `!vote` system               | `research/spring-engine-netcode-analysis.md` § 9.5                               |
