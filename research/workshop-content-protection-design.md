# Workshop Content Protection — Design Specification

> **Status:** Design study
> **Date:** 2026-03-13
> **Resolves:** Missing enforcement mechanism for D046 premium content; D035 "freely downloadable" vs. premium content gating; no `check_entitlement()` in `PlatformServices` trait; no access control in P2P distribution (D049)
> **Cross-references:** D034 (SQLite), D035 (creator attribution), D046 (premium content framework), D049 (Workshop P2P distribution), D052 (community servers / Ed25519 SCR system), D061 (data backup / BIP-39 recovery), D074 (community server bundle), `research/credential-protection-design.md` (CredentialStore / DEK pattern), `research/p2p-distribute-crate-design.md` (P2P engine), `src/06-SECURITY.md` (threat model)

---

## 0. Executive Summary

Iron Curtain's Workshop (D030/D049) distributes content via BitTorrent-compatible P2P with SHA-256 integrity verification — but **zero access control**. D046 defines a premium content YAML schema (`pricing.model: premium`) and cosmetic-only constraint, but no enforcement mechanism exists. D035 states "all Workshop resources are freely downloadable." The existing `PlatformServices` trait has six methods — none related to entitlement checking or payment verification.

This document designs a **self-hosted content protection system** that enforces premium content access without depending on Steam, GOG, or any external storefront. The architecture extends the existing Ed25519 SCR system (D052) with a new `PurchaseRecord` type, adds AES-256-GCM content encryption compatible with P2P distribution, introduces per-buyer key derivation via HKDF, defines a three-level key hierarchy (Identity Key → Device Key → Session Key), and applies Tardos fingerprinting codes for collusion-resistant content watermarking.

**Five-layer protection stack:**

| Layer | Mechanism | Prevents |
|-------|-----------|----------|
| 1 | PurchaseRecord (Ed25519 SCR, bound to Identity Key) | Forged entitlements |
| 2 | Per-buyer key wrapping (HKDF-SHA256 from Identity Key) | Sharing wrapped keys between players |
| 3 | Device cache encryption (AES-256-GCM, bound to Device Key) | Copying decrypted content between machines |
| 4 | Session attestation (SK→DK→IK cryptographic chain) | Cosmetic spoofing in multiplayer relay |
| 5 | Tardos content fingerprinting | Identifying the source of leaked decrypted content |

**Design philosophy:** Self-hosted, offline-capable, P2P-compatible, no phone-home required. IC never processes payments — creators handle their own payment flow (Stripe, PayPal, Ko-fi, etc.) and IC's cryptographic infrastructure proves the purchase happened.

**Estimated implementation:** ~1,460 lines of Rust across `ic-paths` (key hierarchy), `ic-net` (session attestation), and Workshop infrastructure. Phase 5–6a.

---

## 1. Problem Statement

### 1.1 Identified Gaps

**Gap 1: No enforcement mechanism for premium content.**
D046 defines a premium content YAML schema:

```yaml
pricing:
  model: premium
  price_usd: "4.99"
  revenue_split:
    platform_store: 30
    ic_project: 10
    publisher: 60
```

But nothing in the architecture prevents a non-paying client from downloading, decrypting, and using premium content. The P2P layer (D049) verifies integrity (SHA-256) but not authorization. Any peer that knows the infohash can download any package.

**Gap 2: `PlatformServices` has no entitlement checking.**
The trait's six methods cover achievements, presence, friends, invites, and cloud saves — nothing about purchase verification:

```rust
pub trait PlatformServices: Send + Sync {
    fn unlock_achievement(&self, id: &str) -> Result<(), PlatformError>;
    fn set_presence(&self, status: &str, details: &PresenceDetails) -> Result<(), PlatformError>;
    fn friends_list(&self) -> Result<Vec<PlatformFriend>, PlatformError>;
    fn invite_friend(&self, friend: &PlatformFriend) -> Result<(), PlatformError>;
    fn cloud_save(&self, slot: &str, data: &[u8]) -> Result<(), PlatformError>;
    fn cloud_load(&self, slot: &str) -> Result<Vec<u8>, PlatformError>;
    fn platform_name(&self) -> &str;
}
```

Adding `check_entitlement()` here would couple IC to external storefronts (Steam, GOG) — violating the project's self-hosting independence goal.

**Gap 3: D035 vs D046 contradiction.**
D035 states: "Monetization is never mandatory — **all Workshop resources are freely downloadable.**" D046 introduces `pricing.model: premium` with price fields and revenue splits. These two positions need reconciliation — the resolution is that the **free tier** (gameplay, multiplayer functionality) is always freely downloadable with default fallbacks, while **cosmetic premium content** is an opt-in layer with cryptographic access control.

**Gap 4: No Device Key in key hierarchy.**
D052/D061 define the Identity Key (Ed25519 keypair, BIP-39 recoverable) and `credential-protection-design.md` defines the CredentialStore with a DEK (Data Encryption Key) — but there is no explicit Device Key concept for binding content to a specific machine, nor a Session Key for ephemeral multiplayer attestation.

### 1.2 Design Constraints

- **Self-hosted:** No dependency on Steam, GOG, or any external DRM service. Community server operators run their own infrastructure.
- **IC never processes payments:** Creators handle their own payment flow. IC provides cryptographic proof that a purchase occurred.
- **P2P-compatible:** Encrypted content must still be distributable via BitTorrent-compatible P2P (D049). SHA-256 integrity verification operates on ciphertext.
- **Offline-capable:** A player who has purchased content must be able to use it offline, indefinitely, without phoning home.
- **Cosmetic-only premium:** Premium content is cosmetic or supplementary (art packs, soundtracks, campaigns). No gameplay-affecting content behind paywalls. Multiplayer always falls back to default assets for non-owners (D046).
- **Open-source compatible:** All protection code is open-source (GPL v3). Security comes from cryptographic strength, not obscurity. An attacker who reads the source code gains no advantage — the secrets are keys, not algorithms.

---

## 2. Architecture Overview

```
Creator publishes premium content:
  1. Generates random content_key (256 bits)
  2. Encrypts content with AES-256-GCM(content_key)
  3. Uploads encrypted .icpkg to P2P network (standard D049 flow)
  4. Registers content_id + content_key with their community server

Buyer purchases content:
  1. Buyer pays creator directly (Stripe/PayPal/Ko-fi/etc.)
  2. Creator's payment webhook → community server API
  3. Server generates PurchaseRecord SCR (Ed25519-signed)
  4. Server derives per-buyer wrapped_key: HKDF(buyer_identity_key, content_key)
  5. Server delivers PurchaseRecord + wrapped_key to buyer

Buyer uses content:
  1. Client downloads encrypted .icpkg via P2P (same as any free content)
  2. Client unwraps content_key using Identity Key private material
  3. Client decrypts content (AES-256-GCM)
  4. Client re-encrypts decrypted content to Device Key (local cache)
  5. Subsequent launches: decrypt from DK-bound cache (no IK needed)

Multiplayer verification:
  1. Client presents Session Key → Device Key → Identity Key chain to relay
  2. Relay verifies PurchaseRecord SCR for cosmetic content
  3. Non-owners see default fallback assets (transparent to gameplay)
```

---

## 3. Layer 1: PurchaseRecord SCR Type

### 3.1 New Record Type

Extends the existing SCR binary format (D052) with a new `record_type`:

```
Existing record types:
  0x01 = rating snapshot
  0x02 = match result
  0x03 = achievement
  0x04 = revocation
  0x05 = key rotation

New:
  0x06 = purchase
```

### 3.2 PurchaseRecord Payload

The SCR envelope (158 bytes + payload + 64-byte signature) remains unchanged. The payload for `record_type = 0x06` is:

```
┌────────────────────────────────────────────────────────────────────┐
│  content_id         32 bytes   SHA-256 hash of content manifest   │
│  content_version    4 bytes    u32 LE, semver-encoded             │
│  creator_key        32 bytes   Ed25519 public key of content      │
│                                creator (for cross-verification)    │
│  wrapped_key_len    2 bytes    u16 LE                             │
│  wrapped_key        variable   AES-256-GCM encrypted content key  │
│                                (typically 44 bytes: 12 nonce +    │
│                                 32 ciphertext)                     │
│  purchase_flags     1 byte     bitfield (see below)               │
│  watermark_seed     16 bytes   per-buyer Tardos fingerprint seed  │
│  reserved           3 bytes    must be zero                       │
├────────────────────────────────────────────────────────────────────┤
│  Typical payload size: 132 bytes                                  │
│  Total SCR size: 158 + 132 + 64 = 354 bytes                      │
└────────────────────────────────────────────────────────────────────┘

purchase_flags bitfield:
  bit 0: grant_type (0 = purchase, 1 = bundled/promotional)
  bit 1: transferable (0 = non-transferable, 1 = giftable once)
  bit 2: watermarked (0 = no fingerprint, 1 = Tardos fingerprint applied)
  bits 3-7: reserved (must be zero)
```

### 3.3 Signing and Verification

- **Signed by:** Community server's Signing Key (SK), same as all other SCR types
- **`community_key` field:** The community server's current SK public key (32 bytes, from SCR envelope)
- **`player_key` field:** The buyer's Identity Key public key (32 bytes, from SCR envelope)
- **Verification:** Standard SCR O(1) check (D052): Ed25519 signature verification + `sequence ≥ min_valid` + `expires_at > now`
- **Offline verification:** Client stores PurchaseRecord in local SQLite. No network required after initial receipt.

### 3.4 SQLite Storage Extension

New table in the community credential SQLite store:

```sql
-- Purchase records (per community server that issued them)
CREATE TABLE purchases (
    content_id      BLOB NOT NULL,     -- SHA-256 of content manifest (32 bytes)
    content_version INTEGER NOT NULL,  -- u32 semver-encoded
    creator_key     BLOB NOT NULL,     -- creator's Ed25519 public key (32 bytes)
    wrapped_key     BLOB NOT NULL,     -- per-buyer encrypted content key
    watermark_seed  BLOB,              -- Tardos fingerprint seed (16 bytes, nullable)
    purchase_flags  INTEGER NOT NULL,  -- bitfield
    sequence        INTEGER NOT NULL,  -- SCR monotonic sequence
    purchased_at    INTEGER NOT NULL,  -- Unix timestamp
    scr_blob        BLOB NOT NULL,     -- full signed SCR (for portability)
    PRIMARY KEY (content_id, content_version)
);

CREATE INDEX idx_purchases_creator ON purchases(creator_key);
```

---

## 4. Layer 2: Content Encryption

### 4.1 Encryption at Upload

When a creator publishes premium content:

```
1. Generate content_key: 256-bit random (CSPRNG)
2. Generate nonce: 96-bit random per file within the package
3. For each file in the .icpkg:
   encrypted_file = AES-256-GCM(key=content_key, nonce=nonce, plaintext=file, aad=content_id)
4. Replace plaintext files with encrypted versions in .icpkg
5. Update .icpkg manifest: encrypted=true, algorithm="aes-256-gcm"
6. Compute SHA-256 over final encrypted .icpkg (P2P integrity hash)
7. Register content_key with community server (encrypted transport)
```

**AAD (Additional Authenticated Data):** The `content_id` (SHA-256 of manifest) is bound as AAD to every encrypted file. This prevents an attacker from swapping encrypted files between packages.

### 4.2 P2P Compatibility

Encrypted `.icpkg` files distribute identically to free content:
- SHA-256 integrity verification operates on ciphertext (unchanged)
- BitTorrent piece hashing works on ciphertext (unchanged)
- Peer protocol is identical — peers cannot distinguish encrypted from unencrypted content
- Web seeding (BEP 17/19) works unchanged
- Tracker tokens authenticate P2P participation, not content access

This means **everyone can seed premium content**, which maximizes swarm health. Only buyers can decrypt it — the swarm itself is a distribution mechanism, not an access control mechanism.

### 4.3 Decryption at Use

```
1. Client locates PurchaseRecord for content_id in local SQLite
2. Client unwraps content_key from wrapped_key (see Layer 3)
3. For each encrypted file:
   plaintext = AES-256-GCM_decrypt(key=content_key, nonce=nonce, ciphertext=file, aad=content_id)
4. If watermark_seed is present, apply Tardos fingerprint (see Layer 5)
5. Re-encrypt decrypted content to Device Key cache (see Layer 4)
6. Zeroize content_key from memory
```

---

## 5. Layer 3: Per-Buyer Key Wrapping

### 5.1 Key Derivation

Each buyer gets a unique wrapped version of the content key that only they can unwrap:

```
wrapping_key = HKDF-SHA256(
    ikm   = buyer_identity_private_key_material,
    salt  = content_id (32 bytes),
    info  = "ic-content-key-v1" || creator_key (32 bytes),
    len   = 32 bytes
)

wrapped_key = AES-256-GCM(
    key       = wrapping_key,
    nonce     = random 96-bit,
    plaintext = content_key,
    aad       = buyer_player_key (32 bytes)
)
```

### 5.2 Why HKDF from Identity Key Material

- The wrapping key is deterministic given the buyer's identity secret + content_id. This means the server can compute it during PurchaseRecord generation (the server has the content_key, the buyer's public key, and a Diffie-Hellman shared secret derived from the buyer's public key and the server's ephemeral key).
- **Actually, the server does NOT have the buyer's private key.** The key exchange works as follows:

```
Server-side (during purchase):
  1. Server generates ephemeral X25519 keypair (eph_sk, eph_pk)
  2. Server computes shared_secret = X25519(eph_sk, buyer_identity_pk_as_x25519)
  3. wrapping_key = HKDF-SHA256(ikm=shared_secret, salt=content_id, info="ic-content-key-v1")
  4. wrapped_key = AES-256-GCM(key=wrapping_key, nonce=random, plaintext=content_key, aad=buyer_pk)
  5. Delivers: PurchaseRecord { wrapped_key, eph_pk }

Client-side (during unwrap):
  1. Convert buyer_identity_ed25519_sk → X25519 (RFC 8032 birational map)
  2. shared_secret = X25519(buyer_x25519_sk, eph_pk)
  3. wrapping_key = HKDF-SHA256(ikm=shared_secret, salt=content_id, info="ic-content-key-v1")
  4. content_key = AES-256-GCM_decrypt(key=wrapping_key, nonce=..., ciphertext=wrapped_key, aad=buyer_pk)
```

This is a standard X25519+HKDF+AES-GCM construction — the same pattern used by the Signal Protocol (X3DH) and Noise Protocol Framework.

### 5.3 Sharing Resistance

If a buyer shares their `wrapped_key`:
- The recipient needs the buyer's **Identity Key private material** to derive the same `shared_secret`
- Sharing the private key means sharing the entire IC identity (all purchases, achievements, reputation, match history)
- Economic deterrent: the "cost" of sharing is your entire account

### 5.4 Ephemeral Key Storage

The server ephemeral public key (`eph_pk`, 32 bytes) is stored alongside `wrapped_key` in the PurchaseRecord payload. Updated payload layout:

```
  wrapped_key_len    2 bytes    u16 LE
  wrapped_key        variable   12 (nonce) + 32 (ciphertext) = 44 bytes typical
  eph_pk             32 bytes   server's ephemeral X25519 public key
```

This adds 32 bytes to the PurchaseRecord payload (total ~164 bytes payload, ~386 bytes total SCR).

---

## 6. Layer 4: Key Hierarchy (IK / DK / SK)

### 6.1 Three-Level Key Hierarchy

| Key | Abbreviation | Purpose | Lifetime | Storage | Recovery |
|-----|-------------|---------|----------|---------|----------|
| **Identity Key** | IK | WHO you are | Permanent (years) | Encrypted file + BIP-39 backup | 24-word mnemonic (D061) |
| **Device Key** | DK | WHICH machine | Per-installation | OS keyring (Tier 1) or vault (Tier 2) | Re-derive from IK on new device |
| **Session Key** | SK | THIS launch | Ephemeral (single process) | In-memory only | Not recoverable (regenerated each launch) |

### 6.2 Identity Key (IK) — Existing

Already defined in D052/D061:
- Ed25519 keypair, generated on first launch or community join
- Recoverable via 24-word BIP-39 mnemonic phrase (PBKDF2-HMAC-SHA512 → Ed25519 seed)
- Stored encrypted in `keys/identity.key` via CredentialStore (Tier 1: OS keyring DEK, Tier 2: passphrase DEK)
- Fingerprint: `SHA-256(public_key)[0..8]`, displayed as 16 hex chars

### 6.3 Device Key (DK) — New

Generated automatically per IC installation. **Not** portable between machines — that is the point.

```
Generation:
  1. dk_seed = CSPRNG(32 bytes)
  2. device_keypair = Ed25519::from_seed(dk_seed)
  3. Store dk_seed in CredentialStore (OS keyring preferred, same DEK as identity key)
  4. Generate Device Certificate:
     device_cert = Sign(IK_private, {
       dk_public_key: device_keypair.public,
       device_name: hostname(),
       created_at: now(),
       ik_fingerprint: SHA-256(IK.public)[0..8],
     })
```

**Device Certificate** proves this DK belongs to this IK — a relay or verifier can check the chain without contacting any server.

**OS-specific storage backends** (via `keyring` crate, same as CredentialStore Tier 1):

| Platform | Backend | Protection |
|----------|---------|------------|
| Windows | DPAPI (Credential Manager) | Tied to Windows user login session + machine key |
| macOS | Keychain | Tied to user login keychain, optional biometric |
| Linux (desktop) | Secret Service (GNOME Keyring / KDE Wallet) | Unlocked with user login password |
| Linux (headless) | Vault passphrase fallback (Tier 2) | Argon2id KDF from user-provided passphrase |
| WASM (browser) | IndexedDB + WebCrypto `extractable: false` | Browser-sandboxed, non-extractable key |
| Mobile | Hardware keystore (Android Keystore / iOS Secure Enclave) | Hardware-backed, biometric-gated |

**Device Key purpose in content protection:**
After a buyer decrypts premium content using their IK-derived wrapping key, the decrypted content is **re-encrypted to the Device Key** for local cache:

```
device_cache_key = HKDF-SHA256(
    ikm  = DK_private_seed,
    salt = content_id,
    info = "ic-device-cache-v1"
)

cached_content = AES-256-GCM(key=device_cache_key, plaintext=decrypted_content)
```

On subsequent launches, the client decrypts from the DK-bound cache — no IK private material needed. This means:
- Copying the cache to another machine produces undecryptable data (wrong DK)
- The IK only touches the key unwrapping operation, not ongoing use
- Losing IK access (e.g., locked device) does not prevent using already-cached content

### 6.4 Session Key (SK) — New

Ephemeral Ed25519 keypair generated fresh each launch. Never persisted.

```
Generation (every app launch):
  1. sk_keypair = Ed25519::generate(CSPRNG)
  2. session_cert = Sign(DK_private, {
       sk_public_key: sk_keypair.public,
       dk_fingerprint: SHA-256(DK.public)[0..8],
       created_at: now(),
       purpose: "session",
     })
  3. Hold sk_keypair in memory only (Zeroized<[u8; 64]>)
  4. On process exit: zeroize sk_keypair
```

**Session Key purpose in content protection:**
Multiplayer relay servers verify cosmetic entitlements via the SK→DK→IK certificate chain (see § 8). The relay never sees the IK private key — only the public chain:

```
SK.public → session_cert (signed by DK) → device_cert (signed by IK) → IK.public
```

A relay verifies the chain by checking two Ed25519 signatures — O(1), ~30µs total on modern hardware.

### 6.5 Key Hierarchy in BIP-39 Recovery

When a player recovers their identity from a 24-word mnemonic (D061):

```
Recovery flow:
  1. 24 words → PBKDF2-HMAC-SHA512 → Ed25519 seed → IK keypair (D061)
  2. IK.public key matches stored PurchaseRecords (player_key field in SCR envelope)
  3. All PurchaseRecords are re-verifiable (Ed25519 signature check)
  4. New Device Key generated for new machine
  5. Content keys re-unwrapped using recovered IK (X25519 DH + HKDF)
  6. Decrypted content re-cached under new DK
```

All purchases survive device loss. The mnemonic IS the backup.

---

## 7. Layer 5: Tardos Content Fingerprinting

### 7.1 Why Fingerprinting

Layers 1–4 prevent unauthorized access. Layer 5 addresses a different threat: **what happens when an authorized buyer decrypts content and redistributes the plaintext?**

Tardos fingerprinting codes embed an imperceptible, per-buyer watermark in the decrypted content. If the content leaks, forensic analysis of the leaked copy identifies which buyer(s) were the source — even if multiple buyers collude by combining their copies.

### 7.2 Tardos Code Construction

Tardos codes (2003) are the information-theoretically optimal collusion-resistant fingerprinting scheme. The construction:

```
Setup (by creator, once per content):
  1. Choose code length L (number of marking positions)
  2. For each position i ∈ [1..L]:
     p_i = sample from arcsine distribution on (0, 1)
     (Beta(0.5, 0.5) — biased toward 0 and 1)
  3. Store p_vector = [p_1, ..., p_L] as the master fingerprint config

Per-buyer fingerprint generation:
  1. For each position i ∈ [1..L]:
     c_i = Bernoulli(p_i)  // 1 with probability p_i, 0 otherwise
  2. buyer_fingerprint = [c_1, ..., c_L]
  3. Seed the PRNG with watermark_seed from PurchaseRecord
     (deterministic — same seed always produces same fingerprint)

Accusation (when leaked copy found):
  1. Extract marking values from leaked copy → observed = [o_1, ..., o_L]
  2. For each suspect buyer with fingerprint [c_1, ..., c_L]:
     score = Σ_i  g(o_i, c_i, p_i)
     where g(o, c, p) = {
       if o == c == 1: sqrt((1-p)/p)      // evidence for guilt
       if o == c == 0: sqrt(p/(1-p))      // evidence for guilt
       if o != c:     -sqrt(p/(1-p)) or -sqrt((1-p)/p)  // evidence for innocence
     }
  3. If score > threshold Z: accuse buyer
     Z = c_0 * sqrt(L)  where c_0 is the desired false-positive rate
```

**Collusion resistance:** With L marking positions, the scheme resists coalitions of up to ~√L colluders with negligible false positive rate. Specifically:

| Marking Positions (L) | Max Colluders (c) | Sufficient for |
|----------------------|-------------------|----------------|
| 128 | ~11 | Small art packs |
| 256 | ~16 | Medium content |
| 512 | ~22 | Large campaigns |
| 1,024 | ~32 | High-value packages |
| 1,400+ | ~37 | 32-frame sprite set (natural positions) |

### 7.3 Marking Positions in C&C Assets

C&C pixel art provides abundant natural marking positions — pixel-level changes that are imperceptible to human players:

| Technique | Description | Positions per Asset |
|-----------|-------------|-------------------|
| **Unused palette slots** | Assign similar colors to unused palette entries; swap which entry is used | 20–60 per sprite |
| **Shadow color aliasing** | Multiple near-identical shadow tones (e.g., #1a1a1a vs #1b1a1a) | 10–30 per frame |
| **Transparent boundary pixels** | Semi-transparent edge pixels can vary ±1 in alpha or color | 30–80 per frame |
| **Symmetry micro-breaks** | Vehicle sprites with axis symmetry: introduce ±1px asymmetry | 5–15 per facing |
| **Dithering pattern variation** | Multiple valid dithering patterns produce identical visual impression | 10–40 per frame |
| **Color channel LSB** | Flip least-significant bit of color channels in non-conspicuous areas | 50–200 per frame |

**Example — 32-facing vehicle sprite set:**
- 32 facings × ~8 frames each = ~256 frames
- ~5–6 positions per frame (conservative) = ~1,400 marking positions
- Resists ~37 colluders

### 7.4 Application at Decryption Time

Fingerprinting is applied during client-side decryption — the community server never sees the watermarked content (it only provides the `watermark_seed`):

```
Decryption + fingerprinting:
  1. Decrypt content (AES-256-GCM with unwrapped content_key)
  2. If purchase_flags.watermarked == 1:
     a. Initialize PRNG with watermark_seed (from PurchaseRecord)
     b. Generate buyer_fingerprint from Tardos code
     c. Apply marking at each position (palette swaps, LSB flips, etc.)
  3. Re-encrypt to Device Key cache
```

The watermarked version is what gets cached and used — the original decrypted content is never written to disk.

### 7.5 Forensic Analysis Tooling

Creators can detect leaks via `ic workshop fingerprint analyze`:

```
ic workshop fingerprint analyze leaked-art-pack/
    --master-config art-pack-fingerprint.yaml
    --suspects purchases.csv

# Output:
# Analyzing 256 frames, 1,387 marking positions...
# Suspect analysis:
#   player_3f7a2b91: score=+47.3 (threshold=32.1) → ACCUSED
#   player_e4d08c56: score=-12.8                    → cleared
#   player_91a2c3d4: score=+3.2                     → inconclusive
```

This tooling is forensic (after-the-fact) — it does not prevent redistribution, only identifies the source.

---

## 8. Multiplayer Session Attestation

### 8.1 Cosmetic Verification in Relay

When a player uses premium cosmetics in multiplayer, the relay server needs to verify entitlement without accessing the player's private keys or the decrypted content.

```
Client → Relay handshake (extended from D052 auth):
  1. Client sends: SK.public + session_cert + device_cert + IK.public
  2. Relay verifies chain:
     a. Verify session_cert: Ed25519_verify(DK.public, session_cert) ✓
     b. Verify device_cert: Ed25519_verify(IK.public, device_cert) ✓
     c. IK.public matches the player's known identity
  3. Client sends: list of premium content_ids in use
  4. For each content_id:
     Client sends PurchaseRecord SCR (full blob from local SQLite)
     Relay verifies: Ed25519_verify(community_server_key, scr_blob) ✓
  5. Relay marks player's cosmetic entitlements for this session
```

**Non-owners:** The relay knows which cosmetics each player is entitled to. For non-owners, the relay instructs all clients to render default fallback assets — no premium data is ever transmitted to unauthorized peers.

### 8.2 Performance

The entire attestation chain requires:
- 2 Ed25519 signature verifications (session_cert + device_cert): ~30µs
- N Ed25519 signature verifications (one per active PurchaseRecord): ~15µs each
- Typical case (1–3 cosmetic packs): <100µs total

This runs once during lobby join, not per-tick.

---

## 9. P2P Integration

### 9.1 Encrypted Content in P2P Swarms

Encrypted `.icpkg` files implement D049 § P2P distribution:

| Aspect | Free Content | Premium Content |
|--------|-------------|-----------------|
| Distribution | P2P + HTTP | P2P + HTTP (identical) |
| Integrity | SHA-256 on plaintext | SHA-256 on **ciphertext** |
| Piece hashing | BitTorrent v1/v2 | BitTorrent v1/v2 (on ciphertext) |
| Seeding | All peers | **All peers** (including non-buyers) |
| Access control | None | Client-side decryption (content_key via PurchaseRecord) |

Non-buyers can download and seed encrypted premium content — maximizing swarm health. They simply cannot decrypt it. This is the same model used by encrypted BitTorrent (BEP 40) and commercial P2P CDNs.

### 9.2 `.icpkg` Manifest Extension

The `.icpkg` binary header (defined in `research/p2p-engine-protocol-design.md`) gains two fields:

```
encrypted: bool         // true = content is AES-256-GCM encrypted
encryption_meta: {
    algorithm: "aes-256-gcm",
    content_id: [u8; 32],  // SHA-256 of original (pre-encryption) manifest
    nonce_strategy: "per-file",  // each file has its own nonce
}
```

The `content_id` in the manifest matches the `content_id` in PurchaseRecords — this is how the client locates the correct PurchaseRecord for decryption.

---

## 10. Federated Verification

### 10.1 Cross-Community Purchases

A player may buy content from a creator on Community Server A, then join a game on Community Server B. The relay on Community B needs to verify the PurchaseRecord issued by Community A.

**Verification is self-contained in the SCR:**
- The PurchaseRecord contains `community_key` (the issuing server's SK public key)
- Any verifier can check the Ed25519 signature directly — no need to contact Community A
- Trust question: does Community B trust Community A's signing authority?

**Trust model (extends D052 federation):**
- Each community server maintains a list of trusted community keys (same as the existing cross-community key exchange in D052)
- A PurchaseRecord from an untrusted community is treated as absent — player sees default fallback assets
- Community operators decide trust policy (accept-all, allowlist, reputation-based)

### 10.2 Revocation

If a purchase is refunded or a buyer is banned:

```
Revocation via existing SCR mechanism (record_type 0x04):
  1. Community server issues revocation SCR with:
     record_type: 0x04
     targeting: { record_type: 0x06, content_id: <id>, min_valid_sequence: <N+1> }
  2. Player's client receives revocation on next sync
  3. Client removes cached decrypted content
  4. PurchaseRecord with sequence < N+1 no longer validates

Soft revocation (optional, for stolen accounts):
  Content Advisory Record (D074) with:
    advisory_type: purchase_revoked
    target_player_key: <buyer_pk>
    target_content_id: <content_id>
    reason: "refund" | "chargeback" | "account_compromise"
```

Revocation is eventual — an offline buyer retains access until their client syncs. This is a conscious trade-off: offline-first means no phone-home requirement, which means revocation is best-effort for offline clients.

---

## 11. Threat Model

| Threat | Layer | Mitigation | Residual Risk |
|--------|-------|-----------|---------------|
| **Non-buyer downloads content** | 2 | Content encrypted; no content_key without PurchaseRecord | None (cryptographic) |
| **Buyer shares PurchaseRecord** | 3 | wrapped_key requires buyer's IK private material to unwrap | Buyer must share entire identity |
| **Buyer shares decrypted files** | 5 | Tardos fingerprint identifies source | Forensic (after-the-fact, not preventive) |
| **Buyer copies cache to another machine** | 4 | DK-bound re-encryption; wrong DK = undecryptable | Buyer could clone DK if they have OS keyring access on both machines |
| **Attacker forges PurchaseRecord** | 1 | Ed25519 signature verification; requires server's SK private key | SK compromise = full breach (mitigated by RK rotation) |
| **Colluding buyers combine watermarks** | 5 | Tardos codes resist √L colluders | Above the collusion threshold, identification degrades (probabilistic) |
| **Relay cosmetic spoofing** | 4 | SK→DK→IK chain verification | Relay must be trusted (compromised relay could lie) |
| **Memory dump during decryption** | — | `zeroize` crate clears keys from memory; short window | Kernel-level attacker can still capture (out of scope) |
| **Reverse-engineer decryption code** | — | Code is open-source; security is in the keys, not the algorithm | By design — no security through obscurity |
| **Server compromise (SK stolen)** | 1 | RK rotation (D052); newly issued PurchaseRecords with rotated SK; existing PurchaseRecords still valid under grace period | Time window between compromise and detection |

### 11.1 What This System Does NOT Prevent

**Honest limitations — be explicit:**

1. **DRM-free after decryption.** Once a buyer decrypts content, the plaintext exists in their local cache (DK-encrypted, but the DK is on the same machine). A technically sophisticated buyer with admin access to their own machine can extract the plaintext. This is a fundamental property of client-side decryption — it's the digital equivalent of "you can photocopy a book you bought." The Tardos fingerprint provides forensic tracing, not prevention.

2. **No phone-home.** An offline buyer retains access to all purchased content indefinitely. Revocation only takes effect on next sync. This is by design — offline-first is a non-negotiable constraint.

3. **Community server as trust anchor.** The community server's Signing Key is the root of trust for PurchaseRecords. A compromised server can issue fraudulent PurchaseRecords. Mitigation: Recovery Key rotation (D052), Content Advisory Records for cross-community warnings (D074).

4. **Watermark stripping.** If a buyer knows the marking positions (the master fingerprint config), they can strip the watermark. The master config is a secret held by the creator, but a sufficiently motivated attacker who obtains two differently-watermarked copies of the same content can diff them to locate marking positions. Tardos codes are collusion-*resistant*, not collusion-*proof*.

5. **Device Key cloning.** If a buyer has administrative access to two machines and can export OS keyring secrets, they can clone the DK. This is mitigated by the OS keyring's own access control (Windows DPAPI ties to the user profile, macOS Keychain requires password/biometric) but not prevented.

---

## 12. Implementation Plan

### 12.1 Component Breakdown

| Component | Crate | Lines (est.) | Phase |
|-----------|-------|-------------|-------|
| PurchaseRecord SCR type + SQLite table | `ic-net` (SCR codec) | ~200 | M7 (Phase 5) |
| Content encryption/decryption (AES-256-GCM) | Workshop infra | ~250 | M7 (Phase 5) |
| X25519+HKDF key wrapping/unwrapping | `ic-paths` (CredentialStore extension) | ~200 | M7 (Phase 5) |
| Device Key generation + certificate chain | `ic-paths` | ~250 | M7 (Phase 5) |
| Session Key + relay attestation | `ic-net` | ~160 | M7 (Phase 5) |
| Tardos fingerprint generation + application | Workshop infra (optional feature) | ~350 | M9 (Phase 6a) |
| Forensic analysis CLI (`ic workshop fingerprint`) | `ic-editor` CLI | ~250 | M9 (Phase 6a) |
| **Total** | | **~1,660** | |

### 12.2 Crate Dependencies

All MIT/Apache-2.0, compatible with GPL v3:

| Crate | Purpose | License | Already in IC? |
|-------|---------|---------|---------------|
| `aes-gcm` | AES-256-GCM encryption/decryption | MIT/Apache-2.0 | No (add) |
| `hkdf` | HKDF-SHA256 key derivation | MIT/Apache-2.0 | No (add) |
| `sha2` | SHA-256 hashing | MIT/Apache-2.0 | Yes (via existing deps) |
| `x25519-dalek` | X25519 Diffie-Hellman | BSD-3-Clause | No (add) |
| `ed25519-dalek` | Ed25519 signatures | BSD-3-Clause | Yes (D052) |
| `zeroize` | Secure memory clearing | MIT/Apache-2.0 | Yes (credential-protection) |
| `keyring` | OS credential store | MIT/Apache-2.0 | Yes (credential-protection) |
| `rand` | CSPRNG | MIT/Apache-2.0 | Yes |
| `argon2` | KDF for vault passphrase | MIT/Apache-2.0 | Yes (credential-protection) |

### 12.3 Phasing

**Phase 5 (M7) — Core Protection:**
- PurchaseRecord SCR type (Layer 1)
- AES-256-GCM content encryption (Layer 2)
- X25519+HKDF per-buyer key wrapping (Layer 3)
- Device Key + key hierarchy (Layer 4, partial — IK+DK)
- Session Key + relay attestation (Layer 4, complete)
- Basic purchase verification in Workshop client
- `ic workshop verify-purchase` CLI

**Phase 6a (M9) — Forensics & Hardening:**
- Tardos fingerprinting (Layer 5)
- Forensic analysis CLI
- Creator tools for fingerprint config generation
- Cross-community purchase verification in federation
- Purchase revocation flow

---

## 13. D035 Reconciliation

D035 states: "Monetization is never mandatory — **all Workshop resources are freely downloadable.**"

This statement requires clarification, not contradiction. The reconciled position:

1. **The free tier is fully functional.** All gameplay-affecting content (units, weapons, balance, maps) is freely available. A player who pays nothing can play every game mode, every multiplayer match, every mission. This is unchanged.

2. **"Freely downloadable" refers to the P2P distribution mechanism.** Anyone can download (and seed!) encrypted premium content via P2P. They cannot decrypt it without a PurchaseRecord. The content is freely *distributable* — but not freely *usable* in its premium form.

3. **Default fallback is always available.** Non-owners of premium cosmetics see default assets in multiplayer. The game never breaks, never requires purchase, never excludes anyone from gameplay. Premium is an opt-in visual upgrade.

4. **"Premium" means cosmetic-only** (D046 constraint). Art packs, soundtracks, campaigns (story content). Never: units, weapons, factions, balance-affecting gameplay.

5. **Tipping remains for non-premium content.** D035's tipping infrastructure is orthogonal to premium content. A creator can publish free content with a tip jar AND premium cosmetic packs — they serve different purposes.

---

## 14. Creator Payment Flow

IC never processes payments. The creator→buyer→server flow:

```
┌──────────┐          ┌──────────────┐         ┌──────────────────┐
│  Buyer   │  $$$     │   Creator    │  webhook │  Community       │
│          │────────→ │  (Stripe/    │────────→ │  Server          │
│          │          │   PayPal/    │          │                  │
│          │          │   Ko-fi)     │          │  Generates       │
│          │          └──────────────┘          │  PurchaseRecord  │
│          │                                    │  SCR + wrapped   │
│          │◄───────────────────────────────────│  key             │
│          │          PurchaseRecord delivery   │                  │
└──────────┘          (HTTPS or in-app)         └──────────────────┘
```

**Webhook integration:** Creator configures their payment processor to POST a webhook to their community server's purchase API endpoint. The webhook includes the buyer's player key (communicated during checkout — e.g., buyer copies their IC fingerprint into the checkout form, or IC generates a purchase link with an embedded player key).

**Manual fulfillment alternative:** For creators without webhook capability, a simple web form: creator enters buyer's IC fingerprint → server generates and delivers PurchaseRecord. This is the "Humble Store" model — manual but workable.

**IC's role:** Provide the cryptographic infrastructure (SCR generation, key wrapping, content encryption, verification). IC never sees money, never handles refunds, never takes a payment-processing cut. The `ic_project: 10` revenue split in D046's YAML schema is a *voluntary* contribution — not enforced by the platform.

---

## 15. WASM / Browser Considerations

On WASM targets (browser builds):

- **No OS keyring:** Device Key stored in IndexedDB with WebCrypto `CryptoKey { extractable: false }`. This provides browser-sandbox-level protection (JavaScript on the same origin can still access it, but other origins cannot).
- **No hardware keystore:** WASM has no access to TPM or secure enclave. Device Key binding is weaker on browser than native.
- **AES-256-GCM:** Available via SubtleCrypto API — no need for a Rust WASM implementation.
- **X25519:** Available via SubtleCrypto on modern browsers. Fallback to `x25519-dalek` compiled to WASM.
- **Ed25519:** SubtleCrypto support is recent (Chrome 113+, Firefox 128+). Fallback to `ed25519-dalek` compiled to WASM.
- **Tardos fingerprinting:** Runs client-side in WASM — same code, same fingerprints.

---

## 16. Prior Art

| System | Model | What IC Takes |
|--------|-------|--------------|
| **Factorio** | License key per-copy, verified online at purchase | Proven 10+ year model for indie games; activation-key concept adapted as PurchaseRecord |
| **Signal Protocol (X3DH)** | X25519+HKDF+AES-GCM key agreement | Key wrapping construction (Layer 3) |
| **Bandcamp** | Creator-set pricing, direct payment, DRM-free download | Creator independence philosophy; IC adds fingerprinting Bandcamp doesn't have |
| **Tardos (2003)** | Information-theoretically optimal fingerprinting codes | Layer 5 fingerprinting scheme |
| **Steam DRM** | Platform manages keys, always-online verification | Anti-pattern — IC avoids platform lock-in and always-online |
| **LBRY/Odysee** | Blockchain-based content access | Anti-pattern — UX disaster, LBRY bankrupt by 2024, blockchain unnecessary for this problem |

---

## 17. Open Questions

1. **Revenue split enforcement.** D046 specifies `ic_project: 10` — but if IC never processes payments, how is this enforced? Current answer: it's voluntary (honor system). Community servers could track sales volume via PurchaseRecord issuance counts and display it publicly for transparency, but cannot enforce the split. This matches the FOSS project donation model (voluntary, not mandatory).

2. **Refund flow.** Who handles refunds — the creator or the community server? Creator handles the money side (refund via Stripe/PayPal). Community server handles the cryptographic side (issue revocation SCR). These should be coupled via webhook but the failure mode (refund issued, revocation not) needs documented policy.

3. **Bulk licensing.** Game cafes, tournament organizers, educational institutions — do they get volume PurchaseRecords? Probably yes, via a `grant_type: bulk` flag, but the details are not designed here.

4. **Content versioning.** When a creator updates premium content (new version), do existing PurchaseRecords cover the update? The `content_version` field in the PurchaseRecord payload suggests version-specific purchases. Policy question: auto-grant updates (common) vs. require re-purchase (rare, for major overhauls).
