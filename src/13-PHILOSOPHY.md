# Development Philosophy

> How Iron Curtain makes decisions — grounded in the publicly-stated principles of the people who created Command & Conquer (**Westwood Studios / EA**) and the community that carried their work forward (**OpenRA**).

## Purpose of This Chapter

This chapter exists so that every design decision, code review, and feature proposal on Iron Curtain can be evaluated against a consistent set of principles — principles that aren't invented by us, but inherited from the people who built this genre.

**When to read this chapter:**
- You're evaluating a feature proposal and need to decide whether it belongs
- You're reviewing code or design and want criteria beyond "does it compile?"
- You're choosing between two valid approaches and need a tiebreaker
- You're adding a new system and want to check it against IC's design culture
- You're making a temporary compromise and need to know how to keep it reversible

**When NOT to read this chapter:**
- You need architecture specifics → [02-ARCHITECTURE.md](02-ARCHITECTURE.md)
- You need to check if something was already decided → [09-DECISIONS.md](09-DECISIONS.md)
- You need performance guidance → [10-PERFORMANCE.md](10-PERFORMANCE.md)
- You need the phase timeline → [08-ROADMAP.md](08-ROADMAP.md)

**Full evidence and quotes** are in `research/westwood-ea-development-philosophy.md`. This chapter distills the actionable guidelines. The research file has the receipts.

---

## The Core Question

Every feature, system, and design decision should pass one test before anything else:

> **"Does this make the toy soldiers come alive?"**
>
> — Joe Bostic, creator of Dune II and Command & Conquer

Bostic described the RTS genre as recreating the imaginary combat he had as a child playing with toy soldiers in a sandbox. Louis Castle added the "bedroom commander" fantasy — the interface isn't a game UI, it's a live military feed you're hacking into from your bedroom. This isn't metaphor — it's the literal design origin. Advanced features (LLM missions, WASM mods, relay servers, competitive infrastructure) exist to serve this fantasy. If a feature doesn't serve it, it needs strong justification.

---

## Design Principles

These are drawn from publicly-stated positions by Westwood's creators and the OpenRA team's documented decisions. Each principle maps to specific IC decisions and design docs. They are guidelines, not a rigid checklist — the original creators discovered their best ideas by iterating, not by following specifications.

### 1. Fun Beats Documentation

> "We were free to come up with crazy new ideas for units and added them in if they felt like fun."
>
> — Joe Bostic on Red Alert's origins

Red Alert started as an expansion pack. Ideas that felt fun kept getting added until it outgrew its scope. The filter was never "does this fit the spec?" — it was "is this fun?"

**Canonical Example: The Unit Cap.**
Competitors like Warcraft used unit caps for balance and performance. Westwood rejected them. Castle: *"You like the idea that people could build tons of units and go marching across the world and just mow everything down. That was lots of fun."* Fun beat the technical specification.

**Rule:** If something plays well but contradicts a design doc, update the doc. If something is in the doc but plays poorly, cut it. The docs serve the game, not the other way around.

**Where this applies:**
- Gameplay systems in [02-ARCHITECTURE.md](02-ARCHITECTURE.md) — system designs can evolve during implementation
- Balance presets in D019 ([09-DECISIONS.md](09-DECISIONS.md)) — multiple balance approaches coexist precisely because "fun" is subjective
- QoL toggles in D033 — experimental features can be toggled, not permanently committed

### 2. Fix Invariants Early, Iterate Everything Else

> "We knew from the start that the game had to play in real-time... but the idea of harvesting to gain credits to purchase more units was thought of in the middle of development."
>
> — Joe Bostic on Dune II

Westwood fixed the non-negotiables (real-time play) and discovered everything else through building. The RTS genre was iterated into existence, not designed on paper.

**Rule:** IC's 10 architectural invariants (AGENTS.md) are locked. Everything else — specific game systems, UI patterns, balance values — evolves through implementation. The phased roadmap ([08-ROADMAP.md](08-ROADMAP.md)) leaves room for iteration within each phase while protecting the invariants.

### 3. Separate Simulation from I/O

> "We didn't have to do much alteration of the original code except to replace the rendering and networking layers."
>
> — Joe Bostic on the C&C Remastered codebase, 25 years after the original

This is the single most validated engineering principle in C&C's history. Westwood's 1995 sim layer survived a complete platform change in 2020 because it was pure — no rendering, no networking, no I/O in the game logic. The Remastered Collection runs the original C++ sim as a headless DLL called from C#.

**Rule:** The sim is the part that survives decades. Keep it pure. `ic-sim` has zero imports from `ic-net` or `ic-render`. This is Invariant #1 and #2 — violations are bugs, not trade-offs.

**Where this applies:**
- Crate boundary enforcement in [02-ARCHITECTURE.md](02-ARCHITECTURE.md) § crate structure
- NetworkModel trait in [03-NETCODE.md](03-NETCODE.md) — sim never knows about the network
- Snapshot/restore architecture in [02-ARCHITECTURE.md](02-ARCHITECTURE.md) — pure sim enables saves, replays, rollback, desync debugging

### 4. Data-Driven Everything

The original C&C stored all game values in INI files. Designers iterated without recompiling. The community discovered this and modding was born. OpenRA inherited this as MiniYAML. The Remastered Collection preserved it.

**Rule:** Game values belong in YAML, not Rust code. If a modder would want to change it, it shouldn't require recompilation. This is the foundation of the tiered modding system (D003/D004/D005).

**Where this applies:**
- YAML rule system in [04-MODDING.md](04-MODDING.md) — 80% of mods achievable with YAML alone
- OpenRA vocabulary compatibility (D023) — `Armament` in OpenRA YAML routes to IC's combat component
- Runtime MiniYAML loading (D025) — OpenRA mods load without manual conversion

### 5. Encourage Experimentation

> "The most important thing I can stress about that process was that I was encouraged to experiment and tap into a wide variety of influences."
>
> — Frank Klepacki on composing the C&C soundtrack

Klepacki wasn't given a brief that said "write military rock." He had freedom to explore — thrash metal, electronic, ambient, everything. The result was one of the most distinctive game soundtracks ever made. Style emerged from experimentation, not from a spec.

> "I believe first and foremost I should write good music first that I'm happy with and figure out how to adapt it later."
>
> — Frank Klepacki

**Rule:** Build the best version first, then adapt for constraints. Don't pre-optimize into mediocrity. This aligns with the performance pyramid in [10-PERFORMANCE.md](10-PERFORMANCE.md): get the algorithm right first, then worry about cache layout and allocation patterns.

### 6. Scope to What You Have

> "Instead of having one excellent game mode, we ended up with two less-than-excellent game modes."
>
> — Mike Legg on *Pirates: The Legend of Black Kat*

Legg's candid assessment: splitting effort across too many features produces mediocrity in all of them. Westwood learned this the hard way.

> "The magic to creating those games was probably due to small teams with great passion."
>
> — Joe Bostic

**Rule:** Each roadmap phase delivers specific systems well, not everything at once. Phase 2 delivers simulation. Not simulation-plus-rendering-plus-networking-plus-modding. The phase exit criteria in [08-ROADMAP.md](08-ROADMAP.md) define "done" so that scope doesn't silently expand. Don't plan for 50 contributors when you have 5.

### 7. Make Temporary Compromises Explicit

> "Many of these changes were introduced in the early days of OpenRA to help balance the game and make it play well despite missing core gameplay features... Over time, these changes became entrenched, for better or worse, as part of OpenRA's identity."
>
> — Paul Chote, OpenRA lead maintainer, on design debt

OpenRA made early gameplay compromises (kill bounties, Allied Hinds, auto-targeting) to ship a playable game before core features existed. Those compromises hardened into permanent identity. When the team wanted to reconsider years later, the community was split.

**Rule:** Label experiments as experiments. Use D033's toggle system so that every QoL or gameplay variant can be individually enabled/disabled. Early-phase compromises must never become irrevocable identity. If a system is a placeholder, document it as one — in code comments, in the relevant design doc, and in [09-DECISIONS.md](09-DECISIONS.md).

### 8. Great Teams Make Great Games

> "Your team and the people you choose to be around are more important to your success than any awesome technical skills you can acquire. Develop those technical skills but stay humble."
>
> — Denzil Long, Westwood engineer

> "The success of Westwood was due to the passion, vision, creativity and leadership of Louis Castle and Brett Sperry — all backed up by an incredible team of game makers."
>
> — Mike Legg

Every Westwood developer interviewed — independently — described the same thing: quality came from team culture, not from process. Playtest sessions led to hallway conversations that led to the best ideas. Process followed from culture, not the reverse.

**Rule:** IC's "team" is its contributors and community. The public design docs, clear invariants, and documented decisions serve the same purpose as Westwood's hallway conversations — they make it possible for people to contribute effectively without requiring everyone to hold the same context. When invariants feel like overhead rather than values, something has gone wrong.

### 9. Avoid "Artificial Idiocy"

> "You just want to avoid artificial idiocy. If you spend more time just making sure it doesn't do something stupid, it'll actually look pretty smart."
>
> — Louis Castle, 2019

The goal of pathfinding and AI isn't mathematical perfection. It's believability. A unit that takes a slightly suboptimal route is fine. A unit that vibrates back and forth because it recalculated its path every tick and couldn't decide is "artificial idiocy."

**Rule:** When designing AI or pathfinding, do not aim for "optimal." Aim for "predictable." Rely on heuristics (see "Layered Pathfinding Heuristics" in Engineering Methods below) rather than expensive perfection.

### 10. Build With the Community, Not Just For Them

Iron Curtain exists because of a community — the players and modders who kept C&C alive for 30 years through OpenRA, competitive leagues (RAGL), third-party mods (Combined Arms, Romanov's Vengeance), and preservation projects. Every design decision should consider how it affects these people.

This means:
- **Check community pain points before designing.** OpenRA's issue tracker (135+ desync issues, recurring modding friction, performance complaints), forum discussions, and mod developer feedback are primary design inputs, not afterthoughts. If a recurring complaint exists, the design should address it — or explicitly document why it doesn't.
- **Don't break what works.** The community has invested years in maps, mods, and workflows. Compatibility decisions (D023, D025, D026, D027) aren't just technical — they're respect for people's work.
- **Governance follows community, not the other way around.** D037 is aspirational until a real community exists. Don't build election systems for a project with five contributors.
- **Earn trust through transparency.** Public design docs, documented decision rationale, and honest scope communication (no "RA2 coming soon" when nobody is building it) are how an open-source project earns contributors.

**Rule:** Before finalizing any design decision, ask: *"How does this affect the people who will actually use this?"* Check the community pain points documented in [01-VISION.md](01-VISION.md), the OpenRA gap analysis in [11-OPENRA-FEATURES.md](11-OPENRA-FEATURES.md), and the governance principles in D037. If a decision benefits the architecture but hurts the community experience, the community experience wins — unless an architectural invariant is at stake.

---

## Game Design Principles

The principles above guide how we *build*. The principles below guide what we *build* — the player-facing design philosophy that Westwood refined across a decade of RTS games. These are drawn from GDC talks (Louis Castle, 1997 & 1998), Ars Technica's "War Stories" interview (Castle, 2019), and post-mortem interviews. They complement the development principles — if "Fun Beats Documentation" says *how to decide*, these say *what to aim for*.

### 11. Immediate Feedback — The One-Second Rule

Louis Castle emphasized that players should receive feedback for every action within one second. Click a unit — it acknowledges with a voice line and visual cue. Issue an order — the unit visibly begins responding. The player should never wonder "did the game hear me?"

This isn't about latency targets — it's about *perceived responsiveness*. A click that produces silence is worse than a click that produces a "not yet" response.

**Rule:** Every player action must produce audible and visible feedback within one second. Unit selection → voice line. Order issued → animation change. Build started → sound cue. If a system doesn't have feedback, it needs feedback before it needs features.

**Where this applies:**
- Unit voice and animation responses in `ic-render` and `ic-audio` (Phase 3)
- Build queue feedback in `ic-ui` (Phase 3)
- Input handling in `ic-game` — cursor changes, click acknowledgment

### 12. Visual Clarity — The One-Second Screenshot

You should be able to look at a screenshot for one second and know: who is winning, what units are on screen, and where the resources are. This was a core Westwood design test. If the screen is confusing, it doesn't matter how deep the strategy is — the player has lost contact with their toy soldiers.

**Rule:** Unit silhouettes must be distinguishable at gameplay zoom. Faction colors must read clearly. Resource locations must be visually distinct from terrain. Health states should be glanceable. When designing sprites, effects, or UI, ask: "Can I read this in one second?"

**Where this applies:**
- Sprite design guidelines for modders in [04-MODDING.md](04-MODDING.md)
- Render quality tiers in [10-PERFORMANCE.md](10-PERFORMANCE.md) — even the lowest tier must preserve readability
- Color palette choices for faction differentiation

### 13. Reduce Cognitive Load — Smart Defaults

Westwood's context-sensitive cursor was one of their greatest contributions to the genre: the cursor changes based on what it's over (attack icon on enemies, move icon on terrain, harvest icon on resources), so the player communicates intent with a single click. The sidebar build menu was a deliberate choice to let players manage their base without moving the camera away from combat.

The principle: never make the player think about *how* to do something when they should be thinking about *what* to do.

**Rule:** Interface design should minimize the gap between player intent and game action. Default to the most likely action. Cursor, hotkeys, and UI layout should match what the player is already thinking. This extends to modding: mod installation should be one click, not a manual file dance.

**Where this applies:**
- Input system design via `InputSource` trait (Invariant #10)
- UI layout in `ic-ui` — sidebar vs bottom-bar is a theme choice (D032), but all layouts should follow "build without losing the battlefield"
- Mod SDK UX (D020) — `ic mod install` should be trivially simple

### 14. Asymmetric Faction Identity

Westwood believed that factions should never be mirrors of each other. GDI represents might and armor — slow, expensive, powerful. Nod represents stealth and speed — cheap, fragile, hit-and-run. The philosophy: balance doesn't mean equal stats. It means every "overpowered" tool has a specific, skill-based counter.

This creates the experience that playing Faction B feels like a *different game* than playing Faction A — different tempo, different priorities, different emotional arc. If you can swap faction skins and nothing changes, the faction design has failed.

**Rule:** When defining faction rules in YAML, design for identity contrast, not stat parity. Every faction strength should create a corresponding vulnerability. Balance is achieved through asymmetric counter-play, not symmetric stat lines. D019 (switchable balance presets) supports tuning the degree of asymmetry, but the principle holds across all presets.

**Where this applies:**
- Unit and weapon definitions in YAML rules ([04-MODDING.md](04-MODDING.md))
- Damage type matrices / versus tables ([11-OPENRA-FEATURES.md](11-OPENRA-FEATURES.md))
- Balance presets (D019) — even the "classic" preset preserves Westwood's asymmetric intent

### 15. The Core Loop — Extract, Build, Amass, Crush

The most successful C&C titles follow a four-step core loop:

1. **Extract** resources
2. **Build** base
3. **Amass** army
4. **Crush** enemy

Every game system should feed into this loop. The original Westwood team learned (and EA relearned) that features which distract from the core loop — hero units that overshadow armies, global powers that bypass base-building — weaken the game's identity. "Kitchen sink" feature creep that doesn't serve the loop produces unfocused games.

**Rule:** When evaluating a feature, ask: "Which step of the core loop does this serve?" If the answer is "none — it's a parallel system," the feature needs strong justification. This is the game-design-specific version of "Scope to What You Have" (Principle 6).

**Where this applies:**
- System design decisions in [02-ARCHITECTURE.md](02-ARCHITECTURE.md) — every sim system should map to a loop step
- Feature proposals — the first question after "does it make the toy soldiers come alive?" is "which loop step does it serve?"
- Mod review guidelines — total conversions can define their own loop, but the default RA1 module should stay faithful to this one

### 16. Game Feel — "The Juice"

Westwood (and later EA with the SAGE engine) understood that impact matters as much as mechanics. Buildings shouldn't just vanish — they should crumble. Debris should be physical. Explosions should feel weighty. Units should leave husks. During the Generals/C&C3 era, EA formalized this as "physics as fun" — the visceral, physical feedback that makes commanding an army feel *powerful*.

The checklist: Do explosions feel impactful? Does the screen communicate force? Do destroyed units leave evidence that a battle happened? Do weapons feel different from each other — not just in damage numbers, but in visual and audio weight?

**Rule:** "Juice" goes into the render and audio layers, not the sim. The sim tracks damage, death, and debris spawning deterministically. The renderer and audio system make it *feel good*. When a system works correctly but doesn't feel satisfying, the problem is almost always missing juice, not missing mechanics.

**Where this applies:**
- Rendering effects in `ic-render` — destruction animations, particle effects, screen shake (all render-side, never sim-side)
- Audio feedback in `ic-audio` — weapon-specific impact sounds, explosion scaling
- Modding: effects should be YAML-configurable (explosion type, debris count, screen shake intensity) so modders can tune game feel without code

### 17. Audio Drives Tempo

Frank Klepacki's philosophy extended beyond "write good music" to a specific insight about gameplay coupling: the music should match the tempo of the game. High-energy industrial metal and techno during combat keeps the player's actions-per-minute high. Ambient tension during build-up phases lets the player think. "Hell March" isn't just a good track — it's a gameplay accelerator.

This extends to unit responses. Each unit's voice should reflect its personality and role — the bravado of a Commando, the professionalism of a Tank, the nervousness of a Conscript. Audio is characterization, not decoration.

**Rule:** Audio design (Phase 3) should be tested against gameplay tempo, not in isolation. Does the music make the player want to act? Do unit voices reinforce the fantasy? The `ic-audio` system should support dynamic music states (combat/exploration/tension) that respond to game state, not just random playlist shuffling.

**Where this applies:**
- Dynamic music system in `ic-audio` (Phase 3)
- Unit voice design guidelines for modders
- Audio LOD — critical feedback sounds (unit acknowledgment, attack alerts) must never be culled, even under heavy audio load

### 18. The Damage Matrix — No Monocultures

The C&C series formalized damage types (armor-piercing, explosive, fire, etc.) against armor classes (none, light, heavy, wood, concrete) into explicit versus tables. This mathematical structure ensures that no single unit composition can dominate without a counter. Westwood established this with the original RA's warhead/armor system; EA expanded it during the Generals/C&C3 era with more granular categories.

The design principle isn't "add more damage types." It's: every viable strategy must have a viable counter-strategy. If playtesting reveals a monoculture (one unit type dominates), the versus table is the first place to look.

**Rule:** The damage pipeline (D028) should make the versus table moddable, inspectable, and central to balance work. The table is YAML data, not code. Balance presets (D019) may use different versus tables. The mod SDK should include tools to visualize the counter-play graph.

**Where this applies:**
- Damage pipeline and versus tables in `ic-sim` (D028, Phase 2 hard requirement)
- Balance preset definitions (D019)
- Modding documentation — versus table editing should be a first tutorial, not an advanced topic

---

## Engineering Methods

These are not principles — they're specific engineering practices validated by Westwood's code and OpenRA's 18 years of open-source development.

### Integer Math in the Simulation

Westwood used integer arithmetic exclusively for game logic. Not because floats were slow in 1995 — because deterministic multiplayer requires bitwise-identical results across all clients. The EA GPL source confirms this. The Remastered Collection preserved it. OpenRA continued it.

**This is settled engineering.** D009 / Invariant #1. Don't revisit it.

### The OutList / DoList Order Pattern

The original engine separates "what the player wants" (OutList) from "what the simulation executes" (DoList). Network code touches both. Simulation code only reads DoList. IC's `PlayerOrder → TickOrders → apply_tick()` pipeline is the same pattern. The crate boundary (`ic-sim` never imports `ic-net`) enforces at the compiler level what Westwood achieved through discipline. See [03-NETCODE.md](03-NETCODE.md).

### Composition Over Inheritance

OpenRA's trait system assembles units from composable behaviors in YAML. IC's Bevy ECS does the same with components. Both are direct descendants of Westwood's INI-driven data approach. The architecture is compatible at the conceptual level (D023 maps trait names to component names), even though the implementations are completely different. See [04-MODDING.md](04-MODDING.md) and [11-OPENRA-FEATURES.md](11-OPENRA-FEATURES.md).

### Design for Extraction

The Remastered team extracted Westwood's 1995 sim as a callable DLL. Design every IC system so it could be extracted, replaced, or wrapped. This is why `ic-sim` is a library, not an application — and why `ic-protocol` exists as the shared boundary between sim and network.

### Layered Pathfinding Heuristics

Louis Castle described specific heuristics for avoiding "Artificial Idiocy" in high-unit-count movement:
1. **Ignore Moving Friendlies:** Assume they will be gone by the time you get there.
2. **Wiggle Static Friendlies:** If blocked, try to push the blocker aside slightly.
3. **Repath:** Only calculate a new long-distance path if the first two fail.

This validates IC's tiered pathfinding approach (D013). Perfection is expensive; "not looking stupid" is the goal.

### Write Comments That Explain Why

Bostic read his 25-year-old comments and remembered the thought process. Write for your future self — and for the LLM agent that will read your code in 2028. Comments should explain *why*, not *what*. The code shows what; the comment shows intent.

---

## Warnings — What Went Wrong

These are cautionary tales from the same people whose principles we follow. They're as important as the successes.

### The "Every Game Must Be a Hit" Trap

Bostic on Westwood's decline: *"Westwood had eventually succumbed to the corporate 'every game must be a big hit' mentality and that affected the size of the projects as well as the internal culture. This shift from passion to profit took its toll."*

**IC Lesson:** IC is a passion project. If it ever starts feeling like obligation, revisit this warning. The 36-month roadmap is ambitious but structured so each phase produces a usable artifact — not just "progress toward a distant goal." Scope to what a small passionate team can build.

### The Recompilation Barrier

OpenRA's C# trait system is more modder-hostile than Westwood's original INI files. Total conversions require C# programming. This is a step backward from the 1995 approach.

**IC Lesson:** D003/D004/D005 (YAML → Lua → WASM) explicitly address this. 80% of mods should need zero compilation. The modding bar should be *lower* than the original game's, not higher. See [04-MODDING.md](04-MODDING.md).

### Knowledge Concentration Kills Projects

OpenRA, despite 339 contributors and 16.4k GitHub stars, has critical features blocked because they depend on 1–2 individuals. Tiberian Sun support has been "next" for years. Release frequency has declined.

**IC Lesson:** Design so knowledge isn't concentrated. IC's design docs, AGENTS.md, and decision rationale ([09-DECISIONS.md](09-DECISIONS.md)) exist so any contributor can understand *why* a system exists, not just *what* it does. When key people leave — as they always eventually do — the documentation and architectural clarity are what survive.

### Design Debt Becomes Identity

OpenRA's early balance compromises (made before core features existed) became permanent gameplay identity. When the team tried to reconsider, the community split into "Original Red Alert" vs. "Original OpenRA" factions.

**IC Lesson:** This is why D019 (switchable balance presets) and D033 (toggleable QoL) exist. Don't make one-off compromises that become permanent. If you must compromise, make it a toggle.

---

## OpenRA — What They Got Right, What They Struggled With

IC studies OpenRA not to copy it, but to learn from 18 years of open-source RTS development. We take their best ideas and avoid their pain points.

### Successes to Learn From

| What                        | Why It Matters to IC                                                            | IC Equivalent                                |
| --------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| Trait system moddability    | YAML-configurable behavior without recompilation (for most changes)             | Bevy ECS + YAML rules (D003, D023)           |
| Cross-platform from day one | Windows, macOS, Linux, *BSD — proved the community exists on all platforms      | Invariant #10 + WASM/mobile targets          |
| 18 years of sustained dev   | Volunteer project survival — proves the model works                             | Phased roadmap, public design docs           |
| Community-driven balance    | RAGL (15+ competitive seasons) directly influencing design                      | D019 switchable presets, future ranked play  |
| Third-party mod ecosystem   | Combined Arms, Romanov's Vengeance, OpenHV prove the modding architecture works | D020 Mod SDK, D030 workshop registry         |
| EA relationship             | From cautious distance to active collaboration, GPL source release              | D011 community layer, respectful coexistence |

### Pain Points to Avoid

| What                    | Why It Hurts                                                                  | How IC Avoids It                                   |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| C# barrier for modders  | Total conversions require C# — higher bar than original INI files             | YAML → Lua → WASM tiers (D003/D004/D005)           |
| TCP lockstep networking | Higher latency; 135+ desync issues in tracker; sync buffer only 7 frames deep | UDP relay lockstep, deeper desync diagnosis (D007) |
| MiniYAML                | Custom format, no standard tooling, no IDE support                            | Real YAML with `serde_yaml` (D003)                 |
| Single-threaded sim     | Performance ceiling for large battles                                         | Bevy ECS scheduling, efficiency pyramid first      |
| Early design debt       | Balance compromises became permanent identity, split the community            | Switchable presets (D019), toggles (D033)          |
| Manpower concentration  | Critical features blocked because 1–2 people hold the knowledge               | Public design docs, documented decision rationale  |

---

## How to Use This Chapter

### For Code Review

When reviewing a PR or design proposal, check it against these principles — **but don't use them as a rigid gate.** The original creators discovered their best ideas by breaking their own rules. The principles provide grounding when a decision feels uncertain. They should never prevent innovation.

Key questions to ask during review:
1. Does this serve the core fantasy, or is it infrastructure for infrastructure's sake?
2. Does this keep the sim pure, or does it leak I/O into game logic?
3. Could a modder change this value without recompiling? Should they be able to?
4. Is this scoped appropriately for the current phase?
5. If this is a compromise, is it explicitly labeled and reversible?
6. How does this affect the community — players, modders, server hosts, contributors? Does it address a known pain point or create a new one?

### For Feature Proposals

When proposing a new feature:
1. State which principle(s) it serves
2. Cross-reference the relevant design docs ([02-ARCHITECTURE.md](02-ARCHITECTURE.md), [08-ROADMAP.md](08-ROADMAP.md), etc.)
3. If it conflicts with a principle, acknowledge the trade-off — don't pretend the conflict doesn't exist
4. Check [09-DECISIONS.md](09-DECISIONS.md) — has this already been decided?
5. Consider community impact — does this address a known pain point? Does it create friction for existing workflows? Check [01-VISION.md](01-VISION.md) and [11-OPENRA-FEATURES.md](11-OPENRA-FEATURES.md) for documented community needs

### For LLM Agents

If you're an AI agent working on this project:
- Read AGENTS.md first (it points here)
- These principles inform design *review*, not design *generation* — don't refuse to implement something just because it doesn't fit a principle. Implement it, then flag the tension
- When two approaches seem equally valid, the principle that applies most directly is the tiebreaker
- When no principle applies, use engineering judgment and document the rationale in [09-DECISIONS.md](09-DECISIONS.md)

---

## Sources & Further Reading

All principles in this chapter are sourced from public interviews, documentation, and GPL-released source code. Full quotes, attribution, and links are in the research file:

**→ `research/westwood-ea-development-philosophy.md`** — Complete collection of quotes, interviews, source analysis, and detailed IC application notes for every principle in this chapter.

### Key People Referenced

**Westwood Studios / EA:** Joe Bostic (lead programmer & designer), Brett Sperry (co-founder), Louis Castle (co-founder), Frank Klepacki (composer & audio director), Mike Legg (programmer & designer), Denzil Long (software engineer), Jim Vessella (EA producer, C&C Remastered).

**OpenRA:** Paul Chote (lead maintainer 2013–2021), Chris Forbes (early core developer, architecture docs), PunkPun / Gustas Kažukauskas (current active maintainer).

### Interview Sources

- [Joe Bostic — Westwood Studios (2018)](https://www.arcadeattack.co.uk/joe-bostic/)
- [Joe Bostic — C&C Remastered (2020)](https://www.arcadeattack.co.uk/joe-bostic-cc-remastered/)
- [Frank Klepacki — Westwood Studios (2017)](https://www.arcadeattack.co.uk/frank-klepacki/)
- [Mike Legg — EA/Westwood Studios (2019)](https://www.arcadeattack.co.uk/mike-legg/)
- [Denzil Long — Command and Conquer (2018)](https://www.arcadeattack.co.uk/denzil-long/)
- [Louis Castle — Ars Technica: "War Stories" (2019)](https://www.youtube.com/watch?v=S-VAL7Epn3o)
- [Paul Chote — OpenRA Balance Philosophy (2018)](https://www.openra.net/news/devblog-20180610/)
- [Paul Chote — OpenRA vs Remastered (2020)](https://www.openra.net/news/devblog-20200629/)
