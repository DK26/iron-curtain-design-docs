## D058 — In-Game Command Console

> **Keywords:** command console, chat, developer console, Brigadier, cvars, command tree, competitive integrity, cheat codes, console commands, mod-registered commands, tournament mode, ranked restrictions

Unified chat+command system with Brigadier-style command tree. `/` prefix routing, developer console overlay, cvars, mod-registered commands, competitive integrity framework, and hidden single-player cheat codes.

| Section | Topic | File |
|---------|-------|------|
| Overview & Architecture | Decision capsule, problem, other games survey, decision intro, unified input, developer console, command tree architecture (Brigadier-style), cvars | [D058-overview-architecture.md](D058/D058-overview-architecture.md) |
| Commands & Catalog | Built-in commands, comprehensive command catalog (~223 lines across 12 subsystems), mod-registered commands, anti-trolling measures, achievement & ranking interaction | [D058-commands-catalog.md](D058/D058-commands-catalog.md) |
| Competitive, Cheats & Integration | Competitive integrity in multiplayer (console=GUI parity, order rate monitoring, input source tracking, ranked restrictions, tournament mode, workshop console scripts), classic cheat codes (hashed Cold War phrases), security/platform considerations, config file on startup, alternatives considered, integration | [D058-competitive-cheats-integration.md](D058/D058-competitive-cheats-integration.md) |
