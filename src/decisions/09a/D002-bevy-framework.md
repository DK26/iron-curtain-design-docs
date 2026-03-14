## D002: Framework — Bevy (REVISED from original "No Bevy" decision)

**Decision:** Use Bevy as the game framework.

**Original decision:** Custom library stack (winit + wgpu + hecs). This was overridden.

**Why the reversal:**
- The 2-4 months building engine infrastructure (sprite batching, cameras, audio, input, asset pipeline, hot reload) is time NOT spent on the sim, netcode, and modding — the things that differentiate this project
- Bevy's ECS IS our architecture — no "fighting two systems." OpenRA traits map directly to Bevy components
- `FixedUpdate` + `.chain()` gives deterministic sim scheduling natively
- Bevy's plugin system makes pluggable networking cleaner than the original trait-based design
- Headless mode (`MinimalPlugins`) for dedicated servers is built in
- WASM/browser target is tested by community
- `bevy_reflect` enables advanced modding capabilities
- Breaking API changes are manageable: pin version per phase, upgrade between phases

**Risk mitigation:**
- Breaking changes → version pinning per development phase
- Not isometric-specific → build isometric layer on Bevy's 2D (still less work than raw wgpu)
- Performance concerns → Bevy uses rayon internally, `par_iter()` for data parallelism, and allows custom render passes and SIMD where needed

**Alternatives considered:**

*Godot (rejected):*

Godot is a mature, MIT-licensed engine with excellent tooling (editor, GDScript, asset pipeline). However, it does not fit IC's architecture:

| Requirement                      | Bevy                                                                    | Godot                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Language (D001)                  | Rust-native — IC systems are Bevy systems, no boundary crossing         | C++ engine. Rust logic via GDExtension adds a C ABI boundary on every engine call                |
| ECS for 500+ units               | Flat archetypes, cache-friendly iteration, `par_iter()`                 | Scene tree (node hierarchy). Hundreds of RTS units as Nodes fight cache coherence. No native ECS |
| Deterministic sim (Invariant #1) | `FixedUpdate` + `.chain()` — explicit, documented system ordering       | `_physics_process()` order depends on scene tree position — harder to guarantee across versions  |
| Headless server                  | `MinimalPlugins` — zero rendering, zero GPU dependency                  | Can run headless but designed around rendering. Heavier baseline                                 |
| Crate structure                  | Each `ic-*` crate is a Bevy plugin. Clean `Cargo.toml` dependency graph | Each module would be a GDExtension shared library with C ABI marshalling overhead                |
| WASM browser target              | Community-tested. Rust code compiles to WASM directly                   | WASM export includes the entire C++ runtime (~40 MB+)                                            |
| Modding (D005)                   | WASM mods call host functions directly. Lua via `mlua` in-process       | GDExtension → C ABI → Rust → WASM chain. Extra indirection                                       |
| Fixed-point math (D009)          | Systems operate on IC's `i32`/`i64` types natively                      | Physics uses `float`/`double` internally. IC would bypass engine math entirely                   |

Using Godot would mean writing all simulation logic in Rust via GDExtension, bypassing Godot's physics/math/networking, building a custom editor anyway (D038), and using none of GDScript. At that point Godot becomes expensive rendering middleware with a C ABI tax — Bevy provides the same rendering capabilities (wgpu) without the boundary. Godot's strengths (mature editor, GDScript rapid prototyping, scene tree composition) serve adventure and platformer games well but are counterproductive for flat ECS simulation of hundreds of units.

IC borrows interface design patterns from Godot — pluggable `MultiplayerAPI` validates IC's `NetworkModel` trait (D006), "editor is the engine" validates `ic-editor` as a Bevy app (D038), and the separate proposals repository informs governance (D037) — but these are architectural lessons, not reasons to adopt Godot as a runtime. See `research/godot-o3de-engine-analysis.md` for the full analysis.

*Custom library stack — winit + wgpu + hecs (original decision, rejected):*

The original plan avoided framework lock-in by assembling individual crates. Rejected because 2-4 months of infrastructure work (sprite batching, cameras, audio, input, asset pipeline) delays the differentiating features (sim, netcode, modding). Bevy provides all of this with a compatible ECS architecture.
