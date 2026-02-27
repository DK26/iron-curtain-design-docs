# Decision Log — Modding & Compatibility

Scripting tiers (Lua/WASM), OpenRA compatibility, UI themes, mod profiles, licensing, and cross-engine export.

---

### Standalone Decision Files (09c/)

| Decision | Title | File |
|----------|-------|------|
| D023 | OpenRA Vocabulary Compatibility Layer | [D023](09c/D023-vocabulary-compat.md) |
| D024 | Lua API Superset of OpenRA | [D024](09c/D024-lua-superset.md) |
| D025 | Runtime MiniYAML Loading | [D025](09c/D025-miniyaml-runtime.md) |
| D026 | OpenRA Mod Manifest Compatibility | [D026](09c/D026-mod-manifest.md) |
| D027 | Canonical Enum Compatibility with OpenRA | [D027](09c/D027-canonical-enums.md) |
| D075 | Remastered Collection Format Compatibility | [D075](09c/D075-remastered-format-compat.md) |

---

## D004: Modding — Lua (Not Python) for Scripting

**Decision:** Use Lua for Tier 2 scripting. Do NOT use Python.

**Rationale against Python:**
- Floating-point non-determinism breaks lockstep multiplayer
- GC pauses (reintroduces the problem Rust solves)
- 50-100x slower than native (hot paths run every tick for every unit)
- Embedding CPython is heavy (~15-30MB)
- Sandboxing is unsolvable — security disaster for community mods

**Rationale for Lua:**
- Tiny runtime (~200KB), designed for embedding
- Deterministic (provide fixed-point bindings, avoid floats)
- Trivially sandboxable (control available functions)
- Industry standard: Factorio, WoW, Dota 2, Roblox
- `mlua`/`rlua` crates are mature
- Any modder can learn in an afternoon

---

---

## D005: Modding — WASM for Power Users (Tier 3)

**Decision:** WASM modules via `wasmtime`/`wasmer` for advanced mods.

**Rationale:**
- Near-native performance
- Perfectly sandboxed by design
- Deterministic execution (critical for multiplayer)
- Modders can write in Rust, C, Go, AssemblyScript, or Python-to-WASM
- Leapfrogs OpenRA (requires C# for deep mods)

---

---

## D014: Templating — Tera in Phase 6a (Nice-to-Have)

**Decision:** Add Tera template engine for YAML/Lua generation. Phase 6a. Not foundational.

**Rationale:**
- Eliminates copy-paste for faction variants, bulk unit generation
- Load-time only (zero runtime cost)
- ~50 lines to integrate
- Optional — no mod depends on it

---

---

## D032: Switchable UI Themes (Main Menu, Chrome, Lobby)

**Decision:** Ship a YAML-driven UI theme system with multiple built-in presets. Players pick their preferred visual style for the main menu, in-game chrome (sidebar, minimap, build queue), and lobby. Mods and community can create and publish custom themes.

**Motivation:**

The Remastered Collection nailed its main menu — it respects the original Red Alert's military aesthetic while modernizing the presentation. OpenRA went a completely different direction: functional, data-driven, but with a generic feel that doesn't evoke the same nostalgia. Both approaches have merit for different audiences. Rather than pick one style, let the player choose.

This also mirrors D019 (switchable balance presets) and D048 (switchable render modes). Just as players choose between Classic, OpenRA, and Remastered balance rules in the lobby, and toggle between classic and HD graphics with F1, they should be able to choose their UI chrome the same way. All three compose into experience profiles.

**Built-in themes (original art, not copied assets):**

| Theme      | Inspired By                  | Aesthetic                                                                                                                               | Default For      |
| ---------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Classic    | Original RA1 (1996)          | Military minimalism — bare buttons over a static title screen, Soviet-era propaganda palette, utilitarian layout, Hell March on startup | RA1 game module  |
| Remastered | Remastered Collection (2020) | Clean modern military — HD polish, sleek panels, reverent to the original but refined, jukebox integration                              | —                |
| Modern     | Iron Curtain's own design    | Full Bevy UI capabilities — dynamic panels, animated transitions, modern game launcher feel                                             | New game modules |

**Important legal note:** All theme art assets are **original creations** inspired by these design languages — no assets are copied from EA's Remastered Collection (those are proprietary) or from OpenRA. The themes capture the *aesthetic philosophy* (palette, layout structure, design mood) but use entirely IC-created sprite sheets, fonts, and layouts. This is standard "inspired by" in game development — layout and color choices are not copyrightable, only specific artistic expression is.

**Theme structure (YAML-defined):**

```yaml
# themes/classic.yaml
theme:
  name: Classic
  description: "Inspired by the original Red Alert — military minimalism"

  # Chrome sprite sheet — 9-slice panels, button states, scrollbars
  chrome:
    sprite_sheet: themes/classic/chrome.png
    panel: { top_left: [0, 0, 8, 8], ... }  # 9-slice regions
    button:
      normal: [0, 32, 118, 9]
      hover: [0, 41, 118, 9]
      pressed: [0, 50, 118, 9]
      disabled: [0, 59, 118, 9]

  # Color palette
  colors:
    primary: "#c62828"       # Soviet red
    secondary: "#1a1a2e"     # Dark navy
    text: "#e0e0e0"
    text_highlight: "#ffd600"
    panel_bg: "#0d0d1a"
    panel_border: "#4a4a5a"

  # Typography
  fonts:
    menu: { family: "military-stencil", size: 14 }
    body: { family: "default", size: 12 }
    hud: { family: "monospace", size: 11 }

  # Main menu layout
  main_menu:
    background: themes/classic/title.png     # static image
    shellmap: null                            # no live battle (faithfully minimal)
    music: THEME_INTRO                       # Hell March intro
    button_layout: vertical_center           # stacked buttons, centered
    show_version: true

  # In-game chrome
  ingame:
    sidebar: right                           # classic RA sidebar position
    minimap: top_right
    build_queue: sidebar_tabs
    resource_bar: top_center

  # Lobby
  lobby:
    style: compact                           # minimal chrome, functional
```

**Shellmap system (live menu backgrounds):**

Like OpenRA's signature feature — a real game map with scripted AI battles running behind the main menu. But better:

- **Per-theme shellmaps.** Each theme can specify its own shellmap, or none (Classic theme faithfully uses a static image).
- **Multiple shellmaps with random selection.** The Remastered and Modern themes can ship with several shellmaps — a random one plays each launch.
- **Shellmaps are regular maps** tagged with `visibility: shellmap` in YAML. The engine loads them with a scripted AI that stages dramatic battles. Mods automatically get their own shellmaps.
- **Orbiting/panning camera.** Shellmaps can define camera paths — slow pan across a battlefield, orbiting around a base, or fixed view.

**Shellmap AI design:** Shellmaps use a dedicated AI profile (`shellmap_ai` in `ic-ai`) optimized for visual drama, not competitive play:

```yaml
# ai/shellmap.yaml
shellmap_ai:
  personality:
    name: "Shellmap Director"
    aggression: 40               # builds up before attacking
    attack_threshold: 5000       # large armies before engaging
    micro_level: basic
    tech_preference: balanced    # diverse unit mix for visual variety
    dramatic_mode: true          # avoids cheese, prefers spectacle
    max_tick_budget_us: 2000     # 2ms max — shellmap is background
    unit_variety_bonus: 0.5      # AI prefers building different unit types
    no_early_rush: true          # let both sides build up
```

The `dramatic_mode` flag tells the AI to prioritize visually interesting behavior: large mixed-army clashes over efficient rush strategies, diverse unit compositions over optimal builds, and sustained back-and-forth engagements over quick victories. The AI's tick budget is capped at 2ms to avoid impacting menu UI responsiveness. Shellmap AI is the same `ic-ai` system used for skirmish — just a different personality profile.

**Per-game-module default themes:**

Each game module registers its own default theme that matches its aesthetic:
- **RA1 module:** Classic theme (red/black Soviet palette)
- **TD module:** GDI theme (green/black Nod palette) — community or first-party
- **RA2 module:** Remastered-style with RA2 color palette — community or first-party

The game module provides a `default_theme()` in its `GameModule` trait implementation. Players override this in settings.

**Integration with existing UI architecture:**

The theme system layers on top of `ic-ui`'s existing responsive layout profiles (D002, `02-ARCHITECTURE.md`):
- **Layout profiles** handle *where* UI elements go (sidebar vs bottom bar, phone vs desktop) — driven by `ScreenClass`
- **Themes** handle *how* UI elements look (colors, chrome sprites, fonts, animations) — driven by player preference
- Orthogonal concerns. A player on mobile gets the Phone layout profile + their chosen theme. A player on desktop gets the Desktop layout profile + their chosen theme.

**Community themes:**

- Themes are Tier 1 mods (YAML + sprite sheets) — no code required
- Publishable to the workshop (D030) as a standalone resource
- Players subscribe to themes independently of gameplay mods — themes and gameplay mods stack
- An "OpenRA-inspired" theme would be a natural community contribution
- Total conversion mod developers create matching themes for their mods

**What this enables:**
1. **Day-one nostalgia choice.** First launch asks: do you want Classic, Remastered, or Modern? Sets the mood immediately.
2. **Mod-matched chrome.** A WWII mod ships its own olive-drab theme. A sci-fi mod ships neon blue chrome. The theme changes with the mod.
3. **Cross-view consistency with D019.** Classic balance + Classic theme = feels like 1996. Remastered balance + Remastered theme = feels like 2020. Players configure the full experience.
4. **Live backgrounds without code.** Shellmaps are regular maps — anyone can create one with the map editor.

**Alternatives considered:**
- Hardcoded single theme (OpenRA approach) — forces one aesthetic on everyone; misses the emotional connection different players have to different eras of C&C
- Copy Remastered Collection assets — illegal; proprietary EA art
- CSS-style theming (web-engine approach) — overengineered for a game; YAML is simpler and Bevy-native
- Theme as a full WASM mod — overkill; theming is data, not behavior; Tier 1 YAML is sufficient

**Phase:** Phase 3 (Game Chrome). Theme system is part of the `ic-ui` crate. Built-in themes ship with the engine. Community themes available in Phase 6a (Workshop).

---

---

## D050: Workshop as Cross-Project Reusable Library

**Decision:** The Workshop core (registry, distribution, federation, P2P) is designed as a **standalone, engine-agnostic, game-agnostic Rust library** that Iron Curtain is the first consumer of, with the explicit intent that future game projects (XCOM-inspired tactics clone, Civilization-inspired 4X clone, Operation Flashpoint/ArmA-inspired military sim) will be additional consumers. These future projects may or may not use Bevy — the Workshop library must not depend on any specific game engine.

**Rationale:**
- The author plans to build multiple open-source game clones in the spirit of OpenRA, each targeting a different genre's community. Every one of these projects faces the same Workshop problem: mod distribution, versioning, dependencies, integrity, community hosting, P2P delivery
- Building Workshop infrastructure once and reusing it across projects amortizes the significant design and engineering investment over multiple games
- An XCOM clone needs soldier mods, ability packs, map presets, voice packs. A Civ clone needs civilization packs, map scripts, leader art, scenario bundles. An OFP/ArmA clone needs terrains (often 5–20 GB), vehicle models, weapon packs, mission scripts, campaign packages. All of these are "versioned packages with metadata, dependencies, and integrity verification" — the same core abstraction
- The P2P distribution layer is especially valuable for the ArmA-style project where mod sizes routinely exceed what any free CDN can sustain
- Making the library engine-agnostic also produces cleaner IC code — the Bevy integration layer is thinner, better tested, and easier to maintain

### Two-Layer Architecture

The Workshop is split into two layers with a clean boundary:

```
┌─────────────────────────────────────────────────────────┐
│  Game Integration Layer (per-project, engine-specific)  │
│                                                         │
│  IC: Bevy plugin, lobby auto-download, game_module,     │
│       .icpkg extension, `ic mod` CLI, ra-formats,       │
│       Bevy-native format recommendations (D049)         │
│                                                         │
│  XCOM clone: its engine plugin, mission-trigger          │
│       download, .xpkg, its CLI, its format prefs        │
│                                                         │
│  Civ clone: its engine plugin, scenario-load download,  │
│       .cpkg, its CLI, its format prefs                  │
│                                                         │
│  OFP clone: its engine plugin, server-join download,    │
│       .opkg, its CLI, its format prefs                  │
├─────────────────────────────────────────────────────────┤
│  Workshop Core Library (engine-agnostic, game-agnostic) │
│                                                         │
│  Registry: search, publish, version, depend, license    │
│  Distribution: BitTorrent/WebTorrent, HTTP fallback     │
│  Federation: multi-source, git-index, remote, local     │
│  Integrity: SHA-256, piece hashing, signed manifests    │
│  Identity: publisher/name@version                       │
│  P2P engine: peer scoring, piece selection, bandwidth   │
│  CLI core: auth, publish, install, update, resolve      │
│  Protocol: federation spec, manifest schema, APIs       │
└─────────────────────────────────────────────────────────┘
```

### Core Library Boundary — What's In and What's Out

| Concern                    | Core Library (game-agnostic)                                                                                                                 | Game Integration Layer (per-project)                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package format**         | ZIP archive with `manifest.yaml`. Extension is configurable (default: `.pkg`)                                                                | IC uses `.icpkg`, other projects choose their own                                                                                                                                                                    |
| **Manifest schema**        | Core fields: `name`, `version`, `publisher`, `description`, `license`, `dependencies`, `platforms`, `sha256`, `tags`                         | Extension fields: `game_module`, `engine_version`, `category` (IC-specific). Each project defines its own extension fields                                                                                           |
| **Resource categories**    | Tags (free-form strings). Core provides no fixed category enum                                                                               | Each project defines a recommended tag vocabulary (IC: `sprites`, `music`, `map`; XCOM: `soldiers`, `abilities`, `missions`; Civ: `civilizations`, `leaders`, `scenarios`; OFP: `terrains`, `vehicles`, `campaigns`) |
| **Package identity**       | `publisher/name@version` — already game-agnostic                                                                                             | No change needed                                                                                                                                                                                                     |
| **Dependency resolution**  | semver resolution, lockfile, integrity verification                                                                                          | Per-project compatibility checks (e.g., IC checks `game_module` + `engine_version`)                                                                                                                                  |
| **P2P distribution**       | BitTorrent/WebTorrent protocol, tracker, peer scoring, piece selection, bandwidth limiting, HTTP fallback                                    | Per-project seed infrastructure (IC uses `ironcurtain.gg` tracker, OFP clone uses its own)                                                                                                                           |
| **P2P peer scoring**       | Weighted multi-dimensional: `Capacity × w1 + Locality × w2 + SeedStatus × w3 + ApplicationContext × w4`. Weights and dimensions configurable | Each project defines `ApplicationContext`: IC = same-lobby bonus, OFP = same-server bonus, Civ = same-matchmaking-pool bonus. Projects that have no context concept set weight to 0                                  |
| **Download priority**      | Three tiers: `critical` (blocking gameplay), `requested` (user-initiated), `background` (cache warming)                                      | Each project maps its triggers: IC's lobby-join → `critical`. OFP's server-join → `critical`. Civ's scenario-load → `requested`                                                                                      |
| **Auto-download trigger**  | Library provides `download_packages(list, priority)` API                                                                                     | Integration layer decides WHEN to call it: IC calls on lobby join, OFP calls on server connect, XCOM calls on mod browser click                                                                                      |
| **CLI operations**         | Core operations: `auth`, `publish`, `install`, `update`, `search`, `resolve`, `lock`, `audit`, `export-bundle`, `import-bundle`              | Each project wraps as its own CLI: `ic mod *`, `xcom mod *`, etc.                                                                                                                                                    |
| **Format recommendations** | None. The core library is format-agnostic — it distributes opaque files                                                                      | Each project recommends formats for its engine: IC recommends Bevy-native (D049). A Godot-based project recommends Godot-native formats. A custom-engine project recommends whatever it loads                        |
| **Federation**             | Multi-source registry, `sources.yaml`, git-index support, remote server API, local repository                                                | Per-project default sources: IC uses `ironcurtain.gg` + `iron-curtain/workshop-index`. Each project configures its own                                                                                               |
| **Config paths**           | Library accepts a config root path                                                                                                           | Each project sets its own: IC uses `~/.ic/`, XCOM clone uses `~/.xcom/`, etc.                                                                                                                                        |
| **Auth tokens**            | Token generation, storage, scoping (publish/admin/readonly), environment variable override                                                   | Per-project env var names: `IC_AUTH_TOKEN`, `XCOM_AUTH_TOKEN`, etc.                                                                                                                                                  |
| **Lockfile**               | Core lockfile format with package hashes                                                                                                     | Per-project lockfile name: `ic.lock`, `xcom.lock`, etc.                                                                                                                                                              |

### Impact on Existing D030/D049 Design

The existing Workshop design requires only **architectural clarification**, not redesign. The core abstractions (packages, manifests, publishers, dependencies, federation, P2P) are already game-agnostic in concept. The changes are:

1. **Naming**: Where the design says `.icpkg`, the implementation will have a configurable extension with `.icpkg` as IC's default. Where it says `ic mod *`, the core library provides operations and IC wraps them as `ic mod *` subcommands.

2. **Categories**: Where D030 lists a fixed `ResourceCategory` enum (Music, Sprites, Maps...), the core library uses free-form tags. IC's integration layer provides a recommended tag vocabulary and UI groupings. Other projects provide their own.

3. **Manifest**: The `manifest.yaml` schema splits into core fields (in the library) and extension fields (per-project). `game_module: ra1` is an IC extension field, not a core manifest requirement.

4. **Format recommendations**: D049's Bevy-native format table is IC-specific guidance, not a core Workshop concern. The core library is format-agnostic. Each consuming project publishes its own format recommendations based on its engine's capabilities.

5. **P2P scoring**: The `LobbyContext` dimension in peer scoring becomes `ApplicationContext` — a generic callback where any project can inject context-aware peer prioritization. IC implements it as "same lobby = bonus." An ArmA-style project implements it as "same server = bonus."

6. **Infrastructure**: Domain names (`ironcurtain.gg`), GitHub org (`iron-curtain/`), tracker URLs — these are IC deployment configuration. The core library is configured via `sources.yaml` with no hardcoded URLs.

### Cross-Project Infrastructure Sharing

While each project has its own Workshop deployment, sharing is possible:

- **Shared tracker**: A single BitTorrent tracker can serve multiple game projects. The info-hash namespace is naturally disjoint (different packages = different hashes).
- **Shared git-index hosting**: One GitHub org could host workshop-index repos for multiple projects.
- **Shared seed boxes**: Seed infrastructure can serve packages from multiple games simultaneously — BitTorrent doesn't care about content semantics.
- **Cross-project dependencies**: A music pack or shader effect could be published once and depended on by packages from multiple games. The identity system (`publisher/name@version`) is globally unique.
- **Shared federation network**: Community-hosted Workshop servers could participate in multiple games' federation networks simultaneously.

> **Also shared with IC's netcode infrastructure.** The tracking server, relay server, and Workshop server share deep structural parallels within IC itself — federation, heartbeats, rate control, connection management, observability, deployment principles. The cross-pollination analysis (`research/p2p-federated-registry-analysis.md` § "Netcode ↔ Workshop Cross-Pollination") identifies four shared infrastructure opportunities: a unified `ic-server` binary (tracking + relay + workshop in one process for small community operators), a shared federation library (multi-source aggregation used by both tracking and Workshop), a shared auth/identity layer (one Ed25519 keypair for multiplayer + publishing + profile), and shared scoring infrastructure (EWMA time-decaying reputation used by both P2P peer scoring and relay player quality tracking). The federation library and scoring infrastructure belong in the Workshop core library (D050) since they're already game-agnostic.

### Engine-Agnostic P2P and Netcode

The P2P distribution protocol (BitTorrent/WebTorrent) and all the patterns adopted from Kraken, Dragonfly, and IPFS (see D049 competitive landscape and `research/p2p-federated-registry-analysis.md`) are **already engine-agnostic**. The protocol operates at the TCP/UDP level — it doesn't know or care whether the consuming application uses Bevy, Godot, Unreal, or a custom engine. The Rust implementation (`ic-workshop` core library) has no engine dependency.

For projects that use a non-Rust engine (unlikely given the author's preferences, but architecturally supported): the Workshop core library exposes a C FFI or can be compiled as a standalone process that the game communicates with via IPC/localhost HTTP. The CLI itself serves as a non-Rust integration path — any game engine can shell out to the Workshop CLI for install/update operations.

### Non-RTS Game Considerations

Each future genre introduces patterns the current design doesn't explicitly address:

| Genre                         | Key Workshop Differences                                                                                            | Already Handled                                                               | Needs Attention                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Turn-based tactics** (XCOM) | Smaller mod sizes, more code-heavy mods (abilities, AI), procedural map parameters                                  | Package format, dependencies, P2P                                             | Ability/behavior mods may need a scripting sandbox equivalent to IC's Lua/WASM — but that's a game concern, not a Workshop concern                                                                                                                |
| **Turn-based 4X** (Civ)       | Very large mod variety (civilizations, maps, scenarios, art), DLC-like mod structure, long-lived save compatibility | Package format, dependencies, versioning, P2P                                 | Save-game compatibility metadata (a Civ mod that changes game rules may break existing saves). Workshop manifest could include `breaks_saves: true` as an extension field                                                                         |
| **Military sim** (OFP/ArmA)   | Very large packages (terrains 5–20 GB), server-mandated mod lists, many simultaneous mods active                    | P2P (critical for large packages), dependencies, auto-download on server join | Partial downloads (download terrain mesh now, HD textures later) could benefit from sub-package granularity. Workshop packages already support dependencies — a terrain could be split into `base` + `hd-textures` + `satellite-imagery` packages |
| **Any**                       | Different scripting languages, different asset formats, different mod structures                                    | Core library is content-agnostic                                              | Nothing — this is the point of the two-layer design                                                                                                                                                                                               |

### Phase

D050 is an architectural principle, not a deliverable with its own phase. It shapes HOW D030 and D049 are implemented:

- **IC Phase 3–4**: Implement Workshop core as a separate Rust library crate within the IC monorepo. The crate has zero Bevy dependencies. IC's Bevy plugin wraps the core library. The API boundary enforces the two-layer split from the start.
- **IC Phase 5–6**: If a second game project begins, the core library can be extracted to its own repo with minimal effort because the boundary was enforced from day one.
- **Post-IC-launch**: Each new game project creates its own integration layer and deployment configuration. The core library, P2P protocol, and federation specification are shared.

---

| ID   | Topic                                                                                                                               | Needs Resolution By |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| P001 | ~~ECS crate choice~~ — RESOLVED: Bevy's built-in ECS                                                                                | Resolved            |
| P002 | Fixed-point scale (256? 1024? match OpenRA's 1024?)                                                                                 | Phase 2 start       |
| P003 | Audio library choice + music integration design (see note below)                                                                    | Phase 3 start       |
| P004 | Lobby/matchmaking protocol specifics — PARTIALLY RESOLVED: architecture + lobby protocol defined (D052), wire format details remain | Phase 5 start       |
| P005 | ~~Map editor architecture~~ — RESOLVED: Scenario editor in SDK (D038+D040)                                                          | Resolved            |
| P006 | ~~License choice~~ — RESOLVED: GPL v3 with modding exception (D051)                                                                 | Resolved            |
| P007 | ~~Workshop: single source vs multi-source~~ — RESOLVED: Federated multi-source (D030)                                               | Resolved            |

### P003 — Audio System Design Notes

The audio system is the least-designed critical subsystem. Beyond the library choice, Phase 3 needs to resolve:

- **Original `.aud` playback and encoding:** Decoding and encoding Westwood's `.aud` format (IMA ADPCM, mono/stereo, 8/16-bit, varying sample rates). Full codec implementation based on EA GPL source — `AUDHeaderType` header, `IndexTable`/`DiffTable` lookup tables, 4-bit nibble processing. See `05-FORMATS.md` § AUD Audio Format for complete struct definitions and algorithm details. Encoding support enables the Asset Studio (D040) audio converter for .aud ↔ .wav/.ogg conversion
- **Music loading from Remastered Collection:** If the player owns the Remastered Collection, can IC load the remastered soundtrack? Licensing allows personal use of purchased files, but the integration path needs design
- **Dynamic music states:** Combat/build/idle transitions (original RA had this — "Act on Instinct" during combat, ambient during base building). State machine driven by sim events
- **Music as Workshop resources:** Swappable soundtrack packs via D030 — architecture supports this, but audio pipeline needs to be resource-pack-aware
- **Frank Klepacki’s music is integral to C&C identity.** The audio system should treat music as a first-class system, not an afterthought. See `13-PHILOSOPHY.md` § "Audio Drives Tempo"

### P006 — RESOLVED: See D051

---

---

## D051: Engine License — GPL v3 with Explicit Modding Exception

**Decision:** The Iron Curtain engine is licensed under **GNU General Public License v3.0** (GPL v3) with an explicit **modding exception** that clarifies mods loaded through the engine's data and scripting interfaces are NOT derivative works.

**Rationale:**

1. **The C&C open-source community is a GPL community.** EA released every C&C source code drop under GPL v3 — Red Alert, Tiberian Dawn, Generals/Zero Hour, and the Remastered Collection engine. OpenRA uses GPL v3. Stratagus uses GPL-2.0. Spring Engine uses GPL-2.0. The community this project is built for lives in GPL-land. GPL v3 is the license they know, trust, and expect.

2. **Legal compatibility with EA source.** `ra-formats` directly references EA's GPL v3 source code for struct definitions, compression algorithms, and lookup tables (see `05-FORMATS.md` § Binary Format Codec Reference). GPL v3 for the engine is the cleanest legal path — no license compatibility analysis required.

3. **The engine stays open — forever.** GPL guarantees that no one can fork the engine, close-source it, and compete with the community's own project. For a community that has watched proprietary decisions kill or fragment C&C projects over three decades, this guarantee matters. MIT/Apache would allow exactly the kind of proprietary fork the community fears.

4. **Contributor alignment.** DCO + GPL v3 is the combination used by the Linux kernel — the most successful community-developed project in history. OpenRA contributors moving to IC (or contributing to both) face zero license friction.

5. **Modders are NOT restricted.** This is the key concern the old tension analysis raised, and the answer is clear: YAML data files, Lua scripts, and WASM modules loaded through a sandboxed runtime interface are NOT derivative works under GPL. This is the same settled legal interpretation as:
   - Linux kernel (GPL) + userspace programs (any license)
   - Blender (GPL) + Python scripts (any license)
   - WordPress (GPL) + themes and plugins loaded via defined APIs
   - GCC (GPL) + programs compiled by GCC (any license, via runtime library exception)
   
   IC's tiered modding architecture (D003/D004/D005) was specifically designed so that mods operate through data interfaces and sandboxed runtimes, never linking against engine code. The modding exception makes this explicit.

6. **Commercial use is allowed.** GPL v3 permits selling copies, hosting commercial servers, running tournaments with prize pools, and charging for relay hosting. It requires sharing source modifications — which is exactly what this community wants.

**The modding exception (added to LICENSE header):**

```
Additional permission under GNU GPL version 3 section 7:

If you modify this Program or any covered work, by linking or combining
it with content loaded through the engine's data interfaces (YAML rule
files, Lua scripts, WASM modules, resource packs, Workshop packages, or
any content loaded through the modding tiers described in the
documentation as "Tier 1", "Tier 2", or "Tier 3"), the content loaded
through those interfaces is NOT considered part of the covered work and
is NOT subject to the terms of this License. Authors of such content may
choose any license they wish.

This exception does not affect the copyleft requirement for modifications
to the engine source code itself.
```

This exception uses GPL v3 § 7's "additional permissions" mechanism — the same mechanism GCC uses for its runtime library exception. It is legally sound and well-precedented.

**Alternatives considered:**

- **MIT / Apache 2.0** (rejected — allows proprietary forks that fragment the community; creates legal ambiguity when referencing GPL'd EA source code; the Bevy ecosystem uses MIT/Apache but Bevy is a general-purpose framework, not a community-specific game engine)
- **LGPL** (rejected — complex, poorly understood by non-lawyers, and unnecessary given the explicit modding exception under GPL v3 § 7)
- **Dual license (GPL + commercial)** (rejected — adds complexity with no clear benefit; GPL v3 already permits commercial use)
- **GPL v3 without modding exception** (rejected — would leave legal ambiguity about WASM mods that might be interpreted as derivative works; the explicit exception removes all doubt)

**What this means in practice:**

| Activity                                    | Allowed? | Requirement                                              |
| ------------------------------------------- | -------- | -------------------------------------------------------- |
| Play the game                               | Yes      | —                                                        |
| Create YAML/Lua/WASM mods                   | Yes      | Any license you want (modding exception)                 |
| Publish mods on Workshop                    | Yes      | Author chooses license (D030 requires SPDX declaration)  |
| Sell a total conversion mod                 | Yes      | Mod's license is the author's choice                     |
| Fork the engine                             | Yes      | Your fork must also be GPL v3                            |
| Run a commercial server                     | Yes      | If you modify the server code, share those modifications |
| Use IC code in a proprietary game           | No       | Engine modifications must be GPL v3                      |
| Embed IC engine in a closed-source launcher | Yes      | The engine remains GPL v3; the launcher is separate      |

### Phase

Resolved. The LICENSE file ships with the GPL v3 text plus the modding exception header from Phase 0 onward.

### CI Enforcement: cargo-deny for License Compliance

Embark Studios' **cargo-deny** (2,204★, MIT/Apache-2.0) automates license compatibility checking across the entire dependency tree. IC should add `cargo-deny` to CI from Phase 0 with a GPL v3 compatibility allowlist — every `cargo deny check licenses` run verifies that no dependency introduces a license incompatible with GPL v3 (e.g., SSPL, proprietary, GPL-2.0-only without "or later"). For Workshop content (D030), the `spdx` crate (also from Embark, 140★) parses SPDX license expressions from resource manifests, enabling automated compatibility checks at publish time. See `research/embark-studios-rust-gamedev-analysis.md` § cargo-deny.

---

## D062: Mod Profiles & Virtual Asset Namespace

**Decision:** Introduce a layered asset composition model inspired by LVM's mark → pool → present pattern. Two new first-class concepts: **mod profiles** (named, hashable, switchable mod compositions) and a **virtual asset namespace** (a resolved lookup table mapping logical asset paths to content-addressed blobs).

**Core insight:** IC's three-phase data loading (D003, Factorio-inspired), dependency-graph ordering, and modpack manifests (D030) already describe a composition — but the composed result is computed on-the-fly at load time and dissolved into merged state. There's no intermediate object that represents "these N sources in this priority order with these conflict resolutions" as something you can name, hash, inspect, diff, save, or share independently. Making the composition explicit unlocks capabilities that the implicit version can't provide.

### The Three-Layer Model

The model separates mod loading into three explicit phases, inspired by LVM's physical volumes → volume groups → logical volumes:

| Layer              | LVM Analog      | IC Concept                       | What It Is                                                                                                                                                                               |
| ------------------ | --------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source** (PV)    | Physical Volume | Registered mod/package/base game | A validated, installed content source — its files exist, its manifest is parsed, its dependencies are resolved. Immutable once registered.                                               |
| **Profile** (VG)   | Volume Group    | Mod profile                      | A named composition: which sources, in what priority order, with what conflict resolutions and experience settings. Saved as a YAML file. Hashable.                                      |
| **Namespace** (LV) | Logical Volume  | Virtual asset namespace          | The resolved lookup table: for every logical asset path, which blob (from which source) answers the query. Built from a profile at activation time. What the engine actually loads from. |

**The model does NOT replace three-phase data loading.** Three-phase loading (Define → Modify → Final-fixes) organizes *when* modifications apply during profile activation. The profile organizes *which* sources participate. They're orthogonal — the profile says "use mods A, B, C in this order" and three-phase loading says "first all Define phases, then all Modify phases, then all Final-fixes phases."

### Mod Profiles

A mod profile is a YAML file in the player's configuration directory that captures a complete, reproducible mod setup:

```yaml
# <data_dir>/profiles/tournament-s5.yaml
profile:
  name: "Tournament Season 5"
  game_module: ra1

# Which mods participate, in priority order (later overrides earlier)
sources:
  # Engine defaults and base game assets are always implicitly first
  - id: "official/tournament-balance"
    version: "=1.3.0"
  - id: "official/hd-sprites"
    version: "=2.0.1"
  - id: "community/improved-explosions"
    version: "^1.0.0"

# Explicit conflict resolutions (same role as conflicts.yaml, but profile-scoped)
conflicts:
  - unit: heavy_tank
    field: health.max
    use_source: "official/tournament-balance"

# Experience profile axes (D033) — bundled with the mod set
experience:
  balance: classic           # D019
  theme: remastered          # D032
  behavior: iron_curtain     # D033
  ai_behavior: enhanced      # D043
  pathfinding: ic_default    # D045
  render_mode: hd_sprites    # D048

# Computed at activation time, not authored
fingerprint: null  # sha256 of the resolved namespace — set by engine
```

**Relationship to existing concepts:**

- **Experience profiles (D033)** set 6 switchable axes (balance, theme, behavior, AI, pathfinding, render mode) but don't specify *which community mods* are active. A mod profile bundles experience settings WITH the mod set — one object captures the full player experience.
- **Modpacks (D030)** are published, versioned Workshop resources. A mod profile is a local, personal composition. **Publishing a mod profile creates a modpack** — `ic mod publish-profile` snapshots the profile into a `mod.yaml` modpack manifest for Workshop distribution. This makes mod profiles the local precursor to modpacks: curators build and test profiles locally, then publish the working result.
- **`conflicts.yaml` (existing)** is a global conflict override file. Profile-scoped conflicts apply only when that profile is active. Both mechanisms coexist — profile conflicts take precedence, then global `conflicts.yaml`, then default last-wins behavior.

**Profile operations:**

```bash
# Create a profile from the currently active mod set
ic profile save "tournament-s5"

# List saved profiles
ic profile list

# Activate a profile (loads its mods + experience settings)
ic profile activate "tournament-s5"

# Show what a profile resolves to (namespace preview + conflict report)
ic profile inspect "tournament-s5"

# Diff two profiles — which assets differ, which conflicts resolve differently
ic profile diff "tournament-s5" "casual-hd"

# Publish as a modpack to Workshop
ic mod publish-profile "tournament-s5"

# Import a Workshop modpack as a local profile
ic profile import "alice/red-apocalypse-pack"
```

**In-game UX:** The mod manager gains a profile dropdown (top of the mod list). Switching profiles reconfigures the active mod set and experience settings in one action. In multiplayer lobbies, the host's profile fingerprint is displayed — joining players with the same fingerprint skip per-mod verification. Players with a different configuration see a diff view: "You're missing mod X" or "You have mod Y v2.0, lobby has v2.1" with one-click resolution (download missing, update mismatched).

### Virtual Asset Namespace

When a profile is activated, the engine builds a **virtual asset namespace** — a complete lookup table mapping every logical asset path to a specific content-addressed blob from a specific source. This is functionally an OverlayFS union view over the content-addressed store (D049 local CAS).

```
Namespace for profile "Tournament Season 5":
  sprites/rifle_infantry.shp    → blob:a7f3e2... (source: official/hd-sprites)
  sprites/medium_tank.shp       → blob:c4d1b8... (source: official/hd-sprites)
  rules/units/infantry.yaml     → blob:9e2f0a... (source: official/tournament-balance)
  rules/units/vehicles.yaml     → blob:1b4c7d... (source: engine-defaults)
  audio/rifle_fire.aud          → blob:e8a5f1... (source: base-game)
  effects/explosion_large.yaml  → blob:f2c8d3... (source: community/improved-explosions)
```

**Key properties:**

- **Deterministic:** Same profile + same source versions = identical namespace. The fingerprint (SHA-256 of the sorted namespace entries) proves it.
- **Inspectable:** `ic profile inspect` dumps the full namespace with provenance — which source provided which asset. Invaluable for debugging "why does my tank look wrong?" (answer: mod X overrode the sprite at priority 3).
- **Diffable:** `ic profile diff` compares two namespaces entry-by-entry — shows exact asset-level differences between two mod configurations. Critical for modpack curators testing variations.
- **Cacheable:** The namespace is computed once at profile activation and persisted as a lightweight index. Asset loads during gameplay are simple hash lookups — no per-load directory scanning or priority resolution.

**Integration with Bevy's asset system:** The virtual namespace registers as a custom Bevy `AssetSource` that resolves asset paths through the namespace lookup table rather than filesystem directory traversal. When Bevy requests `sprites/rifle_infantry.shp`, the namespace resolves it to `workshop/blobs/a7/a7f3e2...` (the CAS blob path). This sits between IC's mod resolution layer and Bevy's asset loading — Bevy sees a flat namespace, unaware of the layering beneath.

```rust
/// A resolved mapping from logical asset path to content-addressed blob.
pub struct VirtualNamespace {
    /// Logical path → (blob hash, source that provided it)
    entries: HashMap<AssetPath, NamespaceEntry>,
    /// SHA-256 of the sorted entries — the profile fingerprint
    fingerprint: [u8; 32],
}

pub struct NamespaceEntry {
    pub blob_hash: [u8; 32],
    pub source_id: ModId,
    pub source_version: Version,
    /// How this entry won: default, last-wins, explicit-conflict-resolution
    pub resolution: ResolutionReason,
}

pub enum ResolutionReason {
    /// Only one source provides this path — no conflict
    Unique,
    /// Multiple sources; this one won via load-order priority (last-wins)
    LastWins { overridden: Vec<ModId> },
    /// Explicit resolution from profile conflicts or conflicts.yaml
    ExplicitOverride { reason: String },
    /// Engine default (no mod provides this path)
    EngineDefault,
}
```

### Namespace for YAML Rules (Not Just File Assets)

The virtual namespace covers two distinct layers:

1. **File assets** — sprites, audio, models, textures. Resolved by path → blob hash. Simple overlay; last-wins per path.

2. **YAML rule state** — the merged game data after three-phase loading. This is NOT a simple file overlay — it's the result of Define → Modify → Final-fixes across all active mods. The namespace captures the *output* of this merge as a serialized snapshot. This snapshot IS the fingerprint's primary input — two players with identical fingerprints have identical merged rule state, guaranteed.

The YAML rule merge runs during profile activation (not per-load). The merged result is cached. If no mods change, the cache is valid. This is the same work the engine already does — the namespace just makes the result explicit and hashable.

### Multiplayer Integration

**Lobby fingerprint verification:** When a player joins a lobby, the client sends its active profile fingerprint. If it matches the host's fingerprint, the player is guaranteed to have identical game data — no per-mod version checking needed. If fingerprints differ, the lobby computes a namespace diff and presents actionable resolution:

- **Missing mods:** "Download mod X?" (triggers D030 auto-download)
- **Version mismatch:** "Update mod Y from v2.0 to v2.1?" (one-click update)
- **Conflict resolution difference:** "Host resolves heavy_tank.health.max from mod A; you resolve from mod B" — player can accept host's profile or leave

This replaces the current per-mod version list comparison with a single hash comparison (fast path) and falls back to detailed diff only on mismatch. The diff view is more informative than the current "incompatible mods" rejection.

**Replay recording:** Replays record the profile fingerprint alongside the existing `(mod_id, version)` list. Playback verifies the fingerprint. A fingerprint mismatch warns but doesn't block playback — the existing mod list provides degraded compatibility checking.

### Editor Integration (D038)

The scenario editor benefits from profile-aware asset resolution:

- **Layer isolation:** The editor can show "assets from mod X" vs "assets from engine defaults" in separate layer views — same UX pattern as the editor's own entity layers with lock/visibility.
- **Hot-swap a single source:** When editing a mod's YAML rules, the editor rebuilds only that source's contribution to the namespace rather than re-running the full three-phase merge across all N sources. This enables sub-second iteration for rule authoring.
- **Source provenance in tooltips:** Hovering over a unit in the editor shows "defined in engine-defaults, modified by official/tournament-balance" — derived directly from namespace entry provenance.

### Alternatives Considered

- **Just use modpacks (D030)** — Modpacks are the published form; profiles are the local form. Without profiles, curators manually reconstruct their mod configuration every session. Profiles make the curator workflow reproducible.
- **Bevy AssetSources alone** — Bevy's `AssetSource` API can layer directories, but it doesn't provide conflict detection, provenance tracking, fingerprinting, or diffing. The namespace sits above Bevy's loader, not instead of it.
- **Full OverlayFS on the filesystem** — Overkill. The namespace is an in-memory lookup table, not a filesystem driver. We get the same logical result without OS-level complexity or platform dependencies.
- **Hash per-mod rather than hash the composed namespace** — Per-mod hashes miss the composition: same mods + different conflict resolutions = different gameplay. The namespace fingerprint captures the actual resolved state.
- **Make profiles mandatory** — Rejected. A player who installs one mod and clicks play shouldn't need to understand profiles. The engine creates a default implicit profile from the active mod set. Profiles become relevant when players want multiple configurations or when modpack curators need reproducibility.

### Integration with Existing Decisions

- **D003 (Real YAML):** YAML rule merge during profile activation uses the same `serde_yaml` pipeline. The namespace captures the merge result, not the raw files.
- **D019 (Balance Presets):** Balance preset selection is a field in the mod profile. Switching profiles can switch the balance preset simultaneously.
- **D030 (Workshop):** Modpacks are published snapshots of mod profiles. `ic mod publish-profile` bridges local profiles to Workshop distribution. Workshop modpacks import as local profiles via `ic profile import`.
- **D033 (Experience Profiles):** Experience profile axes (balance, theme, behavior, AI, pathfinding, render mode) are embedded in mod profiles. A mod profile is a superset: experience settings + mod set + conflict resolutions.
- **D034 (SQLite):** The namespace index is optionally cached in SQLite for fast profile switching. Profile metadata (name, fingerprint, last-activated) is stored alongside other player preferences.
- **D038 (Scenario Editor):** Editor uses namespace provenance for source attribution and per-layer hot-swap during development.
- **D049 (Workshop Asset Formats & P2P / CAS):** The virtual namespace maps logical paths to content-addressed blobs in the local CAS store. The namespace IS the virtualization layer that makes CAS usable for gameplay asset loading.
- **D058 (Console):** `/profile list`, `/profile activate <name>`, `/profile inspect`, `/profile diff <a> <b>`, `/profile save <name>` console commands.

### Phase

- **Phase 2:** Implicit default profile — the engine internally constructs a namespace from the active mod set at load time. No user-facing profile concept yet, but the `VirtualNamespace` struct exists and is used for asset resolution. Fingerprint is computed and recorded in replays.
- **Phase 4:** `ic profile save/list/activate/inspect/diff` CLI commands. Profile YAML schema stabilized. Modpack curators can save and switch profiles during testing.
- **Phase 5:** Lobby fingerprint verification replaces per-mod version list comparison. Namespace diff view in lobby UI. `/profile` console commands. Replay fingerprint verification on playback.
- **Phase 6a:** `ic mod publish-profile` publishes a local profile as a Workshop modpack. `ic profile import` imports modpacks as local profiles. In-game mod manager gains profile dropdown. Editor provenance tooltips and per-source hot-swap.

---

---

## D066: Cross-Engine Export & Editor Extensibility

**Decision:** The IC SDK (scenario editor + asset studio) can export complete content packages — missions, campaigns, cutscenes, music, audio, textures, animations, unit definitions — to original Red Alert and OpenRA formats. The SDK is itself extensible via the same tiered modding system (YAML → Lua → WASM) that powers the game, making it a fully moddable content creation platform.

**Context:** IC already imports from Red Alert and OpenRA (D025, D026, ra-formats). The Asset Studio (D040) converts between individual asset formats bidirectionally (.shp↔.png, .aud↔.wav, .vqa↔.mp4). But there is no holistic export pipeline — no way to author a complete mission in IC's superior tooling and then produce a package that loads in original Red Alert or OpenRA. This is the "content authoring platform" step: IC becomes the tool that the C&C community uses to create content for *any* C&C engine, not just IC itself. This posture — creating value for the broader community regardless of which engine they play on — is core to the project's philosophy (see `13-PHILOSOPHY.md` Principle #6: "Build with the community, not just for them").

Equally important: the editor itself must be extensible. If IC is a modding platform, then the tools that create mods must also be moddable. A community member building a RA2 game module needs custom editor panels for voxel placement. A total conversion might need a custom terrain brush. Editor extensions follow the same tiered model that game mods use.

### Export Targets

#### Target 1: Original Red Alert (DOS/Win95 format)

Export produces files loadable by the original Red Alert engine (including CnCNet-patched versions):

| Content Type      | IC Source                          | Export Format                                         | Notes                                                                                                                                                                                     |
| ----------------- | ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maps**          | IC scenario (.yaml)                | `ra.ini` (map section) + `.bin` (terrain binary)      | Map dimensions, terrain tiles, overlay (ore/gems), waypoints, cell triggers. Limited to 128×128 grid, no IC-specific features (triggers export as best-effort match to RA trigger system) |
| **Unit rules**    | IC YAML unit definitions           | `rules.ini` sections                                  | Cost, speed, armor, weapons, prerequisites. IC-only features (conditions, multipliers) stripped with warnings. Balance values remapped to RA's integer scales                             |
| **Missions**      | IC scenario + Lua triggers         | `.mpr` mission file + `trigger`/`teamtype` ini blocks | Lua trigger logic is *downcompiled* to RA's trigger/teamtype/action system where possible. Complex Lua with no RA equivalent generates a warning report                                   |
| **Sprites**       | .png / sprite sheets               | .shp + .pal (256-color palette-indexed)               | Auto-quantization to target palette. Frame count/facing validation against RA expectations (8/16/32 facings)                                                                              |
| **Audio**         | .wav / .ogg                        | .aud (IMA ADPCM)                                      | Sample rate conversion to RA-compatible rates. Mono downmix if stereo.                                                                                                                    |
| **Cutscenes**     | .mp4 / .webm                       | .vqa (VQ compressed)                                  | Resolution downscale to 320×200 or 640×400. Palette quantization. Audio track interleaved as Westwood ADPCM                                                                               |
| **Music**         | .ogg / .wav                        | .aud (music format)                                   | Full-length music tracks encoded as Westwood AUD. Alternative: export as standard .wav alongside custom `theme.ini`                                                                       |
| **String tables** | IC YAML localization               | `.eng` / `.ger` / etc. string files                   | IC string keys mapped to RA string table offsets                                                                                                                                          |
| **Archives**      | Loose files (from export pipeline) | .mix (optional packing)                               | All exported files optionally bundled into a .mix for distribution. CRC hash table generated per ra-formats § MIX                                                                         |

**Fidelity model:** Export is *lossy by design*. IC supports features RA doesn't (conditions, multipliers, 3D positions, complex Lua triggers, unlimited map sizes, advanced mission-phase tooling like segment unlock wrappers and sub-scenario portals, and IC-native asymmetric role orchestration such as D070 Commander/Field Ops support-request flows and role HUD/objective-channel semantics). The exporter produces the closest RA-compatible equivalent and generates a **fidelity report** — a structured log of every feature that was downgraded, stripped, or approximated. The creator sees: "3 triggers could not be exported (RA has no equivalent for `on_condition_change`). 2 unit abilities were removed (mind control requires engine support). Map was cropped from 200×200 to 128×128. Sub-scenario portal `lab_interior` exported as a separate mission stub with manual campaign wiring required. D070 support request queue and role HUD presets are IC-native and were stripped." This is the same philosophy as exporting a Photoshop file to JPEG — you know what you'll lose before you commit.

#### Target 2: OpenRA (.oramod / .oramap)

Export produces content loadable by the current OpenRA release:

| Content Type      | IC Source                       | Export Format                                            | Notes                                                                                                                                                                       |
| ----------------- | ------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maps**          | IC scenario (.yaml)             | `.oramap` (ZIP: map.yaml + map.bin + lua/)               | Full map geometry, actor placement, player definitions, Lua scripts. IC map features beyond OpenRA's support generate warnings                                              |
| **Mod rules**     | IC YAML unit/weapon definitions | MiniYAML rule files (tab-indented, `^`/`@` syntax)       | IC YAML → MiniYAML via D025 reverse converter. IC trait names mapped back to OpenRA trait names via D023 alias table (bidirectional). IC-only traits stripped with warnings |
| **Campaigns**     | IC campaign graph (D021)        | OpenRA campaign manifest + sequential mission `.oramaps` | IC's branching campaign graph is linearized (longest path or user-selected branch). Persistent state (roster carry-over, hero progression/skills, hero inventory/loadouts) is stripped or flattened into flags/stubs — OpenRA campaigns are stateless. IC sub-scenario portals are flattened into separate scenarios/steps when exportable; parent↔child outcome handoff may require manual rewrite. |
| **Lua scripts**   | IC Lua (D024 superset)          | OpenRA-compatible Lua (D024 base API)                    | IC-only Lua API extensions stripped. The exporter validates that remaining Lua uses only OpenRA's 16 globals + standard library                                             |
| **Sprites**       | .png / sprite sheets            | .png (OpenRA native) or .shp                             | OpenRA loads PNG natively — often no conversion needed. .shp export available for mods targeting the classic sprite pipeline                                                |
| **Audio**         | .wav / .ogg                     | .wav / .ogg (OpenRA native) or .aud                      | OpenRA loads modern formats natively. .aud export for backwards-compatible mods                                                                                             |
| **UI themes**     | IC theme YAML + sprite sheets   | OpenRA chrome YAML + sprite sheets                       | IC theme properties (D032) mapped to OpenRA's chrome system. IC-only theme features stripped                                                                                |
| **String tables** | IC YAML localization            | OpenRA `.ftl` (Fluent) localization files                | IC string keys mapped to OpenRA Fluent message IDs                                                                                                                          |
| **Mod manifest**  | IC mod.yaml                     | OpenRA `mod.yaml` (D026 reverse)                         | IC mod manifest → OpenRA mod manifest. Dependency declarations, sprite sequences, rule file lists, chrome layout references                                                 |

**OpenRA version targeting:** OpenRA's modding API changes between releases. The exporter targets a configurable OpenRA version (default: latest stable). A `target_openra_version` field in the export config selects which trait names, Lua API surface, and manifest schema to use. The D023 alias table is version-aware — it knows which OpenRA release introduced or deprecated each trait name.

#### Target 3: IC Native (Default)

Normal IC mod/map export is already covered by existing design (D030 Workshop, D062 profiles). Included here for completeness — the export pipeline is a unified system with format-specific backends, not three separate tools.

### Export Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     IC SDK Export Pipeline                        │
│                                                                  │
│  ┌─────────────┐                                                 │
│  │ IC Scenario  │──┐                                             │
│  │ + Assets     │  │    ┌──────────────────┐                     │
│  └─────────────┘  ├──→│  ExportPlanner    │                     │
│  ┌─────────────┐  │    │                  │                     │
│  │ Export       │──┘    │ • Inventory all  │    ┌─────────────┐  │
│  │ Config YAML  │       │   content        │    │  Fidelity   │  │
│  │              │       │ • Detect feature │──→│  Report     │  │
│  │ target: ra1  │       │   gaps per target│    │  (warnings) │  │
│  │ version: 3.03│       │ • Plan transforms│    └─────────────┘  │
│  └─────────────┘       └──────┬───────────┘                     │
│                               │                                  │
│             ┌─────────────────┼─────────────────┐               │
│             ▼                 ▼                  ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ RaExporter   │  │ OraExporter  │  │ IcExporter   │          │
│  │              │  │              │  │              │          │
│  │ rules.ini    │  │ MiniYAML     │  │ IC YAML      │          │
│  │ .shp/.pal    │  │ .oramap      │  │ .png/.ogg    │          │
│  │ .aud/.vqa    │  │ .png/.ogg    │  │ Workshop     │          │
│  │ .mix         │  │ mod.yaml     │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                  │
│         ▼                 ▼                  ▼                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │              Output Directory / Archive           │           │
│  └─────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**`ExportTarget` trait:**

```rust
/// Backend for exporting IC content to a specific target engine/format.
/// Implementable via WASM for community-contributed export targets.
pub trait ExportTarget: Send + Sync {
    /// Human-readable name: "Original Red Alert", "OpenRA (release-20240315)", etc.
    fn name(&self) -> &str;

    /// Which IC content types this target supports.
    fn supported_content(&self) -> &[ContentCategory];

    /// Analyze the scenario and produce a fidelity report
    /// listing what will be downgraded or lost.
    fn plan_export(
        &self,
        scenario: &ExportableScenario,
        config: &ExportConfig,
    ) -> ExportPlan;

    /// Execute the export, writing files to the output sink.
    fn execute(
        &self,
        plan: &ExportPlan,
        scenario: &ExportableScenario,
        output: &mut dyn OutputSink,
    ) -> Result<ExportResult, ExportError>;
}

pub enum ContentCategory {
    Map,
    UnitRules,
    WeaponRules,
    Mission,        // scenario with triggers/scripting
    Campaign,       // multi-mission with graph/state
    Sprites,
    Audio,
    Music,
    Cutscenes,
    UiTheme,
    StringTable,
    ModManifest,
    Archive,        // .mix, .oramod ZIP, etc.
}
```

**Key design choice:** `ExportTarget` is a trait, not a hardcoded set of if/else branches. The built-in exporters (RA1, OpenRA, IC) ship with the SDK. Community members can add export targets for other engines — Tiberian Sun modding tools, Remastered Collection, or even non-C&C engines like Stratagus — via WASM modules (Tier 3 modding). This makes the export pipeline itself extensible without engine changes.

### Trigger Downcompilation (Lua → RA/OpenRA triggers)

The hardest export problem. IC missions use Lua (D024) for scripting — a Turing-complete language. RA1 has a fixed trigger/teamtype/action system (~40 events, ~80 actions). OpenRA extends this with Lua but has a smaller standard library than IC.

**Approach: pattern-based downcompilation, not general transpilation.**

The exporter maintains a library of **recognized Lua patterns** that map to RA1 trigger equivalents:

| IC Lua Pattern                          | RA1 Trigger Equivalent                     |
| --------------------------------------- | ------------------------------------------ |
| `Trigger.AfterDelay(ticks, fn)`         | Timed trigger (countdown)                  |
| `Trigger.OnEnteredFootprint(cells, fn)` | Cell trigger (entered by)                  |
| `Trigger.OnKilled(actor, fn)`           | Destroyed trigger (specific unit/building) |
| `Trigger.OnAllKilled(actors, fn)`       | All destroyed trigger                      |
| `Actor.Create(type, owner, pos)`        | Teamtype + reinforcement action            |
| `actor:Attack(target)`                  | Teamtype attack waypoint action            |
| `actor:Move(pos)`                       | Teamtype move to waypoint action           |
| `Media.PlaySpeech(name)`                | EVA speech action                          |
| `UserInterface.SetMissionText(text)`    | Mission text display action                |

Lua that doesn't match any known pattern → **warning in fidelity report** with the unmatched code highlighted. The creator can then simplify their Lua for RA1 export or accept the limitation. For OpenRA export, more patterns survive (OpenRA supports Lua natively), but IC-only API extensions are still flagged.

**This is intentionally NOT a general Lua-to-trigger compiler.** A general compiler would be fragile and produce trigger spaghetti. Pattern matching is predictable: the creator knows exactly which patterns export cleanly, and the SDK can provide "export-safe" template triggers in the scenario editor that are guaranteed to downcompile.

### Editor Extensibility

The IC SDK is a modding platform, not just a tool. The editor itself is extensible via the same three-tier system:

#### Tier 1: YAML (Editor Data Extensions)

Custom editor panels, entity palettes, and property inspectors defined via YAML:

```yaml
# extensions/ra2_editor/editor_extension.yaml
editor_extension:
  name: "RA2 Editor Tools"
  version: "1.0.0"
  api_version: "1.0"              # editor plugin API version (stable surface)
  min_sdk_version: "0.6.0"
  tested_sdk_versions: ["0.6.x"]
  capabilities:                   # declarative, deny-by-default
    - editor.panels
    - editor.palette_categories
    - editor.terrain_brushes

  # Custom entity palette categories
  palette_categories:
    - name: "Voxel Units"
      icon: voxel_unit_icon
      filter:
        has_component: VoxelModel
    - name: "Tech Buildings"
      icon: tech_building_icon
      filter:
        tag: tech_building
  
  # Custom property panels for entity types
  property_panels:
    - entity_filter: { has_component: VoxelModel }
      panel:
        title: "Voxel Properties"
        fields:
          - { key: "voxel.turret_offset", type: vec3, label: "Turret Offset" }
          - { key: "voxel.shadow_index", type: int, label: "Shadow Index" }
          - { key: "voxel.remap_color", type: palette_range, label: "Faction Color Range" }
  
  # Custom terrain brush presets
  terrain_brushes:
    - name: "Urban Road"
      tiles: [road_h, road_v, road_corner_ne, road_corner_nw, road_t, road_cross]
      auto_connect: true
    - name: "Tiberium Field"
      tiles: [tib_01, tib_02, tib_03, tib_spread]
      scatter: { density: 0.7, randomize_variant: true }
  
  # Custom export target configuration
  export_targets:
    - name: "Yuri's Revenge"
      exporter_wasm: "ra2_exporter.wasm"  # Tier 3 WASM exporter
      config_schema: "ra2_export_config.yaml"
```

#### Tier 2: Lua (Editor Scripting)

Editor automation, custom validators, batch operations:

```lua
-- extensions/quality_check/editor_scripts/validate_mission.lua

-- Register a custom validation that runs before export
Editor.RegisterValidator("balance_check", function(scenario)
    local issues = {}
    
    -- Check that both sides have a base
    for _, player in ipairs(scenario:GetPlayers()) do
        local has_mcv = false
        for _, actor in ipairs(scenario:GetActors(player)) do
            if actor:HasComponent("BaseBuilding") then
                has_mcv = true
                break
            end
        end
        if not has_mcv and player:IsPlayable() then
            table.insert(issues, {
                severity = "warning",
                message = player:GetName() .. " has no base-building unit",
                actor = nil,
                fix = "Add an MCV or Construction Yard"
            })
        end
    end
    
    return issues
end)

-- Register a batch operation available from the editor's command palette
Editor.RegisterCommand("distribute_ore", {
    label = "Distribute Ore Fields",
    description = "Auto-place balanced ore around each player start",
    execute = function(scenario, params)
        for _, start_pos in ipairs(scenario:GetPlayerStarts()) do
            -- Place ore in a ring around each start position
            local radius = params.radius or 8
            for dx = -radius, radius do
                for dy = -radius, radius do
                    local dist = math.sqrt(dx*dx + dy*dy)
                    if dist >= radius * 0.5 and dist <= radius then
                        local cell = start_pos:Offset(dx, dy)
                        if scenario:GetTerrain(cell):IsPassable() then
                            scenario:SetOverlay(cell, "ore", math.random(1, 3))
                        end
                    end
                end
            end
        end
    end
})
```

#### Tier 3: WASM (Editor Plugins)

Full editor plugins for custom panels, renderers, format support, and export targets:

```rust
// A WASM plugin that adds a custom export target for Tiberian Sun
#[wasm_export]
fn register_editor_plugin(host: &mut EditorHost) {
    // Register a custom export target
    host.register_export_target(TiberianSunExporter::new());
    
    // Register a custom asset viewer for .vxl files
    host.register_asset_viewer("vxl", VoxelViewer::new());
    
    // Register a custom terrain tool
    host.register_terrain_tool(TiberiumGrowthPainter::new());
    
    // Register a custom entity component editor
    host.register_component_editor("SubterraneanUnit", SubUnitEditor::new());
}
```

**Editor extension distribution:** Editor extensions are Workshop packages (D030) with `type: editor_extension` in their manifest. They install into the SDK's extension directory and activate on SDK restart. Extensions declared in a mod profile (D062) auto-activate when that profile is active — a RA2 game module profile automatically loads RA2 editor extensions.

**Plugin manifest compatibility & capabilities (Phase 6b):**
- **API version contract** — extensions declare an editor plugin API version (`api_version`) separate from engine internals. The SDK checks compatibility before load and disables incompatible extensions with a clear reason ("built for plugin API 0.x, this SDK provides 1.x").
- **Capability manifest (deny-by-default)** — extensions must declare requested editor capabilities (`editor.panels`, `editor.asset_viewers`, `editor.export_targets`, etc.). Undeclared capability usage is rejected.
- **Install-time permission review** — the SDK shows the requested capabilities when installing/updating an extension. This is the only prompting point; normal editing sessions are not interrupted.
- **No VCS/process control capabilities by default** — editor plugins do not get commit/rebase/shell execution powers. Git integration remains an explicit user workflow outside plugins unless a separately approved deferred capability is designed and placed in the execution overlay.
- **Version/provenance metadata** — manifests may include signature/provenance information for Workshop trust badges; absence warns but does not prevent local development installs.

### Export-Safe Authoring Mode

The scenario editor offers an **export-safe mode** that constrains the authoring environment to features compatible with a chosen export target:

- **Select target:** "I'm building this mission for OpenRA" (or RA1, or IC)
- **Feature gating:** The editor grays out or hides features the target doesn't support. If targeting RA1: no mind control triggers, no unlimited map size, no branching campaigns, no IC-native sub-scenario portals, no IC hero progression toolkit intermissions/skill progression, and no D070 asymmetric Commander/Field Ops role orchestration (role HUD presets, support request queues, objective-channel semantics beyond plain trigger/objective export). If targeting OpenRA: no IC-only Lua APIs; advanced `Map Segment Unlock` wrappers show yellow/red fidelity when they depend on IC-only phase orchestration beyond OpenRA-equivalent reveal/reinforcement scripting, hero progression/skill-tree tooling shows fidelity warnings because OpenRA campaigns are stateless, and D070 asymmetric role/support UX is treated as IC-native with strip/flatten warnings.
- **Live fidelity indicator:** A traffic-light badge on each entity/trigger: green = exports perfectly, yellow = exports with approximation, red = will be stripped. The creator sees export fidelity as they build, not after.
- **Export-safe trigger templates:** Pre-built trigger patterns guaranteed to downcompile cleanly to the target. "Timer → Reinforcement" template uses only Lua patterns with known RA1 equivalents.
- **Dual preview:** Side-by-side preview showing "IC rendering" and "approximate target rendering" (e.g., palette-quantized sprites to simulate how it will look in original RA1).

This mode doesn't prevent using IC-only features — it informs the creator of consequences in real time. A creator building primarily for IC can still glance at the OpenRA fidelity indicator to know how much work a port would take.

### CLI Export

Export is available from the command line for batch processing and CI integration:

```bash
# Export a single mission to OpenRA format
ic export --target openra --version release-20240315 mission.yaml -o ./openra-output/

# Export an entire campaign to RA1 format
ic export --target ra1 campaign.yaml -o ./ra1-output/ --fidelity-report report.json

# Export all sprites in a mod to .shp+.pal for RA1 compatibility
ic export --target ra1 --content sprites mod.yaml -o ./sprites-output/

# Validate export without writing files (dry run)
ic export --target openra --dry-run mission.yaml

# Stronger export verification (checks exportability + target-facing validation rules)
ic export --target openra --verify mission.yaml

# Batch export: every map in a directory to all targets
ic export --target ra1,openra,ic maps/ -o ./export/
```

**SDK integration:** The Scenario/Campaign editor's `Validate` and `Publish Readiness` flows call the same export planner/verifier used by `ic export --dry-run` / `--verify`. There is one export validation implementation surfaced through both CLI and GUI.

### What This Enables

1. **IC as the C&C community's content creation hub.** Build in IC's superior editor, export to whatever engine your audience plays. A mission maker who targets both IC and OpenRA doesn't maintain two copies — they maintain one IC project and export.

2. **Gradual migration path.** An OpenRA modder starts using IC's editor for map creation (exporting .oramaps), discovers the asset tools, starts authoring rules in IC YAML (exporting MiniYAML), and eventually their entire workflow is in IC — even if their audience still plays OpenRA. When their audience migrates to IC, the mod is already native.

3. **Editor as a platform.** Workshop-distributed editor extensions mean the SDK improves with the community. Someone builds a RA2 voxel placement tool → everyone benefits. Someone builds a Tiberian Sun export target → the TS modding community gains a modern editor. Someone builds a mission quality validator → all mission makers benefit.

4. **Preservation.** Creating new content for the original 1996 Red Alert — missions, campaigns, even total conversions — using modern tools. The export pipeline keeps the original game alive as a playable target.

### Alternatives Considered

1. **Export only to IC native format** — Rejected. Misses the platform opportunity. The C&C community spans multiple engines. Being useful to creators regardless of their target engine is how IC earns adoption.

2. **General transpilation (Lua → any trigger system)** — Rejected. A general Lua transpiler would be fragile, produce unreadable output, and give false confidence. Pattern-based downcompilation is honest about its limitations.

3. **Editor extensions via C# (OpenRA compatibility)** — Rejected. IC doesn't use C# anywhere. WASM is the Tier 3 extension mechanism — Rust, C, AssemblyScript, or any WASM-targeting language. No C# runtime dependency.

4. **Separate export tools (not integrated in SDK)** — Rejected. Export is part of the creation workflow, not a post-processing step. The export-safe authoring mode only works if the editor knows the target while you're building.

5. **Bit-perfect re-creation of target engine behavior** — Not a goal. Export produces valid content for the target engine, but doesn't guarantee identical gameplay to what IC simulates (D011 — cross-engine compatibility is community-layer, not sim-layer). RA1 and OpenRA will simulate the exported content with their own engines.

### Integration with Existing Decisions

- **D023 (OpenRA Vocabulary Compatibility):** The alias table is now bidirectional — used for import (OpenRA → IC) AND export (IC → OpenRA). The exporter reverses D023's trait name mapping.
- **D024 (Lua API):** Export validates Lua against the target's API surface. IC-only extensions are flagged; OpenRA's 16 globals are the safe subset.
- **D025 (Runtime MiniYAML Loading):** The MiniYAML converter is now bidirectional: load at runtime (MiniYAML → IC YAML) and export (IC YAML → MiniYAML).
- **D026 (Mod Manifest Compatibility):** `mod.yaml` parsing is now bidirectional — import OpenRA manifests AND generate them on export.
- **D030 (Workshop):** Editor extensions are Workshop packages. Export presets/profiles are shareable via Workshop.
- **D038 (Scenario Editor):** The scenario editor gains export-safe mode, fidelity indicators, export-safe trigger templates, and Validate/Publish Readiness integration that surfaces target compatibility before publish. Export is a first-class editor action, not a separate tool.
- **D070 (Asymmetric Commander & Field Ops Co-op):** D070 scenarios/templates are expected to be IC-native. Exporters may downcompile fragments (maps, units, simple triggers), but role orchestration, request/response HUD flows, and asymmetric role permissions require fidelity warnings and usually manual redesign.
- **D040 (Asset Studio):** Asset conversion (D040's Cross-Game Asset Bridge) is the per-file foundation. D066 orchestrates whole-project export using D040's converters.
- **D062 (Mod Profiles):** A mod profile can embed export target preference. "RA1 Compatible" profile constrains features to RA1-exportable subset.
- **ra-formats write support:** D066 is the primary consumer of ra-formats write support (Phase 6a). The exporter calls into ra-formats encoders for .shp, .pal, .aud, .vqa, .mix generation.

### Phase

- **Phase 6a:** Core export pipeline ships alongside the scenario editor and asset studio. Built-in export targets: IC native (trivial), OpenRA (`.oramap` + MiniYAML rules). Export-safe authoring mode in scenario editor. `ic export` CLI.
- **Phase 6b:** RA1 export target (requires .ini generation, trigger downcompilation, .mix packing). Campaign export (linearization for stateless targets). Editor extensibility API (YAML + Lua tiers). Editor extension Workshop distribution plus plugin capability manifests / compatibility checks / install-time permission review.
- **Phase 7:** WASM editor plugins (Tier 3 extensibility). Community-contributed export targets (TS, RA2, Remastered). Agentic export assistance (LLM suggests how to simplify IC-only features for target compatibility).

---

## D068: Selective Installation & Content Footprints

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 4 (official pack partitioning + prompts), Phase 5 (fingerprint split + CLI workflows), Phase 6a (Installed Content Manager UI), Phase 6b (smart recommendations)
- **Canonical for:** Selective installs, install profiles, optional media packs, and gameplay-vs-presentation compatibility fingerprinting
- **Scope:** package manifests, `VirtualNamespace`/D062 integration, Workshop/base content install UX, Settings → Data content manager, creator validation/publish checks
- **Decision:** IC supports player-facing **install profiles** and **optional content packs** so players can keep only the content they care about (e.g., MP/skirmish only, campaign core without FMV/music) while preserving a complete playable experience for installed features.
- **Why:** Storage constraints, bandwidth constraints, different player priorities, and a no-dead-end UX that installs missing content on demand instead of forcing monolithic installs.
- **Non-goals:** Separate executables per mode, mandatory campaign media, or a monolithic “all content only” install model.
- **Invariants preserved:** D062 logical mod composition stays separate from D068 physical installation selection; D049 CAS remains the storage foundation; missing optional media must never break campaign progression.
- **Defaults / UX behavior:** Features stay clickable; missing content opens install guidance; campaign media is optional with fallback briefing/subtitles/ambient behavior.
- **Compatibility / Export impact:** Lobbies/ranked use a **gameplay fingerprint** as the hard gate; media/remaster/voice packs are **presentation fingerprint** scope unless they change gameplay.
- **AI remaster media policy:** AI-enhanced cutscene packs are optional presentation variants (Original / Clean / AI-Enhanced), clearly labeled, provenance-aware, and never replacements for the canonical originals.
- **Public interfaces / types / commands:** manifest `install` metadata + optional dependencies/fallbacks, `ic content list`, `ic content apply-profile`, `ic content install/remove`, `ic mod gc`
- **Affected docs:** `src/17-PLAYER-FLOW.md`, `src/decisions/09e-community.md`, `src/decisions/09g-interaction.md`, `src/04-MODDING.md`, `src/decisions/09f-tools.md`
- **Revision note summary:** None
- **Keywords:** selective install, install profiles, campaign core, optional media, cutscene variants, presentation fingerprint, installed content manager

**Decision:** Support **selective installation** of game content through **content install profiles** and **optional content packs**, while preserving a complete playable experience for installed features. Campaign gameplay content is separable from campaign media (music, voice, cutscenes). Missing optional media must degrade to designer-authored fallbacks (text, subtitles, static imagery, or silence/ambient), never a hard failure.

**Why this matters:** Players have different priorities and constraints:

- Some only want **multiplayer + skirmish**
- Some want **campaigns** but not high-footprint media packs
- Some play on **storage-constrained systems** (older laptops, handhelds, small SSDs)
- Some have **bandwidth constraints** and want staged downloads

IC already has the technical foundation for this (D062 virtual namespace + D049 content-addressed storage). D068 makes it a first-class player-facing workflow instead of an accidental side effect of package modularity.

### Core Model: Installed Content Is a Capability Set

D062 defines **what content is active** (mod profile + virtual namespace). D068 adds a separate concern: **what content is physically installed locally**.

These are distinct:

- **Mod profile (D062):** "What should be active for this play session?"
- **Install profile (D068):** "What categories of content do I keep on disk?"

A player can have a mod profile that references campaign media they do not currently have installed. The engine resolves this via optional dependencies + fallbacks + install prompts.

### Install Profiles (Player-Facing, Space-Saving)

An **install profile** is a local, player-facing content selection preset focused on disk footprint and feature availability.

Examples:

- **Minimal Multiplayer** — core game module + skirmish + multiplayer maps + essential UI/audio
- **Campaign Core** — campaign maps/scripts/briefings/dialogue text, no FMV/music/voice media packs
- **Campaign Full** — campaign core + optional media packs (music/cutscenes/voice)
- **Classic Full** — base game + classic media + standard assets
- **Custom** — player picks exactly which packs to keep

Install profiles are separate from D062 mod profiles because they solve a different problem: storage and download scope, not gameplay composition.

### Content Pack Types

Game content is split into installable packs with explicit dependency semantics:

1. **Core runtime packs** (required for the selected game module)
   - Rules, scripts, base assets, UI essentials, core maps needed for menu/shellmap/skirmish baseline
2. **Mode packs**
   - Campaign mission data (maps/scripts/briefing text)
   - Skirmish map packs
   - Tutorial/Commander School
3. **Presentation/media packs** (optional)
   - Music
   - Cutscenes / FMV
   - Cutscene remaster variants (e.g., original / clean remaster / AI-enhanced remaster)
   - Voice-over packs (per language)
   - HD art packs / optional presentation packs
4. **Creator tooling packs**
   - SDK/editor remains separately distributed (D040), but its downloadable dependencies can use the same installability metadata

### Package Manifest Additions (Installability Metadata)

Workshop/base packages gain installability metadata so the client can reason about optionality and disk usage:

```yaml
# manifest.yaml (conceptual additions)
install:
  category: campaign_media          # core | campaign_core | campaign_media | skirmish_maps | voice_pack | hd_assets | ...
  default_install: false            # true for required baseline packs
  optional: true                    # false = required when referenced
  size_bytes_estimate: 842137600    # shown in install UI before download
  feature_tags: [campaign, cutscene, music]

dependencies:
  required:
    - id: "official/ra1-campaign-core"
      version: "^1.0"
  optional:
    - id: "official/ra1-cutscenes"
      version: "^1.0"
      provides: [campaign_cutscenes]
    - id: "official/ra1-music-classic"
      version: "^1.0"
      provides: [campaign_music]

fallbacks:
  # Declares acceptable degradation paths if optional dependency missing
  campaign_cutscenes: text_briefing
  campaign_music: silence_or_ambient
  voice_lines: subtitles_only
```

The exact manifest schema can evolve, but the semantics are fixed:

- required dependencies block use until installed
- optional dependencies unlock enhancements
- fallback policy defines how gameplay proceeds when optional content is absent

### Cutscene Variant Packs (Original / Clean / AI-Enhanced)

D068 explicitly supports multiple **presentation variants** of the same campaign cutscene set as separate optional packs.

Examples:

- `official/ra1-cutscenes-original` (canonical source-preserving package)
- `official/ra1-cutscenes-clean-remaster` (traditional restoration: deinterlace/cleanup/color/audio work)
- `official/ra1-cutscenes-ai-enhanced` (generative restoration/upscaling/interpolation workflow where quality and rights permit)

Design rules:

- **Original assets are never replaced** by AI-enhanced variants; they remain installable/selectable.
- Variant packs are **presentation-only** and must not alter mission scripting, timing logic, or gameplay data.
- AI-enhanced variants must be **clearly labeled** in install UI and settings (`AI Enhanced`, `Experimental`, or equivalent policy wording).
- Campaign flow must remain valid if none of the variant packs are installed (D068 fallback rules still apply).
- Variant selection is a **player preference**, not a multiplayer compatibility gate.

This lets IC support preservation-first users, storage-constrained users, and "best possible remaster" users without fragmenting campaign logic or installs.

### Voice-Over Variant Packs (Language / Style / Mix)

D068 explicitly supports multiple **voice-over variants** as optional presentation packs and player preferences, similar to cutscene variants but with per-category selection.

Examples:

- `official/ra1-voices-original-en` (canonical English EVA/unit responses)
- `official/ra1-voices-localized-he` (Hebrew localized voice pack where rights/content permit)
- `official/ra1-voices-eva-classic` (classic EVA style pack)
- `official/ra1-voices-eva-remastered` (alternate EVA style/tone pack)
- `community/modx-voices-faction-overhaul` (mod-specific presentation voice pack)

Design rules:

- Voice-over variants are **presentation-only** unless they alter gameplay timing/logic (they should not).
- Voice-over selection is a **player preference**, not a multiplayer compatibility gate.
- Preferences may be configured **per category**, with at minimum:
  - `eva_voice`
  - `unit_responses`
  - `campaign_dialogue_voice`
  - `cutscene_dub_voice` (where dubbed audio variants exist)
- A selected category may use:
  - `Auto` (follow display/subtitle language and content availability),
  - a specific language/style variant,
  - or `Off` where the category supports text/subtitle fallback.
- Missing preferred voice variants must fall back predictably (see D068 fallback rules below) and never block mission/campaign progression.

This allows players to choose a preferred language, nostalgia-first/classic voice style, or alternate voice presentation while preserving shared gameplay compatibility.

### Media Language Capability Matrix (Cutscenes / Dubs / Subtitles / Closed Captions)

D068 requires media packages that participate in campaign/cutscene playback to expose enough language metadata for clients to choose a safe fallback path.

At minimum, the content system must be able to reason about:

- available cutscene audio/dub languages
- available subtitle languages
- available closed-caption languages
- translation source/trust labeling (human / machine / hybrid)
- coverage (full vs partial, and/or per-track completeness)

This metadata may live in D049 Workshop package manifests/index summaries and/or local import indexes, but the fallback semantics are defined here in D068.

Player preference model (minimum):

- primary spoken-voice preference (per category, see voice-over variants above)
- primary subtitle/CC language
- optional secondary subtitle/CC fallback language
- original-audio fallback preference when preferred dub is unavailable
- optional machine-translated subtitle/CC fallback toggle (see phased rollout below)

This prevents the common failure mode where a cutscene pack exists but does not support the player's preferred language, and the client has no deterministic fallback behavior.

### Optional Media Must Not Break Campaign Flow

This is the central rule.

If a player installs "Campaign Core" but not media packs:

- **Cutscene missing** → show briefing/intermission fallback (text, portrait, static image, or radar comm text)
- **Music missing** → use silence, ambient loop, or module fallback
- **Voice missing** → subtitles/closed captions/text remain available

Campaign progression, mission completion, and save/load must continue normally.

If multiple cutscene variants are installed (Original / Clean / AI-Enhanced), the client uses the player's preferred variant. If the preferred variant is unavailable for a specific cutscene, the client falls back to another installed variant (preferably Original, then Clean, then other configured fallback) before dropping to text/briefing fallback.

If multiple voice-over variants are installed, the client applies the player's **per-category voice preference**. If the preferred voice variant is unavailable for a line/category, the client falls back to:

1. another installed variant in the same category/language preference chain,
2. another installed compatible category default (e.g. default EVA pack),
3. text/subtitle/closed-caption presentation (for categories that support it),
4. silence/none (only where explicitly allowed by the category policy).

For cutscenes/dialogue language support, the fallback chain must distinguish **audio**, **subtitles**, and **closed captions**:

1. preferred dub audio + preferred subtitle/CC language,
2. original audio + preferred subtitle/CC language,
3. original audio + secondary subtitle/CC language (if configured),
4. original audio + machine-translated subtitle/CC fallback (optional, clearly labeled, if user enabled and available),
5. briefing/intermission/text fallback,
6. skip cutscene (never block progression).

**Machine-translated subtitle/CC fallback** is an optional, clearly labeled presentation feature. It is **deferred to `M11` (`P-Optional`)** after `M9.COM.D049_FULL_WORKSHOP_CAS`, `M9.COM.WORKSHOP_MANIFEST_SIGNING_AND_PROVENANCE`, and `M10.SDK.LOCALIZATION_PLUGIN_HARDENING`; it is not part of the `M6.SP.MEDIA_VARIANTS_AND_FALLBACKS` baseline. Validation trigger: labeled machine-translation metadata/trust tags, user opt-in UX, and fallback-safe campaign path tests in `M11` platform/content polish.

This aligns with IC's existing media/cinematic tooling philosophy (D038): media enriches the experience but should not be a hidden gameplay dependency unless a creator explicitly marks a mission as requiring a specific media pack (and Publish validation surfaces that requirement).

### Install-Time and Runtime UX (No Dead Ends)

The player-facing rule follows `17-PLAYER-FLOW.md` § "No Dead-End Buttons":

- Features remain clickable even if supporting content is not installed
- Clicking opens a **guidance/install panel** with:
  - what is missing
  - why it matters
  - size estimate
  - one-click choices (minimal vs full)

Examples:

- Clicking **Campaign** without campaign core installed:
  - `Install Campaign Core (Recommended)`
  - `Install Full Campaign (Includes Music + Cutscenes)`
  - `Manage Content`
- Starting a mission that references an optional cutscene pack not installed:
  - non-blocking banner: "Optional cutscene pack not installed — using briefing fallback"
  - action button: `Download Cutscene Pack`
- Selecting `AI Enhanced Cutscenes` in Settings when the pack is not installed:
  - guidance panel: `Install AI Enhanced Cutscene Pack` / `Use Original Cutscenes` / `Use Briefing Fallback`
- Starting a cutscene where the selected dub language is unavailable:
  - non-blocking prompt: `No Hebrew dub for this cutscene. Use English audio + Hebrew subtitles?`
  - options: `Use Original Audio + Subtitles` / `Use Secondary Subtitle Language` / `Use Briefing Fallback`
  - optional toggle (if enabled in later phases): `Allow Machine-Translated Subtitles for Missing Languages`

### First-Run Setup Wizard Integration (D069)

D068 is the content-planning model used by the **D069 First-Run Setup Wizard**.

Wizard rules:
- The setup wizard presents D068 install presets during first-run setup and maintenance re-entry.
- **Wizard default preset is `Full Install`** (player-facing default chosen for D069), with visible one-click alternatives (`Campaign Core`, `Minimal Multiplayer`, `Custom`).
- The wizard must show **size estimates** and **feature summaries** before starting transfers/downloads.
- The wizard may select a preset automatically in Quick Setup, but the player can switch before committing.
- Any wizard selection remains fully reversible later through `Settings → Data` (Installed Content Manager).

This keeps first-run setup fast while preserving D068's space-saving flexibility.

### Owned Proprietary Source Import (Remastered / GOG / EA Installs)

D068 supports install plans that are satisfied by a mix of:
- **local owned-source imports** (proprietary assets detected by D069, such as the C&C Remastered Collection),
- **open/free sources** (OpenRA assets, community packs where rights permit), and
- **Workshop/official package downloads**.

Rules:
- **Out-of-the-box Remastered import:** D069 must support importing/extracting Red Alert assets from a detected Remastered Collection install without requiring manual path wrangling or external conversion tools.
- **Read-only source installs:** IC treats detected proprietary installs as read-only sources. D069 imports/extracts into IC-managed storage and indexes; repair/rebuild actions target IC-managed data, not the original game install.
- **No implicit redistribution:** Imported proprietary assets remain local content. D068 install profiles may reference them, but this does not imply Workshop mirroring or publish rights.
- **Provenance visibility:** Installed Content Manager and D069 maintenance flows should show which content comes from owned local imports vs downloaded packages, so players understand what can be repaired locally vs re-downloaded.

This preserves the easy player experience ("use my Remastered install") without weakening D049/D037 provenance and redistribution rules.

Implementation detail and sequencing are specified in `05-FORMATS.md` § "Owned-Source Import & Extraction Pipeline (D069/D068/D049, Format-by-Format)" and the execution-overlay `G1.x` / `G21.x` substeps.

### Multiplayer Compatibility: Gameplay vs Presentation Fingerprints

Selective install introduces a compatibility trap: a player missing music/cutscenes should not fail multiplayer compatibility if gameplay content is identical.

D068 resolves this by splitting namespace compatibility into two fingerprints:

- **Gameplay fingerprint** — rules, scripts, maps, gameplay-affecting assets/data
- **Presentation fingerprint** — optional media/presentation-only packs (music, cutscenes, voice, HD art when not gameplay-significant)

Lobby compatibility and ranked verification use the **gameplay fingerprint** as the hard gate. The presentation fingerprint is informational (and may affect cosmetics only).

AI-enhanced cutscene packs are explicitly **presentation fingerprint** scope unless they introduce gameplay-significant content (which they should not).
Voice-over variant packs (language/style/category variants) are also **presentation fingerprint** scope unless they alter gameplay-significant timing/data (which they should not).

If a pack changes gameplay-relevant data, it belongs in gameplay fingerprint scope — not presentation.

**Player configuration profiles (`player-config`, D049) are outside both fingerprint classes.** They are local client preferences (bindings, accessibility, HUD/layout/QoL presets), never lobby-required resources, and must not affect multiplayer/ranked compatibility checks.

### Storage Efficiency (D049 CAS + D062 Namespace)

Selective installs become practical because IC already uses content-addressed storage and virtual namespace resolution:

- **CAS deduplication (D049)** avoids duplicate storage across packs/mods/versions
- **Namespace resolution (D062)** allows missing optional content to be handled at lookup time with explicit fallback behavior
- **GC (`ic mod gc`)** reclaims unreferenced blobs when packs are removed

This means "install campaign without cutscenes/music" is not a special mode — it's just a different install profile + pack set.

### Settings / Content Manager Requirements

The game's Settings/Data area includes an **Installed Content Manager**:

- active install profile (`Minimal Multiplayer`, `Campaign Core`, `Custom`, etc.)
- pack list with size, installed/not installed status
- per-pack purpose labels (`Gameplay required`, `Optional media`, `Language voice pack`)
- media variant groups (e.g., `Cutscenes: Original / Clean / AI-Enhanced`, `EVA Voice: Classic / Remastered / Localized`) with preferred variant selection
- language capability badges and labels for media packs (`Audio`, `Subs`, `CC`, translation source/trust label, coverage)
- voice-over category preference controls (or link-out to `Settings → Audio`) for `EVA`, `Unit Responses`, and campaign/cutscene dialogue voice where available
- reclaimable space estimate before uninstall
- one-click switches between install presets
- "keep gameplay, remove media" shortcut

### D069 Maintenance Wizard Handoff

The Installed Content Manager is the long-lived management surface; D069 provides the guided entry points and recovery flow.

- **D069 ("Modify Installation")** can launch directly into a preset-switch or pack-selection step using the same D068 data model.
- **D069 ("Repair & Verify")** can branch into checksum verification, metadata/index rebuild, source re-scan, and reclaim-space actions, then return to the Installed Content Manager summary.
- Missing-content guidance panels (D033 no-dead-end behavior) should offer both:
  - a quick one-click install action, and
  - `Open Modify Installation` for the full D069 maintenance flow

D068 intentionally avoids duplicating wizard mechanics; it defines the content semantics the wizard and the Installed Content Manager share.

### CLI / Automation (for power users and packs)

```bash
# List installed/available packs and sizes
ic content list

# Apply a local install profile preset
ic content apply-profile minimal-multiplayer

# Install campaign core without media
ic content install official/ra1-campaign-core

# Add optional media later
ic content install official/ra1-cutscenes official/ra1-music-classic

# Remove optional packs and reclaim space
ic content remove official/ra1-cutscenes official/ra1-music-classic
ic mod gc
```

CLI naming can change, but the capability should exist for scripted setups, LAN cafes, and low-storage devices.

### Validation / Publish Rules for Creators

To keep player experience predictable, creator-facing validation (D038 `Validate` / Publish Readiness) checks:

- missions/campaigns with optional media references provide valid fallback paths
- required media packs are declared explicitly (if truly required)
- package metadata correctly classifies optional vs required dependencies
- presentation-only packs do not accidentally modify gameplay hash scope
- AI-enhanced media/remaster packs include provenance/rights metadata and are clearly labeled as variant presentation packs

This prevents "campaign core" installs from hitting broken missions because a creator assumed FMV/music always exists.

### Integration with Existing Decisions

- **D030 (Workshop):** Installability metadata and optional dependency semantics are part of package distribution and auto-download decisions.
- **D040 (SDK separation):** SDK remains a separate download; D068 applies the same selective-install philosophy to optional creator dependencies/assets.
- **D049 (Workshop CAS):** Local content-addressed blob store + GC make selective installs storage-efficient instead of duplicate-heavy.
- **D062 (Mod Profiles & VirtualNamespace):** D068 adds *physical install selection* on top of D062's *logical activation/composition*. Namespace resolution and fingerprints are extended, not replaced.
- **D065 (Tutorial/New Player):** First-run can recommend `Campaign Core` vs `Minimal Multiplayer` based on player intent ("I want single-player" / "I only want multiplayer").
- **D069 (Installation & First-Run Setup Wizard):** D069 is the canonical wizard UX that presents D068 install presets, size estimates, transfer/verify progress, and maintenance re-entry flows.
- **17-PLAYER-FLOW.md:** "No Dead-End Buttons" install guidance panels become the primary UX surface for missing content.

### Alternatives Considered

1. **Monolithic install only** — Rejected. Wastes disk space, blocks low-storage users, and conflicts with the project's accessibility goals.
2. **Make campaign media mandatory** — Rejected. FMV/music/voice are enrichments; campaign gameplay should remain playable without them.
3. **Separate executables per mode (campaign-only / MP-only)** — Rejected. Increases maintenance and patch complexity. Content packs + install profiles achieve the same user benefit without fragmenting binaries.
4. **Treat this as only a Workshop problem** — Rejected. Official/base content has the same storage problem (campaign media, voice packs, HD packs).

### Phase

- **Phase 4:** Basic official pack partitioning (campaign core vs optional media) and install prompts for missing campaign content. Campaign fallback behavior validated for first-party campaigns.
- **Phase 5:** Gameplay vs presentation fingerprint split in lobbies/replays/ranked compatibility checks. CLI content install/remove/list + GC workflows stabilized.
- **Phase 6a:** Full Installed Content Manager UI, install presets, size estimates, CAS-backed reclaim reporting, and Workshop package installability metadata at scale.
- **Phase 6b:** Smart recommendations ("You haven’t used campaign media in 90 days — free 4.2 GB?"), per-device install profile sync, and finer-grained prefetch policies.
- **Phase 7+ / Future:** Optional official/community cutscene remaster variant packs (including AI-enhanced variants where legally and technically viable) can ship under the same D068 install-profile and presentation-fingerprint rules without changing campaign logic.

---
