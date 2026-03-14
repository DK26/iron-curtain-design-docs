# Data-Sharing Flows Overview

This page provides a unified reference for every flow in which content bytes move between players, servers, or community infrastructure. Each flow identifies the layers involved (`p2p-distribute` → `workshop-core` → IC integration), the trigger, the trust/security model, and cross-references to the canonical design detail.

> **Layer architecture summary:** `p2p-distribute` (MIT/Apache-2.0, D076 Tier 3) moves opaque bytes via BitTorrent-compatible protocol. `workshop-core` (game-agnostic, D050) adds registry, versioning, dependencies, and federation. The IC integration layer (GPL v3) adds Bevy wiring, lobby triggers, game-module awareness, and UX. See D050 § "Three-Layer Architecture" for the authoritative diagram.

---

## Flow Catalog

| #   | Flow                               | Trigger                                         | Layers                         | Priority Tier             | Canonical Detail                                  |
| --- | ---------------------------------- | ----------------------------------------------- | ------------------------------ | ------------------------- | ------------------------------------------------- |
| 1   | Workshop Browse & Install          | User clicks [Install] in Workshop browser       | All three                      | `user-requested`          | D030, D049, `player-flow/workshop.md`             |
| 2   | Lobby Auto-Download                | Player joins a room missing required mods       | All three                      | `lobby-urgent`            | D052 § "In-Lobby P2P Resource Sharing"            |
| 3   | First Launch Asset Detection       | First run detects owned RA/OpenRA installs      | IC only (local I/O)            | N/A — no P2P              | D069, `player-flow/first-launch.md`               |
| 4   | Replay Sharing via P2P             | Player shares `.icrep` via Match ID or Workshop | p2p-distribute + IC            | `user-requested`          | D049 § "Replay Sharing", `player-flow/replays.md` |
| 5   | Content Channels (Balance Patches) | Server operator publishes balance/config update | p2p-distribute + IC            | `background`              | D049 § "Content Channels Integration"             |
| 6   | Background Seeding                 | Player keeps client open after downloading      | p2p-distribute                 | `background`              | D049 § "P2P Policy & Admin"                       |
| 7   | Subscription Prefetch              | Subscribed mod publishes new version            | workshop-core + p2p-distribute | `background`              | D049 § "P2P Policy & Admin"                       |
| 8   | In-Match Communication             | Chat, pings, voice during gameplay              | Relay only (no P2P)            | N/A — relay `MessageLane` | D059, `netcode/wire-format.md`                    |

---

## Flow 1 — Workshop Browse & Install

```
Player                    IC Client                   workshop-core              p2p-distribute
  │                          │                             │                          │
  │  [Browse Workshop]       │                             │                          │
  │─────────────────────────>│                             │                          │
  │                          │  search("hd sprites")      │                          │
  │                          │────────────────────────────>│                          │
  │                          │  results [ alice/hd@2.0 ]  │                          │
  │                          │<────────────────────────────│                          │
  │  [Install]               │                             │                          │
  │─────────────────────────>│  resolve_deps(alice/hd@2.0) │                         │
  │                          │────────────────────────────>│                          │
  │                          │  dep list + SHA-256s        │                          │
  │                          │<────────────────────────────│                          │
  │                          │                             │  download(info_hash,     │
  │                          │                             │    priority=requested)   │
  │                          │                             │─────────────────────────>│
  │                          │                             │   P2P swarm transfer     │
  │                          │                             │<─────────────────────────│
  │                          │  verify SHA-256 ✓           │                          │
  │                          │  activate in namespace      │                          │
  │  Toast: "Installed ✓"   │                             │                          │
  │<─────────────────────────│                             │                          │
```

**Trust model:** Workshop index is the trust anchor. SHA-256 in the manifest is verified against the downloaded `.icpkg` content. P2P peers are untrusted byte sources — content-addressed integrity makes malicious peers harmless.

**Web seeding (BEP 17/19):** When the `webseed` feature is enabled and torrent metadata includes `httpseeds` or `url-list` keys, HTTP mirrors participate **concurrently** alongside BT peers in the piece scheduler — downloads aggregate bandwidth from both transports. This is especially valuable during initial swarm bootstrapping for newly published packages. See D049 § “Web Seeding” for the full design.

**Cross-references:** D030 (registry), D049 § “P2P Distribution”, D049 § “Web Seeding”, `player-flow/workshop.md` § “Install Flow”.

---

## Flow 2 — Lobby Auto-Download

```
Host                     Relay/Tracker               Joining Player
  │                          │                             │
  │  create_room(mods=[..])  │                             │
  │─────────────────────────>│  room requires:             │
  │  seeds all required mods │  alice/hd@2.0, bob/map@1.1 │
  │                          │                             │
  │                          │       join_room(TKR-4N7)    │
  │                          │<────────────────────────────│
  │                          │  resource_list + SHA-256    │
  │                          │────────────────────────────>│
  │                          │                             │  check local cache
  │                          │                             │  missing: bob/map@1.1
  │                          │                             │
  │                          │  request peers for          │
  │                          │  bob/map@1.1                │
  │                          │<────────────────────────────│
  │                          │  peer list: [host, alice]   │
  │                          │────────────────────────────>│
  │                          │                             │ P2P download
  │                          │                             │ (lobby-urgent priority)
  │                          │                             │
  │                          │  "ready" (all verified)     │
  │                          │<────────────────────────────│
```

**Key detail — host-as-tracker:** The relay (or host in listen-server mode) maintains `HashMap<ResourceId, Vec<PeerId>>` for the room's lifetime. Ready players join the seeding pool, accelerating downloads for later joiners. Lobby prefetch (seed boxes pre-warmed on room creation) further accelerates first-joiner experience.
**Web seeding in lobby context:** When `webseed` is enabled, HTTP seeds provide immediate bandwidth while lobby BT peers connect. `LobbyUrgent` pieces bypass the `prefer_bt_peers` policy, allowing HTTP seeds to serve them even when the BT swarm is healthy.
**Security:** Only Workshop-published resources can be shared. Client verifies SHA-256 against a known Workshop source before accepting bytes. Unknown resources are refused. See D052 § "In-Lobby P2P Resource Sharing" for the full security model.

**Cross-references:** D052 § "In-Lobby P2P Resource Sharing", D049 § priority tier `lobby-urgent`.

---

## Flow 3 — First Launch Asset Detection

```
Player                    IC Client                   Local Filesystem
  │                          │                             │
  │  [First Launch]          │                             │
  │─────────────────────────>│                             │
  │                          │  scan known install paths   │
  │                          │────────────────────────────>│
  │                          │  found: Steam RA Remastered │
  │                          │<────────────────────────────│
  │                          │                             │
  │  "Found Remastered       │                             │
  │   Collection at D:\...   │                             │
  │   [Import HD Assets]     │                             │
  │   [Use Classic Only]"    │                             │
  │<─────────────────────────│                             │
  │                          │                             │
  │  [Import HD Assets]      │                             │
  │─────────────────────────>│  read .mix/.meg files       │
  │                          │────────────────────────────>│
  │                          │  convert to IC formats      │
  │                          │  → mods/remastered-hd/      │
  │  "Import complete ✓"    │                             │
  │<─────────────────────────│                             │
```

**No P2P involved.** This is purely local I/O — scanning the filesystem for owned game installations and importing assets. No network, no trust model beyond "user's own disk."

**Cross-references:** D069 (Install Wizard), D075 (Remastered format compatibility), `player-flow/first-launch.md`.

---

## Flow 4 — Replay Sharing via P2P

```
Sharer                   Relay / Workshop            Recipient
  │                          │                             │
  │  Post-game: [Share]      │                             │
  │─────────────────────────>│                             │
  │  upload .icrep to relay  │                             │
  │  Match ID: IC-7K3M9X     │                             │
  │                          │                             │
  │        (out of band: shares Match ID via chat/forum)   │
  │                          │                             │
  │                          │  [Enter Match ID]           │
  │                          │<────────────────────────────│
  │                          │  fetch .icrep metadata      │
  │                          │────────────────────────────>│
  │                          │                             │ download .icrep
  │                          │                             │ (user-requested)
  │                          │  verify integrity           │
  │                          │────────────────────────────>│
  │                          │                             │ add to local library
  │                          │                             │ [Play Replay]
```

**Two sharing paths:**
1. **Match ID (relay-hosted):** Relay stores `.icrep` for a configurable retention period (default 90 days, D072). Recipients fetch by ID. For popular replays, `p2p-distribute` forms a swarm — the relay seeds initially, subsequent downloaders become peers.
2. **Workshop publication:** Curated replay collections published as Workshop resources (e.g., "Best of Season 3"). Standard Workshop P2P distribution applies.

**Privacy:** Voice audio (D059) is a separate opt-in stream in `.icrep`. Replay anonymization mode strips player names. Ranked match IDs are public by default; private match IDs require host opt-in.

**Cross-references:** D049 § "Replay Sharing", `player-flow/replays.md` § "Replay Sharing", `formats/save-replay-formats.md`.

---

## Flow 5 — Content Channels (Balance Patches)

```
Server Operator          p2p-distribute               Player Client
  │                          │                             │
  │  publish balance         │                             │
  │  patch to channel        │                             │
  │─────────────────────────>│                             │
  │  new snapshot:           │                             │
  │  balance-v7 (SHA-256)    │                             │
  │                          │  notify subscribers         │
  │                          │────────────────────────────>│
  │                          │                             │ download snapshot
  │                          │                             │ (background priority)
  │                          │                             │
  │                          │                             │ verify SHA-256 ✓
  │                          │                             │ store locally
  │                          │                             │
  │   ─ ─ ─ ─ ─ [Later: player creates/joins lobby] ─ ─ ─│
  │                          │                             │
  │                          │  lobby fingerprint includes │
  │                          │  balance snapshot ID        │
  │                          │<────────────────────────────│
  │                          │  all players on same        │
  │                          │  snapshot → match starts    │
```

Content channels are a `p2p-distribute` primitive (§ 2.5 in `research/p2p-distribute-crate-design.md`) — mutable append-only data streams with versioned snapshots. IC uses them for:

- **Balance patches:** Server operators publish YAML rule overrides. Players subscribed to a community server's balance channel receive updates automatically.
- **Server configuration:** Tournament organizers push rule sets (time limits, unit bans) as channel snapshots.
- **Live content feeds:** Featured Workshop content, event announcements.

**Lobby integration (D062):** The mod profile fingerprint (D062 § "Multiplayer Integration") includes the active balance channel snapshot ID. This ensures all players in a lobby are on the same balance state — no per-field comparison needed, just fingerprint match.

**Cross-references:** D049 § "Content Channels Integration", D062 § "Multiplayer Integration", `research/p2p-distribute-crate-design.md` § 2.5.

---

## Flow 6 — Background Seeding

After downloading any content (Workshop mod, lobby resource, replay), the client continues seeding that content to other peers. This is the reciprocal side of every P2P download — without seeders, the swarm dies.

**Player-facing behavior:**
- Seeding runs automatically while the game is open — no user action required
- After game exit, seeding continues for `seed_duration_after_exit` (default 30 minutes, configurable in `settings.toml`)
- System tray icon (desktop) shows seeding status: upload speed, number of peers served
- Tray menu: **[Stop Seeding]** / **[Open IC]** / **[Quit]**
- Bandwidth is capped by `workshop.p2p.max_upload_speed` (default 1 MB/s)
- Seeding is disabled entirely by setting `max_upload_speed = "0 B/s"` or `seed_after_download = false`

**Settings UI (Settings → Workshop → P2P):**

| Setting            | Control              | Default |
| ------------------ | -------------------- | ------- |
| Seed while playing | Toggle               | On      |
| Seed after exit    | Toggle + duration    | 30 min  |
| Max upload speed   | Slider (0–unlimited) | 1 MB/s  |
| Max cache size     | Slider               | 2 GB    |

**Cross-references:** D049 § "P2P Policy & Admin" (`settings.toml` snippet), `player-flow/settings.md`.

---

## Flow 7 — Subscription Prefetch

```
Workshop Server          p2p-distribute               Player Client
  │                          │                             │
  │  alice/tanks@2.1         │                             │
  │  published (new version) │                             │
  │─────────────────────────>│                             │
  │                          │                             │
  │   ─ ─ ─ [Check cycle: every 24 hours] ─ ─ ─ ─ ─ ─ ─ │
  │                          │                             │
  │                          │  poll subscribed resources  │
  │                          │<────────────────────────────│
  │                          │  alice/tanks: 2.0→2.1 avail│
  │                          │────────────────────────────>│
  │                          │                             │ download at background
  │                          │                             │ priority
  │                          │                             │
  │                          │                             │ verify + stage
  │                          │                             │
  │                          │                             │ Toast: "alice/tanks
  │                          │                             │  updated to 2.1
  │                          │                             │  [View Changes]"
```

**Subscribe workflow (Workshop browser):** Each Workshop resource page has a **[Subscribe]** toggle. Subscribed resources auto-update at `background` priority. The check cycle interval is configurable via `workshop.subscription_check_interval` in `settings.toml` (default: 24 hours). Subscription list is stored in the local Workshop SQLite database.

**Workshop browser indicators:**
- Subscribed resources show a bell icon (🔔)
- Resources with pending updates show a badge count
- Subscription management: Settings → Workshop → Subscriptions (list view with [Unsubscribe] per item)

**Cross-references:** D049 § "P2P Policy & Admin" (preheat/prefetch), D030 (Workshop registry), `player-flow/workshop.md`.

---

## Flow 8 — In-Match Communication

```
Player A                 Relay Server                 Player B
  │                          │                             │
  │  [Ping: "Attack Here"]   │                             │
  │─────────────────────────>│                             │
  │  MessageLane::Orders     │  validate + broadcast       │
  │                          │────────────────────────────>│
  │                          │                             │ render ping marker
  │                          │                             │
  │  [Voice: push-to-talk]   │                             │
  │─────────────────────────>│                             │
  │  MessageLane::Voice      │  relay to team              │
  │                          │────────────────────────────>│
  │                          │                             │ play audio
  │                          │                             │
  │  [Chat: "go north"]      │                             │
  │─────────────────────────>│                             │
  │  MessageLane::Chat       │  relay to team/all          │
  │                          │────────────────────────────>│
  │                          │                             │ display in chat
```

**No P2P involved.** In-match communication uses the relay's `MessageLane` system — the same connection already established for game order delivery. Voice uses Opus codec (D059). Pings use the Apex-inspired contextual system (8 types + ping wheel). Chat supports team/all/whisper/observer channels.

**Cross-references:** D059 (communication system), `netcode/wire-format.md` § "Message Lanes".

---

## Cross-Cutting Concerns

### Layer Separation Principle

Every flow respects the three-layer boundary:
- **`p2p-distribute`** never knows what it is transferring — it sees only info_hash, pieces, and peers
- **`workshop-core`** never knows about lobbies, replays, or balance patches — it sees packages with metadata
- **IC integration** is the only layer that maps game concepts (lobby join, replay share, balance update) to library calls

### Fingerprint & Content Pinning (D062)

The mod profile fingerprint (D062) serves as a universal "are we on the same content?" check for multiplayer. It incorporates:
- Active mod set with versions
- Conflict resolution choices
- Balance channel snapshot ID (when subscribed to a content channel)

This means lobby verification is a single SHA-256 comparison, not per-mod enumeration.

### Security Invariant

Every byte transferred via P2P is content-addressed (SHA-256). The integrity proof comes from the Workshop index or relay metadata — never from the peer that provided the bytes. A fully compromised peer swarm cannot inject malicious content as long as one honest metadata source exists.

---

## Cross-References

| Topic                              | Document                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| P2P distribution protocol & config | [D049 § P2P Distribution](../decisions/09e/D049/D049-p2p-distribution.md)                         |
| P2P bandwidth, seeding, prefetch   | [D049 § P2P Policy & Admin](../decisions/09e/D049/D049-p2p-policy-admin.md)                       |
| Content channels IC integration    | [D049 § Content Channels Integration](../decisions/09e/D049/D049-content-channels-integration.md) |
| P2P replay sharing                 | [D049 § Replay Sharing](../decisions/09e/D049/D049-replay-sharing.md)                             |
| Workshop registry & federation     | [D030](../decisions/09e/D030-workshop-registry.md)                                                |
| Three-layer architecture           | [D050](../decisions/09c/D050-workshop-library.md)                                                 |
| Lobby P2P resource sharing         | [D052 § Lobby](../decisions/09b/D052/D052-transparency-matchmaking-lobby.md)                      |
| Mod profile fingerprints           | [D062](../decisions/09c/D062-mod-profiles.md)                                                     |
| Communication (chat, voice, pings) | [D059](../decisions/09g/D059-communication.md)                                                    |
| p2p-distribute crate design        | [research/p2p-distribute-crate-design.md](../../research/p2p-distribute-crate-design.md)          |
| Relay wire format & message lanes  | [Netcode § Wire Format](../netcode/wire-format.md)                                                |
