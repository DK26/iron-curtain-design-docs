### Content Channels — IC Integration

> **Parent:** [D049 — Workshop Asset Formats & Distribution](../D049-workshop-assets.md)

Content channels are a `p2p-distribute` primitive — mutable append-only data streams with versioned snapshots and subscriber swarm management (see `research/p2p-distribute-crate-design.md` § 2.5). This page documents how Iron Curtain's integration layer maps game concepts onto that primitive.

---

#### What IC Publishes via Content Channels

| Channel Type                 | Publisher                          | Content                                                                             | Update Frequency            | Subscriber                                |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| **Balance patches**          | Community server operator          | YAML rule overrides (unit stats, weapon values, cost tables)                        | Per-season or ad-hoc hotfix | Players who play on that community server |
| **Server configuration**     | Tournament organizer               | Rule sets (time limits, unit bans, map pool)                                        | Per-tournament or per-round | Tournament participants                   |
| **Live content feeds**       | Workshop curator / IC official     | Featured Workshop resources, event announcements                                    | Weekly or ad-hoc            | Opted-in players                          |
| **Mod update notifications** | Workshop (on behalf of publishers) | New-version metadata (not the package itself — that triggers subscription prefetch) | On publish                  | Subscribed players                        |

#### Channel Lifecycle

1. **Creation:** A server operator creates a channel via `server_config.toml` (D064) or the admin panel (D049 § Workshop Operator / Admin Panel). The channel is announced to the embedded tracker and optionally to federated trackers.

```toml
# server_config.toml — balance channel example
[channels.balance]
name = "competitive-balance"
description = "Competitive balance patches for ranked play"
retention = "last-5"            # keep last 5 snapshots
announce_trackers = ["wss://tracker.ironcurtain.gg/announce"]
```

2. **Publishing a snapshot:** The operator publishes a new snapshot — a YAML file with balance overrides — via `ic server channel publish balance ./balance-v7.yaml` CLI or the admin panel. `p2p-distribute` assigns a monotonic sequence number and SHA-256.

3. **Subscriber notification:** Clients subscribed to the channel receive the new snapshot ID via the tracker announce protocol. The download happens at `background` priority — it does not interrupt gameplay.

4. **Local storage:** Snapshots are stored in the local Workshop cache alongside regular packages. Old snapshots are evicted per the channel's `retention` policy.

5. **Activation:** The snapshot is **not** applied automatically to gameplay. It becomes available for lobby creation and mod profile composition. The player sees a notification: "New balance update available from [server name]. [View Changes]".

#### Lobby Integration — Content Pinning

When a lobby host creates a room, the room's content state is pinned:
- The host's active mod profile (D062) is the content baseline
- If the host is subscribed to a balance channel, the **latest snapshot ID** is included in the room's declared content state

The lobby fingerprint (D062 § "Multiplayer Integration") incorporates the balance snapshot ID:

```
fingerprint = SHA-256(
    sorted_mod_set          # publisher/package@version for each active mod
  + conflict_resolutions    # ordered resolution choices
  + balance_snapshot_id     # content channel snapshot (if any), or empty
)
```

When a joining player's fingerprint matches the host → immediate ready state (fast path). On mismatch, the lobby diff view (D062) shows:
- Standard mod differences (version mismatches, missing mods)
- **Balance channel differences:** "Host uses competitive-balance v7; you have v6. [Update now]"

The update is a single snapshot download at `lobby-urgent` priority — typically under 100 KB, completing in <1 second.

#### Relationship to D062 Mod Profiles

Content channel snapshots are **external inputs** to the mod profile's namespace resolution (D062 § "Namespace Resolution Algorithm"). A balance channel snapshot acts as an overlay source — highest priority, applied after all mod sources are merged:

```
Namespace resolution order (lowest to highest priority):
  1. Engine defaults
  2. Active mods (ordered by profile)
  3. Conflict resolutions (explicit player/host choices)
  4. Balance channel snapshot (if subscribed)
```

This means a balance patch can override any mod's values without modifying the mod itself. The mod profile's fingerprint captures the composed result, including the channel overlay.

#### Server Operator Configuration

Server operators who run community servers (D052, D074) configure balance channels as part of their server identity:

```toml
# server_config.toml
[identity]
name = "Competitive RA League"

[channels.balance]
name = "cral-balance"
auto_subscribe = true    # players who join this server's lobbies auto-subscribe
publish_key = "ed25519:..."  # only the operator can publish snapshots
```

`auto_subscribe = true` means players who connect to this server's lobbies are offered subscription: "This server uses a custom balance channel. [Subscribe for automatic updates] [Use for this session only]". Players who subscribe receive future updates via the prefetch system (D049 § Preheat / prefetch).

#### Security Model

- **Snapshot integrity:** Every snapshot is SHA-256 verified. The channel publisher's Ed25519 key signs the snapshot sequence — clients verify the signature chain before applying.
- **No code execution:** Balance snapshots are pure YAML data — they modify numeric values and enable/disable flags. They cannot inject Lua or WASM code. The YAML schema validator rejects non-data fields.
- **Opt-in subscription:** Players explicitly choose which channels to subscribe to. No channel can push content without player consent (except `auto_subscribe` servers, which still require player confirmation on first connect).
- **Ranked mode interaction:** Official ranked matchmaking (D055) uses a pinned balance state managed by the ranking provider — not an arbitrary community channel. Community-server competitive modes use their own channels.

#### Phase

- **Phase 5 (`M8`):** Basic content channel support — server operators can publish balance snapshots, clients can subscribe and receive updates. Lobby fingerprint includes snapshot ID.
- **Phase 6a (`M9`):** Admin panel integration for channel management. Channel browsing in the server browser. Federation of channel announcements across community servers.

#### Cross-References

| Topic                                         | Document                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| p2p-distribute content channels (protocol)    | `research/p2p-distribute-crate-design.md` § 2.5                                                    |
| Mod profile fingerprints & lobby verification | [D062](../../09c/D062-mod-profiles.md) § "Multiplayer Integration"                                 |
| Lobby content pinning                         | [D052](../../09b/D052/D052-transparency-matchmaking-lobby.md) § "Match Creation & Content Pinning" |
| Server configuration                          | D064 / [15-SERVER-GUIDE.md](../../../15-SERVER-GUIDE.md)                                           |
| Data-sharing flows overview                   | [architecture/data-flows-overview.md](../../../architecture/data-flows-overview.md)                |
