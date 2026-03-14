# Testing Strategy & CI/CD Pipeline

This document defines the automated testing infrastructure for Iron Curtain. Every design feature must map to at least one automated verification method. Testing is not an afterthought — it is a design constraint.

## Guiding Principles

1. **Determinism is testable.** If a system is deterministic (Invariant #1), its behavior can be reproduced exactly. Tests that rely on determinism are the strongest tests we have.
2. **No untested exit criteria.** Every milestone exit criterion (see 18-PROJECT-TRACKER.md) must have a corresponding automated test. If a criterion cannot be tested automatically, it must be flagged as a manual review gate.
3. **CI is the automated authority.** If CI fails, the code does not merge — no exceptions, no "it works on my machine." When manual review gates exist (Principle 2), both CI and the manual gate must pass before the code is shippable.
4. **Fast feedback, thorough verification.** PR gates must complete in <10 minutes. Nightly suites handle expensive verification. Weekly suites cover exhaustive/long-running scenarios.

## CI/CD Pipeline Tiers

### Tier 1: PR Gate (every pull request, <10 min)

| Test Category           | What It Verifies                                                       | Tool / Framework         |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------ |
| `cargo clippy --all`    | Lint compliance, `disallowed_types` enforcement (see coding standards) | clippy                   |
| `cargo test`            | Unit tests across all crates                                           | cargo test               |
| `cargo fmt --check`     | Formatting consistency                                                 | rustfmt                  |
| Determinism smoke test  | 100-tick sim with fixed seed → hash match across runs                  | custom harness           |
| WASM sandbox smoke test | Basic WASM module load/execute/capability check                        | custom harness           |
| Lua sandbox smoke test  | Basic Lua script load/execute/resource-limit check                     | custom harness           |
| YAML schema validation  | All game data YAML files pass schema validation                        | custom validator         |
| `strict-path` boundary  | Path boundary enforcement for all untrusted-input APIs                 | unit tests               |
| Build (all targets)     | Cross-compilation succeeds (Linux, Windows, macOS)                     | cargo build / CI matrix  |
| Doc link check          | All internal doc cross-references resolve                              | mdbook build + linkcheck |

**Gate rule:** All Tier 1 tests must pass. Merge is blocked on any failure.

### Tier 2: Post-Merge (after merge to main, <30 min)

| Test Category           | What It Verifies                                              | Tool / Framework                  |
| ----------------------- | ------------------------------------------------------------- | --------------------------------- |
| Integration tests       | Cross-crate interactions (ic-sim ↔ ic-game ↔ ic-script)       | cargo test --features integration |
| Determinism full suite  | 10,000-tick sim with 8 players, all unit types → hash match   | custom harness                    |
| Network protocol tests  | Lobby join/leave, relay handshake, reconnection, session auth | custom harness + tokio            |
| Replay round-trip       | Record game → playback → hash match with original             | custom harness                    |
| Workshop package verify | Package build → sign → upload → download → verify chain       | custom harness                    |
| Anti-cheat smoke test   | Known-cheat replay → detection fires; known-clean → no flag   | custom harness                    |
| Memory safety (Miri)    | Undefined behavior detection in unsafe blocks                 | cargo miri test                   |

**Gate rule:** Failures trigger automatic revert of the merge commit and notification to the PR author.

### Tier 3: Nightly (scheduled, <2 hours)

| Test Category              | What It Verifies                                                | Tool / Framework       |
| -------------------------- | --------------------------------------------------------------- | ---------------------- |
| Fuzz testing               | `ra-formats` parser, YAML loader, network protocol deserializer | cargo-fuzz / libFuzzer |
| Property-based testing     | Sim invariants hold across random order sequences               | proptest               |
| Performance benchmarks     | Tick time, memory allocation, pathfinding cost vs budget        | criterion              |
| Zero-allocation assertion  | Hot-path functions allocate 0 heap bytes in steady state        | custom allocator hook  |
| Sandbox escape tests       | WASM module attempts all known escape vectors → all blocked     | custom harness         |
| Lua resource exhaustion    | `string.rep` bomb, infinite loop, memory bomb → all caught      | custom harness         |
| Desync injection           | Deliberately desync one client → detection fires within N ticks | custom harness         |
| Cross-platform determinism | Same scenario on Linux + Windows → identical hash               | CI matrix comparison   |
| Unicode/BiDi sanitization  | RTL/BiDi QA corpus (rtl-bidi-qa-corpus.md) categories A–I       | custom harness         |
| Display name validation    | UTS #39 confusable corpus → all impersonation attempts blocked  | custom harness         |
| Save/load round-trip       | Save game → load → continue 1000 ticks → hash matches fresh run | custom harness         |

**Gate rule:** Failures create high-priority issues. Regressions in performance benchmarks block the next release.

### Tier 4: Weekly (scheduled, <8 hours)

| Test Category           | What It Verifies                                                      | Tool / Framework            |
| ----------------------- | --------------------------------------------------------------------- | --------------------------- |
| Campaign playthrough    | Full campaign mission sequence completes without crash/desync         | automated playback          |
| Extended fuzz campaigns | 1M+ iterations per fuzzer target                                      | cargo-fuzz                  |
| Network simulation      | Packet loss, latency jitter, partition scenarios                      | custom harness + tc/netem   |
| Load testing            | 8-player game at 1000 units each → tick budget holds                  | custom harness              |
| Anti-cheat model eval   | Full labeled replay corpus → precision/recall vs V54 thresholds       | custom harness              |
| Visual regression       | Key UI screens rendered → pixel diff against baseline                 | custom harness + image diff |
| Workshop ecosystem test | Mod install → load → gameplay → uninstall lifecycle                   | custom harness              |
| Key rotation exercise   | V47 key rotation → old key rejected after grace → new key works       | custom harness              |
| P2P replay attestation  | 4-peer game → replays cross-verified → tampering detected             | custom harness              |
| Desync classification   | Injected platform-bug desync vs cheat desync → correct classification | custom harness              |

**Gate rule:** Failures block release candidates. Weekly results feed into release-readiness dashboard.


---

## Sub-Pages

| Section                          | Topic                                                                                                                    | File                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Infrastructure & Subsystems      | Test infrastructure requirements (harness, benchmarks, fuzz, replay corpus) + 16 subsystem test specifications           | [testing-infrastructure-subsystems.md](testing/testing-infrastructure-subsystems.md)         |
| Properties, Misuse & Integration | Property-based testing (proptest) + API misuse test matrix + integration scenario matrix + measurement/metrics framework | [testing-properties-misuse-integration.md](testing/testing-properties-misuse-integration.md) |
| Coverage & Release               | Coverage mapping (design features to tests) + release criteria + phase rollout                                           | [testing-coverage-release.md](testing/testing-coverage-release.md)                           |
