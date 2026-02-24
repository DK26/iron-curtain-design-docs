## Crate Dependency Graph

```
ic-protocol  (shared types: PlayerOrder, TimestampedOrder)
    ↑
    ├── ic-sim      (depends on: ic-protocol, ra-formats)
    ├── ic-net      (depends on: ic-protocol; contains RelayCore library + relay-server binary)
    ├── ra-formats  (standalone — .mix, .shp, .pal, YAML)
    ├── ic-render   (depends on: ic-sim for reading state)
    ├── ic-ui       (depends on: ic-sim, ic-render; reads SQLite for player analytics — D034)
    ├── ic-audio    (depends on: ra-formats)
    ├── ic-script   (depends on: ic-sim, ic-protocol)
    ├── ic-ai       (depends on: ic-sim, ic-protocol; reads SQLite for adaptive difficulty — D034)
    ├── ic-llm      (depends on: ic-sim, ic-script, ic-protocol; reads SQLite for personalization — D034)
    ├── ic-paths    (standalone — platform path resolution, portable mode; wraps `app-path` crate)
    ├── ic-editor   (depends on: ic-render, ic-sim, ic-ui, ic-protocol, ra-formats, ic-paths; SDK binary — D038+D040)
    └── ic-game     (depends on: everything above EXCEPT ic-editor)
```

**Critical boundary:** `ic-sim` never imports from `ic-net`. `ic-net` never imports from `ic-sim`. They only share `ic-protocol`. `ic-game` never imports from `ic-editor` — the game and SDK are separate binaries that share library crates.

**Storage boundary:** `ic-sim` never reads or writes SQLite (invariant #1). Three crates are read-only consumers of the client-side SQLite database: `ic-ui` (post-game stats, career page, campaign dashboard), `ic-llm` (personalized missions, adaptive briefings, coaching), `ic-ai` (difficulty scaling, counter-strategy selection). Gameplay events are written by a Bevy observer system in `ic-game`, outside the deterministic sim. See D034 in `decisions/09e-community.md`.

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

**Format support:** `.aud` (IMA ADPCM, via `ra-formats` decoder), `.ogg`, `.wav`, `.mp3` (via Bevy/rodio). Audio backend is abstracted by Bevy — no platform-specific code in `ic-audio`.

**Phase:** Core audio (effects, EVA, music) in Phase 3. Spatial audio and ambient soundscapes in Phase 3-4.

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

**Determinism guarantee:** Both Lua and WASM execute at a fixed point in the system pipeline (`trigger_system()` step). All clients run the same mod code with the same game state at the same tick. Lua's string hash seed is fixed. `math.random()` is replaced with the sim's deterministic PRNG.

**WASM determinism nuance:** WASM execution is deterministic for integer and fixed-point operations, but the WASM spec permits non-determinism in floating-point NaN bit patterns. If a WASM mod uses `f32`/`f64` internally (which is legal — the sim's fixed-point invariant applies to `ic-sim` Rust code, not to mod-internal computation), different CPU architectures may produce different NaN payloads, causing deterministic divergence (desync). Mitigations:
- **Runtime mandate:** IC uses `wasmtime` exclusively. All clients use the same `wasmtime` version (engine-pinned). `wasmtime` canonicalizes NaN outputs for WASM arithmetic operations, which eliminates NaN bit-pattern divergence across platforms.
- **Defensive recommendation for mod authors:** Mod development docs recommend using integer/fixed-point arithmetic for any computation whose results feed back into `PlayerOrder`s or are returned to host functions. Floats are safe for mod-internal scratch computation that is consumed and discarded within the same call (e.g., heuristic scoring, weight calculations that produce an integer output).
- **Hash verification:** All clients verify the WASM binary hash (SHA-256) before game start. Combined with `wasmtime`'s NaN canonicalization and identical inputs, this provides a strong determinism guarantee — but it is not formally proven the way `ic-sim`'s integer-only invariant is. WASM mod desync is tracked as a distinct diagnosis path in the desync debugger.

**Browser builds:** Tier 3 WASM mods are desktop/server-only. The browser build (WASM target) cannot embed `wasmtime` — see `04-MODDING.md` § "Browser Build Limitation (WASM-on-WASM)" for the full analysis and the documented mitigation path (`wasmi` interpreter fallback), which is an optional browser-platform expansion item unless promoted by platform milestone requirements.

**Phase:** Lua runtime in Phase 4. WASM runtime in Phase 4-5. Mod API versioning in Phase 6a.

#### `ic-paths` — Platform Path Resolution and Portable Mode

`ic-paths` is the single crate responsible for resolving all filesystem paths the engine uses at runtime: the player data directory (D061), log directory, mod search paths, and install-relative asset paths. Every other crate that needs a filesystem location imports from `ic-paths` — no crate resolves platform paths on its own.

**Two modes:**

| Mode | Resolution strategy | Use case |
| --- | --- | --- |
| **Platform (default)** | XDG / `%APPDATA%` / `~/Library/Application Support/` per D061 table | Normal installed game (Steam, package manager, manual install) |
| **Portable** | All paths relative to the executable location | USB-stick deployments, Steam Deck SD cards, developer tooling, self-contained distributions |

Mode is selected by (highest priority first):
1. `IC_PORTABLE=1` environment variable
2. `--portable` CLI flag
3. Presence of a `portable.marker` file next to the executable
4. Otherwise: platform mode

**Portable mode** uses the [`app-path`](https://github.com/DK26/app-path-rs) crate (zero-dependency, cross-platform exe-relative path resolution with static caching) to resolve all paths relative to the executable. In portable mode the data directory becomes `<exe_dir>/data/` instead of the platform-specific location, and the entire installation is self-contained — copy the folder to move it.

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

**WASM:** Browser builds return OPFS-backed virtual paths. Portable mode is not applicable — `PathMode::Platform` is always used. Mobile builds use the platform app sandbox unconditionally.

**Phase:** Phase 1 (required before any file I/O — asset loading, config, logs).
