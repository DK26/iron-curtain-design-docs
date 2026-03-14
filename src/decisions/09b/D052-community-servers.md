## D052 — Community Servers & Signed Credentials

> **Keywords:** community server, signed credential records, SCR, Ed25519, SQLite credential store, moderation, reputation, community review, matchmaking, lobby discovery, P2P resource sharing, key lifecycle, cross-community, transparency log

Federated community servers (relay+ranking+matchmaking). Local SQLite credential files. Ed25519 signed records (not JWT). Community moderation, transparency logs, and cross-community interoperability.

| Section | Topic | File |
|---------|-------|------|
| Overview, Moderation & Credentials | Decision capsule, what is a community server, campaign benchmarks, moderation/reputation/community review (queue, calibration, schema, storage), signed credential records (SCR) | [D052-overview-moderation-credentials.md](D052/D052-overview-moderation-credentials.md) |
| Credential Store & Validation | Community credential store (SQLite schema, tables, indexes, queries), verification flow, server-side validation (what the server signs and why, match result signing, ranking validation, replay certification) | [D052-credential-store-validation.md](D052/D052-credential-store-validation.md) |
| Transparency, Matchmaking & Lobby | Community transparency log, matchmaking design, lobby & room discovery, lobby communication, in-lobby P2P resource sharing | [D052-transparency-matchmaking-lobby.md](D052/D052-transparency-matchmaking-lobby.md) |
| Keys, Operations & Integration | Key lifecycle (player keys, community two-key architecture, rotation, compromise recovery, expiry, revocation, social recovery), cross-community interoperability, operational requirements, alternatives, phase, cross-pollination | [D052-keys-operations-integration.md](D052/D052-keys-operations-integration.md) |
