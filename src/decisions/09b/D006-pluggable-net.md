## D006: Networking — Pluggable via Trait

**Revision note (2026-02-22):** Revised to clarify product-vs-architecture scope. IC ships one default/recommended multiplayer netcode for normal play, but the `NetworkModel` abstraction remains a hard requirement so the project can (a) support deferred compatibility/bridge experiments (`M7+`/`M11`) with other engines or legacy games where a different network/protocol adapter is needed, and (b) replace the default netcode under a separately approved deferred milestone if a serious flaw or better architecture is discovered.

**Decision:** Abstract all networking behind a `NetworkModel` trait. Game loop is generic over it.

**Rationale:**
- Sim never touches networking concerns (clean boundary)
- Full testability (run sim with `LocalNetwork`)
- Community can contribute netcode without understanding game logic
- Enables deferred non-default models under explicit decision/overlay placement (rollback, client-server, cross-engine adapters)
- Enables bridge/proxy adapters for cross-version/community interoperability experiments without touching `ic-sim`
- De-risks deferred netcode replacement (better default / serious flaw response) behind a stable game-loop boundary
- Selection is a deployment/profile/compatibility policy by default, not a generic "choose any netcode" player-facing lobby toggle

**Key invariant:** `ic-sim` has zero imports from `ic-net`. They only share `ic-protocol`.

**Cross-engine validation:** Godot's `MultiplayerAPI` trait follows the same pattern — an abstract multiplayer interface with a default `SceneMultiplayer` implementation and a null `OfflineMultiplayerPeer` for single-player/testing (which validates IC's `LocalNetwork` concept). O3DE's separate `AzNetworking` (transport layer: TCP, UDP, serialization) and `Multiplayer` Gem (game-level replication, authority, entity migration) validates IC's `ic-net` / `ic-protocol` separation. Both engines prove that trait-abstracted networking with a null/offline implementation is the industry-standard pattern for testable game networking. See `research/godot-o3de-engine-analysis.md`.

---

---
