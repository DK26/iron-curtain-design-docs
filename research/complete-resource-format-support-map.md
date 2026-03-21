# Complete Resource Format Support Map

**Status:** Research / scope map  
**Purpose:** If the bar is "load and use the original resource files of Dune II, Tiberian Dawn, Red Alert 1, Red Alert 2 / Yuri's Revenge, the Remastered Collection, and Generals / Zero Hour", this document lists the required format families, where current proof already exists, and where the current `cnc-formats` / `ic-cnc-content` split is still too narrow.

This is not a decision update by itself. Current canonical scope still lives in [05-FORMATS](../src/05-FORMATS.md), [D075](../src/decisions/09c/D075-remastered-format-compat.md), and [D076](../src/decisions/09a/D076-standalone-crates.md). This document maps the larger completeness bar and the gaps between that bar and the currently documented crate scope.

## Boundary: What Counts As "Resource Support"

For this map, a format family counts as **required** if at least one of these is true:

1. The original game cannot be loaded faithfully without it.
2. The engine needs it to load original campaigns, maps, UI, strings, audio, video, or art directly.
3. The CLI proof surface should eventually be able to identify / inspect / extract / validate it as original game content.

This excludes:

- installers, redistributables, DirectX payloads, browser helpers, copy-protection stubs
- generic OS files (`.dll`, `.vxd`, `.drv`, etc.) that are not game asset formats
- modern interchange formats used only by community tooling unless the retail game also ships them

## Executive Summary

- **`cnc-formats` proof surface has expanded significantly.** The v0.1.0-alpha.2 release added parsers for classic Westwood gaps (`.cps`, `.eng`), the TS/RA2 family (`.shp_ts`, `.vxl`, `.hva`, `.csf`), and Generals/SAGE formats (`.big`, `.w3d`). The classic Westwood 2D family is now near-complete. RA2 voxel and string-table support is proven. Generals archive and 3D model parsing is proven. Content-based format sniffing identifies all implemented formats.
- **Remaining gaps are narrower than previously assessed.** Classic family: mission `.bin`/`.mpr` still missing. RA2: `bag/idx` audio archives, `.map` format, `tmp(ts)` still missing. Generals: `.wnd`, `.str`, `.map`, texture families, `.apt` bundle still missing. Dune II: most families still missing (`.pak`, `.icn`, `.voc`, scenario format).
- **RA2 and Generals still require additional families beyond what's proven.** RA2 needs audio-bag and map support. Generals / ZH still needs UI, string, map, and texture families. But the hardest parsers (voxels, 3D mesh, archives) are done.
- **The CLI can still be the proof surface even if implementation splits by crate.** The completeness bar does not force one monolithic parser crate; it forces complete loader coverage.
- **Dune II audio/music needs source reconciliation.** Current docs say `.adl`; OpenDUNE source clearly references `.VOC`, driver-specific music extensions, and `.XMI` fallback. That row needs a deliberate correction, not assumption.

## Local Retail Evidence In The Workspace

The current local sample tree already proves some missing original families:

- Red Alert retail samples include `.CPS`, `.ENG`, `.VQP`, `.VQA`, `.WSA`, `.AUD`, `.FNT`, `.PAL`, `.MIX`, and many `.BIN` fallbacks under `/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/...`.
- Concrete examples:
  - [ALIPAPER.CPS](/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/LOCAL_OUTPUT/ALIPAPER.CPS)
  - [CONQUER.ENG](/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/LOCAL_OUTPUT/CONQUER.ENG)
  - [AAGUN.VQP](/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/NCHIRES_OUTPUT/AAGUN.VQP)
- A sample extension scan of that tree shows heavy presence of `.AUD`, `.SHP`, `.VQP`, `.WSA`, `.CPS`, `.VQA`, `.BIN`, `.FNT`, `.PAL`, and `.ENG`.

That means "complete support" must include more than the currently implemented sniffer and format enum.

## Coverage Map

### 1. Dune II

| Family                 | Content                                  | Need Mode   | Current Proof                                                                                                        | Current IC State                                                  | Recommended Owner                                                                  |
| ---------------------- | ---------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `.PAK`                 | archive container                        | Direct load | OpenDUNE ships `buildpak` / `extractpak` tooling                                                                     | Not documented in current `cnc-formats` scope                     | Separate `dune-formats` crate or a widened `cnc-formats` if Dune II stays in scope |
| `.ICN` + `ICON.MAP`    | tile / icon graphics and tile grouping   | Direct load | OpenDUNE `Tiles_LoadICNFile("ICON.ICN")` and `File_ReadWholeFileLE16("ICON.MAP")`                                    | Missing                                                           | Same as above                                                                      |
| `.CPS`                 | fullscreen still images / splash screens | Direct load | OpenDUNE `extractcps.py` and sprite loading code                                                                     | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — shared with TD/RA1 CPS parser | `cnc-formats` (Dune II `.CPS` is same format as TD/RA1)                            |
| `.WSA`                 | animations                               | Direct load | OpenDUNE `src/wsa.c`                                                                                                 | Already supported in `cnc-formats`                                | `cnc-formats`                                                                      |
| Dune II `.SHP` variant | sprites / shape data                     | Direct load | OpenDUNE `sprites.c` references `SHAPES.SHP` and special-case handling                                               | Current `cnc-formats` `shp` should not be assumed compatible      | Separate parser module                                                             |
| scenario / map format  | mission and world data                   | Direct load | OpenDUNE `src/map.c`                                                                                                 | Missing                                                           | Separate parser module                                                             |
| `.VOC`                 | speech / SFX                             | Direct load | OpenDUNE `src/table/sound.c` lists many `.VOC` assets                                                                | Missing                                                           | Separate audio module                                                              |
| music driver files     | soundtrack                               | Direct load | OpenDUNE `driver.c` uses driver extension with `.XMI` fallback; `README.txt` mentions `.XMI`, MIDI, MT32, FluidSynth | Current `05-FORMATS` says `.adl`; this is not source-clean enough | Source reconciliation required before canonicalizing                               |

**Implication:** Dune II completeness is not "turn on `adl` and call it done". The required bar includes PAK, ICN, CPS, WSA, VOC, Dune-specific SHP, and scenario data. The music row needs a deliberate source-backed correction.

### 2. Tiberian Dawn / Red Alert 1 (classic Westwood 2D family)

| Family         | Content                               | Need Mode                                   | Current Proof                                                          | Current IC State                                                           | Recommended Owner                      |
| -------------- | ------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| `.MIX`         | archives                              | Direct load                                 | OpenRA `mods/cnc/mod.yaml`, `mods/ra/mod.yaml`, local retail samples   | Implemented                                                                | `cnc-formats`                          |
| `.SHP`         | sprites                               | Direct load                                 | OpenRA `SpriteFormats`, local retail samples                           | Implemented for classic family                                             | `cnc-formats`                          |
| `.TMP`         | terrain tiles                         | Direct load                                 | OpenRA `SpriteFormats`, local docs                                     | Implemented                                                                | `cnc-formats`                          |
| `.PAL`         | palettes                              | Direct load                                 | local retail samples                                                   | Implemented                                                                | `cnc-formats`                          |
| `.AUD`         | SFX, speech, music                    | Direct load                                 | OpenRA `SoundFormats`, local retail samples                            | Implemented                                                                | `cnc-formats`                          |
| `.VQA`         | video                                 | Direct load                                 | OpenRA `VideoFormats`, local retail samples                            | Implemented                                                                | `cnc-formats`                          |
| `.VQP`         | VQA interpolation sidecar             | Direct load for authentic high-res playback | local retail samples, existing [05-FORMATS](../src/05-FORMATS.md) spec | Documented, but current `cnc-formats` CLI proof surface does not expose it | `cnc-formats`                          |
| `.WSA`         | menu / campaign animations            | Direct load                                 | OpenRA `VideoFormats`, local retail samples                            | Implemented                                                                | `cnc-formats`                          |
| `.FNT`         | bitmap fonts                          | Direct load                                 | local retail samples                                                   | Implemented                                                                | `cnc-formats`                          |
| `.INI`         | rules / missions / config             | Direct load                                 | OpenRA mods, existing docs                                             | Implemented                                                                | `cnc-formats`                          |
| `.CPS`         | fullscreen stills / UI art            | Direct load                                 | local retail samples                                                   | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — LCW/raw + optional embedded palette | `cnc-formats`                          |
| `.ENG`         | string tables / language data         | Direct load                                 | local retail samples                                                   | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — `.eng`/`.ger`/`.fre` variants       | `cnc-formats`                          |
| mission `.BIN` | original terrain / mission binary     | Direct load for original-map completeness   | existing IC docs already reference RA export as `.bin` terrain         | Missing                                                                    | `ic-cnc-content` or game-module loader |
| `.MPR`         | original map / mission package family | Direct load for original-map completeness   | existing IC docs already reference RA export as `.mpr`                 | Missing                                                                    | `ic-cnc-content` or game-module loader |

**Implication:** the classic Westwood family is now near-complete. `.CPS` and `.ENG` have been implemented (v0.1.0-alpha.2). `.VQP` is implemented. Remaining gaps: mission `.BIN` / `.MPR` are still outside the current proof surface.

### 3. Red Alert 2 / Yuri's Revenge

| Family          | Content                           | Need Mode                                 | Current Proof                                                                                                                                   | Current IC State                                             | Recommended Owner           |
| --------------- | --------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| `.MIX`          | archives                          | Direct load                               | existing Westwood family, OpenRA RA2 study                                                                                                      | Core archive support exists                                  | `cnc-formats`               |
| `SHP(TS)`       | sprites                           | Direct load                               | OpenRA RA2 / TS `SpriteFormats: ShpTS`                                                                                                          | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — separate `ShpTsFile` parser with scanline RLE (types 1–3) | `cnc-formats`               |
| `TMP(TS)`       | terrain tiles                     | Direct load                               | OpenRA RA2 / TS `SpriteFormats: TmpTS`                                                                                                          | Current docs do not distinguish TS-family TMP explicitly     | RA2/TS-capable parser layer |
| `.PAL`          | palettes / lighting support       | Direct load                               | inherited Westwood palette family                                                                                                               | Partially covered, but RA2 normals / lighting use is broader | RA2 module                  |
| `.AUD` / `.WAV` | audio                             | Direct load                               | OpenRA RA2 study `SoundFormats: Aud, Wav`                                                                                                       | AUD covered; original RA2 packaging is not                   | RA2 module                  |
| `.VQA`          | video                             | Direct load                               | OpenRA RA2 study `VideoFormats: Vqa`                                                                                                            | Covered                                                      | `cnc-formats`               |
| `.VXL` + `.HVA` | voxel units + animation hierarchy | Direct load                               | existing [openra-ra2-mod-architecture](openra-ra2-mod-architecture.md) documents VXL/HVA usage heavily                                          | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — VXL multi-limb parser + HVA 3×4 transform matrices | `cnc-formats`               |
| `BAG/IDX`       | audio archive package             | Direct load                               | existing [openra-ra2-mod-architecture](openra-ra2-mod-architecture.md) documents `AudioBag` / `BagFile.cs`                                      | Missing                                                      | RA2-specific parser layer   |
| `.MAP`          | original RA2 map format           | Direct load for original-map completeness | existing [openra-ra2-mod-architecture](openra-ra2-mod-architecture.md) notes `.map` import utility                                              | Missing                                                      | RA2-specific parser layer   |
| `.CSF`          | string tables                     | Direct load                               | existing IC docs and broader SAGE/OpenSAGE translation support prove family relevance; not re-verified against raw retail RA2 tree in this pass | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — UTF-16LE with XOR-encoded labels, optional extra field | `cnc-formats`               |

**Implication:** RA2 has seen significant progress. SHP(TS), VXL+HVA, and CSF are now implemented in `cnc-formats`. Remaining RA2 gaps: `TMP(TS)` terrain variant, `BAG/IDX` audio archives, and `.MAP` map format. The hardest parsers (voxel pipeline, TS sprite compression) are done.

### 4. Remastered Collection

| Family         | Content                   | Need Mode                             | Current Proof                                                 | Current IC State                                    | Recommended Owner                    |
| -------------- | ------------------------- | ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| `.MEG`         | archive container         | Direct load / extract                 | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Implemented / planned in `cnc-formats` behind `meg` | `cnc-formats`                        |
| `.PGM`         | map package archive       | Direct load / extract                 | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Implemented / planned with MEG                      | `cnc-formats`                        |
| `.TGA + .META` | HD sprite megasheets      | Direct import, optionally direct load | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Planned in `ic-cnc-content`                         | `ic-cnc-content`                     |
| `.DDS`         | GPU textures              | Direct import, optionally direct load | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Planned in `ic-cnc-content`                         | `ic-cnc-content`                     |
| `.WAV`         | HD/remixed audio          | Direct load                           | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Straightforward runtime support                     | engine audio / `ic-cnc-content` glue |
| `.BK2`         | Bink2 video               | Import-only is acceptable             | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Planned as import-time WebM conversion              | `ic-cnc-content` / Asset Studio      |
| `.XML`         | mappings / asset metadata | Parse as needed                       | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Planned                                             | `ic-cnc-content`                     |
| `.DAT / .LOC`  | localization data         | Parse or import                       | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Low-priority planned                                | `ic-cnc-content`                     |
| `.MTD`         | MegaTexture / UI data     | Parse or import                       | [D075](../src/decisions/09c/D075-remastered-format-compat.md) | Low-priority planned                                | `ic-cnc-content`                     |

**Implication:** Remastered already has a coherent split in the docs. The completeness gap here is mostly execution, not scope definition.

### 5. Generals / Zero Hour

| Family                             | Content                                  | Need Mode                                              | Current Proof                                                                                                             | Current IC State | Recommended Owner                                  |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------- |
| `.BIG`                             | archive container                        | Direct load                                            | OpenSAGE `GeneralsDefinition` / `GeneralsZeroHourDefinition` probe for `INI.big` / `INIZH.big`; OpenSAGE has `BigArchive` | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — streaming API | `cnc-formats` (not separate crate — absorbed into main parser) |
| `.W3D`                             | models / animations / renderable objects | Direct load                                            | OpenSAGE README and `W3dFile` parser                                                                                      | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — recursive IFF chunk parser | `cnc-formats` (same)                                           |
| `.WND`                             | UI layout files                          | Direct load                                            | OpenSAGE `WndMainMenuSource(@"Menus\\MainMenu.wnd")` and `WndFile` parser                                                 | Missing          | same                                               |
| `.STR`                             | localized strings                        | Direct load                                            | OpenSAGE `GeneralsDefinition::GetLocalizedStringsPath` + `TranslationManager::LoadStrFile` + `Data\\Patch.str`            | Missing          | same                                               |
| `.MAP`                             | original map format                      | Direct load                                            | OpenSAGE `MapFile` parser with Generals-specific chunks                                                                   | Missing          | same                                               |
| `.DDS` / `.TGA` / `.JPG`           | textures                                 | Direct load                                            | OpenSAGE `OnDemandTextureLoader` supports `.dds`, `.tga`, `.jpg`                                                          | Missing          | same                                               |
| `.APT` + `.CONST` + `.DAT` + `.RU` | GUI / movie asset bundle family          | Direct load where used                                 | OpenSAGE `AptFile` parser loads `.apt`, companion `.const`, `.dat`, and `_geometry/*.ru`                                  | Missing          | same                                               |
| `.CSF`                             | broader SAGE string-table family         | Game-family support, but not the primary Generals path | OpenSAGE `TranslationManager` attempts `.csf` before `.str`                                                               | **Implemented** in `cnc-formats` (v0.1.0-alpha.2) — shared with RA2 parser | `cnc-formats` (same)                                           |

**Implication:** Generals has seen partial but significant progress. `.BIG` archives, `.W3D` 3D models, and `.CSF` string tables are implemented in `cnc-formats` (absorbed into the main parser crate rather than a separate `sage-formats`). Remaining gaps: `.WND` UI layouts, `.STR` localized strings, `.MAP` map format, texture families (`.DDS`/`.TGA`/`.JPG`), and `.APT` bundle family.

## What This Means For The Current Design

### 1. `cnc-formats` scope has broadened beyond the original Westwood 2D focus

As of v0.1.0-alpha.2, `cnc-formats` now covers three game families (classic Westwood, TS/RA2, Generals/SAGE) plus Remastered archives. [05-FORMATS](../src/05-FORMATS.md) has been updated to reflect this expanded scope. The crate has been the practical home for BIG/W3D/CSF parsers rather than a separate `sage-formats` crate — the format sniffing and CLI infrastructure benefits from colocation.

### 2. "Complete support" should be treated as a loader matrix, not a single-crate purity test

The engine-completeness requirement is:

- every shipped asset family has a direct loader, decoder, parser, or justified import pipeline
- the CLI proof surface can identify and inspect those families

That does **not** require one crate to own everything. A reasonable target split is:

- `cnc-formats`: classic Westwood / Petroglyph 2D family
- `ic-cnc-content` (or RA2 module layer): RA1/RA2-specific glue and EA-derived details
- `sage-formats` (or equivalent): Generals / ZH SAGE formats
- separate Dune-specific parser layer if Dune II is kept in the official completeness bar

### 3. The remaining missing families are clear

Progress has been significant. Here is the updated gap list (~~strikethrough~~ = now implemented):

1. Classic Westwood gaps:
   - ~~`.cps`~~ ✅
   - ~~`.eng`~~ ✅
   - `.vqp` ✅ (already implemented earlier)
   - mission `.bin` / `.mpr` — still missing
2. Decide whether Dune II belongs inside `cnc-formats` or a sibling crate (unchanged).
3. RA2 milestone (partially complete):
   - ~~`shp(ts)`~~ ✅
   - `tmp(ts)` — still missing
   - ~~`vxl`~~ ✅
   - ~~`hva`~~ ✅
   - `bag/idx` — still missing
   - `.map` — still missing
   - ~~`.csf`~~ ✅
4. Generals / ZH milestone (partially complete):
   - ~~`.big`~~ ✅
   - ~~`.w3d`~~ ✅
   - `.wnd` — still missing
   - `.str` — still missing
   - `.map` — still missing
   - texture families — still missing
   - `.apt` bundle family — still missing

### 4. Dune II music must be corrected deliberately

The current docs describe Dune II music as `.adl`. The OpenDUNE sources used here show:

- driver-specific music extension handling
- explicit `.XMI` fallback
- MIDI / MT32 / FluidSynth paths

That means the Dune II soundtrack row should not be left as a casual inherited assumption. It needs a short dedicated follow-up before being made canonical.

## Primary Sources Used

### OpenRA

- https://github.com/OpenRA/OpenRA/blob/bleed/mods/cnc/mod.yaml
- https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/mod.yaml
- https://github.com/OpenRA/OpenRA/blob/bleed/mods/ts/mod.yaml
- https://github.com/OpenRA/OpenRA/blob/bleed/mods/d2k/mod.yaml

### OpenDUNE

- https://github.com/OpenDUNE/OpenDUNE/blob/master/src/tools/buildpak.c
- https://github.com/OpenDUNE/OpenDUNE/blob/master/src/tools/extractpak.c
- https://github.com/OpenDUNE/OpenDUNE/blob/master/src/wsa.c
- https://github.com/OpenDUNE/OpenDUNE/blob/master/src/sprites.c
- https://github.com/OpenDUNE/OpenDUNE/blob/master/src/audio/driver.c
- https://github.com/OpenDUNE/OpenDUNE/blob/master/src/table/sound.c
- https://github.com/OpenDUNE/OpenDUNE/blob/master/README.txt

### OpenSAGE

- https://github.com/OpenSAGE/OpenSAGE/blob/master/README.md
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.Mods.Generals/GeneralsDefinition.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.Mods.Generals/GeneralsZeroHourDefinition.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.FileFormats.Big/BigArchive.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.FileFormats.W3d/W3dFile.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.Game/Data/Wnd/WndFile.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.Game/Data/Apt/AptFile.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.Game/Data/Map/MapFile.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.Game/Content/Translation/TranslationManager.cs
- https://github.com/OpenSAGE/OpenSAGE/blob/master/src/OpenSage.Game/Content/Loaders/OnDemandTextureLoader.cs

### EA / IC design docs

- https://github.com/electronicarts/CnC_Remastered_Collection
- https://github.com/electronicarts/CnC_Generals_Zero_Hour
- [05-FORMATS](../src/05-FORMATS.md)
- [D075-remastered-format-compat](../src/decisions/09c/D075-remastered-format-compat.md)
- [D076-standalone-crates](../src/decisions/09a/D076-standalone-crates.md)
- [openra-ra2-mod-architecture](openra-ra2-mod-architecture.md)

### Local retail sample evidence

- [/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/LOCAL_OUTPUT/ALIPAPER.CPS](/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/LOCAL_OUTPUT/ALIPAPER.CPS)
- [/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/LOCAL_OUTPUT/CONQUER.ENG](/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/LOCAL_OUTPUT/CONQUER.ENG)
- [/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/NCHIRES_OUTPUT/AAGUN.VQP](/mnt/c/git/games/cnc-formats/samples/CD1_ALLIED_DISC/extract2/NCHIRES_OUTPUT/AAGUN.VQP)
