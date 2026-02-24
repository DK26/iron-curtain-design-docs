## D025: Runtime MiniYAML Loading

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 0 (format loading foundation)
- **Execution overlay mapping:** `M0.CORE.FORMAT_FOUNDATION` (P-Core); `M1.CORE.FORMAT_LOADING` (runtime path)
- **Deferred features / extensions:** none
- **Canonical for:** MiniYAML auto-detection, runtime conversion, and the `miniyaml2yaml` CLI tool
- **Scope:** `ra-formats` crate, `ic` CLI
- **Decision:** MiniYAML files load directly at runtime via auto-detection and in-memory conversion. No pre-conversion step is required. A `miniyaml2yaml` CLI tool is also provided for permanent migration.
- **Why:**
  - Zero-friction import of existing OpenRA mods (drop a mod folder in, play immediately)
  - Pre-conversion would add a mandatory setup step that deters casual modders
  - Runtime cost is small (~10–50ms per mod file, cached after first parse)
  - Permanent converter still available for modders who want clean YAML going forward
- **Non-goals:** Maintaining MiniYAML as a first-class authoring format. IC-native content uses standard YAML. MiniYAML is a compatibility input, not an output.
- **Invariants preserved:** Deterministic sim (parsing produces identical output regardless of input format). No network or I/O in `ic-sim`.
- **Performance impact:** ~10–50ms per mod file on first load; result cached for session. Negligible for gameplay.
- **Public interfaces / types / commands:** `miniyaml2yaml` CLI command, `ra_formats::miniyaml::parse()`, `ra_formats::detect_format()`
- **Affected docs:** `02-ARCHITECTURE.md` § Data Format, `04-MODDING.md` § MiniYAML Migration, `05-FORMATS.md`
- **Keywords:** MiniYAML, runtime loading, auto-conversion, format detection, miniyaml2yaml, OpenRA compatibility

---

### Auto-Detection Algorithm

When `ra-formats` loads a `.yaml` file, it inspects the first non-empty lines:

1. **Tab-indented content** (MiniYAML uses tabs; standard YAML uses spaces)
2. **`^` inheritance markers** (MiniYAML-specific syntax for trait inheritance)
3. **`@` suffixed keys** (MiniYAML-specific syntax for merge semantics)

If any of these markers are detected, the file routes through the MiniYAML parser instead of `serde_yaml`. The MiniYAML parser produces an intermediate tree, resolves aliases (D023), and outputs typed Rust structs identical to what the standard YAML path produces.

```
.yaml file → Format detection
               │
               ├─ Standard YAML → serde_yaml parse → Rust structs
               │
               └─ MiniYAML detected
                   ├─ MiniYAML parser (tabs, ^, @)
                   ├─ Intermediate tree
                   ├─ Alias resolution (D023)
                   └─ Rust structs (identical output)
```

Both paths produce identical output. The runtime conversion adds ~10–50ms per mod file on first load; results are cached for the remainder of the session.

### Alternatives Considered

| Alternative | Verdict | Reason |
|-------------|---------|--------|
| Require pre-conversion | Rejected | Adds a setup step; deters casual modders who just want to try IC with existing content |
| Support MiniYAML as first-class format | Rejected | Maintaining two YAML dialects long-term increases parser complexity and documentation burden |
| Runtime conversion with caching (chosen) | Accepted | Best balance: zero friction for users, clean YAML for new content, negligible runtime cost |
