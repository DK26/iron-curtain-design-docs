## D038 — Scenario Editor (OFP/Eden-Inspired, SDK)

> **Keywords:** scenario editor, SDK, validate playtest publish, map segment unlock, sub-scenario portal, export-safe authoring, publish readiness, guided tour, SDK tutorial, editor onboarding, waypoints, mission outcome, export, campaign editor, game master, replay-to-scenario, co-op, multiplayer scenario, game mode templates, accessibility, controller, Steam Deck

Visual scenario editor — full mission authoring tool inside the IC SDK. Combines terrain editing with scenario logic editing (triggers, waypoints, modules). Two complexity tiers: Simple mode (accessible) and Advanced mode (full power). Resolves P005.

| Section | Topic | File |
|---------|-------|------|
| Core & Architecture | Decision capsule, architecture, editing modes, entity palette/attributes, named regions, inline scripting, script/variables panels, scenario complexity, trigger organization, undo/redo, autosave, Git-first collaboration | [D038-core-architecture.md](D038/D038-core-architecture.md) |
| Triggers & Waypoints | Trigger system, mission outcome wiring, module system, waypoints mode (visual route authoring, sync lines), compositions, layers, mission phase transitions/map segments/sub-scenarios | [D038-triggers-waypoints.md](D038/D038-triggers-waypoints.md) |
| Media & Validation | Media & cinematics (video, cinematic sequences, dynamic music, ambient sound, EVA, letterbox, localization, Lua media API), validate & playtest, validation presets/UX, publish readiness, profile playtest, UI preview harness, simple vs advanced mode | [D038-media-validation.md](D038/D038-media-validation.md) |
| Campaign Editor | Visual campaign graph, randomized/conditional paths, classic globe select, persistent state dashboard, intermission screens, dialogue editor, named characters, campaign inventory, hero campaign toolkit, campaign testing | [D038-campaign-editor.md](D038/D038-campaign-editor.md) |
| Game Master, Replay & Multiplayer | Game master mode (Zeus-inspired), publishing, replay-to-scenario pipeline, reference material, multiplayer & co-op scenario tools, game mode templates | [D038-game-master-replay-multiplayer.md](D038/D038-game-master-replay-multiplayer.md) |
| Onboarding, Platform & Export | Workshop editor plugins, editor onboarding for veterans, SDK live tutorial (interactive guided tours), embedded authoring manual, local content overlay, migration workbench, controller/Steam Deck, accessibility, export pipeline integration (D066), alternatives considered, phase | [D038-onboarding-platform-export.md](D038/D038-onboarding-platform-export.md) |
