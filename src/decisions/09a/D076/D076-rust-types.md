# D076 â€” Rust Types (Key Interfaces)

> Sub-page of [D076 â€” Standalone MIT/Apache-Licensed Crate Extraction Strategy](../D076-standalone-crates.md).

These are the public-facing type signatures that define extraction boundaries. IC wraps or extends these types; it never exposes them directly to players.

```rust
// cnc-formats â€” clean-room C&C binary format parsing and encoding
pub struct MixArchive { /* ... */ }
pub struct ShpFile { /* ... */ }
pub struct PalFile { /* ... */ }
pub struct TmpFile { /* ... */ }
pub struct AudFile { /* ... */ }
pub struct VqaFile { /* ... */ }

// All format types use a slice-based parsing API:
//   MixArchive::parse(data: &[u8]) -> Result<Self, FormatError>
//   ShpFile::parse(data: &[u8]) -> Result<Self, FormatError>
// Streaming (Read + Seek) is a planned future option â€” not yet implemented.

// cnc-formats â€” clean-room encoders (no EA-derived code)
pub mod lcw {
    pub fn compress(input: &[u8]) -> Vec<u8>;
    pub fn decompress(input: &[u8], output: &mut [u8]) -> Result<usize, LcwError>;
}
pub mod shp {
    pub fn encode_frames(frames: &[ShpFrame], palette: &PalFile) -> Result<Vec<u8>, ShpError>;
}
pub mod aud {
    pub fn encode_adpcm(samples: &[i16], sample_rate: u32) -> Result<Vec<u8>, AudError>;
    pub fn build_aud(samples: &[i16], sample_rate: u32, stereo: bool) -> Result<Vec<u8>, AudError>;
}
pub mod pal {
    impl PalFile {
        pub fn encode(&self) -> [u8; 768];
    }
}

// cnc-formats â€” VQA decode/encode (clean-room VQ codebook via median-cut quantization)
pub mod vqa {
    pub mod decode {
        pub struct VqaFrame { pub width: u16, pub height: u16, pub palette: [PalColor; 256], pub pixels: Vec<u8> }
        pub struct VqaAudio { pub sample_rate: u16, pub channels: u8, pub samples: Vec<i16> }
        // Methods on VqaFile:
        impl VqaFile {
            pub fn decode_frames(&self) -> Result<Vec<VqaFrame>, Error>;
            pub fn extract_audio(&self) -> Option<VqaAudio>;
        }
    }
    pub mod encode {
        pub struct VqaEncodeParams { pub width: u16, pub height: u16, pub fps: u16, pub num_colors: u16, pub block_width: u8, pub block_height: u8 }
        pub struct VqaAudioInput { pub sample_rate: u16, pub channels: u8, pub samples: Vec<i16> }
        pub fn encode_vqa(frames: &[VqaFrame], audio: Option<&VqaAudioInput>, params: &VqaEncodeParams) -> Result<Vec<u8>, Error>;
    }
}

// cnc-formats â€” MEG/PGM archive parsing (Phase 2, behind `meg` feature flag)
#[cfg(feature = "meg")]
pub struct MegArchive {
    pub entries: Vec<MegEntry>,
}
#[cfg(feature = "meg")]
pub struct MegEntry {
    pub name: String,
    pub offset: u64,
    pub size: u64,
}

// cnc-formats CLI â€” extensible format conversion via --format/--to flags
/// Available conversion formats. Per-variant `#[cfg]` ensures the binary
/// only includes parsers for enabled features.
#[derive(Clone, Copy, Debug, clap::ValueEnum)]
pub enum ConvertFormat {
    /// Standard YAML (always available)
    Yaml,
    /// OpenRA MiniYAML (requires `miniyaml` feature)
    #[cfg(feature = "miniyaml")]
    Miniyaml,
    /// Classic C&C .ini rules (always available)
    Ini,
    /// IST sprite text (requires `ist` feature)
    #[cfg(feature = "ist")]
    Ist,
    // Binary formats below require `convert` feature
    /// SHP sprite sheet (requires `convert` feature)
    #[cfg(feature = "convert")]
    Shp,
    /// PNG image (requires `convert` feature)
    #[cfg(feature = "convert")]
    Png,
    /// GIF image/animation (requires `convert` feature)
    #[cfg(feature = "convert")]
    Gif,
    /// PAL color palette (requires `convert` feature)
    #[cfg(feature = "convert")]
    Pal,
    /// TMP terrain tiles (requires `convert` feature)
    #[cfg(feature = "convert")]
    Tmp,
    /// WSA animation (requires `convert` feature)
    #[cfg(feature = "convert")]
    Wsa,
    /// AUD Westwood audio (requires `convert` feature)
    #[cfg(feature = "convert")]
    Aud,
    /// WAV audio (requires `convert` feature)
    #[cfg(feature = "convert")]
    Wav,
    /// VQA video (requires `convert` feature)
    #[cfg(feature = "convert")]
    Vqa,
    /// AVI video â€” interchange format for VQA conversion (requires `convert` feature)
    #[cfg(feature = "convert")]
    Avi,
    /// FNT bitmap font (requires `convert` feature)
    #[cfg(feature = "convert")]
    Fnt,
    /// MIDI file (requires `midi` feature)
    #[cfg(feature = "midi")]
    Mid,
    /// AdLib OPL2 register data (requires `adl` feature)
    #[cfg(feature = "adl")]
    Adl,
    /// XMIDI / Miles Sound System (requires `xmi` feature)
    #[cfg(feature = "xmi")]
    Xmi,
}

/// `cnc-formats convert` subcommand arguments.
#[derive(clap::Args)]
pub struct ConvertArgs {
    /// Source format override (auto-detected from file extension when
    /// unambiguous; required when reading from stdin). Shared with
    /// `validate` and `inspect` â€” always means "source format override."
    #[arg(long)]
    pub format: Option<ConvertFormat>,
    /// Target format (always required).
    #[arg(long)]
    pub to: ConvertFormat,
    /// Input file path (omit or use `-` for stdin).
    pub input: Option<PathBuf>,
    /// Output file path (omit for stdout).
    #[arg(short, long)]
    pub output: Option<PathBuf>,
    /// Palette file path (required for SHP/TMP conversions that need color data).
    #[arg(long)]
    pub palette: Option<PathBuf>,
    /// SoundFont file path (required for MIDIâ†’WAV/AUD conversions).
    #[cfg(feature = "midi")]
    #[arg(long)]
    pub soundfont: Option<PathBuf>,
}

/// Dispatch: match on `(format, to)` pairs. Unsupported pairs print
/// available conversions and exit with a non-zero status code.
fn convert(args: &ConvertArgs) -> Result<Vec<u8>> {
    let format = args.format.unwrap_or_else(|| detect_format(&args.input));
    let input = &args.input;       // shorthand — all converters take input path
    let palette = &args.palette;   // Option<PathBuf> — required for SHP/TMP
    #[cfg(feature = "midi")]
    let soundfont = &args.soundfont; // Option<PathBuf> — required for MIDI→WAV/AUD

    match (format, args.to) {
        #[cfg(feature = "miniyaml")]
        (ConvertFormat::Miniyaml, ConvertFormat::Yaml) => miniyaml_to_yaml(input),
        #[cfg(feature = "convert")]
        (ConvertFormat::Shp, ConvertFormat::Png) => shp_to_png(input, palette),
        #[cfg(feature = "convert")]
        (ConvertFormat::Png, ConvertFormat::Shp) => png_to_shp(input, palette),
        #[cfg(feature = "convert")]
        (ConvertFormat::Aud, ConvertFormat::Wav) => aud_to_wav(input),
        #[cfg(feature = "convert")]
        (ConvertFormat::Wav, ConvertFormat::Aud) => wav_to_aud(input),
        #[cfg(feature = "convert")]
        (ConvertFormat::Vqa, ConvertFormat::Avi) => vqa_to_avi(input),
        #[cfg(feature = "convert")]
        (ConvertFormat::Avi, ConvertFormat::Vqa) => avi_to_vqa(input),
        #[cfg(feature = "midi")]
        (ConvertFormat::Mid, ConvertFormat::Wav) => mid_to_wav(input, soundfont),
        #[cfg(all(feature = "midi", feature = "convert"))]
        (ConvertFormat::Mid, ConvertFormat::Aud) => mid_to_aud(input, soundfont),
        #[cfg(feature = "xmi")]
        (ConvertFormat::Xmi, ConvertFormat::Mid) => xmi_to_mid(input),
        #[cfg(feature = "xmi")]
        (ConvertFormat::Xmi, ConvertFormat::Wav) => xmi_to_wav(input, soundfont),
        #[cfg(all(feature = "xmi", feature = "convert"))]
        (ConvertFormat::Xmi, ConvertFormat::Aud) => xmi_to_aud(input, soundfont),
        // ... additional pairs for GIF, WSA, TMP, PAL, FNT
        (f, t) => Err(UnsupportedConversion { from: f, to: t }),
    }
}

// cnc-formats MIDI types (behind `midi` feature flag)
// Dependencies: midly (Unlicense), nodi (MIT), rustysynth (MIT)
#[cfg(feature = "midi")]
pub mod mid {
    /// Parsed MIDI file â€” wraps midly::Smf with additional metadata.
    pub struct MidFile { /* tracks, tempo, duration, channel info */ }

    /// Parse a MIDI file from bytes.
    pub fn parse(data: &[u8]) -> Result<MidFile>;

    /// Write a MIDI file to bytes.
    pub fn write(mid: &MidFile) -> Result<Vec<u8>>;

    /// Render MIDI to PCM audio via SoundFont synthesis (rustysynth).
    /// Returns interleaved f32 stereo samples at the given sample rate.
    pub fn render_to_pcm(mid: &MidFile, soundfont: &SoundFont, sample_rate: u32) -> Result<Vec<f32>>;

    /// Render MIDI to WAV file bytes via SoundFont synthesis.
    pub fn render_to_wav(mid: &MidFile, soundfont: &SoundFont, sample_rate: u32) -> Result<Vec<u8>>;
}

// cnc-formats ADL types (behind `adl` feature flag)
// No external dependencies â€” pure Rust parser
#[cfg(feature = "adl")]
pub mod adl {
    /// Parsed AdLib OPL2 register data file (Dune II .adl format).
    /// Contains sequential register write commands with timing information.
    pub struct AdlFile {
        pub register_writes: Vec<AdlRegisterWrite>,
        pub estimated_duration_ms: u32,
    }

    /// A single OPL2 register write with timing offset.
    pub struct AdlRegisterWrite {
        pub register: u8,
        pub value: u8,
        pub delay_ticks: u16,
    }

    /// Parse an .adl file from bytes.
    pub fn parse(data: &[u8]) -> Result<AdlFile>;
}

// cnc-formats XMI types (behind `xmi` feature flag, implies `midi`)
// Depends on midly (via `midi` feature) for MID output
#[cfg(feature = "xmi")]
pub mod xmi {
    /// Parsed XMIDI file â€” IFF FORM:XMID container with Miles Sound System extensions.
    pub struct XmiFile {
        pub sequences: Vec<XmiSequence>,
    }

    /// A single XMIDI sequence (multi-sequence files contain several).
    pub struct XmiSequence {
        pub events: Vec<XmiEvent>,
        pub timing_mode: XmiTimingMode,
    }

    /// XMIDI timing modes â€” IFTHEN (absolute) vs. standard delta-time.
    pub enum XmiTimingMode { Ifthen, DeltaTime }

    /// Parse an .xmi file from bytes.
    pub fn parse(data: &[u8]) -> Result<XmiFile>;

    /// Convert XMIDI to standard MIDI file.
    /// Strips IFF wrapper, converts IFTHEN timing to delta-time,
    /// merges multi-sequence files into a single SMF Type 1.
    pub fn to_mid(xmi: &XmiFile) -> Result<mid::MidFile>;
}

// fixed-game-math â€” deterministic fixed-point arithmetic
pub struct Fixed<const FRAC_BITS: u32>(i64);
pub struct WorldPos { pub x: Fixed<10>, pub y: Fixed<10>, pub z: Fixed<10> }
pub struct WAngle(i32);  // 0..1024 = 0Â°..360Â°

impl Fixed<FRAC_BITS> {
    pub const fn from_int(v: i32) -> Self;
    pub fn sin(angle: WAngle) -> Self;  // table lookup
    pub fn cos(angle: WAngle) -> Self;
    pub fn atan2(y: Self, x: Self) -> WAngle;  // CORDIC
    pub fn sqrt(self) -> Self;  // Newton's method
}

// deterministic-rng â€” seedable, platform-identical PRNG
pub struct GameRng { /* xoshiro256** or similar */ }

impl GameRng {
    pub fn from_seed(seed: u64) -> Self;
    pub fn next_u32(&mut self) -> u32;
    pub fn range(&mut self, min: i32, max: i32) -> i32;
    pub fn weighted_select<T>(&mut self, items: &[(T, u32)]) -> &T;
    pub fn shuffle<T>(&mut self, slice: &mut [T]);
    pub fn damage_spread(&mut self, base: i32, spread_pct: u32) -> i32;
}

// glicko2-rts â€” rating system with RTS adaptations
pub struct Rating {
    pub mu: f64,
    pub phi: f64,    // rating deviation
    pub sigma: f64,  // volatility
}

pub struct MatchResult {
    pub players: Vec<(PlayerId, Rating)>,
    pub outcome: Outcome,
    pub duration_secs: u32,
    pub faction: Option<FactionId>,
}

pub fn update_ratings(results: &[MatchResult], config: &Glicko2Config) -> Vec<(PlayerId, Rating)>;

// lockstep-relay â€” game-agnostic relay core
pub struct RelayCore<T: OrderCodec> { /* ... */ }

impl<T: OrderCodec> RelayCore<T> {
    pub fn new(config: RelayConfig) -> Self;
    pub fn tick(&mut self) -> Vec<RelayEvent<T>>;
    pub fn submit_order(&mut self, player: PlayerId, order: T);
    pub fn player_connected(&mut self, player: PlayerId);
    pub fn player_disconnected(&mut self, player: PlayerId);
}

// workshop-core â€” engine-agnostic mod registry (D050)
pub struct Package { /* ... */ }
pub struct Manifest { /* ... */ }
pub struct Registry { /* ... */ }

pub trait PackageStore {
    fn publish(&self, package: &Package) -> Result<(), StoreError>;
    fn fetch(&self, id: &PackageId, version: &VersionReq) -> Result<Package, StoreError>;
    fn resolve(&self, deps: &[Dependency]) -> Result<Vec<Package>, ResolveError>;
}
```
