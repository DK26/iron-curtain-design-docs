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

