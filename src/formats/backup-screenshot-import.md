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
