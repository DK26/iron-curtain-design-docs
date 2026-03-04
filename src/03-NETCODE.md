# 03 — Network Architecture

**Keywords:** netcode, relay lockstep, `NetworkModel`, sub-tick timestamps, reconnection, desync debugging, replay determinism, compatibility bridge, ranked authority, relay server

Iron Curtain ships **one default gameplay netcode**: relay-assisted deterministic lockstep with sub-tick order fairness. The `NetworkModel` trait enables clean single-player, replay, and future architecture modes. Key influences: Counter-Strike 2 (sub-tick timestamps), C&C Generals/Zero Hour (adaptive run-ahead), Valve GNS (message lanes), OpenTTD (desync debugging).

---

## Section Index

| Section                         | Description                                                                                               | File                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Protocol & Overview**         | Netcode philosophy, `ic-protocol` crate types (`PlayerOrder`, `TimestampedOrder`, `TickOrders`)           | [protocol](netcode/protocol.md)                                 |
| **Relay Architecture**          | Relay with time authority, `RelayCore` library (dedicated/listen server), connection lifecycle type state | [relay-architecture](netcode/relay-architecture.md)             |
| **Sub-Tick Timing & Fairness**  | CS2-inspired sub-tick ordering, adaptive run-ahead (Generals), anti-lag-switch, order rate control        | [sub-tick-timing](netcode/sub-tick-timing.md)                   |
| **Wire Format & Message Lanes** | Frame data resilience, delta-compressed TLV wire format (Generals), priority message lanes (Valve GNS)    | [wire-format](netcode/wire-format.md)                           |
| **Desync Detection & Recovery** | Dual-mode state hashing, desync diagnosis tools, disconnect handling, reconnection, visual prediction     | [desync-recovery](netcode/desync-recovery.md)                   |
| **Why It Feels Faster**         | Latency comparison vs OpenRA — sub-tick, adaptive run-ahead, visual prediction                            | [why-faster](netcode/why-faster.md)                             |
| **NetworkModel Trait**          | Trait definition, implementations (relay/local/replay/fog-auth), deferred architectures, `OrderCodec`     | [network-model-trait](netcode/network-model-trait.md)           |
| **Development Tools**           | `LatencySimulator`, `DesyncInjector`, `PacketRecorder` for testing                                        | [dev-tools](netcode/dev-tools.md)                               |
| **Connection Establishment**    | Handshake flow, relay signaling, NAT traversal, WebSocket/WebRTC for browser                              | [connection-establishment](netcode/connection-establishment.md) |
| **Tracking Servers & Backend**  | Game browser, server discovery (HTTPS seed + mDNS), backend infrastructure (tracking + relay)             | [tracking-backend](netcode/tracking-backend.md)                 |
| **Match Lifecycle**             | Lobby → loading → tick processing → pause → disconnect → desync → replay → post-game                      | [match-lifecycle](netcode/match-lifecycle.md)                   |
| **Multi-Player Scaling**        | Beyond 2 players: team games, FFA, observers, co-op, asymmetric player counts                             | [multiplayer-scaling](netcode/multiplayer-scaling.md)           |
| **System Wiring**               | Integration proof: how `GameLoop`, `NetworkModel`, sim, and render connect in Bevy                        | [system-wiring](netcode/system-wiring.md)                       |
