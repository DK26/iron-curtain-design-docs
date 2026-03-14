## D004: Modding — Lua (Not Python) for Scripting

**Decision:** Use Lua for Tier 2 scripting. Do NOT use Python.

**Rationale against Python:**
- Floating-point non-determinism breaks lockstep multiplayer
- GC pauses (reintroduces the problem Rust solves)
- 50-100x slower than native (hot paths run every tick for every unit)
- Embedding CPython is heavy (~15-30MB)
- Sandboxing is unsolvable — security disaster for community mods

**Rationale for Lua:**
- Tiny runtime (~200KB), designed for embedding
- Deterministic (provide fixed-point bindings, avoid floats)
- Trivially sandboxable (control available functions)
- Industry standard: Factorio, WoW, Dota 2, Roblox
- `mlua`/`rlua` crates are mature
- Any modder can learn in an afternoon
