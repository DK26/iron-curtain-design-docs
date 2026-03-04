# GPU & Hardware Compatibility

Bevy renders via `wgpu`, which translates to native GPU APIs. This creates a **hardware floor** that interacts with our "2012 laptop" performance target.

### Compatibility Target Clarification (Original RA Spirit vs Modern Stack Reality)

The project goal is to support **very low-end hardware by modern standards** — especially machines with **no dedicated gaming GPU** (integrated graphics, office PCs, older laptops) — while preserving full gameplay. This matches the spirit of original Red Alert and OpenRA accessibility.

However, we should be explicit about the technical floor:

- **Literal 1996 Red Alert-era hardware is not a realistic runtime target** for a modern Rust + Bevy + `wgpu` engine.
- A **displayed game window still requires some graphics path** (integrated GPU, compatible driver, or OS-provided software rasterizer path).
- **Headless components** (relay server, tooling, some tests) remain fully usable without graphics acceleration because the sim/netcode do not depend on rendering.

In practice, the target is:

- **No dedicated GPU required** (integrated graphics should work)
- **Baseline tier must remain fully playable**
- **3D render modes and advanced Bevy visual features are optional and may be hidden/disabled automatically**

If the OS/driver stack exposes a software backend (e.g., platform software rasterizer implementations), IC may run as a **best-effort** fallback, but this is not the primary performance target and should be clearly labeled as unsupported for competitive play.

### wgpu Backend Matrix

| Backend | Min API Version   | Typical GPU Era                              | wgpu Support Level           |
| ------- | ----------------- | -------------------------------------------- | ---------------------------- |
| Vulkan  | 1.0+              | 2016+ (discrete), 2014+ (integrated Haswell) | First-class                  |
| DX12    | Windows 10        | 2015+                                        | First-class                  |
| Metal   | macOS 10.14       | 2018+ Macs                                   | First-class                  |
| OpenGL  | GL 3.3+ / ES 3.0+ | 2010+                                        | **Downlevel / best-effort**  |
| WebGPU  | Modern browsers   | 2023+                                        | First-class                  |
| WebGL2  | ES 3.0 equiv      | Most browsers                                | **Downlevel, severe limits** |

### The 2012 Laptop Problem

A typical 2012 laptop has an **Intel HD 4000** (Ivy Bridge). This GPU supports OpenGL 4.0 but **has no Vulkan driver**. It falls back to wgpu's GL 3.3 backend, which is downlevel — meaning reduced resource limits:

| Resource                  | Vulkan/DX12 (WebGPU defaults) | GL 3.3 Downlevel | WebGL2        |
| ------------------------- | ----------------------------- | ---------------- | ------------- |
| Max texture dimension     | 8192×8192                     | **2048×2048**    | **2048×2048** |
| Storage buffers per stage | 8                             | **4**            | **0**         |
| Uniform buffer size       | 64 KiB                        | **16 KiB**       | **16 KiB**    |
| Compute shaders           | Yes                           | GL 4.3+ only     | **None**      |
| Color attachments         | 8                             | **4**            | **4**         |
| Storage textures          | 4                             | 4                | **0**         |

### Impact on Our Feature Plans

| Feature                        | Problem on Downlevel Hardware                                        | Severity | Mitigation                                        |
| ------------------------------ | -------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| GPU particle weather           | Compute shaders needed; HD 4000 has GL 4.0, compute needs 4.3        | High     | CPU particle fallback (Tier 0)                    |
| Shader terrain blending (D022) | Complex fragment shaders + texture arrays hit uniform/sampler limits | Medium   | Palette tinting fallback (zero extra resources)   |
| Post-processing chain          | Bloom, color grading, SSR need MRT + decent fill rate                | Medium   | Disable post-FX on Tier 0                         |
| Dynamic lighting               | Multiple render targets, shadow maps                                 | Medium   | Static baked lighting on Tier 0                   |
| HD sprite sheets               | 2048px max texture on downlevel                                      | Low      | Split sprite sheets at asset build time           |
| WebGL2/WASM visuals            | Zero compute, zero storage buffers, no GPU particles                 | High     | Target WebGPU-only for browser (or accept limits) |
| Simulation / ECS               | **No impact** — pure CPU, no GPU dependency                          | None     | —                                                 |
| Audio / Networking / Modding   | **No impact** — none touch the GPU                                   | None     | —                                                 |

**Key insight:** The "2012 laptop" target is achievable for the **simulation** (500 units, < 40ms tick) because the sim is pure CPU. The **rendering** must degrade gracefully — reduced visual effects, not broken gameplay.

**Design rule:** Advanced Bevy features (3D view, heavy post-FX, compute-driven particles, dynamic lighting pipelines) are optional layers on top of the classic sprite renderer. Their absence must never block normal gameplay.

### Render Quality Tiers

`ic-render` queries device capabilities at startup via wgpu's adapter limits and selects a render tier stored in the `RenderSettings` resource. All tiers produce an identical, playable game — they differ only in visual richness.

| Tier | Name         | Target Hardware                              | GPU Particles | Post-FX       | Weather Visuals       | Dynamic Lighting          | Texture Limits |
| ---- | ------------ | -------------------------------------------- | ------------- | ------------- | --------------------- | ------------------------- | -------------- |
| 0    | **Baseline** | GL 3.3 (Intel HD 4000), WebGL2               | CPU fallback  | None          | Palette tinting       | None (baked)              | 2048×2048 max  |
| 1    | **Standard** | Vulkan/DX12 basic (Intel HD 5000+, GTX 600+) | GPU compute   | Basic (bloom) | Overlay sprites       | Point lights              | 8192×8192      |
| 2    | **Enhanced** | Vulkan/DX12 capable (GTX 900+, RX 400+)      | GPU compute   | Full chain    | Shader blending       | Full + shadows            | 8192×8192      |
| 3    | **Ultra**    | High-end desktop                             | GPU compute   | Full + SSR    | Shader + accumulation | Dynamic + cascade shadows | 16384×16384    |

**Tier selection is automatic but overridable.** Detected at startup from `wgpu::Adapter::limits()` and `wgpu::Adapter::features()`. Players can force a lower tier in settings. Mods can ship tier-specific assets.

```rust
/// ic-render: runtime render configuration (Bevy Resource)
///
/// Every field here is a tweakable parameter. The engine auto-detects defaults
/// from hardware at startup, but players can override ANY field via config.toml,
/// the in-game settings menu, or `/set render.*` console commands (D058).
/// All fields are hot-reloadable — changes take effect next frame, no restart needed.
pub struct RenderSettings {
    // === Core tier & frame pacing ===
    pub tier: RenderTier,                       // Auto-detected or user-forced
    pub fps_cap: FpsCap,                        // V30, V60, V144, V240, Uncapped
    pub vsync: VsyncMode,                       // Off, On, Adaptive, Mailbox
    pub resolution_scale: f32,                  // 0.5–2.0 (render resolution vs display)

    // === Anti-aliasing ===
    pub msaa: MsaaSamples,                      // Off, X2, X4 (maps to Bevy Msaa resource)
    pub smaa: Option<SmaaPreset>,               // None, Low, Medium, High, Ultra (Bevy SMAA)
    // MSAA and SMAA are mutually exclusive — if SMAA is Some, MSAA should be Off.

    // === Post-processing chain ===
    pub post_fx_enabled: bool,                  // Master toggle for ALL post-processing
    pub bloom: Option<BloomConfig>,             // None = disabled; Some = Bevy Bloom component
    pub tonemapping: TonemappingMode,           // None, Reinhard, ReinhardLuminance, TonyMcMapface, ...
    pub deband_dither: bool,                    // Bevy DebandDither — eliminates color banding
    pub contrast: f32,                          // 0.8–1.2 (1.0 = neutral)
    pub brightness: f32,                        // 0.8–1.2 (1.0 = neutral)
    pub gamma: f32,                             // 1.8–2.6 (2.2 = standard sRGB)

    // === Lighting & shadows ===
    pub dynamic_lighting: bool,                 // Enable/disable dynamic point/spot lights
    pub shadows_enabled: bool,                  // Master shadow toggle
    pub shadow_quality: ShadowQuality,          // Off, Low (512), Medium (1024), High (2048), Ultra (4096)
    pub shadow_filter: ShadowFilterMethod,      // Hardware2x2, Gaussian, Temporal (maps to Bevy enum)
    pub cascade_shadow_count: u32,              // 1–4 (directional light cascades)
    pub ambient_occlusion: Option<AoConfig>,    // None or SSAO settings (Bevy SSAO)

    // === Particles & weather ===
    pub particle_density: f32,                  // 0.0–1.0 (scales particle spawn rates)
    pub particle_backend: ParticleBackend,      // Cpu, Gpu (auto from tier, overridable)
    pub weather_visual_mode: WeatherVisualMode, // PaletteTint, Overlay, ShaderBlend

    // === Textures & sprites ===
    pub sprite_sheet_max: u32,                  // Derived from adapter texture limits
    pub texture_filtering: TextureFiltering,    // Nearest (pixel-perfect), Bilinear, Trilinear
    pub anisotropic_filtering: u8,              // 1, 2, 4, 8, 16 (1 = off)

    // === Camera & view ===
    pub fov_override: Option<f32>,              // None = default isometric; Some = custom (for 3D render modes)
    pub camera_smoothing: bool,                 // Interpolated camera movement between ticks
}

pub enum RenderTier {
    Baseline,   // Tier 0: GL 3.3 / WebGL2 — functional but plain
    Standard,   // Tier 1: Basic Vulkan/DX12 — GPU particles, basic post-FX
    Enhanced,   // Tier 2: Capable GPU — full visual pipeline
    Ultra,      // Tier 3: High-end — everything maxed
}

pub enum FpsCap { V30, V60, V144, V240, Uncapped }
pub enum VsyncMode { Off, On, Adaptive, Mailbox }
pub enum MsaaSamples { Off, X2, X4 }
pub enum SmaaPreset { Low, Medium, High, Ultra }
pub enum ShadowQuality { Off, Low, Medium, High, Ultra }
pub enum ShadowFilterMethod { Hardware2x2, Gaussian, Temporal }
pub enum ParticleBackend { Cpu, Gpu }
pub enum TextureFiltering { Nearest, Bilinear, Trilinear }

pub struct BloomConfig {
    pub intensity: f32,             // 0.0–1.0 (Bevy Bloom::intensity)
    pub low_frequency_boost: f32,   // 0.0–1.0
    pub threshold: f32,             // HDR brightness threshold for bloom
    pub knee: f32,                  // Soft knee for threshold transition
}

pub struct AoConfig {
    pub quality: AoQuality,         // Low (4 samples), Medium (8), High (16), Ultra (32)
    pub radius: f32,                // World-space AO radius
    pub intensity: f32,             // 0.0–2.0
}

pub enum AoQuality { Low, Medium, High, Ultra }

/// Maps Bevy's tonemapping algorithms to player-friendly names.
/// See Bevy's Tonemapping enum — we expose all of them.
pub enum TonemappingMode {
    None,                   // Raw HDR → clamp (only for debugging)
    Reinhard,               // Simple, classic
    ReinhardLuminance,      // Luminance-preserving Reinhard
    AcesFitted,             // Film industry standard
    AgX,                    // Blender's default — good highlight handling
    TonyMcMapface,          // Bevy's recommended default — best overall
    SomewhatBoringDisplayTransform, // Neutral, minimal artistic bias
}
```

**Bevy component mapping:** Every field in `RenderSettings` maps to a Bevy component or resource. The `RenderSettingsSync` system (runs in `PostUpdate`) reads changes and applies them:

| `RenderSettings` field | Bevy Component / Resource                        | Notes                                     |
| ---------------------- | ------------------------------------------------ | ----------------------------------------- |
| `msaa`                 | `Msaa` (global resource)                         | Set to `Off` when SMAA is active          |
| `smaa`                 | `Smaa` (camera component)                        | Added/removed on camera entity            |
| `bloom`                | `Bloom` (camera component)                       | Added/removed; fields map 1:1             |
| `tonemapping`          | `Tonemapping` (camera component)                 | Enum variant maps directly                |
| `deband_dither`        | `DebandDither` (camera component)                | `Enabled` / `Disabled`                    |
| `shadow_filter`        | `ShadowFilteringMethod` (camera component)       | `Hardware2x2`, `Gaussian`, `Temporal`     |
| `ambient_occlusion`    | `ScreenSpaceAmbientOcclusion` (camera component) | Added/removed with quality settings       |
| `vsync`                | `WinitSettings` / `PresentMode`                  | Requires window recreation for some modes |
| `fps_cap`              | Frame limiter system (custom)                    | `thread::sleep` or Bevy `FramepacePlugin` |
| `resolution_scale`     | Render target size override                      | Renders to smaller target, upscales       |
| `dynamic_lighting`     | Point/spot light entity visibility               | Toggles `Visibility` on light entities    |
| `shadows_enabled`      | `DirectionalLight.shadows_enabled`               | Per-light shadow toggle                   |
| `shadow_quality`       | `DirectionalLightShadowMap.size`                 | 512 / 1024 / 2048 / 4096                  |

### Auto-Detection Algorithm

At startup, `ic-render` probes the GPU via `wgpu::Adapter` and selects the best render tier. The algorithm is deterministic — same hardware always gets the same tier. Players override via `config.toml` or the settings menu.

```rust
/// Probes GPU capabilities and returns the appropriate render tier.
/// Called once at startup. Result is stored in RenderSettings and persisted
/// to config.toml on first run (so subsequent launches skip probing).
pub fn detect_render_tier(adapter: &wgpu::Adapter) -> RenderTier {
    let limits = adapter.limits();
    let features = adapter.features();
    let info = adapter.get_info();

    // Step 1: Check for hard floor — can we run at all?
    // wgpu already enforces DownlevelCapabilities; if we got an adapter, we're at least GL 3.3.

    // Step 2: Classify by feature support (most restrictive wins)
    let has_compute = features.contains(wgpu::Features::default()); // Compute is in default feature set
    let has_storage_buffers = limits.max_storage_buffers_per_shader_stage >= 4;
    let has_large_textures = limits.max_texture_dimension_2d >= 8192;
    let has_depth_clip = features.contains(wgpu::Features::DEPTH_CLIP_CONTROL);
    let has_timestamp_query = features.contains(wgpu::Features::TIMESTAMP_QUERY);
    let vram_mb = estimate_vram(&info); // Heuristic from adapter name + backend hints

    // Step 3: Tier assignment (ordered from highest to lowest)
    if has_compute && has_large_textures && has_depth_clip && vram_mb >= 4096 {
        RenderTier::Ultra
    } else if has_compute && has_large_textures && has_storage_buffers && vram_mb >= 2048 {
        RenderTier::Enhanced
    } else if has_compute && has_storage_buffers {
        RenderTier::Standard
    } else {
        RenderTier::Baseline  // GL 3.3 / WebGL2 — everything still works
    }
}

/// Builds a complete RenderSettings from the detected tier.
/// Each tier implies sensible defaults for ALL parameters.
/// These are the "factory defaults" — config.toml overrides take priority.
pub fn default_settings_for_tier(tier: RenderTier) -> RenderSettings {
    match tier {
        RenderTier::Baseline => RenderSettings {
            tier,
            fps_cap: FpsCap::V60,
            vsync: VsyncMode::On,
            resolution_scale: 1.0,
            msaa: MsaaSamples::Off,
            smaa: None,
            post_fx_enabled: false,
            bloom: None,
            tonemapping: TonemappingMode::None,
            deband_dither: false,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: false,
            shadows_enabled: false,
            shadow_quality: ShadowQuality::Off,
            shadow_filter: ShadowFilterMethod::Hardware2x2,
            cascade_shadow_count: 0,
            ambient_occlusion: None,
            particle_density: 0.3,
            particle_backend: ParticleBackend::Cpu,
            weather_visual_mode: WeatherVisualMode::PaletteTint,
            sprite_sheet_max: 2048,
            texture_filtering: TextureFiltering::Nearest,
            anisotropic_filtering: 1,
            fov_override: None,
            camera_smoothing: true,
        },
        RenderTier::Standard => RenderSettings {
            tier,
            fps_cap: FpsCap::V60,
            vsync: VsyncMode::On,
            resolution_scale: 1.0,
            msaa: MsaaSamples::X2,
            smaa: None,
            post_fx_enabled: true,
            bloom: Some(BloomConfig { intensity: 0.15, low_frequency_boost: 0.5, threshold: 1.0, knee: 0.1 }),
            tonemapping: TonemappingMode::TonyMcMapface,
            deband_dither: true,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: true,
            shadows_enabled: false,
            shadow_quality: ShadowQuality::Off,
            shadow_filter: ShadowFilterMethod::Gaussian,
            cascade_shadow_count: 0,
            ambient_occlusion: None,
            particle_density: 0.6,
            particle_backend: ParticleBackend::Gpu,
            weather_visual_mode: WeatherVisualMode::Overlay,
            sprite_sheet_max: 8192,
            texture_filtering: TextureFiltering::Bilinear,
            anisotropic_filtering: 4,
            fov_override: None,
            camera_smoothing: true,
        },
        RenderTier::Enhanced => RenderSettings {
            tier,
            fps_cap: FpsCap::V144,
            vsync: VsyncMode::Adaptive,
            resolution_scale: 1.0,
            msaa: MsaaSamples::Off,
            smaa: Some(SmaaPreset::High),
            post_fx_enabled: true,
            bloom: Some(BloomConfig { intensity: 0.2, low_frequency_boost: 0.6, threshold: 0.8, knee: 0.15 }),
            tonemapping: TonemappingMode::TonyMcMapface,
            deband_dither: true,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: true,
            shadows_enabled: true,
            shadow_quality: ShadowQuality::High,
            shadow_filter: ShadowFilterMethod::Gaussian,
            cascade_shadow_count: 2,
            ambient_occlusion: Some(AoConfig { quality: AoQuality::Medium, radius: 1.0, intensity: 1.0 }),
            particle_density: 0.8,
            particle_backend: ParticleBackend::Gpu,
            weather_visual_mode: WeatherVisualMode::ShaderBlend,
            sprite_sheet_max: 8192,
            texture_filtering: TextureFiltering::Trilinear,
            anisotropic_filtering: 8,
            fov_override: None,
            camera_smoothing: true,
        },
        RenderTier::Ultra => RenderSettings {
            tier,
            fps_cap: FpsCap::V240,
            vsync: VsyncMode::Mailbox,
            resolution_scale: 1.0,
            msaa: MsaaSamples::Off,
            smaa: Some(SmaaPreset::Ultra),
            post_fx_enabled: true,
            bloom: Some(BloomConfig { intensity: 0.25, low_frequency_boost: 0.7, threshold: 0.6, knee: 0.2 }),
            tonemapping: TonemappingMode::TonyMcMapface,
            deband_dither: true,
            contrast: 1.0, brightness: 1.0, gamma: 2.2,
            dynamic_lighting: true,
            shadows_enabled: true,
            shadow_quality: ShadowQuality::Ultra,
            shadow_filter: ShadowFilterMethod::Temporal,
            cascade_shadow_count: 4,
            ambient_occlusion: Some(AoConfig { quality: AoQuality::Ultra, radius: 1.5, intensity: 1.2 }),
            particle_density: 1.0,
            particle_backend: ParticleBackend::Gpu,
            weather_visual_mode: WeatherVisualMode::ShaderBlend,
            sprite_sheet_max: 16384,
            texture_filtering: TextureFiltering::Trilinear,
            anisotropic_filtering: 16,
            fov_override: None,
            camera_smoothing: true,
        },
    }
}
```

### Hardware-Specific Auto-Configuration Profiles

Beyond tier detection, the engine recognizes specific hardware families and applies targeted overrides on top of the tier defaults. These are **refinements, not replacements** — tier detection runs first, then hardware-specific tweaks adjust individual parameters.

| Hardware Signature                         | Detected Via                                                 | Base Tier | Overrides Applied                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Intel HD 4000** (Ivy Bridge)             | `adapter_info.name` contains "HD 4000" or "Ivy Bridge"       | Baseline  | `particle_density: 0.2`, `camera_smoothing: false` (save CPU)                                                                     |
| **Intel HD 5000–6000** (Haswell/Broadwell) | `adapter_info.name` match                                    | Standard  | `shadow_quality: Off`, `bloom: None` (iGPU bandwidth limited)                                                                     |
| **Intel UHD 620–770** (modern iGPU)        | `adapter_info.name` match                                    | Standard  | `shadow_quality: Low`, `particle_density: 0.5`                                                                                    |
| **Steam Deck** (AMD Van Gogh)              | `adapter_info.name` contains "Van Gogh" or env `SteamDeck=1` | Enhanced  | `fps_cap: V30`, `resolution_scale: 0.75`, `shadow_quality: Medium`, `smaa: Medium`, `ambient_occlusion: None` (battery + thermal) |
| **GTX 600–700** (Kepler)                   | `adapter_info.name` match                                    | Standard  | Default Standard (no overrides)                                                                                                   |
| **GTX 900 / RX 400** (Maxwell/Polaris)     | `adapter_info.name` match                                    | Enhanced  | Default Enhanced (no overrides)                                                                                                   |
| **RTX 2000+ / RX 5000+**                   | `adapter_info.name` match                                    | Ultra     | Default Ultra (no overrides)                                                                                                      |
| **Apple M1**                               | `adapter_info.backend == Metal` + name match                 | Enhanced  | `vsync: On` (Metal VSync is efficient), `anisotropic_filtering: 16`                                                               |
| **Apple M2+**                              | `adapter_info.backend == Metal` + name match                 | Ultra     | Same Metal-specific tweaks                                                                                                        |
| **WebGPU (browser)**                       | `adapter_info.backend == BrowserWebGpu`                      | Standard  | `fps_cap: V60`, `resolution_scale: 0.8`, `ambient_occlusion: None` (WASM overhead)                                                |
| **WebGL2 (browser fallback)**              | `adapter_info.backend == Gl` + WASM target                   | Baseline  | `particle_density: 0.15`, `texture_filtering: Nearest`                                                                            |
| **Mobile (Android/iOS)**                   | Platform detection                                           | Standard  | `fps_cap: V30`, `resolution_scale: 0.7`, `shadows_enabled: false`, `bloom: None`, `particle_density: 0.3` (battery + thermals)    |

```rust
/// Hardware-specific refinements applied after tier detection.
/// Matches adapter name patterns and platform signals to fine-tune defaults.
pub fn apply_hardware_overrides(
    settings: &mut RenderSettings,
    adapter_info: &wgpu::AdapterInfo,
    platform: &PlatformInfo,
) {
    let name = adapter_info.name.to_lowercase();

    // Steam Deck: capable GPU but battery-constrained handheld
    if name.contains("van gogh") || platform.env_var("SteamDeck") == Some("1") {
        settings.fps_cap = FpsCap::V30;
        settings.resolution_scale = 0.75;
        settings.shadow_quality = ShadowQuality::Medium;
        settings.smaa = Some(SmaaPreset::Medium);
        settings.ambient_occlusion = None;
        return;
    }

    // Mobile: aggressive power saving
    if platform.is_mobile() {
        settings.fps_cap = FpsCap::V30;
        settings.resolution_scale = 0.7;
        settings.shadows_enabled = false;
        settings.bloom = None;
        settings.particle_density = 0.3;
        return;
    }

    // Browser (WASM): overhead budget
    if platform.is_wasm() {
        settings.fps_cap = FpsCap::V60;
        settings.resolution_scale = 0.8;
        settings.ambient_occlusion = None;
        if adapter_info.backend == wgpu::Backend::Gl {
            // WebGL2 fallback — severe constraints
            settings.particle_density = 0.15;
            settings.texture_filtering = TextureFiltering::Nearest;
        }
        return;
    }

    // Intel integrated GPUs: bandwidth-constrained
    if name.contains("hd 4000") || name.contains("ivy bridge") {
        settings.particle_density = 0.2;
        settings.camera_smoothing = false;
    } else if name.contains("hd 5") || name.contains("hd 6") || name.contains("haswell") {
        settings.shadow_quality = ShadowQuality::Off;
        settings.bloom = None;
    } else if name.contains("uhd") {
        settings.shadow_quality = ShadowQuality::Low;
        settings.particle_density = 0.5;
    }

    // Apple Silicon: Metal-specific optimizations
    if adapter_info.backend == wgpu::Backend::Metal {
        settings.vsync = VsyncMode::On; // Metal VSync is very efficient
        settings.anisotropic_filtering = 16;
    }
}
```

### Settings Load Order & Override Precedence

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ 1. wgpu::Adapter probe → detect_render_tier()                      │
 │ 2. default_settings_for_tier(tier) → factory defaults               │
 │ 3. apply_hardware_overrides() → device-specific tweaks              │
 │ 4. Load config.toml [render] → user's saved preferences             │
 │ 5. Load config.<game_module>.toml [render] → game-specific overrides│
 │ 6. Command-line args (--render-tier=baseline, --fps-cap=30)         │
 │ 7. In-game /set render.* commands (D058) → runtime tweaks           │
 └─────────────────────────────────────────────────────────────────────┘
 Each layer overrides only the fields it specifies.
 Unspecified fields inherit from the previous layer.
 /set commands persist back to config.toml via toml_edit (D067).
```

**First-run experience:** On first launch, the engine runs full auto-detection (steps 1-3), persists the result to `config.toml`, and shows a brief "Graphics configured for your hardware — [Your GPU Name] / [Tier Name]" notification. The settings menu is one click away for tweaking. Subsequent launches skip detection and load from `config.toml` (step 4), unless the GPU changes (adapter name mismatch triggers re-detection).

### Full `config.toml` `[render]` Section

The complete render configuration as persisted to `config.toml` (D067). Every field maps 1:1 to `RenderSettings`. Comments are preserved by `toml_edit` across engine updates.

```toml
# config.toml — [render] section (auto-generated on first run, fully editable)
# Delete this section to trigger re-detection on next launch.

[render]
tier = "enhanced"                   # "baseline", "standard", "enhanced", "ultra", or "auto"
                                    # "auto" = re-detect every launch (useful for laptops with eGPU)
fps_cap = 144                       # 30, 60, 144, 240, 0 (0 = uncapped)
vsync = "adaptive"                  # "off", "on", "adaptive", "mailbox"
resolution_scale = 1.0              # 0.5–2.0 (below 1.0 = render at lower res, upscale)

[render.anti_aliasing]
msaa = "off"                        # "off", "2x", "4x"
smaa = "high"                       # "off", "low", "medium", "high", "ultra"
# MSAA and SMAA are mutually exclusive. If both are set, SMAA wins and MSAA is forced off.

[render.post_fx]
enabled = true                      # Master toggle — false disables everything below
bloom_intensity = 0.2               # 0.0–1.0 (0.0 = bloom off)
bloom_threshold = 0.8               # HDR brightness threshold
tonemapping = "tony_mcmapface"      # "none", "reinhard", "reinhard_luminance", "aces_fitted",
                                    # "agx", "tony_mcmapface", "somewhat_boring_display_transform"
deband_dither = true                # Eliminates color banding in gradients
contrast = 1.0                      # 0.8–1.2
brightness = 1.0                    # 0.8–1.2
gamma = 2.2                         # 1.8–2.6

[render.lighting]
dynamic = true                      # Enable dynamic point/spot lights
shadows = true                      # Master shadow toggle
shadow_quality = "high"             # "off", "low" (512), "medium" (1024), "high" (2048), "ultra" (4096)
shadow_filter = "gaussian"          # "hardware_2x2", "gaussian", "temporal"
cascade_count = 2                   # 1–4 (directional light shadow cascades)
ambient_occlusion = true            # SSAO on/off
ao_quality = "medium"               # "low", "medium", "high", "ultra"
ao_radius = 1.0                     # World-space radius
ao_intensity = 1.0                  # 0.0–2.0

[render.particles]
density = 0.8                       # 0.0–1.0 (scales spawn rates globally)
backend = "gpu"                     # "cpu", "gpu" (cpu = forced CPU fallback)

[render.weather]
visual_mode = "shader_blend"        # "palette_tint", "overlay", "shader_blend"

[render.textures]
filtering = "trilinear"             # "nearest" (pixel-perfect), "bilinear", "trilinear"
anisotropic = 8                     # 1, 2, 4, 8, 16 (1 = off)

[render.camera]
smoothing = true                    # Interpolated camera movement between sim ticks
# fov_override is only used by 3D render modes (D048), not the default isometric view
# fov_override = 60.0              # Uncomment for custom FOV in 3D mode
```

### Mitigation Strategies

1. **CPU particle fallback:** Bevy supports CPU-side particle emission. Lower particle count but functional. Weather rain/snow works on Tier 0 — just fewer particles.

2. **Sprite sheet splitting:** The asset pipeline (Phase 0, `ra-formats`) splits large sprite sheets into 2048×2048 chunks at build time when targeting downlevel. Zero runtime cost — the splitting is a bake step.

3. **WebGPU-first browser strategy:** WebGPU is supported in Chrome, Edge, and Firefox (2023+). Rather than maintaining a severely limited WebGL2 fallback, target WebGPU for the browser build (Phase 7) and document WebGL2 as best-effort.

4. **Graceful detection, not crashes:** If the GPU doesn't meet even Tier 0 requirements, show a clear error message with hardware info and suggest driver updates. Never crash with a raw wgpu error.

5. **Shader complexity budget:** All shaders must compile on GL 3.3 (or have a GL 3.3 variant). Complex shaders (terrain blending, weather) provide simplified fallback paths via `#ifdef` or shader permutations.

### Hardware Floor Summary

| Concern    | Our Minimum                                         | Notes                                               |
| ---------- | --------------------------------------------------- | --------------------------------------------------- |
| GPU API    | OpenGL 3.3 (fallback) / Vulkan 1.0 (preferred)      | wgpu auto-selects best available backend            |
| GPU memory | 256 MB                                              | Classic RA sprites are tiny; HD sprites need more   |
| OS         | Windows 7 SP1+ / macOS 10.14+ / Linux (X11/Wayland) | DX12 requires Windows 10; GL 3.3 works on 7         |
| CPU        | 2 cores, SSE2                                       | Sim runs fine; Bevy itself needs ~2 threads minimum |
| RAM        | 4 GB                                                | Engine targets < 150 MB for 1000 units              |
| Disk       | ~500 MB                                             | Engine + classic assets; HD assets add ~1-2 GB      |

**Bottom line:** Bevy/wgpu will run on 2012 hardware, but **visual features must tier down automatically.** The sim is completely unaffected. The architecture already has `RenderSettings` — we formalize it into the tier system above.
