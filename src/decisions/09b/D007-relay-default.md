## D007: Networking — Relay Server as Default

**Revision note (2026-02-22):** Revised to clarify failure-policy expectations: relay remains the default and ranked authority path, but relay failure handling is mode-specific. Ranked follows degraded-certification / void policy (see `06-SECURITY.md` V32) rather than automatic P2P failover; casual/custom games may offer unranked continuation or fallback paths.

**Decision:** Default multiplayer uses relay server with time authority, not pure P2P. The relay logic (`RelayCore`) is a library component in `ic-net` — it can be deployed as a standalone binary (dedicated server for hosting, server rooms, Raspberry Pi) or embedded inside a game client (listen server — "Host Game" button, zero external infrastructure). Clients connecting to either deployment use the same protocol and cannot distinguish between them.

**Rationale:**
- Blocks lag switches (server owns the clock)
- Enables sub-tick chronological ordering (CS2 insight)
- Handles NAT traversal (no port forwarding — dedicated server mode)
- Enables order validation before broadcast (anti-cheat)
- Signed replays
- Cheap to run (doesn't run sim, just forwards orders — ~2-10 KB memory per game)
- **Listen server mode:** embedded relay lets any player host a game with full sub-tick ordering and anti-lag-switch, no external server needed. Host's own orders go through the same `RelayCore` pipeline — no host advantage in order processing.
- **Dedicated server mode:** standalone binary for competitive/ranked play, community hosting, and multi-game capacity on cheap hardware.

**Trust boundary:** For ranked/competitive play, the matchmaking system requires connection to an official or community-verified dedicated relay (untrusted host can't be allowed relay authority). For casual/LAN/custom games, the embedded relay is preferred — zero setup, full relay quality.

**Relay failure policy:** If a relay dies mid-match, ranked/competitive matches do **not** silently fail over to a different authority path (e.g., ad-hoc P2P) because that breaks certification and trust assumptions. Ranked follows the degraded-certification / void policy in `06-SECURITY.md` (V32). Casual/custom games may offer unranked continuation via reconnect or fallback if all participants support it.

**Validated by:** C&C Generals/Zero Hour's "packet router" — a client-side star topology where one player collected and rebroadcast all commands. IC's embedded relay improves on this pattern: the host's orders go through `RelayCore`'s sub-tick pipeline like everyone else's (no peeking, no priority), eliminating the host advantage that Generals had. The dedicated server mode further eliminates any hosting-related advantage. See `research/generals-zero-hour-netcode-analysis.md`. Further validated by Valve's GameNetworkingSockets (GNS), which defaults to relay (Valve SDR — Steam Datagram Relay) for all connections, including P2P-capable scenarios. GNS's rationale mirrors ours: relay eliminates NAT traversal headaches, provides consistent latency measurement, and blocks IP-level attacks. The GNS architecture also validates encrypting all relay traffic (AES-GCM-256 + Curve25519) — see D054 § Transport encryption. See `research/valve-github-analysis.md`. Additionally validated by Embark Studios' **Quilkin** — a production Rust UDP proxy for game servers (1,510★, Apache 2.0, co-developed with Google Cloud Gaming). Quilkin provides a concrete implementation of relay-as-filter-chain: session routing via token-based connection IDs, QCMP latency measurement for server selection, composable filter pipeline (Capture → Firewall → RateLimit → TokenRouter), and full OTEL observability. Quilkin's production deployment on Tokio + tonic confirms that async Rust handles game relay traffic at scale. See `research/embark-studios-rust-gamedev-analysis.md`.

**Cross-engine hosting:** When IC's relay hosts a cross-engine match (e.g., OpenRA clients joining an IC server), IC can still provide meaningful relay-layer protections (time authority for the hosted session path, transport/rate-limit defenses, logging/replay signing, and protocol sanity checks after `OrderCodec` translation). However, this does **not** automatically confer full native IC competitive integrity guarantees to foreign clients/sims. Trust and anti-cheat capability are mode-specific and depend on the compatibility level (`07-CROSS-ENGINE.md` § "Cross-Engine Trust & Anti-Cheat Capability Matrix"). In practice, "join IC's server" is usually more observable and better bounded than "IC joins foreign server," but cross-engine live play remains unranked/experimental by default unless separately certified.

**Alternatives available:** Pure P2P lockstep, fog-authoritative server, rollback — all implementable as `NetworkModel` variants.

---

---
