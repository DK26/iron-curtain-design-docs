## D056: Foreign Replay Import (OpenRA & Remastered Collection)

**Status:** Settled
**Phase:** Phase 5 (Multiplayer) — decoders in Phase 2 (Simulation) for testing use
**Depends on:** D006 (Pluggable Networking), D011 (Cross-Engine Compatibility), `ra-formats` crate, `ic-protocol` (OrderCodec trait)

### Problem

The C&C community has accumulated thousands of replay files across two active engines:

- **OpenRA** — `.orarep` files (ZIP archives containing order streams + metadata YAML)
- **C&C Remastered Collection** — binary `EventClass` recordings via `Queue_Record()` / `Queue_Playback()` (DoList serialization per frame, with header from `Save_Recording_Values()`)

These replays represent community history, tournament archives, and — critically for IC — a massive corpus of **known-correct gameplay sequences** that can be used as behavioral regression tests. If IC's simulation handles the same orders and produces visually wrong results (units walking through walls, harvesters ignoring ore, Tesla Coils not firing), that's a bug we can catch automatically.

Without foreign replay support, this testing corpus is inaccessible. Additionally, players switching to IC lose access to their replay libraries — a real migration friction point.

### Decision

**Support direct playback of OpenRA and Remastered Collection replay files, AND provide a converter to IC's native `.icrep` format.**

Both paths are supported because they serve different needs:

| Capability                        | Direct Playback                                      | Convert to `.icrep`                           |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| **Use case**                      | Quick viewing, casual browsing                       | Archival, analysis tooling, regression tests  |
| **Requires original engine sim?** | No — runs through IC's sim                           | No — conversion is a format translation       |
| **Bit-identical to original?**    | No — IC's sim will diverge (D011)                    | N/A — stored as IC orders, replayed by IC sim |
| **Analysis events available?**    | Only if IC re-derives them during playback           | Yes — generated during conversion playback    |
| **Signature chain?**              | Not applicable (foreign replays aren't relay-signed) | Unsigned (provenance metadata preserved)      |
| **Speed**                         | Instant (stream-decode on demand)                    | One-time batch conversion                     |

### Architecture

#### Foreign Replay Decoders (in `ra-formats`)

Foreign replay file parsing belongs in `ra-formats` — it reads C&C-family file formats, which is exactly what this crate exists for. The decoders produce a uniform intermediate representation:

```rust
/// A decoded foreign replay, normalized to a common structure.
/// Lives in `ra-formats`. No dependency on `ic-sim` or `ic-net`.
pub struct ForeignReplay {
    pub source: ReplaySource,
    pub metadata: ForeignReplayMetadata,
    pub initial_state: ForeignInitialState,
    pub frames: Vec<ForeignFrame>,
}

pub enum ReplaySource {
    OpenRA { mod_id: String, mod_version: String },
    Remastered { game: RemasteredGame, version: String },
}

pub enum RemasteredGame { RedAlert, TiberianDawn }

pub struct ForeignReplayMetadata {
    pub players: Vec<ForeignPlayerInfo>,
    pub map_name: String,
    pub map_hash: Option<String>,
    pub duration_frames: u64,
    pub game_speed: Option<String>,
    pub recorded_at: Option<String>,
}

pub struct ForeignInitialState {
    pub random_seed: u32,
    pub scenario: String,
    pub build_level: Option<u32>,
    pub options: HashMap<String, String>,  // game options (shroud, crates, etc.)
}

/// One frame's worth of decoded orders from a foreign replay.
pub struct ForeignFrame {
    pub frame_number: u64,
    pub orders: Vec<ForeignOrder>,
}

/// A single order decoded from a foreign replay format.
/// Preserves the original order type name for diagnostics.
pub enum ForeignOrder {
    Move { player: u8, unit_ids: Vec<u32>, target_x: i32, target_y: i32 },
    Attack { player: u8, unit_ids: Vec<u32>, target_id: u32 },
    Deploy { player: u8, unit_id: u32 },
    Produce { player: u8, building_type: String, unit_type: String },
    Sell { player: u8, building_id: u32 },
    PlaceBuilding { player: u8, building_type: String, x: i32, y: i32 },
    SetRallyPoint { player: u8, building_id: u32, x: i32, y: i32 },
    // ... other order types common to C&C games
    Unknown { player: u8, raw_type: u32, raw_data: Vec<u8> },
}
```

Two decoder implementations:

```rust
/// Decodes OpenRA .orarep files.
/// .orarep = ZIP archive containing:
///   - orders stream (binary, per-tick Order objects)
///   - metadata.yaml (players, map, mod, outcome)
///   - sync.bin (state hashes per tick for desync detection)
pub struct OpenRAReplayDecoder;

impl OpenRAReplayDecoder {
    pub fn decode(reader: impl Read + Seek) -> Result<ForeignReplay> { ... }
}

/// Decodes Remastered Collection replay files.
/// Binary format: Save_Recording_Values() header + per-frame EventClass records.
/// Format documented in research/remastered-collection-netcode-analysis.md § 6.
pub struct RemasteredReplayDecoder;

impl RemasteredReplayDecoder {
    pub fn decode(reader: impl Read) -> Result<ForeignReplay> { ... }
}
```

#### Order Translation (in `ic-protocol`)

`ForeignOrder` → `TimestampedOrder` translation uses the existing `OrderCodec` trait architecture (already defined in `07-CROSS-ENGINE.md`). A `ForeignReplayCodec` maps foreign order types to IC's `PlayerOrder` enum:

```rust
/// Translates ForeignOrder → TimestampedOrder.
/// Lives in ic-protocol alongside OrderCodec.
pub struct ForeignReplayCodec {
    coord_transform: CoordTransform,
    unit_type_map: HashMap<String, UnitTypeId>,   // "1tnk" → IC's UnitTypeId
    building_type_map: HashMap<String, UnitTypeId>,
}

impl ForeignReplayCodec {
    /// Translate a ForeignFrame into IC TickOrders.
    /// Orders that can't be mapped produce warnings, not errors.
    /// Unknown orders are skipped with a diagnostic log entry.
    pub fn translate_frame(
        &self,
        frame: &ForeignFrame,
        tick_rate_ratio: f64,  // e.g., OpenRA 40fps → IC 30tps
    ) -> (TickOrders, Vec<TranslationWarning>) { ... }
}
```

#### Direct Playback (in `ic-net`)

`ForeignReplayPlayback` wraps the decoder output and implements `NetworkModel`, feeding translated orders to the sim tick by tick:

```rust
/// Plays back a foreign replay through IC's simulation.
/// Implements NetworkModel — the sim has no idea the orders came from OpenRA.
pub struct ForeignReplayPlayback {
    frames: Vec<TickOrders>,          // pre-translated
    current_tick: usize,
    source_metadata: ForeignReplayMetadata,
    translation_warnings: Vec<TranslationWarning>,
    divergence_tracker: DivergenceTracker,
}

impl NetworkModel for ForeignReplayPlayback {
    fn poll_tick(&mut self) -> Option<TickOrders> {
        let frame = self.frames.get(self.current_tick)?;
        self.current_tick += 1;
        Some(frame.clone())
    }
}
```

**Divergence tracking:** Since IC's sim is not bit-identical to OpenRA's or the Remastered Collection's (D011), playback WILL diverge. The `DivergenceTracker` monitors for visible signs of divergence (units in invalid positions, negative resources, dead units receiving orders) and surfaces them in the UI:

```rust
pub struct DivergenceTracker {
    pub orders_targeting_dead_units: u64,
    pub orders_targeting_invalid_positions: u64,
    pub first_likely_divergence_tick: Option<u64>,
    pub confidence: DivergenceConfidence,
}

pub enum DivergenceConfidence {
    /// Playback looks plausible — no obvious divergence detected.
    Plausible,
    /// Minor anomalies detected — playback may be slightly off.
    MinorDrift { tick: u64, details: String },
    /// Major divergence — orders no longer make sense for current game state.
    Diverged { tick: u64, details: String },
}
```

The UI shows a subtle indicator: green (plausible) → yellow (minor drift) → red (diverged). Players can keep watching past divergence — they just know the playback is no longer representative of the original game.

#### Conversion to `.icrep` (CLI tool)

The `ic` CLI provides a conversion subcommand:

```
ic replay import game.orarep -o game.icrep
ic replay import recording.bin --format remastered-ra -o game.icrep
ic replay import --batch ./openra-replays/ -o ./converted/
```

Conversion process:
1. Decode foreign replay via `ra-formats` decoder
2. Translate all orders via `ForeignReplayCodec`
3. Run translated orders through IC's sim headlessly (generates analysis events + state hashes)
4. Write `.icrep` with `Minimal` embedding mode + provenance metadata

The converted `.icrep` includes provenance metadata in its JSON metadata block:

```json
{
  "replay_id": "...",
  "converted_from": {
    "source": "openra",
    "original_file": "game-20260115-1530.orarep",
    "original_mod": "ra",
    "original_version": "20231010",
    "conversion_date": "2026-02-15T12:00:00Z",
    "translation_warnings": 3,
    "diverged_at_tick": null
  }
}
```

#### Automated Regression Testing

The most valuable use of foreign replay import is **automated behavioral regression testing**:

```
ic replay test ./test-corpus/openra-replays/ --check visual-sanity
```

This runs each foreign replay headlessly through IC's sim and checks for:
- **Order rejection rate:** What percentage of translated orders does IC's sim reject as invalid? A high rate means IC's order validation (D012) disagrees with OpenRA's — worth investigating.
- **Unit survival anomalies:** If a unit that survived the entire original game dies in tick 50 in IC, the combat/movement system likely has a significant behavioral difference.
- **Economy divergence:** Comparing resource trajectories (if OpenRA replay has sync data) against IC's sim output highlights harvesting/refinery bugs early.
- **Crash-free completion:** The replay completes without panics, even if the game state diverges.

This is NOT about achieving bit-identical results (D011 explicitly rejects that). It's about detecting **gross behavioral bugs** — the kind where a tank drives into the ocean or a building can't be placed on flat ground. The foreign replay corpus acts as a "does this look roughly right?" sanity check.

### Tick Rate Reconciliation

OpenRA runs at a configurable tick rate (default 40 tps for Normal speed). The Remastered Collection's original engine runs at approximately 15 fps for game logic. IC targets 30 tps. Foreign replay playback must reconcile these rates:

- **OpenRA 40 tps → IC 30 tps:** Some foreign ticks have no orders and can be merged. Orders are retimed proportionally: foreign tick 120 at 40 tps = 3.0 seconds → IC tick 90 at 30 tps.
- **Remastered ~15 fps → IC 30 tps:** Each foreign frame maps to ~2 IC ticks. Orders land on the nearest IC tick boundary.

The mapping is approximate — sub-tick timing differences mean some orders arrive 1 tick earlier or later than the original. For direct playback this is acceptable (the game will diverge anyway). For regression tests, the tick mapping is deterministic (always the same IC tick for the same foreign tick).

### What This Is NOT

- **NOT cross-engine multiplayer.** Foreign replays are played back through IC's sim only. No attempt to match the original engine's behavior tick-for-tick.
- **NOT a guarantee of visual fidelity.** The game will look "roughly right" for early ticks, then progressively diverge as simulation differences compound. This is expected and documented (D011).
- **NOT a replacement for IC's native replay system.** Native `.icrep` replays are the primary format. Foreign replay support is a compatibility/migration/testing feature.

### Alternatives Considered

- **Convert-only, no direct playback** (rejected — forces a batch step before viewing; users want to double-click an `.orarep` and watch it immediately)
- **Direct playback only, no conversion** (rejected — analysis tooling and regression tests need `.icrep` format; conversion enables the analysis event stream and signature chain)
- **Embed OpenRA/Remastered sim for accurate playback** (rejected — contradicts D011's "not a port" principle; massive dependency; licensing complexity; architecture violation of sim purity)
- **Support only OpenRA, not Remastered** (rejected — Remastered replays are simpler to decode and the community has archives worth preserving; the DoList format is well-documented in EA's GPL source)

### Integration with Existing Decisions

- **D006 (Pluggable Networking):** `ForeignReplayPlayback` is just another `NetworkModel` implementation — the sim doesn't know the orders came from a foreign replay.
- **D011 (Cross-Engine Compatibility):** Foreign replay playback is "Level 1: Replay Compatibility" from `07-CROSS-ENGINE.md` — now with concrete architecture.
- **D023 (OpenRA Vocabulary Compatibility):** The `ForeignReplayCodec` uses the same OpenRA vocabulary mapping (trait names, order names) that D023 established for YAML rules.
- **D025 (Runtime MiniYAML Loading):** OpenRA `.orarep` metadata is MiniYAML — parsed by the same `ra-formats` infrastructure.
- **D027 (Canonical Enum Compatibility):** Foreign order type names (locomotor types, stance names) use D027's enum mappings.

---

---
