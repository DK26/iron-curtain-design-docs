# 05 — File Formats & Original Source Insights

## Formats to Support (ra-formats crate)

### Binary Formats (from original game / OpenRA)

| Format | Purpose | Notes |
|--------|---------|-------|
| `.mix` | Archive container | Flat archive, hash-based file lookup, no compression |
| `.shp` | Sprite sheets | Frame-based, palette-indexed |
| `.tmp` | Terrain tiles | Isometric tile data |
| `.pal` | Color palettes | 256-color palettes, multiple per scenario |
| `.aud` | Audio | Westwood's audio format, IMA ADPCM compressed |
| `.vqa` | Video | Cutscenes (VQ vector quantization) |

### Text Formats

| Format | Purpose | Notes |
|--------|---------|-------|
| `.ini` (original) | Game rules | Original Red Alert format |
| MiniYAML (OpenRA) | Game rules, maps, manifests | Custom dialect, needs converter |
| YAML (ours) | Game rules, maps, manifests | Standard spec-compliant YAML |
| `.oramap` | OpenRA map package | ZIP archive containing map.yaml + terrain + actors |

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
