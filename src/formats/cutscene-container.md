## IronCutscene Container (.icc)

A lightweight multi-track cutscene container for in-engine playback with language selection and subtitles. Designed to wrap existing C&C codecs (VQA video, AUD audio) without re-encoding, while adding the multi-language and subtitle capabilities that the original formats lack.

### Motivation

C&C cutscenes ship as single `.vqa` files with one baked-in audio track and no subtitle support. This is insufficient for Iron Curtain's goals:

1. **Language switching** — players should be able to change voice-over language without re-downloading video
2. **Subtitles** — accessibility, hearing-impaired support, and translation accuracy
3. **RTL/BiDi text** — Arabic, Hebrew, and Persian subtitle tracks must render correctly
4. **Chapter markers** — scripting hooks for mission briefings (e.g., "pause here until player clicks Continue")
5. **No re-encoding** — the VQA and AUD codecs are already implemented and validated; the container should not require transcoding

### Why Not MKV?

MKV solves all of the above and more. But:

- **MKV is overkill.** We would need a full EBML demuxer, codec negotiation, and SeekHead parsing at runtime. Our video is palette-indexed VQ at 320x200@15fps — not H.264.
- **MKV requires transcoding.** V_UNCOMPRESSED MKV files are enormous. Putting VQA bitstream directly into MKV would require a custom codec ID that no player understands — defeating the "play in VLC" validation benefit.
- **MKV export already exists for validation.** The `cnc-formats` crate exports VQA to MKV (`V_UNCOMPRESSED` + `A_PCM/INT/LIT`) for correctness verification in standard players. That purpose is served.

The IronCutscene container wraps the same bitstreams the engine already decodes, adding only the metadata needed for multi-language playback.

### Design Principles

1. **Zero transcoding** — VQA and AUD payloads are stored byte-identical to their standalone files
2. **Forward-only streaming** — the container can be read start-to-finish with no seeking required (seek is optional, enabled by an index chunk)
3. **Simple IFF-style chunks** — consistent with VQA's existing FORM/chunk structure
4. **UTF-8 throughout** — all text (subtitles, language tags, chapter names) is UTF-8
5. **BiDi is a rendering concern** — the container stores logical-order UTF-8; the engine's text renderer applies the Unicode BiDi algorithm (UAX #9) and font shaping (HarfBuzz/rustybuzz) at display time

### File Structure

```
IronCutscene (.icc)
  ICCF Header
  ICCM Metadata (JSON)
  VIDX Video Track (embedded VQA bitstream)
  AUDX Audio Track 0 (embedded AUD bitstream, language-tagged)
  AUDX Audio Track 1 (embedded AUD bitstream, language-tagged)
  …
  SUBT Subtitle Track 0 (timed text, language-tagged)
  SUBT Subtitle Track 1 (timed text, language-tagged)
  …
  CHAP Chapter Markers (optional)
  SEEK Seek Index (optional)
```

### Header (ICCF — 32 bytes, fixed)

All fields are **little-endian**, packed with no padding.

```rust
pub struct IccHeader {
    pub magic: [u8; 4],         // b"ICCF" — "Iron Curtain Cutscene Format"
    pub version: u16,           // Format version (1)
    pub flags: u16,             // Bit 0: has_seek_index, Bit 1: has_chapters
    pub video_track_count: u8,  // Always 1 for v1 (reserved for future stereo/VR)
    pub audio_track_count: u8,  // Number of AUDX chunks (0 = silent cutscene)
    pub subtitle_track_count: u8, // Number of SUBT chunks
    pub reserved: u8,           // Padding / future use
    pub total_duration_ms: u32, // Total playback duration in milliseconds
    pub metadata_offset: u32,   // Byte offset to ICCM chunk
    pub metadata_length: u32,   // ICCM chunk length (excluding 8-byte chunk header)
    pub payload_offset: u32,    // Byte offset to first track chunk (VIDX)
}
// Total: 4 + 2 + 2 + 1 + 1 + 1 + 1 + 4 + 4 + 4 + 4 = 28 bytes + 4 reserved = 32 bytes
```

### Chunk Format

Every chunk after the header uses a standard 8-byte chunk header:

```rust
pub struct ChunkHeader {
    pub fourcc: [u8; 4],  // Chunk type identifier
    pub size: u32,        // Payload size in bytes (little-endian, excludes this 8-byte header)
}
```

Chunks are always aligned to 2-byte boundaries (1 zero-pad byte after odd-sized payloads). This matches AVI/RIFF convention and prevents misaligned reads.

### Metadata Chunk (ICCM)

JSON metadata for the cutscene browser UI and engine integration. Stored uncompressed for easy tooling access.

```json
{
  "title": "Allied Mission 5 Briefing",
  "title_localized": {
    "de": "Alliierte Mission 5 Briefing",
    "ar": "\u0625\u062D\u0627\u0637\u0629 \u0627\u0644\u0645\u0647\u0645\u0629 5"
  },
  "source_vqa": "ALLY05.VQA",
  "engine_version": "0.5.0",
  "game_module": "ra1",
  "audio_tracks": [
    { "index": 0, "language": "en", "label": "English",  "default": true },
    { "index": 1, "language": "de", "label": "Deutsch",  "default": false },
    { "index": 2, "language": "ar", "label": "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", "default": false }
  ],
  "subtitle_tracks": [
    { "index": 0, "language": "en", "label": "English" },
    { "index": 1, "language": "de", "label": "Deutsch" },
    { "index": 2, "language": "ar", "label": "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", "direction": "rtl" }
  ]
}
```

**Language tags** use IETF BCP 47 (e.g., `en`, `de`, `ar`, `he`, `fa`, `zh-Hans`). The `direction` field is optional — the engine infers RTL from the language tag's script when absent (Arabic, Hebrew, Thaana, Syriac scripts are auto-detected as RTL per UAX #9). Explicit `"direction": "rtl"` overrides auto-detection for edge cases.

### Video Track (VIDX)

```rust
pub struct VidxChunk {
    pub header: ChunkHeader,     // fourcc: b"VIDX", size: payload length
    pub width: u16,              // Frame width in pixels
    pub height: u16,             // Frame height in pixels
    pub fps: u8,                 // Frames per second
    pub codec: u8,               // 0x01 = VQA v2, 0x02 = VQA v3 (reserved)
    pub reserved: u16,           // Future use
    pub vqa_data: [u8],          // Raw VQA file bytes (FORM/WVQA…), byte-identical to standalone .vqa
}
```

The VQA data starts at the `FORM` magic — it is a complete, valid `.vqa` file embedded verbatim. The engine's existing `VqaDecoder` opens a reader positioned at `vqa_data` and decodes as normal. **No re-encoding, no format translation.**

Audio tracks embedded within the VQA itself (SND0/SND1/SND2 chunks) are ignored during playback — the AUDX tracks take precedence. This allows the original VQA to retain its embedded audio for standalone playback while the container provides the language-switched version.

### Audio Tracks (AUDX)

```rust
pub struct AudxChunk {
    pub header: ChunkHeader,     // fourcc: b"AUDX", size: payload length
    pub track_index: u8,         // Track index (matches metadata audio_tracks[].index)
    pub codec: u8,               // 0x01 = AUD (Westwood ADPCM), 0x02 = WAV PCM, 0x03 = OGG Vorbis
    pub reserved: u16,           // Future use
    pub aud_data: [u8],          // Raw AUD file bytes (12-byte header + compressed payload)
}
```

Like VIDX, the AUD data is a complete standalone `.aud` file embedded verbatim. The engine's existing `AudStream` opens a reader positioned at `aud_data`.

**Codec extensibility:** v1 uses `0x01` (AUD) exclusively. The codec byte reserves space for future Workshop content that ships OGG Vorbis voice-overs (`0x03`) — Bevy loads OGG natively, so no new decoder is needed.

### Subtitle Tracks (SUBT)

```rust
pub struct SubtChunk {
    pub header: ChunkHeader,     // fourcc: b"SUBT", size: payload length
    pub track_index: u8,         // Track index (matches metadata subtitle_tracks[].index)
    pub flags: u8,               // Bit 0: is_forced (show even when subtitles disabled)
    pub entry_count: u16,        // Number of subtitle entries (little-endian)
    pub entries: [SubtEntry],    // Variable-length array of timed text entries
}

pub struct SubtEntry {
    pub start_ms: u32,           // Display start time (milliseconds from video start)
    pub end_ms: u32,             // Display end time (milliseconds from video start)
    pub text_length: u16,        // UTF-8 text length in bytes
    pub text: [u8],              // UTF-8 encoded subtitle text (logical order, no formatting)
}
```

**Text encoding:** All subtitle text is UTF-8 in **logical order** (the order characters are typed, not the order they appear on screen). For RTL languages like Arabic and Hebrew, logical order means the first byte of the string corresponds to the first logical character — the Unicode BiDi algorithm (UAX #9) handles visual reordering at render time.

**No formatting markup in v1.** Subtitles are plain text. If styled subtitles are needed later (e.g., speaker identification via color), a v2 flag can enable a minimal markup subset (bold, italic, color) without breaking v1 parsers that ignore unknown flags.

**Forced subtitles:** The `is_forced` flag marks tracks that should display even when the player has subtitles disabled globally. Use case: foreign-language dialogue in an English cutscene (e.g., a Soviet officer speaking Russian with English subtitles).

### Chapter Markers (CHAP, optional)

```rust
pub struct ChapChunk {
    pub header: ChunkHeader,     // fourcc: b"CHAP", size: payload length
    pub entry_count: u16,        // Number of chapter entries
    pub reserved: u16,           // Future use
    pub entries: [ChapEntry],    // Variable-length array
}

pub struct ChapEntry {
    pub timestamp_ms: u32,       // Chapter start time (milliseconds)
    pub trigger_id: u32,         // Engine-defined trigger identifier (0 = no trigger)
    pub name_length: u16,        // UTF-8 name length in bytes
    pub name: [u8],              // UTF-8 chapter name (e.g., "Briefing Part 2")
}
```

**Trigger IDs** are opaque to the container — the engine's scripting system interprets them. Common uses:

- `0x0001` — Pause playback until player input (mission briefing "Continue" button)
- `0x0002` — Branch point (player choice affects next cutscene)
- `0x0003` — Sync point for gameplay overlay (e.g., show map ping during briefing)

Trigger semantics are defined by the game module, not the container format.

### Seek Index (SEEK, optional)

```rust
pub struct SeekChunk {
    pub header: ChunkHeader,     // fourcc: b"SEEK", size: payload length
    pub entry_count: u16,        // Number of seek entries
    pub interval_ms: u16,        // Seek point interval (e.g., 1000 = one entry per second)
    pub entries: [SeekEntry],    // Variable-length array
}

pub struct SeekEntry {
    pub video_byte_offset: u32,  // Byte offset into VIDX.vqa_data for nearest keyframe
    pub audio_byte_offsets: [u32], // One offset per audio track into respective AUDX.aud_data
}
```

The SEEK chunk enables random-access playback (skip to chapter, scrub timeline in replay viewer). Without it, the container is forward-only — perfectly fine for standard cutscene playback.

**Why optional:** Most C&C cutscenes are 30–90 seconds. Forward-only streaming is sufficient. SEEK is worth adding for:
- Long briefings (3+ minutes)
- Replay analysis overlays where the user scrubs through cutscene segments
- Accessibility: users who need to re-read a subtitle section

### Authoring Pipeline

The `cncf` CLI tool packs IronCutscene files from constituent parts:

```bash
# Pack a cutscene with multiple audio languages and subtitles
cncf pack-cutscene \
  --video ALLY05.VQA \
  --audio en:speech_en.aud \
  --audio de:speech_de.aud \
  --audio ar:speech_ar.aud \
  --subs en:subs_en.srt \
  --subs de:subs_de.srt \
  --subs ar:subs_ar.srt \
  --chapter 0:0:"Introduction" \
  --chapter 15000:1:"Briefing Part 2" \
  -o ally05.icc

# Extract tracks from an existing .icc
cncf extract-cutscene ally05.icc --output ./tracks/

# Convert SRT to the internal subtitle format
cncf convert subs_en.srt --to icc-subs
```

**SRT import:** The standard SubRip (.srt) format is the input for subtitle tracks. The packer parses SRT timing (`HH:MM:SS,mmm --> HH:MM:SS,mmm`) and converts to the binary `SubtEntry` array. SRT is chosen because:
- Near-universal subtitle editor support
- Trivial format (sequential numbered entries with timestamps)
- Community translators already use it
- No complex formatting to parse (ASS/SSA support deferred to v2 if ever needed)

### Runtime Playback

```rust
/// Engine opens an .icc file and selects tracks based on player settings.
pub struct CutscenePlayer {
    video: VqaDecoder<BufReader<File>>,     // Existing VQA decoder
    audio: AudStream<BufReader<File>>,       // Existing AUD decoder (selected language)
    subtitles: Vec<SubtEntry>,               // Active subtitle track (selected language)
    chapters: Vec<ChapEntry>,                // Chapter markers
    current_time_ms: u32,                    // Playback position
}

impl CutscenePlayer {
    /// Open a cutscene, selecting audio/subtitle tracks by language preference.
    pub fn open(path: &Path, audio_lang: &str, subtitle_lang: &str) -> Result<Self>;

    /// Switch audio language mid-playback (seeks AUD stream to current position).
    pub fn switch_audio(&mut self, language: &str) -> Result<()>;

    /// Switch subtitle language mid-playback (instant — just swaps the entry list).
    pub fn switch_subtitles(&mut self, language: &str);

    /// Advance playback by one frame. Returns the frame + any active subtitles.
    pub fn next_frame(&mut self) -> Result<CutsceneFrame>;
}

pub struct CutsceneFrame {
    pub pixels: Vec<u8>,                     // Palette-indexed frame (from VqaDecoder)
    pub palette: [u8; 768],                  // RGB palette
    pub audio_samples: Vec<i16>,             // PCM samples for this frame's duration
    pub active_subtitles: Vec<&str>,         // Currently visible subtitle text(s)
    pub trigger: Option<u32>,                // Chapter trigger ID, if a chapter starts this frame
}
```

### RTL / BiDi Rendering

The container stores text in **logical order** — the same byte sequence regardless of display direction. The rendering pipeline handles visual presentation:

1. **Container** stores UTF-8 subtitle: `"مرحبا بالعالم"` (logical order: right-to-left characters stored left-to-right in memory)
2. **Engine text renderer** applies Unicode BiDi algorithm (UAX #9 via `unicode-bidi` crate) to determine visual order
3. **Font shaper** (HarfBuzz via `rustybuzz` crate) applies Arabic/Hebrew contextual shaping (initial/medial/final letter forms)
4. **Layout engine** positions glyphs right-to-left for RTL paragraphs, handling mixed-direction text (e.g., Arabic text with embedded English game terms)

This separation means the container format never needs to know about display direction — it is purely a rendering concern. The same `.icc` file plays correctly on any platform with a conformant text renderer.

**Testing:** The design docs include an [RTL/BiDi QA corpus](../tracking/rtl-bidi-qa-corpus.md) with test vectors for subtitle rendering: mixed LTR/RTL, parentheses mirroring, numeric strings in RTL context, and zero-width joiners in Arabic ligatures.

### MKV Export for Validation

The existing `cncf convert intro.vqa --to mkv` pipeline remains the primary validation tool. To validate an `.icc` file end-to-end:

```bash
# Extract the VQA and one audio track, then export to MKV for VLC playback
cncf extract-cutscene ally05.icc --output ./tracks/
cncf convert ./tracks/video.vqa --to mkv -o ally05_validation.mkv

# Or directly (future CLI enhancement):
cncf convert ally05.icc --to mkv --audio-lang en -o ally05_en.mkv
```

The MKV export proves the VQA and AUD decoders produce correct output; the `.icc` container proves they can be composed into a multi-track playback experience.

### Size Comparison

For a typical 60-second RA1 briefing cutscene (320x200, 15fps, 22050Hz mono):

| Component | Size | Notes |
|-----------|------|-------|
| VQA video | ~800 KB | VQ-compressed, palette-indexed |
| AUD audio (1 language) | ~130 KB | IMA ADPCM, mono 22kHz |
| AUD audio (3 languages) | ~390 KB | 3 × 130 KB |
| Subtitles (3 languages) | ~3 KB | Plain text, timestamps |
| ICC overhead | ~1 KB | Header + metadata + chunk headers |
| **Total .icc (3 languages)** | **~1.2 MB** | vs. 930 KB for original single-language VQA |

The multi-language overhead is almost entirely the additional audio tracks. Subtitles are negligible. The container overhead itself is under 1 KB.

### Versioning & Forward Compatibility

- **Version 1** is the initial release described here
- Parsers must ignore unknown chunk FourCCs (skip `size` bytes + padding) — this allows v2 to add new chunk types without breaking v1 readers
- The `flags` field in the header and each chunk reserves bits for future features
- Breaking changes (if ever needed) increment the `version` field; the engine refuses to load versions it doesn't understand

### Phase

- **Container spec:** This document (design phase)
- **`cnc-formats` support:** Phase 6a — `pack-cutscene` / `extract-cutscene` CLI subcommands, `IccFile` parser/writer in the library
- **Engine playback:** Phase 3 (campaign system) — `CutscenePlayer` in `ic-game`, wired to Bevy's audio and rendering systems
- **Community tooling:** Asset Studio (D040) provides a visual cutscene editor for assembling `.icc` files from VQA + audio + SRT tracks
