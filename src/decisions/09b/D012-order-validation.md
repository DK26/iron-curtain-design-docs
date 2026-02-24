## D012: Security — Validate Orders in Sim

**Decision:** Every order is validated inside the simulation before execution. Validation is deterministic.

**Rationale:**
- All clients run same validation → agree on rejections → no desync
- Defense in depth with relay server validation
- Repeated rejections indicate cheating (loggable)
- No separate "anti-cheat" system — validation IS anti-cheat

**Dual error reporting:** Validation produces two categories of rejection, following the pattern used by SC2's order system (see `research/blizzard-github-analysis.md` § Part 4):

1. **Immediate rejection** — the order is structurally invalid or fails preconditions that can be checked at submission time (unit doesn't exist, player doesn't own the unit, ability on cooldown, insufficient resources). The sim rejects the order before it enters the execution pipeline. All clients agree on the rejection deterministically.

2. **Late failure** — the order was valid when submitted but fails during execution (target died between order and execution, path became blocked, build site was occupied by the time construction starts). The order entered the pipeline but the action could not complete. Late failures are normal gameplay, not cheating indicators.

Only *immediate rejections* count toward suspicious-activity tracking. Late failures happen to legitimate players constantly (e.g., two allies both target the same enemy, one kills it before the other's attack lands). SC2 defines 214 distinct `ActionResult` codes for this taxonomy — IC uses a smaller set grouped by category:

```rust
pub enum OrderRejectionCategory {
    Ownership,      // unit doesn't belong to this player
    Resources,      // can't afford
    Prerequisites,  // tech tree not met
    Targeting,      // invalid target type
    Placement,      // can't build there
    Cooldown,       // ability not ready
    Transport,      // transport full / wrong passenger type
    Custom,         // game-module-defined rejection
}
```

---

---
