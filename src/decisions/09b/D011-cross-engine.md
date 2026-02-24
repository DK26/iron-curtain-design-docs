## D011: Cross-Engine Play — Community Layer, Not Sim Layer

**Decision:** Cross-engine compatibility targets data/community layer. NOT bit-identical simulation.

**Rationale:**
- Bit-identical sim requires bug-for-bug reimplementation (that's a port, not our engine)
- Community interop is valuable and achievable: shared server browser, maps, mod format
- Applies equally to OpenRA and CnCNet — both are `CommunityBridge` targets (shared game browser, community discovery)
- CnCNet integration is discovery-layer only: IC games use IC relay servers (not CnCNet tunnels), IC rankings are separate (different balance, anti-cheat, match certification)
- Architecture keeps the door open for deeper interop under deferred `M7+`/`M11` work (OrderCodec, SimReconciler, ProtocolAdapter)
- Progressive levels: shared lobby → replay viewing → casual cross-play → competitive cross-play
- Cross-engine live play (Level 2+) is **unranked by default**; trust/anti-cheat capability varies by compatibility level and is documented in `src/07-CROSS-ENGINE.md` ("Cross-Engine Trust & Anti-Cheat Capability Matrix")

---

---
