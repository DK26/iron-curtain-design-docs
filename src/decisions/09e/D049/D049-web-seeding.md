### Web Seeding — Concurrent HTTP+P2P Downloads (BEP 17/19)

> **Full implementation design:** `research/p2p-distribute-crate-design.md` § 2.8 (pseudocode, config, subsystem interactions, study references) and `research/p2p-engine-protocol-design.md` § 2.6 + § 8.4 (protocol integration, piece picker, feature matrix).

**The problem with fallback-only HTTP:** The base transport strategy (see D049 § "P2P Distribution") treats HTTP as a mutual-exclusive fallback — P2P fails, then HTTP activates. This leaves bandwidth on the table. A download with 3 BT peers at 500 KB/s each caps at ~1.5 MB/s even when an HTTP mirror could add another 2 MB/s.

**The solution: web seeding.** HTTP mirrors participate **simultaneously** alongside BT peers in the piece scheduler — not as a fallback, but as a concurrent transport. This is the aria2 model: the scheduler doesn't care whether a piece arrives from a BT `piece` message or an HTTP Range response. Downloads aggregate bandwidth from both transports.

This capability is feature-gated behind the `webseed` flag in `p2p-distribute` (D076 Tier 3). It does not replace the existing fallback path — it supplements it. If `webseed` is disabled or no web seed URLs are present in the torrent metadata, behavior is unchanged.

---

## BEP 17 vs BEP 19

Two BitTorrent Extension Proposals define web seeding, each with a different URL model:

| Aspect               | BEP 17 (GetRight-style)                                     | BEP 19 (Hoffman-style)                            |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Metadata key         | `httpseeds` (list of URLs)                                  | `url-list` (list of URLs)                         |
| URL model            | Each URL serves the **entire torrent** as a single resource | Each URL is a base path; file paths are appended  |
| Range requests       | Byte ranges into the whole torrent blob                     | Byte ranges into individual files                 |
| Single-file torrents | URL = file                                                  | URL = directory, `url-list[i]/filename` = file    |
| Multi-file torrents  | One giant resource, byte offsets into concatenated files    | Natural mapping: one URL per file                 |
| IC primary use       | Single-file `.icpkg` packages                               | Multi-file torrents (if IC adopts them in future) |

**IC recommendation:** Use **both**. For the common case (single-file `.icpkg`), BEP 17 and BEP 19 are functionally equivalent. Multi-file torrents (future) require BEP 19. Workshop servers and CDN mirrors publish both `httpseeds` and `url-list` metadata in torrent files.

---

## Architecture: HttpSeedPeer Virtual Peer Model

HTTP mirrors are modeled as `HttpSeedPeer` virtual peers in the `p2p-distribute` connection pool. They participate in the same piece picker algorithm as BT peers:

- **Always have all pieces** — HTTP mirrors serve the complete file, so their bitfield is always full.
- **Never choked** — they don't participate in BT tit-for-tat reciprocity.
- **Rarity-excluded** — their "have all" bitfield is excluded from rarity counts to avoid inflating rarity estimates. Actual BT peer rarity drives piece selection order.
- **Scored by download rate** — the scheduler scores HTTP seeds identically to BT peers using the same EWMA rate measurement.
- **Separate connection pool** — HTTP seeds do not consume BT connection pool slots.

### Piece fetching

For each piece request assigned to an HTTP seed:

- **BEP 17:** Maps piece index to absolute byte range in the torrent blob, sends `Range: bytes=<start>-<end>`.
- **BEP 19 (single file):** Maps piece index to byte range in the file, sends `Range: bytes=<start>-<end>` against `base_url/file_path`.
- **BEP 19 (multi-file, piece spanning):** A piece at a file boundary straddles two files. The scheduler maps the piece to multiple file segments using a fixed absolute endpoint (`abs_end`) cursor, issues one Range request per segment, reassembles into a full piece buffer, then verifies the piece hash.

**No-Range handling:** If a server returns 200 instead of 206 (no Range support), the seed is marked unusable for piece-mode requests (`supports_range = false`). The whole-file HTTP fallback path (§ 8.4 in protocol design) handles non-Range servers. The piece scheduler excludes seeds with `supports_range == false`.

---

## Scheduler Integration: Three Gates

The piece scheduler enforces three gates before assigning a piece to an HTTP seed:

### Gate 1: Eligibility filter

```
http_sources = http_seeds.filter(|s|
    s.supports_range == true          // no-Range seeds excluded
    AND s.active_requests < max_requests_per_seed
    AND s.consecutive_failures < failure_backoff_threshold
    AND global_http_active < max_requests_global)
```

### Gate 2: Bandwidth fraction cap

Each scheduling round computes the HTTP share of total download bandwidth from per-source EWMA rates:

```
http_fraction = http_dl_rate / total_dl_rate
IF http_fraction >= max_bandwidth_fraction:
    http_sources = empty   // BT only this round
```

This prevents HTTP from starving BT peers of demand, preserving swarm reciprocity.

### Gate 3: `prefer_bt_peers` policy

When enabled (default), the scheduler biases toward BT peers when the swarm is healthy (**≥ 2 BT peers above `bt_peer_rate_threshold`**):

- **Healthy swarm:** BT peers first. HTTP seeds only take over if no BT peer can serve the requested piece.
- **Thin swarm or policy disabled:** All sources scored uniformly — scheduler picks the fastest regardless of transport.

This preserves upload reciprocity in healthy swarms while still leveraging HTTP bandwidth when the swarm needs help.

---

## Revised Transport Strategy

Web seeding changes the transport model for the ≥5 MB tiers from "fallback" to "concurrent supplement":

| Package Size | Without `webseed`            | With `webseed` enabled                                        |
| ------------ | ---------------------------- | ------------------------------------------------------------- |
| < 5MB        | HTTP direct only             | HTTP direct only (unchanged — no torrent metadata)            |
| 5–50MB       | P2P preferred, HTTP fallback | P2P + HTTP concurrent (HTTP seeds supplement BT swarm)        |
| > 50MB       | P2P strongly preferred       | P2P + HTTP concurrent (HTTP seeds provide baseline bandwidth) |

The fallback path (P2P fails → HTTP activates) remains as the last resort. Web seeding is an optimization layer *above* fallback, active whenever torrent metadata includes `httpseeds` or `url-list` keys.

**Key value scenarios:**

- **Initial swarm bootstrapping:** HTTP seeds provide guaranteed bandwidth before enough BT peers join — critical for newly published packages.
- **Launch-day update delivery:** CDN mirrors as web seeds ensure baseline download speed during swarm formation.
- **Long-tail content:** Obscure packages with few seeders still download at near-CDN speed when web seeds are available.
- **Lobby auto-download:** When a joining player needs a mod, HTTP seeds provide immediate bandwidth while lobby peers connect.

---

## Browser (WASM) Constraints

Web seeding works in WASM builds with one operational constraint: **mirrors must be CORS-enabled** for cross-origin Range fetches. Desktop clients can use arbitrary HTTP mirrors; browser clients can only use mirrors that serve appropriate `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers` (including `Range`) response headers.

Workshop-operated mirrors are CORS-enabled by default. Third-party/community mirrors should document CORS requirements in their setup guides. The feature matrix in `research/p2p-engine-protocol-design.md` § 8.5 tracks browser vs. desktop capability differences.

---

## Configuration

The `[webseed]` configuration group in `settings.toml`:

| Key                         | Default | Description                                                           |
| --------------------------- | ------- | --------------------------------------------------------------------- |
| `enabled`                   | `true`  | Enable web seeding (BEP 17/19 HTTP sources)                           |
| `max_requests_per_seed`     | `4`     | Maximum concurrent HTTP requests per web seed endpoint                |
| `max_requests_global`       | `16`    | Maximum concurrent HTTP requests across all web seeds                 |
| `connect_timeout`           | `10`    | Connection timeout (seconds)                                          |
| `request_timeout`           | `60`    | Per-piece request timeout (seconds)                                   |
| `failure_backoff_threshold` | `5`     | Consecutive failures before temporarily disabling a seed              |
| `failure_backoff_duration`  | `300`   | How long to disable a failing seed (seconds)                          |
| `max_bandwidth_fraction`    | `0.8`   | Maximum fraction of total download bandwidth for HTTP seeds (0.0–1.0) |
| `prefer_bt_peers`           | `true`  | Deprioritize HTTP seeds when BT swarm is healthy                      |
| `bt_peer_rate_threshold`    | `51200` | Minimum BT peer rate (bytes/sec) for swarm health check               |

---

## Subsystem Interactions

| Subsystem                               | Interaction                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Priority channels (§ 2 protocol design) | HTTP seeds participate in priority tiers. `LobbyUrgent` pieces bypass `prefer_bt_peers`.                                          |
| Choking (§ 3 protocol design)           | HTTP seeds are never choked — purely download sources.                                                                            |
| Endgame mode                            | HTTP seeds receive duplicate requests alongside BT peers. First response wins.                                                    |
| Bandwidth QoS                           | HTTP seed bandwidth counts against global download rate limit. `max_bandwidth_fraction` provides an additional HTTP-specific cap. |
| Connection pool bucketing               | HTTP seeds use a separate HTTP connection pool, not BT slots.                                                                     |
| Revocation (§ 2.7 crate design)         | Revoked torrents stop HTTP seed requests immediately.                                                                             |
| Resume/pause                            | Pausing stops HTTP requests. Resuming re-fetches only missing pieces via Range.                                                   |

---

## Phase & Milestone

- **Phase:** Phase 5 (Milestone 9 in `p2p-distribute` build plan)
- **Priority:** P-Differentiator (improves download speed for all users, especially during swarm bootstrapping)
- **Feature gate:** `webseed` (compile-time feature in `p2p-distribute`)
- **Dependencies:** `p2p-distribute` core (M1–M3), piece scheduler (M3), HTTP client (`reqwest` with Range support)
- **Hard dependency on:** D049 P2P Distribution, D076 `p2p-distribute` crate
- **Soft dependency on:** D074 Workshop capability (seeds publish `httpseeds`/`url-list` in torrent metadata)

**Exit criteria:** A torrent with `httpseeds` or `url-list` metadata downloads pieces from HTTP endpoints and BT peers simultaneously. HTTP seeds supplement thin swarms. `prefer_bt_peers` correctly deprioritizes HTTP when the swarm is healthy. Pausing and resuming re-fetches only missing pieces.

---

## Cross-References

| Topic                                              | Location                                              |
| -------------------------------------------------- | ----------------------------------------------------- |
| Full pseudocode + implementation design            | `research/p2p-distribute-crate-design.md` § 2.8       |
| Protocol integration + piece picker                | `research/p2p-engine-protocol-design.md` § 2.6, § 8.4 |
| Feature matrix (desktop vs browser)                | `research/p2p-engine-protocol-design.md` § 8.5        |
| Extended protocol survey (virtual peer candidates) | `research/bittorrent-p2p-libraries.md` § 7            |
| P2P base transport strategy                        | [D049-p2p-distribution.md](D049-p2p-distribution.md)  |
| `p2p-distribute` crate extraction                  | D076 § Tier 3                                         |
