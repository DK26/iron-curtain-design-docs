## Crate Dependency Graph

### External Standalone Crates (D076 Tier 1 — separate repos, MIT OR Apache-2.0)

```
cnc-formats         (clean-room C&C format parsing: .mix, .shp, .pal, .aud, .tmp, .vqa, .wsa, .fnt, .ini; MiniYAML behind `miniyaml` feature; .meg/.pgm behind `meg` feature (Phase 2); CLI: validate/inspect/convert (Phase 0), extract/list (Phase 1, +.meg Phase 2), check/diff/fingerprint (Phase 2), pack (Phase 6a))
fixed-game-math     (deterministic fixed-point arithmetic: Fixed<N>, trig, CORDIC, Newton sqrt)
deterministic-rng   (seedable platform-identical PRNG: range sampling, weighted selection, shuffle)
```

These exist from Phase 0, day one, in separate repositories (D076). They have zero IC-specific dependencies.

### IC Monorepo Crates (GPL v3 with modding exception)

```
ic-protocol  (shared types: PlayerOrder, TimestampedOrder)
    ↑         (depends on: fixed-game-math)
    ├── ic-sim      (depends on: ic-protocol, ra-formats, fixed-game-math, deterministic-rng, bevy_ecs [public])
    ├── ic-net      (depends on: ic-protocol; contains RelayCore library — no ic-sim dependency)
    ├── ra-formats  (wraps cnc-formats + EA-derived constants — .mix, .shp, .pal, YAML)
    ├── ic-render   (depends on: ic-sim for reading state)
    ├── ic-ui       (depends on: ic-sim, ic-render; reads SQLite for player analytics — D034)
    ├── ic-audio    (depends on: ra-formats)
    ├── ic-script   (depends on: ic-sim, ic-protocol)
    ├── ic-ai       (depends on: ic-sim, ic-protocol, ic-llm; reads SQLite for adaptive difficulty — D034; contains LlmOrchestratorAi/LlmPlayerAi — D044)
    ├── ic-llm      (standalone — LlmProvider trait, prompt infra, skill library; embeds candle-core/candle-transformers/tokenizers for Tier 1 CPU inference — D047; no ic-sim, no ic-ai imports)
    ├── ic-paths    (standalone — platform path resolution, portable mode, credential store; wraps `app-path` + `strict-path` + `keyring` + `aes-gcm` + `argon2` + `zeroize` crates)
    ├── ic-editor   (depends on: ic-render, ic-sim, ic-ui, ic-protocol, ra-formats, ic-paths; SDK binary — D038+D040)
    └── ic-game     (depends on: everything above EXCEPT ic-editor)

ic-server (top-level binary; depends on: ic-net for RelayCore, ic-protocol, ic-paths;
           optionally ic-sim for FogAuth/relay-headless deployments — D074)
```

**Critical boundary:** `ic-sim` never imports from `ic-net`. The `ic-net` **library crate** (`RelayCore`, `NetworkModel` trait) never imports from `ic-sim`. They only share `ic-protocol`. `ic-server` is a top-level binary (like `ic-game`) that may depend on both `ic-net` and `ic-sim` — this does not violate the library-level boundary. `ic-game` never imports from `ic-editor` — the game and SDK are separate binaries that share library crates.

**Bevy ECS dependency:** `ic-sim` depends on `bevy_ecs` as a **public** dependency — `Simulation` wraps a Bevy `World`, and the `GameModule` trait exposes `&mut World` in `register_components()` and returns `Box<dyn System>` from `system_pipeline()`. Callers (`ic-game`, `ic-editor`, `ic-render`) already depend on Bevy directly, so the leaked types create no additional coupling. `ic-net` and `ic-protocol` have zero Bevy dependency.

**Storage boundary:** `ic-sim` never reads or writes SQLite (invariant #1). Three crates are read-only consumers of the client-side SQLite database: `ic-ui` (post-game stats, career page, campaign dashboard), `ic-ai` (difficulty scaling, counter-strategy selection, personalized missions via `ic-llm` providers, coaching), `ic-llm` (model pack state, provider config, skill library). Gameplay events are written by a Bevy observer system in `ic-game`, outside the deterministic sim. See D034 in `decisions/09e-community.md`.

### Binary Architecture: GUI-First Design

The crate graph produces four ship binaries. Each targets a distinct audience with an interface appropriate to that audience's workflow:

| Binary               | Crate                     | Interface           | Primary Audience           | What It Is                                                                                                                                                 |
| -------------------- | ------------------------- | ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iron-curtain[.exe]` | `ic-game`                 | **GUI application** | Players                    | The game. Launches into a windowed/fullscreen menu with mouse/touch/controller interaction. Players never see a terminal.                                  |
| `ic-editor[.exe]`    | `ic-editor`               | **GUI application** | Modders, map makers        | The SDK. Visual scenario editor, asset studio, campaign editor (D038+D040).                                                                                |
| `ic-server[.exe]`    | `ic-server`               | **CLI / daemon**    | Server operators           | Headless dedicated/relay server. Designed for systemd, Docker, and unattended operation. No window, no renderer.                                           |
| `ic[.exe]`           | `ic-game` (feature-gated) | **CLI tool**        | Modders, CI/CD, developers | Developer/modder utility. `ic mod check`, `ic mod publish`, `ic replay validate`, `ic server validate-config`. Analogous to OpenRA's `OpenRA.Utility.exe`. |

**GUI-first principle:** The game client (`iron-curtain`) is a GUI application — not a CLI tool with a GUI bolted on. Players interact through menus, buttons, and mouse clicks. CLI flags on the game binary (`--windowed`, `--mod mymod`, `--portable`) are **launch parameters** (the same kind every game accepts), not a "CLI mode." The game never requires a terminal to play.

**The `ic` CLI is a developer tool.** It serves the same role as `cargo`, `npm`, or `dotnet` — a command-line interface for automation, scripting, and CI/CD pipelines. It is aimed at modders, server operators, and contributors. Player-facing documentation never directs users to a terminal. The `ic` CLI is not installed to the system PATH by default — players who install via Steam, GOG, or a platform package manager get the game client and (optionally) the server binary, not the developer CLI.

**In-game command console ≠ CLI tool.** D058's unified chat/command system (`/help`, `/speed 2x`) is an in-game overlay — part of the GUI, not a separate terminal. It uses the same `CommandDispatcher` as the CLI for consistency, but the user experience is a text field inside the game window, not a shell prompt. Players who never type `/` commands lose nothing — every command has a GUI equivalent (D058 CI-1).

**Where CLI is the right answer:**

- **Server operators:** `ic-server --map Fjord --players 8` on a headless Linux box. No monitor attached. systemd unit files, Docker Compose, Ansible playbooks — CLI is the native interface for infrastructure.
- **CI/CD pipelines:** `ic mod lint && ic mod test && ic mod package` in a GitHub Actions workflow. Automation needs non-interactive, scriptable commands.
- **Batch modding operations:** `ic mod migrate --from openra` to convert an entire mod directory. Power users who prefer the terminal can use it — the GUI mod manager (SDK) provides the same functionality visually.
- **Diagnostics and debugging:** `ic replay validate *.icrep` to batch-check replay integrity. Developer workflow, not player workflow.

**Where GUI is the only answer:**

- Playing the game (menus, lobbies, matches, replays, settings)
- First-launch wizard and content detection
- Browsing and installing Workshop content
- Configuring LLM providers (D047)
- Campaign setup and mission generation
- Replay viewer with transport controls, camera modes, overlays
- Achievement browsing, career stats, player profile

### Async Architecture: Dual-Runtime with Channel Bridge

IC uses two async runtimes that never overlap within a single thread. The split is driven by Bevy's architecture and WASM portability.

#### Why Two Runtimes

**Bevy does not use tokio.** Bevy's `bevy_tasks` crate is built on `async-executor` / `futures-lite` (the smol family) — a lightweight, custom thread-pool executor with three pools:

| Pool                   | Purpose                                | Example Uses                                              |
| ---------------------- | -------------------------------------- | --------------------------------------------------------- |
| `ComputeTaskPool`      | CPU work needed for the current frame  | Pathfinding, visibility culling, ECS queries              |
| `AsyncComputeTaskPool` | CPU work that can span multiple frames | Map loading, mod validation, state snapshot serialization |
| `IoTaskPool`           | Short-lived I/O-bound tasks            | File reads, config loading, embedded relay socket I/O     |

But key IC dependencies — `librqbit` (BitTorrent P2P), `reqwest` (HTTP), `tokio-tungstenite` (WebSocket), `quinn` (QUIC) — require **tokio**. Calling `tokio::Runtime::block_on()` from inside Bevy's executor panics. The solution is a dedicated tokio runtime on a background OS thread, communicating via channels.

#### Per-Binary Runtime Strategy

| Binary                | Game Loop                           | Async I/O                                      | Bridge              |
| --------------------- | ----------------------------------- | ---------------------------------------------- | ------------------- |
| `iron-curtain` (game) | Bevy scheduler + `bevy_tasks` pools | Dedicated tokio thread (background OS thread)  | `crossbeam-channel` |
| `ic-editor` (SDK)     | Bevy scheduler + `bevy_tasks` pools | Dedicated tokio thread (background OS thread)  | `crossbeam-channel` |
| `ic-server` (relay)   | No Bevy, no game loop               | `#[tokio::main]` — tokio is the entire runtime | N/A                 |
| `ic` (CLI)            | No Bevy, no game loop               | `tokio::runtime::Runtime::new()` + `block_on`  | N/A                 |

#### The Channel Bridge (Bevy Binaries)

For `ic-game` and `ic-editor`, a single background OS thread hosts a tokio runtime. All tokio-dependent I/O runs there. The Bevy ECS communicates via typed channels:

```
┌──────────────────────────┐   crossbeam-channel   ┌──────────────────────────┐
│  Bevy Game Loop (main)    │ ◄──────────────────► │  Tokio Thread (background)│
│                           │  IoCommand / IoResult │                           │
│  ic-sim (pure, no I/O)    │                       │  reqwest — HTTP/LLM calls │
│  ic-ui (render, ECS)      │                       │  librqbit — P2P downloads │
│  ic-audio (playback)      │                       │  tokio-tungstenite — WS   │
│  bevy_tasks (compute,     │                       │  quinn — QUIC             │
│    async compute, I/O)    │                       │  str0m I/O driver — VoIP  │
└──────────────────────────┘                        └──────────────────────────┘
```

**How it works:**

1. A Bevy system needs to make an LLM call or start a download → sends an `IoCommand` through `cmd_tx`.
2. The tokio thread receives it, spawns a tokio task (`tokio::spawn`), and performs the async I/O.
3. When complete, the result is sent back through `result_tx`.
4. A Bevy system polls `result_rx.try_recv()` each frame and injects results into the ECS world as events or resource mutations.
5. The sim never touches any of this — it remains pure.

**Channel choice:** `crossbeam-channel` for the sync↔async boundary (already used by IC's replay writer and voice pipeline — see `netcode/network-model-trait.md` § BackgroundReplayWriter and D059 § Voice Pipeline). Within the tokio runtime, `tokio::sync::mpsc` for intra-task communication.

```rust
/// Commands sent from Bevy systems to the tokio I/O thread.
pub enum IoCommand {
    HttpRequest { id: RequestId, url: String, method: HttpMethod, body: Option<Vec<u8>> },
    LlmPrompt { id: RequestId, task: LlmTask },
    StartDownload { package_id: PackageId },
    CancelDownload { package_id: PackageId },
    WorkshopPublish { package: PackageManifest },
    ReplayDownload { match_id: MatchId },
}

/// Results returned from the tokio I/O thread to Bevy systems.
pub enum IoResult {
    HttpResponse { id: RequestId, status: u16, body: Vec<u8> },
    LlmResponse { id: RequestId, result: Result<String, LlmError> },
    DownloadProgress { package_id: PackageId, bytes: u64, total: Option<u64> },
    DownloadComplete { package_id: PackageId, path: PathBuf },
    DownloadFailed { package_id: PackageId, error: String },
    PublishResult { result: Result<PackageVersion, WorkshopError> },
}
```

#### Relay Server: Pure Tokio

`ic-server` has no Bevy, no ECS, no game loop. It is a standard async Rust server:

- `#[tokio::main]` with multi-threaded work-stealing scheduler
- One tokio task per game session drives `RelayCore` + socket I/O
- `axum` or raw `hyper` for lobby/tracking HTTP endpoints
- `tokio::net::UdpSocket` feeding `str0m` (sans-I/O WebRTC) for game relay and voice forwarding
- Hundreds of concurrent sessions is well within tokio's comfort zone

This is already established in `03-NETCODE.md` § Backend Language: "`ic-server` binary — standalone headless process that hosts multiple concurrent games. Not Bevy, no ECS. Uses `RelayCore` + async I/O (tokio)."

#### Embedded Relay: Bevy's I/O Pool

When a player clicks "Host Game," `EmbeddedRelayNetwork` wraps `RelayCore` inside the game process. The relay's socket I/O runs on **Bevy's `IoTaskPool`** — not the tokio thread. This is the pattern established in `03-NETCODE.md`: the embedded relay uses Bevy's async task system, not a separate tokio runtime.

The embedded relay does not need tokio because `RelayCore` is a library with no runtime dependency — it processes orders and manages sessions. The socket I/O layer is thin and fits naturally into Bevy's I/O pool. Only external service calls (Workshop API, LLM, BitTorrent) route through the tokio thread.

#### str0m: Sans-I/O Advantage

str0m (WebRTC/VoIP — D059) has **no internal threads, no async runtime, no I/O**. All I/O is externalized — you own the sockets and feed str0m packets. This eliminates async runtime conflicts entirely:

- **Relay server:** A tokio task owns the UDP socket and drives str0m. Natural fit.
- **Game client (native):** A tokio task on the I/O thread owns the UDP socket. Voice packets are bridged to `ic-audio` via `crossbeam-channel` (already the design in D059 § Voice Pipeline).
- **Game client (WASM):** The browser's WebRTC API handles transport. str0m is not used — the browser provides equivalent functionality natively.

#### WASM: Platform-Specific I/O Bridge

**Tokio does not work in browser WASM.** There is no `std::thread` in the browser, and tokio's scheduler depends on it. Bevy on WASM is single-threaded — all three task pools collapse to a single-threaded executor backed by `wasm-bindgen-futures::spawn_local`.

The I/O bridge abstracts this behind a platform trait:

```rust
/// Platform-agnostic I/O bridge. Bevy systems interact with this
/// trait as a resource — they don't know what runtime backs it.
pub trait IoBridge: Send + Sync {
    fn send_command(&self, cmd: IoCommand);
    fn poll_results(&self) -> Vec<IoResult>;
}

/// Native: backed by crossbeam channels + dedicated tokio thread.
#[cfg(not(target_arch = "wasm32"))]
pub struct NativeIoBridge { /* cmd_tx, result_rx */ }

/// WASM: backed by wasm-bindgen-futures + browser Fetch API.
#[cfg(target_arch = "wasm32")]
pub struct WasmIoBridge { /* internal state */ }
```

**Platform-specific behavior:**

| Capability               | Native                               | WASM                                             |
| ------------------------ | ------------------------------------ | ------------------------------------------------ |
| HTTP (reqwest)           | Tokio thread                         | Browser Fetch API (reqwest auto-switches)        |
| LLM API calls            | Tokio thread (reqwest)               | Browser Fetch API                                |
| P2P downloads (librqbit) | Tokio thread                         | **Not available** — HTTP fallback from relay/CDN |
| WebSocket                | Tokio thread (tokio-tungstenite)     | Browser WebSocket API                            |
| WebRTC/VoIP              | Tokio thread driving str0m           | Browser WebRTC API (native, no str0m)            |
| UDP relay                | Tokio thread (tokio::net::UdpSocket) | WebTransport or WebSocket tunnel                 |

`librqbit` is **native-only** — WASM browser builds fall back to HTTP downloads served by Workshop CDN or relay mirrors. This constraint should be accepted early and the Workshop download system designed with HTTP fallback from the start (D049).

#### What Is Never Async

- **`ic-sim`** — Pure, deterministic, no I/O. Zero async. Invariant #1.
- **ECS system logic** — Bevy systems run synchronously on the main thread (or parallel via Bevy's scheduler). They poll channels, they don't `await`.
- **Order validation** — Deterministic, runs inside the sim. No network, no async.
- **Audio playback** — `ic-audio` receives events synchronously from ECS and plays sounds. The audio backend (Kira) manages its own threads internally.

#### Design Principles

1. **One tokio runtime per process, on a dedicated thread** (for Bevy binaries). Never nest runtimes or call `block_on` from within Bevy's executor.
2. **Channels are the universal bridge.** `crossbeam-channel` for sync↔async boundaries. `tokio::sync::mpsc` within tokio tasks. Already the established pattern for replay writing and voice pipeline.
3. **Platform divergence lives behind `IoBridge`.** Bevy systems send commands and poll results through the trait. They never import `tokio` or `wasm-bindgen-futures` directly.
4. **Sans-I/O libraries are preferred** where available (str0m for WebRTC). They eliminate async runtime coupling and work on every platform.
5. **The sim is the sync anchor.** Everything radiates outward from the deterministic sim: the Bevy scheduler drives systems synchronously, systems communicate with async I/O through channels, and results flow back as ECS events. The sim never waits for I/O.

### Crate Design Notes

Most crates are self-explanatory from the dependency graph, but three that appear in the graph without dedicated design doc sections are detailed here.

#### `ic-audio` — Sound, Music, and EVA

`ic-audio` is a Bevy audio plugin that handles all game sound: effects, EVA voice lines, music playback, and ambient audio.

**Responsibilities:**
- **Sound effects:** Weapon fire, explosions, unit acknowledgments, UI clicks. Triggered by sim events (combat, production, movement) via Bevy observer systems.
- **EVA voice system:** Plays notification audio triggered by `notification_system()` events. Manages a priority queue — high-priority notifications (nuke launch, base under attack) interrupt low-priority ones. Respects per-notification cooldowns.
- **Music playback:** Three modes — jukebox (classic sequential/shuffle), sequential (ordered playlist), and dynamic (mood-tagged tracks with game-state-driven transitions and crossfade). Supports `.aud` (original RA format via `ra-formats`) and modern formats (OGG, WAV via Bevy). Theme-specific intro tracks (D032 — Hell March for Classic theme). Dynamic mode monitors combat, base threat, and objective state to select appropriate mood category. See § "Red Alert Experience Recreation Strategy" for full music system design and D038 in `decisions/09f-tools.md` for scenario editor integration.
- **Spatial audio:** 3D positional audio for effects — explosions louder when camera is near. Uses Bevy's spatial audio with listener at `GameCamera.position` (see § "Camera System").
- **VoIP playback:** Decodes incoming Opus voice frames from `MessageLane::Voice` and mixes them into the audio output. Handles per-player volume, muting, and optional spatial panning (D059 § Spatial Audio). Voice replay playback syncs Opus frames to game ticks.
- **Ambient soundscapes:** Per-biome ambient loops (waves for coastal maps, wind for snow maps). Weather system (D022) can modify ambient tracks.

**Key types:**
```rust
pub struct AudioEvent {
    pub sound: SoundId,
    pub position: Option<WorldPos>,  // None = non-positional (UI, EVA, music)
    pub volume: f32,
    pub priority: AudioPriority,
}

pub enum AudioPriority { Ambient, Effect, Voice, EVA, Music }

pub struct Jukebox {
    pub playlist: Vec<TrackId>,
    pub current: usize,
    pub shuffle: bool,
    pub repeat: bool,
    pub crossfade_ms: u32,
}
```

**Format support:** `.aud` (IMA ADPCM, via `ra-formats` decoder), `.ogg`, `.wav`, `.mp3` (via Kira/`bevy_kira_audio`). Audio backend is Kira (chosen over rodio/Oddio for sub-frame scheduling, clock-synced crossfade, and per-track DSP). No platform-specific code in `ic-audio`.

> **Complete audio design:** Library evaluation, bus architecture, dynamic music FSM, EVA priority system, sound pooling, WASM constraints, and performance budget are specified in `research/audio-library-music-integration-design.md`.

**Phase:** Core audio (effects, EVA, music) in Phase 3. Spatial audio and ambient soundscapes in Phase 3-4.

##### Sim → Audio Event Bridge

The sim is pure (invariant #1) and emits no I/O. Audio events are therefore produced by **Bevy observer systems in `ic-game`** that detect sim state changes and emit typed Bevy events consumed by `ic-audio`. This section defines the formal event taxonomy that bridges the two.

**Event taxonomy:**

| Event type             | Trigger source (sim state change)                                    | Audio bus target                     |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| `CombatAudioEvent`     | Weapon fire, projectile impact, explosion, unit death                | `SfxBus` (WeaponSub / ExplosionSub)  |
| `ProductionAudioEvent` | Build started, build complete, unit ready                            | `SfxBus` (UiSub)                     |
| `MovementAudioEvent`   | Unit acknowledge, unit move start, formation move                    | `VoiceBus` (UnitSub)                 |
| `EvaNotification`      | Base under attack, unit lost, building complete, nuke detected, etc. | `VoiceBus` (EvaSub)                  |
| `MusicStateChange`     | Combat intensity shift, mission end (victory/defeat)                 | `MusicBus`                           |
| `AmbientAudioEvent`    | Biome change (map load), weather transition (D022)                   | `AmbientBus` (BiomeSub / WeatherSub) |
| `UiAudioEvent`         | Button click, menu transition, chat message received                 | `SfxBus` (UiSub)                     |

**Rust type definitions:**

```rust
/// Combat sounds — one event per projectile hit, not per salvo.
/// Spatial: always positional.
#[derive(Event, Clone)]
pub struct CombatAudioEvent {
    pub kind: CombatSoundKind,
    pub sound_id: SoundId,
    pub position: WorldPos,
    pub intensity: f32,         // 0.0-1.0, scales volume (explosion size, weapon caliber)
}

#[derive(Clone, Copy)]
pub enum CombatSoundKind {
    WeaponFire,
    ProjectileImpact,
    Explosion,
    UnitDeath,
}

/// Production sounds — non-positional (played as UI feedback).
#[derive(Event, Clone)]
pub struct ProductionAudioEvent {
    pub kind: ProductionSoundKind,
    pub actor_id: ActorId,      // what was built — used for sound lookup in YAML
    pub player: PlayerId,
}

#[derive(Clone, Copy)]
pub enum ProductionSoundKind {
    BuildStarted,
    BuildComplete,
    UnitReady,
}

/// Movement and acknowledgment sounds.
/// Spatial for move-start engine sounds; non-positional for voice acknowledgments.
#[derive(Event, Clone)]
pub struct MovementAudioEvent {
    pub kind: MovementSoundKind,
    pub unit_type: ActorId,
    pub position: WorldPos,
    pub player: PlayerId,
}

#[derive(Clone, Copy)]
pub enum MovementSoundKind {
    Acknowledge,    // "Yes sir", "Affirmative" — voice response to player command
    MoveStart,      // Engine/footstep sound when unit begins moving
}

/// EVA voice line trigger. Routed to the EvaSystem priority queue.
/// See research/audio-library-music-integration-design.md § EVA Priority Queue
/// for queue depth, cooldown, and interruption rules.
#[derive(Event, Clone)]
pub struct EvaNotification {
    pub sound_id: SoundId,
    pub priority: EvaPriority,
    pub notification_type: NotificationType,  // cooldown key — reuses sim's enum
}

/// Dynamic music mood transition request.
/// Emitted when combat score thresholds are crossed or mission ends.
/// See research/audio-library-music-integration-design.md § Dynamic Music FSM
/// for threshold values and transition rules.
#[derive(Event, Clone)]
pub struct MusicStateChange {
    pub target_mood: MusicMood,   // Ambient, Buildup, Combat, Victory, Defeat
    pub crossfade_ms: u32,        // override default crossfade duration (0 = use default)
}

/// Ambient soundscape changes — biome or weather transitions.
#[derive(Event, Clone)]
pub struct AmbientAudioEvent {
    pub kind: AmbientSoundKind,
    pub sound_id: SoundId,
    pub crossfade_ms: u32,        // smooth transition between ambient loops
}

#[derive(Clone, Copy)]
pub enum AmbientSoundKind {
    BiomeChange,     // map load or camera moved to different biome region
    WeatherChange,   // rain start/stop, storm intensity change (D022)
}

/// UI interaction sounds — non-positional, immediate playback.
#[derive(Event, Clone)]
pub struct UiAudioEvent {
    pub sound_id: SoundId,
}
```

**Event flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ic-sim (deterministic)                                          │
│   Weapon fires → UnitState changes → Production completes → …  │
│   (pure state transitions, no events emitted)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ state diffs visible via ECS queries
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ ic-game  (Bevy observer systems, non-deterministic)             │
│                                                                 │
│   on_weapon_fire()      → emit CombatAudioEvent                 │
│   on_unit_death()       → emit CombatAudioEvent + EvaNotification│
│   on_production_done()  → emit ProductionAudioEvent + EvaNotification│
│   on_move_order()       → emit MovementAudioEvent               │
│   on_notification()     → emit EvaNotification                  │
│   on_mission_end()      → emit MusicStateChange                 │
│   on_weather_change()   → emit AmbientAudioEvent                │
│   on_ui_interaction()   → emit UiAudioEvent                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Bevy events
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ ic-audio  (Bevy observer systems)                               │
│                                                                 │
│   on_combat_event()     → SfxBus (WeaponSub / ExplosionSub)    │
│   on_production_event() → SfxBus (UiSub)                        │
│   on_movement_event()   → VoiceBus (UnitSub)                    │
│   on_eva_notification() → EvaSystem priority queue → VoiceBus   │
│   on_music_change()     → DynamicMusicState FSM → MusicBus      │
│   on_ambient_event()    → AmbientBus (BiomeSub / WeatherSub)    │
│   on_ui_audio()         → SfxBus (UiSub)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Granularity rules:**

- **Combat:** One `CombatAudioEvent` per projectile hit, not per salvo. This preserves spatial accuracy — each impact plays at its own `WorldPos`. The sound pool and instance limits in `ic-audio` handle the case where 50 shells land in one frame (see `research/audio-library-music-integration-design.md` § Sound Pooling and Instance Limits).
- **Acknowledgments:** One `MovementAudioEvent::Acknowledge` per unit per command, with deduplication — if the same `unit_type` emits an acknowledgment within 100ms, only the first plays. This matches RA1 behavior (select 10 tanks, right-click = one "Acknowledged", not ten).
- **EVA:** `EvaNotification` feeds into the existing priority queue (`EvaSystem`). Mapping from sim `NotificationType` to `EvaPriority` is YAML-driven (see `gameplay-systems.md` § Notification System). The queue handles cooldowns, max depth, and interruption logic — this bridge layer only emits the event; `ic-audio` owns all queuing and playback policy.
- **Music:** `MusicStateChange` is emitted sparingly — only when the `update_combat_score()` system in `ic-audio` crosses a threshold (combat score > 0.3 → Combat mood) or when a mission ends. The `DynamicMusicState` FSM in `ic-audio` owns all transition logic, linger timers, and crossfade scheduling.
- **Production and UI:** Non-positional, immediate playback. No deduplication needed — these events are infrequent by nature.

**Key constraint:** These event types live in `ic-audio` (or a shared types module) and are emitted by observer systems in `ic-game`. They are **not** emitted by `ic-sim` — the sim produces pure state changes, and the observer layer in `ic-game` translates those into audio events. This preserves invariant #1 (simulation is pure, no I/O).

> **Cross-references:** Bus architecture and mixer topology: `research/audio-library-music-integration-design.md` § 2. EVA priority queue and interruption rules: same document § 4. Dynamic music FSM and combat score thresholds: same document § 3. Notification types and YAML mapping: `src/architecture/gameplay-systems.md` § Notification System.

#### `ic-ai` — Skirmish AI and Adaptive Difficulty

`ic-ai` provides computer opponents for skirmish and campaign, plus adaptive difficulty scaling.

**Architecture:** AI players run as Bevy systems that read visible game state and emit `PlayerOrder`s through `ic-protocol`. The sim processes AI orders identically to human orders — no special privileges. AI has no maphack by default (reads only fog-of-war-revealed state), though campaign scripts can grant omniscience for specific AI players via conditions.

**Internal structure — priority-based manager hierarchy:** The default `PersonalityDrivenAi` (D043) uses the dominant pattern found across all surveyed open-source RTS AI implementations (see `research/rts-ai-implementation-survey.md`):

```
PersonalityDrivenAi
├── EconomyManager       — harvester assignment, power monitoring, expansion timing
├── ProductionManager    — share-based unit composition, priority-queue build orders, influence-map building placement
├── MilitaryManager      — attack planning, event-driven defense, squad management
└── AiState (shared)     — threat map, resource map, scouting memory
```

Key techniques: priority-based resource allocation (from 0 A.D. Petra), share-based unit composition (from OpenRA), influence maps for building placement (from 0 A.D.), tick-gated evaluation (from Generals/Petra), fuzzy engagement logic (from OpenRA), Lanchester-inspired threat scoring (from MicroRTS research). Each manager runs on its own tick schedule — cheap decisions (defense) every tick, expensive decisions (strategic reassessment) every 60 ticks. Total amortized AI budget: <0.5ms per tick for 500 units. All AI working memory is pre-allocated in `AiScratch` (zero per-tick allocation). Full implementation detail in D043 (`decisions/09d-gameplay.md`).

**AI tiers (YAML-configured):**

| Tier   | Behavior                                                           | Target Audience                      |
| ------ | ------------------------------------------------------------------ | ------------------------------------ |
| Easy   | Slow build, no micro, predictable attacks, doesn't rebuild         | New players, campaign intro missions |
| Normal | Standard build order, basic army composition, attacks at intervals | Average players                      |
| Hard   | Optimized build order, mixed composition, multi-prong attacks      | Experienced players                  |
| Brutal | Near-optimal macro, active micro, expansion, adapts to player      | Competitive practice                 |

**Key types:**
```rust
/// AI personality — loaded from YAML, defines behavior parameters.
pub struct AiPersonality {
    pub name: String,
    pub build_order_priority: Vec<ActorId>,  // what to build first
    pub attack_threshold: i32,               // army value before attacking
    pub aggression: i32,                     // 0-100 scale
    pub expansion_tendency: i32,             // how eagerly AI expands
    pub micro_level: MicroLevel,             // None, Basic, Advanced
    pub tech_preference: TechPreference,     // Rush, Balanced, Tech
}

pub enum MicroLevel { None, Basic, Advanced }
pub enum TechPreference { Rush, Balanced, Tech }
```

**Adaptive difficulty (D034 integration):** `ic-ai` reads the client-side SQLite database (match history, player performance metrics) to calibrate AI difficulty. If the player has lost 5 consecutive games against "Normal" AI, the AI subtly reduces its efficiency. If the player is winning easily, the AI tightens its build order. This is per-player, invisible, and optional (can be disabled in settings).

**Shellmap AI:** A stripped-down AI profile specifically for menu background battles (D032 shellmaps). Prioritizes visually dramatic behavior over efficiency — large army clashes, diverse unit compositions, no early rushes. Runs with reduced tick budget since it shares CPU with the menu UI.

```yaml
# ai/shellmap.yaml
shellmap_ai:
  personality:
    name: "Shellmap Director"
    aggression: 40
    attack_threshold: 5000     # build up large armies before engaging
    micro_level: basic
    tech_preference: balanced
    build_order_priority: [power_plant, barracks, war_factory, ore_refinery]
    dramatic_mode: true        # prefer diverse unit mixes, avoid cheese strategies
    max_tick_budget_us: 2000   # 2ms max per AI tick (shellmap is background)
```

**Lua/WASM AI mods:** Community can implement custom AI via Lua (Tier 2) or WASM (Tier 3). Custom AI implements the `AiStrategy` trait (D041) and is selectable in the lobby. The engine provides `ic-ai`'s built-in `PersonalityDrivenAi` as the default; mods can replace or extend it.

**AiStrategy Trait (D041):**

`AiPersonality` tunes parameters within a fixed decision algorithm. For modders who want to replace the algorithm entirely (neural net, GOAP planner, MCTS, scripted state machine), the `AiStrategy` trait abstracts the decision-making:

```rust
/// Game modules and mods implement this for AI opponents.
/// Default: PersonalityDrivenAi (behavior trees driven by AiPersonality YAML).
pub trait AiStrategy: Send + Sync {
    /// Called once per AI player per tick. Reads fog-filtered state, emits orders.
    fn decide(
        &mut self,
        player: PlayerId,
        view: &FogFilteredView,
        tick: u64,
    ) -> Vec<PlayerOrder>;

    /// Human-readable name for lobby display.
    fn name(&self) -> &str;

    /// Difficulty tier for UI categorization.
    fn difficulty(&self) -> AiDifficulty;

    /// Per-tick compute budget hint (microseconds). None = no limit.
    fn tick_budget_hint(&self) -> Option<u64>;
}
```

`FogFilteredView` ensures AI honesty — the AI sees only what its units see, just like a human player. Campaign scripts can grant omniscience via conditions. AI strategies are selectable in the lobby: "IC Default (Normal)", "Workshop: Neural Net v2.1", etc. See D041 in `decisions/09d-gameplay.md` for full rationale.

**Phase:** Basic skirmish AI (Easy/Normal) in Phase 4. Hard/Brutal + adaptive difficulty in Phase 5-6a.

#### `ic-script` — Lua and WASM Mod Runtimes

`ic-script` hosts the Lua and WASM mod execution environments. It bridges the stable mod API surface to engine internals via a compatibility adapter layer.

**Architecture:**
```
  Mod code (Lua / WASM)
        │
        ▼
  ┌─────────────────────────┐
  │  Mod API Surface        │  ← versioned, stable (D024 globals, WASM host fns)
  ├─────────────────────────┤
  │  ic-script              │  ← this crate: runtime management, sandboxing, adaptation
  ├─────────────────────────┤
  │  ic-sim + ic-protocol   │  ← engine internals (can change between versions)
  └─────────────────────────┘
```

**Responsibilities:**
- **Lua runtime management:** Initializes `mlua` with deterministic seed, registers all API globals (D024), enforces `LuaExecutionLimits`, manages per-mod Lua states.
- **WASM runtime management:** Initializes `wasmtime` with fuel metering, registers WASM host functions, enforces `WasmExecutionLimits`, manages per-mod WASM instances.
- **Mod lifecycle:** Load → initialize → per-tick callbacks → unload. Mods are loaded at game start (not hot-reloaded mid-game in multiplayer — determinism).
- **Compatibility adapter:** Translates stable mod API calls to current engine internals. When engine internals change, this adapter is updated — mods don't notice. See `04-MODDING.md` § "Compatibility Adapter Layer".
- **Sandbox enforcement:** No filesystem, no network, no raw memory access. All mod I/O goes through the host API. Capability-based security per mod.
- **Campaign state:** Manages `Campaign.*` and `Var.*` state for branching campaigns (D021). Campaign variables are stored in save games.

**Key types:**
```rust
pub struct ScriptRuntime {
    pub lua_states: HashMap<ModId, LuaState>,
    pub wasm_instances: HashMap<ModId, WasmInstance>,
    pub api_version: ModApiVersion,
}

pub struct LuaState {
    pub vm: mlua::Lua,
    pub limits: LuaExecutionLimits,
    pub mod_id: ModId,
}

pub struct WasmInstance {
    pub instance: wasmtime::Instance,
    pub limits: WasmExecutionLimits,
    pub capabilities: ModCapabilities,
    pub mod_id: ModId,
}
```

**Determinism guarantee:** Both Lua and WASM execute at a fixed point in the system pipeline (`trigger_system()` step). All clients run the same mod code with the same game state at the same tick. Lua's string hash seed is fixed. `math.random()` is redirected to the sim's deterministic PRNG (not removed — OpenRA compat requires it).

**WASM determinism nuance:** WASM execution is deterministic for integer and fixed-point operations, but the WASM spec permits non-determinism in floating-point NaN bit patterns. If a WASM mod uses `f32`/`f64` internally (which is legal — the sim's fixed-point invariant applies to `ic-sim` Rust code, not to mod-internal computation), different CPU architectures may produce different NaN payloads, causing deterministic divergence (desync). Mitigations:
- **Runtime mandate:** IC uses `wasmtime` exclusively. All clients use the same `wasmtime` version (engine-pinned). `wasmtime` canonicalizes NaN outputs for WASM arithmetic operations, which eliminates NaN bit-pattern divergence across platforms.
- **Defensive recommendation for mod authors:** Mod development docs recommend using integer/fixed-point arithmetic for any computation whose results feed back into `PlayerOrder`s or are returned to host functions. Floats are safe for mod-internal scratch computation that is consumed and discarded within the same call (e.g., heuristic scoring, weight calculations that produce an integer output).
- **Hash verification:** All clients verify the WASM binary hash (SHA-256) before game start. Combined with `wasmtime`'s NaN canonicalization and identical inputs, this provides a strong determinism guarantee — but it is not formally proven the way `ic-sim`'s integer-only invariant is. WASM mod desync is tracked as a distinct diagnosis path in the desync debugger.

**Browser builds:** Tier 3 WASM mods are desktop/server-only. The browser build (WASM target) cannot embed `wasmtime` — see `04-MODDING.md` § "Browser Build Limitation (WASM-on-WASM)" for the full analysis and the documented mitigation path (`wasmi` interpreter fallback), which is an optional browser-platform expansion item unless promoted by platform milestone requirements.

**Phase:** Lua runtime in Phase 4. WASM runtime in Phase 4-5. Mod API versioning in Phase 6a.

#### `ic-paths` — Platform Path Resolution and Portable Mode

`ic-paths` is the single crate responsible for resolving all filesystem paths the engine uses at runtime: the player data directory (D061), log directory, mod search paths, and install-relative asset paths. Every other crate that needs a filesystem location imports from `ic-paths` — no crate resolves platform paths on its own.

`ic-paths` also owns the `CredentialStore` — the three-tier credential protection system that encrypts sensitive SQLite columns (OAuth tokens, API keys) with AES-256-GCM. The DEK (Data Encryption Key) is protected by OS keyring (Tier 1, via `keyring` crate), user vault passphrase with Argon2id KDF (Tier 2), or held session-only in memory (Tier 3, WASM). All crates that handle secrets (`ic-llm`, `ic-net`, `ic-game`) import `CredentialStore` from `ic-paths`. See `research/credential-protection-design.md` for the full design and V61 in `06-SECURITY.md` for the threat model.

**Two modes:**

| Mode                   | Resolution strategy                                                 | Use case                                                                                    |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Platform (default)** | XDG / `%APPDATA%` / `~/Library/Application Support/` per D061 table | Normal installed game (Steam, package manager, manual install)                              |
| **Portable**           | All paths relative to the executable location                       | USB-stick deployments, Steam Deck SD cards, developer tooling, self-contained distributions |

Mode is selected by (highest priority first):
1. `IC_PORTABLE=1` environment variable
2. `--portable` CLI flag
3. Presence of a `portable.marker` file next to the executable
4. Otherwise: platform mode

**Portable mode** uses the [`app-path`](https://github.com/iron-curtain-engine/app-path-rs) crate (zero-dependency, cross-platform exe-relative path resolution with static caching) to resolve all paths relative to the executable. In portable mode the data directory becomes `<exe_dir>/data/` instead of the platform-specific location, and the entire installation is self-contained — copy the folder to move it.

**Key types:**
```rust
/// Resolved set of root paths for the current session.
/// Computed once at startup, immutable thereafter.
pub struct AppDirs {
    pub data_dir: PathBuf,      // Player data (D061): config, saves, replays, keys, ...
    pub install_dir: PathBuf,   // Shipped content: mods/common/, mods/ra/, binaries
    pub log_dir: PathBuf,       // Log files (rotated)
    pub cache_dir: PathBuf,     // Temporary/derived data (shader cache, download staging)
    pub mode: PathMode,         // Platform or Portable — for diagnostics / UI display
}

pub enum PathMode { Platform, Portable }
```

**Path boundary integration:** `AppDirs` resolves *where* directories live; `strict-path` `PathBoundary` enforces that untrusted paths stay *within* them. Callers that handle untrusted input (archive extraction, mod file references, save loading) must create a `PathBoundary` from the relevant `AppDirs` field before performing I/O. Convenience methods provide pre-built boundaries for common cases:

```rust
impl AppDirs {
    /// PathBoundary for save directory — save game loading is sandboxed here.
    pub fn save_boundary(&self) -> Result<PathBoundary, strict_path::Error> {
        PathBoundary::new(self.data_dir.join("saves"))
    }
    /// PathBoundary for mod directory — mod file references are sandboxed here.
    pub fn mod_boundary(&self, mod_id: &ModId) -> Result<PathBoundary, strict_path::Error> {
        PathBoundary::new(self.data_dir.join("mods").join(mod_id.as_ref()))
    }
    /// PathBoundary for replay cache — embedded resource extraction is sandboxed here.
    pub fn replay_cache_boundary(&self) -> Result<PathBoundary, strict_path::Error> {
        PathBoundary::new(self.cache_dir.join("replay-resources"))
    }
}
```

See `06-SECURITY.md` § Path Security Infrastructure for the full integration table.

**Additional override:** `--data-dir <path>` CLI flag overrides the data directory location regardless of mode. This is useful for developers running multiple profiles or testing with different data sets. If `--data-dir` is set, `PathMode` is still reported as `Platform` or `Portable` based on the detection above — the override only changes `data_dir`, not the mode label.

**Visibility:** The current path mode is shown in:
- Settings → Data tab: `"Data location: C:\Games\IC\data\ (portable mode)"` or `"Data location: %APPDATA%\IronCurtain\ (standard)"`
- Console: `ic_paths` command prints all resolved paths and the active mode
- First-launch wizard: if portable mode is detected, a brief note: `"Running in portable mode — all data is stored next to the game executable."`
- Main menu footer (optional, subtle): a small `[P]` badge or `"Portable"` label if the player wants to see it (toggleable via Settings → Video → Show Mode Indicator)

**Creating a portable installation:** To convert a standard install into a portable one, a user just:
1. Copies the game folder to a USB drive (or any location)
2. Creates an empty `portable.marker` file next to the executable
3. Launches the game — done

No explicit init step needed. On first launch in portable mode, the engine auto-creates the `data/` directory and runs the first-launch wizard normally. If the user already has a platform install on the same machine, the wizard detects it and offers: `"Found existing IC data on this machine. [Import my settings & identity] [Start fresh]"`. This replaces any need for a separate init command — the wizard handles everything, and the user doesn't need to learn a CLI command to set up portable mode.

**WASM:** Browser builds return OPFS-backed virtual paths. Portable mode is not applicable — `PathMode::Platform` is always used. Mobile builds use the platform app sandbox unconditionally.

**Phase:** Phase 1 (required before any file I/O — asset loading, config, logs).
