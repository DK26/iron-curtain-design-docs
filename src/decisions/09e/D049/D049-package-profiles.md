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

The local CAS blob store (deduplicating `workshop/blobs/` directory, `cache.db`, garbage collection) is an optimization that ships alongside the full Workshop in Phase 6a. The initial Workshop (Phase 4–5) can use simpler `.icpkg`-on-disk storage and upgrade to CAS when the full Workshop matures — the manifest.yaml already contains per-file SHA-256 hashes, so the data model is forward-compatible. Note: content-addressed *identification* (SHA-256 hashing for file identity) is used earlier — D062's `VirtualNamespace` maps logical paths to content-addressed files from Phase 2, but these are resolved from source mod directories on disk, not from a deduplicating blob store. The CAS blob store is the storage optimization; content addressing as a concept is foundational.

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

