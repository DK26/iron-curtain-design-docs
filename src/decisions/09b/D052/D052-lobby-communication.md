### Lobby Communication

> **Parent page:** [D052 — Transparency, Matchmaking & Lobby](D052-transparency-matchmaking-lobby.md)

Once players are in a room, they need to communicate — coordinate strategy before the game, socialize, discuss map picks, or just talk. IC provides text chat, voice chat, and visible player identity in every lobby.

**Text Chat**

All lobby text messages are routed through the relay server (or host in P2P mode) — the same path as game orders. This keeps the trust model consistent: the relay timestamps and sequences messages, making chat moderation actions deterministic and auditable.

```rust
/// Lobby chat message — part of the room protocol, not the sim protocol.
/// Routed through the relay alongside PlayerOrders but on a separate
/// logical channel (not processed by ic-sim).
pub struct LobbyMessage {
    pub sender: PlayerId,
    pub channel: ChatChannel,
    pub content: String,         // UTF-8, max 500 bytes
    pub timestamp: u64,          // relay-assigned, not client-claimed
}

pub enum ChatChannel {
    All,                         // Everyone in the room sees it
    Team(TeamId),                // Team-only (pre-game team selection)
    Whisper(PlayerId),           // Private message to one player
    System,                      // Join/leave/kick notifications (server-generated)
}
```

**Chat features:**

- **Rate limiting:** Max 5 messages per 3 seconds per player. Prevents spam flooding.
- **Message length:** Max 500 bytes UTF-8. Long enough for tactical callouts, short enough to prevent wall-of-text abuse.
- **Host moderation:** Room host can mute individual players (host sends a `MutePlayer` command; relay enforces). Muted players' messages are silently dropped by the relay — other clients never receive them.
- **Persistent for room lifetime:** Chat history is available to newly joining players (last 50 messages). When the room closes, chat is discarded — no server-side chat logging.
- **In-game chat:** During gameplay, the same chat system operates. `All` channel becomes `Spectator` for observers. `Team` channel carries strategic communication. A configurable `AllChat` toggle (default: disabled in ranked) controls whether opponents can see your messages during a match.
- **Links and formatting:** URLs are clickable (opens external browser). No rich text — plain text only. This prevents injection attacks and keeps the UI simple.
- **Emoji:** Standard Unicode emoji are rendered natively. No custom emoji system — keep it simple.
- **Block list:** Players can block others locally. Blocked players' messages are filtered client-side (not server-enforced — the relay doesn't need to know your block list). Block persists across sessions in local SQLite (D034).

**In-game chat UI:**

```
┌──────────────────────────────────────────────┐
│ [All] [Team]                          [Hide] │
├──────────────────────────────────────────────┤
│ [SYS] alice joined the room                  │
│ [cmdr] gg ready when you are                 │
│ [alice] let's go desert map?                 │
│ [bob] 👍                                      │
│                                              │
├──────────────────────────────────────────────┤
│ [Type message...]                    [Send]  │
└──────────────────────────────────────────────┘
```

The chat panel is collapsible (hotkey: Enter to open, Escape to close — standard RTS convention). During gameplay, it overlays transparently so it doesn't obscure the battlefield.

**Voice Chat**

IC includes built-in voice communication using relay-forwarded Opus audio. Voice data never touches the sim — it's a purely transport-layer feature with zero determinism impact.

**Architecture:**

```
┌────────┐              ┌─────────────┐              ┌────────┐
│Player A│─── Opus ────►│ Room Server │─── Opus ────►│Player B│
│        │◄── Opus ─────│  (D052)     │◄── Opus ─────│        │
└────────┘              │             │              └────────┘
                        │  Stateless  │
┌────────┐              │  forwarding │
│Player C│─── Opus ────►│             │
│        │◄── Opus ─────│             │
└────────┘              └─────────────┘
```

- **Relay-forwarded audio:** Voice data flows through the room server (D052), maintaining IP privacy — the same principle as D059's in-game voice design. The room server performs stateless Opus packet forwarding (copies bytes without decoding). This prevents IP exposure, which is a known harassment vector even in the pre-game lobby phase.
- **Lobby → game transition:** When the match starts and clients connect to the game relay, voice seamlessly transitions from the room server to the game relay. No reconnection is needed — the relay assumes voice forwarding from the room server's role. If the room server and game relay are the same process (common for community servers), the transition is a no-op.
- **Push-to-talk (default):** RTS players need both hands on mouse/keyboard during games. Push-to-talk avoids accidental transmission of keyboard clatter, breathing, and background noise. Default keybind: `V`. Voice activation mode available in settings for players who prefer it.
- **Per-player volume:** Each player's voice volume is adjustable independently (right-click their name in the player list → volume slider). Mute individual players with one click.
- **Voice channels:** Mirror text chat channels — All, Team. During gameplay, voice defaults to Team-only to prevent leaking strategy to opponents. Spectators have their own voice channel.
- **Codec:** Opus (standard WebRTC codec). 32 kbps mono is sufficient for clear voice in a game context. Total bandwidth for a full 8-player lobby: ~224 kbps (7 incoming streams × 32 kbps) — negligible compared to game traffic.
- **Browser (WASM) support:** Browser builds use WebRTC via `str0m` for voice (see D059 § VoiceTransport). Desktop builds send Opus packets directly on the `Transport` connection's `MessageLane::Voice`.

**Voice UI indicators:**

```
┌────────────────────────┐
│ Players:               │
│  🔊 cmdr (host)   1800 │  ← speaking indicator
│  🔇 alice         1650 │  ← muted by self
│  🎤 bob           1520 │  ← has mic, not speaking
│  📵 carol         ---- │  ← voice disabled
└────────────────────────┘
```

Speaking indicators appear next to player names in the lobby and during gameplay (small icon on the player's color bar in the sidebar). This lets players see who's talking at a glance.

**Privacy and safety:**

- Voice is opt-in. Players can disable voice entirely in settings. The client never activates the microphone without explicit user action (push-to-talk press or voice activation toggle).
- No voice recording by the relay or community server during normal operation. Voice streams are ephemeral in the relay pipeline. (Note: D059 adds opt-in voice-in-replay where consenting players' voice is captured client-side during gameplay — this is client-local recording with consent, not relay-side recording.)
- Abusive voice users can be muted by any player (locally) or by the host (server-enforced kick from voice channel).
- Ranked/competitive rooms can enforce "no voice" or "team-voice-only" policies.

**When external voice is better:** IC's built-in voice is designed for casual lobbies, LAN parties, and pickup games where players don't have a pre-existing Discord/TeamSpeak. Competitive teams will continue using external voice (lower latency, better quality, persistent channels). IC doesn't try to replace Discord — it provides a frictionless default for when Discord isn't set up.

**Player Identity in Lobby**

Every player in a lobby is visible with their profile identity — not just a text name. The lobby player list shows:

- **Avatar:** Small profile image (32×32 in list, 64×64 on hover/click). Sourced from the player's profile (see D053).
- **Display name:** The player's chosen name. If the player has a community-verified identity (D052 SCR), a small badge appears next to the name indicating which community verified them.
- **Rating badge:** If the room is on a community server, the player's verified rating for the relevant game module is shown (from their presented SCR). Unranked players show "—".
- **Presence indicators:** Microphone status, ready state, download progress (if syncing resources).

Clicking a player's name in the lobby opens a **profile card** — a compact view of their player profile (D053) showing avatar, bio, recent achievements, win rate, and community memberships. This lets players gauge each other before a match without leaving the lobby.

The profile card also exposes scoped quick actions:
- **Mute** (D059, local communication control)
- **Block** (local social preference)
- **Report** (community moderation signal with evidence handoff to D052 review pipeline)
- **Avoid Player** (D055 matchmaking preference, best-effort only — clearly labeled as non-guaranteed in ranked)

**Updated lobby UI with communication:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Room: TKR-4N7  —  Map: Desert Arena  —  RA1 Classic Balance       │
├──────────────────────────────────┬───────────────────────────────────┤
│  Players                         │  Chat [All ▾]                    │
│  ┌──┐ 🔊 cmdr (host)   ⭐ 1800  │  [SYS] Room created              │
│  │🎖│ Ready                      │  [cmdr] hey all, gg              │
│  └──┘                            │  [alice] glhf!                   │
│  ┌──┐ 🎤 alice         ⭐ 1650  │  [SYS] bob joined                │
│  │👤│ Ready                      │  [bob] yo what map?              │
│  └──┘                            │  [cmdr] desert arena, classic    │
│  ┌──┐ 🎤 bob           ⭐ 1520  │  [bob] 👍                         │
│  │👤│ ⬇️ Syncing 67%             │                                  │
│  └──┘                            │                                  │
│  ┌──┐ 📵 carol          ----    │                                  │
│  │👤│ Connecting...              ├───────────────────────────────────┤
│  └──┘                            │ [Type message...]        [Send]  │
├──────────────────────────────────┴───────────────────────────────────┤
│  Mods: alice/hd-sprites@2.0, bob/desert-map@1.1                     │
│  [Settings]  [Invite]  [Start Game] (waiting for all players)       │
└──────────────────────────────────────────────────────────────────────┘
```

The left panel shows players with avatars (small square icons), voice status, community rating badges, and ready state. The right panel is the chat. The layout adapts to screen size (D032 responsive UI) — on narrow screens, chat slides below the player list.

**Phase:** Text chat ships with lobby implementation (Phase 5). Voice chat Phase 5–6a. Profile images in lobby require D053 (Player Profile, Phase 3–5).
