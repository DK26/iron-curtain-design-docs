## IC SDK (Separate Application)

The SDK is a separate Bevy application from the game (`ic-editor` crate). It shares library crates but has its own binary and launch point.

### SDK Start Screen

```
┌──────────────────────────────────────────────────────────┐
│  IRON CURTAIN SDK                                        │
│                                                          │
│  ► New Scenario                                          │
│  ► New Campaign                                          │
│  ► Open File...                                          │
│  ► Asset Studio                                          │
│  ► Validate Project...                                   │
│  ► Upgrade Project...                                    │
│                                                          │
│  Recent:                                                 │
│  · coastal-fortress.icscn  (yesterday)                   │
│  · allied-campaign.iccampaign  (3 days ago)              │
│  · my-mod/rules.yaml  (1 week ago)                       │
│                                                          │
│  Git: main • clean                                        │
│                                                          │
│  ► Preferences                                           │
│  ► Documentation                                         │
│                                                          │
│  New to the SDK?  [Start Guided Tour]                    │
└──────────────────────────────────────────────────────────┘
```

**SDK Documentation** (`D037`/`D038`, authoring manual):
- Opens a searchable **Authoring Reference Browser** (offline snapshot bundled with the SDK)
- Covers editor parameters/flags, triggers/modules, YAML schema fields, Lua/WASM APIs, and `ic` CLI commands
- Supports search by IC term and familiar aliases (e.g., OFP/AoE2/WC3 terminology)
- Can open online docs when available, but the embedded snapshot is the baseline

### Scenario Editor

```
SDK → New Scenario / Open File
```

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Scenario Editor] [Asset Studio] [Campaign Editor]              [? Tour] │
│ [Preview] [Test ▼] [Validate] [Publish]   Git: main • 4 changed           │
│                               validation: Stale • Simple Mode             │
├──────────┬───────────────────────────────┬───────────────────────────────┤
│ MODE     │   ISOMETRIC VIEWPORT          │  PROPERTIES                   │
│ PANEL    │   (ic-render, same as         │  PANEL                        │
│          │    game rendering)            │  (egui)                       │
│ Terrain  │                               │                               │
│ Entities │                               │  • Selected entity            │
│ Triggers │                               │  • Properties list            │
│ Waypoints│                               │  • Transform                  │
│ Modules  ├───────────────────────────────┤  • Components                 │
│ Regions  │  BOTTOM PANEL                 │                               │
│ Scripts  │  (triggers/scripts/vars/      │                               │
│ Layers   │   validation results)         │                               │
│          ├───────────────────────────────┴───────────────────────────────┤
│          │ STATUS: cursor (1024, 2048) | Cell (4, 8) | 127 entities      │
└──────────┴───────────────────────────────────────────────────────────────┘
```

**Key features:**
- 12 editing modes: Terrain, Entities, Groups, Triggers, Waypoints, Connections, Modules, Regions, Layers, Portals, Scripts, Campaign
- Simple/Advanced toggle (hides ~15 features without data loss)
- Entity palette: search-as-you-type, 48×48 thumbnails, favorites, recently placed
- Trigger editor: visual condition/action builder with countdown timers
- Trigger-driven camera scenes (OFP-style): property-driven trigger conditions + camera shot presets bound to rendered cutscenes (`Cinematic Sequence`) without Lua for common reveals/dialogue pans (advanced camera shot graph/spline tooling phases into `M10`)
- Module system: 30+ drag-and-drop modules (Wave Spawner, Patrol Route, Reinforcements, etc.)
- `F1` / `?` context help opens the exact authoring-manual page for the selected field/module/trigger/action, with examples and constraints
- Toolbar flow: `Preview` / `Test` / `Validate` / `Publish` (Validate is optional before preview/test)
- `Test` launches the real game runtime path (not an editor-only runtime) using a local dev overlay profile when run from the SDK
- `Test` dropdown includes `Play in Game (Local Overlay)` / `Run Local Content` (canonical local-iteration path) and `Profile Playtest` (Advanced mode only)
- `Validate`: Quick Validate preset (async, cancelable, no full auto-validate on save)
- Publish Readiness screen: aggregated validation/export/license/metadata warnings before Workshop upload
- Git-aware project chrome (read-only): branch, dirty/clean, changed file count, conflict badge
- Undo/Redo: command pattern, autosave
- Export-safe authoring mode (D066): live fidelity indicators, feature gating for cross-engine compatibility
- Migration Workbench entry point: "Upgrade Project" (preview in 6a, apply+rollback in 6b)
- Interactive guided tours (D038) for each tool — step-by-step walkthroughs with spotlight overlay, action validation, and resumable progress. 10 tours ship with the SDK; modders can add more via Workshop
- Visual waypoint authoring (D038 Waypoints Mode) — click to place named waypoint sequences on the map with route display, waypoint types (Move, Attack, Guard, Patrol, Harvest, Script, Wait), and OFP-style synchronization lines for multi-group coordination
- Named mission outcomes (D038) — wire scenario triggers to campaign branch outcomes (`Mission.Complete("outcome_name")`)
- Export to OpenRA and original RA formats (D066) — export-safe authoring mode with live fidelity indicators, trigger downcompilation, and extensible export targets

**Example: Publish Readiness (AI Cutscene Variant Pack)**

When a creator publishes a campaign or media pack that includes AI-assisted cutscene remasters, Publish Readiness surfaces provenance/labeling checks alongside normal validation results:

```
┌──────────────────────────────────────────────────────────┐
│  PUBLISH READINESS — official/ra1-cutscenes-ai-enhanced │
│  Channel: Release                                       │
├──────────────────────────────────────────────────────────┤
│ Errors (2)                                              │
│  • Missing provenance metadata for 3 video assets       │
│    (source media reference + rights declaration).       │
│    [Open Assets] [Apply Batch Metadata]                 │
│  • Variant labeling missing: pack not marked            │
│    "AI Enhanced" / "Experimental" in manifest metadata. │
│    [Open Manifest]                                      │
├──────────────────────────────────────────────────────────┤
│ Warnings (1)                                            │
│  • Subtitle timing drift > 120 ms in A01_BRIEFING_02.   │
│    [Open Video Preview] [Auto-Align Subtitles]          │
├──────────────────────────────────────────────────────────┤
│ Advice (1)                                              │
│  • Preview radar_comm mode before publish; face crop may│
│    clip at 4:3-safe area. [Preview Radar Comm]          │
├──────────────────────────────────────────────────────────┤
│ [Run Validate Again]                      [Publish Disabled] │
└──────────────────────────────────────────────────────────┘
```

**Channel-sensitive behavior (aligned with D040/D068):**
- `beta/private` Workshop channels may allow publish with warnings and explicit confirmation
- `release` channel can block publish on missing AI media provenance/rights metadata or required variant labeling
- Campaign packages referencing missing optional AI remaster packs still publish if fallback briefing/intermission presentation is valid

### Asset Studio

```
SDK → Asset Studio
```

```
┌──────────────────┬─────────────────────┬───────────────────┐
│ ASSET BROWSER    │  PREVIEW VIEWPORT   │ PROPERTIES        │
│ (tree: .mix      │  (sprite viewer,    │ (frames, size,    │
│  archives +      │   animation scrub,  │  draw mode,       │
│  local files)    │   zoom, palette)    │  palette, player  │
│                  │                     │  color remap)     │
│ 🔎 Search...     │  ◄ ▶ ⏸ ⏮ ⏭ Frame  │                   │
│                  │  3/24               │                   │
├──────────────────┴─────────────────────┼───────────────────┤
│ [Import] [Export] [Batch] [Compare]    │ [Preview as       │
│                                        │  unit on map]     │
└────────────────────────────────────────┴───────────────────┘
```

XCC Mixer replacement with visual editing. Supports SHP, PAL, AUD, VQA, MIX, TMP. Bidirectional conversion (SHP↔PNG, AUD↔WAV). Chrome/theme designer with 9-slice editor and live menu preview. Advanced mode includes asset provenance/rights metadata panels surfaced primarily through Publish Readiness.

### Campaign Editor

```
SDK → New Campaign / Open Campaign
```

Node-and-edge graph editor in a 2D Bevy viewport (separate from isometric). Pan/zoom like a mind map. Nodes = missions (link to scenario files). Edges = outcomes (labeled with named outcome conditions). Weighted random paths configurable. Advanced mode adds validation presets, localization/subtitle workbench, optional hero progression/skill-tree authoring (D021 hero toolkit campaigns), and migration/export readiness checks.

**Advanced panel example: Hero Sheet / Skill Choice authoring (optional D021 hero toolkit)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CAMPAIGN EDITOR — HERO PROGRESSION (Advanced)                 [Validate]   │
├───────────────────────┬───────────────────────────────────────┬─────────────┤
│ HERO ROSTER           │ SKILL TREE: Tanya - Black Ops         │ PROPERTIES  │
│                       │                                       │             │
│ > Tanya      Lv 3     │     [Commando]   [Stealth] [Demo]     │ Skill:      │
│   Volkov     Lv 1     │                                       │ Chain        │
│   Stavros    Lv 2     │   o Dual Pistols Drill (owned)        │ Detonation   │
│                       │    \\                                 │             │
│ Hero state preset:    │     o Raid Momentum (owned)           │ Cost: 2 pts  │
│ [Mission 5 Start ▾]   │      \\                               │ Requires:    │
│ [Simulate...]         │       o Chain Detonation (locked)     │ - Satchel Mk2│
│                       │                                       │ - Raid Mom.  │
│ Unspent points: 1     │   o Silent Step (owned)               │             │
│ Injury state: None    │    \\                                 │ Effects:     │
│                       │     o Infiltrator Clearance (locked)  │ + chain exp. │
├───────────────────────┼───────────────────────────────────────┼─────────────┤
│ INTERMISSION PREVIEW  │ REWARD / CHOICE AUTHORING                           │
│ [Hero Sheet] [Skill Choice] [Armory]                                        │
│ Tanya portrait · Level 3 · XP 420/600 · Skills: 3 owned                     │
│ Choice Set "Field Upgrade": [Silent Step] [Satchel Charge Mk II]            │
│ [Preview as Player] [Set branch conditions...] [Export fidelity hints]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Authoring interactions (hero toolkit campaigns):**
- Select a hero to edit level/xp defaults, death/injury policy, and loadout slots
- Build skill trees (requirements, costs, effects) and bind them to named characters
- Author character presentation overrides/variants (portrait/icon/voice/skin/marker) with preview so unique heroes/operatives are readable in mission and UI
- Configure debrief/intermission reward choices that grant XP, items, or skill unlocks
- Preview Hero Sheet / Skill Choice intermission panels without launching a mission
- Simulate hero state for branch validation and scenario test starts ("Tanya Lv3 + Silent Step")

---

