# D076: Standalone MIT/Apache-Licensed Crate Extraction Strategy

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 0 (Tier 1 crates), multi-phase (Tier 2–3 follow extraction timeline)
- **Execution overlay mapping:** `M0` (license/repo bootstrap), `M1` (Tier 1 crates), `M2` (Tier 2a), `M5`–`M9` (Tier 2b–3); `P-Core` (Tier 1), `P-Differentiator` / `P-Creator` (Tier 2–3)
- **Deferred features / extensions:** Tier 3 crates (`lua-sandbox`, `p2p-distribute`) deferred to Phase 5–6a; community governance for extracted crate contribution policies deferred to post-launch
- **Deferral trigger:** Tier 2b/3 extraction proceeds when the consuming IC crate reaches implementation milestone and the API surface stabilizes
- **Canonical for:** Which IC subsystems are extracted as permissively-licensed standalone crates, their licensing model, naming, repo strategy, and GPL boundary rules
- **Scope:** Repo architecture, licensing (`LICENSE-MIT`, `LICENSE-APACHE`), crate naming, CI, `cargo-deny` policy, `ic-sim`, `ic-net`, `ic-protocol`, `ra-formats`, Workshop core
- **Decision:** Selected IC subsystems that have zero IC-specific dependencies and general-purpose utility are extracted into standalone MIT OR Apache-2.0 dual-licensed crates in separate repositories from day one. IC consumes them as normal `Cargo.toml` dependencies. Extraction is phased by implementation timeline, with Tier 1 (Phase 0) crates separated before any GPL code exists.
- **Why:** Maximizes community adoption; avoids GPL tainting by separating before GPL code is written; amortizes engineering across future game projects (D050); attracts contributors who avoid GPL; produces cleaner crate boundaries
- **Non-goals:** Relicensing the IC engine itself; extracting anything with IC-specific game logic; creating a foundation/umbrella org (use personal GitHub org)
- **Invariants preserved:** Sim/net boundary (Invariant #2) — extracted crates never cross it; determinism guarantee (Invariant #1) — `fixed-game-math` and `deterministic-rng` enforce it independently
- **Defaults / UX behavior:** N/A (developer-facing architectural decision)
- **Compatibility / Export impact:** Extracted crates use semver; IC pins specific versions; breaking changes follow standard Rust semver conventions
- **Security / Trust impact:** Extracted crates undergo the same `cargo-deny` + `cargo-audit` CI as IC
- **Public interfaces / types / commands:** `cnc-formats`, `fixed-game-math`, `deterministic-rng`, `workshop-core`, `lockstep-relay`, `glicko2-rts`, `lua-sandbox`, `p2p-distribute`
- **Affected docs:** `src/09-DECISIONS.md`, `src/decisions/09a-foundation.md`, `AGENTS.md`, `src/18-PROJECT-TRACKER.md`, `src/tracking/milestone-dependency-map.md`
- **Keywords:** MIT, Apache, standalone crate, extraction, permissive license, GPL boundary, open source, reusable library, cross-project

---

## Decision

Selected Iron Curtain subsystems that satisfy **all** of the following criteria are extracted into standalone, permissively-licensed crates hosted in separate Git repositories:

1. **Zero IC-specific dependency** — the crate does not import any `ic-*` crate
2. **General-purpose utility** — useful to projects beyond Iron Curtain
3. **Clean API boundary** — the interface can be defined without leaking IC internals
4. **No EA-derived code** — contains no code derived from GPL-licensed EA source releases (this is what makes permissive licensing legally clean)

IC consumes these crates as normal Cargo dependencies. The extracted crates are **MIT OR Apache-2.0** dual-licensed (the Rust ecosystem standard for permissive crates).

---

## Why Extract

1. **Community adoption.** Permissively-licensed crates attract users and contributors who would never touch GPL code. A standalone `fixed-game-math` crate is useful to any deterministic game; a standalone `cnc-formats` crate is useful to any C&C tool or modding project. GPL scares away potential adopters.

2. **GPL boundary clarity.** By extracting crates into separate repos *before* any GPL engine code is written (Phase 0), there is zero legal ambiguity — the permissive code was never part of the GPL codebase. No dual-licensing gymnastics, no CLA, no contributor confusion.

3. **Cross-project reuse.** D050 explicitly plans for future game projects (XCOM-style tactics, Civ-style 4X, OFP/ArmA-style milsim) that share Workshop, distribution, and math infrastructure. Permissive licensing makes these future projects license-agnostic — they can be GPL, MIT, proprietary, or anything else.

4. **Cleaner architecture.** Extraction forces clean API boundaries. A crate that *can* be extracted *is* well-encapsulated. This discipline produces better code even if no one else ever uses the crate.

5. **Contributor attraction.** The Rust ecosystem runs on MIT/Apache-2.0. Developers searching crates.io for fixed-point math or C&C format parsers will find and contribute to permissive crates far more readily than to GPL engine modules.

6. **Clean-room feasibility proof.** `cnc-formats` demonstrates that all C&C format parsing (binary and text) works correctly using only community documentation and public specifications — zero EA-derived code. This proves the engine is not *technically dependent* on GPL code. `ra-formats` adds EA-derived details for authoritative edge-case correctness (a quality choice), but the engine functions on the standalone crate alone. This gives IC a fallback path: if GPL ever became problematic, the engine crates (which contain no EA code) could be relicensed, and `ra-formats`'s EA references could be dropped in favor of the clean-room implementations. See D051 § "GPL Is a Policy Choice, Not a Technical Necessity."

---

## Extraction Tiers and Timeline

### Tier 1 — Phase 0 (Day One)

These crates are the first things built. They have zero IC-specific dependencies by definition because IC doesn't exist yet when they're created. **Separate repos from the start.**

| Crate Name          | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Why Standalone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | IC Consumer                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `cnc-formats`       | Parse and encode C&C formats: binary (`.mix`, `.shp`, `.tmp`, `.pal`, `.aud`, `.vqa`, `.wsa`, `.fnt`), `.ini` rules, MiniYAML (feature-gated), Petroglyph `.meg`/`.pgm` archives (feature-gated, Phase 2), `.mid` MIDI (feature-gated), Westwood-lineage audio `.adl` AdLib and `.xmi` XMIDI (feature-gated). Clean-room encoders (LCW, IMA ADPCM, VQ codebook, SHP assembly). Bidirectional conversion (SHP↔PNG, AUD↔WAV, VQA↔AVI, MID→WAV/AUD, XMI→MID/WAV/AUD, etc. behind `convert` feature). | Every C&C tool, viewer, converter, and modding project needs format parsing and conversion. Currently scattered across C/C#/Python community tools with no canonical Rust implementation. `.ini` is a classic C&C format; MiniYAML is OpenRA-originated but de facto community standard. `.meg` is Petroglyph's archive format (Empire at War / C&C Remastered lineage) — clean-roomable from community docs (OS Big Editor, OpenSage). MIDI is a universal standard in game audio tooling and the intermediate format for IC's LLM audio generation pipeline (ABC → MIDI → SoundFont → PCM). `.adl` (AdLib OPL2, Dune II) and `.xmi` (XMIDI, Kyrandia / Miles Sound System) are Westwood-lineage audio formats — the community working with Westwood games expects these in the same toolbox. Note: C&C (TD/RA) shipped music as `.aud` digital audio, not MIDI — earlier Westwood titles used these synthesizer formats before switching to pre-rendered digital audio. | `ra-formats` (IC's game-specific layer wraps `cnc-formats` with IC asset pipeline integration) |
| `fixed-game-math`   | Deterministic fixed-point arithmetic: `Fixed<N>`, trig tables, CORDIC atan2, Newton sqrt, modifier chains                                                                                                                                                                                                                                                                                                                                                                                         | Any deterministic game (lockstep RTS, fighting game, physics sim) needs platform-identical math. No good Rust crate exists with game-focused API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `ic-sim`, `ic-protocol`                                                                        |
| `deterministic-rng` | Seedable, platform-identical PRNG with game-oriented API: range sampling, weighted selection, shuffle, damage spread                                                                                                                                                                                                                                                                                                                                                                              | Same audience as `fixed-game-math`. Must produce identical sequences on all platforms (x86/ARM/WASM).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `ic-sim`                                                                                       |

**Naming note:** The IC crate currently called `ra-formats` stays in the IC monorepo as GPL code because it references EA's GPL-licensed C&C source for struct definitions and lookup tables (D051 rationale #2). `cnc-formats` is the *new* permissive crate containing clean-room format parsing and encoding with no EA-derived code. `ra-formats` becomes a thin wrapper that adds EA-specific details (compression tables, game-specific constants, encoder enhancements for pixel-perfect original format matching) on top.

**Feature-gated MiniYAML:** `.ini` parsing is always available (it's a classic C&C format). MiniYAML parsing is behind `features = { miniyaml = [] }` because it's OpenRA-specific — a `.mix` extractor tool or asset viewer doesn't need it. The `cnc-formats` CLI binary ships in the same repo; its `convert` subcommand uses `--format`/`--to` flags for extensible format dispatch: `--to` is always required, `--format` is optional (auto-detected from file extension when unambiguous, required when reading from stdin). The `--format` flag is shared with `validate` and `inspect` — it always means "source format override." The `ConvertFormat` enum defines available formats with per-variant `#[cfg]` feature gating — `Miniyaml` requires the `miniyaml` feature, `Ist` requires the `ist` feature, `Yaml` is always available. Unsupported `(format, to)` pairs print available conversions. Current conversions: `--format miniyaml --to yaml`, `--format shp --to ist` (requires `.pal`), `--format ist --to shp`. `validate` and `inspect` work on all formats unconditionally. `ra-formats` depends on `cnc-formats` with `miniyaml` enabled.

**Feature-gated IST (IC Sprite Text):** IST is a YAML-wrapped palette-indexed hex pixel grid format — a human-readable, diffable, version-controllable text representation of `.shp` + `.pal` sprite data. Behind `features = { ist = [] }`. Round-trip lossless: `.shp + .pal → IST → .shp + .pal` produces byte-identical output. Compact mode uses 1 hex character per pixel for ≤16 color sprites; full mode uses 2 hex characters for 17–256 colors. Useful standalone as a text-editable sprite format for any retro game engine or pixel art tool. Also serves as the token-efficient representation for LLM-based sprite generation (see `research/text-encoded-visual-assets-for-llm-generation.md`). The `ist` feature adds `.shp`/`.pal` as recognized formats for `convert`, `validate`, and `inspect`.

**Feature-gated MIDI:** MIDI (`.mid`) is the intermediate format for IC's LLM audio generation pipeline (ABC → MIDI → SoundFont → PCM) and a universal standard in game audio tooling. Note: C&C (TD/RA) shipped music as `.aud` digital audio, not MIDI — earlier Westwood titles used synthesizer formats (`.adl`, XMIDI), not standard `.mid`. Behind `features = { midi = ["dep:midly", "dep:nodi", "dep:rustysynth"] }`. Adds three pure Rust permissively licensed dependencies: `midly` (zero-allocation MIDI parser/writer, `no_std`, Unlicense), `nodi` (MIDI playback abstraction, track merging, MIT), and `rustysynth` (SoundFont SF2 synthesizer — renders MIDI to PCM, real-time capable, reverb + chorus, MIT). All three are WASM-compatible with zero C bindings. The `midi` feature enables: `MidFile` parsing/writing, `mid::render_to_pcm()`/`mid::render_to_wav()` SoundFont rendering, and `convert` support for MID→WAV (via SoundFont) and MID→AUD (SoundFont + IMA ADPCM encode). WAV/AUD→MID is explicitly not supported — audio-to-symbolic transcription is an unsolved ML problem outside the scope of a format conversion tool. `validate` and `inspect` report track count, channels, tempo, duration, and instrument programs. Useful standalone for any game modding project that needs to work with MIDI files, and as the intermediate format for IC's LLM audio generation pipeline. See `research/llm-soundtrack-generation-design.md` for the LLM generation pipeline that uses MIDI as its intermediate format.

**Feature-gated ADL (AdLib OPL2):** Dune II (1992) shipped its soundtrack as `.adl` files — sequential OPL2 register writes driving Yamaha YM3812 FM synthesis. Behind `features = { adl = [] }`. `cnc-formats` provides a clean-room read-only parser: `AdlFile` struct containing register write sequences with timing data. `validate` reports structural integrity; `inspect` reports register count, estimated duration, and detected instrument patches. ADL→WAV rendering requires OPL2 chip emulation — the only viable pure Rust emulator (`opl-emu`) is GPL-3.0, so audio rendering lives in `ra-formats`, not `cnc-formats`. Community documentation: DOSBox source code, AdPlug project. No WASM-incompatible dependencies — the parser is pure Rust with zero external dependencies.

**Feature-gated XMI (XMIDI / Miles Sound System):** The Kyrandia series and other Miles AIL-licensed Westwood titles used `.xmi` — an extended MIDI variant in an IFF FORM:XMID container with Miles-specific extensions: IFTHEN-based absolute timing (vs. standard MIDI delta-time), for-loop markers, and multi-sequence files. Behind `features = { xmi = ["midi"] }` — implies `midi` because XMI→MID conversion produces a standard MIDI file processed by the existing pipeline. Clean-room XMI→MID converter (~300 lines): strips IFF wrapper, converts IFTHEN timing to delta-time, merges multi-sequence files into a single SMF. Once converted to MID, the existing MIDI pipeline handles SoundFont rendering to WAV/AUD. `validate` reports IFF structure integrity; `inspect` reports sequence count, timing mode, and embedded SysEx data. No external documentation needed beyond the Miles Sound System SDK specification (publicly available) and community implementations (AIL2MID, WildMIDI).

**Encrypted `.mix` handling:** Extended `.mix` files use Blowfish-encrypted header indices with a hardcoded symmetric key. Both the Blowfish algorithm (public domain) and the key derivation are publicly documented on ModEnc and implemented in community tools (XCC, OpenRA). This is clean-room knowledge — `cnc-formats` handles encrypted `.mix` archives directly using the `blowfish` RustCrypto crate (MIT/Apache-2.0). No EA-derived code is needed.

**`.mix` write support split:** `cnc-formats pack` (Phase 6a) creates standard `.mix` archives — CRC hash table generation, file offset index, unencrypted format. `ra-formats` extends this with encrypted `.mix` creation (Blowfish key derivation + SHA-1 body digest) for modders who need archives matching the original game's encrypted format. The typical community use case (mod distribution) uses unencrypted `.mix` — only replication of original game archives requires encryption.

**Remastered format split:** Remastered Collection formats divide across the crate boundary by clean-room feasibility:

- **`.meg` / `.pgm` (archive formats) → `cnc-formats` (Phase 2, behind `meg` feature flag).** Petroglyph's MEG archive format is documented by community tools (OS Big Editor, OpenSage) with sufficient detail for clean-room implementation — no EA-derived code needed. `.pgm` is a MEG file with a different extension. `cnc-formats` gains a read-only `MegArchive` parser in Phase 2, at which point the CLI `extract`, `list`, and `check` subcommands support MEG archives alongside `.mix`. This gives the broader Petroglyph/Empire at War modding community a permissively-licensed MEG parser. `ra-formats` depends on `cnc-formats` with the `meg` feature enabled.
- **`.mtd` (MegaTexture) and `.meta` (megasheet layout) → `ra-formats` only.** `.mtd` is Petroglyph-proprietary with no community documentation outside the GPL DLL source. `.meta` is a simple JSON format (per-frame sprite geometry), parseable with `serde_json`, but its semantics (chroma-key → remap conversion, megasheet splitting pipeline) are C&C-Remastered-specific and defined by the GPL DLL — not general-purpose.
- **`.tga`, `.dds`, `.wav` → existing Rust crates.** Standard formats handled by `image`, `ddsfile`, and `hound` respectively. No `cnc-formats` involvement needed.
- **`.bk2` (Bink Video 2) → `ra-formats` / `ic` CLI.** Proprietary RAD Game Tools codec; converted to WebM at import time (see D075). Not a candidate for `cnc-formats`.

**CLI subcommand roadmap:**

| Subcommand    | Phase | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate`    | 0     | Structural correctness check for any supported format                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `inspect`     | 0     | Dump contents and metadata (`--json` for machine-readable output)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `convert`     | 0     | Extensible format conversion via `--format`/`--to` flags. `--to` required, `--format` auto-detected from extension. **Text:** `--format miniyaml --to yaml` (behind `miniyaml` feature), `--format shp --to ist` and `--format ist --to shp` (behind `ist` feature, requires `.pal`). **Binary** (behind `convert` feature): SHP↔PNG, SHP↔GIF, PAL→PNG, TMP→PNG, WSA↔PNG, WSA↔GIF, AUD↔WAV, VQA↔AVI, FNT→PNG. **MIDI** (behind `midi` feature): MID→WAV (requires SoundFont via `--soundfont`), MID→AUD (SoundFont render + IMA ADPCM encode). **XMIDI** (behind `xmi` feature, implies `midi`): XMI→MID (clean-room conversion), XMI→WAV (via XMI→MID then SoundFont render), XMI→AUD (via XMI→MID→WAV→AUD pipeline). Adding future conversions is a new `ConvertFormat` enum variant + match arm — no subcommand-level change. |
| `extract`     | 1     | Decompose `.mix` archives to individual files (`.meg`/`.pgm` support added Phase 2 via `meg` feature)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `list`        | 1     | Quick archive inventory — filenames, sizes, types (`.meg`/`.pgm` support added Phase 2 via `meg` feature)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `check`       | 2     | Deep integrity verification — CRC validation, truncation detection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `diff`        | 2     | Format-aware structural comparison of two files of the same type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fingerprint` | 2     | SHA-256 canonical content hash (parsed representation, not raw bytes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pack`        | 6a    | Create `.mix` archives from directory (inverse of `extract`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

All subcommands are game-agnostic. Semantic validation (missing prerequisites, circular inheritance in rule files) belongs in `ic mod lint`, not in `cnc-formats`.

**CLI error reporting:** All convert operations print status to stderr before heavy work (e.g., `Converting SHP → PNG (12 frames, 50×39, palette: temperat.pal)...`). Error reporting helpers (`report_parse_error`, `report_convert_error`) provide file path + error detail + format hints. For ambiguous file extensions (e.g., `.tmp` files that could be TD or RA format), `print_format_hint` suggests `--format` override. All status/error output goes to stderr; piped stdout stays clean.

### Tier 2a — Phase 2 (Simulation)

These crates emerge naturally during simulation development. Extract when the API stabilizes.

| Crate Name    | Purpose                                                                                                                                                     | Why Standalone                                                                                                                                                                                                            | IC Consumer                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `glicko2-rts` | Glicko-2 rating system with RTS-specific adaptations: match duration weighting, team game support, faction-specific ratings, inactivity decay, season reset | Every competitive game needs rating. The Glicko-2 algorithm is public but existing Rust crates lack game-specific features. D055's adaptations (RD floor=45, per-match updates, 91-day season tuning) are broadly useful. | `ic-net` (ranking subsystem) |

### Tier 2b — Phase 5 (Multiplayer)

| Crate Name       | Purpose                                                                                                                                                                                                      | Why Standalone                                                                                                                                            | IC Consumer                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `lockstep-relay` | Generic lockstep relay server core: `RelayCore<T>` with connection management, tick synchronization, order aggregation, stall detection, adaptive timing. Game-agnostic — parameterized over order type `T`. | Any lockstep game needs relay infrastructure. IC's relay design (D007) is already generic over `NetworkModel` — `RelayCore` is the network-agnostic half. | `ic-net` (relay server binary) |

### Tier 3 — Phase 5–6a (Workshop & Scripting)

| Crate Name       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Why Standalone                                                                                                                                                                                        | IC Consumer                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `workshop-core`  | Engine-agnostic mod registry, distribution, federation, P2P delivery, integrity verification, dependency resolution. D050's "Workshop Core Library" layer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Designed from day one for cross-project reuse (D050). Zero Bevy dependency. Any game with mod/content distribution can use it.                                                                        | `ic-editor`, `ic-game` (via Bevy plugin wrapper)                                                      |
| `lua-sandbox`    | Sandboxed Lua 5.4 runtime with instruction-counted execution, memory limits, allowlisted stdlib, and game-oriented host API patterns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Lua sandboxing is needed by any moddable game. IC's tiered approach (D004) produces a well-designed sandbox that others can reuse.                                                                    | `ic-script`                                                                                           |
| `p2p-distribute` | Foundational P2P content distribution engine: BitTorrent/WebTorrent wire protocol, content channels (mutable versioned data streams), protocol-layer revocation enforcement, streaming piece selection, extensibility traits (`StorageBackend`, `PeerFilter`, `AuthPolicy`, `RevocationPolicy`, `DiscoveryBackend`), embedded tracker, DHT, 10-group config system with built-in profiles. IC's primary P2P primitive — used by Workshop, lobby auto-download, replay sharing, update delivery, and live config channels. Also useful to any application needing P2P content distribution: package managers, media tools, IoT fleets. See `research/p2p-distribute-crate-design.md`. | P2P content distribution is a universal infrastructure problem. A pure-Rust BT-compatible engine with content channels, revocation, and WebTorrent support has broad utility far beyond game modding. | `workshop-core`, `ic-server`, `ic-game` (via `workshop-core` and directly for replay/update/channels) |

---

## Repo Strategy

**Approach: Separate repositories from inception (Strategy A).**

Each extracted crate lives in its own Git repository under the author's GitHub organization. This is the cleanest GPL boundary — code that was never in the GPL repo cannot be GPL-tainted.

```
github.com/<author>/
├── cnc-formats/          # MIT OR Apache-2.0 (binary + text codecs, MiniYAML feature-gated)
├── fixed-game-math/      # MIT OR Apache-2.0
├── deterministic-rng/    # MIT OR Apache-2.0
├── glicko2-rts/          # MIT OR Apache-2.0
├── lockstep-relay/       # MIT OR Apache-2.0
├── workshop-core/        # MIT OR Apache-2.0
├── lua-sandbox/          # MIT OR Apache-2.0
├── p2p-distribute/       # MIT OR Apache-2.0
└── iron-curtain/         # GPL v3 with modding exception (D051)
    ├── ra-formats/       # GPL (wraps cnc-formats + EA-derived code)
    ├── ic-sim/           # GPL (depends on fixed-game-math, deterministic-rng)
    ├── ic-net/           # GPL (depends on lockstep-relay, glicko2-rts)
    ├── ic-script/        # GPL (depends on lua-sandbox)
    ├── ic-editor/        # GPL (depends on workshop-core)
    └── ...               # GPL
```

### Why Not Monorepo with Dual Licensing?

Dual-licensing (GPL + MIT) within a single repo creates contributor confusion ("which license applies to my PR?"), requires a CLA or DCO that covers both licenses, and introduces legal ambiguity about GPL contamination from adjacent code. Separate repos eliminate all of these problems.

### Why Not Specification-First?

Writing a specification document and then implementing a "clean-room" MIT reference alongside the GPL production code doubles the maintenance burden. Since we can extract before GPL code exists (Tier 1), this complexity is unnecessary.

---

## GPL Boundary Rules

These rules prevent accidental GPL contamination of the permissive crates:

1. **No `ic-*` imports.** An extracted crate must never depend on any `ic-*` crate. Dependencies flow one way: `ic-*` → extracted crate, never the reverse.

2. **No EA-derived code.** Extracted crates must not contain struct definitions, lookup tables, compression algorithms, or any other material derived from EA's GPL-licensed C&C source releases. This is why `ra-formats` stays GPL and `cnc-formats` is clean-room.

3. **No cross-pollination in PRs.** Contributors to extracted crates must not copy-paste from the IC GPL codebase into the permissive crate. `CONTRIBUTING.md` in each extracted repo must state this explicitly.

4. **CI enforcement.** Each extracted crate's CI runs `cargo-deny` configured to reject GPL dependencies. The IC monorepo's `cargo-deny` config permits GPL (since IC itself is GPL) but verifies that extracted crate dependencies remain permissive.

5. **API stability contract.** Extracted crates follow standard Rust semver. IC pins specific versions. Breaking changes require a major version bump. IC's `Cargo.toml` specifies exact versions (`= "x.y.z"`) or compatible ranges (`"~x.y"`) depending on stability maturity.

---

## Crate Design Principles

Each extracted crate follows these design principles:

1. **`#![no_std]` only where the use case is genuinely universal.** `fixed-game-math` and `deterministic-rng` are `#![no_std]` — deterministic math and PRNG are legitimately useful in embedded, bare-metal, and WASM-without-std contexts. `cnc-formats` uses `std` by default — its consumers are always desktop/mobile/browser applications with full `std` support. `std` enables `std::io::Read` streaming (critical for large `.mix`/`.vqa` files), `std::error::Error` ergonomics, and `HashMap` without extra dependencies. There is no realistic scenario where C&C format parsers run on a microcontroller or in a kernel module.

2. **Zero mandatory dependencies beyond `std`.** Optional features gate integration with `serde`, `bevy`, `tokio`, etc.

3. **Feature flags for ecosystem integration.** Optional features gate external dependencies. Library consumers who only need parsing don't pay for image/audio/CLI crate compilation:

   **`cnc-formats` features:**
   ```toml
   [features]
   default = ["encrypted-mix", "cli"]
   encrypted-mix = ["dep:blowfish", "dep:base64"]   # Blowfish-encrypted .mix header index
   miniyaml = []                                      # MiniYAML parser (OpenRA format)
   ist = []                                            # IST sprite text format
   meg = []                                            # .meg/.pgm Petroglyph archives (Phase 2)
   midi = ["dep:midly", "dep:nodi", "dep:rustysynth"] # MIDI parse/write/synth
   adl = []                                            # .adl AdLib OPL2 parser (Dune II)
   xmi = ["midi"]                                      # .xmi XMIDI parser/converter (Miles Sound System)
   cli = ["dep:clap"]                                  # Unified CLI binary (primary interface)
   convert = ["dep:png", "dep:hound", "dep:gif"]       # Bidirectional binary format conversion
   ```

   **`fixed-game-math` features:**
   ```toml
   [features]
   default = ["std"]
   std = []
   serde = ["dep:serde"]
   bevy = ["dep:bevy_reflect"]
   ```

   Feature flag design principles: `cli` is a default feature because the CLI is the primary user-facing interface and replaces the former single-purpose `miniyaml2yaml` binary. `convert` is opt-in because it pulls in `png`, `hound`, and `gif` — heavy dependencies unnecessary for library consumers who only need parsing. `encrypted-mix` is default because most `.mix` consumers encounter encrypted archives from the original games.

4. **Comprehensive documentation and examples.** Standalone crates must be usable without reading IC's design docs. README, rustdoc, and examples should be self-contained.

5. **Property-based testing.** Determinism-critical crates (`fixed-game-math`, `deterministic-rng`) include cross-platform property tests that verify identical output on x86, ARM, and WASM targets.

---

## Heap Allocation Policy (cnc-formats)

`cnc-formats` minimizes heap allocations in parsing hot paths. The `&[u8]` zero-copy API is the primary interface; `Vec`-returning APIs are convenience wrappers for CLI and tool consumers.

| Module                | Parse-time allocs           | Runtime allocs       | Notes                                                 |
| --------------------- | --------------------------- | -------------------- | ----------------------------------------------------- |
| `mix`                 | 1 (entry index `Vec`)       | 0                    | File data read via offset into source slice           |
| `shp`                 | 1 (frame offset `Vec`)      | 0 per frame          | Frame pixels decoded into caller-provided buffer      |
| `pal`                 | 0                           | 0                    | Fixed 768-byte array, stack-allocated                 |
| `tmp`                 | 1 (tile offset `Vec`)       | 0                    | Similar to SHP — offsets into source data             |
| `aud`                 | 1 (decoded samples `Vec`)   | 0                    | ADPCM decode produces output samples                  |
| `vqa::decode`         | 2 (frame + audio `Vec`s)    | 0                    | Frame pixels borrowed where possible                  |
| `vqa::encode`         | N (codebook + frame `Vec`s) | 0                    | Median-cut quantization allocates per-codebook-entry  |
| `convert`             | varies                      | varies               | PNG/GIF/WAV/AVI encoding — external crate allocations |
| `mid` (behind `midi`) | 1 (track events `Vec`)      | 1 (PCM render `Vec`) | Parse via `midly`; SoundFont render via `rustysynth`  |
| `miniyaml`            | 1 (node tree `Vec`)         | 0                    | Parse tree is the output                              |
| `ini`                 | 1 (section map)             | 0                    | HashMap of sections                                   |

---

## Relationship to Existing Decisions

| Decision                      | Relationship                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D009 (Fixed-Point Math)       | `fixed-game-math` implements D009's type library. IC's `ic-sim` depends on it.                                                                                                                                    |
| D039 (Engine Scope)           | Extraction reinforces D039's "general-purpose" identity — reusable crates are the engine's contribution to the broader ecosystem.                                                                                 |
| D050 (Workshop Cross-Project) | `workshop-core` is D050's "Workshop Core Library" extracted as a standalone permissive crate. D050's three-layer architecture (`p2p-distribute` → `workshop-core` → game integration) is the extraction boundary. |
| D051 (GPL v3 License)         | D076 operates within D051's framework. The engine stays GPL. Extracted crates contain no GPL-encumbered code and live in separate repos. D051's `cargo-deny` enforcement verifies the boundary.                   |
| D074 (Unified Server Binary)  | `p2p-distribute` extracts the BT-compatible P2P engine that D074's Workshop seeder capability uses.                                                                                                               |

---

## Alternatives Considered

**Do nothing (keep everything GPL):** Rejected. Limits community adoption, prevents cross-project reuse (D050's future projects may not be GPL), and misses the opportunity to contribute broadly useful Rust crates to the ecosystem.

**Extract later (after IC ships):** Rejected. Extracting from an existing GPL codebase requires proving clean-room provenance. Extracting before GPL code exists (Tier 1) is legally trivial. The user's directive: "The best we can achieve from day one, the better."

**MIT-only (no Apache-2.0):** Rejected. MIT OR Apache-2.0 dual licensing is the Rust ecosystem standard (used by `serde`, `tokio`, `bevy`, and most major crates). Apache-2.0 adds patent protection. Dual licensing lets downstream users choose whichever fits their project.

**Apache-2.0 only:** Rejected. Some projects (notably GPLv2-only, though rare in Rust) cannot use Apache-2.0. MIT OR Apache-2.0 maximizes compatibility.

**Foundation/umbrella org:** Rejected for now. A `cnc-community` or `game-tools` GitHub org adds governance overhead. Starting under the author's personal org is simpler. Can migrate later if the crates gain enough community traction to warrant shared governance.

---

## Phase Placement

| Tier    | Phase                     | Milestone | What Happens                                                                                                                                                                                 |
| ------- | ------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier 1  | Phase 0 (Months 1–3)      | `M0`/`M1` | Create repos for `cnc-formats`, `fixed-game-math`, `deterministic-rng`. Implement core APIs. Publish to crates.io. IC monorepo's `ra-formats` and `ic-sim` depend on them from first commit. |
| Tier 2a | Phase 2 (Months 6–12)     | `M2`      | Extract `glicko2-rts` when D055 ranking implementation stabilizes.                                                                                                                           |
| Tier 2b | Phase 5 (Months 20–26)    | `M5`      | Extract `lockstep-relay` when D007 relay implementation stabilizes.                                                                                                                          |
| Tier 3  | Phase 5–6a (Months 20–30) | `M8`/`M9` | Extract `workshop-core`, `lua-sandbox`, `p2p-distribute` per D050's timeline.                                                                                                                |

---

## Rust Types (Key Interfaces)

Full type signatures for all extracted crates are in the [Rust Types sub-page](D076/D076-rust-types.md). Key types by crate:

- **`cnc-formats`:** `MixArchive`, `ShpFile`, `PalFile`, `TmpFile`, `AudFile`, `VqaFile`, `MegArchive` (behind `meg`), `ConvertFormat` enum, `ConvertArgs`. Clean-room encoders: `lcw::compress()`, `shp::encode_frames()`, `aud::encode_adpcm()`, `aud::build_aud()`, `pal::encode()`. VQA codec: `vqa::decode::{VqaFrame, VqaAudio}`, `vqa::encode::{VqaEncodeParams, VqaAudioInput, encode_vqa()}`. MIDI (behind `midi`): `MidFile`, `mid::parse()`, `mid::write()`, `mid::render_to_pcm()`, `mid::render_to_wav()`. ADL (behind `adl`): `AdlFile`, `adl::parse()`. XMI (behind `xmi`): `XmiFile`, `xmi::parse()`, `xmi::to_mid()`.
- **`fixed-game-math`:** `Fixed<N>`, `WorldPos`, `WAngle`, trig functions
- **`deterministic-rng`:** `GameRng`, range/weighted/shuffle/damage_spread
- **`glicko2-rts`:** `Rating`, `MatchResult`, `update_ratings()`
- **`lockstep-relay`:** `RelayCore<T>`, `RelayConfig`, `RelayEvent`
- **`workshop-core`:** `Package`, `Manifest`, `Registry`, `PackageStore` trait

---

## Verification Checklist

- [ ] Each Tier 1 crate repo exists before IC monorepo's first `git commit`
- [ ] IC's `Cargo.toml` lists extracted crates as `[dependencies]`, not `[workspace.members]`
- [ ] `cargo-deny` in each extracted repo rejects any GPL dependency
- [ ] `cargo-deny` in IC monorepo permits GPL but verifies extracted crate versions match
- [ ] `CONTRIBUTING.md` in each extracted repo states the no-GPL-cross-pollination rule
- [ ] `LICENSE-MIT` and `LICENSE-APACHE` exist in each extracted repo
- [ ] `ra-formats` in IC monorepo wraps `cnc-formats` (with `miniyaml` feature enabled) and adds EA-derived code (GPL boundary is `ra-formats`, not the standalone crate)
- [ ] Cross-platform CI (x86, ARM, WASM) runs for determinism-critical crates
