# Replay Keyframes & Analysis Events

> Sub-page of [Save & Replay Formats](save-replay-formats.md). Contains the keyframe snapshot type definitions, seeking algorithm, and analysis event stream taxonomy.

## Keyframe Index & Snapshots

The keyframe section stores periodic `SimSnapshot` or `DeltaSnapshot` captures that enable fast seeking without re-simulating from tick 0. Keyframes are **mandatory** — the recorder writes one every 300 ticks (~20 seconds at the Slower default of ~15 tps). A 60-minute replay at Slower speed contains ~180 keyframes.

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
///
/// Like SimSnapshot, the full DeltaSnapshot is composed by `ic-game`:
/// `Simulation::delta_snapshot(baseline)` returns a `SimCoreDelta` (sim-internal
/// changes only), then ic-game attaches campaign/script state if changed
/// since the recorder's respective baselines (see state-recording.md).
pub struct DeltaSnapshot {
    pub core: SimCoreDelta,                     // Sim-internal delta (produced by ic-sim)
    pub campaign_state: Option<CampaignState>,  // Full campaign state if changed since baseline (D021 — typically small: flags + mission ID)
    pub script_state: Option<ScriptState>,      // Full script state if changed since baseline (collected by ic-game via ic-script)
}

/// Sim-internal delta — what `Simulation::delta_snapshot(baseline)` returns.
/// Contains only changes to state owned by `ic-sim`.
pub struct SimCoreDelta {
    pub baseline_tick: SimTick,       // Tick of the baseline this delta is relative to
    pub baseline_hash: StateHash,     // Full SHA-256 of the baseline (for branch-safety AND reconnection integrity — see api-misuse-defense.md S10, N3)
    pub tick: SimTick,                // Tick this delta represents
    pub intern_table_delta: Option<StringInternerDelta>, // New interned strings since baseline (if any)
    pub changed_entities: Vec<EntityDelta>,  // Only entities with changed components
    pub changed_players: Vec<PlayerStateDelta>,
    pub changed_map: Option<MapStateDelta>,
}

/// Complete snapshot of the string intern table. Stored in full keyframes
/// so that `InternedId` values can be resolved without prior context.
pub struct StringInternerSnapshot {
    /// Ordered mapping of interned IDs to their string values.
    /// Indices correspond to `InternedId` values (0-based).
    pub entries: Vec<String>,
}

/// Delta of the string intern table — only new entries added since
/// the baseline snapshot. Previous entries are immutable (interning
/// is append-only within a game session).
pub struct StringInternerDelta {
    /// Starting InternedId for these new entries (= baseline table length).
    pub start_id: u32,
    /// New strings appended since the baseline.
    pub new_entries: Vec<String>,
}

/// Per-entity delta — identifies one entity and which of its components
/// changed since the baseline. Uses the `ChangeMask` bitfield from
/// `state-recording.md` § TrackChanges to encode which components are
/// present in `changed_components`.
pub struct EntityDelta {
    pub entity: UnitTag,
    /// Bitfield indicating which component slots have new values.
    /// Bit positions match the entity archetype's component order.
    pub change_mask: u64,
    /// Serialized bytes of only the changed components, concatenated
    /// in component-order. Readers use `change_mask` to determine
    /// which components are present and their sizes.
    pub changed_components: Vec<u8>,
    /// True if this entity was spawned after the baseline tick.
    pub is_new: bool,
    /// True if this entity was destroyed since the baseline tick.
    /// If true, `changed_components` is empty.
    pub is_removed: bool,
}

/// Per-player state delta — credits, power, tech tree changes since baseline.
pub struct PlayerStateDelta {
    pub player: PlayerId,
    /// Bitfield of which PlayerState fields changed.
    pub change_mask: u32,
    /// Serialized bytes of only the changed fields.
    pub changed_fields: Vec<u8>,
}

/// Map state delta — terrain and resource cell changes since baseline.
/// Only cells that changed are included.
pub struct MapStateDelta {
    /// Changed cells, identified by CellPos. Each entry contains
    /// the new terrain type / resource amount for that cell.
    pub changed_cells: Vec<(CellPos, MapCellState)>,
}
```

The first keyframe (tick 0) is always a full `SimSnapshot`. Subsequent keyframes alternate between full snapshots (every Nth keyframe, default N=10, i.e., every 3000 ticks) and delta snapshots relative to the previous full keyframe. This bounds worst-case seek cost: restoring to any tick requires loading at most one full snapshot + 9 deltas.

**Seeking algorithm:** To seek to tick T: (1) binary search the keyframe index for the largest keyframe tick ≤ T, (2) if that keyframe is a full `SimSnapshot` (`is_full == true`), decompress and restore it via `GameRunner::restore_full()` (see `02-ARCHITECTURE.md` § ic-game Integration); if it is a `DeltaSnapshot` (`is_full == false`), scan backward through the index to find the preceding full keyframe, restore that full snapshot via `restore_full()`, then apply each intervening delta in order via `GameRunner::apply_full_delta()` up to and including the selected keyframe, (3) re-simulate forward from the keyframe tick to T using the order stream. Worst case: one full snapshot + up to 9 delta applications (since full keyframes occur every 10th keyframe, i.e., every 3000 ticks at default cadence).

## Analysis Event Stream

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

    // --- Highlight detection events (D077) ---

    /// Engagement started — units from opposing players entered weapon range.
    /// Provides a bounding snapshot for highlight scoring window alignment.
    EngagementStarted { tick: u64, center_pos: WorldPos, friendly_units: Vec<UnitTag>, enemy_units: Vec<UnitTag>, value_friendly: i64, value_enemy: i64 },
    /// Engagement ended — all combat ceased or one side retreated/died.
    /// Duration + losses enable engagement-level scoring.
    EngagementEnded { tick: u64, center_pos: WorldPos, friendly_losses: u32, enemy_losses: u32, friendly_survivors: u32, enemy_survivors: u32, duration_ticks: u64 },
    /// Superweapon fired — Iron Curtain, Nuke, Chronosphere, etc.
    /// Flat rarity bonus (0.9) in the highlight scoring pipeline.
    SuperweaponFired { tick: u64, weapon_type: AbilityId, target_pos: WorldPos, player: PlayerId, units_affected: u32, buildings_affected: u32 },
    /// Base destroyed — primary base or expansion fully wiped.
    /// Rarity bonus (0.85) and strong momentum signal.
    BaseDestroyed { tick: u64, player: PlayerId, pos: WorldPos, buildings_lost: Vec<UnitTag> },
    /// Army wipe — >70% of a player's army destroyed in a single engagement.
    /// Rarity bonus (0.8) and high engagement density signal.
    ArmyWipe { tick: u64, player: PlayerId, units_lost: u32, total_value_lost: i64, percentage_of_army: u16 },
    /// Comeback moment — player transitions from losing to winning position.
    /// Detected from `PlayerStatSnapshot` deltas; rarity bonus (0.75), strong momentum signal.
    ComebackMoment { tick: u64, player: PlayerId, deficit_before: i64, advantage_after: i64, swing_value: i64 },
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
