# Development Tools

### Network Simulation

Inspired by Generals' debug network simulation features, all `NetworkModel` implementations support artificial network condition injection:

```rust
/// Configurable network conditions for testing. Applied at the transport layer.
/// Only available in debug/development builds — compiled out of release.
pub struct NetworkSimConfig {
    pub latency_ms: u32,          // Artificial one-way latency added to each packet
    pub jitter_ms: u32,           // Random ± jitter on top of latency
    pub packet_loss_pct: f32,     // Percentage of packets silently dropped (0.0–100.0)
    pub corruption_pct: f32,      // Percentage of packets with random bit flips
    pub bandwidth_limit_kbps: Option<u32>,  // Throttle outgoing bandwidth
    pub duplicate_pct: f32,       // Percentage of packets sent twice
    pub reorder_pct: f32,         // Percentage of packets delivered out of order
}
```

This is invaluable for testing edge cases (desync under packet loss, adaptive run-ahead behavior, frame resend logic) without needing actual bad networks. Accessible via debug console or lobby settings in development builds.

### Diagnostic Overlay

A real-time network health display (inspired by Quake 3's lagometer) renders as a debug overlay in development builds:

- **Tick timing bar** — shows how long each sim tick takes to process, with color coding (green = within budget, yellow = approaching limit, red = over budget)
- **Order delivery timeline** — visualizes when each player's orders arrive relative to the tick deadline. Highlights late arrivals and idle substitutions.
- **Sync health** — shows RNG hash match/mismatch per sync frame. A red flash on mismatch gives immediate visual feedback during desync debugging.
- **Latency graph** — per-player RTT history (rolling 60 ticks). Shows jitter, trends, and spikes.

The overlay is toggled via debug console (`net_diag 1`) and compiled out of release builds. It uses the same data already collected by `NetworkDiagnostics` — no additional overhead.

### Netcode Parameter Philosophy (D060)

Netcode parameters are **not** like graphics settings. Graphics preferences are subjective; netcode parameters have objectively correct values — or correct adaptive algorithms. A cross-game survey (C&C Generals, StarCraft/BW, Spring Engine, 0 A.D., OpenTTD, Factorio, CS2, AoE II:DE, original Red Alert) confirms that games which expose fewer netcode controls and invest in automatic adaptation have fewer player complaints and better perceived netcode quality.

IC follows a three-tier exposure model:

| Tier                         | Player-Facing Examples                                                                                                                                                               | Exposure                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Tier 1: Lobby GUI**        | Game speed (Slowest–Fastest)                                                                                                                                                         | One setting. The only parameter where player preference is legitimate.      |
| **Tier 2: Console**          | `net.sync_frequency`, `net.show_diagnostics`, `net.desync_debug_level`, `net.simulate_latency/loss/jitter`                                                                           | Power users only. Flagged `DEV_ONLY` or `SERVER` in the cvar system (D058). |
| **Tier 3: Engine constants** | Tick rate (set by game speed preset; default Slower ≈15 tps), sub-tick ordering, adaptive run-ahead, timing feedback, stall policy (never stall), anti-lag-switch, visual prediction | Fixed. These are correct engineering solutions, not preferences.            |

**Sub-tick ordering (D008) is always-on.** Cost: ~4 bytes per order + one sort of typically ≤5 items per tick. The mechanism is automatic, but the outcome is player-facing — who wins the engineer race, who grabs the contested crate, whose attack resolves first. These moments define close games. Making it optional would require two sim code paths, a deterministic fallback that's inherently unfair (player ID tiebreak), and a lobby setting nobody understands.

**Adaptive run-ahead is always-on.** Generals proved this over 20 years. Manual latency settings (StarCraft BW's Low/High/Extra High) were necessary only because BW lacked adaptive run-ahead. IC's adaptive system replaces the manual knob with a better automatic one.

**Visual prediction is always-on.** Factorio originally offered a "latency hiding" toggle. They removed it in 0.14.0 because always-on was always better — there was no situation where the player benefited from seeing raw lockstep delay.

Full rationale, cross-game evidence table, and alternatives considered: see `decisions/09b/D060-netcode-params.md`.
