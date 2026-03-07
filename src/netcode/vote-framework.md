# In-Match Vote Framework (Callvote System)

The match lifecycle events (surrender, pause, post-game) include individual voting mechanics (team surrender vote, pause consent). This section defines the **generic vote framework** that all in-match votes use, plus additional vote types beyond surrender and pause. For cross-game research and design rationale, see `research/vote-callvote-system-analysis.md`.

## Why a Generic Framework

The surrender vote in `match-lifecycle.md` § "Surrender / Concede" works but is hand-rolled — its threshold logic, team scoping, cooldown timer, and replay recording are bespoke code paths. A generic framework:

- Eliminates duplication between surrender, kick, remake, draw, and modder-defined vote types
- Gives modders a single API to add custom votes (YAML for data, Lua/WASM for complex resolution logic)
- Ensures consistent anti-abuse protections across all vote types
- Makes the system testable — the framework can be validated with mock vote types
- Aligns with D037's governance philosophy: transparent, rule-based, community-configurable

## Architecture: Sim-Processed with Relay Assistance

All votes flow through the deterministic order pipeline as `PlayerOrder::Vote` variants. The sim maintains vote state (active votes, ballots, expiry), ensuring all clients agree on vote outcomes. For votes that affect the connection layer (kick, remake), the relay performs the network-level action *after* the sim resolves the vote.

```rust
/// Vote orders — submitted as PlayerOrder variants, processed deterministically.
pub enum VoteOrder {
    /// Propose a new vote. Creates an active vote visible to the audience.
    Propose {
        vote_type: VoteType,
        /// Proposer is implicit (the player who submitted the order).
    },
    /// Cast a ballot on an active vote. Only eligible voters can cast.
    Cast {
        vote_id: VoteId,
        choice: VoteChoice,
    },
    /// Cancel a vote you proposed (before it resolves).
    Cancel {
        vote_id: VoteId,
    },
}

/// All built-in vote types. Game modules can register additional types via YAML.
pub enum VoteType {
    /// Team surrenders the game.
    /// Resolves to GameEnded with MatchEndReason::TeamSurrender.
    /// See `match-lifecycle.md` § "Surrender / Concede" for full semantics.
    Surrender,

    /// Remove a teammate from the game. Team games only.
    /// Kicked player's units are redistributed to remaining teammates.
    Kick { target: PlayerId, reason: KickReason },

    /// Void the match — no rating change for anyone.
    /// Available only in the first few minutes (configurable).
    Remake,

    /// Mutual agreement to end without a winner.
    /// Requires cross-team unanimous agreement.
    Draw,

    /// Modder-defined vote type (registered via YAML + optional Lua/WASM callback).
    /// The engine provides the voting mechanics; the mod provides the resolution logic.
    Custom { type_id: String },
}

pub enum VoteChoice {
    Yes,
    No,
}

pub enum KickReason {
    Afk,
    Griefing,
    AbusiveCommunication,
    Other,
}

/// Opaque vote identifier. Monotonically increasing within a match.
pub struct VoteId(u32);
```

**Why sim-side, not relay-side:** If votes were relay-side, a race condition could occur where the relay resolves a kick vote but some clients haven't processed the kick yet — desyncing the sim. By processing votes in the sim, all clients resolve the vote at the same tick. The relay assists by performing network-level actions (disconnecting a kicked player, voiding a remade match) after it observes the sim's deterministic resolution.

## Vote Lifecycle

```
Propose → Active (30s timer) → Resolved (passed/failed/cancelled)
              ↑                         ↓
         Cast (yes/no)          Execute effect (sim or relay)
```

1. **Propose:** A player submits `VoteOrder::Propose`. The sim validates (eligible to propose? vote type enabled? cooldown expired? no active vote match-wide?). If valid, creates `ActiveVote` state visible to the vote's audience.
2. **Active:** Vote is live. Eligible voters see the vote UI (center-screen overlay, like CS2). The proposer's vote is automatically "yes." Timer counts down.
3. **Cast:** Eligible voters submit `VoteOrder::Cast`. Each player can cast once. Non-voters are counted as "no" when the timer expires (default-deny).
4. **Resolved:** The vote resolves when either:
   - The threshold is met (pass) — the effect is applied immediately
   - The threshold becomes mathematically impossible (fail early) — no point waiting
   - The timer expires (fail — non-voters counted as "no")
   - The proposer cancels (cancelled — no effect, cooldown still applies)
5. **Execute:** On pass, the sim applies the vote's effect. For connection-affecting votes (kick, remake), the relay observes the resolution and performs the network action.

```rust
/// Active vote state maintained by the sim. Deterministic across all clients.
pub struct ActiveVote {
    pub id: VoteId,
    pub vote_type: VoteType,
    pub proposer: PlayerId,
    pub audience: VoteAudience,
    /// Eligible voters for this vote (determined at proposal time).
    pub eligible_voters: Vec<PlayerId>,
    /// Votes cast so far. Key = voter, value = choice.
    /// BTreeMap, not HashMap — deterministic iteration (ic-sim collection policy).
    pub ballots: BTreeMap<PlayerId, VoteChoice>,
    /// Tick when the vote was proposed.
    pub started_at: SimTick,
    /// Tick when the vote expires (started_at + duration_ticks).
    pub expires_at: SimTick,
    /// The threshold required to pass.
    pub threshold: VoteThreshold,
}

pub enum VoteAudience {
    /// Only the proposer's team sees and votes on this.
    /// Used by: Surrender, Kick.
    Team(TeamId),
    /// All players in the match vote.
    /// Used by: Remake, Draw.
    AllPlayers,
}

pub enum VoteThreshold {
    /// Requires N out of eligible voters (e.g., ⅔ majority).
    Fraction { required: u32, of: u32 },
    /// Unanimous — all eligible voters must vote yes.
    Unanimous,
    /// Team-scaled thresholds (the existing surrender logic):
    ///   2-player team: 2/2
    ///   3-player team: 2/3
    ///   4-player team: 3/4
    TeamScaled,
}

/// Resolution outcome — emitted by the sim, consumed by UI and relay.
pub enum VoteResolution {
    Passed { vote: ActiveVote },
    Failed { vote: ActiveVote, reason: VoteFailReason },
    Cancelled { vote: ActiveVote },
}

pub enum VoteFailReason {
    TimerExpired,
    ThresholdImpossible,
    ProposerLeft,
}
```

## Vote Configuration

Vote configuration follows D067's format split: **YAML defines game-content defaults**, **TOML provides server-operator overrides**.

**Precedence (highest wins):**
1. **Lobby settings** (host/tournament organizer overrides for this match)
2. **`server_config.toml` `[votes]` section** (server operator preferences — D064)
3. **`vote_config.yaml`** (game module defaults shipped with the mod)

Each vote type's parameters are defined in YAML, configurable per lobby, per server, and per game module. Tournament organizers override via lobby settings.

### Vote Concurrency Rules

Only **one active vote** may exist at a time, match-wide. This is the simplest rule that avoids all ambiguity:

- A **team-scoped vote** (surrender, kick) blocks all other votes — team-scoped and global — until it resolves.
- A **global vote** (remake, draw) blocks all other votes — team-scoped and global — until it resolves.
- If a team-scoped vote is active and a player from another team proposes a global vote, the proposal is rejected ("a vote is already in progress").
- If a global vote is active, all proposals (any scope) are rejected until it resolves.

This means `max_concurrent_votes` is effectively 1 per match, not per team. The config field below reflects this.

```yaml
# vote_config.yaml — defaults, overridable per lobby/server
vote_framework:
  # Only one active vote at a time, match-wide.
  # Applies regardless of audience scope (team or all_players).
  max_concurrent_votes: 1
  
  types:
    surrender:
      enabled: true
      audience: team
      threshold: team_scaled    # 2/2, 2/3, 3/4 based on team size
      duration_secs: 30
      cooldown_secs: 180        # 3 minutes between failed surrender votes
      min_game_time_secs: 300   # no surrender before 5 minutes
      max_per_player_per_game: ~  # unlimited (cooldown is sufficient)
      # Confirmation applies to team-game vote proposals only.
      # In 1v1, /gg auto-resolves immediately (no vote, no dialog) —
      # see match-lifecycle.md § Surrender / Concede.
      confirmation_dialog: true   # team games: "Are you sure?" before proposing

    kick:
      enabled: true
      audience: team
      threshold:
        fraction: [2, 3]        # ⅔ majority (minimum 2 votes required)
      duration_secs: 30
      cooldown_secs: 300        # 5 minutes between failed kick votes
      min_game_time_secs: 120   # no kick in first 2 minutes
      max_per_player_per_game: 2
      confirmation_dialog: true
      # Kick-specific constraints:
      require_reason: true                  # must select a KickReason
      premade_consolidation: true           # premade group = 1 vote
      protect_last_player: true             # can't kick the last teammate
      army_value_protection_pct: 40         # can't kick player with >40% team value
      team_games_only: true                 # disabled in 1v1/FFA

    remake:
      enabled: true
      audience: all_players
      threshold:
        fraction: [3, 4]        # ¾ of all players
      duration_secs: 45         # longer — cross-team coordination takes time
      cooldown_secs: 0          # no cooldown — one attempt per match
      min_game_time_secs: 0     # available immediately
      max_game_time_secs: 300   # only available in first 5 minutes
      max_per_player_per_game: 1
      confirmation_dialog: false  # no confirmation — urgency matters
      # Remake-specific:
      void_match: true          # no rating change for anyone

    draw:
      enabled: true
      audience: all_players
      threshold: unanimous      # everyone must agree
      duration_secs: 60         # longer — gives both teams time to discuss
      cooldown_secs: 300
      min_game_time_secs: 600   # no draw before 10 minutes
      max_per_player_per_game: 2
      confirmation_dialog: false

    # Example: mod-defined custom vote type
    # ai_takeover:
    #   enabled: true
    #   audience: team
    #   threshold: { fraction: [2, 3] }
    #   duration_secs: 30
    #   cooldown_secs: 120
    #   min_game_time_secs: 60
    #   # Lua callback resolves the vote:
    #   on_pass: "scripts/votes/ai_takeover.lua"
```

**Server operator control (D052):** Community server operators configure vote settings via their server's `server_config.toml`. The relay enforces these settings — clients cannot override them. Tournament operators can disable specific vote types entirely (e.g., no remake in tournament mode where admins handle disputes).

## Built-In Vote Types — Detailed Semantics

**Surrender** is already specified in `match-lifecycle.md` § "Surrender / Concede". The framework formalizes its ad-hoc threshold logic into the generic `VoteThreshold::TeamScaled` pattern. No behavioral change — same thresholds, same cooldown, same minimum game time.

**Kick (Team Games Only)**

When a teammate is AFK, griefing (building walls around ally bases, feeding units to the enemy, hoarding resources), or abusive, the team can vote to remove them.

Resolution if passed:
1. The sim emits `VoteResolution::Passed` with `VoteType::Kick { target }`.
2. The kicked player's units and structures are redistributed to remaining teammates (round-robin by player with fewest units, preserving unit ownership for scoring purposes).
3. The kicked player's `MatchOutcome` is `Abandoned` — full rating loss and queue cooldown (same penalties as voluntary abandon, `match-lifecycle.md` § Disconnect & Abandon Penalties).
4. The relay disconnects the kicked player and adds them to the session's kick list (preventing rejoin in the same role — adopted from WZ2100, see `research/0ad-warzone2100-netcode-analysis.md`).
5. The kicked player may rejoin as a spectator (if spectating is enabled).

Anti-abuse protections (configured in `vote_config.yaml`):
- **Premade consolidation:** If the majority of a team are in the same party (premade), their combined kick vote counts as 1 consolidated vote, not individual votes. This prevents a premade group from unilaterally kicking the solo player(s). Examples: in a 4v4, a 3-stack's combined vote counts as 1 (requiring the solo player to also agree); in a 3v3, a 2-stack's combined vote counts as 1 (requiring the third player to also agree); in a 2v2, no consolidation is needed (each player has equal weight). The general rule: when a premade group would otherwise hold a majority of votes without any non-premade agreement, their votes consolidate. Configurable: community servers where all players know each other may disable this.
- **Army value protection:** A kick vote cannot be initiated against a player whose combined army + structure value exceeds `army_value_protection_pct` (default 40%) of the team's total value. Prevents kicking the best-performing player.
- **Last player protection:** If kicking the target would leave only one player on the team, the kick vote is unavailable. You can resign, but you can't force a teammate into a solo situation.
- **Reason required:** The proposer selects from `KickReason` enum (AFK, Griefing, AbusiveCommunication, Other). Free-text reasons are *not* allowed — preventing the reason field from becoming a harassment vector. The reason is recorded in the replay's analysis event stream.

**Why include kick voting (not just post-game reports):** IC is open-source with community-operated servers (D052). Unlike Valorant or OW2, there is no centralized ML moderation pipeline. Post-game reports are important but don't solve the immediate problem: a griefer is ruining a 30-minute game right now. Kick voting is the pragmatic self-moderation tool for community-run infrastructure. The anti-abuse protections (premade consolidation, army value check, last-player protection) address the known failure modes from TF2 and early CS:GO. See `research/vote-callvote-system-analysis.md` § 3.3 "The Kick Vote Debate" for the full pro/con analysis.

**Remake (Void Match)**

Voiding a match in the early game when something has gone wrong — a player disconnected during loading, spawns are unfair, or a game-breaking bug occurred. Adopted from Valorant's remake and LoL's early remake vote.

Constraints:
- Available only in the first `max_game_time_secs` (default 5 minutes).
- Requires ¾ of all players (cross-team, not team-only) — because voiding affects both teams.
- Once per match per player. No cooldown — if a remake vote fails, it fails.
- If a player has disconnected, their absence reduces the eligible voter count (they don't count as "no").

Resolution if passed:
1. The sim emits `VoteResolution::Passed` with `VoteType::Remake`.
2. The match is terminated with `MatchOutcome::Remade` (no rating change for anyone).
3. The relay marks the match as voided in the `CertifiedMatchResult`. No SCR is generated.
4. All players are returned to the lobby/queue with no penalties.

**Why cross-team majority (¾), not team-only:** A team experiencing disconnection issues shouldn't need the opponent's permission to void a match that's unfair for everyone. But requiring cross-team agreement prevents abuse: a team that's losing early can't unilaterally void the match. ¾ threshold means at least some players on both teams must agree.

**Draw (Mutual Agreement)**

Both teams agree the game is stalemated and wish to end without a winner. Adopted from FAF's draw vote (see `research/vote-callvote-system-analysis.md` § 2.3).

Constraints:
- Requires unanimous agreement from all remaining players (cross-team).
- Minimum 10 minutes of game time (prevents collusion to farm draw results).
- This is the only vote type with `threshold: unanimous` + `audience: all_players`.

Resolution if passed:
1. The sim emits `VoteResolution::Passed` with `VoteType::Draw`.
2. The match ends with `MatchOutcome::Draw { reason: MatchEndReason::Draw { vote_results } }`. Minimal rating change (Glicko-2 treats draws as 0.5 result — deviation decreases without significant rating movement).
3. Replay records `AnalysisEvent::MatchEnded` with the same `MatchEndReason::Draw { vote_results }`.

**Why unanimous:** A draw must be genuinely mutual. If even one player believes they can win, the game should continue. This prevents one team from pressuring the other into drawing a game they're winning. In larger team games (4v4), unanimous cross-team agreement is intentionally difficult to achieve — this is by design, not a flaw. A draw should be rare and genuinely consensual. If the game feels stalemated but not everyone agrees, players should continue playing — the stalemate will resolve through gameplay or surrender.

## Tactical Polls (Non-Binding Coordination)

Beyond formal (binding) votes, the framework supports lightweight **tactical polls** for team coordination. These are non-binding — they don't affect game state. They are a structured way to ask "should we?" questions.

```rust
/// Tactical poll — a lightweight coordination signal.
/// Non-binding, no game state effect. Purely informational.
pub enum PollOrder {
    /// Propose a tactical question to teammates.
    Propose { phrase_id: u16 },
    /// Respond to an active poll.
    Respond { poll_id: PollId, agree: bool },
}

pub struct ActivePoll {
    pub id: PollId,
    pub proposer: PlayerId,
    pub phrase_id: u16,           // maps to chat_wheel_phrases.yaml
    /// BTreeMap, not HashMap — deterministic iteration (ic-sim collection policy).
    pub responses: BTreeMap<PlayerId, bool>,
    pub expires_at: SimTick,      // 15 seconds after proposal
}
```

**How it works:**
1. A player holds the chat wheel key (default `V`) and selects a poll-eligible phrase (marked in `chat_wheel_phrases.yaml` with `poll: true`).
2. The phrase appears in team chat with "Agree / Disagree" buttons (or keybinds: `F1`/`F2`, matching the vote UI).
3. Teammates respond. Responses show as minimap icons (✓/✗) near the proposer's units and as a brief summary in team chat ("Attack now! — 2 agreed, 1 disagreed").
4. After 15 seconds, the poll expires and the UI clears. No binding effect.

**Poll-eligible phrases** (added to D059's `chat_wheel_phrases.yaml`):

```yaml
chat_wheel:
  phrases:
    # ... existing phrases ...

    - id: 10
      category: tactical
      poll: true    # enables agree/disagree responses
      label:
        en: "Attack now?"
        de: "Jetzt angreifen?"
        ru: "Атакуем сейчас?"
        zh: "现在进攻？"

    - id: 11
      category: tactical
      poll: true
      label:
        en: "Should we expand?"
        de: "Sollen wir expandieren?"
        ru: "Расширяемся?"
        zh: "要扩张吗？"

    - id: 12
      category: tactical
      poll: true
      label:
        en: "Go all-in?"
        de: "Alles riskieren?"
        ru: "Ва-банк?"
        zh: "全力出击？"

    - id: 13
      category: tactical
      poll: true
      label:
        en: "Hold position?"
        de: "Position halten?"
        ru: "Удерживать позицию?"
        zh: "坚守阵地？"

    - id: 14
      category: tactical
      poll: true
      label:
        en: "Ready for push?"
        de: "Bereit zum Angriff?"
        ru: "Готовы к атаке?"
        zh: "准备好进攻了吗？"

    - id: 15
      category: tactical
      poll: true
      label:
        en: "Switch targets?"
        de: "Ziel wechseln?"
        ru: "Сменить цель?"
        zh: "更换目标？"
```

**Why tactical polls, not just chat:** Polls solve a specific problem: **silent teammates**. In team games, a player may propose "Attack now!" via chat wheel, but get no response — are teammates AFK? Do they disagree? Did they not see the message? A poll with explicit agree/disagree buttons forces a visible response. This is especially valuable in international matchmaking where language barriers prevent text discussion.

**Rate limiting:** Max 1 active poll at a time per team. Max 3 polls per player per 5 minutes. Polls share the ping rate limit bucket (D059 § 3), since they serve a similar purpose.

**Concurrency with formal votes:** Tactical polls and formal (binding) votes are **independent**. A team can have one active formal vote AND one active tactical poll simultaneously. Polls are non-binding coordination tools (lightweight, 15-second expiry); votes are binding governance actions with cooldowns and consequences. They use separate UI slots — the vote prompt appears center-screen with F1/F2 keybinds; the poll appears in the team chat area with smaller agree/disagree buttons. There is no interaction between the two: a poll cannot influence a vote, and a vote does not cancel active polls.

## Console Commands (D058 Integration)

The vote framework registers commands via the Brigadier command tree (D058):

| Command                        | Description                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `/callvote <type> [args]`      | Propose a vote. Examples: `/callvote surrender`, `/callvote kick PlayerName griefing`, `/callvote remake`, `/callvote draw` |
| `/vote yes` or `/vote y`       | Vote yes on the active vote (equivalent to pressing F1)                                                                     |
| `/vote no` or `/vote n`        | Vote no on the active vote (equivalent to pressing F2)                                                                      |
| `/vote cancel`                 | Cancel a vote you proposed (before resolution)                                                                              |
| `/vote status`                 | Display the current active vote (if any)                                                                                    |
| `/poll <phrase_id>`            | Propose a tactical poll using phrase ID                                                                                     |
| `/poll agree` or `/poll yes`   | Agree with the active poll                                                                                                  |
| `/poll disagree` or `/poll no` | Disagree with the active poll                                                                                               |

**Shorthand aliases:** `/gg` and `/ff` map to `/callvote surrender` in team games (adopted from LoL/Valorant convention). In 1v1, `/gg` bypasses the vote framework entirely — the sim immediately resolves the surrender with no vote, no dialog, and no timer (match-lifecycle.md § Surrender / Concede). This matches SC2 and every competitive RTS: surrendering in 1v1 is an irreversible commitment.

## Anti-Abuse Protections

The vote framework enforces these protections globally. Individual vote types can add type-specific protections (like kick's premade consolidation).

1. **Max one active vote match-wide.** Prevents vote spam. A second proposal while a vote is active is rejected with "A vote is already in progress." See § Vote Concurrency Rules above.
2. **Default-deny.** Players who don't cast a ballot before the timer expires are counted as "no." This prevents AFK players from enabling votes to pass by absence. Explicit abstention is not available — you either vote or you're counted as "no."
3. **Cooldown enforcement.** Failed votes trigger a cooldown (per vote type). The sim tracks cooldown timers deterministically.
4. **Behavioral tracking.** The analysis event stream records all vote proposals, casts, and resolutions. Post-match analysis tools can identify patterns: a player who initiates 5 failed kick votes across 3 matches is exhibiting problematic behavior, even if no single instance is actionable. This feeds into the Lichess-inspired behavioral reputation system (`06-SECURITY.md`).
5. **Minimum game time gates.** Each vote type specifies the earliest tick at which it becomes available. Prevents first-second trolling.
6. **Confirmation dialog.** Irreversible votes (surrender, kick) in team games show a brief confirmation prompt before the order is submitted. The prompt is client-side (does not affect determinism) and takes <1 second. In 1v1, surrender (`/gg`) auto-resolves immediately — no vote is created and no dialog is shown (match-lifecycle.md § Surrender / Concede).
7. **Replay transparency.** Every vote proposal, ballot, and resolution is recorded as an `AnalysisEvent::VoteEvent` in the replay analysis stream. Tournament admins and community moderators can review vote patterns. No secret votes.

```rust
/// Analysis event for vote tracking in replays and post-match tools.
pub enum VoteAnalysisEvent {
    Proposed { vote_id: VoteId, vote_type: VoteType, proposer: PlayerId },
    BallotCast { vote_id: VoteId, voter: PlayerId, choice: VoteChoice },
    Resolved { vote_id: VoteId, resolution: VoteResolution },
}
```

## Ranked-Specific Constraints

In ranked matches (D055), vote behavior has additional constraints enforced by the relay:

- **Kick:** Kicked player receives full loss + queue cooldown (same as abandon). The team continues with redistributed units.
- **Remake:** Voided match — no rating change. Only available in first 5 minutes. If a player disconnected, the remake threshold is reduced (disconnected player doesn't count as a "no").
- **Draw:** Treated as Glicko-2 draw result (0.5). Both players' deviations decrease without significant rating movement.
- **Surrender:** Standard ranked loss. No reduced penalty for surrendering (unlike reduced penalty for post-abandon surrender in `match-lifecycle.md` § Disconnect & Abandon Penalties).

## Mod-Extensible Vote Types

Game modules and mods register custom vote types via YAML (D004 tiered modding). Complex resolution logic uses Lua callbacks.

**Example: AI Takeover vote** (a teammate left — vote to replace them with AI instead of redistributing units):

```yaml
# mod_votes.yaml — registered by a game module or mod
vote_framework:
  types:
    ai_takeover:
      enabled: true
      audience: team
      threshold: { fraction: [2, 3] }
      duration_secs: 30
      cooldown_secs: 120
      min_game_time_secs: 60
      on_pass: "scripts/votes/ai_takeover.lua"
```

```lua
-- scripts/votes/ai_takeover.lua
-- Called when the ai_takeover vote passes.
-- The Lua API provides access to the disconnected player's entities.
function on_vote_passed(vote)
    local target = vote.custom_data.disconnected_player
    local entities = Player.GetEntities(target)
    
    -- Transfer to AI controller (D043 AI system)
    local ai = AI.Create("skirmish_ai", {
        difficulty = "medium",
        team = Player.GetTeam(target),
    })
    AI.TransferEntities(ai, entities)
    
    Chat.SendSystem("AI has taken over " .. Player.GetName(target) .. "'s forces.")
end
```

**Registration:** Custom vote types are registered during game module initialization (`GameModule::register_vote_types()` in `ic-sim`). The framework validates the YAML configuration at load time and rejects invalid vote types (missing threshold, negative cooldown, etc.). Custom votes use the same UI, the same anti-abuse protections, and the same replay recording as built-in votes.

**Phase:** The generic framework (Vote orders, ActiveVote state, resolution logic) is Phase 5 (multiplayer). The surrender vote already exists in sim form and gets refactored to use the framework. Kick, remake, and draw are also Phase 5. Tactical polls are Phase 5 or 6a. Mod-extensible custom votes are Phase 6a (alongside full mod compatibility).
