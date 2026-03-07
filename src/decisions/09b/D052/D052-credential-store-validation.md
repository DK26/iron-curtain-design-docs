### Community Credential Store (SQLite)

Each community a player belongs to gets a separate SQLite file in the player's data directory:

```
<data_dir>/communities/
  ├── official-ic.db          # Official community
  ├── clan-wolfpack.db        # Clan community
  └── tournament-2026.db      # Tournament community
```

**Schema:**

```sql
-- Community identity (one row)
CREATE TABLE community_info (
    community_key   BLOB NOT NULL,     -- Current SK Ed25519 public key (32 bytes)
    recovery_key    BLOB NOT NULL,     -- RK Ed25519 public key (32 bytes) — cached at join
    community_name  TEXT NOT NULL,
    server_url      TEXT NOT NULL,      -- Community server endpoint
    key_fingerprint TEXT NOT NULL,      -- hex(SHA-256(community_key)[0..8])
    rk_fingerprint  TEXT NOT NULL,      -- hex(SHA-256(recovery_key)[0..8])
    sk_rotated_at   INTEGER,           -- when current SK was activated (null = original)
    joined_at       INTEGER NOT NULL,   -- Unix timestamp
    last_sync       INTEGER NOT NULL    -- Last successful server contact
);

-- Key rotation history (for audit trail and chain verification)
CREATE TABLE key_rotations (
    sequence        INTEGER PRIMARY KEY,
    old_key         BLOB NOT NULL,     -- retired SK public key
    new_key         BLOB NOT NULL,     -- replacement SK public key
    signed_by       TEXT NOT NULL,     -- 'signing_key' or 'recovery_key'
    reason          TEXT NOT NULL,     -- 'scheduled', 'migration', 'compromise', 'precautionary'
    effective_at    INTEGER NOT NULL,  -- Unix timestamp
    grace_until     INTEGER NOT NULL,  -- old key accepted until this time
    rotation_record BLOB NOT NULL      -- full signed rotation record bytes
);

-- Player identity within this community (one row)
CREATE TABLE player_info (
    player_key      BLOB NOT NULL,     -- Ed25519 public key (32 bytes)
    display_name    TEXT,
    avatar_hash     TEXT,              -- SHA-256 of avatar image (for cache / fetch)
    bio             TEXT,              -- short self-description (max 500 chars)
    title           TEXT,              -- earned/selected title (e.g., "Iron Commander")
    registered_at   INTEGER NOT NULL
);

-- Current ratings (latest signed snapshot per rating type)
CREATE TABLE ratings (
    game_module     TEXT NOT NULL,      -- 'ra', 'td', etc.
    rating_type     TEXT NOT NULL,      -- algorithm_id() from RankingProvider
    rating          INTEGER NOT NULL,   -- Fixed-point (e.g., 1500000 = 1500.000)
    deviation       INTEGER NOT NULL,   -- Glicko-2 RD, fixed-point
    volatility      INTEGER NOT NULL,   -- Glicko-2 σ, fixed-point
    games_played    INTEGER NOT NULL,
    sequence        INTEGER NOT NULL,
    scr_blob        BLOB NOT NULL,      -- Full signed SCR
    PRIMARY KEY (game_module, rating_type)
);

-- Match history (append-only, each row individually signed)
CREATE TABLE matches (
    match_id        BLOB PRIMARY KEY,   -- SHA-256 of match data
    sequence        INTEGER NOT NULL,
    played_at       INTEGER NOT NULL,
    game_module     TEXT NOT NULL,
    map_name        TEXT,
    duration_ticks  INTEGER,
    result          TEXT NOT NULL,       -- 'win', 'loss', 'draw', 'disconnect'
    rating_before   INTEGER,
    rating_after    INTEGER,
    opponents       BLOB,               -- Serialized: [{key, name, rating}]
    scr_blob        BLOB NOT NULL       -- Full signed SCR
);

-- Achievements (each individually signed)
CREATE TABLE achievements (
    achievement_id  TEXT NOT NULL,
    game_module     TEXT NOT NULL,
    unlocked_at     INTEGER NOT NULL,
    match_id        BLOB,               -- Which match triggered it (nullable)
    sequence        INTEGER NOT NULL,
    scr_blob        BLOB NOT NULL,
    PRIMARY KEY (achievement_id, game_module)
);

-- Revocation records (tiny — one per record type at most)
CREATE TABLE revocations (
    record_type         INTEGER NOT NULL,
    min_valid_sequence  INTEGER NOT NULL,
    scr_blob            BLOB NOT NULL,
    PRIMARY KEY (record_type)
);

-- Indexes for common queries
CREATE INDEX idx_matches_played_at ON matches(played_at DESC);
CREATE INDEX idx_matches_module ON matches(game_module);
```

**What the Community Server stores vs. what the player stores:**

| Data                     | Player's SQLite      | Community Server                           |
| ------------------------ | -------------------- | ------------------------------------------ |
| Player public key        | Yes                  | Yes (registered members list)              |
| Current rating           | Yes (signed SCR)     | Optionally cached for matchmaking          |
| Full match history       | Yes (signed SCRs)    | No — only recent results queue for signing |
| Achievements             | Yes (signed SCRs)    | No                                         |
| Revocation list          | Yes (signed SCRs)    | Yes (one integer per player per type)      |
| Opponent profiles (D042) | Yes (local analysis) | No                                         |
| Replay files             | Yes (local)          | No                                         |

The community server's persistent storage is approximately: `(player_count × 32 bytes key) + (player_count × 8 bytes revocation)` = ~40 bytes per player. A community of 10,000 players needs ~400KB of server storage. The matchmaking cache adds more, but it's volatile (RAM only, rebuilt from player connections).

### Verification Flow

When a player joins a community game:

```
┌──────────┐                              ┌──────────────────┐
│  Player  │  1. Connect + present        │  Community       │
│          │     latest rating SCR  ────► │  Server          │
│          │                              │                  │
│          │  2. Verify:                  │  • Ed25519 sig ✓ │
│          │     - signature valid?       │  • sequence ≥    │
│          │     - community_key = ours?  │    min_valid? ✓  │
│          │     - not expired?           │  • not expired ✓ │
│          │     - sequence ≥ min_valid?  │                  │
│          │                              │                  │
│          │  3. Accept into matchmaking  │  Place in pool   │
│          │     with verified rating ◄── │  at rating 1500  │
│          │                              │                  │
│          │  ... match plays out ...     │  Relay hosts game │
│          │                              │                  │
│          │  4. Match ends, relay        │  CertifiedMatch  │
│          │     certifies result   ────► │  Result received │
│          │                              │                  │
│          │  5. Server computes rating   │  RankingProvider  │
│          │     update, signs new SCRs   │  .update_ratings()│
│          │                              │                  │
│          │  6. Receive signed SCRs ◄──  │  New rating SCR  │
│          │     Store in local SQLite    │  + match SCR     │
└──────────┘                              └──────────────────┘
```

**Verification is O(1):** One Ed25519 signature check (fast — ~15,000 verifications/sec on modern hardware), one integer comparison (sequence ≥ min_valid), one timestamp comparison (expires_at > now). No database lookup required for the common case.

**Expired credentials:** If a player's rating SCR has expired (default 7 days since last server sync), the server reissues a fresh SCR after verifying the player's identity (challenge-response with the player's Ed25519 private key). This prevents indefinitely using stale ratings.

**New player flow:** First connection to a community → server generates initial rating SCR (Glicko-2 default: 1500 ± 350) → player stores it locally. No pre-existing data needed.

**Offline play:** Local games and LAN matches can proceed without a community server. Results are unsigned. When the player reconnects, unsigned match data can optionally be submitted for retroactive signing (server decides whether to honor it — tournament communities may reject unsigned results).

### Server-Side Validation: What the Community Server Signs and Why

A critical question: why should a community server sign anything? What prevents a player from feeding the server fake data and getting a signed credential for a match they didn't play or a rating they didn't earn?

**The answer: the community server never signs data it didn't produce or verify itself.** A player cannot walk up to the server with a claim ("I'm 1800 rated") and get it signed. Every signed credential is the server's own output — computed from inputs it trusts. This is analogous to a university signing a diploma: the university doesn't sign because the student claims they graduated. It signs because it has records of every class the student passed.

Here is the full trust chain for every type of signed credential:

**Rating SCRs — the server computes the rating, not the player:**

```
Player claims nothing about their rating. The flow is:

1. Two players connect to the relay for a match.
2. The relay (D007) forwards all orders between players (lockstep).
3. The match ends. The relay determines the outcome internally via
   its own `check_match_end()` logic (system-wiring.md § relay tick
   loop, step f). Because the relay receives all orders and the sim
   is deterministic (Invariant #1), the relay's outcome is authoritative.
   Clients do not report outcomes — there is no client outcome-report
   frame in the wire protocol (wire-format.md § Frame enum).
4. The relay produces a CertifiedMatchResult:
   - Signed by the relay's own key
   - Contains: player keys, game module, map, duration,
     outcome (who won), order hashes, desync status
5. The community server receives the CertifiedMatchResult.
   - Verifies the relay signature (the community server trusts its
     own relay — they're the same process in the bundled deployment,
     or the operator explicitly configures which relay keys to trust).
6. The community server feeds the CertifiedMatchResult into
   RankingProvider::update_ratings() (D041).
7. The RankingProvider computes new Glicko-2 ratings from the
   match outcome + previous ratings.
8. The community server signs the new rating as an SCR.
9. The signed SCRs (rating + match record) are returned to both
   players via Frame::RatingUpdate on MessageLane::Orders
   (wire-format.md § Frame enum).

At no point does the player provide rating data to the server.
The server computed the rating. The server signs its own computation.
```

**Match SCRs — the relay certifies the match happened:**

The community server signs a match record SCR containing the match metadata (players, map, outcome, duration). This data comes from the `CertifiedMatchResult` which the relay produced. The server doesn't trust the player's claim about the match — it trusts the relay's attestation, because the relay was the network intermediary that observed every order in real time.

**Achievement SCRs — verification depends on context:**

Achievements are more nuanced because they can be earned in different contexts:

| Context                     | How the server validates                                                                                                                                                                                                                                                                    | Trust level                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Multiplayer match**       | Achievement condition cross-referenced with `CertifiedMatchResult` data. E.g., "Win 50 matches" — server counts its own signed match SCRs for this player. "Win under 5 minutes" — server checks match duration from the relay's certified result.                                          | **High** — server validates against its own records              |
| **Multiplayer in-game**     | Relay attests that the achievement trigger fired during a live match (the trigger is part of the deterministic sim, so the relay can verify by running headless). Alternatively, both clients attest the trigger fired (same as match outcome consensus).                                   | **High** — relay-attested or consensus-verified                  |
| **Single-player (online)**  | Player submits a replay file. Community server can fast-forward the replay (deterministic sim) to verify the achievement condition was met. Expensive but possible.                                                                                                                         | **Medium** — replay-verified, but replay submission is voluntary |
| **Single-player (offline)** | Player claims the achievement with no server involvement. When reconnecting, the claim can be submitted with the replay for retroactive verification. Community policy decides whether to accept: casual communities may accept on trust, competitive communities may require replay proof. | **Low** — self-reported unless replay-backed                     |

The community server's policy for achievement signing is configurable per community:

```rust
pub enum AchievementPolicy {
    /// Sign any achievement reported by the client (casual community).
    TrustClient,
    /// Sign immediately, but any player can submit a fraud proof
    /// (replay segment) to challenge. If the challenge verifies,
    /// the achievement SCR is revoked via sequence-based revocation.
    /// Inspired by Optimistic Rollup fraud proofs (Optimism, Arbitrum).
    OptimisticWithChallenge {
        challenge_window_hours: u32,  // default: 72
    },
    /// Sign only achievements backed by a CertifiedMatchResult
    /// or relay attestation (competitive community).
    RequireRelayAttestation,
    /// Sign only if a replay is submitted and server-side verification
    /// confirms the achievement condition (strictest, most expensive).
    RequireReplayVerification,
}
```

**`OptimisticWithChallenge` explained:** This policy borrows the core insight from Optimistic Rollups (Optimism, Arbitrum) in the Web3 ecosystem: execute optimistically (assume valid), and only do expensive verification if someone challenges. The server signs the achievement SCR immediately — same speed as `TrustClient`. But a challenge window opens (default 72 hours, configurable) during which any player who was in the same match can submit a **fraud proof**: a replay segment showing the achievement condition wasn't met. The community server fast-forwards the replay (deterministic sim — Invariant #1) to verify the challenge. If the challenge is valid, the achievement SCR is revoked via the existing sequence-based revocation mechanism. If no challenge arrives within the window, the achievement is final.

In practice, most achievements are legitimate, so the challenge rate is near zero — the expensive replay verification almost never runs. This gives the speed of `TrustClient` with the security guarantees of `RequireReplayVerification`. The pattern works because IC's deterministic sim means any disputed claim can be objectively verified from the replay — there's no ambiguity about what happened.

Most communities will use `RequireRelayAttestation` for multiplayer achievements and `TrustClient` or `OptimisticWithChallenge` for single-player achievements. The achievement SCR includes a `verification_level` field so viewers know how the achievement was validated. SCRs issued under `OptimisticWithChallenge` carry a `verification_level: "optimistic"` tag that upgrades to `"verified"` after the challenge window closes without dispute.

**Player registration — identity binding and Sybil resistance:**

When a player first connects to a community, the community server must decide: should I register this person? What stops one person from creating 100 accounts to game the rating system?

Registration is the one area where the community server does NOT have a relay to vouch for the data. The player is presenting themselves for the first time. The server's defenses are layered:

**Layer 1 — Cryptographic identity (always):**

The player presents their Ed25519 public key. The server challenges them to sign a nonce, proving they hold the private key. This establishes *key ownership*, not *personhood*. One person can generate infinite keypairs.

**Layer 2 — Rate limiting (always):**

The server rate-limits new registrations by IP address (e.g., max 3 new accounts per IP per day). This slows mass account creation without requiring any identity verification.

**Layer 3 — Reputation bootstrapping (always):**

New accounts start at the default rating (Glicko-2: 1500 ± 350) with zero match history. The high deviation (± 350) means the system is uncertain about their skill — it will adjust rapidly over the first ~20 matches. A smurf creating a new account to grief low-rated players will be rated out of the low bracket within a few matches.

Fresh accounts carry no weight in the trust system (D053): they have no signed credentials, no community memberships, no achievement history. The "Verified only" lobby filter (D053 trust-based filtering) excludes players without established credential history — exactly the accounts a Sybil attacker would create.

**Layer 4 — Platform binding (optional, configurable per community):**

Community servers can require linking a platform account (Steam, GOG, etc.) at registration. This provides real Sybil resistance — Steam accounts have purchase history, play time, and cost money. The community server doesn't verify the platform directly (it's not a Steam partner). Instead, it asks the player's IC client to provide a platform-signed attestation of account ownership (e.g., a Steam Auth Session Ticket). The server verifies the ticket against the platform's public API.

```rust
pub enum RegistrationPolicy {
    /// Anyone with a valid keypair can register. Lowest friction.
    Open,
    /// Require a valid platform account (Steam, GOG, etc.).
    RequirePlatform(Vec<PlatformId>),
    /// Require a vouching invite from an existing member.
    RequireInvite,
    /// Require solving a challenge (CAPTCHA, email verification, etc.).
    RequireChallenge(ChallengeType),
    /// Combination: e.g., platform OR invite.
    AnyOf(Vec<RegistrationPolicy>),
}
```

**Layer 5 — Community-specific policies (optional):**

| Policy                 | Description                                                                                                                                                                                                       | Use case                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Email verification** | Player provides email, server sends confirmation link. One account per email.                                                                                                                                     | Medium-security communities                  |
| **Invite-only**        | Existing members generate invite codes. New players must have a code.                                                                                                                                             | Clan servers, private communities            |
| **Vouching**           | An existing member in good standing (e.g., 100+ matches, no bans) vouches for the new player. If the new player cheats, the voucher's reputation is penalized too.                                                | Competitive leagues                          |
| **Probation period**   | New accounts are marked "probationary" for their first N matches (e.g., 10). Probationary players can't play ranked, can't join "Verified only" rooms, and their achievements aren't signed until probation ends. | Balances accessibility with fraud prevention |

These policies are **per-community**. The Official IC Community might use `RequirePlatform(Steam) + Probation(10 matches)`. A clan server uses `RequireInvite`. A casual LAN community uses `Open`. IC doesn't impose a single registration policy — it provides the building blocks and lets community operators assemble the policy that fits their community's threat model.

**Summary — what the server validates before signing each SCR type:**

| SCR Type         | Server validates...                                                  | Trust anchor             |
| ---------------- | -------------------------------------------------------------------- | ------------------------ |
| Rating           | Computed by the server itself from relay-certified match results     | Server's own computation |
| Match result     | Relay-signed `CertifiedMatchResult` (both clients agreed on outcome) | Relay attestation        |
| Achievement (MP) | Cross-referenced with match data or relay attestation                | Relay + server records   |
| Achievement (SP) | Replay verification (if required by community policy)                | Replay determinism       |
| Membership       | Registration policy (platform binding, invite, challenge, etc.)      | Community policy         |

The community server is **not** a rubber stamp. It is a **validation authority** that only signs credentials it can independently verify or that it computed itself. The player never provides the data that gets signed — the data comes from the relay, the ranking algorithm, or the community's own registration policy.

