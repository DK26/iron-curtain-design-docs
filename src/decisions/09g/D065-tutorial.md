## D065 — Tutorial & New Player Experience

> **Keywords:** tutorial, new player, Commander School, contextual hints, adaptive pacing, skill assessment, hints.yaml, feature tips, binding profiles, controls walkthrough, post-game learning, annotated replay, multiplayer onboarding, modder tutorial API

Five-layer tutorial system: Commander School campaign, contextual hints (YAML-driven), new player pipeline, adaptive pacing engine, and post-game learning. Experience-profile-aware. All content YAML+Lua moddable.

| Section | Topic | File |
|---------|-------|------|
| Overview & Commander School | Decision capsule, problem, decision (dopamine-first philosophy), Layer 1 — Commander School (mission structure, IC-specific features, tutorial AI tier, experience-profile awareness, campaign YAML, tutorial mission Lua script pattern) | [D065-overview-commander-school.md](D065/D065-overview-commander-school.md) |
| Hints Schema | Layer 2 intro, hint pipeline, hint definition schema (hints.yaml) — core YAML schema for contextual hints with trigger conditions, suppression rules, platform variants, and localization | [D065-hints-schema.md](D065/D065-hints-schema.md) |
| Hints, Tips & Triggers | Feature smart tips (hints/feature-tips.yaml — comprehensive tips catalog for all game features), trigger types (extensible), hint history (SQLite), QoL integration (D033) | [D065-hints-tips-triggers.md](D065/D065-hints-tips-triggers.md) |
| New Player Pipeline & Pacing | Layer 3 — New Player Pipeline (self-identification gate, controls walkthrough, canonical input actions, binding profiles, binding matrix, Workshop profiles, co-op role onboarding, skill assessment), Layer 4 — Adaptive Pacing Engine | [D065-new-player-pacing.md](D065/D065-new-player-pacing.md) |
| Post-Game, API & Integration | Layer 5 — Post-Game Learning (rule-based tips, annotated replay mode, progressive feature discovery), Tutorial Lua Global API, tutorial achievements, multiplayer onboarding, modder tutorial API, campaign pedagogical pacing guidelines, cross-references | [D065-postgame-api-integration.md](D065/D065-postgame-api-integration.md) |
