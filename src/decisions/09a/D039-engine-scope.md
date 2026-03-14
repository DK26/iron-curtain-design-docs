## D039: Engine Scope — General-Purpose Classic RTS Platform

**Decision:** Iron Curtain is a general-purpose classic RTS engine. It ships with built-in C&C game modules (Red Alert, Tiberian Dawn) as its primary content, but at the architectural level, the engine's design does not prevent building any classic RTS — from C&C to Age of Empires to StarCraft to Supreme Commander to original games.

**The framing:** Built for C&C, open to anything. C&C games and the OpenRA community remain the primary audience, the roadmap, and the compatibility target. What changes is how we think about the underlying engine: nothing in the engine core should assume a specific resource model, base building model, camera system, or UI layout. These are all game module concerns.

**What this means concretely:**
1. **Red Alert and Tiberian Dawn are built-in mods** — they ship with the engine, like OpenRA bundles RA/TD/D2K. The engine launches into RA1 by default. Other game modules are selectable from a mod menu
2. **Crate naming reflects engine identity** — engine crates use `ic-*` (Iron Curtain), not `ra-*`. The exception is `ra-formats` which genuinely reads C&C/Red Alert file formats. If someone builds an AoE game module, they'd write their own format reader
3. **`GameModule` (D018) becomes the central abstraction** — the trait defines everything that differs between RTS games: resource model, building model, camera, pathfinding implementation, UI layout, tech progression, population model
4. **OpenRA experience as a composable profile** — D019 (balance) + D032 (themes) + D033 (QoL) combine into "experience profiles." "OpenRA" is a profile: OpenRA balance values + Modern theme + OpenRA QoL conventions. "Classic RA" is another profile. Each is a valid interpretation of the same game module
5. **The C&C variety IS the architectural stress test** — across the franchise (TD, RA1, TS, RA2, Generals, C&C3, RA3, C&C4, Renegade), C&C games already span harvester/supply/streaming/zero-resource economies, sidebar/dozer/crawler building, 2D/3D cameras, grid/navmesh pathing, FPS/RTS hybrids. If the engine supports every C&C game, it inherently supports most classic RTS patterns

**What this does NOT mean:**
- We don't dilute the C&C focus. RA1 is the default module, TD ships alongside it. The roadmap doesn't change
- We don't build generic RTS features that no C&C game needs. Non-C&C capability is an architectural property, not a deliverable
- We don't de-prioritize OpenRA community compatibility. D023–D027 are still critical
- We don't build format readers for non-C&C games. That's community work on top of the engine

**Why "any classic RTS" and not "strictly C&C":**
- The C&C franchise already spans such diverse mechanics that supporting it fully means supporting most classic RTS patterns anyway
- Artificial limitations on non-C&C use would require extra code to enforce — it's harder to close doors than to leave them open
- A community member building "StarCraft in IC" exercises and validates the same `GameModule` API that a community member building "RA2 in IC" uses. Both make the engine more robust
- Westwood's philosophy was engine-first: the same engine technology powered vastly different games. IC follows this spirit
- Cancelled C&C games (Tiberium FPS, Generals 2, C&C Arena) and fan concepts exist in the space between "strictly C&C" and "any RTS" — the community should be free to explore them

**Validation from OpenRA mod ecosystem:** Three OpenRA mods serve as acid tests for game-agnostic claims (see `research/openra-mod-architecture-analysis.md` for full analysis):

- **OpenKrush (KKnD):** The most rigorous test. KKnD shares almost nothing with C&C: different resource model (oil patches, not ore), per-building production (no sidebar), different veterancy (kills-based, not XP), different terrain, 15+ proprietary binary formats with zero C&C overlap. OpenKrush replaces **16 complete mechanic modules** to make it work on OpenRA. In IC, every one of these would go through `GameModule` — validating that the trait covers the full range of game-specific concerns.
- **OpenSA (Swarm Assault):** A non-RTS-shaped game on an RTS engine — living world simulation with plant growth, creep spawners, pirate ants, colony capture. No base building, no sidebar, no harvesting. Tests whether the engine gracefully handles the *absence* of C&C systems, not just replacement.
- **d2 (Dune II):** The C&C ancestor, but with single-unit selection, concrete prerequisites, sandworm hazards, and starport variable pricing — mechanics so archaic they test backward-compatibility of the `GameModule` abstraction.

**Alternatives considered:**
- C&C-only scope (rejected — artificially limits what the community can create, while the architecture already supports broader use)
- "Any game" scope (rejected — too broad, dilutes C&C identity. Classic RTS is the right frame)
- No scope declaration (rejected — ambiguity about what game modules are welcome leads to confusion)

**Phase:** Baked into architecture from Phase 0 (via D018 and Invariant #9). This decision formalizes what D018 already implied and extends it.
