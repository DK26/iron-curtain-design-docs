## Network Experience Guide

### Why This Exists

This page explains two things:

1. How Iron Curtain multiplayer netcode works at a player level.
2. Which user-side optimizations improve your experience without hurting fairness.

### How Multiplayer Netcode Works (Player Version)

Iron Curtain multiplayer uses one gameplay model: relay-assisted lockstep with sub-tick order fairness.

1. **Relay time authority:** The relay decides canonical timing for orders. This prevents host advantage and lag-switch abuse.
2. **Deterministic lockstep sim:** Everyone advances the same sim tick with the same validated order set.
3. **Sub-tick ordering inside a tick:** If two actions land in the same tick, relay-normalized sub-tick timing resolves who acted first.
4. **Match-start calibration + bounded adaptation:** During loading, the relay calibrates latency/jitter and sets shared starting timing. During play, it adapts within bounded queue policy envelopes.
5. **Match-global fairness rules:** Deadline/run-ahead are match-global. Per-player assist is for submit timing only, not priority overrides.

### Should We Allow User-Side Optimization?

Yes, but only where it improves stability and responsiveness without changing fairness semantics.

**Allow and encourage:**

- Network quality improvements (wired Ethernet, stable Wi-Fi, reduced background upload traffic).
- Client performance stability improvements (steady frame time, fewer CPU/GPU spikes).
- UI/graphics adjustments that reduce local frame drops and input-to-display delay.
- Diagnostics visibility for troubleshooting (`net.show_diagnostics`, advanced/power-user path).

**Do not expose as player gameplay knobs (especially ranked):**

- `tick_rate`, `tick_deadline`, `run_ahead`, or sub-tick on/off.
- Per-player fairness overrides ("favor local input", "extra lag compensation for me").
- Any setting that changes contested-action arbitration semantics.

The design goal is simple: optimize delivery quality locally, keep fairness rules universal.

### Practical Tips That Usually Help

#### 1. Network Path Quality

- Prefer wired Ethernet over Wi-Fi for ranked/competitive sessions.
- If on Wi-Fi, prefer 5/6 GHz with strong signal and minimal interference.
- Avoid VPN/proxy routes during matches unless required for connectivity.
- Pause cloud backups, large downloads, and upstream-heavy apps while playing.

#### 2. Frame-Time Stability

- Use a graphics profile that keeps frame time stable during large battles.
- Avoid settings that cause periodic frame spikes (heavy post-FX, background captures).
- Keep OS power mode on performance while in match.
- Close CPU-heavy background apps before queueing.

#### 3. Match Choice / Region

- Prefer lobbies or queues with nearby relay region when possible.
- For custom/community play in high-latency regions, use casual envelopes rather than ranked-tight settings.

#### 4. Learn the Timing Signal

If you see `Late order (+N ms)` repeatedly:

- Treat it as an arrival-timing warning, not a bug in tie-breaking.
- First check network upload/jitter sources.
- Then check local frame-time spikes.

### What This Cannot Magically Fix

- Very high persistent latency.
- Severe packet loss/jitter.
- Hardware that cannot maintain stable simulation/render budgets.

The system is designed to be resilient up to defined envelopes, not to make unstable links equivalent to stable ones.

### Quick Pre-Ranked Checklist

- Wired connection (or very stable Wi-Fi).
- Background uploads/downloads paused.
- Stable performance profile selected.
- No VPN unless necessary.
- Optional: diagnostics overlay checked before queueing.

### Related Docs

- Netcode architecture: `03-NETCODE.md`
- Netcode exposure policy: `decisions/09b/D060-netcode-params.md`
- In-game timing feedback UX: `player-flow/in-game.md`
- Server/operator tuning: `15-SERVER-GUIDE.md`
