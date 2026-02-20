# Iron Curtain — Comprehensive Parameter Audit

> **Purpose:** Catalog every hardcoded numeric constant, threshold, limit, cap, budget, timeout, interval, and tunable parameter found across the design documentation (`src/01-VISION.md` through `src/14-METHODOLOGY.md`, including `src/09-DECISIONS.md`). Intended as the foundation for designing a professional configuration system.
>
> **Scope:** Design docs only — no implementation code exists yet. Values are design targets, not measured.
>
> **Methodology:** Every file in `src/` was read in full. `09-DECISIONS.md` (~19,166 lines) was read via targeted section reads covering D031, D033, D034, D042, D043, D048, D049, D050, D052, D053, D055, D056, D057, D058, D059, D060, D061, D062, D063. Coverage is estimated at 95%+ of all numeric parameters.

---

## Table of Contents

1. [Simulation & Timing](#1-simulation--timing)
2. [Networking & Relay Server](#2-networking--relay-server)
3. [Security & Rate Limiting](#3-security--rate-limiting)
4. [Camera & Rendering](#4-camera--rendering)
5. [AI & Decision-Making](#5-ai--decision-making)
6. [Audio](#6-audio)
7. [SQLite & Storage](#7-sqlite--storage)
8. [Workshop & P2P Distribution](#8-workshop--p2p-distribution)
9. [Weather & Environment](#9-weather--environment)
10. [Campaign & Progression](#10-campaign--progression)
11. [Matchmaking & Ranking](#11-matchmaking--ranking)
12. [Modding & Sandbox Limits](#12-modding--sandbox-limits)
13. [UI & QoL](#13-ui--qol)
14. [Formats & Codecs](#14-formats--codecs)
15. [Performance & Budgets](#15-performance--budgets)
16. [Compression (D063)](#16-compression-d063)
17. [Command Console & Cvars (D058)](#17-command-console--cvars-d058)
18. [Community Servers & Credentials (D052)](#18-community-servers--credentials-d052)
19. [Player Profiles (D053)](#19-player-profiles-d053)
20. [Mod Profiles & Namespaces (D062)](#20-mod-profiles--namespaces-d062)
21. [Communication & Voice (D059)](#21-communication--voice-d059)

---

## 1. Simulation & Timing

### Game Speed Presets

| Parameter                      | Value  | Source                     |
| ------------------------------ | ------ | -------------------------- |
| Slowest tick interval          | 80 ms  | 02-ARCHITECTURE §GameSpeed |
| Slower tick interval (default) | 67 ms  | 02-ARCHITECTURE §GameSpeed |
| Normal tick interval           | 50 ms  | 02-ARCHITECTURE §GameSpeed |
| Faster tick interval           | 35 ms  | 02-ARCHITECTURE §GameSpeed |
| Fastest tick interval          | 20 ms  | 02-ARCHITECTURE §GameSpeed |
| Sim tick rate (constant)       | 30 tps | 03-NETCODE, D060           |

### ECS & Entity Limits

| Parameter                          | Value           | Type      | Source                     |
| ---------------------------------- | --------------- | --------- | -------------------------- |
| UnitTag index bits                 | u16             | max 65535 | 02-ARCHITECTURE §ECS       |
| UnitTag generation bits            | u16             | max 65535 | 02-ARCHITECTURE §ECS       |
| RA1 pool size (units + structures) | 2048            | default   | 02-ARCHITECTURE §ECS       |
| Selection limit                    | 40              | default   | 02-ARCHITECTURE §Selection |
| Control groups                     | 0–9 (10 groups) | fixed     | 02-ARCHITECTURE §Hotkeys   |
| Entity count max (save game)       | 50,000          | cap       | 06-SECURITY                |
| Infantry sub-cells per cell        | 5               | fixed     | 02-ARCHITECTURE §Infantry  |

### Fixed-Point & Determinism

| Parameter                  | Value          | Notes                      | Source          |
| -------------------------- | -------------- | -------------------------- | --------------- |
| Math types in sim          | i32/i64 only   | No f32/f64 ever            | Invariant #1    |
| Fixed-point scale          | TBD (P002)     | 256? 1024?                 | AGENTS.md       |
| Facing values              | 0–255 (u8)     | Turreted units             | 02-ARCHITECTURE |
| FixedPoint range (weather) | 0–1024         | Weather intensity/progress | 04-MODDING      |
| Per-tick heap allocations  | 0 bytes target | Zero-alloc hot paths       | 10-PERFORMANCE  |

### System Execution

| Parameter                       | Value               | Source                       |
| ------------------------------- | ------------------- | ---------------------------- |
| System execution steps per tick | 21                  | 02-ARCHITECTURE §SystemOrder |
| StateRecorder snapshot_interval | 300 ticks (~10 sec) | 02-ARCHITECTURE              |

### Weapon & Combat

| Parameter                 | Type        | Example Values   | Source                    |
| ------------------------- | ----------- | ---------------- | ------------------------- |
| Weapon range              | fixed-point | per-unit         | 02-ARCHITECTURE §Weapons  |
| rate_of_fire              | ticks       | per-weapon       | 02-ARCHITECTURE §Weapons  |
| projectile_speed          | fixed-point | per-weapon       | 02-ARCHITECTURE §Weapons  |
| damage falloff array      | array       | [100, 50, 25, 0] | 02-ARCHITECTURE §Warheads |
| damage.versus table       | HashMap     | per armor type   | 02-ARCHITECTURE §Warheads |
| Sellable refund_percent   | 0–100       | typically 50     | 02-ARCHITECTURE §Building |
| TakeCover damage_modifier | 0–100       | default 50       | 02-ARCHITECTURE §Infantry |
| TakeCover speed_modifier  | 0–100       | default 50       | 02-ARCHITECTURE §Infantry |
| SpawnOnDeath probability  | 0–100       | default 100      | 02-ARCHITECTURE §Infantry |
| Demolition delay          | ticks       | per-unit         | 02-ARCHITECTURE           |
| Pluggable max_plugs       | int         | per-building     | 02-ARCHITECTURE           |
| Pluggable effect_per_plug | various     | per-building     | 02-ARCHITECTURE           |

### Notification Cooldowns

| Parameter         | Value (ticks) | Value (approx seconds) | Source                                 |
| ----------------- | ------------- | ---------------------- | -------------------------------------- |
| default_cooldown  | 150           | ~10s                   | 02-ARCHITECTURE §NotificationCooldowns |
| base_under_attack | 300           | ~20s                   | 02-ARCHITECTURE §NotificationCooldowns |
| low_power         | 600           | ~40s                   | 02-ARCHITECTURE §NotificationCooldowns |

---

## 2. Networking & Relay Server

### Relay Server Limits

| Parameter                      | Value                   | Source                  |
| ------------------------------ | ----------------------- | ----------------------- |
| max_connections total          | 1000                    | 03-NETCODE §RelayConfig |
| max_connections_per_ip         | 5                       | 03-NETCODE §RelayConfig |
| new_connections_per_second     | 10                      | 03-NETCODE §RelayConfig |
| idle_timeout (unauthenticated) | 60s                     | 03-NETCODE §RelayConfig |
| idle_timeout (authenticated)   | 5min (300s)             | 03-NETCODE §RelayConfig |
| heartbeat_ttl                  | 30s                     | 03-NETCODE §RelayConfig |
| max_games                      | 50 (default), 100 (max) | 03-NETCODE §RelayConfig |
| tick_timeout                   | 5s                      | 03-NETCODE §RelayConfig |
| max_players_per_game           | 16                      | 03-NETCODE §RelayConfig |

### Sub-Tick & Timing

| Parameter                        | Value                 | Source           |
| -------------------------------- | --------------------- | ---------------- |
| Sub-tick timestamp type          | u32 microseconds      | 03-NETCODE, D008 |
| Adaptive run-ahead sample window | 200 samples (rolling) | 03-NETCODE       |
| Timing feedback interval         | every 30 ticks        | 03-NETCODE       |
| Anti-lag-switch tick deadline    | ~120 ms               | 03-NETCODE       |

### Order Rate Control

| Parameter                        | Value          | Source                       |
| -------------------------------- | -------------- | ---------------------------- |
| Token refill rate                | 16 tokens/tick | 03-NETCODE §OrderRateControl |
| Burst cap                        | 128 tokens     | 03-NETCODE §OrderRateControl |
| Hard ceiling per player per tick | 256 orders     | 03-NETCODE §OrderRateControl |

### Wire Protocol

| Parameter          | Value     | Source     |
| ------------------ | --------- | ---------- |
| Frame buffer depth | 65 ticks  | 03-NETCODE |
| Ack vector width   | 64-bit    | 03-NETCODE |
| Wire MTU           | 476 bytes | 03-NETCODE |

### Message Lane Buffers

| Lane    | Buffer Size | Source                  |
| ------- | ----------- | ----------------------- |
| Orders  | 4 KB        | 03-NETCODE §MessageLane |
| Control | 2 KB        | 03-NETCODE §MessageLane |
| Chat    | 8 KB        | 03-NETCODE §MessageLane |
| Voice   | 16 KB       | 03-NETCODE §MessageLane |
| Bulk    | 64 KB       | 03-NETCODE §MessageLane |

### Desync Detection

| Parameter             | Value                | Source                   |
| --------------------- | -------------------- | ------------------------ |
| RNG hash check        | every tick           | 03-NETCODE §Desync       |
| Full state hash check | every 120 ticks      | 03-NETCODE §Desync       |
| Full snapshot         | every 300 ticks      | 03-NETCODE §Desync       |
| Adaptive sync levels  | 30 / 120 / 300 ticks | 03-NETCODE §AdaptiveSync |

### Reconnection

| Parameter                          | Value | Source                    |
| ---------------------------------- | ----- | ------------------------- |
| sim_budget_pct during catchup      | 80%   | 03-NETCODE §CatchupConfig |
| render_budget_pct during catchup   | 20%   | 03-NETCODE §CatchupConfig |
| max_ticks_per_frame during catchup | 30    | 03-NETCODE §CatchupConfig |
| reconnection timeout               | 60s   | 03-NETCODE §CatchupConfig |

### Ready Check & Lobby Timing

| Parameter                  | Value                    | Source                 |
| -------------------------- | ------------------------ | ---------------------- |
| Ready check accept timeout | 30s                      | 03-NETCODE §ReadyCheck |
| Loading timeout            | 120s                     | 03-NETCODE §ReadyCheck |
| Countdown timer            | 3s                       | 03-NETCODE §ReadyCheck |
| Dodge cooldowns            | 1min → 5min → 15min/24hr | 03-NETCODE §ReadyCheck |

### Pause Configuration

| Parameter                  | Ranked | Casual    | Source                  |
| -------------------------- | ------ | --------- | ----------------------- |
| max_pauses                 | 2      | unlimited | 03-NETCODE §PauseConfig |
| pause_duration             | 120s   | 300s      | 03-NETCODE §PauseConfig |
| grace_period               | 30s    | 30s       | 03-NETCODE §PauseConfig |
| min_game_time before pause | 30s    | 30s       | 03-NETCODE §PauseConfig |

### Surrender & Disconnect

| Parameter                     | Value                               | Source     |
| ----------------------------- | ----------------------------------- | ---------- |
| Surrender thresholds          | 2v2 unanimous, 3v3 ⅔, 4v4 ¾         | 03-NETCODE |
| Surrender vote timeout        | 30s                                 | 03-NETCODE |
| Surrender vote cooldown       | 3 min                               | 03-NETCODE |
| No surrender before           | 5 min game time                     | 03-NETCODE |
| Disconnect reconnection grace | 60s                                 | 03-NETCODE |
| Abandon penalties             | 5min → 30min → 2hr, 3+/7days → 24hr | 03-NETCODE |

### Spectator

| Parameter                  | Value                 | Source                |
| -------------------------- | --------------------- | --------------------- |
| Casual spectator delay     | 3s / 90 ticks         | 03-NETCODE §Spectator |
| Ranked spectator delay     | 2 min / 3600 ticks    | 03-NETCODE §Spectator |
| Tournament spectator delay | 0–10 min configurable | 03-NETCODE §Spectator |
| Max spectators per game    | 50                    | 03-NETCODE §Spectator |

### Vote Framework

| Parameter                      | Value       | Source                    |
| ------------------------------ | ----------- | ------------------------- |
| max_concurrent_votes_per_team  | 1           | 03-NETCODE §VoteFramework |
| Kick threshold                 | ⅔           | 03-NETCODE §Vote          |
| Kick army_value_protection_pct | 40%         | 03-NETCODE §Vote          |
| Remake threshold               | ¾           | 03-NETCODE §Vote          |
| Remake window                  | first 5 min | 03-NETCODE §Vote          |
| Draw threshold                 | unanimous   | 03-NETCODE §Vote          |
| Draw minimum game time         | 10 min      | 03-NETCODE §Vote          |
| Tactical poll expiry           | 15s         | 03-NETCODE §Vote          |
| Active tactical polls per team | 1           | 03-NETCODE §Vote          |
| Tactical polls per player cap  | 3 per 5 min | 03-NETCODE §Vote          |

### P2P vs Relay Threshold

| Parameter             | Value       | Source     |
| --------------------- | ----------- | ---------- |
| Mesh P2P player count | 2–3 players | 03-NETCODE |
| Relay threshold       | 4+ players  | 03-NETCODE |

---

## 3. Security & Rate Limiting

### Protocol Limits

| Parameter                       | Value       | Source                      |
| ------------------------------- | ----------- | --------------------------- |
| max_order_size                  | 4 KB        | 06-SECURITY §ProtocolLimits |
| max_orders_per_tick             | 256         | 06-SECURITY §ProtocolLimits |
| max_chat_message_length         | 512 bytes   | 06-SECURITY §ProtocolLimits |
| max_file_transfer_size          | 64 KB       | 06-SECURITY §ProtocolLimits |
| max_pending_data_per_peer       | 256 KB      | 06-SECURITY §ProtocolLimits |
| max_reassembled_command_size    | 64 KB       | 06-SECURITY §ProtocolLimits |
| max_voice_packets_per_second    | 50          | 06-SECURITY §ProtocolLimits |
| max_voice_packet_size           | 256 bytes   | 06-SECURITY §ProtocolLimits |
| max_pings_per_interval          | 3 per 5 sec | 06-SECURITY §ProtocolLimits |
| max_minimap_draw_points         | 32          | 06-SECURITY §ProtocolLimits |
| max_tactical_markers_per_player | 10          | 06-SECURITY §ProtocolLimits |
| max_tactical_markers_per_team   | 30          | 06-SECURITY §ProtocolLimits |

### Join Code & Tracking Server

| Parameter                    | Value    | Source      |
| ---------------------------- | -------- | ----------- |
| Join code min length         | 6 chars  | 06-SECURITY |
| Join code alphabet           | 32 chars | 06-SECURITY |
| Join code resolve rate       | 5/IP/min | 06-SECURITY |
| Join code TTL                | 5 min    | 06-SECURITY |
| Tracking: listings per IP    | 3        | 06-SECURITY |
| Tracking: heartbeat interval | 30s      | 06-SECURITY |
| Tracking: listing TTL        | 2 min    | 06-SECURITY |
| Tracking: browse rate        | 30/min   | 06-SECURITY |
| Tracking: publish rate       | 5/min    | 06-SECURITY |

### Behavioral Analysis & Anti-Cheat

| Parameter                        | Value                 | Source                  |
| -------------------------------- | --------------------- | ----------------------- |
| APM sustained trigger            | >600 for 30s          | 06-SECURITY §Behavioral |
| Pattern entropy floor            | < HUMAN_ENTROPY_FLOOR | 06-SECURITY §Behavioral |
| Reaction time trigger            | <100 ms               | 06-SECURITY §Behavioral |
| EWMA alpha                       | 0.1                   | 06-SECURITY §EWMA       |
| Behavioral confidence threshold  | 0.6                   | 06-SECURITY §AntiCheat  |
| Statistical confidence threshold | 0.7                   | 06-SECURITY §AntiCheat  |
| Combined confidence threshold    | 0.75                  | 06-SECURITY §AntiCheat  |
| ShadowRestrict max duration      | 7 days                | 06-SECURITY             |
| Desync DoS → disconnect          | 3 consecutive         | 06-SECURITY             |

### Format Entry Caps

| Format           | Max Entries | Source                  |
| ---------------- | ----------- | ----------------------- |
| MIX file entries | 16,384      | 06-SECURITY §FormatCaps |
| SHP frame count  | 65,536      | 06-SECURITY §FormatCaps |
| VQA frame count  | 100,000     | 06-SECURITY §FormatCaps |
| TMP tile count   | 65,536      | 06-SECURITY §FormatCaps |

### Decompression Safety

| Parameter                  | Value | Source            |
| -------------------------- | ----- | ----------------- |
| Decompression ratio cap    | 256:1 | 06-SECURITY, D063 |
| SHP frame max decompressed | 16 MB | 06-SECURITY       |
| VQA frame max decompressed | 32 MB | 06-SECURITY       |
| Save game max decompressed | 64 MB | 06-SECURITY, D063 |

### SimReconciler (Cross-Engine)

| Parameter                       | Value          | Source          |
| ------------------------------- | -------------- | --------------- |
| MAX_TICKS_SINCE_SYNC            | 300            | 07-CROSS-ENGINE |
| MAX_CREDIT_DELTA                | 5,000          | 07-CROSS-ENGINE |
| Health correction cap           | 1,000          | 07-CROSS-ENGINE |
| Rejected corrections escalation | >5 consecutive | 07-CROSS-ENGINE |

### Mnemonic Seed Recovery

| Parameter                 | Value       | Source            |
| ------------------------- | ----------- | ----------------- |
| Mnemonic word count       | 24 (BIP-39) | 06-SECURITY, D061 |
| PBKDF2-HMAC-SHA512 rounds | 2,048       | D061              |

---

## 4. Camera & Rendering

### Camera System

| Parameter             | Value     | Source                     |
| --------------------- | --------- | -------------------------- |
| Zoom range (global)   | 0.5–4.0   | 02-ARCHITECTURE §Camera    |
| Zoom default          | 1.0       | 02-ARCHITECTURE §Camera    |
| Zoom smoothing (zoom) | 0.15      | 02-ARCHITECTURE §Camera    |
| Zoom smoothing (pan)  | 0.2       | 02-ARCHITECTURE §Camera    |
| Ranked zoom clamp     | 0.75–2.0  | 01-VISION, 02-ARCHITECTURE |
| Edge scroll speed     | 1200 px/s | 02-ARCHITECTURE §Camera    |
| Keyboard scroll speed | 1000 px/s | 02-ARCHITECTURE §Camera    |
| Edge scroll zone      | 8 px      | 02-ARCHITECTURE §Camera    |
| Camera bounds padding | 64 px     | 02-ARCHITECTURE §Camera    |

### Camera Shake

| Parameter                        | Value   | Source                       |
| -------------------------------- | ------- | ---------------------------- |
| Max amplitude                    | 12.0    | 02-ARCHITECTURE §CameraShake |
| Decay rate                       | 8.0     | 02-ARCHITECTURE §CameraShake |
| CameraShakeEvent intensity range | 0.0–1.0 | 02-ARCHITECTURE §CameraShake |
| Nuke intensity                   | 1.0     | 02-ARCHITECTURE              |
| Tank shell intensity             | 0.05    | 02-ARCHITECTURE              |

### Per-Render-Mode Camera (D048)

| Mode    | Zoom Min | Zoom Max | Zoom Default | Integer Snap | Source |
| ------- | -------- | -------- | ------------ | ------------ | ------ |
| Classic | 0.5      | 3.0      | 1.0          | true         | D048   |
| HD      | 0.5      | 4.0      | 1.0          | false        | D048   |
| 3D      | 0.25     | 6.0      | 1.0          | false        | D048   |

| Parameter                          | Value | Source |
| ---------------------------------- | ----- | ------ |
| Cross-backend camera interpolation | ~0.3s | D048   |
| Render mode cycle key              | F1    | D048   |

### Render Tiers

| Tier | Description                                             | Source         |
| ---- | ------------------------------------------------------- | -------------- |
| 0    | Minimal (GL 3.3, no compute, no post-FX, CPU particles) | 10-PERFORMANCE |
| 1    | Low                                                     | 10-PERFORMANCE |
| 2    | Medium                                                  | 10-PERFORMANCE |
| 3    | High (full compute, post-FX)                            | 10-PERFORMANCE |

### Render Settings (Cvars)

| Cvar                  | Type  | Default | Range   | Source         |
| --------------------- | ----- | ------- | ------- | -------------- |
| render.shadows        | bool  | true    | —       | D058           |
| render.shadow_quality | int   | 2       | 0–3     | D058           |
| render.vsync          | bool  | true    | —       | D058           |
| render.max_fps        | int   | 144     | —       | D058           |
| resolution_scale      | float | 1.0     | 0.5–2.0 | 10-PERFORMANCE |
| particle_density      | float | 1.0     | 0.0–1.0 | 10-PERFORMANCE |

### Scaling

| Resolution | Integer Scale Factor | Source           |
| ---------- | -------------------- | ---------------- |
| 1080p      | 3×                   | 12-MOD-MIGRATION |
| 1440p      | 4×                   | 12-MOD-MIGRATION |
| 4K         | 6×                   | 12-MOD-MIGRATION |

---

## 5. AI & Decision-Making

### AI Personality

| Parameter             | Type           | Range                      | Source                |
| --------------------- | -------------- | -------------------------- | --------------------- |
| aggression            | int/FixedPoint | 0–100 (or 0.0–1.0)         | 02-ARCHITECTURE, D043 |
| expansion_tendency    | FixedPoint     | 0.0–1.0                    | 02-ARCHITECTURE, D043 |
| attack_threshold      | int            | e.g. 5000                  | 02-ARCHITECTURE       |
| retreat_threshold     | FixedPoint     | health %                   | D042                  |
| multi_prong_frequency | FixedPoint     | 0.0–1.0                    | D042                  |
| micro_intensity       | float          | orders-per-unit-per-minute | D042                  |
| resource_efficiency   | FixedPoint     | 0.0–1.0                    | D042                  |

### AI Shellmap Defaults

| Parameter          | Value   | Source          |
| ------------------ | ------- | --------------- |
| aggression         | 40      | 02-ARCHITECTURE |
| attack_threshold   | 5000    | 02-ARCHITECTURE |
| max_tick_budget_us | 2000 µs | 02-ARCHITECTURE |

### AI Difficulty Presets (D043)

| Preset | resource_gather_rate | Notes    | Source |
| ------ | -------------------- | -------- | ------ |
| Easy   | 0.5                  | —        | D043   |
| Medium | 0.8                  | —        | D043   |
| Normal | 1.0                  | —        | D043   |
| Hard   | 1.0                  | No bonus | D043   |
| Brutal | 1.3                  | —        | D043   |

### AI Performance Budgets

| System                | Budget       | Frequency      | Source               |
| --------------------- | ------------ | -------------- | -------------------- |
| Harvester pathfinding | <0.1 ms      | every 4 ticks  | 10-PERFORMANCE, D043 |
| Squad tactics         | <0.2 ms      | every 2 ticks  | 10-PERFORMANCE       |
| Strategic planner     | <5.0 ms      | every 60 ticks | 10-PERFORMANCE       |
| Total amortized       | <0.5 ms/tick | —              | 10-PERFORMANCE, D043 |

### AI Misc

| Parameter                  | Value                   | Source |
| -------------------------- | ----------------------- | ------ |
| Lanchester exponent        | 0.7                     | D043   |
| Scout frequency range      | 60–90s                  | D043   |
| Value function constant    | 40                      | D043   |
| Knowledge history capacity | 1000 entries (circular) | D043   |

### GOAP AI (Mod-Provided, D043)

| Parameter                            | Min | Max | Default  | Source           |
| ------------------------------------ | --- | --- | -------- | ---------------- |
| plan_depth / search_depth            | 1   | 10  | 5        | D043, 04-MODDING |
| replan_interval                      | 10  | 120 | 30 ticks | D043, 04-MODDING |
| aggression_weight / defend_threshold | 0   | 100 | 50 / 40  | D043, 04-MODDING |

### LLM AI (D044)

| Parameter                   | Min | Max  | Default   | Source |
| --------------------------- | --- | ---- | --------- | ------ |
| consultation_interval       | 30  | 3000 | 300 ticks | D043   |
| max_tokens per consultation | —   | —    | 500       | D043   |

### StyleDrivenAi (D042)

| Parameter        | Type       | Range   | Default | Source |
| ---------------- | ---------- | ------- | ------- | ------ |
| variance         | FixedPoint | 0.0–1.0 | —       | D042   |
| difficulty_scale | FixedPoint | —       | —       | D042   |
| tick_budget_hint | µs         | —       | 200 µs  | D042   |

---

## 6. Audio

| Parameter            | Value                              | Source                 |
| -------------------- | ---------------------------------- | ---------------------- |
| AudioPriority levels | Ambient, Effect, Voice, EVA, Music | 02-ARCHITECTURE §Audio |
| Jukebox crossfade    | crossfade_ms (configurable)        | 02-ARCHITECTURE        |
| Master volume cvar   | 0–100 default 80                   | D058                   |
| Music volume cvar    | 0–100 default 60                   | D058                   |
| EVA volume cvar      | 0–100 default 100                  | D058                   |
| Opus voice bitrate   | 32 kbps (range 8–64)               | D059                   |
| Opus sample rate     | 48 kHz mono                        | D059                   |
| Opus frame size      | 20 ms                              | D059                   |

---

## 7. SQLite & Storage

### Per-Database PRAGMA Configuration (D034)

#### Client Databases

| Database          | sync   | cache_size | mmap_size | busy_timeout | wal_autocheckpoint | Expected Size    | Source |
| ----------------- | ------ | ---------- | --------- | ------------ | ------------------ | ---------------- | ------ |
| gameplay.db       | NORMAL | 16 MB      | 64 MB     | 2s           | 2000               | 10–500 MB        | D034   |
| telemetry.db      | NORMAL | 4 MB       | —         | 1s           | 4000 (~16 MB WAL)  | pruned at 100 MB | D034   |
| profile.db        | FULL   | 2 MB       | —         | 3s           | 500                | small            | D034   |
| achievements.db   | FULL   | 1 MB       | —         | —            | 100                | small            | D034   |
| communities/*.db  | FULL   | 512 KB     | —         | —            | 100                | small            | D034   |
| workshop/cache.db | —      | 4 MB       | —         | —            | 1000               | varies           | D034   |

#### Server Databases

| Database            | sync | cache_size | mmap_size | busy_timeout | wal_autocheckpoint | Max Size | Source |
| ------------------- | ---- | ---------- | --------- | ------------ | ------------------ | -------- | ------ |
| server telemetry.db | —    | 8 MB       | —         | 5s           | 8000 (~32 MB WAL)  | 500 MB   | D034   |
| relay data          | FULL | 8 MB       | —         | 5s           | 1000               | —        | D034   |
| workshop server     | —    | 16 MB      | 256 MB    | 10s          | 1000               | —        | D034   |
| matchmaking         | FULL | 8 MB       | 128 MB    | 10s          | —                  | —        | D034   |

#### General PRAGMA Values

| Parameter                           | Value                     | Source |
| ----------------------------------- | ------------------------- | ------ |
| page_size (all)                     | 4096                      | D034   |
| journal_mode (all)                  | WAL                       | D034   |
| foreign_keys (all except telemetry) | ON                        | D034   |
| Ring buffer min size                | 1024 entries (~64–128 KB) | D034   |

#### WASM Adjustments

| Adjustment  | Change         | Source |
| ----------- | -------------- | ------ |
| mmap_size   | 0 (disabled)   | D034   |
| cache_size  | 50% of desktop | D034   |
| synchronous | NORMAL for all | D034   |

### Telemetry

| Parameter               | Value  | Source     |
| ----------------------- | ------ | ---------- |
| Client telemetry.db max | 100 MB | D031, D034 |
| Server telemetry.db max | 500 MB | D031, D034 |
| Retention days          | 30     | D031       |

---

## 8. Workshop & P2P Distribution

### P2P Transport Strategy

| Package Size | Strategy                     | Source           |
| ------------ | ---------------------------- | ---------------- |
| < 5 MB       | HTTP direct only             | D049, 04-MODDING |
| 5–50 MB      | P2P preferred, HTTP fallback | D049, 04-MODDING |
| > 50 MB      | P2P strongly preferred       | D049, 04-MODDING |

### P2P Client Config

| Parameter                | Default   | Source           |
| ------------------------ | --------- | ---------------- |
| max_upload_speed         | 1 MB/s    | D049, 04-MODDING |
| max_download_speed       | unlimited | D049             |
| seed_after_download      | true      | D049             |
| seed_duration_after_exit | 30 min    | D049, 04-MODDING |
| cache_size_limit         | 2 GB      | D049, 04-MODDING |
| prefer_p2p               | true      | D049             |

### P2P Protocol Details

| Parameter                           | Value                                       | Source |
| ----------------------------------- | ------------------------------------------- | ------ |
| Announce interval (default)         | 30s                                         | D049   |
| Announce interval (during download) | 10s                                         | D049   |
| Announce interval (seeding idle)    | 60s                                         | D049   |
| Max announce interval               | 120s                                        | D049   |
| Peer handout limit per announce     | 30 peers                                    | D049   |
| Pipeline limit per peer             | 3 concurrent piece requests                 | D049   |
| Piece request timeout               | 8s base + 6s per MB                         | D049   |
| Endgame mode threshold              | ≤ 5 remaining pieces                        | D049   |
| MaxConnectionsPerPackage            | 8                                           | D049   |
| Blacklist trigger                   | 0 throughput for 30s                        | D049   |
| Blacklist cooldown                  | 5 min                                       | D049   |
| Sybil resistance: max peers per /24 | 3                                           | D049   |
| Connection idle TTL                 | 60s                                         | D049   |
| Degradation detection (Phase 5+)    | max(3 × mean, 2 × p95) or 20× mean (sparse) | D049   |

### P2P Piece Sizes

| Package Size | Piece Length | Source |
| ------------ | ------------ | ------ |
| 5–50 MB      | 256 KB       | D049   |
| 50–500 MB    | 1 MB         | D049   |
| > 500 MB     | 4 MB         | D049   |

### P2P Peer Scoring (Phase 5+)

| Dimension                         | Weight | Source     |
| --------------------------------- | ------ | ---------- |
| Capacity                          | 0.4    | D049       |
| Locality                          | 0.3    | D049       |
| SeedStatus                        | 0.2    | D049       |
| LobbyContext / ApplicationContext | 0.1    | D049, D050 |

### P2P Health Checks

| Parameter                       | Value                | Source |
| ------------------------------- | -------------------- | ------ |
| Heartbeat interval (seed boxes) | 30s                  | D049   |
| Failures before unhealthy       | 3                    | D049   |
| Passes to restore healthy       | 2                    | D049   |
| Offline after missed announces  | 2× announce interval | D049   |

### P2P Download Priority Tiers

| Priority | Name           | Source |
| -------- | -------------- | ------ |
| 1 (high) | lobby-urgent   | D049   |
| 2 (mid)  | user-requested | D049   |
| 3 (low)  | background     | D049   |

### P2P Persistent Replica Count

| Parameter                      | Default | Source |
| ------------------------------ | ------- | ------ |
| Popular resources min replicas | 2       | D049   |
| All resources min replicas     | 1       | D049   |

### Workshop Publisher Trust Tiers

| Tier       | Requirements                     | Source     |
| ---------- | -------------------------------- | ---------- |
| Unverified | New publisher                    | 04-MODDING |
| Verified   | Account verified                 | 04-MODDING |
| Trusted    | 5 successful publishes + 30 days | 04-MODDING |
| Featured   | Editorial selection              | 04-MODDING |

### Workshop Moderation & Content

| Parameter                                | Value                     | Source     |
| ---------------------------------------- | ------------------------- | ---------- |
| Large package flag threshold             | 500 MB                    | 04-MODDING |
| Transient resource TTL (auto-download)   | 30 days                   | 04-MODDING |
| Pin threshold (auto-download → retained) | 3+ sessions               | 04-MODDING |
| Review limit                             | 1 per account per package | 04-MODDING |
| Review eligibility                       | account >7 days old       | 04-MODDING |
| DMCA response window                     | 72 hours                  | 04-MODDING |
| DMCA strikes to suspend                  | 3                         | 04-MODDING |
| Creator badge "Prolific"                 | 10+ resources ≥4.0 rating | 04-MODDING |
| Creator badge "Foundation"               | 50+ dependents            | 04-MODDING |
| Mod API deprecation cycle                | 2 minor versions          | 04-MODDING |
| Min age (COPPA)                          | 13                        | 04-MODDING |

### Editor (D040) Autosave

| Parameter                     | Value            | Source     |
| ----------------------------- | ---------------- | ---------- |
| Autosave interval             | 5 min            | 04-MODDING |
| Rotating autosave slots       | 3                | 04-MODDING |
| Scenario complexity meter max | 100% (guideline) | 04-MODDING |

---

## 9. Weather & Environment

### Weather State Durations (ticks)

| State    | min_duration | max_duration | transition_time | Source              |
| -------- | ------------ | ------------ | --------------- | ------------------- |
| Sunny    | 300          | 600          | —               | 04-MODDING §Weather |
| Overcast | 120          | 240          | 30              | 04-MODDING §Weather |
| Rain     | 200          | 500          | 60              | 04-MODDING §Weather |
| Snow     | 300          | 800          | 60              | 04-MODDING §Weather |
| Clearing | 60           | 120          | 30              | 04-MODDING §Weather |

### Surface Accumulation Rates (per tick)

| Surface  | Accumulation Rate | Max Depth | Decay Rate  | Source              |
| -------- | ----------------- | --------- | ----------- | ------------------- |
| Snow     | 2/tick            | 1024      | melt 1/tick | 04-MODDING §Weather |
| Rain/wet | 4/tick            | —         | dry 2/tick  | 04-MODDING §Weather |

### Temperature

| Parameter        | Value             | Source              |
| ---------------- | ----------------- | ------------------- |
| Base temperature | 512 (fixed-point) | 04-MODDING §Weather |
| Sunny warming    | 1/tick            | 04-MODDING §Weather |
| Snow cooling     | 2/tick            | 04-MODDING §Weather |

### Weather Sim Effects

| Condition        | Effect                                    | Source              |
| ---------------- | ----------------------------------------- | ------------------- |
| Rain             | −20% visibility, slower wheeled           | 04-MODDING §Weather |
| Snow             | −15% speed, −30% visibility               | 04-MODDING §Weather |
| Sandstorm        | −50% visibility, infantry damage          | 04-MODDING §Weather |
| Fog              | −40% visibility                           | 04-MODDING §Weather |
| Deep snow (>512) | infantry −20%, wheeled −30%, tracked −10% | 04-MODDING §Surface |
| Ice              | −15% turn rate                            | 04-MODDING §Surface |
| Wet (>256)       | wheeled −15%                              | 04-MODDING §Surface |
| Muddy            | wheeled −25%, tracked −10%                | 04-MODDING §Surface |

---

## 10. Campaign & Progression

### Adaptive Difficulty

| Parameter                            | Value     | Source               |
| ------------------------------------ | --------- | -------------------- |
| Bonus resources (low performance)    | 2000      | 04-MODDING §Campaign |
| Low roster threshold                 | <5 units  | 04-MODDING §Campaign |
| High roster threshold                | >20 units | 04-MODDING §Campaign |
| Enemy count multiplier (high roster) | 1.3       | 04-MODDING §Campaign |

### World Map (RegionState)

| Field                   | Range | Source               |
| ----------------------- | ----- | -------------------- |
| stability               | 0–100 | 04-MODDING §Campaign |
| war_damage              | 0–100 | 04-MODDING §Campaign |
| garrison_strength       | int   | 04-MODDING §Campaign |
| fortification_remaining | int   | 04-MODDING §Campaign |

---

## 11. Matchmaking & Ranking

### Glicko-2 Parameters (D055)

| Parameter                  | Value                   | Source |
| -------------------------- | ----------------------- | ------ |
| Default rating             | 1500                    | D055   |
| Default deviation (RD)     | 350                     | D055   |
| Tau (volatility)           | 0.5                     | D055   |
| RD floor                   | 45                      | D055   |
| RD ceiling                 | 350                     | D055   |
| Inactivity constant (c)    | 34.6                    | D055   |
| Fixed-point representation | e.g. 1500000 = 1500.000 | D052   |

### Matchmaking Config (D055)

| Parameter                   | Value  | Source |
| --------------------------- | ------ | ------ |
| initial_range               | ±100   | D055   |
| widen_step                  | 50     | D055   |
| widen_interval              | 30s    | D055   |
| max_range                   | 500    | D055   |
| desperation_time            | 300s   | D055   |
| min_quality                 | 0.3    | D055   |
| Spearman ρ health threshold | ≥ 0.95 | D055   |

### Season Config (D055)

| Parameter                         | Value   | Source |
| --------------------------------- | ------- | ------ |
| Season duration                   | 91 days | D055   |
| Placement matches                 | 10      | D055   |
| Rating compression (season reset) | 0.7     | D055   |
| Map veto pool                     | 7       | D055   |

### SCR Expiry (D052)

| SCR Type                  | Default Expiry | Source |
| ------------------------- | -------------- | ------ |
| Rating records            | 7 days         | D052   |
| Match/achievement records | never          | D052   |

### Community Server Storage

| Parameter                    | Value                        | Source |
| ---------------------------- | ---------------------------- | ------ |
| Per-player storage           | ~40 bytes (key + revocation) | D052   |
| 10,000 players storage       | ~400 KB                      | D052   |
| Registration rate limit      | 3 accounts/IP/day            | D052   |
| Achievement challenge window | 72 hours default             | D052   |

### Room Codes (D052)

| Parameter     | Value                    | Source |
| ------------- | ------------------------ | ------ |
| Code length   | 6 chars                  | D052   |
| Alphabet size | 30 chars (unambiguous)   | D052   |
| Combinations  | ~729 million             | D052   |
| Code expiry   | room close + 5 min grace | D052   |

### Transparency Log (D052)

| Parameter                   | Value                              | Source |
| --------------------------- | ---------------------------------- | ------ |
| STH publish frequency       | hourly default                     | D052   |
| Log entry size              | ~32 bytes/SCR                      | D052   |
| 100K SCRs log size          | ~3.2 MB                            | D052   |
| Inclusion proof size (100K) | ~17 hashes × 32 bytes = ~544 bytes | D052   |

---

## 12. Modding & Sandbox Limits

### Lua Execution Limits

| Parameter                  | Value     | Source                  |
| -------------------------- | --------- | ----------------------- |
| max_instructions_per_tick  | 1,000,000 | 04-MODDING, 06-SECURITY |
| max_memory_bytes           | 8 MB      | 04-MODDING, 06-SECURITY |
| max_entity_spawns_per_tick | 32        | 04-MODDING, 06-SECURITY |
| max_orders_per_tick        | 64        | 04-MODDING, 06-SECURITY |
| max_host_calls_per_tick    | 1,024     | 04-MODDING, 06-SECURITY |

### WASM Execution Limits

| Parameter                       | Value                   | Source     |
| ------------------------------- | ----------------------- | ---------- |
| fuel_per_tick                   | 1,000,000               | 04-MODDING |
| max_memory_bytes                | 16 MB                   | 04-MODDING |
| max_entity_spawns_per_tick      | 32                      | 04-MODDING |
| max_orders_per_tick             | 64                      | 04-MODDING |
| max_host_calls_per_tick         | 1,024                   | 04-MODDING |
| Pathfinder WASM fuel multiplier | 5× standard (5,000,000) | 04-MODDING |

### Balance Presets

| Preset     | Description                   | Source           |
| ---------- | ----------------------------- | ---------------- |
| classic    | Original RA (default)         | 04-MODDING, D019 |
| openra     | OpenRA balance                | 04-MODDING, D019 |
| remastered | Remastered Collection balance | 04-MODDING, D019 |
| custom     | User-defined                  | 04-MODDING, D019 |

---

## 13. UI & QoL

### QoL Toggle Presets (D033) — Key Parameters

| Parameter           | Vanilla      | OpenRA        | Remastered          | IC Default            | Source |
| ------------------- | ------------ | ------------- | ------------------- | --------------------- | ------ |
| control_group_limit | 10           | 0 (unlimited) | 0 (unlimited)       | 0 (unlimited)         | D033   |
| health_bars         | never        | on_selection  | damaged_or_selected | damaged_or_selected   | D033   |
| stance_system       | none         | full          | basic               | full                  | D033   |
| build_radius_rule   | none         | conyard_only  | conyard_only        | conyard_and_buildings | D033   |
| crate_system        | none / basic | basic         | enhanced            | enhanced              | D033   |
| fog_of_war          | on           | optional      | on                  | optional              | D033   |

### Screen Classes

| Class   | Screen Size | Source                       |
| ------- | ----------- | ---------------------------- |
| Phone   | <7"         | 02-ARCHITECTURE §ScreenClass |
| Tablet  | 7–13"       | 02-ARCHITECTURE §ScreenClass |
| Desktop | 13"+        | 02-ARCHITECTURE §ScreenClass |
| TV      | 40"+        | 02-ARCHITECTURE §ScreenClass |

### UI Themes

| Theme                    | Source |
| ------------------------ | ------ |
| Classic                  | D032   |
| Remastered               | D032   |
| Modern                   | D032   |
| Community (via Workshop) | D032   |

### Gameplay Cvars

| Cvar                           | Type | Default | Source |
| ------------------------------ | ---- | ------- | ------ |
| gameplay.scroll_speed          | int  | 5       | D058   |
| gameplay.control_group_steal   | bool | false   | D058   |
| gameplay.auto_rally_harvesters | bool | true    | D058   |

### Double-Buffered Shared State

| Data              | Size (512×512 map) | Source          |
| ----------------- | ------------------ | --------------- |
| Fog of war shroud | ~32 KB             | 02-ARCHITECTURE |
| Influence maps    | ~1 MB              | 02-ARCHITECTURE |

---

## 14. Formats & Codecs

### Binary Format Sizes

| Format             | Header/Entry Size     | Source     |
| ------------------ | --------------------- | ---------- |
| MIX FileHeader     | 6 bytes               | 05-FORMATS |
| MIX SubBlock entry | 12 bytes              | 05-FORMATS |
| TMP tile           | 24×24 px @ 576 bytes  | 05-FORMATS |
| PAL palette        | 768 bytes (256 × RGB) | 05-FORMATS |
| PAL value range    | 6-bit VGA (0–63)      | 05-FORMATS |
| AUD header         | 12 bytes              | 05-FORMATS |

### Save Game Format (.icsave)

| Parameter                      | Value         | Source      |
| ------------------------------ | ------------- | ----------- |
| Header size                    | 32 bytes      | 05-FORMATS  |
| Magic bytes                    | b"ICSV"       | D063        |
| Compression                    | LZ4 (default) | 05-FORMATS  |
| Uncompressed size (~500 units) | ~200 KB       | 05-FORMATS  |
| Compressed size (~500 units)   | 40–80 KB      | 05-FORMATS  |
| JSON metadata max              | 1 MB          | 06-SECURITY |

### Replay Format (.icrep)

| Parameter                 | Value           | Source           |
| ------------------------- | --------------- | ---------------- |
| Header size               | 56 bytes        | 05-FORMATS       |
| Magic bytes               | b"ICRP"         | D063             |
| Compression blocks        | per 256 ticks   | 05-FORMATS, D063 |
| Keyframes                 | every 300 ticks | 05-FORMATS, D063 |
| CameraPositionSample rate | 2 Hz            | 05-FORMATS       |
| Signature                 | Ed25519 chain   | 05-FORMATS       |

### Embedded Resources

| Mode          | Size Overhead | Source     |
| ------------- | ------------- | ---------- |
| Minimal       | +0 KB         | 05-FORMATS |
| MapEmbedded   | +50–200 KB    | 05-FORMATS |
| SelfContained | +200–500 KB   | 05-FORMATS |

### Browser Storage

| Storage      | Notes            | Source     |
| ------------ | ---------------- | ---------- |
| OPFS         | Primary for WASM | 05-FORMATS |
| IndexedDB    | Fallback         | 05-FORMATS |
| localStorage | ~5–10 MB limit   | 05-FORMATS |

### Foreign Replay Conversion (D056)

| Source     | Native Tick Rate | IC Tick Rate | Source |
| ---------- | ---------------- | ------------ | ------ |
| OpenRA     | 40 tps           | 30 tps       | D056   |
| Remastered | ~15 fps          | 30 tps       | D056   |

---

## 15. Performance & Budgets

### Target Tick Time

| Hardware                  | 500-Unit Tick | Source                    |
| ------------------------- | ------------- | ------------------------- |
| Weak (2-core 2012 laptop) | <16 ms        | 01-VISION, 10-PERFORMANCE |
| Mid                       | <10 ms        | 01-VISION                 |
| Strong                    | <5 ms         | 10-PERFORMANCE            |
| Mobile                    | <20 ms        | 10-PERFORMANCE            |
| Browser (WASM)            | <25 ms        | 10-PERFORMANCE            |

### Target Frame Rate

| Hardware | FPS              | Source         |
| -------- | ---------------- | -------------- |
| Desktop  | 60+ (target 144) | 01-VISION      |
| Mobile   | 30+              | 10-PERFORMANCE |
| Browser  | 30+              | 10-PERFORMANCE |

### Memory Targets

| Hardware | RAM Budget | Source         |
| -------- | ---------- | -------------- |
| Desktop  | <200 MB    | 01-VISION      |
| WASM     | <128 MB    | 10-PERFORMANCE |

### Input Latency

| Parameter            | Value    | Source    |
| -------------------- | -------- | --------- |
| Input-to-screen      | <1 frame | 01-VISION |
| Voice latency target | <150 ms  | D059      |

### Hardware Floor

| Component    | Minimum    | Source                    |
| ------------ | ---------- | ------------------------- |
| GPU API      | OpenGL 3.3 | 01-VISION, 10-PERFORMANCE |
| GPU VRAM     | 256 MB     | 01-VISION, 10-PERFORMANCE |
| CPU cores    | 2          | 01-VISION, 10-PERFORMANCE |
| CPU features | SSE2       | 10-PERFORMANCE            |
| System RAM   | 4 GB       | 01-VISION, 10-PERFORMANCE |

### Scratch Buffer Capacities

| Buffer           | Size  | Source         |
| ---------------- | ----- | -------------- |
| damage_events    | 4,096 | 10-PERFORMANCE |
| spatial_results  | 2,048 | 10-PERFORMANCE |
| visibility_dirty | 1,024 | 10-PERFORMANCE |
| validated_orders | 256   | 10-PERFORMANCE |
| combat_pairs     | 2,048 | 10-PERFORMANCE |

### Stagger Schedules (ticks by LOD)

| System      | High LOD | Medium LOD | Low LOD         | Source         |
| ----------- | -------- | ---------- | --------------- | -------------- |
| Pathfinding | 4        | 8          | never           | 10-PERFORMANCE |
| Fog refresh | 1        | 2          | 4               | 10-PERFORMANCE |
| AI decision | 2        | 4          | 8               | 10-PERFORMANCE |
| Collision   | 1        | 2          | broadphase only | 10-PERFORMANCE |

### Misc Performance

| Parameter                      | Value                        | Source         |
| ------------------------------ | ---------------------------- | -------------- |
| Flow field unit threshold      | 8 units                      | 10-PERFORMANCE |
| Regression CI fail threshold   | >10% degradation             | 10-PERFORMANCE |
| Replay keyframes               | every 300 ticks              | 10-PERFORMANCE |
| I/O ring buffer min            | ≥1,024 entries               | 10-PERFORMANCE |
| Delta snapshot size            | ~30 KB                       | 10-PERFORMANCE |
| Full snapshot size             | ~300 KB                      | 10-PERFORMANCE |
| Parallelization threshold      | ~1 µs per entity             | 10-PERFORMANCE |
| Phase 2 exit: 1000-unit battle | >60 ticks/sec                | 08-ROADMAP     |
| Phase 2 exit: desync test      | 10,000 ticks zero divergence | 08-ROADMAP     |

---

## 16. Compression (D063)

### Compression Levels per Context

| Context                | Default Level | Source |
| ---------------------- | ------------- | ------ |
| Save game              | Balanced      | D063   |
| Replay recording       | Fastest       | D063   |
| Autosave               | Fastest       | D063   |
| Reconnection snapshot  | Balanced      | D063   |
| Workshop package build | Compact       | D063   |
| Backup archive         | Balanced      | D063   |
| `ic replay recompress` | Compact       | D063   |

### AdvancedCompressionConfig (21 Parameters)

| Parameter                           | Type | Range                   | Default        | Source |
| ----------------------------------- | ---- | ----------------------- | -------------- | ------ |
| lz4_acceleration                    | u32  | 1–65,537                | 1              | D063   |
| lz4_hc_level                        | u8   | 1–12                    | 9              | D063   |
| balanced_uses_hc                    | bool | —                       | false          | D063   |
| zstd_fastest_level                  | i8   | -7–22                   | 1              | D063   |
| zstd_balanced_level                 | i8   | -7–22                   | 3              | D063   |
| zstd_compact_level                  | i8   | -7–22                   | 9              | D063   |
| save_algorithm                      | enum | engine-default/lz4/zstd | engine-default | D063   |
| replay_algorithm                    | enum | engine-default/lz4/zstd | engine-default | D063   |
| autosave_algorithm                  | enum | engine-default/lz4/zstd | engine-default | D063   |
| reconnect_algorithm                 | enum | engine-default/lz4/zstd | engine-default | D063   |
| replay_block_ticks                  | u32  | 32–1,024                | 256            | D063   |
| replay_keyframe_interval            | u32  | 60–1,800                | 300            | D063   |
| replay_keyframe_thread_budget_us    | u32  | 500–10,000              | 1,000          | D063   |
| autosave_budget_ms                  | u32  | 10–500                  | 100            | D063   |
| reconnect_pre_compress              | bool | —                       | true           | D063   |
| reconnect_max_snapshot_bytes        | u64  | 1 MB–256 MB             | 64 MB          | D063   |
| reconnect_stall_budget_ms           | u32  | 100–10,000              | 2,000          | D063   |
| max_decompression_ratio             | u32  | 4–1,024                 | 256            | D063   |
| max_save_decompressed_bytes         | u64  | —                       | 64 MB          | D063   |
| max_replay_block_decompressed_bytes | u64  | —                       | 4 MB           | D063   |
| max_snapshot_decompressed_bytes     | u64  | —                       | 64 MB          | D063   |

### Algorithm Header Bytes

| Algorithm     | Header Byte | Source |
| ------------- | ----------- | ------ |
| LZ4           | 0x01        | D063   |
| Zstd (future) | 0x02        | D063   |

---

## 17. Command Console & Cvars (D058)

### Cvar Flags

| Flag       | Bit    | Description          | Source |
| ---------- | ------ | -------------------- | ------ |
| PERSISTENT | 0b0001 | Saved to config file | D058   |
| DEV_ONLY   | 0b0010 | Requires dev mode    | D058   |
| SERVER     | 0b0100 | Server-authoritative | D058   |
| READ_ONLY  | 0b1000 | Informational only   | D058   |

### Network Debug Cvars (DEV_ONLY)

| Cvar                   | Type        | Default       | Source |
| ---------------------- | ----------- | ------------- | ------ |
| net.show_diagnostics   | bool        | false         | D058   |
| net.sync_frequency     | int (ticks) | 120           | D058   |
| net.desync_debug_level | int         | 0 (range 0–3) | D058   |
| net.visual_prediction  | bool        | true          | D058   |
| net.simulate_latency   | int (ms)    | 0             | D058   |
| net.simulate_loss      | float (%)   | 0.0           | D058   |
| net.simulate_jitter    | int (ms)    | 0             | D058   |

### Debug Cvars

| Cvar                     | Type | Default | Source |
| ------------------------ | ---- | ------- | ------ |
| debug.show_fps           | bool | true    | D058   |
| debug.show_network_stats | bool | false   | D058   |

### Permission Levels

| Level     | Access                              | Source |
| --------- | ----------------------------------- | ------ |
| Player    | Chat, help, basic status            | D058   |
| Host      | Server config, kick/ban, dev mode   | D058   |
| Admin     | Full server management              | D058   |
| Developer | Debug, Lua console, fault injection | D058   |

---

## 18. Community Servers & Credentials (D052)

### SCR Binary Format

| Field         | Size                        | Source |
| ------------- | --------------------------- | ------ |
| version       | 1 byte                      | D052   |
| record_type   | 1 byte                      | D052   |
| community_key | 32 bytes                    | D052   |
| player_key    | 32 bytes                    | D052   |
| sequence      | 8 bytes (u64 LE)            | D052   |
| issued_at     | 8 bytes (i64 LE)            | D052   |
| expires_at    | 8 bytes (i64 LE)            | D052   |
| payload_len   | 4 bytes (u32 LE)            | D052   |
| payload       | variable                    | D052   |
| signature     | 64 bytes (Ed25519)          | D052   |
| **Total**     | **158 + payload_len bytes** | D052   |

### Record Types

| Type            | Value | Source |
| --------------- | ----- | ------ |
| Rating snapshot | 0x01  | D052   |
| Match result    | 0x02  | D052   |
| Achievement     | 0x03  | D052   |
| Revocation      | 0x04  | D052   |
| Key rotation    | 0x05  | D052   |

### Ed25519 Verification Performance

| Parameter                     | Value   | Source |
| ----------------------------- | ------- | ------ |
| Verifications/sec (modern HW) | ~15,000 | D052   |

### Lobby Text Chat

| Parameter                | Value                  | Source |
| ------------------------ | ---------------------- | ------ |
| Max message length       | 500 bytes UTF-8        | D052   |
| Rate limit               | 5 messages / 3 seconds | D052   |
| Chat history for joiners | last 50 messages       | D052   |

### Lobby Voice Chat

| Parameter                        | Value        | Source |
| -------------------------------- | ------------ | ------ |
| Codec                            | Opus         | D052   |
| Bitrate                          | 32 kbps mono | D052   |
| Default keybind (push-to-talk)   | V            | D052   |
| Total bandwidth (8-player lobby) | ~224 kbps    | D052   |

### Matchmaking Widening (D052)

| Time in Queue | Rating Range | Source |
| ------------- | ------------ | ------ |
| Initial       | ±100         | D052   |
| After 30s     | ±200         | D052   |
| After 60s     | ±400         | D052   |
| After 120s    | any          | D052   |

---

## 19. Player Profiles (D053)

### Profile Limits

| Field               | Max Size                | Source |
| ------------------- | ----------------------- | ------ |
| Display Name        | 32 chars                | D053   |
| Avatar              | 128×128 PNG, max 64 KB  | D053   |
| Banner              | 600×200 PNG, max 128 KB | D053   |
| Bio                 | 500 chars               | D053   |
| Player Title        | 48 chars                | D053   |
| Favorite Quote      | 100 chars               | D053   |
| Social Links        | max 3                   | D053   |
| Pinned Achievements | max 6                   | D053   |

### Profile Cache

| Parameter                  | Value                        | Source |
| -------------------------- | ---------------------------- | ------ |
| Cache eviction (count)     | 1000 entries LRU             | D053   |
| Cache eviction (time)      | 30 days since last encounter | D053   |
| Profile stale threshold    | >24 hours                    | D053   |
| Full profile response size | ~2 KB (excluding avatar)     | D053   |

### Privacy Defaults

| Section                                               | Default             | Source |
| ----------------------------------------------------- | ------------------- | ------ |
| Display Name / Avatar / Bio / Title / Crest           | Public              | D053   |
| Achievement Showcase / Stats / Communities / Workshop | Public              | D053   |
| Match History / Friends / Custom Elements             | Friends             | D053   |
| Behavioral Profile (D042)                             | Private (immutable) | D053   |

---

## 20. Mod Profiles & Namespaces (D062)

| Parameter             | Value                               | Source |
| --------------------- | ----------------------------------- | ------ |
| Fingerprint algorithm | SHA-256 of sorted namespace entries | D062   |
| Profile format        | YAML                                | D062   |
| Namespace resolution  | HashMap<AssetPath, NamespaceEntry>  | D062   |

---

## 21. Communication & Voice (D059)

### Chat Rate Limiting

| Parameter        | Value                  | Source     |
| ---------------- | ---------------------- | ---------- |
| Chat flood limit | 5 messages / 3 seconds | D059, D052 |

### Voice Transport

| Parameter            | Value                   | Source |
| -------------------- | ----------------------- | ------ |
| Codec                | Opus                    | D059   |
| Sample rate          | 48 kHz                  | D059   |
| Channels             | Mono                    | D059   |
| Frame size           | 20 ms                   | D059   |
| Bitrate              | 32 kbps (range 8–64)    | D059   |
| Jitter buffer range  | 1–10 frames (20–200 ms) | D059   |
| Voice latency target | <150 ms end-to-end      | D059   |

### Broadcast Spectator Delay

| Mode   | Delay                | Source    |
| ------ | -------------------- | --------- |
| Casual | 1–5 min configurable | 01-VISION |

---

## Cross-Cutting Parameter Categories

### Parameters for `settings.yaml` (User-Configurable)

Parameters explicitly designed for user configuration via `settings.yaml` or cvars:

- All render settings (shadows, vsync, max_fps, resolution_scale, particle_density)
- All audio volumes (master, music, EVA)
- Gameplay settings (scroll_speed, control_group_steal, auto_rally_harvesters)
- Camera settings (zoom, smoothing)
- Network debug settings (DEV_ONLY)
- Compression levels (save, replay, autosave, reconnect)
- Compression advanced settings (SERVER flag, 21 params)
- Workshop P2P settings (upload speed, download speed, seed duration, cache limit)
- Profile/privacy settings

### Parameters for Server/Relay Config

Parameters designed for server operators via config files, env vars, or CLI flags:

- All relay limits (connections, games, timeouts, heartbeats)
- Order rate control (token refill, burst, ceiling)
- Desync detection intervals
- PauseConfig, SurrenderConfig, VoteConfig
- Spectator delays
- Compression advanced settings (SERVER flag)
- Community server policies (registration, achievement validation)
- Matchmaking parameters
- Transparency log publish frequency

### Parameters for Game Module YAML (Mod-Configurable)

Parameters defined per game module in YAML rule files:

- All weapon/combat values (damage, range, rate of fire, falloff)
- Unit stats (health, speed, armor, facing)
- Building stats (refund percent, power, build time)
- Notification cooldowns
- Weather state machine (durations, transitions, effects)
- Campaign adaptive difficulty
- AI personality presets
- Balance presets (classic/openra/remastered)
- Ranked tier definitions
- Achievement definitions

### Engine Constants (Not Configurable)

Parameters that are hardcoded engine decisions per D060:

- Tick rate: 30 tps
- Sub-tick ordering: always on
- Adaptive run-ahead: always on
- Timing feedback: every 30 ticks
- Anti-lag-switch: always on
- Visual prediction: always on
- Math types: i32/i64 only (no floats in sim)
- System execution order: 21 steps

---

## Summary Statistics

| Category                 | Parameter Count (approx) |
| ------------------------ | ------------------------ |
| Simulation & Timing      | ~35                      |
| Networking & Relay       | ~65                      |
| Security & Rate Limiting | ~40                      |
| Camera & Rendering       | ~30                      |
| AI & Decision-Making     | ~35                      |
| Audio                    | ~8                       |
| SQLite & Storage         | ~40                      |
| Workshop & P2P           | ~50                      |
| Weather & Environment    | ~25                      |
| Campaign & Progression   | ~10                      |
| Matchmaking & Ranking    | ~20                      |
| Modding & Sandbox        | ~15                      |
| UI & QoL                 | ~15                      |
| Formats & Codecs         | ~20                      |
| Performance & Budgets    | ~30                      |
| Compression (D063)       | ~25                      |
| Console & Cvars (D058)   | ~15                      |
| Community Servers (D052) | ~25                      |
| Player Profiles (D053)   | ~15                      |
| Communication (D059)     | ~10                      |
| **Total**                | **~530+**                |
