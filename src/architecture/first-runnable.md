## First Runnable — Bevy Loading Red Alert Resources

This section defines the concrete implementation path from "no code" to "a Bevy window rendering a Red Alert map with sprites on it." It spans Phase 0 (format literacy) through Phase 1 (rendering slice) and produces the project's first visible output — the milestone that proves the architecture works.

### Why This Matters

The first runnable is the "Hello World" of the engine. Until a Bevy window opens and renders actual Red Alert assets, everything is theory. This milestone:

- **Validates `ra-formats`.** Can we actually parse `.mix`, `.shp`, `.pal`, `.tmp` into usable data?
- **Validates the Bevy integration.** Can we get RA sprites into Bevy's rendering pipeline?
- **Validates the isometric math.** Can we convert grid coordinates to screen coordinates correctly?
- **Generates community interest.** "Red Alert map rendered faithfully in Rust at 4K 144fps" is the first public proof that IC is real.

### What We CAN Reference From Existing Projects

We cannot copy code from OpenRA (C#) or the Remastered Collection (proprietary C# layer), but we can study their design decisions:

| Source                        | What We Take                                                                                                               | What We Don't                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **EA Original RA (GPL)**      | Format struct layouts (MIX header, SHP frame offsets, PAL 6-bit values), LCW/RLE decompression algorithms, integer math    | Don't copy the rendering code (VGA/DirectDraw). Don't adopt the global-state architecture               |
| **Remastered (GPL C++ DLLs)** | HD asset pipeline concepts (how classic sprites map to HD equivalents), modernization approach                             | Don't reference the proprietary C# layer or HD art assets. No GUI code — it's Petroglyph's C#           |
| **OpenRA (GPL)**              | Map format, YAML rule structure, palette handling, sprite animation sequences, coordinate system conventions, cursor logic | Don't copy C# rendering code verbatim. Don't duplicate OpenRA's Chrome UI system — build native Bevy UI |
| **Bevy (MIT)**                | Sprite batching, `TextureAtlas`, asset loading, camera transforms, `wgpu` render graph, ECS patterns                       | Bevy tells us *how* to render, not *what* — gameplay feel comes from RA source code, not Bevy docs      |

### Implementation Steps

#### Step 1: `ra-formats` — Parse Everything (Weeks 1–2)

Build the `ra-formats` crate to read all Red Alert binary formats. This is pure Rust with zero Bevy dependency — a standalone library that other tools could use.

**Deliverables:**

| Parser            | Input                 | Output                                                                | Reference                                                       |
| ----------------- | --------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| **MIX archive**   | `.mix` file bytes     | File index (CRC hash → offset/size pairs), extract any file by name   | EA source `MIXFILE.CPP`: CRC hash table, two-tier (body/footer) |
| **PAL palette**   | 256 × 3 bytes         | `[u8; 768]` with 6-bit→8-bit conversion (`value << 2`)                | EA source `PAL` format, `05-FORMATS.md` § PAL                   |
| **SHP sprites**   | `.shp` file bytes     | `Vec<Frame>` with pixel data, width, height per frame. LCW/RLE decode | EA source `SHAPE.H`/`SHAPE.CPP`: `ShapeBlock_Type`, draw flags  |
| **TMP tiles**     | `.tmp` file bytes     | Terrain tile images per theater (Temperate, Snow, Interior)           | OpenRA's template definitions + EA source                       |
| **AUD audio**     | `.aud` file bytes     | PCM samples. IMA ADPCM decompression via `IndexTable`/`DiffTable`     | EA source `AUDIO.CPP`, `05-FORMATS.md` § AUD                    |
| **CLI inspector** | Any RA file or `.mix` | Human-readable dump: file list, sprite frame count, palette preview   | `ic` CLI prototype: `ic dump <file>`                            |

**Key implementation detail:** MIX archives use a CRC32 hash of the filename (uppercased) as the lookup key — there's no filename stored in the archive. `ra-formats` must include the hash function and a known-filename dictionary (from OpenRA's `global.mix` filenames list) to resolve entries by name.

**Test strategy:** Parse every `.mix` from a stock Red Alert installation. Extract every `.shp` and verify frame counts match OpenRA's `sequences/*.yaml`. Render every `.pal` as a 16×16 color grid PNG.

#### Step 2: Bevy Window + One Sprite (Week 3)

The "Hello RA" moment — a Bevy window opens and displays a single Red Alert sprite with the correct palette applied.

**What this proves:** `ra-formats` output can flow into Bevy's `Image` / `TextureAtlas` pipeline. Palette-indexed sprites render correctly on a GPU.

**Implementation:**

1. Load `conquer.mix` → extract `e1.shp` (rifle infantry) and `temperat.pal`
2. Convert SHP frames to RGBA pixels by looking up each palette index in the `.pal` → produce a Bevy `Image`
3. Build a `TextureAtlas` from the frame images (Bevy's sprite sheet system)
4. Spawn a Bevy `SpriteSheetBundle` entity and animate through the idle frames
5. Display in a Bevy window with a simple orthographic camera

**Palette handling:** At this stage, palette application happens on the CPU during asset loading (index → RGBA lookup). The GPU palette shader (for runtime player color remapping, palette cycling) comes in Phase 1 proper. CPU conversion is correct and simple — good enough for validation.

**Player color remapping:** Not needed yet. Just render with the default palette. Player colors (palette indices 80–95) are a Phase 1 concern.

#### Step 3: Load and Render an OpenRA Map (Weeks 4–5)

Parse `.oramap` files and render the terrain grid in correct isometric projection.

**What this proves:** The coordinate system works. Isometric math is correct. Theater palettes load. Terrain tiles tile without visible seams.

**Implementation:**

1. Parse `.oramap` (ZIP archive containing `map.yaml` + `map.bin`)
2. `map.yaml` defines: map size, tileset/theater, player definitions, actor placements
3. `map.bin` is the tile grid: each cell has a tile index + subtile index
4. Load the theater tileset (e.g., `temperat.mix` for Temperate) and its palette
5. For each cell in the grid, look up the terrain tile image and blit it at the correct isometric screen position

**Isometric coordinate transform:**

```
screen_x = (cell_x - cell_y) * tile_half_width
screen_y = (cell_x + cell_y) * tile_half_height
```

Where `tile_half_width = 30` and `tile_half_height = 15` for classic RA's 60×30 diamond tiles (these values come from the original source and OpenRA). This is the `CoordTransform` defined in Phase 0's architecture work.

**Tile rendering order:** Tiles render left-to-right, top-to-bottom in map coordinates. This is the standard isometric painter's algorithm. In Bevy, this translates to setting `Transform.translation.z` based on the cell's Y coordinate (higher Y = lower z = renders behind).

**Map bounds and camera:** The map defines a playable bounds rectangle within the total tile grid. Set the Bevy camera to center on the map and allow panning with arrow keys / edge scrolling. Zoom with scroll wheel.

#### Step 4: Sprites on Map + Idle Animations + Camera (Weeks 6–8)

Place unit and building sprites on the terrain grid. Animate idle loops. Implement camera controls.

**What this proves:** Sprites render at correct positions on the terrain. Z-ordering works (buildings behind units, shadows under vehicles). Animation timing matches the original game.

**Implementation:**

1. Read actor placements from `map.yaml` — each actor has a type name, cell position, and owner
2. Look up the actor's sprite sequence from `sequences/*.yaml` (or the unit rules) — this gives the `.shp` filename, frame ranges for each animation, and facing count
3. For each placed actor, create a Bevy entity with:
   - `SpriteSheetBundle` using the actor's sprite frames
   - `Transform` positioned at the isometric screen location of the actor's cell
   - Z-order based on render layer (see § "Z-Order" above) and Y-position within layer
4. Animate idle sequences: advance frames at the timing specified in the sequence definition
5. Buildings: render the "make" animation's final frame (fully built state)

**Camera system:**

| Control           | Input                    | Behavior                                                        |
| ----------------- | ------------------------ | --------------------------------------------------------------- |
| **Pan**           | Arrow keys / edge scroll | Smoothly move camera. Edge scroll activates within 10px of edge |
| **Zoom**          | Mouse scroll wheel       | Discrete zoom levels (1×, 1.5×, 2×, 3×) or smooth zoom          |
| **Center on map** | Home key                 | Reset camera to map center                                      |
| **Minimap click** | Click on minimap panel   | Camera jumps to clicked location                                |

At this stage, the minimap is a simple downscaled render of the full map — no player colors, no fog. Game-quality minimap rendering comes in Phase 3.

**Z-order validation:** Place overlapping buildings and units in a test map. Verify visually against a screenshot from OpenRA rendering the same map. The 13-layer z-order system (§ "Z-Order" above) must be correct at this step.

#### Step 5: Shroud, Fog-of-War, and Selection (Weeks 9–10)

Add the visual layers that make it feel like an actual game viewport rather than a debug renderer.

**Shroud rendering:** Unexplored areas are black. Explored-but-not-visible areas show terrain but dimmed (fog). The shroud layer renders on top of everything (z-layer 12). Shroud edges use smooth blending tiles (from the tileset) for clean boundaries. At this stage, shroud state is hardcoded (reveal a circle around the map center) — real fog computation comes in Phase 2 with `FogProvider`.

**Selection box:** Left-click-drag draws a selection rectangle. In isometric view, this is traditionally a diamond-shaped selection (rotated 45°) to match the grid orientation, though OpenRA uses a screen-aligned rectangle. IC supports both via QoL toggle (D033). Selected units show a health bar and selection bracket below them.

**Cursor system:** The cursor changes based on what it's hovering over — move cursor on ground, select cursor on own units, attack cursor on enemies. This is the `CursorContext` system. At this stage, implement the visual cursor switching; the actual order dispatch (right-click → move command) is Phase 2 sim work.

#### Step 6: Sidebar Chrome — First Game-Like Frame (Weeks 11–12)

Assemble the classic RA sidebar layout to complete the visual frame. No functionality yet — build queues don't work, credits don't tick, radar doesn't update. But the *layout* is in place.

**What this proves:** Bevy UI can reproduce the RA sidebar layout. Theme YAML (D032) drives the arrangement. The viewport resizes correctly when the sidebar is present.

**Sidebar layout (Classic theme):**

```
┌───────────────────────────────────────────┬────────────┐
│                                           │  RADAR     │
│                                           │  MINIMAP   │
│                                           ├────────────┤
│          GAME VIEWPORT                    │  CREDITS   │
│          (isometric map)                  │  $ 10000   │
│                                           ├────────────┤
│                                           │  POWER BAR │
│                                           │  ████░░░░  │
│                                           ├────────────┤
│                                           │  BUILD     │
│                                           │  QUEUE     │
│                                           │  [icons]   │
│                                           │  [icons]   │
│                                           │            │
├───────────────────────────────────────────┴────────────┤
│  STATUS BAR: selected unit info / tooltip              │
└────────────────────────────────────────────────────────┘
```

**Implementation:** Use Bevy UI (`bevy_ui`) for the sidebar layout. The sidebar is a fixed-width panel on the right. The game viewport fills the remaining space. Each sidebar section is a placeholder panel with correct sizing and positioning. The radar minimap shows the downscaled terrain render from Step 4. Build queue icons show static sprite images from the unit/building sequences.

**Theme loading:** Read a `theme.yaml` (D032) that defines: sidebar width, section heights, font, color palette, chrome sprite sheet references. At this stage, only the Classic theme exists — but the loading system is in place so future themes just swap the YAML.

### Content Detection — Finding RA Assets

Before any of the above steps can run, the engine must locate the player's Red Alert game files. IC never distributes copyrighted assets — it loads them from games the player already owns.

**Detection sources (probed at first launch):**

| Source               | Detection Method                                                                   | Priority |
| -------------------- | ---------------------------------------------------------------------------------- | -------- |
| **Steam**            | `SteamApps/common/CnCRemastered/` or `SteamApps/common/Red Alert/` via Steam paths | 1        |
| **GOG**              | Registry key or default GOG install path                                           | 2        |
| **Origin / EA App**  | Registry key for C&C Ultimate Collection                                           | 3        |
| **OpenRA**           | `~/.openra/Content/ra/` — OpenRA's own content download                            | 4        |
| **Manual directory** | Player points to a folder containing `.mix` files                                  | 5        |

If no content source is found, the first-launch flow guides the player to either install the game from a platform they own it on, or point to existing files. IC does not download game files from the internet (legal boundary).

See `05-FORMATS.md` § "Content Source Detection and Installed Asset Locations" for detailed source probing logic and the `ContentSource` enum.

### Timeline Summary

| Weeks | Step                 | Milestone                                                    | Phase Alignment |
| ----- | -------------------- | ------------------------------------------------------------ | --------------- |
| 1–2   | `ra-formats` parsers | CLI can dump any MIX/SHP/PAL/TMP/AUD file                    | Phase 0         |
| 3     | Bevy + one sprite    | Window opens, animated RA infantry on screen                 | Phase 0 → 1     |
| 4–5   | Map rendering        | Any `.oramap` renders as isometric terrain grid              | Phase 1         |
| 6–8   | Sprites + animations | Units and buildings on map, idle animations, camera controls | Phase 1         |
| 9–10  | Shroud + selection   | Fog overlay, selection box, cursor context switching         | Phase 1         |
| 11–12 | Sidebar chrome       | Classic RA layout assembled — first complete visual frame    | Phase 1         |

**Phase 0 exit:** Steps 1–2 complete (parsers + one sprite in Bevy). **Phase 1 exit:** All six steps complete — any OpenRA RA map loads and renders with sprites, animations, camera, shroud, and sidebar layout at 144fps on mid-range hardware.

After Step 6, the rendering slice is done. The next work is Phase 2: making the units actually *do* things (move, shoot, die) in a deterministic simulation. See `08-ROADMAP.md` § Phase 2.
