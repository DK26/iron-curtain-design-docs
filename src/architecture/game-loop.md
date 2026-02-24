## Game Loop

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

        // 2. Advance sim as far as confirmed orders allow
        while let Some(tick_orders) = self.network.poll_tick() {
            self.sim.apply_tick(&tick_orders);
            self.network.report_sync_hash(
                self.sim.tick(),
                self.sim.state_hash(),
            );
        }

        // 3. Render always runs, interpolates between sim states
        self.renderer.draw(&self.sim, self.interpolation_factor());
    }
}
```

**Key property:** `GameLoop` is generic over `N: NetworkModel` and `I: InputSource`. It has zero knowledge of whether it's running single-player or multiplayer, or whether input comes from a mouse, touchscreen, or gamepad. This is the central architectural guarantee.

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
