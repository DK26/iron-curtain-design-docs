# Open-Source Game Networking Survey

> Comparative analysis of networking architectures in 10 open-source multiplayer games.
> Focus: patterns, techniques, and architectural decisions relevant to Iron Curtain's deterministic lockstep RTS engine.

---

## Executive Summary

After analyzing ~10 open-source game codebases, several cross-cutting patterns emerge that Iron Curtain's current design either lacks, partially addresses, or could improve upon:

| Gap / Opportunity                                | Severity | Source Games                           | IC Status                    |
| ------------------------------------------------ | -------- | -------------------------------------- | ---------------------------- |
| Dual-hash mode (quick + full)                    | Medium   | 0 A.D., Spring                         | Not designed                 |
| Desync forensics (auto-dump, block-level debug)  | High     | Spring, 0 A.D., Stratagus, Hypersomnia | Partial (per-tick hash only) |
| Dual-world prediction architecture               | Medium   | Hypersomnia, DDNet, Bones/GGRS         | Planned (Rollback)           |
| Effect/visual predictability tiers               | Medium   | Hypersomnia, DDNet                     | Not designed                 |
| Snap-rate recovery (adaptive snapshot frequency) | Low      | DDNet                                  | Not designed                 |
| Synced/unsynced code boundary enforcement        | High     | Spring, Hypersomnia                    | Implicit (crate boundary)    |
| Democracy vs dictatorship desync arbitration     | Low      | Spring                                 | Not designed                 |
| Conditional component visibility per-client      | High     | SS14                                   | Planned (FogAuthoritative)   |
| ECS component-level sync tracking                | Medium   | Veloren, SS14                          | Not designed                 |
| Distance-based update throttling                 | Low      | Veloren                                | Not applicable (lockstep)    |
| Pre-input system (early input processing)        | Low      | DDNet                                  | Not designed                 |
| Match-id increment on session restart            | Low      | Bones/GGRS                             | Not designed                 |
| Separate RNG for decorative systems              | Medium   | Hypersomnia                            | Not designed                 |

---

## Game-by-Game Analysis

### 1. Spring Engine (C++)

**Repo:** `spring/spring` | **Model:** Server-authoritative lockstep | **Genre:** RTS

#### Architecture
- Server runs in a dedicated **netcode thread**, broadcasts `NETMSG_NEWFRAME` to advance simulation. Every 16th frame is a `NETMSG_KEYFRAME` (heavier sync point).
- Three connection types via inheritance: `CLocalConnection` (shared-process), `CLoopbackConnection` (dummy), `UDPConnection` (real network). Clean polymorphism.

#### Sync & Desync Detection
- **Running checksum** per frame, initialized to `0xfade1eaf`. Clients send `NETMSG_SYNCRESPONSE` with `(playerNum, frameNum, checkSum)`.
- **Two arbitration modes:**
  - **Dictatorship** — local client's checksum is truth. Simple, fast.
  - **Democracy** — majority of clients' checksums wins. More robust but slower.
- **`SYNCCHECK_TIMEOUT = 300` frames** — how long to wait before declaring desync.
- **Block-level sync debug:** `SYNCDEBUG` protocol enables fine-grained investigation. `CSyncDebugger` can request specific memory blocks from clients to isolate exactly which data diverged. This is **the most sophisticated desync debugging system** found in any surveyed game.

#### Synced/Unsynced Code Separation
- Explicit compile-time guards: `ENTER_SYNCED_CODE()` / `LEAVE_SYNCED_CODE()`.
- Lua scripting split into `CSyncedLuaHandle` (deterministic) and `CUnsyncedLuaHandle` (visual/UI). The synced handle **excludes `io` and `os` libraries** to prevent accidental nondeterminism.

#### Lag Protection
- `LagProtection()` monitors per-player CPU usage, adjusts game speed accordingly.
- Host limits frame creation when local client falls behind.

#### Network Testing
- `NETWORK_TEST` flag enables packet loss emulation, corruption, and latency simulation at the engine level.

#### Reconnection
- Full reconnect support with `ReconnectTimeout = 15s`. Sends all missed packets from `packetCache`. Version matching required.

#### Relevance to Iron Curtain
| Pattern                     | Applicable?         | Notes                                                                                                                                                                                     |
| --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block-level sync debugger   | **Yes, high value** | IC's per-tick hash detects *that* a desync occurred; Spring's block debugger finds *where*. Consider a `SyncDebugger` component that can request specific ECS component state from peers. |
| Synced/unsynced code guards | **Yes, medium**     | IC relies on crate boundaries (`ic-sim` vs `ic-render`). Consider adding runtime `#[synced]` / `#[unsynced]` system attributes in Bevy for extra safety.                                  |
| Democracy vs dictatorship   | **Low priority**    | IC's relay server is the natural authority. Could be useful for P2P fallback mode.                                                                                                        |
| Network test mode           | **Yes**             | IC has `NetworkSimConfig` but Spring's corruption injection is more thorough.                                                                                                             |

---

### 2. OpenBW (C++)

**Repo:** `OpenBW/openbw` | **Model:** Pure peer-to-peer lockstep | **Genre:** RTS (StarCraft BW clone)

#### Architecture
- All networking in a single `sync.h` (~1147 lines). Minimal, focused design.
- Default latency of 2 frames. `scheduled_actions` ring buffer sized to `1024 * 4 * latency`.
- Template-based server polymorphism: `sync_server_noop` (SP), `sync_server_asio_tcp`, `sync_server_asio_local`. Zero runtime cost for singleplayer.

#### Sync Hash (insync_hash)
FNV-1a hash computed over a carefully chosen subset of game state:
- `successful_action_count`, `failed_action_count`
- `lcg_rand_state` (RNG state)
- Per-player minerals and gas
- `active_orders_size`, `active_bullets_size`, `active_thingies_size`
- Each visible unit's `(shield_points + hp)` and `exact_position.x/y`

Checked every 32 frames. Uses a rotating array of 4 hashes.

#### Determinism
- Random seed derived from CRC32 of all client UIDs XOR'd with start seed.
- Integer math throughout (faithful to original BW).

#### Snapshots
- `Game::saveSnapshot(id)` / `loadSnapshot(id)` / `deleteSnapshot(id)` — clean snapshot API.

#### Relevance to Iron Curtain
| Pattern                             | Applicable? | Notes                                                                                                                                                                                                                                                        |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selective sync hash                 | **Yes**     | IC hashes full state. OpenBW's approach of hashing a *representative subset* (RNG state + resource counts + unit positions/HP) is much faster while catching most desyncs. Consider a tiered approach: fast subset hash every tick, full hash every N ticks. |
| Template-based network polymorphism | **Yes**     | IC already uses trait-based polymorphism (`NetworkModel`). Validates the approach.                                                                                                                                                                           |
| Rotating hash buffer                | **Low**     | Minor optimization. IC's per-tick hash is fine for the relay model.                                                                                                                                                                                          |

---

### 3. Warzone 2100 (C++)

**Repo:** `Warzone2100/warzone2100` | **Model:** Host-client with synchronized queues | **Genre:** RTS

#### Identity & Security
- **libsodium + `EcKey`** for cryptographic identity verification.
- **`SessionKeys`** for encrypted challenge-response authentication.
- **`netPermissions`** with per-identity Connect permissions.
- IP ban list (max 1024 entries).

#### Desync & Lag Management
- `ingame.DesyncCounter[player]` — per-player desync tracking.
- `autoDesyncKickRoutine()` every 1000ms — automatically kicks persistently desynced players.
- `ingame.LagCounter[player]` + `autoLagKickRoutine()` every 1000ms.
- `LAG_INITIAL_LOAD_GRACEPERIOD = 60` — grace period during initial loading.

#### Join System
- Multi-stage async join: version check → slot assignment → password → identity → encrypted challenge-response → approval.
- `TmpSocketInfo` with state machine for join-in-progress tracking.

#### Spectator Support
- `NETmoveSpectatorToPlayerSlot()` — spectator↔player transitions during game.
- Extra replay spectator gamequeue slot.

#### Relevance to Iron Curtain
| Pattern                      | Applicable?      | Notes                                                                                                                                 |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-desync-kick             | **Yes**          | IC should auto-disconnect persistently desynced clients rather than just logging. The desync counter pattern is simple and effective. |
| Lag grace period             | **Yes**          | IC should have a `LAG_INITIAL_LOAD_GRACEPERIOD` for initial map/state loading.                                                        |
| Spectator↔player transitions | **Medium**       | Nice for tournament mode. IC's tournament design should support this.                                                                 |
| libsodium identity           | **Validates IC** | IC already designs for Ed25519 signing. Warzone confirms libsodium is the right choice.                                               |

---

### 4. Stratagus (C++)

**Repo:** `Wargus/stratagus` | **Model:** Peer-to-peer lockstep over UDP | **Genre:** RTS

#### Lockstep Implementation
- `CNetworkParameter` with `gameCyclesPerUpdate = 1`, `NetworkLag = 10` default.
- Commands scheduled at `GameCycle + NetworkLag`.
- 3D command queue: `NetworkIn[256][PlayerMax][MaxNetworkCommands]` indexed by `(gameNetCycle & 0xFF, playerIndex, commandSlot)`.

#### Sync Mechanism
- Each player sends `CNetworkCommandSync` containing **both** `syncSeed` (uint32) and `syncHash` (uint32) every update cycle.
- Ring buffers: `NetworkSyncSeeds[256]` and `NetworkSyncHashs[256]`.
- `NetworkExecCommand_Sync()` compares both seeds and hashes simultaneously.

#### Desync Handling — **Auto-Save on Desync**
- On desync detection, the engine:
  1. Automatically saves game state (`desync_savegame_<player>_<timestamp>.sav`)
  2. Pauses the game
  3. Enables debug output
  4. Prints diagnostic: `"Network out of sync seed: %X!=%X, hash: %X!=%X Cycle %lu"`
- This auto-save is **extremely useful for debugging** — you can reload the save and trace exactly what diverged.

#### Synced RNG
- `SyncRandSeed` initialized to `0x87654321`.
- LCG: `SyncRandSeed = SyncRandSeed * (0x12345678 * 4 + 1) + 1`.

#### Connection State Machine
- Extensive states: `ccs_connecting → ccs_connected → ccs_mapinfo → ccs_synced → ccs_goahead → ccs_started`.
- Also: `ccs_async`, `ccs_detaching`, `ccs_unreachable`, `ccs_incompatibleengine`, `ccs_incompatibleluafiles`, `ccs_needmap`.
- Map transfer protocol: `CInitMessage_MapFileFragment` for sending maps to clients who don't have them.

#### Version/File Checking
- `CInitMessage_EngineMismatch` (engine version) and `CInitMessage_LuaFilesMismatch` (Lua files checksum via `FileChecksums`).

#### Relevance to Iron Curtain
| Pattern                       | Applicable?         | Notes                                                                                                                                    |
| ----------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-save on desync           | **Yes, high value** | IC should automatically snapshot on desync for offline analysis. Combine with IC's existing snapshot system.                             |
| Dual sync check (seed + hash) | **Yes**             | Checking both RNG state and game state hash catches different classes of bugs. IC could check RNG state separately from full state hash. |
| Map transfer protocol         | **Medium**          | IC loads from local assets, but for modded maps, a transfer protocol is needed.                                                          |
| File checksum validation      | **Yes**             | IC should validate that all clients have identical mod/asset checksums before starting.                                                  |

---

### 5. Veloren (Rust)

**Repo:** `veloren/veloren` | **Model:** Server-authoritative (NOT lockstep) | **Genre:** Voxel RPG

#### ECS Component Sync Framework
- `NetSync` trait with `SYNC_FROM` enum: `AnyEntity`, `ClientEntity`, `ClientSpectatorEntity`.
- Components marked for network sync via attributes.
- `UpdateTracker<T>` per component type tracks changes via generation counters.
- `TrackedStorages` aggregates all tracked component storages for efficient dirty-checking.

#### Region-Based Entity Sync
- `EntitySyncPackage` for entity create/delete events.
- `CompSyncPackage` for component insertions/modifications/removals, identified by entity UID.
- `RegionMap` for spatial partitioning — only sends entities in relevant regions to each client.
- Parallel processing via rayon for sync package construction.

#### Distance-Based Update Throttling
- Physics updates throttled by distance: `client_pos.0.distance_squared(pos.0)`.
- Closer entities get more frequent updates.
- Special cases: voxel collider entities (airships) always get full updates regardless of distance.

#### Multiple Network Streams
- Separate streams per client: `in_game_stream`, `terrain_stream`, `general_stream`, `ping_stream`.
- Messages routed to appropriate stream via `PreparedMsg` system.

#### Relevance to Iron Curtain
| Pattern                   | Applicable?                        | Notes                                                                                                                                                                  |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NetSync` trait pattern   | **Yes, for FogAuthoritative mode** | When IC implements fog-authoritative networking, it needs per-component sync tracking. Veloren's `NetSync` trait + `SyncFrom` enum is a clean Bevy-compatible pattern. |
| `UpdateTracker<T>`        | **Yes, for FogAuthoritative**      | Generation-counter-based dirty tracking is efficient and cache-friendly. Better than diffing entire snapshots.                                                         |
| Distance-based throttling | **Not for lockstep**               | Lockstep sends orders, not state. But relevant for spectator streaming or fog-authoritative mode.                                                                      |
| Multi-stream networking   | **Low**                            | IC's relay model handles this at the transport layer.                                                                                                                  |

---

### 6. Space Station 14 (C#)

**Repo:** `space-wizards/space-station-14` + RobustToolbox engine | **Model:** Server-authoritative component state sync | **Genre:** Simulation

#### Component State Synchronization
- `[NetworkedComponent]` attribute marks which components sync over the network.
- `[AutoGenerateComponentState]` — **codegen** for serialization. Zero boilerplate for component networking.
- Delta states via `IComponentDeltaState<T>` interface — only sends what changed.
- `ComponentGetState` / `AfterAutoHandleStateEvent` for custom serialization hooks.

#### Conditional Component Visibility — **Critical Pattern**
- **`SendOnlyToOwner`** property: certain components (e.g., `PacifiedComponent`) are only sent to the owning player's client. Other clients never see the data.
- **`ComponentGetStateAttemptEvent`**: allows game logic to conditionally block component state from being sent. Example: `OnRevCompGetStateAttempt` only sends the "Revolutionary" component to other revolutionaries.
- This is **the most relevant pattern for Iron Curtain's planned FogAuthoritative mode** — it provides per-component, per-client visibility control.

#### PVS (Potentially Visible Set)
- `SharedPvsOverrideSystem` controls which entities are visible to which clients.
- Entities outside PVS are not sent at all (not just hidden — never transmitted).

#### NetEntity
- Entities referenced across the network as `NetEntity` (stable network ID), not raw ECS entity IDs.
- `NetSerializable` attribute for types that cross the network boundary.

#### Relevance to Iron Curtain
| Pattern                          | Applicable?                            | Notes                                                                                                                                                                    |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conditional component visibility | **Yes, critical for FogAuthoritative** | IC's FogAuthoritative mode needs exactly this: the server decides which components each client can see. `SendOnlyToOwner` + event-based visibility is the right pattern. |
| `[AutoGenerateComponentState]`   | **Yes**                                | IC should consider derive macros for automatic network serialization of Bevy components. `#[derive(NetworkSync)]` with configurable visibility.                          |
| PVS system                       | **Yes, for FogAuthoritative**          | IC needs PVS to prevent maphack. SS14 validates that this works at scale.                                                                                                |
| NetEntity IDs                    | **Yes**                                | IC should use stable network entity IDs, not raw Bevy Entity IDs (which are recycled). Relevant for replays, spectators, and cross-engine compatibility.                 |

---

### 7. Hypersomnia (C++)

**Repo:** `TeamHypersomnia/Hypersomnia` | **Model:** Client-server with client-side prediction + rollback | **Genre:** Competitive 2D shooter

This game has **the most sophisticated prediction/rollback architecture** of any game surveyed, and is directly relevant to IC's planned Rollback/GGPO mode.

#### Dual Arena Architecture
- Two complete simulation instances on each client:
  - **`REFERENTIAL`** — ground truth received from server.
  - **`PREDICTED`** — client's speculative simulation.
- `predicted.transfer_all_solvables(referential)` performs the resync when server state arrives.

#### Reprediction/Reconciliation
- `predicted_entropies` vector stores all client predictions.
- When server state arrives, compares `actual_server_entropy` vs `predicted_step.entropy`.
- **Also compares `state_hash`:** `if (*meta.state_hash != predicted_step.state_hash)` — doubly validates.
- On mismatch: replays all predicted entropies on top of referential state.
- `drag_mispredictions_into_past()` smooths visual artifacts during reconciliation.

#### Three-Tier Predictability System — **Novel Pattern**
```cpp
enum predictability_info { ALWAYS, NEVER, ONLY_BY(entity_id) };
```
- **`ALWAYS`** — this entity/effect is always predicted (local player movement, weapon fire).
- **`NEVER`** — never predicted (requires server confirmation — deaths, spawns).
- **`ONLY_BY(entity_id)`** — only the owning player predicts this (own projectiles yes, enemy projectiles no).
- `prediction_input` class has `play_predictable` / `play_unpredictable` flags.
- Effects filtered per predictability: `predict_death_particles`, `predict_death_sounds`, etc.

#### Lag Compensation Settings
- `confirm_local_character_death` — delays showing player death until server confirms.
- `simulate_decorative_organisms_during_reconciliation` — controls whether visual-only systems run during rollback.
- Full `effect_prediction_settings` struct for per-effect-type prediction control.

#### Interpolation Preservation
- `save_interpolations()` / `restore_interpolations()` during resync — preserves visual continuity so the screen doesn't "jump" during rollback.

#### Documented Nondeterminism Bug + Fix
- **Bug:** Predicted world desyncs if decorative logic (e.g., movement path visualization) uses the same RNG as gameplay logic.
- **Fix:** Use a **separate RNG** for decorative/cosmetic systems that don't affect gameplay state. This way, reprediction doesn't break visual systems.

#### Relevance to Iron Curtain
| Pattern                         | Applicable?                | Notes                                                                                                                                      |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dual arena architecture         | **Yes, for Rollback mode** | IC's `RollbackNetwork` should maintain two `Simulation` instances. The GGRS integration in Bones/Jumpy does this via `World::clone()`.     |
| Three-tier predictability       | **Yes, high value**        | IC should classify every system/effect as `ALWAYS`/`NEVER`/`ONLY_BY(owner)` predictable. Critical for clean rollback.                      |
| Separate RNG for cosmetics      | **Yes, critical**          | IC must split `ic-sim` RNG from `ic-render` RNG. Cosmetic effects (particles, sound timing) must NOT consume simulation RNG.               |
| Interpolation preservation      | **Yes**                    | IC must save/restore visual interpolation state during rollback to avoid jarring snaps.                                                    |
| `confirm_local_character_death` | **Medium**                 | In an RTS context, this translates to "don't play unit death animation until server confirms." Reduces visual glitches from misprediction. |

---

### 8. DDraceNetwork (C++)

**Repo:** `ddnet/ddnet` | **Model:** Server-authoritative snapshot-based with client-side prediction | **Genre:** 2D platformer/racing

#### Snapshot System
- Server creates per-client snapshots every tick via `DoSnapshot()`.
- Delta-compressed: finds last acknowledged snapshot per client, computes delta against it.
- CRC integrity check: `pData->Crc()` compared against expected. After 10 CRC errors, client resets acknowledged snapshot (`m_AckGameTick = -1`) to force full snapshot.
- **Snap rate recovery:** Three states: `SNAPRATE_INIT`, `SNAPRATE_FULL`, `SNAPRATE_RECOVER`. When no acked snapshot exists, client automatically enters recovery mode (reduced snapshot rate) to catch up.
- Snapshots purged after 3 seconds: `m_Snapshots.PurgeUntil(m_CurrentGameTick - TickSpeed() * 3)`.

#### Client-Side Prediction — Dual World
- **`m_GameWorld`** — authoritative world built from server snapshots.
- **`m_PredictedWorld`** — predicted state, rebuilt each frame.
- `m_PredictedWorld.CopyWorld(&m_GameWorld)` — prediction starts from last known-good state.
- Prediction loop: `for (Tick = GameTick + 1; Tick <= PredGameTick; Tick++)` — replays local inputs.

#### Anti-Ping / Prediction Smoothing
- **`AntiPingPlayers()`** — predicts other players' positions to reduce visual jitter.
- **`AntiPingWeapons()`** — predicts weapon effects (projectiles, grenades).
- **`ClAntiPingSmooth`** — smooths misprediction corrections over time instead of snapping.
- Prediction error smoothing: `PredErr = (LastPos - NewPos) / min(PredictionTime, 200)`, applied over `SmoothPace = 4 - 1.5 * PredTime/800` for gradual visual correction.
- Smoothing capped at 700ms, with no more than 300ms difference between X and Y axes.

#### Pre-Input System
- **`OnClientPredictedEarlyInput`** — server processes inputs one tick early for responsive gameplay.
- `SvPreInput` config enables/disables pre-input broadcasting.
- `CNetMsg_Sv_PreInput` message carries pre-input data to other clients.

#### Prediction Configuration
- Server advertises prediction capabilities via `GAMEINFOFLAG_PREDICT_*` flags: `PREDICT_FNG`, `PREDICT_DDRACE`, `PREDICT_DDRACE_TILES`, `PREDICT_VANILLA`, `PREDICT_EVENTS`.
- Client configures prediction based on game mode: `m_WorldConfig.m_PredictWeapons`, `m_WorldConfig.m_PredictFreeze`, `m_WorldConfig.m_PredictTiles`.

#### Relevance to Iron Curtain
| Pattern                    | Applicable?           | Notes                                                                                                                                                |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snap-rate recovery         | **Medium**            | IC's relay model owns tick cadence, but snap-rate recovery is useful for spectators/observers who fall behind.                                       |
| Prediction smoothing       | **Yes, for Rollback** | IC's rollback mode should smooth corrections over time, not snap. DDNet's time-scaled smoothing formula is well-tested.                              |
| Pre-input system           | **Low**               | In lockstep, inputs are batched per-tick. But pre-input could reduce perceived latency by 1 tick in relay mode.                                      |
| Prediction configurability | **Yes**               | IC should make prediction behavior per-system-configurable, not all-or-nothing. Weapons, movement, and death can have different prediction policies. |
| Dual world architecture    | **Yes**               | Validates the pattern for IC's rollback mode. DDNet, Hypersomnia, and Bones all use variants of this.                                                |

---

### 9. Fish Folk Jumpy / Bones Framework (Rust)

**Repo:** `fishfolk/jumpy` + `fishfolk/bones` | **Model:** GGRS (GGPO) rollback networking | **Genre:** 2D fighting/platformer

This is **the closest architectural match** to Iron Curtain — it's a Rust game using an ECS framework with rollback networking. The networking is implemented in the `bones_framework` crate.

#### GGRS Integration
- `GgrsSessionRunner` implements the `SessionRunner` trait, wrapping a `ggrs::P2PSession`.
- `GgrsConfig` uses `type State = World` — the entire ECS world IS the rollback state.
- Snapshot via `world.clone()` — bones ECS is designed for cheap cloning.
- Restore via `world.load_snapshot(cell.load())`.

#### Key Constants
```rust
NETWORK_FRAME_RATE_FACTOR: f32 = 0.9;        // Slightly slower FPS for online to reduce bandwidth
NETWORK_MAX_PREDICTION_WINDOW_DEFAULT: usize = 7;  // Max frames ahead of confirmed
NETWORK_LOCAL_INPUT_DELAY_DEFAULT: usize = 2;       // Frames of local input delay
```

#### Frame Management
- `accumulator` pattern for fixed-timestep with variable render rate.
- `WaitRecommendation { skip_frames }` — GGRS tells the runner to skip frames so slower peers can catch up.
- `PredictionThreshold` — freezes game when max prediction window exceeded, with `net-debug` visualization.

#### Desync Detection
- `ggrs::GgrsEvent::DesyncDetected { frame, local_checksum, remote_checksum, addr }` — reports frame number and both checksums.
- Logged but not auto-resolved (no auto-resync — game continues diverged).

#### Session Restart Pattern
- `restart_session()` increments `match_id` on the socket to filter stale in-flight messages: `self.socket.increment_match_id()`. This prevents messages from a previous match from contaminating the new session.

#### Disconnected Player Handling
- `DisconnectedPlayers` resource persisted on the session runner (not in the ECS world) to **avoid rollback from changing disconnect state**.
- This is subtle but important: if disconnect state lived in the world, rolling back could "resurrect" a disconnected player.

#### Network Debug Visualization
- Full egui-based debug overlay:
  - Bar chart of predicted frames per update.
  - Highlights freezes (prediction threshold hit).
  - Per-player `NetworkStats` display (send queue, ping, kbps, frames behind).
  - Player sync state tracking (SyncInProgress / Synchronized).

#### Deterministic ECS Design
- Bones ECS is **deterministic by default** — this is a design goal, not an afterthought.
- `HasSchema` trait enables runtime reflection AND deterministic serialization.
- `World::clone()` gives snapshot/restore for free.
- Warning in API: `"Calling this function on World in a Session using network session runner is likely to introduce non-determinism."`

#### Relevance to Iron Curtain
| Pattern                           | Applicable?                  | Notes                                                                                                                                                                                                                        |
| --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `World::clone()` for snapshots    | **Yes, validates IC design** | IC's `snapshot()` / `restore()` via Serialize/Deserialize is close. Bones proves that ECS-world-as-state works for rollback. Bevy doesn't support `World::clone()` natively, so IC will need `Serialize`-based snapshotting. |
| Frame rate reduction for online   | **Consider**                 | `NETWORK_FRAME_RATE_FACTOR = 0.9` — reducing sim rate slightly for online reduces bandwidth. IC could offer this as a lobby option.                                                                                          |
| `match_id` increment on restart   | **Yes**                      | IC should tag orders with a match/session ID to prevent stale messages from contaminating a new session on the same connection.                                                                                              |
| Disconnect state outside rollback | **Yes, critical**            | IC's `RollbackNetwork` must store disconnect status outside the simulation state. Otherwise rollback can resurrect disconnected players.                                                                                     |
| Network debug overlay             | **Yes**                      | IC should build a similar debug overlay showing predicted frames, freezes, and per-player stats. Bones' implementation is a good reference.                                                                                  |
| `max_prediction_window = 7`       | **Calibration data**         | A reasonable default for rollback. IC can use this as a starting point.                                                                                                                                                      |
| `local_input_delay = 2`           | **Calibration data**         | Standard GGPO recommendation. IC should default to 2 frames.                                                                                                                                                                 |

---

### 10. 0 A.D. (C++)

**Repo:** `0ad/0ad` | **Model:** Turn-based lockstep with server relay | **Genre:** RTS

This is the **most architecturally similar** game to Iron Curtain in terms of genre and networking model.

#### Turn Manager Architecture
- `CTurnManager` base class with subclasses: `CLocalTurnManager` (SP), `CNetClientTurnManager` (MP client), `CNetServerTurnManager` (server), `CReplayTurnManager` (replay).
- **`COMMAND_DELAY_MP = 4`** — in MP, commands are delayed by 4 turns.
- **`DEFAULT_TURN_LENGTH = 200ms`** — each turn is 200ms.
- `m_ReadyTurn` tracks the latest turn for which all clients have sent commands.
- `m_QueuedCommands` — deque of per-turn, per-client command maps.

#### Dual Hash Mode — **Important Pattern**
```cpp
bool CTurnManager::TurnNeedsFullHash(u32 turn) const {
    if (turn == 1) return true;          // Always full hash on first turn
    if (turn % 20 == 0) return true;     // Full hash every ~4 seconds (20 turns × 200ms)
    return false;                         // Quick hash for other turns
}
```
- **Quick hash:** Faster, covers a representative subset of state.
- **Full hash:** Complete state serialization + hash. Expensive but definitive.
- The official comment: *"TODO: should probably remove this when we're reasonably sure the game isn't too buggy"* — implying full hashing is a development/debugging tool, not production-required.

#### Server-Side OOS Detection
- Server collects `hash` from each client per turn: `m_ClientStateHashes[turn][client] = hash`.
- Compares all hashes for a given turn. If any differ, creates a `CSyncErrorMessage` listing OOS player names.
- `m_HasSyncError` flag cached on the server, reset when OOS client leaves.
- On OOS, client auto-dumps: serializes full simulation state to `oos_dump.txt` + binary `.dat` file.

#### Time Warp / Rewind
- `EnableTimeWarpRecording(numTurns)` — records state snapshots every N turns.
- `RewindTimeWarp()` — jumps back to latest recorded snapshot.
- Used for debugging — allows replay of the last few turns after a desync.

#### Rejoin System
- `OnJoinSyncStart` → server serializes full game state to a buffer → sends to rejoining client.
- Client receives `m_JoinSyncBuffer`, loads the state, then fast-forwards through queued command batches via `UpdateFastForward()`.
- `OnRejoined` notification broadcast to all connected clients.

#### Lobby/Connection
- XMPP (Jabber) integration for the lobby.
- STUN for NAT traversal: `StunClient::FindPublicIP()`.
- UPnP via `miniupnpc`.
- Password hashing: `HashCryptographically(password, hostJID + password + engineVersion)` — hashed with host name + client name + engine version to prevent rainbow tables.

#### Relevance to Iron Curtain
| Pattern                        | Applicable?          | Notes                                                                                                                                                                                                   |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dual hash mode (quick + full)  | **Yes, high value**  | IC should implement tiered hashing: fast hash every tick (RNG state + unit count + resource totals), full hash every N ticks. This is the most impactful optimization for desync detection performance. |
| OOS state dump                 | **Yes**              | IC should auto-serialize full sim state on desync for offline analysis. Combine with snapshot system.                                                                                                   |
| Time warp recording            | **Yes**              | IC already has `snapshot()`. Adding periodic auto-snapshots (every N turns) for rewind-debugging is straightforward and high-value.                                                                     |
| Rejoin via state serialization | **Yes, planned**     | IC needs this for reconnection. 0 A.D.'s approach (serialize → send → fast-forward) is the standard pattern. Validates IC's design.                                                                     |
| `COMMAND_DELAY_MP = 4`         | **Calibration data** | 0 A.D. uses 4 turns of delay. IC's adaptive run-ahead (from Generals analysis) should target 2-4 ticks depending on latency.                                                                            |
| Per-client hash tracking       | **Yes**              | Server tracking which specific client(s) are OOS is critical for IC's relay server. Don't just know *that* desync happened — know *who* diverged.                                                       |

---

## Cross-Cutting Insights & Recommendations

### 1. Tiered Sync Hashing (HIGH PRIORITY)

**Found in:** 0 A.D. (quick/full), OpenBW (selective subset), Spring (per-frame running checksum)

IC's current design hashes the full simulation state every tick via `state_hash()`. This is correct but expensive. Implement a tiered approach:

| Tier       | Frequency       | What to Hash                                                    | Cost   |
| ---------- | --------------- | --------------------------------------------------------------- | ------ |
| **Fast**   | Every tick      | RNG state + entity count + total resources + active order count | ~µs    |
| **Medium** | Every 8 ticks   | All unit positions + HP + significant state flags               | ~100µs |
| **Full**   | Every 32+ ticks | Complete `Serialize` of entire sim world                        | ~ms    |

The fast hash catches RNG divergence (the most common desync cause). The medium hash catches gameplay bugs. The full hash is definitive but expensive.

### 2. Desync Forensics System (HIGH PRIORITY)

**Found in:** Spring (block-level debugger), 0 A.D. (OOS dump + time warp), Stratagus (auto-save on desync), Hypersomnia (hash-per-step comparison)

IC's current design detects desyncs but provides no tools to diagnose them. Implement:

1. **Auto-snapshot on desync** — when `state_hash` mismatch detected, automatically call `snapshot()` and save to disk.
2. **Component-level hash reporting** — hash each ECS archetype/component group separately, so you can identify which *component type* diverged.
3. **Desync replay** — save the last N ticks of orders + snapshots, enabling offline replay of the divergence point.
4. **`SyncDebug` mode** (inspired by Spring) — in development builds, allow the relay server to request specific component data from each client for comparison.

### 3. Predictability Classification for Rollback (MEDIUM PRIORITY)

**Found in:** Hypersomnia (ALWAYS/NEVER/ONLY_BY), DDNet (per-system prediction flags), SS14 (SendOnlyToOwner)

When IC implements `RollbackNetwork`, classify every system and effect:

```rust
#[derive(Clone, Copy)]
enum Predictability {
    Always,         // Movement, local unit commands
    Never,          // Deaths, spawns, global state changes
    OnlyByOwner,    // Own unit attacks, own building placement
}
```

This prevents embarrassing mispredictions (e.g., predicting an enemy unit death that didn't happen) while keeping local interactions responsive.

### 4. Separate Cosmetic RNG (MEDIUM PRIORITY)

**Found in:** Hypersomnia (documented bug + fix)

IC must ensure that `ic-render` effects (particle spread, sound variation, animation jitter) use a separate RNG stream from `ic-sim`'s deterministic RNG. If they share an RNG, rollback resimulation will produce different cosmetic effects, causing visual glitches even when the simulation is correct.

```rust
// In ic-sim
pub struct SimRng(/* deterministic LCG */);

// In ic-render (NOT synced, NOT rolled back)
pub struct CosmeticRng(/* any fast RNG */);
```

### 5. Conditional Component Visibility for FogAuthoritative (MEDIUM PRIORITY)

**Found in:** SS14 (`SendOnlyToOwner`, `ComponentGetStateAttemptEvent`), Veloren (`SyncFrom` enum)

IC's planned `FogAuthoritativeNetwork` needs per-component, per-player visibility:

```rust
#[derive(Component)]
#[sync(visibility = "fog_of_war")] // Only sent to players who can see this entity
struct Position { x: i32, y: i32 }

#[derive(Component)]
#[sync(visibility = "owner_only")] // Only sent to the owning player
struct ProductionQueue { /* ... */ }

#[derive(Component)]
#[sync(visibility = "always")] // Always sent (e.g., terrain, fog state)
struct TerrainCell { /* ... */ }
```

### 6. Network Debug Overlay (LOW PRIORITY, HIGH VALUE FOR DEVELOPMENT)

**Found in:** Bones/GGRS (full egui overlay), DDNet (prediction visualization), Hypersomnia (network simulator)

Build a development-only debug overlay showing:
- Current tick vs confirmed tick gap
- Per-player latency and sync status
- Order throughput (orders/sec)
- Hash verification status (last match/mismatch)
- Prediction depth for rollback mode

### 7. Session/Match ID for Message Filtering (LOW PRIORITY)

**Found in:** Bones/GGRS (`socket.increment_match_id()`)

When a match restarts on the same connection (rematch), stale in-flight messages from the previous match can corrupt the new session. IC's `ic-protocol` should include a `match_id: u32` in every message, incremented on rematch. The relay server and clients should silently drop messages with stale `match_id`.

---

## Summary Table

| Game              | Lang | Network Model                | Key Patterns for IC                                                                            |
| ----------------- | ---- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Spring Engine     | C++  | Server lockstep              | Block-level sync debugger, synced/unsynced code guards, democracy/dictatorship mode            |
| OpenBW            | C++  | P2P lockstep                 | FNV-1a selective hash, template polymorphism, snapshots                                        |
| Warzone 2100      | C++  | Host-client                  | libsodium identity, auto-desync-kick, lag grace period, spectator transitions                  |
| Stratagus         | C++  | P2P lockstep UDP             | Dual sync check (seed+hash), auto-save on desync, map transfer, file checksums                 |
| Veloren           | Rust | Server-authoritative         | `NetSync` trait, `UpdateTracker<T>`, distance throttling, multi-stream                         |
| Space Station 14  | C#   | Server-authoritative         | Conditional component visibility, `AutoGenerateComponentState`, PVS, NetEntity IDs             |
| Hypersomnia       | C++  | Client prediction + rollback | Dual arena, 3-tier predictability, separate cosmetic RNG, interpolation preservation           |
| DDraceNetwork     | C++  | Server snapshot + prediction | Snap-rate recovery, prediction smoothing, pre-inputs, dual world, per-system prediction config |
| Fish Folk / Bones | Rust | GGRS rollback                | `World::clone()` snapshots, disconnect state outside rollback, match_id, net debug overlay     |
| 0 A.D.            | C++  | Turn-based lockstep          | Dual hash mode (quick/full), per-client OOS tracking, time warp, rejoin via serialization      |

---

## Priority Recommendations for Iron Curtain

### Must-Have (Phase 2)
1. **Tiered sync hashing** — fast per-tick, full periodic
2. **Auto-snapshot on desync** — for debugging
3. **Separate cosmetic RNG** — prevent rollback visual glitches
4. **File/mod checksum validation** — before game start

### Should-Have (Phase 5 — Multiplayer)
5. **Component-level hash reporting** — which component type diverged
6. **Per-client OOS tracking** — server knows *who* desynced
7. **Match/session ID in protocol** — prevent stale message contamination
8. **Desync auto-kick with grace period** — based on counter (Warzone pattern)
9. **Network debug overlay** — development tool

### Nice-to-Have (Phase 5+ / Rollback)
10. **Predictability classification** — per-system prediction policy
11. **Conditional component visibility** — for FogAuthoritative
12. **Prediction smoothing** — DDNet's time-scaled correction formula
13. **Disconnect state outside rollback** — prevent ghost resurrection
14. **Time warp recording** — periodic auto-snapshots for rewind debugging
