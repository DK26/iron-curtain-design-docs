## D014: Templating — Tera

**Decision:** Add Tera template engine for YAML/Lua generation. Core integration in Phase 2–3 (first-party content depends on it). Advanced templating ecosystem (Workshop template distribution, in-game parameter editing UI, complex migration tooling) in Phase 6a.

**Rationale:**
- Eliminates copy-paste for faction variants, bulk unit generation
- Load-time only (zero runtime cost)
- ~50 lines to integrate
- All first-party IC content (balance presets, resource packs, built-in campaigns) is Tera-templated — `.yaml.tera` files are processed at load time, so core Tera support must ship when that content does
- Optional for third-party mods — plain YAML is always valid, and most community content works without templating
