## D021: Branching Campaign System

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 4 (campaign runtime + Lua Campaign global); campaign editor tool in Phase 6a
- **Execution overlay mapping:** `M4.SCRIPT.LUA_RUNTIME` (P-Core); campaign state machine is part of the Lua scripting layer
- **Deferred features / extensions:** Visual campaign editor (Phase 6a, D038), LLM-generated missions (Phase 7, D016)
- **Deferral trigger:** Respective milestone start
- **Canonical for:** Campaign graph structure, mission outcomes, persistent state carryover, unit roster, `Campaign` Lua global
- **Scope:** `ic-script` (campaign runtime), `modding/campaigns.md` (full specification)
- **Decision:** IC campaigns are continuous, branching, and stateful — a directed graph of missions with persistent state, multiple outcomes per mission, and no mandatory game-over screen. Inspired by Operation Flashpoint: Cold War Crisis / Resistance. The full specification lives in [`modding/campaigns.md`](../modding/campaigns.md) (~2600 lines).
- **Why:**
  - OpenRA's campaigns are disconnected standalone missions with no flow — a critical gap
  - Branching graphs with multiple outcomes per mission create emergent storytelling
  - Persistent state (unit roster, veterancy, flags) makes campaign progress feel consequential
  - "No game over" design eliminates frustrating mandatory restarts while preserving tension
- **Non-goals:** Replacing Lua mission scripting. Campaigns define the *graph* (which missions, what order, what carries forward); individual missions are still scripted in Lua (D024).
- **Invariants preserved:** Deterministic sim (campaign state is serializable, carried between missions as data). Replay-safe (campaign state snapshot included in replay metadata).
- **Public interfaces / types / commands:** `Campaign` (Lua global — D024), campaign YAML schema, `CampaignState`, `MissionOutcome`
- **Affected docs:** `modding/campaigns.md` (full specification), `04-MODDING.md` § Campaigns
- **Keywords:** campaign, branching, mission graph, outcome, persistent state, unit roster, veterancy, carryover, Operation Flashpoint, Campaign global

---

### Core Principles

1. **Campaign is a graph, not a list.** Missions connect via named outcomes — branches, convergence points, optional paths.
2. **Missions have multiple outcomes.** "Won with bridge intact" and "Won but bridge destroyed" lead to different next missions.
3. **Failure doesn't end the campaign.** A defeat outcome is another edge in the graph — branch to fallback, retry with fewer resources, or skip ahead with consequences.
4. **State persists across missions.** Surviving units, veterancy, captured equipment, story flags, resources carry forward per designer-configured carryover rules.
5. **Continuous flow.** Briefing → mission → debrief → next mission. No exit to menu between levels.

### Campaign Graph (YAML excerpt)

```yaml
campaign:
  id: allied_campaign
  start_mission: allied_01
  persistent_state:
    unit_roster: true
    veterancy: true
    resources: false
    equipment: true
    custom_flags: {}

  missions:
    allied_01:
      map: missions/allied-01
      outcomes:
        victory_bridge_intact:
          next: allied_02a
          state_effects:
            set_flag: { bridge_status: intact }
        victory_bridge_destroyed:
          next: allied_02b
        defeat:
          next: allied_01_fallback
```

### Lua API (`Campaign` Global — D024)

```lua
-- Query campaign state
local roster = Campaign.get_roster()
local bridge = Campaign.get_flag("bridge_status")

-- Complete mission with a named outcome
Campaign.complete("victory_bridge_intact")

-- Modify persistent state
Campaign.set_flag("found_secret", true)
Campaign.add_to_roster(Actor.Create("tanya", pos))
```

### Full Specification

The complete campaign system design — including carryover rules, roster management, hero progression, briefing/debrief flow, save integration, and the visual graph structure — is documented in [`modding/campaigns.md`](../modding/campaigns.md). That document is the canonical reference; this capsule provides the index entry and rationale summary.

### Alternatives Considered

| Alternative | Verdict | Reason |
|-------------|---------|--------|
| Linear mission sequence (OpenRA model) | Rejected | No branching, no persistence, no emergent storytelling |
| Full scripted campaign (Lua only, no YAML graph) | Rejected | YAML graph is declarative and toolable; Lua handles per-mission logic, not campaign flow |
| Automatic state carryover (everything persists) | Rejected | Designers must control what carries forward — unlimited carryover creates balance problems |
