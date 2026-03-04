# 04 — Modding System

**Keywords:** modding, YAML Lua WASM tiers, `ic mod` CLI, mod profiles, virtual namespace, Workshop packages, campaigns, export, compatibility, OpenRA mod migration, selective install

## Three-Tier Architecture

```
Ease of use ▲
             │  ┌─────────────────────────┐
             │  │  YAML rules / data       │  ← 80% of mods (Tier 1)
             │  │  (units, weapons, maps)  │
             │  ├─────────────────────────┤
             │  │  Lua scripts             │  ← missions, AI, abilities (Tier 2)
             │  │  (event hooks, triggers) │
             │  ├─────────────────────────┤
             │  │  WASM modules            │  ← new mechanics, total conversions (Tier 3)
             │  │  (Rust/C/AssemblyScript) │
             │  └─────────────────────────┘
Power      ▼
```

Each tier is optional. A modder who wants to change tank cost never sees code. A modder building a total conversion uses WASM.

**Tier coverage validated by OpenRA mods:** Analysis of six major OpenRA community mods (see `research/openra-mod-architecture-analysis.md`) confirms the 80/20 split and reveals precise boundaries between tiers. YAML (Tier 1) covers unit stats, weapon definitions, faction variants, inheritance overrides, and prerequisite trees. But every mod that goes beyond stat changes — even faction reskins — eventually needs code (C# in OpenRA, WASM in IC). The validated breakdown:

- **60–80% YAML** — Values, inheritance trees, faction variants, prerequisite DAGs, veterancy tables, weapon definitions, visual sequences. Some mods (Romanovs-Vengeance) achieve substantial new content purely through YAML template extension.
- **15–30% code** — Custom mechanics (mind control, temporal weapons, mirage disguise, new locomotors), custom format loaders, replacement production systems, and world-level systems (radiation layers, weather). In IC, this is Tier 2 (Lua for scripting) and Tier 3 (WASM for mechanics).
- **5–10% engine patches** — OpenRA mods sometimes require forking the engine (e.g., OpenKrush replaces 16 complete mechanic modules). IC's Tier 3 WASM modules + trait abstraction (D041) are designed to eliminate this need entirely — no fork, ever.

---

## Section Index

| Section                      | Description                                                                                                                                          | File                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Tier 1: YAML Rules**       | Data-driven modding: YAML syntax, inheritance, OpenRA compatibility (D003/D023/D025/D026), hot-reload, actor definitions, weapons, prerequisites     | [yaml-rules](modding/yaml-rules.md)           |
| **Tier 2: Lua Scripting**    | Mission scripting, event hooks, triggers, OpenRA Lua API superset (D024), sandboxing, deterministic execution                                        | [lua-scripting](modding/lua-scripting.md)     |
| **Tier 3: WASM Modules**     | Total conversion power: component registration, lifecycle hooks, spatial queries, WASM API, deterministic constraints, cross-language support (D005) | [wasm-modules](modding/wasm-modules.md)       |
| **Tera Templating**          | Template-driven YAML generation for faction variants, balance matrices, veterancy tables (D014). Load-time only, optional                            | [tera-templating](modding/tera-templating.md) |
| **Resource Packs**           | Selective asset replacement: sprites, audio, music, video, UI themes. Priority-layered loading, format conversion                                    | [resource-packs](modding/resource-packs.md)   |
| **Campaign System**          | Branching mission graphs, persistent state, unit roster carryover, hero progression, Lua campaign API (D021)                                         | [campaigns](modding/campaigns.md)             |
| **Workshop**                 | Federated resource registry, P2P distribution (D049), semver deps (D030), moderation, creator reputation, Steam integration                          | [workshop](modding/workshop.md)               |
| **Mod SDK & Dev Experience** | `ic` CLI, project scaffolding, hot-reload workflow, validation, OpenRA mod migration, SDK application (D020)                                         | [mod-sdk](modding/mod-sdk.md)                 |
| **LLM-Readable Metadata**    | `llm:` metadata blocks for AI-assisted mod authoring, balance analysis, documentation generation (D016)                                              | [llm-metadata](modding/llm-metadata.md)       |
| **Mod API Stability**        | Versioning strategy, deprecation warnings, compatibility adapters, `ic mod migrate` CLI, Migration Workbench                                         | [api-stability](modding/api-stability.md)     |
