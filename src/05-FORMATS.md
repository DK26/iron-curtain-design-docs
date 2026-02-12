# 05 — File Formats & Original Source Insights

## Formats to Support (ra-formats crate)

### Binary Formats (from original game / OpenRA)

| Format | Purpose           | Notes                                                |
| ------ | ----------------- | ---------------------------------------------------- |
| `.mix` | Archive container | Flat archive, hash-based file lookup, no compression |
| `.shp` | Sprite sheets     | Frame-based, palette-indexed                         |
| `.tmp` | Terrain tiles     | Isometric tile data                                  |
| `.pal` | Color palettes    | 256-color palettes, multiple per scenario            |
| `.aud` | Audio             | Westwood's audio format, IMA ADPCM compressed        |
| `.vqa` | Video             | Cutscenes (VQ vector quantization)                   |

### Text Formats

| Format            | Purpose                     | Notes                                              |
| ----------------- | --------------------------- | -------------------------------------------------- |
| `.ini` (original) | Game rules                  | Original Red Alert format                          |
| MiniYAML (OpenRA) | Game rules, maps, manifests | Custom dialect, needs converter                    |
| YAML (ours)       | Game rules, maps, manifests | Standard spec-compliant YAML                       |
| `.oramap`         | OpenRA map package          | ZIP archive containing map.yaml + terrain + actors |

### ra-formats Crate Goals

1. Parse all above formats reliably
2. Extensive tests against known-good OpenRA data
3. `miniyaml2yaml` converter tool
4. CLI tool to dump/inspect/validate RA assets
5. Useful as standalone crate (builds project credibility)
6. Released open source early (Phase 0 deliverable)

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
    pub magic: [u8; 4],          // b"ICSV" — "Iron Curtain Save"
    pub version: u16,            // Save format version (1)
    pub flags: u16,              // Bit flags (compressed, has_thumbnail, etc.)
    pub metadata_offset: u32,    // Byte offset to metadata section
    pub metadata_length: u32,    // Metadata section length
    pub payload_offset: u32,     // Byte offset to compressed payload
    pub payload_length: u32,     // Compressed payload length
    pub uncompressed_length: u32,// Uncompressed payload length (for pre-allocation)
    pub state_hash: u64,         // state_hash() of the saved tick (integrity check)
}
```

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

The payload is a `SimSnapshot` serialized via `serde` (bincode format for compactness) and compressed with LZ4 (fast decompression, good ratio for game state data). LZ4 was chosen over LZO (used by original RA) for its better Rust ecosystem support (`lz4_flex` crate) and superior decompression speed.

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
└── Signature Chain (Ed25519 hash chain, optional)
```

### Header (48 bytes, fixed)

```rust
pub struct ReplayHeader {
    pub magic: [u8; 4],           // b"ICRP" — "Iron Curtain Replay"
    pub version: u16,             // Replay format version (1)
    pub flags: u16,               // Bit flags (compressed, signed, has_events)
    pub metadata_offset: u32,
    pub metadata_length: u32,
    pub orders_offset: u32,
    pub orders_length: u32,       // Compressed length
    pub signature_offset: u32,
    pub signature_length: u32,
    pub total_ticks: u64,         // Total ticks in the replay
    pub final_state_hash: u64,    // state_hash() of the last tick (integrity)
}
```

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

### Signature Chain (Relay-Certified Replays)

For ranked/tournament matches, the relay server signs each tick's state hash:

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

**Playback features:** Variable speed (0.5x to 8x), pause, scrub to any tick (requires re-simulating from nearest snapshot or start). `SimSnapshot` can be taken at intervals during recording for fast seeking.

### ra-formats Write Support

`ra-formats` currently focuses on reading C&C file formats. Write support is needed for:

| Format    | Write Use Case                                       | Priority                                 |
| --------- | ---------------------------------------------------- | ---------------------------------------- |
| `.oramap` | SDK scenario editor exports                          | Phase 6a (D038)                          |
| `.mix`    | Mod packaging (optional — mods can ship loose files) | Phase 6a (nice-to-have)                  |
| YAML      | All IC-native content authoring                      | Phase 0 (serde_yaml — already available) |
| MiniYAML  | `ic mod export --miniyaml` for OpenRA compat         | Phase 6a (reverse of D025 converter)     |

Write support for binary formats (`.shp`, `.pal`, `.tmp`) is lower priority — the Asset Studio (D040) may use modern formats internally and only export to legacy formats when needed for OpenRA mod sharing.