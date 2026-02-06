# 04 — Modding System

## Three-Tier Architecture

```
Ease of use ▲
             │  ┌─────────────────────────┐
             │  │  YAML rules / data       │  ← 80% of mods (Tier 1)
             │  │  (units, weapons, maps)  │
             │  ├─────────────────────────┤
             │  │  Lua scripts             │  ← missions, AI, abilities (Tier 2)
             │  │  (event hooks, triggers) │
             │  ├─────────────────────────┤
             │  │  WASM modules            │  ← new mechanics, total conversions (Tier 3)
             │  │  (Rust/C/AssemblyScript) │
             │  └─────────────────────────┘
Power      ▼
```

Each tier is optional. A modder who wants to change tank cost never sees code. A modder building a total conversion uses WASM.

## Tier 1: Data-Driven (YAML Rules)

### Decision: Real YAML, Not MiniYAML

OpenRA uses "MiniYAML" — a custom dialect that uses tabs, has custom inheritance (`^`, `@`), and doesn't comply with the YAML spec. Standard parsers choke on it.

**Our approach:** Standard YAML with `serde_yaml`, inheritance resolved at load time.

**Rationale:**
- `serde` + `serde_yaml` → typed Rust struct deserialization for free
- Every text editor has YAML support, linters, formatters
- JSON-schema validation catches errors before the game loads
- No custom parser to maintain

### Example Unit Definition

```yaml
# units/allies/infantry.yaml
units:
  rifle_infantry:
    inherits: _base_soldier
    display:
      name: "Rifle Infantry"
      icon: e1icon
      sequences: e1
    buildable:
      cost: 100
      time: 5.0
      queue: infantry
      prerequisites: [barracks]
    health:
      max: 50
      armor: none
    mobile:
      speed: 56
      locomotor: foot
    combat:
      weapon: m1_carbine
      attack_sequence: shoot
```

### Inheritance System

Templates use `_` prefix convention (not spawnable units):

```yaml
# templates/_base_soldier.yaml
_base_soldier:
  mobile:
    locomotor: foot
    turn_speed: 5
  health:
    armor: none
  selectable:
    bounds: [12, 18]
    voice: generic_infantry
```

Inheritance is resolved at load time in Rust. Fields from `_base_soldier` are merged, then overridden by the child definition.

### Rust Deserialization

```rust
#[derive(Deserialize)]
struct UnitDef {
    inherits: Option<String>,
    display: DisplayInfo,
    buildable: Option<BuildableInfo>,
    health: HealthInfo,
    mobile: Option<MobileInfo>,
    combat: Option<CombatInfo>,
}
```

### MiniYAML Migration

Part of `ra-formats` crate: a `miniyaml2yaml` converter tool that translates existing OpenRA mod data to standard YAML. One-time migration per mod.

### Why Not TOML / RON / JSON?

| Format | Verdict | Reason |
|--------|---------|--------|
| TOML | Reject | Awkward for deeply nested game data |
| RON | Reject | Modders won't know it, thin editor support |
| JSON | Reject | Too verbose, no comments, miserable for hand-editing |
| YAML | Accept | Human-readable, universal tooling, serde integration |

## Tier 2: Lua Scripting

### Decision: Lua over Python

**Why Lua:**
- Tiny runtime (~200KB)
- Designed for embedding — exists for this purpose
- Deterministic (provide fixed-point math bindings, no floats)
- Trivially sandboxable (control exactly what functions are available)
- Industry standard: Factorio, WoW, Garry's Mod, Dota 2, Roblox
- `mlua` or `rlua` crates are mature
- Any modder can learn in an afternoon

**Why NOT Python:**
- Floating-point non-determinism breaks lockstep multiplayer
- GC pauses (reintroduces the problem Rust solves)
- 50-100x slower than native (hot paths run every tick for every unit)
- Embedding CPython is heavy (~15-30MB)
- Sandboxing is basically unsolvable — security disaster for community mods
- `import os; os.system("rm -rf /")` is one mod away

### Lua API Examples

```lua
-- Mission scripting
function OnPlayerEnterArea(player, area)
  if area == "bridge_crossing" then
    SpawnReinforcements("allies", {"Tank", "Tank"}, "north")
    PlayEVA("reinforcements_arrived")
  end
end

-- Custom unit behavior
Hooks.OnUnitCreated("ChronoTank", function(unit)
  unit:AddAbility("chronoshift", {
    cooldown = 120,
    range = 15,
    onActivate = function(target_cell)
      PlayEffect("chrono_flash", unit.position)
      unit:Teleport(target_cell)
      PlayEffect("chrono_flash", target_cell)
    end
  })
end)
```

### Lua Sandbox Rules

- Only engine-provided functions available (no `io`, `os`, `require` from filesystem)
- Fixed-point math provided via engine bindings (no raw floats)
- Execution time limits per tick
- Memory limits per mod

## Tier 3: WASM Modules

### Rationale

- Near-native performance for complex mods
- Perfectly sandboxed by design (WASM's memory model)
- Deterministic execution (critical for multiplayer)
- Modders write in Rust, C, Go, AssemblyScript, or even Python compiled to WASM
- `wasmtime` or `wasmer` crates

### WASM Host API (Security Boundary)

```rust
// The WASM host functions are the ONLY API mods can call.
// The API surface IS the security boundary.

#[wasm_host_fn]
fn get_unit_position(unit_id: u32) -> Option<(i32, i32)> {
    let unit = sim.get_unit(unit_id)?;
    // CHECK: is this unit visible to the mod's player?
    if !sim.is_visible_to(mod_player, unit.position) {
        return None;  // Mod cannot see fogged units
    }
    Some(unit.position)
}

// There is no get_all_units() function.
// There is no get_enemy_state() function.
```

### Mod Capabilities System

```rust
pub struct ModCapabilities {
    pub read_own_state: bool,
    pub read_visible_state: bool,
    // Can NEVER read fogged state (API doesn't exist)
    pub issue_orders: bool,           // For AI mods
    pub filesystem: FileAccess,       // Usually None
    pub network: NetworkAccess,       // Usually None
}

pub enum NetworkAccess {
    None,                          // Most mods
    AllowList(Vec<String>),        // UI mods fetching assets
    // NEVER unrestricted
}
```

## Tera Templating (Phase 6, Nice-to-Have)

Optional preprocessing for YAML/Lua generation. Eliminates copy-paste for faction variants.

```jinja
{% for faction in ["allies", "soviet"] %}
{% for tier in [1, 2, 3] %}
{{ faction }}_tank_t{{ tier }}:
  inherits: _base_tank
  health:
    max: {{ 200 + tier * 100 }}
  buildable:
    cost: {{ 500 + tier * 300 }}
{% endfor %}
{% endfor %}
```

Load-time only (zero runtime cost). ~50 lines to integrate. Not a foundation piece.
