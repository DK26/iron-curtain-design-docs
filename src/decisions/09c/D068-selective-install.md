## D068: Selective Installation & Content Footprints

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 4 (official pack partitioning + prompts), Phase 5 (fingerprint split + CLI workflows), Phase 6a (Installed Content Manager UI), Phase 6b (smart recommendations)
- **Canonical for:** Selective installs, install profiles, optional media packs, and gameplay-vs-presentation compatibility fingerprinting
- **Scope:** package manifests, `VirtualNamespace`/D062 integration, Workshop/base content install UX, Settings → Data content manager, creator validation/publish checks
- **Decision:** IC supports player-facing **install profiles** and **optional content packs** so players can keep only the content they care about (e.g., MP/skirmish only, campaign core without FMV/music) while preserving a complete playable experience for installed features.
- **Why:** Storage constraints, bandwidth constraints, different player priorities, and a no-dead-end UX that installs missing content on demand instead of forcing monolithic installs.
- **Non-goals:** Separate executables per mode, mandatory campaign media, or a monolithic "all content only" install model.
- **Invariants preserved:** D062 logical mod composition stays separate from D068 physical installation selection; D049 CAS remains the storage foundation; missing optional media must never break campaign progression.
- **Defaults / UX behavior:** Features stay clickable; missing content opens install guidance; campaign media is optional with fallback briefing/subtitles/ambient behavior.
- **Compatibility / Export impact:** Lobbies/ranked use a **gameplay fingerprint** as the hard gate; media/remaster/voice packs are **presentation fingerprint** scope unless they change gameplay.
- **AI remaster media policy:** AI-enhanced cutscene packs are optional presentation variants (Original / Clean / AI-Enhanced), clearly labeled, provenance-aware, and never replacements for the canonical originals.
- **Public interfaces / types / commands:** manifest `install` metadata + optional dependencies/fallbacks, `ic content list`, `ic content apply-profile`, `ic content install/remove`, `ic mod gc`
- **Affected docs:** `src/17-PLAYER-FLOW.md`, `src/decisions/09e-community.md`, `src/decisions/09g-interaction.md`, `src/04-MODDING.md`, `src/decisions/09f-tools.md`
- **Revision note summary:** Clarified in March 2026 that media language capability and fallback policy are canonical package/import-index metadata, not merely properties of an individual media container. Explicitly rejects creating a custom low-level AV container for this purpose.
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

### Canonical Ownership Of Media Language Metadata

The language capability matrix above is **canonical package-level metadata**.

That metadata may be populated from multiple sources:

- Workshop manifests / D049 package indexes
- local import indexes
- embedded track metadata discovered during import from formats such as
  Matroska/WebM or Ogg Skeleton

But the canonical authority for IC behavior remains the package/import-index
layer, not the raw container alone.

Why:

- a player may install separate subtitle, dub, or voice packs
- one campaign may expose multiple cutscene variants with different coverage
- translation trust labels and coverage are IC product metadata, not generic
  container concepts
- fallback decisions must remain deterministic even when media is split across
  multiple files/resources

Therefore:

- embedded container metadata is **advisory import input**
- package/import-index metadata is **authoritative runtime policy**
- IC does **not** introduce a custom low-level AV container to solve this;
  composability lives at the package/resource layer instead

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
- **Phase 6b:** Smart recommendations ("You haven't used campaign media in 90 days — free 4.2 GB?"), per-device install profile sync, and finer-grained prefetch policies.
- **Phase 7+ / Future:** Optional official/community cutscene remaster variant packs (including AI-enhanced variants where legally and technically viable) can ship under the same D068 install-profile and presentation-fingerprint rules without changing campaign logic.
