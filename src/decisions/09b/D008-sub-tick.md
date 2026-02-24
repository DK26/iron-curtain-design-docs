## D008: Sub-Tick Timestamps on Orders

**Revision note (2026-02-22):** Revised to clarify trust semantics. Client-submitted sub-tick timestamps are treated as timing hints. In relay modes, the relay normalizes/clamps them into canonical sub-tick timestamps before broadcast using relay-owned timing calibration and skew bounds. In P2P mode, peers deterministically order by `(sub_tick_time, player_id)` with known fairness limitations.

**Decision:** Every order carries a sub-tick timestamp hint. Orders within a tick are processed in chronological order using a canonical timestamp ordering rule for the active `NetworkModel`.

**Rationale (inspired by CS2):**
- Fairer results for edge cases (two players competing for same resource/building)
- Simple protocol shape (attach integer timestamp hint at input layer); enforcement/canonicalization happens in the network model
- Network model preserves but doesn't depend on timestamps
- If a deferred non-default model ignores timestamps, no breakage

---

---
