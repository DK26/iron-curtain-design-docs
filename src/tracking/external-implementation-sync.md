# External Implementation Repo Sync Policy

> **Canonical reference for:** Keeping design docs aligned with external implementation repos (`cnc-formats`, `fixed-game-math`, `deterministic-rng`, future Tier 2–3 crates).

## Problem Statement

Design docs define capabilities for external standalone crates, but implementation proceeds in separate Git repositories by independent agents. Design divergence accumulates silently when capabilities are added to implementation repos without updating the corresponding design docs.

This policy codifies the sync points — what must trigger a design-doc update, where to update, and how to detect drift.

## Sync Triggers

A design-doc update is required when any external implementation repo introduces:

| Change Type | What to Update | Example |
| --- | --- | --- |
| New public function/type/trait | D076 § Rust Types | `lcw::compress()`, `VqaEncodeParams` |
| New feature flag | D076 § feature flag docs, Crate Design Principles | `cli`, `convert` |
| New CLI subcommand or flag | D076 § CLI subcommand roadmap | `--format` flag, binary format conversions |
| Encoding/write capability | 05-FORMATS.md § Crate Goals, D076 § module table | SHP encoder, AUD encoder, VQA encoder |
| New format support | 05-FORMATS.md § format tables | AVI interchange format |
| Capability moved between crates | 05-FORMATS.md § crate split | Encoding in cnc-formats vs ra-formats |
| New dependency added | D076 § Crate Design Principles | `png`, `hound`, `gif`, `clap` |

## Crate-to-Design-Doc Mapping

| External Crate | Primary Design Docs | Key Sections |
| --- | --- | --- |
| `cnc-formats` | `src/05-FORMATS.md`, `src/decisions/09a/D076-standalone-crates.md`, `src/formats/binary-codecs.md` | Format tables, Crate Goals, CLI roadmap, Rust Types, module allocation table |
| `fixed-game-math` | `src/decisions/09a/D076-standalone-crates.md`, `research/fixed-point-math-design.md` | Tier 1 table, Rust Types |
| `deterministic-rng` | `src/decisions/09a/D076-standalone-crates.md` | Tier 1 table, Rust Types |
| Future Tier 2–3 | `src/decisions/09a/D076-standalone-crates.md` | Respective tier tables |

## Encoding/Write Capability Attribution Rules

The design docs historically assumed all encoding belonged in `ra-formats` (GPL, Phase 6a, EA-derived). Implementation has shown that clean-room encoding is feasible in permissive crates. The attribution rule is:

- **`cnc-formats` (MIT/Apache-2.0):** Clean-room encoders for all standard algorithms (LCW compression, IMA ADPCM encoding, VQ codebook generation, SHP frame assembly). These use publicly documented algorithms with no EA source code references. Sufficient for community tools, round-trip conversion, and Asset Studio basic functionality.
- **`ra-formats` (GPL v3):** EA-derived encoder enhancements that reference GPL source code for pixel-perfect original-game-format matching, plus encrypted `.mix` packing (Blowfish key derivation + SHA-1 body digest). Only needed when exact-match reproduction of original game file bytes is required.

When updating format table rows, annotate which crate provides read vs. write:
- "Read: cnc-formats, Write: cnc-formats (clean-room) + ra-formats (EA-enhanced)"

## Drift Detection Workflow

When working on design docs that reference external crate capabilities:

1. **Before reinforcing a crate attribution**, check the actual crate's public API (GitHub source or crate docs). The design doc may be stale.
2. **When reviewing a design doc for accuracy**, compare:
   - D076 § Rust Types against the crate's actual `pub` items
   - D076 § feature flags against `Cargo.toml` `[features]`
   - D076 § CLI roadmap against the crate's binary source
   - 05-FORMATS.md § Crate Goals against implemented capabilities
3. **When a gap is found**, file an issue in this repo (label: `documentation`, `cnc-formats` or relevant crate name) cataloging the discrepancy.

## Integration with Implementation Repo AGENTS.md

Each external crate's AGENTS.md should include a reciprocal rule:

> When adding new public APIs, feature flags, encoding capabilities, or CLI changes, check whether the design docs (especially D076 and 05-FORMATS.md) need updating. If they do, file an issue in the design-docs repo.

This creates a bidirectional sync obligation: design-docs agents check implementation repos before writing, and implementation-repo agents flag design-doc gaps when they create new capabilities.
