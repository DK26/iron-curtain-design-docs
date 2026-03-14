## Binary Format Codec Reference (EA Source Code)

> Struct definitions in this section are sourced from the GPL v3 EA source code repositories and, where the original headers use `#define` offsets rather than packed structs (e.g., FNT), from Vanilla-Conquer's reverse-engineered C structs:
> - [CnC_Remastered_Collection](https://github.com/electronicarts/CnC_Remastered_Collection) — primary source (REDALERT/ and TIBERIANDAWN/ directories)
> - [CnC_Red_Alert](https://github.com/electronicarts/CnC_Red_Alert) — VQA/VQ video format definitions (VQ/ and WINVQ/ directories)
> - [Vanilla-Conquer](https://github.com/TheAssemblyArmada/Vanilla-Conquer) — decompiled structs where EA headers use only `#define` offsets (FNT `FontHeader`)
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

#### Encrypted Header Handling (Extended Format)

**Source:** `REDALERT/MIXFILE.CPP` — `MixFileClass::Retrieve()` and key initialization

Some original RA `.mix` files ship with Blowfish-encrypted header indexes (flag `0x0002`). Notable examples: `local.mix`, `speech.mix`. Full resource compatibility (Invariant #8) requires decryption support.

**What is encrypted:** Only the `SubBlock` index array (the file directory). File data bodies are always plaintext. The Blowfish cipher operates in ECB mode on 8-byte blocks.

**Key source:** Westwood used a hardcoded 56-byte Blowfish key embedded in every game binary. This key is public knowledge — documented by XCC Utilities, OpenRA (`MixFile.cs`), and numerous community tools since the early 2000s. `cnc-formats` embeds this key as a constant. The key is not copyrightable (it is a number) and the decrypt algorithm is standard Blowfish — no EA-specific code is needed.

**Decryption steps:**
1. Read the 2-byte zero marker + 2-byte flags word (4 bytes total)
2. If flag `0x0002` is set, the next N bytes are the Blowfish-encrypted header
3. Decrypt using the hardcoded key in ECB mode (8-byte blocks)
4. The decrypted output contains the `FileHeader` (6 bytes) followed by the `SubBlock` array
5. Validate decrypted `FileHeader.count` and `FileHeader.size` against sane limits (V38 entry caps) before allocating the `SubBlock` array

**SHA-1 digest (flag `0x0001`):** When present, a 20-byte SHA-1 digest follows the file data section. It covers the unencrypted body data. Verification is optional but recommended for integrity checking of original archives.

**Implementation crate:** Use the `blowfish` crate from RustCrypto (MIT/Apache-2.0) for the Blowfish primitive. Do not reimplement the cipher.

**Security:** Blowfish decryption of untrusted input is a parsing step — see V38 in `security/vulns-infrastructure.md` for defensive parsing requirements (validate decrypted header values before allocation, reject malformed ciphertext cleanly).

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

#### Offset-Table Entry Format (Keyframe SHP)

The offset table has `(frames + 2)` entries — one per frame, an EOF sentinel, and a zero-padding entry. Each entry is **8 bytes**:

```text
Offset  Size  Field
0       u32   format_and_offset — high byte = ShpFrameFormat, low 24 bits = absolute file offset
4       u16   ref_offset        — offset to reference frame (for delta formats)
6       u16   ref_format        — format code of the reference frame
```

**Frame encoding formats** (high byte of `format_and_offset`, from `common/keyframe.h` `KeyFrameType`):

| Value  | Name     | EA Constant   | Meaning                                 |
| ------ | -------- | ------------- | --------------------------------------- |
| `0x80` | LCW      | `KF_KEYFRAME` | Standalone keyframe, LCW-compressed     |
| `0x40` | XOR+LCW  | `KF_KEYDELTA` | XOR-delta applied to a remote keyframe  |
| `0x20` | XOR+Prev | `KF_DELTA`    | XOR-delta applied to the previous frame |

To extract the file offset: `offset = format_and_offset & 0x00FFFFFF`. To extract the format: `format = (format_and_offset >> 24) & 0xFF`.

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

### WSA Animation Format (.wsa)

**Source:** `TIBERIANDAWN/WIN32LIB/WSA.CPP` (struct `WSA_FileHeaderType`), `REDALERT/WSA.H`

WSA (Westwood Studios Animation) files contain LCW-compressed delta animations. Used for menu backgrounds, installation screens, campaign map animations, and some in-game effects in both TD and RA. Each frame is an XOR-delta against the previous frame.

#### File Header (14 bytes)

```c
// From WSA.CPP — on-disk header is the first 14 bytes of WSA_FileHeaderType.
// EA defines: WSA_FILE_HEADER_SIZE = sizeof(WSA_FileHeaderType) - 2*sizeof(unsigned long)
// The trailing frame0_offset / frame0_end fields in the struct are actually
// the first two entries of the offset table, included in the struct for convenience.
typedef struct {
    unsigned short total_frames;        // Number of animation frames
    unsigned short pixel_x;             // X display offset
    unsigned short pixel_y;             // Y display offset
    unsigned short pixel_width;         // Frame width in pixels
    unsigned short pixel_height;        // Frame height in pixels
    unsigned short largest_frame_size;  // Largest compressed delta (buffer alloc)
    short          flags;               // Bit 0: embedded palette; Bit 1: frame-0-is-delta
} WSA_FileHeaderType; // on-disk: first 14 bytes only
```

**Offset table:** Immediately after the header — `(total_frames + 2)` × `u32` entries, offsets relative to the start of the data area (after header + offset table + optional palette).

**Frame data layout:**
- `Offsets[0]` through `Offsets[total_frames-1]` point to each frame's LCW-compressed XOR-delta data
- `Offsets[total_frames]` is the loop-back delta (transforms last frame back to frame 0 for seamless looping)
- `Offsets[total_frames+1]` marks end of data (used to compute the loop delta's compressed size; non-zero value indicates looping is available)
- If an offset is 0, that frame is identical to the previous frame (no delta)
- When `flags & 1`, a 768-byte palette (256 × 6-bit VGA RGB) follows the offset table before the compressed data
- When `flags & 2`, frame 0 is an XOR-delta against an external picture (not a standalone frame from black)

**Decoding algorithm:**
1. Allocate a frame buffer (`pixel_width × pixel_height` bytes, palette-indexed)
2. For each frame: LCW-decompress the delta data, then XOR the delta onto the frame buffer
3. The frame buffer now contains the current frame's pixels
4. For looping: apply `Offsets[total_frames]` delta to return to frame 0

**Security:** Same defensive parsing requirements as other LCW-consuming formats — decompression ratio cap (256:1), output size cap (max 4 MB per frame), iteration counter on LCW decode loop. See V38 in `security/vulns-infrastructure.md`.

---

### FNT Bitmap Font Format (.fnt)

**Source:** `TIBERIANDAWN/WIN32LIB/FONT.H`, `FONT.CPP`, `LOADFONT.CPP`; Vanilla-Conquer `common/font.cpp` (decompiled `FontHeader` + `Buffer_Print`); `TXTPRNT.ASM` (confirms 4bpp rendering)

FNT files contain bitmap fonts used for in-game text rendering. Each file contains a variable number of glyphs (up to 256), stored as **4bpp nibble-packed** palette-indexed bitmaps.

#### File Header (20 bytes)

```c
// From Vanilla-Conquer common/font.cpp — reverse-engineered FontHeader.
// EA's FONT.H uses #define offsets (FONTINFOBLOCK=4, FONTOFFSETBLOCK=6, etc.)
// rather than a packed struct; the struct below matches the on-disk layout.
#pragma pack(push, 1)
struct FontHeader {
    unsigned short FontLength;        // Total font data size in bytes
    unsigned char  FontCompress;      // Compression flag (0 = uncompressed; only 0 supported)
    unsigned char  FontDataBlocks;    // Number of data blocks (must be 5 for TD/RA)
    unsigned short InfoBlockOffset;   // Byte offset to info block (typically 0x0010)
    unsigned short OffsetBlockOffset; // Byte offset to per-char offset table (typically 0x0014)
    unsigned short WidthBlockOffset;  // Byte offset to per-char width table
    unsigned short DataBlockOffset;   // Byte offset to glyph bitmap data
    unsigned short HeightOffset;      // Byte offset to per-char height table
    unsigned short UnknownConst;      // Always 0x1012 or 0x1011 (unused by game code)
    unsigned char  Pad;               // Padding byte (always 0)
    unsigned char  CharCount;         // Number of characters minus 1 (last char index)
    unsigned char  MaxHeight;         // Maximum glyph height in pixels
    unsigned char  MaxWidth;          // Maximum glyph width in pixels
};
#pragma pack(pop)
```

**Validation:** `LOADFONT.CPP` requires `FontCompress == 0` and `FontDataBlocks == 5`.

**Per-character data:**
- **Offset table** (at `OffsetBlockOffset`): `(CharCount+1)` × `u16` — byte offset from `DataBlockOffset` to each character's glyph data
- **Width table** (at `WidthBlockOffset`): `(CharCount+1)` × `u8` — pixel width of each character
- **Height table** (at `HeightOffset`): `(CharCount+1)` × `u16` — packed: low byte = Y-offset of first data row within the character cell, high byte = number of data rows stored. This allows glyphs to omit leading/trailing transparent rows.
- **Glyph data** (at `DataBlockOffset`): **4bpp nibble-packed** row-major bitmap data. Two pixels per byte: low nibble = left pixel, high nibble = right pixel. Each glyph row is `ceil(width / 2)` bytes; total glyph size is `ceil(width / 2) × data_rows` bytes. Color index 0 = transparent; indices 1–15 map through a 16-entry color translation table supplied at render time (not stored in the FNT file). Glyphs with width 0 have no pixel data (space characters).

**IC usage:** IC does not use `.fnt` for runtime text rendering (Bevy's font pipeline handles modern TTF/OTF fonts with CJK/RTL support). `.fnt` parsing is needed for: (1) displaying original game fonts faithfully in Classic render mode (D048), (2) Asset Studio (D040) font preview and export.

---

> Architecture lessons from EA's GPL source code and coordinate system translation are in [EA Source Code Insights](ea-source-insights.md).
