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
