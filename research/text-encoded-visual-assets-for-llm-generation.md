# Text-Encoded Visual Assets for LLM Generation

> Research document exploring the conversion of C&C visual assets (sprites,
> palettes, terrain tiles) into compact text representations that LLMs can
> learn from, generate, and round-trip back to game-ready binary formats.
> This is a text-native alternative to diffusion-based image generation that
> exploits the inherently low-dimensional nature of palette-indexed pixel art.

**Date:** 2026-03-13
**Referenced by:** D040 (Asset Studio Layer 3), D016 (LLM Missions), D047 (LLM Config Manager), D076 (`cnc-formats`)
**Status:** Committed design. IST format converter ships in `cnc-formats` (Phase 0, `ist` feature flag). Training corpus construction in Phase 2. LLM fine-tuning + `AssetGenerator` IST provider in `ic-llm` (Phase 7, D040 Layer 3).

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Why Sprites Are Already "Text"](#2-why-sprites-are-already-text)
3. [Prior Art: Visual Tokenization Research](#3-prior-art-visual-tokenization-research)
4. [Prior Art: Text-Encoded Pixel Art in Practice](#4-prior-art-text-encoded-pixel-art-in-practice)
5. [Proposed Format: IC Sprite Text (IST)](#5-proposed-format-ic-sprite-text-ist)
6. [Token Budget Analysis](#6-token-budget-analysis)
7. [Training Corpus Construction](#7-training-corpus-construction)
8. [What an LLM Can Learn from Sprite Text](#8-what-an-llm-can-learn-from-sprite-text)
9. [Beyond Sprites: Other Resources as Text](#9-beyond-sprites-other-resources-as-text)
10. [Integration with D040 AssetGenerator](#10-integration-with-d040-assetgenerator)
11. [Comparison: Text Tokens vs. Diffusion Pipeline](#11-comparison-text-tokens-vs-diffusion-pipeline)
12. [Limitations and Honest Assessment](#12-limitations-and-honest-assessment)
13. [Implementation Roadmap](#13-implementation-roadmap)
14. [Cross-References](#14-cross-references)

---

## 1. Problem Statement

D040 Layer 3 (Agentic Asset Generation) currently assumes a **diffusion model pipeline**: text prompt â†’ image model (DALL-E, Stable Diffusion, local diffusion) â†’ raw PNG â†’ Asset Studio post-processes (palette quantization, frame extraction, .shp conversion). This works, but has three problems for IC's context:

1. **CPU infeasibility.** Diffusion models require GPU. IC's Tier 1 (D047) is CPU-only inference. A modder on a 2012 laptop can generate mission YAML but not sprites â€” the toolchain is asymmetric.

2. **Lossy quantization.** Diffusion models output 24-bit RGB images. Converting to 256-color palette-indexed format is a lossy step that discards the model's effort on color precision. The model wastes capacity on color detail that gets quantized away.

3. **No structural awareness.** Diffusion models don't understand that frame 0 and frame 1 should look like the same tank rotated 11.25Â°. Each frame is generated independently, requiring manual consistency enforcement.

The core insight: **C&C sprites are tiny discrete grids with a finite color vocabulary.** They're closer to text than to photographs. Can we skip the image model entirely and have a text LLM directly output palette-indexed pixel grids?

---

## 2. Why Sprites Are Already "Text"

### The Numbers

A typical RA1 unit sprite has these dimensions (from `formats/binary-codecs.md` and `architecture/ra-experience.md`):

| Asset Type     | Pixel Size | Colors Used | Facings | Frames per Facing     | Total Frames |
| -------------- | ---------- | ----------- | ------- | --------------------- | ------------ |
| Infantry       | 24Ã—24     | 12â€“20     | 8       | 1â€“6 (walk cycle)    | 8â€“48       |
| Vehicle body   | 32Ã—32     | 16â€“32     | 32      | 1 (static)            | 32           |
| Vehicle turret | 16Ã—16     | 8â€“16      | 32      | 1 (static)            | 32           |
| Building       | 48Ã—48     | 20â€“40     | 1       | 1â€“20 (construction) | 1â€“20       |
| Terrain tile   | 24Ã—24     | 8â€“16      | 1       | 1                     | 1            |

**Key properties that make this text-friendly:**

1. **Palette-indexed.** Each pixel is an integer index (0â€“255) into a 256-color .pal file. This is already a discrete vocabulary â€” no continuous color space.

2. **Small canvas.** A 32Ã—32 frame has 1,024 pixels. At one character per pixel (using hex for 16-color mode), that's ~1 KB of text. At two characters per pixel (hex for 256 colors), ~2 KB.

3. **Low entropy.** Most pixels in a sprite are either transparent (index 0) or one of 10â€“30 active colors. Run-length patterns are extremely common (background, outlines, fill).

4. **Strong structural priors.** Military vehicles are bilaterally symmetric. Infantry follow anatomical proportions. Buildings have rectangular foundations. Shading follows consistent light direction (top-left in C&C).

5. **VGA 6-bit palette.** Each color is 3 bytes of 6-bit values (0â€“63 per channel), meaning 262,144 possible colors â€” but in practice, RA1 palettes use ~200 distinct colors, of which any single sprite uses 10â€“40.

### Comparison to Photographic Images

| Property              | Photograph            | C&C Sprite                   |
| --------------------- | --------------------- | ---------------------------- |
| Resolution            | 1024Ã—1024+           | 24Ã—24 to 64Ã—64             |
| Color depth           | 24-bit (16.7M colors) | 8-bit indexed (256 palette)  |
| Colors per image      | Millions              | 10â€“40 active               |
| Pixel semantics       | Continuous gradients  | Discrete fill regions        |
| Symmetry              | Rare                  | Common (vehicles, buildings) |
| Tokens needed (naive) | ~50Kâ€“300K           | ~300â€“3,000                 |

A photograph needs a visual tokenizer (VQ-VAE, MAGVIT) to compress it into a tractable number of tokens. A C&C sprite **is already tokenized by the palette**.

---

## 3. Prior Art: Visual Tokenization Research

The AI research community has independently arrived at the same insight â€” that discrete token vocabularies can represent images â€” but for much harder problems (photographic images, video).

### DALL-E 1 (OpenAI, 2021)

- **Method:** Discrete VAE (dVAE) compresses 256Ã—256 images to 32Ã—32 grids of 8,192 possible tokens. A GPT-like transformer then generates these token sequences autoregressively.
- **Result:** Proved that autoregressive language models can generate coherent images when given the right tokenization.
- **Relevance to IC:** DALL-E's 32Ã—32 token grid is *larger* than a C&C sprite's 24Ã—24 pixel grid. IC sprites are simpler than what DALL-E was designed for.

### MAGVIT-v2 (Google, ICLR 2024)

- **Paper:** "Language Model Beats Diffusion â€” Tokenizer is Key to Visual Generation" (arXiv:2310.05737)
- **Method:** Lookup-Free Quantization video tokenizer maps images and video to compact discrete tokens with a shared vocabulary. Standard autoregressive transformer generates tokens.
- **Result:** LLM *outperforms diffusion models* on ImageNet and Kinetics benchmarks.
- **Key quote:** "The quality of the visual tokenizer dictates the upper bound of the visual generation quality."
- **Relevance to IC:** IC already has the ideal tokenizer â€” the palette. The "lookup-free quantization" that MAGVIT-v2 had to invent is what palette indexing does natively.

### Parti (Google, 2022)

- **Method:** ViT-VQGAN tokenizer + autoregressive transformer for text-to-image.
- **Result:** High-quality text-to-image via pure token prediction, scaling to 20B parameters.
- **Relevance to IC:** Validates that quality scales with model size even in token-based image generation. IC's sprites are simple enough that a small model (1â€“3B) should suffice.

### Chameleon (Meta, 2024)

- **Method:** Mixed-modal model processes interleaved text and VQ-VAE image tokens in a single unified sequence.
- **Result:** A single model handles text understanding, text generation, image understanding, and image generation.
- **Relevance to IC:** If IC's sprite text format is a standard text sequence, any fine-tuned text model becomes a "Chameleon for sprites" without needing mixed-modal architecture.

### Summary of Research Trajectory

The AI community has spent 2021â€“2024 building sophisticated visual tokenizers to compress photographs into ~1,000 tokens. IC's sprites are *natively* ~1,000 tokens. The hard part of visual tokenization (converting continuous high-dimensional images to discrete low-dimensional sequences) is **already solved by the palette-indexed format**.

---

## 4. Prior Art: Text-Encoded Pixel Art in Practice

### ASCII Art Generation

LLMs (even without fine-tuning) can generate ASCII art â€” text patterns that visually represent objects using character glyphs. This demonstrates spatial reasoning ability, though at very low resolution (~1-bit, character-cell granularity).

### Hex Grid Representations in Roguelikes

Roguelike communities have used text grid representations for decades:

```text
. . . . # # # # . . . . # # # #
. # . . . . . . . . . . . . # .
. # . . @ @ @ @ . . . . . . # .
. # . . @ # # @ . . . . . . # .
. # . . @ @ @ @ . . . . . . # .
. # . . . . . . . . . . . . # .
. . . . # # # # . . . . # # # #
```
These are essentially 1-bit sprites. LLMs can generate, modify, and reason about them.

### SHX Fonts / Hershey Fonts

Vector fonts stored as text-encoded stroke sequences (move/draw commands). Proves that visual artifacts can round-trip through text losslessly. Not pixel-based, but demonstrates the principle.

### XPIXELMAP (XPM) Format

The X Window System's XPM format is *exactly* a text-encoded pixel image:
```c
/* XPM */
static char *tank_xpm[] = {
"24 24 4 1",      /* width height num_colors chars_per_pixel */
". c None",        /* transparent */
"# c #000000",    /* outline */
"R c #8B0000",    /* dark red */
"G c #808080",    /* gray */
"........................",
"........####............",
"......##RRRR##..........",
"....##RRGGGGRRG.........",
/* ... 20 more rows ... */
};
```

XPM is human-readable, diffable, and compiles directly. It was created in 1989, predating LLMs by decades. IC's proposed text sprite format is a modernized, YAML-wrapped version of this idea optimized for LLM context windows.

### ANSI Art / .ANS Files

BBS-era art using ANSI escape codes for 16-color pixel art at character resolution. Communities still create and share these. Demonstrates that text-encoded visual art has a long cultural history.

---

## 5. Proposed Format: IC Sprite Text (IST)

### Design Goals

1. **Minimal tokens** â€” every character carries information; no verbose markup within pixel data
2. **Round-trip lossless** â€” IST â†” .shp + .pal with zero information loss
3. **LLM-learnable** â€” spatial patterns (symmetry, shading, outlines) are visually recognizable in the text
4. **Human-editable** â€” a modder can open the file, change pixel values, and the result is immediately meaningful
5. **Palette-semantic** â€” the mapping from index to meaning (transparent, outline, faction color, shadow) is explicit

### Format Specification

```yaml
# IC Sprite Text (IST) v1
# Round-trip lossless with .shp + .pal

meta:
  name: "htnk"                   # Asset identifier (matches .shp filename)
  desc: "Heavy Tank â€” Allied"    # Human description (LLM prompt context)
  type: unit                     # unit | building | terrain | infantry | projectile | effect
  size: [32, 32]                 # [width, height] in pixels per frame
  facings: 32                    # Number of rotation frames
  animations: 1                  # Frames per facing (walk cycle, construction, etc.)

palette:
  # Active colors used by this sprite (subset of full .pal)
  # Index: [R, G, B] in 6-bit VGA values (0-63)
  # Semantic role annotated for LLM understanding
  0: transparent                 # Background (not drawn)
  1: [0, 0, 0]                  # Outline
  4: [20, 20, 22]               # Dark shadow
  5: [28, 28, 30]               # Medium shadow
  16: [10, 0, 0]                # Faction remap dark (player color)
  17: [20, 5, 5]                # Faction remap mid
  18: [32, 10, 10]              # Faction remap light
  19: [42, 15, 15]              # Faction remap highlight
  32: [24, 24, 24]              # Dark metal
  33: [32, 32, 32]              # Medium metal
  34: [40, 40, 40]              # Light metal
  35: [48, 48, 48]              # Highlight metal
  40: [15, 18, 10]              # Dark tread
  41: [22, 26, 16]              # Light tread

remap_range: [16, 19]           # Indices that change with faction color

frames:
  # Each frame is a grid of palette indices in hex (0-9, a-f for 0-15; 00-ff for 0-255)
  # For sprites using â‰¤16 active colors, single-char hex (compact mode)
  # For sprites using >16 active colors, two-char hex (full mode)

  - facing: 0                    # South (0 of 32)
    pixels: |
      00000000000000000000000000000000
      00000000000000000000000000000000
      00000000000001111000000000000000
      00000000000013333100000000000000
      00000000000133333310000000000000
      00000000001333333331000000000000
      00000000013322332233100000000000
      00000000013322332233100000000000
      00000001133345543345110000000000
      00000001122345543345210000000000
      00000011222345543345221000000000
      00000011222344444345221000000000
      00000012222344444342221000000000
      00000a12222344444342221a0000000
      0000aa12222344444342221aa000000
      0000aa12223344443342221aa000000
      0000aa12223344443342221aa000000
      0000aa12222344444342221aa000000
      00000a12222344444342221a0000000
      00000012222344444345221000000000
      00000011222345543345221000000000
      00000001122345543345210000000000
      00000001133345543345110000000000
      00000000013322332233100000000000
      00000000013322332233100000000000
      00000000001333333331000000000000
      00000000000133333310000000000000
      00000000000013333100000000000000
      00000000000001111000000000000000
      00000000000000000000000000000000
      00000000000000000000000000000000
      00000000000000000000000000000000

  - facing: 1                    # South-by-southwest (1 of 32)
    pixels: |
      # ... rotated variant ...
```

### Compact Mode vs. Full Mode

**Compact mode** (â‰¤16 active colors): Each pixel is one hex character (0â€“f). A 32Ã—32 frame = 32 lines Ã— 32 characters = **1,024 characters**.

**Full mode** (17â€“256 active colors): Each pixel is two hex characters (00â€“ff), space-separated or zero-padded. A 32Ã—32 frame = 32 lines Ã— 64 characters = **2,048 characters**.

Most RA1 unit sprites use â‰¤16 active colors (even though the palette has 256 entries, any single sprite draws from a small subset). Compact mode covers the common case.

### Shadow Encoding

RA1 sprites use a separate shadow layer (shadow pixels have special palette indices that darken whatever is beneath them). IST encodes these with a reserved character:

```yaml
shadow:
  - facing: 0
    pixels: |
      00000000000000000000000000000000
      00000000000000000000000000000000
      00000000000000000000ss0000000000
      0000000000000000000ssss000000000
      000000000000000000sssssss0000000
      # ... shadow silhouette offset to south-east ...
```

### Why YAML Wrapper

The pixel grids are raw text, but the metadata is structured YAML because:
- IC already uses `serde_yaml` everywhere (D003)
- Metadata is machine-parseable without custom parser
- An LLM sees both the semantic description (`desc`, `type`, `remap_range`) and the pixel data in one context window
- The `cnc-formats` CLI can read/write IST as a standard format alongside .shp/.pal

---

## 6. Token Budget Analysis

LLM tokenizers (BPE) compress repetitive text efficiently. The pixel grid lines in IST are highly compressible because:
- Long runs of `0` (transparent background) collapse to few tokens
- Repeated patterns (symmetric shapes) share token sequences
- The hex alphabet (0â€“9, aâ€“f) maps to single tokens in most tokenizers

### Measured Token Counts (Estimated)

Using a BPE tokenizer (GPT-4/Qwen2 family), approximate token counts:

| Asset                             | Pixel Size | Facings | Raw Chars | Est. Tokens (pixels only) | Est. Tokens (full IST) |
| --------------------------------- | ---------- | ------- | --------- | ------------------------- | ---------------------- |
| Infantry (1 frame)                | 24Ã—24     | 1       | 576       | ~150                      | ~200                   |
| Infantry (8 facings)              | 24Ã—24     | 8       | 4,608     | ~1,200                    | ~1,500                 |
| Vehicle body (1 frame)            | 32Ã—32     | 1       | 1,024     | ~270                      | ~350                   |
| Vehicle body (32 facings)         | 32Ã—32     | 32      | 32,768    | ~8,500                    | ~9,500                 |
| Building (1 frame)                | 48Ã—48     | 1       | 2,304     | ~600                      | ~700                   |
| Building (20 construction frames) | 48Ã—48     | 1Ã—20   | 46,080    | ~12,000                   | ~13,000                |
| Terrain tile                      | 24Ã—24     | 1       | 576       | ~150                      | ~200                   |
| Palette (.pal metadata)           | â€”        | â€”     | ~300      | ~80                       | ~80                    |

### Context Window Fit

| Model                 | Context Window     | What Fits                                                       |
| --------------------- | ------------------ | --------------------------------------------------------------- |
| Qwen2.5-1.5B (Tier 1) | 32K tokens         | ~3 full vehicle sprites, or ~20 infantry, or ~100 terrain tiles |
| Phi-4-mini (Tier 1)   | 128K tokens        | An entire game module's complete sprite set                     |
| Claude/GPT-4 (Tier 2) | 128Kâ€“200K tokens | Multiple sprite sets for comparison/style transfer              |

**Key insight:** Even the smallest Tier 1 CPU model can hold several complete sprites in context â€” enough for few-shot learning: "Here are 3 example tanks. Generate a 4th with a different turret."

### Comparison to Diffusion Requirements

A Stable Diffusion generation requires:
- ~1B+ parameter model (4+ GB VRAM)
- GPU inference (~2â€“10 seconds per image on consumer GPU)
- Post-processing pipeline (quantize, extract, convert)
- No CPU-only path is practical

An IST text generation requires:
- ~1.5B parameter text model (~1 GB at Q4_K_M)
- CPU inference (~5â€“15 seconds for a 32Ã—32 sprite at 38 tok/s)
- Direct conversion (IST â†’ .shp, lossless, no quantization)
- Runs on the same Tier 1 CPU models already planned for D047

---

## 7. Training Corpus Construction

### Source Material

RA1 ships with approximately:
- ~150 unit/building .shp files
- ~50 terrain tile sets
- ~30 effect/projectile sprites
- ~10 palettes

OpenRA's mod repository adds cleaned-up versions plus community contributions. The total usable corpus is ~300â€“500 sprite files.

### Conversion Pipeline

```
.shp + .pal  â†’  cnc-formats inspect  â†’  IST (text)
                                         â†“
                                    Training pairs:
                                    (description, IST text)
```

Each sprite gets a human-written description tag:
```yaml
# Training pair examples:
- desc: "Allied medium tank, single barrel turret, 32 facings, green/gray color scheme"
  file: "mtnk.ist"
- desc: "Soviet heavy tank, dual barrel turret, 32 facings, red/dark metal"
  file: "htnk.ist"
- desc: "Allied infantry rifleman, 8 facings, 6 walk frames"
  file: "e1.ist"
- desc: "Power plant building, 48x48, 10 construction frames, Allied faction"
  file: "powr.ist"
```

### Data Augmentation

The small corpus (~500 sprites) benefits from augmentation:
- **Palette swaps:** Re-index the same sprite with different palettes â†’ new training examples with same geometry
- **Mirror:** Horizontal flip for all non-symmetric sprites
- **Description variation:** Multiple description phrasings for the same sprite
- **Partial occlusion:** Mask portions of the sprite and train the model to infill

### Fine-Tuning Strategy

**LoRA fine-tuning** (Low-Rank Adaptation) on a base model (Qwen2.5-1.5B or Phi-4-mini):
- Small adapter weights (~50â€“100 MB), not a full model retrain
- Trains on consumer hardware (single GPU or high-end CPU)
- Base model retains general text capability; LoRA adds sprite generation skill
- Can be distributed as a D047 model pack via Workshop

---

## 8. What an LLM Can Learn from Sprite Text

Given a corpus of ~500 annotated IST files, a fine-tuned model can learn:

### Structural Conventions
- **Outline rules:** C&C sprites use 1-pixel dark outlines. The model sees this as index `1` consistently surrounding filled regions.
- **Shadow direction:** Shadows fall southeast. The shadow layer offset is consistent across the corpus.
- **Symmetry:** Vehicles are often bilaterally symmetric. The model can learn to generate symmetric pixel rows.
- **Bounding box usage:** Units don't fill their full frame â€” there's transparent padding. The model learns typical fill ratios.

### Palette Semantics
- **Faction remap zone:** Indices 16â€“19 (or whatever the remap range is) always appear in the same structural positions â€” the "team-colored" areas of the unit.
- **Metal shading:** Dark-to-light progressions (indices 32â†’33â†’34â†’35) follow consistent light direction.
- **Tread/wheel patterns:** Ground contact points use specific dark indices.

### Rotation Coherence
- **32-facing rotation:** The model sees 32 frames of the same object rotated. It can learn that facing 1 is a small rotation of facing 0, not a different object.
- **Turret independence:** Vehicle bodies rotate separately from turrets. The model sees body frames and turret frames as separate sprites with independent rotation.

### Animation Patterns
- **Walk cycles:** Infantry have 6-frame walk animations with consistent limb positions per frame.
- **Construction sequences:** Buildings "grow" from foundation to full structure. The model learns this progression.
- **Recoil:** Weapon fire animations show barrel extension/retraction.

### Style Transfer
Given the corpus represents RA1's art style, a fine-tuned model would naturally generate sprites in that style. Providing a few examples from a different style (e.g., Tiberian Dawn's darker palette) in the prompt context could shift the generation style via few-shot learning.

---

## 9. Beyond Sprites: Other Resources as Text

The IST principle extends to other IC resource types:

### Palettes (.pal â†’ Palette Text)

Already almost text â€” a palette is 256 RGB triplets. As a text list:

```yaml
palette:
  name: "temperate"
  colors:
    0: [0, 0, 0]        # Black / transparent key
    1: [2, 2, 4]         # Near-black
    2: [4, 4, 8]         # Very dark blue
    # ... 253 more entries ...
    254: [63, 63, 63]    # White
    255: [63, 0, 63]     # Special: cursor color
  remap_ranges:
    player: [80, 95]     # 16 entries for faction color
    shadow: [240, 244]   # Shadow overlay indices
```

Token count: ~600 tokens for a complete 256-color palette. Trivial for any LLM.

**LLM capability:** "Generate a volcanic wasteland palette â€” reds, oranges, charred blacks, lava glows" â†’ a 256-entry color list that follows the structural conventions (remap ranges preserved, shadow indices consistent).

### Maps (Tile Grid â†’ Map Text)

Maps are 2D grids of tile indices, exactly like sprites but at map scale:

```yaml
map:
  name: "desert_outpost"
  size: [64, 64]           # 64Ã—64 tiles
  tile_set: "desert"
  cells: |
    SSSSSSSSDDDDDDDDDDDDDDDDSSSSSSSS...
    SSSSSSSDDDDRRDDDDDDDDDDDSSSSSSS...
    SSSSSSDDDDRRRRDDDDDDDDDDDSSSSSS...
    # S=sand, D=desert, R=road, W=water, C=cliff, O=ore
```

A 64Ã—64 map is 4,096 characters â€” ~1,000 tokens. Well within context.

**LLM capability:** "Generate a 64Ã—64 desert map with a river running north-south, two ore patches in the northwest and southeast, and a road crossing the river at the middle" â†’ a tile grid that matches existing map conventions.

Note: LLM-generated mission maps (D016) already use a feature-zone description approach. IST-style maps are a more granular alternative for tile-level precision.

### Terrain Templates (.tmp â†’ Template Text)

Terrain templates define how tile transitions work (landâ†’water edges, road curves). These are small (8Ã—8 to 16Ã—16) indexed grids â€” trivially text-encodable.

### UI Themes (Chrome Sprite Sheets)

UI elements (buttons, panels, scrollbars) are sprite sheets with 9-slice metadata. The sprite data is IST-encodable; the layout metadata is already YAML.

### Sound Effects â€” Not Text-Native

Audio waveforms are high-dimensional continuous data. Text encoding (e.g., base64 WAV) would be enormous and unlearnable. Audio remains in the domain of specialized models (`SoundFxProvider`, `VoiceProvider`). This is an honest boundary of the text-encoding approach.

### Music â€” Partially Text-Native

MIDI and ABC notation are text-native music formats. An LLM can generate ABC notation that converts to MIDI. This is a known capability â€” multiple models already generate ABC music. For C&C-style synthwave/industrial music, the quality ceiling of text-generated music is likely insufficient for release quality, but useful for prototyping soundtrack mood.

---

## 10. Integration with D040 AssetGenerator

### Current D040 Architecture

```
Text Prompt â†’ AssetGenerator trait â†’ Image Provider (DALL-E/SD/Local)
                                          â†“
                                     Raw PNG image
                                          â†“
                              Asset Studio Post-Processing
                              (palette quantize, frame extract,
                               .shp conversion)
                                          â†“
                                   Game-ready .shp + .pal
```

### Proposed IST-Enhanced Architecture

```
Text Prompt â†’ AssetGenerator trait â†’ IST Text Provider (fine-tuned LLM)
                                          â†“
                                     IST text output
                                          â†“
                              IST â†’ .shp direct conversion
                              (lossless, no quantization needed)
                                          â†“
                                   Game-ready .shp + .pal
```

**The trait doesn't change** â€” `AssetGenerator` returns generated asset data. The difference is in the provider implementation:

- **Diffusion provider:** Returns raw PNG bytes â†’ requires post-processing
- **IST text provider:** Returns IST YAML text â†’ direct lossless conversion

Both providers satisfy the same `AssetGenerator` trait. D047 task routing determines which provider handles the request based on user configuration and provider availability.

### Hybrid Approach

For best results, both providers can coexist:

| Task                  | Best Provider | Why                                                    |
| --------------------- | ------------- | ------------------------------------------------------ |
| Unit sprite (new)     | IST text      | Palette-correct, structurally sound, CPU-feasible      |
| HD art upscale        | Diffusion     | Higher resolution needs continuous color space         |
| Style reference       | Diffusion     | Artistic interpretation of reference images            |
| Palette generation    | IST text      | Exact color control needed                             |
| Building sprite       | IST text      | Structural regularity, construction animation sequence |
| Effect/explosion      | Diffusion     | Organic, non-geometric shapes                          |
| Terrain tile          | IST text      | Must tile seamlessly â€” text gives exact edge control |
| Portrait/briefing art | Diffusion     | Illustrative, non-pixel-art content                    |

### SDK Workflow Addition

Asset Studio gains a new workflow option:

1. **Describe** what you want (same as current)
2. **Choose mode:** "Generate as pixel art (IST)" vs. "Generate as image (diffusion)"
3. **IST mode:** LLM outputs IST directly â†’ preview â†’ edit text if needed â†’ convert to .shp
4. **Diffusion mode:** Image model outputs PNG â†’ preview â†’ quantize â†’ convert (existing flow)

The IST mode adds a unique capability: **the modder can hand-edit the text output before conversion**. Change a pixel's color index, fix an asymmetry, adjust an outline â€” all in a text editor. This is impossible with diffusion-generated PNGs.

---

## 11. Comparison: Text Tokens vs. Diffusion Pipeline

| Aspect                                | Diffusion (DALL-E/SD)                    | IST Text LLM                                    |
| ------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| **Output resolution**                 | 512Ã—512+ (too large, downscale needed)  | Exact pixel size (24Ã—24, 32Ã—32, 48Ã—48)       |
| **Color control**                     | Approximate (24-bit, needs quantization) | Exact palette indices (lossless)                |
| **Faction remap**                     | Post-process nightmare                   | Built into format (remap_range)                 |
| **Frame consistency**                 | Each frame independent                   | All frames in one context window                |
| **CPU inference**                     | Impractical                              | Tier 1 feasible (~5â€“15s per frame)            |
| **Training data needed**              | Millions of images                       | ~500 annotated sprites                          |
| **Model size**                        | ~1B+ params, 4+ GB VRAM                  | ~1.5B params, ~1 GB RAM (Q4_K_M)                |
| **Editability**                       | Regenerate entire image                  | Edit specific pixels in text                    |
| **Round-trip fidelity**               | Lossy (quantization)                     | Lossless                                        |
| **Artistic quality (photorealistic)** | Excellent                                | N/A â€” not the goal                            |
| **Artistic quality (pixel art)**      | Mixed â€” often over-detailed            | Likely good â€” trained on actual C&C pixel art |
| **Animation coherence**               | Poor (per-frame)                         | Better (all frames visible to model)            |
| **Shadow consistency**                | Must be painted per frame                | Separate shadow layer, consistent rules         |
| **Tiling correctness (terrain)**      | No guarantee                             | Can enforce edge constraints in text            |

**The IST approach wins for C&C-style content.** Diffusion wins for high-resolution illustrative art (portraits, briefings, promotional material). IC should support both.

---

## 12. Limitations and Honest Assessment

### Quality Ceiling

A 1.5B text model fine-tuned on ~500 sprites will not produce professional-grade art. The output will be:
- **Structurally correct:** right dimensions, valid palette indices, proper facings
- **Stylistically consistent:** looks like C&C art (it's trained on C&C art)
- **Artistically basic:** may lack the subtle shading and creative detail of hand-drawn pixel art

This is appropriate for: prototyping, playtesting, small community mods, placeholder art, procedural content. It is NOT a replacement for professional pixel artists working on a polished release.

### Rotation Quality

Generating 32 convincing rotation frames of a tank is hard even for human artists. The model will learn rotation patterns from the training data, but edge cases (off-axis asymmetry, barrel perspective) will likely have artifacts. Post-generation manual touch-up of a few frames may be necessary.

### Novel Concepts

The model generates what it's trained on. Ask for "Soviet heavy tank" and it'll produce something convincing. Ask for "alien hovership with tentacles" and it'll do its best, but the output quality depends on how far the request is from the training distribution.

### Larger Sprites

A 128Ã—128 sprite at 64 colors (two-char hex mode) is ~32K characters per frame â€” ~8,000 tokens. Still feasible for large-context models, but pushes Tier 1 limits for multi-frame sprites. The IST approach works best for classic C&C scale (24Ã—48 pixels), which is IC's primary target.

### Not a Solved Problem

As of 2026, no one has shipped a production system that fine-tunes a text LLM specifically on palette-indexed pixel art and generates game-ready sprites from text descriptions. The research foundations (MAGVIT-v2, DALL-E 1 tokenization) validate the approach, and the XPM precedent proves the format is viable â€” but IC would be among the first to implement this specific pipeline. This is experimental, Phase 7 work.

---

## 13. Implementation Roadmap

### Phase 0â€“1: IST Format + Converter (Foundation)

**Effort:** ~1â€“2 weeks
**Crate:** `cnc-formats` (MIT/Apache-2.0)

- Define IST v1 format specification
- Implement `.shp + .pal â†’ IST` converter (one direction)
- Implement `IST â†’ .shp + .pal` converter (round-trip)
- Add `cnc-formats convert --to ist` and `cnc-formats convert --format ist` CLI subcommands
- Validate round-trip: `.shp â†’ IST â†’ .shp` produces byte-identical output
- Validation: `cnc-formats validate` accepts IST files

**Value independent of LLMs:** IST is immediately useful as a human-readable, diffable, version-controllable sprite format. Modders can view and edit sprites in any text editor.

### Phase 2: Training Corpus (Preparation)

**Effort:** ~1 week
**Crate:** Tooling script, not a shipped crate

- Convert entire RA1 sprite set to IST using the Phase 0â€“1 converter
- Write description annotations for each sprite (manual + template)
- Generate augmented training pairs (palette swaps, mirrors, description variants)
- Package as a training dataset (~500â€“2,000 examples after augmentation)

### Phase 7: LLM Fine-Tuning + AssetGenerator Integration

**Effort:** ~2â€“4 weeks (follows D047 infrastructure)
**Crate:** `ic-llm` (IST provider implementation)

- LoRA fine-tune Qwen2.5-1.5B (or current Tier 1 model) on IST corpus
- Implement `IstAssetProvider` in `ic-llm` implementing `AssetGenerator` trait
- Integrate with Asset Studio as "Generate as pixel art" option
- D047 task routing: `asset_generation_mode: ist | diffusion | auto`
- Distribute fine-tuned LoRA adapter as a D047 model pack

### Possible Standalone Crate (D076 Pattern)

If the IST format and converter prove useful beyond IC, they could be extracted as a standalone MIT/Apache-2.0 crate (same pattern as `cnc-formats`, `fixed-game-math`):

- `sprite-text` â€” IST format parser/writer, palette operations, round-trip validation
- Useful for any retro game engine, pixel art tool, or LLM-based sprite generation project
- Decision deferred until the format proves itself in IC's pipeline

---

## 14. Cross-References

| Document                             | Relationship                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| D040 (Asset Studio)                  | IST is an alternative provider implementation for Layer 3 `AssetGenerator`                  |
| D016 (LLM Missions)                  | Mission generation already produces YAML/Lua text; IST extends the pattern to visual assets |
| D047 (LLM Config Manager)            | IST provider routes through the same BYOLLM task routing as text generation                 |
| D076 (`cnc-formats`)                 | IST converter lives in `cnc-formats` initially (format-level tool, MIT/Apache-2.0)          |
| `formats/binary-codecs.md`           | .shp and .pal binary format specifications that IST must round-trip against                 |
| `architecture/ra-experience.md`      | Facing quantization (8/32 facings) and frame indexing rules                                 |
| `cpu-llm-model-evaluation.md`        | Tier 1 model capabilities and RAM budgets                                                   |
| `pure-rust-inference-feasibility.md` | candle-based inference runtime that would run the IST fine-tuned model                      |
| `llm-generation-schemas.md`          | Mission YAML schemas â€” IST follows the same "structured text output" philosophy           |
| D057 (Skill Library)                 | Generated IST sprites that pass quality validation could be stored as skill library entries |
