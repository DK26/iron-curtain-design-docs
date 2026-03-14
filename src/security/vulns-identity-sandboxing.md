## Vulnerability 43: WASM Network `AllowList` — DNS Rebinding & SSRF

### The Problem

**Severity: MEDIUM**

`NetworkAccess::AllowList(Vec<String>)` validates domain names at capability review time, not resolved IP addresses at request time. This enables DNS rebinding:

1. **Attack scenario:** A mod declares `AllowList` containing `assets.my-cool-mod.com`. During Workshop capability review, the domain resolves to `203.0.113.50` (a legitimate CDN). After approval, the attacker changes the DNS record to resolve to `127.0.0.1`. Now the approved mod can send HTTP requests to `localhost` — accessing local development servers, databases, or other services running on the player's machine.

2. **LAN scanning:** Rebinding to `192.168.1.x` allows the mod to probe the player's local network, mapping services and potentially exfiltrating data via the approved domain's callback URL.

3. **Cloud metadata SSRF:** On cloud-hosted game servers or relay instances, rebinding to `169.254.169.254` accesses the cloud provider's metadata service — potentially exposing IAM credentials, instance identity, and other sensitive data.

### Mitigation

**IP range blocking:** After DNS resolution, reject requests where the resolved IP falls in:
- `127.0.0.0/8` (loopback)
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918 private)
- `169.254.0.0/16` (link-local, cloud metadata)
- `::1`, `fc00::/7`, `fe80::/10` (IPv6 equivalents)

This check runs on every request, not just at capability review time.

**DNS pinning:** Resolve `AllowList` domains once at mod load time. Cache the resolved IP and use it for all subsequent requests during the session. This prevents mid-session DNS changes from affecting the allowed IP.

**Post-resolution validation:** The request pipeline is: domain → DNS resolve → IP range check → connect. Never connect before validating the resolved IP. Log all WASM network requests (domain, resolved IP, response status) for moderation review.

**Phase:** WASM network hardening ships with Tier 3 WASM modding (Phase 4). IP range blocking is a Phase 4 exit criterion.

## Vulnerability 44: Developer Mode Multiplayer Enforcement Gap

### The Problem

**Severity: LOW-MEDIUM**

`DeveloperMode` enables powerful cheats (instant build, free units, reveal map, unlimited power, invincibility, resource grants). The doc states "all players must agree to enable dev mode (prevents cheating)" but the enforcement mechanism is unspecified:

1. **Consensus mechanism:** How do players agree? Runtime vote? Lobby setting? What prevents one client from unilaterally enabling dev mode?
2. **Order distinction:** Dev mode operations are "special `PlayerOrder` variants" but it's unclear whether the sim can distinguish dev orders from normal orders and reject them when dev mode is inactive.
3. **Sim state:** Is `DeveloperMode` part of the deterministic sim state? If it's a client-side setting, different clients could disagree on whether dev mode is active — causing desyncs or enabling one player to cheat.

### Mitigation

**Dev mode as sim state:** `DeveloperMode` is a Bevy `Resource` in `ic-sim`, part of the deterministic sim state. All clients agree on whether dev mode is active because it's replicated through the normal sim state mechanism.

**Lobby-only toggle:** Dev mode is enabled exclusively via lobby settings before game start. It cannot be toggled mid-game in multiplayer. Toggling requires unanimous lobby consent — any player can veto. In single-player and replays, dev mode can be toggled freely.

**Distinct order category:** Dev mode operations use a `PlayerOrder::DevCommand(DevAction)` variant that is categorically distinct from gameplay orders. The order validation system (V2/D012) rejects `DevCommand` orders if the sim's `DeveloperMode` resource is not active. This is checked in the order validation system, not at the UI layer.

**Ranked exclusion:** Games with dev mode enabled cannot be submitted for ranked matchmaking (D055). Replays record the dev mode flag so spectators and tournament officials can see if cheats were used.

**Dev mode toggle recording (F18 closure):** Dev mode toggles mid-game — possible in single-player — must be recorded as `PlayerOrder::DevCommand(DevAction::ToggleDevMode)` in the replay order stream, not just a per-match header flag. If dev mode is toggled mid-game, the per-match flag doesn't capture the toggling pattern. The replay viewer displays a visible indicator (e.g., "DEV" badge) whenever dev mode is active during playback, so viewers understand why instant builds or free units appear.

**Phase:** Dev mode enforcement ships with multiplayer (Phase 5). Ranked exclusion is automatic via the ranked matchmaking system.

## Vulnerability 45: Background Replay Writer Silent Frame Loss

### The Problem

**Severity: LOW**

`BackgroundReplayWriter::record_tick()` uses `let _ = self.queue.try_send(frame)` — the send result is explicitly discarded with `let _ =`. The code comment states frames are "still in memory (not dropped)" but this is incorrect: `crossbeam::channel::Sender::try_send()` on a bounded channel returns `Err(TrySendError::Full(frame))` when the channel is full, meaning the frame IS dropped.

If the background writer thread falls behind (disk I/O spike, system memory pressure, antivirus scan), frames are silently lost. The consequences:

1. **Broken signature chain:** The relay-signed tick hash chain (`TickSignature` in `formats/save-replay-formats.md`) links each signed boundary's signature to the previous signed boundary's hash. If a signing-cadence tick's frame is lost, the chain has a gap — the replay appears complete but fails cryptographic verification.

2. **Silent data loss:** No log message, no metric, no metadata flag indicates frames were lost. The replay file looks valid but is missing data.

3. **Replay verification failure:** A replay with lost frames cannot be used for ranked match verification, tournament archival, or desync diagnosis — precisely the scenarios where replay integrity matters most.

### Mitigation

**Frame loss tracking:** `BackgroundReplayWriter` maintains a `lost_frame_count: AtomicU32` counter. When `send_timeout` expires, the counter increments. The final replay header records the total lost frame count. Playback tools display a warning: "This replay has N missing frames."

**`send_timeout` instead of `try_send`:** Replace `try_send` with `send_timeout(frame, Duration::from_millis(5))`. This gives the writer a brief window to drain the channel during I/O spikes without blocking the sim thread for perceptible time. 5 ms is well within the 67 ms tick budget (Slower default).

**Incomplete replay marking:** If any frames are lost, the replay header's `INCOMPLETE` flag (bit 4) is set and `lost_frame_count` records the total. Incomplete replays are playable up to the last recorded frame — playback simply ends early when the order stream is exhausted. They cannot be submitted for ranked verification or used as evidence in anti-cheat disputes.

**Signature chain gap handling:** The hash chain must account for frame gaps explicitly. Each `TickSignature` carries a `skipped_ticks: u32` field (0 when contiguous). When frames are lost, the next signature includes the gap count: `hash(prev_sig_hash, skipped_ticks, tick, state_hash)`. The relay co-signs `(skipped_ticks, tick, state_hash, prev_sig_hash)`. Verifiers reconstruct the chain by incorporating `skipped_ticks` into the hash — gaps are accounted for rather than treated as tampering. See `formats/save-replay-formats.md` § TickSignature for the schema.

**Phase:** Replay writer hardening ships with replay system (Phase 2). Frame loss tracking is a Phase 2 exit criterion.

## Vulnerability 46: Player Display Name Unicode Confusable Impersonation

### The Problem

**Severity: HIGH**

Players can create display names using Unicode homoglyphs (e.g., Cyrillic "а" U+0430 vs Latin "a" U+0061) to visually impersonate other players, admins, or system accounts. This enables social engineering in lobbies, chat, and tournament contexts. Combined with RTL override characters (U+202E), names can appear reversed or misleadingly reordered.

### Mitigation

**Confusable detection:** All display names are checked against the Unicode Confusable Mappings (UTS #39 skeleton algorithm). Two names that produce the same skeleton are considered confusable. The second registration is rejected or flagged.

**Mixed-script restriction:** Display names must use characters from a single Unicode script family (Latin, Cyrillic, CJK, Arabic, etc.) plus Common/Inherited. Mixed-script names (e.g., Latin + Cyrillic) are rejected unless they match a curated allow-list of legitimate mixed-script patterns.

**Dangerous codepoint stripping:** The following categories are stripped from display names before storage:
- BiDi override characters (U+202A–U+202E, U+2066–U+2069)
- Zero-width joiners/non-joiners outside approved script contexts
- Tag characters (U+E0001–U+E007F)
- Invisible formatting characters (U+200B–U+200F, U+FEFF)

**Visual similarity scoring:** When a player joins a lobby, their display name is compared against all current participants. If any pair of names has a confusable skeleton match, a warning icon appears next to the newer name and the lobby host is notified.

**Cross-reference:** RTL/BiDi text sanitization rules in D059 (09g-interaction.md) apply to display names. The sanitization pipeline from the RTL/BiDi QA corpus (rtl-bidi-qa-corpus.md) categories E and F provides regression vectors.

**Phase:** Display name validation ships with account/identity system (Phase 3). UTS #39 skeleton check is a Phase 3 exit criterion.

## Vulnerability 47: Player Identity Key Rotation Absence

### The Problem

**Severity: HIGH**

The Ed25519 identity system (BIP-39 mnemonic + SCR signed credentials) has no mechanism for key rotation. If a player's private key is compromised, there is no way to migrate their identity — match history, ranked standing, friend relationships — to a new key pair. The player must create an entirely new identity, losing all progression.

### Mitigation

**Rotation protocol:** A player can generate a new Ed25519 key pair and create a `KeyRotation` message signed by both the old and new private keys. This message is broadcast to relay servers and recorded in a key-history chain.

```rust
pub struct KeyRotation {
    pub old_public_key: Ed25519PublicKey,
    pub new_public_key: Ed25519PublicKey,
    pub rotation_timestamp: i64,
    pub reason: KeyRotationReason, // compromised / scheduled / device_change
    pub old_key_signature: Ed25519Signature, // signs (new_pubkey, timestamp, reason)
    pub new_key_signature: Ed25519Signature, // signs (old_pubkey, timestamp, reason)
}
```

**Grace period:** After rotation, the old key remains valid for authentication for 72 hours (configurable by server policy). This allows in-progress sessions to complete and gives federated servers time to propagate the rotation.

**Revocation list:** Relay servers maintain a revocation list of old public keys. After the grace period, authentication attempts with revoked keys are rejected with a message directing the player to recover via their BIP-39 mnemonic.

**Emergency revocation:** If a player suspects compromise, they can issue an emergency rotation using their BIP-39 mnemonic to derive a recovery key. Emergency rotations take effect immediately with no grace period.

**Rotation race condition defense (F3 closure):** If the old key is compromised, both the attacker and legitimate user can simultaneously issue valid `KeyRotation` messages (both signed by the old key + their own new key). This TOCTOU window requires explicit conflict resolution:

1. **Monotonic `rotation_sequence_number`:** Every `KeyRotation` includes a monotonically increasing sequence number. Community servers accept only the **first valid rotation** for a given sequence number. Subsequent conflicting rotations for the same old key are rejected.
2. **24-hour cooldown:** Non-emergency rotations have a 24-hour cooldown between operations for the same identity key. This limits the attacker's ability to race the legitimate user.
3. **Emergency rotation always wins:** BIP-39 mnemonic-derived emergency rotations bypass the cooldown and take priority over standard rotations. If both a standard and emergency rotation arrive, the emergency rotation wins regardless of arrival order.
4. **Conflict resolution rule:** "First valid rotation seen by the community authority wins; subsequent conflicting rotations for the same old key are rejected." If a race is detected (two rotations within the same cooldown window), the identity is frozen and requires BIP-39 emergency recovery.

```rust
pub struct KeyRotation {
    pub old_public_key: Ed25519PublicKey,
    pub new_public_key: Ed25519PublicKey,
    pub rotation_timestamp: i64,
    pub rotation_sequence_number: u64,    // monotonically increasing
    pub reason: KeyRotationReason,
    pub old_key_signature: Ed25519Signature,
    pub new_key_signature: Ed25519Signature,
}

pub enum KeyRotationReason {
    Compromised,
    Scheduled,
    DeviceChange,
    Emergency { mnemonic_proof: BIP39Proof },  // bypasses cooldown
}
```

**Phase:** Key rotation protocol ships with ranked matchmaking (Phase 5). Emergency revocation is a Phase 5 exit criterion.

## Vulnerability 48: Community Server Key Revocation Gap

### The Problem

**Severity: HIGH**

Community servers authenticate via Ed25519 key pairs (D052), but what happens when a community server's Signing Key (SK) is compromised and the operator is slow to respond? The attacker can impersonate the server, forge SCRs, and manipulate match results until the operator performs an RK-signed emergency rotation.

### Mitigation

**Canonical trust model: TOFU + SK/RK two-key hierarchy (D052).** IC uses an SSH/PGP-style trust model — not a TLS-style certificate authority. There is no central federation authority, no CRL, and no OCSP infrastructure. Community servers are self-sovereign: they generate their own key pairs and clients trust them on first use (TOFU). This is an explicit architectural choice — see `D052-keys-operations-integration.md` § Key Expiry Policy for the rationale.

**Defense layers within the TOFU model:**

1. **RK emergency rotation (primary mechanism, D052):** The operator revokes the compromised SK via the offline Recovery Key: `ic community emergency-rotate --recovery-key <rk>`. Clients that receive the RK-signed rotation record immediately reject the old SK with zero grace period. The attacker has the SK but not the RK — they cannot forge rotation records.

2. **SCR expiry bounds the blast radius:** Rating SCRs expire in 7 days (default `expires_at`). A compromised server can forge ratings for at most one week before they go stale. Match/achievement SCRs with `expires_at: never` signed during the compromise window are flagged as "potentially compromised" per D052's recovery flow (⚠️ in UI for SCRs signed by the old key after the `effective_at` timestamp).

3. **Client TOFU rejection protects existing members:** Clients cache the community's SK public key on first join. If an attacker stands up a server using the stolen SK with a different endpoint, existing members' clients will connect to the real server URL (pinned at join). If the attacker hijacks the real endpoint, they present the same cached key — this is one scenario TOFU cannot defend against, but the RK rotation terminates it.

4. **Seed list curation (social-layer defense):** The `iron-curtain/community-servers` repository (D074) can delist compromised communities. This is not cryptographic revocation — it is community-level advisory. New players won't discover the compromised server; existing members receive a warning on next seed list sync.

5. **Client-side trust removal (D053):** Players who suspect compromise remove the community from their trusted list. The community appears as ⚠️ Untrusted in other players' profiles.

**Connection policy when key state is ambiguous:**

| Scenario                              | Ranked                            | Unranked               | LAN / private |
| ------------------------------------- | --------------------------------- | ---------------------- | ------------- |
| Key matches cached TOFU key           | Proceed                           | Proceed                | Proceed       |
| Key mismatch, valid rotation chain    | Proceed (update cache)            | Proceed (update cache) | Proceed       |
| Key mismatch, no valid rotation chain | Reject                            | Reject + warn          | Warn only     |
| First connection (no cached key)      | Require seed list or manual trust | TOFU accept + warn     | TOFU accept   |
| Community delisted from seed list     | Reject                            | Warn                   | N/A           |

For ranked play, first connections to a community require the server to be present in a trusted seed list OR the player to have manually verified the key fingerprint (SSH `known_hosts` model). This prevents a smurf from standing up a fake "community" to farm ranked results.

**Residual risk:** If the operator loses both the SK AND the RK, the community is dead — no recovery is possible. This is intentional: it prevents key selling and ensures operators take backup seriously. The mnemonic seed recovery path (D061) applies to player keys, not community keys — community keys use file-based backup (`ic community export-signing-key`) and offline RK storage.

**What this model does NOT provide:**
- Third-party revocation ("someone reported community X is compromised") — only the RK holder can revoke. This matches PGP.
- Centralized trust infrastructure — no CA, no CRL, no OCSP. The tradeoff is that compromise propagation depends on operator responsiveness. This is acceptable for IC's target audience (hobbyist operators who are already reachable via Discord/email/their website).
- Key expiry — community keys do not expire. Voluntary rotation is nudged via server warnings (12 months) and client indicators (24 months). See D052 § Key Expiry Policy.

**Phase:** Community server key revocation ships with the community server (Phase 5, per D074). RK emergency rotation is a Phase 5 exit criterion — ranked play requires recoverable server keys from initial deployment.

## Vulnerability 49: Workshop Package Author Signing Absence

### The Problem

**Severity: HIGH**

Workshop packages (D030) use SHA-256 content digests and Ed25519 metadata signatures, but these signatures are applied by the Workshop registry infrastructure, not by the package author. This means the registry is a single point of trust — a compromised registry can serve modified packages that pass all verification checks. Authors cannot independently prove package authenticity.

### Mitigation

**Author-level Ed25519 signing:** Package authors sign their package manifest with their personal Ed25519 key before uploading. The registry stores the author signature alongside its own infrastructure signature, creating a two-layer trust model.

```rust
pub struct PackageManifest {
    pub package_id: WorkshopPackageId,
    pub version: SemVer,
    pub content_digest: Sha256Digest,
    pub author_public_key: Ed25519PublicKey,
    pub author_signature: Ed25519Signature,     // author signs (package_id, version, content_digest)
    pub registry_signature: Ed25519Signature,   // registry counter-signs the above
    pub registry_timestamp: i64,
}
```

**Verification chain:** Clients verify both signatures. If the author signature is invalid, the package is rejected regardless of registry signature validity. This ensures even a compromised registry cannot forge author intent.

**Key pinning:** After a user installs a package, the author's public key is pinned. Future updates must be signed by the same key (or a rotated key via V47's rotation protocol). Key changes without proper rotation trigger a warning.

**Phase:** Author signing ships with Workshop package verification (M8/M9). Author signature verification is an M8 exit criterion; key pinning is M9.

## Vulnerability 50: WASM Inter-Module Communication Isolation

### The Problem

**Severity: MEDIUM**

The tiered modding system (Invariant #3) sandboxes individual WASM modules, but the design does not specify isolation boundaries for inter-module communication. A malicious WASM mod could probe or manipulate another mod's state through shared host-provided resources (e.g., shared ECS queries, event buses, or resource pools).

### Mitigation

**Module namespace isolation:** Each WASM module operates in its own namespace. Host-provided imports (`ic_query_*`, `ic_spawn_*`, `ic_format_*`) are scoped to the calling module's declared capabilities. A module cannot query entities or components registered by another module unless the target module explicitly exports them.

**Capability-gated cross-module calls:** Cross-module communication is only possible through a host-mediated message-passing API. Modules declare `exports` and `imports` in their manifest. The host validates that import/export pairs match before linking.

```rust
// In mod manifest (mod.toml)
// exports = ["custom_unit_stats"]
// imports = ["base_game.terrain_query"]
```

**Resource pool isolation:** Each module gets its own memory allocation pool. Host-imposed limits (memory, CPU ticks, entity count) are per-module, not shared. A module exhausting its allocation cannot starve other modules.

**Audit logging:** All cross-module calls are logged with caller/callee module IDs, capability tokens, and call arguments. Suspicious patterns (high-frequency probing, unauthorized access attempts) trigger rate limiting and are reported to the anti-cheat system.

**Phase:** WASM inter-module isolation ships with WASM modding tier (Phase 6). Namespace isolation is a Phase 6 exit criterion.

## Vulnerability 51: Workshop Package Quarantine for Popular Packages

### The Problem

**Severity: MEDIUM**

Popular Workshop packages (high download count, many dependents) are high-value targets for supply-chain attacks. If an author's key is compromised or an author turns malicious, a single update can affect thousands of players. The current design has no mechanism to delay or review updates to widely-deployed packages.

### Mitigation

**Popularity threshold quarantine:** Packages exceeding a subscriber threshold (configurable, default: 1000 subscribers) enter a quarantine zone for updates. New versions are held for a review period (default: 24 hours) before automatic distribution.

**Diff-based review signal:** During quarantine, the registry computes a structural diff between the old and new version. Large changes (>50% of files modified, new WASM modules added, new capabilities requested) extend the quarantine period and flag the update for manual review by Workshop moderators.

**Rollback capability:** If a quarantined update is found to be malicious or broken, the registry can issue a rollback directive. Clients that already installed the update receive a forced downgrade notification.

**Author notification:** Authors of popular packages are notified that their updates are subject to quarantine. The quarantine period can be reduced (to a minimum of 1 hour) for authors with a strong track record (no prior incidents, account age >6 months, 2FA enabled).

**Cross-reference:** WREG-006 (star-jacking / reputation gaming) — artificially inflating subscriber counts to avoid or trigger quarantine thresholds is itself a sanctionable offense.

**Phase:** Package quarantine ships with Workshop moderation tools (M9). Quarantine pipeline is an M9 exit criterion.

## Vulnerability 52: Star-Jacking and Workshop Reputation Gaming (WREG-006)

### The Problem

**Severity: MEDIUM**

Workshop reputation systems (ratings, subscriber counts, featured placement) are vulnerable to manipulation. Techniques include: sock-puppet accounts inflating ratings, fork-bombing (cloning popular packages with minor changes to dilute search results), and subscriber count inflation via automated installs from throwaway accounts.

### Mitigation

**Rate limiting:** Accounts created within 24 hours cannot rate or subscribe to packages. Accounts must have at least 1 hour of verified gameplay before Workshop interactions are counted.

**Anomaly detection:** Statistical analysis of rating/subscription patterns. Sudden spikes (>10x normal rate) trigger a hold on the package's reputation score pending review. Coordinated actions from accounts with correlated metadata (IP ranges, creation timestamps, user-agent patterns) are flagged.

**Fork detection:** Package uploads are compared against existing packages using structural similarity (file tree diff, asset hash overlap). Packages with >80% overlap with an existing package are flagged as potential forks and require author justification.

**Reputation decay:** Inactive accounts' ratings decay over time (weight halving every 6 months). This prevents abandoned sock-puppet networks from permanently inflating scores.

**Phase:** Reputation gaming defenses ship with Workshop moderation tools (M9). Anomaly detection is an M9 exit criterion.
