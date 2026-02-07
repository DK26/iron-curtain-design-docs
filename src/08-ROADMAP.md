# 08 — Development Roadmap (36 Months)

## Phase Dependencies

```
Phase 0 (Foundation)
  └→ Phase 1 (Rendering + Bevy visual pipeline)
       └→ Phase 2 (Simulation) ← CRITICAL MILESTONE
            ├→ Phase 3 (Game Chrome)
            │    └→ Phase 4 (AI & Single Player)
            │         └→ Phase 5 (Multiplayer)
            │              └→ Phase 6 (Modding & Ecosystem)
            │                   └→ Phase 7 (LLM Missions + Polish)
            └→ [Test infrastructure, CI, headless sim tests]
```

## Phase 0: Foundation & Format Literacy (Months 1–3)

**Goal:** Read everything OpenRA reads, produce nothing visible yet.

### Deliverables
- `ra-formats` crate: parse `.mix` archives, SHP/TMP sprites, `.aud` audio, `.pal` palettes, `.vqa` video
- Parse OpenRA YAML manifests, map format, rule definitions
- `miniyaml2yaml` converter tool
- CLI tool to dump/inspect/validate RA assets
- Extensive tests against known-good OpenRA data

### Key Architecture Work
- Define `PlayerOrder` enum in `ra-protocol` crate
- Define `OrderCodec` trait (for future cross-engine compatibility)
- Define `CoordTransform` (coordinate system translation)
- Study OpenRA architecture: Game loop, World/Actor/Trait hierarchy, OrderManager, mod manifest system

### Release
Open source `ra-formats` early. Useful standalone, builds credibility and community interest.

### Exit Criteria
- Can parse any OpenRA mod's YAML rules into typed Rust structs
- Can extract and display sprites from .mix archives
- Can convert MiniYAML to standard YAML losslessly

## Phase 1: Rendering Slice (Months 3–6)

**Goal:** Render a map with units standing on it. No gameplay. Demonstrate Bevy's visual capabilities.

### Deliverables
- Bevy-based isometric tile renderer with palette-aware shading
- Sprite animation system (idle, move, attack frames)
- Shroud/fog-of-war rendering
- Camera: smooth scroll, zoom, minimap
- Load OpenRA map, render correctly
- Basic post-processing: bloom on explosions, color grading
- Shader prototypes: chrono-shift shimmer, tesla coil glow (visual showcase)

### Key Architecture Work
- Bevy plugin structure: `ra-render` as a Bevy plugin reading from sim state
- Interpolation between sim ticks for smooth animation at arbitrary FPS
- HD asset pipeline: support high-res sprites alongside classic 8-bit assets

### Release
"Red Alert map rendered in Rust at 4K 144fps with modern post-processing" — visual showcase generates buzz.

### Exit Criteria
- Can load and render any OpenRA Red Alert map
- Sprites animate correctly (idle loops)
- Camera controls feel responsive
- Maintains 144fps at 4K on mid-range hardware

## Phase 2: Simulation Core (Months 6–12) — CRITICAL

**Goal:** Units move, shoot, die. The engine exists.

### Deliverables
- ECS-based simulation layer (`ra-sim`)
- Components mirroring OpenRA traits: Mobile, Health, Attackable, Armament, Building, Buildable, Harvester
- Fixed-point coordinate system (no floats in sim)
- Deterministic RNG
- Pathfinding: Hierarchical A* or flowfields
- Order system: Player inputs → Orders → deterministic sim application
- `LocalNetwork` and `ReplayPlayback` NetworkModel implementations
- Sim snapshot/restore for save games and future rollback

### Key Architecture Work
- **Sim/network boundary enforced:** `ra-sim` has zero imports from `ra-net`
- **`NetworkModel` trait defined and proven** with at least `LocalNetwork` implementation
- **System execution order documented and fixed**
- **State hashing for desync detection**

### Release
Units moving, shooting, dying — headless sim + rendered. Record replay file. Play it back.

### Exit Criteria
- Can run 1000-unit battle headless at > 60 ticks/second
- Replay file records and plays back correctly (bit-identical)
- State hash matches between two independent runs with same inputs

## Phase 3: Game Chrome (Months 12–16)

**Goal:** It feels like Red Alert.

### Deliverables
- Sidebar UI: build queues, power bar, credits display, radar minimap
- Radar panel as multi-mode display: minimap (default), comm video feed (RA2-style), tactical overlay
- Unit selection: box select, ctrl-groups, tab cycling
- Build placement with validity checking
- Audio: EVA voice lines, unit responses, ambient, music (`.aud` playback)
- Custom UI layer on `wgpu` for game HUD
- `egui` for dev tools/debug overlays

### Exit Criteria
- Single-player skirmish against scripted dummy AI (first "playable" milestone)
- Feels like Red Alert to someone who's played it before

## Phase 4: AI & Single Player (Months 16–20)

**Goal:** Complete campaign support and skirmish AI. Unlike OpenRA, single-player is a first-class deliverable, not an afterthought.

### Deliverables
- Lua-based scripting for mission scripts
- WASM mod runtime (basic)
- Basic skirmish AI: harvest, build, attack patterns
- Campaign mission loading (OpenRA mission format)
- **Branching campaign graph engine (D021):** campaigns as directed graphs of missions with named outcomes, multiple paths, and convergence points
- **Persistent campaign state:** unit roster carryover, veterancy across missions, equipment persistence, story flags — serializable for save games
- **Lua Campaign API:** `Campaign.complete()`, `Campaign.get_roster()`, `Campaign.get_flag()`, `Campaign.set_flag()`, etc.
- **Continuous campaign flow:** briefing → mission → debrief → next mission (no exit-to-menu between levels)
- **Campaign select and mission map UI:** visualize campaign graph, show current position, replay completed missions
- **Adaptive difficulty via campaign state:** designer-authored conditional bonuses/penalties based on cumulative performance
- **FMV cutscene playback** between missions (original `.vqa` briefings and victory/defeat sequences)
- **Full Allied and Soviet campaigns** for Red Alert, playable start to finish

### Key Architecture Work
- Lua sandbox with engine bindings
- WASM host API with capability system (see `06-SECURITY.md`)
- Campaign graph loader + validator: parse YAML campaign definitions, validate graph connectivity (no orphan nodes, all outcome targets exist)
- `CampaignState` serialization: roster, flags, equipment, path taken — full snapshot support
- Unit carryover system: 5 modes (`none`, `surviving`, `extracted`, `selected`, `custom`)
- Veterancy persistence across missions
- Mission select UI with campaign graph visualization and difficulty indicators
- **`ic` CLI prototype:** `ic mod init`, `ic mod check`, `ic mod run` — early tooling for Lua script development (full SDK in Phase 6)

### Exit Criteria
- Can play through **all** Allied and Soviet campaign missions start to finish
- Campaign branches work: different mission outcomes lead to different next missions
- Unit roster persists across missions (surviving units, veterancy, equipment)
- Save/load works mid-campaign with full state preservation
- Skirmish AI provides a basic challenge

## Phase 5: Multiplayer (Months 20–26)

**Goal:** Deterministic lockstep multiplayer, but better than OpenRA.

### Deliverables
- `LockstepNetwork` implementation (input delay model)
- `RelayLockstepNetwork` implementation (relay server with time authority)
- Desync detection and server-side debugging tools (killer feature)
- Lobby system, game browser, NAT traversal via relay
- Replay system (already enabled by Phase 2 architecture)
- `CommunityBridge` for shared server browser with OpenRA

### Key Architecture Work
- Sub-tick timestamped orders (CS2 insight)
- Relay server anti-lag-switch mechanism
- Signed replay chain
- Order validation in sim (anti-cheat)

### Exit Criteria
- Two players can play a full game over the internet
- Desync, if it occurs, is automatically diagnosed to specific tick and entity
- Games appear in shared server browser alongside OpenRA games

## Phase 6: Modding & Ecosystem (Months 26–32)

**Goal:** This is where you win long-term.

### Deliverables
- Full OpenRA YAML rule compatibility (existing mods load)
- WASM mod scripting with full capability system
- In-engine map editor (OpenRA's biggest UX gap)
- Asset hot-reloading for mod development
- Mod manager + workshop-style distribution
- Tera templating for YAML generation (nice-to-have)
- **`ic` CLI tool (full release):** `ic mod init/check/test/run/server/package/publish/watch/lint` — complete mod development workflow (D020)
- **Mod templates:** `data-mod`, `scripted-mod`, `total-conversion`, `map-pack`, `asset-pack` via `ic mod init`
- **`mod.yaml` manifest** with typed schema, semver engine version pinning, dependency declarations
- **VS Code extension** for mod development: YAML schema validation, Lua LSP, `ic` integration

### Exit Criteria
- Someone ports an existing OpenRA mod (Tiberian Dawn, Dune 2000) and it runs
- In-engine map editor is more capable than OpenRA's standalone tool

## Phase 7: AI Content & Polish (Months 32–36+)

**Goal:** LLM-generated missions, visual polish, and feature parity.

### Deliverables — AI Content Generation
- `ra-llm` crate: LLM integration for mission generation
- In-game mission generator UI: describe scenario → playable mission
- Generated output: standard YAML map + Lua trigger scripts + briefing text
- Difficulty scaling: same scenario at different challenge levels
- Mission sharing: rate, remix, publish generated missions
- Campaign generation: connected multi-mission storylines (experimental)
- Adaptive difficulty: AI observes playstyle, generates targeted challenges (experimental)

### Deliverables — Visual Polish (Bevy Rendering)
- Full post-processing pipeline: bloom, color grading, ambient occlusion
- Dynamic lighting: explosions, muzzle flash, day/night cycle (optional game mode)
- GPU particle systems: smoke trails, fire propagation, weather effects (rain, snow, sandstorm, fog, blizzard, storm — see `04-MODDING.md` § "weather scene template")
- Weather system: per-map or trigger-based, render-only or with optional sim effects (visibility, speed modifiers)
- Polished shader effects: chrono-shift, iron curtain, gap generator, nuke flash
- Cinematic replay camera with smooth interpolation

### Deliverables — Platform & Ecosystem
- Feature parity checklist vs OpenRA
- Web build via WASM (play in browser)
- Mobile touch controls
- Accessibility features
- Community infrastructure: website, mod registry, matchmaking server

### Exit Criteria
- A competitive OpenRA player can switch and feel at home
- LLM mission generator produces varied, fun, playable missions
- Browser version is playable
- At least one total conversion mod exists on the platform
