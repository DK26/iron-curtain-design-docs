# Decision Log — Networking & Multiplayer

Network model, relay server, sub-tick ordering, community servers, ranked play, and matchmaking.

---

## D006: Networking — Pluggable via Trait

**Revision note (2026-02-22):** Revised to clarify product-vs-architecture scope. IC ships one default/recommended multiplayer netcode for normal play, but the `NetworkModel` abstraction remains a hard requirement so the project can (a) support deferred compatibility/bridge experiments (`M7+`/`M11`) with other engines or legacy games where a different network/protocol adapter is needed, and (b) replace the default netcode under a separately approved deferred milestone if a serious flaw or better architecture is discovered.

**Decision:** Abstract all networking behind a `NetworkModel` trait. Game loop is generic over it.

**Rationale:**
- Sim never touches networking concerns (clean boundary)
- Full testability (run sim with `LocalNetwork`)
- Community can contribute netcode without understanding game logic
- Enables deferred non-default models under explicit decision/overlay placement (rollback, client-server, cross-engine adapters)
- Enables bridge/proxy adapters for cross-version/community interoperability experiments without touching `ic-sim`
- De-risks deferred netcode replacement (better default / serious flaw response) behind a stable game-loop boundary
- Selection is a deployment/profile/compatibility policy by default, not a generic "choose any netcode" player-facing lobby toggle

**Key invariant:** `ic-sim` has zero imports from `ic-net`. They only share `ic-protocol`.

**Cross-engine validation:** Godot's `MultiplayerAPI` trait follows the same pattern — an abstract multiplayer interface with a default `SceneMultiplayer` implementation and a null `OfflineMultiplayerPeer` for single-player/testing (which validates IC's `LocalNetwork` concept). O3DE's separate `AzNetworking` (transport layer: TCP, UDP, serialization) and `Multiplayer` Gem (game-level replication, authority, entity migration) validates IC's `ic-net` / `ic-protocol` separation. Both engines prove that trait-abstracted networking with a null/offline implementation is the industry-standard pattern for testable game networking. See `research/godot-o3de-engine-analysis.md`.

---

---

## D007: Networking — Relay Server as Default

**Revision note (2026-02-22):** Revised to clarify failure-policy expectations: relay remains the default and ranked authority path, but relay failure handling is mode-specific. Ranked follows degraded-certification / void policy (see `06-SECURITY.md` V32) rather than automatic P2P failover; casual/custom games may offer unranked continuation or fallback paths.

**Decision:** Default multiplayer uses relay server with time authority, not pure P2P. The relay logic (`RelayCore`) is a library component in `ic-net` — it can be deployed as a standalone binary (dedicated server for hosting, server rooms, Raspberry Pi) or embedded inside a game client (listen server — "Host Game" button, zero external infrastructure). Clients connecting to either deployment use the same protocol and cannot distinguish between them.

**Rationale:**
- Blocks lag switches (server owns the clock)
- Enables sub-tick chronological ordering (CS2 insight)
- Handles NAT traversal (no port forwarding — dedicated server mode)
- Enables order validation before broadcast (anti-cheat)
- Signed replays
- Cheap to run (doesn't run sim, just forwards orders — ~2-10 KB memory per game)
- **Listen server mode:** embedded relay lets any player host a game with full sub-tick ordering and anti-lag-switch, no external server needed. Host's own orders go through the same `RelayCore` pipeline — no host advantage in order processing.
- **Dedicated server mode:** standalone binary for competitive/ranked play, community hosting, and multi-game capacity on cheap hardware.

**Trust boundary:** For ranked/competitive play, the matchmaking system requires connection to an official or community-verified dedicated relay (untrusted host can't be allowed relay authority). For casual/LAN/custom games, the embedded relay is preferred — zero setup, full relay quality.

**Relay failure policy:** If a relay dies mid-match, ranked/competitive matches do **not** silently fail over to a different authority path (e.g., ad-hoc P2P) because that breaks certification and trust assumptions. Ranked follows the degraded-certification / void policy in `06-SECURITY.md` (V32). Casual/custom games may offer unranked continuation via reconnect or fallback if all participants support it.

**Validated by:** C&C Generals/Zero Hour's "packet router" — a client-side star topology where one player collected and rebroadcast all commands. IC's embedded relay improves on this pattern: the host's orders go through `RelayCore`'s sub-tick pipeline like everyone else's (no peeking, no priority), eliminating the host advantage that Generals had. The dedicated server mode further eliminates any hosting-related advantage. See `research/generals-zero-hour-netcode-analysis.md`. Further validated by Valve's GameNetworkingSockets (GNS), which defaults to relay (Valve SDR — Steam Datagram Relay) for all connections, including P2P-capable scenarios. GNS's rationale mirrors ours: relay eliminates NAT traversal headaches, provides consistent latency measurement, and blocks IP-level attacks. The GNS architecture also validates encrypting all relay traffic (AES-GCM-256 + Curve25519) — see D054 § Transport encryption. See `research/valve-github-analysis.md`. Additionally validated by Embark Studios' **Quilkin** — a production Rust UDP proxy for game servers (1,510★, Apache 2.0, co-developed with Google Cloud Gaming). Quilkin provides a concrete implementation of relay-as-filter-chain: session routing via token-based connection IDs, QCMP latency measurement for server selection, composable filter pipeline (Capture → Firewall → RateLimit → TokenRouter), and full OTEL observability. Quilkin's production deployment on Tokio + tonic confirms that async Rust handles game relay traffic at scale. See `research/embark-studios-rust-gamedev-analysis.md`.

**Cross-engine hosting:** When IC's relay hosts a cross-engine match (e.g., OpenRA clients joining an IC server), IC can still provide meaningful relay-layer protections (time authority for the hosted session path, transport/rate-limit defenses, logging/replay signing, and protocol sanity checks after `OrderCodec` translation). However, this does **not** automatically confer full native IC competitive integrity guarantees to foreign clients/sims. Trust and anti-cheat capability are mode-specific and depend on the compatibility level (`07-CROSS-ENGINE.md` § "Cross-Engine Trust & Anti-Cheat Capability Matrix"). In practice, "join IC's server" is usually more observable and better bounded than "IC joins foreign server," but cross-engine live play remains unranked/experimental by default unless separately certified.

**Alternatives available:** Pure P2P lockstep, fog-authoritative server, rollback — all implementable as `NetworkModel` variants.

---

---

## D008: Sub-Tick Timestamps on Orders

**Revision note (2026-02-22):** Revised to clarify trust semantics. Client-submitted sub-tick timestamps are treated as timing hints. In relay modes, the relay normalizes/clamps them into canonical sub-tick timestamps before broadcast using relay-owned timing calibration and skew bounds. In P2P mode, peers deterministically order by `(sub_tick_time, player_id)` with known fairness limitations.

**Decision:** Every order carries a sub-tick timestamp hint. Orders within a tick are processed in chronological order using a canonical timestamp ordering rule for the active `NetworkModel`.

**Rationale (inspired by CS2):**
- Fairer results for edge cases (two players competing for same resource/building)
- Simple protocol shape (attach integer timestamp hint at input layer); enforcement/canonicalization happens in the network model
- Network model preserves but doesn't depend on timestamps
- If a deferred non-default model ignores timestamps, no breakage

---

---

## D011: Cross-Engine Play — Community Layer, Not Sim Layer

**Decision:** Cross-engine compatibility targets data/community layer. NOT bit-identical simulation.

**Rationale:**
- Bit-identical sim requires bug-for-bug reimplementation (that's a port, not our engine)
- Community interop is valuable and achievable: shared server browser, maps, mod format
- Applies equally to OpenRA and CnCNet — both are `CommunityBridge` targets (shared game browser, community discovery)
- CnCNet integration is discovery-layer only: IC games use IC relay servers (not CnCNet tunnels), IC rankings are separate (different balance, anti-cheat, match certification)
- Architecture keeps the door open for deeper interop under deferred `M7+`/`M11` work (OrderCodec, SimReconciler, ProtocolAdapter)
- Progressive levels: shared lobby → replay viewing → casual cross-play → competitive cross-play
- Cross-engine live play (Level 2+) is **unranked by default**; trust/anti-cheat capability varies by compatibility level and is documented in `src/07-CROSS-ENGINE.md` ("Cross-Engine Trust & Anti-Cheat Capability Matrix")

---

---

## D012: Security — Validate Orders in Sim

**Decision:** Every order is validated inside the simulation before execution. Validation is deterministic.

**Rationale:**
- All clients run same validation → agree on rejections → no desync
- Defense in depth with relay server validation
- Repeated rejections indicate cheating (loggable)
- No separate "anti-cheat" system — validation IS anti-cheat

**Dual error reporting:** Validation produces two categories of rejection, following the pattern used by SC2's order system (see `research/blizzard-github-analysis.md` § Part 4):

1. **Immediate rejection** — the order is structurally invalid or fails preconditions that can be checked at submission time (unit doesn't exist, player doesn't own the unit, ability on cooldown, insufficient resources). The sim rejects the order before it enters the execution pipeline. All clients agree on the rejection deterministically.

2. **Late failure** — the order was valid when submitted but fails during execution (target died between order and execution, path became blocked, build site was occupied by the time construction starts). The order entered the pipeline but the action could not complete. Late failures are normal gameplay, not cheating indicators.

Only *immediate rejections* count toward suspicious-activity tracking. Late failures happen to legitimate players constantly (e.g., two allies both target the same enemy, one kills it before the other's attack lands). SC2 defines 214 distinct `ActionResult` codes for this taxonomy — IC uses a smaller set grouped by category:

```rust
pub enum OrderRejectionCategory {
    Ownership,      // unit doesn't belong to this player
    Resources,      // can't afford
    Prerequisites,  // tech tree not met
    Targeting,      // invalid target type
    Placement,      // can't build there
    Cooldown,       // ability not ready
    Transport,      // transport full / wrong passenger type
    Custom,         // game-module-defined rejection
}
```

---

---

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

For P2P lockstep (no relay), the host IS the connection target. For relay-hosted games, this is the relay's address. No discovery mechanism needed — you already know where to go.

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

Filter by: game module (RA/TD), map, player count, ping, mods required, community, password protected. Sort by any column. Auto-refresh on configurable interval.

This is the traditional server browser experience (OpenRA has this, Quake had this, every classic RTS had this). It coexists with room codes — a room visible in the browser also has a room code.

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

For P2P games (no relay, LAN): the host's game client runs a minimal tracker. Same data structure, same protocol, just embedded in the game client instead of a separate relay process. The host was already acting as the game's connection coordinator — adding resource tracking is marginal.

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

## D055: Ranked Tiers, Seasons & Matchmaking Queue

**Status:** Settled
**Phase:** Phase 5 (Multiplayer & Competitive)
**Depends on:** D041 (RankingProvider), D052 (Community Servers), D053 (Player Profile), D037 (Competitive Governance), D034 (SQLite Storage), D019 (Balance Presets)

### Decision Capsule (LLM/RAG Summary)

- **Status:** Settled
- **Phase:** Phase 5 (Multiplayer & Competitive)
- **Canonical for:** Ranked player experience design (tiers, seasons, placement flow, queue behavior) built on the D052/D053 competitive infrastructure
- **Scope:** ranked ladders/tiers/seasons, matchmaking queue behavior, player-facing competitive UX, ranked-specific policies and displays
- **Decision:** IC defines a full ranked experience with **named tiers**, **season structure**, **placement flow**, **small-population matchmaking degradation**, and **faction-aware rating presentation**, layered on top of D041/D052/D053 foundations.
- **Why:** Raw ratings alone are poor motivation/UX, RTS populations are small and need graceful queue behavior, and competitive retention depends on seasonal structure and clear milestones.
- **Non-goals:** A raw-number-only ladder UX; assuming FPS/MOBA-scale populations; one-size-fits-all ranked rules across all communities/balance presets.
- **Invariants preserved:** Rating authority remains community-server based (D052); rating algorithms remain trait-backed (`RankingProvider`, D041); ranked flow reuses generic netcode/match lifecycle mechanisms where possible.
- **Defaults / UX behavior:** Tier names/badges are YAML-driven per game module; seasons are explicit; ranked queue constraints and degradation behavior are product-defined rather than ad hoc.
- **Security / Trust impact:** Ranked relies on the existing relay + signed credential trust chain and integrates with governance/moderation decisions rather than bypassing them.
- **Performance / Ops impact:** Queue degradation rules and small-population design reduce matchmaking failures and waiting dead-ends in niche RTS communities.
- **Public interfaces / types / commands:** tier configuration YAML, `RankingProvider` display integration, ranked queue/lobby settings and vote constraints (see body)
- **Affected docs:** `src/03-NETCODE.md`, `src/decisions/09e-community.md` (D052/D053/D037), `src/17-PLAYER-FLOW.md`, `src/decisions/09g-interaction.md`
- **Revision note summary:** None
- **Keywords:** ranked tiers, seasons, matchmaking queue, placement matches, faction rating, small population matchmaking, competitive ladder

### Problem

The existing competitive infrastructure (D041's `RankingProvider`, D052's signed credentials, D053's profile) provides the *foundational layer* — a pluggable rating algorithm, cryptographic verification, and display system. But it doesn't define the *player-facing competitive experience*:

1. **No rank tiers.** `display_rating()` outputs "1500 ± 200" — useful for analytically-minded players but lacking the motivational milestones that named ranks provide. CS2's transition from hidden MMR to visible CS Rating (with color bands) was universally praised but showed that even visible numbers benefit from tier mapping for casual engagement. SC2's league system proved this for RTS specifically.
2. **No season structure.** Without seasons, leaderboards stagnate — top players stop playing and retain positions indefinitely, exactly the problem C&C Remastered experienced (see `research/ranked-matchmaking-analysis.md` § 3.3).
3. **No placement flow.** D041 defines new-player seeding formula but doesn't specify the user-facing placement match experience.
4. **No small-population matchmaking degradation.** RTS communities are 10–100× smaller than FPS/MOBA populations. The matchmaking queue must handle 100-player populations gracefully, not just 100,000-player populations.
5. **No faction-specific rating.** IC has asymmetric factions. A player who is strong with Allies may be weak with Soviets — one rating doesn't capture this.
6. **No map selection for ranked.** Competitive map pool curation is mentioned in Phase 5 and D037 but the in-queue selection mechanism (veto/ban) isn't defined.

### Solution

#### Tier Configuration (YAML-Driven, Per Game Module)

Rank tier names, thresholds, and visual assets are defined in the game module's YAML configuration — not in engine code. The engine provides the tier resolution logic; the game module provides the theme.

```yaml
# ra/rules/ranked-tiers.yaml
# Red Alert game module — Cold War military rank theme
ranked_tiers:
  format_version: "1.0.0"
  divisions_per_tier: 3          # III → II → I within each tier
  division_labels: ["III", "II", "I"]  # lowest to highest

  tiers:
    - name: Cadet
      min_rating: 0
      icon: "icons/ranks/cadet.png"
      color: "#8B7355"            # Brown — officer trainee

    - name: Lieutenant
      min_rating: 1000
      icon: "icons/ranks/lieutenant.png"
      color: "#A0A0A0"            # Silver-grey — junior officer

    - name: Captain
      min_rating: 1250
      icon: "icons/ranks/captain.png"
      color: "#FFD700"            # Gold — company commander

    - name: Major
      min_rating: 1425
      icon: "icons/ranks/major.png"
      color: "#4169E1"            # Royal blue — battalion level

    - name: Lt. Colonel
      min_rating: 1575
      icon: "icons/ranks/lt_colonel.png"
      color: "#9370DB"            # Purple — senior field officer

    - name: Colonel
      min_rating: 1750
      icon: "icons/ranks/colonel.png"
      color: "#DC143C"            # Crimson — regimental command

    - name: Brigadier
      min_rating: 1975
      icon: "icons/ranks/brigadier.png"
      color: "#FF4500"            # Red-orange — brigade command

  elite_tiers:
    - name: General
      min_rating: 2250
      icon: "icons/ranks/general.png"
      color: "#FFD700"            # Gold — general staff
      show_rating: true           # Display actual rating number alongside tier

    - name: Supreme Commander
      type: top_n                 # Fixed top-N, not rating threshold
      count: 200                  # Top 200 players per community server
      icon: "icons/ranks/supreme-commander.png"
      color: "#FFFFFF"            # White/platinum — pinnacle
      show_rating: true
      show_leaderboard_position: true
```

**Why military ranks for Red Alert:**
- Players command armies — military rank progression IS the core fantasy
- All ranks are officer-grade (Cadet through General) because the player is always commanding, never a foot soldier
- Proper military hierarchy — every rank is real and in correct sequential order: Cadet → Lieutenant → Captain → Major → Lt. Colonel → Colonel → Brigadier → General
- "Supreme Commander" crowns the hierarchy — a title earned, not a rank given. It carries the weight of Cold War authority (STAVKA, NATO Supreme Allied Commander) and the unmistakable identity of the RTS genre itself

**Why 7 + 2 = 9 tiers (23 ranked positions):**
- SC2 proved 7+2 works for RTS community sizes (~100K peak, ~10K sustained)
- Fewer than LoL's 10 tiers (designed for 100M+ players — IC won't have that)
- More than AoE4's 6 tiers (too few for meaningful progression)
- 3 divisions per tier (matching SC2/AoE4/Valorant convention) provides intra-tier goals
- Lt. Colonel fills the gap between Major and Colonel — the most natural compound rank, universally understood
- Elite tiers (General, Supreme Commander) create aspirational targets even with small populations

**Game-module replaceability:** Tiberian Dawn could use GDI/Nod themed rank names. A fantasy RTS mod can define completely different tier sets. Community mods define their own via YAML. The engine resolves `PlayerRating.rating → tier name + division` using whatever tier configuration the active game module provides.

#### Dual Display: Tier + Rating

Every ranked player sees BOTH:
- **Tier badge:** "Captain II" with icon and color — milestone-driven motivation
- **Rating number:** "1847 ± 45" — transparency, eliminates "why didn't I rank up?" frustration

This follows the industry trend toward transparency: CS2's shift from hidden MMR to visible CS Rating was universally praised, SC2 made MMR visible in 2020 to positive reception, and Dota 2 shows raw MMR at Immortal tier. IC does this from day one — no hidden intermediary layers (unlike LoL's LP system, which creates MMR/LP disconnects that frustrate players).

```rust
/// Tier resolution — lives in ic-ui, reads from game module YAML config.
/// NOT in ic-sim (tiers are display-only, not gameplay).
pub struct RankedTierDisplay {
    pub tier_name: String,         // e.g., "Captain"
    pub division: u8,              // e.g., 2 (for "Captain II")
    pub division_label: String,    // e.g., "II"
    pub icon_path: String,
    pub color: [u8; 3],            // RGB
    pub rating: i64,               // actual rating number (always shown)
    pub deviation: i64,            // uncertainty (shown as ±)
    pub is_elite: bool,            // General/Supreme Commander
    pub leaderboard_position: Option<u32>,  // only for elite tiers
    pub peak_tier: Option<String>, // highest tier this season (e.g., "Colonel I")
}
```

#### Rating Details Panel (Expanded Stats)

The compact display ("Captain II — 1847 ± 45") covers most players' needs. But analytically-minded players — and anyone who watched a "What is Glicko-2?" explainer — want to inspect their full rating parameters. The **Rating Details** panel expands from the Statistics Card's `[Rating Graph →]` link and provides complete transparency into every number the system tracks.

```
┌──────────────────────────────────────────────────────────────────┐
│ 📈 Rating Details — Official IC Community (RA1)                  │
│                                                                  │
│  ┌─ Current Rating ────────────────────────────────────────┐     │
│  │  ★ Colonel I                                           │     │
│  │  Rating (μ):     1971          Peak: 2023 (S3 Week 5)  │     │
│  │  Deviation (RD):   45          Range: 1881 – 2061       │     │
│  │  Volatility (σ): 0.041         Trend: Stable ──         │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ What These Numbers Mean ───────────────────────────────┐     │
│  │  Rating: Your estimated skill. Higher = stronger.       │     │
│  │  Deviation: How certain the system is. Lower = more     │     │
│  │    confident. Increases if you don't play for a while.  │     │
│  │  Volatility: How consistent your results are. Low means │     │
│  │    you perform predictably. High means recent upsets.   │     │
│  │  Range: 95% confidence interval — your true skill is    │     │
│  │    almost certainly between 1881 and 2061.              │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Rating History (last 50 matches) ──────────────────────┐     │
│  │  2050 ┤                                                 │     │
│  │       │        ╭──╮                    ╭──╮             │     │
│  │  2000 ┤   ╭──╮╯    ╰╮  ╭╮       ╭──╮╯    ╰──●         │     │
│  │       │╭─╯           ╰──╯╰──╮╭─╯                       │     │
│  │  1950 ┤                      ╰╯                         │     │
│  │       │                                                 │     │
│  │  1900 ┤─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │     │
│  │       └──────────────────────────────────────── Match #  │     │
│  │  [Confidence band] [Per-faction] [Deviation overlay]    │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Recent Matches (rating impact) ────────────────────────┐     │
│  │  #342  W  vs alice (1834)    Allies   +14  RD -1  │▓▓▓ │     │
│  │  #341  W  vs bob (2103)      Soviet   +31  RD -2  │▓▓▓▓│     │
│  │  #340  L  vs carol (1956)    Soviet   -18  RD -1  │▓▓  │     │
│  │  #339  W  vs dave (1712)     Allies    +8  RD -1  │▓   │     │
│  │  #338  L  vs eve (2201)      Soviet    -6  RD -2  │▓   │     │
│  │                                                         │     │
│  │  Rating impact depends on opponent strength:            │     │
│  │    Beat alice (lower rated):  small gain (+14)          │     │
│  │    Beat bob (higher rated):   large gain (+31)          │     │
│  │    Lose to carol (similar):   moderate loss (-18)       │     │
│  │    Lose to eve (much higher): small loss (-6)           │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Faction Breakdown ─────────────────────────────────────┐     │
│  │  ☭ Soviet:   1983 ± 52   (168 matches, 59% win rate)   │     │
│  │  ★ Allied:   1944 ± 61   (154 matches, 56% win rate)   │     │
│  │  ? Random:   ─            (20 matches, 55% win rate)    │     │
│  │                                                         │     │
│  │  (Faction ratings shown only if faction tracking is on) │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌─ Rating Distribution (your position) ───────────────────┐     │
│  │  Players                                                │     │
│  │  ▓▓▓                                                    │     │
│  │  ▓▓▓▓▓▓                                                 │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓                                            │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                                     │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                             │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓△▓▓▓▓▓                 │     │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓          │     │
│  │  └──────────────────────────────────────────── Rating    │     │
│  │  800   1000  1200  1400  1600  1800  △YOU  2200  2400   │     │
│  │                                                         │     │
│  │  You are in the top 5% of rated players.                │     │
│  │  122 players are rated higher than you.                 │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  [Export Rating History (CSV)]  [View Leaderboard]               │
└──────────────────────────────────────────────────────────────────┘
```

**Panel components:**

1. **Current Rating box:** All three Glicko-2 parameters displayed with plain names. The "Range" line shows the 95% confidence interval ($\mu \pm 2 \times RD$). The "Trend" indicator compares current volatility to the player's 20-match average: ↑ Rising (recent upsets), ── Stable, ↓ Settling (consistent results).

2. **Plain-language explainer:** Collapsible on repeat visits (state stored in `preferences.db`). Uses no jargon — "how certain the system is" instead of "rating deviation." Players who watch Glicko-2 explainer videos will recognize the terms; players who don't will understand the meaning.

3. **Rating history graph:** Client-side chart (Bevy 2D line renderer) from match SCR data. Toggle overlays: confidence band (±2·RD as shaded region around the rating line), per-faction line split, deviation history. Hoverable data points show match details.

4. **Recent matches with rating impact:** Each match shows the rating delta, deviation change, and a bar indicating relative impact magnitude. Explanatory text contextualizes why gains/losses vary — teaching the player how Glicko-2 works through their own data.

5. **Faction breakdown:** Per-faction rating (if faction tracking is enabled, D055 § Faction-Specific Ratings). Shows each faction's independent rating, deviation, match count, and win rate. Random-faction matches contribute to all faction ratings equally.

6. **Rating distribution histogram:** Shows where the player falls in the community's population. The △ marker shows "you are here." Population percentile and count of higher-rated players give concrete context. Data sourced from the community server's leaderboard endpoint (cached locally, refreshed hourly).

7. **CSV export:** Exports full rating history (match date, opponent rating, result, rating change, deviation change, volatility) as a CSV file — consistent with the "player data is a platform" philosophy (D034). Community stat tools, spreadsheet analysts, and researchers can work with the raw data.

**Where this lives in the UI:**

- **In-game path:** Main Menu → Profile → Statistics Card → `[Rating Graph →]` → Rating Details Panel
- **Post-game:** The match result screen includes a compact rating change widget ("1957 → 1971, +14") that links to the full panel
- **Tooltip:** Hovering over anyone's rank badge in lobbies, match results, or friends list shows a compact version (rating ± deviation, tier, percentile)
- **Console command:** `/rating` or `/stats rating` opens the panel. `/rating <player>` shows another player's public rating details.

```rust
/// Data backing the Rating Details panel. Computed in ic-ui from local SQLite.
/// NOT in ic-sim (display-only).
pub struct RatingDetailsView {
    pub current: RankedTierDisplay,
    pub confidence_interval: (i64, i64),      // (lower, upper) = μ ± 2·RD
    pub volatility: i64,                       // fixed-point Glicko-2 σ
    pub volatility_trend: VolatilityTrend,
    pub history: Vec<RatingHistoryPoint>,      // last N matches
    pub faction_ratings: Option<Vec<FactionRating>>,
    pub population_percentile: Option<f32>,    // 0.0–100.0, from cached leaderboard
    pub players_above: Option<u32>,            // count of higher-rated players
    pub season_peak: PeakRecord,
    pub all_time_peak: PeakRecord,
}

pub struct RatingHistoryPoint {
    pub match_id: String,
    pub timestamp: u64,
    pub opponent_rating: i64,
    pub result: MatchResult,                   // Win, Loss, Draw
    pub rating_before: i64,
    pub rating_after: i64,
    pub deviation_before: i64,
    pub deviation_after: i64,
    pub faction_played: String,
    pub opponent_faction: String,
    pub match_duration_ticks: u64,
    pub information_content: i32,              // 0-1000, how much this match "counted"
}

pub struct FactionRating {
    pub faction_id: String,
    pub faction_name: String,
    pub rating: i64,
    pub deviation: i64,
    pub matches_played: u32,
    pub win_rate: i32,                         // 0-1000 fixed-point
}

pub struct PeakRecord {
    pub rating: i64,
    pub tier_name: String,
    pub division: u8,
    pub achieved_at: u64,                      // timestamp
    pub match_id: Option<String>,              // the match where peak was reached
}

pub enum VolatilityTrend {
    Rising,     // σ increased over last 20 matches — inconsistent results
    Stable,     // σ roughly unchanged
    Settling,   // σ decreased — consistent performance
}
```

#### Glicko-2 RTS Adaptations

Standard Glicko-2 was designed for chess: symmetric, no map variance, no faction asymmetry, large populations, frequent play. IC's competitive environment differs on every axis. The `Glicko2Provider` (D041) implements standard Glicko-2 with the following RTS-specific parameter tuning:

**Parameter configuration (YAML-driven, per community server):**

```yaml
# Server-side Glicko-2 configuration
glicko2:
  # Standard Glicko-2 parameters
  default_rating: 1500            # New player starting rating
  default_deviation: 350          # New player RD (high = fast convergence)
  system_constant_tau: 0.5        # Volatility constraint (standard range: 0.3–1.2)

  # IC RTS adaptations
  rd_floor: 45                    # Minimum RD — prevents rating "freezing"
  rd_ceiling: 350                 # Maximum RD (equals placement-level uncertainty)
  inactivity_c: 34.6              # RD growth constant for inactive players
  rating_period_days: 0           # 0 = per-match updates (no batch periods)

  # Match quality weighting
  match_duration_weight:
    min_ticks: 3600               # 2 minutes at 30 tps — below this, reduced weight
    full_weight_ticks: 18000      # 10 minutes — at or above this, full weight
    short_game_factor: 300        # 0-1000 fixed-point weight for games < min_ticks
  
  # Team game handling (2v2, 3v3)
  team_rating_method: "weighted_average"  # or "max_rating", "trueskill"
  team_individual_share: true     # distribute rating change by contribution weight
```

**Adaptation 1 — RD floor (min deviation = 45):**

Standard Glicko-2 allows RD to approach zero for highly active players, making their rating nearly immovable. This is problematic for competitive games where skill fluctuates with meta shifts, patch changes, and life circumstances. An RD floor of 45 ensures that even the most active player's rating responds meaningfully to results.

Why 45: Valve's CS Regional Standings uses RD = 75 for 5v5 team play. In 1v1 RTS, each match provides more information per player (no teammates to attribute results to), so a lower floor is appropriate. At RD = 45, the 95% confidence interval is ±90 rating points — enough precision to distinguish skill while remaining responsive.

The RD floor is enforced after each rating update: `rd = max(rd_floor, computed_rd)`. This is the simplest adaptation and has the largest impact on player experience.

**Adaptation 2 — Per-match rating periods:**

Standard Glicko-2 groups matches into "rating periods" (typically a fixed time window) and updates ratings once per period. This made sense for postal chess where you complete a few games per month. RTS players play 2–5 games per session and want immediate feedback.

IC updates ratings after every individual match — each match is its own rating period with $m = 1$. This is mathematically equivalent to running Glicko-2 Step 1–8 with a single game per period. The deviation update (Step 3) and rating update (Step 7) reflect one result, then the new rating becomes the input for the next match.

This means the post-game screen shows the exact rating change from that match, not a batched update. Players see "+14" or "-18" and understand immediately what happened.

**Adaptation 3 — Information content weighting by match duration:**

A 90-second game where one player disconnects during load provides almost no skill information. A 20-minute game with multiple engagements provides rich skill signal. Standard Glicko-2 treats all results equally.

IC scales the rating impact of each match by an `information_content` factor (already defined in D041's `MatchQuality`). Match duration is one input:

- Games shorter than `min_ticks` (2 minutes): weight = `short_game_factor` (default 0.3×)
- Games between `min_ticks` and `full_weight_ticks` (2–10 minutes): linearly interpolated
- Games at or above `full_weight_ticks` (10+ minutes): full weight (1.0×)

Implementation: the `g(RD)` function in Glicko-2 Step 3 is not modified. Instead, the expected outcome $E$ is scaled by the information content factor before computing the rating update. This preserves the mathematical properties of Glicko-2 while reducing the impact of low-quality matches.

Other `information_content` inputs (from D041): game mode weight (ranked = 1.0, casual = 0.5), player count balance (1v1 = 1.0, 1v2 = 0.3), and opponent rematching penalty (V26: `weight = base × 0.5^(n-1)` for repeated opponents).

**Adaptation 4 — Inactivity RD growth targeting seasonal cadence:**

Standard Glicko-2 increases RD over time when a player is inactive: $RD_{new} = \sqrt{RD^2 + c^2 \cdot t}$ where $c$ is calibrated and $t$ is the number of rating periods elapsed. IC tunes $c$ so that a player who is inactive for one full season (91 days) reaches RD ≈ 250 — high enough that their first few matches back converge quickly, but not reset to placement level (350).

With `c = 34.6` and daily periods: after 91 days, $RD = \sqrt{45^2 + 34.6^2 \times 91} \approx 250$. This means returning players re-stabilize in ~5–10 matches rather than the 25+ that a full reset would require.

**Adaptation 5 — Team game rating distribution:**

Glicko-2 is designed for 1v1. For team games (2v2, 3v3), IC uses a weighted-average team rating for matchmaking quality assessment, then distributes rating changes individually based on the result:

- Team rating for matchmaking: weighted average of member ratings (weights = 1/RD, so more-certain players count more)
- Post-match: each player's rating updates as if they played a 1v1 against the opposing team's weighted average
- Deviation updates independently per player

This is a pragmatic adaptation, not a theoretically optimal one. For communities that want better team rating, D041's `RankingProvider` trait allows substituting TrueSkill (designed specifically for team games) or any custom algorithm.

**What IC does NOT modify:**

- **Glicko-2 Steps 1–8 core algorithm:** The mathematical update procedure is standard. No custom "performance bonus" adjustments for APM, eco score, or unit efficiency. Win/loss/draw is the only result input. This prevents metric-gaming (players optimizing for stats instead of winning) and keeps the system simple and auditable.
- **Volatility calculation:** The iterative Illinois algorithm for computing new σ is unmodified. The `system_constant_tau` parameter controls sensitivity — community servers can tune this, but the formula is standard.
- **Rating scale:** Standard Glicko-2 rating range (~800–2400, centered at 1500). No artificial scaling or normalization.

#### Why Ranks, Not Leagues

IC uses **military ranks** (Cadet → Supreme Commander), not **leagues** (Bronze → Grandmaster). This is a deliberate thematic and structural choice.

**Thematic alignment:** Players command armies. Military rank progression *is* the fantasy — you're not "placed in Gold league," you *earned the rank of Colonel*. The Cold War military theme matches IC's identity (the engine is named "Iron Curtain"). Every rank implies command authority: even Cadet (officer trainee) is on the path to leading troops, not a foot soldier following orders. The hierarchy follows actual military rank order through General — then transcends it: "Supreme Commander" isn't a rank you're promoted to, it's a title you *earn* by being one of the top 200. Real military parallels exist (STAVKA's Supreme Commander-in-Chief, NATO's Supreme Allied Commander), and the name carries instant genre recognition.

**Structural reasons:**

| Dimension                   | Ranks (IC approach)                                     | Leagues (SC2 approach)                                               |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| Assignment                  | Rating threshold → rank label                           | Placement → league group of ~100 players                             |
| Population requirement      | Works at any scale (50 or 50,000 players)               | Needs thousands to fill meaningful groups                            |
| Progression feel            | Continuous — every match moves you toward the next rank | Grouped — you're placed once per season, then grind within the group |
| Identity language           | "I'm a Colonel" (personal achievement)                  | "I'm in Diamond" (group membership)                                  |
| Demotion                    | Immediate if rating drops below threshold (honest)      | Often delayed or hidden to avoid frustration (dishonest)             |
| Cross-community portability | Rating → rank mapping is deterministic from YAML config | League placement requires server-side group management               |

**The naming decision:** The tier names themselves carry weight. "Cadet" is where everyone starts — you're an officer-in-training, unproven. "Major" means you've earned mid-level command authority. "Supreme Commander" is the pinnacle — a title that evokes both Cold War gravitas (the Supreme Commander-in-Chief of the Soviet Armed Forces was the head of STAVKA) and the RTS genre itself. These names are IC's brand, not generic color bands.

For other game modules, the rank names change to match the theme — Tiberian Dawn might use GDI/Nod military ranks, a fantasy mod might use feudal titles — but the *structure* (rating thresholds → named ranks × divisions) stays the same. The YAML configuration in `ranked-tiers.yaml` makes this trivially customizable.

**Why not both?** SC2's system was technically a hybrid: leagues (groups of players) with tier labels (Bronze, Silver, Gold). IC's approach is simpler: there are no player groups or league divisions. Your rank is a pure function of your rating — deterministic, portable, and verifiable from the YAML config alone. If you know the tier thresholds and your rating, you know your rank. No server-side group assignment needed. This is critical for D052's federated model, where community servers may have different populations but should be able to resolve the same rating to the same rank label.

#### Season Structure

```yaml
# Server configuration (community server operators can customize)
season:
  duration_days: 91              # ~3 months (matching SC2, CS2, AoE4)
  placement_matches: 10          # Required before rank is assigned
  soft_reset:
    # At season start, compress all ratings toward default:
    # new_rating = default + (old_rating - default) * compression_factor
    compression_factor: 700       # 0-1000 fixed-point (0.7 = keep 70% of distance from default)
    default_rating: 1500          # Center point
    reset_deviation: true         # Set deviation to placement level (fast convergence)
    placement_deviation: 350      # High deviation during placement (ratings move fast)
  rewards:
    # Per-tier season-end rewards (cosmetic only — no gameplay advantage)
    enabled: true
    # Specific rewards defined per-season by competitive committee (D037)
  leaderboard:
    min_matches: 5                # Minimum matches to appear on leaderboard
    min_distinct_opponents: 5     # Must have played at least 5 different opponents (V26)
```

**Season lifecycle:**
1. **Season start:** All player ratings compressed toward 1500 (soft reset). Deviation set to placement level (350). Players lose their tier badge until placement completes.
2. **Placement (10 matches):** High deviation means rating moves fast. Uses D041's seeding formula for brand-new players. Returning players converge quickly because their pre-reset rating provides a strong prior. **Hidden matchmaking rating (V30):** during placement, matchmaking searches near the player's pre-reset rating (not the compressed value), preventing cross-skill mismatches in the first few days of each season. Placement also requires **10 distinct opponents** (soft requirement — degrades gracefully to `max(3, available * 0.5)` on small servers) to prevent win-trading (V26).
3. **Active season:** Normal Glicko-2 rating updates. Deviation decreases with more matches (rating stabilizes). Tier badge updates immediately after every match (no delayed batches — avoiding OW2's mistake).
4. **Season end:** Peak tier badge saved to profile (D053). Season statistics archived. Season rewards distributed. Leaderboard frozen for display.
5. **Inter-season:** Short transition period (~1 week) with unranked competitive practice queue.

**Why 3-month seasons:**
- Matches SC2's proven cadence for RTS
- Long enough for ratings to stabilize and leaderboards to mature
- Short enough to prevent stagnation (the C&C Remastered problem)
- Aligns naturally with quarterly balance patches and competitive map pool rotations

#### Faction-Specific Ratings (Optional)

```yaml
# Player opted into faction tracking:
faction_ratings:
  enabled: true                  # Player's choice — optional
  # Separate rating tracked per faction played
  # Matchmaking uses the rating for the selected faction
  # Profile shows all faction ratings
```

Inspired by SC2's per-race MMR. When enabled:
- Each faction (e.g., Allies, Soviets) has a separate `PlayerRating`
- Matchmaking uses the rating for the faction the player queues with
- Profile displays all faction ratings (D053 statistics card)
- If disabled, one unified rating is used regardless of faction choice

**Why optional:** Some players want one rating that represents their overall skill. Others want per-faction tracking because they're "Diamond Allies but Gold Soviets." Making it opt-in respects both preferences without splitting the matchmaking pool (matchmaking always uses the relevant rating — either faction-specific or unified).

#### Matchmaking Queue Design

**Queue modes:**
- **Ranked 1v1:** Primary competitive mode. Map veto from seasonal pool.
- **Ranked Team:** 2v2, 3v3 (match size defined by game module). Separate team rating. Party restrictions: maximum 1 tier difference between party members (anti-boosting, same as LoL's duo restrictions).
- **Unranked Competitive:** Same rules as ranked but no rating impact. For practice, warm-up, or playing with friends across wide skill gaps.

**Map selection (ranked 1v1):**
Both players alternately ban maps from the competitive map pool (curated per-season by competitive committee, D037). The remaining map is played — similar to CS2 Premier's pick/ban system but adapted for 1v1 RTS.

**Map pool curation guidelines:** The competitive committee should evaluate maps for competitive suitability beyond layout and balance. Relevant considerations include:
- **Weather sim effects (D022):** Maps with `sim_effects: true` introduce movement variance from dynamic weather (snow slowing units, ice enabling water crossing, mud bogging vehicles). The committee may include weather-active maps if the weather schedule is deterministic and strategically interesting, or exclude them if the variance is deemed unfair. Tournament organizers can override this via lobby settings.
- **Map symmetry and spawn fairness:** Standard competitive map criteria — positional balance, resource distribution, rush distance equity.
- **Performance impact:** Maps with extreme cell counts, excessive weather particles, or complex terrain should be tested against the 500-unit performance target (10-PERFORMANCE.md) before inclusion.

**Anonymous veto (V27):** During the veto sequence, opponents are shown as "Opponent" — no username, rating, or tier badge. Identity is revealed only after the final map is determined and both players confirm ready. Leaving during the veto sequence counts as a loss (escalating cooldown: 5min → 30min → 2hr). This prevents identity-based queue dodging while preserving strategic map bans.

```
Seasonal pool: 7 maps
Player A bans 1 → 6 remain
Player B bans 1 → 5 remain
Player A bans 1 → 4 remain
Player B bans 1 → 3 remain
Player A bans 1 → 2 remain
Player B bans 1 → 1 remains → this map is played
```

**Player Avoid Preferences (ranked-safe, best-effort):**

Players need a way to avoid repeat bad experiences (toxicity, griefing, suspected cheating) without turning ranked into a dodge-by-name system. IC supports **`Avoid Player`** as a **soft matchmaking preference**, not a hard opponent-ban feature.

**Design split (do not merge these):**
- **Mute / Block** (D059): personal communication controls, immediate and local
- **Report** (D059 + D052): moderation signal with evidence and review path
- **Avoid Player** (D055): queue matching preference, **best-effort only**

**Ranked defaults:**
- No permanent "never match me with this opponent again" guarantees
- Avoid entries are **limited** (community-configurable slot count)
- Avoid entries **expire automatically** (recommended 7-30 days)
- Avoid preferences are **community-scoped**, not global across all communities
- Matchmaking may ignore avoid preferences under queue pressure / low population
- UI must label the feature as **best-effort**, not guaranteed

**Team queue policy (recommended):**
- Prefer supporting **avoid as teammate** first (higher priority)
- Treat **avoid as opponent** as lower priority or disable it in small populations / high MMR brackets (this should be the **default policy** given IC's expected RTS population size; operators can loosen in larger communities)

This addresses griefing/harassment pain in team games without creating a strong queue-dodging tool in 1v1.

**Matchmaking behavior:** Avoid preferences should be implemented as a **candidate-scoring penalty**, not a hard filter:
- prefer non-avoided pairings when multiple acceptable matches exist
- relax the penalty as queue time widens
- never violate `min_match_quality` just to satisfy avoid preferences
- do not bypass dodge penalties (leaving ready-check/veto remains penalized)

**Small-population matchmaking degradation:**

Critical for RTS communities. The queue must work with 50 players as well as 5,000.

```rust
/// Matchmaking search parameters — widen over time.
/// These are server-configurable defaults.
pub struct MatchmakingConfig {
    /// Initial rating search range (one-sided).
    /// A player at 1500 searches 1500 ± initial_range.
    pub initial_range: i64,           // default: 100

    /// Range widens by this amount every `widen_interval` seconds.
    pub widen_step: i64,              // default: 50

    /// How often (seconds) to widen the search range.
    pub widen_interval_secs: u32,     // default: 30

    /// Maximum search range before matching with anyone available.
    pub max_range: i64,               // default: 500

    /// After this many seconds, match with any available player.
    /// Only activates if ≥3 players are in queue (V31).
    pub desperation_timeout_secs: u32, // default: 300 (5 minutes)

    /// Minimum match quality (fairness score from D041).
    /// Matches below this threshold are not created even at desperation (V30).
    pub min_match_quality: f64,       // default: 0.3
}
```

The UI displays estimated queue time based on current population and the player's rating position. At low population, the UI shows "~2 min (12 players in queue)" transparently rather than hiding the reality.

**New account anti-smurf measures:**
- First 10 ranked matches have high deviation (fast convergence to true skill)
- New accounts with extremely high win rates in placement are fast-tracked to higher ratings (D041 seeding formula)
- Relay server behavioral analysis (Phase 5 anti-cheat) detects mechanical skill inconsistent with account age
- Optional: phone verification for ranked queue access (configurable by community server operator)
- Diminishing `information_content` for repeated pairings: `weight = base * 0.5^(n-1)` where n = recent rematches within 30 days (V26)
- Desperation matches (created after search widening) earn reduced rating change proportional to skill gap (V31)
- Collusion detection: accounts with >50% matches against the same opponent in a 14-day window are flagged for review (V26)

#### Peak Rank Display

Each player's profile (D053) shows:
- **Current rank:** The tier + division where the player stands right now
- **Peak rank (this season):** The highest tier achieved this season — never decreases within a season

This is inspired by Valorant's act rank and Dota 2's medal system. It answers "what's the best I reached?" without the full one-way-medal problem (Dota 2's medals never drop, making them meaningless by season end). IC's approach: current rank is always accurate, but peak rank is preserved as an achievement.

### Community Replaceability

Per D052's federated model, ranked matchmaking is **community-owned:**

| Component                | Official IC default                    | Community can customize?                  |
| ------------------------ | -------------------------------------- | ----------------------------------------- |
| Rating algorithm         | Glicko-2 (`Glicko2Provider`)           | Yes — `RankingProvider` trait (D041)      |
| Tier names & icons       | Cold War military (RA module)          | Yes — YAML per game module/mod            |
| Tier thresholds          | Defined in `ranked-tiers.yaml`         | Yes — YAML per game module/community      |
| Number of tiers          | 7 + 2 elite = 9                        | Yes — YAML-configurable                   |
| Season duration          | 91 days                                | Yes — server configuration                |
| Placement match count    | 10                                     | Yes — server configuration                |
| Map pool                 | Curated by competitive committee       | Yes — per-community                       |
| Queue modes              | 1v1, team                              | Yes — game module defines available modes |
| Anti-smurf measures      | Behavioral analysis + fast convergence | Yes — server operator toggles             |
| Balance preset per queue | Classic RA (D019)                      | Yes — community chooses per-queue         |

**What is NOT community-customizable** (hard requirements):
- Match certification must use relay-signed `CertifiedMatchResult` (D007) — no self-reported results
- Rating records must use D052's SCR format — portable credentials require standardized format
- Tier resolution logic is engine-provided — communities customize the YAML data, not the resolution code

### Alternatives Considered

- **Raw rating only, no tiers** (rejected — C&C Remastered showed that numbers alone lack motivational hooks. The research clearly shows that named milestones drive engagement in every successful ranked system)
- **LoL-style LP system with promotion series** (rejected — LP/MMR disconnect is the most complained-about feature in LoL. Promotion series were so unpopular that Riot removed them in 2024. IC should not repeat this error)
- **Dota 2-style one-way medals** (rejected — medals that never decrease within a season become meaningless by season end. A "Divine" player who dropped to "Archon" MMR still shows Divine — misleading, not motivating)
- **OW2-style delayed rank updates** (rejected — rank updating only after 5 wins or 15 losses was universally criticized. Players want immediate feedback after every match)
- **CS2-style per-map ranking** (rejected for launch — fragments an already-small RTS population. Per-map statistics can be tracked without separate per-map ratings. Could be reconsidered if IC's population is large enough)
- **Elo instead of Glicko-2** (rejected as default — Glicko-2 handles uncertainty better, which is critical for players who play infrequently. D041's `RankingProvider` trait allows communities to use Elo if they prefer)
- **10+ named tiers** (rejected — too many tiers for expected RTS population size. Adjacent tiers become meaningless when population is small. 7+2 matches SC2's proven structure)
- **Single global ranking across all community servers** (rejected — violates D052's federated model. Each community owns its rankings. Cross-community credential verification via SCR ensures portability without centralization)
- **Mandatory phone verification for ranked** (rejected as mandatory — makes ranked inaccessible in regions without phone access, on WASM builds, and for privacy-conscious users. Available as opt-in toggle for community operators)
- **Performance-based rating adjustments** (deferred to `M11`, `P-Optional` — Valorant uses individual stats to adjust RR gains. For RTS this would be complex: which metrics predict skill beyond win/loss? Economy score, APM, unit efficiency? Risks encouraging stat-chasing over winning. If the community wants it, this would be a `RankingProvider` extension with a separate fairness review and explicit opt-in policy, not part of launch ranked.)
- **SC2-style leagues with player groups** (rejected — SC2's league system places players into divisions of ~100 who compete against each other within a tier. This requires thousands of concurrent players to fill meaningful groups. IC's expected population — hundreds to low thousands — can't sustain this. Ranks are pure rating thresholds: deterministic, portable across federated communities (D052), and functional with 50 players or 50,000. See § "Why Ranks, Not Leagues" above)
- **Color bands instead of named ranks** (rejected — CS2 Premier uses color bands (Grey → Gold) which are universal but generic. Military rank names are IC's thematic identity: "Colonel" means something in an RTS where you command armies. Color bands could be a community-provided alternative via YAML, but the default should carry the Cold War fantasy)
- **Enlisted ranks as lower tiers** (rejected — having "Private" or "Corporal" as the lowest ranks breaks the RTS fantasy: the player is always commanding armies, not following orders as a foot soldier. All tiers are officer-grade because the player is always in a command role. "Cadet" as the lowest tier signals "unproven officer" rather than "infantry grunt")
- **Naval rank names** (rejected — "Commander" is a naval rank, not army. "Commodore" and "Admiral" belong at sea. IC's default is an army hierarchy: Lieutenant → Captain → Major → Colonel → General. A naval mod could define its own tier names via YAML)
- **Modified Glicko-2 with performance bonuses** (rejected — some systems (Valorant, CS2) adjust rating gains based on individual performance metrics like K/D or round impact. For RTS this creates perverse incentives: optimizing eco score or APM instead of winning. The result (Win/Loss/Draw) is the only input to Glicko-2. Match duration weighting through `information_content` is the extent of non-result adjustment)

#### Ranked Match Lifecycle

D055 defines the rating system and matchmaking queue. The full competitive match lifecycle — ready-check, game pause, surrender, disconnect penalties, spectator delay, and post-game flow — is specified in `03-NETCODE.md` § "Match Lifecycle." This separation is deliberate: the match lifecycle is a network protocol concern that applies to all game modes (with ranked-specific constraints), while D055 is specifically about the rating and tier system.

**Key ranked-specific constraints** (enforced by the relay server based on lobby mode):
- Ready-check accept timeout: 30 seconds. Declining = escalating queue cooldown.
- Pause: 2 per player, 120 seconds max total per player, 30-second grace before opponent can unpause.
- Surrender: Immediate in 1v1 (`/gg` or surrender button). Vote in team games. No surrender before 5 minutes.
- Kick: Kicked player receives full loss + queue cooldown (same as abandon). Team's units redistributed.
- Remake: Voided match, no rating change. Only available in first 5 minutes.
- Draw: Treated as Glicko-2 draw (0.5 result). Both players' deviations decrease.
- Disconnect: Full loss + escalating queue cooldown (5min → 30min → 2hr). Reconnection within 60s = no penalty. Grace period voiding for early abandons (<2 min, <5% game progress).
- Spectator delay: 2 minutes (3,600 ticks). Players cannot disable spectating in ranked (needed for anti-cheat review).
- Post-game: 30-second lobby with stats, rating change display, report button, instant re-queue option.

See `03-NETCODE.md` § "Match Lifecycle" for the full protocol, data structures, rationale, and the In-Match Vote Framework that generalizes surrender/kick/remake/draw into a unified callvote system.

### Integration with Existing Decisions

- **D041 (RankingProvider):** `display_rating()` method implementations use the tier configuration YAML to resolve rating → tier name. The trait's existing interface supports D055 without modification — tier resolution is a display concern in `ic-ui`, not a trait responsibility.
- **D052 (Community Servers):** Each community server's ranking authority stores tier configuration alongside its `RankingProvider` implementation. SCR records store the raw rating; tier resolution is display-side.
- **D053 (Player Profile):** The statistics card (rating ± deviation, peak rating, match count, win rate, streak, faction distribution) now includes tier badge, peak tier this season, and season history. The `[Rating Graph →]` link opens the Rating Details panel — full Glicko-2 parameter visibility, rating history chart, faction breakdown, confidence interval, and population distribution.
- **D037 (Competitive Governance):** The competitive committee curates the seasonal map pool, recommends tier threshold adjustments based on population distribution, and proposes balance preset selections for ranked queues.
- **D019 (Balance Presets):** Ranked queues can be tied to specific balance presets — e.g., "Classic RA" ranked vs. "IC Balance" ranked as separate queues with separate ratings.
- **D036 (Achievements):** Seasonal achievements: "Reach Captain," "Place in top 100," "Win 50 ranked matches this season," etc.
- **D034 (SQLite Storage):** `MatchmakingStorage` trait's existing methods (`update_rating()`, `record_match()`, `get_leaderboard()`) handle all ranked data persistence. Season history added as new tables.
- **03-NETCODE.md (Match Lifecycle):** Ready-check, pause, surrender, disconnect penalties, spectator delay, and post-game flow. D055 sets ranked-specific parameters; the match lifecycle protocol is game-mode-agnostic. The **In-Match Vote Framework** (`03-NETCODE.md` § "In-Match Vote Framework") generalizes the surrender vote into a generic callvote system (surrender, kick, remake, draw, mod-defined) with per-vote-type ranked constraints.
- **05-FORMATS.md (Analysis Event Stream):** `PauseEvent`, `MatchEnded`, and `VoteEvent` analysis events record match lifecycle moments in the replay for tooling without re-simulation.

### Relationship to `research/ranked-matchmaking-analysis.md`

This decision is informed by cross-game analysis of CS2/CSGO, StarCraft 2, League of Legends, Valorant, Dota 2, Overwatch 2, Age of Empires IV, and C&C Remastered Collection's competitive systems. Key takeaways incorporated:

1. **Transparency trend** (§ 4.2): dual display of tier + rating from day one
2. **Tier count sweet spot** (§ 4.3): 7+2 = 9 tiers for RTS population sizes
3. **3-month seasons** (§ 4.4): RTS community standard (SC2), prevents stagnation
4. **Small-population design** (§ 4.5): graceful matchmaking degradation, configurable widening
5. **C&C Remastered lessons** (§ 3.4): community server ownership, named milestones > raw numbers, seasonal structure prevents stagnation
6. **Faction-specific ratings** (§ 2.1): SC2's per-race MMR adapted for IC's faction system
---

---

## D060: Netcode Parameter Philosophy — Automate Everything, Expose Almost Nothing

**Status:** Settled
**Decided:** 2026-02
**Scope:** `ic-net`, `ic-game` (lobby), D058 (console)
**Phase:** Phase 5 (Multiplayer)

### Decision Capsule (LLM/RAG Summary)

- **Status:** Settled
- **Phase:** Phase 5 (Multiplayer)
- **Canonical for:** Netcode parameter exposure policy (what is automated vs player/admin-visible) and multiplayer UX philosophy for netcode tuning
- **Scope:** `ic-net`, lobby/settings UI in `ic-game`, D058 command/cvar exposure policy
- **Decision:** IC automates nearly all netcode parameters and exposes only a minimal, player-comprehensible surface, with adaptive systems handling most tuning internally.
- **Why:** Manual netcode tuning hurts usability and fairness, successful games hide this complexity, and IC’s sub-tick/adaptive systems are designed to self-tune.
- **Non-goals:** A comprehensive player-facing “advanced netcode settings” panel; exposing internal transport/latency/debug knobs as normal gameplay UX.
- **Invariants preserved:** D006 pluggable netcode architecture remains intact; automation policy does not prevent internal default changes or future netcode replacement.
- **Defaults / UX behavior:** Players see only understandable controls (e.g., game speed where applicable); admin/operator controls remain narrowly scoped; developer/debug knobs stay non-player-facing.
- **Security / Trust impact:** Fewer exposed knobs reduces misconfiguration and exploit/abuse surface in competitive play.
- **Performance / Ops impact:** Adaptive tuning lowers support burden and avoids brittle hand-tuned presets across diverse network conditions.
- **Public interfaces / types / commands:** D058 cvar/command exposure policy, lobby parameter surfaces, internal adaptive tuning systems (see body for exact parameters)
- **Affected docs:** `src/03-NETCODE.md`, `src/17-PLAYER-FLOW.md`, `src/06-SECURITY.md`, `src/decisions/09g-interaction.md`
- **Revision note summary:** None
- **Keywords:** netcode parameters, automate everything, expose almost nothing, run-ahead, command delay, tick rate, cvars, multiplayer settings

### Context

Every lockstep RTS has tunable netcode parameters: tick rate, command delay (run-ahead), game speed, sync check frequency, stall policy, and more. The question is which parameters to expose to players, which to expose to server admins, and which to keep as fixed engine constants.

This decision was informed by a cross-game survey of configurable netcode parameters — covering both RTS (C&C Generals, StarCraft/Brood War, Spring Engine, 0 A.D., OpenTTD, Factorio, Age of Empires II, original Red Alert) and FPS (Counter-Strike 2) — plus analysis of IC's own sub-tick and adaptive run-ahead systems.

### The Pattern: Successful Games Automate

Every commercially successful game in the survey converged on the same answer: **automate netcode parameters, expose almost nothing to players.**

| Game / Engine            | Player-Facing Netcode Controls                        | Automatic Systems                                                                            | Outcome                                                                       |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **C&C Generals/ZH**      | Game speed only                                       | Adaptive run-ahead (200-sample rolling RTT + FPS), synchronized `RUNAHEAD` command           | Players never touch latency settings; game adapts silently                    |
| **Factorio**             | None (game speed implicit)                            | Latency hiding (always-on since 0.14.0, toggle removed), server never waits for slow clients | Removed the only toggle because "always on" was always better                 |
| **Counter-Strike 2**     | None                                                  | Sub-tick always-on; fixed 64 Hz tick (removed 64/128 choice from CS:GO)                      | Removed tick rate choice because sub-tick made it irrelevant                  |
| **AoE II: DE**           | Game speed only                                       | Auto-adapts command delay based on connection quality                                        | No exposed latency controls in ranked                                         |
| **Original Red Alert**   | Game speed only                                       | MaxAhead adapts automatically every 128 frames via host `TIMING` events                      | Players never interact with MaxAhead; formula-driven                          |
| **StarCraft: Brood War** | Game speed + latency setting (Low/High/Extra High)    | None (static command delay per setting)                                                      | Latency setting confuses new players; competitive play mandates "Low Latency" |
| **Spring Engine**        | Game speed (host) + LagProtection mode (server admin) | Dynamic speed adjustment based on CPU reporting; two speed control modes                     | More controls → more community complaints about netcode                       |
| **0 A.D.**               | None                                                  | None (hardcoded 200ms turns, no adaptive run-ahead, stalls for everyone)                     | Least adaptive → most stalling complaints                                     |

**The correlation is clear:** games that expose fewer netcode controls and invest in automatic adaptation have fewer player complaints and better perceived netcode quality. Games that expose latency settings (BW) or lack automatic adaptation (0 A.D.) have worse player experiences.

### Decision

IC adopts a **three-tier exposure model** for netcode parameters:

#### Tier 1: Player-Facing (Lobby GUI)

| Setting        | Values                                       | Default          | Who Sets     | Scope                |
| -------------- | -------------------------------------------- | ---------------- | ------------ | -------------------- |
| **Game Speed** | Slowest / Slower / Normal / Faster / Fastest | Slower (~15 tps) | Host (lobby) | Synced — all clients |

One setting. Game speed is the only parameter where player preference is legitimate ("I like slower, more strategic games" vs. "I prefer fast-paced gameplay"). In ranked play, game speed is server-enforced and not configurable.

Game speed affects only the interval between sim ticks — system behavior is tick-count-based, so all game logic works identically at any speed. Single-player can change speed mid-game; multiplayer sets it in lobby. This matches how every C&C game handled speed (see `02-ARCHITECTURE.md` § Game Speed).

**Mobile tempo advisor compatibility (D065):** Touch-specific "tempo comfort" recommendations are **client/UI advisory only**. They may highlight a recommended band (`slower`-`normal`, etc.) or warn a host that touch players may be overloaded, but they do not create a new authority path for speed selection. The host/queue-selected game speed remains the only synced value, and ranked speed remains server-enforced.

#### Tier 2: Advanced / Console (Power Users, D058)

Available via console commands or `config.toml`. Not in the main GUI. Flagged with appropriate cvar flags:

| Cvar                     | Type  | Default | Flags        | What It Does                                                                       |
| ------------------------ | ----- | ------- | ------------ | ---------------------------------------------------------------------------------- |
| `net.sync_frequency`     | int   | 120     | `SERVER`     | Ticks between full state hash checks                                               |
| `net.desync_debug_level` | int   | 0       | `DEV_ONLY`   | 0-3, controls desync diagnosis overhead (see `03-NETCODE.md` § Debug Levels)       |
| `net.show_diagnostics`   | bool  | false   | `PERSISTENT` | Toggle network overlay (latency, jitter, packet loss, tick timing)                 |
| `net.visual_prediction`  | bool  | true    | `DEV_ONLY`   | Client-side visual prediction; disabling useful only for testing perceived latency |
| `net.simulate_latency`   | int   | 0       | `DEV_ONLY`   | Artificial one-way latency in ms (debug builds only)                               |
| `net.simulate_loss`      | float | 0.0     | `DEV_ONLY`   | Artificial packet loss percentage (debug builds only)                              |
| `net.simulate_jitter`    | int   | 0       | `DEV_ONLY`   | Artificial jitter in ms (debug builds only)                                        |

These are diagnostic and testing tools, not gameplay knobs. The `DEV_ONLY` flag prevents them from affecting ranked play. The `SERVER` flag on `sync_frequency` ensures all clients use the same value.

#### Tier 3: Engine Constants (Not Configurable at Runtime)

| Parameter              | Value                                 | Why Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sim tick rate**      | 30 tps (33ms/tick)                    | In lockstep, ticks are synchronization barriers (collect orders → process → advance sim → exchange hashes), not just simulation steps. Higher rates multiply CPU cost (full ECS update per tick for 500+ units), network overhead (more sync barriers, larger run-ahead in ticks), and late-arrival risk — with no gameplay benefit. RTS units move cell-to-cell, not sub-millimeter. Visual interpolation makes 30 tps smooth at 60+ FPS render. Game speed multiplies the tick *interval*, not the tick *rate*. See `03-NETCODE.md` § "Why Sub-Tick Instead of a Higher Tick Rate" |
| **Sub-tick ordering**  | Always on                             | Zero cost (~4 bytes/order + one sort of ≤5 items); produces visibly fairer outcomes in simultaneous-action edge cases; CS2 proved universal acceptance; no reason to toggle                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Adaptive run-ahead** | Always on                             | Generals proved this works over 20 years; adapts to both RTT and FPS; synchronized via network command                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Timing feedback**    | Always on                             | Client self-calibrates order submission timing based on relay feedback; DDNet-proven pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Stall policy**       | Never stall (relay drops late orders) | Core architectural decision; stalling punishes honest players for one player's bad connection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Anti-lag-switch**    | Always on                             | Relay owns the clock; non-negotiable for competitive integrity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Visual prediction**  | Always on                             | Factorio lesson — removed the toggle in 0.14.0 because always-on was always better; cosmetic only (sim unchanged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Sub-Tick Is Not Optional

Sub-tick order fairness (D008) is **always-on** — not a configurable feature:

- **Cost:** ~4 bytes per order (`sub_tick_time: u32`) + one stable sort per tick of the orders array (typically 0-5 orders — negligible).
- **Benefit:** Fairer resolution of simultaneous events (engineer races, crate grabs, simultaneous attacks). "I clicked first, I won" matches player intuition.
- **Player experience:** The mechanism is automatic (players don't configure timestamps), but the outcome is **very visible** — who wins the engineer race, who grabs the contested crate, whose attack order resolves first. These moments define close games. Without sub-tick, ties are broken by player ID (always unfair to higher-numbered players) or packet arrival order (network-dependent randomness). With sub-tick, the player who acted first wins. That's a gameplay experience players notice and care about.
- **If made optional:** Would require two code paths in the sim (sorted vs. unsorted order processing), a deterministic fallback that's always unfair to higher-numbered players (player ID tiebreak), and a lobby setting nobody understands. Ranked would mandate one mode anyway. CS2 faced zero community backlash — no one asked for "the old random tie-breaking."

### Rationale

**Netcode parameters are not like graphics settings.** Graphics preferences are subjective (some players prefer performance over visual quality). Netcode parameters have objectively correct values — or correct adaptive algorithms. Exposing the knob creates confusion:

1. **Support burden:** "My game feels laggy" → "What's your tick rate set to?" → "I changed some settings and now I don't know which one broke it."
2. **False blame:** Players blame netcode settings when the real issue is their WiFi or ISP. Exposing knobs gives them something to fiddle with instead of addressing the root cause.
3. **Competitive fragmentation:** If netcode parameters are configurable, tournaments must mandate specific values. Different communities pick different values. Replays from one community don't feel the same on another's settings.
4. **Testing matrix explosion:** Every configurable parameter multiplies the QA matrix. Sub-tick on/off × 5 sync frequencies × 3 debug levels = 30 configurations to test.

The games that got this right — Generals, Factorio, CS2 — all converged on the same philosophy: **invest in adaptive algorithms, not exposed knobs.**

### Alternatives Considered

- **Expose tick rate as a lobby setting** (rejected — unlike game speed, tick rate affects CPU cost, bandwidth, and netcode timing in ways players can't reason about. If 30 tps causes issues on low-end hardware, that's a game speed problem (lower speed = lower effective tps), not a tick rate problem.)
- **Expose latency setting like StarCraft BW** (rejected — BW's Low/High/Extra High was necessary because the game had no adaptive run-ahead. IC has adaptive run-ahead from Generals. The manual setting is replaced by a better automatic system.)
- **Expose sub-tick as a toggle** (rejected — see analysis above. Zero-cost, always-fairer, produces visibly better outcomes in contested actions, CS2 precedent.)
- **Expose everything in "Advanced Network Settings" panel** (rejected — the Spring Engine approach. More controls correlate with more complaints, not fewer.)

### Integration with Existing Decisions

- **D006 (Pluggable Networking):** The `NetworkModel` trait encapsulates all netcode behavior. Parameters are internal to each implementation, not exposed through the trait interface. `LocalNetwork` ignores network parameters entirely (zero delay, no adaptation needed). `RelayLockstepNetwork` manages run-ahead, timing feedback, and anti-lag-switch internally.
- **D007 (Relay Server):** The relay's tick deadline, strike thresholds, and session limits are server admin configuration, not player settings. These map to relay config files, not lobby GUI.
- **D008 (Sub-Tick Timestamps):** Explicitly non-optional per this decision.
- **D015 (Efficiency-First Performance):** Adaptive algorithms (run-ahead, timing feedback) are the "better algorithms" tier of the efficiency pyramid — they solve the problem before reaching for brute-force approaches.
- **D033 (Toggleable QoL):** Game speed is the one netcode-adjacent setting that fits D033's toggle model. All other netcode parameters are engineering constants, not user preferences.
- **D058 (Console):** The `net.*` cvars defined above follow D058's cvar system with appropriate flags. The diagnostic overlay (`net_diag`) is a console command, not a GUI setting.


