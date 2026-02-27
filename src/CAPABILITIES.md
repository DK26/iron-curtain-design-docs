# Iron Curtain — Platform Capabilities

> Everything you get when you choose Iron Curtain as your RTS platform — whether you're a player, a modder, a map maker, or building a total conversion.

## For Players

### Gameplay Modes

| Mode | What You Get |
|------|-------------|
| **Campaign (Allied + Soviet)** | All original Red Alert missions fully playable with branching outcomes, unit roster persistence, veterancy carry-over, and optional hero progression (D021) |
| **Skirmish vs AI** | Up to 8 players/AI on any map; AI difficulty (Easy–Brutal) with distinct personality profiles (Classic Westwood, OpenRA, IC Default); mix different AI personalities in the same match (D043) |
| **Ranked Multiplayer** | Glicko-2 rating with seasonal tiers (Conscript → Supreme Commander), per-queue ratings (1v1, 2v2, FFA), map veto system, placement matches, escalating cooldowns (D055) |
| **Casual Multiplayer** | Game browser, Among Us-style room codes (IRON-XXXX), QR join for LAN/streaming, Discord/Steam deep links, auto-download missing mods on join (D030) |
| **Asymmetric Co-op** | Commander + Field Ops roles with separate HUDs, support request system (CAS, Recon, Reinforcements, Extraction), and War-Effort Board pacing (D070) |
| **Generative Campaigns (BYOLLM)** | Describe a campaign in plain text → LLM generates branching missions, briefings, AI behavior, and narrative that adapts to your play (D016) |
| **LLM Exhibition** | BYO-LLM Fight Night (AI vs AI), Prompt Duel (guide AI with strategy prompts), Director Showmatch (audience-driven spectacle) (D073) |
| **Spectating** | Mid-game join, configurable broadcast delay, observer panels (Army/Production/Economy/Score/APM), directed camera AI, community observer UI layouts via Workshop |

### The Red Alert Experience — Faithful and Enhanced

IC recreates the Red Alert feel using values verified against EA source code, then adds quality-of-life features that don't break the classic identity:

**Faithfully Recreated:**
- Palette-indexed sprite rendering with all original SHP draw modes (shadow, ghost, predator)
- Isometric 14-layer Z-order (terrain → shadows → buildings → units → aircraft → projectiles → effects → UI)
- Credit counter with ticking animation, power bar with green/yellow/red states
- EVA voice system with priority queuing (rare notifications don't get lost)
- Unit voice pools with no-immediate-repeat selection
- Dynamic music (combat/build/victory transitions honoring Frank Klepacki's intent)

**IC Enhancements (New Features With No Classic RA Equivalent):**
- Attack-move (default on), rally points, parallel factories, unit stances (Aggressive/Defensive/Hold/Return Fire)
- Smart box-select (harvesters deprioritized), camera bookmarks (F5-F8)
- Dynamic weather system affecting movement and terrain passability (D022)
- Veterancy promotions with visible rank indicators and stat bonuses
- Render mode toggle (F1): Classic / HD / 3D — switchable mid-game (D048)

### Customization — Play Your Way

IC doesn't force one way to play. Every axis is independently composable:

**Balance Presets (D019):**
- Classic (original EA values — frozen, never changes)
- OpenRA (tracks upstream OpenRA balance patches)
- Remastered Collection
- IC Default (patched once per ranked season based on telemetry)
- Custom (player-editable YAML)

**Experience Profiles (D033):**
- Vanilla RA, OpenRA, Remastered, or Iron Curtain — each bundles balance + theme + QoL + AI + pathfinding + render mode
- Override any individual axis in the lobby
- Create and share custom profiles via Workshop

**Quality of Life Toggles (D033):**
- Production: attack-move, waypoint queue, multi-queue, rally points, parallel factories
- Commands: force-fire, force-move, guard, scatter, unit stances
- UI: health bars, range circles, build radius, target lines, selection outline
- Selection: box shape (diamond/rectangle), smart type cycling
- All individually toggleable, not locked to presets

**Pathfinding Variants (D045):**
- Remastered (original feel), OpenRA (improved A*), IC Default (flowfield + ORCA-lite hybrid)
- Per-lobby selection, mod-extensible via WASM

**AI Personality & Difficulty (D043):**
- Two-axis tuning: engine scaling (resource bonuses) + behavioral personality (aggression, expansion, tech preference)
- Mix different personalities in the same match
- Replay-based behavioral mimicry: AI learns from your replays

### Multiplayer Infrastructure

- **Relay servers** eliminate lag-switching and host advantage — relay owns the clock (D007)
- **Sub-tick fairness** — orders from faster and slower players processed fairly (D008)
- **Adaptive run-ahead** — client predicts during lag, corrects without rubber-banding
- **Encrypted transport** — all traffic encrypted and authenticated (TLS/QUIC)
- **Community servers** — anyone can host their own relay, matchmaking, and workshop servers with federated trust (D052)
- **Cross-engine browser** — see OpenRA and CnCNet games from the IC client (D011)
- **Portable identity** — 24-word recovery phrase; restore on any machine (D061)

### Replays & Analysis

- **Auto-recording** of all matches with Match ID system
- **Arbitrary seeking** (forward and backward) via keyframe re-simulation
- **5 camera modes:** free, player perspective, follow unit, directed (AI auto-follows action), drone cinematic
- **Observer overlays:** army composition, production queues, economy, powers, score, APM
- **Heatmaps:** unit death, combat, camera attention, economy
- **Graphs:** army value, income, unspent resources, APM — all clickable (jump to that moment)
- **Video export** (WebM) with cinematic camera path editor, lens controls, letterbox
- **Foreign replay import** — play OpenRA `.orarep` and Remastered replays with divergence tracking (D056)
- **Anonymization** for sharing (strip names, voice, chat)

### Workshop & Content

- **Browse and install** maps, mods, campaigns, themes, AI presets, music, sprites, voice packs, and more
- **One-click mod profiles** — save different mod combinations, switch instantly
- **Auto-download on lobby join** — missing content installs automatically (P2P preferred, HTTP fallback)
- **Mod fingerprint** — SHA-256 hash ensures all players have identical rules
- **Federated mirrors** — official server, community mirrors, local directories; works offline with bundles

### Tutorial & Onboarding (D065)

- **Commander School** — 6-mission dopamine-first tutorial campaign (blow things up first, learn economy later)
- **IC-aware hints** — veterans see "IC adds rally points," newcomers see "Right-click to set a rally point"
- **Feature Smart Tips** — non-intrusive contextual tips on Workshop, Settings, Profile, and Main Menu screens
- **Adaptive pacing** — hint frequency scales with demonstrated skill
- **Post-game learning** — "You had 15 idle harvester seconds" with replay moment links

### Platform Support

| Platform | Status |
|----------|--------|
| Windows, macOS, Linux | Full desktop support |
| Steam Deck | Gamepad controls, touchpad, gyro, shoulder-button PTT |
| Browser (WASM) | Full game playable in browser with WebRTC VoIP |
| Tablet | Touch-optimized sidebar, command rail, camera bookmark dock |
| Phone | Bottom-bar layout, build drawer, compact minimap, tempo advisory |
| Portable mode | USB-stick deployment, no installation required |

---

## For Modders & Content Creators

### Three-Tier Modding System

| Tier | Tool | What You Can Do | Skill Required |
|------|------|----------------|---------------|
| **Tier 1: YAML** | Text editor | Unit stats, weapons, buildings, factions, balance presets, UI themes, terrain, achievements | None — edit values in plain text |
| **Tier 2: Lua** | Text editor + SDK | Mission scripting, campaign logic, AI behavior, weather control, custom triggers, tutorial sequences | Basic scripting |
| **Tier 3: WASM** | Rust/C/AssemblyScript | Custom mechanics, new components, total conversions, custom pathfinding, custom export targets | Programming |

Each tier is optional and sandboxed. No C# runtime. No engine recompilation. No forking.

### OpenRA Compatibility — Bring Your Existing Work

| Feature | What It Means |
|---------|--------------|
| **MiniYAML loading** (D025) | OpenRA `rules.yaml` files load directly — no conversion required |
| **Mod manifest parsing** (D026) | OpenRA `mod.yaml` recognized natively; `ic mod import` for permanent migration |
| **Vocabulary aliases** (D023) | OpenRA trait names (`Armament`, `Valued`, `Buildable`) accepted as aliases |
| **Replay import** (D056) | OpenRA `.orarep` files play back with divergence tracking |
| **Lua API superset** (D024) | All 16 OpenRA Lua globals work identically; IC adds 11 more (Campaign, Weather, Layer, SubMap, Region, Var, Workshop, LLM, Achievement, Tutorial, Ai) |
| **C# assembly handling** (D026) | C# DLLs flagged with warnings; affected units get placeholder rendering |
| **Cross-engine browser** (D011) | IC games appear in OpenRA/CnCNet browser and vice versa |

### Scenario Editor (SDK — D038)

A full visual mission editor inspired by OFP's mission editor and Arma 3's Eden Editor:

**12 editing modes:** Terrain (paint tiles/resources/cliffs/water), Entities (place units/buildings/props), Groups (squad organization), Triggers (area-based conditional logic), Waypoints (OFP F4-style visual route authoring), Connections (visual trigger/waypoint linking), Modules (30+ drag-and-drop logic blocks), Regions (named spatial zones), Layers (dynamic mission expansion), Portals (sub-map transitions), Scripts (Lua file browser/editor), Campaign (mission graph wiring)

**Key capabilities:**
- **Simple/Advanced mode** — same data model, different UI complexity; beginners place units in minutes, advanced users add triggers and scripting
- **Entity placement** with double-click, naming (variable names for scripts), faction assignment, probability of presence, condition of presence, veterancy, health, inline Lua init scripts
- **Trigger system** — area-based with conditions (unit present/destroyed/captured/built), min/mid/max randomized timers, repeatable/one-shot, Lua escape hatch for custom conditions
- **Module system** — 30+ pre-built logic nodes: Wave Spawner, Patrol Route, Guard Position, Reinforcements, Destroy Target, Capture Building, Defend Position, Escort Convoy, Weather Change, Camera Pan, Cinematic Sequence, Map Segment Unlock, Sub-Scenario Portal, Tutorial Step, Spectator Bookmark, and more
- **Waypoints** — visual route authoring with types (Move, Attack, Guard, Patrol, Harvest, Script, Wait), synchronization lines for multi-group coordination, route naming for script reference
- **Mission outcomes** — named outcome triggers (`Mission.Complete("victory_bridge_intact")`) wired to campaign branch graph
- **Compositions** — reusable prefabs (base layouts, defensive formations, scripted encounters) saved and shared via Workshop
- **Preview / Test / Validate / Publish** toolbar — Test launches real game runtime; Validate checks rules asynchronously; Publish Readiness aggregates all warnings
- **Git-first collaboration** — stable content IDs, canonical serialization, semantic diff/merge helpers
- **Undo/redo + autosave** with crash recovery
- **Interactive guided tours** — 10 built-in step-by-step walkthroughs with spotlight overlay and validation (D038)
- **F1 context help** — opens authoring manual page for any selected element

### Asset Studio (SDK — D040)

XCC Mixer replacement with visual editing — no command-line tools needed:

- **Browse** .mix/.big/.oramap archives with extraction
- **View** sprites (.shp/.png with palette), palettes (.pal), terrain tiles (.tmp), audio (.aud/.wav/.ogg), video (.vqa/.mp4/.webm), 3D models (.gltf/.vxl)
- **Edit** palettes (remap, faction colors, hue shifts), sprite sheets (reorder frames, adjust timing, composite layers), terrain tiles (connectivity rules, transitions), chrome/themes (9-slice panels, live menu preview)
- **Convert** bidirectionally: SHP ↔ PNG, AUD ↔ WAV, VQA ↔ WebM
- **Import** PNG → palette-quantized SHP; GLTF → game models with LODs; fonts → bitmap sheets
- **Batch operations** — bulk palette remap, resize, re-export across assets
- **Diff/compare** — side-by-side version comparison with pixel-diff highlights
- **Hot-reload bridge** — edit assets, see changes in running game immediately
- **Provenance metadata** — track source, author, license, modification history per asset
- **Optional LLM-assisted generation** (Phase 7) — describe a unit → LLM generates sprite sheet → iterate

### Campaign System (D021)

- **Branching graph structure** — missions linked by named outcomes, not linear lists
- **Multiple outcomes per mission** — win/loss/partial each branch differently
- **No mandatory game-over** — designer controls what happens on defeat (retry, fallback, consequences)
- **Unit roster persistence** — surviving units carry forward with veterancy, kills, equipment
- **Campaign variables** — Lua-accessible flags, counters, and state that persist across missions
- **Hero progression** (optional) — XP, levels, skill trees, loadouts per named character
- **Intermission screens** — Hero Sheets, Skill Choice, Armory/Loadout between missions
- **Campaign Graph Editor** in SDK — visual node-and-edge editing, drag missions, label outcomes, validate branches

### Export to Other Engines (D066)

IC scenarios can be exported to other Red Alert implementations:

| Target | Output | Fidelity |
|--------|--------|----------|
| **IC Native** | `.icscn` / `.iccampaign` | Full |
| **OpenRA** | `.oramap` ZIP + MiniYAML rules + `mod.yaml` | High (IC-only features degrade with warnings) |
| **Original Red Alert** | `rules.ini` + `.bin` + `.mpr` + `.shp`/`.pal`/`.aud`/`.mix` | Moderate (complex triggers downcompile via pattern matching) |

- **Export-safe authoring mode** — live fidelity indicators (green/yellow/red) per entity/trigger
- **Pattern-based trigger downcompilation** — `Trigger.AfterDelay()` → RA1 timed trigger, `Trigger.OnKilled()` → destroyed trigger, etc.
- **Extensible export targets** — community can add Tiberian Sun, RA2, Remastered via WASM plugins
- **CLI export** — `ic export --target openra|ra1 mission.yaml -o ./output/`

**The vision:** IC becomes the tool the C&C community uses to create content for *any* C&C engine, not just IC itself.

### Workshop Distribution (D030)

- **Publish** maps, mods, campaigns, themes, AI presets, music, sprites, voice packs, script libraries, observer layouts, camera paths, LLM configs
- **Versioning** — semver with dependency ranges (Cargo-style); lockfile for reproducible installs
- **Licensing** — SPDX identifiers with `ic mod audit` for compatibility checking
- **Channels** — dev / beta / release with promotion between channels
- **P2P distribution** — BitTorrent/WebTorrent for large packages; HTTP fallback
- **Community mirrors** — run your own Workshop server; federation with official
- **Offline bundles** — export resources as portable archives for LAN parties
- **CI/CD integration** — headless publishing via scoped API tokens; tag-based automation
- **CLI:** `ic mod install`, `ic mod update`, `ic mod tree`, `ic mod audit`, `ic mod publish`

### LLM-Powered Creator Tools (Optional, BYOLLM — D016)

- **Single mission generation** — text prompt → terrain, objectives, AI behavior, triggers, briefing
- **Campaign generation** — text description → full branching multi-mission campaign
- **Natural language intent** — "Soviet campaign, disgraced colonel, Eastern Front" → pre-filled campaign parameters
- **Replay-to-scenario extraction** — convert replay into playable mission with optional LLM-generated narrative
- **Player-aware generation** — LLM reads your match history for personalized missions
- **LLM Orchestrator AI** — strategic wrapper around conventional AI; AI handles micro
- **Skill Library** (D057) — persistent store of verified LLM outputs; promotes quality over time

---

## For Engine Developers & Researchers

### Deterministic Simulation Core

- **Fixed-point math only** (`i32`/`i64`, scale 1024) — no floats in sim; identical results on all platforms
- **No I/O in sim** — pure state evolution; no file, network, or clock access
- **No HashMap/HashSet** — `BTreeMap`/`BTreeSet`/`IndexMap` only; deterministic iteration
- **Snapshottable state** — full game state serializable for replays, save/load, crash recovery, delta encoding (D010)
- **External Sim API** — `ic-sim` is a public library crate: `new()`, `step()`, `inject_orders()`, `query_state()`, `snapshot()`, `restore()`
- **Use cases:** AI bot tournaments, academic research, automated testing, replay analysis tools

### Pluggable Architecture (14+ Trait Seams — D041)

Every major subsystem is abstracted behind a trait — swap algorithms without forking:

| Trait | Built-In Implementations | What You Can Swap |
|-------|------------------------|-------------------|
| `NetworkModel` | Relay lockstep, local, replay playback | Network transport |
| `Pathfinder` | JPS+flowfield, A* grid, navmesh | Movement algorithm |
| `SpatialIndex` | Grid hash, BVH, R-tree | Range query structure |
| `FogProvider` | Radius (RA1), elevation LOS (RA2/TS) | Visibility model |
| `DamageResolver` | Standard (RA1), shield-first (RA2), sub-object (Generals) | Damage calculation |
| `AiStrategy` | Personality-driven, planning, neural net | AI decision-making |
| `OrderValidator` | Standard ownership/affordability | Rule enforcement |
| `RankingProvider` | Glicko-2, Elo, TrueSkill | Rating algorithm |
| `Renderable` | Sprite (2D), voxel, mesh (3D) | Visual representation |
| `GameModule` | RA1, TD, D2K, custom | Entire game ruleset |
| `InputSource` | Mouse/KB, touch, gamepad, AI | Input device |
| `Transport` | TCP, QUIC, WebSocket, WebRTC | Wire protocol |

### Multi-Game Engine

IC is not hardcoded for Red Alert. The `GameModule` trait defines everything game-specific:

- Components, systems, and scheduling
- Fog model, damage model, pathfinding
- AI defaults, order validation
- Each module (RA1, TD, RA2, D2K, custom) registers its own rules
- Same engine binary runs different games via module selection

### Performance

- **Render-sim split** — simulation at 15 Hz, rendering at 60+ FPS with interpolation
- **Zero-allocation hot paths** — string interning, object pooling, pre-allocated buffers
- **Delta encoding** — property-level change tracking; baselines (Quake 3 pattern) reduce snapshot payloads ~90%
- **Amortized staggered updates** — fog, AI, and pathfinding spread across multiple ticks
- **Multi-layer pathfinding** — hierarchical sectors + JPS + flowfield + ORCA-lite avoidance
- **GPU compatibility tiers** — auto-detection; playable on 12-year-old hardware

### Security & Anti-Cheat

- **Relay time authority** — server owns the clock; lag-switch impossible (D007)
- **Deterministic order validation** — all clients agree on accept/reject; cheated orders rejected identically (D012)
- **Capability-based WASM sandbox** — mods cannot access filesystem, network, or raw memory (D005)
- **Signed replay hash chain** — Ed25519 signing; tampering detected (D010)
- **Mandatory transport encryption** — AEAD on all network traffic
- **Bounded reconciler corrections** — state corrections validated before application

### Observability

- **Unified OTEL telemetry** — client, relay, tracking, AI all emit structured events (D031)
- **Desync diagnostics** — Merkle tree pinpoints divergence to exact system/entity
- **Background replay writer** — crash-safe, zero frame-time impact
- **Diagnostic overlay** — FPS, latency, order rate, path cache stats in-game

### Community Infrastructure

- **Self-hostable relay, matchmaking, and workshop servers** (D052)
- **Ed25519 signed credential records** — portable reputation across communities
- **Transparency logs** — server publishes signed operation log for accountability
- **Federated architecture** — communities interoperate with official infrastructure
- **Server configuration** via `server_config.toml` with deployment guide (Chapter 15)

---

## Quick Comparison

| Capability | OpenRA | Remastered | **Iron Curtain** |
|-----------|--------|-----------|-----------------|
| Open source | Yes | No | Yes |
| Branching campaigns | No | No | **Yes (D021)** |
| Balance presets (switchable) | No (one balance) | No | **Yes — Classic/OpenRA/Remastered/IC/Custom (D019)** |
| Relay server (no host advantage) | No (P2P) | No (P2P) | **Yes (D007)** |
| Ranked matchmaking | Community | No | **Built-in Glicko-2 (D055)** |
| Mod workshop with dependencies | No | Steam Workshop | **Federated with semver, P2P, offline (D030)** |
| Scenario editor | Map editor only | No | **Full OFP-inspired mission editor (D038)** |
| Asset studio | No | No | **Visual sprite/palette/terrain/audio editor (D040)** |
| Export to other engines | N/A | N/A | **OpenRA + RA1 export with fidelity warnings (D066)** |
| LLM-generated missions | No | No | **BYOLLM — text → playable campaigns (D016)** |
| Multi-game engine | RA1/TD/TS/D2K (separate mods) | RA1 + TD only | **GameModule trait — any RTS (D018)** |
| Weather system | No | No | **Dynamic with gameplay effects (D022)** |
| Render mode toggle | No | Toggle (Classic/HD) | **Classic/HD/3D — mid-game (D048)** |
| Tutorial system | Wiki link | Basic tooltips | **5-layer onboarding (D065)** |
| Mobile/browser | No | No | **Phone, tablet, browser WASM, Steam Deck** |
| Voice chat | No | No | **Built-in WebRTC/Opus (D059)** |
| Asymmetric co-op | No | No | **Commander + Field Ops roles (D070)** |
