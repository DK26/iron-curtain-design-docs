# 05 — File Formats & Original Source Insights

## Formats to Support (ra-formats crate)

### Binary Formats (from original game / OpenRA)

| Format | Purpose           | Notes                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.mix` | Archive container | Flat archive with CRC-based filename hashing (rotate-left-1 + add), 6-byte `FileHeader` + sorted `SubBlock` index (12 bytes each). Extended format adds Blowfish encryption + SHA-1 digest. No per-file compression. See § MIX Archive Format for full struct definitions                                                                                                                                          |
| `.shp` | Sprite sheets     | Frame-based, palette-indexed (256 colors). `ShapeBlock_Type` container with per-frame `Shape_Type` headers. LCW-compressed frame data (or uncompressed via `NOCOMP` flag). Supports compact 16-color mode, horizontal/vertical flip, scaling, fading, shadow, ghost, and predator draw modes                                                                                                                       |
| `.tmp` | Terrain tiles     | IFF-format icon sets — collections of 24×24 palette-indexed tiles. Chunks: ICON/SINF/SSET/TRNS/MAP/RPAL/RTBL. SSET data may be LCW-compressed. RA version adds `MapWidth`/`MapHeight`/`ColorMap` for land type lookup. TD and RA `IControl_Type` structs differ — see § TMP Terrain Tile Format                                                                                                                    |
| `.pal` | Color palettes    | Raw 768 bytes (256 × RGB), no header. Components in 6-bit VGA range (0–63), not 8-bit. Convert to 8-bit via left-shift by 2. Multiple palettes per scenario (temperate, snow, interior, etc.)                                                                                                                                                                                                                      |
| `.aud` | Audio             | Westwood IMA ADPCM compressed. 12-byte `AUDHeaderType`: sample rate (Hz), compressed/uncompressed sizes, flags (stereo/16-bit), compression ID. Codec uses dual 1424-entry lookup tables (`IndexTable`/`DiffTable`) for 4-bit-nibble decoding. Read + write: Asset Studio (D040) converts .aud ↔ .wav/.ogg so modders can extract original sounds for remixing and convert custom recordings to classic AUD format |
| `.vqa` | Video             | VQ vector quantization cutscenes. Chunk-based IFF structure (WVQA/VQHD/FINF/VQFR/VQFK). Codebook blocks (4×2 or 4×4 pixels), LCW-compressed frames, interleaved audio (PCM/Westwood ADPCM/IMA ADPCM). Read + write: Asset Studio (D040) converts .vqa ↔ .mp4/.webm for campaign creators                                                                                                                           |

### Remastered Collection Formats (Petroglyph)

HD asset formats from the C&C Remastered Collection (EA, 2020). Format definitions derived from the GPL v3 C++ DLL source and community documentation. See [D075](decisions/09c/D075-remastered-format-compat.md) for full import pipeline and legal model.

| Format       | Purpose              | Notes                                                                                                                                                                                                                                              |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.meg`       | Archive container    | Petroglyph archive format (from Empire at War lineage). Header + file table + packed data. Read-only in `ra-formats`. Community tools: OS Big Editor, OpenSage.                                                                                   |
| `.tga+.meta` | HD sprite sheets     | 32-bit RGBA TGA "megasheets" — all frames of a unit/building composited into one large atlas. Paired `.meta` JSON file provides per-frame geometry: `{"size":[w,h],"crop":[x,y,w,h]}`. Player colors use chroma-key green (HSV hue ~110) instead of palette indices. |
| `.dds`       | GPU textures         | DirectDraw Surface (BC1/BC3/BC7). Terrain, UI chrome, effects. Convert to KTX2 or PNG at import time.                                                                                                                                             |
| `.bk2`       | HD video (Bink2)     | Proprietary RAD Game Tools codec. Cutscenes and briefings. Converted to WebM (VP9) at import time — IC does not ship a Bink2 runtime decoder.                                                                                                     |
| `.wav` (HD)  | Remixed audio        | Standard WAV containers (Microsoft ADPCM). Plays natively in IC's Kira audio pipeline. No conversion needed.                                                                                                                                      |
| `.pgm`       | Map package          | MEG file with different extension. Contains map + preview image + metadata. Reuse `MegArchive` parser.                                                                                                                                             |

### Text Formats

| Format            | Purpose                     | Notes                                              |
| ----------------- | --------------------------- | -------------------------------------------------- |
| `.ini` (original) | Game rules                  | Original Red Alert format                          |
| MiniYAML (OpenRA) | Game rules, maps, manifests | Custom dialect, needs converter                    |
| YAML (ours)       | Game rules, maps, manifests | Standard spec-compliant YAML                       |
| `.oramap`         | OpenRA map package          | ZIP archive containing map.yaml + terrain + actors |

### Canonical Asset Format Recommendations (D049)

New Workshop content should use **Bevy-native modern formats** by default. C&C legacy formats are fully supported for backward compatibility but are not the recommended distribution format. The engine loads both families at runtime — no manual conversion is ever required.

| Asset Type      | Recommended (new content)      | Legacy (existing)      | Why Recommended                                                                                                     |
| --------------- | ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Music**       | OGG Vorbis (128–320kbps)       | .aud (ra-formats)      | Bevy default feature, stereo 44.1kHz, ~1.4MB/min. Open, patent-free, WASM-safe, security-audited by browser vendors |
| **SFX**         | WAV (16-bit PCM) or OGG        | .aud (ra-formats)      | WAV = zero decode latency for gameplay-critical sounds. OGG for larger ambient sounds                               |
| **Voice**       | OGG Vorbis (96–128kbps)        | .aud (ra-formats)      | Transparent quality for speech. 200+ EVA lines stay under 30MB                                                      |
| **Sprites**     | PNG (RGBA or indexed)          | .shp+.pal (ra-formats) | Bevy-native via `image` crate. Lossless, universal tooling. Palette-indexed PNG preserves classic aesthetic         |
| **HD Textures** | KTX2 (BC7/ASTC GPU-compressed) | N/A                    | Zero-cost GPU upload, Bevy-native. `ic mod build` can batch-convert PNG→KTX2                                        |
| **Terrain**     | PNG tiles                      | .tmp+.pal (ra-formats) | Same as sprites — theater tilesets are sprite sheets                                                                |
| **Cutscenes**   | WebM (VP9, 720p–1080p)         | .vqa (ra-formats)      | Open, royalty-free, browser-compatible (WASM), ~5MB/min at 720p                                                     |
| **3D Models**   | GLTF/GLB                       | N/A                    | Bevy's native 3D format                                                                                             |
| **Palettes**    | .pal (768 bytes)               | .pal (ra-formats)      | Already tiny and universal in the C&C community — no change needed                                                  |
| **Maps**        | IC YAML                        | .oramap (ZIP+MiniYAML) | Already designed (D025, D026)                                                                                       |

**Why modern formats:** (1) Bevy loads them natively — zero custom code, full hot-reload and async loading. (2) Security — OGG/PNG parsers are fuzz-tested and browser-audited; our custom .aud/.shp parsers are not. (3) Multi-game — non-C&C game modules (D039) won't use .shp or .aud. (4) Tooling — every editor exports PNG/OGG/WAV/WebM; nobody's toolchain outputs .aud. (5) WASM — modern formats work in browser builds out of the box.

The Asset Studio (D040) converts in both directions. See `decisions/09e/D049-workshop-assets.md` for full rationale, storage comparisons, and distribution strategy.

### ra-formats Crate Goals

1. Parse all above formats reliably
2. Extensive tests against known-good OpenRA data
3. `miniyaml2yaml` converter tool
4. CLI tool to dump/inspect/validate RA assets
5. **Write support (Phase 6a):** .shp generation from frames (LCW compression + frame offset tables), .pal writing (trivial — 768 bytes), .aud encoding (IMA ADPCM compression from PCM input), .vqa encoding (VQ codebook generation + frame differencing + audio interleaving), optional .mix packing (CRC hash table generation) — required by Asset Studio (D040). All encoders reference the EA GPL source code implementations directly (see § Binary Format Codec Reference)
6. Useful as standalone crate (builds project credibility)
7. Released open source early (Phase 0 deliverable, read-only; write support added Phase 6a)

### Non-C&C Format Landscape

The `ra-formats` crate covers the C&C format family, but the engine (D039) supports non-C&C games via the `FormatRegistry` and WASM format loaders (see `04-MODDING.md` § WASM Format Loader API Surface). Analysis of six major OpenRA community mods (see `research/openra-mod-architecture-analysis.md`) reveals the scope of formats that non-C&C total conversions require:

| Game (Mod)             | Custom Formats Required                                                   | Notes                                                     |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| KKnD (OpenKrush)       | `.blit`, `.mobd`, `.mapd`, `.lvl`, `.son`, `.soun`, `.vbc` (15+ decoders) | Entirely proprietary format family; zero overlap with C&C |
| Dune II (d2)           | `.icn`, `.cps`, `.wsa`, `.shp` variant, `.adl`, custom map format (6+)    | Different `.shp` than C&C; incompatible parsers           |
| Swarm Assault (OpenSA) | Custom creature sprites, terrain tiles                                    | Format details vary by content source                     |
| Tiberian Dawn HD       | MegV3 archives, 128×128 HD tiles (`RemasterSpriteSequence`)               | Different archive format than `.mix`                      |
| OpenHV                 | None — uses PNG/WAV/OGG exclusively                                       | Original game content avoids legacy formats entirely      |

**Key insight:** Non-C&C games on the engine need 0–15+ custom format decoders, and there is zero format overlap with C&C. This validates the `FormatRegistry` design — the engine cannot hardcode any format assumption. `ra-formats` is one format loader plugin among potentially many.

**Cross-engine validation:** Godot's `ResourceFormatLoader` follows the same pattern — a pluggable interface where any module registers format handlers (recognized extensions, type specializations, caching modes) and the engine dispatches to the correct loader at runtime. Godot's implementation includes threaded loading, load caching (reuse/ignore/replace), and recursive dependency resolution for complex assets. IC's `FormatRegistry` via Bevy's asset system should support the same capabilities: threaded background loading, per-format caching policy, and declared dependencies between assets (e.g., a sprite sheet depends on a palette). See `research/godot-o3de-engine-analysis.md` § Asset Pipeline.

### Content Source Detection

Games use different distribution platforms, and each stores assets in different locations. Analysis of TiberianDawnHD (see `research/openra-mod-architecture-analysis.md`) shows a robust pattern for detecting installed game content:

```rust
/// Content sources — where game assets are installed.
/// Each game module defines which sources it supports.
pub enum ContentSource {
    Steam { app_id: u32 },           // e.g., Steam AppId 2229870 (TD Remastered)
    Origin { registry_key: String }, // Windows registry path to install dir
    Gog { game_id: String },         // GOG Galaxy game identifier
    Directory { path: PathBuf },     // Manual install / disc copy
}
```

TiberianDawnHD detects Steam via AppId, Origin via Windows registry key, and GOG via standard install paths. IC should implement a `ContentDetector` that probes all known sources for each supported game and presents the user with detected installations at first run. This handles the critical UX question "where are your game assets?" without requiring manual path entry — the same approach used by OpenRA, CorsixTH, and other reimplementation projects.

**Phase:** Content detection ships in Phase 0 as part of `ra-formats` (for C&C assets). Game module content detection in Phase 1.

### Browser Asset Storage

The `ContentDetector` pattern above assumes filesystem access — probing Steam, Origin, GOG, and directory paths. None of this works in a browser build (WASM target). Browsers have no access to the user's real filesystem. IC needs a dedicated browser asset storage strategy.

**Browser storage APIs** (in order of preference):

- **OPFS (Origin Private File System):** The newest browser storage API (~2023). Provides a real private filesystem with file/directory operations and synchronous access from Web Workers. Best performance for large binary assets like `.mix` archives. Primary storage backend for IC's browser build.
- **IndexedDB:** Async NoSQL database. Stores structured data and binary blobs. Typically 50MB–several GB (browser-dependent, user-prompted above quota). Wider browser support than OPFS. Fallback storage backend.
- **localStorage:** Simple key-value string store, ~5-10MB limit, synchronous. Too small for game assets — suitable only for user preferences and settings.

**Storage abstraction:**

```rust
/// Platform-agnostic asset storage.
/// Native builds use the filesystem directly. Browser builds use OPFS/IndexedDB.
pub trait AssetStore: Send + Sync {
    fn read(&self, path: &VirtualPath) -> Result<Vec<u8>>;
    fn write(&self, path: &VirtualPath, data: &[u8]) -> Result<()>;
    fn exists(&self, path: &VirtualPath) -> bool;
    fn list_dir(&self, path: &VirtualPath) -> Result<Vec<VirtualPath>>;
    fn delete(&self, path: &VirtualPath) -> Result<()>;
    fn available_space(&self) -> Result<u64>; // quota management
}

pub struct NativeStore { root: PathBuf }
pub struct BrowserStore { /* OPFS primary, IndexedDB fallback */ }
```

**Browser first-run asset acquisition:**

1. User opens IC in a browser tab. No game assets exist in browser storage yet.
2. First-run wizard presents options: (a) drag-and-drop `.mix` files from a local RA installation, (b) paste a directory path to bulk-import, or (c) download a free content pack if legally available (e.g., freeware TD/RA releases).
3. Imported files are stored in the OPFS virtual filesystem under a structured directory (similar to Chrono Divide's `📁 /` layout: game archives at root, mods in `mods/<modId>/`, maps in `maps/`, replays in `replays/`).
4. Subsequent launches skip import — assets persist in OPFS across sessions.

**Browser mod installation:**

Mods are downloaded as archives (via Workshop HTTP API or direct URL), extracted in-browser (using a JS/WASM decompression library), and written to `mods/<modId>/` in the virtual filesystem. The in-game mod browser triggers download and extraction. Lobby auto-download (D030) works identically — the `AssetStore` trait abstracts the actual storage backend.

**Storage quota management:**

Browsers impose per-origin storage limits (typically 1-20GB depending on browser and available disk). IC's browser build should: (a) check `available_space()` before large downloads, (b) surface clear warnings when approaching quota, (c) provide a storage management UI (like Chrono Divide's "Options → Storage") showing per-mod and per-asset space usage, (d) allow selective deletion of cached assets.

**Bevy integration:** Bevy's asset system already supports custom asset sources. The `BrowserStore` registers as a Bevy `AssetSource` so that `asset_server.load("ra2.mix")` transparently reads from OPFS on browser builds and from the filesystem on native builds. No game code changes required — the abstraction lives below Bevy's asset layer.

**Phase:** `AssetStore` trait and `BrowserStore` implementation ship in Phase 7 (browser build). The trait definition should exist from Phase 0 so that `NativeStore` is used consistently — this prevents filesystem assumptions from leaking into game code. Chrono Divide's browser storage architecture (OPFS + IndexedDB, virtual directory structure, mod folder isolation) validates this approach.

## Binary Format Codec Reference (EA Source Code)

> All struct definitions in this section are taken verbatim from the GPL v3 EA source code repositories:
> - [CnC_Remastered_Collection](https://github.com/electronicarts/CnC_Remastered_Collection) — primary source (REDALERT/ and TIBERIANDAWN/ directories)
> - [CnC_Red_Alert](https://github.com/electronicarts/CnC_Red_Alert) — VQA/VQ video format definitions (VQ/ and WINVQ/ directories)
>
> These are the authoritative definitions for `ra-formats` crate implementation. Field names, sizes, and types must match exactly for binary compatibility.

### MIX Archive Format (.mix)

**Source:** `REDALERT/MIXFILE.H`, `REDALERT/MIXFILE.CPP`, `REDALERT/CRC.H`, `REDALERT/CRC.CPP`

A MIX file is a flat archive. Files are identified by CRC hash of their filename — there is no filename table in the archive.

#### File Layout

```
[optional: 2-byte zero flag + 2-byte flags word]  // Extended format only
[FileHeader]                                       // 6 bytes
[SubBlock array]                                   // sorted by CRC for binary search
[file data]                                        // concatenated file bodies
```

#### Structures

```c
// Archive header (6 bytes)
typedef struct {
    short count;    // Number of files in the archive
    long  size;     // Total size of all file data (bytes)
} FileHeader;

// Per-file index entry (12 bytes)
struct SubBlock {
    long CRC;       // CRC hash of uppercase filename
    long Offset;    // Byte offset from start of data section
    long Size;      // File size in bytes
};
```

**Extended format detection:** If the first `short` read is 0, the next `short` is a flags word:
- Bit `0x0001` — archive contains SHA-1 digest
- Bit `0x0002` — archive header is encrypted (Blowfish)

When neither flag is set, the first `short` is the file count and the archive uses the basic format.

#### CRC Filename Hashing Algorithm

```c
// From CRC.H / CRC.CPP — CRCEngine
// Accumulates bytes in a 4-byte staging buffer, then:
//   CRC = _lrotl(CRC, 1) + *longptr;
// (rotate CRC left 1 bit, add next 4 bytes as a long)
//
// Filenames are converted to UPPERCASE before hashing.
// Partial final bytes (< 4) are accumulated into the staging buffer
// and the final partial long is added the same way.
```

The SubBlock array is sorted by CRC to enable binary search lookup at runtime.

---

### SHP Sprite Format (.shp)

**Source:** `REDALERT/WIN32LIB/SHAPE.H`, `REDALERT/2KEYFRAM.CPP`, `TIBERIANDAWN/KEYFRAME.CPP`

SHP files contain one or more palette-indexed sprite frames. Individual frames are typically LCW-compressed.

#### Shape Block (Multi-Frame Container)

```c
// From SHAPE.H — container for multiple shapes
typedef struct {
    unsigned short NumShapes;   // Number of shapes in block
    long           Offsets[];   // Variable-length array of offsets to each shape
} ShapeBlock_Type;
```

#### Single Shape Header

```c
// From SHAPE.H — header for one shape frame
typedef struct {
    unsigned short ShapeType;       // Shape type flags (see below)
    unsigned char  Height;          // Height in scan lines
    unsigned short Width;           // Width in bytes
    unsigned char  OriginalHeight;  // Original (unscaled) height
    unsigned short ShapeSize;       // Total size including header
    unsigned short DataLength;      // Size of uncompressed data
    unsigned char  Colortable[16];  // Color remap table (compact shapes only)
} Shape_Type;
```

#### Keyframe Animation Header (Multi-Frame SHP)

```c
// From 2KEYFRAM.CPP — header for keyframe animation files
typedef struct {
    unsigned short frames;              // Number of frames
    unsigned short x;                   // X offset
    unsigned short y;                   // Y offset
    unsigned short width;               // Frame width
    unsigned short height;              // Frame height
    unsigned short largest_frame_size;  // Largest single frame (for buffer allocation)
    unsigned short flags;               // Bit 0 = has embedded palette (768 bytes after offsets)
} KeyFrameHeaderType;
```

When `flags & 1`, a 768-byte palette (256 × RGB) follows immediately after the frame offset table. Retrieved via `Get_Build_Frame_Palette()`.

#### Shape Type Flags (MAKESHAPE)

| Value    | Name     | Meaning                            |
| -------- | -------- | ---------------------------------- |
| `0x0000` | NORMAL   | Standard shape                     |
| `0x0001` | COMPACT  | Uses 16-color palette (Colortable) |
| `0x0002` | NOCOMP   | Uncompressed pixel data            |
| `0x0004` | VARIABLE | Variable-length color table (<16)  |

#### Drawing Flags (Runtime)

| Value    | Name           | Effect                             |
| -------- | -------------- | ---------------------------------- |
| `0x0000` | SHAPE_NORMAL   | No transformation                  |
| `0x0001` | SHAPE_HORZ_REV | Horizontal flip                    |
| `0x0002` | SHAPE_VERT_REV | Vertical flip                      |
| `0x0004` | SHAPE_SCALING  | Apply scale factor                 |
| `0x0020` | SHAPE_CENTER   | Draw centered on coordinates       |
| `0x0100` | SHAPE_FADING   | Apply fade/remap table             |
| `0x0200` | SHAPE_PREDATOR | Predator-style cloaking distortion |
| `0x0400` | SHAPE_COMPACT  | Shape uses compact color table     |
| `0x1000` | SHAPE_GHOST    | Ghost/transparent rendering        |
| `0x2000` | SHAPE_SHADOW   | Shadow rendering mode              |

---

### LCW Compression

**Source:** `REDALERT/LCW.CPP`, `REDALERT/LCWUNCMP.CPP`, `REDALERT/WIN32LIB/IFF.H`

LCW (Lempel-Castle-Welch) is Westwood's primary data compression algorithm, used for SHP frame data, VQA video chunks, icon set data, and other compressed resources.

#### Compression Header Wrapper

```c
// From IFF.H — optional header wrapping compressed data
typedef struct {
    char  Method;   // Compression method (see CompressionType)
    char  pad;      // Padding byte
    long  Size;     // Decompressed size
    short Skip;     // Bytes to skip
} CompHeaderType;

typedef enum {
    NOCOMPRESS  = 0,
    LZW12       = 1,
    LZW14       = 2,
    HORIZONTAL  = 3,
    LCW         = 4
} CompressionType;
```

#### LCW Command Opcodes

LCW decompression processes a source stream and produces output by copying literals, referencing previous output (sliding window), or filling runs:

| Byte Pattern            | Name           | Operation                                                        |
| ----------------------- | -------------- | ---------------------------------------------------------------- |
| `0b0xxx_yyyy, yyyyyyyy` | Short copy     | Copy run of `x+3` bytes from `y` bytes back in output (relative) |
| `0b10xx_xxxx, n₁..nₓ₊₁` | Medium literal | Copy next `x+1` bytes verbatim from source to output             |
| `0b11xx_xxxx, w₁`       | Medium copy    | Copy `x+3` bytes from absolute output offset `w₁`                |
| `0xFF, w₁, w₂`          | Long copy      | Copy `w₁` bytes from absolute output offset `w₂`                 |
| `0xFE, w₁, b₁`          | Long run       | Fill `w₁` bytes with value `b₁`                                  |
| `0x80`                  | End marker     | End of compressed data                                           |

Where `w₁`, `w₂` are little-endian 16-bit words and `b₁` is a single byte.

**Key detail:** Short copies use *relative* backward references (from current output position), while medium and long copies use *absolute* offsets from the start of the output buffer. This dual addressing is a distinctive feature of LCW.

> **Security (V38):** All `ra-formats` decompressors (LCW, LZ4, ADPCM) must enforce decompression ratio caps (256:1), absolute output size limits, and loop iteration counters. Every format parser must have a `cargo-fuzz` target. Archive extraction (`.oramap` ZIP) must use `strict-path` `PathBoundary` to prevent Zip Slip. See `06-SECURITY.md` § Vulnerability 38.

#### IFF Chunk ID Macro

```c
// From IFF.H — used by MIX, icon set, and other IFF-based formats
#define MAKE_ID(a,b,c,d) ((long)((long)d << 24) | ((long)c << 16) | ((long)b << 8) | (long)(a))
```

---

### TMP Terrain Tile Format (.tmp / Icon Sets)

**Source:** `REDALERT/WIN32LIB/TILE.H`, `TIBERIANDAWN/WIN32LIB/TILE.H`, `*/WIN32LIB/ICONSET.CPP`, `*/WIN32LIB/STAMP.INC`, `REDALERT/COMPAT.H`

TMP files are **IFF-format icon sets** — collections of fixed-size tiles arranged in a grid. Each tile is a 24×24 pixel palette-indexed bitmap. The engine renders terrain by compositing these tiles onto the map.

#### On-Disk IFF Chunk Structure

TMP files use Westwood's IFF variant with these chunk identifiers:

| Chunk ID | FourCC                     | Purpose                                      |
| -------- | -------------------------- | -------------------------------------------- |
| `ICON`   | `MAKE_ID('I','C','O','N')` | Form identifier (file magic — must be first) |
| `SINF`   | `MAKE_ID('S','I','N','F')` | Set info: icon dimensions and format         |
| `SSET`   | `MAKE_ID('S','S','E','T')` | Icon pixel data (may be LCW-compressed)      |
| `TRNS`   | `MAKE_ID('T','R','N','S')` | Per-icon transparency flags                  |
| `MAP `   | `MAKE_ID('M','A','P',' ')` | Icon mapping table (logical → physical)      |
| `RPAL`   | `MAKE_ID('R','P','A','L')` | Icon palette                                 |
| `RTBL`   | `MAKE_ID('R','T','B','L')` | Remap table                                  |

#### SINF Chunk (Icon Dimensions)

```c
// Local struct in Load_Icon_Set() — read from SINF chunk
struct {
    char Width;      // Width of one icon in bytes (pixels = Width << 3)
    char Height;     // Height of one icon in bytes (pixels = Height << 3)
    char Format;     // Graphic mode
    char Bitplanes;  // Number of bitplanes per icon
} sinf;

// Standard RA value: Width=3, Height=3 → 24×24 pixels (3 << 3 = 24)
// Bytes per icon = ((Width<<3) * (Height<<3) * Bitplanes) >> 3
// For 24×24 8-bit: (24 * 24 * 8) >> 3 = 576 bytes per icon
```

#### In-Memory Control Structure

The IFF chunks are loaded into a contiguous memory block with `IControl_Type` as the header. **Two versions exist** — Tiberian Dawn and Red Alert differ:

```c
// Tiberian Dawn version (TIBERIANDAWN/WIN32LIB/TILE.H)
typedef struct {
    short           Width;      // Width of icons (pixels)
    short           Height;     // Height of icons (pixels)
    short           Count;      // Number of (logical) icons in this set
    short           Allocated;  // Was this iconset allocated? (runtime flag)
    long            Size;       // Size of entire iconset memory block
    unsigned char * Icons;      // Offset from buffer start to icon data
    long            Palettes;   // Offset from buffer start to palette data
    long            Remaps;     // Offset from buffer start to remap index data
    long            TransFlag;  // Offset for transparency flag table
    unsigned char * Map;        // Icon map offset (if present)
} IControl_Type;
// Note: Icons and Map are stored as raw pointers in TD

// Red Alert version (REDALERT/WIN32LIB/TILE.H, REDALERT/COMPAT.H)
typedef struct {
    short Width;      // Width of icons (pixels)
    short Height;     // Height of icons (pixels)
    short Count;      // Number of (logical) icons in this set
    short Allocated;  // Was this iconset allocated? (runtime flag)
    short MapWidth;   // Width of map (in icons) — RA-only field
    short MapHeight;  // Height of map (in icons) — RA-only field
    long  Size;       // Size of entire iconset memory block
    long  Icons;      // Offset from buffer start to icon data
    long  Palettes;   // Offset from buffer start to palette data
    long  Remaps;     // Offset from buffer start to remap index data
    long  TransFlag;  // Offset for transparency flag table
    long  ColorMap;   // Offset for color control value table — RA-only field
    long  Map;        // Icon map offset (if present)
} IControl_Type;
// Note: RA version uses long offsets (not pointers) and adds MapWidth, MapHeight, ColorMap
```

**Constraint:** "This structure MUST be a multiple of 16 bytes long" (per source comment in STAMP.INC and TILE.H).

#### How the Map Array Works

The `Map` array maps logical grid positions to physical icon indices. Each byte represents one cell in the template grid (`MapWidth × MapHeight` in RA, or `Width × Height` in TD). A value of `0xFF` (`-1` signed) means the cell is empty/transparent — no tile is drawn there.

```c
// From CDATA.CPP — reading the icon map
Mem_Copy(Get_Icon_Set_Map(Get_Image_Data()), map, Width * Height);
for (index = 0; index < Width * Height; index++) {
    if (map[index] != 0xFF) {
        // This cell has a visible tile — draw icon data at map[index]
    }
}
```

Icon pixel data is accessed as: `&Icons[map[index] * (24 * 24)]` — each icon is 576 bytes of palette-indexed pixels.

#### Color Control Map (RA only)

The `ColorMap` table provides per-icon land type information. Each byte maps to one of 16 terrain categories used by the game logic:

```c
// From CDATA.CPP — RA land type lookup
static LandType _land[16] = {
    LAND_CLEAR, LAND_CLEAR, LAND_CLEAR, LAND_CLEAR,  // 0-3
    LAND_CLEAR, LAND_CLEAR, LAND_BEACH, LAND_CLEAR,  // 4-7
    LAND_ROCK,  LAND_ROAD,  LAND_WATER, LAND_RIVER,  // 8-11
    LAND_CLEAR, LAND_CLEAR, LAND_ROUGH, LAND_CLEAR,  // 12-15
};
return _land[control_map[icon_index]];
```

#### IconsetClass (RA Only)

Red Alert wraps `IControl_Type` in a C++ class with accessor methods:

```c
// From COMPAT.H
class IconsetClass : protected IControl_Type {
public:
    int Map_Width()                  const { return MapWidth; }
    int Map_Height()                 const { return MapHeight; }
    int Icon_Count()                 const { return Count; }
    int Pixel_Width()                const { return Width; }
    int Pixel_Height()               const { return Height; }
    int Total_Size()                 const { return Size; }
    unsigned char const * Icon_Data()    const { return (unsigned char const *)this + Icons; }
    unsigned char const * Map_Data()     const { return (unsigned char const *)this + Map; }
    unsigned char const * Palette_Data() const { return (unsigned char const *)this + Palettes; }
    unsigned char const * Remap_Data()   const { return (unsigned char const *)this + Remaps; }
    unsigned char const * Trans_Data()   const { return (unsigned char const *)this + TransFlag; }
    unsigned char * Control_Map()        { return (unsigned char *)this + ColorMap; }
};
```

All offset fields are relative to the start of the `IControl_Type` structure itself — the data is a single contiguous allocation.

---

### PAL Palette Format (.pal)

**Source:** `REDALERT/WIN32LIB/PALETTE.H`, `TIBERIANDAWN/WIN32LIB/LOADPAL.CPP`, `REDALERT/WIN32LIB/DrawMisc.cpp`

PAL files are the simplest format — a raw dump of 256 RGB color values with no header.

#### File Layout

```
768 bytes total = 256 entries × 3 bytes (R, G, B)
```

No magic number, no header, no footer. Just 768 bytes of color data.

#### Constants

```c
// From PALETTE.H
#define RGB_BYTES      3
#define PALETTE_SIZE   256
#define PALETTE_BYTES  768   // PALETTE_SIZE * RGB_BYTES
```

#### Color Range: 6-bit VGA (0–63)

Each R, G, B component is in **6-bit VGA range (0–63)**, not 8-bit. This is because the original VGA hardware registers only accepted 6-bit color values.

```c
// From PALETTE.H
typedef struct {
    char red;
    char green;
    char blue;
} RGB;   // Each field: 0–63 (6-bit)
```

#### Loading and Conversion

```c
// From LOADPAL.CPP — loading is trivially simple
void Load_Palette(char *palette_file_name, void *palette_pointer) {
    Load_Data(palette_file_name, palette_pointer, 768);
}

// From DDRAW.CPP — converting 6-bit VGA to 8-bit for display
void Set_DD_Palette(void *palette) {
    for (int i = 0; i < 768; i++) {
        buffer[i] = palette[i] << 2;  // 6-bit (0–63) → 8-bit (0–252)
    }
}

// From WRITEPCX.CPP — PCX files use 8-bit, converted on read
// Reading PCX palette:  value >>= 2;  (8-bit → 6-bit)
// Writing PCX palette:  value <<= 2;  (6-bit → 8-bit)
```

**Implementation note for ra-formats:** When loading `.pal` files, expose both the raw 6-bit values and a convenience method that returns 8-bit values (left-shift by 2). The 6-bit values are the canonical form — all palette operations in the original game work in 6-bit space.

---

### AUD Audio Format (.aud)

**Source:** `REDALERT/WIN32LIB/AUDIO.H`, `REDALERT/ADPCM.CPP`, `REDALERT/ITABLE.CPP`, `REDALERT/DTABLE.CPP`, `REDALERT/WIN32LIB/SOSCOMP.H`

AUD files contain IMA ADPCM-compressed audio (Westwood's variant). The file has a simple header followed by compressed audio chunks.

#### File Header

```c
// From AUDIO.H
#pragma pack(push, 1)
typedef struct {
    unsigned short int Rate;        // Playback rate in Hz (e.g., 22050)
    long               Size;        // Size of compressed data (bytes)
    long               UncompSize;  // Size of uncompressed data (bytes)
    unsigned char      Flags;       // Bit flags (see below)
    unsigned char      Compression; // Compression algorithm ID
} AUDHeaderType;
#pragma pack(pop)
```

**Flags:**
| Bit    | Name              | Meaning                     |
| ------ | ----------------- | --------------------------- |
| `0x01` | `AUD_FLAG_STEREO` | Stereo audio (two channels) |
| `0x02` | `AUD_FLAG_16BIT`  | 16-bit samples (vs. 8-bit)  |

**Compression types** (from `SOUNDINT.H`):

| Value | Name             | Algorithm                                  |
| ----- | ---------------- | ------------------------------------------ |
| 0     | `SCOMP_NONE`     | No compression                             |
| 1     | `SCOMP_WESTWOOD` | Westwood ADPCM (the standard for RA audio) |
| 33    | `SCOMP_SONARC`   | Sonarc compression                         |
| 99    | `SCOMP_SOS`      | SOS ADPCM                                  |

#### ADPCM Codec Structure

```c
// From SOSCOMP.H — codec state for ADPCM decompression
typedef struct _tagCOMPRESS_INFO {
    char *          lpSource;         // Source data pointer
    char *          lpDest;           // Destination buffer pointer
    unsigned long   dwCompSize;       // Compressed data size
    unsigned long   dwUnCompSize;     // Uncompressed data size
    unsigned long   dwSampleIndex;    // Current sample index (channel 1)
    long            dwPredicted;      // Predicted sample value (channel 1)
    long            dwDifference;     // Difference value (channel 1)
    short           wCodeBuf;         // Code buffer (channel 1)
    short           wCode;            // Current code (channel 1)
    short           wStep;            // Step size (channel 1)
    short           wIndex;           // Index into step table (channel 1)
    // --- Stereo: second channel state ---
    unsigned long   dwSampleIndex2;
    long            dwPredicted2;
    long            dwDifference2;
    short           wCodeBuf2;
    short           wCode2;
    short           wStep2;
    short           wIndex2;
    // ---
    short           wBitSize;         // Bits per sample (8 or 16)
    short           wChannels;        // Number of channels (1=mono, 2=stereo)
} _SOS_COMPRESS_INFO;

// Chunk header for compressed audio blocks
typedef struct _tagCOMPRESS_HEADER {
    unsigned long dwType;             // Compression type identifier
    unsigned long dwCompressedSize;   // Size of compressed data
    unsigned long dwUnCompressedSize; // Size when decompressed
    unsigned long dwSourceBitSize;    // Original bit depth
    char          szName[16];         // Name string
} _SOS_COMPRESS_HEADER;
```

#### Westwood ADPCM Decompression Algorithm

The algorithm processes each byte as two 4-bit nibbles (low nibble first, then high nibble). It uses pre-computed `IndexTable` and `DiffTable` lookup tables for decoding.

```c
// From ADPCM.CPP — core decompression loop (simplified)
// 'code' is one byte of compressed data containing TWO samples
//
// For each byte:
//   1. Process low nibble  (code & 0x0F)
//   2. Process high nibble (code >> 4)
//
// Per nibble:
//   fastindex = (fastindex & 0xFF00) | token;   // token = 4-bit nibble
//   sample += DiffTable[fastindex];              // apply difference
//   sample = clamp(sample, -32768, 32767);       // clamp to 16-bit range
//   fastindex = IndexTable[fastindex];           // advance index
//   output = (unsigned short)sample;             // write sample

// The 'fastindex' combines the step index (high byte) and token (low byte)
// into a single 16-bit lookup key: index = (step_index << 4) | token
```

**Table structure:** Both tables are indexed by `[step_index * 16 + token]` where `step_index` is 0–88 and `token` is 0–15, giving 1424 entries each.

- `IndexTable[1424]` (`unsigned short`) — next step index after applying this token
- `DiffTable[1424]` (`long`) — signed difference to add to the current sample

The tables are pre-multiplied by 16 for performance (the index already includes the token offset). Full table values are in `ITABLE.CPP` and `DTABLE.CPP`.

---

### VQA Video Format (.vqa)

**Source:** `VQ/INCLUDE/VQA32/VQAFILE.H` (CnC_Red_Alert repo), `REDALERT/WIN32LIB/IFF.H`

VQA (Vector Quantized Animation) files store cutscene videos using vector quantization — a codebook of small pixel blocks that are referenced by index to reconstruct each frame.

#### VQA File Header

```c
// From VQAFILE.H
typedef struct _VQAHeader {
    unsigned short Version;         // Format version
    unsigned short Flags;           // Bit 0 = has audio, Bit 1 = has alt audio
    unsigned short Frames;          // Total number of video frames
    unsigned short ImageWidth;      // Image width in pixels
    unsigned short ImageHeight;     // Image height in pixels
    unsigned char  BlockWidth;      // Codebook block width (typically 4)
    unsigned char  BlockHeight;     // Codebook block height (typically 2 or 4)
    unsigned char  FPS;             // Frames per second (typically 15)
    unsigned char  Groupsize;       // VQ codebook group size
    unsigned short Num1Colors;      // Number of 1-color blocks(?)
    unsigned short CBentries;       // Number of codebook entries
    unsigned short Xpos;            // X display position
    unsigned short Ypos;            // Y display position
    unsigned short MaxFramesize;    // Largest frame size (for buffer allocation)
    // Audio fields
    unsigned short SampleRate;      // Audio sample rate (e.g., 22050)
    unsigned char  Channels;        // Audio channels (1=mono, 2=stereo)
    unsigned char  BitsPerSample;   // Audio bits per sample (8 or 16)
    // Alternate audio stream
    unsigned short AltSampleRate;
    unsigned char  AltChannels;
    unsigned char  AltBitsPerSample;
    // Reserved
    unsigned short FutureUse[5];
} VQAHeader;
```

#### VQA Chunk Types

VQA files use a chunk-based IFF-like structure. Each chunk has a 4-byte ASCII identifier and a big-endian 4-byte size.

**Top-level structure:**

| Chunk  | Purpose                                        |
| ------ | ---------------------------------------------- |
| `WVQA` | Form/container chunk (file magic)              |
| `VQHD` | VQA header (contains `VQAHeader` above)        |
| `FINF` | Frame info table — seek offsets for each frame |
| `VQFR` | Video frame (delta frame)                      |
| `VQFK` | Video keyframe                                 |

**Sub-chunks within frames:**

| Chunk           | Purpose                                                               |
| --------------- | --------------------------------------------------------------------- |
| `CBF0` / `CBFZ` | Full codebook, uncompressed / LCW-compressed                          |
| `CBP0` / `CBPZ` | Partial codebook (1/Groupsize of full), uncompressed / LCW-compressed |
| `VPT0` / `VPTZ` | Vector pointers (frame block indices), uncompressed / LCW-compressed  |
| `VPTK`          | Vector pointer keyframe                                               |
| `VPTD`          | Vector pointer delta (differences from previous frame)                |
| `VPTR` / `VPRZ` | Vector pointer + run-skip-dump encoding                               |
| `CPL0` / `CPLZ` | Palette (256 × RGB), uncompressed / LCW-compressed                    |
| `SND0`          | Audio — raw PCM                                                       |
| `SND1`          | Audio — Westwood "ZAP" ADPCM                                          |
| `SND2`          | Audio — IMA ADPCM (same codec as AUD files)                           |
| `SNDZ`          | Audio — LCW-compressed                                                |

**Naming convention:** Suffix `0` = uncompressed data. Suffix `Z` = LCW-compressed. Suffix `K` = keyframe. Suffix `D` = delta.

#### FINF (Frame Info) Table

The `FINF` chunk contains a table of 4 bytes per frame encoding seek position and flags:

```c
// Bits 31–28: Frame flags
//   Bit 31 (0x80000000): KEY   — keyframe (full codebook + vector pointers)
//   Bit 30 (0x40000000): PAL   — frame includes palette change
//   Bit 29 (0x20000000): SYNC  — audio sync point
// Bits 27–0: File offset in WORDs (multiply by 2 for byte offset)
```

#### VPC Codes (Vector Pointer Compression)

```c
// Run-skip-dump encoding opcodes for vector pointer data
#define VPC_ONE_SINGLE      0xF000  // Single block, one value
#define VPC_ONE_SEMITRANS   0xE000  // Semi-transparent block
#define VPC_SHORT_DUMP      0xD000  // Short literal dump
#define VPC_LONG_DUMP       0xC000  // Long literal dump
#define VPC_SHORT_RUN       0xB000  // Short run of same value
#define VPC_LONG_RUN        0xA000  // Long run of same value
```

---

### VQ Static Image Format (.vqa still frames)

**Source:** `WINVQ/INCLUDE/VQFILE.H`, `VQ/INCLUDE/VQ.H` (CnC_Red_Alert repo)

Separate from VQA movies, the VQ format handles single static vector-quantized images.

#### VQ Header (VQFILE.H variant)

```c
// From VQFILE.H
typedef struct _VQHeader {
    unsigned short Version;
    unsigned short Flags;
    unsigned short ImageWidth;
    unsigned short ImageHeight;
    unsigned char  BlockType;     // Block encoding type
    unsigned char  BlockWidth;
    unsigned char  BlockHeight;
    unsigned char  BlockDepth;    // Bits per pixel
    unsigned short CBEntries;     // Codebook entries
    unsigned char  VPtrType;      // Vector pointer encoding type
    unsigned char  PalStart;      // First palette index used
    unsigned short PalLength;     // Number of palette entries
    unsigned char  PalDepth;      // Palette bit depth
    unsigned char  ColorModel;    // Color model (see below)
} VQHeader;
```

#### VQ Header (VQ.H variant — 40 bytes, for VQ encoder)

```c
// From VQ.H
typedef struct _VQHeader {
    long           ImageSize;     // Total image size in bytes
    unsigned short ImageWidth;
    unsigned short ImageHeight;
    unsigned char  BlockWidth;
    unsigned char  BlockHeight;
    unsigned char  BlockType;     // Block encoding type
    unsigned char  PaletteRange;  // Palette range
    unsigned short Num1Color;     // Number of 1-color blocks
    unsigned short CodebookSize;  // Codebook entries
    unsigned char  CodingFlag;    // Coding method flag
    unsigned char  FrameDiffMethod; // Frame difference method
    unsigned char  ForcedPalette; // Forced palette flag
    unsigned char  F555Palette;   // Use 555 palette format
    unsigned short VQVersion;     // VQ codec version
} VQHeader;
```

#### VQ Chunk IDs

| Chunk  | Purpose                  |
| ------ | ------------------------ |
| `VQHR` | VQ header                |
| `VQCB` | VQ codebook data         |
| `VQCT` | VQ color table (palette) |
| `VQVP` | VQ vector pointers       |

#### Color Models

```c
#define VQCM_PALETTED  0   // Palette-indexed (standard RA/TD)
#define VQCM_RGBTRUE   1   // RGB true color
#define VQCM_YBRTRUE   2   // YBR (luminance-chrominance) true color
```

---

## Insights from EA's Original Source Code

Repository: https://github.com/electronicarts/CnC_Red_Alert (GPL v3, archived Feb 2025)

### Code Statistics
- 290 C++ header files, 296 implementation files, 14 x86 assembly files
- ~222,000 lines of C++ code
- 430+ `#ifdef WIN32` checks (no other platform implemented)
- Built with Watcom C/C++ v10.6 and Borland Turbo Assembler v4.0

### Keep: Event/Order Queue System

The original uses `OutList` (local player commands) and `DoList` (confirmed orders from all players), both containing `EventClass` objects:

```cpp
// From CONQUER.CPP
OutList.Add(EventClass(EventClass::IDLE, TargetClass(tech)));
```

Player actions → events → queue → deterministic processing each tick. This is the same pattern as our `PlayerOrder → TickOrders → Simulation::apply_tick()` pipeline. Westwood validated this in 1996.

### Keep: Integer Math for Determinism

The original uses integer math everywhere for game logic — positions, damage, timing. No floats in the simulation. This is why multiplayer worked. Our `FixedPoint` / `SimCoord` approach mirrors this.

### Keep: Data-Driven Rules (INI → MiniYAML → YAML)

Original reads unit stats and game rules from `.ini` files at runtime. This data-driven philosophy is what made C&C so moddable. The lineage: `INI → MiniYAML → YAML` — each step more expressive, same philosophy.

### Keep: MIX Archive Concept

Simple flat archive with hash-based lookup. No compression in the archive itself (individual files may be compressed). For `ra-formats`: read MIX as-is for compatibility; native format can modernize.

### Keep: Compression Flexibility

Original implements LCW, LZO, and LZW compression. LZO was settled on for save games:
```cpp
// From SAVELOAD.CPP
LZOPipe pipe(LZOPipe::COMPRESS, SAVE_BLOCK_SIZE);
// LZWPipe pipe(LZWPipe::COMPRESS, SAVE_BLOCK_SIZE);  // tried, abandoned
// LCWPipe pipe(LCWPipe::COMPRESS, SAVE_BLOCK_SIZE);   // tried, abandoned
```

### Leave Behind: Session Type Branching

Original code is riddled with network-type checks embedded in game logic:
```cpp
if (Session.Type == GAME_IPX || Session.Type == GAME_INTERNET) { ... }
```

This is the anti-pattern our `NetworkModel` trait eliminates. Separate code paths for IPX, Westwood Online, MPlayer, TEN, modem — all interleaved with `#ifdef`. The developer disliked the Westwood Online API enough to write a complete wrapper around it.

### Leave Behind: Platform-Specific Rendering

DirectDraw surface management with comments like "Aaaarrgghh!" when hardware allocation fails. Manual VGA mode detection. Custom command-line parsing. `wgpu` solves all of this.

### Leave Behind: Manual Memory Checking

The game allocates 13MB and checks if it succeeds. Checks that `sleep(1000)` actually advances the system clock. Checks free disk space. None of this translates to modern development.

### Interesting Historical Details

- Code path for 640x400 display mode with special VGA fallback
- `#ifdef FIXIT_CSII` for Aftermath expansion — comment explains they broke the ability to build vanilla Red Alert executables and had to fix it later
- Developer comments reference "Counterstrike" in VCS headers (`$Header: /CounterStrike/...`)
- MPEG movie playback code exists but is disabled
- Game refuses to start if launched from `f:\projects\c&c0` (the network share)

## Coordinate System Translation

For cross-engine compatibility, coordinate transforms must be explicit:

```rust
pub struct CoordTransform {
    pub our_scale: i32,       // our subdivisions per cell
    pub openra_scale: i32,    // 1024 for OpenRA (WDist/WPos)
    pub original_scale: i32,  // original game's lepton system
}

impl CoordTransform {
    pub fn to_wpos(&self, pos: &CellPos) -> (i32, i32, i32) {
        ((pos.x * self.openra_scale) / self.our_scale,
         (pos.y * self.openra_scale) / self.our_scale,
         (pos.z * self.openra_scale) / self.our_scale)
    }
    pub fn from_wpos(&self, x: i32, y: i32, z: i32) -> CellPos {
        CellPos {
            x: (x * self.our_scale) / self.openra_scale,
            y: (y * self.our_scale) / self.openra_scale,
            z: (z * self.our_scale) / self.openra_scale,
        }
    }
}
```
## Save Game Format

Save games store a complete `SimSnapshot` — the entire sim state at a single tick, sufficient to restore the game exactly.

### Structure

```
iron_curtain_save_v1.icsave  (file extension: .icsave)
├── Header (fixed-size, uncompressed)
├── Metadata (JSON, uncompressed)
└── Payload (serde-serialized SimSnapshot, LZ4-compressed)
```

### Header (32 bytes, fixed)

```rust
pub struct SaveHeader {
    pub magic: [u8; 4],              // b"ICSV" — "Iron Curtain Save"
    pub version: u16,                // Serialization format version (1 = bincode, 2 = postcard)
    pub compression_algorithm: u8,   // D063: 0x01 = LZ4 (current), 0x02 reserved for zstd in a later format revision
    pub flags: u8,                   // Bit flags (has_thumbnail, etc.) — repacked from u16 (D063)
    pub metadata_offset: u32,        // Byte offset to metadata section
    pub metadata_length: u32,        // Metadata section length
    pub payload_offset: u32,         // Byte offset to compressed payload
    pub payload_length: u32,         // Compressed payload length
    pub uncompressed_length: u32,    // Uncompressed payload length (for pre-allocation)
    pub state_hash: u64,             // state_hash() of the saved tick (integrity check)
}
```

> **Compression (D063):** The `compression_algorithm` byte identifies which decompressor to use for the payload. Version 1 files use `0x01` (LZ4). The `version` field controls the serialization format (bincode vs. postcard) independently — see `decisions/09d/D054-extended-switchability.md` for codec dispatch and `decisions/09a-foundation.md` § D063 for algorithm dispatch. Compression level (fastest/balanced/compact) is configurable via `settings.toml` `compression.save_level` and affects encoding speed/ratio but not the format.

> **Security (V42):** Shared `.icsave` files are an attack surface. Enforce: max decompressed size 64 MB, JSON metadata cap 1 MB, schema validation of deserialized `SimSnapshot` (entity count, position bounds, valid components). Save directory sandboxed via `strict-path` `PathBoundary`. See `06-SECURITY.md` § Vulnerability 42.

### Metadata (JSON)

Human-readable metadata for the save browser UI. Stored as JSON (not the binary sim format) so the client can display save info without deserializing the full snapshot.

```json
{
  "save_name": "Allied Mission 5 - Checkpoint",
  "timestamp": "2027-03-15T14:30:00Z",
  "engine_version": "0.5.0",
  "mod_api_version": "1.0",
  "game_module": "ra1",
  "active_mods": [
    { "id": "base-ra1", "version": "1.0.0" }
  ],
  "map_name": "Allied05.oramap",
  "tick": 18432,
  "game_time_seconds": 1228.8,
  "players": [
    { "name": "Player 1", "faction": "allies", "is_human": true },
    { "name": "Soviet AI", "faction": "soviet", "is_human": false }
  ],
  "campaign": {
    "campaign_id": "allied_campaign",
    "mission_id": "allied05",
    "flags": { "bridge_intact": true, "tanya_alive": true }
  },
  "thumbnail": "thumbnail.png"
}
```

### Payload

The payload is a `SimSnapshot` serialized via `serde` (bincode format for compactness) and compressed with LZ4 (fast decompression, good ratio for game state data). LZ4 was chosen over LZO (used by original RA) for its better Rust ecosystem support (`lz4_flex` crate) and superior decompression speed. The save file header's `version` field selects the serialization codec — version `1` uses bincode; version `2` is reserved for postcard if introduced under D054's migration/codec-dispatch path. The `compression_algorithm` byte selects the decompressor independently (D063). Compression level is configurable via `settings.toml` (`compression.save_level`: fastest/balanced/compact). See `decisions/09d/D054-extended-switchability.md` for the serialization version-to-codec dispatch and `decisions/09a-foundation.md` § D063 for the compression strategy.

```rust
pub struct SimSnapshot {
    pub tick: u64,
    pub rng_state: DeterministicRngState,
    pub entities: Vec<EntitySnapshot>,   // all entities + all components
    pub player_states: Vec<PlayerState>, // credits, power, tech tree, etc.
    pub map_state: MapState,             // resource cells, terrain modifications
    pub campaign_state: Option<CampaignState>,  // D021 branching state
    pub script_state: Option<ScriptState>,      // Lua/WASM variable snapshots
}
```

**Size estimate:** A 500-unit game snapshot is ~200KB uncompressed, ~40-80KB compressed. Well within "instant save/load" territory.

### Compatibility

Save files embed `engine_version` and `mod_api_version`. Loading a save from an older engine version triggers the migration path (if migration exists) or shows a compatibility warning. Save files are forward-compatible within the same `mod_api` major version.

**Platform note:** On WASM (browser), saves go to `localStorage` or IndexedDB via Bevy's platform-appropriate storage. On mobile, saves go to the app sandbox. The format is identical — only the storage backend differs.

## Replay File Format

Replays store the complete order stream — every player command, every tick — sufficient to reproduce an entire game by re-simulating from a known initial state.

### Structure

```
iron_curtain_replay_v1.icrep  (file extension: .icrep)
├── Header (fixed-size, uncompressed)
├── Metadata (JSON, uncompressed)
├── Tick Order Stream (framed, LZ4-compressed)
├── Voice Stream (per-player Opus tracks, optional — D059)
├── Signature Chain (Ed25519 hash chain, optional)
└── Embedded Resources (map + mod manifest, optional)
```

### Header (56 bytes, fixed)

```rust
pub struct ReplayHeader {
    pub magic: [u8; 4],              // b"ICRP" — "Iron Curtain Replay"
    pub version: u16,                // Serialization format version (1)
    pub compression_algorithm: u8,   // D063: 0x01 = LZ4 (current), 0x02 reserved for zstd in a later format revision
    pub flags: u8,                   // Bit flags (signed, has_events, has_voice) — repacked from u16 (D063)
    pub metadata_offset: u32,
    pub metadata_length: u32,
    pub orders_offset: u32,
    pub orders_length: u32,          // Compressed length
    pub signature_offset: u32,
    pub signature_length: u32,
    pub total_ticks: u64,            // Total ticks in the replay
    pub final_state_hash: u64,       // state_hash() of the last tick (integrity)
    pub voice_offset: u32,           // 0 if no voice stream (D059)
    pub voice_length: u32,           // Compressed length of voice stream
}
```

> **Compression (D063):** The `compression_algorithm` byte identifies which decompressor to use for the tick order stream and embedded keyframe snapshots. Version 1 files use `0x01` (LZ4). Compression level during live recording defaults to `fastest` (configurable via `settings.toml` `compression.replay_level`). Use `ic replay recompress` to re-encode at a higher compression level for archival. See `decisions/09a-foundation.md` § D063.

The `flags` field includes a `HAS_VOICE` bit (bit 3). When set, the voice stream section contains per-player Opus audio tracks recorded with player consent. See `decisions/09g/D059-communication.md` for the voice consent model, storage costs, and replay playback integration.

### Metadata (JSON)

```json
{
  "replay_id": "a3f7c2d1-...",
  "timestamp": "2027-03-15T15:00:00Z",
  "engine_version": "0.5.0",
  "game_module": "ra1",
  "active_mods": [ { "id": "base-ra1", "version": "1.0.0" } ],
  "map_name": "Tournament Island",
  "map_hash": "sha256:abc123...",
  "game_speed": "normal",
  "balance_preset": "classic",
  "total_ticks": 54000,
  "duration_seconds": 3600,
  "players": [
    {
      "slot": 0, "name": "Alice", "faction": "allies",
      "outcome": "won", "apm_avg": 85
    },
    {
      "slot": 1, "name": "Bob", "faction": "soviet",
      "outcome": "lost", "apm_avg": 72
    }
  ],
  "initial_rng_seed": 42,
  "signed": true,
  "relay_server": "relay.ironcurtain.gg"
}
```

### Data Minimization (Privacy)

Replay metadata and order streams contain **only gameplay-relevant data**. The following are explicitly excluded from `.icrep` files:

- **Hardware identifiers:** No GPU model, CPU model, RAM size, display resolution, or OS version
- **Network identifiers:** No player IP addresses, MAC addresses, or connection fingerprints
- **System telemetry:** No frame times, local performance metrics, or diagnostic data (these live in the local SQLite database per D034, not in replays)
- **File paths:** No local filesystem paths (mod install directories, asset cache locations, etc.)

This is a lesson from BAR/Recoil, whose replay format accumulated hardware fingerprinting data that created privacy concerns when replays were shared publicly. IC's replay format is deliberately minimal: the metadata JSON above is the complete set of fields. Any future metadata additions must pass a privacy review — "would sharing this replay on a public forum leak personally identifying information?"

Player names in replays are display names (D053), not account identifiers. Anonymization is possible via `ic replay anonymize` which replaces player names with generic labels ("Player 1", "Player 2") for educational sharing.

### Tick Order Stream

The order stream is a sequence of per-tick frames:

```rust
/// One tick's worth of orders in the replay.
pub struct ReplayTickFrame {
    pub tick: u64,
    pub state_hash: u64,                // for desync detection during playback
    pub orders: Vec<TimestampedOrder>,   // all player orders this tick
}
```

Frames are serialized with bincode and compressed in blocks (LZ4 block compression): every 256 ticks form a compression block. This enables seeking — jump to any 256-tick boundary by decompressing just that block, then fast-forward within the block.

**Streaming write:** During a live game, replay frames are appended incrementally (not buffered in memory). The replay file is valid at any point — if the game crashes, the replay up to that point is usable.

### Analysis Event Stream

Alongside the order stream (which enables deterministic replay), IC replays include a separate **analysis event stream** — derived events sampled from the simulation state during recording. This stream enables replay analysis tools (stats sites, tournament review, community analytics) to extract rich data **without re-simulating the entire game**.

This design follows SC2's separation of `replay.game.events` (orders for playback) from `replay.tracker.events` (analytical data for post-game tools). See `research/blizzard-github-analysis.md` § 5.2–5.3.

**Event taxonomy:**

```rust
/// Analysis events derived from simulation state during recording.
/// These are NOT inputs — they are sampled observations for tooling.
pub enum AnalysisEvent {
    /// Unit fully created (spawned or construction completed).
    UnitCreated { tick: u64, tag: EntityTag, unit_type: UnitTypeId, owner: PlayerId, pos: WorldPos },
    /// Building/unit construction started.
    ConstructionStarted { tick: u64, tag: EntityTag, unit_type: UnitTypeId, owner: PlayerId, pos: WorldPos },
    /// Building/unit construction completed (pairs with ConstructionStarted).
    ConstructionCompleted { tick: u64, tag: EntityTag },
    /// Unit destroyed.
    UnitDestroyed { tick: u64, tag: EntityTag, killer_tag: Option<EntityTag>, killer_owner: Option<PlayerId> },
    /// Periodic position sample for combat-active units (delta-encoded, max 256 per event).
    UnitPositionSample { tick: u64, positions: Vec<(EntityTag, WorldPos)> },
    /// Periodic per-player economy/military snapshot.
    PlayerStatSnapshot { tick: u64, player: PlayerId, stats: PlayerStats },
    /// Resource harvested.
    ResourceCollected { tick: u64, player: PlayerId, resource_type: ResourceType, amount: i32 },
    /// Upgrade completed.
    UpgradeCompleted { tick: u64, player: PlayerId, upgrade_id: UpgradeId },

    // --- Competitive analysis events (Phase 5+) ---

    /// Periodic camera position sample — where each player is looking.
    /// Sampled at 2 Hz (~8 bytes per player per sample). Enables coaching
    /// tools ("you weren't watching your base during the drop"), replay
    /// heatmaps, and attention analysis. See D059 § Integration.
    CameraPositionSample { tick: u64, player: PlayerId, viewport_center: WorldPos, zoom_level: u16 },
    /// Player selection changed — what the player is controlling.
    /// Delta-encoded: only records additions/removals from the previous selection.
    /// Enables micro/macro analysis and attention tracking.
    SelectionChanged { tick: u64, player: PlayerId, added: Vec<EntityTag>, removed: Vec<EntityTag> },
    /// Control group assignment or recall.
    ControlGroupEvent { tick: u64, player: PlayerId, group: u8, action: ControlGroupAction },
    /// Ability or superweapon activation.
    AbilityUsed { tick: u64, player: PlayerId, ability_id: AbilityId, target: Option<WorldPos> },
    /// Game pause/unpause event.
    PauseEvent { tick: u64, player: PlayerId, paused: bool },
    /// Match ended — captures the end reason for analysis tools.
    MatchEnded { tick: u64, outcome: MatchOutcome },
    /// Vote lifecycle event — proposal, ballot, and resolution.
    /// See `03-NETCODE.md` § "In-Match Vote Framework" for the full vote system.
    VoteEvent { tick: u64, event: VoteAnalysisEvent },
}

/// Control group action types for ControlGroupEvent.
pub enum ControlGroupAction {
    Assign,   // player set this control group
    Append,   // player added to this control group (shift+assign)
    Recall,   // player pressed the control group hotkey to select
}
```

**Competitive analysis rationale:**
- **CameraPositionSample:** SC2 and AoE2 replays both include camera tracking. Coaches review where a player was looking ("you weren't watching your expansion when the attack came"). At 2 Hz with 8 bytes per player, a 20-minute 2-player game adds ~19 KB — negligible. Combines powerfully with voice-in-replay (D059): hearing what a player said while seeing what they were looking at.
- **SelectionChanged / ControlGroupEvent:** SC2's `replay.game.events` includes selection deltas. Control group usage frequency and response time are key skill metrics that distinguish player brackets. Delta-encoded selections are compact (~12 bytes per change).
- **AbilityUsed:** Superweapon timing, chronosphere accuracy, iron curtain placement decisions. Critical for tournament review.
- **PauseEvent / MatchEnded:** Structural events that analysis tools need without re-simulating. See `03-NETCODE.md` § Match Lifecycle for the full pause and surrender specifications.
- **VoteEvent:** Records vote proposals, individual ballots, and resolutions for post-match review and behavioral analysis. Tournament admins can audit vote patterns (e.g., excessive failed kick votes). See `03-NETCODE.md` § "In-Match Vote Framework."
- **Not required for playback** — the order stream alone is sufficient for deterministic replay. Analysis events are a convenience cache.
- **Compact position sampling** — `UnitPositionSample` uses delta-encoded unit indices and includes only units that have inflicted or taken damage recently (following SC2's tracker event model). This keeps the stream compact even in large battles.
- **Fixed-point stat values** — `PlayerStatSnapshot` uses fixed-point integers (matching the sim), not floats.
- **Independent compression** — the analysis stream is LZ4-compressed in its own block, separate from the order stream. Tools that only need orders skip it; tools that only need stats skip the orders.

### Signature Chain (Relay-Certified Replays)

For ranked/tournament matches, the relay server signs each tick's state hash. The signature algorithm is determined by the replay header version — version `1` uses Ed25519 (current). Later replay header versions, if introduced, may select post-quantum algorithms via the `SignatureScheme` enum (D054) while preserving versioned verification dispatch:

```rust
pub struct ReplaySignature {
    pub chain: Vec<TickSignature>,
    pub relay_public_key: Ed25519PublicKey,
}

pub struct TickSignature {
    pub tick: u64,
    pub state_hash: u64,
    pub relay_sig: Ed25519Signature,  // relay signs (tick, hash, prev_sig_hash)
}
```

The signature chain is a linked hash chain — each signature includes the hash of the previous signature. Tampering with any tick invalidates all subsequent signatures. Only relay-hosted games produce signed replays. Unsigned replays are fully functional for playback — signatures add trust, not capability.

**Selective tick verification via Merkle paths:** When the sim uses Merkle tree state hashing (see `03-NETCODE.md` § Merkle Tree State Hashing), each `TickSignature` can include the Merkle root rather than a flat hash. This enables **selective verification**: a tournament official can verify that tick 5,000 is authentic without replaying ticks 1–4,999 — just by checking the Merkle path from the tick's root to the signature chain. The signature chain itself forms a hash chain (each entry includes the previous entry's hash), so verifying any single tick also proves the integrity of the chain up to that point. This is the same principle as SPV (Simplified Payment Verification) in Bitcoin — prove a specific item belongs to a signed set without downloading the full set. Useful for dispute resolution ("did this specific moment really happen?") without replaying or transmitting the entire match.

### Embedded Resources (Self-Contained Replays)

A frequent complaint in RTS replay communities is that replays become unplayable when a required mod or map version is unavailable. 0 A.D. and Warzone 2100 both suffer from this — replays reference external map files by name/hash, and if the map is missing, the replay is dead (see `research/0ad-warzone2100-netcode-analysis.md`).

IC replays can optionally embed the resources needed for playback directly in the `.icrep` file:

```rust
/// Optional embedded resources section. When present, the replay is
/// self-contained — playable without the original mod/map installed.
pub struct EmbeddedResources {
    pub map_data: Option<Vec<u8>>,           // Complete map file (LZ4-compressed)
    pub mod_manifest: Option<ModManifest>,    // Mod versions + rule snapshots
    pub balance_preset: Option<String>,       // Which balance preset was active
    pub initial_state: Option<Vec<u8>>,       // Full sim snapshot at tick 0
}
```

**Embedding modes (controlled by a replay header flag):**

| Mode            | Map                 | Mod Rules           | Size Impact | Use Case                                     |
| --------------- | ------------------- | ------------------- | ----------- | -------------------------------------------- |
| `Minimal`       | Hash reference only | Version IDs only    | +0 KB       | Normal replays (mods installed locally)      |
| `MapEmbedded`   | Full map data       | Version IDs only    | +50-200 KB  | Sharing replays of custom maps               |
| `SelfContained` | Full map data       | Rule YAML snapshots | +200-500 KB | Tournament archives, historical preservation |

**Tournament archives** use `SelfContained` mode — a replay from 2028 remains playable in 2035 even if the mod has been updated 50 times. The embedded rule snapshots are read-only and cannot override locally installed mods during normal play.

**Size trade-off:** A `Minimal` replay for a 60-minute game is ~2-5 MB (order stream + signatures). A `SelfContained` replay adds ~200-500 KB for embedded resources — a small overhead for permanent playability. Maps larger than 1 MB (rare) use external references instead of embedding.

> **Security (V41):** `SelfContained` embedded resources bypass Workshop moderation and publisher trust tiers. Mitigations: consent prompt before loading embedded content from unknown sources, Lua/WASM never embedded (map data and rule YAML only), diff display against installed mod version, extraction sandboxed via `strict-path` `PathBoundary`. See `06-SECURITY.md` § Vulnerability 41.

### Playback

`ReplayPlayback` implements the `NetworkModel` trait. It reads the tick order stream and feeds orders to the sim as if they came from the network:

```rust
impl NetworkModel for ReplayPlayback {
    fn poll_tick(&mut self) -> Option<TickOrders> {
        let frame = self.read_next_frame()?;
        // Optionally verify: assert_eq!(expected_hash, sim.state_hash());
        Some(frame.orders)
    }
}
```

**Playback features:** Variable speed (0.5x to 8x), pause, scrub to any tick (re-simulates from nearest keyframe). The recorder takes a `SimSnapshot` keyframe every 300 ticks (~10 seconds at 30 tps) and stores it in the `.icrep` file. A 60-minute replay contains ~360 keyframes (~3-6 MB overhead depending on game state size), enabling sub-second seeking to any point. Keyframes are mandatory — the recorder always writes them.

**Keyframe serialization threading:** Producing a replay keyframe involves two phases with different thread requirements:

1. **ECS snapshot** (game thread): `Simulation::delta_snapshot()` reads ECS state via `ChangeMask` iteration. This MUST run on the game thread because it reads live sim state. Cost: ~0.5–1 ms for 500 units (lightweight — bitfield scan + changed component serialization). Produces a `Vec<u8>` of serialized component data.
2. **LZ4 compression + file write** (background writer thread): The serialized bytes are sent through the replay writer's crossbeam channel to the background thread, which performs LZ4 compression (~0.3–0.5 ms for ~200 KB → ~40–80 KB) and appends to the `.icrep` file. File I/O never touches the game thread.

The game thread contributes ~1 ms every 300 ticks (~10 seconds) for keyframe production — well within the 33 ms tick budget. The LZ4 compression and disk write happen asynchronously on the background writer.

### Foreign Replay Decoders (D056)

`ra-formats` includes decoders for foreign replay file formats, enabling direct playback and conversion to `.icrep`:

| Format                | Extension                      | Structure                                                        | Decoder                   | Source Documentation                                                |
| --------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| OpenRA                | `.orarep`                      | ZIP archive (order stream + `metadata.yaml` + `sync.bin`)        | `OpenRAReplayDecoder`     | OpenRA source: `ReplayUtils.cs`, `ReplayConnection.cs`              |
| Remastered Collection | Binary (no standard extension) | `Save_Recording_Values()` header + per-frame `EventClass` DoList | `RemasteredReplayDecoder` | EA GPL source: `QUEUE.CPP` §§ `Queue_Record()` / `Queue_Playback()` |

Both decoders produce a `ForeignReplay` struct (defined in `decisions/09f/D056-replay-import.md`) — a normalized intermediate representation with `ForeignFrame` / `ForeignOrder` types. This IR is translated to IC's `TimestampedOrder` by `ForeignReplayCodec` in `ic-protocol`, then fed to either `ForeignReplayPlayback` (direct viewing) or the `ic replay import` CLI (conversion to `.icrep`).

**Remastered replay header** (from `Save_Recording_Values()` in `REDALERT/INIT.CPP`):

```rust
/// Header fields written by Save_Recording_Values().
/// Parsed by RemasteredReplayDecoder.
pub struct RemasteredReplayHeader {
    pub session: SessionValues,       // MaxAhead, FrameSendRate, DesiredFrameRate
    pub build_level: u32,
    pub debug_unshroud: bool,
    pub random_seed: u32,             // Deterministic replay seed
    pub scenario: [u8; 44],           // Scenario identifier
    pub scenario_name: [u8; 44],
    pub whom: u32,                    // Player perspective
    pub special: SpecialFlags,
    pub options: GameOptions,
}
```

**Remastered per-frame format** (from `Queue_Record()` in `QUEUE.CPP`):

```rust
/// Per-frame recording: count of events, then that many EventClass structs.
/// Each EventClass is a fixed-size C struct (sizeof(EventClass) bytes).
pub struct RemasteredRecordedFrame {
    pub event_count: u32,
    pub events: Vec<RemasteredEventClass>,  // event_count entries
}
```

**OpenRA `.orarep` structure:**

```
game.orarep (ZIP archive)
├── metadata.yaml          # MiniYAML: players, map, mod, version, outcome
├── orders                  # Binary order stream (per-tick Order objects)
└── sync                    # Per-tick state hashes (u64 CRC values)
```

The `sync` stream enables partial divergence detection — IC can compare its own `state_hash()` against OpenRA's recorded sync values to estimate when the simulations diverged.

## Backup Archive Format (D061)

`ic backup create` produces a standard ZIP archive containing the player's data directory. The archive is not a custom format — any ZIP tool can extract it.

### Structure

```
ic-backup-2027-03-15.zip
├── manifest.json                    # Backup metadata (see below)
├── config.toml                      # Engine settings
├── profile.db                       # Player identity (VACUUM INTO copy)
├── achievements.db                  # Achievement collection (VACUUM INTO copy)
├── gameplay.db                      # Event log, catalogs (VACUUM INTO copy)
├── keys/
│   └── identity.key                 # Ed25519 private key
├── communities/
│   ├── official-ic.db               # Community credentials (VACUUM INTO copy)
│   └── clan-wolfpack.db
├── saves/                           # Save game files (copied as-is)
│   └── *.icsave
├── replays/                         # Replay files (copied as-is)
│   └── *.icrep
└── screenshots/                     # Screenshot images (copied as-is)
    └── *.png
```

**Manifest:**

```json
{
  "backup_version": 1,
  "created_at": "2027-03-15T14:30:00Z",
  "engine_version": "0.5.0",
  "platform": "windows",
  "categories_included": ["keys", "profile", "communities", "achievements", "config", "saves", "replays", "screenshots", "gameplay"],
  "categories_excluded": ["workshop", "mods", "maps"],
  "file_count": 347,
  "total_uncompressed_bytes": 524288000
}
```

**Key implementation details:**

- SQLite databases are backed up via `VACUUM INTO` — produces a consistent, compacted single-file copy without closing the database. WAL files are folded in.
- Already-compressed files (`.icsave`, `.icrep`) are stored in the ZIP without additional compression (ZIP `Store` method).
- `ic backup verify <archive>` checks ZIP integrity and validates that all SQLite files in the archive are well-formed.
- `ic backup restore` preserves directory structure and prompts on conflicts (suppress with `--overwrite`).
- `--exclude` and `--only` filter by category (keys, profile, communities, achievements, config, saves, replays, screenshots, gameplay, workshop, mods, maps). See `decisions/09e/D061-data-backup.md` for category sizes and criticality.

## Screenshot Format (D061)

Screenshots are standard PNG images with IC-specific metadata in PNG `tEXt` chunks. Any image viewer displays the screenshot; IC's screenshot browser reads the metadata for filtering and organization.

### PNG tEXt Metadata Keys

| Key                | Example Value                               | Description                            |
| ------------------ | ------------------------------------------- | -------------------------------------- |
| `IC:EngineVersion` | `"0.5.0"`                                   | Engine version at capture time         |
| `IC:GameModule`    | `"ra1"`                                     | Active game module                     |
| `IC:MapName`       | `"Arena"`                                   | Map being played                       |
| `IC:Timestamp`     | `"2027-03-15T15:45:32Z"`                    | UTC capture timestamp                  |
| `IC:Players`       | `"CommanderZod (Soviet) vs alice (Allied)"` | Player names and factions              |
| `IC:GameTick`      | `"18432"`                                   | Sim tick at capture                    |
| `IC:ReplayFile`    | `"2027-03-15-ranked-1v1.icrep"`             | Associated replay file (if applicable) |

**Filename convention:** `<data_dir>/screenshots/<YYYY-MM-DD>-<HHMMSS>.png` (UTC timestamp). The screenshot hotkey is configurable in `config.toml`.

### ra-formats Write Support

`ra-formats` currently focuses on reading C&C file formats. Write support extends the crate for the Asset Studio (D040) and mod toolchain:

| Format    | Write Use Case                                                                      | Encoder Details                                                                                  | Priority                |
| --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `.shp`    | Generate sprites from PNG frames for OpenRA mod sharing                             | `ShapeBlock_Type` + `Shape_Type` header generation, frame offset table, LCW compression (§ LCW)  | Phase 6a (D040)         |
| `.pal`    | Create/edit palettes, faction-color variants                                        | Raw 768-byte write, 6-bit VGA range (trivial)                                                    | Phase 6a (D040)         |
| `.aud`    | Convert .wav/.ogg recordings to classic Westwood audio format for mod compatibility | `AUDHeaderType` generation, IMA ADPCM encoding via `IndexTable`/`DiffTable` (§ AUD Audio Format) | Phase 6a (D040)         |
| `.vqa`    | Convert .mp4/.webm cutscenes to classic VQA format for retro feel                   | `VQAHeader` generation, VQ codebook construction, frame differencing, audio interleaving (§ VQA) | Phase 6a (D040)         |
| `.mix`    | Mod packaging (optional — mods can ship loose files)                                | `FileHeader` + `SubBlock` index generation, CRC filename hashing (§ MIX Archive Format)          | Deferred to `M9` / Phase 6a (`P-Creator`, optional path) |
| `.oramap` | SDK scenario editor exports                                                         | ZIP archive with map.yaml + terrain + actors                                                     | Phase 6a (D038)         |
| YAML      | All IC-native content authoring                                                     | `serde_yaml` — already available                                                                 | Phase 0                 |
| MiniYAML  | `ic mod export --miniyaml` for OpenRA compat                                        | Reverse of D025 converter — IC YAML → MiniYAML with tab indentation                              | Phase 6a                |

All binary encoders reference the EA GPL source code implementations documented in § Binary Format Codec Reference. The source provides complete, authoritative struct definitions, compression algorithms, and lookup tables — no reverse engineering required.

**Planned deferral note (`.mix` write support):** `.mix` encoding is intentionally deferred to `M9` / Phase 6a as an optional creator-path feature (`P-Creator`) after the D040 Asset Studio base and D049 Workshop/CAS packaging flow are in place. Reason: loose-file mod packaging remains a valid path, so `.mix` writing is not part of `M1-M4` or `M8` exit criteria. Validation trigger: `M9` creator workflows require retro-compatible archive packaging for sharing/export tooling.

### Owned-Source Import & Extraction Pipeline (D069/D068/D049, Format-by-Format)

This section defines the implementation-facing **owned-install import/extract plan** for the D069 setup wizard and D068 install profiles, including the requirement that the **C&C Remastered Collection import path works out of the box** when detected.

It complements:
- `D069` (first-run + maintenance wizard UX)
- `D068` (install profiles and mixed-source content planning)
- `D049` (integrity, provenance, and local CAS storage behavior)

#### Milestone placement (explicitly planned)

- **`M1` / `P-Core`**: parser/readiness foundation and source-adapter contracts
- **`M3` / `P-Core`**: player-facing owned-install import/extract baseline in D069 (`Steam Remastered`, `GOG`, `EA`, manual owned installs)
- **`M8` / `P-Creator`**: CLI import diagnostics, import-plan inspection, repair/re-scan tooling
- **`M9` / `P-Creator`**: SDK/Asset Studio inspection, previews, and provenance tooling over the same imported data

**Not in `M1-M3` scope:**
- authoring-grade transcoding during first-run import (`.vqa -> .mp4`, `.aud -> .ogg`)
- SDK-era previews/thumbnails for every imported asset
- any Workshop mirroring of proprietary content (blocked by D037/D049 policy gates)

#### Source adapter model (how the importer is structured)

Owned-source import is a two-stage pipeline:

1. **Source adapter (layout-specific)**
   - Detects a source install and enumerates source files/archives.
   - Produces a **source manifest snapshot** (path, size, source type, integrity/probe info, provenance tags).
   - Handles source-layout differences (including the Remastered Steam install layout) and feeds normalized import candidates into the shared importer.

2. **Format importer (shared, format-specific)**
   - Parses/validates formats via `ra-formats` (and source-specific adapters where needed)
   - Imports/extracts data into IC-managed storage/CAS
   - Builds indexes used by D068 install profiles and D069 maintenance flows
   - Emits provenance and repair/re-scan metadata

This keeps Remastered/GOG/EA path handling isolated while preserving a single import/extract core.

#### D069 import modes (`copy` / `extract` / `reference-only`)

D069 source selections include an import mode. The implementation contract is:

- **`copy`** (default for owned/proprietary sources in Quick Setup):
  - Copy required source files/archives into IC-managed storage.
  - Source install remains read-only.
  - Prioritizes resilience if the original install later moves/disappears.
- **`extract`**:
  - Extract playable assets into IC-managed storage/CAS and build indexes.
  - Also keeps source install read-only.
- **`reference-only`**:
  - Record source references + indexes without claiming a portable imported copy.
  - **Deferred to `M8` (`P-Creator`) for user-facing tooling exposure** (advanced/diagnostic path). Not part of the `M3` out-of-the-box player baseline.

#### Format-by-format handling (owned-install import/extract baseline)

| Format / Source Type | `M1` Readiness Requirement | `M3` D069 Import/Extract Baseline | `M8-M9` Tooling/Diagnostics Extensions | Failure / Recovery Behavior |
| --- | --- | --- | --- | --- |
| `.mix` archives | Parse headers/index, CRC filename lookup, enumerate entries | Import copies/extracts required archive data into IC-managed storage; build entry index + provenance records; source install untouched | CLI import-plan inspection, archive entry listing, targeted re-extract/re-index, SDK/archive inspector views | Corrupt archive/index mismatch -> actionable error, retry/re-scan/source-switch; never mutate source install |
| `.shp` sprite sheets | Parse shape/frame headers, compression flags, frame offsets | Validate + index metadata; import/store blob with provenance; runtime decode remains on-demand for gameplay | Thumbnails/previews, frame inspectors, conversion diagnostics in Asset Studio | Per-file failure logged with source path + reason; importer continues where safe |
| `.pal` palettes | Validate raw 768-byte palette payload and value ranges | Import palette blobs + palette index; build runtime palette lookup caches as needed | Palette preview/compare/remap inspectors in SDK | Invalid palette -> fail item and surface repair/re-scan/source-switch action |
| `.aud` audio | Parse `AUDHeaderType`, validate flags/sizes, decoder sanity check | Import `.aud` blobs + metadata indexes for gameplay playback; no first-run transcode required | Waveform preview + `.aud <-> wav/ogg` conversion tooling (`D040`) | Header/decode failure reported per file; readiness warns for missing critical voice/EVA assets |
| `.vqa` video | Parse VQA headers/chunks enough for integrity/indexing | Import `.vqa` blobs + metadata indexes; no first-run transcode required | Preview extraction/transcoding diagnostics (`D040`), cutscene variant tooling | Parse/index failure falls back to D068 campaign media fallback path where applicable |
| Legacy map/mission files (including assets extracted from archives) | Parse/validate map/mission metadata required for loadability | Import/index files needed by selected install profile and campaign/skirmish paths | Import validation reports, conversion/export diagnostics | Invalid mission/map data surfaced as source-specific validation issue; import remains partial/recoverable |
| OpenRA YAML / MiniYAML (mixed-source installs) | MiniYAML runtime conversion (`D025`) + YAML alias loading (`D023`) | Import/index alongside owned-source content under D062/D068 rules | Provenance and compatibility diagnostics in CLI/SDK | Parse/alias issues reported per file; mixed-source import can proceed with explicit warnings |

#### Verification and provenance outputs (required importer artifacts)

Every owned-source import/extract run must produce:

- **Source manifest snapshot** (what was detected/imported, from where)
- **Per-item import/verify results** (success / failed parse / failed verify / skipped)
- **Installed-content provenance records** (owned local import vs downloaded package)
- **Repair/re-scan metadata** for D069 maintenance and D068 Installed Content Manager

These artifacts power:
- `Repair & Verify`
- `Re-scan Content Sources`
- source-switch guidance
- provenance visibility in D068/D049 UI

#### Execution overlay mapping (implementation sequence)

- **`G1.x`** (M1 format/import readiness substeps): parser coverage + source-adapter contracts + source-manifest outputs
- **`M3.CORE.PROPRIETARY_ASSET_IMPORT_AND_EXTRACT`**: player-facing D069 import/extract baseline (including Remastered out-of-box path)
- **`G21.x`** (M8 creator/operator support substeps): import diagnostics, plan inspection, re-extract/re-index tooling, and documentation

The developer checklists in `18-PROJECT-TRACKER.md` mirror this sequencing and define proof artifacts per stage.
