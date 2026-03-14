### Federated Content Moderation — Signed Advisories

> **Parent page:** [D074 — Community Server](../D074-community-server-bundle.md)

IC's existing design covers content safety at the single-server level (WASM sandbox, supply chain defense, publisher trust tiers, DMCA process — see 06-SECURITY.md and D030). The gap is **cross-community coordination**: a publisher banned on one community has no automatic sanctions on another. The federated model deliberately avoids a central authority, but needs a mechanism for communities to share moderation signals.

Study of how other platforms handle this (see `research/federated-content-moderation-analysis.md`):
- **Mastodon/Fediverse:** shared blocklists with consensus thresholds ("Garden Fence" — a domain must be blocked by N of M reference servers). Each instance chooses its trust anchors.
- **Minecraft (fractureiser incident):** account compromise propagated malware via auto-updates. Community-organized investigation was faster than platform response. Neither CurseForge nor Modrinth mandated author code signing afterward.
- **npm/crates.io:** Sigstore provenance attestations, transparency logs, 7–14 day quarantine catches most malicious packages.
- **Steam Workshop:** minimal moderation, no sandboxing — account compromises propagate malware instantly. IC's sandbox architecture is already far ahead.

#### Content Advisory Records (CARs)

> **Full protocol specification:** For the byte-level CAR binary envelope, CBOR payload format, inter-server sync protocol, client-side aggregation algorithm, revocation/supersession semantics, key rotation/compromise recovery, and SQLite storage schema, see `research/content-advisory-protocol-design.md`.

Community servers sign advisories about Workshop content using their Ed25519 key (same infrastructure as D052's Signed Credential Records):

```yaml
# Signed by: Wolfpack Community (ed25519:a1d4...e8f2)
type: content_advisory
resource: "coolmodder/awesome-tanks@2.1.0"
action: block              # block | warn | endorse
category: malware           # malware | policy_violation | dmca | quality | abandoned
reason: "WASM module requests network access not present in v2.0.0; exfiltrates player data"
evidence_hash: "sha256:7f3a..."
timestamp: 2026-03-15T14:00:00Z
sequence: 42
```

CAR properties:
- **Signed and attributable** — verifiable Ed25519 signature from a known community server
- **Scoped to specific versions** — `publisher/package@version`, not blanket bans on a publisher
- **Action levels** — `block` (refuse to install/seed), `warn` (display advisory, user decides), `endorse` (positive trust signal)
- **Monotonic sequence numbers** — prevents replay attacks, same pattern as D052 SCRs

#### Consensus-Based Trust (the "Garden Fence")

The game client aggregates CARs from all communities the player is connected to. Configurable trust policy in `settings.toml`:

```toml
[content_trust]
# How many community servers must flag content before auto-blocking?
block_threshold = 2          # Block if 2+ trusted communities issue "block" CARs
warn_threshold = 1           # Warn if 1+ trusted community issues "warn" CAR

# Which communities does this player trust for advisories?
# "subscribed" = all communities the player has joined
# "verified" = only communities marked verified in the seed list
advisory_sources = "subscribed"

# Allow overriding advisories for specific packages? (power users)
allow_override = false
```

Default behavior: if 2+ of the player's subscribed communities flag a package as `block`, it is blocked. If 1+ flags it as `warn`, a warning is displayed but the player can proceed. Players who want stricter or looser policies adjust thresholds.

#### Tracker-Level Enforcement

Community servers with the Workshop capability enforce advisories at the P2P layer:
- **Refuse to seed** blocklisted content — the tracker drops the info hash, the seeder stops serving pieces
- **Propagate advisories to peers** — clients connected to a community's Workshop receive its CARs as part of the metadata sync
- This is the BitTorrent-layer equivalent of Mastodon's defederation — content becomes unavailable through that community's infrastructure

#### Advisory Sync Between Community Servers

Community servers can subscribe to each other's advisory feeds (opt-in):

```toml
[moderation]
# Subscribe to advisories from other communities
advisory_subscriptions = [
    "ed25519:7f3a...b2c1",   # IC Official
    "ed25519:c3b7...9a12",   # Competitive League
]

# Auto-apply advisories from subscribed sources?
auto_apply_block = false      # false = queue for local moderator review
auto_apply_warn = true        # true = auto-apply warn advisories
```

Small communities without dedicated moderators can subscribe to the official community's advisory feed and auto-apply warnings, while queuing blocks for local review. Large communities make independent decisions.

#### No Silent Auto-Updates

Unlike Steam Workshop, IC never silently updates installed content:
- `ic.lock` pins exact versions + SHA-256 checksums
- `ic mod update --review` shows a diff before applying
- `ic mod rollback [resource] [version]` for instant reversion
- A compromised publisher account cannot push malware to existing installs — users must explicitly update

This is the single most important defense against the fractureiser-class attack (compromised author account pushes malicious update that auto-propagates to all users).

#### Quarantine-Before-Release

Configurable per Workshop server:

```toml
[workshop.moderation]
# Hold new publications for review before making them available?
quarantine_new_publishers = true     # First-time publishers: always hold
quarantine_new_resources = true      # New resources from any publisher: hold
quarantine_updates = false           # Updates from trusted publishers: auto-release
quarantine_duration_hours = 24       # How long to hold before auto-release (0 = manual only)
```

The official Workshop server holds new publishers' first submissions for 24 hours. Community servers set their own policies. This catches the majority of malicious uploads (npm data shows 7–14 day quarantine catches most attacks).

#### Player-Facing Workshop Safety: "Cannot Get It Wrong"

The guiding principle for Workshop UX is not "warn the player" — it is **design the system so the player cannot make a dangerous mistake with default settings**. Warnings are a failure of design. If the system needs a warning, the default should be changed so the warning is unnecessary.

**Layer 1 — Sandbox makes content structurally harmless.** Every Workshop resource runs inside IC's capability sandbox (D005 WASM, D004 Lua limits, D003 YAML schema validation). A mod cannot access the filesystem, network, or any OS resource unless its manifest declares the capability AND the sandbox grants it. With default settings, no Workshop content can:
- Read or write files outside its declared data directory
- Open network connections
- Execute native code
- Access other mods' data without declared dependency
- Modify engine internals outside its declared trait hooks

This is not a policy — it is an architectural constraint enforced by the WASM sandbox. A player who installs the most malicious mod imaginable, with default settings, gets a mod that can at worst misbehave within its own gameplay scope (e.g., spawn too many units, play loud sounds). It cannot steal credentials, install malware, or exfiltrate data.

**Layer 2 — Defaults are maximally restrictive, not maximally permissive.**

| Setting                            | Default | Effect                                              |
| ---------------------------------- | ------- | --------------------------------------------------- |
| `content_trust.block_threshold`    | `2`     | Content blocked by 2+ communities is auto-blocked   |
| `content_trust.warn_threshold`     | `1`     | Content flagged by 1+ community shows advisory      |
| `content_trust.allow_override`     | `false` | Player cannot bypass blocks without changing config |
| `workshop.auto_update`             | `false` | Updates never install silently                      |
| `workshop.allow_untrusted_sources` | `false` | Only configured Workshop sources are accepted       |
| `workshop.max_download_size_mb`    | `100`   | Downloads exceeding 100 MB require confirmation     |

A player who never touches settings gets the safest possible experience. Every relaxation is an explicit opt-in that requires editing config or using `--allow-*` CLI flags.

**Layer 3 — No permission fatigue.** Because the sandbox makes content structurally safe (Layer 1), IC does **not** prompt the player with capability permission dialogs on every install. There is no "This mod wants to access your files — Allow / Deny?" because mods cannot access files regardless of what the player clicks. The only prompts are:
- **Size confirmation** — downloads over the configured threshold (D030)
- **Unknown source** — content from a Workshop source the player hasn't configured (D052)
- **Active advisory** — content with a `warn`-level CAR from a trusted community

Three prompts, each actionable, each rare. No dialog boxes that train players to click "OK" without reading.

**Layer 4 — Transparency without burden.** Information is available but never blocking:
- **Trust badges** on Workshop listings (Verified, Prolific, Foundation, Curator — D030) let players make informed choices at browse time, not install time
- **Capability manifest** displayed on the Workshop listing page shows what the mod declares (e.g., "Uses: custom UI panels, audio playback, network — lobby chat integration"). This is informational, not a permission request — the sandbox enforces limits regardless
- **Advisory history** visible on the resource page: which communities have endorsed or warned about this content, and why
- **`ic mod audit`** available for power users who want full dependency tree + license + advisory analysis — never required for normal use

**Layer 5 — Recovery is trivial.** If something does go wrong:
- `ic mod rollback [resource] [version]` — instant reversion to any previous version
- `ic mod disable [resource]` — immediately deactivates without uninstalling
- `ic content verify` — checks all installed content against checksums
- `ic content repair` — re-fetches corrupted or tampered content
- Deactivated content is inert — zero CPU, zero filesystem access, zero network

**The test:** A non-technical player who clicks "Install" on every Workshop resource they see, never reads a description, never changes a setting, and never runs a CLI command should be **exactly as safe** as a security-conscious power user. The difference between the two players is not safety — it is choice (the power user can relax restrictions for specific trusted content). Safety is not a skill check.

#### Relationship to Existing Moderation Design

CARs are specifically for **Workshop content** (packages, mods, maps). They complement but do not replace:
- **D052's Overwatch-style review** — for player behavior (cheating, griefing, harassment)
- **D030's publisher trust tiers** — for publisher reputation within a single Workshop server
- **06-SECURITY.md's supply chain defense** — for technical content integrity (checksums, anomaly detection, provenance)

CARs add the missing **cross-community coordination layer** — the mechanism for communities to share trust signals about content.
