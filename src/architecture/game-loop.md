## Game Loop

`GameLoop` is the **client-side** frame loop — it always has a renderer and always draws. Headless consumers (dedicated servers, bot harnesses, automated tests) drive `Simulation` directly via its public API (see `02-ARCHITECTURE.md` § External Sim API) and never instantiate `GameLoop`.

```rust
pub struct GameLoop<N: NetworkModel, I: InputSource> {
    sim: Simulation,
    renderer: Renderer,
    network: N,
    input: I,
    local_player: PlayerId,
    order_buf: Vec<TimestampedOrder>,  // reused across frames — zero allocation on hot path
}

impl<N: NetworkModel, I: InputSource> GameLoop<N, I> {
    fn frame(&mut self) {
        // 1. Gather local input with sub-tick timestamps
        self.input.drain_orders(&mut self.order_buf);
        for order in self.order_buf.drain(..) {
            self.network.submit_order(order);
        }

        // 2. Advance sim — bounded to avoid starving the renderer.
        //    At default Slower speed (~15 tps) / 60 fps, most frames process 0-1 ticks.
        //    The cap handles edge cases (e.g., multiplayer reconnect backlog,
        //    system sleep resume) where many ticks are ready at once.
        const MAX_TICKS_PER_FRAME: u32 = 4;
        let mut ticks_this_frame = 0;
        while let Some(tick_orders) = self.network.poll_tick() {
            self.sim.apply_tick(&tick_orders);
            self.network.report_sync_hash(
                self.sim.tick(),
                self.sim.state_hash(),
            );
            // Full SHA-256 hash at signing cadence for replay signatures
            if self.sim.tick().0 % SIGNING_CADENCE == 0 {
                self.network.report_state_hash(
                    self.sim.tick(),
                    self.sim.full_state_hash(),
                );
            }
            // If the sim transitioned to GameEnded this tick, report
            // the outcome to the network layer for relay consensus.
            // Also emit a final state hash for the terminal tick
            // regardless of signing cadence (see match-end signing below).
            if let Some(outcome) = self.sim.match_outcome() {
                self.network.report_state_hash(
                    self.sim.tick(),
                    self.sim.full_state_hash(),
                );
                self.network.report_game_ended(self.sim.tick(), outcome);
                break; // No more ticks — match is over
            }
            ticks_this_frame += 1;
            if ticks_this_frame >= MAX_TICKS_PER_FRAME {
                break; // Remaining ticks processed next frame
            }
        }

        // 3. Render always runs, interpolates between sim states
        self.renderer.draw(&self.sim, self.interpolation_factor());
    }
}
```

**Match-end signing and outcome reporting:** When a match ends (surrender vote, elimination, disconnect — see `netcode/match-lifecycle.md`), the game loop detects the sim's `GameEnded` state via `sim.match_outcome()`, emits a final `report_state_hash()` for the terminal tick regardless of signing cadence, and calls `report_game_ended()` to send the outcome to the relay for consensus verification. This ensures the relay's `TickSignature` chain covers the complete match with no unsigned tail (see `formats/save-replay-formats.md` § Signature Chain), and enables the relay to produce a `CertifiedMatchResult` from client consensus on sim-determined outcomes (see `netcode/wire-format.md` § `Frame::GameEndedReport`).

**Key property:** `GameLoop` is generic over `N: NetworkModel` and `I: InputSource`. It has zero knowledge of whether it's running single-player or multiplayer, or whether input comes from a mouse, touchscreen, or gamepad. This is the central architectural guarantee.

**Lockstep-family only.** The `GameLoop` shown above is the **lockstep client loop** — it owns a full `Simulation` and calls `sim.apply_tick()` with confirmed orders from `poll_tick()`. This covers all shipping implementations: `LocalNetwork`, `ReplayPlayback`, `EmbeddedRelayNetwork`, and `RelayLockstepNetwork`. Deferred non-lockstep architectures (FogAuth, rollback) require a different client-side loop variant — FogAuth clients do not run the full sim but instead maintain a partial world via a reconciler (see `research/fog-authoritative-server-design.md` § 7), and rollback clients need speculative execution with snapshot/restore. The `NetworkModel` trait and `ic-server` capability infrastructure are designed to support these variants from day one, but the `GameLoop` struct itself would need a parallel implementation (e.g., `FogAuthGameLoop`) or an enum-based client driver. This is an `M11` design concern (pending decision `P007`) — the current `GameLoop` is complete and correct for all pre-`M11` milestones.

**Not for headless use.** `GameLoop` always renders — it is the client-side frame driver. `ic-server` runs the relay protocol without any `GameLoop` or `Simulation` instance. External bot/test harnesses use the external sim API (`inject_orders()` + `step()`) in their own loop — see `02-ARCHITECTURE.md` § External Sim API for a concrete headless loop example. The sim's headless capability is a property of `ic-sim`, not of `GameLoop`.

### Game Lifecycle State Machine

The game application transitions through a fixed set of states. Design informed by SC2's protocol state machine (see `research/blizzard-github-analysis.md` § Part 1), adapted for IC's architecture:

```
┌──────────┐     ┌───────────┐     ┌─────────┐     ┌───────────┐
│ Launched │────▸│ InMenus   │────▸│ Loading │────▸│ InGame    │
└──────────┘     └───────────┘     └─────────┘     └───────────┘
                   ▲     │                            │       │
                   │     │                            │       │
                   │     ▼                            ▼       │
                   │   ┌───────────┐          ┌───────────┐   │
                   │   │ InReplay  │◂─────────│ GameEnded │   │
                   │   └───────────┘          └───────────┘   │
                   │         │                    │           │
                   └─────────┴────────────────────┘           │
                                                              ▼
                                                        ┌──────────┐
                                                        │ Shutdown │
                                                        └──────────┘
```

- **Launched → InMenus:** Engine initialization, asset loading, mod registration, and (when required) entry into the first-run setup wizard / setup assistant flow (D069). This remains menu/UI-only — no sim world exists yet.
- **InMenus → Loading:** Player starts a game or joins a lobby; map and rules are loaded
- **Loading → InGame:** All assets loaded, `NetworkModel` connected, sim initialized. See `03-NETCODE.md` § "Match Lifecycle" for the ready-check and countdown protocol that governs this transition in multiplayer.
- **InGame → GameEnded:** Victory/defeat condition met, player surrenders (via the In-Match Vote Framework — `PlayerOrder::Vote(VoteOrder::Propose { vote_type: Surrender })`), vote-driven resolution (kick, remake, draw), or match void. See `03-NETCODE.md` § "Match Lifecycle" for the surrender mechanic, team vote thresholds, and the generic callvote system.
- **GameEnded → InMenus:** Return to main menu. `GameEnded` IS the post-game screen: the 5-minute post-game lobby with stats display, chat, rating update, re-queue option, and replay save runs during this state (see `03-NETCODE.md` § "Post-Game Flow"). Maps to `NetworkStatus::PostGame(CertifiedMatchResult)`. The transition to `InMenus` occurs on user action (leave/re-queue) or lobby timeout.
- **GameEnded → InReplay:** Watch the just-finished game (`.icrep` is incrementally valid during recording — the viewer opens it immediately; the finalized archival header is written when the background writer flushes)
- **InMenus → InReplay:** Load a saved replay file
- **InReplay → InMenus:** Exit replay viewer
- **InGame → Shutdown:** Application exit (snapshot saved for resume on platforms that require it)

State transitions are events in Bevy's event system — plugins react to transitions without polling. The sim exists only during `InGame` and `InReplay`; all other states are menu/UI-only.

**D069 integration:** The installation/setup wizard is modeled as an **`InMenus` subflow** (UI-only) rather than a separate app state that changes sim/network invariants. Platform/store installers may precede launch, but IC-controlled setup runs after `Launched → InMenus` using platform capability metadata (see `PlatformInstallerCapabilities` in [platform-portability.md](platform-portability.md)).

### Match Cleanup & World Reset

When transitioning out of `InGame` or `InReplay` back to `InMenus`, the client must guarantee zero state leakage between matches. State leakage (lingering entities, stale resources, un-cleared caches) is a known class of "desync on match 2 but not match 1" bugs in RTS engines.

**Strategy: drop and recreate.** The `Simulation` (which owns the Bevy `World` containing all ECS entities, components, and sim resources) is **dropped** on match exit, not incrementally cleaned. A fresh `Simulation` is constructed on the next `Loading → InGame` transition. This is the simplest correct approach — it is impossible for state to leak across a drop boundary.

**What is dropped:**
- The entire Bevy `World` (all entities, components, resources) inside `Simulation`
- The `UnitPool` (tag allocator resets — new match starts at generation 0)
- All WASM mod instances (sandbox VMs are terminated and re-instantiated for the next match)
- Lua script state (VMs are dropped; fresh VMs created on next match load)
- Campaign runner state in `GameRunner` (replaced by new `CampaignState` or `None`)

**What survives across matches:**
- Bevy `AssetServer` and loaded asset handles (textures, audio, meshes) — these live in the outer Bevy `App`, not inside `Simulation`. Assets are shared across matches; the asset server's reference counting handles unloading when no match references them.
- Player settings, keybindings, UI theme state (menu-layer resources)
- Network connection to the relay (for re-queue / rematch without reconnection)
- Mod registry and `GameModule` registration (module switching requires returning to `InMenus` and re-entering `Loading` with the new module)

**Module switching (e.g., RA1 → TD):** Requires a full return to `InMenus`. The `GameModule` registration is re-run during `Loading` for the new module. Because `Simulation` is dropped between matches, module-specific ECS components from the previous game are already gone. Asset handles for the previous module are released when their reference counts reach zero (Bevy's standard asset lifecycle).
