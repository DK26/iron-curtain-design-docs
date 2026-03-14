### Community Transparency Log

The trust model above establishes that the community server only signs credentials it computed or verified. But who watches the server? A malicious or compromised operator could inflate a friend's rating, issue contradictory records to different players (equivocation), or silently revoke and reissue credentials. Players trust the community, but have no way to *audit* it.

IC solves this with a **transparency log** — an append-only Merkle tree of every SCR the community server has ever issued. This is the same technique Google deployed at scale for [Certificate Transparency](https://certificate.transparency.dev/) (CT, RFC 6962) to prevent certificate authorities from issuing rogue TLS certificates. CT has been mandatory for all publicly-trusted certificates since 2018 and processes billions of entries. The insight transfers directly: a community server is a credential authority, and the same accountability mechanism that works for CAs works here.

**How it works:**

1. Every time the community server signs an SCR, it appends `SHA-256(scr_bytes)` as a leaf in an append-only Merkle tree.
2. The server returns an **inclusion proof** alongside the SCR — a set of O(log N) hashes that proves the SCR exists in the tree at a specific index. The player stores this proof alongside the SCR in their local credential file.
3. The server publishes its current **Signed Tree Head** (STH) — the root hash + tree size + a timestamp + the server's signature — at a well-known endpoint (e.g., `GET /transparency/sth`). This is a single ~128-byte value.
4. **Auditors** (any interested party — players, other community operators, automated monitors) periodically fetch the STH and verify **consistency**: that each new STH is an extension of the previous one (no entries removed or rewritten). This is a single O(log N) consistency proof per check.
5. Players can verify their personal inclusion proofs against the published STH — confirming their SCRs are in the same tree everyone else sees.

```
                    Merkle Tree (append-only)
                    ┌───────────────────────┐
                    │      Root Hash        │  ← Published as
                    │   (Signed Tree Head)  │    STH every hour
                    └───────────┬───────────┘
                   ┌────────────┴────────────┐
                   │                         │
              ┌────┴────┐              ┌─────┴────┐
              │  H(0,1) │              │  H(2,3)  │
              └────┬────┘              └────┬─────┘
           ┌───────┴───────┐        ┌──────┴───────┐
           │               │        │              │
       ┌───┴───┐     ┌────┴───┐ ┌──┴───┐    ┌────┴───┐
       │ SCR 0 │     │ SCR 1  │ │ SCR 2│    │ SCR 3  │
       │(alice │     │(bob    │ │(alice│    │(carol  │
       │rating)│     │match)  │ │achv) │    │rating) │
       └───────┘     └────────┘ └──────┘    └────────┘

Inclusion proof for SCR 2: [H(SCR 3), H(0,1)]
→ Verifier recomputes: H(2,3) = H(H(SCR 2) || H(SCR 3)),
   Root = H(H(0,1) || H(2,3)) → must match published STH root.
```

**What this catches:**

| Attack                                                     | How the transparency log detects it                                                                                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rating inflation**                                       | Auditor sees a rating SCR that doesn't follow from prior match results in the log. The Merkle tree includes every SCR — match SCRs and rating SCRs are interleaved, so the full causal chain is visible.                   |
| **Equivocation** (different records for different players) | Two players comparing inclusion proofs against the same STH would find one proof fails — the tree can't contain two contradictory entries at the same index. An auditor monitoring the log catches this directly.          |
| **Silent revocation**                                      | Revocation SCRs are logged like any other record. A player whose credential was revoked can see the revocation in the log and verify it was issued by the server, not fabricated.                                          |
| **History rewriting**                                      | Consistency proofs between successive STHs detect any modification to past entries. The append-only structure means the server can't edit history without publishing a new root that's inconsistent with the previous one. |

**What this does NOT provide:**

- **Correctness of game outcomes.** The log proves the server issued a particular SCR. It doesn't prove the underlying match was played fairly — that's the relay's job (`CertifiedMatchResult`). The log is an accountability layer over the signing layer.
- **Real-time fraud prevention.** A compromised server can still issue a bad SCR. The transparency log ensures the bad SCR is *visible* — it can't be quietly slipped in. Detection is retrospective (auditors find it later), not preventive.

**Operational model:**

- **STH publish frequency:** Configurable per community, default hourly. More frequent = faster detection, more bandwidth. Tournament communities might publish every minute during events.
- **Auditor deployment:** The `ic community audit` CLI command fetches and verifies consistency of a community's transparency log. Players can run this manually. Automated monitors (a cron job, a GitHub Action, a community-run service) provide continuous monitoring. IC provides the tooling; communities decide how to deploy it.
- **Log storage:** The Merkle tree is append-only and grows at ~32 bytes per SCR issued (one hash per leaf). A community that issues 100,000 SCRs has a ~3.2 MB log. This is stored server-side in SQLite alongside the existing community state.
- **Inclusion proof size:** O(log N) hashes. For 100,000 SCRs, that's ~17 hashes × 32 bytes = ~544 bytes per proof. Added to the SCR response, this is negligible.

```rust
/// Signed Tree Head — published periodically by the community server.
pub struct SignedTreeHead {
    pub tree_size: u64,            // Number of SCRs in the log
    pub root_hash: [u8; 32],       // SHA-256 Merkle root
    pub timestamp: i64,            // Unix seconds
    pub community_key: [u8; 32],   // Ed25519 public key
    pub signature: [u8; 64],       // Ed25519 signature over the above
}

/// Inclusion proof returned alongside each SCR.
pub struct InclusionProof {
    pub leaf_index: u64,           // Position in the tree
    pub tree_size: u64,            // Tree size at time of inclusion
    pub path: Vec<[u8; 32]>,      // O(log N) sibling hashes
}

/// Consistency proof between two tree heads.
pub struct ConsistencyProof {
    pub old_size: u64,
    pub new_size: u64,
    pub path: Vec<[u8; 32]>,      // O(log N) hashes
}
```

**Phase:** The transparency log ships with the community server in **Phase 5**. It's an integral part of community accountability, not an afterthought. The `ic community audit` CLI command ships in the same phase. Automated monitoring tooling is Phase 6a.

**Why this isn't blockchain:** A transparency log is a cryptographic data structure maintained by a single authority (the community server), auditable by anyone. It provides non-equivocation and append-only guarantees without distributed consensus, proof-of-work, tokens, or peer-to-peer gossip. The server runs it unilaterally; auditors verify it externally. This is orders of magnitude simpler and cheaper than any blockchain — and it's exactly what's needed. Certificate Transparency protects the entire web's TLS infrastructure using this pattern. It works.

### Matchmaking Design

The community server's matchmaking uses verified ratings from presented SCRs:

```rust
/// Matchmaking pool entry — one per connected player seeking a game.
pub struct MatchmakingEntry {
    pub player_key: Ed25519PublicKey,
    pub verified_rating: PlayerRating,    // From verified SCR
    pub game_module: GameModuleId,        // What game they want to play
    pub preferences: MatchPreferences,    // Map pool, team size, etc.
    pub queue_time: Instant,              // When they started searching
}

/// Server-side matchmaking loop (simplified).
fn matchmaking_tick(pool: &mut Vec<MatchmakingEntry>, provider: &dyn RankingProvider) {
    // Sort by queue time (longest-waiting first)
    pool.sort_by_key(|e| e.queue_time);

    for candidate_pair in pool.windows(2) {
        let quality = provider.match_quality(
            &[candidate_pair[0].verified_rating],
            &[candidate_pair[1].verified_rating],
        );

        if quality.fairness > FAIRNESS_THRESHOLD || queue_time_exceeded(candidate_pair) {
            // Accept match — create lobby
            create_lobby(candidate_pair);
        }
    }
}
```

**Matchmaking widens over time:** Initial search window is tight (±100 rating). After 30 seconds, widens to ±200. After 60 seconds, ±400. After 120 seconds, accepts any match. This prevents indefinite queues for players at rating extremes.

**Team games:** For 2v2+ matchmaking, the server balances team average ratings. Each player's SCR is individually verified. Team rating = average of individual Glicko-2 ratings.

### Lobby & Room Discovery

Matchmaking (above) handles competitive/ranked play. But most RTS games are casual — "join my friend's game," "let's play a LAN match," "come watch my stream and play." These need a room-based lobby with low-friction discovery. IC provides five discovery tiers, from zero-infrastructure to full game browser. Every tier works on every platform (desktop, browser, mobile — Invariant #10).

**Tier 0 — Direct Connect (IP:port)**

Always available, zero external dependency. Type an IP address and port, connect. Works on LAN, works over internet with port forwarding. This is the escape hatch — if every server is down, two players with IP addresses can still play.

```
ic play connect 192.168.1.42:7400
```

If a deferred direct-peer gameplay mode is ever enabled (for example, explicit LAN/experimental variants without relay authority), the host is the connection target. For relay-hosted games (the default), this is the relay address. No discovery mechanism is needed when endpoints are already known.

**Tier 1 — Room Codes (Among Us pattern, decentralized)**

When a host creates a room on any relay or community server, the server assigns a short alphanumeric code. Share it verbally, paste it in Discord, text it to a friend.

```
Room code: TKR-4N7
```

**Code format:**
- 6 characters from an unambiguous set: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (30 chars, excludes 0/O, 1/I/L)
- Displayed as `XXX-XXX` for readability
- 30^6 ≈ 729 million combinations — more than enough
- Case-insensitive input (the UI uppercases automatically)
- Codes are ephemeral — exist only in server memory, expire when the room closes + 5-minute grace

**Resolution:** Player enters the code in-game. The client queries all configured community servers in parallel (typically 1–3 HTTP requests). Whichever server recognizes the code responds with connection info (relay address + room ID + required resources). No central "code directory" — every community server manages its own code namespace. Collision across communities is fine because clients verify the code against the responding server.

```
ic play join TKR-4N7
```

**Why Among Us-style codes?** Among Us popularized this pattern because it works for exactly the scenario IC targets: you're in a voice call, someone says "join TKR-4N7," everyone types it in 3 seconds. No URLs, no IP addresses, no friend lists. The friction is nearly zero. For an RTS with 2–8 players, this is the sweet spot.

**Tier 2 — QR Code**

The host's client generates a QR code that encodes a deep link URI:

```
ironcurtain://join/community.example.com/TKR-4N7
```

Scanning the QR code opens the IC client (or the browser version on mobile) and auto-joins the room. Perfect for:

- **LAN parties:** Display QR on the host's screen. Everyone scans with their phone/tablet to join via browser client.
- **Couch co-op:** Scan from a phone to open the WASM browser client on a second device.
- **Streaming:** Overlay QR on stream → viewers scan to join or spectate.
- **In-person events / tournaments:** Print QR on table tents.

The QR code is regenerated if the room code changes (e.g., room migrates to a different relay). The deep link URI scheme (`ironcurtain://`) is registered on desktop; on platforms without scheme registration, the QR can encode an HTTPS URL (`https://play.ironcurtain.gg/join/TKR-4N7`) that redirects to the client or browser version.

**Tier 3 — Game Browser**

Community servers publish their active rooms to a room listing API. The in-game browser aggregates listings from all configured communities — the same federation model as Workshop source aggregation.

```
┌─────────────────────────────────────────────────────────────┐
│  Game Browser                                    [Refresh]  │
├──────────────┬──────┬─────────┬────────┬──────┬─────────────┤
│ Room Name    │ Host │ Players │ Map    │ Ping │ Mods        │
├──────────────┼──────┼─────────┼────────┼──────┼─────────────┤
│ Casual 1v1   │ cmdr │ 1/2     │ Arena  │ 23ms │ none        │
│ HD Mod Game  │ alice│ 3/4     │ Europe │ 45ms │ hd-pack 2.1 │
│ Newbies Only │ bob  │ 2/6     │ Desert │ 67ms │ none        │
└──────────────┴──────┴─────────┴────────┴──────┴─────────────┘
```

This is the traditional server browser experience (OpenRA has this, Quake had this, every classic RTS had this). It coexists with room codes — a room visible in the browser also has a room code.

**Room listing API payload** — community servers publish room metadata via a structured API. The full field set, filtering/sorting capabilities, and client-side browser organization (favorites, history, blacklist, friends' games, LAN tab, quick join) are documented in `player-flow/multiplayer.md` § Game Browser. The listing payload includes:

- **Identity:** room name, host name (verified badge), dedicated/listen flag, optional description, optional MOTD, server URL/rules page, free-form tags/keywords
- **Game state:** status (waiting/in-game/post-game), granular lobby phase, playtime/duration, rejoinable flag, replay recording flag
- **Players:** current/max players, team format (1v1/2v2/FFA/co-op), AI count + difficulty, spectator count/slots, open slots, average player rating, player competitive ranks
- **Map:** name, preview thumbnail, size, tileset/theater, type (skirmish/scenario/random), source (built-in/workshop/custom), designed player capacity
- **Game rules:** game module (RA/TD), game type (casual/competitive/co-op/tournament), experience preset (D033), victory conditions, game speed, starting credits, fog of war mode, crates, superweapons, tech level, host-curated viewable cvars (D064)
- **Mods & version:** engine version, mod name + version, content fingerprint/hash (map + mods — prevents join-then-desync in lockstep), client-side mod compatibility indicator (green/yellow/red), pure/unmodded flag, protocol version range
- **Network:** ping/latency, relay server region, relay operator, connection type (relayed/direct/LAN)
- **Trust & access:** trust label (D011: IC Certified/Casual/Cross-Engine/Foreign), public/private/invite-only, community membership with verified badges/icons/logos, community tags, minimum rank requirement
- **Communication:** voice chat enabled/disabled (D059), language preference, AllChat policy
- **Tournament:** tournament ID/name, bracket link, shoutcast/stream URL

**Anti-abuse for listings:**
- Room names, descriptions, and tags are subject to relay-side content filtering (configurable per community server, D064)
- Custom icons/logos require community-level verification to prevent impersonation
- Listing TTL with heartbeat — stale listings expire automatically (OpenRA pattern)
- Community servers can delist rooms that violate their policies
- Client-side blacklist allows players to permanently hide specific servers

**Tier 4 — Matchmaking Queue (D052)**

Already designed above. Player enters a queue; community server matches by rating. This creates rooms automatically — the player never sees a room code or browser.

**Tier 5 — Deep Links / Invites**

The `ironcurtain://join/...` URI scheme works as a clickable link anywhere that supports URI schemes:

- Discord: paste `ironcurtain://join/official.ironcurtain.gg/TKR-4N7` → click to join
- Browser: HTTPS fallback URL redirects to client or opens browser WASM version
- Steam: Steam rich presence integration → "Join Game" button on friend's profile
- In-game friends list (if implemented): one-click invite sends a deep link

**Discovery summary:**

| Tier | Mechanism      | Requires Server?          | Best For                       | Friction             |
| ---- | -------------- | ------------------------- | ------------------------------ | -------------------- |
| 0    | Direct IP:port | No                        | LAN, development, fallback     | High (must know IP)  |
| 1    | Room codes     | Yes (any relay/community) | Friends, voice chat, casual    | Very low (6 chars)   |
| 2    | QR code        | Yes (same as room code)   | LAN parties, streaming, mobile | Near zero (scan)     |
| 3    | Game browser   | Yes (community servers)   | Finding public games           | Low (browse + click) |
| 4    | Matchmaking    | Yes (community server)    | Competitive/ranked             | Zero (press "Play")  |
| 5    | Deep links     | Yes (same as room code)   | Discord, web, social           | Near zero (click)    |

Tiers 0–2 work with a single self-hosted relay (a $5 VPS or even localhost). No official infrastructure required. Tiers 3–4 require community servers. Tier 5 requires URI scheme registration (desktop) or an HTTPS redirect service (browser).

### Lobby Communication

> **Full section:** [D052 — Lobby Communication](D052-lobby-communication.md)

Text chat (relay-routed `LobbyMessage`, rate limiting, moderation, block list), relay-forwarded Opus voice chat (push-to-talk default, per-player volume, privacy-first), player identity in lobby (avatars, rating badges, profile cards with quick actions), and updated lobby UI mockup with communication panels.

### In-Lobby P2P Resource Sharing

When a player joins a room that requires resources (mods, maps, resource packs) they don't have locally, the lobby becomes a P2P swarm for those resources. The relay server (or host in P2P mode) acts as the tracker. This is the existing D049 P2P protocol scoped to a single lobby's resource list.

**Flow:**

```
Host creates room
  → declares required: [alice/hd-sprites@2.0, bob/desert-map@1.1]
  → host seeds both resources

Player joins room
  → receives resource list with SHA-256 from Workshop index
  → checks local cache: has alice/hd-sprites@2.0 ✓, missing bob/desert-map@1.1 ✗

  → Step 1: Verify resource exists in a known Workshop source
    Client fetches manifest for bob/desert-map@1.1 from Workshop index
    (git-index HTTP fetch or Workshop server API)
    Gets: SHA-256, manifest_hash, size, dependencies
    If resource NOT in any configured Workshop source → REFUSE download
    (prevents arbitrary file transfer — Workshop index is the trust anchor)

  → Step 2: Join lobby resource swarm
    Relay/host announces available peers for bob/desert-map@1.1
    Download via BitTorrent protocol from:
      Priority 1: Other lobby players who already have it (lowest latency)
      Priority 2: Workshop P2P swarm (general seeders)
      Priority 3: Workshop HTTP fallback (CDN/GitHub Releases)

  → Step 3: Verify
    SHA-256 of downloaded .icpkg matches Workshop index manifest ✓
    manifest_hash of internal manifest.yaml matches index ✓
    (Same verification chain as regular Workshop install — see V20)

  → Step 4: Report ready
    Client signals lobby: "all resources verified, ready to play"

All players ready → countdown → game starts
```

**Lobby UI during resource sync:**

```
┌────────────────────────────────────────────────┐
│  Room: TKR-4N7  —  Waiting for players...      │
├────────────────────────────────────────────────┤
│  ✅ cmdr (host)     Ready                       │
│  ✅ alice           Ready                        │
│  ⬇️ bob             Downloading 2/3 resources   │
│     └─ bob/desert-map@1.1  [████░░░░] 67%  P2P │
│     └─ alice/hd-dialog@1.0 [██████░░] 82%  P2P │
│  ⏳ carol           Connecting...                │
├────────────────────────────────────────────────┤
│  Required: alice/hd-sprites@2.0, bob/desert-    │
│  map@1.1, alice/hd-dialog@1.0                   │
│  [Start Game]  (waiting for all players)        │
└────────────────────────────────────────────────┘
```

**The host-as-tracker model:**

For relay-hosted games (the default), the relay IS the tracker — it already manages all connections in the room. It maintains an in-memory peer table: which players have which resources. When a new player joins and needs resources, the relay tells them which peers can seed. This is trivial — a `HashMap<ResourceId, Vec<PeerId>>` that lives only as long as the room exists.

For deferred direct-peer games (if enabled for explicit LAN/experimental use without relay authority): the host's game client runs a minimal tracker. Same data structure, same protocol, just embedded in the game client instead of a separate relay process. The host is already acting as connection coordinator, so adding resource tracking is marginal.

**Security model — preventing malicious content transfer:**

The critical constraint: **only Workshop-published resources can be shared in a lobby.** The lobby declares resources by their Workshop identity (`publisher/package@version`), not by arbitrary file paths. The security chain:

1. **Workshop index is the trust anchor.** Every resource has a SHA-256 and `manifest_hash` recorded in a Workshop index (git-index with signed commits or Workshop server API). The client must be able to look up the resource in a known Workshop source before downloading.
2. **Content verification is mandatory.** After download, the client verifies SHA-256 (full package) and `manifest_hash` (internal manifest) against the Workshop index — not against the host's claim. Even if every other player in the lobby is malicious, a single honest Workshop index protects the downloading player.
3. **Unknown resources are refused.** If a room requires `evil/malware@1.0` and that doesn't exist in any Workshop source the player has configured, the client refuses to download and warns: "Resource not found in any configured Workshop source. Add the community's Workshop source or leave the lobby."
4. **No arbitrary file transfer.** The P2P protocol only transfers `.icpkg` archives that match Workshop-published checksums. There is no mechanism for peers to push arbitrary files — the protocol is pull-only and content-addressed.
5. **Mod sandbox limits blast radius.** Even a resource that passes all integrity checks is still subject to WASM capability sandbox (D005), Lua execution limits (D004), and YAML schema validation (D003). A malicious mod that sneaks past Workshop review can at most affect gameplay within its declared capabilities.
6. **Post-install scanning (Phase 6a+).** When a resource is auto-downloaded in a lobby, the client checks for Workshop security advisories (V18) before loading it. If the resource version has a known advisory → warn the player before proceeding.

**What about custom maps not on the Workshop?**

For early phases (before Workshop exists) or for truly private content: the host can share a map file by embedding it in the room's initial payload (small maps are <1MB). The receiving client:
- Must explicitly accept ("Host wants to share a custom map not published on Workshop. Accept? [Yes/No]")
- The file is verified for format validity (must parse as a valid IC map) but has no Workshop-grade integrity chain
- These maps are quarantined (loaded but not added to the player's Workshop cache)
- This is the "developer/testing" escape hatch — not the normal flow

This escape hatch is disabled by default in competitive/ranked rooms (community servers can enforce "Workshop-only" policies).

**Bandwidth and timing:**

The lobby applies D049's `lobby-urgent` priority tier — auto-downloads preempt background Workshop activity and get full available bandwidth. Combined with the lobby swarm (host + ready players all seeding), typical resource downloads complete in seconds for common mods (<50MB). The download timer can be configured per-community: tournament servers might set a 60-second download window, casual rooms wait indefinitely.

If a player's download is too slow (configurable threshold, e.g., 5 minutes), the lobby UI offers: "Download taking too long. [Keep waiting] [Download in background and spectate] [Leave lobby]".

**Local resource lifecycle:** Resources downloaded via lobby P2P are tagged as **transient** (not pinned). They remain fully functional but auto-clean after `transient_ttl_days` (default 30 days) of non-use. After the session, a post-match toast offers: "[Pin] [Auto-clean in 30 days] [Remove now]". Frequently-used lobby resources (3+ sessions) are automatically promoted to pinned. See D030 § "Local Resource Management" for the full lifecycle.

### Match Creation & Content Pinning

When a host creates a room, the room's content state is **pinned** — capturing the exact set of mods, conflict resolutions, and balance channel snapshots in a single fingerprint (D062). This fingerprint is the authoritative "what content does this match use?" identifier for the room's lifetime.

**What the fingerprint includes:**
- Active mod set with exact versions (`publisher/package@version`)
- Conflict resolution choices (when multiple mods modify the same value)
- Balance channel snapshot ID (if the host subscribes to a content channel — see [D049 § Content Channels Integration](../../09e/D049/D049-content-channels-integration.md))

**Joining player verification:** A joining player's client computes its own fingerprint from its active mod profile. If it matches the room's pinned fingerprint → immediate ready state (single SHA-256 comparison, no per-mod enumeration). On mismatch, the lobby presents the namespace diff (D062): missing mods, version differences, and balance channel state.

**Balance channel updates during a lobby session:** If a balance channel publishes a new snapshot while a lobby is open, the room's pinned fingerprint does NOT change — the room uses the snapshot that was current at creation time. This prevents mid-lobby content drift. Players joining later are asked to match the room's snapshot, not the channel's latest.

**Cross-references:** [D062 § Multiplayer Integration](../../09c/D062-mod-profiles.md), [D049 § Content Channels Integration](../../09e/D049/D049-content-channels-integration.md), [architecture/data-flows-overview.md](../../architecture/data-flows-overview.md) § Flow 5.

Default: **Glicko-2** (already specified in D041 as `Glicko2Provider`).

Why Glicko-2 over alternatives:
- **Rating deviation** naturally models uncertainty. New players have wide confidence intervals (RD ~350); experienced players have narrow ones (RD ~50). Matchmaking can use RD to avoid matching a highly uncertain new player against a stable veteran.
- **Inactivity decay:** RD increases over time without play. A player who hasn't played in months is correctly modeled as "uncertain" — their first few games back will move their rating significantly, then stabilize.
- **Open and unpatented.** TrueSkill (Microsoft) and TrueSkill 2 are patented. Glicko-2 is published freely by Mark Glickman.
- **Lichess uses it.** Proven at scale in a competitive community with similar dynamics (skill-based 1v1 with occasional team play).
- **RankingProvider trait (D041)** makes this swappable. Communities that want Elo, or a league/tier system, or a custom algorithm, implement the trait.

**Rating storage in SCR payload** (record_type = 0x01, rating snapshot):

```
rating payload:
  game_module_len   1 byte
  game_module       variable (UTF-8)
  algorithm_id_len  1 byte
  algorithm_id      variable (UTF-8, e.g., "glicko2")
  rating            8 bytes (i64 LE, fixed-point × 1000)
  deviation         8 bytes (i64 LE, fixed-point × 1000)
  volatility        8 bytes (i64 LE, fixed-point × 1000000)
  games_played      4 bytes (u32 LE)
  wins              4 bytes (u32 LE)
  losses            4 bytes (u32 LE)
  draws             4 bytes (u32 LE)
  streak_current    2 bytes (i16 LE, positive = win streak)
  rank_position     4 bytes (u32 LE, 0 = unranked)
  percentile        2 bytes (u16 LE, 0-1000 = 0.0%-100.0%)
```

