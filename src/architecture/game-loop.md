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

**Key property:** `GameLoop` is generic over `N: NetworkModel` and `I: InputSource`. It has zero knowledge of whether it's running single-player or multiplayer, or whether input comes from a mouse, touchscreen, or gamepad. This is the central architectural guarantee.

**Lockstep-family only.** The `GameLoop` shown above is the **lockstep client loop** — it owns a full `Simulation` and calls `sim.apply_tick()` with confirmed orders from `poll_tick()`. This covers all shipping implementations: `LocalNetwork`, `ReplayPlayback`, `EmbeddedRelayNetwork`, and `RelayLockstepNetwork`. Deferred non-lockstep architectures (FogAuth, rollback) require a different client-side loop variant — FogAuth clients do not run the full sim but instead maintain a partial world via a reconciler (see `research/fog-authoritative-server-design.md` § 7), and rollback clients need speculative execution with snapshot/restore. The `NetworkModel` trait and `ic-server` capability infrastructure are designed to support these variants from day one, but the `GameLoop` struct itself would need a parallel implementation (e.g., `FogAuthGameLoop`) or an enum-based client driver. This is an `M11` design concern — the current `GameLoop` is complete and correct for all pre-`M11` milestones.

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
- **InGame → GameEnded:** Victory/defeat condition met, player surrenders (`PlayerOrder::Surrender`), vote-driven resolution (kick, remake, draw via the In-Match Vote Framework), or match void. See `03-NETCODE.md` § "Match Lifecycle" for the surrender mechanic, team vote thresholds, and the generic callvote system.
- **GameEnded → InMenus:** Return to main menu (post-game stats shown during transition). See `03-NETCODE.md` § "Post-Game Flow" for the 30-second post-game lobby with stats, rating display, and re-queue.
- **GameEnded → InReplay:** Watch the just-finished game (replay file already recorded)
- **InMenus → InReplay:** Load a saved replay file
- **InReplay → InMenus:** Exit replay viewer
- **InGame → Shutdown:** Application exit (snapshot saved for resume on platforms that require it)

State transitions are events in Bevy's event system — plugins react to transitions without polling. The sim exists only during `InGame` and `InReplay`; all other states are menu/UI-only.

**D069 integration:** The installation/setup wizard is modeled as an **`InMenus` subflow** (UI-only) rather than a separate app state that changes sim/network invariants. Platform/store installers may precede launch, but IC-controlled setup runs after `Launched → InMenus` using platform capability metadata (see `PlatformInstallerCapabilities` in [platform-portability.md](platform-portability.md)).
