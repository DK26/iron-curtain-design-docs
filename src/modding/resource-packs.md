# Resource Packs (Switchable Asset Layers)

Resource packs are **switchable asset override layers** — the player selects which version of a resource category to use (cutscenes, sprites, music, voice lines, etc.), and the engine swaps to those assets without touching gameplay. Same concept as Minecraft's resource packs or the Remastered Collection's SD/HD toggle, but generalized to any asset type.

This falls naturally out of the architecture. Every asset is referenced by **logical ID** in YAML (e.g., `video: videos/allied-01-briefing.vqa`). A resource pack overrides those references — mapping the same IDs to different files. No code, no mods, no gameplay changes. Pure presentation layer.

### Tera-Templated Resource Packs (Optional, for Complex Packs)

Most community resource packs are plain YAML (see "Most Packs Are Plain YAML" below). But **all first-party IC packs use Tera** — the built-in cutscene, sprite, and music packs are templated with configurable quality, language, and content selection. This dogfoods the system and provides working examples for pack authors who want to go beyond flat mappings.

For packs that need **configurable parameters** — quality tiers, language selection, platform-aware defaults — Tera templates use a `schema.yaml` that defines the available knobs. Defaults are inline in the template; users configure through the in-game settings UI.

**Pack structure:**

```
resource-packs/hd-cutscenes/
  pack.yaml.tera      # Tera template — generates the override map
  schema.yaml          # Parameter definitions with inline defaults
  assets/              # The actual replacement files
    videos/
      allied-01-briefing-720p.mp4
      allied-01-briefing-1080p.mp4
      allied-01-briefing-4k.mp4
      ...
```

**Schema (configurable knobs):**

```yaml
# schema.yaml
parameters:
  quality:
    type: enum
    options: [720p, 1080p, 4k]
    default: 1080p
    description: "Video resolution — higher needs more disk space"

  language:
    type: enum
    options: [en, de, fr, ru, es, ja]
    default: en
    description: "Subtitle/dub language"

  include_victory_sequences:
    type: boolean
    default: true
    description: "Also replace victory/defeat cinematics"

  style:
    type: enum
    options: [upscaled, redrawn, ai_generated]
    default: upscaled
    description: "Visual style of replacement cutscenes"
```

**Tera template (generates the override map from parameters):**

```jinja
{# pack.yaml.tera #}
resource_pack:
  name: "HD Cutscenes ({{ quality }}, {{ language }})"
  description: "{{ style | title }} briefing videos in {{ quality }}"
  category: cutscenes
  version: "2.0.0"

  assets:
    {% for mission in ["allied-01", "allied-02", "allied-03", "soviet-01", "soviet-02", "soviet-03"] %}
    videos/{{ mission }}-briefing.vqa: assets/videos/{{ mission }}-briefing-{{ quality }}.mp4
    {% endfor %}

    {% if include_victory_sequences %}
    {% for seq in ["allied-victory", "allied-defeat", "soviet-victory", "soviet-defeat"] %}
    videos/{{ seq }}.vqa: assets/videos/{{ seq }}-{{ quality }}.mp4
    {% endfor %}
    {% endif %}

    {# Language-specific subtitle tracks #}
    {% if language != "en" %}
    {% for mission in ["allied-01", "allied-02", "allied-03", "soviet-01", "soviet-02", "soviet-03"] %}
    subtitles/{{ mission }}.srt: assets/subtitles/{{ language }}/{{ mission }}.srt
    {% endfor %}
    {% endif %}
```

**User configuration (in-game settings, not CLI overrides):**

Players configure pack parameters through the Settings → Resource Packs UI. When a pack has a `schema.yaml`, the UI renders the appropriate controls (dropdowns for enums, checkboxes for booleans). The engine re-renders the Tera template whenever settings change, producing an updated override map. This is load-time only — zero runtime cost.

For CLI users, `ic resource-pack install hd-cutscenes` installs the pack with its defaults. Parameters are then adjusted in settings.

### Why Tera (Not Just Flat Mappings)

Flat override maps (`asset_a → asset_b`) work for simple cases, but fall apart when packs need to:

| Need                                                     | Flat Mapping                                              | Tera Template                               |
| -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| Quality tiers (720p/1080p/4k)                            | 3 separate packs with 90% duplicated YAML                 | One pack, `quality` parameter               |
| Language variants                                        | One pack per language × quality = combinatorial explosion | `{% if language != "en" %}` conditional     |
| Faction-specific overrides                               | Manual enumeration of every faction's assets              | `{% for faction in factions %}` loop        |
| Optional components (victory sequences, tutorial videos) | Separate packs or monolithic everything-pack              | Boolean parameters with `{% if %}`          |
| Platform-aware (mobile gets 720p, desktop gets 1080p)    | Separate mobile/desktop packs                             | `quality` defaults per `ScreenClass`        |
| Mod-aware (pack adapts to which game module is active)   | One pack per game module                                  | `{% if game_module == "ra2" %}` conditional |

This is the same reason Helm uses Go templates instead of static YAML — real-world configuration has conditionals, loops, and user-specific values. Our approach is inspired by Helm's parameterized templating, but the configuration surface is the in-game settings UI, not a CLI + values file workflow.

### Most Packs Are Plain YAML (No Templating)

The **default and recommended** way to create a resource pack is plain YAML — just list the files you're replacing. No template syntax, no schema, no values file. This is what `ic mod init resource-pack` generates:

```yaml
# resource-packs/retro-sounds/pack.yaml — plain YAML, no Tera
resource_pack:
  name: "Retro 8-bit Sound Effects"
  category: sound_effects
  version: "1.0.0"
  assets:
    sounds/explosion_large.wav: assets/explosion_large_8bit.wav
    sounds/rifle_fire.wav: assets/rifle_fire_8bit.wav
    sounds/tank_move.wav: assets/tank_move_8bit.wav
```

This covers the majority of resource packs. Someone replacing cutscenes, swapping in HD sprites, or providing an alternative soundtrack just lists the overrides — done.

**Tera templates are opt-in for complex packs** that need parameters (quality tiers, language selection, conditional content). Rename `pack.yaml` to `pack.yaml.tera`, add a `schema.yaml`, and the engine renders the template at install time. But this is a power-user feature — most content creators never need it.

The engine detects `.tera` extension → renders template; plain `.yaml` → loads directly.

### Resource Pack Categories

Players can mix and match one pack per category:

| Category      | What It Overrides                                                | Example Packs                                                         |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cutscenes     | Briefing videos, victory/defeat sequences, in-mission cinematics | Original `.vqa`, AI-upscaled HD, community remakes, humorous parodies |
| Sprites       | Unit art, building art, effects, projectiles                     | Classic `.shp`, HD sprite pack, hand-drawn style                      |
| Music         | Soundtrack, menu music, faction themes                           | Original, Frank Klepacki remastered, community compositions           |
| Voice Lines   | EVA announcements, unit responses                                | Original, alternative EVA voices, localized voice packs               |
| Sound Effects | Weapon sounds, explosions, ambient                               | Original, enhanced audio, retro 8-bit                                 |
| Terrain       | Theater tilesets, terrain textures                               | Classic, HD, seasonal (winter/desert variants)                        |

### Settings UI

```
Settings → Resource Packs
┌───────────────────────────────────────────────┐
│ Cutscenes:     [HD Upscaled ▾]     [⚙ Configure]
│                 Quality: [1080p ▾]            │
│                 Language: [English ▾]         │
│                 Victory sequences: [✓]        │
│                                               │
│ Music:         [Remastered ▾]                 │
│ Voice Lines:   [Original ▾]                   │
│ Sprites:       [HD Pack ▾]          [⚙ Configure]
│ Sound Effects: [Original ▾]                   │
│ Terrain:       [HD Pack ▾]                    │
└───────────────────────────────────────────────┘
```

The ⚙ Configure button appears when a pack has a `schema.yaml` with user-configurable parameters. Simple packs (no schema) just show the dropdown.

### Relationship to Existing Decisions

Resource packs generalize a pattern that already appears in several places:

| Decision        | What It Switches                              | Resource Pack Equivalent                                                                                   |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| D019            | Balance rule sets (Classic/OpenRA/Remastered) | Balance presets already work this way                                                                      |
| D029            | Classic/HD sprite rendering (dual asset)      | Sprite resource packs supersede this; D029's `classic:`/`hd:` YAML keys become the first two sprite packs  |
| D032            | UI chrome, menus, lobby (themes)              | UI themes are resource packs for the chrome category                                                       |
| Tera templating | Mission/scene templates                       | Resource packs use the same `template.tera` + `schema.yaml` pattern — one templating system for everything |

The underlying mechanism is the same: **YAML-level asset indirection with Tera rendering**. The `template.tera` + `schema.yaml` pattern appears in three places:

```
Mission Templates  → template.yaml.tera + schema.yaml = playable mission
Scene Templates    → triggers.lua.tera  + schema.yaml = scripted encounter
Resource Packs     → pack.yaml.tera     + schema.yaml = asset override layer
```

One templating engine (Tera), one pattern, three use cases. Defaults live inline in the schema. User preferences come from settings UI (resource packs) or from the LLM/user filling in parameters (mission templates). No separate values file needed in the common case.

### Workshop Distribution (D030)

Resource packs are publishable to the workshop like any other resource:
- `ic mod init resource-pack` → scaffolds a pack with asset manifest
- `ic mod publish` → uploads to workshop
- Players subscribe in-game or via CLI
- Packs from multiple authors can coexist — one per category, player's choice
- Dependencies work: a mission pack can require a specific cutscene pack (`depends: alice/hd-cutscenes@^1.0`)

### Cutscenes Specifically

Since cutscenes are what prompted this — the system is particularly powerful here:

1. **Original `.vqa` files** — ship with the game (from original RA install). Low-res but authentic.
2. **AI-upscaled HD** — community or first-party pack running the originals through video upscaling. Same content, better resolution.
3. **Community remakes** — fans re-creating briefings with modern tools, voice acting, or different artistic styles.
4. **AI-generated replacements** — using video generation AI to create entirely new briefing sequences. Same narrative beats (referenced from campaign YAML), different visuals.
5. **Humorous/parody versions** — because the community will absolutely do this, and we should make it easy.
6. **Localized versions** — same briefings with translated subtitles or dubbed audio.

The campaign system (D021) references cutscenes by logical ID in the `video:` field. Changing which pack is active changes which video plays — no campaign YAML edits needed.
