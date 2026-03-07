# Network Architecture  Match Lifecycle

Complete operational flow from lobby creation through match conclusion: lobby management, loading synchronization, in-game tick processing, pause/resume, disconnect handling, desync detection, replay finalization, and post-game cleanup.

> **Lobby/matchmaking wire protocol:** The complete byte-level wire protocol for lobby management, server discovery, matchmaking queue, credential exchange, and lobby→game transition is specified in `research/lobby-matchmaking-wire-protocol-design.md`.

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

Players can end the game before total defeat via a surrender mechanic. Surrender flows through the generic vote framework (`vote-framework.md`), not a dedicated `PlayerOrder` variant.

**1v1 surrender:**
- A player submits `PlayerOrder::Vote(VoteOrder::Propose { vote_type: Surrender })`. Because there is no team to poll, the sim immediately resolves the vote as passed and transitions to `GameEnded` with the surrendering player as loser. No confirmation dialog — if you type `/gg` or click "Surrender", it's final. This matches SC2 and every competitive RTS: surrendering is an irreversible commitment.

**Team game surrender:**
- A player submits `PlayerOrder::Vote(VoteOrder::Propose { vote_type: Surrender })`, which initiates a surrender vote visible only to their team. Thresholds follow `VoteThreshold::TeamScaled`:
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
/// Which side won — handles both 1v1 and team games.
pub enum WinningSide {
    /// Single player won (1v1 or FFA last-standing).
    Player(PlayerId),
    /// A team won (2v2, 3v3, 4v4 — all members share the victory).
    Team(TeamId),
}

/// Match completion status — included in CertifiedMatchResult.
pub enum MatchOutcome {
    /// Normal game completion (one side eliminated or surrenders).
    Completed { winner: WinningSide, reason: MatchEndReason },
    /// A player disconnected and did not reconnect.
    Abandoned { leaver: PlayerId, tick: u64 },
    /// Mutual agreement to end without a winner (Glicko-2 draw = 0.5 result).
    Draw { reason: MatchEndReason },
    /// Match voided — no rating change, no SCR generated.
    /// Used by remake votes, admin voids, and grace-period cancellations.
    Remade,
    /// Desync forced termination.
    DesyncTerminated { first_divergence_tick: u64 },
}

pub enum MatchEndReason {
    Elimination,                   // all opposing structures/units destroyed
    Surrender { player: PlayerId },
    TeamSurrender { team: TeamId, vote_results: Vec<(PlayerId, bool)> },
    ObjectiveCompleted,            // scenario-specific victory condition
    Draw { vote_results: Vec<(PlayerId, bool)> },  // mutual draw vote passed
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
    pub spectator_delay_ticks: u64,      // Default: 90 (~3 seconds casual), 3600 (~120s ranked, V59 floor)
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
2. **Post-game lobby.** Players remain connected. Chat stays active (both teams can talk). Statistics screen displays (see `02-ARCHITECTURE.md` § GameScore). Players can:
   - View detailed stats (economy graph, production timeline, combat events)
   - Watch the game-ending moment in instant replay (last 30 seconds, auto-saved)
   - Report opponent (D052 community moderation)
   - Save replay (if not auto-saved)
   - Re-queue (returns to matchmaking immediately)
   - Leave (returns to main menu)
3. **Rating update display.** For ranked games, the rating change is shown within the post-game lobby: "Captain II → Captain I (+32 rating)". The community server computes the new rating from `CertifiedMatchResult`, signs two SCRs (rating + match record), and the relay forwards them to the client as `Frame::RatingUpdate(Vec<SignedCredentialRecord>)` on `MessageLane::Orders` (reliable — the lane is idle post-game; see wire-format.md § Default lane configuration, D052 credential-store-validation.md). The client stores both SCRs in its local SQLite credential file.
4. **Lobby timeout.** After 5 minutes, the post-game lobby auto-closes. Resources are released.

### In-Match Vote Framework (Callvote System)

The generic vote framework (surrender, kick, remake, draw, tactical polls, mod-extensible custom votes) is specified in the dedicated sub-page: **[Vote Framework](vote-framework.md)**.

