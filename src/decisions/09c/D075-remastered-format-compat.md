## D075: Remastered Collection Format Compatibility

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 2 (format parsers), Phase 6a (Asset Studio import wizard)
- **Canonical for:** Loading and converting assets from the C&C Remastered Collection (EA, 2020) into IC's native pipeline
- **Scope:** `ra-formats` (parsers), `ic-editor` (Asset Studio import wizard), `05-FORMATS.md`
- **Decision:** IC reads all Remastered Collection asset formats natively — MEG archives, TGA+META sprite sheets, BK2 video, WAV audio, XML config — enabling users who own the Remastered Collection to use those assets directly. HD sprite import splits megasheets into IC's per-frame sprite representation using the META JSON geometry. No Remastered assets are redistributed.
- **Why:** (1) The Remastered Collection's C++ DLL source is GPL v3 — format definitions are legally referenceable. (2) Players who own the Remastered Collection expect their HD assets to work. (3) The Remastered formats are well-documented by the modding community (PPM, CnCNet). (4) IC already supports the classic formats these are derived from — HD support is an incremental extension.
- **Non-goals:** Binary compatibility with Petroglyph's C# GlyphX layer; redistributing EA's proprietary HD art, music, or video; running Remastered mods that depend on GlyphX-specific APIs; replacing the Remastered Collection as a product.
- **Invariants preserved:** `ra-formats` remains a pure parsing library with no I/O side effects. All imported assets convert to IC-native representations (PNG sprites, OGG/WAV audio, WebM video). Sim determinism unaffected — asset formats are presentation-only.
- **Defaults / UX behavior:** "Import Remastered Installation" wizard in Asset Studio auto-detects a Remastered install folder, inventories available assets, and offers selective import. Users choose which asset categories to import. Imported assets land in a mod-ready directory structure.
- **Compatibility / Export impact:** Imported Remastered assets are usable in IC mods but NOT publishable to Workshop (proprietary EA content). Asset Studio marks provenance as `source: remastered_collection` and Publish Readiness (D038) blocks Workshop upload of EA-sourced assets.
- **Security / Trust impact:** MEG archive parser must handle malformed archives safely (fuzzing required). TGA/DDS parsers use established Rust crates (`image`, `ddsfile`) — no custom decoder needed.
- **Public interfaces / types / commands:** `MegArchive`, `MegEntry`, `RemasteredSpriteSheet`, `MetaFrame`, `RemasteredImportManifest`, `ic asset import-remastered`
- **Affected docs:** `src/05-FORMATS.md`, `src/decisions/09f/D040-asset-studio.md`, `src/architecture/ra-experience.md`, `src/decisions/09c-modding.md`
- **Keywords:** remastered, remaster, MEG, TGA, META, BK2, Bink2, HD sprites, megasheet, GlyphX, Petroglyph, EA GPL, import wizard

---

### Context

The C&C Remastered Collection (EA / Petroglyph, 2020) modernized Red Alert and Tiberian Dawn with HD assets while preserving the original gameplay via a C++ DLL (released under GPL v3). The DLL source gives us legal access to format definitions. The HD assets themselves are proprietary EA content — IC never redistributes them, but players who own the Remastered Collection should be able to use their purchased assets in IC.

IC already reads every **classic** C&C format (`.mix`, `.shp`, `.pal`, `.aud`, `.vqa`). The Remastered Collection introduced a parallel set of **HD formats** that wrap or replace the classics. This decision covers reading those HD formats and converting them into IC's native pipeline.

### Remastered Format Inventory

The Remastered Collection uses Petroglyph's format family (from Empire at War / Grey Goo lineage), not Westwood's original formats. The C++ DLL still reads classic formats internally, but the C# GlyphX layer loads HD replacements from Petroglyph containers.

#### Archives

| Format | Purpose | Structure | IC Strategy |
|--------|---------|-----------|-------------|
| `.meg` | Primary archive container | Petroglyph archive format. Header + file table + packed data. Openable by community tools (OS Big Editor, OpenSage). | New `MegArchive` parser in `ra-formats`. Read-only (no write support needed — IC doesn't produce MEG files). |
| `.pgm` | Map package archive | MEG file with different extension. Contains map file + related data (preview image, metadata). | Reuse `MegArchive` parser. Map data extracted and converted to IC YAML map format. |

#### Sprites & Textures

| Format | Purpose | Structure | IC Strategy |
|--------|---------|-----------|-------------|
| `.tga` | HD sprite sheets | 32-bit RGBA Targa files. One TGA per unit/building/animation contains all frames composited into a single large sheet (a "megasheet"). Alpha channel for transparency. Player color uses chroma-key green (HSV hue ~110–111) instead of palette index remapping. | Rust `image` crate reads TGA natively. Chroma-key detection replaces green band with IC's palette-index remap shader. |
| `.meta` | Frame geometry metadata | JSON file paired 1:1 with each TGA. Contains per-frame `{"size":[w,h],"crop":[x,y,w,h]}` entries that define where each sprite frame lives within the megasheet. | Parse JSON → `Vec<MetaFrame>` → split TGA into individual frames → map to IC sprite sequences. |
| `.dds` | GPU-compressed textures | DirectDraw Surface format. BC1/BC3/BC7 compression. Used for terrain, UI chrome, effects. | Rust `ddsfile` crate + `image` for decompression. Convert to KTX2 (IC's recommended GPU texture format) or PNG. |
| `.mtd` | MegaTexture data | Petroglyph format for packed UI elements (sidebar icons in `MT_COMMANDBAR_COMMON` variants). | Custom parser in `ra-formats`. Low priority — only needed for UI chrome import. |

#### Audio

| Format | Purpose | Structure | IC Strategy |
|--------|---------|-----------|-------------|
| `.wav` | Remixed sound effects & music | Standard WAV containers. Microsoft ADPCM codec in tested samples. | Rust `hound` crate reads WAV natively. ADPCM decode via `symphonia` or platform codec. Direct passthrough into IC's Kira audio pipeline — no conversion needed. |

**Note:** The Remastered Collection's audio is standard WAV, not a proprietary format. IC already plays WAV natively. The only work is reading them out of MEG archives.

#### Video

| Format | Purpose | Structure | IC Strategy |
|--------|---------|-----------|-------------|
| `.bk2` | HD cutscenes & briefings | Bink Video 2 format (RAD Game Tools). Proprietary codec with wide game-industry adoption. | Two options: (1) Bink SDK integration (free for non-commercial, licensed for commercial — terms TBD). (2) Community `binkdec` / FFmpeg Bink2 decoder. Convert to WebM (VP9) at import time via Asset Studio. |

**Bink2 strategy:** Unlike classic `.vqa` (which IC decodes natively), Bink2 is a proprietary codec. IC does NOT ship a Bink2 runtime decoder. Instead, the Asset Studio **converts BK2 → WebM at import time**. This is a one-time operation per cutscene. The converted WebM plays through IC's standard video pipeline. Users who want the Remastered cutscenes in IC import them once; the originals remain untouched in the Remastered install folder.

#### Configuration & Metadata

| Format | Purpose | Structure | IC Strategy |
|--------|---------|-----------|-------------|
| `.xml` | GlyphX configuration | Standard XML. Game settings, asset mappings, sequence definitions. | Rust `quick-xml` crate. Extract asset mapping tables (classic frame → HD frame correspondence) for the sprite import pipeline. |
| `.dat` / `.loc` | String tables | Petroglyph localization format. | Parse for completeness; IC uses its own localization system. Low priority. |
| `.bui` | UI layout | Petroglyph UI description format. Undocumented. | Skip. IC has its own UI theme system (D032). |

#### Formats IC Skips

| Format | Why Skipped |
|--------|-------------|
| `.alo` | Petroglyph 3D model format. Only one file exists in Remastered (a null hardpoint). No useful content. |
| `.pgso` | Compiled DirectX shader bytecode. IC uses wgpu/WGSL shaders. |
| `.bfd`, `.cfx`, `.cpd`, `.gpd`, `.gtl`, `.mtm`, `.sob`, `.ted` | Undocumented Petroglyph internal formats. No community documentation. No useful content for IC. |
| `.ttf` | Standard TrueType fonts. IC loads system fonts or bundles its own. |

### HD Sprite Import Pipeline

The most complex part of Remastered format support is converting HD megasheets into IC's per-frame sprite representation. This is the core technical contribution of D075.

#### How Remastered Sprites Work

In the original game, each unit has a `.shp` file containing N indexed frames (e.g., 32 facings × M animation frames). The Remastered Collection replaces each `.shp` with:

1. **One large TGA** — all frames composited into a single atlas image (the "megasheet")
2. **One META JSON** — per-frame geometry: canvas size and crop rectangle within the TGA
3. **Chroma-key player colors** — instead of palette indices 80–95, player-colored pixels use a bright green band (HSV hue ~110–111) with varying saturation/brightness for shading

The frame ordering in the TGA matches the original `.shp` frame ordering — frame 0 in the META corresponds to frame 0 in the original `.shp`. This is critical: it means the XML sequence definitions from the original game (facing counts, animation delays) apply directly to the HD frames.

#### Import Algorithm

```
Input:  <unit>.tga + <unit>.meta (from Remastered MEG archive)
Output: Vec<RgbaImage> (individual frames) + SequenceMap (frame→animation mapping)

1. Load TGA → full RGBA image
2. Parse META JSON → Vec<MetaFrame { size: [w,h], crop: [x,y,w,h] }>
3. For each MetaFrame:
   a. Extract crop rectangle from the TGA → individual frame image
   b. Detect chroma-key green pixels (hue 110±5, saturation > 0.5)
   c. Replace green band with IC remap marker:
      - Option A: Write palette index 80–95 equivalent into a separate remap mask
      - Option B: Store as a shader-compatible "remap UV" channel
   d. Emit frame as RGBA PNG (IC native) or palette-quantized indexed PNG (classic mode)
4. Map frame indices to animation sequences using original sequence definitions
5. Write IC sprite sheet (PNG atlas + YAML sequence metadata)
```

#### Player Color Remapping

The Remastered Collection's chroma-key approach is more flexible than the original's palette-index approach — it allows smooth gradients and anti-aliasing in player-colored areas. IC's import pipeline preserves this:

| Approach | When Used | How |
|----------|-----------|-----|
| **HD mode (D048 modern render)** | Player uses HD render mode | Keep full RGBA. Shader detects green-band pixels at runtime and remaps to player color with gradient preservation. Same technique as Remastered. |
| **Classic mode (D048 classic render)** | Player uses classic render mode | Quantize green-band pixels to palette indices 80–95. Produces exact classic look. Loses HD anti-aliasing (intentional — that's the classic aesthetic). |

#### Rust Types

```rust
/// Petroglyph MEG archive reader.
pub struct MegArchive {
    pub entries: Vec<MegEntry>,
}

pub struct MegEntry {
    pub name: String,
    pub offset: u64,
    pub size: u64,
}

/// A single frame's geometry within a Remastered megasheet TGA.
pub struct MetaFrame {
    /// Canvas dimensions (logical frame size including padding).
    pub size: [u32; 2],
    /// Crop rectangle [x, y, width, height] within the TGA.
    pub crop: [u32; 4],
}

/// Parsed Remastered sprite sheet: TGA image + frame geometry.
pub struct RemasteredSpriteSheet {
    pub image: RgbaImage,
    pub frames: Vec<MetaFrame>,
    /// Original asset name (e.g., "4tnk" for Mammoth Tank).
    pub asset_name: String,
}

/// Import manifest tracking what was imported from a Remastered installation.
pub struct RemasteredImportManifest {
    pub source_path: PathBuf,
    pub imported_at: String, // RFC 3339 UTC
    pub assets: Vec<ImportedAsset>,
}

pub struct ImportedAsset {
    pub original_path: String,       // Path within MEG archive
    pub ic_path: PathBuf,            // Where it landed in IC mod structure
    pub asset_type: ImportedAssetType,
    pub provenance: AssetProvenance, // From D040 — source: remastered_collection
}

pub enum ImportedAssetType {
    Sprite,
    Terrain,
    Audio,
    Video,
    UiChrome,
    Config,
}
```

### Asset Studio Integration — "Import Remastered Installation" Wizard

The Asset Studio (D040) gains a dedicated import workflow for Remastered Collection assets.

#### UX Flow

1. **Detect installation** — The wizard checks standard install locations:
   - Steam: `<steam_library>/steamapps/common/CnC_Remastered_Collection/`
   - EA App: `<ea_library>/Command & Conquer Remastered Collection/`
   - Custom: user browses to folder
2. **Inventory** — Scan MEG archives, list available asset categories with counts:
   - Sprites: ~2,400 TGA+META pairs (units, buildings, infantry, terrain, effects)
   - Audio: ~800 WAV files (SFX, EVA, music)
   - Video: ~40 BK2 files (cutscenes, briefings)
   - UI: ~200 DDS/TGA files (sidebar, buttons, icons)
3. **Select** — User picks categories and optionally individual assets. Presets:
   - "Everything" — imports all categories
   - "Gameplay assets only" — sprites + audio (no video, no UI chrome)
   - "Audio only" — just the remixed sound effects and music
   - "Custom" — pick individual categories
4. **Convert** — Background processing:
   - TGA+META → IC sprite sheets (PNG atlas + YAML sequences)
   - BK2 → WebM (VP9, preserving original resolution)
   - WAV → passthrough (already IC-compatible)
   - DDS → PNG or KTX2
5. **Output** — Assets land in a mod directory: `mods/remastered-hd/`
   - Standard IC mod structure (YAML manifest, asset directories)
   - Provenance metadata set to `source: remastered_collection`
   - Publish Readiness blocks Workshop upload (proprietary EA content)
6. **Activate** — User enables the `remastered-hd` mod in IC. HD assets override classic assets via the standard mod layering system (D062 Virtual Namespace).

#### Import Performance Estimate

| Category | Count | Per-Asset | Total (est.) |
|----------|-------|-----------|-------------|
| Sprites (TGA+META → PNG) | ~2,400 | ~50ms | ~2 min |
| Audio (WAV passthrough) | ~800 | ~1ms (copy) | ~1 sec |
| Video (BK2 → WebM) | ~40 | ~10s | ~7 min |
| UI (DDS → PNG) | ~200 | ~20ms | ~4 sec |

**Total:** ~10 minutes for a full import. One-time operation. Progress bar with per-category status.

### Legal Model

| What | Legal Status | IC Policy |
|------|-------------|-----------|
| **Format definitions** (how to read MEG, TGA+META, etc.) | GPL v3 (from EA DLL source) + community documentation | Freely implement parsers in `ra-formats` |
| **HD art assets** (sprites, textures, UI) | Proprietary EA content | Never redistribute. Import from user's own purchase. Block Workshop upload. |
| **Remixed audio** (SFX, music, EVA) | Proprietary EA content | Same as art — import from user's purchase only. |
| **HD cutscenes** (BK2 video) | Proprietary EA content | Same — convert from user's purchase. |
| **Gameplay values** (costs, HP, speeds) | GPL v3 (in DLL source) | Already captured in D019 `remastered` balance preset. |
| **Pathfinding algorithm** | GPL v3 (in DLL source) | Already implemented as D045 `RemastersPathfinder` preset. |

This is the same legal model that OpenRA, CnCNet, and every other community project uses: format compatibility is legal; redistributing proprietary assets is not.

### Alternatives Considered

1. **Runtime Bink2 decoding** — Ship a BK2 decoder in IC so Remastered cutscenes play directly without conversion. Rejected: Bink2 is proprietary (RAD Game Tools). Licensing adds cost and legal complexity. Converting to WebM at import time is simpler, produces better integration with IC's standard video pipeline, and the one-time conversion cost is negligible.

2. **Direct MEG mounting (no conversion)** — Mount Remastered MEG archives as a virtual filesystem and read TGA/META at runtime. Rejected: adds runtime complexity, requires Remastered Collection to be installed at all times, and prevents IC from applying its own sprite pipeline optimizations (atlas packing, KTX2 GPU compression). One-time import-and-convert is cleaner.

3. **Only support classic formats from Remastered** — The Remastered Collection ships classic `.mix`/`.shp`/`.aud`/`.vqa` alongside HD assets. IC could just read those. Rejected: the whole point of Remastered is the HD assets. Users expect HD. Classic formats are already supported; this decision adds HD on top.

4. **Reverse-engineer GlyphX C# layer** — The proprietary C# GlyphX engine handles HD rendering, UI, and networking. We could study its asset loading for complete compatibility. Rejected: GlyphX is proprietary (not GPL). The C++ DLL source plus community documentation provides everything needed for format parsing without touching proprietary code.

### Phase

- **Phase 2:** `ra-formats` gains MEG archive parser, TGA+META sprite sheet splitter, and DDS reader. These are pure parsing — no UI.
- **Phase 6a:** Asset Studio "Import Remastered Installation" wizard ships. BK2→WebM conversion pipeline. Full import workflow with provenance tracking.
- **CLI fallback (Phase 2):** `ic asset import-remastered <path>` provides headless import for CI/automation/power users before Asset Studio ships.

### Cross-References

- **D040** (Asset Studio) — Import wizard lives in Asset Studio Layer 2
- **D048** (Render Modes) — HD sprites activate in modern render mode; classic render mode uses palette-quantized versions
- **D019** (Balance Presets) — `remastered` preset already captures Remastered gameplay values
- **D045** (Pathfinding Presets) — `RemastersPathfinder` already reproduces Remastered pathfinding
- **D062** (Mod Profiles) — Imported Remastered assets live in a mod namespace (`remastered-hd`)
- **D068** (Selective Installation) — Remastered HD assets are an optional content tier, not required
- **`research/remastered-collection-netcode-analysis.md`** — Deep dive on the Remastered C++ DLL architecture
- **`research/pathfinding-remastered-analysis.md`** — Remastered pathfinding algorithm analysis
- **`src/architecture/ra-experience.md`** — Reference source strategy (Remastered as UX gold standard)
