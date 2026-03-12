## D003: Data Format — Real YAML, Not MiniYAML

**Decision:** Use standard spec-compliant YAML with `serde_yaml`. Not OpenRA's MiniYAML.

**Rationale:**
- Standard YAML parsers, linters, formatters, editor support all work
- `serde_yaml` → typed Rust struct deserialization for free
- JSON-schema validation catches errors before game loads
- No custom parser to maintain
- Inheritance resolved at load time as a processing pass, not a parser feature

**Alternatives considered:**
- MiniYAML as-is (rejected — custom parser, no tooling support, not spec-compliant)
- TOML (rejected — awkward for deeply nested game data)
- RON (rejected — modders won't know it, thin editor support)
- JSON (rejected — too verbose, no comments)

**Migration:** `cnc-formats convert --from miniyaml --to yaml` CLI subcommand (behind `miniyaml` feature flag, MIT/Apache-2.0) converts MiniYAML files to standard YAML on disk (`--from` auto-detected from extension when unambiguous; `--to` always required). `ra-formats` wraps the same parser for IC's runtime auto-conversion pipeline (D025).
