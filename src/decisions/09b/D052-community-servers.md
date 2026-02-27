## D052: Community Servers with Portable Signed Credentials

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (community services, matchmaking/ranked integration, portable credentials)
- **Canonical for:** Community server federation, portable signed player credentials, and ranking authority trust chain
- **Scope:** `ic-net` relay/community integration, `ic-server`, ranking/matchmaking services, client credential storage, community federation
- **Decision:** Multiplayer ranking and competitive identity are hosted by self-hostable **Community Servers** that issue **Ed25519-signed portable credential records** stored locally by the player and presented on join.
- **Why:** Low server operating cost, federation/self-hosting, local-first privacy, and reuse of relay-certified match results as the trust anchor.
- **Non-goals:** Mandatory centralized ranking database; JWT-based token design; always-online master account dependency for every ranked/community interaction.
- **Invariants preserved:** Relay remains the multiplayer time/order authority (D007) but not the long-term ranking database; local-first data philosophy (D034/D042) remains intact.
- **Defaults / UX behavior:** Players can join multiple communities with separate credentials/rankings; the official IC community is just one community, not a privileged singleton.
- **Security / Trust impact:** SCR format uses Ed25519 only, no algorithm negotiation, monotonic sequence numbers for replay/revocation handling, and community-key identity binding.
- **Performance / Ops impact:** Community servers can run on low-cost infrastructure because long-term player history is carried by the player, not stored centrally.
- **Public interfaces / types / commands:** `CertifiedMatchResult`, `RankingProvider`, Signed Credential Records (SCR), community key rotation / revocation records
- **Affected docs:** `src/03-NETCODE.md`, `src/06-SECURITY.md`, `src/decisions/09e-community.md`, `src/15-SERVER-GUIDE.md`
- **Revision note summary:** None
- **Keywords:** community server, signed credentials, SCR, ed25519, ranking federation, portable rating, self-hosted matchmaking

**Decision:** Multiplayer ranking, matchmaking, and competitive history are managed through **Community Servers** — self-hostable services that federate like Workshop sources (D030/D050). Player skill data is stored **locally** in a per-community SQLite credential file, with each record individually signed by the community server using Ed25519. The player presents the credential file when joining games; the server verifies its signature without needing to look up a central database. This is architecturally equivalent to JWT-style portable tokens, but uses a purpose-built binary format (**Signed Credential Records**, SCR) that eliminates the entire class of JWT vulnerabilities.

**Rationale:**

- **Server-side storage is expensive and fragile.** A traditional ranking server must store every player's rating, match history, and achievements — growing linearly with player count. A Community Server that only issues signed credentials can serve thousands of players from a $5/month VPS because it stores almost nothing. Player data lives on the player's machine (in SQLite, per D034).
- **Federation is already the architecture.** D030/D050 proved that federated sources work for the Workshop. The same model works for multiplayer: players join communities like they subscribe to Workshop sources. Multiple communities coexist — an "Official IC" community, a clan community, a tournament community, a local LAN community. Each tracks its own independent rankings.
- **Local-first matches the privacy design.** D042 already stores player behavioral profiles locally. D034 uses SQLite for all persistent state. Keeping credential files local is the natural extension — players own their data, carry it between machines, and decide who sees it.
- **The relay server already certifies match results.** D007's relay architecture produces `CertifiedMatchResult` (relay-signed match outcomes). The community server receives these, computes rating updates, and signs new credential records. The trust chain is: relay certifies the match happened → community server certifies the rating change.
- **Self-hosting is a core principle.** Any community can run its own server with its own ranking rules, its own matchmaking criteria, and its own competitive identity. The official IC community is just one of many, not a privileged singleton.

### What Is a Community Server?

A Community Server is a unified service endpoint that provides any combination of:

| Capability                | Description                                     | Existing Design                                 |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| **Workshop source**       | Hosts and distributes mods                      | D030 federation, D050 library                   |
| **Game relay**            | Hosts multiplayer game sessions                 | D007 relay server                               |
| **Ranking authority**     | Tracks player ratings, signs credential records | D041 `RankingProvider` trait, **this decision** |
| **Matchmaking service**   | Matches players by skill, manages lobbies       | P004 (partially resolved by this decision)      |
| **Achievement authority** | Signs achievement unlock records                | D036 achievement system                         |
| **Campaign benchmarks**   | Aggregates opt-in campaign progress statistics  | D021 + D031 + D053 (social-facing, non-ranked)  |
| **Moderation / review**   | Stores report cases, runs review queues, applies community sanctions | D037 governance + D059 reporting + `06-SECURITY.md` |

Operators enable/disable each capability independently. A small clan community might run only relay + ranking. A large competitive community runs everything. The official IC community runs all listed capabilities. The `ic-server` binary (see D049 § "Netcode ↔ Workshop Cross-Pollination") bundles all capabilities into a single process with feature flags.

### Optional Community Campaign Benchmarks (Non-Competitive, Opt-In)

A Community Server may optionally host **campaign progress benchmark aggregates** (for example, completion percentiles, average progress by difficulty, common branch choices, and ending completion rates). This supports social comparison and replayability discovery for D021 campaigns without turning campaign progress into ranked infrastructure.

**Rules (normative):**
- **Opt-in only.** Clients must explicitly enable campaign comparison sharing (D053 privacy/profile controls).
- **Scoped comparisons.** Aggregates must be keyed by campaign identity + version, game module, difficulty, and balance preset (D021 `CampaignComparisonScope`).
- **Spoiler-safe defaults.** Community APIs should support hidden/locked branch labels until the client has reached the relevant branch point.
- **Social-facing only.** Campaign benchmark data is not part of ranked matchmaking, anti-cheat scoring, or room admission decisions.
- **Trust labeling.** If the community signs benchmark snapshots or API responses, clients may display a verified source badge; otherwise, clients must label the data as an unsigned community aggregate.

This capability complements D053 profile/campaign progress cards and D031 telemetry/event analytics. It does not change D052's competitive trust chain (SCRs, ratings, match certification).

### Moderation, Reputation, and Community Review (Optional Capability)

Community servers are the natural home for handling suspected cheaters, griefers, AFK/sabotage behavior, and abusive communication — but IC deliberately separates this into **three different systems** to avoid abuse and UX confusion:

1. **Social controls (client/local):** `mute`, `block`, and hide preferences (D059) — immediate personal protection, no matchmaking guarantees
2. **Matchmaking avoidance (best-effort):** limited `Avoid Player` preferences (D055) — queue shaping, not hard matchmaking bans
3. **Moderation & review (community authority):** reports, evidence triage, reviewer queues, and sanctions — community-scoped enforcement

#### Optional community review queue ("Overwatch"-style, IC version)

A Community Server may enable an **Overwatch-style review pipeline** for suspected cheating and griefing. This is an optional moderation capability, not a requirement for all communities.

**What goes into a review case (typical):**
- player reports (post-game or in-match context actions), including category and optional note
- relay-signed replay / `CertifiedMatchResult` references (D007)
- relay telemetry summaries (disconnects, timing anomalies, order-rate spikes, desync events)
- anti-cheat model outputs (e.g., `DualModelAssessment` status from `06-SECURITY.md`) when available
- prior community standing/repeat-offense context (EWMA-based standing, D052/D053)

**What reviewers do NOT get by default:**
- direct access to raw account identifiers before a verdict (use anonymized case IDs where practical)
- power to issue irreversible global bans from a single case
- hidden moderation tools without audit logging

#### Reviewer calibration and verdicts (guardrail-first)

If enabled, reviewer queues should use these defaults:
- **Eligibility gate:** only established members in good standing (minimum match count, no recent sanctions)
- **Calibration cases:** periodic seeded cases with known outcomes to estimate reviewer reliability
- **Consensus threshold:** no action from a single reviewer; require weighted agreement
- **Audit sampling:** moderator/staff audit of reviewer decisions to detect drift or brigading
- **Appeal path:** reviewed actions remain appealable through community moderators (D037)

Review outcomes are **inputs to moderation decisions**, not automatic convictions by themselves. Communities may choose to use review verdicts to:
- prioritize moderator attention
- apply temporary restrictions (chat/queue cooldowns, low-priority queue)
- strengthen confidence for existing anti-cheat flags

Permanent or ranked-impacting sanctions should require stronger evidence and moderator review, especially for cheating accusations.

#### Review case schema (implementation-facing, optional D052 capability)

The review pipeline stores **lightweight case records and verdicts** that reference existing evidence (replays, telemetry, match IDs). It should not duplicate full replay blobs inside the moderation database.

```rust
pub struct ReviewCaseId(pub String);      // e.g. "case_2026_02_000123"
pub struct ReviewAssignmentId(pub String);

pub enum ReviewCaseCategory {
    Cheating,
    Griefing,
    AfkIntentionalIdle,
    Harassment,
    SpamDisruptiveComms,
    Other,
}

pub enum ReviewCaseState {
    Queued,                // waiting for assignment
    InReview,              // active reviewer assignments
    ConsensusReached,      // verdict available, awaiting moderator action
    EscalatedToModerator,  // conflicting verdicts or severe case
    ClosedNoAction,
    ClosedActionTaken,
    Appealed,              // under moderator re-review / appeal
}

pub struct ReviewCase {
    pub case_id: ReviewCaseId,
    pub community_id: String,
    pub category: ReviewCaseCategory,
    pub state: ReviewCaseState,
    pub created_at_unix: i64,
    pub severity_hint: u8, // 0-100, triage signal only

    // Anonymized presentation by default; moderator tools may resolve identities.
    pub accused_player_ref: String,
    pub reporter_refs: Vec<String>,

    // Links to existing evidence; do not inline large payloads.
    pub evidence: Vec<ReviewEvidenceRef>,
    pub telemetry_summary: Option<ReviewTelemetrySummary>,
    pub anti_cheat_summary: Option<ReviewAntiCheatSummary>,

    // Operational metadata
    pub required_reviewers: u8,         // e.g. 3, 5, 7
    pub calibration_eligible: bool,     // can be used as a seeded calibration case
    pub labels: Vec<String>,            // e.g. "ranked", "voice", "cross-engine"
}

pub enum ReviewEvidenceRef {
    ReplayId { replay_id: String },                 // signed replay or local replay ref
    MatchId { match_id: String },                   // CertifiedMatchResult linkage
    TimelineMarkers { marker_ids: Vec<String> },    // suspicious timestamps/events
    VoiceSegmentRef { replay_id: String, start_ms: u64, end_ms: u64 },
    AttachmentRef { object_id: String },            // optional screenshots/text attachments
}

pub struct ReviewTelemetrySummary {
    pub disconnects: u16,
    pub desync_events: u16,
    pub order_rate_spikes: u16,
    pub timing_anomaly_score: Option<f32>,
    pub notes: Vec<String>,
}

pub struct ReviewAntiCheatSummary {
    pub behavioral_score: Option<f64>,
    pub statistical_score: Option<f64>,
    pub combined_score: Option<f64>,
    pub current_action: Option<String>, // e.g. "Monitor", "FlagForReview"
}

pub enum ReviewVoteDecision {
    InsufficientEvidence,
    LikelyClean,
    SuspectedGriefing,
    SuspectedCheating,
    AbuseComms,
    Escalate,
}

pub struct ReviewVote {
    pub assignment_id: ReviewAssignmentId,
    pub reviewer_ref: String, // anonymized reviewer ID in storage/export
    pub case_id: ReviewCaseId,
    pub submitted_at_unix: i64,
    pub decision: ReviewVoteDecision,
    pub confidence: u8,       // 0-100
    pub notes: Option<String>,
    pub calibration_case: bool,
}

pub struct ReviewConsensus {
    pub case_id: ReviewCaseId,
    pub weighted_decision: ReviewVoteDecision,
    pub agreement_ratio: f32,     // 0.0-1.0
    pub reviewer_count: u8,
    pub requires_moderator: bool,
    pub recommended_actions: Vec<ModerationActionRecommendation>,
}

pub enum ModerationActionRecommendation {
    Warn,
    ChatRestriction { hours: u16 },
    QueueCooldown { hours: u16 },
    LowPriorityQueue { hours: u16 },
    RankedSuspension { days: u16 },
    EscalateManualReview,
}

pub struct ReviewerCalibrationStats {
    pub reviewer_ref: String,
    pub cases_reviewed: u32,
    pub calibration_cases_seen: u32,
    pub calibration_accuracy: f32,   // weighted moving average
    pub moderator_agreement_rate: f32,
    pub review_weight: f32,          // capped; used for consensus weighting
}
```

**Schema rules (normative):**
- Reviewer votes and consensus records are **append-only** with audit timestamps.
- Moderator actions reference the case/consenus IDs; they do not overwrite reviewer votes.
- Identity resolution (real player IDs/names) is restricted to moderator/admin tools and should not be shown in default reviewer UI.
- Case retention is community-configurable; low-severity closed cases may expire, but sanction records and audit trails should persist per policy.

#### Storage/ops note (fits D052's low-cost model)

This capability is one of the few D052 features that does require server-side state. The intent is still lightweight:
- store **cases, verdicts, and evidence references**, not full duplicate player histories
- keep replay/video blobs in existing replay storage or object storage; reference them from the case record
- use retention policies (e.g., auto-expire low-severity closed cases after N days)

### Signed Credential Records (SCR) — Not JWT

Every player interaction with a community produces a **Signed Credential Record**: a compact binary blob signed by the community server's Ed25519 private key. These records are stored in the player's local SQLite credential file and presented to servers for verification.

**Why not JWT?**

JWT (RFC 7519) is the obvious choice for portable signed credentials, but it carries a decade of known vulnerabilities that IC deliberately avoids:

| JWT Vulnerability                   | How It Works                                                                              | IC's SCR Design                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Algorithm confusion (CVE-2015-9235) | `alg` header tricks verifier into using wrong algorithm (e.g., RS256 key as HS256 secret) | **No algorithm field.** Always Ed25519. Hardcoded in verifier, not read from token.                                                        |
| `alg: none` bypass                  | JWT spec allows unsigned tokens; broken implementations accept them                       | **No algorithm negotiation.** Signature always required, always Ed25519.                                                                   |
| JWKS injection / `jku` redirect     | Attacker injects keys via URL-based key discovery endpoints                               | **No URL-based key discovery.** Community public key stored locally at join time. Key rotation uses signed rotation records.               |
| Token replay                        | JWT has no built-in replay protection                                                     | **Monotonic sequence number** per player per record type. Old sequences rejected.                                                          |
| No revocation                       | JWT valid until expiry; requires external blacklists                                      | **Sequence-based revocation.** "Revoke all sequences before N" = one integer per player. Tiny revocation list, not a full token blacklist. |
| Payload bloat                       | Base64(JSON) is verbose. Large payloads inflate HTTP headers.                             | **Binary format.** No base64, no JSON. Typical record: ~200 bytes.                                                                         |
| Signature stripping                 | Dot-separated `header.payload.signature` is trivially separable                           | **Opaque binary blob.** Signature embedded at fixed offset after payload.                                                                  |
| JSON parsing ambiguity              | Duplicate keys, unicode escapes, number precision vary across parsers                     | **Not JSON.** Deterministic binary serialization. Zero parsing ambiguity.                                                                  |
| Cross-service confusion             | JWT from Service A accepted by Service B                                                  | **Community key fingerprint embedded.** Record signed by Community A verifiably differs from Community B.                                  |
| Weak key / HMAC secrets             | HS256 with short secrets is brute-forceable                                               | **Ed25519 only.** Asymmetric, 128-bit security level. No shared secrets.                                                                   |

**SCR binary format:**

```
┌─────────────────────────────────────────────────────┐
│  version          1 byte     (0x01)                 │
│  record_type      1 byte     (rating|match|ach|rev|keyrot) │
│  community_key    32 bytes   (Ed25519 public key)   │
│  player_key       32 bytes   (Ed25519 public key)   │
│  sequence         8 bytes    (u64 LE, monotonic)    │
│  issued_at        8 bytes    (i64 LE, Unix seconds) │
│  expires_at       8 bytes    (i64 LE, Unix seconds) │
│  payload_len      4 bytes    (u32 LE)               │
│  payload          variable   (record-type-specific)  │
│  signature        64 bytes   (Ed25519)              │
├─────────────────────────────────────────────────────┤
│  Total: 158 + payload_len bytes                     │
│  Signature covers: all bytes before signature       │
└─────────────────────────────────────────────────────┘
```

- **`version`** — format version for forward compatibility. Start at 1. Version changes require reissuance.
- **`record_type`** — `0x01` = rating snapshot, `0x02` = match result, `0x03` = achievement, `0x04` = revocation, `0x05` = key rotation.
- **`community_key`** — the community server's Ed25519 public key. Binds the record to exactly one community. Verification uses this key.
- **`player_key`** — the player's Ed25519 public key. This IS the player's identity within the community.
- **`sequence`** — monotonic per-player counter. Each new record increments it. Revocation is "reject all sequences below N." This replaces JWT's lack of revocation with an O(1) check.
- **`issued_at` / `expires_at`** — timestamps. Expired records require a server sync to refresh. Default expiry: 7 days for rating records, never for match/achievement records.
- **`payload`** — record-type-specific binary data (see below).
- **`signature`** — Ed25519 signature over all preceding bytes. Community server's private key never leaves the server.

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
3. The match ends. Both clients report the outcome to the relay.
   - The relay requires BOTH clients to agree on the outcome
     (winner, loser, draw, disconnection). If they disagree,
     the relay flags the match as disputed and does not certify it.
   - For additional integrity, the relay can optionally run a headless
     sim (same deterministic code — Invariant #1) to independently
     verify the outcome. This is expensive but available for ranked
     matches on well-resourced servers.
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
9. The signed SCR is returned to both players.

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

### Key Lifecycle

#### Key Identification

Every Ed25519 public key — player or community — has a **key fingerprint** for human reference:

```
Fingerprint = SHA-256(public_key)[0..8], displayed as 16 hex chars
Example:     3f7a2b91e4d08c56
```

The fingerprint is a display convenience. Internally, the full 32-byte public key is the canonical identifier (stored in SCRs, credential tables, etc.). Fingerprints appear in the UI for key verification dialogs, rotation notices, and trust management screens.

Why 8 bytes (64 bits) instead of GPG-style 4-byte short IDs? GPG short key IDs (32 bits) famously suffered birthday-attack collisions — an attacker could generate a key with the same 4-byte fingerprint in minutes. 8 bytes requires ~2^32 key generations to find a collision — far beyond practical for the hobbyist community operators IC targets. For cryptographic operations, the full 32-byte key is always used; the fingerprint is only for human eyeball verification.

#### Player Keys

- Generated on first community join. Ed25519 keypair stored encrypted (AEAD with user passphrase) in the player's local config.
- The same keypair CAN be reused across communities (simpler) or the player CAN generate per-community keypairs (more private). Player's choice in settings.
- **Key recovery via mnemonic seed (D061):** The keypair is derived from a 24-word BIP-39 mnemonic phrase. If the player saved the phrase, they can regenerate the identical keypair on any machine via `ic identity recover`. Existing SCRs validate automatically — the recovered key matches the old public key.
- **Key loss without mnemonic:** If the player lost both the keypair AND the recovery phrase, they re-register with the community (new key = new player with fresh rating). This is intentional — unrecoverable key loss resets reputation, preventing key selling.
- **Key export:** `ic player export-key --encrypted` exports the keypair as an encrypted file (AEAD, user passphrase). The mnemonic seed phrase is the preferred backup mechanism; encrypted key export is an alternative for users who prefer file-based backup.

#### Community Keys: Two-Key Architecture

Every community server has **two** Ed25519 keypairs, inspired by DNSSEC's Zone Signing Key (ZSK) / Key Signing Key (KSK) pattern:

| Key                   | Purpose                                                    | Storage                                                     | Usage Frequency                                    |
| --------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| **Signing Key (SK)**  | Signs all day-to-day SCRs (ratings, matches, achievements) | On the server, encrypted at rest                            | Every match result, every rating update            |
| **Recovery Key (RK)** | Signs key rotation records and emergency revocations only  | **Offline** — operator saves it, never stored on the server | Rare: only for key rotation or compromise recovery |

**Why two keys?** A single-key system has a catastrophic failure mode: if the key is lost, the community dies (no way to rotate to a new key). If the key is stolen, the attacker can forge credentials *and* the operator can't prove they're the real owner (both parties have the same key). The two-key pattern solves both:
- **Key loss:** Operator uses the RK (stored offline) to sign a rotation to a new SK. Community survives.
- **Key theft:** Operator uses the RK to revoke the compromised SK and rotate to a new one. Attacker has the SK but not the RK, so they can't forge rotation records. Community recovers.
- **Both lost:** Nuclear option — community is dead, players re-register. But losing both requires extraordinary negligence (the RK was specifically generated for offline backup).

This is the same pattern used by DNSSEC (ZSK + KSK), hardware security modules (operational key + root key), cryptocurrency validators (signing key + withdrawal key), and Certificate Authorities (intermediate + root certificates).

**Key generation flow:**

```
$ ic community init --name "Clan Wolfpack" --url "https://wolfpack.example.com"

  Generating community Signing Key (SK)...
  SK fingerprint: 3f7a2b91e4d08c56
  SK stored encrypted at: /etc/ironcurtain/server/signing-key.enc

  Generating community Recovery Key (RK)...
  RK fingerprint: 9c4d17e3f28a6b05

  ╔══════════════════════════════════════════════════════════════╗
  ║  SAVE YOUR RECOVERY KEY NOW                                 ║
  ║                                                             ║
  ║  This key will NOT be stored on the server.                 ║
  ║  You need it to recover if your signing key is lost or      ║
  ║  stolen. Without it, a lost key means your community dies.  ║
  ║                                                             ║
  ║  Recovery Key (base64):                                     ║
  ║  rk-ed25519:MC4CAQAwBQYDK2VwBCIEIGXu5Mw8N3...             ║
  ║                                                             ║
  ║  Options:                                                   ║
  ║    1. Copy to clipboard                                     ║
  ║    2. Save to encrypted file                                ║
  ║    3. Display QR code (for paper backup)                    ║
  ║                                                             ║
  ║  Store it in a password manager, a safe, or a USB drive     ║
  ║  in a drawer. Treat it like a master password.              ║
  ╚══════════════════════════════════════════════════════════════╝

  [1/2/3/I saved it, continue]: 
```

The RK private key is shown exactly once during `ic community init`. The server stores only the RK's *public* key (so clients can verify rotation records signed by the RK). The RK private key is never written to disk by the server.

**Key backup and retrieval:**

| Operation                           | Command                                                        | What It Does                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Export SK (encrypted)               | `ic community export-signing-key`                              | Exports the SK private key in an encrypted file (AEAD, operator passphrase). For backup or server migration.                          |
| Import SK                           | `ic community import-signing-key <file>`                       | Restores the SK from an encrypted export. For server migration or disaster recovery.                                                  |
| Rotate SK (voluntary)               | `ic community rotate-signing-key`                              | Generates a new SK, signs a rotation record with the old SK: "old_SK → new_SK". Graceful, no disruption.                              |
| Emergency rotation (SK lost/stolen) | `ic community emergency-rotate --recovery-key <rk>`            | Generates a new SK, signs a rotation record with the RK: "RK revokes old_SK, authorizes new_SK". The only operation that uses the RK. |
| Regenerate RK                       | `ic community regenerate-recovery-key --recovery-key <old_rk>` | Generates a new RK, signs a rotation record: "old_RK → new_RK". The old RK authorizes the new one.                                    |

#### Key Rotation (Voluntary)

Good security hygiene is to rotate signing keys periodically — not because Ed25519 keys weaken over time, but to limit the blast radius of an undetected compromise. IC makes voluntary rotation seamless:

1. Operator runs `ic community rotate-signing-key`.
2. Server generates a new SK keypair.
3. Server signs a **key rotation record** with the OLD SK:

```rust
pub struct KeyRotationRecord {
    pub record_type: u8,          // 0x05 = key rotation
    pub old_key: [u8; 32],        // SK being retired
    pub new_key: [u8; 32],        // replacement SK
    pub signed_by: KeyRole,       // SK (voluntary) or RK (emergency)
    pub reason: RotationReason,
    pub effective_at: i64,        // Unix timestamp
    pub old_key_valid_until: i64, // grace period end (default: +30 days)
    pub signature: [u8; 64],      // signed by old_key or recovery_key
}

pub enum KeyRole {
    SigningKey,    // voluntary rotation — signed by old SK
    RecoveryKey,   // emergency rotation — signed by RK
}

pub enum RotationReason {
    Scheduled,         // periodic rotation (good hygiene)
    ServerMigration,   // moving to new hardware
    Compromise,        // SK compromised, emergency revocation
    PrecautionaryRevoke, // SK might be compromised, revoking as precaution
}
```

4. Server starts signing new SCRs with the new SK immediately.
5. Clients encountering the rotation record verify it (against the old SK for voluntary rotation, or against the RK for emergency rotation).
6. Clients update their stored community key.
7. **Grace period (30 days default):** During the grace period, clients accept SCRs signed by EITHER the old or new SK. This handles players who cached credentials signed by the old key and haven't synced yet.
8. After the grace period, only the new SK is accepted.

#### Key Compromise Recovery

If a community operator discovers (or suspects) their SK has been compromised:

1. **Immediate response:** Run `ic community emergency-rotate --recovery-key <rk>`.
2. Server generates a new SK.
3. Server signs an **emergency rotation record** with the **Recovery Key**:
   - `signed_by: RecoveryKey`
   - `reason: Compromise` (or `PrecautionaryRevoke`)
   - `old_key_valid_until: now` (no grace period for compromised keys — immediate revocation)
4. Clients encountering this record verify it against the RK public key (cached since community join).
5. **Compromise window SCRs:** SCRs issued between the compromise and the rotation are potentially forged. The rotation record includes the `effective_at` timestamp. Clients can flag SCRs signed by the old key after this timestamp as "potentially compromised" (⚠️ in the UI). SCRs signed before the compromise window remain valid — the key was legitimate when they were issued.
6. **Attacker is locked out:** The attacker has the old SK but not the RK. They cannot forge rotation records, so clients who receive the legitimate RK-signed rotation will reject the attacker's old-SK-signed SCRs going forward.

**What about third-party compromise reports?** ("Someone told me community X's key was stolen.")

IC does **not** support third-party key revocation. Only the RK holder can revoke an SK. This is the same model as PGP — only the key owner can issue a revocation certificate. If you suspect a community's key is compromised but they haven't rotated:
- Remove them from your trusted communities list (D053). This is your defense.
- Contact the community operator out-of-band (Discord, email, their website) to alert them.
- The community appears as ⚠️ Untrusted in profiles of players who removed them.

Central revocation authorities (CRLs, OCSP) require central infrastructure — exactly what IC's federated model avoids. The tradeoff is that compromise propagation depends on the operator's responsiveness. This is acceptable: IC communities are run by the same people who already manage Discord servers, game servers, and community websites. They're reachable.

#### Key Expiry Policy

**Community keys (SK and RK) do NOT expire.** This is an explicit design choice.

Arguments for expiry (and why they don't apply):

| Argument                               | Counterpoint                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Limits damage from silent compromise" | SCRs already have per-record `expires_at` (7 days default for ratings). A silently compromised key can only forge SCRs that expire in a week. Voluntary key rotation provides the same benefit without forced expiry.                                                                                |
| "Forces rotation hygiene"              | IC's community operators are hobbyists running $5 VPSes. Forced expiry creates an operational burden that causes more harm (communities dying from forgotten renewal) than good. Let rotation be voluntary.                                                                                          |
| "TLS certs expire"                     | TLS operates in a CA trust model with automated renewal (ACME/Let's Encrypt). IC has no CA and no automated renewal infrastructure. The analogy doesn't hold.                                                                                                                                        |
| "What if the operator disappears?"     | SCR `expires_at` handles this naturally. If the server goes offline, rating SCRs expire within 7 days and become un-refreshable. The community dies gracefully — players' old match/achievement SCRs (which have `expires_at: never`) remain verifiable, but ratings go stale. No key expiry needed. |

The correct analogy is SSH host keys (never expire, TOFU model) and PGP keys (no forced expiry, voluntary rotation or revocation), not TLS certificates.

**However, IC nudges operators toward good hygiene:**
- The server logs a warning if the SK hasn't been rotated in 12 months: "Consider rotating your signing key. Run `ic community rotate-signing-key`." This is a reminder, not an enforcement.
- The client shows a subtle indicator if a community's SK is older than 24 months: small 🕐 icon next to the community name. This is informational, not blocking.

#### Client-Side Key Storage

When a player joins a community, the client receives and caches both public keys:

```sql
-- In the community credential store (community_info table)
CREATE TABLE community_info (
    community_key       BLOB NOT NULL,     -- Current SK public key (32 bytes)
    recovery_key        BLOB NOT NULL,     -- RK public key (32 bytes) — cached at join
    community_name      TEXT NOT NULL,
    server_url          TEXT NOT NULL,
    key_fingerprint     TEXT NOT NULL,     -- hex(SHA-256(community_key)[0..8])
    rk_fingerprint      TEXT NOT NULL,     -- hex(SHA-256(recovery_key)[0..8])
    sk_rotated_at       INTEGER,           -- when current SK was activated
    joined_at           INTEGER NOT NULL,
    last_sync           INTEGER NOT NULL
);

-- Key rotation history (for audit trail)
CREATE TABLE key_rotations (
    sequence        INTEGER PRIMARY KEY,
    old_key         BLOB NOT NULL,         -- retired SK public key
    new_key         BLOB NOT NULL,         -- replacement SK public key
    signed_by       TEXT NOT NULL,         -- 'signing_key' or 'recovery_key'
    reason          TEXT NOT NULL,
    effective_at    INTEGER NOT NULL,
    grace_until     INTEGER NOT NULL,      -- old key accepted until this time
    rotation_record BLOB NOT NULL          -- full signed rotation record bytes
);
```

The `key_rotations` table provides an audit trail: the client can verify the entire chain of key rotations from the original key (cached at join time) to the current key. This means even if a client was offline for months and missed several rotations, they can verify the chain: "original_SK → SK2 (signed by original_SK) → SK3 (signed by SK2) → current_SK (signed by SK3)." If any link in the chain breaks, the client alerts the user.

#### Revocation (Player-Level)

- The community server signs a revocation record: `(record_type, min_valid_sequence, signature)`.
- Clients encountering a revocation update their local `revocations` table.
- Verification checks: `scr.sequence >= revocations[scr.record_type].min_valid_sequence`.
- Use case: player caught cheating → server issues revocation for all their records below a new sequence → player's cached credentials become unverifiable → they must re-authenticate, and the server can refuse.

Revocations are distinct from key rotations. Revocations invalidate a specific player's credentials. Key rotations replace the community's signing key. Both use signed records; they solve different problems.

#### Social Recovery (Optional, for Large Communities)

The two-key system has one remaining single point of failure: the RK itself. If the sole operator loses the RK private key (hardware failure, lost USB drive) AND the SK is also compromised, the community is dead. For small clan servers this is acceptable — the operator is one person who backs up their key. For large communities (1,000+ members, years of match history), the stakes are higher.

**Social recovery** eliminates this single point by distributing the RK across multiple trusted people using **Shamir's Secret Sharing** (SSS). Instead of one person holding the RK, the community designates N **recovery guardians** — trusted community members who each hold a shard. A threshold of K shards (e.g., 3 of 5) is required to reconstruct the RK and sign an emergency rotation.

This pattern comes from Ethereum's account abstraction ecosystem (ERC-4337, Argent wallet, Vitalik Buterin's 2021 social recovery proposal), adapted for IC's community key model. The Web3 ecosystem spent years refining social recovery UX because key loss destroyed real value — IC benefits from those lessons without needing a blockchain.

**Setup:**

```
$ ic community setup-social-recovery --guardians 5 --threshold 3

  Social Recovery Setup
  ─────────────────────
  Your Recovery Key will be split into 5 shards.
  Any 3 shards can reconstruct it.

  Enter guardian identities (player keys or community member names):
    Guardian 1: alice   (player_key: 3f7a2b91...)
    Guardian 2: bob     (player_key: 9c4d17e3...)
    Guardian 3: carol   (player_key: a1b2c3d4...)
    Guardian 4: dave    (player_key: e5f6a7b8...)
    Guardian 5: eve     (player_key: 12345678...)

  Generating shards...
  Each guardian will receive their shard encrypted to their player key.
  Shards are transmitted via the community server's secure channel.

  ⚠️  Store the guardian list securely. You need 3 of these 5 people
     to recover your community if the Recovery Key is lost.

  [Confirm and distribute shards]
```

**How it works:**

1. The RK private key is split into N shards using Shamir's Secret Sharing over the Ed25519 scalar field.
2. Each shard is encrypted to the guardian's player public key (X25519 key agreement + AEAD) and transmitted.
3. Guardians store their shard locally (in their player credential SQLite, encrypted at rest).
4. The operator's server stores only the guardian list (public keys + shard indices) — never the shards themselves.
5. To perform emergency rotation, K guardians each decrypt and submit their shard to a recovery coordinator (can be the operator's new server, or any guardian). The coordinator reconstructs the RK, signs the rotation record, and discards the reconstructed key.
6. After recovery, new shards should be generated (the old shards reconstructed the old RK; a fresh `setup-social-recovery` generates shards for a new RK).

**Guardian management:**

| Operation              | Command                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Set up social recovery | `ic community setup-social-recovery --guardians N --threshold K`                          |
| Replace a guardian     | `ic community replace-guardian <old> <new> --recovery-key <rk>` (requires RK to re-shard) |
| Check guardian status  | `ic community guardian-status` (pings guardians, verifies they still hold valid shards)   |
| Initiate recovery      | `ic community social-recover` (collects K shards, reconstructs RK, rotates SK)            |

**Guardian liveness:** `ic community guardian-status` periodically checks (opt-in, configurable interval) whether guardians are still reachable and their shards are intact (guardians sign a challenge with their player key; possession of the shard is verified via a zero-knowledge proof of shard validity, not by revealing the shard). If a guardian is unreachable for 90+ days, the operator is warned: "Guardian dave has been unreachable for 94 days. Consider replacing them."

**Why not just use N independent RKs?** With N independent RKs, any single compromise recovers the full key — the security level degrades as N increases. With Shamir's threshold scheme, compromising K-1 guardians reveals *zero information* about the RK. This is information-theoretically secure, not just computationally secure.

**Rust crate:** `sharks` (Shamir's Secret Sharing, permissively licensed, well-audited). Alternatively `vsss-rs` (Verifiable Secret Sharing — adds the property that each guardian can verify their shard is valid without learning the secret, preventing a malicious dealer from distributing fake shards).

**Phase:** Social recovery is optional and ships in Phase 6a. The two-key system (Phase 5) works without it. Communities that want social recovery enable it as an upgrade — it doesn't change any existing key management flows, just adds a recovery path.

#### Summary: Failure Mode Comparison

| Scenario                                      | Single-Key System                                                                                        | IC Two-Key System                                                                                                                                 | IC Two-Key + Social Recovery                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SK lost, operator has no backup               | Community dead. All credentials permanently unverifiable. Players start over.                            | Operator uses RK to rotate to new SK. Community survives. All existing SCRs remain valid.                                                         | Same as two-key.                                                                          |
| SK stolen                                     | Attacker can forge credentials AND operator can't prove legitimacy (both hold same key). Community dead. | Operator uses RK to revoke stolen SK, rotate to new SK. Attacker locked out. Community recovers.                                                  | Same as two-key.                                                                          |
| SK stolen + operator doesn't notice for weeks | Unlimited forgery window. No recovery.                                                                   | SCR `expires_at` limits forgery to 7-day windows. RK-signed rotation locks out attacker retroactively.                                            | Same as two-key.                                                                          |
| Both SK and RK lost                           | —                                                                                                        | Community dead. But this requires losing both an online server key AND an offline backup. Extraordinary negligence.                               | **K guardians reconstruct RK → rotate SK. Community survives.** This is the upgrade.      |
| Operator disappears (burnout, health, life)   | Community dead.                                                                                          | Community dead (unless operator shared RK with a trusted successor).                                                                              | **K guardians reconstruct RK → transfer operations to new operator. Community survives.** |
| RK stolen (but SK is fine)                    | —                                                                                                        | No immediate impact — RK isn't used for day-to-day operations. Operator should regenerate RK immediately: `ic community regenerate-recovery-key`. | Same as two-key — but after regeneration, resharding is recommended.                      |

### Cross-Community Interoperability

Communities are independent ranking domains — a 1500 rating on "Official IC" means nothing on "Clan Wolfpack." This is intentional: different communities can run different game modules, balance presets (D019), and matchmaking rules.

**However, portable proofs are useful:**
- "I have 500+ matches on the official community" — provable by presenting signed match SCRs.
- "I achieved 'Iron Curtain' achievement on Official IC" — provable by presenting the signed achievement SCR.
- A tournament community can require "minimum 50 rated matches on any community with verifiable SCRs" as an entry requirement.

**Cross-domain credential principle:** Cross-community credential presentation is architecturally a "bridge" — data signed in Domain A is presented in Domain B. The most expensive lessons in Web3 were bridge hacks (Ronin $625M, Wormhole $325M, Nomad $190M), all caused by trusting cross-domain data without sufficient validation at the boundary. IC's design is already better than most Web3 bridges (each verifier independently checks Ed25519 signatures locally, no intermediary trusted), but the following principle should be explicit:

> **Cross-domain credentials are read-only.** Community Y can *display* and *verify* credentials signed by Community X, but must never *update its own state* based on them without independent re-verification. If Community Y grants a privilege based on Community X membership (e.g., "skip probation if you have 100+ matches on Official IC"), it must re-verify the SCR at the moment the privilege is exercised — not cache the check from an earlier session. Stale cached trust checks are the root cause of bridge exploits: the external state changed (key rotated, credential revoked), but the receiving domain still trusted its cached approval.

In practice, this means:
- Trust requirements (D053 `TrustRequirement`) re-verify SCRs on every room join, not once per session.
- Matchmaking checks re-verify rating SCRs before each match, not at queue entry.
- Tournament entry requirements re-verify all credential conditions at match start, not at registration.
- The `expires_at` field on SCRs (default 7 days for ratings) provides a natural staleness bound, but point-of-use re-verification catches revocations within the validity window.

This costs one Ed25519 signature check (~65μs) per verification — negligible even at thousands of verifications per second.

**Cross-community rating display (V29):**

Foreign credentials displayed in lobbies and profiles must be visually distinct from the current community's ratings to prevent misrepresentation:

- **Full-color** tier badge for the current community's rating. **Desaturated/outlined** badge for credentials from other communities, with the issuing community name in small text.
- Matchmaking always uses the **current community's** rating. Foreign ratings never influence matchmaking — a "Supreme Commander" from another server starts at default rating + placement deviation when joining a new community.
- **Optional seeding hint:** Community operators MAY configure foreign credentials as a seeding signal during placement (weighted at 30% — a foreign 2400 seeds at ~1650, not 2400). Disabled by default. This is a convenience, not a trust assertion.

**Leaderboards:**
- Each community maintains its own leaderboard, compiled from the rating SCRs it has issued.
- The community server caches current ratings (in RAM or SQLite) for leaderboard display.
- Players can view their own full match history locally (from their SQLite credential file) without server involvement.

### Community Server Operational Requirements

| Metric                                              | Estimate                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Storage per player                                  | ~40 bytes persistent (key + revocation). ~200 bytes cached (rating for matchmaking) |
| Storage for 10,000 players                          | ~2.3 MB                                                                             |
| RAM for matchmaking (1,000 concurrent)              | ~200 KB                                                                             |
| CPU per match result signing                        | ~1ms (Ed25519 sign is ~60μs; rest is rating computation)                            |
| Bandwidth per match result                          | ~500 bytes (2 SCRs returned: rating + match)                                        |
| Monthly VPS cost (small community, <1000 players)   | $5–10                                                                               |
| Monthly VPS cost (large community, 10,000+ players) | $20–50                                                                              |

This is cheaper than any centralized ranking service. Operating a community is within reach of a single motivated community member — the same people who already run OpenRA servers and Discord bots.

### Relationship to Existing Decisions

- **D007 (Relay server):** The relay produces `CertifiedMatchResult` — the input to rating computation. A Community Server bundles relay + ranking in one process.
- **D030/D050 (Workshop federation):** Community Servers federate like Workshop sources. `settings.toml` lists communities the same way it lists Workshop sources.
- **D034 (SQLite):** The credential file IS SQLite. The community server's small state IS SQLite.
- **D036 (Achievements):** Achievement records are SCRs stored in the credential file. The community server is the signing authority.
- **D041 (RankingProvider trait):** Matchmaking uses `RankingProvider` implementations. Community operators choose their algorithm.
- **D042 (Player profiles):** Behavioral profiles remain local-only (D042). The credential file holds signed competitive data (ratings, matches, achievements). They complement each other: D042 = private local analytics, D052 = portable signed reputation.
- **P004 (Lobby/matchmaking):** This decision partially resolves P004. Room discovery (5 tiers), lobby P2P resource sharing, and matchmaking are now designed. The remaining Phase 5 work is wire format specifics (message framing, serialization, state machine transitions).

### Alternatives Considered

- **Centralized ranking database** (rejected — expensive to host, single point of failure, doesn't match IC's federation model, violates local-first privacy principle)
- **JWT for credentials** (rejected — algorithm confusion attacks, `alg: none` bypass, JSON parsing ambiguity, no built-in replay protection, no built-in revocation. See comparison table above)
- **Blockchain/DLT for rankings** (rejected — massively overcomplicated for this use case, environmental concerns, no benefit over Ed25519 signed records)
- **Per-player credential chaining (prev_hash linking)** (evaluated, rejected — would add a 32-byte `prev_hash` field to each SCR, linking each record to its predecessor in a per-player hash chain. Goal: guarantee completeness of match history presentation, preventing players from hiding losses. Rejected because: the server-computed rating already reflects all matches — the rating IS the ground truth, and a player hiding individual match SCRs can't change their verified rating. The chain also creates false positives when legitimate credential file loss/corruption breaks the chain, requires the server to track per-player chain heads adding state proportional to `N_players × N_record_types`, and complicates the clean "verify signature, check sequence" flow for a primarily cosmetic concern. The transparency log — which audits the *server*, not the player — is the higher-value accountability mechanism.)
- **Web-of-trust (players sign each other's match results)** (rejected — Sybil attacks trivially game this; a trusted community server as signing authority is simpler and more resistant)
- **PASETO (Platform-Agnostic Security Tokens)** (considered — fixes many JWT flaws, mandates modern algorithms. Rejected because: still JSON-based, still has header/payload/footer structure that invites parsing issues, and IC's binary SCR format is more compact and purpose-built. PASETO is good; SCR is better for this niche.)

### Phase

Community Server infrastructure ships in **Phase 5** (Multiplayer & Competitive, Months 20–26). The SCR format and credential SQLite schema are defined early (Phase 2) to support local testing with mock community servers.

- **Phase 2:** SCR format crate, local credential store, mock community server for testing.
- **Phase 5:** Full community server (relay + ranking + matchmaking + achievement signing). `ic community join/leave/status` CLI commands. In-game community browser.
- **Phase 6a:** Federation between communities. Community discovery. Cross-community credential presentation. Community reputation.

### Cross-Pollination: Lessons Flowing Between D052/D053, Workshop, and Netcode

The work on community servers, trust chains, and player profiles produced patterns that strengthen Workshop and netcode designs — and vice versa. This section catalogues the cross-system lessons beyond the four shared infrastructure opportunities already documented in D049 (unified `ic-server` binary, federation library, auth/identity layer, EWMA scoring).

#### D052/D053 → Workshop (D030/D049/D050)

**1. Two-key architecture for Workshop index signing.**

The Workshop's git-index security (D049) plans a single Ed25519 key for signing `index.yaml`. That's the same single-point-of-failure the two-key architecture (§ Key Lifecycle above) was designed to eliminate. CI pipeline compromise is one of the most common supply-chain attack vectors (SolarWinds, Codecov, ua-parser-js). The SK+RK pattern maps directly:

- **Index Signing Key (SK):** Held by CI, used to sign every `index.yaml` build. Rotated periodically or on compromise.
- **Index Recovery Key (RK):** Held offline by ≥2 project maintainers (threshold signing or independent copies). Used solely to sign a `KeyRotationRecord` that re-anchors trust to a new SK.

If CI is compromised, the attacker gets SK but not RK. Maintainers rotate via RK — clients that verify the rotation chain continue trusting the index. Without two-key, CI compromise means either (a) the attacker signs malicious indexes indefinitely, or (b) the project mints a new key and every client must manually re-trust it. The rotation chain avoids both.

**2. Publisher two-key identity.**

Individual mod publishers currently authenticate via GitHub account (Phase 0–3) or Workshop server credentials (Phase 4+). If alice's account is compromised, her packages can be poisoned. The two-key pattern extends to publishers:

- **Publisher Signing Key (SK):** Used to sign each `.icpkg` manifest on publish. Stored on the publisher's development machine.
- **Publisher Recovery Key (RK):** Generated at first publish. Stored offline (e.g., USB key, password manager). Used only to rotate the SK if compromised.

Clients that cache alice's public key can verify her packages remain authentic through key rotations. The `KeyRotationRecord` struct from D052 is reusable — same format, same verification logic, different context. This also enables package pinning: `ic mod pin alice/tanks --key <fingerprint>` refuses installs signed by any other key, even if alice's Workshop account is hijacked.

**3. Trust-based Workshop source filtering.**

D053's `TrustRequirement` model (None / AnyCommunityVerified / SpecificCommunities) maps to Workshop sources. Currently, `settings.toml` implicitly trusts all configured sources equally. Applying D053's trust tiers:

- **Trusted source:** `ic mod install` proceeds silently.
- **Known source:** Install proceeds with an informational note.
- **Unknown source:** `ic mod install` warns and requires `--allow-untrusted` flag (or interactive confirmation).

This is the same UX pattern as the game browser trust badges — ✅/⚠️/❌ — applied to the `ic` CLI and in-game mod browser. When a dependency chain pulls a package from an untrusted source, the solver surfaces this clearly before proceeding.

**4. Server-side validation principle as shared invariant.**

D052's explicit principle — "never sign data you didn't produce or verify" — should be a shared invariant across all IC server components. For the Workshop server, this means:

- Never accept a publish without verifying: SHA-256 matches, manifest is valid YAML, version doesn't already exist, publisher key matches the namespace, no path traversal in file entries.
- Never sign a package listing without recomputing checksums from the stored `.icpkg`.
- Workshop server attestation: a `CertifiedPublishResult` (analogous to the relay's `CertifiedMatchResult`) signed by the server, proving the publish was validated. Stored in the publisher's local credential file — portable proof that "this package was accepted by Workshop server X at time T."

**5. Registration policies → Workshop publisher policies.**

D052's `RegistrationPolicy` enum (Open / RequirePlatform / RequireInvite / RequireChallenge / AnyOf) maps to Workshop publisher onboarding. A community-hosted Workshop server can configure who may publish:

- `Open` — anyone can publish (appropriate for experimental/testing servers)
- `RequirePlatform` — must have a linked Steam/platform account
- `RequireInvite` — existing publisher must vouch (prevents spam/typosquat floods)

This is already implicit in the git-index phase (GitHub account = identity), but should be explicit in the Workshop server design for Phase 4+.

#### D052/D053 → Netcode (D007/D003)

**6. Relay server two-key pattern.**

Relay servers produce signed `CertifiedMatchResult` records — the trust anchor for all competitive data. If a relay's signing key leaks, all match results are forgeable. Same SK+RK solution: relay operators generate a signing key (used by the running relay binary) and a recovery key (stored offline). On compromise, the operator rotates via RK without invalidating the community's entire match history.

Currently D052 says a community server "trusts its own relay" — but this trust should be cryptographically verifiable: the community server knows the relay's public key (registered in `community_info`), and the `CertifiedMatchResult` carries the relay's signature. Key rotation propagates through the same `KeyRotationRecord` chain.

**7. Trust-verified P2P peer selection.**

D049's P2P peer scoring selects peers by capacity, locality, seed status, and lobby context. D053's trust model adds a fifth dimension: when downloading mods from lobby peers, prefer peers with verified profiles from trusted communities. A verified player is less likely to serve malicious content (Sybil nodes have no community history). The scoring formula gains an optional trust component:

```
PeerScore = Capacity(0.35) + Locality(0.25) + SeedStatus(0.2) + Trust(0.1) + LobbyContext(0.1)
```

Trust scoring: verified by a trusted community = 1.0, verified by any community = 0.5, unverified = 0. This is opt-in — communities that don't care about trust verification keep the original 4-factor formula.

#### Workshop/Netcode → D052/D053

**8. Profile fetch rate control.**

Netcode uses three-layer rate control (per-connection, per-IP, global). Profile fetching in lobbies is susceptible to the same abuse patterns — a malicious client could spam profile requests to exhaust server bandwidth or enumerate player data. The same rate-control architecture applies: per-IP rate limits on profile fetch requests, exponential backoff on repeated fetches of the same profile, and a TTL cache that makes duplicate requests a local cache hit.

**9. Content integrity hashing for composite profiles.**

The Workshop uses SHA-256 checksums plus `manifest_hash` for double verification. When a player assembles their composite profile (identity + SCRs from multiple communities), the assembled profile can include a composite hash — enabling cache invalidation without re-fetching every individual SCR. When a profile is requested, the server returns the composite hash first; if it matches the cached version, no further transfer is needed. This is the same "content-addressed fetch" pattern the Workshop uses for `.icpkg` files.

**10. EWMA scoring for community member standing.**

The Workshop's EWMA (Exponentially Weighted Moving Average) peer scoring — already identified as shared infrastructure in D049 — has a concrete consumer in D052/D053: community member standing. A community server can track per-member quality signals (connection stability, disconnect rate, desync frequency, report count) using time-decaying EWMA scores. Recent behavior weighs more than ancient history. This feeds into matchmaking preferences (D052) and the profile's community standing display (D053) without requiring a separate scoring system.

#### Shared pattern: key management as reusable infrastructure

The two-key architecture now appears in three contexts: community servers, relay servers, and Workshop (index + publishers). This suggests extracting it as a shared `ic-crypto` module (or section of `ic-protocol`) that provides:

- `SigningKeypair` + `RecoveryKeypair` generation
- `KeyRotationRecord` creation and chain verification
- Fingerprint computation and display formatting
- Common serialization for the rotation chain

All three consumers use Ed25519, the same rotation record format, and the same verification logic. The only difference is context (what the key signs). This is a Phase 2 deliverable — the crypto primitives must exist before community servers, relays, or Workshop servers use them.

---

---
