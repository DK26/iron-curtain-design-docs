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

### Workshop Package Format (.icpkg)

Workshop packages are **ZIP archives** with a standardized manifest — the same pattern as `.oramap` but generalized to any resource type:

```
my-hd-sprites-1.2.0.icpkg          # ZIP archive
├── manifest.yaml                    # Package metadata (required)
├── README.md                        # Long description (optional)
├── CHANGELOG.md                     # Version history (optional)
├── preview.png                      # Thumbnail, max 512×512 (required for Workshop listing)
└── assets/                          # Actual content files
    ├── sprites/
    │   ├── infantry-allied.png
    │   └── vehicles-soviet.png
    └── palettes/
        └── temperate-hd.pal
```

**manifest.yaml:**
```yaml
package:
  name: "hd-allied-sprites"
  publisher: "community-hd-project"
  version: "1.2.0"
  license: "CC-BY-SA-4.0"
  description: "HD sprite replacements for Allied infantry and vehicles"
  category: sprites
  game_module: ra1
  engine_version: "^0.3.0"

  # Per-file integrity (verified on install)
  files:
    sprites/infantry-allied.png:
      sha256: "a1b2c3d4..."
      size: 524288
    sprites/vehicles-soviet.png:
      sha256: "e5f6a7b8..."
      size: 1048576

  dependencies:
    - id: "community-hd-project/base-palettes"
      version: "^1.0"

  # P2P distribution metadata (added by Workshop server on publish)
  distribution:
    sha256: "full-package-hash..."        # Hash of entire .icpkg
    size: 1572864                          # Total package size in bytes
    infohash: "btih:abc123def..."          # BitTorrent info hash (for P2P)
```

ZIP was chosen over tar.gz because: random access to individual files (no full decompression to read manifest.yaml), universal tooling, `.oramap` precedent, and Rust's `zip` crate is mature.

**VPK-style indexed manifest (from Valve Source Engine):** The `.icpkg` manifest (manifest.yaml) is placed at the **start** of the archive, not at the end. This follows Valve's VPK (Valve Pak) format design, where the directory/index appears at the beginning of the file — allowing tools to read metadata, file listings, and dependencies without downloading or decompressing the entire package. For Workshop browsing, the tracker can serve just the first ~4KB of a package (the manifest) to populate search results, preview images, and dependency resolution without fetching the full archive. ZIP's central directory is at the *end* of the file, so ZIP-based `.icpkg` files include a redundant manifest at offset 0 (outside the ZIP structure, in a fixed-size header) for fast remote reads, with the canonical copy inside the ZIP for standard tooling compatibility. See `research/valve-github-analysis.md` § 6.4.

**Content-addressed asset deduplication (from Valve Fossilize):** Workshop asset storage uses **content-addressed hashing** for deduplication — each file is identified by `SHA-256(content)`, not by path or name. When a modder publishes a new version that changes only 2 of 50 files, only the 2 changed files are uploaded; the remaining 48 reference existing content hashes already in the Workshop. This reduces upload size, storage cost, and download time for updates. The pattern comes from Fossilize's content hashing (FOSS_BLOB_HASH = SHA-256 of serialized data, see `research/valve-github-analysis.md` § 3.2) and is also used by Git (content-addressed object store), Docker (layer deduplication), and IPFS (CID-based storage). The per-file SHA-256 hashes already present in manifest.yaml serve as content addresses — no additional metadata needed.

**Local cache CAS deduplication:** The same content-addressed pattern extends to the player's local `workshop/` directory. Instead of storing raw `.icpkg` ZIP files — where 10 mods bundling the same HD sprite pack each contain a separate copy — the Workshop client unpacks downloaded packages into a **content-addressed blob store** (`workshop/blobs/<sha256-prefix>/<sha256>`). Each installed package's manifest maps logical file paths to blob hashes; the package directory contains only symlinks or lightweight references to the shared blob store. Benefits:

- **Disk savings:** Popular shared resources (HD sprite packs, sound effect libraries, font packs) stored once regardless of how many mods depend on them. Ten mods using the same 200MB HD pack → 200MB stored, not 2GB.
- **Faster installs:** When installing a new mod, the client checks blob hashes against the local store before downloading. Files already present (from other mods) are skipped — only genuinely new content is fetched.
- **Atomic updates:** Updating a mod replaces only changed blob references. Unchanged files (same hash) are already in the store.
- **Garbage collection:** `ic mod gc` removes blobs no longer referenced by any installed package. Runs automatically during Workshop cleanup prompts (D030 budget system).

```
workshop/
├── cache.db              # Package metadata, manifests, dependency graph
├── blobs/                # Content-addressed blob store
│   ├── a1/a1b2c3...     # SHA-256 hash → file content
│   ├── d4/d4e5f6...
│   └── ...
└── packages/             # Per-package manifests (references into blobs/)
    ├── alice--hd-sprites-2.0.0/
    │   └── manifest.yaml # Maps logical paths → blob hashes
    └── bob--desert-map-1.1.0/
        └── manifest.yaml
```

The local CAS store is an optimization that ships alongside the full Workshop in Phase 6a. The initial Workshop (Phase 4–5) can use simpler `.icpkg`-on-disk storage and upgrade to CAS when the full Workshop matures — the manifest.yaml already contains per-file SHA-256 hashes, so the data model is forward-compatible.

### Workshop Player Configuration Profiles (Controls / Accessibility / HUD Presets)

Workshop packages also support an optional **player configuration profile** resource type for sharing non-authoritative client preferences — especially control layouts and accessibility presets.

**Examples:**
- `player-config` package with a `Modern RTS (KBM)` variant tuned for left-handed mouse users
- Steam Deck control profile (trackpad cursor + gyro precision + PTT on shoulder)
- accessibility preset bundle (larger UI targets, sticky modifiers, reduced motion, high-contrast HUD)
- touch HUD layout preset (handedness + command rail preferences + thresholds)

**Why this fits D049:** These profiles are tiny, versioned, reviewable manifests/data files distributed through the same Workshop identity, trust, and update systems as mods and media packs. Sharing them through Workshop reduces friction for community onboarding ("pro caster layout", "tournament observer profile", "new-player-friendly touch controls") without introducing a separate configuration-sharing platform.

**Hard safety boundaries (non-negotiable):**
- No secrets/credentials (tokens, API keys, account auth, recovery phrases)
- No absolute local file paths or device identifiers
- No executable code, scripts, macros, or automation payloads
- No hidden application on install — applying a config profile always requires user confirmation with a diff preview

**Manifest guidance (IC-specific package category):**
- `category: player-config`
- `game_module`: optional (many profiles are game-agnostic)
- `config_scope[]`: one or more of `controls`, `touch_layout`, `accessibility`, `ui_layout`, `camera_qol`
- `compatibility` metadata for controls profiles:
  - semantic action catalog version (D065)
  - target input class (`desktop_kbm`, `gamepad`, `deck`, `touch_phone`, `touch_tablet`)
  - optional `screen_class` hints and required features (gyro, rear buttons, command rail)

**Example `player-config` package (`manifest.yaml`):**
```yaml
package:
  name: "deck-gyro-competitive-profile"
  publisher: "community-deck-lab"
  version: "1.0.0"
  license: "CC-BY-4.0"
  description: "Steam Deck control profile: right-trackpad cursor, gyro precision, L1 push-to-talk, spectator-friendly quick controls"
  category: player-config
  # game_module is optional for generic profiles; omit unless module-specific
  engine_version: "^0.6.0"

  tags:
    - controls
    - steam-deck
    - accessibility-friendly
    - spectator

  config_scope:
    - controls
    - accessibility
    - camera_qol

  compatibility:
    semantic_action_catalog_version: "d065-input-actions-v1"
    target_input_class: "deck"
    screen_class: "Desktop"
    required_features:
      - right_trackpad
      - gyro
    optional_features:
      - rear_buttons
    tested_profiles:
      - "Steam Deck Default@v1"
    notes: "Falls back cleanly if gyro is disabled; keeps all actions reachable without gyro."

  # Per-file integrity (verified on install/apply download)
  files:
    profiles/controls.deck.yaml:
      sha256: "a1b2c3d4..."
      size: 8124
    profiles/accessibility.deck.yaml:
      sha256: "b2c3d4e5..."
      size: 1240
    profiles/camera_qol.yaml:
      sha256: "c3d4e5f6..."
      size: 512

  # Server-added on publish (same as other .icpkg categories)
  distribution:
    sha256: "full-package-hash..."
    size: 15642
    infohash: "btih:abc123def..."
```

**Example payload file (`profiles/controls.deck.yaml`, controls-only diff):**
```yaml
profile:
  base: "Steam Deck Default@v1"
  profile_name: "Deck Gyro Competitive"
  target_input_class: deck
  semantic_action_catalog_version: "d065-input-actions-v1"

bindings:
  voice_ptt:
    primary: { kind: gamepad_button, button: l1, mode: hold }
  controls_quick_reference:
    primary: { kind: gamepad_button, button: l5, mode: hold }
  camera_bookmark_overlay:
    primary: { kind: gamepad_button, button: r5, mode: hold }
  ping_wheel:
    primary: { kind: gamepad_button, button: r3, mode: hold }

axes:
  cursor:
    source: right_trackpad
    sensitivity: 1.1
    acceleration: 0.2
  gyro_precision:
    enabled: true
    activate_on: l2_hold
    sensitivity: 0.85

radials:
  command_radial:
    trigger: y_hold
    first_ring:
      - attack_move
      - guard
      - force_action
      - rally_point
      - stop
      - deploy
```

**Install/apply UX rules:**
- Installing a `player-config` package does **not** auto-apply it
- Player sees an **Apply Profile** sheet with:
  - target device/profile class
  - scopes included
  - changed actions/settings summary
  - conflicts with current bindings (if any)
- Apply can be partial (e.g., controls only, accessibility only) to avoid clobbering unrelated preferences
- `Reset to previous profile` / rollback snapshot is created before apply

**Competitive integrity note:** Player config profiles may change bindings and client UI preferences, but they may not include automation/macro behavior. D033 and D059 competitive rules remain unchanged.

**Lobby/ranked compatibility note (D068):** `player-config` packages are **local preference resources**, not gameplay/presentation compatibility content. They are excluded from lobby/ranked fingerprint checks and must never be treated as required room resources or auto-download prerequisites for joining a match.

**Storage / distribution note:** Config profiles are typically tiny (<100 KB), so HTTP delivery is sufficient; P2P remains supported by the generic `.icpkg` pipeline but is not required for good UX.

**D070 asymmetric co-op packaging note:** `Commander & Field Ops` scenarios/templates (D070) are published as ordinary scenario/template content packages through the same D030/D049 pipeline. They do **not** receive special network/runtime privileges from Workshop packaging; role permissions, support requests, and asymmetric HUD behavior are validated at scenario/runtime layers (D038/D059/D070), not granted by package type.

### P2P Distribution (BitTorrent/WebTorrent)

> **Wire protocol specification:** For the byte-level BT wire protocol, piece picker algorithm, choking strategy, authenticated announce, WebRTC signaling, `icpkg` binary header, and DHT design, see `research/p2p-engine-protocol-design.md`.

> **P2P piece mapping:** The complete BitTorrent piece mapping for .icpkg packages — piece size, chunking, manifest-only fetch, CAS/BT interaction — is specified in `research/p2p-engine-protocol-design.md` § 10.

**The cost problem:** A popular 500MB mod downloaded 10,000 times generates 5TB of egress. At CDN rates ($0.01–0.09/GB), that's $50–450/month — per mod. For a community project sustained by donations, centralized hosting is financially unsustainable at scale. A BitTorrent tracker VPS costs $5–20/month regardless of popularity.

**The solution:** Workshop distribution uses the **BitTorrent protocol** for large packages, with HTTP direct download as fallback. The Workshop server acts as both metadata registry (SQLite, lightweight) and BitTorrent tracker (peer coordination, lightweight). Actual content transfer happens peer-to-peer between players who have the package.

**How it works:**

```
┌─────────────┐     1. Search/browse     ┌──────────────────┐
│  ic CLI /    │ ───────────────────────► │  Workshop Server │
│  In-Game     │ ◄─────────────────────── │  (metadata +     │
│  Browser     │  2. manifest.yaml +      │   tracker)       │
│              │     torrent info         │                  │
│              │                          └──────────────────┘
│              │     3. P2P download
│              │ ◄──────────────────────► Other players (peers/seeds)
│              │     (BitTorrent protocol)
│              │
│              │     4. Fallback: HTTP direct download
│              │ ◄─────────────────────── Workshop server / mirrors / seed box
└─────────────┘     5. Verify SHA-256
```

1. **Publish:** `ic mod publish` uploads .icpkg to Workshop server. Server computes SHA-256, generates torrent metadata (info hash), starts seeding the package alongside any initial seed infrastructure.
2. **Browse/Search:** Workshop server handles all metadata queries (search, dependency resolution, ratings) via the existing SQLite + FTS5 design. Lightweight.
3. **Install:** `ic mod install` fetches the manifest from the server, then downloads the .icpkg via BitTorrent from other players who have it. Falls back to HTTP direct download if no peers are available or if P2P is too slow.
4. **Seed:** Players who have downloaded a package automatically seed it to others (opt-out in settings). The more popular a resource, the faster it downloads — the opposite of CDN economics where popularity means higher cost.
5. **Verify:** SHA-256 checksum validation on the complete package, regardless of download method. BitTorrent's built-in piece-level hashing provides additional integrity during transfer.

**WebTorrent for browser builds (WASM):** Standard BitTorrent uses TCP/UDP, which browsers can't access. [WebTorrent](https://webtorrent.io/) extends the BitTorrent protocol over WebRTC, enabling browser-to-browser P2P. The Workshop server includes a WebTorrent tracker endpoint. Desktop clients and browser clients can interoperate — desktop seeds serve browser peers and vice versa through hybrid WebSocket/WebRTC bridges. **HTTP fallback is mandatory:** if WebTorrent signaling fails (signaling server down, WebRTC blocked), the client must fall back to direct HTTP download without user intervention. Multiple signaling servers are maintained for redundancy. Signaling servers only facilitate WebRTC negotiation — they never see package content, so even a compromised signaling server cannot serve tampered data (SHA-256 verification catches that).

**Tracker authentication & token rotation:** P2P tracker access uses per-session tokens tied to client authentication (Workshop credentials or anonymous session token), not static URL secrets. Tokens rotate every release cycle. Even unauthorized peers joining a swarm cannot serve corrupt data (SHA-256 + piece hashing), but token rotation limits unauthorized swarm observation and bandwidth waste. See `06-SECURITY.md` for the broader security model.

**Transport strategy by package size:**

| Package Size | Strategy                     | Rationale                                                                                   |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| < 5MB        | HTTP direct only             | P2P overhead exceeds benefit for small files. Maps, balance presets, palettes.              |
| 5–50MB       | P2P preferred, HTTP fallback | Small sprite packs, sound effect packs, script libraries. P2P helps but HTTP is acceptable. |
| > 50MB       | P2P strongly preferred       | HD resource packs, cutscene packs, full mods. P2P's cost advantage is decisive.             |

Thresholds are configurable in `settings.toml`. Players on connections where BitTorrent is throttled or blocked can force HTTP-only mode.

**D069 setup/maintenance wizard transport policy:** The installation/setup wizard (D069) and its maintenance flows reuse the same transport stack with stricter UX-oriented defaults:

- **Initial setup downloads** use `user-requested` priority (not `background`) and surface source indicators (`P2P` / `HTTP`) in progress UI.
- **Small setup assets/config packages** (including `player-config` profiles, small language packs, and tiny metadata-driven fixes) should default to **HTTP direct** per the size strategy above to avoid P2P startup overhead.
- **Large optional media packs** (cutscenes, HD assets) remain P2P-preferred with HTTP fallback, but the wizard must explain this transparently ("faster from peers when available").
- **Offline-first behavior:** if no network is available, the setup wizard completes local-only steps and defers downloadable packs instead of failing the entire flow.

**D069 repair/verify mapping:** The maintenance wizard's `Repair & Verify` actions map directly to D049 primitives:

- **Verify installed packages** → re-check `.icpkg`/blob hashes against manifests and registry metadata
- **Repair package content** → re-fetch missing/corrupt blobs/packages (HTTP or P2P based on size/policy)
- **Rebuild indexes/metadata** → rebuild local package/cache indexes from installed manifests + blob store
- **Reclaim space** → run GC over unreferenced blobs/package references (same CAS cleanup model)

Repair/verify is an IC-side content/setup operation. Store-platform binary verification (Steam/GOG) remains a separate platform responsibility and is only linked/guided from the wizard.

**Auto-download on lobby join (D030 interaction):** When joining a lobby with missing resources, the client first attempts P2P download (likely fast, since other players in the lobby are already seeding). If the lobby timer is short or P2P is slow, falls back to HTTP. The lobby UI shows download progress with source indicators (P2P/HTTP). See D052 § "In-Lobby P2P Resource Sharing" for the detailed lobby protocol, including host-as-tracker, verification against Workshop index, and security constraints.

**Gaming industry precedent:**
- **Blizzard (WoW, StarCraft 2, Diablo 3):** Used a custom P2P downloader ("Blizzard Downloader", later integrated into Battle.net) for game patches and updates from 2004–2016. Saved millions in CDN costs for multi-GB patches distributed to millions of players.
- **Wargaming (World of Tanks):** Used P2P distribution for game updates.
- **Linux distributions:** Ubuntu, Fedora, Arch all offer torrent downloads for ISOs — the standard solution for distributing large files from community infrastructure.
- **Steam Workshop:** Steam subsidizes centralized hosting from game sales revenue. We don't have that luxury — P2P is the community-sustainable alternative.

**Competitive landscape — game mod platforms:**

IC's Workshop exists in a space with several established modding platforms. None offer the combination of P2P distribution, federation, self-hosting, and in-engine integration that IC targets.

| Platform                                                              | Model                                                                                                                       | Scale                                                                           | In-game integration                                                                            | P2P | Federation / Self-host | Dependencies | Open source                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --- | ---------------------- | ------------ | ---------------------------------------------------- |
| **[Nexus Mods](https://www.nexusmods.com)**                           | Centralized web portal + Vortex mod manager. CDN distribution, throttled for free users. Revenue: premium membership + ads. | 70.7M users, 4,297 games, 21B downloads. Largest modding platform.              | None — external app (Vortex).                                                                  | ❌   | ❌                      | ❌            | Vortex client (GPL-3.0). Backend proprietary.        |
| **[mod.io](https://mod.io)**                                          | UGC middleware — embeddable SDKs (Unreal/Unity/C++), REST API, white-label UI. Revenue: B2B SaaS (free tier + enterprise).  | 2.5B downloads, 38M MAU, 332 live games. Backed by Tencent ($26M Series A).     | Yes — SDK provides in-game browsing, download, moderation. Console-certified (PS/Xbox/Switch). | ❌   | ❌                      | partial      | SDKs open (MIT/Apache). Backend/service proprietary. |
| **[Modrinth](https://modrinth.com)**                                  | Open-source mod registry. Centralized CDN. Revenue: ads + donations.                                                        | ~100K projects, millions of monthly downloads. Growing fast.                    | Through third-party launchers (Prism, etc).                                                    | ❌   | ❌                      | ✅            | Server (AGPL), API open.                             |
| **[CurseForge](https://www.curseforge.com)** (Overwolf)               | Centralized mod registry + CurseForge app. Revenue: Overwolf overlay ads.                                                   | Dominant for Minecraft, WoW, other Blizzard games.                              | CurseForge app, some launcher integrations.                                                    | ❌   | ❌                      | ✅            | ❌                                                    |
| **[Thunderstore](https://thunderstore.io)**                           | Open-source mod registry. Centralized CDN.                                                                                  | Popular for Risk of Rain 2, Lethal Company, Valheim.                            | Through r2modman manager.                                                                      | ❌   | ❌                      | ✅            | Server (AGPL-3.0).                                   |
| **Steam Workshop**                                                    | Integrated into Steam. Free hosting (subsidized by game sales revenue).                                                     | Thousands of games, billions of downloads.                                      | Deep Steam integration.                                                                        | ❌   | ❌                      | ❌            | ❌                                                    |
| **[ModDB](https://moddb.com) / [GameBanana](https://gamebanana.com)** | Web portals — manual upload/download, community features, editorial content. Legacy platforms (2001–2002).                  | ModDB: 12.5K+ mods, 108M+ downloads. GameBanana: strong in Source Engine games. | None.                                                                                          | ❌   | ❌                      | ❌            | ❌                                                    |

**Competitive landscape — P2P + Registry infrastructure:**

The game mod platforms above are all centralized. A separate set of projects tackle P2P distribution at the infrastructure level, but none target game modding specifically. See `research/p2p-federated-registry-analysis.md` for a comprehensive standalone analysis of this space and its applicability beyond IC.

| Project                                                                          | Architecture                                                                                                                                                                                                                                                                                                                                                           | Domain                                 | How it relates to IC Workshop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Uber Kraken](https://github.com/uber/kraken)** (6.6k★)                        | P2P Docker registry — custom BitTorrent-like protocol, Agent/Origin/Tracker/Build-Index. Pluggable storage (S3/GCS/HDFS).                                                                                                                                                                                                                                              | Container images (datacenter)          | Closest architectural match. Kraken's Agent/Origin/Tracker/Build-Index maps to IC's Peer/Seed-box/Tracker/Workshop-Index. IC's P2P protocol design (peer selection policy, piece request strategy, connection state machine, announce cycle, bandwidth limiting) is directly informed by Kraken's production experience — see protocol details above and `research/p2p-federated-registry-analysis.md` § "Uber Kraken — Deep Dive" for the full analysis. Key difference: Kraken is intra-datacenter (3s announce, 10Gbps links), IC is internet-scale (30s announce, residential connections).                                                                                                                                                                                                                                                                   |
| **[Dragonfly](https://github.com/dragonflyoss/dragonfly)** (3k★, CNCF Graduated) | P2P content distribution — Manager/Scheduler/Seed-Peer/Peer. Centralized evaluator-based scheduling with 4-dimensional peer scoring (`LoadQuality×0.6 + IDCAffinity×0.2 + LocationAffinity×0.1 + HostType×0.1`). DAG-based peer graph, back-to-source fallback. Persistent cache with replica management. Client rewritten in Rust (v2). Trail of Bits audited (2023). | Container images, AI models, artifacts | Same P2P-with-fallback pattern. Dragonfly's hierarchical location affinity (`country\|province\|city\|zone`), statistical bad-peer detection (three-sigma rule), capacity-aware scoring, persistent replica count, and download priority tiers are all patterns IC adapts. Key differences: Dragonfly uses centralized scheduling (IC uses BitTorrent swarm — simpler, more resilient to churn), Dragonfly is single-cluster with no cross-cluster P2P (IC is federated), Dragonfly requires K8s+Redis+MySQL (IC requires only SQLite). Dragonfly's own RFC #3713 acknowledges piece-level selection is FCFS — BitTorrent's rarest-first is already better. See `research/p2p-federated-registry-analysis.md` § "Dragonfly — CNCF P2P Distribution (Deep Dive)" for full analysis.                                                                                |
| **JFrog Artifactory P2P** (proprietary)                                          | Enterprise P2P distribution — mesh of nodes sharing cached binary artifacts within corporate networks.                                                                                                                                                                                                                                                                 | Enterprise build artifacts             | The direct inspiration for IC's repository model. JFrog added P2P because CDN costs for large binaries at scale are unsustainable — same motivation as IC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Blizzard NGDP/Agent** (proprietary)                                            | Custom P2P game patching — BitTorrent-based, CDN+P2P hybrid, integrated into Battle.net launcher.                                                                                                                                                                                                                                                                      | Game patches (WoW, SC2, Diablo)        | Closest gaming precedent. Proved P2P game content distribution works at massive scale. Proprietary, not a registry (no search/ratings/deps), not federated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Homebrew / crates.io-index**                                                   | Git-backed package indexes. CDN for actual downloads.                                                                                                                                                                                                                                                                                                                  | Software packages                      | IC's Phase 0–3 git-index is directly inspired by these. No P2P distribution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **IPFS**                                                                         | Content-addressed P2P storage — any content gets a CID, any node can pin and serve it. DHT-based discovery. Bitswap protocol for block exchange with Decision Engine and Score Ledger.                                                                                                                                                                                 | General-purpose decentralized storage  | Rejected as primary distribution protocol (too general, slow cold-content discovery, complex setup, poor game-quality UX). However, IPFS's Bitswap protocol contributes significant patterns IC adopts: EWMA peer scoring with time-decaying reputation (Score Ledger), per-peer fairness caps (`MaxOutstandingBytesPerPeer`), want-have/want-block two-phase discovery, broadcast control (target proven-useful peers), dual WAN/LAN discovery (validates IC's LAN party mode), delegated HTTP routing (validates IC's registry-as-router), server/client mode separation, and batch provider announcements (Sweep Provider). IPFS's 9-year-unresolved bandwidth limiting issue (#3065, 73 👍) proves bandwidth caps must ship day one. See `research/p2p-federated-registry-analysis.md` § "IPFS — Content-Addressed P2P Storage (Deep Dive)" for full analysis. |
| **Microsoft Delivery Optimization**                                              | Windows Update P2P — peers on the same network share update packages.                                                                                                                                                                                                                                                                                                  | OS updates                             | Proves P2P works for verified package distribution at billions-of-devices scale. Proprietary, no registry model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**What's novel about IC's combination:** No existing system — modding platform or infrastructure — combines (1) federated registry with repository types, (2) P2P distribution via BitTorrent/WebTorrent, (3) zero-infrastructure git-hosted bootstrap, (4) browser-compatible P2P via WebTorrent, (5) in-engine integration with lobby auto-download, and (6) fully open-source with self-hosting as a first-class use case. The closest architectural comparison is mod.io (embeddable SDK approach, in-game integration) but mod.io is a proprietary centralized SaaS — no P2P, no federation, no self-hosting. The closest distribution comparison is Uber Kraken (P2P registry) but it has no modding features. Each piece has strong precedent; the combination is new. The Workshop architecture is game-agnostic and could serve as a standalone platform — see the research analysis for exploration of this possibility.

**Seeding infrastructure:**

The Workshop doesn't rely solely on player altruism for seeding:

- **Workshop seed server:** A dedicated seed box (modest: a VPS with good upload bandwidth) that permanently seeds all Workshop content. This ensures new/unpopular packages are always downloadable even with zero player peers. Cost: ~$20-50/month for a VPS with 1TB+ storage and unmetered bandwidth.
- **Community seed volunteers:** Players who opt in to extended seeding (beyond just while the game is running). Similar to how Linux mirror operators volunteer bandwidth. Could be incentivized with Workshop badges/reputation (D036/D037).
- **Mirror servers (federation):** Community-hosted Workshop servers (D030 federation) also seed the content they host. Regional community servers naturally become regional seeds.
- **Lobby-optimized seeding:** When a lobby host has required mods, the game client prioritizes seeding to joining players who are downloading. The "auto-download on lobby join" flow becomes: download from lobby peers first → swarm → HTTP fallback.

**Privacy and security:**

- **IP visibility:** Standard BitTorrent exposes peer IP addresses. This is the same exposure as any multiplayer game (players already see each other's IPs or relay IPs). For privacy-sensitive users, HTTP-only mode avoids P2P IP exposure.
- **Content integrity:** SHA-256 verification on complete packages catches any tampering. BitTorrent's piece-level hashing catches corruption during transfer. Double-verified.
- **No metadata leakage:** The tracker only knows which peers have which packages (by info hash). It doesn't inspect content. Package contents are just game assets — sprites, audio, maps.
- **ISP throttling mitigation:** BitTorrent traffic can be throttled by ISPs. Mitigations: protocol encryption (standard in modern BT clients), WebSocket transport (looks like web traffic), and HTTP fallback as ultimate escape. Settings allow forcing HTTP-only mode.
- **Resource exhaustion:** Rate-limited seeding (configurable upload cap in settings). Players control how much bandwidth they donate. Default: 1MB/s upload, adjustable to 0 (leech-only, no seeding — discouraged but available).

**P2P protocol design details:**

The Workshop's P2P engine is informed by production experience from Uber Kraken (Apache 2.0, 6.6k★) and Dragonfly (Apache 2.0, CNCF Graduated). Kraken distributes 1M+ container images/day across 15K+ hosts using a custom BitTorrent-inspired protocol; Dragonfly uses centralized evaluator-based scheduling at Alibaba scale. IC adapts Kraken's connection management and Dragonfly's scoring insights for internet-scale game mod distribution. See `research/p2p-federated-registry-analysis.md` for full architectural analyses of both systems.

> **Cross-pollination with IC netcode and community infrastructure.** The Workshop P2P engine and IC's netcode infrastructure (relay server, tracking server — `03-NETCODE.md`) share deep structural parallels: federation, heartbeat/TTL, rate control, connection state machines, observability, deployment model. Patterns flow both directions — netcode's three-layer rate control and token-based liveness improve Workshop; Workshop's EWMA scoring and multi-dimensional peer evaluation improve relay server quality tracking. A full cross-pollination analysis (including shared infrastructure opportunities: unified server binary, federation library, auth/identity layer) is in `research/p2p-federated-registry-analysis.md` § "Netcode ↔ Workshop Cross-Pollination." Additional cross-pollination with D052/D053 (community servers, player profiles, trust-based filtering) is catalogued in D052 § "Cross-Pollination" — highlights include: two-key architecture for index signing and publisher identity, trust-based source filtering, server-side validation as a shared invariant, and trust-verified peer selection scoring.

*Peer selection policy (tracker-side):* The tracker returns a sorted peer list on each announce response. The sorting policy is **pluggable** — inspired by Kraken's `assignmentPolicy` interface pattern. IC's default policy prioritizes:

1. **Seeders** (completed packages — highest priority, like Kraken's `completeness` policy)
2. **Lobby peers** (peers in the same multiplayer lobby — guaranteed to have the content, lowest latency)
3. **Geographically close peers** (same region/ASN — reduces cross-continent transfers)
4. **High-completion peers** (more pieces available — better utilization of each connection)
5. **Random** (fallback for ties — prevents herding)

Peer handout limit: 30 peers per announce response (Kraken uses 50, but IC has fewer total peers per package). Community-hosted trackers can implement custom policies via the server config.

*Planned evolution — weighted multi-dimensional scoring (Phase 5+):* Dragonfly's evaluator demonstrates that combining capacity, locality, and node type into a weighted score produces better peer selection than linear priority tiers. IC's Phase 5+ peer selection evolves to a weighted scoring model informed by Dragonfly's approach:

```
PeerScore = Capacity(0.4) + Locality(0.3) + SeedStatus(0.2) + LobbyContext(0.1)
```

- **Capacity (weight 0.4):** Spare bandwidth reported in announce (`1 - upload_bw_used / upload_bw_max`). Peers with more headroom score higher. Inspired by Dragonfly's `LoadQuality` metric (which sub-decomposes into peak bandwidth, sustained load, and concurrency). IC uses a single utilization ratio — simpler, captures the same core insight.
- **Locality (weight 0.3):** Hierarchical location matching. Clients self-report location as `continent|country|region|city` (4-level, pipe-delimited — adapted from Dragonfly's 5-level `country|province|city|zone|cluster`). Score = `matched_prefix_elements / 4`. Two peers in the same city score 0.75; same country but different region: 0.5; same continent: 0.25.
- **SeedStatus (weight 0.2):** Seed box = 1.0, completed seeder = 0.7, uploading leecher = 0.3. Inspired by Dragonfly's `HostType` score (seed peers = 1.0, normal = 0.5).
- **LobbyContext (weight 0.1):** Same lobby = 1.0, same game session = 0.5, no context = 0. IC-specific — Dragonfly has no equivalent (no lobby concept).

The initial 5-tier priority system (above) ships first and is adequate for community scale. Weighted scoring is additive — the same pluggable policy interface supports both approaches. Community servers can configure their own weights or contribute custom scoring policies.

*Piece request strategy (client-side):* The engine uses **rarest-first** piece selection by default — a priority queue sorted by fewest peers having each piece. This is standard BitTorrent behavior, well-validated for internet conditions. Kraken also implements this as `rarestFirstPolicy`.

- **Pipeline limit:** 3 concurrent piece requests per peer (matches Kraken's default). Prevents overwhelming slow peers.
- **Piece request timeout:** 8s base + 6s per MB of piece size (more generous than Kraken's 4s+4s/MB, compensating for residential internet variance).
- **Endgame mode:** When remaining pieces ≤ 5, the engine sends duplicate piece requests to multiple peers. This prevents the "last piece stall" — a well-known BitTorrent problem where the final piece's sole holder is slow. Kraken implements this as `EndgameThreshold` — it's essential.

*Connection state machine (client-side):*

```
pending ──connect──► active ──timeout/error──► blacklisted
   ▲                    │                          │
   │                    │                          │
   └──────────── cooldown (5min) ◄─────────────────┘
```

- `MaxConnectionsPerPackage: 8` (lower than Kraken's 10 — residential connections have less bandwidth to share)
- Blacklisting: peers that produce zero useful throughput over 30 seconds are temporarily blacklisted (5-minute cooldown). Catches both dead peers and ISP-throttled connections.
- *Sybil resistance:* Maximum 3 peers per /24 subnet in a single swarm. Prefer peers from diverse autonomous systems (ASNs) when possible. Sybil attacks can waste bandwidth but cannot serve corrupt data (SHA-256 integrity), so the risk ceiling is low.
- *Statistical degradation detection (Phase 5+):* Inspired by Dragonfly's `IsBadParent` algorithm — track per-peer piece transfer times. Peers whose last transfer exceeds `max(3 × mean, 2 × p95)` of observed transfer times are demoted in scoring (not hard-blacklisted — they may recover). For sparse data (< 50 samples per peer), fall back to the simpler "20× mean" ratio check. Hard blacklist remains only for zero-throughput (complete failure). This catches degrading peers before they fail completely.
- Connections have TTL — idle connections are closed after 60 seconds to free resources.

*Announce cycle (client → tracker):* Clients announce to the tracker every **30 seconds** (Kraken uses 3s for datacenter — far too aggressive for internet). The tracker can dynamically adjust: faster intervals (10s) during active downloads, slower (60s) when seeding idle content. Max interval cap (120s) prevents unbounded growth. Announce payload includes: PeerID, package info hash, bitfield (what pieces the client has), upload/download speed.

*Size-based piece length:* Different package sizes use different piece lengths to balance metadata overhead against download granularity (inspired by Kraken's `PieceLengths` config):

| Package Size | Piece Length    | Rationale                                                     |
| ------------ | --------------- | ------------------------------------------------------------- |
| < 5MB        | N/A — HTTP only | P2P overhead exceeds benefit                                  |
| 5–50MB       | 256KB           | Fine-grained. Good for partial recovery and slow connections. |
| 50–500MB     | 1MB             | Balanced. Reasonable metadata overhead.                       |
| > 500MB      | 4MB             | Reduced metadata overhead for large packages.                 |

*Bandwidth limiting:* Configurable per-client in `settings.toml`. Residential users cannot have their connection saturated by mod seeding — this is a hard requirement that Kraken solves with `egress_bits_per_sec`/`ingress_bits_per_sec` and IC must match.

```toml
# settings.toml — P2P bandwidth configuration
[workshop.p2p]
max_upload_speed = "1 MB/s"          # Default. 0 = unlimited, "0 B/s" = no seeding
max_download_speed = "unlimited"      # Default. Most users won't limit.
seed_after_download = true            # Keep seeding while game is running
seed_duration_after_exit = "30m"      # Background seeding after game closes (0 = none)
cache_size_limit = "2 GB"             # LRU eviction when exceeded
prefer_p2p = true                     # false = always use HTTP direct
```

*Health checks:* Seed boxes implement heartbeat health checks (30s interval, 3 failures → unhealthy, 2 passes → healthy again — matching Kraken's active health check parameters). The tracker marks peers as offline after 2× announce interval without contact. Unhealthy seed boxes are removed from the announce response until they recover.

*Content lifecycle:* Downloaded packages stay in the seeding pool for 30 minutes after the game exits (configurable via `seed_duration_after_exit`). This is longer than Kraken's 5-minute `seeder_tti` because IC has fewer peers per package — each seeder is more valuable. Disk cache uses LRU eviction when over `cache_size_limit`. Packages currently in use or being seeded are never evicted.

*Download priority tiers:* Inspired by Dragonfly's 7-level priority system (Level0–Level6), IC uses 3 priority tiers to enable QoS differentiation. Higher-priority downloads preempt lower-priority ones (pause background downloads, reallocate bandwidth and connection slots):

| Priority | Name             | When Used                                                | Behavior                                                   |
| -------- | ---------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| 1 (high) | `lobby-urgent`   | Player joining a lobby that requires missing mods        | Preempts all other downloads. Uses all available bandwidth |
| 2 (mid)  | `user-requested` | Player manually downloads from Workshop browser          | Normal bandwidth. Runs alongside background.               |
| 3 (low)  | `background`     | Cache warming, auto-updates, subscribed mod pre-download | Bandwidth-limited. Paused when higher-priority active.     |

*Preheat / prefetch:* Adapted from Dragonfly's preheat jobs (which pre-warm content on seed peers before demand). IC uses two prefetch patterns:

- **Lobby prefetch:** When a lobby host sets required mods, the Workshop server (Phase 5+) can pre-seed those mods to seed boxes before players join. The lobby creation event is the prefetch signal. This ensures seed infrastructure is warm when players start downloading.
- **Subscription prefetch:** Players can subscribe to Workshop publishers or resources. Subscribed content auto-downloads in the background at `background` priority. When a subscribed mod updates, the new version downloads automatically before the player next launches the game.

*Persistent replica count (Phase 5+):* Inspired by Dragonfly's `PersistentReplicaCount`, the Workshop server tracks how many seed boxes hold each resource. If the count drops below a configurable threshold (default: 2 for popular resources, 1 for all others), the server triggers automatic re-seeding from HTTP origin. This ensures the "always available" guarantee — even if all player peers are offline, seed infrastructure maintains minimum replica coverage.

**Early-phase bootstrap — Git-hosted package index:**

Before the full Workshop server is built (Phase 4-5), a **GitHub-hosted package index repository** serves as the Workshop's discovery and coordination layer. This is a well-proven pattern — Homebrew (`homebrew-core`), Rust (`crates.io-index`), Winget (`winget-pkgs`), and Nixpkgs all use a git repository as their canonical package index.

**How it works:**

A public GitHub repository (e.g., `iron-curtain/workshop-index`) contains YAML manifest files — one per package — that describe available resources, their versions, checksums, download locations, and dependencies. The repo itself contains NO asset files — only lightweight metadata.

```
workshop-index/                      # The git-hosted package index
├── index.yaml                       # Consolidated index (single-fetch for game client)
├── packages/
│   ├── alice/
│   │   └── soviet-march-music/
│   │       ├── 1.0.0.yaml           # Per-version manifests
│   │       └── 1.1.0.yaml
│   ├── community-hd-project/
│   │   └── allied-infantry-hd/
│   │       └── 2.0.0.yaml
│   └── ...
├── sources.yaml                     # List of storage servers, mirrors, seed boxes
└── .github/
    └── workflows/
        └── validate.yml             # CI: validates manifest format, checks SHA-256
```

**Per-package manifest (`packages/alice/soviet-march-music/1.1.0.yaml`):**

```yaml
name: soviet-march-music
publisher: alice
version: 1.1.0
license: CC-BY-4.0
description: "Soviet faction battle music pack"
size: 48_000_000  # 48MB
sha256: "a1b2c3d4..."

sources:
  - type: http
    url: "https://github.com/iron-curtain/workshop-packages/releases/download/alice-soviet-march-music-1.1.0/soviet-march-music-1.1.0.icpkg"
  - type: torrent
    info_hash: "e5f6a7b8..."
    trackers:
      - "wss://tracker.ironcurtain.gg/announce"   # WebTorrent tracker
      - "udp://tracker.ironcurtain.gg:6969/announce"

dependencies:
  community-hd-project/base-audio-lib: "^1.0"

game_modules: [ra]
tags: [music, soviet, battle]
```

**`sources.yaml` — storage server and tracker registry:**

```yaml
# Where to find actual .icpkg files and BitTorrent peers.
# The engine reads this to discover available download sources.
# Adding an official server later = adding a line here.
storage_servers:
  - url: "https://github.com/iron-curtain/workshop-packages/releases"  # GitHub Releases (Phase 0-3)
    type: github-releases
    priority: 1
  # - url: "https://cdn.ironcurtain.gg"   # Future: official CDN (Phase 5+)
  #   type: http
  #   priority: 1

torrent_trackers:
  - "wss://tracker.ironcurtain.gg/announce"      # WebTorrent (browser + desktop)
  - "udp://tracker.ironcurtain.gg:6969/announce"  # UDP (desktop only)

seed_boxes:
  - "https://seed1.ironcurtain.gg"  # Permanent seeder for all packages
```

**Two client access patterns:**

1. **HTTP fetch** (game client default): The engine fetches `index.yaml` via `raw.githubusercontent.com` — a single GET request returns the full package listing. Fast, no git dependency, CDN-backed globally by GitHub. Cached locally with ETag/Last-Modified for incremental updates.
2. **Git clone/pull** (SDK, power users, offline): `git clone` the entire index repo. `git pull` for incremental atomic updates. Full offline browsing. Better for the SDK/editor and users who want to script against the index.

The engine's Workshop source configuration (D030) treats this as a new source type:

```toml
# settings.toml — Phase 0-3 configuration
[[workshop.sources]]
url = "https://github.com/iron-curtain/workshop-index"   # git-index source
type = "git-index"
priority = 1

[[workshop.sources]]
path = "C:/my-local-workshop"    # local development
type = "local"
priority = 2
```

**Community contribution workflow (manual):**

1. Modder creates a `.icpkg` package and uploads it to GitHub Releases (or any HTTP host)
2. Modder submits a PR to `workshop-index` adding a manifest YAML with SHA-256 and download URL
3. GitHub Actions validates manifest format, checks SHA-256 against the download URL, verifies metadata
4. Maintainers review and merge → package is discoverable to all players on next index fetch
5. When the full Workshop server ships (Phase 4-5), published packages migrate automatically — the manifest format is the same

**Git-index security hardening** (see `06-SECURITY.md` § Vulnerabilities 20–21 and `research/workshop-registry-vulnerability-analysis.md` for full threat analysis):

- **Path-scoped PR validation:** CI rejects PRs that modify files outside the submitter's package directory. A PR adding `packages/alice/tanks/1.0.0.yaml` may ONLY modify files under `packages/alice/`. Modification of other paths → automatic CI failure.
- **CODEOWNERS:** Maps `packages/alice/** @alice-github`. GitHub enforces that only the package owner can approve changes to their manifests.
- **`manifest_hash` verification:** CI downloads the `.icpkg`, extracts `manifest.yaml`, computes its SHA-256, and verifies it matches the `manifest_hash` field in the index entry. Prevents manifest confusion (registry entry diverging from package contents).
- **Consolidated `index.yaml` is CI-generated:** Deterministically rebuilt from per-package manifests — never hand-edited. Any contributor can reproduce locally to verify integrity.
- **Index signing (Phase 3–4):** CI signs the consolidated `index.yaml` with an Ed25519 key stored outside GitHub. Clients verify the signature. Repository compromise without the signing key produces unsigned (rejected) indexes. Uses the **two-key architecture** from D052 (§ Key Lifecycle): the CI-held key is the Signing Key (SK); a Recovery Key (RK), held offline by ≥2 maintainers, enables key rotation on compromise without breaking client trust chains. See D052 § "Cross-Pollination" for the full rationale.
- **Actions pinned to commit SHAs:** All GitHub Actions referenced by SHA, not by mutable tag. Minimal `GITHUB_TOKEN` permissions. No secrets in the PR validation pipeline.
- **Branch protection on main:** Require signed commits, no force-push, require PR reviews, no single-person merge. Repository must have ≥3 maintainers.

**Automated publish via `ic` CLI (same UX as Phase 5+):**

The `ic mod publish` command works against the git-index backend in Phase 0–3:

1. `ic mod publish` packages content into `.icpkg`, computes SHA-256
2. Uploads `.icpkg` to GitHub Releases (via GitHub API, using a personal access token configured in `ic auth`)
3. Generates the index manifest YAML from `mod.yaml` metadata
4. Opens a PR to `workshop-index` with the manifest file
5. Modder reviews the PR and confirms; GitHub Actions validates; maintainers merge

The command is identical to Phase 5+ publishing (`ic mod publish`) — the only difference is the backend. When the Workshop server ships, `ic mod publish` targets the server instead. Modders don't change their workflow.

**Adding official storage servers later:**

When official infrastructure is ready (Phase 5+), adding it is a one-line change to `sources.yaml` — no architecture change, no client update. The `sources.yaml` in the index repo is the single place that lists where packages can be downloaded from. Community mirrors and CDN endpoints are added the same way.

**Phased progression:**

1. **Phase 0–3 — Git-hosted index + GitHub Releases:** The index repo is the Workshop. Players fetch `index.yaml` for discovery, download `.icpkg` files from GitHub Releases (2GB per file, free, CDN-backed). Community contributes via PR. Zero custom server code. Zero hosting cost.
2. **Phase 3–4 — Add BitTorrent tracker:** A minimal tracker binary goes live ($5-10/month VPS). Package manifests gain `torrent` source entries. P2P delivery begins for large packages. The index repo remains the discovery layer.
3. **Phase 4–5 — Full Workshop server:** Search, ratings, dependency resolution, FTS5, integrated P2P tracker. The Workshop server can either replace the git index or coexist alongside it (both are valid D030 sources). The git index remains available as a fallback and for community-hosted Workshop servers.

The progression is smooth because the federated source model (D030) already supports multiple source types — `git-index`, `local`, `remote` (Workshop server), and `steam` all coexist in `settings.toml`.

### Freeware / Legacy C&C Mirror Content (Policy-Gated, Not Assumed)

IC may choose to host **official/community mirror packages** for legacy/freeware C&C content, but this is a **policy-gated path**, not a default assumption.

Rules:
- Do **not** assume "freeware" automatically means "redistributable in IC Workshop mirrors."
- The default onboarding path remains **owned-install import** via D069 (including out-of-the-box Remastered import when detected).
- Mirroring legacy/freeware C&C assets in Workshop requires the D037 governance/legal policy gate:
  - documented rights basis / scope
  - provenance labeling
  - update/takedown process
  - mirror operator responsibilities
- If approved, mirrored packs must be clearly labeled (e.g., `official-mirror` / verified publisher/community mirror provenance) and remain optional content sources under D068/D069.

This preserves legal clarity without blocking player onboarding or selective-install workflows.

Rendered cutscene sequence bundles (D038 `Cinematic Sequence` content plus dialogue/portrait/audio/visual dependencies) are normal Workshop resources under the same D030/D049 rules. They should declare optional visual dependencies explicitly (for example HD/3D render-mode packs) and provide fallback-safe behavior so a scenario/campaign can still proceed when optional presentation packs are missing.

### Media Language Capability Metadata (Cutscenes / Voice / Subtitles / CC)

Workshop media packages that contain cutscenes, dubbed dialogue, subtitles, or closed captions should declare a **language capability matrix** so clients can make correct fallback decisions before playback.

Examples of package-level metadata (exact field names can evolve, semantics are fixed):

- `audio_languages[]` (dubbed/spoken audio languages available in this package)
- `subtitle_languages[]` (subtitle text languages available)
- `cc_languages[]` (closed-caption languages available)
- `translation_source` (`human`, `machine`, `hybrid`)
- `translation_quality_label` / trust label (e.g., `creator-verified`, `community-reviewed`, `machine-translated`)
- `coverage` (`full`, `partial`, or percentage by track/group)
- `requires_original_audio_pack` (for subtitle/CC-only translation packs)

Rules:

- Language capability metadata must be **accurate enough for fallback selection** (D068/D069) and player trust.
- Machine-translated subtitle/CC resources must be **clearly labeled** in Workshop listings, Installed Content Manager, and playback fallback notices.
- Missing language support must never block campaign progression; D068 fallback-safe behavior remains the rule.
- Media language metadata is **presentation scope** and does not affect gameplay compatibility fingerprints.

Workshop UX implications:

- Browse/search filters may include language availability badges (e.g., `Audio: EN`, `Subs: EN/HE`, `CC: EN/AR`).
- Package details should show translation source/trust labels and coverage.
- Install/enable flows should warn when a selected package does not satisfy the player's preferred cutscene voice/subtitle/CC preferences.

Operator/admin implications:

- The Workshop admin panel (M9) should surface language metadata and translation-source labels in package review/provenance screens so mislabeled machine translations or incomplete language claims can be corrected/quarantined.

### Workshop Operator / Admin Panel (Phased)

A full Workshop platform needs a dedicated **operator/admin panel** (web UI or equivalent admin surface), with CLI parity for automation.

#### Phase 4–5 / `M8` — Minimal Operator Panel (`P-Scale`)

Purpose: keep the Workshop running and recoverable before the full creator ecosystem matures.

Minimum operator capabilities:
- ingest/publish job queue status (pending / failed / retry)
- package hash verification status and retry actions
- source/index health (git-index sync, HTTP origins, tracker health)
- metadata/index rebuild and cache maintenance actions
- storage/CAS usage summary + GC triggers
- basic audit log of operator actions

#### Phase 6a / `M9` — Full Workshop Admin Panel (`P-Scale`)

Purpose: support moderation, provenance, release-channel controls, and ecosystem governance at scale.

Required admin capabilities:
- moderation queue (reports, quarantines, takedowns, reinstatements)
- provenance/license review queue and publish-readiness blockers
- signature/verification status dashboards (manifest/index/release metadata authenticity)
- dependency impact view ("what breaks if this package is quarantined/yanked?")
- release channel controls (`private` / `beta` / `release`)
- rollback/quarantine tools and incident notes
- role-based access control (operators/moderators/admins)
- append-only audit trail / action history

#### Phase 7 / `M11` — Governance & Policy Analytics

- moderation workload metrics and SLA views
- abuse/fraud trend dashboards (feedback reward farming, report brigading, publisher abuse)
- policy reporting exports for D037 governance transparency commitments

This is a platform-operations requirement, not optional UI polish.

**Industry precedent:**

| Project                                | Index Mechanism                                          | Scale          |
| -------------------------------------- | -------------------------------------------------------- | -------------- |
| **Homebrew** (`homebrew-core`)         | Git repo of Ruby formulae; `brew update` = `git pull`    | ~7K packages   |
| **Rust crates.io** (`crates.io-index`) | Git repo of JSON metadata; sparse HTTP fetch added later | ~150K crates   |
| **Winget** (`winget-pkgs`)             | Git repo of YAML manifests; community PRs                | ~5K packages   |
| **Nixpkgs**                            | Git repo of Nix expressions                              | ~100K packages |
| **Scoop** (Windows)                    | Git repo ("buckets") of JSON manifests                   | ~5K packages   |

All of these started with git-as-index and some (crates.io) later augmented with sparse HTTP fetching for performance at scale. The same progression applies here — git index works perfectly for a community of hundreds to low thousands, and can be complemented (not replaced) by a Workshop API when scale demands it.

**Workshop server architecture with P2P:**

```
┌─────────────────────────────────────────────────────┐
│                  Workshop Server                     │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │  Metadata    │  │ Tracker  │  │  HTTP Fallback │ │
│  │  (SQLite +   │  │ (BT/WT   │  │  (S3/R2 or     │ │
│  │   FTS5)      │  │  peer     │  │   local disk)  │ │
│  │             │  │  coord)   │  │               │ │
│  └─────────────┘  └──────────┘  └────────────────┘ │
│        ▲               ▲               ▲            │
│        │ search/browse │ announce/     │ GET .icpkg  │
│        │ deps/ratings  │ scrape        │ (fallback)  │
└────────┼───────────────┼───────────────┼────────────┘
         │               │               │
    ┌────┴────┐    ┌─────┴─────┐   ┌─────┴─────┐
    │ ic CLI  │    │  Players  │   │ Seed Box  │
    │ Browser │    │  (seeds)  │   │ (always   │
    └─────────┘    └───────────┘   │  seeds)   │
                                   └───────────┘
```

All three components (metadata, tracker, HTTP fallback) run in the same binary — "just a Rust binary" deployment philosophy. Community self-hosters get the full stack with one executable.

### Rust Implementation

**BitTorrent client library:** The `ic` CLI and game client embed a BitTorrent client. Rust options:
- [`librqbit`](https://github.com/ikatson/rqbit) — pure Rust, async (tokio), actively maintained, supports WebTorrent
- [`cratetorrent`](https://github.com/mandreyel/cratetorrent) — pure Rust, educational focus
- Custom minimal client — only needs download + seed + tracker announce; no DHT, no PEX needed for a controlled Workshop ecosystem

**BitTorrent tracker:** Embeddable in the Workshop server binary. Rust options:
- [`aquatic`](https://github.com/greatest-ape/aquatic) — high-performance Rust tracker
- Custom minimal tracker — HTTP announce/scrape endpoints, peer list management. The Workshop server already has SQLite; peer lists are another table.

**WebTorrent:** `librqbit` has WebTorrent support. The WASM build would use the WebRTC transport.

### Rationale

- **Cost sustainability:** P2P reduces Workshop hosting costs by 90%+. A community project cannot afford CDN bills that scale with popularity. A tracker + seed box for $30-50/month serves unlimited download volume.
- **Fits federation (D030):** P2P is another source in the federated model. The virtual repository queries metadata from remote servers, then downloads content from the swarm — same user experience, different transport.
- **Fits "no single point of failure" (D037):** P2P is inherently resilient. If the Workshop server goes down, peers keep sharing. Content already downloaded is always available.
- **Fits SHA-256 integrity (D030):** P2P needs exactly the integrity verification already designed. Same `manifest.yaml` checksums, same `ic.lock` pinning, same verification on install.
- **Fits WASM target (invariant #10):** WebTorrent enables browser-to-browser P2P. Desktop and browser clients interoperate. No second-class platform.
- **Popular resources get faster:** More downloads → more seeders → faster downloads for everyone. The opposite of CDN economics where popularity increases cost.
- **Self-hosting scales:** Community Workshop servers (D030 federation) benefit from the same P2P economics. A small community server needs only a $5 VPS — the community's players provide the bandwidth.
- **Privacy-responsible:** IP exposure is equivalent to any multiplayer game. HTTP-only mode available for privacy-sensitive users. No additional surveillance beyond standard BitTorrent protocol.
- **Proven technology:** BitTorrent has been distributing large files reliably for 20+ years. Blizzard used it for WoW patches. The protocol is well-understood, well-documented, and well-implemented.

### Alternatives Considered

- **Centralized CDN only** (rejected — financially unsustainable for a donation-funded community project. A popular 500MB mod downloaded 10K times = 5TB = $50-450/month. P2P reduces this to near-zero marginal cost)
- **IPFS** (rejected as primary distribution protocol — slow cold-content discovery, complex setup, ecosystem declining, content pinning is expensive, poor game-quality UX. However, multiple Bitswap protocol design patterns adopted: EWMA peer scoring, per-peer fairness caps, want-have/want-block two-phase discovery, broadcast control, dual WAN/LAN discovery, delegated HTTP routing, batch provider announcements. See competitive landscape table above and research deep dive)
- **Custom P2P protocol** (rejected — massive engineering effort with no advantage over BitTorrent's 20-year-proven protocol)
- **Git LFS** (rejected — 1GB free then paid; designed for source code, not binary asset distribution; no P2P)
- **Steam Workshop only** (rejected — platform lock-in, Steam subsidizes hosting from game sales revenue we don't have, excludes non-Steam/WASM builds)
- **GitHub Releases only** (rejected — works for bootstrap but no search, ratings, dependency resolution, P2P, or lobby auto-download. Adequate interim solution, not long-term architecture)
- **HTTP-only with community mirrors** (rejected — still fragile. Mirrors are one operator away from going offline. P2P is inherently more resilient than any number of mirrors)
- **No git index / custom server from day one** (rejected — premature complexity. A git-hosted index costs $0 and ships with the first playable build. Custom server code can wait until Phase 4-5 when the community is large enough to need search/ratings)

### Phase

- **Phase 0–3:** Git-hosted package index (`workshop-index` repo) + GitHub Releases for `.icpkg` storage. Zero infrastructure cost. Community contributes via PR. Game client fetches `index.yaml` for discovery.
- **Phase 3–4:** Add BitTorrent tracker ($5-10/month VPS). Package manifests gain `torrent` source entries. P2P delivery begins for large packages. Git index remains the discovery layer.
- **Phase 4–5:** Full Workshop server with integrated BitTorrent/WebTorrent tracker, search, ratings, dependency resolution, P2P delivery, HTTP fallback via S3-compatible storage. Git index can coexist or be subsumed.
- **Phase 6a:** Federation (community servers join the P2P swarm), Steam Workshop as additional source, Publisher workflows, and full admin/operator panel + signature/provenance hardening
- **Format recommendations** apply from Phase 0 — all first-party content uses the recommended canonical formats

---

---

