# 09 — Decision Log

Every major design decision, with rationale and alternatives considered. Decisions are organized into thematic sub-documents for efficient navigation.

For improved agentic retrieval / RAG summaries, see the reusable **Decision Capsule** template in `src/decisions/DECISION-CAPSULE-TEMPLATE.md` and the topic routing guide in `src/LLM-INDEX.md`.

---

## Sub-Documents

| Document                                                | Scope                                                                                       | Decisions                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Foundation & Core](decisions/09a-foundation.md)        | Language, framework, data formats, simulation invariants, core engine identity, crate extraction | D001–D003, D009, D010, D015, D017, D018, D039, D063, D064, D067, D076 |
| [Networking & Multiplayer](decisions/09b-networking.md) | Network model, relay server, sub-tick ordering, community servers, ranked play, community server bundle | D006–D008, D011, D012, D052, D055, D060, D074       |
| [Modding & Compatibility](decisions/09c-modding.md)     | Scripting tiers, OpenRA compatibility, UI themes, mod profiles, licensing, export, Remastered format compat | D004, D005, D014, D023–D027, D032, D050, D051, D062, D066, D068, D075 |
| [Gameplay & AI](decisions/09d-gameplay.md)              | Pathfinding, balance, QoL, AI systems, render modes, trait-abstracted subsystems, asymmetric co-op mode design, LLM exhibition/prompt-coached match modes | D013, D019, D021, D022, D028, D029, D033, D041–D045, D048, D054, D070, D073 |
| [Community & Platform](decisions/09e-community.md)      | Workshop, telemetry, storage, achievements, governance, profiles, data portability          | D030, D031, D034–D037, D046, D049, D053, D061       |
| [Tools & Editor](decisions/09f-tools.md)                | LLM mission generation, scenario editor, asset studio, mod SDK, foreign replays, skill library | D016, D020, D038, D040, D047, D056, D057            |
| [In-Game Interaction](decisions/09g-interaction.md)     | Command console, communication systems (chat, voice, pings), tutorial/new player experience, installation/setup wizard UX | D058, D059, D065, D069                                    |

---

## Decision Index

| ID   | Decision                                           | Sub-Document                                |
| ---- | -------------------------------------------------- | ------------------------------------------- |
| D001 | Language — Rust                                    | [Foundation](decisions/09a-foundation.md)   |
| D002 | Framework — Bevy                                   | [Foundation](decisions/09a-foundation.md)   |
| D003 | Data Format — Real YAML, Not MiniYAML              | [Foundation](decisions/09a-foundation.md)   |
| D004 | Modding — Lua (Not Python) for Scripting           | [Modding](decisions/09c-modding.md)         |
| D005 | Modding — WASM for Power Users (Tier 3)            | [Modding](decisions/09c-modding.md)         |
| D006 | Networking — Pluggable via Trait                   | [Networking](decisions/09b/D006-pluggable-net.md)   |
| D007 | Networking — Relay Server as Default               | [Networking](decisions/09b/D007-relay-default.md)   |
| D008 | Sub-Tick Timestamps on Orders                      | [Networking](decisions/09b/D008-sub-tick.md)   |
| D009 | Simulation — Fixed-Point Math, No Floats           | [Foundation](decisions/09a-foundation.md)   |
| D010 | Simulation — Snapshottable State                   | [Foundation](decisions/09a-foundation.md)   |
| D011 | Cross-Engine Play — Community Layer, Not Sim Layer | [Networking](decisions/09b/D011-cross-engine.md)   |
| D012 | Security — Validate Orders in Sim                  | [Networking](decisions/09b/D012-order-validation.md)   |
| D013 | Pathfinding — Trait-Abstracted, Multi-Layer Hybrid | [Gameplay](decisions/09d/D013-pathfinding.md)       |
| D014 | Templating — Tera in Phase 6a (Nice-to-Have)       | [Modding](decisions/09c-modding.md)         |
| D015 | Performance — Efficiency-First, Not Thread-First   | [Foundation](decisions/09a-foundation.md)   |
| D016 | LLM-Generated Missions and Campaigns               | [Tools](decisions/09f/D016-llm-missions.md)             |
| D017 | Bevy Rendering Pipeline                            | [Foundation](decisions/09a-foundation.md)   |
| D018 | Multi-Game Extensibility (Game Modules)            | [Foundation](decisions/09a-foundation.md)   |
| D019 | Switchable Balance Presets                         | [Gameplay](decisions/09d/D019-balance-presets.md)       |
| D020 | Mod SDK & Creative Toolchain                       | [Tools](decisions/09f/D020-mod-sdk.md)              |
| D021 | Branching Campaign System with Persistent State    | [Gameplay](decisions/09d/D021-branching-campaigns.md) |
| D022 | Dynamic Weather with Terrain Surface Effects       | [Gameplay](decisions/09d/D022-dynamic-weather.md)   |
| D023 | OpenRA Vocabulary Compatibility Layer              | [Modding](decisions/09c/D023-vocabulary-compat.md)  |
| D024 | Lua API Superset of OpenRA                         | [Modding](decisions/09c/D024-lua-superset.md)       |
| D025 | Runtime MiniYAML Loading                           | [Modding](decisions/09c/D025-miniyaml-runtime.md)   |
| D026 | OpenRA Mod Manifest Compatibility                  | [Modding](decisions/09c/D026-mod-manifest.md)       |
| D027 | Canonical Enum Compatibility with OpenRA           | [Modding](decisions/09c/D027-canonical-enums.md)    |
| D028 | Condition and Multiplier Systems as Phase 2 Requirements | [Gameplay](decisions/09d/D028-conditions-multipliers.md) |
| D029 | Cross-Game Component Library (Phase 2 Targets)     | [Gameplay](decisions/09d/D029-cross-game-components.md) |
| D030 | Workshop Resource Registry & Dependency System     | [Community](decisions/09e/D030-workshop-registry.md)     |
| D031 | Observability & Telemetry (OTEL)                   | [Community](decisions/09e/D031-observability.md)     |
| D032 | Switchable UI Themes                               | [Modding](decisions/09c-modding.md)         |
| D033 | Toggleable QoL & Gameplay Behavior Presets         | [Gameplay](decisions/09d/D033-qol-presets.md)       |
| D034 | SQLite as Embedded Storage                         | [Community](decisions/09e/D034-sqlite.md)     |
| D035 | Creator Recognition & Attribution                  | [Community](decisions/09e/D035-creator-attribution.md)     |
| D036 | Achievement System                                 | [Community](decisions/09e/D036-achievements.md)     |
| D037 | Community Governance & Platform Stewardship        | [Community](decisions/09e/D037-governance.md)     |
| D038 | Scenario Editor (OFP/Eden-Inspired, SDK)           | [Tools](decisions/09f/D038-scenario-editor.md)             |
| D039 | Engine Scope — General-Purpose Classic RTS         | [Foundation](decisions/09a-foundation.md)   |
| D040 | Asset Studio                                       | [Tools](decisions/09f/D040-asset-studio.md)             |
| D041 | Trait-Abstracted Subsystem Strategy                | [Gameplay](decisions/09d/D041-trait-abstraction.md)       |
| D042 | Player Behavioral Profiles & Training              | [Gameplay](decisions/09d/D042-behavioral-profiles.md)       |
| D043 | AI Behavior Presets                                | [Gameplay](decisions/09d/D043-ai-presets.md)       |
| D044 | LLM-Enhanced AI                                    | [Gameplay](decisions/09d/D044-llm-ai.md)       |
| D045 | Pathfinding Behavior Presets                       | [Gameplay](decisions/09d/D045-pathfinding-presets.md)       |
| D046 | Community Platform — Premium Content               | [Community](decisions/09e/D046-community-platform.md)     |
| D047 | LLM Configuration Manager                          | [Tools](decisions/09f/D047-llm-config.md)             |
| D048 | Switchable Render Modes                            | [Gameplay](decisions/09d/D048-render-modes.md)       |
| D049 | Workshop Asset Formats & P2P Distribution          | [Community](decisions/09e/D049-workshop-assets.md)     |
| D050 | Workshop as Cross-Project Reusable Library         | [Modding](decisions/09c-modding.md)         |
| D051 | Engine License — GPL v3 with Modding Exception     | [Modding](decisions/09c-modding.md)         |
| D052 | Community Servers with Portable Signed Credentials | [Networking](decisions/09b/D052-community-servers.md)   |
| D053 | Player Profile System                              | [Community](decisions/09e/D053-player-profile.md)     |
| D054 | Extended Switchability                             | [Gameplay](decisions/09d/D054-extended-switchability.md)       |
| D055 | Ranked Tiers, Seasons & Matchmaking Queue          | [Networking](decisions/09b/D055-ranked-matchmaking.md)   |
| D056 | Foreign Replay Import                              | [Tools](decisions/09f/D056-replay-import.md)             |
| D057 | LLM Skill Library                                  | [Tools](decisions/09f/D057-llm-skill-library.md)             |
| D058 | In-Game Command Console                            | [Interaction](decisions/09g/D058-command-console.md) |
| D059 | In-Game Communication (Chat, Voice, Pings)         | [Interaction](decisions/09g/D059-communication.md) |
| D060 | Netcode Parameter Philosophy                       | [Networking](decisions/09b/D060-netcode-params.md)   |
| D061 | Player Data Backup & Portability                   | [Community](decisions/09e/D061-data-backup.md)     |
| D062 | Mod Profiles & Virtual Asset Namespace             | [Modding](decisions/09c-modding.md)         |
| D063 | Compression Configuration (Carried Forward in D067) | [Foundation](decisions/09a-foundation.md)  |
| D064 | Server Configuration System (Carried Forward in D067) | [Foundation](decisions/09a-foundation.md) |
| D065 | Tutorial & New Player Experience                   | [Interaction](decisions/09g/D065-tutorial.md) |
| D066 | Cross-Engine Export & Editor Extensibility         | [Modding](decisions/09c-modding.md)         |
| D067 | Configuration Format Split — TOML vs YAML          | [Foundation](decisions/09a-foundation.md)   |
| D068 | Selective Installation & Content Footprints        | [Modding](decisions/09c-modding.md)         |
| D069 | Installation & First-Run Setup Wizard              | [Interaction](decisions/09g/D069-install-wizard.md) |
| D070 | Asymmetric Co-op Mode — Commander & Field Ops      | [Gameplay](decisions/09d/D070-asymmetric-coop.md)       |
| D071 | External Tool API — IC Remote Protocol (ICRP)      | [Tools](decisions/09f/D071-external-tool-api.md)        |
| D072 | Dedicated Server Management                         | [Networking](decisions/09b/D072-server-management.md)   |
| D073 | LLM Exhibition Matches & Prompt-Coached Modes      | [Gameplay](decisions/09d/D073-llm-exhibition-modes.md)  |
| D074 | Community Server — Unified Binary with Capability Flags | [Networking](decisions/09b/D074-community-server-bundle.md) |
| D075 | Remastered Collection Format Compatibility              | [Modding](decisions/09c/D075-remastered-format-compat.md)   |
| D076 | Standalone MIT/Apache-Licensed Crate Extraction Strategy | [Foundation](decisions/09a/D076-standalone-crates.md)       |

---

## Pending Decisions

| ID   | Topic                                                                 | Needs Resolution By |
| ---- | --------------------------------------------------------------------- | ------------------- |
| ~~P002~~ | ~~Fixed-point scale~~ → **Resolved: 1024** (matches OpenRA WDist/WPos/WAngle). See `research/fixed-point-math-design.md` | Resolved |
| ~~P003~~ | ~~Audio library choice + music integration design~~ → **Resolved: Kira via `bevy_kira_audio`** — four-bus mixer (Music/SFX/Voice/Ambient), dynamic music FSM, EVA priority queue, sound pooling. See `research/audio-library-music-integration-design.md` | Resolved |
| ~~P004~~ | ~~Lobby/matchmaking wire format details~~ → **Resolved:** Complete lobby/matchmaking/discovery wire protocol — CBOR framing, 40+ message types, server discovery (HTTPS seed + mDNS), matchmaking queue, SCR credential exchange, lobby→game transition. See `research/lobby-matchmaking-wire-protocol-design.md` | Resolved |
