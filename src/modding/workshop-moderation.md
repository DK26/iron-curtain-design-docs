#### Moderation & Publisher Trust (D030)

> **Parent page:** [Workshop](workshop.md)

Workshop moderation is **tooling-enabled, policy-configurable**. The engine provides moderation infrastructure; each deployment (official IC server, community servers) defines its own policies.

**Publisher trust tiers:**

| Tier           | Requirements                                                                                  | Privileges                                                                 |
| -------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Unverified** | Account created                                                                               | Can publish to `dev` channel only (local testing)                          |
| **Verified**   | Email confirmed                                                                               | Can publish to `beta` and `release` channels. Subject to moderation queue. |
| **Trusted**    | N successful publishes (configurable, default 5), no policy violations, account age > 30 days | Updates auto-approved. New resources still moderation-queued.              |
| **Featured**   | Editor's pick / staff selection                                                               | Highlighted in browse UI, eligible for "Mod of the Week"                   |

Trust tiers are tracked per-server. A publisher who is Trusted on the official server starts as Verified on a community server — trust doesn't federate automatically (a community decision, not an engine constraint). However, **negative reputation federates asymmetrically**: revocation records (DMCA takedowns, malware findings, policy violations) propagate across federated servers, while positive trust (Trusted/Featured status) remains local. This is the principle that negative signals are safety-critical and must propagate, while positive signals are community-specific and should not.

**Revocation propagation:** When a Workshop server revokes a resource (due to DMCA takedown, malware detection, or moderation action), it creates a `RevocationRecord` containing the info hash, reason, timestamp, and the revoking server's Ed25519 signature. This record propagates to federated servers during their next sync cycle. Upon receiving a revocation record, each federated server independently decides whether to honor it based on its trust configuration for the originating server. The `p2p-distribute` crate's `RevocationPolicy` trait enforces the decision at the protocol layer — revoked packages are stopped, de-announced, and blocked from re-download. See `research/p2p-distribute-crate-design.md` § 2.7 for crate-level revocation mechanics.

**Reconciliation loops:** The Workshop client and server use explicit periodic reconciliation — an "observe → diff → act" pattern — rather than relying solely on user-triggered actions. This ensures revocations, dependency changes, and cache pressure are handled even when the player is not actively managing mods.

*Client-side content reconciliation* (every 5 minutes, configurable):
```
desired = resolve(manifest.yaml + ic.lock)
actual  = scan(local_cache)
missing = desired - actual
revoked = actual ∩ revocation_list

for pkg in missing:  download(pkg)         # P2P preferred
for pkg in revoked:  quarantine(pkg)       # stop seeding, move to quarantine
if cache_pressure:   evict(lru_packages)   # free space via LRU
```

*Server-side federation trust reconciliation* (every 10 minutes):
```
desired = trust_anchors consensus + incoming CARs
actual  = local trust state
for server in diff.newly_revoked:  stop_federation(server)
for content in diff.newly_revoked: quarantine(content)
```

*Server health self-reconciliation* (every 30 seconds): If an enabled capability (D074) crashes due to a transient error (I/O failure, network timeout), the reconciliation loop restarts it without operator intervention. This is the self-healing property that prevents a single subsystem crash from requiring a full server restart.

Benefits: revoked packages are quarantined even if the player doesn't manually check for updates; missing dependencies are detected before the player joins a game (no surprise "downloading mods" delay in lobby); cache pressure is managed continuously; degraded server capabilities auto-recover. Phase 4 (client content reconciliation), Phase 5 (federation + server health reconciliation). See `research/cloud-native-lessons-for-ic-platform.md` § 6 for the K8s controller pattern rationale.

**Moderation rules engine (Phase 5+):**

The Workshop server supports configurable moderation rules — YAML-defined automation that runs on every publish event. Inspired by mod.io's rules engine but exposed as user-configurable server policy, not proprietary SaaS logic.

```yaml
# workshop-server.yaml — moderation rules
moderation:
  rules:
    - name: "hold-new-publishers"
      condition: "publisher.trust_tier == 'verified' AND resource.is_new"
      action: queue_for_review
    - name: "auto-approve-trusted-updates"
      condition: "publisher.trust_tier == 'trusted' AND resource.is_update"
      action: auto_approve
    - name: "flag-large-packages"
      condition: "resource.size > 500_000_000"  # > 500MB
      action: queue_for_review
      reason: "Package exceeds 500MB — manual review required"
    - name: "reject-missing-license"
      condition: "resource.license == null"
      action: reject
      reason: "License field is required"
```

Community server operators define their own rules. The official IC server ships with sensible defaults. Rules are structural (file format, size, metadata completeness) — not content-based creative judgment.

**Community reporting:** Report button on every resource in the Workshop browser. Report categories: license violation, malware, DMCA, policy violation. Reports go to a moderator queue. DMCA with due process per D030. Publisher notified and can appeal.
