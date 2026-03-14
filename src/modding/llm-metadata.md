# LLM-Readable Resource Metadata

Every game resource — units, weapons, structures, maps, mods, templates — carries structured metadata designed for consumption by LLMs and AI systems. This is not documentation for humans (that's `display.name` and README files). This is **machine-readable semantic context** that enables AI to reason about game content.

### Why This Matters

Traditional game data is structured for the engine: cost, health, speed, damage. An LLM reading `cost: 100, health: 50, speed: 56, weapon: m1_carbine` can parse the numbers but cannot infer *purpose*. It doesn't know that rifle infantry is a cheap scout, that it's useless against tanks, or that it should be built in groups of 5+.

The `llm:` metadata block bridges this gap. It gives LLMs the strategic and tactical context that experienced players carry in their heads.

### What Consumes It

| Consumer                          | How It Uses `llm:` Metadata                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ic-llm` (mission generation)** | Selects appropriate units for scenarios. "A hard mission" → picks units with `role: siege` and high counters. "A stealth mission" → picks units with `role: scout, infiltrator`. |
| **`ic-ai` (skirmish AI)**         | Reads `counters`/`countered_by` for build decisions. Knows to build anti-air when enemy has `role: air`. Reads `tactical_notes` for positioning hints.                           |
| **Workshop search**               | Semantic search: "a map for beginners" matches `difficulty: beginner-friendly`. "Something for a tank rush" matches `gameplay_tags: ["open_terrain", "abundant_resources"]`.     |
| **Future in-game AI advisor**     | "What should I build?" → reads enemy composition's `countered_by`, suggests units with matching `role`.                                                                          |
| **Mod compatibility analysis**    | Detects when a mod changes a unit's `role` or `counters` in ways that affect balance.                                                                                            |

### Metadata Format (on game resources)

The `llm:` block is optional on every resource type. It follows a consistent schema:

```yaml
# On units / weapons / structures:
llm:
  summary: "One-line natural language description"
  role: [semantic, tags, for, classification]
  strengths: [what, this, excels, at]
  weaknesses: [what, this, is, bad, at]
  tactical_notes: "Free-text tactical guidance for LLM reasoning"
  counters: [unit_types, this, beats]
  countered_by: [unit_types, that, beat, this]

# On maps:
llm:
  summary: "4-player island map with contested center bridge"
  gameplay_tags: [islands, naval, chokepoint, 4player]
  tactical_notes: "Control the center bridge for resource access. Naval early game is critical."

# On weapons:
llm:
  summary: "Long-range anti-structure artillery"
  role: [siege, anti_structure]
  strengths: [long_range, high_structure_damage, area_of_effect]
  weaknesses: [slow_fire_rate, inaccurate_vs_moving, minimum_range]
```

### Metadata Format (on workshop resources)

Workshop resources carry `LlmResourceMeta` in their package manifest:

```yaml
# workshop manifest for a mission template
llm_meta:
  summary: "Defend a bridge against 5 waves of Soviet armor"
  purpose: "Good for practicing defensive tactics with limited resources"
  gameplay_tags: [defense, bridge, waves, armor, intermediate]
  difficulty: "intermediate"
  composition_hints: "Pairs well with the 'reinforcements' scene template for a harder variant"
```

This metadata is indexed by the workshop server for semantic search. When an LLM needs to find "a scene template for an ambush in a forest," it searches `gameplay_tags` and `summary`, not filenames.

### Design Rules

1. **`llm:` is always optional.** Resources work without it. Legacy content and OpenRA imports won't have it initially — it can be added incrementally, by humans or by LLMs.
2. **Human-written is preferred, LLM-generated is acceptable.** When a modder publishes to the workshop without `llm_meta`, the system can offer to auto-generate it from the resource's data (unit stats, map layout, etc.). The modder reviews and approves.
3. **Tags use a controlled vocabulary.** `role`, `strengths`, `weaknesses`, `counters`, and `gameplay_tags` draw from a published tag dictionary (extensible by mods). This prevents tag drift where the same concept has five spellings.
4. **`tactical_notes` is free-text.** This is the field where nuance lives. "Build 5+ to be cost-effective" or "Position behind walls for maximum effectiveness" — advice that can't be captured in tags.
5. **Metadata is part of the YAML spec, not a sidecar.** It lives in the same file as the resource definition. No separate metadata files to lose or desync.
6. **`ai_usage` is required on publish, defaults to `metadata_only`.** Authors must make an explicit choice about AI access. `ic mod publish` prompts for ai_usage on first publish and remembers the choice as a user-level default. Authors can change ai_usage on any existing resource at any time via `ic mod update --ai-usage allow|metadata_only|deny`.

### Author Consent for LLM Usage (ai_usage)

The Workshop's AI consent model is deliberately **separate from the license system**. A resource's SPDX license governs what humans may legally do (redistribute, modify, sell). The `ai_usage` field governs what **automated AI agents** may do — and these are genuinely different questions.

**Why this separation is necessary:**

A composer publishes a Soviet march track under CC-BY-4.0. They're fine with other modders using it in their mods (with credit). But they don't want an LLM to automatically select their track when generating missions — they'd prefer a human to choose it deliberately. Under a license-only model, CC-BY permits both uses identically. The `ai_usage` field lets the author distinguish.

Conversely, a modder publishes cutscene briefings with all rights reserved (no redistribution). But they *do* want LLMs to know these cutscenes exist and recommend them — because more visibility means more downloads. `ai_usage: allow` with a restrictive license means the LLM can auto-add it as a dependency reference (the mission says "requires bob/soviet-briefings@1.0"), but the end user's `ic mod install` still respects the license when downloading.

**The three tiers:**

| `ai_usage` Value          | LLM Can Search | LLM Can Read Metadata | LLM Can Auto-Add as Dependency | Human Approval Required |
| ------------------------- | -------------- | --------------------- | ------------------------------ | ----------------------- |
| `allow`                   | Yes            | Yes                   | Yes                            | No                      |
| `metadata_only` (default) | Yes            | Yes                   | No — LLM recommends only       | Yes — human confirms    |
| `deny`                    | No             | No                    | No                             | N/A — invisible to LLMs |

**YAML manifest example:**

```yaml
# A cutscene pack published with full LLM access
mod:
  id: alice/soviet-briefing-pack
  title: "Soviet Campaign Briefings"
  version: "1.0.0"
  license: "CC-BY-4.0"
  ai_usage: allow                      # LLMs can auto-pull this

  llm_meta:
    summary: "5 live-action Soviet briefing videos with English subtitles"
    purpose: "Campaign briefings for Soviet missions — general briefs troops before battle"
    gameplay_tags: [soviet, briefing, cutscene, campaign, live_action]
    difficulty: null
    composition_hints: "Use before Soviet campaign missions. Pairs with soviet-march-music for atmosphere."
    content_description:
      contents:
        - "briefing_01.webm — General introduces the war (2:30)"
        - "briefing_02.webm — Orders to capture Allied base (1:45)"
        - "briefing_03.webm — Retreat and regroup speech (2:10)"
        - "briefing_04.webm — Final assault planning (3:00)"
        - "briefing_05.webm — Victory celebration (1:20)"
      themes: [military, soviet_propaganda, dramatic, patriotic]
      style: "Retro FMV with live actors, 4:3 aspect ratio, film grain"
      duration: "10:45 total"
      resolution: "640x480"
    related_resources:
      - "alice/soviet-march-music"
      - "community/ra1-soviet-voice-lines"
```

```yaml
# A music track with metadata-only access (default)
mod:
  id: bob/ambient-war-music
  title: "Ambient Battlefield Soundscapes"
  version: "2.0.0"
  license: "CC-BY-NC-4.0"
  ai_usage: metadata_only              # LLMs can recommend but not auto-add

  llm_meta:
    summary: "6 ambient war soundscape loops, 3-5 minutes each"
    purpose: "Background audio for tense defensive scenarios"
    gameplay_tags: [ambient, tension, defense, loop, atmospheric]
    composition_hints: "Works best layered under game audio, not as primary music track"
```

**Workshop UI integration:**
- The Workshop browser shows an "AI Discoverable" badge on resources with `ai_usage: allow`
- Resource settings page includes a clear toggle: "Allow AI agents to use this resource automatically"
- Creator profile shows aggregate AI stats: "42 of your resources are AI-discoverable" with a bulk-edit option
- `ic mod lint` warns if `ai_usage` is set to `allow` but `llm_meta` is empty (the resource is auto-pullable but provides no context for LLMs to evaluate it)

### Workshop Organization for LLM Discovery

Beyond individual resource metadata, the Workshop itself is organized to support LLM navigation and composition:

**Semantic resource relationships:**

Resources can declare relationships to other resources beyond simple dependencies:

```toml
# In mod.toml
[relationships]
variant_of = "community/standard-soviet-sprites"    # this is an HD variant
works_with = [                                       # bidirectional composition hints
    "alice/soviet-march-music",
    "community/snow-terrain-textures",
]
supersedes = "bob/old-soviet-sprites@1.x"           # migration path from older resource
```

These relationships are indexed by the Workshop server and exposed to LLM queries. An LLM searching for "Soviet sprites" finds the standard version and is told "alice/hd-soviet-sprites is an HD variant." An LLM building a winter mission finds snow terrain and is told "works well with alice/soviet-march-music." This is structured composition knowledge that tags alone can't express.

**Category hierarchies for LLM navigation:**

Resource categories (Music, Sprites, Maps, etc.) have sub-categories that LLMs can traverse:

```
Music/
├── Soundtrack/          # full game soundtracks
├── Ambient/             # background loops
├── Faction/             # faction-themed tracks
│   ├── Soviet/
│   ├── Allied/
│   └── Custom/
└── Event/               # victory, defeat, mission start
Cutscenes/
├── Briefing/            # pre-mission briefings
├── InGame/              # triggered during gameplay
└── Cinematic/           # standalone story videos
```

LLMs query hierarchically: "find a Soviet faction music track" → navigate Music → Faction → Soviet, rather than relying solely on tag matching. The hierarchy provides structure; tags provide precision within that structure.

**Curated LLM composition sets (Phase 7+):**

Workshop curators (human or LLM-assisted) can publish **composition sets** — pre-vetted bundles of resources that work together for a specific creative goal:

```yaml
# A composition set (published as a Workshop resource with category: CompositionSet)
mod:
  id: curators/soviet-campaign-starter-kit
  category: CompositionSet
  ai_usage: allow
  llm_meta:
    summary: "Pre-vetted resource bundle for creating Soviet campaign missions"
    purpose: "Starting point for LLM mission generation — all resources are ai_usage:allow and license-compatible"
    gameplay_tags: [soviet, campaign, starter_kit, curated]
    composition_hints: "Use as a base, then search for mission-specific assets"

composition:
  resources:
    - id: "alice/soviet-briefing-pack"
      role: "briefings"
    - id: "alice/soviet-march-music"
      role: "soundtrack"
    - id: "community/ra1-soviet-voice-lines"
      role: "unit_voices"
    - id: "community/snow-terrain-textures"
      role: "terrain"
    - id: "community/standard-soviet-sprites"
      role: "unit_sprites"
  verified_compatible: true            # curator has tested these together
  all_ai_accessible: true              # all resources in set are ai_usage: allow
```

An LLM asked to "generate a Soviet campaign mission" can start by pulling a relevant composition set, then search for additional mission-specific assets. This saves the LLM from evaluating hundreds of individual resources and avoids license/ai_usage conflicts — the curator has already verified compatibility.
