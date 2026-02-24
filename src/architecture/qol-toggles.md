## QoL & Gameplay Behavior Toggles (D033)

Every quality-of-life improvement from OpenRA and the Remastered Collection is **individually toggleable** — attack-move, multi-queue production, health bars, range circles, guard command, waypoint queuing, and dozens more. Built-in presets group toggles into coherent profiles:

| Preset                   | Feel                                      |
| ------------------------ | ----------------------------------------- |
| `vanilla`                | Authentic 1996 — no modern QoL            |
| `openra`                 | All OpenRA improvements enabled           |
| `remastered`             | Remastered Collection's specific QoL set  |
| `iron_curtain` (default) | Best features cherry-picked from all eras |

Toggles are categorized as **sim-affecting** (production rules, unit commands — synced in lobby) or **client-only** (health bars, range circles — per-player preference). This split preserves determinism (invariant #1) while giving each player visual/UX freedom.

### Experience Profiles

D019 (balance), D032 (theme), D033 (behavior), D043 (AI behavior), D045 (pathfinding feel), and D048 (render mode) are six independent axes that compose into **experience profiles**. Selecting "Vanilla RA" sets all six to classic in one click. Selecting "Iron Curtain" sets classic balance + modern theme + best QoL + enhanced AI + modern movement + HD graphics. After selecting a profile, any individual setting can still be overridden.

**Mod profiles (D062)** are a superset of experience profiles: they bundle the six experience axes WITH the active mod set and conflict resolutions into a single named, hashable object. A mod profile answers "what mods am I running AND how is the game configured?" in one saved YAML file. The profile's fingerprint (SHA-256 of the resolved virtual asset namespace) enables single-hash compatibility checking in multiplayer lobbies. Switching profiles reconfigures both the mod set and experience settings in one action. Publishing a local mod profile via `ic mod publish-profile` creates a Workshop modpack (D030). See `decisions/09c-modding.md` § D062.

See `decisions/09d/D033-qol-presets.md` for the full toggle catalog, YAML schema, and sim/client split details. See D043 for AI behavior presets, D045 for pathfinding behavior presets, and D048 for switchable render modes.
