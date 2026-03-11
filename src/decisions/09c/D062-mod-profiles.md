## D062: Mod Profiles & Virtual Asset Namespace

**Decision:** Introduce a layered asset composition model inspired by LVM's mark → pool → present pattern. Two new first-class concepts: **mod profiles** (named, hashable, switchable mod compositions) and a **virtual asset namespace** (a resolved lookup table mapping logical asset paths to content-addressed blobs).

**Core insight:** IC's three-phase data loading (D003, Factorio-inspired), dependency-graph ordering, and modpack manifests (D030) already describe a composition — but the composed result is computed on-the-fly at load time and dissolved into merged state. There's no intermediate object that represents "these N sources in this priority order with these conflict resolutions" as something you can name, hash, inspect, diff, save, or share independently. Making the composition explicit unlocks capabilities that the implicit version can't provide.

### The Three-Layer Model

The model separates mod loading into three explicit phases, inspired by LVM's physical volumes → volume groups → logical volumes:

| Layer              | LVM Analog      | IC Concept                       | What It Is                                                                                                                                                                               |
| ------------------ | --------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source** (PV)    | Physical Volume | Registered mod/package/base game | A validated, installed content source — its files exist, its manifest is parsed, its dependencies are resolved. Immutable once registered.                                               |
| **Profile** (VG)   | Volume Group    | Mod profile                      | A named composition: which sources, in what priority order, with what conflict resolutions and experience settings. Saved as a TOML file (D067 — infrastructure, not content). Hashable. |
| **Namespace** (LV) | Logical Volume  | Virtual asset namespace          | The resolved lookup table: for every logical asset path, which blob (from which source) answers the query. Built from a profile at activation time. What the engine actually loads from. |

**The model does NOT replace three-phase data loading.** Three-phase loading (Define → Modify → Final-fixes) organizes *when* modifications apply during profile activation. The profile organizes *which* sources participate. They're orthogonal — the profile says "use mods A, B, C in this order" and three-phase loading says "first all Define phases, then all Modify phases, then all Final-fixes phases."

### Mod Profiles

A mod profile is a TOML file in the player's configuration directory that captures a complete, reproducible mod setup:

```toml
# <data_dir>/profiles/tournament-s5.toml

[profile]
name = "Tournament Season 5"
game_module = "ra1"

# Which mods participate, in priority order (later overrides earlier)
# Engine defaults and base game assets are always implicitly first

[[sources]]
id = "official/tournament-balance"
version = "=1.3.0"

[[sources]]
id = "official/hd-sprites"
version = "=2.0.1"

[[sources]]
id = "community/improved-explosions"
version = "^1.0.0"

# Explicit conflict resolutions (same role as conflicts.yaml, but profile-scoped)

[[conflicts]]
unit = "heavy_tank"
field = "health.max"
use_source = "official/tournament-balance"

# Experience profile axes (D033) — bundled with the mod set
[experience]
balance = "classic"           # D019
theme = "remastered"          # D032
behavior = "iron_curtain"     # D033
ai_behavior = "enhanced"      # D043
pathfinding = "ic_default"    # D045
render_mode = "hd_sprites"    # D048
```

**Relationship to existing concepts:**

- **Experience profiles (D033)** set 6 switchable axes (balance, theme, behavior, AI, pathfinding, render mode) but don't specify *which community mods* are active. A mod profile bundles experience settings WITH the mod set — one object captures the full player experience.
- **Modpacks (D030)** are published, versioned Workshop resources. A mod profile is a local, personal composition. **Publishing a mod profile creates a modpack** — `ic mod publish-profile` snapshots the profile into a `mod.toml` modpack manifest for Workshop distribution. This makes mod profiles the local precursor to modpacks: curators build and test profiles locally, then publish the working result.
- **`conflicts.yaml` (existing)** is a global conflict override file. Profile-scoped conflicts apply only when that profile is active. Both mechanisms coexist — profile conflicts take precedence, then global `conflicts.yaml`, then default last-wins behavior.

**Profile operations:**

```bash
# Create a profile from the currently active mod set
ic profile save "tournament-s5"

# List saved profiles
ic profile list

# Activate a profile (loads its mods + experience settings)
ic profile activate "tournament-s5"

# Show what a profile resolves to (namespace preview + conflict report)
ic profile inspect "tournament-s5"

# Diff two profiles — which assets differ, which conflicts resolve differently
ic profile diff "tournament-s5" "casual-hd"

# Publish as a modpack to Workshop
ic mod publish-profile "tournament-s5"

# Import a Workshop modpack as a local profile
ic profile import "alice/red-apocalypse-pack"
```

**In-game UX:** The mod manager gains a profile dropdown (top of the mod list). Switching profiles reconfigures the active mod set and experience settings in one action. In multiplayer lobbies, the host's profile fingerprint is displayed — joining players with the same fingerprint skip per-mod verification. Players with a different configuration see a diff view: "You're missing mod X" or "You have mod Y v2.0, lobby has v2.1" with one-click resolution (download missing, update mismatched).

### Virtual Asset Namespace

When a profile is activated, the engine builds a **virtual asset namespace** — a complete lookup table mapping every logical asset path to a specific content-addressed blob from a specific source. This is functionally an OverlayFS union view over the content-addressed store (D049 local CAS).

```
Namespace for profile "Tournament Season 5":
  sprites/rifle_infantry.shp    → blob:a7f3e2... (source: official/hd-sprites)
  sprites/medium_tank.shp       → blob:c4d1b8... (source: official/hd-sprites)
  rules/units/infantry.yaml     → blob:9e2f0a... (source: official/tournament-balance)
  rules/units/vehicles.yaml     → blob:1b4c7d... (source: engine-defaults)
  audio/rifle_fire.aud          → blob:e8a5f1... (source: base-game)
  effects/explosion_large.yaml  → blob:f2c8d3... (source: community/improved-explosions)
```

**Key properties:**

- **Deterministic:** Same profile + same source versions = identical namespace. The fingerprint (SHA-256 of the sorted namespace entries) proves it.
- **Inspectable:** `ic profile inspect` dumps the full namespace with provenance — which source provided which asset. Invaluable for debugging "why does my tank look wrong?" (answer: mod X overrode the sprite at priority 3).
- **Diffable:** `ic profile diff` compares two namespaces entry-by-entry — shows exact asset-level differences between two mod configurations. Critical for modpack curators testing variations.
- **Cacheable:** The namespace is computed once at profile activation and persisted as a lightweight index. Asset loads during gameplay are simple hash lookups — no per-load directory scanning or priority resolution.

**Integration with Bevy's asset system:** The virtual namespace registers as a custom Bevy `AssetSource` that resolves asset paths through the namespace lookup table rather than filesystem directory traversal. When Bevy requests `sprites/rifle_infantry.shp`, the namespace resolves it to `workshop/blobs/a7/a7f3e2...` (the CAS blob path). This sits between IC's mod resolution layer and Bevy's asset loading — Bevy sees a flat namespace, unaware of the layering beneath.

```rust
/// A resolved mapping from logical asset path to content-addressed blob.
pub struct VirtualNamespace {
    /// Logical path → (blob hash, source that provided it)
    entries: HashMap<AssetPath, NamespaceEntry>,
    /// SHA-256 of the sorted entries — the profile fingerprint
    fingerprint: [u8; 32],
}

pub struct NamespaceEntry {
    pub blob_hash: [u8; 32],
    pub source_id: ModId,
    pub source_version: Version,
    /// How this entry won: default, last-wins, explicit-conflict-resolution
    pub resolution: ResolutionReason,
}

pub enum ResolutionReason {
    /// Only one source provides this path — no conflict
    Unique,
    /// Multiple sources; this one won via load-order priority (last-wins)
    LastWins { overridden: Vec<ModId> },
    /// Explicit resolution from profile conflicts or conflicts.yaml
    ExplicitOverride { reason: String },
    /// Engine default (no mod provides this path)
    EngineDefault,
}
```

### Namespace Resolution Algorithm (Overlay Composition)

The namespace is built by recursively composing sources as overlay layers — a pattern formalized by AnyFS's generic `Overlay<Base, Upper>` struct. Each source in the profile's priority order is an overlay layer: reads check the upper (higher-priority) source first, then fall through to the base (lower-priority). The recursive type enforces resolution order at compile time:

```
Overlay<Overlay<Overlay<EngineDefaults, BaseGame>, TournamentBalance>, HdSprites>
                                                    ↑ checked last       ↑ checked first
```

In practice, IC builds this as a flat vector walk (not nested generics) because the source count is dynamic and determined at profile activation time:

```rust
impl VirtualNamespace {
    /// Build namespace from profile sources in priority order.
    /// Last source wins for file assets; YAML rules use three-phase merge.
    fn build(sources: &[ResolvedSource], conflicts: &ConflictPolicy) -> Self {
        let mut entries = HashMap::new();
        // Walk sources from lowest to highest priority (engine defaults first)
        for source in sources {
            for (path, blob_hash) in &source.file_manifest {
                let resolution = if entries.contains_key(path) {
                    conflicts.resolve(path, &source.id, &entries[path].source_id)
                } else {
                    ResolutionReason::Unique
                };
                if matches!(resolution, ResolutionReason::Unique
                    | ResolutionReason::LastWins { .. }
                    | ResolutionReason::ExplicitOverride { .. })
                {
                    entries.insert(path.clone(), NamespaceEntry {
                        blob_hash: *blob_hash,
                        source_id: source.id.clone(),
                        source_version: source.version.clone(),
                        resolution,
                    });
                }
            }
        }
        let fingerprint = Self::compute_fingerprint(&entries);
        Self { entries, fingerprint }
    }
}
```

The key insight from AnyFS's overlay model: writes go to the upper layer, never modifying the base. In IC's context, this means **mods never mutate engine defaults or lower-priority sources** — the namespace entry records the override as provenance, preserving the full composition history for inspection and diffing.

### Namespace for YAML Rules (Not Just File Assets)

The virtual namespace covers two distinct layers:

1. **File assets** — sprites, audio, models, textures. Resolved by path → blob hash. Simple overlay; last-wins per path.

2. **YAML rule state** — the merged game data after three-phase loading. This is NOT a simple file overlay — it's the result of Define → Modify → Final-fixes across all active mods. The namespace captures the *output* of this merge as a serialized snapshot. This snapshot IS the fingerprint's primary input — two players with identical fingerprints have identical merged rule state, guaranteed.

The YAML rule merge runs during profile activation (not per-load). The merged result is cached. If no mods change, the cache is valid. This is the same work the engine already does — the namespace just makes the result explicit and hashable.

### Multiplayer Integration

**Lobby fingerprint verification:** When a player joins a lobby, the client sends its active profile fingerprint. If it matches the host's fingerprint, the player is guaranteed to have identical game data — no per-mod version checking needed. If fingerprints differ, the lobby computes a namespace diff and presents actionable resolution:

- **Missing mods:** "Download mod X?" (triggers D030 auto-download)
- **Version mismatch:** "Update mod Y from v2.0 to v2.1?" (one-click update)
- **Conflict resolution difference:** "Host resolves heavy_tank.health.max from mod A; you resolve from mod B" — player can accept host's profile or leave

This replaces the current per-mod version list comparison with a single hash comparison (fast path) and falls back to detailed diff only on mismatch. The diff view is more informative than the current "incompatible mods" rejection.

**Replay recording:** Replays record the profile fingerprint alongside the existing `(mod_id, version)` list. Playback verifies the fingerprint. A fingerprint mismatch warns but doesn't block playback — the existing mod list provides degraded compatibility checking.

**Content channel integration:** When a player subscribes to a balance channel (D049 § "Content Channels Integration"), the active balance snapshot ID is incorporated into the fingerprint. This ensures lobby verification captures not just which mods are installed, but which live balance state is active. The snapshot acts as an additional overlay source in namespace resolution — highest priority, applied after all mod sources and conflict resolutions. See [D049 § Content Channels Integration](../09e/D049/D049-content-channels-integration.md) for the full lifecycle and [architecture/data-flows-overview.md](../architecture/data-flows-overview.md) § Flow 5.

### Editor Integration (D038)

The scenario editor benefits from profile-aware asset resolution:

- **Layer isolation:** The editor can show "assets from mod X" vs "assets from engine defaults" in separate layer views — same UX pattern as the editor's own entity layers with lock/visibility.
- **Hot-swap a single source:** When editing a mod's YAML rules, the editor rebuilds only that source's contribution to the namespace rather than re-running the full three-phase merge across all N sources. This enables sub-second iteration for rule authoring.
- **Source provenance in tooltips:** Hovering over a unit in the editor shows "defined in engine-defaults, modified by official/tournament-balance" — derived directly from namespace entry provenance.

### Alternatives Considered

- **Just use modpacks (D030)** — Modpacks are the published form; profiles are the local form. Without profiles, curators manually reconstruct their mod configuration every session. Profiles make the curator workflow reproducible.
- **Bevy AssetSources alone** — Bevy's `AssetSource` API can layer directories, but it doesn't provide conflict detection, provenance tracking, fingerprinting, or diffing. The namespace sits above Bevy's loader, not instead of it.
- **Full OverlayFS on the filesystem** — Overkill. The namespace is an in-memory lookup table, not a filesystem driver. We get the same logical result without OS-level complexity or platform dependencies.
- **Hash per-mod rather than hash the composed namespace** — Per-mod hashes miss the composition: same mods + different conflict resolutions = different gameplay. The namespace fingerprint captures the actual resolved state.
- **Make profiles mandatory** — Rejected. A player who installs one mod and clicks play shouldn't need to understand profiles. The engine creates a default implicit profile from the active mod set. Profiles become relevant when players want multiple configurations or when modpack curators need reproducibility.

### Integration with Existing Decisions

- **D003 (Real YAML):** YAML rule merge during profile activation uses the same `serde_yaml` pipeline. The namespace captures the merge result, not the raw files.
- **D019 (Balance Presets):** Balance preset selection is a field in the mod profile. Switching profiles can switch the balance preset simultaneously.
- **D030 (Workshop):** Modpacks are published snapshots of mod profiles. `ic mod publish-profile` bridges local profiles to Workshop distribution. Workshop modpacks import as local profiles via `ic profile import`.
- **D033 (Experience Profiles):** Experience profile axes (balance, theme, behavior, AI, pathfinding, render mode) are embedded in mod profiles. A mod profile is a superset: experience settings + mod set + conflict resolutions.
- **D034 (SQLite):** The namespace index is optionally cached in SQLite for fast profile switching. Profile metadata (name, fingerprint, last-activated) is stored alongside other player preferences.
- **D038 (Scenario Editor):** Editor uses namespace provenance for source attribution and per-layer hot-swap during development.
- **D049 (Workshop Asset Formats & P2P / CAS):** The virtual namespace maps logical paths to content-addressed blobs in the local CAS store. The namespace IS the virtualization layer that makes CAS usable for gameplay asset loading.
- **D058 (Console):** `/profile list`, `/profile activate <name>`, `/profile inspect`, `/profile diff <a> <b>`, `/profile save <name>` console commands.

### Phase

- **Phase 2:** Implicit default profile — the engine internally constructs a namespace from the active mod set at load time. No user-facing profile concept yet, but the `VirtualNamespace` struct exists and is used for asset resolution. Fingerprint is computed and recorded in replays.
- **Phase 4:** `ic profile save/list/activate/inspect/diff` CLI commands. Profile YAML schema stabilized. Modpack curators can save and switch profiles during testing.
- **Phase 5:** Lobby fingerprint verification replaces per-mod version list comparison. Namespace diff view in lobby UI. `/profile` console commands. Replay fingerprint verification on playback.
- **Phase 6a:** `ic mod publish-profile` publishes a local profile as a Workshop modpack. `ic profile import` imports modpacks as local profiles. In-game mod manager gains profile dropdown. Editor provenance tooltips and per-source hot-swap.
