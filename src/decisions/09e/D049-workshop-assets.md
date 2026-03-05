## D049: Workshop Asset Formats & Distribution — Bevy-Native Canonical, P2P Delivery

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Multi-phase (Workshop foundation + distribution + package tooling)
- **Canonical for:** Workshop canonical asset format recommendations and P2P package distribution strategy
- **Scope:** Workshop package format/distribution, client download/install pipeline, format recommendations for IC modules, HTTP fallback behavior
- **Decision:** The Workshop recommends **modern Bevy-native formats** (OGG/PNG/WAV/WebM/KTX2/GLTF) as canonical for new content while fully supporting legacy C&C formats for compatibility; package delivery uses **P2P (BitTorrent/WebTorrent) with HTTP fallback**.
- **Why:** Lower hosting cost, better Bevy integration/tooling, safer/more mature parsers for untrusted content, and lower friction for new creators using standard tools.
- **Non-goals:** Dropping legacy C&C format support; making Workshop format choices universal for all future engines/projects consuming the Workshop core library.
- **Invariants preserved:** Full resource compatibility for existing C&C assets remains intact; Workshop protocol/package concepts are separable from IC-specific format preferences (D050).
- **Defaults / UX behavior:** New content creators are guided toward modern formats; legacy assets still load and publish without forced conversion.
- **Compatibility / Export impact:** Legacy formats remain important for OpenRA/RA1 workflows and D040 conversion pipelines; canonical Workshop recommendations do not invalidate export targets.
- **Security / Trust impact:** Preference for widely audited decoders is an explicit defense-in-depth choice for untrusted Workshop content.
- **Performance / Ops impact:** P2P delivery reduces CDN cost and scales community distribution; modern formats integrate better with Bevy runtime loading paths.
- **Public interfaces / types / commands:** `.icpkg` (IC-specific package wrapper), Workshop P2P/HTTP delivery strategy, `ic mod build/publish` workflow (as referenced across modding docs)
- **Affected docs:** `src/04-MODDING.md`, `src/05-FORMATS.md`, `src/decisions/09c-modding.md`, `src/decisions/09f-tools.md`
- **Revision note summary:** None
- **Keywords:** workshop formats, p2p delivery, bittorrent, webtorrent, bevy-native assets, png ogg webm, legacy c&c compatibility, icpkg

**Decision:** The Workshop's canonical asset formats are **Bevy-native modern formats** (OGG, PNG, WAV, WebM, KTX2, GLTF). C&C legacy formats (.aud, .shp, .pal, .vqa, .mix) are fully supported for backward compatibility but are not the recommended distribution format for new content. Workshop delivery uses **peer-to-peer distribution** (BitTorrent/WebTorrent protocol) with HTTP fallback, reducing hosting costs from CDN-level to a lightweight tracker.

> **Note (D050):** The format recommendations in this section are **IC-specific** — they reflect Bevy's built-in asset pipeline. The Workshop's P2P distribution protocol and package format are engine-agnostic (see D050). Future projects consuming the Workshop core library will define their own format recommendations based on their engine's capabilities. The `.icpkg` extension, `ic mod` CLI commands, and `game_module` manifest fields are likewise IC-specific — the Workshop core library uses configurable equivalents.

### The Format Problem

The engine serves two audiences with conflicting format needs:

1. **Legacy community:** Thousands of existing .shp, .aud, .mix, .pal assets. OpenRA mods. Original game files. These must load.
2. **New content creators:** Making sprites in Aseprite/Photoshop, recording audio in Audacity/Reaper, editing video in DaVinci Resolve. These tools export PNG, OGG, WAV, WebM — not .shp or .aud.

Forcing new creators to encode into C&C formats creates unnecessary friction. Forcing legacy content through format converters before it can load breaks the "community's existing work is sacred" invariant. The answer is: **accept both, recommend modern.**

### Canonical Format Recommendations

| Asset Type      | Workshop Format (new content)     | Legacy Support (existing) | Runtime Decode         | Rationale                                                                                                                                                                                         |
| --------------- | --------------------------------- | ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Music**       | OGG Vorbis (128–320kbps)          | .aud (ra-formats decode)  | PCM via rodio          | Bevy default feature, excellent quality/size ratio, open/patent-free, WASM-safe. OGG at 192kbps ≈ 1.4MB/min vs .aud at ~0.5MB/min but dramatically higher quality (stereo, 44.1kHz vs mono 22kHz) |
| **SFX**         | WAV (16-bit PCM) or OGG           | .aud (ra-formats decode)  | PCM via rodio          | WAV = zero decode latency for gameplay-critical sounds (weapon fire, explosions). OGG for larger ambient/UI sounds where decode latency is acceptable                                             |
| **Voice**       | OGG Vorbis (96–128kbps)           | .aud (ra-formats decode)  | PCM via rodio          | Speech compresses well. OGG at 96kbps is transparent for voice. EVA packs with 200+ lines stay under 30MB                                                                                         |
| **Sprites**     | PNG (RGBA, indexed, or truecolor) | .shp+.pal (ra-formats)    | GPU texture via Bevy   | Bevy-native via `image` crate. Lossless. Every art tool exports it. Palette-indexed PNG preserves classic aesthetic. HD packs use truecolor RGBA                                                  |
| **HD Textures** | KTX2 (GPU-compressed: BC7/ASTC)   | N/A                       | Zero-cost GPU upload   | Bevy-native. No decode — GPU reads directly. Best runtime performance. `ic mod build` can batch-convert PNG→KTX2 for release builds                                                               |
| **Terrain**     | PNG tiles (indexed or RGBA)       | .tmp+.pal (ra-formats)    | GPU texture            | Same as sprites. Theater tilesets are sprite sheets                                                                                                                                               |
| **Cutscenes**   | WebM (VP9, 720p–1080p)            | .vqa (ra-formats decode)  | Frame→texture (custom) | Open, royalty-free, browser-compatible (WASM target). VP9 achieves ~5MB/min at 720p. Neither WebM nor VQA is Bevy-native — both need custom decode, so no advantage to VQA here                   |
| **3D Models**   | GLTF/GLB                          | N/A (future: .vxl)        | Bevy mesh              | Bevy's native 3D format. Community 3D mods (D048) use this                                                                                                                                        |
| **Palettes**    | .pal (768 bytes) or PNG strip     | .pal (ra-formats)         | Palette texture        | .pal is already tiny and universal in the C&C community. No reason to change. PNG strip is an alternative for tools that don't understand .pal                                                    |
| **Maps**        | IC YAML (native)                  | .oramap (ZIP+MiniYAML)    | ECS world state        | Already designed (D025, D026)                                                                                                                                                                     |

### Why Modern Formats as Default

**Bevy integration:** OGG, WAV, PNG, KTX2, and GLTF load through Bevy's built-in asset pipeline with zero custom code. Every Bevy feature — hot-reload, asset dependencies, async loading, platform abstraction — works automatically. C&C formats require custom `AssetLoader` implementations in ra-formats with manual integration into Bevy's pipeline.

**Security:** OGG (lewton/rodio), PNG (image crate), and WebM decoders in the Rust ecosystem have been fuzz-tested and used in production by thousands of projects. Browser vendors (Chrome, Firefox, Safari) have security-audited these formats for decades. Our .aud/.shp/.vqa parsers in ra-formats are custom code that has never been independently security-audited. For Workshop content downloaded from untrusted sources, mature parsers with established security track records are strictly safer. C&C format parsers use `BoundedReader` (see `06-SECURITY.md`), but defense in depth favors formats with deeper audit history.

**Multi-game:** Non-C&C game modules (D039) won't use .shp or .aud at all. A tower defense mod, a naval RTS, a Dune-inspired game — these ship PNG sprites and OGG audio. The Workshop serves all game modules, not just the C&C family.

**Tooling:** Every image editor saves PNG. Every DAW exports WAV/OGG. Every video editor exports WebM/MP4. Nobody's toolchain outputs .aud or .shp. Requiring C&C formats forces creators through a conversion step before they can publish — unnecessary friction.

**WASM/browser:** OGG and PNG work in Bevy's WASM builds out of the box. C&C formats need custom WASM decoders compiled into the browser bundle.

**Storage efficiency comparison:**

| Content                        | C&C Format                      | Modern Format                        | Notes                                                                       |
| ------------------------------ | ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| 3min music track               | .aud: ~1.5MB (22kHz mono ADPCM) | OGG: ~2.8MB (44.1kHz stereo 128kbps) | OGG is 2× larger but dramatically higher quality. At mono 22kHz OGG: ~0.7MB |
| Full soundtrack (30 tracks)    | .aud: ~45MB                     | OGG 128kbps: ~84MB                   | Acceptable for modern bandwidth/storage                                     |
| Unit sprite sheet (200 frames) | .shp+.pal: ~50KB                | PNG indexed: ~80KB                   | PNG slightly larger but universal tooling                                   |
| HD sprite sheet (200 frames)   | N/A (.shp can't do HD)          | PNG RGBA: ~500KB                     | Only modern format option for HD content                                    |
| 3min cutscene (720p)           | .vqa: ~15MB                     | WebM VP9: ~15MB                      | Comparable. WebM quality is higher at same bitrate                          |

Modern formats are somewhat larger for legacy-quality content but the difference is small relative to modern storage and bandwidth. For HD content, modern formats are the only option.

### The Conversion Escape Hatch

The Asset Studio (D040) converts in both directions:
- **Import:** .aud/.shp/.vqa/.pal → OGG/PNG/WebM/.pal (for modders working with legacy assets)
- **Export:** OGG/PNG/WebM → .aud/.shp/.vqa (for modders targeting OpenRA compatibility or classic aesthetic)
- **Batch convert:** `ic mod convert --to-modern` or `ic mod convert --to-classic` converts entire mod directories

The engine loads both format families at runtime. `ra-formats` decoders handle legacy formats; Bevy's built-in loaders handle modern formats. No manual conversion is ever required — only recommended for new Workshop publications.


---

## Sub-Pages

| Section                      | Topic                                                                                                                                                   | File                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Package & Profiles           | Workshop package format (.icpkg) + player configuration profiles                                                                                        | [D049-package-profiles.md](D049/D049-package-profiles.md)                         |
| P2P Distribution             | BitTorrent/WebTorrent distribution engine, config, health checks, content lifecycle, Phase 0-3 bootstrap                                                | [D049-p2p-distribution.md](D049/D049-p2p-distribution.md)                         |
| P2P Policy & Admin           | P2P continued + freeware/legacy content policy + media language metadata + Workshop operator/admin panel + Rust impl + rationale + alternatives + phase | [D049-p2p-policy-admin.md](D049/D049-p2p-policy-admin.md)                         |
| Content Channels Integration | IC-specific content channel usage: balance patches, server config, lobby content pinning, D062 fingerprint integration                                  | [D049-content-channels-integration.md](D049/D049-content-channels-integration.md) |
| Replay Sharing via P2P       | Match ID sharing, Workshop replay collections, .icrep piece alignment, privacy, relay retention                                                         | [D049-replay-sharing.md](D049/D049-replay-sharing.md)                             |
