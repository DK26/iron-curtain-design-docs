## D017: Bevy Rendering Pipeline — Classic Base, Modding Possibilities

**Revision note (2026-02-22):** Clarified hardware-accessibility and feature-tiering intent: Bevy's advanced rendering/3D capabilities are optional infrastructure, not baseline requirements. The default game path remains classic 2D isometric rendering with aggressive low-end fallbacks for non-gaming hardware / integrated GPUs.

**Decision:** Use Bevy's rendering pipeline (wgpu) to faithfully reproduce the classic Red Alert isometric aesthetic. Bevy's more advanced rendering capabilities (shaders, post-processing, dynamic lighting, particles, 3D) are available as optional modding infrastructure — not as base game goals or baseline hardware requirements.

**Rationale:**
- The core rendering goal is a faithful classic Red Alert clone: isometric sprites, palette-aware shading, fog of war
- Bevy + wgpu provides this solidly via 2D sprite batching and the isometric layer
- Because Bevy includes a full rendering pipeline, advanced visual capabilities (bloom, color grading, GPU particles, dynamic lighting, custom shaders) are **passively available** to modders without extra engine work
- This enables community-created visual enhancements: shader effects for chrono-shift, tesla arcs, weather particles, or even full 3D rendering mods (see D018, `02-ARCHITECTURE.md` § "3D Rendering as a Mod")
- Render quality tiers (Baseline → Ultra) automatically degrade for older hardware — the base classic aesthetic works on all tiers, including no-dedicated-GPU systems that only meet the downlevel GL/WebGL path

**Hardware intent (important):** "Optional 3D" means the game's **core experience** must remain fully playable without Bevy's advanced 3D/post-FX stack. 3D render modes and heavy visual effects are additive. If the device cannot support them, the player still gets the complete game in classic 2D mode.

**Scope:**
- Phase 1: faithful isometric tile renderer, sprite animation, shroud, camera — showcase optional post-processing prototypes to demonstrate modding potential
- Phase 3+: rendering supports whatever the game chrome needs
- Phase 7: visual modding infrastructure (particle systems, shader library, weather rendering) — tools for modders, not base game goals

**Design principle:** The base game looks like Red Alert. Modders can make it look like whatever they want.
