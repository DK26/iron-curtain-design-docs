## D048: Switchable Render Modes — Classic, HD, and 3D in One Game

**Status:** Accepted
**Scope:** `ic-render`, `ic-game`, `ic-ui`
**Phase:** Phase 2 (render mode infrastructure), Phase 3 (toggle UI), Phase 6a (3D mode mod support)

### The Problem

The C&C Remastered Collection's most iconic UX feature is pressing F1 to instantly toggle between classic 320×200 sprites and hand-painted HD art — mid-game, no loading screen. This isn't just swapping sprites. It's switching the *entire visual presentation*: sprite resolution, palette handling, terrain tiles, shadow rendering, UI chrome, and scaling behavior. The engine already has pieces to support this (resource packs in `04-MODDING.md`, dual asset rendering in D029, `Renderable` trait, `ScreenToWorld` trait, 3D render mods in `02-ARCHITECTURE.md`), but they exist as independent systems with no unified mechanism for "switch everything at once." Furthermore, the current design treats 3D rendering exclusively as a Tier 3 WASM mod that **replaces** the default renderer — there's no concept of a game or mod that ships *both* 2D and 3D views and lets the player toggle between them.

### Decision

Introduce **render modes** as a first-class engine concept. A render mode bundles a rendering backend, camera system, resource pack selection, and visual configuration into a named, instantly-switchable unit. Game modules and mods can register multiple render modes; the player toggles between them with a keybind or settings menu.

### What a Render Mode Is

A render mode composes four concerns that must change together:

| Concern            | What Changes                                                     | Trait / System                        |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------- |
| **Render backend** | Sprite renderer vs. mesh renderer vs. voxel renderer             | `Renderable` impl                     |
| **Camera**         | Isometric orthographic vs. free 3D perspective; zoom range       | `ScreenToWorld` impl + `CameraConfig` |
| **Resource packs** | Which asset set to use (classic `.shp`, HD sprites, GLTF models) | Resource pack selection               |
| **Visual config**  | Scaling mode, palette handling, shadow style, post-FX preset     | `RenderSettings` subset               |

A render mode is NOT a game module. The simulation, pathfinding, networking, balance, and game rules are completely unchanged between modes. Two players in the same multiplayer game can use different render modes — the sim is view-agnostic (this is already an established architectural property).

### Render Mode Registration

Game modules register their supported render modes via the `GameModule` trait:

```rust
pub struct RenderMode {
    pub id: String,                        // "classic", "hd", "3d"
    pub display_name: String,              // "Classic (320×200)", "HD Sprites", "3D View"
    pub render_backend: RenderBackendId,   // Which Renderable impl to use
    pub camera: CameraMode,                // Isometric, Perspective, FreeRotate
    pub camera_config: CameraConfig,       // Zoom range, pan speed (see 02-ARCHITECTURE.md § Camera)
    pub resource_pack_overrides: Vec<ResourcePackRef>, // Per-category pack selections
    pub visual_config: VisualConfig,       // Scaling, palette, shadow, post-FX
    pub keybind: Option<KeyCode>,          // Optional dedicated toggle key
}

pub struct CameraConfig {
    pub zoom_min: f32,                     // minimum zoom (0.5 = zoomed way out)
    pub zoom_max: f32,                     // maximum zoom (4.0 = close-up)
    pub zoom_default: f32,                 // starting zoom level (1.0)
    pub integer_snap: bool,                // snap to integer scale for pixel art (Classic mode)
}

pub struct VisualConfig {
    pub scaling: ScalingMode,              // IntegerNearest, Bilinear, Native
    pub palette_mode: PaletteMode,         // IndexedPalette, DirectColor
    pub shadow_style: ShadowStyle,         // SpriteShadow, ProjectedShadow, None
    pub post_fx: PostFxPreset,             // None, Classic, Enhanced
}
```

The RA1 game module would register:

```yaml
render_modes:
  classic:
    display_name: "Classic"
    render_backend: sprite
    camera: isometric
    camera_config:
      zoom_min: 0.5
      zoom_max: 3.0
      zoom_default: 1.0
      integer_snap: true           # snap OrthographicProjection.scale to integer multiples
    resource_packs:
      sprites: classic-shp
      terrain: classic-tiles
    visual_config:
      scaling: integer_nearest
      palette_mode: indexed
      shadow_style: sprite_shadow
      post_fx: none
    description: "Original 320×200 pixel art, integer-scaled"

  hd:
    display_name: "HD"
    render_backend: sprite
    camera: isometric
    camera_config:
      zoom_min: 0.5
      zoom_max: 4.0
      zoom_default: 1.0
      integer_snap: false          # smooth zoom at all levels
    resource_packs:
      sprites: hd-sprites         # Requires HD sprite resource pack
      terrain: hd-terrain
    visual_config:
      scaling: native
      palette_mode: direct_color
      shadow_style: sprite_shadow
      post_fx: enhanced
    description: "High-definition sprites at native resolution"
```

A 3D render mod adds a third mode:

```yaml
# 3d_mod/render_modes.yaml (extends base game module)
render_modes:
  3d:
    display_name: "3D View"
    render_backend: mesh            # Provided by the WASM mod
    camera: free_rotate
    camera_config:
      zoom_min: 0.25               # 3D allows wider zoom range
      zoom_max: 6.0
      zoom_default: 1.0
      integer_snap: false
    resource_packs:
      sprites: 3d-models           # GLTF meshes mapped to unit types
      terrain: 3d-terrain
    visual_config:
      scaling: native
      palette_mode: direct_color
      shadow_style: projected_shadow
      post_fx: enhanced
    description: "Full 3D rendering with free camera"
    requires_mod: "3d-ra"          # Only available when this mod is loaded
```

### Toggle Mechanism

**Default keybind:** F1 cycles through available render modes (matching the Remastered Collection). A game with only `classic` and `hd` modes: F1 toggles between them. A game with three modes: F1 cycles classic → hd → 3d → classic. The cycle order matches the `render_modes` declaration order.

**Settings UI:**

```
Settings → Graphics → Render Mode
┌───────────────────────────────────────────────┐
│ Active Render Mode:  [HD ▾]                   │
│                                               │
│ Toggle Key: [F1]                              │
│ Cycle Order: Classic → HD → 3D                │
│                                               │
│ Available Modes:                              │
│ ● Classic — Original pixel art, integer-scaled│
│ ● HD — High-definition sprites (requires      │
│         HD sprite pack)                       │
│ ● 3D View — Full 3D (requires 3D RA mod)     │
│              [Browse Workshop →]              │
└───────────────────────────────────────────────┘
```

Modes whose required resource packs or mods aren't installed remain clickable — selecting one opens a guidance panel explaining what's needed and linking directly to Workshop or settings (see D033 § "UX Principle: No Dead-End Buttons"). No greyed-out entries.

### How the Switch Works (Runtime)

The toggle is instant — no loading screen, no fade-to-black for same-backend switches:

1. **Same render backend** (classic ↔ hd): Swap `Handle` references on all `Renderable` components. Both asset sets are loaded at startup (or on first toggle). Bevy's asset system makes this a single-frame operation — exactly like the Remastered Collection's F1.

2. **Different render backend** (2D ↔ 3D): Swap the active `Renderable` implementation and camera. This is heavier — the first switch loads the 3D asset set (brief loading indicator). Subsequent switches are instant because both backends stay resident. Camera interpolates smoothly between isometric and perspective over ~0.3 seconds.

3. **Multiplayer**: Render mode is a client-only setting. The sim doesn't know or care. No sync, no lobby lock. One player on Classic, one on HD, one on 3D — all in the same game. This already works architecturally; D048 just formalizes it.

4. **Replays**: Render mode is switchable during replay playback. Watch a classic-era replay in 3D, or vice versa.

### Cross-View Multiplayer

This deserves emphasis because it's a feature no shipped C&C game has offered: **players using different visual presentations in the same multiplayer match.** The sim/render split (Invariant #1, #9) makes this free. A competitive player who prefers classic pixel clarity plays against someone using 3D — same rules, same sim, same balance, different eyes.

Cross-view also means **cross-view spectating**: an observer can watch a tournament match in 3D while the players compete in classic 2D. This creates unique content creation and broadcasting opportunities.

### Information Equivalence Across Render Modes

Cross-view multiplayer is competitively safe because all render modes display **identical game-state information:**

- **Fog of war:** Visibility is computed by `FogProvider` in the sim. Every render mode receives the same `VisibilityGrid` — no mode can reveal fogged units or terrain that another mode hides.
- **Unit visibility:** Cloaked, burrowed, and disguised units are shown/hidden based on sim-side detection state (`DetectCloaked`, `IgnoresDisguise`). The render mode determines *how* a shimmer or disguise looks, not *whether* the player sees it.
- **Health bars, status indicators, minimap:** All driven by sim state. A unit at 50% health shows 50% health in every render mode. Minimap icons are derived from the same entity positions regardless of visual presentation.
- **Selection and targeting:** Click hitboxes are defined per render mode via `ScreenToWorld`, but the available actions and information (tooltip, stats panel) are identical.

If a future render mode creates an information asymmetry (e.g., 3D terrain occlusion that hides units behind buildings when the 2D mode shows them), the mode must equalize information display — either by adding a visibility indicator or by using the sim's visibility grid as the authority for what's shown. **The principle: render modes change how the game looks, never what the player knows.**

### Relationship to Existing Systems

| System                   | Before D048                                          | After D048                                                                                           |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Resource Packs**       | Per-category asset selection in Settings             | Resource packs become a *component* of render modes; the mode auto-selects the right packs           |
| **D029 Dual Asset**      | Dual asset handles per entity                        | Generalized to N render modes, not just two. D029's mechanism is how same-backend switches work      |
| **3D Render Mods**       | Tier 3 WASM mod that *replaces* the default renderer | Tier 3 WASM mod that *adds* a render mode alongside the default — toggleable, not a replacement      |
| **D032 UI Themes**       | Switchable UI chrome                                 | UI theme can optionally be paired with a render mode (classic mode + classic chrome)                 |
| **Render Quality Tiers** | Hardware-adaptive Baseline → Ultra                   | Tiers apply *within* a render mode. Classic mode on Tier 0 hardware; 3D mode requires Tier 2 minimum |
| **Experience Profiles**  | Balance + theme + QoL + AI + pathfinding             | Now also include a default render mode                                                               |

### What Mod Authors Need to Do

**For a sprite HD pack** (most common case): Nothing new. Publish a resource pack with HD sprites. The game module's `hd` render mode references it. The player installs it and F1 toggles.

**For a 3D rendering mod** (Tier 3): Ship a WASM mod that provides a `Renderable` impl (mesh renderer) and a `ScreenToWorld` impl (3D camera). Declare a render mode in YAML that references these implementations and the 3D asset resource packs. The engine registers the mode alongside the built-in modes — F1 now cycles through all three.

**For a complete 3D game module** (e.g., Generals clone): The game module can register only 3D render modes — no classic 2D at all. Or it can ship both. The architecture supports any combination.

### Minimum Viable Scope

Phase 2 delivers the infrastructure — render mode registration, asset handle swapping, the `RenderMode` struct. The HD/SD toggle (classic ↔ hd) works. Phase 3 adds the settings UI and keybind. Phase 6a supports mod-provided render modes (3D). The architecture supports all of this from day one; the phases gate what's *tested and polished.*

### Alternatives Considered

1. **Resource packs only, no render mode concept** — Rejected. Switching from 2D to 3D requires changing the render backend and camera, not just assets. Resource packs can't do that.
2. **3D as a separate game module** — Rejected. A "3D RA1" game module would duplicate all the rules, balance, and systems from the base RA1 module. The whole point is that the sim is unchanged.
3. **No 2D↔3D toggle; 3D replaces 2D permanently when mod is active** — Rejected. The Remastered Collection proved that *toggling* is the feature, not just having two visual options. Players love comparing. Content creators use it for dramatic effect. It's also a safety net — if the 3D mod has rendering bugs, you can toggle back.

### Lessons from the Remastered Collection

The Remastered Collection's F1 toggle is the gold-standard reference for this feature. Its architecture — recovered from the GPL source (`DLLInterface.cpp`) and our analysis (`research/remastered-collection-netcode-analysis.md` § 9) — reveals how Petroglyph achieved instant switching, and where IC can improve:

**How the Remastered toggle works internally:**

The Remastered Collection runs **two rendering pipelines in parallel.** The original C++ engine still software-renders every frame to `GraphicBufferClass` RAM buffers (palette-based 8-bit blitting) — exactly as in 1995. Simultaneously, `DLL_Draw_Intercept` captures every draw call as structured metadata (`CNCObjectStruct`: position, type, shape index, frame, palette, cloak state, health, selection) and forwards it to the C# GlyphX client via `CNC_Get_Game_State()`. The GlyphX layer renders the same scene using HD art and GPU acceleration. When the player presses Tab (their toggle key), the C# layer simply switches which final framebuffer is composited to screen — the classic software buffer or the HD GPU buffer. Both are always up-to-date because both render every frame.

**Why dual-render works for Remastered but is wrong for IC:**

| Remastered approach                                      | IC approach                                     | Why different                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both pipelines render every frame                        | Only the active mode renders                    | The Remastered C++ engine is a sealed DLL — you can't stop it rendering. IC owns both pipelines and can skip work. Rendering both wastes GPU budget. |
| Classic renderer is software (CPU blit to RAM)           | Both modes are GPU-based (wgpu via Bevy)        | Classic-mode GPU sprites are cheap but not free. Dual GPU render passes halve available GPU budget for post-FX, particles, unit count.               |
| Switch is trivial: flip a "which buffer to present" flag | Switch swaps asset handles on live entities     | Remastered pays for dual-render continuously to make the flip trivial. IC pays nothing continuously and does a one-frame swap at toggle time.        |
| Two codebases: C++ (classic) and C# (HD)                 | One codebase: same Bevy systems, different data | IC's approach is fundamentally lighter — same draw call dispatch, different texture atlases.                                                         |

**Key insight IC adopts:** The Remastered Collection's critical architectural win is that **the sim is completely unaware of the render switch.** The C++ sim DLL (`CNC_Advance_Instance`) has no knowledge of which visual mode is active — it advances identically in both cases. IC inherits this principle via Invariant #1 (sim is pure). The sim never imports from `ic-render`. Render mode is a purely client-side concern.

**Key insight IC rejects:** Dual-rendering every frame is wasteful when you own both pipelines. The Remastered Collection pays this cost because the C++ DLL cannot be told "don't render this frame" — `DLL_Draw_Intercept` fires unconditionally. IC has no such constraint. Only the active render mode's systems should run.

### Bevy Implementation Strategy

The render mode switch is implementable entirely within Bevy's existing architecture — no custom render passes, no engine modifications. The key mechanisms are **`Visibility` component toggling**, **`Handle` swapping on `Sprite`/`Mesh` components**, and **Bevy's system set run conditions**.

#### Architecture: Two Approaches, One Hybrid

**Approach A: Entity-per-mode (rejected for same-backend switches)**

Spawn separate sprite entities for classic and HD, toggle `Visibility`. Simple but doubles entity count (500 units × 2 = 1000 sprite entities) and doubles `Transform` sync work. Only justified for cross-backend switches (2D entity + 3D entity) where the components are structurally different.

**Approach B: Handle-swap on shared entity (adopted for same-backend switches)**

Each renderable entity has one `Sprite` component. On toggle, swap its `Handle<Image>` (or `TextureAtlas` index) from the classic atlas to the HD atlas. One entity, one transform, one visibility check — the sprite batch simply references different texture data. This is what `D029 Dual Asset` already designed.

**Hybrid: same-backend swaps use handle-swap; cross-backend swaps use visibility-gated entity groups.**

#### Core ECS Components

```rust
/// Marker resource: the currently active render mode.
/// Changed via F1 keypress or settings UI.
/// Bevy change detection (Res<ActiveRenderMode>.is_changed()) triggers swap systems.
#[derive(Resource)]
pub struct ActiveRenderMode {
    pub current: RenderModeId,       // "classic", "hd", "3d"
    pub cycle: Vec<RenderModeId>,    // Ordered list for F1 cycling
    pub registry: HashMap<RenderModeId, RenderModeConfig>,
}

/// Per-entity component: maps this entity's render data for each available mode.
/// Populated at spawn time from the game module's YAML asset mappings.
#[derive(Component)]
pub struct RenderModeAssets {
    /// For same-backend modes (classic ↔ hd): alternative texture handles.
    /// Key = render mode id, Value = handle to that mode's texture atlas.
    pub sprite_handles: HashMap<RenderModeId, Handle<Image>>,
    /// For same-backend modes: alternative atlas layout indices.
    pub atlas_mappings: HashMap<RenderModeId, TextureAtlasLayout>,
    /// For cross-backend modes (2D ↔ 3D): entity IDs of the alternative representations.
    /// These entities exist but have Visibility::Hidden until their mode activates.
    pub cross_backend_entities: HashMap<RenderModeId, Entity>,
}

/// System set that only runs when a render mode switch just occurred.
/// Uses Bevy's run_if condition to avoid any per-frame cost when not switching.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct RenderModeSwitchSet;
```

#### The Toggle System (F1 Handler)

```rust
/// Runs every frame (cheap: one key check).
fn handle_render_mode_toggle(
    input: Res<ButtonInput<KeyCode>>,
    mut active: ResMut<ActiveRenderMode>,
) {
    if input.just_pressed(KeyCode::F1) {
        let idx = active.cycle.iter()
            .position(|id| *id == active.current)
            .unwrap_or(0);
        let next = (idx + 1) % active.cycle.len();
        active.current = active.cycle[next].clone();
        // Bevy change detection fires: active.is_changed() == true this frame.
        // All systems in RenderModeSwitchSet will run exactly once.
    }
}
```

#### Same-Backend Swap (Classic ↔ HD)

```rust
/// Runs ONLY when ActiveRenderMode changes (run_if condition).
/// Cost: iterates all renderable entities ONCE, swaps Handle + atlas.
/// For 500 units + 200 buildings + terrain = ~1000 entities: < 0.5ms.
fn swap_sprite_handles(
    active: Res<ActiveRenderMode>,
    mut query: Query<(&RenderModeAssets, &mut Sprite)>,
) {
    let mode = &active.current;
    for (assets, mut sprite) in &mut query {
        if let Some(handle) = assets.sprite_handles.get(mode) {
            sprite.image = handle.clone();
        }
        // Atlas layout swap happens similarly via TextureAtlas component
    }
}

/// Swap camera and visual settings when render mode changes.
/// Updates the GameCamera zoom range and the OrthographicProjection scaling mode.
/// Camera position is preserved across switches — only zoom behavior changes.
/// See 02-ARCHITECTURE.md § "Camera System" for the canonical GameCamera resource.
fn swap_visual_config(
    active: Res<ActiveRenderMode>,
    mut game_camera: ResMut<GameCamera>,
    mut camera_query: Query<&mut OrthographicProjection, With<GameCameraMarker>>,
) {
    let config = &active.registry[&active.current];

    // Update zoom range from the new render mode's camera config.
    game_camera.zoom_min = config.camera_config.zoom_min;
    game_camera.zoom_max = config.camera_config.zoom_max;
    // Clamp current zoom to new range (e.g., 3D mode allows wider range than Classic).
    game_camera.zoom_target = game_camera.zoom_target
        .clamp(game_camera.zoom_min, game_camera.zoom_max);

    for mut proj in &mut camera_query {
        proj.scaling_mode = match config.visual_config.scaling {
            ScalingMode::IntegerNearest => bevy::render::camera::ScalingMode::Fixed {
                width: 320.0, height: 200.0, // Classic RA viewport
            },
            ScalingMode::Native => bevy::render::camera::ScalingMode::AutoMin {
                min_width: 1280.0, min_height: 720.0,
            },
            // ...
        };
    }
}
```

#### Cross-Backend Swap (2D ↔ 3D)

```rust
/// For cross-backend switches: toggle Visibility on entity groups.
/// The 3D entities exist from the start but are Hidden.
/// Swap cost: iterate entities, flip Visibility enum. Still < 1ms.
fn swap_render_backends(
    active: Res<ActiveRenderMode>,
    mut query: Query<(&RenderModeAssets, &mut Visibility)>,
    mut cross_entities: Query<&mut Visibility, Without<RenderModeAssets>>,
) {
    let mode = &active.current;
    let config = &active.registry[mode];

    for (assets, mut vis) in &mut query {
        // If this entity's backend matches the active mode, show it.
        // Otherwise, hide it and show the cross-backend counterpart.
        if assets.sprite_handles.contains_key(mode) {
            *vis = Visibility::Inherited;
            // Hide cross-backend counterparts
            for (other_mode, &entity) in &assets.cross_backend_entities {
                if *other_mode != *mode {
                    if let Ok(mut other_vis) = cross_entities.get_mut(entity) {
                        *other_vis = Visibility::Hidden;
                    }
                }
            }
        } else if let Some(&entity) = assets.cross_backend_entities.get(mode) {
            *vis = Visibility::Hidden;
            if let Ok(mut other_vis) = cross_entities.get_mut(entity) {
                *other_vis = Visibility::Inherited;
            }
        }
    }
}
```

#### System Scheduling

```rust
impl Plugin for RenderModePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ActiveRenderMode>()
           // F1 handler runs every frame — trivially cheap (one key check).
           .add_systems(Update, handle_render_mode_toggle)
           // Swap systems run ONLY on the frame when ActiveRenderMode changes.
           .add_systems(Update, (
               swap_sprite_handles,
               swap_visual_config,
               swap_render_backends,
               swap_ui_theme,            // D032 theme pairing
               swap_post_fx_pipeline,    // Post-processing preset
               emit_render_mode_event,   // Telemetry: D031
           ).in_set(RenderModeSwitchSet)
            .run_if(resource_changed::<ActiveRenderMode>));
    }
}
```

#### Performance Characteristics

| Operation                        | Cost                                      | When It Runs         | Notes                                                                                                          |
| -------------------------------- | ----------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| F1 key check                     | ~0 (one `HashMap` lookup)                 | Every frame          | Bevy input system already processes keys; we just read                                                         |
| Same-backend swap (classic ↔ hd) | ~0.3–0.5 ms for 1000 entities             | Once on toggle       | Iterate entities, write `Handle<Image>`. No GPU work. Bevy batches texture changes automatically on next draw. |
| Cross-backend swap (2D ↔ 3D)     | ~0.5–1 ms for 1000 entity pairs           | Once on toggle       | Toggle `Visibility`. Hidden entities are culled by Bevy's visibility system — zero draw calls.                 |
| 3D asset first-load              | 50–500 ms (one-time)                      | First toggle to 3D   | GLTF meshes + textures loaded async by Bevy's asset server. Brief loading indicator. Cached thereafter.        |
| Steady-state (non-toggle frames) | **0 ms**                                  | Every frame          | `run_if(resource_changed)` gates all swap systems. Zero per-frame overhead.                                    |
| VRAM usage                       | Classic atlas (~8 MB) + HD atlas (~64 MB) | Resident when loaded | Both atlases stay in VRAM. Modern GPUs: trivial. Min-spec 512 MB VRAM: still <15%.                             |

**Key property: zero per-frame cost.** Bevy's `resource_changed` run condition means the swap systems literally do not execute unless the player presses F1. Between toggles, the renderer treats the active atlas as the only atlas — standard sprite batching, standard draw calls, no branching.

#### Asset Pre-Loading Strategy

The critical difference from the Remastered Collection: IC does NOT dual-render. Instead, it pre-loads both texture atlases into VRAM at match start (or lazily on first toggle):

```rust
/// Called during match loading. Pre-loads all registered render mode assets.
fn preload_render_mode_assets(
    active: Res<ActiveRenderMode>,
    asset_server: Res<AssetServer>,
    mut preload_handles: ResMut<RenderModePreloadHandles>,
) {
    for (mode_id, config) in &active.registry {
        for pack_ref in &config.resource_pack_overrides {
            // Bevy's asset server loads asynchronously.
            // We hold the Handle to keep the asset resident in memory.
            let handle = asset_server.load(pack_ref.atlas_path());
            preload_handles.retain.push(handle);
        }
    }
}
```

**Loading strategy by mode type:**

| Mode pair                   | Pre-load?             | Memory cost               | Rationale                                                                                  |
| --------------------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Classic ↔ HD (same backend) | Yes, at match start   | +64 MB VRAM for HD atlas  | Both are texture atlases. Pre-loading makes F1 instant.                                    |
| 2D ↔ 3D (cross backend)     | Lazy, on first toggle | +100–300 MB for 3D meshes | 3D assets are large. Don't penalize 2D-only players. Loading indicator on first 3D toggle. |
| Any ↔ Any (menu/lobby)      | Active mode only      | Minimal                   | No gameplay; loading time acceptable.                                                      |

#### Transform Synchronization (Cross-Backend Only)

When 2D and 3D entities coexist (one hidden), their `Transform` must stay in sync so the switch looks seamless. The sim writes to a `SimPosition` component (in world coordinates). Both the 2D sprite entity and the 3D mesh entity read from the same `SimPosition` and compute their own `Transform`:

```rust
/// Runs every frame for ALL visible renderable entities.
/// Converts SimPosition → entity Transform using the active camera model.
/// Hidden entities skip this (Bevy's visibility propagation prevents
/// transform updates on Hidden entities from triggering GPU uploads).
fn sync_render_transforms(
    active: Res<ActiveRenderMode>,
    mut query: Query<(&SimPosition, &mut Transform), With<Visibility>>,
) {
    let camera_model = &active.registry[&active.current].camera;
    for (sim_pos, mut transform) in &mut query {
        *transform = camera_model.world_to_render(sim_pos);
    }
}
```

Bevy's built-in visibility system already ensures that `Hidden` entities' transforms aren't uploaded to the GPU, so the 3D entity transforms are only computed when 3D mode is active.

#### Comparison: Remastered vs. IC Render Switch

| Aspect                    | Remastered Collection                                             | Iron Curtain                                      |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| **Architecture**          | Dual-render: both pipelines run every frame                       | Single-render: only active mode draws             |
| **Switch cost**           | ~0 (flip framebuffer pointer)                                     | ~0.5 ms (swap handles on ~1000 entities)          |
| **Steady-state cost**     | Full classic render every frame (~2-5ms CPU) even when showing HD | **0 ms** — inactive mode has zero cost            |
| **Why the trade-off**     | C++ DLL can't be told "don't render"                              | IC owns both pipelines, can skip work             |
| **Memory**                | Classic (RAM buffer) + HD (VRAM)                                  | Both atlases in VRAM (unified GPU memory)         |
| **Cross-backend (2D↔3D)** | Not supported                                                     | Supported via visibility-gated entity groups      |
| **Multiplayer**           | Both players must use same mode                                   | Cross-view: each player picks independently       |
| **Camera**                | Fixed isometric in both modes                                     | Camera model switches with render mode            |
| **UI chrome**             | Switches with graphics mode                                       | Independently switchable (D032) but can be paired |
| **Modder-extensible**     | No                                                                | YAML registration + WASM render backends          |

---

---

