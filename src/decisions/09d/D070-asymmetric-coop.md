## D070: Asymmetric Co-op Mode — Commander & Field Ops (IC-Native Template Toolkit)

|                |                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                      |
| **Phase**      | Phase 6b design/tooling integration (template + authoring/UX spec), post-6b prototype/playtest validation, future expansion for campaign wrappers and PvP variants                                                                                                                        |
| **Depends on** | D006 (NetworkModel), D010 (snapshots), D012 (order validation), D021 (campaigns, later optional wrapper), D030/D049 (Workshop packaging), D038 (Scenario Editor templates + validation), D059 (communication), D065 (onboarding/controls), D066 (export fidelity warnings)             |
| **Driver**     | There is a compelling co-op pattern where one player runs macro/base-building and support powers while another (or several others) execute frontline/behind-enemy-lines objectives. IC already has most building blocks; formalizing this as an IC-native template/toolkit enables it cleanly. |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Prototype/spec first, built-in template/tooling after co-op playtest validation
- **Canonical for:** Asymmetric Commander + Field Ops co-op mode scope, role boundaries, request/support coordination model, v1 constraints, and phasing
- **Scope:** IC-native scenario/game-mode template + authoring toolkit + role HUD/communication requirements; not engine-core simulation specialization
- **Decision:** IC supports an optional **Commander & Field Ops** asymmetric co-op mode as a built-in IC-native template/toolkit with **PvE-first**, **shared battlefield first**, **match-based field progression first**, and **mostly split role control ownership**.
- **Why:** The mode fits IC's strengths (D038 scenarios, D059 communication, D065 onboarding, D021 campaign extensibility) and provides a high-creativity co-op mode without breaking engine invariants.
- **Non-goals:** New engine-core simulation mode, true concurrent nested sub-map runtime instances in v1, immediate ranked/competitive asymmetric PvP, mandatory hero-campaign persistence for v1.
- **Invariants preserved:** Same deterministic sim and `PlayerOrder` pipeline, same pluggable netcode/input boundaries, no game-specific engine-core assumptions. Role-scoped control boundaries are enforced by D012's order validation layer — orders targeting entities outside a player's assigned `ControlScopeRef` are rejected deterministically. All support request approvals, denials, and status transitions that affect sim state flow through the `PlayerOrder` pipeline; UI-only status hints (e.g., "pending" display) may be client-local. Request anti-spam cooldowns are sim-enforced (via D012 order validation rate checks) to prevent modified-client spam.
- **Defaults / UX behavior:** v1 is `1 Commander + 1 FieldOps` tuned, PvE-first, same-map with optional authored portal micro-ops, role-critical interactions always visible + shortcut-accessible.
- **Compatibility / Export impact:** IC-native feature set; D066 should warn/block RA1/OpenRA export for asymmetric role HUD/permission/support patterns beyond simple scripted approximations.
- **Public interfaces / types:** `AsymCoopModeConfig`, `AsymRoleSlot`, `RoleAwareObjective`, `SupportRequest`, `SupportRequestUpdate`, `MatchFieldProgressionConfig`, `PortalOpsPolicy`
- **Affected docs:** `src/decisions/09f-tools.md`, `src/decisions/09g-interaction.md`, `src/17-PLAYER-FLOW.md`, `src/decisions/09c-modding.md`, `src/decisions/09e-community.md`, `src/modding/campaigns.md`
- **Revision note summary:** None
- **Keywords:** asymmetric co-op, commander ops, field ops, support requests, role HUDs, joint objectives, portal micro-ops, PvE co-op template

### Problem

Classic RTS co-op usually means "two players play the same base-builder role." That works, but it misses a different style of co-op fantasy:

- one player commands the war effort (macro/base/production/support)
- another player runs a tactical squad (frontline or infiltration ops)
- both must coordinate timing, resources, and objectives to win

IC can support this without adding a new engine mode because the required pieces already exist or are planned:
- D038 scenario templates + modules + per-player objectives + co-op slots
- D059 pings/chat/voice/markers
- D065 role-aware onboarding and quick reference
- D038 `Map Segment Unlock` and `Sub-Scenario Portal` for multi-phase and infiltration flow
- D021 campaign state for future persistent variants

The missing piece is a **canonical design contract** so these scenarios are consistent, testable, and discoverable.

### Decision

Define a built-in IC-native template family (working name):

- **Commander & Field Ops Co-op**

This is an IC-native **scenario/game-mode template + authoring toolkit**. It is **not** a new engine-core simulation mode.

#### Player-facing naming (D070 naming guidance)

- **Canonical/internal spec name:** `Commander & Field Ops` (used in D070 schemas/docs/tooling)
- **Player-facing recommended name:** `Commander & SpecOps`
- **Acceptable community aliases:** `Commando Skirmish`, `Joint Ops`, `Plus Commando` (Workshop tags / server names), but official UI should prefer one stable label for onboarding and matchmaking discoverability

**Why split naming:** "Field Ops" is a good systems label (broad enough for Tanya/Spy/Engineer squads, artillery detachments, VIP escorts, etc.). "SpecOps" is a clearer and more exciting player-facing fantasy.

#### D070 Player-Facing Naming Matrix (official names vs aliases)

Use one **stable official UI name** per mode for onboarding/discoverability, while still accepting community aliases in Workshop tags, server names, and discussions.

| Mode Family | Canonical / Internal Spec Name | Official Player-Facing Name (Recommended) | Acceptable Community Aliases | Notes |
| --- | --- | --- | --- | --- |
| Asymmetric co-op (D070 baseline) | `Commander & Field Ops` | `Commander & SpecOps` | `Commando Skirmish`, `Joint Ops`, `Plus Commando` | Keep one official UI label for lobby/browser/tutorial text |
| Commander-avatar assassination (D070-adjacent) | `Commander Avatar (Assassination)` | `Assassination Commander` | `Commander Hunt`, `Kill the Commander`, `TA-Style Assassination` | High-value battlefield commander; death policy must be shown clearly |
| Commander-avatar soft influence (D070-adjacent) | `Commander Avatar (Presence)` | `Commander Presence` | `Frontline Commander`, `Command Aura`, `Forward Command` | Prefer soft influence framing over hard control-radius wording |
| Commando survival variant (experimental) | `Last Commando Standing` | `Last Commando Standing` | `SpecOps Survival`, `Commando Survival` | Experimental/prototype label should remain visible in first-party UI while in test phase |

**Naming rule:** avoid leading first-party UI copy with generic trend labels (e.g., "battle royale"). Describe the mode in IC/RTS terms first, and let the underlying inspiration be implicit.

#### v1 Scope (Locked)

- **PvE-first**
- **Shared battlefield first** (same map)
- **Optional `Sub-Scenario Portal` micro-ops**
- **Match-based field progression** (session-local, no campaign persistence required)
- **Mostly split control ownership**
- **Flexible role slot schema**, but first-party missions are tuned for `1 Commander + 1 FieldOps`

### Core Loop (v1 PvE)

#### Commander role

- builds and expands base
- manages economy and production
- allocates strategic support (CAS, recon, reinforcements, extraction windows, etc.)
- responds to Field Ops requests
- advances strategic and joint objectives

#### Field Ops role

- controls an assigned squad / special task force
- executes tactical objectives (sabotage, rescue, infiltration, capture, scouting)
- requests support, reinforcements, or resources from Commander
- unlocks opportunities for Commander objectives (e.g., disable AA, open route, mark target)

**Victory design rule:** win conditions should be driven by **joint objective chains**, not only "destroy enemy base."

### SpecOps Task Catalog (v1 Authoring Taxonomy)

D070 scenarios should draw SpecOps objectives from a reusable task catalog so the mode feels consistent and the Commander can quickly infer the likely war-effort reward.

#### Recommended v1 task categories (SpecOps / Field Ops)

| Task Category | Example SpecOps Objectives | Typical War-Effort Reward (Commander/Team) |
| --- | --- | --- |
| **Economy / Logistics** | Raid depots, steal credits, hijack/capture harvesters, ambush supply convoys | Credits/requisition, enemy income delay, allied convoy bonus |
| **Power Grid** | Sabotage power plants, overload substations, capture power relays | Enemy low power, defense shutdowns, production slowdown |
| **Tech / Research** | Infiltrate labs, steal prototype plans, extract scientists/engineers | Unlock support ability, upgrade, intel, temporary tech access |
| **Expansion Enablement** | Clear mines/AA/turrets from a future base site, secure an LZ/construction zone | Safe second-base location, faster expansion timing, reduced setup cost |
| **Superweapon Denial** | Disable radar uplink, destroy charge relays, sabotage fuel/ammo systems, hack launch control | Delay charge, targeting disruption, temporary superweapon lockout |
| **Terrain / Route Control** | Destroy/repair bridges, open/close gates, collapse tunnels, activate lifts | Route denial, flank opening, timed attack corridor, defensive delay |
| **Infiltration / Sabotage** | Enter base, hack command post, plant charges, disrupt comms | Objective unlock, enemy debuffs, shroud/intel changes |
| **Rescue / Extraction** | Rescue VIPs/civilians/defectors, escort assets to extraction | Bonus funds, faction support, tech intel, campaign flags (via D021 persistent state) |
| **Recon / Target Designation** | Scout hidden batteries, laser-designate targets, mark convoy routes | Commander gets accurate CAS/artillery windows, map reveals |
| **Counter-SpecOps (proposal-only, post-v1 PvP variant)** | Defend your own power/tech sites from infiltrators | Prevent enemy bonuses, protect superweapon/expansion tempo |

#### Design rule: side missions must matter to the main war

A SpecOps task should usually produce one of these outcome types:
- **Economic shift** (credits, income delay, requisition)
- **Capability shift** (unlock/disable support, tech, production)
- **Map-state shift** (new route, segment unlock, expansion access)
- **Timing shift** (delay superweapon, accelerate attack window)
- **Intel shift** (vision, target quality, warning time)

Avoid side missions that are exciting but produce no meaningful war-effort consequence.

### Role Boundaries (Mostly Split Control)

#### Commander owns

- base structures
- production queues and strategic economy actions
- strategic support powers and budget allocation
- reinforcement routing/spawn authorization (as authored by the scenario)

#### Field Ops owns

- assigned squad units
- field abilities / local tactical actions
- objective interactions (hack, sabotage, rescue, extraction, capture)

#### Shared / explicit handoff only

- support requests
- reinforcement requests
- temporary unit attachment/detachment
- mission-scripted overrides (e.g., Commander triggers gate after Field Ops hack)

**Non-goal (v1):** broad shared control over all units.

### Casual Join-In / Role Fill Behavior (Player-Facing Co-op)

One of D070's core use cases is letting a player join a commander as a dedicated SpecOps leader because commandos are often too attention-intensive for a macro-focused RTS player to use well during normal skirmish.

#### v1 policy (casual/custom first)

- D070 scenarios/templates may expose open `FieldOps` role slots that a player can join before match start
- Casual/custom hosts may also allow **drop-in** to an unoccupied `FieldOps` slot mid-match (scenario/host policy)
- If no human fills the role, fallback is scenario-authored:
  - AI control
  - slot disabled + alternate objectives
  - simplified support-only role

**Non-goal (v1):** ranked/asymmetric queueing rules for mid-match role joins.

### Map and Mission Flow (v1)

#### Shared battlefield (default)

The primary play space is one battlefield with authored objective channels:

- **Strategic** (Commander-facing)
- **Field** (Field Ops-facing)
- **Joint** (coordination required)

Missions should use D038 `Map Segment Unlock` for phase transitions where appropriate.

#### Optional infiltration/interior micro-ops (D038 `Sub-Scenario Portal`)

`Sub-Scenario Portal` is the v1 way to support "enter structure / run commando micro-op" moments.

v1 contract:
- portal sequences are **authored optional micro-scenarios**
- **no true concurrent nested runtime instances** are required
- portal exits can trigger objective updates, reinforcements, debuffs, or segment unlocks
- commander may use an authored **Support Console** panel during portal ops, but this is optional content (not a mandatory runtime feature for all portals)

### Match-Based Field Progression (v1)

Field progression in v1 is **session-local**:

- squad templates / composition presets
- requisition upgrades
- limited field role upgrades (stealth/demo/medic/etc.)
- support unlocks earned during the match

This keeps onboarding and balance manageable for co-op skirmish scenarios.

**Later extension:** D021 campaign wrappers may layer persistent squad/hero progression on top (optional "Ops Campaign" style experiences).

### Coordination Layer (D059 Integration Requirement)

D070 depends on D059 providing role-aware coordination presets and request lifecycle UI.

Minimum v1 coordination surfaces:

- Field Ops request wheel / quick actions:
  - `Need Reinforcements`
  - `Need CAS`
  - `Need Recon`
  - `Need Extraction`
  - `Need Funds / Requisition`
  - `Objective Complete`
- Commander response shortcuts:
  - `Approved`
  - `Denied`
  - `On Cooldown`
  - `ETA`
  - `Marking LZ`
  - `Hold Position`
- Typed pings/markers for LZs, CAS targets, recon sectors, extraction points
- Request status lifecycle UI: pending / approved / queued / inbound / failed / cooldown

**Normative UX rule:** Every role-critical interaction must have both a shortcut path and a visible UI path.

### Commander/SpecOps Request Economy (v1)

The request/response loop must be strategic, not spammy. D070 therefore defines a **request economy** layered over D059's communication surfaces.

#### Core request-economy rules (v1)

- **Requests are free to ask, not free to execute.** Field Ops can request support quickly; Commander approval consumes real resources/cooldowns/budget if executed.
- **Commander actions are gated by authored support rules.** CAS/recon/reinforcements/extraction are constrained by cooldowns, budget, prerequisites, and availability windows.
- **Requests can be queued and denied with reasons.** "No" is valid and should be visible (`cooldown`, `insufficient funds`, `not unlocked`, `out of range`, `unsafe LZ`, etc.).
- **Request urgency is a hint, not a bypass.** Urgent requests rise in commander UI priority but do not skip gameplay costs.

#### Anti-spam / clarity guardrails

- duplicate request collapsing (same type + same target window)
- per-field-team request cooldowns for identical asks (configurable, short)
- commander-side quick responses (`On Cooldown`, `ETA`, `Hold`, `Denied`) to reduce chat noise
- request queue prioritization by urgency + objective channel (`Joint` > `Field` side tasks by default, configurable)

#### Reward split rule (v1)

When a SpecOps task succeeds, rewards should be **explicitly split** or categorized so both roles understand the outcome:
- team-wide reward (e.g., bridge destroyed, superweapon delayed)
- commander-side reward (credits, expansion access, support unlock)
- field-side reward (requisition points, temporary gear, squad upgrade unlock)

This keeps the mode from feeling like "Commander gets everything" or "SpecOps is a disconnected mini-game."

### Optional Pacing Layer: Operational Momentum ("One More Phase" Effect)

RTS does not have Civilization-style turns, but D070 scenarios can still create a similar **"one more turn" pull** by chaining near-term rewards into visible medium-term and long-term strategic payoffs. In IC terms, this is an optional pacing layer called **Operational Momentum** (internal shorthand: **"one more phase"**).

#### Core design goal

Create the feeling that:
- one more objective is almost complete,
- completing it unlocks a meaningful strategic advantage,
- and that advantage opens the next near-term opportunity.

This should feel like strategic momentum, not checklist grind.

#### Three-horizon pacing model (recommended)

D070 missions using Operational Momentum should expose progress at three time horizons:

- **Immediate (10-30s):** survive engagement, mark target, hack terminal, hold LZ, escort VIP to extraction point
- **Operational (1-3 min):** disable AA battery, secure relay, clear expansion site, escort convoy, steal codes
- **Strategic (5-15 min):** superweapon delay, command-network expansion, support unlock chain, route control, phase breakthrough

The "one more phase" effect emerges when these horizons are linked and visible.

#### War-Effort / Ops Agenda board (recommended UI concept)

D070 scenarios may define a visible **Operational Agenda** (aka **War-Effort Board**) that tracks 3-5 authored progress lanes, for example:

- `Economy`
- `Power`
- `Intel`
- `Command Network`
- `Superweapon Denial`

Each lane contains authored milestones with explicit rewards (for example: `Recon Sweep unlocked`, `AA disabled for 90s`, `Forward LZ unlocked`, `Enemy charge delayed +2:00`). The board should make the next meaningful payoff obvious without overwhelming the player.

#### Design rules (normative, v1)

- Operational Momentum is an **optional authored pacing layer**, not a requirement for every D070 mission.
- Rewards must be **war-effort meaningful** (economy/power/tech/map-state/timing/intel), not cosmetic score-only filler.
- The system must create **genuine interdependence**, not fake dependency (Commander and Field Ops should each influence at least one agenda lane in co-op variants).
- Objective chains should create "just one more operation" tension without removing clear stopping points.
- "Stay longer for one more objective" decisions are good; hidden mandatory chains are not.
- Avoid timer overload: only the most relevant near-term and next strategic milestone should be foregrounded at once.

#### Extraction-vs-stay risk/reward (optional D070 pattern)

Operational Momentum pairs especially well with authored **Extraction vs Stay Longer** decisions:

- extract now = secure current gains safely
- stay for one more objective/cache/relay = higher reward, higher risk

This is a strong source of replayable tension and should be surfaced explicitly in UI (`reward`, `risk`, `time pressure`) rather than left implicit.

#### Snowball / anti-fun guardrails

To avoid a runaway "winner wins harder forever" loop:

- prefer **bounded** tactical advantages and timed windows over permanent exponential buffs
- keep some comeback-capable objectives valuable for trailing teams/players
- ensure momentum rewards improve options, not instantly auto-win the match
- keep failure in one lane from hard-locking all future agenda progress unless explicitly authored as a high-stakes mission

#### D021 campaign wrapper synergy (optional later extension)

In `Ops Campaign` wrappers (D021), Operational Momentum can bridge mission-to-mission pacing:

- campaign flags track which strategic lanes were advanced (`intel_chain_progress`, `command_network_tier`, `superweapon_delays_applied`)
- the next mission reacts with altered objectives, support availability, route options, or enemy readiness

This preserves the "one more phase" feel across a mini-campaign without turning it into a full grand-strategy layer.

### Authoring Contract (D038 Integration Requirement)

The Scenario Editor (D038) should treat this as a **template + toolkit**, not a one-off scripted mode.

Required authoring surfaces (v1):

- role slot definitions (`Commander`, `FieldOps`, future `CounterOps`, `Observer`)
- ownership/control-scope authoring (who controls which units/structures)
- role-aware objective channels (`Strategic`, `Field`, `Joint`)
- support catalog + requisition rules
- optional **Operational Momentum / Agenda Board** lanes, milestones, reward hooks, and extraction-vs-stay prompts
- request/response simulation in Preview/Test
- portal micro-op integration (using existing D038 portal tooling)
- validation profile for asymmetric missions

#### v1 authoring validation rules (normative)

- both roles must have meaningful actions within the first ~90 seconds
- every request type used by objectives must map to at least one commander action path
- joint objectives must declare role contributions explicitly
- portal micro-ops require timeout/failure return behavior
- no progression-critical hidden chat syntax
- role HUDs must expose shared mission status and teammate state
- if Operational Momentum is enabled, each lane milestone must declare explicit rewards and role visibility
- warn on foreground HUD overload (too many concurrent timers/counters/agenda milestones)

### Public Interfaces / Type Sketches (Spec-Level)

These belong in gameplay/template/UI schema layers, not engine-core sim assumptions.

```rust
pub enum AsymRoleKind {
    Commander,
    FieldOps,
    CounterOps, // proposal-only: deferred asymmetric PvP / defense variants (post-v1, not scheduled)
    Observer,
}

pub struct AsymRoleSlot {
    pub slot_id: String,
    pub role: AsymRoleKind,
    pub min_players: u8,
    pub max_players: u8,
    pub control_scope: ControlScopeRef,
    pub ui_profile: String,  // e.g. "commander_hud", "field_ops_hud"
    pub comm_preset: String, // D059 role comm preset
}

pub struct AsymCoopModeConfig {
    pub id: String,
    pub version: u32,
    pub slots: Vec<AsymRoleSlot>,
    pub role_permissions: Vec<RolePermissionRule>,
    pub objective_channels: Vec<ObjectiveChannelConfig>,
    pub requisition_rules: RequisitionRules,
    pub support_catalog: Vec<SupportAbilityConfig>,
    pub field_progression: MatchFieldProgressionConfig,
    pub portal_ops_policy: PortalOpsPolicy,
    pub operational_momentum: OperationalMomentumConfig, // optional pacing layer ("one more phase")
}

pub enum SupportRequestKind {
    Reinforcements,
    Airstrike,
    CloseAirSupport,
    ReconSweep,
    Extraction,
    ResourceDrop,
    MedicalSupport,
    DemolitionSupport,
}

pub struct SupportRequest {
    pub request_id: u64,
    pub from_player: PlayerId,
    pub field_team_id: String,
    pub kind: SupportRequestKind,
    pub target: SupportTargetRef,
    pub urgency: RequestUrgency,
    pub note: Option<String>,
    pub created_at_tick: u32,
}

pub enum SupportRequestStatus {
    Pending,
    Approved,
    Denied,
    Queued,
    Inbound,
    Completed,
    Failed,
    CooldownBlocked,
}

pub struct SupportRequestUpdate {
    pub request_id: u64,
    pub status: SupportRequestStatus,
    pub responder: Option<PlayerId>,
    pub eta_ticks: Option<u32>,
    pub reason: Option<String>,
}

pub enum ObjectiveChannel {
    Strategic,
    Field,
    Joint,
    Hidden,
}

pub struct RoleAwareObjective {
    pub id: String,
    pub channel: ObjectiveChannel,
    pub visible_to_roles: Vec<AsymRoleKind>,
    pub completion_credit_roles: Vec<AsymRoleKind>,
    pub dependencies: Vec<String>,
    pub rewards: Vec<ObjectiveReward>,
}

pub struct MatchFieldProgressionConfig {
    pub enabled: bool,
    pub squad_templates: Vec<SquadTemplateId>,
    pub requisition_currency: String,
    pub upgrade_tiers: Vec<FieldUpgradeTier>,
    pub respawn_policy: FieldRespawnPolicy,
    pub session_only: bool, // true in v1
}

pub enum ParentBattleBehavior {
    Paused,         // parent sim pauses during portal micro-op (simplest, deterministic)
    ContinueAi,     // parent sim continues with AI auto-resolve (authored, deterministic)
}

pub enum PortalOpsPolicy {
    Disabled,
    OptionalMicroOps {
        max_duration_sec: u16,
        commander_support_console: bool,
        parent_sim_behavior: ParentBattleBehavior,
    },
    // True concurrent nested runtime instances intentionally deferred.
}

pub enum MomentumRewardCategory {
    Economy,
    Power,
    Intel,
    CommandNetwork,
    SuperweaponDelay,
    RouteControl,
    SupportUnlock,
    SquadUpgrade,
    TemporaryWindow,
}

pub struct MomentumMilestone {
    pub id: String,
    pub lane_id: String,
    pub visible_to_roles: Vec<AsymRoleKind>,
    pub progress_target: u32,
    pub reward_category: MomentumRewardCategory,
    pub reward_description: String,
    pub duration_sec: Option<u16>, // for temporary windows/buffs/delays
}

pub struct OperationalMomentumConfig {
    pub enabled: bool,
    pub lanes: Vec<String>, // e.g. economy/power/intel/command_network/superweapon_denial
    pub milestones: Vec<MomentumMilestone>,
    pub foreground_limit: u8,           // UI guardrail; recommended small (2-3)
    pub extraction_vs_stay_enabled: bool,
}
```

### Experimental D070-Adjacent Variant: Last Commando Standing (`SpecOps Survival`)

D070 also creates a natural experimental variant: a **SpecOps-focused survival / last-team-standing** mode where each player (or squad) fields a commando-led team and fights to survive while contesting neutral objectives.

This is **not** the D070 baseline and should not delay the Commander/Field Ops co-op path. It is a **prototype-first D070-adjacent template** that reuses D070 building blocks:
- Field Ops-style squad control and match-based progression concepts
- SpecOps Task Catalog categories (economy/power/tech/route/intel objectives)
- D038 phase/hazard scripting and `Map Segment Unlock`
- D059 communication/pings (and optional support requests if the scenario includes support powers)

#### Player-facing naming guidance (experimental)

- **Recommended player-facing names:** `Last Commando Standing`, `SpecOps Survival`
- Avoid marketing it as a generic "battle royale" mode in first-party UI; the fantasy should stay RTS/Red-Alert-first.

#### v1 experimental mode contract (prototype scope)

- Small-to-medium player counts (prototype scale, not mass BR scale)
- Each player/team starts with:
  - one elite commando / hero-like operative
  - a small support squad (author-configured)
- Objective: **last team standing**, with optional score/time variants for custom servers
- Neutral AI-guarded objectives and caches provide warfighting advantages
- Short rounds are preferred for early playtests (clarity > marathon runtime)

**Non-goals (v1 experiment):**
- 50-100 player scale
- deep loot-inventory simulation
- mandatory persistent between-match progression
- ranked/competitive queueing before fun/clarity is proven

#### Hazard contraction model (RA-flavored "shrinking zone")

Instead of a generic circle-only battle royale zone, D070 experimental survival variants should prefer authored IC/RA-themed hazard contraction patterns:

- radiation storm sectors
- artillery saturation zones
- chrono distortion / instability fields
- firestorm / gas spread
- power-grid blackout sectors affecting vision/support

Design rules:
- hazard phases must be deterministic and replay-safe (scripted or seed-derived)
- hazard warnings must be telegraphed before activation (map markers, timers, EVA text, visual preview)
- hazard contraction should pressure movement and conflict, not cause unavoidable instant deaths without warning
- custom maps may use non-circular contraction shapes if readability remains clear

#### Neutral objective catalog (survival variant)

Neutral objectives should reward tactical risk and create reasons to move, not just camp.

Recommended v1 objective clusters:
- **Supply cache / depot raid** -> requisition / credits / ammo/consumables (if the scenario uses consumables)
- **Power node / relay** -> temporary shielded safe zone, radar denial, or support recharge bonus
- **Tech uplink / command terminal** -> recon sweep, target intel, temporary support unlock
- **Bridge / route control** -> route denial/opening, forced pathing shifts, ambush windows
- **Extraction / medevac point** -> squad recovery, reinforcement call opportunity, revive token (scenario-defined)
- **VIP rescue / capture** -> bonus requisition/intel or temporary faction support perk
- **Superweapon relay sabotage** (optional high-tier event) -> removes/limits a late-phase map threat or grants timing relief

#### Reward economy (survival variant)

Rewards should be explicit and bounded to preserve tactical clarity:

- **Team requisition** (buy squad upgrades / reinforcements / support consumables)
- **Temporary support charges** (smoke, recon sweep, limited CAS, decoy drop)
- **Intel advantages** (brief reveal, hazard forecast, cache reveal)
- **Field upgrades** (speed/stealth/demo/medic tier improvements; match-only in v1)
- **Positioning advantages** (temporary route access, defended outpost, extraction window)

Guardrails:
- avoid snowball rewards that make early winners uncatchable
- prefer short-lived tactical advantages over permanent exponential scaling
- ensure at least some contested objectives remain valuable to trailing players

#### Prototype validation metrics (before promotion)

D070 experimental survival variants should remain Workshop/prototype-first until these are tested:

- median round length (target band defined per map size; avoid excessive early downtime)
- time-to-first meaningful encounter
- elimination downtime (spectator/redeploy policy effectiveness)
- objective contest rate (are players moving, or camping?)
- hazard-related deaths vs combat-related deaths (hazard should pressure, not dominate)
- perceived agency/fun ratings for eliminated and surviving players
- clarity of reward effects (players can explain what a captured objective changed)

If the prototype proves consistently fun and readable, it can be promoted to a first-class built-in template (still IC-native, not engine-core).

### D070-Adjacent Mode Family: Commander Avatar on Battlefield (`Assassination` / `Commander Presence`)

Another D070-adjacent direction that fits IC well is a **Commander Avatar** mode family inspired by Total Annihilation / Supreme Commander-style commander units: a high-value commander unit exists on the battlefield, and its position/survival materially affects the match.

This should be treated as an **optional IC-native mode/template family**, not a default replacement for classic RA skirmish.

#### Why this makes sense for IC

- It creates tactical meaning for commander positioning without requiring a new engine-core mode.
- It composes naturally with D070's role split (`Commander` + `SpecOps`) and support/request systems.
- It gives designers a place to use hero-like commander units without forcing hero gameplay into standard skirmish.
- It reuses existing IC building blocks: D038 templates, D059 communication/pings, D065 onboarding/Quick Reference, D021 campaign wrappers.

#### v1 recommendation: start with **Assassination Commander**, not hard control radius

Start with a simple, proven variant:

- each player has a **Commander Avatar** unit (or equivalent named commander entity)
- **commander death = defeat** (or authored "downed -> rescue timer" variant)
- commander may have special build/support/command powers depending on the scenario/module

This is easy to explain, easy to test, and creates immediate battlefield tension.

#### Command Presence (soft influence) — preferred over hard control denial

A more advanced variant is **Commander Presence**: the commander avatar's position provides tactical/strategic advantages, but does **not** hard-lock unit control outside a radius in v1.

Preferred v1/v2 presence effects (soft, readable, and less frustrating):
- support ability availability/quality (CAS/recon radius, reduced error, shorter ETA)
- local radar/command uplink strength
- field repair / reinforcement call-in eligibility
- morale / reload / response bonuses near the commander (scenario-defined)
- local build/deploy speed bonuses (especially for forward bases/outposts)

**Avoid in v1:** "you cannot control units outside commander range." Hard control denial often feels like input punishment and creates anti-fun edge cases in macro-heavy matches.

#### Command Network map-control layer (high-value extension)

A Commander Avatar mode becomes much richer when paired with **command network objectives**:
- comm towers / uplinks / radar nodes
- forward command posts
- jammers / signal disruptors
- bridges and routes that affect commander movement/support timing

This ties avatar positioning to map control and creates natural SpecOps tasks (sabotage, restore, hold, infiltrate).

#### Risk / counterplay guardrails (snipe-meta prevention)

Commander Avatar modes are fun when the commander matters, but they can devolve into pure "commander snipe" gameplay if not designed carefully.

Recommended guardrails:
- clear commander-threat warnings (D059 markers/EVA text)
- authored anti-snipe defenses / detectors / patrols / decoys
- optional `downed` or rescue-timer defeat policy in casual/co-op variants
- rewards for frontline commander presence (so hiding forever is suboptimal)
- multiple viable win paths (objective pressure + commander pressure), not snipe-only

#### D070 + Commander Avatar synergy (Commander & SpecOps)

This mode family composes especially well with D070:
- the Commander player has a battlefield avatar that matters
- the SpecOps player can escort, scout, or create openings for the Commander Avatar
- enemy SpecOps/counter-ops can threaten command networks and assassination windows

This turns "protect the commander" into a real co-op role interaction instead of background flavor.

#### D021 composition pattern: "Rescue the Commander" mini-campaign bootstrap

A strong campaign/mini-campaign pattern is:

1. **SpecOps rescue mission** (no base-building yet)
   - the commander is captured / isolated / missing
   - the player controls a commando/squad to infiltrate and rescue them
2. **Commander recovered** -> campaign flag unlocks command capability
   - e.g., `Campaign.set_flag("commander_recovered", true)`
3. **Follow-up mission(s)** unlock:
   - base construction / production menus
   - commander support powers
   - commander avatar presence mechanics
   - broader army coordination and reinforcement requests

This is a clean way to teach the player the mode in layers while making the commander feel narratively and mechanically important.

Design rule:
- if command/building is gated behind commander rescue, the mission UI must explain the restriction clearly and show the unlock when it happens (no hidden "why can't I build?" confusion).

#### D038 template/tooling expectation (authoring support)

D038 should support this family as template/preset combinations, not hardcoded logic:
- **Assassination Commander** preset (commander death policy + commander unit setup)
- **Commander Presence** preset (soft influence profiles and command-network objective hooks)
- optional **D070 Commander & SpecOps + Commander Avatar** combo preset
- validation for commander-death policy, commander spawn safety, and anti-snipe/readability warnings

#### Spec-Level Type Sketches (D070-adjacent)

```rust
pub enum CommanderAvatarMode {
    Disabled,
    Assassination,     // commander death = defeat (or authored downed policy)
    Presence,          // commander provides soft influence bonuses
    AssassinationPresence, // both
}

pub enum CommanderAvatarDeathPolicy {
    ImmediateDefeat,
    DownedRescueTimer { timeout_sec: u16 },
    TeamVoteSurrenderWindow { timeout_sec: u16 },
}

pub struct CommanderPresenceRule {
    pub effect_id: String,              // e.g. "cas_radius_bonus"
    pub radius_cells: u16,
    pub requires_command_network: bool,
    pub value_curve: PresenceValueCurve, // authored falloff/profile
}

pub struct CommanderAvatarConfig {
    pub mode: CommanderAvatarMode,
    pub commander_unit_tag: String,      // named unit / archetype ref
    pub death_policy: CommanderAvatarDeathPolicy,
    pub presence_rules: Vec<CommanderPresenceRule>,
    pub command_network_objectives: Vec<String>, // objective IDs / tags
}
```

### Failure Modes / Guardrails

Key risks that must be validated before promoting the mode:

- Commander becomes a "request clerk" instead of a strategic player
- Field Ops suffers downtime or loses agency
- Communication UI is too slow under pressure
- Resource/support gating creates deadlocks or unwinnable states
- Portal micro-ops cause role disengagement
- Commander Avatar variants collapse into snipe-only meta or punitive control denial

D070 therefore requires a prototype/playtest phase before claiming this as a polished built-in mode.

#### Recommended proving format: D070 mini-campaign vertical slice ("Ops Prologue")

The preferred way to validate D070 before promoting it as a polished built-in mode is a short **mini-campaign vertical slice** rather than only sandbox/skirmish test maps.

Why a mini-campaign is preferred:
- teaches the mode in layers (SpecOps first -> Commander return -> joint coordination)
- validates D021 campaign transitions/flags with D070 gameplay
- produces better player-facing onboarding and playtest data than a single "all mechanics at once" scenario
- stress-tests D059 request UX and D065 role onboarding in realistic narrative pacing

Recommended proving arc (3-4 missions):
1. **Rescue the Commander** (SpecOps-focused, no base-building)
2. **Establish Forward Command** (Commander returns, limited support/building)
3. **Joint Operation** (full Commander + SpecOps loop)
4. *(Optional)* **Counterstrike / Defense** (counter-specops pressure, anti-snipe/readability checks)

This mini-campaign can be shipped internally first as a validation artifact (design/playtest vertical slice) and later adapted into a player-facing "Ops Prologue" if playtests confirm the mode is fun and readable.

### Test Cases (Design Acceptance)

1. `1 Commander + 1 FieldOps` mission gives both roles meaningful tasks within 90 seconds.
2. Field Ops request → commander approval/denial → status update loop is visible and understandable.
3. A shared-map mission phase unlock depends on Field Ops action and changes Commander strategy options.
4. Portal micro-op returns with explicit outcome effects and no undefined parent-state behavior.
5. Flexible slot schema supports `1 Commander + 2 FieldOps` configuration without breaking validation (even if not first-party tuned).
6. Role boundaries prevent accidental full shared control unless explicitly authored.
7. Field progression works without campaign persistence.
8. D065 role onboarding and Quick Reference can present role-specific instructions via semantic action prompts.
9. A D070 mission includes at least one SpecOps task that yields a meaningful war-effort reward (economy/power/tech/route/timing/intel), not just side-score.
10. Duplicate support requests are collapsed/communicated clearly so Commander UI remains usable under pressure.
11. Casual/custom drop-in to an open `FieldOps` role follows the authored fallback/join policy without breaking mission state.
12. A D070 scenario can define both commander-side and field-side rewards for a single SpecOps objective, and both are surfaced clearly in UI/debrief.
13. An Assassination/Commander Avatar variant telegraphs commander threat and defeat policy clearly (instant defeat vs downed/rescue timer).
14. A Commander Presence variant yields meaningful commander-positioning decisions without hard input-lock behavior in v1.
15. A "Rescue the Commander" mini-campaign bootstrap cleanly gates command/building features behind an explicit D021 flag and unlock message.
16. A D070 mini-campaign vertical slice (3-4 missions) demonstrates layered onboarding and produces better role-clarity/playtest evidence than a single all-in-one sandbox scenario.
17. A D070 mission using Operational Momentum shows at least one clear near-term milestone and one visible strategic payoff without creating HUD timer overload.
18. An extraction-vs-stay decision (if authored) surfaces explicit reward/risk/time-pressure cues and results in a legible war-effort consequence.

### Alternatives Considered

- **Hardcode a new engine-level asymmetric mode** (rejected — violates IC's engine/gameplay separation; this composes from existing systems)
- **Ship PvP asymmetric (2v2 commander+ops vs commander+ops) first** (rejected — too many balance and grief/friction variables before proving co-op fun)
- **Require campaign persistence/hero progression in v1** (rejected — increases complexity and onboarding cost; defer to D021 wrapper extension)
- **Treat SpecOps as "just a hero unit in normal skirmish"** (rejected — this is exactly the attention-overload problem D070 is meant to solve; the dedicated role and request economy are the point)
- **Start Commander Avatar variants with hard unit-control radius restrictions** (rejected for v1 — high frustration risk; start with soft presence bonuses and clear support gating)
- **Require true concurrent nested sub-map simulation for infiltration** (rejected for v1 — high complexity, low proof requirement; use D038 portals first)

### Relationship to Existing Decisions

- **D038 (Scenario Editor):** D070 is primarily realized as a built-in game-mode template + authoring toolkit with validation and preview support.
- **D038 Game Mode Templates:** TA-style commander avatar / assassination / command-presence variants should be delivered as optional presets/templates, not core skirmish rule changes.
- **D059 (Communication):** Role-aware requests, responses, and typed coordination markers are a D059 extension, not a separate communication system.
- **D065 (Tutorial / Controls / Quick Reference):** Commander and Field Ops role onboarding use the same semantic input action catalog and quick-reference infrastructure.
- **D021 (Branching Campaigns):** Campaign persistence is optional and deferred for "Ops Campaign" variants; v1 remains session-based progression.
- **D021 Campaign Patterns:** "Rescue the Commander" mini-campaign bootstraps are a recommended composition pattern for unlocking command/building capabilities and teaching layered mechanics.
- **D021 Hero Toolkit:** A future `Ops Campaign` variant may use D021's built-in hero toolkit for a custom SpecOps leader (e.g., Tanya-like or custom commando actor) with persistent skills between matches/missions. This is optional content-layer progression, not a D070 baseline requirement.
- **D021 Pacing Composition:** D070's optional Operational Momentum layer can feed D021 campaign flags/state to preserve "one more phase" pacing across an `Ops Campaign` mini-campaign arc.
- **D066 (Export):** D070 scenarios are IC-native and expected to have limited/no RA1/OpenRA export fidelity for role/HUD/request orchestration.
- **D030/D049 (Workshop):** D070 scenarios/templates publish as normal content packages. No special runtime/network privileges are granted by Workshop packaging.

### Phase

- **Prototype / validation first (post-6b planning):** paper specs + internal playtests for `1 Commander + 1 FieldOps`, ideally via a short D070 mini-campaign vertical slice ("Ops Prologue" style proving arc)
- **Optional pacing-layer validation:** Operational Momentum / "one more phase" should be proven in the same prototype phase before being treated as a recommended D070 preset pattern.
- **Built-in PvE template v1:** after role-clarity and communication UX are validated
- **Later expansions:** multiple field squads, D021 `Ops Campaign` wrappers (including optional persistent hero-style SpecOps leaders), and asymmetric PvP variants (`CounterOps`)
