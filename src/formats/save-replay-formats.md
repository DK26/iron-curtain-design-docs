## Save Game Format

Save games store a complete `SimSnapshot` — the entire sim state at a single tick, sufficient to restore the game exactly.

### Structure

```
iron_curtain_save_v1.icsave  (file extension: .icsave)
├── Header (fixed-size, uncompressed)
├── Metadata (JSON, uncompressed)
└── Payload (serde-serialized SimSnapshot, LZ4-compressed)
```

### Header (68 bytes, fixed)

All header fields use **little-endian** byte order and are **packed with no padding** (`#[repr(C, packed)]` in Rust, or equivalent sequential layout). Parsers must read fields at their exact byte offsets. This is the wire format — implementations in other languages read the same bytes in the same order.

```rust
pub struct SaveHeader {
    pub magic: [u8; 4],              // b"ICSV" — "Iron Curtain Save"
    pub version: u16,                // Serialization format version (1 = bincode, 2 = postcard)
    pub compression_algorithm: u8,   // D063: 0x01 = LZ4 (current), 0x02 reserved for zstd in a later format revision
    pub flags: u8,                   // Bit flags (has_thumbnail, etc.) — repacked from u16 (D063)
    pub metadata_offset: u32,        // Byte offset to metadata section
    pub metadata_length: u32,        // Metadata section length
    pub payload_offset: u32,         // Byte offset to compressed payload
    pub payload_length: u32,         // Compressed payload length
    pub uncompressed_length: u32,    // Uncompressed payload length (for pre-allocation)
    pub state_hash: u64,             // SyncHash of the saved tick (fast integrity check on load)
    pub payload_hash: [u8; 32],      // StateHash — SHA-256 over the compressed payload bytes.
                                     // Verified BEFORE decompression/deserialization (Fossilize pattern).
                                     // See api-misuse-defense.md S4 for the verification flow.
}
// Total: 4 + 2 + 1 + 1 + 4 + 4 + 4 + 4 + 4 + 8 + 32 = 68 bytes
```

> **Compression (D063):** The `compression_algorithm` byte identifies which decompressor to use for the payload. Version 1 files use `0x01` (LZ4). The `version` field controls the serialization format (bincode vs. postcard) independently — see `decisions/09d/D054-extended-switchability.md` for codec dispatch and `decisions/09a-foundation.md` § D063 for algorithm dispatch. Compression level (fastest/balanced/compact) is configurable via `settings.toml` `compression.save_level` and affects encoding speed/ratio but not the format.

> **Security (V42):** Shared `.icsave` files are an attack surface. Enforce: max decompressed size 64 MB, JSON metadata cap 1 MB, schema validation of deserialized `SimSnapshot` (entity count, position bounds, valid components). Save directory sandboxed via `strict-path` `PathBoundary`. See `06-SECURITY.md` § Vulnerability 42.

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

The payload is a `SimSnapshot` serialized via `serde` (bincode format for compactness) and compressed with LZ4 (fast decompression, good ratio for game state data). LZ4 was chosen over LZO (used by original RA) for its better Rust ecosystem support (`lz4_flex` crate) and superior decompression speed. The save file header's `version` field selects the serialization codec — version `1` uses bincode; version `2` is reserved for postcard if introduced under D054's migration/codec-dispatch path. The `compression_algorithm` byte selects the decompressor independently (D063). Compression level is configurable via `settings.toml` (`compression.save_level`: fastest/balanced/compact). See `decisions/09d/D054-extended-switchability.md` for the serialization version-to-codec dispatch and `decisions/09a-foundation.md` § D063 for the compression strategy.

```rust
pub struct SimSnapshot {
    pub tick: u64,
    pub game_seed: u64,                  // game seed (for cross-game restore rejection — see api-misuse-defense.md S3)
    pub map_hash: StateHash,             // SHA-256 of the map (for cross-game restore rejection)
    pub rng_state: DeterministicRngState,
    pub intern_table: StringInternerSnapshot, // Interned string table — InternedId values depend on this (efficiency-pyramid.md)
    pub entities: Vec<EntitySnapshot>,   // all entities + all components
    pub player_states: Vec<PlayerState>, // credits, power, tech tree, etc.
    pub map_state: MapState,             // resource cells, terrain modifications
    pub campaign_state: Option<CampaignState>,  // D021 branching state
    pub script_state: Option<ScriptState>,      // Lua/WASM variable snapshots
}

/// Serializable snapshot of all active script state.
/// This is the *data* extracted from Lua/WASM runtimes — not the VM handles
/// themselves. On save, `ic-game` (the integration layer) calls each mod's
/// `on_serialize()` callback via `ic-script` to extract mod-declared variables
/// into this struct, then attaches it to the `SimSnapshot` before persisting.
/// On load, `on_deserialize()` restores them into a freshly initialized VM.
/// This preserves the crate boundary: `ic-sim` never imports `ic-script`.
pub struct ScriptState {
    /// Per-mod Lua variable snapshots (mod_id → serialized table).
    /// Each mod’s `on_serialize()` returns a Lua table; the engine
    /// serializes it to MessagePack bytes. `on_deserialize()` receives
    /// the same bytes and restores the table.
    pub lua_states: BTreeMap<ModId, Vec<u8>>,
    /// Per-mod WASM linear memory snapshots (mod_id → memory bytes).
    /// Only the mod's declared persistent memory region is captured,
    /// not the entire WASM linear memory. Mods declare persistent
    /// size via `[persistence] bytes = N` in their manifest.
    pub wasm_states: BTreeMap<ModId, Vec<u8>>,
    /// Global mission/campaign variables set via `Var.Set()` (Lua)
    /// or `ic_var_set()` (WASM host fn). These are engine-managed,
    /// not mod-managed — they survive mod version changes.
    pub mission_vars: BTreeMap<String, ScriptValue>,
}

/// Script-layer value type for mission variables.
/// Deliberately minimal — complex state belongs in mod-managed
/// Lua tables or WASM memory, not in engine-managed variables.
pub enum ScriptValue {
    Bool(bool),
    Int(i64),
    Fixed(FixedPoint),
    Str(String),
}
```

**Size estimate:** A 500-unit game snapshot is ~200KB uncompressed, ~40-80KB compressed. Well within "instant save/load" territory.

### Compatibility

Save files embed `engine_version` and `mod_api_version`. Loading a save from an older engine version triggers the migration path (if migration exists) or shows a compatibility warning. Save files are forward-compatible within the same `mod_api` major version.

**Platform note:** On WASM (browser), saves go to OPFS (primary) or IndexedDB (fallback) via Bevy's platform-appropriate storage — see `05-FORMATS.md` § Browser Asset Storage for the full tier hierarchy. On mobile, saves go to the app sandbox. The format is identical — only the storage backend differs.

## Replay File Format

Replays store the complete order stream — every player command, every tick — sufficient to reproduce an entire game by re-simulating from a known initial state.

### Structure

```
iron_curtain_replay_v1.icrep  (file extension: .icrep)
├── Header (fixed-size, uncompressed)
├── Metadata (JSON, uncompressed)
├── Tick Order Stream (framed, LZ4-compressed)
├── Keyframe Index + Snapshots (LZ4-compressed, mandatory)
├── Analysis Event Stream (LZ4-compressed, optional — HAS_EVENTS flag)
├── Voice Stream (per-player Opus tracks, optional — HAS_VOICE flag, D059)
├── Signature Chain (Ed25519 hash chain, optional — SIGNED flag)
└── Embedded Resources (map + mod manifest, optional)
```

### Header (84 bytes, fixed)

Same wire-format rules as the save header: **little-endian**, **packed with no padding**.

```rust
pub struct ReplayHeader {
    pub magic: [u8; 4],              // b"ICRP" — "Iron Curtain Replay"
    pub version: u16,                // Serialization format version (1)
    pub compression_algorithm: u8,   // D063: 0x01 = LZ4 (current), 0x02 reserved for zstd in a later format revision
    pub flags: u8,                   // Bit flags: signed(0), has_events(1), has_voice(3), incomplete(4)
    pub metadata_offset: u32,
    pub metadata_length: u32,
    pub orders_offset: u32,
    pub orders_length: u32,          // Compressed length
    pub keyframes_offset: u32,       // Byte offset to keyframe index + snapshot data
    pub keyframes_length: u32,       // Compressed length of keyframe section
    pub events_offset: u32,          // 0 if no analysis events (HAS_EVENTS flag)
    pub events_length: u32,          // Compressed length of analysis event stream
    pub signature_offset: u32,
    pub signature_length: u32,
    pub total_ticks: u64,            // Total ticks in the replay
    pub final_state_hash: u64,       // SyncHash of the last tick (fast integrity check)
    pub voice_offset: u32,           // 0 if no voice stream (HAS_VOICE flag, D059)
    pub voice_length: u32,           // Compressed length of voice stream
    pub embedded_offset: u32,        // 0 if Minimal mode (no embedded resources)
    pub embedded_length: u32,        // Length of embedded resources section
    pub lost_frame_count: u32,       // Frames dropped by BackgroundReplayWriter (V45, see network-model-trait.md)
}
// Total: 4 + 2 + 1 + 1 + (14 × 4) + 8 + 4 = 84 bytes
```

> **Compression (D063):** The `compression_algorithm` byte identifies which decompressor to use for the tick order stream and embedded keyframe snapshots. Version 1 files use `0x01` (LZ4). Compression level during live recording defaults to `fastest` (configurable via `settings.toml` `compression.replay_level`). Use `ic replay recompress` to re-encode at a higher compression level for archival. See `decisions/09a-foundation.md` § D063.

The `flags` field bits:
- Bit 0: `SIGNED` — Ed25519 signature chain present (`signature_offset`/`signature_length` are valid)
- Bit 1: `HAS_EVENTS` — analysis event stream present (`events_offset`/`events_length` are valid)
- Bit 3: `HAS_VOICE` — per-player Opus audio tracks recorded with player consent (`voice_offset`/`voice_length` are valid; see `decisions/09g/D059-communication.md`)
- Bit 4: `INCOMPLETE` — one or more tick frames were lost during recording (see `lost_frame_count`). Replay is playable but not ranked-verifiable — the Ed25519 signature chain has gaps (V45). Set by `BackgroundReplayWriter` when `lost_frame_count > 0` at flush time.

**Section presence convention:** Each optional section has an `_offset`/`_length` pair in the header. A section is present when its corresponding flag bit is set AND its offset is non-zero. Readers must check the flag bit, not just the offset, to distinguish "section absent" from "section at offset 0" (impossible in practice since offset 0 is the header, but the flag is the canonical indicator). Embedded resources and keyframes have no flag bit — keyframes are mandatory (always present), and embedded resource presence is determined solely by `embedded_offset != 0`.

### Metadata (JSON)

```json
{
  "replay_id": "a3f7c2d1-...",
  "timestamp": "2027-03-15T15:00:00Z",
  "engine_version": "0.5.0",
  "base_build": 1,
  "data_version": "sha256:def456...",
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

**Replay versioning** (following SC2's dual-version scheme): `base_build` identifies the protocol/serialization format version (matches the binary header's `version` field — used to select the correct deserializer). `data_version` is a SHA-256 hash of the game rules state (unit stats, weapon tables, balance preset) at recording time. A replay is playable if the engine supports its `base_build` protocol, even if the game data has changed between versions — the sim loads rules matching the `data_version` hash (from embedded resources or local cache).

### Data Minimization (Privacy)

Replay metadata and order streams contain **only gameplay-relevant data**. The following are explicitly excluded from `.icrep` files:

- **Hardware identifiers:** No GPU model, CPU model, RAM size, display resolution, or OS version
- **Network identifiers:** No player IP addresses, MAC addresses, or connection fingerprints
- **System telemetry:** No frame times, local performance metrics, or diagnostic data (these live in the local SQLite database per D034, not in replays)
- **File paths:** No local filesystem paths (mod install directories, asset cache locations, etc.)

This is a lesson from BAR/Recoil, whose replay format accumulated hardware fingerprinting data that created privacy concerns when replays were shared publicly. IC's replay format is deliberately minimal: the metadata JSON above is the complete set of fields. Any future metadata additions must pass a privacy review — "would sharing this replay on a public forum leak personally identifying information?"

Player names in replays are display names (D053), not account identifiers. Anonymization is possible via `ic replay anonymize` which replaces player names with generic labels ("Player 1", "Player 2") for educational sharing.

### Tick Order Stream

The order stream is a sequence of per-tick frames:

```rust
/// One tick's worth of orders in the replay.
pub struct ReplayTickFrame {
    pub tick: u64,
    pub state_hash: u64,                // SyncHash — fast desync detection during playback (see type-safety.md)
    pub orders: Vec<TimestampedOrder>,   // all player orders this tick
}
```

Frames are serialized with bincode and compressed in blocks (LZ4 block compression): every 256 ticks form a compression block. This enables seeking — jump to any 256-tick boundary by decompressing just that block, then fast-forward within the block.

**Streaming write:** During a live game, replay frames are appended incrementally (not buffered in memory). The replay file is valid at any point — if the game crashes, the replay up to that point is usable.

### Keyframe Index & Snapshots

The keyframe section stores periodic `SimSnapshot` or `DeltaSnapshot` captures that enable fast seeking without re-simulating from tick 0. Keyframes are **mandatory** — the recorder writes one every 300 ticks (~10 seconds at 30 tps). A 60-minute replay contains ~360 keyframes.

The section begins with a fixed-length index (for O(1) seek-to-tick), followed by the snapshot data blobs:

```rust
/// Keyframe index entry — one per keyframe, stored as a flat array
/// at the start of the keyframe section for fast lookup.
pub struct KeyframeIndexEntry {
    pub tick: u64,                    // Tick this keyframe was captured at
    pub blob_offset: u32,             // Offset within the keyframe section (after the index array)
    pub blob_length: u32,             // Compressed length of the snapshot blob
    pub uncompressed_length: u32,     // For pre-allocation
    pub is_full: bool,                // true = Full SimSnapshot, false = DeltaSnapshot
}

/// DeltaSnapshot — encodes only components that changed since a baseline.
/// See state-recording.md for the TrackChanges derive macro and ChangeMask
/// that make delta encoding efficient.
pub struct DeltaSnapshot {
    pub baseline_tick: SimTick,       // Tick of the baseline this delta is relative to
    pub baseline_hash: SyncHash,      // SyncHash of the baseline (for branch-safety — see api-misuse-defense.md S10)
    pub tick: SimTick,                // Tick this delta represents
    pub intern_table_delta: Option<StringInternerDelta>, // New interned strings since baseline (if any)
    pub changed_entities: Vec<EntityDelta>,  // Only entities with changed components
    pub changed_players: Vec<PlayerStateDelta>,
    pub changed_map: Option<MapStateDelta>,
    pub campaign_state: Option<CampaignState>,  // Full campaign state if changed since baseline (D021 — typically small: flags + mission ID)
    pub script_state: Option<ScriptState>,      // Full script state if changed since baseline (collected by ic-game via ic-script)
}
```

The first keyframe (tick 0) is always a full `SimSnapshot`. Subsequent keyframes alternate between full snapshots (every Nth keyframe, default N=10, i.e., every 3000 ticks) and delta snapshots relative to the previous full keyframe. This bounds worst-case seek cost: restoring to any tick requires loading at most one full snapshot + 9 deltas.

**Seeking algorithm:** To seek to tick T: (1) binary search the keyframe index for the largest keyframe tick ≤ T, (2) decompress and restore that snapshot, (3) re-simulate forward from the keyframe tick to T using the order stream.

### Analysis Event Stream

Alongside the order stream (which enables deterministic replay), IC replays include a separate **analysis event stream** — derived events sampled from the simulation state during recording. This stream enables replay analysis tools (stats sites, tournament review, community analytics) to extract rich data **without re-simulating the entire game**.

This design follows SC2's separation of `replay.game.events` (orders for playback) from `replay.tracker.events` (analytical data for post-game tools). See `research/blizzard-github-analysis.md` § 5.2–5.3.

**Event taxonomy:**

```rust
/// Analysis events derived from simulation state during recording.
/// These are NOT inputs — they are sampled observations for tooling.
/// Entity references use UnitTag — the stable generational identity
/// defined in 02-ARCHITECTURE.md § External Entity Identity.
pub enum AnalysisEvent {
    /// Unit fully created (spawned or construction completed).
    UnitCreated { tick: u64, tag: UnitTag, unit_type: UnitTypeId, owner: PlayerId, pos: WorldPos },
    /// Building/unit construction started.
    ConstructionStarted { tick: u64, tag: UnitTag, unit_type: UnitTypeId, owner: PlayerId, pos: WorldPos },
    /// Building/unit construction completed (pairs with ConstructionStarted).
    ConstructionCompleted { tick: u64, tag: UnitTag },
    /// Unit destroyed.
    UnitDestroyed { tick: u64, tag: UnitTag, killer_tag: Option<UnitTag>, killer_owner: Option<PlayerId> },
    /// Periodic position sample for combat-active units (delta-encoded, max 256 per event).
    UnitPositionSample { tick: u64, positions: Vec<(UnitTag, WorldPos)> },
    /// Periodic per-player economy/military snapshot.
    PlayerStatSnapshot { tick: u64, player: PlayerId, stats: PlayerStats },
    /// Resource harvested.
    ResourceCollected { tick: u64, player: PlayerId, resource_type: ResourceType, amount: i32 },
    /// Upgrade completed.
    UpgradeCompleted { tick: u64, player: PlayerId, upgrade_id: UpgradeId },

    // --- Competitive analysis events (Phase 5+) ---

    /// Periodic camera position sample — where each player is looking.
    /// Sampled at 2 Hz (~8 bytes per player per sample). Enables coaching
    /// tools ("you weren't watching your base during the drop"), replay
    /// heatmaps, and attention analysis. See D059 § Integration.
    CameraPositionSample { tick: u64, player: PlayerId, viewport_center: WorldPos, zoom_level: u16 },
    /// Player selection changed — what the player is controlling.
    /// Delta-encoded: only records additions/removals from the previous selection.
    /// Enables micro/macro analysis and attention tracking.
    SelectionChanged { tick: u64, player: PlayerId, added: Vec<UnitTag>, removed: Vec<UnitTag> },
    /// Control group assignment or recall.
    ControlGroupEvent { tick: u64, player: PlayerId, group: u8, action: ControlGroupAction },
    /// Ability or superweapon activation.
    AbilityUsed { tick: u64, player: PlayerId, ability_id: AbilityId, target: Option<WorldPos> },
    /// Game pause/unpause event.
    PauseEvent { tick: u64, player: PlayerId, paused: bool },
    /// Match ended — captures the end reason for analysis tools.
    MatchEnded { tick: u64, outcome: MatchOutcome },
    /// Vote lifecycle event — proposal, ballot, and resolution.
    /// See `03-NETCODE.md` § "In-Match Vote Framework" for the full vote system.
    VoteEvent { tick: u64, event: VoteAnalysisEvent },
}

/// Control group action types for ControlGroupEvent.
pub enum ControlGroupAction {
    Assign,   // player set this control group
    Append,   // player added to this control group (shift+assign)
    Recall,   // player pressed the control group hotkey to select
}
```

**Competitive analysis rationale:**
- **CameraPositionSample:** SC2 and AoE2 replays both include camera tracking. Coaches review where a player was looking ("you weren't watching your expansion when the attack came"). At 2 Hz with 8 bytes per player, a 20-minute 2-player game adds ~19 KB — negligible. Combines powerfully with voice-in-replay (D059): hearing what a player said while seeing what they were looking at.
- **SelectionChanged / ControlGroupEvent:** SC2's `replay.game.events` includes selection deltas. Control group usage frequency and response time are key skill metrics that distinguish player brackets. Delta-encoded selections are compact (~12 bytes per change).
- **AbilityUsed:** Superweapon timing, chronosphere accuracy, iron curtain placement decisions. Critical for tournament review.
- **PauseEvent / MatchEnded:** Structural events that analysis tools need without re-simulating. See `03-NETCODE.md` § Match Lifecycle for the full pause and surrender specifications.
- **VoteEvent:** Records vote proposals, individual ballots, and resolutions for post-match review and behavioral analysis. Tournament admins can audit vote patterns (e.g., excessive failed kick votes). See `03-NETCODE.md` § "In-Match Vote Framework."
- **Not required for playback** — the order stream alone is sufficient for deterministic replay. Analysis events are a convenience cache.
- **Compact position sampling** — `UnitPositionSample` uses delta-encoded unit indices and includes only units that have inflicted or taken damage recently (following SC2's tracker event model). This keeps the stream compact even in large battles.
- **Fixed-point stat values** — `PlayerStatSnapshot` uses fixed-point integers (matching the sim), not floats.
- **Independent compression** — the analysis stream is LZ4-compressed in its own block, separate from the order stream. Tools that only need orders skip it; tools that only need stats skip the orders.

### Signature Chain (Relay-Certified Replays)

For ranked/tournament matches, the relay server signs state hashes at signing cadence (every N ticks, default 30 — see `network-model-trait.md`), producing a `TickSignature` chain. The chain is sparse — not every tick has a signature, only those at signing cadence boundaries. The signature algorithm is determined by the replay header version — version `1` uses Ed25519 (current). Later replay header versions, if introduced, may select post-quantum algorithms via the `SignatureScheme` enum (D054) while preserving versioned verification dispatch:

```rust
pub struct ReplaySignature {
    pub chain: Vec<TickSignature>,
    pub relay_public_key: Ed25519PublicKey,
}

pub struct TickSignature {
    pub tick: u64,
    pub state_hash: StateHash,    // Full SHA-256 — relay receives StateHash at signing cadence (see network-model-trait.md)
    /// Number of ticks skipped before this one (0 = contiguous, >0 = gap due to
    /// BackgroundReplayWriter frame loss — see V45). Verifiers include the gap
    /// count in the hash chain: `hash(prev_sig_hash, skipped_ticks, tick, state_hash)`.
    pub skipped_ticks: u32,
    pub relay_sig: Ed25519Signature,  // relay signs (skipped_ticks, tick, hash, prev_sig_hash)
}
```

The signature chain is a linked hash chain — each signature includes the hash of the previous signature. Tampering with any tick invalidates all subsequent signatures. Only relay-hosted games produce signed replays. Unsigned replays are fully functional for playback — signatures add trust, not capability.

**Selective tick verification via Merkle paths:** When the sim uses Merkle tree state hashing (see `03-NETCODE.md` § Merkle Tree State Hashing), each `TickSignature` can include the Merkle root rather than a flat hash. This enables **selective verification**: a tournament official can verify that tick 5,000 is authentic without replaying ticks 1–4,999 — just by checking the Merkle path from the tick's root to the signature chain. The signature chain itself forms a hash chain (each entry includes the previous entry's hash), so verifying any single tick also proves the integrity of the chain up to that point. This is the same principle as SPV (Simplified Payment Verification) in Bitcoin — prove a specific item belongs to a signed set without downloading the full set. Useful for dispute resolution ("did this specific moment really happen?") without replaying or transmitting the entire match.

### Embedded Resources (Self-Contained Replays)

A frequent complaint in RTS replay communities is that replays become unplayable when a required mod or map version is unavailable. 0 A.D. and Warzone 2100 both suffer from this — replays reference external map files by name/hash, and if the map is missing, the replay is dead (see `research/0ad-warzone2100-netcode-analysis.md`).

IC replays can optionally embed the resources needed for playback directly in the `.icrep` file:

```rust
/// Optional embedded resources section. When present, the replay is
/// self-contained — playable without the original mod/map installed.
pub struct EmbeddedResources {
    pub map_data: Option<Vec<u8>>,           // Complete map file (LZ4-compressed)
    pub mod_manifest: Option<ModManifest>,    // Mod versions + rule snapshots
    pub balance_preset: Option<String>,       // Which balance preset was active
    pub initial_state: Option<Vec<u8>>,       // Full sim snapshot at tick 0
}
```

**Embedding modes** (determined by `embedded_offset`/`embedded_length` in the header and the content of the `EmbeddedResources` struct):

| Mode            | Map                 | Mod Rules           | Size Impact | Use Case                                     |
| --------------- | ------------------- | ------------------- | ----------- | -------------------------------------------- |
| `Minimal`       | Hash reference only | Version IDs only    | +0 KB       | Normal replays (mods installed locally)      |
| `MapEmbedded`   | Full map data       | Version IDs only    | +50-200 KB  | Sharing replays of custom maps               |
| `SelfContained` | Full map data       | Rule YAML snapshots | +200-500 KB | Tournament archives, historical preservation |

**Tournament archives** use `SelfContained` mode — a replay from 2028 remains playable in 2035 even if the mod has been updated 50 times. The embedded rule snapshots are read-only and cannot override locally installed mods during normal play.

**Size trade-off:** A `Minimal` replay for a 60-minute game is ~2-5 MB (order stream + signatures). A `SelfContained` replay adds ~200-500 KB for embedded resources — a small overhead for permanent playability. Maps larger than 1 MB (rare) use external references instead of embedding.

> **Security (V41):** `SelfContained` embedded resources bypass Workshop moderation and publisher trust tiers. Mitigations: consent prompt before loading embedded content from unknown sources, Lua/WASM never embedded (map data and rule YAML only), diff display against installed mod version, extraction sandboxed via `strict-path` `PathBoundary`. See `06-SECURITY.md` § Vulnerability 41.

### Playback

`ReplayPlayback` implements the `NetworkModel` trait. It reads the tick order stream and feeds orders to the sim as if they came from the network:

```rust
impl NetworkModel for ReplayPlayback {
    fn poll_tick(&mut self) -> Option<TickOrders> {
        let frame: ReplayTickFrame = self.read_next_frame()?;

        // Verify state hash against the sim's current state.
        // On mismatch: desync detected — playback has diverged.
        if let Some(sim_hash) = self.last_sim_hash {
            if sim_hash != frame.state_hash {
                self.on_desync(frame.tick, sim_hash, frame.state_hash);
            }
        }

        // Convert Vec<TimestampedOrder> into TickOrders for the sim.
        Some(TickOrders {
            tick: frame.tick,
            orders: frame.orders,
        })
    }
}
```

**Hash verification timing:** The `state_hash` in each `ReplayTickFrame` is the sim's state hash *after* the previous tick executed. `ReplayPlayback` records the sim's `state_hash()` after each `step()` call (via callback or polling) and verifies it against the next frame's `state_hash`. A mismatch means the local sim has diverged from the recorded game — this triggers a desync warning in the UI (not a crash). For foreign replays (D056), divergence is expected and tracked by `DivergenceTracker`.

**Playback features:** Variable speed (0.5x to 8x), pause, scrub to any tick (re-simulates from nearest keyframe). The recorder takes a `SimSnapshot` keyframe every 300 ticks (~10 seconds at 30 tps) and stores it in the `.icrep` file. A 60-minute replay contains ~360 keyframes (~3-6 MB overhead depending on game state size), enabling sub-second seeking to any point. Keyframes are mandatory — the recorder always writes them.

**Keyframe serialization threading:** Producing a replay keyframe involves two phases with different thread requirements:

1. **ECS snapshot** (game thread): `Simulation::delta_snapshot()` reads ECS state via `ChangeMask` iteration. This MUST run on the game thread because it reads live sim state. Cost: ~0.5–1 ms for 500 units (lightweight — bitfield scan + changed component serialization). Produces a `Vec<u8>` of serialized component data.
2. **LZ4 compression + file write** (background writer thread): The serialized bytes are sent through the replay writer's crossbeam channel to the background thread, which performs LZ4 compression (~0.3–0.5 ms for ~200 KB → ~40–80 KB) and appends to the `.icrep` file. File I/O never touches the game thread.

The game thread contributes ~1 ms every 300 ticks (~10 seconds) for keyframe production — well within the 33 ms tick budget. The LZ4 compression and disk write happen asynchronously on the background writer.

### Foreign Replay Decoders (D056)

`ra-formats` includes decoders for foreign replay file formats, enabling direct playback and conversion to `.icrep`:

| Format                | Extension                      | Structure                                                        | Decoder                   | Source Documentation                                                |
| --------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| OpenRA                | `.orarep`                      | ZIP archive (order stream + `metadata.yaml` + `sync.bin`)        | `OpenRAReplayDecoder`     | OpenRA source: `ReplayUtils.cs`, `ReplayConnection.cs`              |
| Remastered Collection | Binary (no standard extension) | `Save_Recording_Values()` header + per-frame `EventClass` DoList | `RemasteredReplayDecoder` | EA GPL source: `QUEUE.CPP` §§ `Queue_Record()` / `Queue_Playback()` |

Both decoders produce a `ForeignReplay` struct (defined in `decisions/09f/D056-replay-import.md`) — a normalized intermediate representation with `ForeignFrame` / `ForeignOrder` types. This IR is translated to IC's `TimestampedOrder` by `ForeignReplayCodec` in `ic-protocol`, then fed to either `ForeignReplayPlayback` (direct viewing) or the `ic replay import` CLI (conversion to `.icrep`).

**Remastered replay header** (from `Save_Recording_Values()` in `REDALERT/INIT.CPP`):

```rust
/// Header fields written by Save_Recording_Values().
/// Parsed by RemasteredReplayDecoder.
pub struct RemasteredReplayHeader {
    pub session: SessionValues,       // MaxAhead, FrameSendRate, DesiredFrameRate
    pub build_level: u32,
    pub debug_unshroud: bool,
    pub random_seed: u32,             // Deterministic replay seed
    pub scenario: [u8; 44],           // Scenario identifier
    pub scenario_name: [u8; 44],
    pub whom: u32,                    // Player perspective
    pub special: SpecialFlags,
    pub options: GameOptions,
}
```

**Remastered per-frame format** (from `Queue_Record()` in `QUEUE.CPP`):

```rust
/// Per-frame recording: count of events, then that many EventClass structs.
/// Each EventClass is a fixed-size C struct (sizeof(EventClass) bytes).
pub struct RemasteredRecordedFrame {
    pub event_count: u32,
    pub events: Vec<RemasteredEventClass>,  // event_count entries
}
```

**OpenRA `.orarep` structure:**

```
game.orarep (ZIP archive)
├── metadata.yaml          # MiniYAML: players, map, mod, version, outcome
├── orders                  # Binary order stream (per-tick Order objects)
└── sync                    # Per-tick state hashes (u64 CRC values)
```

The `sync` stream enables partial divergence detection — IC can compare its own `state_hash()` against OpenRA's recorded sync values to estimate when the simulations diverged.

