## D025: Runtime MiniYAML Loading

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 0 (format loading foundation)
- **Execution overlay mapping:** `M0.CORE.FORMAT_FOUNDATION` (P-Core); `M1.CORE.FORMAT_LOADING` (runtime path)
- **Deferred features / extensions:** none
- **Canonical for:** MiniYAML auto-detection, runtime conversion, and the `cnc-formats convert` CLI subcommand
- **Scope:** `ra-formats` crate (runtime auto-conversion), `cnc-formats` crate (CLI `convert` subcommand)
- **Decision:** MiniYAML files load directly at runtime via auto-detection and in-memory conversion. No pre-conversion step is required. The `cnc-formats convert --format miniyaml --to yaml` CLI subcommand is also provided for permanent on-disk migration (`--format` auto-detected from extension when unambiguous; `--to` always required).
- **Why:**
  - Zero-friction import of existing OpenRA mods (drop a mod folder in, play immediately)
  - Pre-conversion would add a mandatory setup step that deters casual modders
  - Runtime cost is small (~10â€“50ms per mod file, cached after first parse)
  - Permanent converter still available for modders who want clean YAML going forward
- **Non-goals:** Maintaining MiniYAML as a first-class authoring format. IC-native content uses standard YAML. MiniYAML is a compatibility input, not an output.
- **Invariants preserved:** Deterministic sim (parsing produces identical output regardless of input format). No network or I/O in `ic-sim`.
- **Performance impact:** ~10â€“50ms per mod file on first load; result cached for session. Negligible for gameplay.
- **Public interfaces / types / commands:** `cnc-formats` CLI (`validate`/`inspect`/`convert` subcommands, ships with crate), `cnc_formats::miniyaml::parse()` (clean-room parser, MIT/Apache-2.0), `ra_formats::detect_format()` (IC integration layer)
- **Affected docs:** `02-ARCHITECTURE.md` Â§ Data Format, `04-MODDING.md` Â§ MiniYAML Migration, `05-FORMATS.md`
- **Keywords:** MiniYAML, runtime loading, auto-conversion, format detection, cnc-formats CLI, OpenRA compatibility

---

### Auto-Detection Algorithm

When `ra-formats` loads a `.yaml` file, it inspects the first non-empty lines:

1. **Tab-indented content** (MiniYAML uses tabs; standard YAML uses spaces)
2. **`^` inheritance markers** (MiniYAML-specific syntax for trait inheritance)
3. **`@` suffixed keys** (MiniYAML-specific syntax for merge semantics)

If any of these markers are detected, the file routes through the MiniYAML parser instead of `serde_yaml`. The MiniYAML parser produces an intermediate tree, resolves aliases (D023), and outputs typed Rust structs identical to what the standard YAML path produces.

```
.yaml file â†’ Format detection
               â”‚
               â”œâ”€ Standard YAML â†’ serde_yaml parse â†’ Rust structs
               â”‚
               â””â”€ MiniYAML detected
                   â”œâ”€ MiniYAML parser (tabs, ^, @)
                   â”œâ”€ Intermediate tree
                   â”œâ”€ Alias resolution (D023)
                   â””â”€ Rust structs (identical output)
```

Both paths produce identical output. The runtime conversion adds ~10â€“50ms per mod file on first load; results are cached for the remainder of the session.

#### Rust API

```rust
// cnc-formats (MIT/Apache-2.0) â€” clean-room MiniYAML parser (behind `miniyaml` feature flag)
#[cfg(feature = "miniyaml")]
pub mod miniyaml {
    /// Parse MiniYAML text into a format-agnostic node tree.
    pub fn parse(input: &str) -> Result<Vec<MiniYamlNode>, ParseError>;

    /// Convert a MiniYAML node tree to standard YAML string.
    pub fn to_yaml(nodes: &[MiniYamlNode]) -> String;

    pub struct MiniYamlNode {
        pub key: String,
        pub value: Option<String>,
        pub children: Vec<MiniYamlNode>,
        pub comment: Option<String>,
    }
}

// ra-formats (GPL v3) â€” IC integration layer for runtime auto-detection
/// Detect whether a `.yaml` file contains standard YAML or MiniYAML.
/// Returns the detected format for routing to the correct parser.
pub fn detect_format(content: &str) -> DetectedFormat;

pub enum DetectedFormat {
    /// Standard YAML â€” route to `serde_yaml`.
    StandardYaml,
    /// MiniYAML â€” route through `cnc_formats::miniyaml::parse()` + alias resolution (D023).
    MiniYaml {
        /// Which markers triggered detection (for diagnostics).
        markers: Vec<MiniYamlMarker>,
    },
}

pub enum MiniYamlMarker {
    TabIndentation,       // MiniYAML uses tabs; standard YAML uses spaces
    InheritancePrefix,    // `^` prefix on keys
    MergeSuffix,          // `@` suffix on keys
}
```

### Alternatives Considered

| Alternative                              | Verdict  | Reason                                                                                       |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| Require pre-conversion                   | Rejected | Adds a setup step; deters casual modders who just want to try IC with existing content       |
| Support MiniYAML as first-class format   | Rejected | Maintaining two YAML dialects long-term increases parser complexity and documentation burden |
| Runtime conversion with caching (chosen) | Accepted | Best balance: zero friction for users, clean YAML for new content, negligible runtime cost   |
