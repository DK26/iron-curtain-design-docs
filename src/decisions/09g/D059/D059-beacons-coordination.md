### 3. Beacons and Tactical Pings

The non-verbal coordination layer. Research shows this is often more effective than voice for spatial RTS communication — Respawn Entertainment play-tested Apex Legends for a month with no voice chat and found their ping system "rendered voice chat with strangers largely unnecessary" (Polygon review). EA opened the underlying patent (US 11097189, "Contextually Aware Communications Systems") for free use in August 2021.

#### OpenRA Beacon Compatibility (D024)

OpenRA's Lua API includes `Beacon` (map beacon management) and `Radar` (radar ping control) globals. IC must support these for mission script compatibility:

- `Beacon.New(owner, pos, duration, palette, isPlayerPalette)` — create a map beacon
- `Radar.Ping(player, pos, color, duration)` — flash a radar ping on the minimap

IC's beacon system is a superset — OpenRA's beacons are simple map markers with duration. IC adds contextual types, entity targeting, and the ping wheel (see below). OpenRA beacon/radar Lua calls map to `PingType::Generic` with appropriate visual parameters.

#### Ping Type System

```rust
/// Contextual ping types. Each has a distinct visual, audio cue, and
/// minimap representation. The set is fixed at the engine level but
/// game modules can register additional types via YAML.
///
/// Inspired by Apex Legends' contextual ping system, adapted for RTS:
/// Apex pings communicate "what is here" for a shared 3D space.
/// RTS pings communicate "what should we do about this location" for
/// a top-down strategic view. The emphasis shifts from identification
/// to intent.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PingType {
    /// General attention ping. "Look here."
    /// Default when no contextual modifier applies.
    Generic,
    /// Attack order suggestion. "Attack here / attack this unit."
    /// Shows crosshair icon. Red minimap flash.
    Attack,
    /// Defend order suggestion. "Defend this location."
    /// Shows shield icon. Blue minimap flash.
    Defend,
    /// Warning / danger alert. "Enemies here" or "be careful."
    /// Shows exclamation icon. Yellow minimap flash. Pulsing audio cue.
    Danger,
    /// Rally point. "Move units here" / "gather here."
    /// Shows flag icon. Green minimap flash.
    Rally,
    /// Request assistance. "I need help here."
    /// Shows SOS icon. Orange minimap flash with urgency pulse.
    Assist,
    /// Enemy spotted — marks a position where enemy units were seen.
    /// Auto-fades after the fog of war re-covers the area.
    /// Shows eye icon. Red blinking on minimap.
    EnemySpotted,
    /// Economic marker. "Expand here" / "ore field here."
    /// Shows resource icon. Green on minimap.
    Economy,
}
```

#### Contextual Ping (Apex Legends Adaptation)

The ping type auto-selects based on what's under the cursor when the ping key is pressed:

| Cursor Target                      | Auto-Selected Ping | Visual                             |
| ---------------------------------- | ------------------ | ---------------------------------- |
| Empty terrain (own territory)      | `Rally`            | Flag marker at position            |
| Empty terrain (enemy territory)    | `Attack`           | Crosshair marker at position       |
| Empty terrain (neutral/unexplored) | `Generic`          | Diamond marker at position         |
| Visible enemy unit                 | `EnemySpotted`     | Eye icon tracking the unit briefly |
| Own damaged building               | `Assist`           | SOS icon on building               |
| Ore field / resource               | `Economy`          | Resource icon at position          |
| Fog-of-war edge                    | `Danger`           | Exclamation at fog boundary        |

**Override via ping wheel:** Holding the ping key (default: `G`) opens a radial menu (ping wheel) showing all 8 ping types. Flick the mouse in the desired direction to select. Release to place. Quick-tap (no hold) uses the contextual default. This two-tier interaction (quick contextual + deliberate selection) follows Apex Legends' proven UX pattern.

#### Ping Wheel UI

```
              Danger
         ╱            ╲
    Defend              Attack
       │    [cursor]     │
    Assist              Rally
         ╲            ╱
         Economy    EnemySpotted
              Generic
```

The ping wheel is a radial menu rendered by `ic-ui`. Each segment shows the ping type icon and name. The currently highlighted segment follows the mouse direction from center. Release places the selected ping type. Escape cancels.

**Controller support (Steam Deck / future console):** Ping wheel opens on right stick click, direction selected via stick. Quick-ping on D-pad press.

#### Ping Properties

```rust
/// A placed ping marker. Managed by ic-ui (rendering) and forwarded
/// to the sim via PlayerOrder::TacticalPing for replay recording.
pub struct PingMarker {
    pub id: PingId,
    pub owner: PlayerId,
    pub ping_type: PingType,
    pub pos: WorldPos,
    /// If the ping was placed on a specific entity, track it.
    /// The marker follows the entity until it dies or the ping expires.
    pub tracked_entity: Option<UnitTag>,
    /// Ping lifetime. Default 8 seconds. Danger pings pulse.
    pub duration: Duration,
    /// Audio cue played on placement. Each PingType has a distinct sound.
    pub audio_cue: PingAudioCue,
    /// Optional short label for typed/role-aware pings (e.g., "AA", "LZ A").
    /// Empty by default for quick pings. Bounded and sanitized.
    pub label: Option<String>,
    /// Optional appearance override for scripted beacons / D070 typed markers.
    /// Core ping semantics still require shape/icon cues; color cannot be the
    /// only differentiator (accessibility and ranked readability).
    pub style: Option<CoordinationMarkerStyle>,
    /// Tick when placed (for expiration).
    pub placed_at: u64,
}
```

**Ping rate limiting:** Max 3 pings per 5 seconds per player (configurable). Exceeding the limit suppresses pings with a cooldown indicator. This prevents ping spam, which is a known toxicity vector in games with ping systems (LoL's "missing" ping spam problem).

**Ping persistence:** Pings are ephemeral — they expire after `duration` (default 8 seconds). They do NOT persist in save games. They DO appear in replays (via `PlayerOrder::TacticalPing` in the order stream).

**Audio feedback:** Each ping type has a distinct short audio cue (< 300ms). Incoming pings from teammates play the cue with a minimap flash. Audio volume follows the `voice.ping_volume` cvar (D058). Repeated rapid pings from the same player have diminishing audio (third ping in 5 seconds is silent) to reduce annoyance.

#### Beacon/Marker Colors and Optional Labels (Generals/OpenRA-style clarity, explicit in IC)

IC already supports pings and tactical markers; this section makes the **appearance and text-label rules explicit** so "colored beaconing with optional text" is a first-class, replay-safe communication feature (not an implied UI detail).

```rust
/// Shared style metadata used by pings/beacons/tactical markers.
/// Presentation-only; gameplay semantics remain in ping/marker type.
pub struct CoordinationMarkerStyle {
    pub color: MarkerColorStyle,
    pub text_label: Option<String>,       // bounded/sanitized tactical label (normalized bytes + display width caps)
    pub visibility: MarkerVisibility,     // team/allies/observers/scripted
    pub ttl_ticks: Option<u64>,           // None = persistent until cleared
}

#[derive(Clone, Copy, Debug)]
pub enum MarkerColorStyle {
    /// Use the canonical color for the ping/marker type (default).
    Canonical,
    /// Use the sender's player color (for team readability / ownership).
    PlayerColor,
    /// Use a predefined semantic color override (`Purple`, `White`, etc.).
    /// Mods/scenarios can expose a safe palette, not arbitrary RGB strings.
    Preset(CoordinationColorPreset),
}

#[derive(Clone, Copy, Debug)]
pub enum CoordinationColorPreset {
    White,
    Cyan,
    Purple,
    Orange,
    Red,
    Blue,
    Green,
    Yellow,
}

#[derive(Clone, Copy, Debug)]
pub enum MarkerVisibility {
    Team,
    AlliedTeams,
    Observer,        // tournament/admin overlays
    ScriptedAudience // mission-authored overlays / tutorials
}
```

**Rules (normative):**

- **Core ping types keep canonical meaning.** `Attack`, `Danger`, `Defend`, etc. retain distinct icons/shapes/audio, even if a style override adjusts accent color.
- **Color is never the only signal.** Icons, animation, shape, and text cues remain required (colorblind-safe requirement).
- **Optional labels are short and tactical.** Max 16 chars, sanitized, no markup; examples: `AA`, `LZ-A`, `Bridge`, `Push 1`.
- **Rate limits still apply.** Styled/labeled beacons count against the same ping/marker budgets (no spam bypass via labels/colors).
- **Replay-safe.** Label text and style metadata are preserved in replay coordination events (subject to replay stripping rules where applicable).
- **Fog-of-war and audience scope still apply.** Visibility follows team/observer/scripted rules; styling cannot leak hidden intel.

**Recommended defaults:**

- Quick ping (`G` tap): no label, canonical color, ephemeral
- Ping wheel (`Hold G`): no label by default, canonical color
- Tactical marker/beacon (`/marker`, marker submenu): optional short label + optional preset color
- D070 typed support markers (`lz`, `cas_target`, `recon_sector`): canonical type color by default, optional short label (`LZ B`, `CAS 2`)

#### RTL / BiDi Support for Chat and Marker Labels (Localization + Safety Split)

IC must support legitimate RTL (Arabic/Hebrew) communication text **without** weakening anti-spoof protections.

**Rules (normative):**

- **Display correctness:** Chat messages, ping labels, and tactical marker labels use the shared UI text renderer with Unicode BiDi + shaping support (see `02-ARCHITECTURE.md` layout/text contract).
- **Safety filtering is input-side, not display-side.** D059 sanitization removes dangerous spoofing controls and abusive invisible characters before order injection, but it does **not** reject legitimate RTL script content.
- **Bounds apply to display width and byte payload.** Label limits are enforced on both normalized byte length and rendered width so short tactical labels remain readable across scripts.
- **Direction does not replace semantics.** Marker meaning remains icon/type-driven. RTL labels are additive and must not become the only differentiator (same accessibility rule as color).
- **Replay preservation:** Normalized label bytes are stored in replay events so cross-language moderation/review tooling can reconstruct the original tactical communication context.

**Minimum test cases (required for `M7.UX.D059_RTL_CHAT_MARKER_TEXT_SAFETY`):**

1. **Pure RTL chat message renders correctly** (Arabic/Hebrew text displays in correct order; Arabic joins/shaping are preserved).
2. **Mixed-script chat renders correctly** (`RTL + LTR + numerals`, e.g. `LZ-ב 2`, `CAS 2 هدف`) with punctuation/numerals placed by BiDi rules.
3. **RTL tactical marker labels remain readable under bounds** (byte limit + rendered-width limit both enforced; truncation/ellipsis does not clip glyphs or hide marker semantics).
4. **Dangerous spoofing controls are filtered without breaking legitimate text** (bidi override/invisible abuse stripped or rejected, while normal Arabic/Hebrew labels survive normalization).
5. **Replay preservation is deterministic** (normalized chat/marker-label bytes record and replay identically across clients/platforms).
6. **Moderation/review surfaces render parity** (review UI shows the same normalized RTL/mixed-script text as the original chat/marker context, without color-only reliance).

Use the canonical test dataset in `src/tracking/rtl-bidi-qa-corpus.md` (especially categories `A`, `B`, `D`, `F`, and `G`) to keep runtime/replay/moderation behavior aligned across platforms and regressions reproducible.

**Examples (valid):**
- `هدف` (Objective)
- `LZ-ب`
- `גשר` (Bridge)
- `CAS 2`

### 4. Novel Coordination Mechanics

Beyond standard chat/voice/pings, IC introduces coordination tools not found in other RTS games:

#### 4a. Chat Wheel (Dota 2 / Rocket League Pattern)

A radial menu of pre-defined phrases that are:
- **Instantly sent** — no typing, one keypress + flick
- **Auto-translated** — each phrase has a `phrase_id` that maps to the recipient's locale, enabling communication across language barriers
- **Replayable** — sent as `PlayerOrder::ChatWheelPhrase` in the order stream

```yaml
# chat_wheel_phrases.yaml — game module provides these
chat_wheel:
  phrases:
    - id: 1
      category: tactical
      label:
        en: "Attack now!"
        de: "Jetzt angreifen!"
        ru: "Атакуем!"
        zh: "现在进攻!"
      audio_cue: "eva_attack"  # optional EVA voice line

    - id: 2
      category: tactical
      label:
        en: "Fall back!"
        de: "Rückzug!"
        ru: "Отступаем!"
        zh: "撤退!"
      audio_cue: "eva_retreat"

    - id: 3
      category: tactical
      label:
        en: "Defend the base!"
        de: "Basis verteidigen!"
        ru: "Защищайте базу!"
        zh: "防守基地!"

    - id: 4
      category: economy
      label:
        en: "Need more ore"
        de: "Brauche mehr Erz"
        ru: "Нужна руда"
        zh: "需要更多矿石"

    - id: 5
      category: social
      label:
        en: "Good game!"
        de: "Gutes Spiel!"
        ru: "Хорошая игра!"
        zh: "打得好！"
      audio_cue: null

    - id: 6
      category: social
      label:
        en: "Well played"
        de: "Gut gespielt"
        ru: "Хорошо сыграно"
        zh: "打得漂亮"

    # ... 20-30 phrases per game module, community can add more via mods
```

**Chat wheel key:** Default `V`. Hold to open, flick to select, release to send. The phrase appears in team chat (or all chat, depending on category — social phrases go to all). The phrase displays in the recipient's language, but the chat log also shows `[wheel]` tag so observers know it's a pre-defined phrase.

**Why this matters for RTS:** International matchmaking means players frequently cannot communicate by text. The chat wheel solves this with zero typing — the same phrase ID maps to every supported language. Dota 2 proved this works at scale across a global player base. For IC's Cold War setting, phrases use military communication style: "Affirmative," "Negative," "Enemy contact," "Position compromised."

**Mod-extensible:** Game modules (RA1, TD, community mods) provide their own phrase sets via YAML. The engine provides the wheel UI and `ChatWheelPhrase` order — the phrases are data, not code.

#### 4b. Minimap Drawing

Players can draw directly on the minimap to communicate tactical plans:

- **Activation:** Hold `Alt` + click-drag on minimap (or `/draw` command via D058)
- **Visual:** Freeform line drawn in the player's team color. Visible to teammates only.
- **Duration:** Drawings fade after 8 seconds (same as pings).
- **Persistence:** Drawings are sent as `PlayerOrder::MinimapDraw` — they appear in replays.
- **Rate limit:** Max 3 drawing strokes per 10 seconds, max 32 points per stroke. Prevents minimap vandalism.

```rust
/// Minimap drawing stroke. Points are quantized to cell resolution
/// to keep order size small. A typical stroke is 8-16 points.
pub struct MinimapStroke {
    pub points: Vec<CellPos>,    // max 32 points
    pub color: PlayerColor,
    pub thickness: u8,           // 1-3 pixels on minimap
    pub placed_at: u64,          // tick for expiration
}
```

**Why this is novel for RTS:** Most RTS games have no minimap drawing. Players resort to rapid pinging to trace paths, which is imprecise and annoying. Minimap drawing enables "draw the attack route" coordination naturally. Some MOBA games (LoL) have minimap drawing; no major RTS does.

#### 4c. Tactical Markers (Persistent Team Annotations)

Unlike pings (ephemeral, 8 seconds) and drawings (ephemeral, 8 seconds), tactical markers are persistent annotations placed by team leaders:

```rust
/// Persistent tactical marker. Lasts until manually removed or game ends.
/// Limited to 10 per player, 30 per team. Intended for strategic planning,
/// not moment-to-moment callouts (that's what pings are for).
pub struct TacticalMarker {
    pub id: MarkerId,
    pub owner: PlayerId,
    pub marker_type: MarkerType,
    pub pos: WorldPos,
    pub label: Option<String>,   // bounded/sanitized short tactical label (RTL/LTR supported)
    pub style: CoordinationMarkerStyle,
    pub placed_at: u64,
}

#[derive(Clone, Copy, Debug)]
pub enum MarkerType {
    /// Numbered waypoint (1-9). For coordinating multi-prong attacks.
    Waypoint(u8),
    /// Named objective marker. Shows label on the map.
    Objective,
    /// Hazard zone. Renders a colored radius indicating danger area.
    HazardZone { radius: u16 },
}
```

**Access:** Place via ping wheel (hold longer to access marker submenu) or via commands (`/marker waypoint 1`, `/marker objective "Expand here"`, `/marker hazard 50`). Optional style arguments (preset color + short label) are available in the marker panel/console, but the marker type remains the authoritative gameplay meaning. Remove with `/marker clear` or right-click on existing marker.

**Use case:** Before a coordinated push, the team leader places waypoint markers 1-3 showing the attack route, an objective marker on the target, and a hazard zone on the enemy's defensive line. These persist until the push is complete, giving the team a shared tactical picture.

#### 4d. Smart Danger Alerts (Novel)

Automatic alerts that supplement manual pings with game-state-aware warnings:

```rust
/// Auto-generated alerts based on sim state. These are NOT orders —
/// they are client-side UI events computed locally from the shared sim state.
/// Each player's client generates its own alerts; no network traffic.
///
/// CRITICAL: All alerts involving enemy state MUST filter through the
/// player's current fog-of-war vision. In standard lockstep, each client
/// has the full sim state — querying enemy positions without vision
/// filtering would be a built-in maphack. The alert system calls
/// `FogProvider::is_visible(player, cell)` before considering any
/// enemy entity. Only enemies the player can currently see trigger alerts.
/// (In fog-authoritative relay mode per V26, this is solved at the data
/// level — the client simply doesn't have hidden enemy state.)
pub enum SmartAlert {
    /// Large enemy force detected moving toward the player's base.
    /// Triggered when >= 5 **visible** enemy units are within N cells of
    /// the base and were not there on the previous check (debounced,
    /// 10-second cooldown). Units hidden by fog of war are excluded.
    IncomingAttack { direction: CompassDirection, unit_count: u32 },
    /// Ally's base is under sustained attack (> 3 buildings damaged in
    /// 10 seconds). Only fires if the attacking units or damaged buildings
    /// are within the player's shared team vision.
    AllyUnderAttack { ally: PlayerId },
    /// Undefended expansion at a known resource location.
    /// Triggered when an ore field has no friendly structures or units nearby.
    /// This alert uses only friendly-side data, so no fog filtering is needed.
    UndefendedResource { pos: WorldPos },
    /// Enemy superweapon charging (if visible). RTS-specific high-urgency alert.
    /// Only fires if the superweapon structure is within the player's vision.
    SuperweaponWarning { weapon_type: String, estimated_ticks: u64 },
}
```

**Why client-side, not sim-side:** Smart alerts are purely informational — they don't affect gameplay. Computing them client-side means zero network cost and zero impact on determinism. Each client already has the full sim state (lockstep), but **alerts must respect fog of war** — only visible enemy units are considered. The `FogProvider` trait (D041) provides the vision query; alerts call `is_visible()` before evaluating any enemy entity. In fog-authoritative relay mode (V26 in `06-SECURITY.md`), this is inherently safe because the client never receives hidden enemy state. The alert thresholds are configurable via D033 QoL toggles.

**Why this is novel:** No RTS engine has context-aware automatic danger alerts. Players currently rely on manual minimap scanning. Smart alerts reduce the cognitive load of map awareness without automating decision-making — they tell you *that* something is happening, not *what to do about it*. This is particularly valuable for newer players who haven't developed the habit of constant minimap checking.

**Competitive consideration:** Smart alerts are a D033 QoL toggle (`alerts.smart_danger: bool`, default `true`). Tournament hosts can disable them for competitive purity. Experience profiles (D033) bundle this toggle with other QoL settings.

