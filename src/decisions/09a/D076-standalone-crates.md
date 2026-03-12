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

| Crate Name          | Purpose                                                                                                                                                                                                | Why Standalone                                                                                                                                                                                                                                                                                                                                                                                                           | IC Consumer                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `cnc-formats`       | Parse all C&C formats: binary (`.mix`, `.shp`, `.tmp`, `.pal`, `.aud`, `.vqa`, `.wsa`, `.fnt`), `.ini` rules, MiniYAML (feature-gated), and Petroglyph `.meg`/`.pgm` archives (feature-gated, Phase 2) | Every C&C tool, viewer, converter, and modding project needs format parsing. Currently scattered across C/C#/Python community tools with no canonical Rust implementation. `.ini` is a classic C&C format; MiniYAML is OpenRA-originated but de facto community standard. `.meg` is Petroglyph's archive format (Empire at War / C&C Remastered lineage) — clean-roomable from community docs (OS Big Editor, OpenSage). | `ra-formats` (IC's game-specific layer wraps `cnc-formats` with IC asset pipeline integration) |
| `fixed-game-math`   | Deterministic fixed-point arithmetic: `Fixed<N>`, trig tables, CORDIC atan2, Newton sqrt, modifier chains                                                                                              | Any deterministic game (lockstep RTS, fighting game, physics sim) needs platform-identical math. No good Rust crate exists with game-focused API.                                                                                                                                                                                                                                                                        | `ic-sim`, `ic-protocol`                                                                        |
| `deterministic-rng` | Seedable, platform-identical PRNG with game-oriented API: range sampling, weighted selection, shuffle, damage spread                                                                                   | Same audience as `fixed-game-math`. Must produce identical sequences on all platforms (x86/ARM/WASM).                                                                                                                                                                                                                                                                                                                    | `ic-sim`                                                                                       |

**Naming note:** The IC crate currently called `ra-formats` stays in the IC monorepo as GPL code because it references EA's GPL-licensed C&C source for struct definitions and lookup tables (D051 rationale #2). `cnc-formats` is the *new* permissive crate containing only clean-room format parsing with no EA-derived code. `ra-formats` becomes a thin wrapper that adds EA-specific details (compression tables, game-specific constants) on top.

**Feature-gated MiniYAML:** `.ini` parsing is always available (it's a classic C&C format). MiniYAML parsing is behind `features = { miniyaml = [] }` because it's OpenRA-specific — a `.mix` extractor tool or asset viewer doesn't need it. The `cnc-formats` CLI binary ships in the same repo; its `convert` subcommand uses `--from`/`--to` flags for extensible format dispatch: `--to` is always required, `--from` is optional (auto-detected from file extension when unambiguous, required when reading from stdin). The `ConvertFormat` enum defines available formats with per-variant `#[cfg]` feature gating — `Miniyaml` requires the `miniyaml` feature, `Yaml` is always available. Unsupported `(from, to)` pairs print available conversions. Current conversion: `--from miniyaml --to yaml`. `validate` and `inspect` work on all formats unconditionally. `ra-formats` depends on `cnc-formats` with `miniyaml` enabled.

**Encrypted `.mix` handling:** Extended `.mix` files use Blowfish-encrypted header indices with a hardcoded symmetric key. Both the Blowfish algorithm (public domain) and the key derivation are publicly documented on ModEnc and implemented in community tools (XCC, OpenRA). This is clean-room knowledge — `cnc-formats` handles encrypted `.mix` archives directly using the `blowfish` RustCrypto crate (MIT/Apache-2.0). No EA-derived code is needed.

**`.mix` write support split:** `cnc-formats pack` (Phase 6a) creates standard `.mix` archives — CRC hash table generation, file offset index, unencrypted format. `ra-formats` extends this with encrypted `.mix` creation (Blowfish key derivation + SHA-1 body digest) for modders who need archives matching the original game's encrypted format. The typical community use case (mod distribution) uses unencrypted `.mix` — only replication of original game archives requires encryption.

**Remastered format split:** Remastered Collection formats divide across the crate boundary by clean-room feasibility:

- **`.meg` / `.pgm` (archive formats) → `cnc-formats` (Phase 2, behind `meg` feature flag).** Petroglyph's MEG archive format is documented by community tools (OS Big Editor, OpenSage) with sufficient detail for clean-room implementation — no EA-derived code needed. `.pgm` is a MEG file with a different extension. `cnc-formats` gains a read-only `MegArchive` parser in Phase 2, at which point the CLI `extract`, `list`, and `check` subcommands support MEG archives alongside `.mix`. This gives the broader Petroglyph/Empire at War modding community a permissively-licensed MEG parser. `ra-formats` depends on `cnc-formats` with the `meg` feature enabled.
- **`.mtd` (MegaTexture) and `.meta` (megasheet layout) → `ra-formats` only.** `.mtd` is Petroglyph-proprietary with no community documentation outside the GPL DLL source. `.meta` is a simple JSON format (per-frame sprite geometry), parseable with `serde_json`, but its semantics (chroma-key → remap conversion, megasheet splitting pipeline) are C&C-Remastered-specific and defined by the GPL DLL — not general-purpose.
- **`.tga`, `.dds`, `.wav` → existing Rust crates.** Standard formats handled by `image`, `ddsfile`, and `hound` respectively. No `cnc-formats` involvement needed.
- **`.bk2` (Bink Video 2) → `ra-formats` / `ic` CLI.** Proprietary RAD Game Tools codec; converted to WebM at import time (see D075). Not a candidate for `cnc-formats`.

**CLI subcommand roadmap:**

| Subcommand    | Phase | Description                                                                                                                                                                                                                                                                                 |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate`    | 0     | Structural correctness check for any supported format                                                                                                                                                                                                                                       |
| `inspect`     | 0     | Dump contents and metadata (`--json` for machine-readable output)                                                                                                                                                                                                                           |
| `convert`     | 0     | Extensible format conversion via `--from`/`--to` flags. `--to` required, `--from` auto-detected from extension. Current: `--from miniyaml --to yaml` (behind `miniyaml` feature). Adding future conversions is a new `ConvertFormat` enum variant + match arm — no subcommand-level change. |
| `extract`     | 1     | Decompose `.mix` archives to individual files (`.meg`/`.pgm` support added Phase 2 via `meg` feature)                                                                                                                                                                                       |
| `list`        | 1     | Quick archive inventory — filenames, sizes, types (`.meg`/`.pgm` support added Phase 2 via `meg` feature)                                                                                                                                                                                   |
| `check`       | 2     | Deep integrity verification — CRC validation, truncation detection                                                                                                                                                                                                                          |
| `diff`        | 2     | Format-aware structural comparison of two files of the same type                                                                                                                                                                                                                            |
| `fingerprint` | 2     | SHA-256 canonical content hash (parsed representation, not raw bytes)                                                                                                                                                                                                                       |
| `pack`        | 6a    | Create `.mix` archives from directory (inverse of `extract`)                                                                                                                                                                                                                                |

All subcommands are game-agnostic. Semantic validation (missing prerequisites, circular inheritance in rule files) belongs in `ic mod lint`, not in `cnc-formats`.

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

3. **Feature flags for ecosystem integration.** Example for `fixed-game-math`:
   ```toml
   [features]
   default = ["std"]
   std = []
   serde = ["dep:serde"]
   bevy = ["dep:bevy_reflect"]
   ```

4. **Comprehensive documentation and examples.** Standalone crates must be usable without reading IC's design docs. README, rustdoc, and examples should be self-contained.

5. **Property-based testing.** Determinism-critical crates (`fixed-game-math`, `deterministic-rng`) include cross-platform property tests that verify identical output on x86, ARM, and WASM targets.

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

These are the public-facing type signatures that define extraction boundaries. IC wraps or extends these types; it never exposes them directly to players.

```rust
// cnc-formats — clean-room C&C binary format parsing
pub struct MixArchive { /* ... */ }
pub struct ShpFile { /* ... */ }
pub struct PalFile { /* ... */ }
pub struct TmpFile { /* ... */ }
pub struct AudFile { /* ... */ }
pub struct VqaFile { /* ... */ }
pub trait FormatReader: Read + Seek {
    type Output;
    fn read_from(reader: &mut Self) -> Result<Self::Output, FormatError>;
}

// cnc-formats — MEG/PGM archive parsing (Phase 2, behind `meg` feature flag)
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

// cnc-formats CLI — extensible format conversion via --from/--to flags
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
}

/// `cnc-formats convert` subcommand arguments.
#[derive(clap::Args)]
pub struct ConvertArgs {
    /// Source format (auto-detected from file extension when unambiguous;
    /// required when reading from stdin).
    #[arg(long)]
    pub from: Option<ConvertFormat>,
    /// Target format (always required).
    #[arg(long)]
    pub to: ConvertFormat,
    /// Input file path (omit or use `-` for stdin).
    pub input: Option<PathBuf>,
    /// Output file path (omit for stdout).
    #[arg(short, long)]
    pub output: Option<PathBuf>,
}

/// Dispatch: match on `(from, to)` pairs. Unsupported pairs print
/// available conversions and exit with a non-zero status code.
fn convert(from: ConvertFormat, to: ConvertFormat, input: &[u8]) -> Result<Vec<u8>> {
    match (from, to) {
        #[cfg(feature = "miniyaml")]
        (ConvertFormat::Miniyaml, ConvertFormat::Yaml) => miniyaml_to_yaml(input),
        // Future: (ConvertFormat::Ini, ConvertFormat::Yaml) => ini_to_yaml(input),
        (f, t) => Err(UnsupportedConversion { from: f, to: t }),
    }
}

// fixed-game-math — deterministic fixed-point arithmetic
pub struct Fixed<const FRAC_BITS: u32>(i64);
pub struct WorldPos { pub x: Fixed<10>, pub y: Fixed<10>, pub z: Fixed<10> }
pub struct WAngle(i32);  // 0..1024 = 0°..360°

impl Fixed<FRAC_BITS> {
    pub const fn from_int(v: i32) -> Self;
    pub fn sin(angle: WAngle) -> Self;  // table lookup
    pub fn cos(angle: WAngle) -> Self;
    pub fn atan2(y: Self, x: Self) -> WAngle;  // CORDIC
    pub fn sqrt(self) -> Self;  // Newton's method
}

// deterministic-rng — seedable, platform-identical PRNG
pub struct GameRng { /* xoshiro256** or similar */ }

impl GameRng {
    pub fn from_seed(seed: u64) -> Self;
    pub fn next_u32(&mut self) -> u32;
    pub fn range(&mut self, min: i32, max: i32) -> i32;
    pub fn weighted_select<T>(&mut self, items: &[(T, u32)]) -> &T;
    pub fn shuffle<T>(&mut self, slice: &mut [T]);
    pub fn damage_spread(&mut self, base: i32, spread_pct: u32) -> i32;
}

// glicko2-rts — rating system with RTS adaptations
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

// lockstep-relay — game-agnostic relay core
pub struct RelayCore<T: OrderCodec> { /* ... */ }

impl<T: OrderCodec> RelayCore<T> {
    pub fn new(config: RelayConfig) -> Self;
    pub fn tick(&mut self) -> Vec<RelayEvent<T>>;
    pub fn submit_order(&mut self, player: PlayerId, order: T);
    pub fn player_connected(&mut self, player: PlayerId);
    pub fn player_disconnected(&mut self, player: PlayerId);
}

// workshop-core — engine-agnostic mod registry (D050)
pub struct Package { /* ... */ }
pub struct Manifest { /* ... */ }
pub struct Registry { /* ... */ }

pub trait PackageStore {
    fn publish(&self, package: &Package) -> Result<(), StoreError>;
    fn fetch(&self, id: &PackageId, version: &VersionReq) -> Result<Package, StoreError>;
    fn resolve(&self, deps: &[Dependency]) -> Result<Vec<Package>, ResolveError>;
}
```

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
