# Enhanced Edition Campaign Plan — Allied & Soviet

This is the concrete content plan for IC's first-party "Enhanced Edition" campaign extensions. It weaves the original 14+14 main campaign missions, 34 Counterstrike/Aftermath expansion missions, and IC-original missions into two unified branching campaign graphs.

**Source material:** 28 base game missions + 20 Counterstrike missions + 18 Aftermath missions + 4 Ant missions = 70 total existing missions. IC adds ~15-20 original missions showcasing platform features.

**Design principle:** The classic campaign is always available as a straight-line path through the graph. Enhanced Edition content branches off as optional/alternative paths. IC-original missions are toggleable per-mission; Counterstrike and Aftermath missions are toggleable per-chain (following D021's sub-feature toggle model in `modding/campaigns.md`).

---

## Campaign Design Rules

These rules govern how the Enhanced Edition missions are designed. They address problems in the original campaigns — awkward character introductions, unexplained difficulty spikes, disconnected optional operations — and establish IC's standard for campaign quality.

### Rule 1: No Awkward Character Introductions

The original RA1 cutscenes often introduced characters with a "am I supposed to know this person?" feeling. Von Esling, Stavros, Tanya, Einstein — they all appear in briefing videos assuming the player knows who they are and why they matter.

**IC rule:** Every named character gets a **gameplay introduction before their cutscene introduction**. The player meets the character through gameplay (controlling them, fighting alongside them, or hearing about them) before seeing them in a briefing video.

| Character | Original Problem | IC Fix |
|---|---|---|
| **Stavros** | Appears in M1 briefing with no introduction. Who is this Greek officer? | Player fights alongside him in Fall of Greece prologue missions BEFORE M1 |
| **Tanya** | Appears in M1 briefing. Stavros objects but the player doesn't know either of them | Player plays Tanya's prologue mission (First Blood) BEFORE M1. Now the M1 confrontation between Stavros and Tanya is a clash between two known characters |
| **Einstein** | Appears as a rescue target in M1 but the player has no emotional connection to him | IC prologue includes a brief Einstein moment — his voice on a radio transmission during the Fall of Greece, explaining what the Soviets are building. The player knows his voice before rescuing him |
| **Volkov** (Soviet) | Appears in a CS expansion mission with no setup | Player meets Volkov in the Soviet prologue mission (Awakening) before the CS missions |
| **Kosygin** (M9) | Soviet defector — the player is told to rescue someone they've never heard of | IC adds intel references to Kosygin in earlier missions (intercepted communications, spy reports). By M9, the player knows who he is and why he matters |

**Character voice and personality profiles:** Each named character has an MBTI-based personality profile that governs their dialogue style, decision-making patterns, and interpersonal dynamics. Einstein (INTP) speaks in conditional precision and retreats into analysis under stress; Tanya (ESTP) is action-first with impatience for briefings; Stavros (ENFJ) rallies through moral conviction; Von Esling (ISTJ) delivers by-the-book procedure; Stalin (ENTJ) commands through strategic dominance; Nadia (INTJ) operates through long-game calculation; Volkov (ISFJ with suppressed warmth) follows duty with buried humanity; Kukov (ESTJ) enforces through blunt hierarchy. These profiles ensure consistent characterization across briefings, War Table dialogue, and LLM-generated content. See `research/character-mbti-bible.md` for full profiles, pair dynamics, and scene applications.

**Alternate-timeline lore reference:** All campaign content must respect IC's alternate timeline where Einstein erases Hitler in 1924. A detailed 22-year vacuum timeline (1924–1946) covering the immediate aftermath, Stalin's consolidation, the complacency period, what doesn't happen (no WWII, no Holocaust, no NATO, no UN, no Manhattan Project), and the breaking point that triggers the Soviet invasion is documented in `research/strategic-campaign-layer-study.md` § "The 22-Year Vacuum Period — Show Bible Timeline." This timeline is the canonical reference for briefing writers, mission designers, and LLM narrative generation.

### Rule 2: Progressive Difficulty and Mechanics Teaching

The original RA1 campaign has inconsistent difficulty — some early missions are harder than late ones, and new mechanics appear without introduction. IC's Enhanced Edition follows D065 (Tutorial) principles: each mission teaches one new thing, difficulty escalates smoothly, and the player is never overwhelmed.

**Difficulty curve for the Enhanced Edition prologue and Act 1:**

| Mission | Difficulty | New Mechanic Introduced | Why This Order |
|---|---|---|---|
| CS "Personal War" (prologue) | Very Easy | Basic unit control, movement, escort | First mission ever — the player learns to move units. Stavros must survive |
| CS "Evacuation" (prologue) | Easy | Time pressure, civilian escort, multiple objectives | Adds urgency and multi-tasking. Still small scale |
| IC "Tanya: First Blood" (prologue) | Easy-Medium | Hero unit, special abilities, skill points | Introduces hero mechanics with a powerful unit. Tanya can't die but it's okay to struggle |
| [M1] "In the Thick of It" | Medium | Base assault, combined arms (Tanya + support) | First "real" mission — but player already knows unit control, escort, and hero mechanics |
| [M2] "Five to One" | Medium | Time-limited defense, convoy mechanics | Adds time pressure at larger scale |
| [M3] "Dead End" | Medium | Bridge destruction, terrain objectives, stealth | Tanya-focused mission — player is now comfortable with hero gameplay |
| [M4] "Ten to One" | Medium-Hard | Full base defense, counterattack | First genuinely hard mission — but by now the player has 6+ missions of experience |

**Optional operations are exempt from this curve.** Counterstrike, Aftermath, SpecOps, and Theater Branch content can be any difficulty — the player chooses to take them. A warning label in the mission select indicates difficulty: "This is a challenging optional mission."

**Difficulty stars are UI shorthand, not the design itself.** First-party missions should back those labels with concrete pressure levers: enemy wave count, starting-force deficit, timer length, visible approach lanes, weather timing, or available support powers. When an optional operation changes difficulty later, the plan should name the exact lever it moves, not just say "harder" or "easier."

**New IC mechanics are introduced through gameplay, not text:**
- **Hero progression:** Introduced in prologue (Tanya: First Blood). The player earns skill points and sees the skill tree for the first time in a low-stakes mission
- **Spectrum outcomes:** First experienced in M3 (bridge destruction with partial success). Low consequence — the next mission is harder, not game-ending
- **Dynamic weather:** First appears in M8 (Chronosphere defense storm at minute 30). The storm is progressive — starts mild, gets worse — giving the player time to adapt before it's severe
- **Embedded task force:** First appears as an optional alternative in M10B ("Evidence: Enhanced"). Players who choose the classic M10B path never encounter it until M14: Enhanced (also optional)

### Rule 3: The World Moves Without You (Expiring Opportunities)

Between certain main missions, the Enhanced Edition presents **expiring opportunities** — multiple optional operations that are only available for a limited time. You use **Command Authority** to launch them, but you rarely have enough Command Authority to do all of them before the phase advances. When the phase advances, unselected operations expire with consequences.

Unlike XCOM's generic "you don't have enough time" model, IC's expiring opportunities are framed by Red Alert command realities:
1. **Intelligence Perishability:** Striking Target A puts the theater on high alert. Within hours, Target B will purge its databanks or heavily fortify. You only get one surprise attack.
2. **Unique Asset Commitment:** You need a singular, specialized asset to succeed (e.g., the only stealth transport in the sector) that can only be deployed to one location.
3. **Political Capital:** High Command only authorizes one unsanctioned diversion from the main front.

**How it works:** Expiring opportunities are not static multiple-choice menus. They are implemented as **standard optional mission nodes** that appear dynamically on the campaign map and have an `expires_in_phases` duration. 

When an expiring opportunity appears, a visual **beacon** is drawn over its location on the globe/Europe map so the player cannot miss it. Clicking the beacon opens the operation card with full details.

If the player launches a main mission, the campaign phase advances, and the opportunity's timer ticks down. If it reaches 0 without being launched, the opportunity locks and its `on_expire` consequences fire. Launching an optional operation *does not* advance the phase—it just costs 1 **Command Authority** from your War Table budget.

```yaml
# A rolling opportunity on the map. Starts active, expires after 2 phase advances.
missions:
  ic_behind_enemy_lines:
    type: mission
    role: SPECOPS
    prompt: "Iron Curtain Raid — Tanya"
    description: "Authorize Tanya's raid on a Soviet facility before the window closes."
    expires_in_phases: 2                  # ticks down each time a main mission launches
    on_expire:
      set_flag:
        iron_curtain_window_missed: true # site hardens; no raid, no rescue branch
      notify: "Tanya's insertion window has closed. The target is heavily fortified."
```

This represents a shift from D021's static `decision` nodes (which pause the map, forcing an immediate pick) to a **living map board**. The player manages a shifting board of expiring opportunities. The Lua event `Events.on("mission_start")` can still read these flags to apply consequences exactly as documented in `modding/campaigns.md`.

**Design rules for expiring opportunities:**

1. **No more than 2-4 live options.** The player can process a few active beacons; more creates map clutter and decision paralysis.
2. **The tension is Command Authority vs Phase Management.** Launching an operation costs Command Authority. You might have 3 expiring opportunities but only 1 Command Authority this phase, forcing a hard choice. Or you might have 2 Command Authority, letting you secure two before the phase advances.
3. **Beacons demand attention.** Opportunities must have visual beacons on the globe/Europe map. Clicking them reveals the prompt and consequences.
4. **Consequences are visible and referenced.** If Behind Enemy Lines reaches 0 and Tanya's window is missed, the M5 briefing says so.
5. **Main campaign is never blocked.** The expiring opportunity affects difficulty and available content, never whether the player can continue.
6. **2-3 per campaign maximum.** Too many and the mechanic loses weight. Each expiring opportunity window should feel momentous.
7. **Hero Deployment Cooldowns.** To prevent players from snowballing by exclusively using their best units (the "A-Team" problem), deploying named heroes (e.g., Tanya, Volkov) or unique persistent assets on an optional SpecOps mission incurs a recovery phase. They cannot be deployed on the immediate subsequent optional operation.

**Briefing rule for expiring SpecOps:** Before mission launch, the player should see four separate disclosures on the operation card or mission briefing: `On Success`, `On Failure`, `If Skipped`, and `Time Window`. The player is weighing operations, not guessing hidden consequences.

**Save/load policy:** Normal first-party campaigns allow free saving and reloading around expiring choices; the "world moves without you" rule is a campaign-fiction / consequence model, not an anti-save-scum guarantee. `Ironman` or other commit modes should autosave immediately after a branch-committing selection and treat that path as locked.

**Expiring opportunity placement in Allied Enhanced Edition:**

| Between | Options | Theme (Lore Constraint) |
|---|---|---|
| M4 → M5 | Behind Enemy Lines / Sarin Gas / Siberia / Gold Reserve | **OpSec:** "Striking one target puts the others on high alert." |
| M9 → M10 | Poland liberation / Siberian / Air campaign | **Unique Asset:** "We can only deploy our Vanguard reserve to one theater." |
| M12 → M14 | Final prep choice — one last operation before Moscow | **Political Capital:** "High Command only authorizes one diversion." |

### Rule 3A: The Campaign Map Must Be a Strategic Layer

The original Red Alert world screen has more potential than a simple mission picker. IC should treat it as one of the campaign's most important systems: the place where the player reads the war, not just where they click "next."

For the Enhanced Edition, the campaign map / intermission screen should function like the strategic layer in XCOM:

- it shows which fronts are active
- it shows which operations are currently available
- it shows which ones are urgent or expiring
- it shows what assets the player already owns
- it shows what enemy project is advancing if ignored

If an expiring opportunity, rescue branch, theater front, or prototype race matters, the player should see that **on the world screen before launching the next mission**.

**What the world screen should surface in the Enhanced Edition:**

1. **Strategic Resources** — Requisition (War Funds), Intel, and Command Authority (gates operation slots)
2. **The Doomsday Clock** — A single visual indicator of Soviet momentum, crossing threshold rings (Green/Yellow/Orange/Red) that alter briefing tones, income, and M14 difficulty
3. **Front status** — The map visually updates front lines based on choices. Greece under chemical threat, Siberian window open, Poland resistance active
4. **Operation cards & Beacons** — each available node is marked with a noticeable map beacon. Clicking it shows a role tag (`MAIN`, `SPECOPS`, `THEATER`, `RESOURCE`, `DEFECTOR`), a one-line reward preview, and a one-line consequence
5. **Urgency markers** — rescue pending, enemy initiative advancing if ignored, ticking countdowns on expiring opportunities
6. **Investment & Infrastructure** — The player's chosen Command Doctrine, active Research Lab projects (funded with Requisition), and Forward Operating Base (FOB) upgrades
7. **Asset ledger** — captured prototypes, partisan favor, spy network, air package, denied enemy tech, rescued hero status
8. **Downstream consumers** — the card should tell the player which later mission or act uses the asset

*Note: For the full specification of these strategic mechanics, see `research/campaign-strategic-depth-study.md`.*

**Concrete card examples for the Allied campaign:**

| Operation | Role | Reward Preview | If Ignored | Consumed By |
|---|---|---|---|---|
| `Behind Enemy Lines` | `SPECOPS` | `M6 access codes; Iron Curtain intel; reveals Spy Network` | `Raid window closes; M6 runs blind` | `M6`, `Spy Network` |
| `Crackdown` | `SPECOPS` | `No Sarin attacks in M8` | `Chemical attacks in Chronosphere defense` | `M8` |
| `Fresh Tracks` | `THEATER` | `Unlock Siberian front` | `Siberian window closes` | `Act 3`, `M14` |
| `Monster Tank Madness` | `THEATER` | `2 Super Tanks; Poland chain opens` | `No Super Tanks; Poland closed` | `M12`, `M14` |

This is what makes the campaign map worthy of attention. The player is not choosing between abstract branches. They are deciding which war problem to solve next.

### Rule 4: Optional Content Must Produce Concrete Campaign Assets

Optional content is not a generic "side mission" bucket. In the Enhanced Edition, every optional node must either:

- **solve a high-stakes problem through SpecOps / Commando play**, or
- **open a real Theater Branch** with a concrete downstream asset chain

That means optional content must answer, in plain language:

1. **What do we gain?** Intel, tech, denial, faction favor, rescue, route access, prototype roster, air/naval support
2. **What exact effect does that gain have?** Reveal patrol routes, unlock Super Tanks, deny chemical attacks, add resistance reinforcements, delay enemy waves, open Poland/Italy/Siberia
3. **Who consumes it later?** Name the next mission, act, or endgame branch
4. **What new operation does it reveal or unlock?** A successful SpecOps raid can surface a new commander assault, convoy intercept, or theater branch on the world screen

The worst design sin is optional content that exists in a vacuum. If a mission has no visible downstream effect, it should not be in the Enhanced Edition.

**SpecOps stakes rule:** Optional SpecOps may absolutely matter if skipped or failed. Tanya can be captured. Sarin can go live. A prototype can be lost to the enemy. This is where the campaign baseline can change.

**SpecOps reveal rule:** SpecOps should often change **what missions exist next**, not just how hard existing missions are. Intel theft, rescued defectors, planted charges, and stolen schedules can reveal fresh commander operations on the strategic map.

**Theater Branch rule:** Non-hero optional content only earns its place when it represents a whole secondary front or support package with clear assets. Siberia, Poland, Italy, Spain, France, and air campaigns justify themselves because they open regional allies, units, routes, and bombardment packages. A one-off "regular side mission" with no concrete asset does not.

### Rule 5: Three Mission Roles — Main Operations, SpecOps, and Theater Branches

The Enhanced Edition uses three mission roles:

| Role | Player Role | Gameplay | Mandatory? | What It Gives |
|---|---|---|---|---|
| **Main Operation** | Strategic commander | Full base building, economy, combined-arms warfare, decisive assaults | **Always mandatory** — these ARE the campaign | The full faction fantasy and decisive war outcomes |
| **SpecOps / Commando Operation** | Tanya / Volkov / spy teams / elite detachments | Stealth, infiltration, sabotage, rescue, tech theft, tech denial, faction favor | Optional, but high-leverage | Intel, tech, denial, rescue, faction support, commander alternatives with reduced rewards |
| **Theater Branch** | Regional commander / special front | Secondary-front campaigns, air campaigns, long-arc expansion chains | Optional and rare | Region-wide assets: resistance, prototypes, air/naval support, flank routes, endgame contributors |
| **Resource Operation** | Quartermaster / intel chief | Supply raids, intelligence sweeps, economic asset recovery | Optional | Requisition and Intel to fund the strategic layer (competes with tactical SpecOps for slots) |
| **Defector Operation** | Espionage extractor | High-risk extraction of Soviet personnel | Optional and rare | Unique assets: Soviet units in the Allied roster, immediate research jumps, or free intel sweeps |

**Commander-supported SpecOps is a subtype, not a fourth role.** Some SpecOps missions can let the commander maintain a **limited-capability forward base**: power, barracks, repairs, artillery, extraction support, or one support airfield. The hero-led objective remains the decisive part of the mission. This keeps the main campaign as the only place where the faction's full macro potential comes online.

**Why this separation matters:**

1. **Main Operations keep the full war fantasy in one place.** Full economy, full production tree, full battlefield crescendo belong in the backbone campaign missions.
2. **SpecOps becomes the precision tool.** This is where the campaign gains or denies intel, prototypes, scientists, resistance support, and rescue outcomes.
3. **Commander players are not trapped in commando gameplay.** Every hero-led mandatory-feeling mission needs a commander path or commander-supported variant.
4. **Theater Branches justify themselves with scale.** If a non-hero optional arc does not open a whole front or a named asset chain, it should be folded back into the main campaign or cut.

**Canonical rule: every optional or interior-heavy commando mission has a commander-compatible path.** That may be:

- a full commander alternative with reduced rewards
- a commander-supported SpecOps variant with a limited support base
- or, in D070 co-op add-ons, a commander/specops split where both players act simultaneously

The backbone can still contain a small number of **main operations with hero-led sub-objectives** (for example Allied M1 and M3). Those remain main operations, not separate optional SpecOps nodes.

**How it looks in practice:**

```
Main Operations (mandatory backbone):
  M1, M2, M4, M7, M8, M10A, M11, M12, M14

SpecOps / Commando Operations:
  Tanya: First Blood
  M3 Destroy Bridges
  Behind Enemy Lines
  M5 Rescue Tanya
  M6 Iron Curtain Infiltration
  Spy Network
  M9 Extract Kosygin
  M10B Evidence / Evidence: Enhanced
  M13 Focused Blast / Focused Blast: Enhanced

Theater Branches:
  Sarin Gas chain
  Siberian chain
  Italy chain
  Poland chain
  Operation Skyfall / Air Superiority / Operation Tempest
  Spain / France chains
```

**Commander-compatible commando examples:**

- **M6 (spy infiltration)** → commander alternative: full Tech Center assault. Story result preserved, but intel quality is worse because the site is wrecked.
- **M9 (spy+escort)** → commander alternative: armored extraction. Kosygin is recovered, but he yields less intel after a louder rescue.
- **M10B / M13** → commander-supported SpecOps variants. Tanya handles the decisive interior objective while the commander runs a limited forward support camp instead of a full economy.
- **Soviet M3 / M9** → commander alternatives: cordon-and-sweep and arrest operation. Same political or military result, cruder execution, worse downstream flags.

The arrows still flow one way: optional results feed into later main operations as difficulty modifiers, routes, units, tech, and briefing context. The main operations remain completable without them; they are simply better informed and better equipped if the player invests in optional content.

**Failure-forward default for the Enhanced Edition:** Missions should continue the campaign unless explicitly authored otherwise. If a mission can truly end the run, it must be marked `CRITICAL` on the world screen and again in the briefing. That should be rare and mainly reserved for final assaults or self-contained mini-campaign finales.

#### Commander Alternative Matrix (Exact Trade-Offs)

These are the minimum explicit downstream deltas for the first-pass Enhanced Edition plan. They turn "less intel" and "cruder result" into concrete, player-visible differences.

| Mission | Precise / operative result | Commander-compatible result | Exact downstream delta |
|---|---|---|---|
| **Allied M5 — Tanya's Tale** | Clean prison break. Tanya returns immediately and prison records are recovered | Armored prison assault. Tanya is rescued but wounded | If M5 is taken before **M6**, Tanya is unavailable for **M6**, and **M6** loses the safe-house route and gains **2 extra patrol teams** around the service entrance |
| **Allied M6 — Iron Curtain Infiltration** | Spy steals access codes and shipping manifests | Tech Center destroyed by frontal assault | Operative path: **M7** reveals **25% of the harbor**, pre-marks the east docking lane, and delays the first submarine wave by **120 seconds**. Commander path: no reveal or delay, but **1 shore battery starts destroyed** from the assault |
| **Allied M9 — Extract Kosygin** | Kosygin escapes coherent and gives full debrief | Kosygin is roughed up during an armored extraction | Operative path: **M10B** starts with the west service tunnel open and **2 patrol routes pre-marked**. Commander path: tunnel unavailable and **M10B** gains **1 extra alarm ring** |
| **Allied M10B — Evidence / Evidence: Siege** | Full facility blueprints recovered | Partial blueprints recovered from ruins | Operative path: **M12** starts with the west conduit sabotage route open and **1 Iron Curtain emitter offline for 180 seconds**. Siege path: no conduit route; all emitters start active |
| **Allied M13 — Focused Blast / Iron Curtain: Siege** | Precision demolition destroys the temporal cores | Artillery collapse leaves partial tech intact | Precision / hybrid path: **M14** has **no emergency Iron Curtain pulse**. Siege path: **M14** gets **1 emergency pulse at minute 12** |
| **Soviet M3 — Covert Cleanup** | Spy network silenced quietly | District locked down by cordon-and-sweep | Precise path: **M4** gains a **180-second timer buffer** and **2 AA nests start unmanned**. Commander path: no timer buffer; **2 extra AA nests** remain active |
| **Soviet M9 — Liability Elimination** | Target removed quietly | Public arrest triggers internal unrest | Precise path: no internal-disruption event in **M12**. Commander path: **M12** gets **1 rear-sabotage event at minute 10**, and **M14** gets **1 rear-depot uprising marker** unless `Stalin's Shadow` was completed |

### Rule 6: Hero Capture Creates Escalating Rescue Pressure

When a hero operative (Tanya, Volkov) is captured in a failed mission, the enemy doesn't just hold them — they **interrogate** them. The intended mechanic is **escalation**: the longer the hero remains captured, the more intel or technology the enemy extracts.

This is one of the few places where the first-party Enhanced Edition deliberately extends the base D021 campaign graph model. The rescue mission is a **bounded pending branch**: it can be taken immediately, taken later within a limited window, or ignored entirely. Each intervening mission increases the compromise level until the window closes.

The original M5 cutscene already implies this urgency: a Soviet interrogator presses Tanya for information. IC makes those stakes real and mechanical.

#### Tanya Capture Escalation (Allied Campaign)

Tanya knows Allied troop positions, the Chronosphere project, spy network identities, and battle plans. The Soviets want all of it.

| Rescue Outcome | What Soviets Extract | Main Campaign Consequence |
|---|---|---|
| **Rescued immediately** (M5 taken right away) | Nothing — she held out | No penalty. Tanya returns to roster at full strength. Briefing: *"Tanya didn't break. She never does."* |
| **Rescued after 1 intervening mission** | Partial troop positions, reconnaissance routes | Tanya returns wounded and unavailable for 1 mission. The next main mission gets enemy ambushes at likely approach routes. Briefing: *"Soviet forces seem to know our staging areas. Tanya may have been forced to reveal positions before we got her out."* |
| **Rescued after 2+ intervening missions** | Chronosphere project details, battle plans, spy contacts | **Severe compound penalty for Act 2+:** Enemy knows Chronosphere location (M8 defense starts under immediate attack, no setup time). Spy network is partially rolled up (operative M6 route is degraded or unavailable). Enemy AI gains strong intel advantages through the rest of the act. Briefing: *"We've intercepted Soviet communications referencing detailed knowledge of our Chronosphere project and spy network. They could only have gotten this from Tanya. We waited too long."* |
| **Never rescued** | Everything they can get before Tanya breaks or is transferred | Worst version of the severe penalty. Tanya is lost from the roster for the rest of the campaign unless a later special recovery beat is authored. Briefing: *"We failed Tanya. The Soviets are now acting on intelligence they could only have extracted from her."* |
| **Never rescued + never captured** (Behind Enemy Lines succeeded) | N/A — Tanya was never captured | No penalty, no rescue needed. Best outcome. |

**Rescue quality also matters:** If M5 is completed but with heavy casualties or a long mission time, Tanya returns wounded (hero status: `wounded`, unavailable for 1 mission). A fast, clean rescue returns her at full strength.

#### Volkov Capture Escalation (Soviet Campaign)

Volkov is a cybernetic super-soldier. He knows Soviet military secrets, but his real value to the Allies isn't intel — it's **technology**. If the Allies capture Volkov, they reverse-engineer his cybernetics.

| Rescue Outcome | What Allies Extract | Main Campaign Consequence |
|---|---|---|
| **Rescued immediately** (`Deus Ex Machina` taken right away) | Nothing — they couldn't crack his armor | No penalty. Volkov returns to roster. Briefing: *"Volkov's armor held. They couldn't access his systems."* |
| **Rescued after 1 intervening mission** | Armor composition data | Volkov returns damaged / downgraded for 1 mission. Allied units in future missions gain improved armor-piercing capability. Briefing: *"Allied intelligence reports suggest they've analyzed Volkov's armor plating."* |
| **Rescued after 2+ intervening missions** | Armor composition + subsystem schematics | **Major penalty for Act 3:** Allies field improved anti-armor weapons and limited cyborg prototypes in M12-M14. Volkov returns scarred and with reduced availability. Briefing: *"The Allies have learned too much from Volkov's systems. We'll face our own technology soon enough."* |
| **Never rescued** | Complete technology transfer | **Severe penalty for Act 3:** Allies have full cyborg infantry squads in M12-M14. Volkov permanently lost from roster. Briefing: *"The Allies have weaponized Volkov's technology against us. Our greatest soldier has become our greatest liability."* |
| **Never captured** (Volkov missions succeeded or not attempted) | N/A | No penalty, no rescue needed. |

#### Implementation

The first-party plan uses a bounded pending-rescue state with explicit escalation, rather than collapsing capture into a one-node yes/no:

```yaml
# CampaignState flags set when a hero is captured
hero_capture:
  tanya:
    captured: true
    pending_rescue: true
    rescue_mission_id: allied_05_rescue
    missions_since_capture: 0
    rescue_window_closes_after: 2         # after 2 intervening missions, severe/terminal state
    compromise_level: none                # none | partial | severe | terminal
  volkov:
    captured: false
```

```lua
-- Example controller logic run when the player commits to another
-- non-rescue mission while the rescue branch is still pending.
-- Campaigns can execute this from mission_start of the next mission
-- or from their intermission / mission-launch script.
local capture = Campaign.get_flag("hero_capture.tanya")
if capture and capture.pending_rescue then
  capture.missions_since_capture = capture.missions_since_capture + 1

  if capture.missions_since_capture == 1 then
    capture.compromise_level = "partial"
    Campaign.set_flag("spy_network_compromised", true)
  elseif capture.missions_since_capture >= 2 then
    capture.compromise_level = "severe"
    Campaign.set_flag("chronosphere_location_known", true)
    Campaign.set_flag("operative_m6_degraded", true)
  end

  if capture.missions_since_capture > capture.rescue_window_closes_after then
    capture.compromise_level = "terminal"
    capture.pending_rescue = false
    Campaign.set_flag("tanya_lost", true)
  end

  Campaign.set_flag("hero_capture.tanya", capture)
end
```

**Briefing integration:** The dynamic briefing system (§ Optional Operations — Concrete Assets, Not Abstract Bonuses) assembles conditional lines based on the current compromise level. Immediate rescue, delayed rescue, and abandoned rescue each get distinct lines in the next briefing.

**Cross-campaign echo:** The Soviet M7 briefing always includes a line about an Allied commando operating in the facility — regardless of Allied campaign state. *"Our interrogators have extracted valuable information from the captured Allied commando. Use it well."* This is always-present authored flavor text, not conditional on cross-campaign data (see § Cross-Campaign Continuity).

### Rule 7: Teach Every Mechanic at the Right Moment

Campaign mechanics (capture consequences, optional-operation assets, expiring opportunities, spectrum outcomes, hero progression, and commander-compatible commando paths) are powerful but only if the player understands them. The Enhanced Edition uses **progressive disclosure** — each mechanic is explained exactly when the player first encounters it, never before, never after. No front-loaded tutorials, no walls of text, no unexplained mechanics.

This follows D065 (Tutorial & New Player Experience) § progressive disclosure and hint systems.

**When each mechanic is explained:**

| Mechanic | First Encountered | How It's Explained | Example |
|---|---|---|---|
| **Hero progression** | End of prologue (Tanya: First Blood) — first skill point earned | Skill tree opens with a brief tooltip: *"Tanya has earned a skill point. Choose an ability to unlock. Skills persist across all missions."* | Player sees the skill tree for 10 seconds with one clear choice. No overwhelm |
| **Roster carryover** | M1 → M2 transition — surviving prologue units appear | Briefing note: *"Troops from your previous operation have been reassigned to this front."* A tooltip highlights the carried-over units on the map | Player sees familiar faces from the prologue. The connection is obvious |
| **Spectrum outcomes** | M3 (Destroy Bridges) — first mission with partial success | Debrief screen shows which bridges were destroyed and explicitly states the consequence: *"2 of 4 bridges destroyed. Enemy reinforcements will be partially reduced next mission."* | Not hidden — the debrief tells the player exactly what their performance means |
| **Optional-operation assets** | First optional mission completed — reward shown in next briefing | Briefing line highlighted: *"Thanks to your sabotage, Soviet air defenses are offline."* Tooltip: *"Optional operations grant concrete assets such as intel, tech, faction support, or denial effects."* | The cause-and-effect is spelled out the first time. After that, the player understands the pattern |
| **Expiring opportunities** | First expiring opportunity (between M4 and M5) | Map beacons appear. A tooltip explains: *"These operations expire if ignored. Launching an operation costs Command Authority. Unselected operations will eventually expire — with consequences."* Each option shows its reward AND the consequence of expiration | The stakes are visible on the map board. No hidden information |
| **Mission roles** | First time a SpecOps operation appears alongside a main operation | Campaign map shows role tags visually. Tooltip on the commando node: *"Optional SpecOps operation. This mission can gain intel, deny tech, or rescue a hero. Skipping it is valid — but the campaign state may change."* | The word "optional" is explicit. The downstream effect is explicit. No guessing |
| **Capture consequences** | First time a hero is captured (Behind Enemy Lines fails) | Immediate notification: *"Tanya has been captured. The longer she is held, the more intel the enemy may extract. Rescue her when possible."* A priority marker / urgency indicator appears on the campaign map or intermission mission list next to M5 | The escalation mechanic is explained at the moment it becomes relevant — not in a tutorial before it happens |
| **Dynamic weather** | First mission with weather (M8 storm or an optional branch) | Brief in-mission tooltip when weather changes: *"A storm is approaching. Visibility will decrease and vehicle movement will slow."* Gameplay effect is immediate and visible | Learn by experiencing. The tooltip explains what's happening; the gameplay proves it |
| **Commander alternatives** | First time a commando mission appears with a Commander alternative | Mission select shows both options side by side with labels: *"Operative approach: infiltrate with Tanya. Stealthier, better rewards."* / *"Commander approach: assault with your army. Direct, but fewer intelligence gains."* | Both options visible, both labeled with trade-offs. The player chooses their style |

**Explanation principles:**

1. **Explain at the moment of encounter, not before.** Don't explain expiring opportunities in the prologue. Explain them when the first expiring opportunity appears
2. **Show, don't tell.** The first spectrum outcome isn't explained in a tutorial — the debrief screen SHOWS the player what their partial success means for the next mission
3. **Make consequences visible before they happen.** Expiring opportunities show both the reward of choosing AND the consequence of expiration. No hidden penalties
4. **Explain once, then trust the player.** The first optional-operation asset gets a highlighted briefing line and tooltip. The second one just gets the briefing line. By the third, the player understands the pattern
5. **Never interrupt gameplay to explain.** All explanations happen in briefings, debriefs, intermission screens, or small in-game tooltips — never a pause-the-game tutorial popup during combat
6. **Use the briefing officer's voice.** Von Esling (Allied) and Nadia (Soviet) explain mechanics in character. *"Commander, these operations won't wait forever — and we don't have the authority to launch them all"* is both a narrative moment and a mechanics explanation. The UI reinforces with tooltips, but the character delivers the message

**D065 integration:** These explanations use the existing `feature_discovery` hint category from D065 § Feature Smart Tips. Each mechanic has a hint entry in `hints/campaign-mechanics.yaml` that triggers on first encounter and is dismissible. Players who've already learned the mechanic (from a previous playthrough or the tutorial) never see the hint again.

### SpecOps Mission Families

Optional commando content in the Enhanced Edition should fall into recognizable mission families with explicit downstream assets. These are the recurring patterns used by both the Allied and Soviet trees:

| Family | Mission Pattern | Typical Output | Exact Downstream Effect Examples |
|---|---|---|---|
| **Intel Raid** | Infiltrate a facility, steal plans, decode a network, photograph defenses | Intel asset | Access codes for M6, partial shroud reveal in M12, patrol-route preview, branch unlock |
| **Tech Theft** | Capture a prototype, scientist, or research node | Tech asset | Unlock Chrono Tank prototype, add Super Tanks to roster, enable a support power, open an Aftermath chain |
| **Tech Denial** | Sabotage a lab, ammo dump, radar net, power grid, or superweapon site | Denial asset | No MiGs next mission, no Sarin in M8, no Super Tanks in Act 3, delayed superweapon |
| **Faction Favor** | Rescue resistance leaders, secure defectors, protect local allies, broker safe houses | Favor asset | Partisan reinforcements in M14, naval contacts for M11, hidden tunnel route, scientist support |
| **Hero Rescue / Recovery** | Extract captured operatives, recover wounded teams, retrieve stolen equipment | Rescue state | Tanya or Volkov restored, compromise reduced, prototype partially recovered, roster losses softened |
| **Commander-Supported Infiltration** | Hero team handles decisive interior objective while commander runs a small support camp | Hybrid SpecOps asset | Limited artillery cover, extraction reinforcements, repair and resupply, restricted air support |

These families are what justify optional commando content. If a proposed mission does not cleanly fit one of them and cannot state its exact downstream effect, it should be reworked or cut.

### First-Party SpecOps Content Rule: Official Once, Generated Thereafter

The Enhanced Edition should not try to hand-author every optional commando branch forever, nor should it reuse the same official map repeatedly.

**Rule:**

- Use an official handcrafted mission **once**, where it is the best story fit
- Use IC-authored handcrafted missions for the handful of flagship new set pieces
- Use **generated SpecOps missions** for the rest of the optional commando network

That means:

- `Behind Enemy Lines`, `Spy Network`, `M5`, `M6`, `M9`, `Focused Blast`, `Stalin's Shadow`, and a few other anchor beats stay hand-authored
- follow-up raids, emergency rescues, prototype intercepts, mole hunts, resistance pickups, and alternative commando opportunities should usually be **generated unique operations** from the mission-family grammar in `campaigns.md`

This is the XCOM 2 lesson applied correctly: the strategic layer offers many operations, but only a few should be singular authored landmarks. The rest are theater-appropriate generated missions whose rewards and consequences are authored by campaign state.

**Generated-first candidates in the Enhanced plan:**

- extra Allied spy-network raids after the first network-establishment mission
- alternate Sarin-site strikes beyond the canonical CS mission placement
- resistance-contact pickups in Poland / Italy / Siberia
- Soviet mole hunts, scientist extraction, and rear-area counter-intel sweeps
- secondary prison-break or prototype-recovery opportunities created by branch state

The campaign graph still shows the operation card and exact reward/risk. What changes is that the map behind that card is generated from the current theater, mission family, and campaign seed instead of always pointing to one fixed handcrafted scenario.

### Core World Reactivity Matrix

The campaign earns its "the world reacts" claim only if the player can trace a completed operation to a concrete later mission state. These are the headline cause-and-effect chains the Enhanced Edition should surface on the world screen and in briefings.

#### Allied Reactivity

| Operation | Success State | If Skipped / Failed | Consumed By |
|---|---|---|---|
| **Behind Enemy Lines** | `iron_curtain_intel_full` — M6 east service entrance open, first alarm delayed **90 seconds** | If skipped: `iron_curtain_window_missed` — M6 runs blind and `Spy Network` never opens. If failed + captured: `tanya_captured` — M5 rescue branch opens and M6 runs blind | **M5**, **M6**, **Spy Network** |
| **Crackdown / Sarin 1** | `sarin_denied` — M8 has **no gas shelling** and no contaminated lane | `sarin_active` — M8 gains **2 gas barrages** and **1 contaminated approach lane** | **M8** |
| **Spy Network** | `spy_network_active` — M6 starts with **40% shroud reveal**; M10B starts with **2 patrol routes marked** | No pre-reveal or route markers | **M6**, **M10B** |
| **Operation Skyfall** | `skyfall_complete` — M8 begins with **2 AA sites destroyed** and **1 fewer Soviet air wave** | M8 keeps full AA coverage and standard air pressure | **M8** |
| **Air Superiority** | `air_package_ready` — M12 gets **1 bombing run** and M14 gets **2 bombing runs** | No strategic air support in the endgame | **M12**, **M14** |
| **Italy Chain** | `chrono_salvage` — **1 Chrono Tank prototype** joins M12; M14 has **no southern counterattack** | No prototype; southern counterattack remains | **M12**, **M14** |
| **Poland Chain** | `poland_liberated` — M12 unlocks the **west-flank entry**; M14 gains **3 partisan squads** and **2 Super Tanks** | No west flank, no partisan reinforcements, no Super Tanks | **M12**, **M14** |
| **Focused Blast / Iron Curtain: Siege choice** | Precision path removes Iron Curtain entirely from M14 | Siege path leaves **1 emergency Iron Curtain pulse at minute 12** | **M14** |

**Validation note for compounding endgame states:** The first-party Enhanced Edition should validate endgame consumers such as `M12`, `M13`, and `M14` by **asset bundle** rather than raw flag explosion. The validation pass should sample every legal combination of:

- air-support assets
- partisan / theater assets
- prototype-tech assets
- unrest / sabotage states
- rescue / compromise states

and confirm that the mission remains spawnable, its briefing remains coherent, and every promised reward/penalty still materializes.

#### Soviet Reactivity

| Operation | Success State | If Skipped / Failed | Consumed By |
|---|---|---|---|
| **Mole Hunt** | `counter_intel_secured` — M4 loses **2 Allied pre-placed pillboxes** and **1 scout trigger** | Allies retain their early-warning net; M4 starts with full pre-defenses | **M4** |
| **Road to Berlin** | `berlin_staging_secured` — M4 gains a **forward deployment zone**, **90 extra seconds** on the radar timer, and **2 veteran heavy tanks** if all 3 trucks arrive | Baseline M4 only; no forward deployment bonus | **M4** |
| **Legacy of Tesla** | `prototype_mig_ready` — M11 gains **1 prototype MiG sortie** and M14 gains **1 emergency air strike** | No prototype air support | **M11**, **M14** |
| **Spain Chain** | `spain_secured` — M11 loses the southern Allied cruiser group; M14 has **no rear-area uprising** if `Grunyev Revolution` also succeeded | Southern naval threat remains; unrest risk persists | **M11**, **M14** |
| **Stalin's Shadow** | `gradenko_neutralized` — cancels the M12 sabotage event and removes one late-war political disruption line | Political unrest stays live; M12/M14 use the harsher unrest versions | **M12**, **M14** |
| **Paradox Equation** | `chrono_understanding` — M13 marks **2 conduit rooms** and reduces temporal-instability hazards in the prototype lab | No conduit markers; lab runs at baseline hazard level | **M13** |
| **Nuclear Escalation** | `air_fuel_bombs_denied` — M14 loses the Allied air-fuel bomb strike entirely | M14 includes **1 air-fuel bomb strike window** | **M14** |

---

## Side-Campaign Thread: Einstein's Burden

A narrative thread that runs underneath the main war campaign, surfacing at key moments and paying off in Act 3. This is not a separate campaign — it's woven into the existing missions as optional discoverable content, briefing moments, and one pivotal reveal mission.

The thread answers the question every player eventually asks: *"Einstein used a time machine to remove Hitler and created this entire war. Does he feel guilty? Could he undo it? Why doesn't he?"*

> **Scope note:** The narrative thread itself is baseline Enhanced Edition content. The actual **time-machine gameplay unlocks** tied to `Einstein's Confession` / `Temporal Experiment` are **experimental D078 add-ons only** while [D078](/mnt/c/git/games/iron-curtain-design-docs/src/decisions/09d/D078-time-machine.md) remains Draft. If D078 never graduates, these missions remain lore reveals with no gameplay unlock.

### Thread Structure

**Prologue — The Voice**

Einstein is heard but not seen. During the Fall of Greece prologue missions, his voice comes through on a radio transmission to Stavros:

> *"Stavros, listen to me. The Soviets have developed weapons beyond anything we anticipated. I... I bear some responsibility for this. Get your people out. I will explain when we meet."*

The player doesn't know what "some responsibility" means yet. It's a hook — filed away, not explained.

**M1 — The Rescue**

The player rescues Einstein. In the debrief, Einstein thanks the Commander but is visibly troubled. A brief exchange (text in the briefing, not a cutscene — IC doesn't add FMV):

> *"Commander, thank you. I owe you my life. And... I owe the world an explanation. But not today. Today we have a war to win. A war that exists because of me."*

Von Esling cuts him off: *"Professor, that's enough. Commander, your next assignment."* The moment passes. The player notices Einstein said something strange but the campaign moves on.

**Acts 1-2 — Intel Fragments (Collectible Narrative)**

During SpecOps missions (Behind Enemy Lines, Spy Network, Sarin Gas facilities, Italy operations), the player can find **Einstein's Research Fragments** — optional collectibles hidden in mission maps. These are short text entries that gradually reveal the Trinity story. Finding them is never required — they're rewards for thorough exploration.

| Fragment | Found In | Content |
|---|---|---|
| **Fragment 1: Soviet Intelligence File** | Behind Enemy Lines (Tanya infiltrates Soviet facility) | A Soviet report: *"Subject: Allied Scientist — Priority capture target. His research predates the Chronosphere program by decades. Original experiments conducted in the American Southwest, 1946. Nature of experiments: CLASSIFIED — temporal displacement."* |
| **Fragment 2: Einstein's Personal Note** | Spy Network (recruiting agents in Soviet territory) | A handwritten note found in an Allied dead drop: *"I have seen what happens when one man decides to change history. I removed a monster and created a war. Millions dead because I played God. I will not make that mistake again."* |
| **Fragment 3: Captured Soviet Briefing** | Sarin Gas facility (CS mission) | Soviet briefing document: *"Priority directive from Moscow: locate and secure Einstein's pre-war research notes. The Chronosphere is useful but limited. His original work — the temporal displacement device — is the true prize."* |
| **Fragment 4: Einstein's Hidden Journal** | Italy operations (AM mission) — hidden in a captured Allied lab | Einstein's journal: *"I kept one copy of my Trinity notes. I told myself it was insurance — that if things became desperate enough, I would consider rebuilding the device. I pray that day never comes. But I see how this war is going, and I am losing faith in prayer."* |
| **Fragment 5: Trinity Test Report** | Poland operations (AM mission) — Soviet archive | Original 1946 test report: *"Test designation: TRINITY-TEMPORAL. Subject successfully displaced from 1946 to 1924. Target individual removed from timeline. Side effects: unknown. Researcher's note: 'It worked. God help us all. — A. Einstein'"* |

**Fragment discovery UX:** When the player finds a fragment, a brief notification appears: *"Intel discovered: Einstein's Research Fragment 3/5"*. The fragments are readable in the campaign journal/intermission screen. They're short (2-3 sentences each) — enough to build the picture without interrupting gameplay.

**Fragments are not dead collectibles.** They also feed the strategic layer in concrete steps:

| Threshold | Strategic Payoff |
|---|---|
| **1 fragment found** | The world screen gains a new enemy-project card: `Temporal Research`. `Einstein's Confession` stops reading like optional flavor and starts reading like an authored strategic reveal |
| **3 fragments found** | `Einstein's Confession` card shows its exact reward/risk text on the world screen, and the mission starts with **1 archive room pre-marked** instead of forcing a blind search |
| **5 fragments found** | Act 3 gains `temporal_weak_point_known`: if D078 is enabled, the first carryback begins with **1 known weak point** already authored into the replayed mission; if D078 is disabled, **Focused Blast: Enhanced** / **Temporal Experiment** still start with **1 sabotage target pre-marked** |

**Act 2 (after M8) — The Confession**

The `Einstein's Confession` mission (documented in the campaign graph) is always the narrative reveal. If the experimental D078 add-on is enabled, it also offers the rebuilt prototype gameplay unlock.

**If the player found fragments:** Einstein's briefing is richer. He references specific things the player already discovered:

> *"You've seen the Soviet files. You know what I did in Trinity. You've read my journal — you know I kept one copy of the notes. I cannot hide from you any longer. Here is what I built."*

The player feels rewarded for their exploration — they pieced the story together before the reveal.

**If the player found no fragments:** Einstein's confession is the first the player hears of Trinity. It still works — but it's a surprise rather than a confirmation. The fragments are enrichment, not prerequisites.

**Act 3 — The Weight**

If the experimental time-machine add-on is enabled and the player uses the capability, Einstein reacts. A brief briefing line after each use:

- First use: *"It worked. Commander... please use this power sparingly. I know what it costs."*
- Second use: *"Again? I... understand. The stakes are high. But each use destabilizes the temporal field. There may not be a third."*
- If the player uses all charges: *"It is done. The device is spent. Perhaps that is for the best."*

**Epilogue — Closure**

In the Allied epilogue mission ("Aftermath"), Einstein appears one final time. His dialogue depends on whether the player used the time machine:

- **Used it:** *"You used my device. I don't blame you — I used it too, once. The difference is that you used it to save lives. I used it to play God. Perhaps that makes you wiser than me."*
- **Never used it:** *"You won this war without my device. You have no idea how much that means to me. Perhaps humanity doesn't need to meddle with time to find its way."*
- **Never unlocked it (skipped the Confession mission):** *"Commander, there is something I never told you about my past. Perhaps someday. But today... today we celebrate. The war is over."*

### Soviet Campaign Mirror — The Red Ledger

The Soviet campaign should not only watch Einstein from afar. It needs its own narrative spine. The Soviet mirror thread is therefore political rather than guilt-driven: a dossier on **Stalin's paranoia, Gradenko's rivalry, Nadia's hidden agenda, and Kane's influence at the edge of the regime**.

**Acts 1-2 — Political Intelligence Fragments**

During Soviet SpecOps missions (`Mole Hunt`, `Let's Make a Steal`, `Liability Elimination`, `Stalin's Shadow`, selected Spain/France ops), the player can recover **Political Intelligence Fragments**: memos, interrogation notes, coded directives, and fragments of correspondence.

| Fragment | Found In | Content |
|---|---|---|
| **Fragment 1: Gradenko Memorandum** | Mole Hunt | Internal complaint that the Volkov program is draining resources from Gradenko's conventional front |
| **Fragment 2: Nadia's Intercept** | Let's Make a Steal | A private channel showing Nadia bypassing Stalin's normal chain of command |
| **Fragment 3: Security Directive 47** | Liability Elimination | Stalin orders parallel surveillance of his own senior officers, including Nadia |
| **Fragment 4: Temple Correspondence** | Stalin's Shadow | A coded exchange implying an outside ideological actor is cultivating Soviet unrest from the shadows |
| **Fragment 5: Succession Briefing** | Grunyev Revolution / Red Dawn lead-in | Proof that the invasion of England is also a test of who controls the Soviet future after Stalin |

**Strategic payoff:**

| Threshold | Strategic Payoff |
|---|---|
| **1 fragment found** | World screen gains `Political Instability` as a project card, making the unrest thread legible before `M9` |
| **3 fragments found** | `Stalin's Shadow` shows exact reward/risk text on the world screen and starts with **1 archive room pre-marked** |
| **5 fragments found** | Act 3 gains `kremlin_fracture_known`: one internal-disruption event in **M12** or **M14** is pre-telegraphed on the briefing card rather than sprung as a surprise |

**Act 2 — The Realization**

By `Liability Elimination` and `Stalin's Shadow`, the player should understand that the war is turning inward. The question is no longer just "Can the Soviets win?" but "Who is going to own the victory?" That gives the Soviet campaign a throughline comparable in weight to Einstein's burden on the Allied side.

**Act 3 — Red Dawn payoff**

If the player followed the Red Ledger thread, `Red Dawn` lands as the resolution of a long-brewing political thriller rather than a sudden twist. Kane's shadow, Nadia's intent, Gradenko's threat, and Stalin's fragility all arrive with authored buildup.

### Implementation

The thread uses existing and one new UI surface:
- **Fragments:** Campaign flags (`red_ledger_fragment_1: true` through `red_ledger_fragment_5: true`) set when the player enters a trigger zone in the mission map — standard Lua trigger, no new system
- **Conditional briefing lines:** Same `conditional_lines` system documented in `modding/campaigns.md` § Optional Operations — Concrete Assets, Not Abstract Bonuses — no new system
- **Fragment reader (new UI):** A new "Intel" tab in the campaign intermission screen displays collected fragments as short readable entries. The current intermission screen (`single-player.md`) exposes roster/heroes/stats — the Intel tab is an addition, not an existing viewer. Small scope: a list of 2-3 sentence text entries, readable between missions. Requires a new tab in the intermission UI but no new campaign state infrastructure beyond the flags already defined

---

## Narrative Framework — Making the Lore Coherent

### The Questions the Original Never Answered

The original RA1 and its expansions leave significant narrative gaps. Some are worth filling; others are better left mysterious. The Enhanced Edition's job: fill the gaps that hurt the story, leave open the mysteries that enrich it.

#### Design Principle: Cutscene Alignment

The original FMV cutscenes (briefing videos with live actors) are preserved exactly as they are — IC doesn't re-film them. Instead, the Enhanced Edition **aligns gameplay to make the cutscenes land better**. Every cutscene moment that felt abrupt or unexplained in the original gets a gameplay setup so the video makes sense in context.

**Key example — M1 briefing video:**

The original M1 video shows Stavros objecting to Tanya's presence: *"General Von Esling, she is a civilian!"* In the original game, this is the player's first encounter with BOTH characters — neither introduction lands because the player has no context for either person.

The Enhanced Edition plays two prologue missions before M1: one with Stavros (Fall of Greece) and one with Tanya (First Blood). When the M1 briefing video plays, the player recognizes both characters. Stavros's objection becomes a meaningful character moment: the player fought alongside him in Greece and understands his military pride. Tanya's cocky reply ("That's why I don't get killed") resonates because the player just saw her rescue POWs. The same unmodified video, but now it has emotional weight.

**This principle applies throughout:** IC missions are designed so that original cutscenes feel like they were always meant to be watched at this point in the story. The videos are untouchable; the gameplay around them is what changes.

#### Questions We Answer (fills narrative gaps)

**Q: How did Einstein get captured by the Soviets?**
The original intro shows Einstein using a time machine in Trinity, New Mexico (1946) to remove Hitler. He reappears in the RA timeline as a prisoner of the Soviets in Allied Mission 1. The game never explains how he went from Trinity to a Soviet firing squad.

IC Enhanced Edition answer: Einstein is the same person — he remembers the original timeline. After removing Hitler, he found himself in a world where the Soviets expanded unchecked. Wracked with guilt, he tried to help the European Allies covertly, developing the Chronosphere from his time machine research. The Soviets discovered his work, invaded Switzerland (where he was hiding), and captured him. Allied Mission 1 picks up at the moment of his scheduled execution. The IC prologue mission can show Einstein's final days in Switzerland — the player helps evacuate his research before the Soviets close in, but Einstein himself is captured to protect the escaping data.

**Q: How did Tanya get captured between Allied M4 and M5?**
Addressed in the campaign graph: IC adds "Behind Enemy Lines" — the mission where Tanya infiltrates a Soviet facility for Iron Curtain intel. If Tanya succeeds or escapes, no rescue branch opens. If she is captured, the M5 rescue branch becomes available and the later penalties depend on how long the player waits.

**Q: Why does Tanya appear at the Soviet nuclear facility in Soviet M7?**
In the original, Tanya just shows up at "Core of the Matter" with no explanation. IC links this to the Allied campaign: if the Allied "Behind Enemy Lines" mission was played, Tanya's presence is the Allied side of that same operation. From the Soviet perspective, an enemy commando has infiltrated the facility.

**Q: What are the expansion missions about? They seem random.**
The Counterstrike/Aftermath missions were designed as standalone challenges with no campaign integration. IC gives them narrative purpose:

| Expansion Missions | Original Context | IC Narrative Integration |
|---|---|---|
| **Sarin Gas trilogy** (CS Allied) | Standalone: destroy chemical facilities in Greece | Einstein's intel from M1 reveals a parallel Soviet weapons program beyond the Iron Curtain — chemical weapons. The Sarin facilities are part of the same research complex that produced the Iron Curtain technology. Destroying them prevents chemical attacks during the Chronosphere defense (M8) |
| **Fall of Greece** (CS Allied) | Standalone: Stavros escapes occupied Greece | Stavros's personal story — his homeland falls, he barely escapes. This is Act 1 content that establishes Stavros's character and motivation (he's driven by the loss of Greece). His rescue contacts become the spy network used later in M5-M6 |
| **Siberian Conflict** (CS Allied) | Standalone: establish Allied presence in Siberia | Strategic flanking operation — the Allies open a second front to divide Soviet forces. A long-arc side campaign that spans Acts 1-3, with compound rewards (Siberian front collapse weakens Soviet reinforcements in the final Moscow assault) |
| **Volkov & Chitzkoi** (CS Soviet) | Standalone: use a cybernetic super-soldier | The Soviet answer to Tanya. Where the Allies have a skilled human operative, the Soviets build a machine. Volkov is the Soviet hero character with his own progression arc. His missions parallel Tanya's — a mirror narrative |
| **Legacy of Tesla** (CS Soviet) | Standalone: capture an Allied prototype | The arms race escalates — both sides steal each other's technology. This is the Soviet side of the tech war that the Allied spy missions represent |
| **Paradox Equation** (CS Soviet) | Standalone: Chronosphere causes weird effects | The Chronosphere's teleportation mechanics interact with residual temporal energy from Einstein's original 1946 time machine research (separate technology, same scientific lineage). Tanks behaving as different units is a "temporal bleed" — the Chronosphere accidentally tapping into time-displacement side effects. Foreshadows that Einstein's deeper research exists |
| **Giant Ants** (CS secret) | Standalone: giant mutant ants attack | Radiation from an abandoned Soviet nuclear facility mutated local ant colonies. The facility was part of the same nuclear program that powers the Iron Curtain. The ants are an unintended consequence of the superweapon arms race — nature fights back |
| **Aftermath Italy** (AM Allied) | Standalone: Mediterranean operations | The war expands south. Italy becomes a second theater as the Allies push to cut Soviet supply lines through the Mediterranean. Chrono Tank prototypes recovered here become available for the endgame |
| **Aftermath Poland** (AM Allied) | Standalone: Polish operations | The push toward Moscow goes through Poland. Liberating Poland secures the Allied flank and provides resistance fighters for the final assault |
| **Aftermath France/Spain** (AM Soviet) | Standalone: Western European operations | The Soviets consolidate control of Western Europe. These missions show the occupation from the Soviet side — suppressing resistance, testing new weapons, dealing with internal dissent |
| **Deus Ex Machina** (AM Soviet) | Standalone: rescue Volkov | Volkov was captured by the Allies after a failed operation. This becomes a narrative continuation of the Volkov arc — if Volkov is captured, this is the rescue mission. If he was never captured, this mission doesn't appear |

**Q: What's Kane doing in the Soviet ending?**
The original reveals Kane (from Tiberian Dawn) advising Nadia after she poisons Stalin. IC leaves this mystery intact — it's too important to the larger C&C universe to alter. But IC adds subtle foreshadowing: in the Soviet "Stalin's Shadow" SpecOps mission, the player encounters references to a mysterious advisor who has been influencing Soviet politics from behind the scenes. Players who recognize Kane from Tiberian Dawn get the connection; others experience it as a Cold War thriller twist.

#### Questions We Leave Open (enriches the mystery)

**Q: Is this the same Einstein, or an alternate version?**
The game's intro shows Einstein physically walking into the past and shaking Hitler's hand before Hitler vanishes. This is the *same* Einstein — he remembers both timelines. But IC doesn't over-explain this. Einstein's dialogue in briefings can hint at his burden ("I have seen what happens when we meddle with time...") without spelling out the metaphysics. The player should feel the weight, not read a physics lecture.

**Q: Could the Chronosphere undo all of this?**
Einstein knows the Chronosphere *could* theoretically reverse his original intervention — send someone back to prevent him from removing Hitler. But he also knows the consequences of another temporal intervention could be even worse. This tension — "we have the power to fix everything, but using it might break everything worse" — is the thematic core of the time machine campaign mechanic (D078). Some players will wonder "why not just use the Chronosphere to fix it all?" The answer is that Einstein refuses, and the Enhanced Edition campaign shows why.

**Q: What happened in the "original" timeline that Einstein left?**
Without Hitler, WWII as we know it never happened. But what filled the vacuum? IC leaves this deliberately unanswered — it's the road not taken. However, the "Paradox Equation" mission (CS Soviet) shows temporal anomalies where the "original" timeline bleeds through — ghostly echoes of a world that might have been. This is atmospheric, not explanatory.

### How IC Features Connect to the Story

The Enhanced Edition doesn't just bolt new features onto old missions — each IC feature has a **narrative reason** for existing within the RA1 story.

| IC Feature | Narrative Justification | Story Role |
|---|---|---|
| **Hero progression (Tanya)** | Tanya is a legendary commando whose skills develop across the war. Her reputation grows with each mission — soldiers talk about her, Soviets fear her | The player's investment in Tanya's skill tree mirrors the in-universe legend building. Losing her is emotionally devastating because you built her up |
| **Hero progression (Volkov)** | The Soviets' answer to Tanya — a machine built to match a legend. But is he still human? His progression represents the Soviets investing in technology over humanity | Volkov's upgrades are the Soviet tech tree made personal. Each skill point is another piece of his humanity replaced by machinery |
| **Time machine (D078, experimental add-on)** | Einstein's original 1946 time travel research is rediscovered. If D078 graduates from Draft, the narrative reveal can also unlock a rebuilt prototype that transmits information back in time | The time machine is Einstein's worst fear: his original Trinity research weaponized. The campaign explores "what if someone rebuilt the device he used to remove Hitler?" |
| **Branching decisions** | War is chaos. Plans change. The commander makes choices with incomplete information, and those choices have consequences | Decision points aren't meta-game options — they're the fog of war. The briefing presents two plans; the commander picks one. Neither is "right" |
| **Spectrum outcomes** | Missions don't end in binary victory/defeat. Partial success, pyrrhic victory, tactical retreat — all are valid outcomes | This is how real military operations work. "We took the objective but lost half our force" is a common outcome, and the campaign should reflect it |
| **Dynamic weather (D022)** | The Eastern Front was defined by weather — Russian winters destroyed Napoleon and nearly destroyed the Wehrmacht. Weather should matter in a war set in Europe | The Moscow blizzard in M14, the Channel storm in Soviet M14, the Mediterranean heat — weather isn't decoration, it's strategy |
| **Asymmetric co-op (D070)** | Special operations require coordination between a strategic commander and a tactical field team. This is how modern militaries actually operate | Co-op missions are the most realistic depiction of combined-arms warfare in an RTS. One player thinks strategically; the other thinks tactically |
| **Spy infiltration** | Intelligence won the war as much as firepower. The Allied spy network (MI6, OSS) was critical to defeating the Axis — and in the RA timeline, the Soviets | Spy missions aren't filler — they're the invisible war that determines whether the visible war is winnable |
| **Air campaigns** | Air superiority was the decisive factor in WWII. The side that controlled the skies controlled the battlefield | Air campaign missions are the player experiencing what it means to *not* have boots on the ground — you support, you coordinate, but you can't hold territory from the air |
| **Campaign menu scenes** | The war is always present. Even when the player is in the menu, the campaign's mood follows them | The evolving menu background isn't a feature — it's the war haunting you. Act 1's hopeful naval scene gives way to Act 3's grim ground assault. The menu tells you where the war is |
| **Failure as consequence** | In war, failure doesn't mean "retry." It means "deal with what happened and keep going" | The bridge isn't destroyed? The enemy crosses it. Tanya is captured? Go rescue her — or don't, and fight without your best soldier. The campaign adapts to your failures |

### Expansion Missions — The Unified Story

With narrative integration, the 34 expansion missions stop being random standalone challenges and become chapters in a larger war story:

**Act 1 — The War Begins (M1-M4 + Fall of Greece + early Aftermath)**
The war erupts across Europe. Greece falls (Stavros's personal tragedy). The Allies scramble to respond. Einstein is rescued. Bridges are destroyed. Lines are drawn.

**Act 2 — The Arms Race (M5-M9 + Sarin Gas + Volkov + Italy)**
Both sides escalate: the Allies develop the Chronosphere; the Soviets build the Iron Curtain, develop chemical weapons (Sarin), and create Volkov. The Mediterranean becomes a second theater. Intelligence operations (spies, infiltration) become as important as firepower.

**Act 3 — Total War (M10-M14 + Siberian + Poland + final operations)**
Everything converges. The Siberian front collapses. Poland is liberated. The Allied fleet clears the river. Every optional-operation asset (or absence) shapes the final assault. The war ends in Moscow (Allied) or London (Soviet).

**Epilogue — Consequences**
The war is over, but what comes next? Allied: cleanup operations with moral decisions. Soviet: the internal power struggle (Stalin/Nadia/Kane). Both: the Ant crisis emerges from the war's radiation legacy.

---

## Allied Enhanced Edition Campaign

### Narrative Gaps Identified in the Original

| Gap | Between | Problem | IC Fix |
|-----|---------|---------|--------|
| **Tanya capture only happens off-screen** | M4 → M5 | M4 ends with a defensive victory. M5 briefing says Tanya was "captured during an intelligence operation." The capture is never shown — the player goes from defending a pass to suddenly rescuing Tanya from prison | IC adds the mission where Tanya can actually be captured: the choice is whether to authorize the raid; capture is a consequence of failure, not simply of choosing another fire to fight |
| **Supply convoy disconnected** | M2 → M3 | M2 clears Soviet forces for a convoy. M3 destroys bridges. No narrative link between them | IC links them: the supply convoy in M2 was carrying demolition equipment for the bridge mission in M3. A connected optional operation can secure extra explosives and reduce M3 difficulty |
| **Spy arc appears from nowhere** | M5 → M6 | M5 uses a spy to rescue Tanya. M6 is a spy infiltration mission. The spy capability isn't introduced — it just appears | IC adds a spy-recruitment SpecOps mission between M4-M5 where the player establishes the network |
| **Naval missions disconnected** | M7 | Submarine pen destruction feels disconnected from the Iron Curtain investigation arc | IC links it: intel from M6 reveals the Iron Curtain components are being shipped by submarine. Destroying the sub pens cuts the supply line |
| **Abrupt format change** | M10A → M10B | Jump from outdoor base-building to interior commando mission with no transition | IC adds a transition briefing and an optional prep mission (reconnoiter the facility exterior before the interior raid) |
| **Naval gap** | M11 | Naval supremacy mission appears without setup for why naval control matters now | IC links it: Kosygin's intel (M9) reveals the final Soviet defenses require a naval approach — the river must be cleared for the ground assault |
| **Final push too linear** | M12 → M13 → M14 | Three missions in a row with no branching, no decisions, just "destroy everything" | IC adds decision points and alternative approaches for the endgame |

### Full Campaign Graph

**Legend:** `[MAIN]` = mandatory backbone mission, `[SPECOPS]` = hero-led intel / tech / rescue operation, `[HYBRID]` = commander-supported SpecOps, `[THEATER]` = secondary-front or regional asset chain, `[NARRATIVE]` = lore or reveal mission

```
PROLOGUE — STAVROS'S WAR (IC Original + Counterstrike)
│  Character intro: STAVROS (before any cutscene appearance)
│  Character intro: TANYA (before M1 cutscene)
│  Character intro: EINSTEIN (voice on radio during Fall of Greece)
│
├─ [CS] "Personal War" (Fall of Greece 1) ★ VERY EASY
│  │  Stavros's intro. Parachutes into occupied Athens to rescue family.
│  │  Player commands small resistance force. Teaches: basic movement,
│  │  unit selection, named character escort.
│  │  Einstein heard on radio: "Stavros, the Soviets have a weapon...
│  │  I've seen what they're capable of. Get your people out."
│  │  Menu scene: Mediterranean coast at dawn
│  │
│  └─ [CS] "Evacuation" (Fall of Greece 2) ★ EASY
│     Stavros evacuates Greek civilians before Soviets close the ports.
│     Teaches: time pressure, multi-objective, civilian escort.
│     Reward: Greek resistance contacts (spy network foundation)
│
├─ [SPECOPS] [IC] "Tanya: First Blood" ★ EASY-MEDIUM
│  │  Tanya rescues Allied POWs from a Soviet outpost.
│  │  Teaches: hero abilities, skill points, C4 charges.
│  │  First skill tree selection at mission end.
│  │  Menu scene: naval convoy at dawn
│  │
│  CUTSCENE ALIGNMENT: M1 briefing video plays here.
│  Stavros (seated) → player recognizes him from Fall of Greece.
│  Tanya (walks in) → player recognizes her from First Blood.
│  "She is a civilian!" — now a clash between two known characters.
│
ACT 1: LIBERATION OF EUROPE ─────────────────────────────────────────
│
├─ [MAIN] [M1] "In the Thick of It" ★ MEDIUM — Rescue Einstein.
│  │  Teaches: combined arms (Tanya + support units), base assault.
│  │  Einstein becomes a character the player heard in the prologue.
│  │
│  └─ [SPECOPS] [IC] "Supply Line Security" ★ MEDIUM — OPTIONAL
│     Tanya escorts a Chrono-tech convoy through Soviet ambush country.
│     Asset: Chrono reinforcement package.
│     Exact effect: one extra Chrono support platoon spawns in M4.
│
├─ [MAIN] [M2] "Five to One" ★ MEDIUM — Clear road for supply convoy.
│  │  IC link: convoy carries demolition equipment for M3.
│  │  Teaches: time-limited clearing, area control.
│  │  Spectrum: convoy intact → full explosives for M3.
│  │  Convoy damaged → M3 is harder (fewer charges).
│  │
│  └─ [THEATER] [CS] "Fresh Tracks" (Siberian 1) ★ MEDIUM — OPTIONAL
│     Opens the Siberian flanking front.
│     Asset: Siberian theater unlocked for Act 3.
│     Exact effect: enables Siberian chain and its final reinforcement-denial payoff.
│
├─ [MAIN / SPECOPS-FOCUSED] [M3] "Dead End" ★ MEDIUM — Destroy bridges. Tanya must survive.
│  │  Teaches: stealth, terrain objectives, hero preservation.
│  │  Main-operation framing: the commander secures bridgeheads and extraction
│  │  while Tanya handles the demolition objective.
│  │  Spectrum: all destroyed → M4 easy / some → M4 harder /
│  │  none → M4 very hard. First real spectrum outcome.
│
├─ [MAIN] [M4] "Ten to One" ★ MEDIUM-HARD — Defend the pass.
│  │  First genuinely hard mission — but player has 6+ missions'
│  │  experience by now. Difficulty scales with M3 bridge results.
│  │  If Greek resistance contacted: partial shroud reveal.
│  │
│  ═══ EXPIRING OPPORTUNITIES (ACT 1 TO ACT 2) ══════════════════
│  │  "Multiple fires burning — which one do you fight?"
│  │  Command Authority is limited. Operations expire if ignored.
│  │
│  │  OPTION A: [SPECOPS] [IC] "Behind Enemy Lines" ★ HARD
│  │  │  Tanya infiltrates Soviet facility for Iron Curtain intel.
│  │  │  Type: spy_infiltration. Teaches: detection/alert system.
│  │  │  Asset: Iron Curtain intel package.
│  │  │  Exact effects: access quality for M6, rescue-state branching, future briefing intel.
│  │  │  Spectrum outcomes:
│  │  │  ├─ Success + escape → No rescue branch opens. Full intel for M6.
│  │  │  ├─ Success + captured → M5 rescue branch opens. Partial intel for M6.
│  │  │  ├─ Failed + escaped → No intel. M6 blind. Tanya available.
│  │  │  └─ Failed + captured → M5 rescue branch opens + M6 blind. Worst case.
│  │  │
│  │  IF NOT CHOSEN → The Soviets harden and partially relocate the site.
│  │  │  No intel for M6. `Spy Network` does not appear in Act 1.
│  │  │  Tanya stays safe, but the raid window is gone.
│  │  │  Briefing: "The target site tightened security before we could act."
│  │
│  │  OPTION B: [SPECOPS] [CS] "Crackdown" (Sarin Gas 1) ★ HARD
│  │  │  Neutralize Sarin gas facilities in Greece.
│  │  │  Asset: chemical-weapons denial.
│  │  │  IF CHOSEN → No chemical attacks in M8.
│  │  │  IF NOT CHOSEN → Sarin goes active. M8 includes gas attacks.
│  │  │  Briefing: "Chemical weapons reports from the eastern front.
│  │  │  We didn't act in time."
│  │
│  │  OPTION C: [THEATER] [CS] "Fresh Tracks" (Siberian 1) ★ MEDIUM
│  │     Open second front in Siberia.
│  │     IF CHOSEN → Siberian arc available in Act 3.
│  │     IF NOT CHOSEN → Siberian window closes permanently.
│  │     Briefing: "The Siberian opportunity has passed."
│  │     If already completed earlier, this slot shows
│  │     `[RESOLVED] Siberian front already open` and the
│  │     remaining live opportunities continue their timers.
│  │
│  │  OPTION D: [RESOURCE] [IC] "Gold Reserve" ★ MEDIUM
│  │     Liberate a Swiss bank vault holding Allied war funds.
│  │     IF CHOSEN → +4,000 Requisition to fund research/deployments.
│  │     IF NOT CHOSEN → The war chest remains tight during Act 2.
│  │
│  [SPECOPS] [IC] "Spy Network" ★ MEDIUM — OPTIONAL (if Tanya escaped)
│     Recruit a spy network and secure safe houses.
│     Asset: spy-network favor.
│     Exact effect: M6 gains access codes and later missions start with partial shroud reveal.
│
├─ [SPECOPS] [M5] "Tanya's Tale" ★ MEDIUM — Rescue Tanya.
│  │  AVAILABLE (not mandatory) if Tanya was captured.
│  │  May be taken immediately or delayed for a limited number of missions.
│  │  Each delay increases compromise level and later-mission penalties.
│  │  Ignoring it entirely leaves Tanya lost and the Soviet intel haul intact.
│  │  Commander alternative: send an armored assault to the prison
│  │  compound. Louder, Tanya is rescued but wounded (unavailable
│  │  for 1 mission). Operative approach: spy+commando, clean rescue.
│  │  If Tanya was never captured → M5 doesn't appear. Skip to M6.
│  │  Menu scene: if captured → dark war room / if free → confident HQ
│
ACT 2: THE IRON CURTAIN ─────────────────────────────────────────────
│
├─ [SPECOPS] [M6] "Iron Curtain Infiltration" ★ MEDIUM-HARD.
│  │  Spy infiltrates Soviet Tech Center for Iron Curtain intel.
│  │  Full intel → east service entrance open and first alarm delayed 90 seconds.
│  │  No intel → blind infiltration, no service entrance, 2 extra patrol teams.
│  │  Commander alternative: full assault on the Tech Center. You
│  │  destroy it and recover partial intel from the wreckage — less
│  │  intelligence than the spy route, but no commando gameplay.
│  │  Character intro: KOSYGIN mentioned in intercepted comms.
│  │
│  ├─ [SPECOPS] [CS] "Down Under" (Sarin Gas 2) ★ HARD — OPTIONAL
│  │  │  Continue Sarin campaign. Only if Sarin 1 was chosen/completed.
│  │  │  Asset: Greek-theater security.
│  │  │  Exact effect: bonus naval detachment in M7.
│  │  │
│  │  └─ [SPECOPS] [CS] "Controlled Burn" (Sarin Gas 3) ★ HARD — OPTIONAL
│  │     Capture Sarin facilities. Requires Sarin 2.
│  │     Asset: captured chemical expertise.
│  │     Exact effect: special denial / defense package in Act 3.
│  │
│  ├─ [THEATER] [AM] "Harbor Reclamation" (Italy 1) ★ MEDIUM — OPTIONAL
│  │  Secure Italian harbor.
│  │  Asset: Mediterranean staging base.
│  │  Exact effect: opens Italy chain and southern support route.
│  │
│  └─ [THEATER] [AM] "In the Nick of Time" + "Caught in the Act" +
│     "Production Disruption" (Italy 2-4) ★ MEDIUM-HARD — OPTIONAL
│     Italian theater chain.
│     Asset chain: Chrono Tank salvage + southern flank security.
│     Exact effects: one Chrono Tank prototype in Act 3 and no southern counterattack.
│
├─ [MAIN] [M7] "Sunken Treasure" ★ MEDIUM-HARD — Destroy sub pens.
│  │  IC link: M6 intel → Iron Curtain parts shipped by sub.
│  │  If Sarin missions done: bonus naval units.
│  │  If Italy done: Mediterranean staging base support.
│  │  Teaches: naval combat.
│  │
│  └─ [THEATER] [IC] "Operation Skyfall" ★ HARD — OPTIONAL air campaign
│     Coordinate air strikes on AA around Chronosphere perimeter.
│     Type: air_campaign. Teaches: sortie management, no base.
│     Asset: air-superiority package.
│     Exact effect: M8 starts with AA destroyed and fewer Soviet air attacks.
│
├─ [MAIN] [M8] "Protect the Chronosphere" ★ HARD — Defend 45 minutes.
│  │  If Sarin NOT neutralized → chemical attacks during assault.
│  │  If Skyfall completed → Soviet AA pre-destroyed.
│  │  Dynamic weather: storm at minute 30 (D022 showcase).
│  │
│  └─ [NARRATIVE] [IC] "Einstein's Confession" ★ MEDIUM — OPTIONAL
│     After the Chronosphere defense, Einstein reveals something
│     he's kept hidden: his original time machine research from
│     1946 — the device he used to remove Hitler. His notes still
│     exist. He buried them after seeing what his intervention
│     created. Now, with the war reaching a crisis, he's reconsidered.
│
│     Einstein's briefing:
│     "Commander... my original research — the experiment I conducted
│     in Trinity, New Mexico — I destroyed my notes after I saw what
│     I had done to the world. But I kept one copy. I told myself it
│     was insurance. Now I am not sure if offering it to you is
│     courage or cowardice."
│
│     Einstein has rebuilt a limited prototype from his original
│     research. It can only transmit information — tactical intel,
│     warnings, exploration data.
│
│     EXPERIMENTAL D078 ADD-ON ONLY:
│     If D078 graduates from Draft, this mission can also unlock
│     the TIME MACHINE capability (Layer 2):
│     - 1-2 uses available for Act 3 (limited, not infinite)
│     - Can rewind to a previous Act 3 mission-start checkpoint
│     - Knowledge (exploration, intel flags) carries back
│     - Army does NOT carry back (knowledge > power)
│     - Butterfly effects: enemy AI adapts ("something has changed")
│     - Concrete Allied examples:
│       - Replaying **M12** keeps the west conduit location known, so
│         the sabotage route is available immediately instead of after scouting
│       - Replaying **M13** keeps concealed SAM pockets and charge nodes marked,
│         making the precision route faster without adding free units
│       - Replaying **M14** keeps the timing of the first Iron Curtain pulse
│         and the north service breach already known to the player
│
│     If D078 stays Draft / cut, the mission remains a pure narrative
│     reveal with no gameplay unlock. The classic campaign path works
│     either way.
│
│     Menu scene changes: Einstein's lab with prototype device
│
├─ [SPECOPS] [M9] "Extract Kosygin" ★ MEDIUM-HARD.
│  │  Spy infiltrates Soviet compound, frees defector, escorts out.
│  │  Character payoff: heard Kosygin in M6 comms. Now rescue him.
│  │  Commander alternative: armored extraction. Tank column blasts
│  │  into the compound, grabs Kosygin. Louder, more casualties,
│  │  and M10B loses the west service-tunnel intel.
│  │  Asset: Kosygin intelligence package.
│  │  Exact effect: M10B gains the west service tunnel and 2 pre-marked patrol routes if Kosygin's debrief is intact.
│  │
│  ═══ EXPIRING OPPORTUNITIES (ACT 2 TO ACT 3) ══════════════════
│  │  "Multiple theaters need reinforcement. Command Authority is limited."
│  │
│  │  OPTION A: [THEATER] [AM] "Monster Tank Madness" (Poland 1) ★ HARD
│  │  │  Rescue Dr. Demitri + Super Tanks.
│  │  │  IF CHOSEN → 2 Super Tanks for M14. Unlocks Poland 2-5.
│  │  │  IF NOT CHOSEN → No Super Tanks. Poland arc closed.
│  │
│  │  OPTION B: [THEATER] [IC] "Air Superiority" ★ HARD
│  │  │  Establish air dominance over the eastern front.
│  │  │  Type: air_campaign.
│  │  │  IF CHOSEN → Air support available in M12 and M14.
│  │  │  IF NOT CHOSEN → No strategic air support in endgame.
│  │
│  │  OPTION C: [THEATER] [CS] "Trapped" (Siberian 2) ★ HARD
│  │     Continue Siberian arc (only if Fresh Tracks was done).
│  │     IF CHOSEN → Siberian front weakens. Unlocks Wasteland.
│  │     IF NOT CHOSEN → Siberian gains lost. No Act 3 benefit.
│
│  [THEATER] [AM] Poland 2-5 ★ HARD — OPTIONAL (if Poland 1 was chosen)
│  │  "Negotiations" / "Time Flies" / "Absolute M.A.D.ness" / "PAWN"
│  │  Asset chain: Poland liberated + partisan favor.
│  │  Exact effects: flanking entry in M12 and resistance reinforcements in M14.
│
│  [THEATER] [CS] "Wasteland" (Siberian 3) ★ HARD — OPTIONAL (if Siberian 2 done)
│     Final Siberian operation.
│     Asset: Siberian front collapse.
│     Exact effect: Soviet M14 reinforcements halved.
│
ACT 3: ENDGAME ──────────────────────────────────────────────────────
│  Menu scene: ground assault — tanks, artillery, dark skies
│
├─ [MAIN] [M10A] "Suspicion" ★ HARD — Destroy Soviet nuclear silos.
│  │  Main-operation backbone. Full base building, army assault. Always available.
│  │
│  │  After M10A, choose approach for the underground facility:
│  │  ├─ [SPECOPS] [M10B] "Evidence" ★ HARD — Interior commando.
│  │  │  Tanya infiltrates underground facility. Better intel yield.
│  │  │
│  │  ├─ [HYBRID] [IC] "Evidence: Enhanced" ★ HARD
│  │  │  Commander-supported SpecOps: Tanya + squad inside a live battle
│  │  │  while the commander runs a limited forward fire-support camp.
│  │  │
│  │  └─ [COMMANDER] [IC] "Evidence: Siege" ★ HARD
│  │     Bomb the facility from above. Artillery + air strikes
│  │     collapse the underground complex. Cruder but no commando
│  │     gameplay. Reduced intel yield (facility partially destroyed).
│
├─ [MAIN] [M11] "Naval Supremacy" ★ HARD — Clear river for final push.
│  │  IC link: Kosygin's intel → this is the only approach.
│  │
│  └─ [IC] "Joint Operations" ★ HARD — OPTIONAL (Phase 6b add-on, D070)
│     Co-op variant: Commander (naval base) + SpecOps (shore batteries).
│     Not part of the Phase 4 baseline — requires D070 co-op infrastructure.
│
├─ [MAIN] [M12] "Takedown" ★ VERY HARD — Destroy Iron Curtain bases.
│  │  If Poland done → flanking approach (attack from two sides).
│  │  If Italy done → no southern naval threat.
│  │  If air superiority → bombing runs available.
│  │
│  ═══ EXPIRING OPPORTUNITIES (FINAL PREPARATIONS) ═══════════════
│  │  "The Moscow assault is imminent. Command Authority is limited."
│  │
│  │  OPTION A: [SPECOPS] [M13] "Focused Blast" ★ VERY HARD
│  │  │  Interior commando. Plant charges in underground facility.
│  │  │  IF CHOSEN → Iron Curtain facility destroyed from inside.
│  │
│  │  OPTION B: [HYBRID] [IC] "Focused Blast: Enhanced" ★ VERY HARD
│  │  │  Commander-supported SpecOps. Tanya's full skill tree affects the mission.
│  │  │  Limited support base provides artillery, repairs, and extraction cover.
│  │  │  Silent Step → easier stealth. Chain Detonation → fewer
│  │  │  charges needed. Hero progression payoff.
│  │  │  (Only available if Tanya is alive and level 3+)
│  │
│  │  OPTION C: [COMMANDER] [IC] "Iron Curtain: Siege" ★ VERY HARD
│  │     Full base assault + artillery bombardment of the facility.
│  │     No commando gameplay. Same narrative result (facility destroyed).
│  │     Trade-off: higher casualties, no precision destruction —
│  │     some Iron Curtain tech survives (enemy retains partial
│  │     Iron Curtain capability in M14).
│
├─ [MAIN] [M14] "No Remorse" ★ VERY HARD — Final assault on Moscow.
│  │  EVERYTHING ACCUMULATES HERE:
│  │  ├─ Siberian arc done → reduced reinforcements
│  │  ├─ Poland liberated → Polish resistance arrives
│  │  ├─ Super Tanks → available as heavy armor
│  │  ├─ Sarin expertise → chemical defense
│  │  ├─ Italy secured → no southern counterattack
│  │  ├─ Air superiority → bombing runs
│  │  ├─ Tanya max level → leads assault squad
│  │  ├─ Nothing done → MAXIMUM difficulty, no bonuses
│  │  Briefing dynamically references every choice.
│  │
│  └─ [IC] "Moscow: Enhanced" ★ VERY HARD — ALTERNATIVE
│     Dynamic weather (blizzard). Embedded task force (Kremlin
│     infiltration during siege). Co-op option (Phase 6b add-on, D070).
│
EPILOGUE ────────────────────────────────────────────────────────────
│
├─ [IC] "Aftermath" ★ MEDIUM — Post-victory moral decisions
│  Cleanup in Moscow. Choices affect ending.
│  Menu scene: sunrise over liberated city
│
└─ [ANT] "It Came From Red Alert!" ★ VARIES — Secret campaign
   Unlocked after Allied completion. 4 ant missions.
   Uses campaign roster from completion.
```

### Allied Campaign Summary

| Content Type | Count | Toggleable |
|---|---|---|
| Classic main missions | 14 | Always on |
| IC-original missions | ≈10-12 depending on enhanced-alternative toggles and D070/D078 add-ons | Per-mission |
| Counterstrike missions | 8 (Sarin Gas 1-3, Fall of Greece 1-2, Siberian 1-3) | Per-chain |
| Aftermath missions | 9 (Italy 1-4, Poland 1-5) | Per-chain |
| Ant campaign | 4 | Post-completion unlock |
| **Total missions available** | **~43** | — |
| **Minimum path (classic only)** | **14** | — |

---

## Soviet Enhanced Edition Campaign

### Narrative Gaps Identified in the Original

| Gap | Between | Problem | IC Fix |
|-----|---------|---------|--------|
| **Abrupt spy chase** | M2 → M3 | Guard duty (infantry bridges) → suddenly chasing a spy. No narrative bridge | IC adds context: the spy was spotted during M2's operations. Optional mission to track the spy's contacts before the chase |
| **Berlin jump** | M3 → M4 | Spy chase in unknown location → assault on Berlin. Huge geographic/narrative leap | IC adds an optional advance-to-Berlin logistics mission |
| **Generic base building** | M5 | "Distant Thunder" is a standalone base-building exercise with no story purpose | IC links it: this base becomes the staging ground for M6's convoy escort. The base you build in M5 is the base you defend in M6 |
| **Tanya appears from nowhere** | M7 | "Core of the Matter" — Tanya is sabotaging a nuclear facility, but there's no setup for her presence | IC adds context in the Soviet M7 briefing: Nadia explains that Allied commando activity was detected near the facility. This is always present — no cross-campaign data needed. Tanya's appearance is framed as a known Allied threat, not a surprise |
| **Internal politics jarring** | M8 → M9 | Jump from destroying the Chronosphere (war front) to killing a political rival (internal intrigue) | IC adds a transition: Kosygin's defection (Allied M9) is referenced here — the "liability" in M9 is someone who helped Kosygin escape |
| **Two escort missions back-to-back** | M9 → M10 | Both are "escort something across the map" — repetitive | IC offers an alternative to M10 (different mission type, same narrative purpose) |
| **Repetitive endgame** | M12-14 | Three "capture/destroy everything" missions in a row | IC adds variety: alternative approaches, co-op options, and decision points for the final push |

### Full Campaign Graph

**Legend:** `[MAIN]` = mandatory backbone mission, `[SPECOPS]` = hero-led intel / tech / rescue operation, `[HYBRID]` = commander-supported SpecOps, `[THEATER]` = secondary-front or regional asset chain, `[NARRATIVE]` = lore or reveal mission

```
PROLOGUE — THE PARTY'S WILL (IC Original + Aftermath)
│  Character intro: STALIN (voice in propaganda broadcast)
│  Character intro: NADIA (briefing officer, gives first orders)
│  Character intro: VOLKOV (Soviet hero, playable in prologue)
│  Character intro: GRADENKO (mentioned as political rival — foreshadowing)
│
├─ [SPECOPS] [IC] "Volkov: Awakening" ★ VERY EASY
│  │  Volkov + Chitzkoi activated for a field test. Destroy a small
│  │  Allied outpost. Teaches: hero unit control, special abilities.
│  │  Nadia briefs: "Comrade, the Party has invested greatly in you.
│  │  Do not disappoint." Stalin's voice on radio: propaganda.
│  │  Gradenko mentioned: "General Gradenko questions the Volkov
│  │  program's cost. Prove him wrong."
│  │  Menu scene: Soviet war room, red lighting, propaganda posters
│  │
│  └─ [THEATER] [AM] "Testing Grounds" (France 1) ★ EASY — OPTIONAL
│     Test new Soviet weapons. Introduces Shock Troopers.
│     Teaches: new unit types, combined arms.
│     Asset: Shock Trooper deployment rights.
│     Exact effect: Shock Troopers available from Act 1.
│
ACT 1: THE IRON FIST ───────────────────────────────────────────────
│
├─ [MAIN] [M1] "Lesson in Blood" ★ EASY — Village assault. Tutorial.
│  │  Classic, enhanced with Nadia briefing context.
│  │  Teaches: basic base assault, unit production.
│
├─ [MAIN] [M2] "Guard Duty" ★ EASY-MEDIUM — Infantry bridge assault.
│  │  IC: spy spotted during battle (foreshadows M3).
│  │  If player kills spy → M3 is easier.
│  │  Teaches: multi-unit coordination, bridge tactics.
│  │
│  └─ [THEATER] [AM] "Shock Therapy" (Spain 1) ★ MEDIUM — OPTIONAL
│     Punish a border town.
│     Asset: Shock Trooper veterancy package.
│     Exact effect: veteran Shock Trooper squads in later Spain / Act 3 missions.
│
├─ [SPECOPS] [M3] "Covert Cleanup" ★ MEDIUM. Chase a spy.
│  │  If spy killed in M2 → timer extended to 20 min.
│  │  Commander alternative: cordon and sweep. Deploy infantry
│  │  squads to lock down the district. Less elegant — spy may
│  │  escape with partial intel (worse for future missions).
│  │  Teaches: time pressure, pursuit, area sweep.
│  │
│  └─ [SPECOPS] [IC] "Mole Hunt" ★ MEDIUM — OPTIONAL
│     Hunt Allied agents inside Soviet command. Reversed spy mission.
│     Asset: counter-intelligence package.
│     Exact effect: future Allied briefings lose composition intel and pre-defenses are reduced.
│     Character development: Nadia assigns this personally —
│     she's watching everyone. Foreshadows her true nature.
│
├─ [THEATER] [IC] "Road to Berlin" ★ MEDIUM — OPTIONAL operational march.
│  │  Bridges the geographic leap from the spy-chase theater to Berlin.
│  │  This is not passive traversal. The mission loop is:
│  │  1) seize the fuel depot before Allied engineers torch it,
│  │  2) choose the north rail bridge or south autobahn crossing,
│  │  3) escort 3 supply trucks into the Berlin staging park.
│  │  Ambush pressure comes from hidden AT guns, one timed air raid,
│  │  and the route choice between the shorter artillery corridor and
│  │  the longer but safer southern bypass.
│  │  Reward is upside only:
│  │  - 3 trucks preserved → M4 gains a forward deployment zone,
│  │    90 extra seconds on the radar timer, and 2 veteran heavy tanks
│  │  - 1-2 trucks preserved → forward deployment zone only
│  │  - skipped / failed → baseline M4, no extra staging assets
│
├─ [MAIN] [M4] "Behind the Lines" ★ MEDIUM — Destroy Allied radar in Berlin.
│  │  If Mole Hunt done → Allies don't expect you (no pre-defenses).
│  │  If Road to Berlin done → forward deployment zone, +90 seconds,
│  │  and +2 veteran heavy tanks if the whole column arrived.
│  │  Teaches: deep strike behind enemy lines.
│  │
│  ├─ [SPECOPS] [AM] "Let's Make a Steal" (France 2) ★ MEDIUM — OPTIONAL
│  │  Steal Allied tech.
│  │  Asset: captured vehicle technology.
│  │  Exact effect: one Soviet vehicle upgrade package for Act 2.
│  │
│  └─ [SPECOPS] [AM] "Test Drive" (France 3) ★ MEDIUM — OPTIONAL
│     Test stolen vehicles.
│     Asset: captured-unit roster package.
│     Exact effect: stolen Allied vehicles join the roster.
│
├─ [MAIN] [M5] "Distant Thunder" ★ MEDIUM — Build and defend a base.
│  │  IC link: surviving units and unspent resources carry over to M6
│  │  via D021 roster carryover (not literal base layout — structures
│  │  are map-specific). Over-investing in static defenses here means
│  │  fewer mobile units for M6's convoy escort.
│  │  Teaches: base building, resource management, investment trade-offs.
│  │
│  └─ [SPECOPS] [AM] "Don't Drink the Water" (France 4) ★ MEDIUM-HARD — OPTIONAL
│     Poison water supply, capture Chronosphere.
│     Asset: Chronosphere weak-point intel.
│     Exact effect: faster Elba assault and sabotage route in M8.
│
├─ [MAIN] [M6] "Bridge over the River Grotzny" ★ MEDIUM-HARD — Convoy escort.
│  │  IC: surviving units and unspent resources from M5 carry over
│  │  via D021 roster carryover. M6 starts with a pre-built base
│  │  (map-authored) but your M5 troops are available as reinforcements.
│  │  Spectrum: full convoy → max supplies / partial → less /
│  │  lost → M7 starts with minimal forces.
│  │  Teaches: escort + defend with limited resources.
│  │
│  ═══ EXPIRING OPPORTUNITIES (ACT 1 TO ACT 2) ══════════════════
│  │  "The front is wide. Command Authority is limited."
│  │
│  │  OPTION A: [SPECOPS] [CS] "Soldier Volkov & Chitzkoi" ★ HARD
│  │  │  Volkov commando mission behind Allied lines.
│  │  │  Asset: Volkov veterancy package.
│  │  │  IF CHOSEN → Volkov gains veteran status for Act 2+.
│  │  │  IF NOT CHOSEN → Volkov stays in reserve (no veterancy).
│  │
│  │  OPTION B: [SPECOPS] [CS] "Legacy of Tesla" ★ HARD
│  │  │  Capture Allied nuclear MiG prototype.
│  │  │  Asset: prototype MiG tech.
│  │  │  IF CHOSEN → Prototype MiG available in M11 naval battle.
│  │  │  IF NOT CHOSEN → No air prototype. M11 is naval-only.
│  │
│  │  OPTION C: [THEATER] [AM] "Situation Critical" (Spain) ★ MEDIUM-HARD
│  │     Secure Mediterranean sea lanes.
│  │     IF CHOSEN → Naval advantage in M11. Unlocks Spain arc.
│  │     IF NOT CHOSEN → Allied naval threat from south persists.
│  │
│  │  OPTION D: [RESOURCE] [IC] "Grain Requisition" ★ MEDIUM
│  │     Redirect agricultural surplus in Ukraine to military production.
│  │     IF CHOSEN → +3,500 Requisition to fund research/deployments.
│  │     IF NOT CHOSEN → Military budget remains restricted during Act 2.
│
ACT 2: SUPERWEAPONS ────────────────────────────────────────────────
│
├─ [MAIN] [M7] "Core of the Matter" ★ HARD — Nuclear facility vs Tanya.
│  │  Tanya's presence is always explained in the Soviet briefing
│  │  (IC adds context regardless of whether Allied campaign was played —
│  │  cross-campaign references are flavor text in briefing lines only,
│  │  not gating state. No global/legacy persistence layer needed).
│  │  If Volkov is veteran → Volkov vs Tanya encounter (hero vs hero).
│  │  If Volkov not available → standard mission, Tanya is a boss unit.
│  │  Teaches: facility defense + counter-commando operations.
│  │
│  └─ [THEATER] [AM] "Brothers in Arms" (Spain 2) ★ HARD — OPTIONAL
│     Soviet traitors. Only if Spain arc opened in Act 1 expiring opportunities.
│     Asset: loyal tank-crew favor.
│     Exact effect: heavy armor veterancy bonus in Act 3.
│
├─ [MAIN] [M8] "Elba Island" ★ HARD — Destroy Allied Chronosphere.
│  │  If "Don't Drink the Water" done → know weak points.
│  │  If Volkov veteran → solo insertion option (sabotage before assault).
│  │  Teaches: combined naval + ground assault.
│  │
│  ├─ [SPECOPS] [CS] "Paradox Equation" ★ HARD — OPTIONAL
│  │  Chronosphere anomalies — tanks behave as other units.
│  │  Asset: Chrono-tech understanding.
│  │  Exact effect: faster capture path and safer temporal experiment in M13.
│  │
│  └─ [SPECOPS] [CS] "Mousetrap" ★ HARD — OPTIONAL
│     Hunt Stavros at a Chronosphere research center.
│     Asset: Allied-command intel.
│     Exact effect: improved command-structure knowledge in later briefings and AI reads.
│
├─ [SPECOPS] [M9] "Liability Elimination" ★ MEDIUM-HARD.
│  │  Assassination mission. The "liability" helped Kosygin escape.
│  │  Character shift: the war turns inward. Stalin's paranoia.
│  │  Nadia's briefing is colder — she's consolidating power.
│  │  Commander alternative: arrest operation. Send an armored
│  │  column to detain the target publicly. Same political result
│  │  but cruder — causes a rear-sabotage event in M12 unless
│  │  Stalin's Shadow neutralizes the unrest.
│  │
│  └─ [SPECOPS] [IC] "Stalin's Shadow" ★ HARD — OPTIONAL
│     Nadia's secret mission: evidence against Gradenko.
│     Foreshadows the Stalin/Nadia/Kane ending.
│     Asset: internal-purity leverage.
│     Exact effect: Gradenko neutralized and fewer political disruptions in Act 3.
│     Character reveal: Nadia is not who she seems.
│
├─ [MAIN] [M10] "Overseer" ★ MEDIUM-HARD — Escort supply trucks.
│  │
│  ├─ [CLASSIC] M10 as-is ★ MEDIUM-HARD
│  │
│  └─ [IC] "Overseer: Strike" ★ HARD — ALTERNATIVE
│     Armored assault instead of escort. Same narrative result.
│     Teaches: offensive operations as alternative to escort.
│
ACT 3: CONQUEST ────────────────────────────────────────────────────
│  Menu scene: naval fleet mobilizing, Channel crossing preparation
│
├─ [MAIN] [M11] "Sunk Costs" ★ HARD — Naval defense vs Allied cruisers.
│  │  If MiG prototype captured → air support available.
│  │  If Spain secured → no Allied southern reinforcements.
│  │
│  ├─ [SPECOPS] [AM] "Deus Ex Machina" (Spain 3) ★ HARD — OPTIONAL
│  │  Rescue Volkov (if he was captured).
│  │  Can be taken immediately or after delay, but Allied tech extraction
│  │  escalates each mission he remains in custody.
│  │  Reward quality depends on how late the rescue happens.
│  │
│  └─ [THEATER] [AM] "Grunyev Revolution" (Spain 4) ★ MEDIUM-HARD — OPTIONAL
│     Crush a revolution.
│     Asset: rear-area security.
│     Exact effect: no uprisings during the England invasion.
│
├─ [MAIN] [M12] "Capture the Tech Centers" ★ VERY HARD — Capture 3 centers.
│  │  Compound rewards from all optional operations affect difficulty.
│  │
│  ═══ EXPIRING OPPORTUNITIES (FINAL PREPARATIONS) ═══════════════
│  │  "The invasion of England approaches. Command Authority is limited."
│  │
│  │  OPTION A: [THEATER] [IC] "Operation Tempest" ★ VERY HARD
│  │  │  Air/naval pre-invasion bombardment.
│  │  │  Type: air_campaign.
│  │  │  IF CHOSEN → M14 starts with damaged coastal defenses.
│  │  │  IF NOT CHOSEN → Full Allied coastal defense in M14.
│  │
│  │  OPTION B: [SPECOPS] [CS] "Nuclear Escalation" ★ VERY HARD
│  │     Prevent Allied air-fuel bomb testing.
│  │     Asset: enemy superweapon denial.
│  │     IF CHOSEN → No Allied superweapon in M14.
│  │     IF NOT CHOSEN → Allied air-fuel bombs in M14.
│
├─ [MAIN] [M13] "Capture the Chronosphere" ★ VERY HARD
│  │  If Paradox Equation done → faster capture.
│  │  If Volkov available → commando approach option.
│  │
│  ├─ [HYBRID] [IC] "Chronosphere: Enhanced" ★ VERY HARD — ALTERNATIVE
│  │  Commander-supported SpecOps / co-op (Phase 6b add-on, D070):
│  │  commander sieges while SpecOps infiltrates.
│  │
│  └─ [NARRATIVE] [IC] "Temporal Experiment" ★ HARD — OPTIONAL
│     Soviet intelligence recovers fragments of Einstein's original
│     1946 time travel research — notes hidden in a captured Allied
│     research facility. Soviet scientists build a crude prototype
│     from these notes. Less refined than Einstein's version, more
│     powerful, and dangerously unstable.
│
│     Nadia's briefing: "Our scientists found Einstein's original
│     time travel research in a captured laboratory. His notes
│     describe something extraordinary. The Americans buried this
│     knowledge. We will use it."
│
│     EXPERIMENTAL D078 ADD-ON ONLY:
│     If D078 graduates from Draft, this mission can also unlock the
│     TIME MACHINE capability (Layer 2):
│     - 1-2 uses available for M14 (the invasion)
│     - Can rewind to M14's mission-start checkpoint with knowledge
│     - Soviet version is more aggressive with KNOWLEDGE carryover:
│       full enemy patrol routes, base layouts, weapon positions carried
│       back (the Soviets squeeze every drop of intel from the temporal
│       transmission, where Einstein is more cautious)
│     - Army does NOT carry back — D078 Layer 2 rule, same for both factions
│     - Chrono Vortex hazards are Layer 3 / Phase 5 content — NOT included
│       in this Phase 4 campaign mechanic
│     - Concrete Soviet examples:
│       - Replaying **M14** keeps the White Cliffs gun pits, mine lanes,
│         and first coastal-battery timing known from the start
│       - Replaying **M13** keeps the Chronosphere conduit layout and
│         west-lab capture path known, shortening the capture route
│       - Replaying **M14** after `Nuclear Escalation` was skipped still
│         preserves the known air-fuel bomb window, letting the player
│         pre-position AA without gaining extra forces
│     - If Volkov was the test subject: his briefing dialogue hints
│       at residual temporal effects ("Something is... different.
│       I remember things I should not know.") — narrative flavor only
│
│     If D078 stays Draft / cut, the mission remains a narrative
│     demonstration of Soviet interest in Einstein's research with
│     no gameplay unlock.
│
│     Showcases: D078 campaign time machine with faction-specific rules
│     If Paradox Equation was completed: the temporal experiment
│     is more stable (fewer vortices — prior Chrono understanding helps)
│
├─ [MAIN] [M14] "Soviet Supremacy" ★ VERY HARD — Invade England.
│  │  EVERYTHING ACCUMULATES:
│  │  ├─ Spain secured → no southern counterattack
│  │  ├─ Volkov available → leads armor spearhead
│  │  ├─ Pre-invasion bombardment → damaged coastal defenses
│  │  ├─ Nuclear Escalation done → no Allied superweapon
│  │  ├─ Chrono tech → counter Allied Chronoshifts
│  │  ├─ Grunyev done → no rear uprisings
│  │  ├─ Nothing done → MAXIMUM difficulty
│  │  Dynamic weather: Channel storm clears mid-invasion.
│  │  Briefing references every choice.
│  │
│  └─ [IC] "Supremacy: Enhanced" ★ VERY HARD — ALTERNATIVE
│     Dynamic weather + Volkov commando insertion on White Cliffs
│     + embedded task force + co-op option (Phase 6b add-on).
│
EPILOGUE ────────────────────────────────────────────────────────────
│
└─ [IC] "Red Dawn" ★ MEDIUM — Stalin's betrayal.
   Player witnesses the power struggle from inside — not just
   cutscenes. Nadia, Gradenko (if alive), Kane's shadow.
   Decisions affect ending variant. Kane reveal lands harder
   if "Stalin's Shadow" was completed (foreshadowing pays off).
   Menu scene: Kremlin at night, red star glowing
```

### Soviet Campaign Summary

| Content Type | Count | Toggleable |
|---|---|---|
| Classic main missions | 14 | Always on |
| IC-original missions | ≈8-9 depending on enhanced-alternative toggles and D078 add-ons | Per-mission |
| Counterstrike missions | 6 (Volkov & Chitzkoi, Legacy of Tesla, Paradox Equation, Mousetrap, Testing Grounds, Nuclear Escalation) | Per-chain |
| Aftermath missions | 9 (France 1-4, Spain 1-4, Grunyev Revolution) | Per-chain |
| **Total missions available** | **~36** | — |
| **Minimum path (classic only)** | **14** | — |

---

## Cross-Campaign Continuity (Flavor Text Only)

If the player plays both campaigns, certain thematic echoes emerge. These are **briefing flavor text only** — not gated by any cross-campaign state. Neither campaign reads data from the other. No global/legacy persistence layer is needed. Each campaign's `CampaignState` (D021) is fully independent.

| Allied Event | Soviet Briefing Echo |
|---|---|
| Tanya infiltrates Soviet facility (IC "Behind Enemy Lines") | M7 briefing mentions "an enemy commando was detected" — always present, not conditional |
| Allied spy network established | M3 briefing mentions "increased Allied intelligence activity" — always present |
| Kosygin extracted by Allies (M9) | Soviet M9 briefing references "a high-ranking defection" — always present |
| Stavros rescued in Greece (CS) | CS "Mousetrap" briefing mentions "the Greek officer" — always present |

The echoes are authored as standard briefing text that both campaigns include regardless of play order. A player who plays both campaigns recognizes the connections; a player who plays only one experiences them as normal briefing context. No data flows between campaigns — each stands alone.

---

## IC Feature Showcase Summary

| IC Feature | Allied Showcase | Soviet Showcase |
|---|---|---|
| **Hero progression** | Tanya skill tree across 14+ missions | Volkov progression across 14+ missions |
| **Embedded task force** | Evidence: Enhanced (M10B alt), Moscow Enhanced | Core of the Matter (Volkov vs Tanya), Supremacy Enhanced |
| **Air campaign** | Operation Skyfall | Operation Tempest |
| **Spy infiltration** | Behind Enemy Lines, Spy Network | Mole Hunt, Stalin's Shadow |
| **Dynamic weather** | Chronosphere defense storm, Moscow blizzard | Channel storm during England invasion |
| **Asymmetric co-op** | Joint Operations (M11, Phase 6b add-on), Moscow Enhanced (Phase 6b add-on) | Chronosphere Enhanced (Phase 6b add-on), Supremacy Enhanced (Phase 6b add-on) |
| **Branching decisions** | 4+ decision points | 3+ decision points |
| **Spectrum outcomes** | Bridge destruction, intel gathering | Convoy escort, spy elimination |
| **Optional-operation assets** | Compound bonuses affecting M14 | Compound bonuses affecting M14 |
| **Campaign menu scenes** | 4 acts with evolving backgrounds | 4 acts with evolving backgrounds |
| **Roster carryover** | Squad persistence, hero survival matters | Volkov + captured units persist |
| **Failure as consequence** | Tanya capture/rescue branch | Convoy loss affects Act 2 forces |
| **Time machine (D078, experimental add-on)** | "Einstein's Confession" — narrative reveal in the baseline plan; only becomes a gameplay unlock if D078 graduates from Draft. If enabled: cautious, knowledge-only carryover | "Temporal Experiment" — narrative reveal in the baseline plan; only becomes a gameplay unlock if D078 graduates from Draft. If enabled: same Layer 2 knowledge-only rules, but harsher Soviet-flavored intel extraction |
| **Capture escalation** | Tanya captured → rescue can happen now, later, or never; the longer she is held, the more Chronosphere / spy-network intel leaks | Volkov captured → each delay gives the Allies more cyborg-tech insight; late or failed rescue escalates Act 3 penalties |
