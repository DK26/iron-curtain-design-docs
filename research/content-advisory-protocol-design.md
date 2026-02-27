# Content Advisory Protocol Design — CAR Wire Format, Sync & Aggregation

> **Purpose:** Byte-level CAR binary format, inter-server advisory sync protocol, client-side aggregation algorithm, revocation semantics, and storage schema for IC's federated content moderation system.

| Field | Value |
|-------|-------|
| **Date** | 2026-02-26 |
| **Type** | Research / Implementation Design |
| **Referenced by** | D074 (Section 5), D052 (SCR format reference), 06-SECURITY.md |
| **Status** | Draft |

---

## 1. Design Goals & Threat Model

### Goals

1. **Federated moderation without central authority.** No single entity decides what content is safe or unsafe. Communities independently issue advisories; clients aggregate them.
2. **Consensus-based enforcement ("Garden Fence").** A single community blocking content is a warning signal. Multiple independent communities blocking the same content is enforcement. The threshold is configurable per-client.
3. **No single community can censor content unilaterally.** Default client settings require 2+ communities to agree on a `block` before content is removed. A rogue community issuing false blocks achieves nothing unless other communities corroborate.
4. **Attributable and auditable.** Every advisory is Ed25519-signed by a known community. Players and operators can inspect who flagged what and why. No anonymous blocklists.
5. **Compatible with SCR infrastructure.** CARs reuse the same Ed25519 key hierarchy (SK/RK), binary envelope pattern, and monotonic sequence numbering from D052's Signed Credential Records. Shared `ic-crypto` primitives, minimal new code.

### Threat Model

| Threat | Impact | Mitigation |
|--------|--------|------------|
| **Compromised community key** | Attacker issues false CARs under the community's identity | RK-signed key rotation (§7); Garden Fence threshold means a single compromised community cannot enforce blocks alone; clients flag CARs signed after rotation `effective_at` |
| **Spam advisories (advisory flood)** | Overwhelm sync bandwidth, pollute client aggregation | Rate limiting at sync layer (max 100 CARs per request); sequence number monotonicity rejects duplicates; per-community CAR budget (configurable, default 10,000 active CARs) |
| **False positives (malicious block CARs)** | Legitimate content blocked across the federation | Garden Fence: requires N communities to agree; `warn` vs `block` distinction; clients can inspect reasoning; community reputation degrades if they issue disputed advisories |
| **Advisory flood attack** | Denial of service via millions of CARs | `payload_len` capped at 65,535 bytes; sync pagination (100 per request); community_key allowlist filtering in sync requests; bandwidth cap per sync peer |
| **Replay attack** | Old CARs re-presented to override newer supersessions | Monotonic sequence numbers; clients always use highest-sequence CAR per (community, resource) pair; sequence validation rejects out-of-order insertions |
| **Sybil communities** | Attacker creates N fake communities to meet block threshold | Seed list verification (PR-based vetting); client `advisory_sources` config restricts which communities are trusted; trust weights allow downranking unverified communities |
| **Supersession chain manipulation** | Attacker replays a block after a community revoked it | Clients store and verify the full supersession chain; highest sequence always wins; `supersedes` must reference a valid earlier sequence for the same resource |

### Non-Goals

- **Real-time blocking.** CARs are eventually consistent. A malicious package published right now may take minutes to hours to accumulate enough advisories for client-side enforcement. Real-time defense relies on the WASM sandbox (D005) and quarantine-before-release (D074 §5).
- **Replacing per-community moderation.** CARs handle cross-community coordination for Workshop content only. In-community player behavior moderation uses D052's Overwatch-style review system.
- **Automated content analysis.** CARs are human-issued decisions, not automated scan results. Anomaly detection (06-SECURITY.md V18) may trigger a CAR, but the CAR itself is a community operator's explicit decision.
- **Legal compliance enforcement.** DMCA takedowns and legal orders are handled per-community by the operator. CARs with `category: dmca` are informational signals, not legal instruments.

---

## 2. CAR Binary Envelope

The CAR envelope mirrors D052's SCR format for consistency. Both use the same `ic-crypto` primitives for signing, verification, and key management. The key difference: SCRs have a `player_key` field (they are about a specific player); CARs do not (they are about a Workshop resource).

### Byte Layout

```
Offset  Field           Size      Encoding         Notes
──────  ──────────────  ────────  ───────────────  ──────────────────────────────────────
0       version         1 byte   u8               0x01 for initial release
1       record_type     1 byte   u8               0x10 = content_advisory
2       community_key   32 bytes [u8; 32]         Ed25519 public key of issuing community
34      sequence        8 bytes  u64 LE           Monotonic per community, never reused
42      issued_at       8 bytes  i64 LE           Unix seconds (UTC)
50      payload_len     4 bytes  u32 LE           Length of CBOR payload in bytes (max 65535)
54      payload         N bytes  CBOR             CAR payload (see §3)
54+N    signature       64 bytes [u8; 64]         Ed25519 signature
──────  ──────────────  ────────  ───────────────  ──────────────────────────────────────
Total:  118 + N bytes
```

### Design Rationale (Differences from SCR)

| SCR Field | CAR Field | Reason |
|-----------|-----------|--------|
| `player_key` (32 bytes) | *absent* | CARs are about resources, not players |
| `expires_at` (8 bytes in header) | *in payload* | Most CARs do not expire; `expires_at` is optional and lives in the CBOR payload to save header space |
| `record_type` `0x01–0x05` | `record_type` `0x10` | Non-overlapping type codes allow a shared parser to distinguish SCRs from CARs from KeyRotation records in the same byte stream |

### Record Type Registry

To avoid collisions between SCR and CAR record types in the shared `ic-crypto` envelope:

```
0x01  SCR: rating snapshot
0x02  SCR: match result
0x03  SCR: achievement
0x04  SCR: revocation
0x05  SCR: key rotation
0x06–0x0F  reserved for future SCR types
0x10  CAR: content advisory
0x11–0x1F  reserved for future CAR types
0x20  KeyRotation record (community-level)
0x21  KeyRevocation record (emergency, RK-signed)
0x22–0xFF  reserved
```

### Signature Coverage

The Ed25519 signature at offset `54+N` covers **all preceding bytes**: `bytes[0..54+N]`. This includes the version, record type, community key, sequence, timestamp, payload length, and the entire CBOR payload. Any modification to any field invalidates the signature.

### Verification Procedure

```
1. Read bytes[0] → version. Reject if version > supported.
2. Read bytes[1] → record_type. Reject if not 0x10.
3. Read bytes[2..34] → community_key.
4. Read bytes[34..42] → sequence (u64 LE).
5. Read bytes[42..50] → issued_at (i64 LE).
6. Read bytes[50..54] → payload_len (u32 LE). Reject if > 65535.
7. Read bytes[54..54+payload_len] → payload (raw CBOR).
8. Read bytes[54+payload_len..54+payload_len+64] → signature.
9. Verify Ed25519 signature over bytes[0..54+payload_len] using community_key.
10. If valid → decode CBOR payload (§3).
11. If invalid → reject entire envelope, log community_key + sequence for diagnostics.
```

---

## 3. CAR Payload Format (CBOR)

The payload is a CBOR map (major type 5) with string keys. CBOR is chosen over JSON for compact binary encoding, unambiguous integer types, native byte string support, and deterministic canonical encoding (RFC 8949 §4.2).

### CBOR Map Structure

```cbor-diag
{
  "resource":      "publisher/package@version",  ; text string (major type 3)
  "action":        1,                             ; unsigned int: 1=block, 2=warn, 3=endorse
  "category":      1,                             ; unsigned int: 1=malware, 2=policy, 3=dmca,
                                                  ;   4=quality, 5=abandoned
  "reason":        "UTF-8 explanation string",    ; text string
  "evidence_hash": h'<32 bytes SHA-256>',         ; byte string (major type 2) or null
  "supersedes":    0,                             ; unsigned int: sequence of previous CAR
                                                  ;   for same resource, 0 = first advisory
  "tags":          ["fractureiser", "supply-chain"], ; array of text strings, or null
  "expires_at":    null                           ; unsigned int (Unix seconds) or null
}
```

### Field Specifications

| Field | CBOR Type | Required | Constraints |
|-------|-----------|----------|-------------|
| `resource` | text string | yes | Must match `^[a-z0-9_-]+/[a-z0-9_-]+@[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$` (semver, D030) |
| `action` | unsigned int | yes | `0x01` = block, `0x02` = warn, `0x03` = endorse. Values `0x04–0xFF` reserved. |
| `category` | unsigned int | yes | `0x01` = malware, `0x02` = policy_violation, `0x03` = dmca, `0x04` = quality, `0x05` = abandoned. Values `0x06–0xFF` reserved. |
| `reason` | text string | yes | UTF-8, max 4096 bytes. Human-readable explanation. |
| `evidence_hash` | byte string or null | no | If present, exactly 32 bytes (SHA-256 of evidence document). Null if no evidence attached. |
| `supersedes` | unsigned int | yes | Sequence number of the previous CAR from the same community for the same resource. `0` if this is the first advisory for this resource from this community. |
| `tags` | array of text strings or null | no | Free-form tags for categorization. Max 16 tags, each max 64 bytes. |
| `expires_at` | unsigned int or null | no | Unix seconds (UTC). If present and in the past, the CAR is treated as expired/revoked. Null = no expiry. |

### Action Semantics

| Action | Code | Client Behavior | Server (Workshop) Behavior |
|--------|------|-----------------|---------------------------|
| **block** | `0x01` | Refuse to load; stop seeding; show red warning; prompt uninstall | Drop info hash from tracker; stop seeding pieces; reject new downloads |
| **warn** | `0x02` | Show yellow advisory banner; user can still load; log that user overrode | Continue seeding but attach advisory to metadata responses |
| **endorse** | `0x03` | Show green trust signal on resource listing | No enforcement effect; informational positive signal |

### Category Semantics

| Category | Code | Typical Trigger |
|----------|------|-----------------|
| **malware** | `0x01` | WASM module exfiltrates data, requests undeclared capabilities, contains known malware signatures |
| **policy_violation** | `0x02` | Content violates community rules (e.g., hate speech in mod descriptions, NSFW in SFW-only community) |
| **dmca** | `0x03` | Copyright holder files takedown; community operator issues advisory |
| **quality** | `0x04` | Resource is broken, crashes the game, or is misleadingly described |
| **abandoned** | `0x05` | Publisher inactive, resource incompatible with current engine version, no maintenance |

### Canonical CBOR Encoding

All CAR payloads MUST use **deterministic CBOR encoding** (RFC 8949 §4.2):

- Map keys sorted by byte-string comparison of their encoded forms
- Preferred serialization for integers (smallest encoding)
- No indefinite-length encoding

This ensures that the same logical payload produces identical bytes, which is critical because the Ed25519 signature covers the payload bytes directly. Two implementations encoding the same data must produce the same signature input.

### Rust Serde Types

```rust
use serde::{Deserialize, Serialize};

/// Action a community is recommending for a Workshop resource.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum CarAction {
    Block   = 0x01,
    Warn    = 0x02,
    Endorse = 0x03,
}

/// Reason category for the advisory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum CarCategory {
    Malware         = 0x01,
    PolicyViolation = 0x02,
    Dmca            = 0x03,
    Quality         = 0x04,
    Abandoned       = 0x05,
}

/// CBOR-encoded payload inside a CAR envelope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarPayload {
    /// Workshop resource identifier: "publisher/package@version"
    pub resource: String,

    /// Recommended action.
    pub action: CarAction,

    /// Advisory category.
    pub category: CarCategory,

    /// Human-readable explanation.
    pub reason: String,

    /// SHA-256 of an evidence document, if any.
    #[serde(
        with = "serde_bytes",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub evidence_hash: Option<[u8; 32]>,

    /// Sequence number of the previous CAR this supersedes (0 = first).
    pub supersedes: u64,

    /// Free-form categorization tags.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,

    /// Optional expiry timestamp (Unix seconds). None = no expiry.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<i64>,
}
```

### Example Encoded CAR

A concrete example of a `block` advisory for malware:

```
Resource:  "coolmodder/awesome-tanks@2.1.0"
Action:    block (0x01)
Category:  malware (0x01)
Reason:    "WASM module requests network access not present in v2.0.0; exfiltrates player data"
Evidence:  SHA-256 of analysis document
Tags:      ["fractureiser", "supply-chain"]
```

CBOR diagnostic notation for the payload:

```cbor-diag
{
  "action": 1,
  "category": 1,
  "evidence_hash": h'7f3a1b2c...32 bytes...e8f2',
  "expires_at": null,
  "reason": "WASM module requests network access not present in v2.0.0; exfiltrates player data",
  "resource": "coolmodder/awesome-tanks@2.1.0",
  "supersedes": 0,
  "tags": ["fractureiser", "supply-chain"]
}
```

Approximate CBOR encoded size: ~220 bytes. Full envelope: 118 + 220 = ~338 bytes.

---

## 4. Inter-Server Advisory Sync Protocol

Advisory sync uses the ICRP (IC Relay Protocol) transport layer. ICRP is the WebSocket-based protocol that all `ic-server` capabilities use for server-to-server and client-to-server communication.

### ICRP Endpoint

```
Endpoint:  advisory.sync
Transport: ICRP (WebSocket, binary frames)
Auth:      Mutual Ed25519 authentication (community keys)
```

### Sync Request Message

```cbor-diag
{
  ; ICRP message header
  "method": "advisory.sync",
  "request_id": 42,              ; u64, caller-assigned correlation ID

  ; Sync parameters
  "since_sequence": 1050,        ; u64: return CARs with sequence > this value
                                 ;   0 = full sync (all CARs from this community)
  "community_filter": [          ; optional: only return CARs from these communities
    h'<32 bytes community_key_1>',
    h'<32 bytes community_key_2>'
  ],                             ; null = return CARs from all known communities
  "max_results": 100,            ; u32: max CARs to return (server caps at 100)
  "resource_prefix": null        ; optional text: filter by resource prefix
                                 ;   e.g., "coolmodder/" for all of a publisher's packages
}
```

### Sync Response Message

```cbor-diag
{
  ; ICRP message header
  "method": "advisory.sync.response",
  "request_id": 42,              ; echoed from request

  ; Response
  "envelopes": [                 ; array of raw CAR binary envelopes
    h'01 10 <community_key> <seq> <ts> <len> <payload> <sig>',
    h'01 10 <community_key> <seq> <ts> <len> <payload> <sig>',
    ; ...
  ],
  "has_more": true,              ; bool: more CARs available beyond max_results
  "last_sequence": 1150,         ; u64: highest sequence in this response batch
                                 ;   use as since_sequence in next request
  "total_available": 312         ; u64: total CARs matching filter (for progress UI)
}
```

### Sync Modes

#### Poll-Based Sync (Default)

Servers poll each subscribed peer on a configurable interval:

```toml
# server_config.toml
[content_trust.sync]
poll_interval_secs = 300          # 5 minutes default
poll_interval_verified_secs = 60  # 1 minute for verified communities
full_sync_on_subscribe = true     # download all history when first subscribing
max_concurrent_syncs = 4          # parallel sync connections
```

Poll algorithm:

```
every poll_interval:
    for each subscribed community:
        last_seq = db.get_last_sequence(community_key)
        loop:
            response = icrp.call("advisory.sync", {
                since_sequence: last_seq,
                community_filter: [community_key],
                max_results: 100,
            })
            for envelope in response.envelopes:
                if verify_envelope(envelope):
                    db.upsert_advisory(envelope)
                else:
                    log.warn("invalid CAR from {community_key}, seq {seq}")
            last_seq = response.last_sequence
            if not response.has_more:
                break
```

#### Push Notification (Optional, Real-Time)

For communities that need faster CAR propagation (e.g., active malware incident), servers can subscribe to a WebSocket push channel:

```cbor-diag
; Subscribe request
{
  "method": "advisory.subscribe",
  "request_id": 43,
  "community_filter": null        ; null = all CARs from this server
}

; Subscribe acknowledgment
{
  "method": "advisory.subscribe.ack",
  "request_id": 43,
  "subscription_id": "sub_a1b2c3"
}

; Push notification (server → subscriber, unsolicited)
{
  "method": "advisory.push",
  "subscription_id": "sub_a1b2c3",
  "envelope": h'01 10 <raw CAR bytes>'
}

; Unsubscribe
{
  "method": "advisory.unsubscribe",
  "subscription_id": "sub_a1b2c3"
}
```

Push is opt-in. Servers that do not support push respond to `advisory.subscribe` with `{ "error": "push_not_supported" }`, and the subscriber falls back to polling.

### Rate Limiting

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Max CARs per sync response | 100 | Prevents single request from consuming excessive memory |
| Max sync requests per minute per peer | 30 | Prevents poll-spam |
| Max push notifications per second per subscription | 10 | Prevents flood during incident |
| Max active subscriptions per peer | 16 | Bounds server-side subscription tracking |
| Max payload_len per CAR | 65,535 bytes | u16 effective limit; typical CARs are 200–500 bytes |
| Max CARs per community (soft limit) | 10,000 | Configurable; excess triggers warning in dashboard |

### Bandwidth Estimates

| Scenario | CARs/cycle | Bytes/cycle | Daily bandwidth |
|----------|-----------|-------------|-----------------|
| Quiet (no incidents) | 0–2 | ~1 KB | ~300 KB |
| Normal activity | 5–10 | ~5 KB | ~1.5 MB |
| Active incident (malware wave) | 50–100 | ~50 KB | ~15 MB |
| Full initial sync (mature community) | 1,000–5,000 | ~500 KB–2.5 MB | One-time |

Negligible for any server that can handle game relay traffic.

### Error Handling

```cbor-diag
; Error response
{
  "method": "advisory.sync.error",
  "request_id": 42,
  "error_code": "rate_limited",    ; text string
  "error_message": "Too many sync requests; retry after 30 seconds",
  "retry_after_secs": 30           ; optional u32
}
```

Error codes:

| Code | Meaning |
|------|---------|
| `rate_limited` | Too many requests; honor `retry_after_secs` |
| `unknown_community` | Requested community_filter contains unknown keys |
| `push_not_supported` | Server does not support push subscriptions |
| `payload_too_large` | Request exceeded size limits |
| `auth_required` | Peer has not completed ICRP mutual authentication |

---

## 5. Client-Side Aggregation Algorithm

The client collects CARs from all communities the player is connected to and computes an aggregated status for each installed Workshop resource.

### Configuration

```toml
# settings.toml (client-side)
[content_trust]
block_threshold = 2              # Weighted score to trigger block
warn_threshold = 1               # Weighted score to trigger warn
advisory_sources = "subscribed"  # "subscribed" | "verified" | "all"
allow_override = false           # Allow user to bypass blocks

# Per-community trust weights (optional, defaults to 1.0 for all)
[content_trust.community_weights]
# community_key_fingerprint = weight
"7f3a1b2c" = 1.0    # IC Official — full trust
"a1d4e8f2" = 0.8    # Wolfpack — trusted but not official
"c3b79a12" = 0.5    # New community — lower weight
```

### Aggregation Status

```rust
/// Aggregated advisory status for a single Workshop resource.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AggregatedAdvisoryStatus {
    /// Resource is blocked — refuse to load, stop seeding, show red warning.
    Blocked {
        block_score: f64,
        blocking_communities: Vec<CommunityInfo>,
        primary_reason: String,
        primary_category: CarCategory,
    },
    /// Resource has warnings — show yellow advisory, user can still load.
    Warned {
        warn_score: f64,
        warning_communities: Vec<CommunityInfo>,
        primary_reason: String,
        primary_category: CarCategory,
    },
    /// Resource has positive endorsements and no negative advisories.
    Endorsed {
        endorsing_communities: Vec<CommunityInfo>,
    },
    /// No advisories from any trusted community.
    Neutral,
}

#[derive(Debug, Clone)]
pub struct CommunityInfo {
    pub community_key: [u8; 32],
    pub community_name: String,
    pub trust_weight: f64,
}
```

### Full Aggregation Algorithm (Rust)

```rust
use std::collections::HashMap;

/// Trust configuration loaded from settings.toml.
pub struct TrustConfig {
    pub block_threshold: f64,    // default: 2.0
    pub warn_threshold: f64,     // default: 1.0
    pub allow_override: bool,    // default: false
    pub community_weights: HashMap<[u8; 32], f64>,  // key → weight, default 1.0
}

impl TrustConfig {
    pub fn weight_for(&self, community_key: &[u8; 32]) -> f64 {
        *self.community_weights.get(community_key).unwrap_or(&1.0)
    }
}

/// Per-community resolved advisory: the highest-sequence CAR for a
/// given (community, resource) pair, after supersession chain resolution.
pub struct ResolvedAdvisory {
    pub community_key: [u8; 32],
    pub community_name: String,
    pub sequence: u64,
    pub action: CarAction,
    pub category: CarCategory,
    pub reason: String,
    pub expires_at: Option<i64>,
}

/// Compute aggregated status for a single Workshop resource.
pub fn aggregate_advisories(
    resource: &str,
    advisories: &[ResolvedAdvisory],
    config: &TrustConfig,
    now_unix: i64,
) -> AggregatedAdvisoryStatus {
    // Step 1: Filter expired advisories
    let active: Vec<&ResolvedAdvisory> = advisories
        .iter()
        .filter(|a| a.expires_at.map_or(true, |exp| exp > now_unix))
        .collect();

    // Step 2: Separate by action
    let mut block_score: f64 = 0.0;
    let mut warn_score: f64 = 0.0;
    let mut blocking_communities: Vec<CommunityInfo> = Vec::new();
    let mut warning_communities: Vec<CommunityInfo> = Vec::new();
    let mut endorsing_communities: Vec<CommunityInfo> = Vec::new();

    // Track the most severe reason for display
    let mut primary_block_reason: Option<(&str, CarCategory)> = None;
    let mut primary_warn_reason: Option<(&str, CarCategory)> = None;

    for advisory in &active {
        let weight = config.weight_for(&advisory.community_key);
        let info = CommunityInfo {
            community_key: advisory.community_key,
            community_name: advisory.community_name.clone(),
            trust_weight: weight,
        };

        match advisory.action {
            CarAction::Block => {
                block_score += weight;
                if primary_block_reason.is_none()
                    || advisory.category as u8 <= primary_block_reason.unwrap().1 as u8
                {
                    primary_block_reason =
                        Some((&advisory.reason, advisory.category));
                }
                blocking_communities.push(info);
            }
            CarAction::Warn => {
                warn_score += weight;
                if primary_warn_reason.is_none() {
                    primary_warn_reason =
                        Some((&advisory.reason, advisory.category));
                }
                warning_communities.push(info);
            }
            CarAction::Endorse => {
                endorsing_communities.push(info);
            }
        }
    }

    // Step 3: Apply thresholds (blocks take priority over warns)
    if block_score >= config.block_threshold {
        let (reason, category) = primary_block_reason
            .unwrap_or(("Blocked by multiple communities", CarCategory::Malware));
        AggregatedAdvisoryStatus::Blocked {
            block_score,
            blocking_communities,
            primary_reason: reason.to_string(),
            primary_category: category,
        }
    } else if warn_score >= config.warn_threshold || block_score > 0.0 {
        // A single block that doesn't meet threshold is downgraded to warn
        let all_warning = [blocking_communities, warning_communities].concat();
        let (reason, category) = primary_block_reason
            .or(primary_warn_reason)
            .unwrap_or(("Advisory from trusted community", CarCategory::Quality));
        AggregatedAdvisoryStatus::Warned {
            warn_score: warn_score + block_score,
            warning_communities: all_warning,
            primary_reason: reason.to_string(),
            primary_category: category,
        }
    } else if !endorsing_communities.is_empty() {
        AggregatedAdvisoryStatus::Endorsed {
            endorsing_communities,
        }
    } else {
        AggregatedAdvisoryStatus::Neutral
    }
}
```

### Resolution: Selecting the Active CAR per (Community, Resource)

Before aggregation, the client must resolve which CAR is "current" for each (community, resource) pair. Each community may have issued multiple CARs for the same resource over time (e.g., first a `warn`, then escalated to `block`, then revoked back to `endorse`). The client always uses the **highest-sequence** CAR.

```rust
/// Given all CARs from all communities for a specific resource,
/// resolve to at most one active CAR per community.
pub fn resolve_advisories(
    resource: &str,
    all_cars: &[StoredCar],
    now_unix: i64,
) -> Vec<ResolvedAdvisory> {
    // Group by community_key
    let mut by_community: HashMap<[u8; 32], &StoredCar> = HashMap::new();

    for car in all_cars {
        if car.resource != resource {
            continue;
        }

        let entry = by_community.entry(car.community_key);
        entry
            .and_modify(|existing| {
                // Keep the highest sequence number
                if car.sequence > existing.sequence {
                    *existing = car;
                }
            })
            .or_insert(car);
    }

    by_community
        .into_values()
        .map(|car| ResolvedAdvisory {
            community_key: car.community_key,
            community_name: car.community_name.clone(),
            sequence: car.sequence,
            action: car.action,
            category: car.category,
            reason: car.reason.clone(),
            expires_at: car.expires_at,
        })
        .collect()
}
```

### Garden Fence Visualization (Client UI)

The client UI displays the aggregation result:

```
┌──────────────────────────────────────────────────────────┐
│  ⛔ BLOCKED: coolmodder/awesome-tanks@2.1.0              │
│                                                          │
│  Blocked by 3 communities (score: 2.8, threshold: 2.0)  │
│                                                          │
│  🔴 IC Official (weight 1.0) — malware                  │
│     "WASM module exfiltrates player data"                │
│  🔴 Wolfpack (weight 0.8) — malware                     │
│     "Confirmed: unauthorized network access"             │
│  🔴 SEA Community (weight 1.0) — malware                │
│     "Independent analysis confirms data exfiltration"    │
│                                                          │
│  Content will not be loaded. Seeding stopped.            │
│  [ View Evidence ] [ View v2.0.0 (safe) ]               │
└──────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────┐
│  ⚠️ WARNING: somepublisher/fancy-ui@1.3.0               │
│                                                          │
│  Flagged by 1 community (score: 1.0, threshold: 1.0)    │
│                                                          │
│  🟡 Wolfpack (weight 0.8) — quality                     │
│     "Known crash on maps with >8 players"                │
│                                                          │
│  You may still use this content.                         │
│  [ Continue Anyway ] [ View Details ] [ Uninstall ]      │
└──────────────────────────────────────────────────────────┘
```

---

## 6. CAR Revocation & Supersession

### Supersession Semantics

A community revokes or updates a previous advisory by issuing a new CAR with the `supersedes` field pointing to the sequence number of the previous CAR for the same resource.

**Rules:**

1. `supersedes` MUST reference a valid earlier sequence number from the same community for the same resource, OR be `0` (first advisory for this resource).
2. The new CAR completely replaces the superseded one. Clients MUST use the highest-sequence CAR per (community, resource) pair.
3. A `block` superseded by an `endorse` = revocation of the block.
4. A `warn` superseded by a `block` = escalation.
5. A `block` superseded by a `warn` = de-escalation.

### Supersession Chain Example

```
Seq  Action   Resource                          Supersedes  Effect
───  ───────  ────────────────────────────────  ──────────  ──────────────────────
40   warn     coolmodder/awesome-tanks@2.1.0    0           Initial warning
42   block    coolmodder/awesome-tanks@2.1.0    40          Escalated to block
55   endorse  coolmodder/awesome-tanks@2.1.0    42          Revoked (author fixed it)
```

After sequence 55, the client sees `endorse` as the active CAR for this (community, resource) pair.

### Supersession Chain Validation

Clients SHOULD validate the supersession chain on full sync. The validation is advisory (not blocking) — a broken chain is logged but does not prevent the highest-sequence CAR from being used.

```rust
/// Validate that a supersession chain is internally consistent.
/// Returns warnings for any broken links.
pub fn validate_supersession_chain(
    cars: &[StoredCar],  // all CARs from one community for one resource, sorted by sequence
) -> Vec<ChainWarning> {
    let mut warnings = Vec::new();
    let mut sequence_set: HashSet<u64> = HashSet::new();

    for car in cars {
        sequence_set.insert(car.sequence);
    }

    for car in cars {
        if car.supersedes != 0 && !sequence_set.contains(&car.supersedes) {
            warnings.push(ChainWarning {
                sequence: car.sequence,
                supersedes: car.supersedes,
                message: format!(
                    "CAR seq {} supersedes seq {} which is not in the local store",
                    car.sequence, car.supersedes
                ),
            });
        }
    }

    warnings
}
```

### Expiry-Based Revocation

CARs with `expires_at` set are automatically treated as revoked after the expiry time. This is useful for:

- **Temporary warnings** during investigation: set `expires_at` to 48 hours; if the investigation clears the resource, the advisory expires automatically without requiring a superseding CAR.
- **Time-limited DMCA holds**: set `expires_at` to the legal review deadline.

```rust
fn is_expired(car: &StoredCar, now_unix: i64) -> bool {
    car.expires_at.map_or(false, |exp| exp <= now_unix)
}
```

Expired CARs are retained in the database for audit purposes but excluded from aggregation.

---

## 7. Key Rotation & Compromise Recovery

CARs use the same two-key architecture as D052's SCRs: a Signing Key (SK) for daily operations and a Recovery Key (RK) for emergencies. The `ic-crypto` module provides shared key management.

### Key Rotation Record (Community-Level)

When a community rotates its signing key, all previously signed CARs remain valid (they were signed by a legitimate key at the time). New CARs are signed with the new key. Clients verify the rotation chain to trust the new key.

#### KeyRotation Binary Format

```
Offset  Field           Size      Encoding
──────  ──────────────  ────────  ───────────────
0       version         1 byte   u8 (0x01)
1       record_type     1 byte   u8 (0x20 = key_rotation)
2       old_key         32 bytes [u8; 32] — SK being retired
34      new_key         32 bytes [u8; 32] — replacement SK
66      signed_by       1 byte   u8: 0x01=signing_key, 0x02=recovery_key
67      reason          1 byte   u8: 0x01=scheduled, 0x02=migration,
                                     0x03=compromise, 0x04=precautionary
68      effective_at    8 bytes  i64 LE — Unix seconds
76      grace_until     8 bytes  i64 LE — old key accepted until this time
84      signature       64 bytes Ed25519 (signed by old_key if voluntary,
                                 or recovery_key if emergency)
──────  ──────────────  ────────  ───────────────
Total:  148 bytes (fixed size)
```

Signature covers bytes `0..84`.

#### KeyRevocation Binary Format (Emergency)

When a community's SK is compromised, the operator uses the offline RK to issue a revocation:

```
Offset  Field              Size      Encoding
──────  ─────────────────  ────────  ───────────────
0       version            1 byte   u8 (0x01)
1       record_type        1 byte   u8 (0x21 = key_revocation)
2       revoked_key        32 bytes [u8; 32] — compromised SK
34      replacement_key    32 bytes [u8; 32] — new SK (or all-zeros if
                                               no replacement yet)
66      revoked_after      8 bytes  i64 LE — CARs signed by revoked_key
                                    after this timestamp are invalid
74      recovery_key       32 bytes [u8; 32] — RK that signed this record
106     signature          64 bytes Ed25519 (signed by recovery_key)
──────  ─────────────────  ────────  ───────────────
Total:  170 bytes (fixed size)
```

Signature covers bytes `0..106`.

### Rust Types

```rust
/// Key rotation record — signed by outgoing SK (voluntary) or RK (emergency).
#[derive(Debug, Clone)]
pub struct KeyRotationRecord {
    pub version: u8,                  // 0x01
    pub record_type: u8,              // 0x20
    pub old_key: [u8; 32],
    pub new_key: [u8; 32],
    pub signed_by: KeyRole,           // SigningKey or RecoveryKey
    pub reason: RotationReason,
    pub effective_at: i64,            // Unix seconds
    pub grace_until: i64,             // old key valid until this time
    pub signature: [u8; 64],
}

/// Emergency key revocation — always signed by RK.
#[derive(Debug, Clone)]
pub struct KeyRevocationRecord {
    pub version: u8,                  // 0x01
    pub record_type: u8,              // 0x21
    pub revoked_key: [u8; 32],
    pub replacement_key: [u8; 32],    // all-zeros if no replacement yet
    pub revoked_after: i64,           // CARs after this timestamp are invalid
    pub recovery_key: [u8; 32],       // RK that signed this
    pub signature: [u8; 64],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum KeyRole {
    SigningKey   = 0x01,
    RecoveryKey  = 0x02,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RotationReason {
    Scheduled     = 0x01,
    Migration     = 0x02,
    Compromise    = 0x03,
    Precautionary = 0x04,
}
```

### Compromise Recovery Procedure

1. Operator detects or suspects SK compromise.
2. Operator retrieves offline RK (USB drive, password manager, etc.).
3. Operator runs `ic community emergency-rotate --recovery-key <path>`.
4. Server generates a new SK keypair.
5. Server creates a `KeyRevocationRecord` signed by the RK, with `revoked_after` set to the estimated compromise time.
6. Server creates a `KeyRotationRecord` signed by the RK, pointing `old_key → new_key`.
7. Both records are broadcast to all peers via `advisory.sync` and `advisory.push`.
8. Receiving clients:
   a. Verify the revocation/rotation records against the cached RK (obtained at community join time).
   b. Invalidate all CARs signed by `revoked_key` after `revoked_after`.
   c. Accept new CARs signed by `replacement_key`.
   d. Log the event for operator/user review.

### CARs Under Key Rotation

| CAR signed by | CAR issued_at | Rotation/Revocation status | Client treatment |
|---------------|---------------|---------------------------|-----------------|
| Old SK | Before `revoked_after` | Key later rotated/revoked | **Valid** — key was legitimate at time of signing |
| Old SK | After `revoked_after` | Key revoked (compromise) | **Invalid** — potentially forged by attacker |
| Old SK | After `effective_at` but before `grace_until` | Key rotated voluntarily | **Valid** — within grace period |
| Old SK | After `grace_until` | Key rotated voluntarily | **Invalid** — grace period expired |
| New SK | After `effective_at` | Key rotation complete | **Valid** — current signing key |

---

## 8. SQLite Storage Schema

### Server-Side Schema (ic-server)

```sql
-- Content Advisory Records issued by this community or received via sync.
CREATE TABLE content_advisories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    community_key   BLOB NOT NULL,          -- 32 bytes Ed25519 public key
    sequence        INTEGER NOT NULL,       -- u64, monotonic per community
    issued_at       INTEGER NOT NULL,       -- i64, Unix seconds
    resource        TEXT NOT NULL,           -- "publisher/package@version"
    action          INTEGER NOT NULL,       -- 1=block, 2=warn, 3=endorse
    category        INTEGER NOT NULL,       -- 1=malware, 2=policy, 3=dmca, 4=quality, 5=abandoned
    reason          TEXT NOT NULL,           -- human-readable explanation
    evidence_hash   BLOB,                   -- 32 bytes SHA-256, nullable
    supersedes      INTEGER NOT NULL DEFAULT 0, -- sequence of previous CAR for same resource
    tags            TEXT,                    -- JSON array of strings, nullable
    expires_at      INTEGER,                -- nullable, Unix seconds
    raw_envelope    BLOB NOT NULL,          -- full signed binary envelope for re-broadcast
    received_at     INTEGER NOT NULL,       -- when this server received/created the CAR
    is_local        INTEGER NOT NULL DEFAULT 0, -- 1 if issued by this server, 0 if synced

    UNIQUE(community_key, sequence)
);

-- Index for resource lookups (aggregation queries)
CREATE INDEX idx_car_resource ON content_advisories(resource);

-- Index for sync queries (since_sequence filtering)
CREATE INDEX idx_car_community_seq ON content_advisories(community_key, sequence);

-- Index for expiry cleanup
CREATE INDEX idx_car_expires ON content_advisories(expires_at)
    WHERE expires_at IS NOT NULL;

-- Index for resource + community (supersession chain)
CREATE INDEX idx_car_resource_community ON content_advisories(resource, community_key, sequence);


-- Community trust configuration (which communities this server subscribes to).
CREATE TABLE community_trust_config (
    community_key       BLOB NOT NULL PRIMARY KEY, -- 32 bytes Ed25519
    community_name      TEXT NOT NULL,
    trust_weight        REAL NOT NULL DEFAULT 1.0, -- 0.0 to 1.0
    auto_apply_block    INTEGER NOT NULL DEFAULT 0, -- bool: auto-apply block CARs
    auto_apply_warn     INTEGER NOT NULL DEFAULT 1, -- bool: auto-apply warn CARs
    sync_endpoint       TEXT NOT NULL,              -- ICRP endpoint URL
    last_sync_at        INTEGER,                    -- nullable, Unix seconds
    last_sync_sequence  INTEGER NOT NULL DEFAULT 0, -- highest sequence received
    is_verified         INTEGER NOT NULL DEFAULT 0, -- from seed list
    subscribed_at       INTEGER NOT NULL,           -- Unix seconds
    enabled             INTEGER NOT NULL DEFAULT 1  -- bool: actively syncing
);


-- Key rotation/revocation records for tracked communities.
CREATE TABLE community_key_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    community_key   BLOB NOT NULL,          -- the community this event belongs to
    event_type      INTEGER NOT NULL,       -- 0x20=rotation, 0x21=revocation
    old_key         BLOB NOT NULL,          -- 32 bytes
    new_key         BLOB NOT NULL,          -- 32 bytes
    signed_by       INTEGER NOT NULL,       -- 1=SK, 2=RK
    reason          INTEGER NOT NULL,       -- rotation reason code
    effective_at    INTEGER NOT NULL,       -- Unix seconds
    grace_until     INTEGER,                -- Unix seconds (rotation only)
    revoked_after   INTEGER,                -- Unix seconds (revocation only)
    raw_record      BLOB NOT NULL,          -- full signed record bytes
    received_at     INTEGER NOT NULL        -- when this server received the record
);

CREATE INDEX idx_key_events_community ON community_key_events(community_key, effective_at);


-- Aggregated advisory status (materialized for performance).
-- Rebuilt periodically or on CAR insert/update.
CREATE TABLE aggregated_advisory_status (
    resource            TEXT NOT NULL PRIMARY KEY,
    status              INTEGER NOT NULL,       -- 0=neutral, 1=endorsed, 2=warned, 3=blocked
    block_score         REAL NOT NULL DEFAULT 0.0,
    warn_score          REAL NOT NULL DEFAULT 0.0,
    endorsement_count   INTEGER NOT NULL DEFAULT 0,
    blocking_communities TEXT,                   -- JSON array of community key hex strings
    warning_communities  TEXT,                   -- JSON array of community key hex strings
    primary_reason      TEXT,
    primary_category    INTEGER,
    last_updated        INTEGER NOT NULL         -- Unix seconds
);

CREATE INDEX idx_agg_status ON aggregated_advisory_status(status);
```

### Client-Side Schema

The client stores CARs in its local database (separate from the per-community credential SQLite files from D052):

```sql
-- Client stores CARs from all subscribed communities in a single DB.
-- File: <data_dir>/content_advisories.db

CREATE TABLE content_advisories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    community_key   BLOB NOT NULL,
    sequence        INTEGER NOT NULL,
    issued_at       INTEGER NOT NULL,
    resource        TEXT NOT NULL,
    action          INTEGER NOT NULL,
    category        INTEGER NOT NULL,
    reason          TEXT NOT NULL,
    evidence_hash   BLOB,
    supersedes      INTEGER NOT NULL DEFAULT 0,
    tags            TEXT,                    -- JSON array
    expires_at      INTEGER,
    raw_envelope    BLOB NOT NULL,
    synced_at       INTEGER NOT NULL,       -- when client received this CAR

    UNIQUE(community_key, sequence)
);

CREATE INDEX idx_client_car_resource ON content_advisories(resource);
CREATE INDEX idx_client_car_community_seq ON content_advisories(community_key, sequence);


-- Per-community sync state (tracks where the client left off)
CREATE TABLE sync_state (
    community_key       BLOB NOT NULL PRIMARY KEY,
    last_sequence       INTEGER NOT NULL DEFAULT 0,
    last_sync_at        INTEGER NOT NULL,
    sync_endpoint       TEXT NOT NULL
);


-- User overrides (if allow_override = true in settings.toml)
CREATE TABLE user_overrides (
    resource    TEXT NOT NULL PRIMARY KEY,
    action      INTEGER NOT NULL,   -- 0=clear override, 1=force_allow, 2=force_block
    reason      TEXT,               -- user's note for why they overrode
    created_at  INTEGER NOT NULL
);
```

### Materialized Aggregation Refresh

The `aggregated_advisory_status` table is rebuilt when:

1. A new CAR is inserted or updated.
2. The community trust configuration changes.
3. On client startup (in case CARs expired while offline).
4. On a configurable timer (default: every 5 minutes).

```sql
-- Rebuild aggregated status for a specific resource.
-- This is a simplified SQL representation; the actual aggregation
-- uses the Rust algorithm (§5) because weighted scoring requires
-- application logic. The SQL below pre-computes inputs.

-- Step 1: Get the highest-sequence CAR per (community, resource)
CREATE TEMPORARY VIEW active_cars AS
SELECT ca.*
FROM content_advisories ca
INNER JOIN (
    SELECT community_key, resource, MAX(sequence) AS max_seq
    FROM content_advisories
    GROUP BY community_key, resource
) latest
ON ca.community_key = latest.community_key
   AND ca.resource = latest.resource
   AND ca.sequence = latest.max_seq
WHERE ca.expires_at IS NULL OR ca.expires_at > unixepoch();

-- Step 2: Application code reads active_cars + community_trust_config,
--         runs aggregate_advisories(), writes to aggregated_advisory_status.
```

---

## 9. Rust Type Definitions

Complete type definitions for the CAR protocol, suitable for inclusion in `ic-protocol` or `ic-crypto`.

```rust
// ──────────────────────────────────────────────────────────
// ic-protocol/src/car.rs — Content Advisory Record types
// ──────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};

/// Binary envelope wrapping a signed Content Advisory Record.
/// Fixed header (54 bytes) + variable payload + signature (64 bytes).
#[derive(Debug, Clone)]
pub struct CarEnvelope {
    pub version: u8,                    // 0x01
    pub record_type: u8,                // 0x10
    pub community_key: [u8; 32],        // Ed25519 public key
    pub sequence: u64,                  // monotonic per community
    pub issued_at: i64,                 // Unix seconds
    pub payload: CarPayload,            // decoded CBOR
    pub signature: [u8; 64],            // Ed25519 signature
    pub raw_bytes: Vec<u8>,             // original bytes for re-broadcast
}

impl CarEnvelope {
    /// Encode a CarEnvelope to its binary wire format.
    pub fn encode(&self) -> Vec<u8> {
        let payload_cbor = ciborium::to_vec(&self.payload)
            .expect("CBOR encoding must not fail for valid CarPayload");
        let payload_len = payload_cbor.len() as u32;

        let mut buf = Vec::with_capacity(118 + payload_cbor.len());
        buf.push(self.version);
        buf.push(self.record_type);
        buf.extend_from_slice(&self.community_key);
        buf.extend_from_slice(&self.sequence.to_le_bytes());
        buf.extend_from_slice(&self.issued_at.to_le_bytes());
        buf.extend_from_slice(&payload_len.to_le_bytes());
        buf.extend_from_slice(&payload_cbor);
        // Signature is appended by the caller after signing buf[0..54+N]
        buf
    }

    /// Decode a CarEnvelope from raw bytes. Returns None if invalid.
    pub fn decode(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 118 {
            return None; // minimum: 54 header + 0 payload + 64 signature
        }

        let version = bytes[0];
        if version != 0x01 {
            return None;
        }

        let record_type = bytes[1];
        if record_type != 0x10 {
            return None;
        }

        let community_key: [u8; 32] = bytes[2..34].try_into().ok()?;
        let sequence = u64::from_le_bytes(bytes[34..42].try_into().ok()?);
        let issued_at = i64::from_le_bytes(bytes[42..50].try_into().ok()?);
        let payload_len = u32::from_le_bytes(bytes[50..54].try_into().ok()?) as usize;

        if payload_len > 65535 {
            return None;
        }

        let expected_total = 54 + payload_len + 64;
        if bytes.len() < expected_total {
            return None;
        }

        let payload_bytes = &bytes[54..54 + payload_len];
        let signature: [u8; 64] = bytes[54 + payload_len..54 + payload_len + 64]
            .try_into()
            .ok()?;

        // Verify signature before decoding payload
        let signed_data = &bytes[0..54 + payload_len];
        if !ed25519_verify(&community_key, signed_data, &signature) {
            return None;
        }

        let payload: CarPayload = ciborium::from_reader(payload_bytes).ok()?;

        Some(CarEnvelope {
            version,
            record_type,
            community_key,
            sequence,
            issued_at,
            payload,
            signature,
            raw_bytes: bytes[0..expected_total].to_vec(),
        })
    }
}

/// CBOR-encoded payload. See §3 for field specifications.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarPayload {
    pub resource: String,
    pub action: CarAction,
    pub category: CarCategory,
    pub reason: String,

    #[serde(with = "serde_bytes", skip_serializing_if = "Option::is_none", default)]
    pub evidence_hash: Option<[u8; 32]>,

    pub supersedes: u64,

    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum CarAction {
    Block   = 0x01,
    Warn    = 0x02,
    Endorse = 0x03,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum CarCategory {
    Malware         = 0x01,
    PolicyViolation = 0x02,
    Dmca            = 0x03,
    Quality         = 0x04,
    Abandoned       = 0x05,
}

/// Aggregated advisory status for a single Workshop resource.
#[derive(Debug, Clone, PartialEq)]
pub enum AggregatedAdvisoryStatus {
    Blocked {
        block_score: f64,
        blocking_communities: Vec<CommunityInfo>,
        primary_reason: String,
        primary_category: CarCategory,
    },
    Warned {
        warn_score: f64,
        warning_communities: Vec<CommunityInfo>,
        primary_reason: String,
        primary_category: CarCategory,
    },
    Endorsed {
        endorsing_communities: Vec<CommunityInfo>,
    },
    Neutral,
}

#[derive(Debug, Clone)]
pub struct CommunityInfo {
    pub community_key: [u8; 32],
    pub community_name: String,
    pub trust_weight: f64,
}

/// Client-side trust configuration.
pub struct CommunityTrustConfig {
    pub community_key: [u8; 32],
    pub community_name: String,
    pub trust_weight: f64,          // 0.0 to 1.0
    pub auto_apply_block: bool,
    pub auto_apply_warn: bool,
    pub sync_endpoint: String,
    pub is_verified: bool,
    pub enabled: bool,
}

// ──────────────────────────────────────────────────────────
// Sync protocol types (CBOR-encoded ICRP messages)
// ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncRequest {
    pub method: String,             // "advisory.sync"
    pub request_id: u64,
    pub since_sequence: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub community_filter: Option<Vec<[u8; 32]>>,
    pub max_results: u32,           // max 100
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_prefix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResponse {
    pub method: String,             // "advisory.sync.response"
    pub request_id: u64,
    #[serde(with = "serde_bytes")]
    pub envelopes: Vec<Vec<u8>>,    // raw CAR binary envelopes
    pub has_more: bool,
    pub last_sequence: u64,
    pub total_available: u64,
}

// ──────────────────────────────────────────────────────────
// Key management types (shared with SCR via ic-crypto)
// ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct KeyRotationRecord {
    pub version: u8,                // 0x01
    pub record_type: u8,            // 0x20
    pub old_key: [u8; 32],
    pub new_key: [u8; 32],
    pub signed_by: KeyRole,
    pub reason: RotationReason,
    pub effective_at: i64,
    pub grace_until: i64,
    pub signature: [u8; 64],
}

#[derive(Debug, Clone)]
pub struct KeyRevocationRecord {
    pub version: u8,                // 0x01
    pub record_type: u8,            // 0x21
    pub revoked_key: [u8; 32],
    pub replacement_key: [u8; 32],  // [0u8; 32] if no replacement yet
    pub revoked_after: i64,
    pub recovery_key: [u8; 32],
    pub signature: [u8; 64],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum KeyRole {
    SigningKey   = 0x01,
    RecoveryKey  = 0x02,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RotationReason {
    Scheduled     = 0x01,
    Migration     = 0x02,
    Compromise    = 0x03,
    Precautionary = 0x04,
}

/// Placeholder for Ed25519 verification. In production, use the
/// ed25519-dalek crate or equivalent.
fn ed25519_verify(
    public_key: &[u8; 32],
    message: &[u8],
    signature: &[u8; 64],
) -> bool {
    // Implementation: ed25519_dalek::VerifyingKey::from_bytes(public_key)
    //     .verify(message, &Signature::from_bytes(signature))
    //     .is_ok()
    todo!("wire up ed25519-dalek")
}
```

---

## 10. Operational Considerations

### Storage Growth

| Metric | Estimate |
|--------|----------|
| Average CAR size (envelope) | ~300–500 bytes |
| 1,000 CARs | ~500 KB |
| 10,000 CARs | ~5 MB |
| 100,000 CARs (very large, multi-year community) | ~50 MB |
| SQLite overhead (indexes, WAL) | ~20% additional |

Storage is negligible. A community server with 10,000 CARs uses less disk than a single Workshop package.

### Sync Bandwidth

| Scenario | Poll interval | CARs/cycle | Bytes/cycle | Monthly total |
|----------|--------------|------------|-------------|---------------|
| 3 subscribed communities, quiet | 5 min | 0–2 | ~1 KB | ~9 MB |
| 10 subscribed communities, normal | 5 min | 5–20 | ~10 KB | ~90 MB |
| 20 subscribed communities, active incident | 1 min | 50–100 | ~50 KB | ~2 GB |

Even the worst case is trivial compared to Workshop content bandwidth.

### First Sync on Community Join

When a player joins a community or a server subscribes to a new advisory source, a full CAR history download occurs:

```
Full sync: since_sequence = 0
Typical community (1 year old): ~500–2,000 CARs = 250 KB–1 MB
Paginated at 100 CARs per request: 5–20 requests
Time: <5 seconds on any reasonable connection
```

### Garbage Collection

CARs can be pruned to save space. Pruning rules:

1. **CARs for uninstalled resources:** Retain for 30 days after resource uninstall (in case the player re-installs), then prune.
2. **Superseded CARs:** Retain the full chain for audit. Optionally, prune superseded CARs older than 90 days, keeping only the latest CAR per (community, resource).
3. **Expired CARs:** Retain for 7 days past expiry for audit, then prune.
4. **CARs from unsubscribed communities:** Retain for 7 days after unsubscribe, then prune.

```sql
-- Prune superseded CARs older than 90 days
DELETE FROM content_advisories
WHERE id NOT IN (
    SELECT id FROM content_advisories ca
    INNER JOIN (
        SELECT community_key, resource, MAX(sequence) AS max_seq
        FROM content_advisories
        GROUP BY community_key, resource
    ) latest
    ON ca.community_key = latest.community_key
       AND ca.resource = latest.resource
       AND ca.sequence = latest.max_seq
)
AND issued_at < unixepoch() - (90 * 86400);

-- Prune expired CARs older than 7 days past expiry
DELETE FROM content_advisories
WHERE expires_at IS NOT NULL
  AND expires_at < unixepoch() - (7 * 86400);
```

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Sync peer unreachable | No new CARs from that community | Retry on next poll; client uses cached CARs |
| Corrupt CAR in sync response | Single CAR rejected | Log + skip; continue processing remaining CARs |
| SQLite write failure | CARs not persisted | Retry on next sync; in-memory aggregation still works from cached data |
| Community key compromised | False CARs accepted until rotation | KeyRevocation propagates; CARs after `revoked_after` invalidated |
| Client offline for extended period | Stale aggregation | Full re-sync on reconnect; `since_sequence` catches up |

### Monitoring (Server Dashboard)

The `ic-server` web dashboard (D072/D074) includes a Content Trust page when the Workshop capability is enabled:

| Metric | Source |
|--------|--------|
| Total CARs issued (local) | `SELECT COUNT(*) FROM content_advisories WHERE is_local = 1` |
| Total CARs synced (remote) | `SELECT COUNT(*) FROM content_advisories WHERE is_local = 0` |
| Active blocks | `SELECT COUNT(DISTINCT resource) FROM aggregated_advisory_status WHERE status = 3` |
| Active warnings | `SELECT COUNT(DISTINCT resource) FROM aggregated_advisory_status WHERE status = 2` |
| Sync status per peer | `SELECT community_name, last_sync_at, last_sync_sequence FROM community_trust_config` |
| Sync errors (last 24h) | From structured log (D072) |

---

## Cross-References

| Document | Relationship |
|----------|-------------|
| **D052** (Community Servers with Portable Signed Credentials) | SCR binary format (CAR envelope mirrors it); Ed25519 key hierarchy (SK/RK); community identity; key rotation/revocation records |
| **D074** (Community Server — Unified Binary with Capability Flags) | Section 5 defines CAR concept, Garden Fence consensus, `[content_trust]` config, advisory sync, quarantine-before-release |
| **D030** (Workshop Registry) | Resource naming (`publisher/package@version`); publisher trust tiers; semver dependency resolution |
| **06-SECURITY.md** | Supply chain defense (V18); WASM sandbox (V14); security advisory system |
| **D049** (P2P Distribution) | Workshop content distribution; tracker-level enforcement of block CARs |
| **D007** (Relay Server) | ICRP transport protocol used for advisory sync |
| **D034** (SQLite) | Local-first storage philosophy; SQLite as the persistence layer |
| **D072** (Server Management) | Dashboard, CLI, structured logging — extended for Content Trust page |
