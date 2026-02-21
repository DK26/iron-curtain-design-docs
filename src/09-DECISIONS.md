# 09 — Decision Log

Every major design decision, with rationale and alternatives considered. Decisions are organized into thematic sub-documents for efficient navigation.

---

## Sub-Documents

| Document | Scope | Decisions |
|---|---|---|
| [Foundation & Core](decisions/09a-foundation.md) | Language, framework, data formats, simulation invariants, core engine identity | D001–D003, D009, D010, D015, D017, D018, D039, D067 |
| [Networking & Multiplayer](decisions/09b-networking.md) | Network model, relay server, sub-tick ordering, community servers, ranked play | D006–D008, D011, D012, D052, D055, D060 |
| [Modding & Compatibility](decisions/09c-modding.md) | Scripting tiers, OpenRA compatibility, UI themes, mod profiles, licensing, export | D004, D005, D014, D032, D050, D051, D062, D066 |
| [Gameplay & AI](decisions/09d-gameplay.md) | Pathfinding, balance, QoL, AI systems, render modes, trait-abstracted subsystems | D013, D019, D033, D041–D045, D048, D054 |
| [Community & Platform](decisions/09e-community.md) | Workshop, telemetry, storage, achievements, governance, profiles, data portability | D030, D031, D034–D037, D046, D049, D053, D061 |
| [Tools & Editor](decisions/09f-tools.md) | LLM mission generation, scenario editor, asset studio, foreign replays, skill library | D016, D038, D040, D047, D056, D057 |
| [In-Game Interaction](decisions/09g-interaction.md) | Command console, communication systems (chat, voice, pings) | D058, D059 |

---

## Decision Index

| ID | Decision | Sub-Document |
|---|---|---|
| D001 | Language — Rust | [Foundation](decisions/09a-foundation.md) |
| D002 | Framework — Bevy | [Foundation](decisions/09a-foundation.md) |
| D003 | Data Format — Real YAML, Not MiniYAML | [Foundation](decisions/09a-foundation.md) |
| D004 | Modding — Lua (Not Python) for Scripting | [Modding](decisions/09c-modding.md) |
| D005 | Modding — WASM for Power Users (Tier 3) | [Modding](decisions/09c-modding.md) |
| D006 | Networking — Pluggable via Trait | [Networking](decisions/09b-networking.md) |
| D007 | Networking — Relay Server as Default | [Networking](decisions/09b-networking.md) |
| D008 | Sub-Tick Timestamps on Orders | [Networking](decisions/09b-networking.md) |
| D009 | Simulation — Fixed-Point Math, No Floats | [Foundation](decisions/09a-foundation.md) |
| D010 | Simulation — Snapshottable State | [Foundation](decisions/09a-foundation.md) |
| D011 | Cross-Engine Play — Community Layer, Not Sim Layer | [Networking](decisions/09b-networking.md) |
| D012 | Security — Validate Orders in Sim | [Networking](decisions/09b-networking.md) |
| D013 | Pathfinding — Trait-Abstracted, Multi-Layer Hybrid | [Gameplay](decisions/09d-gameplay.md) |
| D014 | Templating — Tera in Phase 6a (Nice-to-Have) | [Modding](decisions/09c-modding.md) |
| D015 | Performance — Efficiency-First, Not Thread-First | [Foundation](decisions/09a-foundation.md) |
| D016 | LLM-Generated Missions and Campaigns | [Tools](decisions/09f-tools.md) |
| D017 | Bevy Rendering Pipeline | [Foundation](decisions/09a-foundation.md) |
| D018 | Multi-Game Extensibility (Game Modules) | [Foundation](decisions/09a-foundation.md) |
| D019 | Switchable Balance Presets | [Gameplay](decisions/09d-gameplay.md) |
| D030 | Workshop Resource Registry & Dependency System | [Community](decisions/09e-community.md) |
| D031 | Observability & Telemetry (OTEL) | [Community](decisions/09e-community.md) |
| D032 | Switchable UI Themes | [Modding](decisions/09c-modding.md) |
| D033 | Toggleable QoL & Gameplay Behavior Presets | [Gameplay](decisions/09d-gameplay.md) |
| D034 | SQLite as Embedded Storage | [Community](decisions/09e-community.md) |
| D035 | Creator Recognition & Attribution | [Community](decisions/09e-community.md) |
| D036 | Achievement System | [Community](decisions/09e-community.md) |
| D037 | Community Governance & Platform Stewardship | [Community](decisions/09e-community.md) |
| D038 | Scenario Editor (OFP/Eden-Inspired, SDK) | [Tools](decisions/09f-tools.md) |
| D039 | Engine Scope — General-Purpose Classic RTS | [Foundation](decisions/09a-foundation.md) |
| D040 | Asset Studio | [Tools](decisions/09f-tools.md) |
| D041 | Trait-Abstracted Subsystem Strategy | [Gameplay](decisions/09d-gameplay.md) |
| D042 | Player Behavioral Profiles & Training | [Gameplay](decisions/09d-gameplay.md) |
| D043 | AI Behavior Presets | [Gameplay](decisions/09d-gameplay.md) |
| D044 | LLM-Enhanced AI | [Gameplay](decisions/09d-gameplay.md) |
| D045 | Pathfinding Behavior Presets | [Gameplay](decisions/09d-gameplay.md) |
| D046 | Community Platform — Premium Content | [Community](decisions/09e-community.md) |
| D047 | LLM Configuration Manager | [Tools](decisions/09f-tools.md) |
| D048 | Switchable Render Modes | [Gameplay](decisions/09d-gameplay.md) |
| D049 | Workshop Asset Formats & P2P Distribution | [Community](decisions/09e-community.md) |
| D050 | Workshop as Cross-Project Reusable Library | [Modding](decisions/09c-modding.md) |
| D051 | Engine License — GPL v3 with Modding Exception | [Modding](decisions/09c-modding.md) |
| D052 | Community Servers with Portable Signed Credentials | [Networking](decisions/09b-networking.md) |
| D053 | Player Profile System | [Community](decisions/09e-community.md) |
| D054 | Extended Switchability | [Gameplay](decisions/09d-gameplay.md) |
| D055 | Ranked Tiers, Seasons & Matchmaking Queue | [Networking](decisions/09b-networking.md) |
| D056 | Foreign Replay Import | [Tools](decisions/09f-tools.md) |
| D057 | LLM Skill Library | [Tools](decisions/09f-tools.md) |
| D058 | In-Game Command Console | [Interaction](decisions/09g-interaction.md) |
| D059 | In-Game Communication (Chat, Voice, Pings) | [Interaction](decisions/09g-interaction.md) |
| D060 | Netcode Parameter Philosophy | [Networking](decisions/09b-networking.md) |
| D061 | Player Data Backup & Portability | [Community](decisions/09e-community.md) |
| D062 | Mod Profiles & Virtual Asset Namespace | [Modding](decisions/09c-modding.md) |
| D066 | Cross-Engine Export & Editor Extensibility | [Modding](decisions/09c-modding.md) |
| D067 | Configuration Format Split — TOML vs YAML | [Foundation](decisions/09a-foundation.md) |

---

## Pending Decisions

| ID | Topic | Needs Resolution By |
|---|---|---|
| P002 | Fixed-point scale (256? 1024? match OpenRA's 1024?) | Phase 2 start |
| P003 | Audio library choice + music integration design | Phase 3 start |
| P004 | Lobby/matchmaking wire format details (architecture resolved in D052) | Phase 5 start |
