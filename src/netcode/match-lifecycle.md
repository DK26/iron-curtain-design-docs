# Network Architecture  Match Lifecycle

Complete operational flow from lobby creation through match conclusion: lobby management, loading synchronization, in-game tick processing, pause/resume, disconnect handling, desync detection, replay finalization, and post-game cleanup.

### Ready-Check & Match Start

When matchmaking finds a match (or all lobby players click "ready"), the system runs a ready-check protocol before loading:

```rust
/// Relay-managed ready-check sequence.
pub enum ReadyCheckState {
    /// Match found, waiting for all players to accept (30s timeout).
    WaitingForAccept { deadline: Instant, accepted: HashSet<PlayerId> },
    /// All accepted → map veto phase (ranked only, D055).
    MapVeto { veto_state: VetoState },
    /// Veto complete or casual → loading.
    Loading { map: MapId, loading_progress: HashMap<PlayerId, u8> },
    /// All loaded → countdown (3s) → game start.
    Countdown { remaining_secs: u8 },
    /// Game is live.
    InProgress,
}
```

**Ready-check flow:**
1. **Match found → Accept/Decline (30s).** All matched players must accept. Declining or timing out returns everyone to the queue. The declining player receives a short queue cooldown (escalating: 1min → 5min → 15min per 24hr window). Non-declining players are re-queued instantly with priority.
2. **Map veto (ranked only, D055).** Anonymous alternating bans. Leaving during veto = loss + cooldown.
3. **Loading phase.** Relay collects loading progress from each client (0-100%). UI shows per-player loading bars. If any player fails to load within 120 seconds, the match is cancelled — no penalty for anyone (the failing player receives a "check your installation" message).
4. **Countdown (3 seconds).** Brief freeze with countdown overlay. Deterministic sim starts at tick 0 when countdown reaches 0.

**Why 30 seconds for accept:** Long enough for players to hear the notification and return from AFK. Short enough to not waste the other player's time. Matches SC2's accept timeout.

### Game Pause

The game supports a deterministic pause mechanism — the pause state is part of the sim, so all clients agree on exactly which ticks are paused.

```rust
/// Pause request — submitted as a PlayerOrder, processed by the sim.
pub enum PauseOrder {
    /// Request to pause. Includes a reason for the observer feed.
    RequestPause { reason: PauseReason },
    /// Request to unpause. Only the pausing player or opponent (after grace period).
    RequestUnpause,
}

pub enum PauseReason {
    PlayerRequest,     // manual pause
    TechnicalIssue,    // player reported technical problem
    // Tournament organizers can add custom reasons via lobby configuration
}

/// Pause rules — configurable per lobby, with ranked/tournament defaults.
pub struct PauseConfig {
    /// Maximum number of pauses per player per game.
    pub max_pauses_per_player: u8,       // Default: 2 (ranked), unlimited (casual)
    /// Maximum total pause duration per player (seconds).
    pub max_pause_duration_secs: u32,    // Default: 120 (ranked), 300 (casual)
    /// Grace period before opponent can unpause (seconds).
    pub unpause_grace_secs: u32,         // Default: 30
    /// Whether spectators see the game during pause.
    pub spectator_visible_during_pause: bool,  // Default: true
    /// Minimum game time before pause is allowed (prevents early-game stalling).
    pub min_game_time_for_pause_secs: u32,     // Default: 30
}
```

**Pause behavior:**
- **Initiating:** A player submits `PauseOrder::RequestPause`. The sim freezes at the end of the current tick (all clients process the same tick, then stop). Replay records the pause event with timestamp.
- **During pause:** No ticks advance. Chat remains active. VoIP continues (D059 § Competitive Voice Rules). The pause timer counts down in the UI ("Player A paused — 90s remaining").
- **Unpause:** The pausing player can unpause at any time. The opponent can unpause after the grace period (30s default). A 3-second countdown precedes resumption so neither player is caught off-guard.
- **Expiry:** If the pause timer expires, the game auto-unpauses with a 3-second countdown.
- **Tracking:** Pause events are recorded in the replay analysis stream and visible to observers. A player who exhausts all pauses cannot pause again. Excessive pausing in ranked generates a behavioral flag (informational, not automatic penalty).

**Why 2 pauses × 120 seconds per player (ranked):**
- Matches SC2's proven system (2 pauses of non-configurable length, opponent can unpause after ~30s)
- Enough for genuine technical issues (reconnect a controller, answer the door)
- Short enough to prevent stalling as a tactic
- Tournament organizers can override via `PauseConfig` in lobby settings

### Surrender / Concede

Players can end the game before total defeat via a surrender mechanic. This is a `PlayerOrder`, not a UI-only action — the sim must process it deterministically.

```rust
pub enum PlayerOrder {
    // ... existing orders ...

    /// Player surrenders. In team games, triggers a surrender vote.
    Surrender,
}
```

**1v1 surrender:**
- A player submits `PlayerOrder::Surrender`. The sim immediately transitions to `GameEnded` state with the surrendering player as loser. No confirmation dialog — if you type `/gg` or click "Surrender", it's final. This matches SC2 and every competitive RTS: surrendering is an irreversible commitment.

**Team game surrender:**
- A player submits `PlayerOrder::Surrender`, which initiates a **surrender vote** visible only to their team:
  - 2v2: Both teammates must agree (unanimous)
  - 3v3: 2 of 3 must agree (⅔ majority)
  - 4v4: 3 of 4 must agree (¾ majority)
- Vote lasts 30 seconds. If the threshold is met, the team surrenders. If not, the vote fails and a 3-minute cooldown applies before another vote.
- **Minimum game time:** No surrender before 5 minutes of game time (prevents rage-quit cycles in team games). Configurable in lobby.
- A player who disconnects in a team game and doesn't reconnect within the timeout (§ Reconnection, 60s) is treated as having voted "yes" on any pending surrender vote. Their units are distributed to remaining teammates.

**Replay recording:** Surrender events are recorded as `AnalysisEvent::MatchEnded` with an explicit `MatchEndReason::Surrender { player }` or `MatchEndReason::TeamSurrender { team, vote_results }`. The `CertifiedMatchResult` distinguishes surrender from destruction-based victory.

### Disconnect & Abandon Penalties (Ranked)

Disconnection handling exists at two layers: the **network layer** (§ Reconnection — snapshot transfer, 60s timeout) and the **competitive layer** (this section — penalties for leaving ranked games).

```rust
/// Match completion status — included in CertifiedMatchResult.
pub enum MatchOutcome {
    /// Normal game completion (one side eliminated or surrenders).
    Completed { winner: PlayerId, reason: MatchEndReason },
    /// A player disconnected and did not reconnect.
    Abandoned { leaver: PlayerId, tick: u64 },
    /// Mutual agreement (rare — both players agree to end without result).
    Draw,
    /// Desync forced termination.
    DesyncTerminated { first_divergence_tick: u64 },
}

pub enum MatchEndReason {
    Elimination,                   // all opposing structures/units destroyed
    Surrender { player: PlayerId },
    TeamSurrender { team: TeamId, vote_results: Vec<(PlayerId, bool)> },
    ObjectiveCompleted,            // scenario-specific victory condition
}
```

**Ranked penalty framework:**

| Scenario                                | Rating Impact                        | Queue Cooldown                                 | Notes                                                                                                                                               |
| --------------------------------------- | ------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disconnect + reconnect within 60s**   | None                                 | None                                           | Successful reconnection = no penalty. Network blips happen.                                                                                         |
| **Disconnect + no reconnect (abandon)** | Full loss                            | 5 min (1st in 24hr), 30 min (2nd), 2 hr (3rd+) | Escalating cooldown resets after 24 hours without abandoning.                                                                                       |
| **Process termination (rage quit)**     | Full loss                            | Same as abandon                                | Relay detects immediate connection drop vs. gradual timeout. No distinction — both are abandons.                                                    |
| **Repeated abandons (3+ in 7 days)**    | Full loss + extra deviation increase | 24 hr                                          | Deviation increase means faster rating change — habitual leavers converge to their "real" rating faster if they're also avoiding games they'd lose. |
| **Desync (not the player's fault)**     | No rating change                     | None                                           | Desyncs are engine bugs, not player behavior. Both players are returned to queue. See `06-SECURITY.md` § V25 for desync abuse prevention.           |

**Grace period:** If a player abandons within the first 2 minutes of game time AND the game was less than 5% complete (minimal orders submitted), the match is voided — no rating change for either player, minimal cooldown (1 min). This handles lobby mistakes, misclicks, and "I queued into the wrong mode."

**Team game abandon:** In team games, if a player abandons, remaining teammates can choose to:
1. **Play on** — the leaver's units are distributed. If they win, full rating gain. If they lose, reduced rating loss (scaled by time played at disadvantage).
2. **Surrender** — the surrender vote threshold is reduced by one (the leaver counts as "yes"). Surrendering after an abandon applies reduced rating loss.

### Live Spectator Delay

Live spectating of in-progress games uses a configurable delay to prevent stream-sniping and live coaching:

```rust
/// Spectator feed configuration — set per lobby or server-wide.
pub struct SpectatorConfig {
    /// Whether live spectating is allowed for this match.
    pub allow_live_spectators: bool,     // Default: true (casual), configurable (ranked)
    /// Delay in ticks before spectators see game state.
    pub spectator_delay_ticks: u64,      // Default: 90 (~3 seconds casual), 900 (~30s ranked)
    /// Maximum spectators per match (relay bandwidth management).
    pub max_spectators: u32,             // Default: 50 (relay), unlimited (local)
    /// Whether spectators can see both team's views (false = assigned perspective).
    pub full_visibility: bool,           // Default: true (casual), false (ranked team games)
}
```

**Delay tiers:**

| Context               | Default Delay           | Rationale                                                                                                                                                                                        |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Casual / unranked** | 3 seconds (90 ticks)    | Minimal delay — enough to prevent frame-perfect info leaks, short enough for engaging spectating                                                                                                 |
| **Ranked**            | 2 minutes (3,600 ticks) | Anti-stream-sniping. CS2 uses 90s-2min; SC2 uses 3min. 2 minutes is the sweet spot for RTS (long enough to prevent scouting info exploitation, short enough for spectators to follow the action) |
| **Tournament**        | Configurable (0s–10min) | Organizer controls. 0s delay for offline LAN events. 5-10 min for online tournaments with dedicated observer casters                                                                             |
| **Replay**            | 0s                      | No delay — the game is already finished                                                                                                                                                          |

**Anti-coaching:** In ranked team games, spectators are assigned to one team's perspective (`full_visibility: false`) and cannot switch mid-game. This prevents a friend from spectating and relaying enemy information via external voice. The relay enforces this — it simply doesn't send the opposing team's orders to biased spectators until the delay expires.

**Player control:** Players can disable live spectating for their matches via a preference (`/set allow_spectators false`). In ranked, the server's spectator policy overrides individual preference (e.g., "all ranked games allow delayed spectating for anti-cheat review").

### Post-Game Flow

After the sim transitions to `GameEnded`, the network layer manages the post-game sequence:

1. **Match result broadcast.** The relay computes the `CertifiedMatchResult` and broadcasts it to all participants and spectators.
2. **Post-game lobby (30 seconds).** Players remain connected. Chat stays active (both teams can talk). Statistics screen displays (see `02-ARCHITECTURE.md` § GameScore). Players can:
   - View detailed stats (economy graph, production timeline, combat events)
   - Watch the game-ending moment in instant replay (last 30 seconds, auto-saved)
   - Report opponent (D052 community moderation)
   - Save replay (if not auto-saved)
   - Re-queue (returns to matchmaking immediately)
   - Leave (returns to main menu)
3. **Rating update display.** For ranked games, the rating change is shown within the post-game lobby: "Captain II → Captain I (+32 rating)". The SCR is delivered to the client during this window.
4. **Lobby timeout.** After 5 minutes, the post-game lobby auto-closes. Resources are released.

### In-Match Vote Framework (Callvote System)

The match lifecycle events above — surrender, pause, and post-game — include individual voting mechanics (team surrender vote, pause consent). This section defines the **generic vote framework** that all in-match votes use, plus additional vote types beyond surrender and pause. For cross-game research and design rationale, see `research/vote-callvote-system-analysis.md`.

#### Why a Generic Framework

The surrender vote in § "Surrender / Concede" above works but is hand-rolled — its threshold logic, team scoping, cooldown timer, and replay recording are bespoke code paths. A generic framework:

- Eliminates duplication between surrender, kick, remake, draw, and modder-defined vote types
- Gives modders a single API to add custom votes (YAML for data, Lua/WASM for complex resolution logic)
- Ensures consistent anti-abuse protections across all vote types
- Makes the system testable — the framework can be validated with mock vote types
- Aligns with D037's governance philosophy: transparent, rule-based, community-configurable

#### Architecture: Sim-Processed with Relay Assistance

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
    /// See § "Surrender / Concede" above for full semantics.
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

#### Vote Lifecycle

```
Propose → Active (30s timer) → Resolved (passed/failed/cancelled)
              ↑                         ↓
         Cast (yes/no)          Execute effect (sim or relay)
```

1. **Propose:** A player submits `VoteOrder::Propose`. The sim validates (eligible to propose? vote type enabled? cooldown expired? no active vote?). If valid, creates `ActiveVote` state visible to the vote's audience.
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
    pub ballots: HashMap<PlayerId, VoteChoice>,
    /// Tick when the vote was proposed.
    pub started_at: u64,
    /// Tick when the vote expires (started_at + duration_ticks).
    pub expires_at: u64,
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

#### Vote Configuration (YAML)

Each vote type's parameters are defined in YAML, configurable per lobby, per server, and per game module. Tournament organizers override via lobby settings.

```yaml
# vote_config.yaml — defaults, overridable per lobby/server
vote_framework:
  # Global constraint: only one active vote at a time per team.
  max_concurrent_votes_per_team: 1
  
  types:
    surrender:
      enabled: true
      audience: team
      threshold: team_scaled    # 2/2, 2/3, 3/4 based on team size
      duration_secs: 30
      cooldown_secs: 180        # 3 minutes between failed surrender votes
      min_game_time_secs: 300   # no surrender before 5 minutes
      max_per_player_per_game: ~  # unlimited (cooldown is sufficient)
      confirmation_dialog: true   # "Are you sure?" before proposing

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

#### Built-In Vote Types — Detailed Semantics

**Surrender** is already specified in § "Surrender / Concede" above. The framework formalizes its ad-hoc threshold logic into the generic `VoteThreshold::TeamScaled` pattern. No behavioral change — same thresholds, same cooldown, same minimum game time.

**Kick (Team Games Only)**

When a teammate is AFK, griefing (building walls around ally bases, feeding units to the enemy, hoarding resources), or abusive, the team can vote to remove them.

Resolution if passed:
1. The sim emits `VoteResolution::Passed` with `VoteType::Kick { target }`.
2. The kicked player's units and structures are redistributed to remaining teammates (round-robin by player with fewest units, preserving unit ownership for scoring purposes).
3. The kicked player's `MatchOutcome` is `Abandoned` — full rating loss and queue cooldown (same penalties as voluntary abandon, § Disconnect & Abandon Penalties).
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
2. The match is terminated with `MatchOutcome::Draw` (no rating change for anyone).
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
2. The match ends with `MatchOutcome::Draw`. Minimal rating change (Glicko-2 treats draws as 0.5 result — deviation decreases without significant rating movement).
3. Replay records `AnalysisEvent::MatchEnded` with `MatchEndReason::Draw { vote_results }`.

**Why unanimous:** A draw must be genuinely mutual. If even one player believes they can win, the game should continue. This prevents one team from pressuring the other into drawing a game they're winning. In larger team games (4v4), unanimous cross-team agreement is intentionally difficult to achieve — this is by design, not a flaw. A draw should be rare and genuinely consensual. If the game feels stalemated but not everyone agrees, players should continue playing — the stalemate will resolve through gameplay or surrender.

#### Tactical Polls (Non-Binding Coordination)

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
    pub responses: HashMap<PlayerId, bool>,
    pub expires_at: u64,          // 15 seconds after proposal
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

#### Console Commands (D058 Integration)

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

**Shorthand aliases:** `/gg` maps to `/callvote surrender`. `/ff` also maps to `/callvote surrender` (adopted from LoL/Valorant convention). In 1v1, `/gg` bypasses the vote and surrenders immediately (no vote needed when there's no team).

#### Anti-Abuse Protections

The vote framework enforces these protections globally. Individual vote types can add type-specific protections (like kick's premade consolidation).

1. **Max one active vote per team.** Prevents vote spam. A second proposal while a vote is active is rejected with "A vote is already in progress."
2. **Default-deny.** Players who don't cast a ballot before the timer expires are counted as "no." This prevents AFK players from enabling votes to pass by absence. Explicit abstention is not available — you either vote or you're counted as "no."
3. **Cooldown enforcement.** Failed votes trigger a cooldown (per vote type). The sim tracks cooldown timers deterministically.
4. **Behavioral tracking.** The analysis event stream records all vote proposals, casts, and resolutions. Post-match analysis tools can identify patterns: a player who initiates 5 failed kick votes across 3 matches is exhibiting problematic behavior, even if no single instance is actionable. This feeds into the Lichess-inspired behavioral reputation system (`06-SECURITY.md`).
5. **Minimum game time gates.** Each vote type specifies the earliest tick at which it becomes available. Prevents first-second trolling.
6. **Confirmation dialog.** Irreversible votes (surrender, kick) show a brief confirmation prompt before the order is submitted. The prompt is client-side (does not affect determinism) and takes <1 second.
7. **Replay transparency.** Every vote proposal, ballot, and resolution is recorded as an `AnalysisEvent::VoteEvent` in the replay analysis stream. Tournament admins and community moderators can review vote patterns. No secret votes.

```rust
/// Analysis event for vote tracking in replays and post-match tools.
pub enum VoteAnalysisEvent {
    Proposed { vote_id: VoteId, vote_type: VoteType, proposer: PlayerId },
    BallotCast { vote_id: VoteId, voter: PlayerId, choice: VoteChoice },
    Resolved { vote_id: VoteId, resolution: VoteResolution },
}
```

#### Ranked-Specific Constraints

In ranked matches (D055), vote behavior has additional constraints enforced by the relay:

- **Kick:** Kicked player receives full loss + queue cooldown (same as abandon). The team continues with redistributed units.
- **Remake:** Voided match — no rating change. Only available in first 5 minutes. If a player disconnected, the remake threshold is reduced (disconnected player doesn't count as a "no").
- **Draw:** Treated as Glicko-2 draw result (0.5). Both players' deviations decrease without significant rating movement.
- **Surrender:** Standard ranked loss. No reduced penalty for surrendering (unlike reduced penalty for post-abandon surrender in § Disconnect & Abandon Penalties).

#### Mod-Extensible Vote Types

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

